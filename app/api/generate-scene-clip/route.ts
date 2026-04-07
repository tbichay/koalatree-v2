import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateVideo, generateVideoKlingAvatar, generateSceneVideo, downloadVideo } from "@/lib/hedra";
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
      // Load all reference images for this character (primary first)
      const charRefs = await loadCharacterReferences(scene.characterId);
      const portrait = charRefs[0]; // Hedra needs one primary portrait

      // Build character-aware prompt with scene-specific background from Director
      const charPrompt = buildCharacterPrompt(scene.characterId, scene.sceneDescription);
      const bgFromScene = scene.mood ? `Atmosphere: ${scene.mood}.` : "";
      const locationHint = scene.location ? `Setting: ${scene.location}.` : "";

      const fullPrompt = `${charPrompt}. ${bgFromScene} ${locationHint} Keep the character exactly as shown in the reference image. Natural lip sync to speech. NO text, NO subtitles.`;

      // Try Kling Avatar v2 Pro first (better lip-sync + movement), fall back to Hedra Character 3
      try {
        videoUrl = await generateVideoKlingAvatar({
          imageBuffer: portrait,
          audioBuffer: audioSegment,
          prompt: fullPrompt,
          aspectRatio: "9:16",
          resolution: "720p",
        });
        console.log(`[Scene Clip] Generated with Kling Avatar v2 Pro`);
      } catch (klingErr) {
        console.warn(`[Scene Clip] Kling Avatar v2 failed, falling back to Hedra:`, klingErr);
        videoUrl = await generateVideo({
          imageBuffer: portrait,
          audioBuffer: audioSegment,
          prompt: fullPrompt,
          aspectRatio: "9:16",
          resolution: "720p",
        });
        console.log(`[Scene Clip] Generated with Hedra Character 3 (fallback)`);
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

      videoUrl = await generateSceneVideo({
        imageBuffer: sceneImage!,
        prompt: animationPrompt,
        aspectRatio: "9:16",
        resolution: "720p",
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      });
    }

    // Download and store video
    const videoBuffer = await downloadVideo(videoUrl);
    const blob = await put(
      `films/${geschichteId}/scene-${String(sceneIndex).padStart(3, "0")}.mp4`,
      videoBuffer,
      { access: "private", contentType: "video/mp4", allowOverwrite: true }
    );

    // Store the input image as "last frame" for frame-chaining (visual continuity)
    let lastFrameUrl: string | undefined;
    try {
      // Use the scene's input image (sceneImage for landscape, portrait for dialog)
      let frameImage: Buffer | undefined;
      if (!isDialogLike && sceneImage) {
        // Landscape/transition: use the scene image (landscape ref or previous frame)
        frameImage = sceneImage;
      } else if (scene.characterId) {
        // Dialog: use character portrait
        const chainRefs = await loadCharacterReferences(scene.characterId, 1);
        frameImage = chainRefs[0];
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
