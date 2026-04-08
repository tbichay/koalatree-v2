import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateVideo, generateVideoKlingAvatar, generateSceneVideo, downloadVideo as downloadHedraVideo } from "@/lib/hedra";
import { klingAvatar, klingI2V, klingLipSync, downloadVideo as downloadFalVideo } from "@/lib/fal";
import { generateVeoVideo, downloadVeoVideo } from "@/lib/veo";
import { put, get, list } from "@vercel/blob";
import { CHARACTERS, type CharacterKey } from "@/lib/studio";
import { loadCharacterReferences } from "@/lib/references";
import { segmentMp3 } from "@/lib/audio-segment";

// Build a character-aware prompt that tells the AI model exactly what the character looks like
function buildCharacterPrompt(characterId: string, sceneDescription: string): string {
  const char = CHARACTERS[characterId as CharacterKey];
  if (!char) return sceneDescription;

  let prompt = `Character: ${char.description}`;
  if (char.accessories && characterId !== "nuki") {
    prompt += ` Wearing ${char.accessories}.`;
  }
  prompt += ` ${sceneDescription}`;
  return prompt;
}

export const maxDuration = 300;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

interface SceneInput {
  type: "dialog" | "landscape" | "transition" | "intro" | "outro";
  characterId?: string;
  sceneDescription: string;
  location?: string;
  mood?: string;
  camera?: string;
  audioStartMs: number;
  audioEndMs: number;
  quality?: "standard" | "premium";
}

