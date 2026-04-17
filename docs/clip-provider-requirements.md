# Clip-Provider Requirements Checklist

**Zweck:** Jeder neue Clip-Provider (Sora 2, Veo 3, Kling 2.x, ...) wird gegen diese Liste geprueft, **bevor** er in Produktion geht. Kein Provider-Wechsel ohne bestandenen 1-Clip-Spike gegen alle harten Anforderungen.

**Warum diese Liste existiert:** Wir haben mehrfach Provider integriert, die *eine* Dimension gut konnten (O3 = Bild-Qualitaet, Seedance = Lip-Sync), dabei aber *andere* kritische Dimensionen brachen (O3+LipSync: face_detection_error bei Cartoons; Seedance: keine Seamless-Transitions). Diese Checkliste verhindert die Wiederholung.

**Leitprinzip: ERGEBNIS statt METHODE.** Jede Anforderung beschreibt, *was* im fertigen Clip sein oder nicht sein soll. *Wie* der Provider das erreicht (single-step vs. two-step, Prompt vs. Reference-Image, native vs. nachgelagert) ist egal, solange das Ergebnis stimmt. Methoden stehen nur als Hinweise in Notes — nie als Bedingung. Wenn ein kuenftiges Modell einen voellig neuen Weg findet und das Ergebnis passt, ist es zulaessig.

---

## Teil 1 — Harte Anforderungen (jede einzelne MUSS gruen sein)

| # | Anforderung | Warum kritisch | Test |
|---|---|---|---|
| H1a | **Cartoon-/Animation-Gesichter** (Koalas, stilisierte Characters) werden verarbeitet | O3-LipSync failed mit `face_detection_error` auf unseren Koalas. Koala-Intros = Projekt-Herz. | 1 Spike-Clip mit Koala-Charactersheet |
| H1b | **Reale/fotorealistische Gesichter** (Menschen) werden verarbeitet | Zukunftsfeatures: echte User-Characters, Foto-basierte Stories | 1 Spike-Clip mit realem Portrait-Foto als Reference |
| H2 | **Character-Consistency ueber mehrere Clips** (gleicher Koala sieht gleich aus, inkl. Kostuem/Fell/Augen) | Wir hatten Clip 2 = falscher Koala. Non-negotiable. Kostuem ist Teil davon: wenn Koda in Clip 1 einen roten Schal traegt, muss er ihn in Clip 5 noch haben. | 2 Spikes mit selbem Sheet (inkl. Kostuem), visuell vergleichen |
| H2b | **Location-Consistency ueber mehrere Clips** (gleicher Wald, gleicher Baum, gleiches Licht sehen identisch aus) | Eine Story spielt oft am gleichen Ort ueber 5-10 Clips. Wenn der Wald in jedem Clip anders aussieht → Film wirkt wie zusammengewuerfelte Stock-Footage. Genauso kritisch wie Character-Consistency. | 2 Spikes: gleiche Location-Beschreibung/-Reference in beiden, visuell vergleichen (Baum-Position? Lichtfarbe? Bodenbelag?) |
| H3 | **Lip-Sync-Ergebnis** zu unserem ElevenLabs-Audio: Mund synchron, **keine Gesichts-Spruenge waehrend des Dialogs**, keine Morphing-Artefakte, stabile Augen/Zaehne/Nase | Dialoge sind das Herz. Frueherer Test: Gesicht sprang waehrend Dialog staendig hin und her — unbrauchbar. Das ist die rote Linie. | Spike mit 5s Dialog-Audio, Frame-by-Frame reviewen auf Spruenge/Artefakte |
| H3b | **Deutsche Phoneme korrekt synchronisiert** — nicht nur englische Mundbewegungen. Umlaute, "ch", "sch", "r" muessen sichtbar unterschiedlich dargestellt werden. | Viele Lip-Sync-Modelle sind englisch-zentrisch; deutscher Dialog wirkt dann "genuschelt" oder falsch. | Spike mit 5s deutschem Dialog inkl. Umlaut/"sch", visuell pruefen |
| H4 | **Seamless Continuity** zwischen aufeinanderfolgenden Clips | Dialoge spannen ueber Clip-Grenzen; Sprung = unbrauchbar | 2 Spikes, Clip 2 muss bei Clip 1 Ende anknuepfen (prevFrame/start_image/continuous-take) |
| H5 | **9:16 Portrait + 16:9 Wide** unterstuetzt | Multi-Format-Export (FilmComposition hat 3 Varianten) | API-Docs pruefen, in Spike setzen |
| H6 | **Mindestens 6s pro Clip** (besser 10-15s) | Viele unserer Dialog-Zeilen sind >5s | API-Limit pruefen, 10s-Spike fahren |
| H7 | **API-Zugang heute verfuegbar** (nicht "waitlist" oder "coming soon") | Wir koennen nicht monatelang warten | Account-Check: Request geht durch, 200 OK |
| H8 | **Im finalen Clip ist unsere ElevenLabs-Stimme zu hoeren**, nicht eine vom Modell erfundene | Wir behalten unsere 7 Koala-Stimmen. Wie das erreicht wird — Audio-Input beim Video-Gen, nachgelagerter Lip-Sync-Pass, Mux in Remotion — ist Methode und irrelevant, solange die Stimme drinsteht und mit H3 synchron ist. | Im Spike: hat der fertige Clip unsere Stimme drin und ist der Mund dazu passend? |
| H9 | **Commercial-Use-Lizenz** — wir duerfen die generierten Clips kommerziell verwerten (Video-on-Demand, Monetarisierung, Werbung in/fuer KoalaTree, Weiterverkauf) | Wenn wir irgendwann monetarisieren, muessen wir wissen, ob die generierten Clips uns gehoeren/nutzbar sind. Einige Provider sperren Commercial-Use in bestimmten Tiers oder verlangen Attribution. | Provider-Terms pruefen: "Commercial Use" erlaubt? Gehoeren uns die Outputs? Irgendwelche Attribution-Pflichten? |

