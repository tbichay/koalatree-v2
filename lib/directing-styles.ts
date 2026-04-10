/**
 * KoalaTree Directing Styles — Presets for the AI Director
 *
 * Each style defines camera behavior, transition rules, lighting,
 * character movement handling, and overall mood.
 * Injected into the Director's system prompt before storyboard generation.
 */

export interface DirectingStyle {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Injected into the Director system prompt */
  prompt: string;
}

export const DIRECTING_STYLES: Record<string, DirectingStyle> = {
  "pixar-classic": {
    id: "pixar-classic",
    name: "Pixar Classic",
    emoji: "🎬",
    description: "Warme Farben, weiches Abendlicht, sanfte Kamerabewegungen. Close-Ups bei Emotionen, Wide bei Staunen. Der Disney/Pixar Gold-Standard.",
    prompt: `## DEIN REGIE-STIL: Pixar Classic

### Licht & Farbe
- DURCHGEHEND warmes goldenes Abendlicht (Golden Hour) in JEDER Szene
- KEIN Lichtwechsel waehrend der Geschichte (kein Nacht, kein Morgen, kein Regen)
- Wiederhole die Lichtbeschreibung "warm golden sunset light" in JEDER sceneDescription
- Weiche Schatten, warme Farben, keine harten Kontraste

### Kamerafuehrung
- Close-Up (Kopf + Schultern) bei emotionalen Momenten und Dialog
- Medium Shot bei Koerpersprache und Gesten
- Wide Shot nur bei Staunen, Ehrfurcht oder der allerersten Establishing-Szene
- Kamerabewegungen sind IMMER sanft und langsam — nie ruckartig
- Depth-of-Field: Hintergrund leicht unscharf bei Close-Ups

### Charakter-Bewegung (WICHTIG!)
- Wenn ein Charakter sich bewegt (fliegt, huepft, rennt, klettert):
  → TRACKING SHOT: Die Kamera FOLGT dem Charakter
  → Der Hintergrund gleitet sanft vorbei
  → Der Charakter bleibt im Bildzentrum
  → Beschreibe: "Kamera folgt [Charakter] waehrend er/sie [Aktion], Aeste und Blaetter gleiten im Hintergrund vorbei"
- Wenn ein Charakter still sitzt und spricht:
  → Statische Kamera mit leichtem Drift (gentle camera drift)
  → Subtile Zoom-Bewegung bei emotionalen Hoehepunkten

### Uebergaenge
- Bevorzuge "flow" (fliessend) fuer die meisten Uebergaenge
- "zoom-to-character" bei jedem neuen Sprecher — die Szene endet mit CLOSE-UP
  (Kopf und Schultern, bereit fuer Dialog)
- "cut" (harter Schnitt) NUR bei grossem Ortswechsel
- Bei zoom-to-character: Beschreibe WIE die Kamera zum Charakter faehrt,
  nicht nur DASS sie es tut

### Charakter-Einfuehrung
Wenn ein Charakter zum ERSTEN Mal in der Geschichte erscheint:
1. landscape-Szene: Zeige den Ort wo der Charakter lebt/sitzt (3-5s)
2. zoom-to-character: Kamera naehert sich, endet im Close-Up
3. Der Charakter tut etwas Typisches BEVOR er spricht:
   - Koda: rueckt seine Brille zurecht, schaut weise
   - Kiki: flattert aufgeregt, landet auf einem Ast
   - Luna: oeffnet langsam die Augen, Mondlicht auf ihrem Gesicht
   - Mika: springt energisch ins Bild, Bandana flattert
   - Pip: taucht neugierig aus dem Wasser auf, Lupe in der Pfote
   - Sage: oeffnet meditierend ein Auge, laechelt sanft
   - Nuki: huepft tollpatschig ins Bild, faellt fast vom Ast
4. DANN erst der Dialog

### Multi-Charakter-Szenen
Wenn zwei oder mehr Charaktere gleichzeitig im Bild sind:
- Establishing Wide Shot: Zeige alle Beteiligten im Bild (1x am Anfang)
- Bei Dialog-Wechsel: Sanfter Kameraschwenk von Sprecher A zu Sprecher B
- Reaktion-Shots: Nach wichtigem Dialog, kurz (2s) Reaktion der anderen zeigen
- Beschreibe die Position: "Links Koda auf seinem Ast, rechts Kiki auf dem Nachbarast"

### Dramatik & Pacing
- Ruhiges Tempo — keine Hektik, aber auch keine Langeweile
- Musikale Momente: Bei Staunen/Freude die Kamera langsam zurueckziehen (zoom-out)
- Spannung: Bei Geheimnissen langsam ranzoomen (slow-zoom-in)
- Humor: Schneller Schnitt zu Reaktion (Koda verdreht die Augen bei Kikis Witz)`,
  },

  "long-take": {
    id: "long-take",
    name: "One Take",
    emoji: "🎥",
    description: "Minimale Schnitte, die Kamera fliesst kontinuierlich durch die Szene. Laengere Clips, immersives Erlebnis.",
    prompt: `## DEIN REGIE-STIL: Long Take / One-Shot

### Kernprinzip
Die Kamera schneidet SO WENIG WIE MOEGLICH. Stattdessen FLIESST sie durch die Szene.
Stell dir vor die Kamera ist ein Vogel der durch den KoalaTree fliegt und alles beobachtet.

### Licht & Farbe
- Durchgehend gleichmaessiges warmes Licht
- Keine Lichtwechsel — das wuerde den "One Take" Eindruck brechen

### Kamerafuehrung
- JEDE Szene: "Die Kamera gleitet weiter..." / "Die Kamera schwenkt zu..."
- Uebergaenge sind IMMER "flow" — KEINE "cut" Uebergaenge
- Wenn ein neuer Charakter spricht, SCHWENKT die Kamera zu ihm (nicht: Schnitt)
- Clips LAENGER machen (10-15s statt 5s) fuer das ununterbrochene Gefuehl
- Beschreibe die Kamerabewegung ALS FORTFUEHRUNG der vorherigen Szene

### Charakter-Bewegung
- Tracking Shot: Kamera folgt jedem Charakter der sich bewegt
- Die Kamera "entdeckt" Charaktere — sie kommen ins Bild waehrend die Kamera gleitet
- KEIN statisches Portrait — der Charakter ist immer in Bewegung (atmet, gestikuliert, schaut)

### Uebergaenge
- ALLE Uebergaenge sind "flow" oder "zoom-to-character"
- KEIN "cut" — auch nicht bei Ortswechsel
- Stattdessen: "Die Kamera gleitet den Stamm hinunter..." fuer Ortswechsel

### Szenen-Dauer
- Weniger Szenen, aber laenger (10-15s pro Szene)
- Maximal 15-20 Szenen fuer eine 8-Minuten Geschichte`,
  },

  "dramatic": {
    id: "dramatic",
    name: "Dramatisch",
    emoji: "🎭",
    description: "Starke Kontraste, viele Perspektivwechsel, Anticipation-Shots. Spannend und emotionaler.",
    prompt: `## DEIN REGIE-STIL: Dramatisch / Spielberg

### Kernprinzip
Jede Szene baut SPANNUNG auf. Zeige BEVOR etwas passiert WO es passieren wird.

### Licht & Farbe
- Durchgehend dramatisches warmes Licht mit laengeren Schatten
- Lichtreflexe auf Charakteren — "Rim Light" Effekt
- Etwas mehr Kontrast als bei Pixar Classic

### Kamerafuehrung
- VIELE Perspektivwechsel: close-up → wide → medium → close-up
- Schnelle Schnitte bei Action/Humor
- Langsame Zooms bei emotionalen Momenten
- Low-Angle (von unten) wenn ein Charakter beeindruckend wirken soll
- High-Angle (von oben) wenn ein Charakter klein/verletzlich wirken soll

### Charakter-Bewegung
- Tracking Shot mit mehr Dynamik — Kamera BESCHLEUNIGT wenn der Charakter schneller wird
- Bei Kikis Fluegen: Kamera fliegt MIT, Wind-Effekt, Blaetter wirbeln
- Bei Mikas Rennen: Kamera auf Bodenhoehe, Erde fliegt

### Anticipation (Vorwegnahme) — WICHTIG!
- VOR jedem wichtigen Moment: Zeige WO die Aktion stattfinden wird
- VOR einem Witz: Kurzer Blick auf die Zuhoerer (die noch nicht wissen was kommt)
- VOR einer Enthuellung: Slow zoom-in auf den Sprecher

### Reaction-Shots
- NACH jedem wichtigen Dialog: 2-3s Reaktion der anderen
- Koda sagt etwas Weises → Alle schauen beeindruckt
- Kiki macht einen Witz → Koda verdreht die Augen, Nuki lacht

### Uebergaenge
- Mix aus "flow", "cut" und "zoom-to-character"
- Dramatische Momente: harter "cut" fuer Effekt
- Ruhige Momente: sanftes "flow"`,
  },

  "minimal": {
    id: "minimal",
    name: "Zen",
    emoji: "🧘",
    description: "Ruhige, statische Einstellungen. Viel Luft im Bild. Perfekt fuer Meditations- und Luna-Geschichten.",
    prompt: `## DEIN REGIE-STIL: Minimal / Zen

### Kernprinzip
Weniger ist mehr. Die Stille spricht. Raum zum Atmen lassen.

### Licht & Farbe
- Weiches, daemmriges Licht (blau-violett oder sanftes Gold)
- Pastelltoene, keine knalligen Farben
- Nebel, Gluehuermchen, sanftes Leuchten

### Kamerafuehrung
- Meist STATISCHE Einstellungen — Kamera bewegt sich kaum
- Wenn Bewegung: EXTREM langsam (slow-pan ueber 10 Sekunden)
- Viel "Luft" im Bild — der Charakter ist klein in einer grossen Umgebung
- Wide Shots dominieren

### Charakter-Bewegung
- Charaktere bewegen sich LANGSAM und BEDACHT
- Keine hektischen Bewegungen — alles ist ruhig
- Statische Kamera: Der Charakter bewegt sich IM Bild, die Kamera bleibt stehen

### Uebergaenge
- NUR "flow" — keine harten Schnitte
- Ueberblendungen (langsames Fade) zwischen Szenen
- Lange Pausen zwischen Dialogen

### Pacing
- LANGSAM — doppelt so viel Stille wie bei anderen Stilen
- Landscape-Szenen LAENGER (5-8s statt 3-5s)
- [PAUSE] Marker grosszuegig einsetzen`,
  },
  "action": {
    id: "action",
    name: "Action",
    emoji: "\uD83D\uDCA5",
    description: "Schnelle Schnitte, dynamische Kamera, Adrenalin. Perfekt fuer Action-Szenen.",
    prompt: `## REGIE-STIL: Action / Michael Bay

### Kamerafuehrung
- DYNAMISCHE Kamerabewegungen: Handheld, Verfolgungsfahrten, Schwenks
- Schnelle Schnitte bei Action-Sequenzen (2-3s pro Szene)
- Slow-Motion bei Schluesselmoments (Aufprall, Explosion)
- Low-Angle fuer Eindruck, Bird's-Eye fuer Uebersicht

### Pacing
- SCHNELL — hohes Tempo, keine langen Pausen
- Atempause nur VOR dem Hoehepunkt (Ruhe vor dem Sturm)
- Schnitt-Rhythmus folgt der Musik/SFX

### Uebergaenge
- Harte Schnitte ("cut") fuer Energie
- "zoom-to-character" bei Reaktions-Shots
- Zeitlupen-Uebergang bei dramatischen Momenten`,
  },

  "documentary": {
    id: "documentary",
    name: "Dokumentarisch",
    emoji: "\uD83D\uDCF9",
    description: "Beobachtend, natuerlich, authentisch. Wie eine Kamera die dabei ist.",
    prompt: `## REGIE-STIL: Dokumentarisch / Cinema Verite

### Kamerafuehrung
- Natuerliche, beobachtende Kamera
- Leichtes Wackeln (Handheld-Feeling) fuer Authentizitaet
- Lange Einstellungen, wenig Schnitte
- Natuerliches Licht, keine kuenstliche Beleuchtung

### Pacing
- Ruhig, beobachtend, authentisch
- Laesst Szenen sich natuerlich entwickeln
- Keine erzwungenen dramatischen Momente

### Uebergaenge
- Meistens "flow" (sanft)
- Gelegentlich harter "cut" fuer Kontrast
- Zeitsprung-Ueberblendungen bei Zeitraffern`,
  },

  "thriller": {
    id: "thriller",
    name: "Thriller",
    emoji: "\uD83D\uDD0D",
    description: "Spannung aufbauen, Geheimnisse andeuten, unruhige Kamera.",
    prompt: `## REGIE-STIL: Thriller / Hitchcock

### Kamerafuehrung
- LANGSAME Zooms auf Details (Augen, Haende, Objekte)
- Ungewoehnliche Winkel (Dutch Angle bei Gefahr)
- Enge Kadrierung — der Zuschauer sieht nicht alles
- Schatten und Silhouetten nutzen

### Pacing
- Langsamer Spannungsaufbau → ploetzliche Eskalation
- Stille Momente gefolgt von lauten Schreckmomenten
- Ticking-Clock Feeling

### Uebergaenge
- Langsame Ueberblendungen bei Spannungsaufbau
- Harter "cut" bei Schreckmomenten
- "zoom-to-character" fuer bedrohliche Naehe`,
  },
};

