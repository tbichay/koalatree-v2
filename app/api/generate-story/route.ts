import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { buildStoryPrompt } from "@/lib/prompts";
import { KindProfil as KindProfilType, StoryConfig } from "@/lib/types";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { profilId, config } = (await request.json()) as {
      profilId: string;
      config: StoryConfig;
    };

    // Fetch profile from DB
    const dbProfil = await prisma.kindProfil.findFirst({
      where: { id: profilId, userId },
    });
    if (!dbProfil) return Response.json({ error: "Profil nicht gefunden" }, { status: 404 });

    // Map DB profile to type
    const profil: KindProfilType = {
      id: dbProfil.id,
      name: dbProfil.name,
      alter: dbProfil.alter,
      geschlecht: dbProfil.geschlecht as KindProfilType["geschlecht"],
      interessen: dbProfil.interessen,
      lieblingsfarbe: dbProfil.lieblingsfarbe || undefined,
      lieblingstier: dbProfil.lieblingstier || undefined,
      charaktereigenschaften: dbProfil.charaktereigenschaften,
      herausforderungen: dbProfil.herausforderungen.length > 0 ? dbProfil.herausforderungen : undefined,
    };

    const { system, user } = buildStoryPrompt(profil, config);

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
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

        // Save story to DB
        const geschichte = await prisma.geschichte.create({
          data: {
            kindProfilId: profilId,
            userId,
            format: config.format,
            ziel: config.ziel,
            dauer: config.dauer,
            besonderesThema: config.besonderesThema || null,
            text: fullText,
          },
        });

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, geschichteId: geschichte.id })}\n\n`)
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