**Regel:** Eine einzige rote Zeile = Provider wird **nicht** integriert. Keine Ausnahmen "wird schon gehen".

---

## Teil 2 — Weiche Anforderungen (nice-to-have, aber Abwaegung wert)

| # | Anforderung | Impact wenn fehlt |
|---|---|---|
| W1 | **Kosten transparent messbar + in vernuenftigem Rahmen** — kein harter Cap, aber pro Spike dokumentieren ($/Sekunde, $/Clip) und vor Produktion hochrechnen (Clips × Charaktere × Stories) | User entscheidet pro Provider, ob der Preis fuer die Qualitaet gerechtfertigt ist. Seedance-Referenz: ca. $0.10/s |
| W2 | **Musik-Integration (zwei Use-Cases):**<br>**(a)** Background-Score unter allen Clips (heute via Remotion `backgroundMusicUrl` — funktioniert, bleibt so).<br>**(b)** Musik-Video-Modus: Character *singt/tanzt/performt zu einem Song*. Lip-Sync auf Gesangsspur statt Sprachdialog; rhythmische Koerperbewegung passend zum Beat. Eigenes Feature (siehe Future Features), aber Provider-Wahl muss es ermoeglichen — d.h. Audio-Input (H8) sollte auch Gesang akzeptieren, und W3 Expressive Range muss Tanz koennen. | (a) ist geloest. (b) bedeutet: wenn Sora 2 z.B. nur Sprech-Lip-Sync kann aber nicht Gesangs-Lip-Sync, ist das ein harter Einschnitt fuer Feature (b). Im Spike mit einem kurzen Gesangs-Sample testen. |
| W3 | **Expressive Range** — Character kann per Prompt: tanzen, lachen, weinen, springen, rennen, gestikulieren, Objekte halten, mit anderen interagieren (Umarmung, High-Five) | Reines Reden ist zu wenig fuer lebendige Filme; Koala der lacht/tanzt/flippt aus ist ein echter Unterschied zu statischem Talking-Head. Typischer Schwachpunkt aelterer Modelle. |
| W4 | **Kamera-Bewegung glaubhaft** (Pan, Zoom, Push-In, Orbit) wird erreicht — egal ob per Prompt, Parameter oder Auto-Motion | Nur kinematische Qualitaet, nicht Blocker |
| W5 | **Character sieht aus allen genutzten Kamerawinkeln konsistent aus** (front, profile, 3/4, top) — unabhaengig davon, wie das Modell das intern erreicht | Aus einem Char-Sheet heraus. Seedance: ueber Multi-Image-Ref; andere Modelle ggf. ueber eine einzige Front-Ref + generalization |
| W5b | **Location bleibt auch bei neuen Kamerawinkeln die gleiche** — Baum an gleicher Stelle, gleiches Licht, gleicher Bodentyp | Loest H2b auch dann, wenn wir in einer Location die Kamera wechseln. Ob ueber Location-Ref-Image, Prompt-Text oder first-frame-injection ist egal. |
| W5c | **Props/Kostueme bleiben ueber Clips identisch** — wiederkehrender Gegenstand (Eichel, Schal, Tasche) sieht jedes Mal gleich aus | Wie es erreicht wird — Image-Ref, Element-Slot, Inline-Composition — egal. Ergebnis zaehlt: derselbe Gegenstand in Clip 1 und Clip 5. |
| W5d | **Physical / Spatial Awareness** — Character geht glaubhaft um Objekte herum, nicht durch sie; Licht und Schatten passen zur Szene; Kamerabewegung respektiert Geometrie | Unterscheidet "echter Raum" von "Green-Screen-Gefuehl". Aeltere Modelle schummeln hier hart. |
| W6 | **SFX-Qualitaet** — wenn der Provider Sound-Effects (Schritte, Wind, Bird-Calls) in den Clip mischt, klingen sie glaubhaft, sind nicht uebersteuert, passen zum Bild-Inhalt | Alternative: wir bleiben bei unserem eigenen SFX-Workflow (Sound-Library + Remotion-Mux). Dann ist W6 egal. Wenn Provider SFX besser macht als unsere Library, ist es ein Gewinn. |
| W7 | **Content-Filter greift nicht bei harmlosen Szenen** — kein ungewolltes Blocken bei Koda-faellt-hin, Waldspaziergang, harmlosem Streit zwischen Characters | Manche Provider sind paranoid (z.B. Runway blockt "child" oft falsch positiv). Wenn der Filter unsere normalen Koala-Szenen blockt, wird die Pipeline unzuverlaessig. |
| W8 | **Moeglichkeit nachtraeglich einzelne Szenen zu korrigieren/regenerieren** — egal ob Inpainting, Regen mit identischem Seed, oder Scene-Extension | Heute loesen wir das durch Neu-Generierung des ganzen Clips. Nachtraegliche Korrektur waere Luxus, Fehlen nicht schlimm. |
| W9 | **Generation < ~60s Wartezeit pro Clip** | Bei 30+ Clips pro Film summiert sich das. Cron-Setup puffert, aber kuerzer ist schneller iterierbar. |
| W10 | **Webhook/Polling-Pattern verfuegbar** (statt rein synchronem Request) | Vercel-Serverless Timeout-Grenze. Haben wir ueber Cron-Job geloest, aber native Webhook-Unterstuetzung waere sauberer. |

