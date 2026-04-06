# KoalaTree Video Engine — Hybrid Pipeline Architecture

## Vision

Jede KoalaTree-Geschichte wird automatisch zu einem vollstaendigen Zeichentrickfilm. Die Charaktere sprechen mit ihren eigenen Stimmen, bewegen sich in animierten Szenen, und die Geschichte wird visuell erzaehlt — komplett AI-generiert.

## Hybrid-Toolkit (finalisiert)

| Rolle | Tool | Warum dieses Tool |
|-------|------|-------------------|
| **Stimmen + SFX** | ElevenLabs | 7 Custom Character-Voices, Multi-Voice Stories, Sound-Effekte. Nicht ersetzbar. |
| **Lip-Sync Talking Heads** | Hedra Character-3 | Bestes Lip-Sync fuer illustrierte/Cartoon-Charaktere. Portrait + Audio → sprechendes Video. |
| **Szenen & Landschaften** | Kling 3.0 | Image-to-Video, Multi-Shot (6 Cuts), Character-Konsistenz, guenstig ($0.14/Clip). |
| **Regie & Szenen-Analyse** | Claude API | Parst Story-Text → Szenen, Kamerawinkel, Emotionen, Locations. Steuert die Pipeline. |
| **Zusammenschnitt** | ffmpeg / Remotion | Concat, Transitions, Musik-Overlay, Fades. Kostenlos. |
| **Ambient mit nativem Ton** | Veo 3 Lite (optional) | Naturszenen mit echtem Audio (Wald, Meer, Wind). $0.05/s. Spaeter integrieren. |

## Pipeline-Architektur

```
Geschichte (Text mit [KODA], [KIKI] etc.)
  │
  ▼
┌─────────────────────────────────────────────┐
│  1. REGIE (Claude API)                      │
│  Story-Text → Szenen-Liste:                 │
│  [{                                         │
│    type: "dialog" | "scene" | "transition", │
│    character: "koda",                       │
│    text: "Was Koda sagt",                   │
│    location: "unter dem KoalaTree",         │
│    mood: "warm, abendlich",                 │
│    camera: "close-up" | "wide" | "pan",     │
│    duration_hint: 8                         │
│  }]                                         │
└─────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────┐
│  2. AUDIO (ElevenLabs — haben wir schon)    │
│  Pro Dialog-Szene:                          │
│  - Character Voice generiert Audio-Segment  │
│  - SFX fuer Szenen-Uebergaenge             │
│  - Ambient-Sounds (Wald, Nacht, etc.)      │
│  Output: audio_segments/ + timeline.json    │
└─────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────┐
│  3. VIDEO-GENERIERUNG (parallel)            │
│                                             │
│  Dialog-Szenen → Hedra Character-3          │
│    Portrait + Audio-Segment → Lip-Sync MP4  │
│                                             │
│  Landschafts-Szenen → Kling 3.0             │
│    Illustration + Prompt → Animiertes MP4   │
│    (KoalaTree bei Nacht, Meer, Berge...)   │
│                                             │
│  Transitions → Kling 3.0                    │
│    Kamera-Schwenk, Zoom, Ueberblendung     │
│                                             │
│  Optional: Ambient → Veo 3 Lite             │
│    Naturszene mit nativem Audio             │
└─────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────┐
│  4. ZUSAMMENSCHNITT (ffmpeg)                │
│  - Intro-Jingle (KoalaTree Melodie)         │
│  - Szenen in Reihenfolge                    │
│  - Audio unter Video legen                  │
│  - Crossfade-Transitions                    │
│  - Background-Musik (leise unter Dialogen)  │
│  - Outro                                    │
│  Output: koalatree-film.mp4                 │
└─────────────────────────────────────────────┘
  │
  ▼
  Upload → Vercel Blob → Abspielen / Download
```

## Kosten pro Film

| Komponente | Menge | Kosten |
|-----------|-------|--------|
| ElevenLabs Audio | ~5 Min Story | ~$2 (bereits im Plan) |
| Hedra Lip-Sync | ~15 Dialog-Clips | ~$15 |
| Kling Szenen | ~10 Landscape-Clips | ~$1.50 |
| Claude Regie | 1 API Call | ~$0.10 |
| ffmpeg Concat | Lokal | $0 |
| **Gesamt** | | **~$19 pro Film** |

## Bestehende Infrastruktur (wiederverwenden)

| Datei | Was es tut | Status |
|-------|-----------|--------|
| `lib/elevenlabs.ts` | Multi-Voice Audio + SFX + Mixing | ✅ Production |
| `lib/story-parser.ts` | [KODA]/[KIKI] Marker → Segmente | ✅ Production |
| `lib/hedra.ts` | Hedra API (Character-3 + Kling) | ✅ Implementiert |
| `lib/prompts.ts` | Story-Generierung Prompts | ✅ Production |
| `app/api/admin/marketing-video/` | Video-Generierung Admin API | ✅ Implementiert |
| `app/api/video/marketing/` | Video Serve Endpoint | ✅ Implementiert |
| `app/components/StudioVideos.tsx` | Studio Video-Galerie | ✅ Implementiert |

## Noch zu bauen

| Datei | Was es tut |
|-------|-----------|
| `lib/video-pipeline.ts` | Orchestriert die gesamte Pipeline |
| `lib/video-director.ts` | Claude-basierte Szenen-Analyse |
| `lib/kling.ts` | Kling 3.0 API Client (Image-to-Video) |
| `app/api/admin/generate-film/` | Film-Generierung API Endpoint |
| `scripts/create-trailer.mjs` | Lokales ffmpeg Zusammenschnitt-Script |

## User bewertet eigene Engine

Der User hat eine eigene Engine im Auge. Dieses Dokument dient als Referenz-Architektur fuer die Integration — unabhaengig davon welche Engine/Platform letztlich den Zusammenschnitt uebernimmt.
