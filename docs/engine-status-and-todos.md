# KoalaTree Engine — Status & Offene Todos

Stand: 11. April 2026

## Was funktioniert (End-to-End Pipeline)

1. ✅ Story eingeben (Text / AI generieren / Upload)
2. ✅ Drehbuch generieren (7 Regie-Stile, 3 Modi: Film/Hoerspiel/Hoerbuch)
3. ✅ Visual Style waehlen (Realistisch, Disney, Pixar, Ghibli, etc.)
4. ✅ Charaktere extrahieren (Auto-Voice-Assignment)
5. ✅ Per-Szene Audio (Dialog TTS + SFX + Ambience — NEU)
6. ✅ Landscape generieren (AI + Upload, style-aware)
7. ✅ Clips generieren (Veo 3.1 Lite, Seedance 2.0, Kling — pro Szene)
8. ✅ Film Assembly (Remotion Lambda, Multi-Track Audio)
9. ✅ Digital Actors (Voice Design, Portrait, Casting)
10. ✅ Asset Library (Portraits, Landscapes, Clips, Sounds, Actors)
11. ✅ Prompt Library (22 Blocks, Composer, DB-basiert)
12. ✅ AI Model Registry (13 Modelle mit Pricing)
13. ✅ Domain Routing (koalatree.io = Engine, koalatree.ai = Kids App)
14. ✅ Engine Dark Theme

## Architektur-Entscheidungen

- Ein Repo, eine DB, zwei Domains
- Vercel + Neon PostgreSQL + Vercel Blob (private)
- Remotion Lambda auf AWS fuer Film-Rendering
- ElevenLabs fuer TTS + SFX + Voice Design
- fal.ai fuer Video (Seedance, Kling) + Frame Extraction
- Google AI fuer Video (Veo 3.1) + Landscape
- OpenAI fuer Bild-Generierung (GPT Image 1)
- Anthropic Claude fuer Text (Story, Drehbuch, Charakter-Extraktion)

## Kritische Bugs

- [ ] Actor Voice + Portrait generieren — `access: "public"` gefixt aber noch nicht getestet
- [ ] Actor editieren/loeschen fehlt in der UI
- [ ] Actor Style-Auswahl fehlt (realistisch/animiert)
- [ ] Session Timeout waehrend langer Generierungen (30 Tage gesetzt aber evtl. Cookie-Problem)
- [ ] AI Story-Generation auf koalatree.io funktioniert nicht (SSE/Auth Problem?)
- [ ] Portrait Upload im Charakter-Tab funktioniert nicht zuverlässig
- [ ] Spinner Animation manchmal kaputt im Engine Theme

## Grosse Architektur-Todos

### 1. Route Groups Refactor (WICHTIG)
```
app/(kids)/    ← Kids App Layout (gruen, Sidebar, Mobile)
app/(engine)/  ← Engine Layout (dark, Sidebar, Desktop)
app/(shared)/  ← Auth, Legal, etc.
```
Aktuell: Domain-Detection in Providers.tsx + CSS Overrides. Fragil.

### 2. Actor/Library Redesign (NAECHSTER SCHRITT)
Konzept fehlt noch — soll sauber durchdacht werden:
- Actors ERSETZEN Portraits als primaere Charakter-Einheit
- Actor = Portrait(s) + Stimme + Style + Tags
- Multi-Angle Character Sheet (Front, Profil, Ganzkoerper)
- Library als zentraler Hub: Generieren, Sortieren, Filtern, Verknuepfen
- Globale Library (pro Account) mit Tag-basierter Projekt-Verknuepfung
- Actor editieren, loeschen, Style waehlen
- "Aus Library casten" ueberall wo Charaktere gebraucht werden

### 3. Audio-Qualitaet verbessern
- ElevenLabs Video-to-Sound fuer automatische SFX
- Bessere Ambience (laengere Loops, mehrere Schichten)
- Musik-Integration (Hintergrundmusik pro Sequenz)
- Audio-Preview vor Film-Rendering

### 4. Video-Qualitaet verbessern
- Prompt Engineering: Noch detailliertere Szenen-Beschreibungen
- Character Consistency: Multi-Reference Images an Seedance 2.0
- Uebergaenge: Start+End Frame Anchoring konsequent nutzen
- LoRA Character Training (Zukunft)

### 5. Background Generation Queue
- Serverseitig, Seite verlassen moeglich
- Jederzeit stoppbar
- Fuer ALLE AI-Operationen (Clips, Audio, Story, Landscape, Portraits)

## UX/UI Todos

- [ ] Cookie-Banner: Engine-spezifisches Design
- [ ] Login/Sign-Up: Engine-Theme wenn von koalatree.io
- [ ] Engine Landing Page: Film-Teaser Videos
- [ ] Logo + Favicon fuer koalatree.io
- [ ] GLOBAL: Besseres AI-Feedback (Progress-Bar, geschaetzte Dauer)
- [ ] Neues Projekt: Name als Placeholder ✅ (gefixt)
- [ ] Preview-Player: Clips nacheinander abspielen (Uebergangs-Check)
- [ ] Charakter-Tab: Portraits groesser ✅ (gefixt)
- [ ] Visual Style schon beim Drehbuch ✅ (eingebaut)
- [ ] Modi erweitern: Hoerbuch+Cover, Musikvideo, Trailer
- [ ] Landscape: Vollbild-Ansicht + Library-Auswahl

## Provider-Stack (Optimal April 2026)

| Szene | Standard | Premium |
|-------|----------|---------|
| Dialog DE | Veo 3.1 Lite + Kling LipSync | Seedance 2.0 (nativer Lip-Sync) |
| Dialog EN | Veo 3.1 Lite + Kling LipSync | Veo 3.1 Fast (nativer Lip-Sync) |
| Landscape | Seedance 1.5 | Veo 3.1 Fast |

Fallback: Seedance 2.0 ↔ Veo ↔ Kling Avatar

## Kosten pro Film (geschaetzt)

| Typ | Kosten |
|-----|--------|
| Kurzer Film (7 Clips, 30s) | ~$3-5 Standard, ~$10-15 Premium |
| Mittlerer Film (15 Clips, 1min) | ~$7-10 Standard, ~$20-30 Premium |
| Portrait generieren | ~$0.04 |
| Landscape generieren | ~$0.04 |
| Audio pro Szene (TTS) | ~$0.01-0.03 |
| SFX pro Szene | ~$0.01 |
| Film Assembly (Remotion Lambda) | ~$0.01-0.05 |

## Vercel Gateway Migration (geplant)

Wenn Provider-Credits aufgebraucht → schrittweise auf Vercel AI Gateway umstellen.
Gleiche Kosten, aber: ein Key, Budget-Limits, Monitoring, einfacher fuer externe User.