---

## Teil 2a — Terminologie-Klaerung ("Natives Audio")

Der Begriff ist in der Provider-Doku mehrdeutig, wir unterscheiden strikt:

| Bedeutung | Was passiert | Fuer uns brauchbar? |
|---|---|---|
| **A — Audio wird vom Modell generiert** | Prompt "dog barking" → Modell erfindet Bellgeraeusch + eigene Stimmen | **Nein** — wir behalten unsere 7 Koala-ElevenLabs-Stimmen. Modell-Stimmen sind unbrauchbar. |
| **B — Audio wird als Input fuer Lip-Sync akzeptiert** (single-step) | Wir geben ElevenLabs-MP3 rein → Modell animiert Mund dazu in einem Schritt | **Ja** — das ist H8(i). Seedance Ref-to-Video macht das, Sora 2 auch, Veo 3 teilweise. |
| **C — Video ohne Lip-Sync generieren, dann separater Lip-Sync-Pass** (two-step) | Erst Video erzeugen, dann externer Service (Kling LipSync, Hedra, Sync Labs v3, Runway Act-One) animiert Mund nachtraeglich | **Ja** — das ist H8(ii). Gleichwertig zu B, solange das Endergebnis H3 besteht (keine Spruenge). |

Faustregel bei Provider-Doku lesen: "audio-driven" / "audio-to-video" / "lip-sync from audio input" = Bedeutung B = gut. "native audio generation" / "generates audio" = Bedeutung A = Vorsicht, meist unbrauchbar fuer uns. Fehlt Audio-Input komplett → Bedeutung C als Fallback pruefen (two-step).

---

## Teil 3 — Projekt-Kontext (Annahmen, die der Provider erfuellen muss)

