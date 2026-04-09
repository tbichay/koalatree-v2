# KoalaTree Story-to-Film Engine — Positionierung & Konzept

## Vision

**"Von Text zu fertigem Film in einem API-Call."**

Nicht noch ein Video-Editor. Nicht noch eine Generation-Plattform. Sondern eine **vollautomatische Pipeline** die aus einer Geschichte einen professionellen Film macht — mit konsistenten Charakteren, Stimmen und Stil.

---

## Was wir sind vs. was andere sind

| | KoalaTree Engine | Higgsfield / Seedance | 
|---|---|---|
| **Eingabe** | Text (Geschichte) | Bild/Video/Prompt (manuell) |
| **Ausgabe** | Fertiger Film mit Audio, Lip-Sync, Uebergaengen | Einzelne Clips (manuell zusammenschneiden) |
| **Charaktere** | Definiert mit Referenzbildern, Stimmen, Persoenlichkeit | Upload eines Bildes, keine Stimme |
| **Audio** | 7+ Custom-Stimmen, Multi-Character Dialog, SFX, Ambience | Generische TTS oder kein Audio |
| **Regie** | AI Director plant automatisch (Kamera, Szenen, Timing) | User muss jede Szene manuell planen |
| **Stil** | Konfigurierbar (2D, 3D, Anime, Realistisch, Custom) | Pro Clip waehlbar, keine Konsistenz-Garantie |
| **Zielgruppe** | Verlage, EdTech, Therapeuten, Content-Creator | Einzelne Video-Creator |

---

## Die Pipeline (was kein anderer hat)

```
Geschichte (Text)
    │
    ▼
┌─────────────────────────────────┐
│ 1. CHARACTER ENGINE              │
│    Referenzbilder + Stimmen      │
│    + Persoenlichkeits-Profile    │
│    → Konsistente Darstellung     │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 2. AUDIO ENGINE                  │
│    Multi-Voice TTS (ElevenLabs)  │
│    + SFX + Ambience             │
│    → Timeline mit Timing-Daten   │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 3. AI DIRECTOR                   │
│    Story-Analyse → Szenen-Plan   │
│    Kamera, Mood, Transitions     │
│    → Professionelles Storyboard  │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 4. VIDEO ENGINE                  │
│    Dialog → Lip-Sync (Seedance   │
│    + LipSync / Kling / Veo)     │
│    Landscape → Animation         │
│    → Einzelne Szenen-Clips       │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ 5. MASTERING ENGINE              │
│    Crossfade-Transitions         │
│    Durchgehende Audio-Spur       │
│    Titel + Abspann              │
│    → Fertiger Film (Remotion)    │
└─────────────────────────────────┘
```

---

## Stil-Unabhaengigkeit

Die Engine ist **stilunabhaengig**. Der Stil wird durch den `stylePrompt` bestimmt:

| Stil | stylePrompt (Beispiel) | Ergebnis |
|------|----------------------|----------|
| **2D Zeichentrick** | "Traditional 1994 Disney cel animation, flat 2D, clean ink outlines" | KoalaTree-Stil |
| **3D Pixar** | "Modern 3D animated Pixar style, subsurface scattering, soft lighting" | Pixar-artig |
| **Anime** | "Japanese anime style, Studio Ghibli inspired, soft watercolors" | Ghibli-Stil |
| **Realistisch** | "Photorealistic live-action children's film, natural lighting" | Realfilm-Look |
| **Aquarell** | "Watercolor illustration style, soft edges, painted textures" | Kinderbuch-Stil |
| **Retro** | "1980s Saturday morning cartoon, bold colors, thick outlines" | Retro-Cartoon |

Der User waehlt den Stil einmal im Studio-Settings und ALLE generierten Clips nutzen ihn konsistent.

---

## Kunden-Segmente

### 1. Content-Creator & Storyteller
**"Ich habe eine Geschichte, ich brauche einen Film."**
- Kinderbuch-Autoren die ihre Buecher verfilmen wollen
- Podcast-Creator die ihre Episoden visualisieren wollen
- Social-Media-Creator die Story-Content brauchen

