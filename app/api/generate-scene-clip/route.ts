import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateVideo, generateVideoKlingAvatar, generateSceneVideo, downloadVideo as downloadHedraVideo } from "@/lib/hedra";
import { klingAvatar, klingI2V, klingLipSync, seedanceI2V, seedanceDialog, downloadVideo as downloadFalVideo, extractLastFrame } from "@/lib/fal";
import { generateVeoVideo, downloadVeoVideo } from "@/lib/veo";
import { put, get, list } from "@vercel/blob";
import { CHARACTERS, type CharacterKey } from "@/lib/studio";
import { loadCharacterReferences } from "@/lib/references";
import { segmentMp3 } from "@/lib/audio-segment";

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
  transitionTo?: "cut" | "flow" | "zoom-to-character";
  /** Character ID of the NEXT scene (for zoom-to-character transitions) */
  nextCharacterId?: string;
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

// ── Streaming SSE Response ─────────────────────────────────────────
// Keeps connection alive with progress updates to prevent gateway timeout

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json() as {
    geschichteId: string;
    sceneIndex: number;
    scene: SceneInput;
  };

  const { geschichteId, sceneIndex, scene } = body;

  // Create SSE stream
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream closed */ }
      };

      // IMMEDIATELY send first byte to prevent gateway timeout
      send({ progress: "Starting..." });

      // Keep-alive: send progress every 5 seconds
      const keepAlive = setInterval(() => send({ progress: "generating..." }), 5000);

      try {
        send({ progress: "Loading audio..." });

        // Load story audio
        const geschichte = await prisma.geschichte.findUnique({
          where: { id: geschichteId },
          select: { audioUrl: true },
        });
        if (!geschichte?.audioUrl) throw new Error("Story has no audio");

        // Check if this scene has audio
        const hasAudio = scene.audioStartMs !== scene.audioEndMs && scene.audioEndMs > 0;

        let audioSegment: Buffer = Buffer.alloc(0);
        if (hasAudio) {
          const fullAudio = await loadBuffer(geschichte.audioUrl);
          const expectedDurSec = (scene.audioEndMs - scene.audioStartMs) / 1000;

          // HARD LIMIT: refuse to process segments longer than 30s (prevents $5+ bills)
          if (expectedDurSec > 30) {
            throw new Error(`Audio-Segment zu lang (${expectedDurSec.toFixed(0)}s). Max 30s pro Clip.`);
          }

          audioSegment = segmentMp3(fullAudio, scene.audioStartMs, scene.audioEndMs);

          // Safety check: segment should be roughly proportional to duration
          // 128kbps MP3 = ~16KB/s, so a 5s clip should be ~80KB, not 8MB
          const expectedBytes = expectedDurSec * 16 * 1024; // rough estimate
          if (audioSegment.byteLength > expectedBytes * 3) {
            console.error(`[Scene Clip] SAFETY: Segment ${(audioSegment.byteLength/1024).toFixed(0)}KB is way too big for ${expectedDurSec.toFixed(1)}s (expected ~${(expectedBytes/1024).toFixed(0)}KB). Using byte-offset fallback.`);
            const bytesPerMs = 16;
            const startByte = Math.max(0, Math.floor(scene.audioStartMs * bytesPerMs));
            const endByte = Math.min(fullAudio.byteLength, Math.ceil(scene.audioEndMs * bytesPerMs));
            audioSegment = Buffer.from(fullAudio.subarray(startByte, endByte));
          }

          console.log(`[Scene Clip] Scene ${sceneIndex}: audio ${scene.audioStartMs}-${scene.audioEndMs}ms (${expectedDurSec.toFixed(1)}s), segment ${(audioSegment.byteLength / 1024).toFixed(0)}KB, full ${(fullAudio.byteLength / 1024).toFixed(0)}KB`);
        }

        let videoUrl = "";
        let sceneImage: Buffer | undefined;

        const isDialogLike = (scene.type === "dialog" || scene.type === "intro" || scene.type === "outro") && scene.characterId;

        if (isDialogLike && scene.characterId) {
          // ══════ DIALOG: Lip-sync video ══════
          send({ progress: "Loading character references..." });
          const charRefs = await loadCharacterReferences(scene.characterId);
          const portrait = charRefs[0];

          const charPrompt = buildCharacterPrompt(scene.characterId, scene.sceneDescription);
          const bgFromScene = scene.mood ? `Atmosphere: ${scene.mood}.` : "";
          const locationHint = scene.location ? `Setting: ${scene.location}.` : "";
          const fullPrompt = `${charPrompt}. ${bgFromScene} ${locationHint} Keep the character exactly as shown in the reference image. Natural lip sync to speech. NO text, NO subtitles.`;

          const isPremium = scene.quality === "premium";

          if (isPremium && process.env.GOOGLE_AI_API_KEY && process.env.FAL_KEY) {
            // ── PREMIUM: Veo 3.1 + Kling LipSync ──
            send({ progress: "Premium: Generating with Veo 3.1..." });
            try {
              const segDurationSec = Math.min(8, Math.max(1, (scene.audioEndMs - scene.audioStartMs) / 1000));
              const veoUrl = await (await import("@/lib/veo")).generateVeoVideo({
                prompt: `${fullPrompt} The character speaks with natural lip synchronization.`,
                referenceImage: portrait,
                durationSeconds: Math.ceil(segDurationSec),
                aspectRatio: "9:16",
                resolution: "720p",
                quality: "fast",
                generateAudio: false,
              });
              send({ progress: "Premium: Applying Kling LipSync..." });
              const veoBuffer = await (await import("@/lib/veo")).downloadVeoVideo(veoUrl);
              videoUrl = await klingLipSync(veoBuffer, audioSegment);
              console.log(`[Scene Clip] Generated with Veo 3.1 + Kling LipSync (Premium)`);
            } catch (veoErr) {
              console.warn(`[Scene Clip] Veo Premium failed, falling back to Kling Avatar Pro:`, veoErr);
              send({ progress: "Veo failed, using Kling Avatar Pro..." });
              videoUrl = await klingAvatar(portrait, audioSegment, fullPrompt, "pro");
            }
          } else if (process.env.FAL_KEY) {
            // ── STANDARD: Try Seedance + LipSync first (cheaper), fallback to Kling Avatar ──
            let usedSeedance = false;
            if (hasAudio && audioSegment.byteLength > 1000) {
              try {
                send({ progress: "Generating with Seedance + LipSync (~$0.33)..." });
                videoUrl = await seedanceDialog(portrait, audioSegment, fullPrompt, "9:16");
                usedSeedance = true;
                console.log(`[Scene Clip] Generated with Seedance 1.5 + Kling LipSync (fal.ai)`);
              } catch (seedErr) {
                console.warn(`[Scene Clip] Seedance failed, trying Kling Avatar:`, seedErr instanceof Error ? seedErr.message : seedErr);
                send({ progress: "Seedance failed, using Kling Avatar..." });
              }
            } else {
              send({ progress: "No audio segment, skipping Seedance..." });
            }

            if (!usedSeedance) {
            try {
              videoUrl = await klingAvatar(portrait, audioSegment, fullPrompt, "standard");
              console.log(`[Scene Clip] Generated with Kling Avatar v2 Standard (fal.ai)`);
            } catch (falErr) {
              console.error(`[Scene Clip] fal.ai failed:`, falErr instanceof Error ? falErr.message : falErr);
              send({ progress: "fal.ai failed, trying Hedra..." });
              try {
                videoUrl = await generateVideoKlingAvatar({
                  imageBuffer: portrait, audioBuffer: audioSegment, prompt: fullPrompt,
                  aspectRatio: "9:16", resolution: "720p",
                });
              } catch (hedraErr) {
                throw new Error(`fal.ai: ${falErr instanceof Error ? falErr.message : "Fehler"}. Hedra: ${hedraErr instanceof Error ? hedraErr.message : "Fehler"}`);
              }
            }
            } // end if (!usedSeedance)
          } else {
            send({ progress: "Generating with Hedra..." });
            videoUrl = await generateVideo({
              imageBuffer: portrait, audioBuffer: audioSegment, prompt: fullPrompt,
              aspectRatio: "9:16", resolution: "720p",
            });
          }
        } else {
          // ══════ LANDSCAPE/TRANSITION ══════
          send({ progress: "Loading scene image..." });

          // Load scene image: previous frame → landscape ref → portrait
          try {
            let found = false;
            if (sceneIndex > 0 && !found) {
              const prevIdx = String(sceneIndex - 1).padStart(3, "0");
              try {
                const { blobs: frameBlobs } = await list({ prefix: `films/${geschichteId}/frame-${prevIdx}`, limit: 1 });
                if (frameBlobs.length > 0) {
                  sceneImage = await loadBuffer(frameBlobs[0].url);
                  found = true;
                }
              } catch { /* fall through */ }
            }
            if (!found) {
              const { loadReferences } = await import("@/lib/references");
              const refs = await loadReferences();
              const landscapeKeys = Object.keys(refs).filter((k) => k.startsWith("landscape:"));
              if (landscapeKeys.length > 0) {
                const entry = refs[landscapeKeys.find((k) => k.includes("koalatree")) || landscapeKeys[0]];
                if (entry?.primary) {
                  try {
                    const { blobs: refBlobs } = await list({ prefix: entry.primary, limit: 1 });
                    if (refBlobs.length > 0) { sceneImage = await loadBuffer(refBlobs[0].url); found = true; }
                  } catch { /* fall through */ }
                }
              }
            }
            if (!found) {
              const fallbackRefs = await loadCharacterReferences(scene.characterId || "koda", 1);
              sceneImage = fallbackRefs[0];
            }
          } catch {
            const fallbackRefs = await loadCharacterReferences(scene.characterId || "koda", 1);
            sceneImage = fallbackRefs[0];
          }

          // Build animation prompt
          const desc = (scene.sceneDescription + " " + (scene.mood || "")).toLowerCase();
          const movements: string[] = [];
          if (desc.includes("baum") || desc.includes("tree") || desc.includes("blätter")) movements.push("Leaves gently swaying in warm breeze");
          if (desc.includes("wasser") || desc.includes("water") || desc.includes("bach")) movements.push("Water flowing gently over rocks");
          if (desc.includes("nacht") || desc.includes("night") || desc.includes("mond")) movements.push("Stars twinkling, gentle moonlight");
          if (desc.includes("wind") || desc.includes("gras")) movements.push("Grass swaying in gentle wind");
          if (movements.length === 0) movements.push("Gentle ambient movement, leaves swaying");

          const cameraMap: Record<string, string> = {
            "slow-pan": "Slow cinematic camera pan", "zoom-in": "Slow zoom in",
            "slow-zoom-in": "Very slow cinematic zoom in", "zoom-out": "Slow zoom out",
            "slow-zoom-out": "Very slow cinematic zoom out", "wide": "Static wide shot",
            "medium": "Gentle camera drift", "close-up": "Slow push-in close-up",
          };
          const camera = cameraMap[scene.camera || "wide"] || cameraMap.wide;
          const ambientSound = !hasAudio ? " Gentle ambient forest sounds." : "";
          // If zoom-to-character: enhance prompt to show camera approaching next speaker
          let transitionHint = "";
          if (scene.transitionTo === "zoom-to-character" && scene.nextCharacterId) {
            const nextChar = CHARACTERS[scene.nextCharacterId as CharacterKey];
            if (nextChar) {
              transitionHint = ` The camera slowly zooms in toward ${nextChar.description.split(".")[0]}, ending in a close-up framing ready for dialogue.`;
            }
          }

          const animationPrompt = `${scene.sceneDescription}. ${movements.join(". ")}. ${camera}.${transitionHint}${ambientSound} Smooth animation, warm colors.`;

          send({ progress: scene.transitionTo === "zoom-to-character" ? "Generating zoom-to-character transition..." : "Generating landscape video..." });

          // Load character references (current scene + next character for zoom-to)
          let referenceImages: Buffer[] = [];
          const charToRef = scene.nextCharacterId || scene.characterId;
          if (charToRef) {
            try { referenceImages = await loadCharacterReferences(charToRef, 3); } catch { /* */ }
          }

          if (process.env.FAL_KEY) {
            const isPremiumLandscape = scene.quality === "premium";

            if (isPremiumLandscape) {
              // Premium: Kling 3.0 Pro with Element Binding
              send({ progress: "Generating landscape (Kling 3.0 Pro + Elements)..." });
              try {
                videoUrl = await klingI2V({
                  imageBuffer: sceneImage!, prompt: animationPrompt, durationSeconds: 5,
                  aspectRatio: "9:16", quality: "pro",
                  characterElements: referenceImages.length > 0 ? referenceImages : undefined,
                  generateAudio: !hasAudio,
                });
              } catch (klingErr) {
                console.error(`[Scene Clip] Kling Pro failed:`, klingErr instanceof Error ? klingErr.message : klingErr);
                throw new Error(`Premium (Kling Pro) fehlgeschlagen: ${klingErr instanceof Error ? klingErr.message : "Fehler"}. Bitte auf Standard wechseln.`);
              }
            } else {
              // Standard: Try Seedance first (cheaper), fallback to Kling Standard
              try {
                send({ progress: "Generating landscape (Seedance 1.5 ~$0.26)..." });
                videoUrl = await seedanceI2V({
                  imageBuffer: sceneImage!, prompt: animationPrompt, durationSeconds: 5,
                  aspectRatio: "9:16", generateAudio: !hasAudio,
                });
                console.log(`[Scene Clip] Generated landscape with Seedance 1.5`);
              } catch (seedErr) {
                console.warn(`[Scene Clip] Seedance failed, trying Kling Standard:`, seedErr instanceof Error ? seedErr.message : seedErr);
                send({ progress: "Seedance failed, using Kling Standard..." });
                videoUrl = await klingI2V({
                  imageBuffer: sceneImage!, prompt: animationPrompt, durationSeconds: 5,
                  aspectRatio: "9:16", quality: "standard", generateAudio: !hasAudio,
                });
              }
            }
          } else {
            videoUrl = await generateSceneVideo({
              imageBuffer: sceneImage!, prompt: animationPrompt,
              aspectRatio: "9:16", resolution: "720p",
              referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
            });
          }
        }

        // Download and store
        send({ progress: "Downloading and storing clip..." });

        let videoBuffer: Buffer;
        if (videoUrl.includes("fal.media") || videoUrl.includes("fal.run")) {
          videoBuffer = await downloadFalVideo(videoUrl);
        } else if (videoUrl.includes("googleapis.com")) {
          videoBuffer = await downloadVeoVideo(videoUrl);
        } else {
          videoBuffer = await downloadHedraVideo(videoUrl);
        }

        const paddedIdx = String(sceneIndex).padStart(3, "0");
        const charId = scene.characterId || "landscape";
        // Include scene index to prevent collisions when multiple scenes share timing
        const clipName = `clip-${paddedIdx}-${scene.audioStartMs}-${scene.audioEndMs}-${charId}`;

        // Versioned copy (never deleted)
        await put(`films/${geschichteId}/versions/${clipName}-v${Date.now()}.mp4`, videoBuffer,
          { access: "private", contentType: "video/mp4" });

        // Active clip by timing (matched by Film-Project API)
        const blob = await put(`films/${geschichteId}/${clipName}.mp4`, videoBuffer,
          { access: "private", contentType: "video/mp4", allowOverwrite: true });

        // Also save with scene index for backward compatibility
        await put(`films/${geschichteId}/scene-${paddedIdx}.mp4`, videoBuffer,
          { access: "private", contentType: "video/mp4", allowOverwrite: true });

        // Extract LAST FRAME from generated video via fal.ai ffmpeg API (~$0.0002)
        // This is the actual last frame, not just the input image
        send({ progress: "Extracting last frame for next clip..." });
        try {
          if (process.env.FAL_KEY) {
            // Upload video to fal.ai for frame extraction
            const { uploadToFal } = await import("@/lib/fal");
            const publicVideoUrl = await uploadToFal(videoBuffer, `scene-${paddedIdx}.mp4`, "video/mp4");
            const lastFrame = await extractLastFrame(publicVideoUrl);
            await put(`films/${geschichteId}/frame-${paddedIdx}.png`, lastFrame,
              { access: "private", contentType: "image/png", allowOverwrite: true });
            console.log(`[Scene Clip] Last frame extracted and saved (${(lastFrame.byteLength / 1024).toFixed(0)}KB)`);
          } else {
            // Fallback: save input image as frame
            const fallbackFrame = sceneImage || (scene.characterId ? (await loadCharacterReferences(scene.characterId, 1))[0] : undefined);
            if (fallbackFrame) {
              await put(`films/${geschichteId}/frame-${paddedIdx}.png`, fallbackFrame,
                { access: "private", contentType: "image/png", allowOverwrite: true });
            }
          }
        } catch (frameErr) {
          console.warn(`[Scene Clip] Frame extraction failed:`, frameErr);
        }

        console.log(`[Scene Clip] Done: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

        // Save clip metadata
        const metadata = {
          clipName: `${clipName}.mp4`,
          sceneIndex,
          type: scene.type,
          characterId: scene.characterId || null,
          audioStartMs: scene.audioStartMs,
          audioEndMs: scene.audioEndMs,
          audioDurationSec: ((scene.audioEndMs - scene.audioStartMs) / 1000).toFixed(1),
          audioSegmentBytes: audioSegment.byteLength,
          videoBytes: videoBuffer.byteLength,
          provider: process.env.FAL_KEY ? "fal.ai/kling-avatar-v2-standard" : "hedra",
          quality: scene.quality || "standard",
          prompt: scene.sceneDescription?.substring(0, 100),
          generatedAt: new Date().toISOString(),
          estimatedCostUsd: process.env.FAL_KEY
            ? ((scene.audioEndMs - scene.audioStartMs) / 1000 * 0.056).toFixed(3)
            : "unknown",
        };

        // Store metadata alongside clip
        await put(`films/${geschichteId}/${clipName}.meta.json`, JSON.stringify(metadata, null, 2),
          { access: "private", contentType: "application/json", allowOverwrite: true });

        console.log(`[Scene Clip] Done: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)}MB, provider: ${metadata.provider}, est. $${metadata.estimatedCostUsd}`);

        clearInterval(keepAlive);
        send({
          done: true,
          videoUrl: `/api/video/film-clip/${geschichteId}/${clipName}.mp4?t=${Date.now()}`,
          fallbackUrl: `/api/video/film-scene/${geschichteId}/${sceneIndex}?t=${Date.now()}`,
          blobUrl: blob.url,
          size: videoBuffer.byteLength,
          clipName: `${clipName}.mp4`,
          metadata,
        });
        controller.close();
      } catch (error) {
        clearInterval(keepAlive);
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error("[Scene Clip] Error:", errMsg);
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, error: errMsg })}\n\n`));
        } catch { /* controller might be closed */ }
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
