import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { buildStoryPrompt } from "@/lib/prompts";
import { HoererProfil, StoryConfig } from "@/lib/types";
import { berechneAlter } from "@/lib/utils";

const anthropic = new Anthropic();

export const maxDuration = 120;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { profilId, config } = (await request.json()) as {
      profilId: string;
      config: StoryConfig;
    };

    // Fetch profile from DB
    const dbProfil = await prisma.hoererProfil.findFirst({
      where: { id: profilId, userId },
    });
    if (!dbProfil) return Response.json({ error: "Profil nicht gefunden" }, { status: 404 });

    // Fetch previous stories for Koala memory
    const previousStories = await prisma.geschichte.findMany({
      where: { hoererProfilId: profilId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        createdAt: true,
        format: true,
        ziel: true,
        besonderesThema: true,
        zusammenfassung: true,
      },
    });

    // Map DB profile to type — compute alter from geburtsdatum
    const alter = dbProfil.geburtsdatum
      ? berechneAlter(dbProfil.geburtsdatum)
      : dbProfil.alter ?? 5;

    const profil: HoererProfil = {
      id: dbProfil.id,
      name: dbProfil.name,
      alter,
      geburtsdatum: dbProfil.geburtsdatum?.toISOString(),
      geschlecht: dbProfil.geschlecht as HoererProfil["geschlecht"],
      interessen: dbProfil.interessen,
      lieblingsfarbe: dbProfil.lieblingsfarbe || undefined,
      lieblingstier: dbProfil.lieblingstier || undefined,
      charaktereigenschaften: dbProfil.charaktereigenschaften,
      herausforderungen: dbProfil.herausforderungen.length > 0 ? dbProfil.herausforderungen : undefined,
      tags: dbProfil.tags.length > 0 ? dbProfil.tags : undefined,
    };

    const { system, user } = buildStoryPrompt(profil, config, previousStories);

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
    });

    let fullText = "";
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }

        // Generate title + summary via Claude
        const cleanText = fullText.replace(/\[.*?\]/g, "").trim();
        const zusammenfassung = cleanText.slice(0, 200) + "...";

        let titel = "";
        try {
          const titleResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 60,
            messages: [{
              role: "user",
              content: `Gib dieser Kindergeschichte einen kurzen, magischen Titel (3-6 Wörter, ohne Anführungszeichen). Der Titel soll neugierig machen und zum Inhalt passen.\n\nGeschichte (Anfang):\n${cleanText.slice(0, 500)}`,
            }],
          });
          const block = titleResponse.content[0];
          if (block.type === "text") {
            titel = block.text.replace(/[""„"«»]/g, "").trim();
          }
        } catch (err) {
          console.error("[Title] Generation failed:", err);
          titel = `Geschichte für ${profil.name}`;
        }

        const geschichte = await prisma.geschichte.create({
          data: {
            hoererProfilId: profilId,
            userId,
            format: config.format,
            ziel: config.ziel,
            dauer: config.dauer,
            besonderesThema: config.besonderesThema || null,
            titel,
            text: fullText,
            zusammenfassung,
          },
        });

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, geschichteId: geschichte.id, titel })}\n\n`)
        );
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Story generation error:", error);
    return Response.json(
      { error: "Fehler bei der Story-Generierung" },
      { status: 500 }
    );
  }
}