async function loadBuffer(url: string): Promise<Buffer> {
  const result = await get(url, { access: "private" });
  if (!result?.stream) throw new Error("Could not load asset");
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// loadPortrait replaced by loadCharacterReferences from lib/references.ts

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { geschichteId, sceneIndex, scene, previousLastFrameUrl } = await request.json() as {
      geschichteId: string;
      sceneIndex: number;
      scene: SceneInput;
      previousLastFrameUrl?: string;
    };

    // Load story audio
    const geschichte = await prisma.geschichte.findUnique({
      where: { id: geschichteId },
      select: { audioUrl: true },
    });
    if (!geschichte?.audioUrl) throw new Error("Story has no audio");

    // Check if this scene has audio (intro/outro landscape scenes may have 0-0 timing = no story audio)
    const hasAudio = scene.audioStartMs !== scene.audioEndMs && scene.audioEndMs > 0;

    let audioSegment: Buffer = Buffer.alloc(0);
    if (hasAudio) {
      const fullAudio = await loadBuffer(geschichte.audioUrl);
      audioSegment = segmentMp3(fullAudio, scene.audioStartMs, scene.audioEndMs);

      const segDuration = (scene.audioEndMs - scene.audioStartMs) / 1000;
      // Safety check: if segment is suspiciously large (>80% of full audio), something went wrong
      if (audioSegment.byteLength > fullAudio.byteLength * 0.8) {
        console.error(`[Scene Clip] SEGMENT TOO LARGE! Segment=${audioSegment.byteLength} vs Full=${fullAudio.byteLength}. Forcing byte-offset fallback.`);
        const bytesPerMs = 16;
        const startByte = Math.max(0, Math.floor(scene.audioStartMs * bytesPerMs));
        const endByte = Math.min(fullAudio.byteLength, Math.ceil(scene.audioEndMs * bytesPerMs));
        audioSegment = Buffer.from(fullAudio.subarray(startByte, endByte));
      }

      console.log(`[Scene Clip] Scene ${sceneIndex}: ${scene.type}, ${segDuration.toFixed(1)}s audio (${scene.audioStartMs}-${scene.audioEndMs}ms), segment ${(audioSegment.byteLength / 1024).toFixed(0)}KB, fullAudio ${(fullAudio.byteLength / 1024).toFixed(0)}KB`);

      if (audioSegment.byteLength === 0) {
        console.error(`[Scene Clip] WARNING: Empty audio segment! audioStartMs=${scene.audioStartMs}, audioEndMs=${scene.audioEndMs}, fullAudio=${fullAudio.byteLength}`);
      }
    } else {
      console.log(`[Scene Clip] Scene ${sceneIndex}: ${scene.type}, NO story audio (intro/outro/landscape with ambient SFX)`);
    }

    let videoUrl: string;
    let sceneImage: Buffer | undefined; // Used for frame-chaining (stored as last frame)

    // Dialog, intro, or outro with a character → use Hedra lip-sync
    const isDialogLike = (scene.type === "dialog" || scene.type === "intro" || scene.type === "outro") && scene.characterId;

    if (isDialogLike && scene.characterId) {
      // Load character references
      const charRefs = await loadCharacterReferences(scene.characterId);
      const portrait = charRefs[0];

      // Build prompt
      const charPrompt = buildCharacterPrompt(scene.characterId, scene.sceneDescription);
      const bgFromScene = scene.mood ? `Atmosphere: ${scene.mood}.` : "";
      const locationHint = scene.location ? `Setting: ${scene.location}.` : "";
      const fullPrompt = `${charPrompt}. ${bgFromScene} ${locationHint} Keep the character exactly as shown in the reference image. Natural lip sync to speech. NO text, NO subtitles.`;

      const isPremium = scene.quality === "premium";
      const segDurationSec = Math.min(8, (scene.audioEndMs - scene.audioStartMs) / 1000);

      if (isPremium && process.env.GOOGLE_AI_API_KEY) {
        // ══════ PREMIUM: Veo 3.1 — best lip-sync, native audio ══════
        console.log(`[Scene Clip] PREMIUM: Using Veo 3.1 Fast`);
        try {
          const veoUrl = await generateVeoVideo({
            prompt: `${fullPrompt} The character speaks with natural lip synchronization.`,
            referenceImage: portrait,
            durationSeconds: Math.ceil(segDurationSec),
            aspectRatio: "9:16",
            resolution: "720p",
            quality: "fast",
            generateAudio: false, // We provide our own ElevenLabs audio
          });
          const veoBuffer = await downloadVeoVideo(veoUrl);

          // Apply lip-sync with our audio via Kling LipSync ($0.014/s)
          if (hasAudio && audioSegment.byteLength > 0 && process.env.FAL_KEY) {
            console.log(`[Scene Clip] Applying Kling LipSync to Veo video...`);
            videoUrl = await klingLipSync(veoBuffer, audioSegment);
          } else {
            videoUrl = veoUrl;
          }
          console.log(`[Scene Clip] Generated with Veo 3.1 + Kling LipSync (Premium)`);
        } catch (veoErr) {
          console.warn(`[Scene Clip] Veo 3.1 failed, falling back:`, veoErr);
          // Fallback to Kling Avatar
          videoUrl = await klingAvatar(portrait, audioSegment, fullPrompt, "pro");
          console.log(`[Scene Clip] Fallback to Kling Avatar v2 Pro`);
        }
      } else if (process.env.FAL_KEY) {
        // ══════ STANDARD: Kling Avatar v2 via fal.ai ══════
        console.log(`[Scene Clip] STANDARD: Using Kling Avatar v2 via fal.ai`);
        try {
          videoUrl = await klingAvatar(portrait, audioSegment, fullPrompt, "standard");
          console.log(`[Scene Clip] Generated with Kling Avatar v2 Standard (fal.ai)`);
        } catch (falErr) {
          console.warn(`[Scene Clip] fal.ai Kling Avatar failed, trying Hedra:`, falErr);
          videoUrl = await generateVideoKlingAvatar({
            imageBuffer: portrait,
            audioBuffer: audioSegment,
            prompt: fullPrompt,
            aspectRatio: "9:16",
            resolution: "720p",
          });
          console.log(`[Scene Clip] Fallback to Kling Avatar v2 via Hedra`);
        }
      } else {
        // ══════ FALLBACK: Hedra API ══════
        console.log(`[Scene Clip] FALLBACK: Using Hedra API`);
        try {
          videoUrl = await generateVideoKlingAvatar({
            imageBuffer: portrait,
            audioBuffer: audioSegment,
            prompt: fullPrompt,
            aspectRatio: "9:16",
            resolution: "720p",
          });
          console.log(`[Scene Clip] Generated with Kling Avatar v2 via Hedra`);
        } catch {
          videoUrl = await generateVideo({
            imageBuffer: portrait,
            audioBuffer: audioSegment,
            prompt: fullPrompt,
            aspectRatio: "9:16",
            resolution: "720p",
          });
          console.log(`[Scene Clip] Generated with Hedra Character 3 (last resort)`);
        }
      }
    } else {
      // Landscape/Transition — Kling I2V with automatic movement
      // Priority: 1) Previous scene's last frame (continuity!), 2) Landscape reference, 3) Portrait
      try {
        let found = false;

        // 1. Try previous scene's last frame for visual continuity
        if (sceneIndex > 0 && !found) {
          const prevIdx = String(sceneIndex - 1).padStart(3, "0");
          try {
            const { blobs: frameBlobs } = await list({ prefix: `films/${geschichteId}/frame-${prevIdx}`, limit: 1 });
            if (frameBlobs.length > 0) {
              sceneImage = await loadBuffer(frameBlobs[0].url);
              console.log(`[Scene Clip] Using previous frame for continuity: frame-${prevIdx}`);
              found = true;
            }
          } catch { /* fall through */ }
        }

        // 2. Try landscape reference from Studio assets
        if (!found) {
          const { loadReferences } = await import("@/lib/references");
          const refs = await loadReferences();
          const landscapeKeys = Object.keys(refs).filter((k) => k.startsWith("landscape:"));
          if (landscapeKeys.length > 0) {
            const primaryKey = landscapeKeys.find((k) => k.includes("koalatree")) || landscapeKeys[0];
            const entry = refs[primaryKey];
            if (entry?.primary) {
              try {
                const { blobs: refBlobs } = await list({ prefix: entry.primary, limit: 1 });
                if (refBlobs.length > 0) {
                  sceneImage = await loadBuffer(refBlobs[0].url);
                  console.log(`[Scene Clip] Using landscape reference: ${entry.primary}`);
                  found = true;
                }
              } catch { /* fall through */ }
            }
          }
        }

        // 3. Fall back to character portrait
        if (!found) {
          const fallbackRefs = await loadCharacterReferences(scene.characterId || "koda", 1);
          sceneImage = fallbackRefs[0];
          console.log(`[Scene Clip] Using portrait fallback`);
        }
      } catch {
        const fallbackRefs = await loadCharacterReferences(scene.characterId || "koda", 1);
        sceneImage = fallbackRefs[0];
      }

      // Auto-detect movement keywords from scene description
      const desc = (scene.sceneDescription + " " + (scene.mood || "")).toLowerCase();
      const movements: string[] = [];

      if (desc.includes("baum") || desc.includes("tree") || desc.includes("blätter") || desc.includes("leaves")) {
        movements.push("Leaves gently swaying in warm breeze, branches subtly moving");
      }
      if (desc.includes("wasser") || desc.includes("water") || desc.includes("bach") || desc.includes("stream") || desc.includes("fluss")) {
        movements.push("Water flowing gently over rocks, rippling surface reflections");
      }
      if (desc.includes("strand") || desc.includes("beach") || desc.includes("meer") || desc.includes("ocean") || desc.includes("wellen") || desc.includes("waves")) {
        movements.push("Gentle ocean waves rolling onto shore, foam spreading on sand, water reflecting sunlight");
      }
      if (desc.includes("wind") || desc.includes("gras") || desc.includes("grass") || desc.includes("wiese") || desc.includes("meadow")) {
        movements.push("Tall grass swaying rhythmically in gentle wind, wildflowers bobbing");
      }
      if (desc.includes("nacht") || desc.includes("night") || desc.includes("mond") || desc.includes("moon") || desc.includes("sterne") || desc.includes("stars")) {
        movements.push("Stars twinkling, gentle moonlight shifting, soft shadows moving");
      }
      if (desc.includes("feuer") || desc.includes("fire") || desc.includes("lagerfeuer") || desc.includes("campfire")) {
        movements.push("Fire crackling and flickering, warm light dancing on surroundings, sparks floating up");
      }
      if (desc.includes("regen") || desc.includes("rain")) {
        movements.push("Gentle rain falling, droplets creating ripples, mist rising");
      }
      if (desc.includes("schnee") || desc.includes("snow")) {
        movements.push("Soft snowflakes drifting down slowly, settling on branches");
      }
      if (desc.includes("sonnenuntergang") || desc.includes("sunset") || desc.includes("golden")) {
        movements.push("Warm golden light slowly shifting, long shadows moving subtly");
      }

      // Default movement if nothing specific detected
      if (movements.length === 0) {
        movements.push("Gentle ambient movement, leaves swaying, particles floating in light");
      }

      // Camera movement
      const cameraMap: Record<string, string> = {
        "slow-pan": "Slow cinematic camera pan across the scene",
        "zoom-in": "Slow smooth zoom into the center of the scene",
        "slow-zoom-in": "Very slow cinematic zoom into the center of the scene, gentle and smooth",
        "zoom-out": "Slow smooth zoom out revealing the full scene",
        "slow-zoom-out": "Very slow cinematic zoom out revealing the full scene, gentle and smooth",
        "wide": "Static wide shot with subtle parallax depth",
        "medium": "Gentle camera drift, slight movement",
        "close-up": "Slow push-in close-up shot",
      };
      const cameraMovement = cameraMap[scene.camera || "wide"] || cameraMap.wide;

      // Add ambient sound direction for scenes without story audio
      const ambientSound = !hasAudio
        ? " Gentle ambient forest sounds: soft wind through eucalyptus leaves, distant bird calls, peaceful nature atmosphere."
        : "";

      const animationPrompt = `${scene.sceneDescription}. ${movements.join(". ")}. ${cameraMovement}.${ambientSound} Smooth natural animation, no sudden movements. KoalaTree animated style, warm colors, Disney 1994 aesthetic.`;

      console.log(`[Scene Clip] Landscape prompt with movement: ${animationPrompt.substring(0, 100)}...`);

      // Load all character reference images for consistency (max 3 for Kling IR2V)
      let referenceImages: Buffer[] = [];
      if (scene.characterId) {
        try {
          referenceImages = await loadCharacterReferences(scene.characterId, 3);
          console.log(`[Scene Clip] ${referenceImages.length} character reference(s) loaded: ${scene.characterId}`);
        } catch { /* no reference available */ }
      }

      // Use fal.ai Kling 3.0 if available (better quality + Element Binding)
      if (process.env.FAL_KEY) {
        console.log(`[Scene Clip] Using fal.ai Kling 3.0 for landscape`);
        videoUrl = await klingI2V({
          imageBuffer: sceneImage!,
          prompt: animationPrompt,
          durationSeconds: 5,
          aspectRatio: "9:16",
          quality: scene.quality === "premium" ? "pro" : "standard",
          characterElements: referenceImages.length > 0 ? referenceImages : undefined,
          generateAudio: !hasAudio, // Generate ambient audio for silent scenes
        });
      } else {
        // Fallback to Hedra Kling
        videoUrl = await generateSceneVideo({
          imageBuffer: sceneImage!,
          prompt: animationPrompt,
          aspectRatio: "9:16",
          resolution: "720p",
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        });
      }
    }

    // Download and store video
    // Download video — use the right downloader based on the URL source
    let videoBuffer: Buffer;
    if (videoUrl.includes("fal.media") || videoUrl.includes("fal.run")) {
      videoBuffer = await downloadFalVideo(videoUrl);
    } else if (videoUrl.includes("googleapis.com")) {
      videoBuffer = await downloadVeoVideo(videoUrl);
    } else {
      videoBuffer = await downloadHedraVideo(videoUrl);
    }
    const blob = await put(
      `films/${geschichteId}/scene-${String(sceneIndex).padStart(3, "0")}.mp4`,
      videoBuffer,
      { access: "private", contentType: "video/mp4", allowOverwrite: true }
    );

    // Store the START image as frame for next scene's reference
    // Note: Ideally we'd extract the LAST video frame, but that needs ffmpeg.
    // Using the start image is a reasonable proxy — the next scene starts
    // from a visually similar point.
    let lastFrameUrl: string | undefined;
    try {
      // For landscape: store the scene image (landscape reference or previous frame)
      // For dialog: store the character portrait + landscape reference as frame
      let frameImage: Buffer | undefined;
      if (sceneImage) {
        frameImage = sceneImage;
      } else if (scene.characterId) {
        // For dialog scenes, store the landscape reference (not portrait)
        // so the next landscape scene gets the right background
        try {
          const { loadReferences } = await import("@/lib/references");
          const refs = await loadReferences();
          const landscapeKeys = Object.keys(refs).filter((k) => k.startsWith("landscape:"));
          if (landscapeKeys.length > 0) {
            const entry = refs[landscapeKeys[0]];
            if (entry?.primary) {
              const { blobs: refBlobs } = await list({ prefix: entry.primary, limit: 1 });
              if (refBlobs.length > 0) {
                frameImage = await loadBuffer(refBlobs[0].url);
              }
            }
          }
        } catch { /* fall through */ }
        // Fallback: character portrait
        if (!frameImage) {
          const chainRefs = await loadCharacterReferences(scene.characterId, 1);
          frameImage = chainRefs[0];
        }
      }
      if (frameImage) {
        const frameBlob = await put(
          `films/${geschichteId}/frame-${String(sceneIndex).padStart(3, "0")}.png`,
          frameImage,
          { access: "private", contentType: "image/png", allowOverwrite: true }
        );
        lastFrameUrl = frameBlob.url;
      }
    } catch { /* frame save optional */ }

    console.log(`[Scene Clip] Done: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

    return Response.json({
      videoUrl: `/api/video/film-scene/${geschichteId}/${sceneIndex}`,
      blobUrl: blob.url,
      lastFrameUrl,
      size: videoBuffer.byteLength,
    });
  } catch (error) {
    console.error("[Scene Clip] Error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Fehler" }, { status: 500 });
  }
}