export const DEFAULT_DIRECTING_STYLE = "pixar-classic";

// ── Atmosphere Presets ─────────────────────────────────────────────

export interface AtmospherePreset {
  id: string;
  name: string;
  emoji: string;
  prompt: string;
}

export const ATMOSPHERE_PRESETS: Record<string, AtmospherePreset> = {
  "golden-hour": {
    id: "golden-hour",
    name: "Goldene Stunde",
    emoji: "🌅",
    prompt: "Warm golden sunset light filtering through eucalyptus leaves. Long soft shadows. Everything bathed in amber-orange warmth. Sky gradient from deep orange at horizon to soft gold above. Magical golden glow on all surfaces and characters.",
  },
  "blue-hour": {
    id: "blue-hour",
    name: "Blaue Stunde",
    emoji: "🌆",
    prompt: "Soft blue-purple twilight. Deep blue sky fading to warm pink at the horizon. First stars appearing. Cool blue ambient light with warm golden accents from within the tree. Magical, dreamy atmosphere.",
  },
  "bright-day": {
    id: "bright-day",
    name: "Sonniger Tag",
    emoji: "☀️",
    prompt: "Bright cheerful daylight. Clear blue sky with a few soft white clouds. Warm sunbeams filtering through green canopy creating dappled light patterns. Fresh, vibrant, alive atmosphere.",
  },
  "moonlight": {
    id: "moonlight",
    name: "Mondnacht",
    emoji: "🌙",
    prompt: "Silver moonlight illuminating the scene. Deep blue-purple night sky with glowing full moon and scattered stars. Soft silver-white light on characters. Gentle shadows. Magical fireflies. Peaceful, intimate night atmosphere.",
  },
  "misty": {
    id: "misty",
    name: "Morgennebel",
    emoji: "🌫️",
    prompt: "Soft morning mist swirling between branches. Diffused warm light breaking through fog. Pastel colors — soft pink, lavender, pale gold. Dewdrops glistening on leaves. Mysterious, gentle, awakening atmosphere.",
  },
  "custom": {
    id: "custom",
    name: "Eigene",
    emoji: "✏️",
    prompt: "",
  },
};

export const DEFAULT_ATMOSPHERE = "golden-hour";

export function getDirectingStylePrompt(styleId: string): string {
  const style = DIRECTING_STYLES[styleId];
  if (!style) return DIRECTING_STYLES[DEFAULT_DIRECTING_STYLE].prompt;
  return style.prompt;
}
