# Film Pipeline V2 — Ausfuehrliches Konzept

> Von Text zu fertigem Multi-Sequenz-Film. Generisch, mehrsprachig, vollautomatisch.

---

## 1. Der neue Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ SCHRITT 1: GESCHICHTE                                           │
│                                                                  │
│ Option A: AI generiert Geschichte (mit Profil, Ziel, Format)    │
│ Option B: User laedt eigenen Text hoch                          │
│ Option C: User tippt/pastet Text                                │
│                                                                  │
│ Ergebnis: Story-Text mit Charakter-Markern                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ SCHRITT 2: DREHBUCH (Screenplay)                                │
│                                                                  │
│ AI analysiert Geschichte und erstellt:                           │
│ ┌─────────────────────────────────────┐                         │
│ │ Akt 1: Einfuehrung                  │                         │
│ │  ├─ Sequenz 1: KoalaTree (Golden)   │                         │
│ │  │   ├─ Szene 1: Establishing       │                         │
│ │  │   ├─ Szene 2: Koda stellt vor    │                         │
│ │  │   └─ Szene 3: Kiki kommt dazu    │                         │
│ │  └─ Sequenz 2: Am Meer             │                         │
│ │      ├─ Szene 4: Ortswechsel        │                         │
│ │      ├─ Szene 5: Geschichte am Meer  │                         │
│ │      └─ Szene 6: Rueckkehr          │                         │
│ │ Akt 2: Hauptteil                     │                         │
│ │  └─ Sequenz 3: KoalaTree (Nacht)    │                         │
│ │      └─ ...                          │                         │
│ └─────────────────────────────────────┘                         │
│                                                                  │
│ Pro Sequenz definiert:                                           │
│ - Ort/Location + Referenzbild                                   │
│ - Atmosphaere/Licht                                             │
│ - Regie-Stil                                                    │
│ - Beteiligte Charaktere                                          │
│                                                                  │
│ User reviewed + passt an                                         │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ SCHRITT 3: CHARAKTERE & ASSETS                                   │
│                                                                  │
│ AI extrahiert Charaktere aus dem Drehbuch:                       │
│ - Koda (Hauptrolle): Referenzbild, Stimme, Beschreibung        │
│ - Kiki (Nebenrolle): Referenzbild, Stimme, Beschreibung        │
│ - Neue Krabbe (nur Sequenz 2): Referenzbild, Stimme            │
│                                                                  │
│ User kann:                                                       │
│ - Referenzbilder hochladen oder generieren                      │
│ - Stimme aus Bibliothek waehlen oder eigene hochladen           │
│ - Charakter-Beschreibung anpassen                               │
│ - Film-Stil waehlen (2D Disney, 3D Pixar, Anime, Real, Custom) │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ SCHRITT 4: AUDIO PRO SEQUENZ                                    │
│                                                                  │
│ Audio wird NACH dem Drehbuch generiert (nicht davor!)            │
│ Pro Sequenz:                                                     │
│ - Multi-Voice TTS mit den zugewiesenen Stimmen                  │
│ - SFX passend zum Ort (Wellen am Meer, Wind im Baum)           │
│ - Ambience passend zur Atmosphaere                               │
│ - Pausen wo das Drehbuch Landscape-Szenen vorsieht             │
│                                                                  │
│ Ergebnis: Audio + Timeline pro Sequenz                          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ SCHRITT 5: VIDEO-CLIPS PRO SEQUENZ                               │
│                                                                  │
│ Wie jetzt, aber pro Sequenz:                                    │
│ - Landscape-Clips mit Sequenz-Referenzbild                      │
│ - Dialog-Clips mit Charakter-Portraits                          │
│ - Frame-Chaining innerhalb der Sequenz                          │
│ - Uebergaenge (flow/cut/zoom-to-character)                      │
│                                                                  │
│ "Alle generieren" mit Stop-Button pro Sequenz                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ SCHRITT 6: SEQUENZ-MASTERING                                     │
│                                                                  │
│ Pro Sequenz: Clips + Audio + Crossfades → Sequenz-Film          │
│ Remotion Lambda rendert jede Sequenz einzeln                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ SCHRITT 7: GESAMTFILM                                            │
│                                                                  │
│ Alle Sequenz-Filme zusammenschneiden:                           │
│ - Intro/Titel                                                    │
│ - Sequenz 1 → Uebergang → Sequenz 2 → Uebergang → Sequenz 3   │
│ - Outro/Abspann                                                  │
│ - Durchgehende Hintergrundmusik                                  │
│                                                                  │
│ Ergebnis: Fertiger Film                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Datenmodell