- **Input pro Dialog-Szene:** 1 Character-Sheet (3 Angles moeglich), 1 Audio-MP3 (ElevenLabs), 1 Scene-Description-Prompt, optional `prevFrame` fuer Seamless.
- **Input pro Landscape-Szene:** 1 Scene-Prompt, optional `prevFrame`, kein Audio, kein Character.
- **Output:** MP4 9:16 oder 16:9, 6-15s, mit oder ohne baked-in Audio (Remotion muted Video ohnehin und mischt TTS selbst rein).
- **Volumen initial:** 7 Koalas × ~5 Intros × ~4 Clips/Intro = ~140 Clips fuer Welcome-Film-Launch.
- **Kosten-Rahmen:** Kein harter Cap, aber transparent. User entscheidet pro Provider auf Basis der gemessenen $/s × erwartetem Volumen. Referenzwert Seedance: ~$0.10/s. Wenn ein Provider doppelt so teuer aber dreimal so gut ist, ist das eine bewusste Entscheidung, keine automatische Disqualifikation.

---

## Teil 4 — Spike-Protokoll (wie ein Provider getestet wird)

**1 Provider = 1 Spike-Route = max $5 Budget = 1 Entscheidung.**

Schritte:
1. **API-Dokumentation + Terms lesen**, Anforderungen H1-H9 auf "laut Doku erfuellt" markieren. Schon H1 (Cartoon) rot oder H9 (Commercial License) ausgeschlossen → abbrechen, kein Spike.
2. **Spike-Route** `app/api/studio/test-<provider>-spike/route.ts` schreiben. Ein einziger Handler, der einen festen Test-Case ausfuehrt (Koda-Character-Sheet + 5s Test-Audio + "stands in forest, speaking to camera").
3. **Fuenf Clips** generieren in EINEM Test-Run:
   - **Clip A (Dialog, Koala, Deutsch + Prop-Test):** Koda-Sheet **+ Prop-Ref (z.B. glowing acorn)** + 5s **deutsches** Dialog-Audio (mit Umlaut + "sch") + "standing in forest, holding the acorn, speaking"
   - **Clip B (Dialog, Seamless- + Location- + Prop-Persistenz-Test):** setzt Clip A mit prevFrame fort, **selbe Location + selbe Prop-Ref**, andere Dialog-Zeile — prueft H4 Seamless, H2b Location-Consistency, W5c Prop-Persistenz gleichzeitig
   - **Clip C (Expressive-Test):** Koda-Sheet + "dances happily, laughing, arms in the air" (kein Audio, pure Action)
   - **Clip D (Musik-Video-Test, W2b):** Koda-Sheet + 5s Gesangs-Sample + "singing joyfully to the rhythm, dancing" — prueft ob Lip-Sync auch auf Gesang funktioniert und ob Koerperbewegung zum Beat passt
   - Optional Clip E mit realem Portrait-Foto fuer H1b, wenn der Provider laut Doku plausibel ist.
4. **Visuell reviewen** gegen H1-H4 + H2b + W3 + W5c + W5d:
   - Koala korrekt? (H1a)
   - Character A↔B identisch, Kostuem gleich? (H2)
   - **Location A↔B identisch? Baum-Position, Lichtfarbe, Boden?** (H2b)
   - **Prop (acorn) A↔B identisch? Form, Farbe, Glow?** (W5c)
   - **Lip-Sync okay? Mund synchron, KEINE Gesichts-Spruenge, keine Morphing-Artefakte — frame-by-frame pruefen, nicht nur "wirkt okay"** (H3) — das ist der haertetste Test, rote Linie
   - **Deutsche Phoneme sichtbar korrekt (Umlaut, "sch") — nicht englisch-genuschelt?** (H3b)
   - Unsere ElevenLabs-Stimme ist im finalen Clip zu hoeren und nicht eine erfundene? (H8)
   - Content-Filter hat nicht blockiert? (W7)
   - Falls Provider SFX mitgemischt hat: klingen sie brauchbar? (W6, 1-5 Sterne; wenn kein SFX dabei, N/A)
   - Uebergang sauber? (H4)
   - Tanzt Koda glaubhaft, lacht er erkennbar? (W3, 1-5 Sterne)
   - **Wirkt der Raum physisch echt? Haelt Koda den acorn ueberzeugend, keine Durchdringungen?** (W5d, 1-5 Sterne)
5. **Reale Kosten** vom Provider-Dashboard ablesen, gegen H7 pruefen.
6. **Entscheidung dokumentieren** hier in diesem File unter "Teil 6 — Spike-Log".
7. **Erst wenn alle H-Zeilen gruen**: Integration in `process-studio-tasks/route.ts`.

**Stopp-Regel:** Wenn ein Spike eine H-Anforderung bricht, wird der Provider verworfen. Kein "wir bauen's trotzdem ein und schauen mal". Das haben wir zweimal gemacht.

---

## Teil 5 — Provider-Kandidaten (April 2026)