### 2. EdTech & E-Learning
**"Wir brauchen automatisiert Lernvideos."**
- Sprachlern-Apps (Geschichte in Zielsprache → Film)
- Mathe/Naturwissenschaft-Erklaer-Plattformen
- Schul-Content-Plattformen

### 3. Verlage & Media
**"Unsere Buecher sollen automatisch Filme werden."**
- Kinderbuch-Verlage (100 Buecher → 100 Filme)
- Hoerspiel-Labels (Audio → Video)
- Streaming-Plattformen fuer Kinder-Content

### 4. Therapeuten & Paedagogen
**"Personalisierte therapeutische Videos fuer Kinder."**
- Trauma-Verarbeitung durch personalisierte Geschichten
- Soziale Kompetenz-Training als Film
- Achtsamkeits-/Meditations-Videos

### 5. Marketing & Branding
**"Unsere Brand-Story als animierter Film."**
- Erklaer-Videos fuer Produkte
- Brand-Storytelling als Zeichentrick
- Social-Media Kampagnen-Videos

---

## API-Konzept (Phase 4)

```typescript
// Einfachster Call:
POST /api/v1/generate-film
{
  "text": "Es war einmal ein kleiner Fuchs...",
  "style": "disney-2d",
  "characters": [
    {
      "id": "fuchs",
      "name": "Felix",
      "referenceImage": "https://...",
      "voiceId": "elevenlabs-voice-id"
    }
  ],
  "format": "9:16",
  "quality": "standard"
}

// Response:
{
  "filmId": "abc123",
  "status": "processing",
  "estimatedMinutes": 15,
  "estimatedCost": "$4.50",
  "statusUrl": "/api/v1/films/abc123/status"
}

// Status Polling:
GET /api/v1/films/abc123/status
{
  "status": "completed",
  "videoUrl": "https://...",
  "audioUrl": "https://...",
  "duration": "2:30",
  "scenes": 12,
  "cost": "$4.20"
}
```

---

## Wettbewerbsvorteil

1. **Vollautomatisch** — kein manuelles Szene-fuer-Szene erstellen
2. **Multi-Character Dialog** — mehrere Stimmen in einer Geschichte
3. **Konsistente Charaktere** — Referenzbilder + Element Binding
4. **Stil-agnostisch** — 2D, 3D, Anime, Realistisch, Custom
5. **Paedagogisch informiert** — altersgerechte Anpassung
6. **Provider-agnostisch** — nutzt automatisch den besten/guenstigsten Provider
7. **Personalisierbar** — Name, Alter, Interessen fliessen in die Geschichte ein

---

## Preis-Modell (Engine API)

| Plan | Preis | Inklusiv | Fuer |
|------|-------|----------|------|
| **Starter** | $49/Monat | 10 Filme/Monat | Einzelne Creator |
| **Business** | $199/Monat | 50 Filme/Monat | Kleine Verlage, EdTech |
| **Enterprise** | Custom | Unbegrenzt | Grosse Verlage, Plattformen |
| **Pay-per-Film** | $5-15/Film | Einzelkauf | Gelegenheits-Nutzer |

Unsere Kosten pro Film: ~$5-8 (Standard), ~$12-15 (Premium)
Marge: 50-70% bei Business/Enterprise

---

## Technische Architektur (bereits gebaut)

- **Character Engine**: `lib/references.ts`, `lib/studio.ts`
- **Audio Engine**: `lib/elevenlabs.ts` (Multi-Voice, SFX, Ambience)
- **AI Director**: `lib/video-director.ts` (Story → Szenen)
- **Video Engine**: `lib/fal.ts` (Seedance, Kling), `lib/veo.ts`, `lib/hedra.ts`
- **Mastering Engine**: `lib/film-render.ts` (Remotion Lambda)
- **Storage**: Vercel Blob (Clips), AWS S3 (gerenderte Filme)
- **Queue**: DB-basiert mit Cron (Audio), SSE (Clips), Lambda (Mastering)

Alles ist bereits modular aufgebaut und kann als API exponiert werden.