### Neue Modelle (Prisma)

```prisma
// Ein Film-Projekt (Container fuer alles)
model FilmProject {
  id              String      @id @default(cuid())
  userId          String
  name            String
  description     String?
  storyText       String?     // Volltext der Geschichte
  storySource     String?     // "generated" | "uploaded" | "typed"
  stylePrompt     String?     // Film-Stil (2D Disney, Pixar, Anime...)
  language        String      @default("de")
  status          String      @default("draft") // draft, screenplay, production, completed
  
  screenplay      Json?       // Das Drehbuch (Akte → Sequenzen → Szenen)
  
  characters      FilmCharacter[]
  sequences       FilmSequence[]
  
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

// Ein Charakter im Film
model FilmCharacter {
  id              String      @id @default(cuid())
  projectId       String
  project         FilmProject @relation(fields: [projectId], references: [id])
  
  name            String      // "Koda"
  description     String      // Visuelle Beschreibung
  personality     String?     // Persoenlichkeits-Beschreibung
  portraitUrl     String?     // Referenzbild URL
  voiceId         String?     // ElevenLabs Voice ID
  voiceSettings   Json?       // Stability, Style, Speed etc.
  markerId        String      // "[KODA]" — Marker im Story-Text
  
  createdAt       DateTime    @default(now())
}

// Eine Sequenz (= gleicher Ort, gleiches Licht)
model FilmSequence {
  id              String      @id @default(cuid())
  projectId       String
  project         FilmProject @relation(fields: [projectId], references: [id])
  
  orderIndex      Int         // Position im Film
  name            String      // "Am KoalaTree"
  location        String      // Orts-Beschreibung
  atmosphereId    String?     // Preset-ID oder "custom"
  atmosphereText  String?     // Licht/Stimmungs-Prompt
  directingStyle  String?     // Regie-Stil ID
  landscapeRef    String?     // Referenzbild fuer den Ort
  
  storySegment    String?     // Der Teil der Geschichte fuer diese Sequenz
  scenes          Json?       // FilmScene[] (wie jetzt filmScenes)
  audioUrl        String?     // Generiertes Audio fuer diese Sequenz
  timeline        Json?       // Audio-Timeline
  videoUrl        String?     // Gerenderte Sequenz (Mastering)
  
  status          String      @default("draft") // draft, audio, clips, mastered
  
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}
```

### Migration von bestehendem Modell

Das bestehende `Geschichte` + `filmScenes` Modell bleibt fuer den aktuellen Workflow (V1). Der neue Workflow nutzt `FilmProject` + `FilmSequence`. Migration:
- V1 Geschichte mit filmScenes = 1 FilmProject mit 1 FilmSequence
- V2 Projekte nutzen das neue Modell von Anfang an

---

## 3. Mehrsprachigkeit (mitgedacht, nicht sofort gebaut)

Architektur-Entscheidungen:
- `FilmProject.language` bestimmt die Sprache
- Charakter-Stimmen sind pro Sprache (verschiedene voiceIds)
- Video-Clips sind sprachunabhaengig (Lip-Sync passt sich an Audio an)
- Ein Projekt kann "dupliziert" werden mit anderer Sprache → gleiche Clips, neues Audio

### Spaeterer Workflow:
1. Film in Deutsch erstellen (komplett)
2. "Sprachversion erstellen" → kopiert Projekt, aendert Sprache
3. Neues Audio in Englisch generieren (gleiche Szenen/Timing)
4. Lip-Sync neu generieren (oder: gleiche Videos mit neuem Audio-Overlay)
5. Mastering mit neuem Audio

---

## 4. Charakter-Wizard

### UI-Flow:

```
┌─────────────────────────────────┐
│ Neuer Charakter                  │
│                                  │
│ Name: [___________]              │
│ Marker: [KODA]                  │
│                                  │
│ Beschreibung:                    │
│ [Ein alter weiser Koala mit     │
│  goldener Brille auf einem      │
│  dicken Eukalyptus-Ast...]      │
│                                  │
│ Referenzbild:                    │
│ [📸 Hochladen] [🎨 Generieren]  │
│ [Vorschau des Bildes]           │
│                                  │
│ Stimme:                          │
│ [🎤 Aus Bibliothek] [⬆️ Custom] │
│ [▶ Vorhoeren]                   │
│                                  │
│ Persoenlichkeit:                 │
│ [Weise, ruhig, grossvaeterlich] │
│ Sprechstil: [Langsam, bedacht]  │
│                                  │
│ [Speichern]                      │
└─────────────────────────────────┘
```

