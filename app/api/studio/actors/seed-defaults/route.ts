/**
 * Seed default KoalaTree family as Digital Actors for the current user.
 * Creates actors only if they don't already exist (checks by name).
 *
 * POST: Creates 7 default actors (Koda, Kiki, Luna, Mika, Pip, Sage, Nuki)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CHARACTERS } from "@/lib/types";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  // Check which default actors already exist for this user
  const existing = await prisma.digitalActor.findMany({
    where: { userId, tags: { has: "koalatree-default" } },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((a) => a.name));

  const created: string[] = [];
  const skipped: string[] = [];

  for (const [key, char] of Object.entries(CHARACTERS)) {
    if (existingNames.has(char.name)) {
      skipped.push(char.name);
      continue;
    }

    await prisma.digitalActor.create({
      data: {
        userId,
        name: char.name,
        description: `${char.species} — ${char.role}. ${char.description}`,
        voiceId: char.voiceId,
        voiceDescription: key === "koda" ? "Helmut — warm, sanft, weise"
          : key === "kiki" ? "Lumi — frech, lebhaft, Cartoon-Stimme"
          : key === "luna" ? "Luna — vertraeumt, sanft, beruhigend"
          : key === "mika" ? "Markus — jung, energisch, mutig"
          : key === "pip" ? "Robert — neugierig, lebhaft, aufgeweckt"
          : key === "sage" ? "Emanuel — tief, ruhig, philosophisch"
          : key === "nuki" ? "Hopsi — froehlich, verspielt, tollpatschig"
          : char.name,
        voiceSettings: JSON.parse(JSON.stringify(char.voiceSettings)),
        portraitAssetId: char.portrait, // /koda-portrait.png etc.
        style: "animated",
        outfit: key === "koda" ? "Kein Outfit — natuerliches Koala-Fell, graues weiches Fell" :
               key === "kiki" ? "Buntes Gefieder — braun-weiss mit blauem Fluegel-Akzent" :
               key === "luna" ? "Weiches Eulen-Gefieder — silber-lila mit grossen goldenen Augen" :
               key === "mika" ? "Sandbraunes Dingo-Fell, athletischer Koerperbau, waches Gesicht" :
               key === "pip" ? "Glaenzendes braunes Schnabeltier-Fell, neugieriger Schnabel" :
               key === "sage" ? "Dichtes olivbraunes Wombat-Fell, kompakter runder Koerper" :
               key === "nuki" ? "Goldbraunes Quokka-Fell, rundes laechelndes Gesicht" : undefined,
        traits: key === "koda" ? "Weise alte Augen, sanftes Laecheln, grosse runde Nase" :
                key === "kiki" ? "Frecher Blick, grosser Schnabel, aufgestellte Kopffedern" :
                key === "luna" ? "Grosse runde Augen, vertraeumter Blick, sanftes Gesicht" :
                key === "mika" ? "Wacher Blick, spitze Ohren, muskuloeser Koerper" :
                key === "pip" ? "Neugieriger Blick, entenschnabelartiges Gesicht, kleiner Koerper" :
                key === "sage" ? "Tiefer ruhiger Blick, wenig Mimik, gelassene Ausstrahlung" :
                key === "nuki" ? "Breites Dauergrinsen, runde Wangen, tollpatschige Haltung" : undefined,
        tags: ["koalatree-default", `character:${key}`],
      },
    });
    created.push(char.name);
  }

  return Response.json({
    created,
    skipped,
    total: created.length + skipped.length,
    message: created.length > 0
      ? `${created.length} KoalaTree-Actors erstellt: ${created.join(", ")}`
      : "Alle KoalaTree-Actors existieren bereits",
  });
}
