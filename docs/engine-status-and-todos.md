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
15. ✅ Actor/Library Redesign (Casting, Snapshots, Versionen, Character Sheet)
16. ✅ Format-Auswahl (Portrait 9:16, Wide 16:9, Cinema 2.39:1)
17. ✅ Actor Traits + Outfit (persistente Eigenschaften in jedem Prompt)
18. ✅ Voice Settings (Stability, Similarity, Expression, Speed Regler)
19. ✅ Character ID Mapping (Screenplay char-N → echte DB-IDs)
21. ✅ Background Task Queue (StudioTask Model, Cron Worker, Tasks-Seite)
22. ✅ AI Quality Check (Claude Vision fuer Clips/Portraits, auto-retry)
23. ✅ Background Generation UI (Audio + Clips im Hintergrund)
20. ✅ Dialog Audio Preview pro Szene

## Actor/Library System (NEU — 11. April 2026)

### Konzept
- Actors = primaere Charakter-Einheit (Portrait + Stimme + Style + Outfit + Traits)
- Casting: Actor → Character mit Snapshot-Versionierung
- Re-Sync: Actor aendern → neuen Snapshot erstellen → alte Version erhalten
- Versionen-Switch im Engine (Dropdown mit Zeitstempeln)

### Datenmodell
- `DigitalActor`: name, description, voiceId, voiceSettings, portraitAssetId, style, outfit, traits, characterSheet
- `StudioCharacter.actorId` FK mit onDelete: SetNull
- `castSnapshot` + `castHistory` fuer Versionen
- Character Sheet: { front, profile, fullBody } als JSON

### Casting-Flow
1. Actor casten → Description, Voice, Portrait werden als Snapshot kopiert
2. Audio generieren → Actor-Stimmen werden verwendet
3. Clips generieren → Actor-Description + Outfit + Traits im Prompt
4. Re-Sync: alter Snapshot → History, neuer wird aktiv

### Bekannte Limitationen
- Character Sheet Generation nacheinander (nicht parallel, wegen Race Condition)
- Casting ueberschreibt Character-Description (gewollt)
- Drehbuch-Szenen-Beschreibungen bleiben beim Original, nur Clip-Prompts nutzen Actor-Daten

## Architektur-Entscheidungen

- Ein Repo, eine DB, zwei Domains
- Vercel + Neon PostgreSQL + Vercel Blob (private)
- Remotion Lambda auf AWS fuer Film-Rendering
- ElevenLabs fuer TTS + SFX + Voice Design
- fal.ai fuer Video (Seedance, Kling) + Frame Extraction
- Google AI fuer Video (Veo 3.1) + Landscape
- OpenAI fuer Bild-Generierung (GPT Image 1)
- Anthropic Claude fuer Text (Story, Drehbuch, Charakter-Extraktion)
- maxDuration: 800s fuer alle API-Routes (Vercel Pro)

## Kritische Bugs

- [x] Actor Voice + Portrait generieren — gefixt (ElevenLabs min 100 chars, blob URL statt asset ID)
- [x] Actor editieren/loeschen — gefixt (Delete mit Confirmation, Style/Outfit/Traits Edit)
- [x] Character IDs im Drehbuch — gefixt (char-N → echte DB-IDs gemappt)
- [x] Actor-Stimmen im Audio — gefixt (Character-ID Mapping war broken)
- [ ] Session Timeout waehrend langer Generierungen (30 Tage gesetzt aber evtl. Cookie-Problem)
- [ ] Portrait Upload im Charakter-Tab funktioniert nicht zuverlaessig
- [ ] Spinner Animation manchmal kaputt im Engine Theme

## Grosse Architektur-Todos

### 1. Route Groups Refactor (WICHTIG)
```
app/(kids)/    ← Kids App Layout (gruen, Sidebar, Mobile)
app/(engine)/  ← Engine Layout (dark, Sidebar, Desktop)
app/(shared)/  ← Auth, Legal, etc.
```
Aktuell: Domain-Detection in Providers.tsx + CSS Overrides. Fragil.

### 2. Audio-Qualitaet verbessern
- ElevenLabs Video-to-Sound fuer automatische SFX
- Bessere Ambience (laengere Loops, mehrere Schichten)
- Musik-Integration (Hintergrundmusik pro Sequenz)
- Audio-Preview vor Film-Rendering

### 3. Video-Qualitaet verbessern
- Prompt Engineering: Noch detailliertere Szenen-Beschreibungen
- Character Consistency: Multi-Reference Images an Seedance 2.0
- Uebergaenge: Start+End Frame Anchoring konsequent nutzen
- LoRA Character Training (Zukunft)

### 4. Background Generation Queue
- Serverseitig, Seite verlassen moeglich
- Jederzeit stoppbar
- Fuer ALLE AI-Operationen (Clips, Audio, Story, Landscape, Portraits)

## UX/UI Todos

- [ ] Cookie-Banner: Engine-spezifisches Design
- [ ] Login/Sign-Up: Engine-Theme wenn von koalatree.io
- [ ] Engine Landing Page: Film-Teaser Videos
- [ ] Logo + Favicon fuer koalatree.io
- [ ] GLOBAL: Besseres AI-Feedback (Progress-Bar, geschaetzte Dauer)
- [x] Neues Projekt: Name als Placeholder (gefixt)
- [ ] Preview-Player: Clips nacheinander abspielen (Uebergangs-Check)
- [x] Charakter-Tab: Portraits groesser (gefixt)
- [x] Visual Style schon beim Drehbuch (eingebaut)
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