### Charakter aus Geschichte extrahieren:

Wenn die Geschichte `[KODA]`, `[KIKI]` etc. enthaelt, extrahiert die AI automatisch die Charaktere:
1. Marker finden: `[KODA]`, `[KIKI]`, `[LUNA]` etc.
2. AI analysiert die Geschichte: Was sagt der Charakter? Wie wird er beschrieben?
3. Vorschlag: Name, Beschreibung, Persoenlichkeit, Sprechstil
4. User reviewed und ergaenzt Referenzbild + Stimme

---

## 5. Drehbuch-Generator (Screenplay)

### Input:
- Geschichte (Text mit Charakter-Markern)
- Charaktere (mit Beschreibungen)
- Film-Stil
- Ziel-Laenge

### Output (Drehbuch-Struktur):
```typescript
interface Screenplay {
  title: string;
  acts: Act[];
  totalDurationEstimate: number; // Sekunden
}

interface Act {
  name: string;         // "Einfuehrung", "Hauptteil", "Aufloesung"
  sequences: Sequence[];
}

interface Sequence {
  name: string;         // "Am KoalaTree"
  location: string;     // "Riesiger magischer Eukalyptusbaum bei Sonnenuntergang"
  atmosphere: string;   // "Warmes goldenes Abendlicht..."
  directingStyle: string; // "pixar-classic"
  characters: string[]; // ["koda", "kiki"]
  storySegment: string; // Teil der Geschichte
  scenes: FilmScene[];  // Wie jetzt
}
```

### AI-Analyse:
1. **Ort-Erkennung**: AI findet Ortswechsel in der Geschichte ("Am naechsten Tag am Strand...")
2. **Sequenz-Aufteilung**: Geschichte wird in Sequenzen geteilt (gleicher Ort = gleiche Sequenz)
3. **Szenen-Planung**: Pro Sequenz die Szenen wie jetzt (mit Regie-Stil)
4. **Timing**: Audio-Dauer geschaetzt basierend auf Wortanzahl

---

## 6. Audio-Generierung V2 (Storyboard-First)

### Aktuell (V1):
Geschichte → Audio → Storyboard → Clips
(Audio wird blind generiert, Storyboard muss sich anpassen)

### Neu (V2):
Geschichte → Drehbuch → Audio pro Sequenz → Clips
(Audio wird passend zum Drehbuch generiert)

### Vorteile:
- Pausen genau dort wo Landscape-Szenen geplant sind
- SFX passend zum Ort der Sequenz (Wellen am Meer, nicht Wald-Voegel)
- Ambience angepasst an Atmosphaere
- Laengere Stille vor Charakter-Einfuehrungen
- Audio-Dauer passt zur geplanten Szenen-Dauer

### Technisch:
Pro Sequenz:
1. Extrahiere den Story-Text-Abschnitt
2. Fuege [PAUSE] Marker ein wo das Drehbuch Landscape-Szenen plant
3. Generiere Audio mit ElevenLabs (Multi-Voice)
4. Speichere Audio + Timeline pro Sequenz

---

## 7. UI-Konzept: Film Studio V2

### Haupt-Navigation:

```
┌──────────────────────────────────────────────────────┐
│ Film Studio                                            │
│                                                        │
│ [Geschichte] [Drehbuch] [Charaktere] [Produktion]     │
└──────────────────────────────────────────────────────┘
```

### Tab 1: Geschichte
- Text eingeben, hochladen oder generieren lassen
- Sprache waehlen
- Charakter-Marker setzen

### Tab 2: Drehbuch
- AI-generiertes Drehbuch mit Akte → Sequenzen → Szenen
- Visuell: Swimlane-Ansicht (jede Sequenz als Bahn)
- Pro Sequenz: Ort, Licht, Regie-Stil einstellbar
- Szenen verschieben, einfuegen, loeschen
- "Drehbuch generieren" Button

### Tab 3: Charaktere
- Charakter-Wizard (aus Geschichte extrahiert)
- Referenzbilder verwalten
- Stimmen zuweisen + vorhoeren
- Film-Stil global setzen

### Tab 4: Produktion
- Pro Sequenz: Audio generieren → Clips generieren → Mastern
- Gesamt-Timeline ueber alle Sequenzen
- "Alles generieren" mit Stop + Kosten-Tracking
- Fertiger Film abspielen + teilen

---

## 8. API-Design (fuer Story-to-Film Engine)

