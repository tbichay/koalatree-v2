# KoalaTree Engine — Status & Offene Todos

Stand: 12. April 2026

## Was funktioniert (End-to-End Pipeline)

1. ✅ Story eingeben (Text / AI generieren / Upload)
2. ✅ Drehbuch generieren (7 Regie-Stile, 3 Modi, Audio-Tags fuer Emotionen)
3. ✅ Visual Style waehlen (Realistisch, Disney, Pixar, Ghibli, etc.)
4. ✅ Charaktere extrahieren + Actors casten (VOR Drehbuch)
5. ✅ Per-Szene Audio (Dialog TTS + SFX + Ambience — per-scene API)
6. ✅ Clips generieren (Kling 3.0 Pro — Avatar + I2V, kamera-basiert)
7. ✅ Film Assembly (Remotion Lambda, Multi-Track Audio, Videos muted)
8. ✅ Digital Actors (Portrait, Character Sheet, Voice aus Library)
9. ✅ Voice Library (35+ Stimmen, Emotion-Tester, Shared Voice Browser 1000+)
10. ✅ Asset Library (7 Kategorien: Actors, Voices, Locations, Props, Landscapes, Music, Clips)
11. ✅ Design System (Sheet, Field, Card, Badge, ImageSlot, AudioPreview etc.)
12. ✅ LibraryPicker (Modal fuer Asset-Auswahl ueberall im Workflow)
13. ✅ Background Task Queue + Server-Side Tracking
14. ✅ Audio Timeline Player (Web Audio API, 3 Spuren synchron)
15. ✅ Expandierbares Drehbuch (Szenen-Details: Dialog, Kamera, Emotion, SFX)
16. ✅ Emotionales TTS (Audio-Tags: [laughing], [whispering], [screaming] etc.)
17. ✅ Format-Auswahl (Portrait 9:16, Wide 16:9, Cinema 2.39:1)
18. ✅ Film-Laenge Auswahl (20s Reel bis 20min)
19. ✅ Kamera-basierte Clip-Strategie (close-up=Lip-Sync, wide=Gruppe)
20. ✅ Actor Traits + Outfit + Voice Description
21. ✅ Character ID Mapping (Screenplay char-N → echte DB-IDs)
22. ✅ Prompt Auto-Tuning (Quality Feedback → verbesserte Prompts)
23. ✅ Kling negative_prompt (kein Text/Subtitles in Videos)
24. ✅ Per-Scene Audio Generation (vermeidet Vercel Timeout)
25. ✅ Audio-Video Sync (Audio-Dauer ist Master fuer Film-Timing)
26. ✅ Visuelles Storyboard (pro Szene ein Bild VOR Clip-Generierung)
27. ✅ Locations Library (Drehorte/Sets erstellen + im Drehbuch referenzieren)
28. ✅ Kling O3 (Omni) Integration (laengere Clips bis 15s, multi_prompt)
29. ✅ Fertige Filme in Library speichern (nach Assembly)
30. ✅ Drehbuch mit Location-Kontext (AI referenziert Location-Details)
31. ✅ Props Library (Requisiten/Objekte generieren + als Kling Elements binden)
32. ✅ Costumes pro Sequenz (Outfit-Override pro Actor pro Sequenz)
33. ✅ Drehbuch mit Props-Kontext (AI referenziert Props in Szenen)
34. ✅ Kamera-Motion UI (Dropdown pro Szene: Static, Pan, Dolly, Tracking, Zoom, Rotation)
35. ✅ Credits/Abspann im Film (editierbarer Abspann mit Scroll-Effekt)
36. ✅ Export-Format Presets (Portrait/TikTok, Wide/YouTube, Cinema)
37. ✅ Musik-Integration (Auswahl aus Library + Volume-Regler + S3 Upload)

## Architektur

- Ein Repo, eine DB, zwei Domains (koalatree.io = Engine, koalatree.ai = Kids App)
- Vercel + Neon PostgreSQL + Vercel Blob (private)
- Remotion Lambda auf AWS fuer Film-Rendering
- ElevenLabs fuer TTS + SFX + Voice Library
- Kling 3.0 Pro (fal.ai) fuer Video-Clips + Lip-Sync
- GPT-Image-1.5 fuer Portraits + Landscapes
- Anthropic Claude fuer Text (Story, Drehbuch, Charakter-Extraktion)
- maxDuration: 800s fuer alle API-Routes

