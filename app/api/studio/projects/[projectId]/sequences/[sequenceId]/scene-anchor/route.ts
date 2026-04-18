/**
 * Studio Scene-Anchor API — Pre-Production Setup-Image per Scene
 *
 * Generates ONE character-in-location setup image per scene using Nano Banana
 * Pro Edit ($0.15/img). User can:
 *   - Generate Kandidat 1 (Default-Prompt, kein Refinement)
 *   - Wenn nicht zufrieden: "Nochmal" (gleicher Prompt, neues Sample) ODER
 *     "Mit Anmerkung ausbessern" (User-Text wird in den Prompt eingeflochten)
 *   - Akzeptieren (setzt scene.sceneAnchorImageUrl auf den Kandidaten)
 *   - Clear (entfernt Pick + alle Kandidaten)
 *
 * Die Intention: Setup-Time vs Generation-Time-Split.
 * - Setup-Time: User approbiert ein Setup-Bild pro Szene einmal.
 * - Generation-Time: Clip-Cron nutzt das Bild als imageSource (deterministisch).
 *
 * Ersetzt den Flux-Kontext-Pre-Step (DIALOG_LOCATION_CONTEXT), der zur
 * Generation-Time lief und daher non-deterministic war.
 *
 * POST /api/studio/projects/:pid/sequences/:sid/scene-anchor
 *   body: { sceneIndex, refinementPrompt?: string }
 *   → Generiert EINEN Kandidaten, haengt ihn an scene.sceneAnchorCandidates.
 *
 * PUT /api/studio/projects/:pid/sequences/:sid/scene-anchor
 *   body: { sceneIndex, action: "select", candidateUrl } — approbiert Pick
 *   body: { sceneIndex, action: "clear" } — loescht alle Kandidaten + Pick
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import type { StudioScene } from "@/lib/studio/types";

export const maxDuration = 120; // Nano Banana Pro Edit ~20-40s

// Resolve Portrait/Character-Sheet URL wie im Clip-Cron (konsistent halten!)
function resolvePortraitUrl(
  char: {
    portraitUrl?: string | null;
    castSnapshot?: unknown;
    actor?: { portraitAssetId?: string | null; characterSheet?: unknown } | null;
  } | null | undefined,
): string | undefined {
  if (!char) return undefined;
  const castSnap = char.castSnapshot as { portraitUrl?: string } | null | undefined;
  const sheet = char.actor?.characterSheet as { front?: string } | null | undefined;
  return castSnap?.portraitUrl || sheet?.front || char.actor?.portraitAssetId || char.portraitUrl || undefined;
}

function resolveCharacterSheetUrls(
  char: {
    actor?: { characterSheet?: unknown } | null;
  } | null | undefined,
): string[] {
  const sheet = char?.actor?.characterSheet as
    | { front?: string; profile?: string; fullBody?: string }
    | null
    | undefined;
  if (!sheet) return [];
  return (["front", "profile", "fullBody"] as const)
    .map((k) => sheet[k])
    .filter((u): u is string => !!u);
}

/** Build the Nano Banana Pro prompt for a scene-anchor image. */
function buildAnchorPrompt(params: {
  characterName: string;
  characterDescription?: string;
  location?: string;
  sceneDescription?: string;
  sceneType: string;
  mood?: string;
  camera?: string;
  refinement?: string;
  hasLocationRef: boolean;
}): string {
  const {
    characterName, characterDescription, location, sceneDescription,
    sceneType, mood, camera, refinement, hasLocationRef,
  } = params;

  const isDialog = sceneType === "dialog";

  // Anti-Drift-Regeln an den Anfang stellen — Nano Banana Pro folgt instruktivem
  // Style-Preservation-Prompting gut.
  const parts: string[] = [
    `Character-consistent setup image of ${characterName}${characterDescription ? ` (${characterDescription})` : ""}.`,
    `CRITICAL: keep the character identical to the reference — same face, same fur/skin, same outfit, same 3D stylized cartoon style.`,
    `Do NOT change the art style. Do NOT make it photorealistic. Do NOT redesign the character.`,
  ];

  // Location-Kontext
  if (hasLocationRef) {
    parts.push(`Place the character in the location shown in the second reference image. Match the lighting, mood and environment of that location.`);
  } else if (location) {
    parts.push(`Location: ${location}. Match the lighting and mood of that place.`);
  }

  // Framing fuer Dialog: frontal, mouth visible (downstream Wan Lip-Sync benoetigt das!)
  if (isDialog) {
    parts.push(
      `Framing: frontal close-up, head and shoulders visible, ` +
      `the character is looking directly at the camera, ` +
      `mouth clearly visible with lips relaxed and neutral (NOT smiling, NOT talking, NOT open), ` +
      `ready to start speaking.`,
    );
  } else if (sceneType === "landscape") {
    parts.push(`Framing: wide establishing shot — the environment dominates, the character is small or absent.`);
  } else {
    parts.push(`Framing: ${camera || "medium shot"}.`);
  }

  // Szenen-Kontext (optional, knapp)
  if (sceneDescription) {
    const clean = sceneDescription.replace(/"[^"]*"/g, "").slice(0, 220);
    parts.push(`Scene context: ${clean}`);
  }
  if (mood) parts.push(`Mood: ${mood}.`);

  // User-Refinement am Ende (hoechste Prioritaet fuer das Modell)
  if (refinement?.trim()) {
    parts.push(`Additional direction from user (apply this): ${refinement.trim()}`);
  }

  // Hard constraints nochmal als Tail
  parts.push(`Output: single still image, cinematic, high quality. NO text, NO watermark, NO logo.`);

  return parts.join("\n");
}