```typescript
// Einfachster API-Call:
POST /api/v1/create-film
{
  text: "Es war einmal...",
  style: "disney-2d",
  language: "de",
  atmosphere: "golden-hour",
  directingStyle: "pixar-classic",
  characters: [
    { name: "Fuchs", markerId: "[FUCHS]", voiceId: "..." }
  ]
}

// Response:
{ projectId: "abc123", status: "processing" }

// Polling:
GET /api/v1/films/abc123/status
{
  status: "production",
  progress: {
    screenplay: "completed",
    characters: "completed",
    audio: { total: 3, completed: 2 },
    clips: { total: 25, completed: 12 },
    mastering: "pending"
  },
  estimatedCost: "$8.50",
  currentCost: "$4.20"
}
```

---

## 9. Modulare Architektur

### Neue Dateien/Module:

```
lib/
  film-project/
    screenplay-generator.ts   # Geschichte → Drehbuch (Akte, Sequenzen)
    character-extractor.ts     # Geschichte → Charaktere
    sequence-audio.ts          # Audio pro Sequenz (mit Drehbuch-Pausen)
    sequence-renderer.ts       # Clips pro Sequenz
    film-assembler.ts          # Sequenzen → Gesamtfilm

app/
  studio/
    film-v2/
      page.tsx                 # Haupt-Layout mit Tabs
      story/page.tsx           # Geschichte Tab
      screenplay/page.tsx      # Drehbuch Tab  
      characters/page.tsx      # Charakter-Wizard
      production/page.tsx      # Produktion Tab

  api/
    v1/
      create-film/route.ts     # Public API
      films/[id]/
        status/route.ts        # Status-Polling
        
    admin/
      film-v2/
        screenplay/route.ts    # Drehbuch generieren
        characters/route.ts    # Charaktere extrahieren
        sequence-audio/route.ts # Audio pro Sequenz
```

### Bestehendes wiederverwenden:
- `lib/elevenlabs.ts` — Audio-Generierung (erweitern fuer pro-Sequenz)
- `lib/fal.ts` — Video-Generierung (unveraendert)
- `lib/hedra.ts` — Hedra API (Fallback, unveraendert)
- `lib/audio-segment.ts` — MP3-Segmentierung (unveraendert)
- `lib/references.ts` — Referenzbild-System (erweitern fuer Charakter-Refs)
- `lib/film-render.ts` — Remotion Lambda (erweitern fuer Multi-Sequenz)
- `lib/directing-styles.ts` — Regie-Stile (erweitern, nicht aendern)
- `lib/video-director.ts` — AI Director (erweitern fuer Sequenz-Input)

---

## 10. Implementierungs-Reihenfolge

### Phase 1: Datenmodell + Drehbuch
1. Prisma Schema: FilmProject, FilmCharacter, FilmSequence
2. Screenplay-Generator: Geschichte → Akte → Sequenzen
3. Drehbuch-UI: Anzeige + Bearbeitung

### Phase 2: Charakter-System
4. Character-Extractor: Geschichte → Charakter-Vorschlaege
5. Charakter-Wizard UI
6. Referenzbild + Stimm-Integration

### Phase 3: Sequenz-basierte Produktion
7. Audio pro Sequenz (mit Drehbuch-Pausen)
8. Clips pro Sequenz (wie jetzt, aber Sequenz-aware)
9. Sequenz-Mastering

### Phase 4: Gesamtfilm
10. Film-Assembler: Sequenzen zusammenschneiden
11. Intro/Outro
12. Gesamt-Mastering

### Phase 5: API
13. Public API: POST /api/v1/create-film
14. Status-Polling
15. Webhook-Notifications

---

## 11. Offene Fragen / Entscheidungen

1. **Sequenz-Uebergaenge**: Wie ueberblenden wir zwischen Sequenzen?
   - Hard Cut mit Fade-to-Black?
   - Visueller Uebergang (Wolken, Blaetter, Wasser)?
   - Text-Einblendung ("Drei Tage spaeter...")?

2. **Kosten-Kontrolle**: Soll es ein Budget-Limit pro Film geben?
   - "Stoppe wenn $X erreicht"
   - Kosten-Schaetzung VOR dem Start

3. **Versionen**: Soll man mehrere Versionen eines Films behalten?
   - Version 1: Standard-Qualitaet
   - Version 2: Premium neu gerendert
   - Oder: nur die aktuelle Version

4. **Kollaboration**: Spaeter mehrere User an einem Film?
   - Regisseur, Cutter, Sprecher
   - Oder: Single-User erstmal