## Aktueller Workflow

```
1. Geschichte → 2. Locations/Sets erstellen (Library)
→ 3. Charaktere + Actor Casting → 4. Drehbuch (mit Location-Kontext)
→ 5. Visuelles Storyboard (Szenen-Frames) → 6. Audio (per-scene)
→ 7. Clips (Kling O3/3.0) → 8. Film Assembly → Film in Library
```

## NAECHSTER GROSSER SCHRITT: Studio 2.0

### Neuer Workflow (wie echter Film)

```
1. WELT BAUEN
   ├── Location/Set erstellen (Library: "Locations")
   ├── Props/Requisiten definieren (Library: "Props")
   └── Atmosphaere/Wetter/Tageszeit

2. CASTING
   ├── Actors aus Library waehlen
   ├── Costumes pro Sequenz definieren
   └── Voice Binding (Voice-Sample pro Actor → Kling)

3. DREHBUCH (mit Welt-Kontext!)
   ├── AI kennt Location + Props + Actors
   ├── Referenziert Set-Elemente ("lehnt am Felsen")
   └── Kamera-Anweisungen (Pan, Dolly, Close-Up)

4. VISUELLES STORYBOARD
   ├── Pro Szene ein generiertes Bild
   ├── User kann anpassen bevor Clips generiert werden
   └── Wird als Start-Frame fuer Clip-Generation verwendet

5. AUDIO
   ├── Dialog TTS mit Emotionen + Audio-Tags
   ├── SFX (nur Umgebung)
   ├── Ambience + Musik

6. CLIPS (Kling 3.0 Omni)
   ├── Multi-Shot Storyboard (bis 6 Shots pro Sequenz!)
   ├── Native Voice Binding → richtiger Character spricht
   ├── Props als Elements gebunden
   ├── Camera Motion Control
   └── Shot-Reverse-Shot fuer Dialoge

7. POST-PRODUCTION
   ├── Film in Library speichern
   ├── Musik-Layer
   └── Titel/Credits
```

### Kern-Innovation: Kling 3.0 Omni
- Multi-Shot Storyboard (2-6 Shots in einem Video)
- Native Voice Binding pro Character
- Shot-Reverse-Shot fuer Dialoge automatisch
- Bis zu 3 Elements gleichzeitig (Character + Prop + Scene)
- Camera Motion Control (Pan, Tilt, Dolly, Zoom)

### Neue Library-Kategorien
- Locations/Sets (mit Style + Atmosphaere)
- Props/Requisiten (Objekte, Fahrzeuge, etc.)
- Costumes (pro Actor pro Sequenz)
- Fertige Filme (nach Assembly)

### Offene Punkte
- [x] Props Library (Requisiten/Objekte als Kling Object Elements)
- [x] Costumes pro Sequenz (Actor-Outfit ueberschreibbar pro Szene)
- [ ] Kling O3 Multi-Shot voice_binding (Sprecher-Zuweisung in Multi-Shot)
- [ ] Blob Cleanup (alte Dateien aufraeumen, Storage-Management)
- [ ] Musik-Integration (Upload + AI-Generierung + Lautstaerke-Regler)
- [ ] Musikvideo-Modus (Characters tanzen/singen)
- [ ] Post-Production (Color Grading, Titel, Credits)
- [ ] Export-Optionen (Qualitaet, Format, Social Media Presets)
- [x] Kamera-Motion UI (Presets pro Szene: Pan, Dolly, Tracking)
- [ ] Route Groups Refactor (Engine/Kids/Shared)
- [ ] Landing Page + Logo fuer koalatree.io

## Kosten pro Film (geschaetzt, Stand April 2026)

| Typ | Kosten |
|-----|--------|
| Kurzer Film (7 Clips, 30s) | ~$5-8 |
| Mittlerer Film (15 Clips, 1min) | ~$10-15 |
| Langer Film (30+ Clips, 5min) | ~$25-40 |
| Portrait generieren | ~$0.08 (GPT-Image-1.5) |
| Landscape generieren | ~$0.08 |
| Audio pro Szene (TTS) | ~$0.01-0.03 |
| SFX pro Szene | ~$0.01 |
| Clip (Kling 3.0 Pro) | ~$0.60 Dialog / ~$0.40 Landscape |
| Film Assembly (Remotion Lambda) | ~$0.05 |