Priorisiert nach Wahrscheinlichkeit, alle H-Zeilen zu erfuellen.

> **Diese Liste ist nicht abschliessend.** Wir sind offen fuer alle Provider — etablierte, neue, Beta. Updates/Release-Notes von fal.ai, OpenAI, Google DeepMind, Runway, Kling, ByteDance, Luma, Pika etc. werden laufend gesichtet. Wenn ein neues Modell rauskommt (z.B. "Veo 4", "Sora 2.5", "Kling 3.0"), wird es hier als Kandidat ergaenzt und gegen die Checkliste geprueft — nicht ignoriert, nicht blind integriert.

### A) Sora 2 (OpenAI)
- **H1 Cartoon:** muss geprueft werden — Sora 2 trainiert auf breitem Korpus, sollte funktionieren
- **H3 Lip-Sync:** nativ unterstuetzt
- **H4 Seamless:** Sora 2 kann bis zu 20s in *einem* Take → Problem verlagert sich ("nicht splitten statt seamlessen")
- **H6 Laenge:** bis 20s, ausreichend
- **H7 Kosten:** unklar, muss gemessen werden
- **H8 API:** Pro-Rollout laeuft; Account-Check noetig
- **Risiko:** Waitlist / Rate-Limits

### B) Google Veo 3
- **H1 Cartoon:** sollte gehen, 2D-Animationen werden unterstuetzt
- **H3 Lip-Sync:** nativ (Hauptfeature Veo 3)
- **H4 Seamless:** 8s-Clips, aber starke Character-Consistency via Ref → Problem: gleiche Grenze wie heute (8s), nur sauberere Refs
- **H6 Laenge:** 8s Hard-Limit — muessen wir leben koennen
- **H7 Kosten:** teurer als Seedance (~$0.25-0.40/s bei 8s)
- **H8 API:** verfuegbar via Vertex/Gemini API
- **Risiko:** 8s-Limit heisst: Dialoge muessen sowieso pro Zeile einen Clip bekommen

### C) Kling 2.5+ (Pro / Omni-Variants)
- **H1 Cartoon:** besser als O3, muss geprueft werden
- **H3 Lip-Sync:** via separater LipSync-API (wie bei Kling O3 gescheitert)
- **H4 Seamless:** Image-to-Video unterstuetzt start_image; Continuity moeglich
- **H8 API:** via fal.ai oder Kling direkt
- **Risiko:** Selbes Pattern wie O3 — einzelne Tools fuer Lip-Sync + Video-Gen koennen sich beissen

### D) Status quo + Drehbuch-Restrukturierung (Weg 1)
- **Kein Provider-Wechsel.** Seedance bleibt.
- **Drehbuch-Regel:** Jede Dialog-Zeile passt in einen Clip. Keine Zeile spannt zwei Clips.
- **Seamless-Thema:** Faellt weg, weil Schnitte nur an Satzgrenzen = natuerliche Film-Schnitte.
- **Kosten:** $0 zusaetzlich.
- **Risiko:** Kreative Einschraenkung im Drehbuch (keine langen monologischen Kamerafahrten ueber Cuts).

---

## Teil 6 — Spike-Log (chronologisch)

### 2026-04-xx — Seedance 2.0 Ref-to-Video (historisch, Lessons Learned)
- H1a ✓ Cartoon-Koalas funktionieren
- H1b ? **Nicht getestet** — reale Gesichter bisher nie gegen Seedance gefahren
- H2 ✓ (nach Prompt-Fix "Reference @Image2/@Image3 for consistency")
- H3 ✓ Lip-Sync sauber mit `generateAudio: true` + `audioBuffers`
- H4 ✗ **Keine start_image-Unterstuetzung → kein Seamless moeglich**
- H7 ~ $0.10/s gemessen, knapp ueber Target aber okay
- **Entscheidung:** Nur fuer Clips brauchbar, die NICHT seamless an einen Vorgaenger anschliessen muessen. Kombinierbar mit Weg D (Drehbuch-Regel). **Offen:** H1b-Test mit realem Portrait noetig, bevor wir Seedance fuer Nicht-Koala-Stories committen.

### 2026-04-17 — Sora 2 (OpenAI) — REJECTED vor Spike (Doku-Check Schritt 1)
Keine Spike-Route geschrieben, kein Geld ausgegeben. Disqualifikation bereits in Schritt 1 des Protokolls (API-Doku + Terms lesen).