// ── POST: Generate ONE candidate ──────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { projectId, sequenceId } = await params;
  const body = (await request.json()) as { sceneIndex: number; refinementPrompt?: string };

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId } },
    include: { project: { include: { characters: { include: { actor: true } } } } },
  });
  if (!sequence) return Response.json({ error: "Sequenz nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  if (body.sceneIndex < 0 || body.sceneIndex >= scenes.length) {
    return Response.json({ error: "Ungueltiger sceneIndex" }, { status: 400 });
  }
  const scene = scenes[body.sceneIndex];

  // Character resolution
  const character = scene.characterId
    ? sequence.project.characters.find((c) => c.id === scene.characterId)
    : null;
  // Fallback: lead character (wenn die Szene keinen expliziten characterId hat — z.B. landscape)
  const fallbackChar =
    sequence.project.characters.find((c) => c.role === "lead" && resolvePortraitUrl(c)) ||
    sequence.project.characters.find((c) => resolvePortraitUrl(c));
  const anchorChar = character && resolvePortraitUrl(character) ? character : fallbackChar;

  if (!anchorChar) {
    return Response.json(
      { error: "Kein Charakter mit Portrait verfuegbar — bitte erst Portrait generieren" },
      { status: 400 },
    );
  }

  // Load reference buffers
  const loadUrl = async (url: string): Promise<Buffer | undefined> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return undefined;
      return Buffer.from(await res.arrayBuffer());
    } catch { return undefined; }
  };

  const imageBuffers: Buffer[] = [];

  // 1) Portrait (primary subject ref — MUST be first)
  const portraitUrl = resolvePortraitUrl(anchorChar);
  if (portraitUrl) {
    const buf = await loadUrl(portraitUrl);
    if (buf) imageBuffers.push(buf);
  }
  if (imageBuffers.length === 0) {
    return Response.json({ error: "Portrait konnte nicht geladen werden" }, { status: 400 });
  }

  // 2) Location (second ref — falls vorhanden)
  let hasLocationRef = false;
  if (sequence.landscapeRefUrl) {
    const buf = await loadUrl(sequence.landscapeRefUrl);
    if (buf) {
      imageBuffers.push(buf);
      hasLocationRef = true;
    }
  }

  // 3) Character-Sheet-Angles (optional, weitere Identity-Refs)
  //    Sheet-Front ist meist == Portrait; uebersprungen. Profile + FullBody helfen.
  const sheetUrls = resolveCharacterSheetUrls(anchorChar);
  for (const url of sheetUrls) {
    if (url === portraitUrl) continue;
    if (imageBuffers.length >= 5) break; // Nano Banana: sweet spot 2-4 refs
    const buf = await loadUrl(url);
    if (buf) imageBuffers.push(buf);
  }

  // Build prompt
  const format = (sequence.project as unknown as { format?: string }).format || "portrait";
  const aspectRatio: "9:16" | "16:9" = format === "wide" || format === "cinema" ? "16:9" : "9:16";

  const prompt = buildAnchorPrompt({
    characterName: anchorChar.name,
    characterDescription: (anchorChar as unknown as { description?: string }).description,
    location: (scene.location as string | undefined) || (sequence.location as string | undefined),
    sceneDescription: scene.sceneDescription,
    sceneType: scene.type,
    mood: scene.mood,
    camera: scene.camera,
    refinement: body.refinementPrompt,
    hasLocationRef,
  });

  console.log(
    `[SceneAnchor] Scene ${body.sceneIndex}: generating with ${imageBuffers.length} refs, ` +
    `refinement=${body.refinementPrompt ? "yes" : "no"}`,
  );

  // Call Nano Banana Pro
  const { nanoBananaProEdit } = await import("@/lib/fal");
  let result: { url: string };
  try {
    result = await nanoBananaProEdit({
      imageBuffers,
      prompt,
      aspectRatio,
      numImages: 1,
    });
  } catch (err) {
    console.error("[SceneAnchor] Nano Banana Pro failed:", err);
    return Response.json(
      { error: `Generierung fehlgeschlagen: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // Persist result to Vercel Blob (Nano Banana URLs sind fal-signed und kurz-lebig)
  let blobUrl: string;
  try {
    const imgRes = await fetch(result.url);
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    const blobPath = `studio/${projectId}/sequences/${sequenceId}/scene-anchors/scene-${body.sceneIndex}-${Date.now()}.png`;
    const blob = await put(blobPath, imgBuf, {
      access: "private", // Clip-Cron laedt via loadBlobBuffer (get(url, {access:"private"}))
      contentType: "image/png",
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
  } catch (err) {
    console.warn("[SceneAnchor] Blob persistence failed, using fal URL directly:", err);
    blobUrl = result.url;
  }

  // Append to candidates (and remember last refinement)
  const candidates = [...(scene.sceneAnchorCandidates || []), blobUrl];
  scenes[body.sceneIndex] = {
    ...scene,
    sceneAnchorCandidates: candidates,
    sceneAnchorRefinement: body.refinementPrompt || scene.sceneAnchorRefinement,
  };

  await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: { scenes: scenes as unknown as object },
  });

  return Response.json({
    sceneIndex: body.sceneIndex,
    candidateUrl: blobUrl,
    candidates,
    cost: 0.15,
  });
}

// ── PUT: Select (accept) a candidate as the anchor, or clear all ──

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { projectId, sequenceId } = await params;
  const body = (await request.json()) as
    | { sceneIndex: number; action: "select"; candidateUrl: string }
    | { sceneIndex: number; action: "clear" };

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId } },
  });
  if (!sequence) return Response.json({ error: "Sequenz nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  if (body.sceneIndex < 0 || body.sceneIndex >= scenes.length) {
    return Response.json({ error: "Ungueltiger sceneIndex" }, { status: 400 });
  }
  const scene = scenes[body.sceneIndex];

  if (body.action === "select") {
    if (!scene.sceneAnchorCandidates?.includes(body.candidateUrl)) {
      return Response.json({ error: "Kandidat nicht in der Liste" }, { status: 400 });
    }
    scenes[body.sceneIndex] = { ...scene, sceneAnchorImageUrl: body.candidateUrl };
  } else if (body.action === "clear") {
    scenes[body.sceneIndex] = {
      ...scene,
      sceneAnchorImageUrl: undefined,
      sceneAnchorCandidates: [],
      sceneAnchorRefinement: undefined,
    };
  }

  await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: { scenes: scenes as unknown as object },
  });

  return Response.json({ ok: true, scene: scenes[body.sceneIndex] });
}