- **H1a ✓ GREEN** Cartoon-Styles explizit unterstuetzt (Disney, Anime, Looney Tunes)
- **H1b ✗ RED** Face-Uploads per Default abgelehnt (seit Feb 2026) — keine realen Gesichter moeglich
- **H2 ~ YELLOW** `image_url` unterstuetzt, aber Cameo (der gute Consistency-Pfad) NICHT in der API. Text-Desc-basiert ~70% Consistency.
- **H3 ✓ GREEN** (fuer Sora's eigene Stimme, aber siehe H8)
- **H3b ? YELLOW** Deutsche Phoneme: keine oeffentlichen Daten, unklar
- **H4 ✓ GREEN** Native `/v1/videos/extensions` fuer Seamless + last-frame-Workflow
- **H6 ✓ GREEN** 4/8/12/16/20s unterstuetzt, Extensions bis 120s
- **H7 ✓ GREEN** API offen, Plus($20) oder Pro($200)-Tier
- **H8 ✗ RED** **Kein Audio-Input-Parameter.** Sora 2 generiert eigene Stimmen. Unser ElevenLabs-Audio kann nur post-hoc via externe Tools gemuxt werden — dann aber kein Lip-Sync zu unserem Audio. Two-step via nachgelagertem Lip-Sync-Service theoretisch moeglich, aber siehe Deprecation.
- **H9 ✓ GREEN** Commercial Use erlaubt, Outputs User-owned, keine Attribution-Pflicht

- **Preis:** Sora 2 $0.10/s, Sora 2 Pro $0.30/s (720p) oder $0.50/s (1080p). 20s Pro 1080p = ~$10.

- **KILLER #1 — Deprecation:** Sora-App schliesst am 26. April 2026 (9 Tage nach diesem Eintrag), API folgt am 24. September 2026. Kein Nachfolger angekuendigt. Fuer kommerziellen Pipelines = No-Go, selbst wenn alle anderen Anforderungen gruen waeren.
- **KILLER #2 — H8:** Selbst ohne Deprecation koennten wir unsere 7 Koala-Stimmen nicht erhalten, ohne zweiten teuren Lip-Sync-Pass, der die ganze Kosten/Qualitaets-Rechnung verschiebt.

- **Quellen:** [OpenAI Shutdown-Notice](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation) · [Video-Gen-Docs](https://developers.openai.com/api/docs/guides/video-generation) · [Cameo-API-Gap](https://blog.wentuo.ai/en/sora-2-character-consistency-cameo-api-guide-2026-en.html) · [Pricing](https://costgoat.com/pricing/sora)

- **Entscheidung:** Rejected. Nicht integrieren. Kein Spike.

### 2026-04-17 — Veo 3.1 (Google) — REJECTED als single-step, YELLOW als two-step-Komponente
Keine Spike-Route geschrieben. Dokumenten-Review ergab denselben Blocker wie Sora 2.

- **H8 ROT** als single-step: kein Audio-Input-Parameter. Veo 3.1 generiert nur eigene Stimmen aus dem Prompt. Unsere ElevenLabs-Stimme koennen wir nicht einspeisen.
- **H4 GREEN** (wuerden wir es nutzen): natives `lastFrame`-Parameter + Extend API — genau der fehlende Seamless-Baustein bei Seedance.
- **H2 GREEN** (bis 3 Reference-Bilder).
- **H1a GREEN** (stylisiert / cartoon funktioniert).
- **H1b YELLOW** (region-gated, in DE/UK eingeschraenkt).
- **H3b YELLOW** (non-English "being refined", keine konkreten Daten).
- **H6 YELLOW** (8s Hard-Limit, via Extend auf 60s+).
- **H9 GREEN** (Commercial erlaubt, aber SynthID-Watermark zwangsweise eingebaut — unsichtbar, detektierbar).
- **Preis:** $0.20/s silent, $0.40/s mit Audio (fal.ai 720p/1080p).
- **Abschaltung:** keine angekuendigt (stabil).

- **Potenzieller two-step-Pfad (nicht sofort verfolgt):** Veo 3 silent ($0.20/s) + nachgelagerter Lip-Sync-Service (Kling Avatar v2 Pro oder Hedra). ~$2-3/8s-Clip. **Nur relevant, wenn Kling Avatar v2 Pro im Cartoon-Test besteht** — sonst scheitert dieser Pfad auch.

- **Quellen:** [fal.ai Veo 3.1](https://fal.ai/models/fal-ai/veo3.1) · [Gemini video docs](https://ai.google.dev/gemini-api/docs/video) · [Watermark-Dokumentation](https://flowith.io/blog/veo-faq-commercial-rights-watermarks/)

- **Entscheidung:** Rejected als single-step. Als two-step-Komponente nur interessant, wenn Kling Avatar v2 Pro Cartoon-LipSync bestanden hat.

### 2026-04-17 — Kling 2.x Landschaft — PROCEED mit `kling-video/ai-avatar/v2/pro` als erster echter Spike-Kandidat
Die Recherche hat die Kling-Landschaft aufgefaltet: Es gibt nicht "ein Kling", sondern mindestens sechs relevante Produkte mit sehr unterschiedlichen Eigenschaften.

**Was wir NICHT mehr nutzen:**
- ✗ `fal-ai/kling-video/lipsync/audio-to-video` (Legacy, version 1.x) — immer noch `face_detection_error` auf Cartoons. Dieses Produkt war unser alter Blocker und ist nach wie vor unbrauchbar fuer Koalas.

**Was neu und relevant ist:**

| Produkt | Zweck | Preis (fal.ai) | Rolle fuer uns |
|---|---|---|---|
| `fal-ai/kling-video/ai-avatar/v2/pro` | Lip-Sync-Service v2 (Avatar v2 Pro) — **Nachfolger** des Legacy-LipSync | $0.115/s | **Kandidat fuer unseren Lip-Sync-Pass** — laut Doku explizit fuer "realistic humans, animals, cartoons, stylized characters" |
| `fal-ai/kling-video/v2.6/pro/image-to-video` | I2V mit Start + **Tail Image URL** | $0.07/s silent, $0.14/s mit Audio | **Kandidat fuer Seamless** — Tail-Image-Parameter loest H4 nativ |
| `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | I2V schneller, billiger | $0.35 fuer 5s, dann $0.07/s | Alternative zu 2.6 |
| Kling 3.0 (klingai.com direkt) | seit 5.2.2026 GA: 15s, multi-shot, multi-character dialog | tbd | **Noch nicht tief recherchiert** — koennte DER Kandidat sein |
| `fal-ai/kling-video/v1.6/standard/elements` | Multi-Reference (bis 4 Bilder) | $0.01/Element | Fuer W5b/W5c — Location- und Prop-Refs, falls 2.x/3.0 das nicht direkt abdeckt |

**Capability-Map (two-step: Kling I2V + Avatar v2 Pro):**

- **H1a YELLOW** Avatar v2 Pro laut Doku cartoon-faehig — **NICHT durch dritt-partei-Tests bestaetigt**. Hauptrisiko des Spikes.
- **H1b GREEN** Reale Gesichter = Kerneinsatz
- **H2 GREEN** Kling 2.5/2.6 Reference-Anchoring dokumentiert
- **H2b YELLOW** Elements 1.6 unterstuetzt bis 4 Refs, aber keine explizite Role-Tag-Trennung (Character vs Location vs Prop)
- **H3 YELLOW** Avatar v2 Pro "production-grade" laut Doku, keine Cartoon-Benchmarks
- **H3b ROT** Offiziell nur ZH/EN/JA/KO. **Deutsch nicht gelistet.** — Spike muss zeigen, ob Umlaute/"sch"/"ch" trotzdem akzeptabel animiert werden oder ob der Lip-Sync visuell falsch lauft
- **H4 GREEN** Kling 2.6 Pro I2V hat "Image + Tail Image URL" — Seamless nativ
- **H6 YELLOW** 5/10s (2.5/2.6), 15s (3.0)
- **H8 GREEN** Avatar v2 Pro akzeptiert MP3/WAV/OGG/M4A/AAC — unsere ElevenLabs-MP3 passt
- **H9 YELLOW** Commercial erlaubt, aber "Kling AI"-Branding-Pflicht (ausser schriftlicher Ausnahme). fal.ai-mediated T&amp;Cs separat pruefen bevor Produktion.

- **Quellen:** [fal.ai Avatar v2 Pro](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro) · [fal.ai Kling 2.6 Pro I2V](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video) · [LemonSlice: Legacy-LipSync fails on cartoons](https://lemonslice.com/blog/lemonslice-vs-kling) · [Avatar v2 Dev Guide (Sprachen ZH/EN/JA/KO)](https://fal.ai/learn/devs/kling-avatar-v2-developer-guide) · [Kling 3.0 Guide](https://invideo.io/blog/kling-3-0-complete-guide/)

- **Entscheidung:** **PROCEED mit Spike.** Siehe naechster Abschnitt.

### 2026-04-17 — Parallele Research-Welle (Western + Asian + LipSync-Services)
Drei parallele Research-Agenten: 17 Provider gegen Checkliste gemappt.

**Weitere Eliminierungen (kein Spike):**
- **Runway Act-One** (Gen-3): braucht menschliches Driver-Video + Doku: "Nonhuman characters don't work"
- **Sync Labs lipsync-2 / sync-3 / pro**: architektonisch ausgeschlossen — "models don't currently support animals or non-humanoid characters" ([lipsync.com](https://lemonslice.com/blog/lemonslice-vs-kling))
- **HeyGen / Synthesia / D-ID**: human-avatar-Platforms, keine Cartoon-Mascot-Unterstuetzung
- **MuseTalk 1.5**: Real-time-Optimierung opfert Film-Qualitaet, kein fal.ai-Host → ops-Overhead
- **Mochi 1 (Genmo)**: 5s max, keine Refs, kein Audio, keine Seamless — unterlegen
- **Hunyuan 1.5**: fragmentiert, Kling Omni dominiert gleiche Achse
- **Hailuo 2.3 (MiniMax)**: silent only, keine Seamless → kein Upgrade vs. Seedance heute

**Ergebnis — Spike-Kandidaten gerankt:**

**#1 Wan 2.7** (Alibaba, fal.ai) — Paper-Match-Gewinner
- Apache 2.0 Lizenz (keine Attribution, kein Branding, kein Watermark)
- $0.10/s flat (billiger als Seedance)
- 15s Clips, bis 4K
- First + last frame control (H4 nativ)
- Wan 2.2-S2V akzeptiert MP3 URL direkt (H8 nativ)
- Sprach-agnostisch (H3b Deutsch gruen)
- Cartoon explizit supportet
- Endpunkte: `fal-ai/wan/v2.7/image-to-video`, `fal-ai/wan/v2.7/reference-to-video`, `fal-ai/wan/v2.7/audio-to-video`
- Quellen: [fal.ai Wan 2.7](https://fal.ai/wan-2.7), [Wan 2.2-S2V HF](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B)
- **Entscheidung: SPIKE ZUERST**, niedrigstes Risiko, hoechste Reward

**#2 Pika 2.2 + Pikaframes + Pikaformance** (fal.ai)
- H8 gruen (MP3-Input), H4 gruen (bis 5 Keyframes verkettbar), H2b gruen (Scene-Refs)
- $0.20/5s 720p, $0.45/5s 1080p
- Offen: H3b Deutsch, Pikaformance-Qualitaet bei komplexen Phonemen
- **Entscheidung: Spike #2, wenn Wan 2.7 scheitert**

**#3 Kling 3.0 Omni** (fal.ai `fal-ai/kling-video/v3/pro/*` und `o3/pro/*`)
- Native single-pass Audio+Video, 15s, multi-character dialog mit Voice-ID-Binding
- $0.168-0.224/s
- Voice-Clone-indirect (wir muessten ElevenLabs-Stimme clonen, nicht direkt nutzen)
- DE: CN/EN/JA/KO/ES native, Deutsch nur Englisch-Fallback
- **Entscheidung: Spike #3 wenn Wan + Pika scheitern**

**#4 LemonSlice 2** (direkte API, nicht fal.ai) — Cartoon-Spezialist
- Explizite Marketing-Claim: "better than Kling for cartoons"
- $8-33/mo + API
- **Entscheidung: Als two-step-LipSync-Pass evaluieren, wenn native-audio-in-Wan/Pika/Kling nicht passt**

**#5 Hedra Character-3** (fal.ai + direkt) — Lip-Sync-Alternative
- "Brand mascot" explizit, 140+ Sprachen inkl. Deutsch, 3-6 credits/s
- Creator $8/mo kommerziell
- **Entscheidung: Zweite Wahl fuer two-step-LipSync**

**Runway Gen-4 + Lip Sync** — Top-Qualitaet aber NICHT auf fal.ai. Deprioritisiert wegen Integrationsaufwand. Spaeterer Re-Check wenn andere Kandidaten alle scheitern.

### 2026-04-XX — Wan 2.7 Spike (geplant, noch nicht durchgefuehrt)
[hier wird nach Durchfuehrung eingetragen]

---

## Meta-Regel

Diese Datei ist **verbindlich** fuer alle zukuenftigen Provider-Entscheidungen. Wenn der Agent einen neuen Provider vorschlaegt, ohne diese Checkliste durchlaufen zu haben, ist das ein Prozess-Fehler, nicht eine Meinungs-Frage. Der User darf in dem Fall auf die Liste verweisen und die Diskussion stoppen.
