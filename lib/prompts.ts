import {
  HoererProfil,
  KindProfil,
  StoryConfig,
  StoryFormat,
  PaedagogischesZiel,
  DAUER_OPTIONEN,
} from "./types";
import { buildProfileEvolution, ProfilEventRow } from "./profile-diff";

// ═══════════════════════════════════════════════════
// CHARACTER STYLES — altersadaptiv für alle 6 Figuren
// ═══════════════════════════════════════════════════

const KODA_STIL = (alter: number) => {
  const SPRECHER_ANWEISUNG = `
KODAS SPRECHWEISE (gilt für alle Altersstufen):
Koda erzählt wie ein professioneller Hörspiel-Sprecher. Er passt sein Tempo dem Inhalt an:
- Spannende Momente: Tempo steigt, Stimme wird energischer, kürzere Sätze
- Emotionale/nachdenkliche Momente: Tempo verlangsamt sich, sanftere Stimme, lässt Worte wirken
- Dialoge: Natürliche Pausen zwischen Sätzen, als ob er kurz nachdenkt
- Beschreibungen: Ruhig und bildhaft, gibt dem Hörer Zeit sich die Szene vorzustellen
Koda macht bewusst Pausen. Er hetzt nie. Er lässt Stille zu.
Er klingt weise und erfahren — warm, tief, mit der Ruhe eines alten Geschichtenerzählers.`;

  if (alter <= 5) return `KODAS STIL FÜR 3-5 JAHRE:
Koda spricht sehr sanft und einfach, wie ein liebevoller Großvater.
Kurze, einfache Sätze. Viele Wiederholungen. Konkrete, greifbare Bilder.
Keine abstrakten Konzepte. Warm, beschützend, voller Liebe.
"Hmm... weißt du was, kleiner Schatz... ich erinnere mich da an etwas..." / "Und dann... stell dir vor..."
${SPRECHER_ANWEISUNG}`;

  if (alter <= 8) return `KODAS STIL FÜR 6-8 JAHRE:
Koda spricht klar und bildhaft. Er stellt kleine Fragen und regt zum Nachdenken an.
Einfache Metaphern. Behandelt das Kind mit Respekt und Neugierde.
"Also... was glaubst du, was dann passiert ist?" / "Hmm... der alte Koda schmunzelte leise..."
${SPRECHER_ANWEISUNG}`;

  if (alter <= 12) return `KODAS STIL FÜR 9-12 JAHRE:
Koda ist philosophischer. Behandelt den Hörer als "jungen Denker".
Reichere Sprache. Tiefgründige Gedanken natürlich eingeflochten.
"Weißt du... manchmal im Leben..." / "Hmm, es gibt da etwas... das ich vor langer Zeit gelernt habe..."
${SPRECHER_ANWEISUNG}`;

  return `KODAS STIL FÜR 13+ JAHRE:
Koda ist ein weiser Mentor auf Augenhöhe. Teilt Lebensweisheiten respektvoll.
Keine kindliche Sprache, aber immer warm und wohlwollend.
"Also... du bist alt genug, um das zu verstehen..." / "Hmm... das Leben hat mir da etwas gezeigt..."
${SPRECHER_ANWEISUNG}`;
};

const KIKI_STIL = (alter: number) => {
  if (alter <= 5) return `KIKIS STIL FÜR 3-5 JAHRE:
Kiki ist albern und macht lustige Ausrufe. Kurze, begeisterte Sätze.
"Hihi! Kuckuck!" / "Ohhh, das ist ja toll!" / "Boah, schau mal!"
Sie kichert viel, macht Quatsch, ist übertrieben begeistert von allem.`;

  if (alter <= 8) return `KIKIS STIL FÜR 6-8 JAHRE:
Kiki erzählt Witze, macht lustige Beobachtungen, ist aufgeregt.
"Also echt jetzt, das glaub ich nicht!" / "Hihi, das war aber witzig!"
Sie stellt lustige Fragen und übertreibt gerne komisch.`;

  if (alter <= 12) return `KIKIS STIL FÜR 9-12 JAHRE:
Kiki ist witzig und nutzt Wortspiele. Clevere Kommentare.
"Moment mal, Koda, das klingt ja fast wie..." / "Weißt du was ICH dazu sage?"
Sie hat eine eigene Meinung und teilt sie enthusiastisch.`;

  return `KIKIS STIL FÜR 13+ JAHRE:
Kiki ist schlagfertig und warmherzig-ironisch. Schnelle Kommentare.
"Na klar, Koda, und der Mond ist aus Käse..." / "Okay okay, ich sag ja nichts... ABER..."
Sie bringt Leichtigkeit in ernste Momente, ohne sie zu entwerten.`;
};

const LUNA_STIL = (alter: number) => {
  if (alter <= 8) return `LUNAS STIL FÜR 3-8 JAHRE:
Luna spricht sehr sanft und langsam, wie eine liebevolle große Schwester.
Einfache, bildhafte Sprache. "Schließ die Augen... stell dir vor..."
Sie verwendet viele sinnliche Beschreibungen: Farben, Wärme, Geborgenheit.
"Spürst du das...? Die warme Decke aus Sternenstaub..."`;

  if (alter <= 12) return `LUNAS STIL FÜR 9-12 JAHRE:
Luna ist poetisch und einfühlsam. Sie führt mit sanfter Stimme.
"Lass uns zusammen reisen... an einen Ort, wo alles ruhig ist..."
Sie baut Atemübungen natürlich ein und gibt dem Hörer Raum.`;

  return `LUNAS STIL FÜR 13+ JAHRE:
Luna spricht wie eine erfahrene Meditationslehrerin — ruhig, klar, tiefgründig.
"Nimm dir einen Moment... spüre deinen Atem... lass los..."
Poetisch aber nicht kitschig. Echte Tiefe, echte Ruhe.`;
};

const MIKA_STIL = (alter: number) => {
  if (alter <= 5) return `MIKAS STIL FÜR 3-5 JAHRE:
Mika ist aufgeregt und begeistert, aber nie beängstigend.
"Los geht's! Komm mit!" / "Wow, schau mal da!" / "Wir schaffen das!"
Er spricht schnell und enthusiastisch. Kurze, einfache Action-Sätze.`;

  if (alter <= 8) return `MIKAS STIL FÜR 6-8 JAHRE:
Mika ist der mutige Anführer. Er erzählt mit Tempo und Energie.
"Okay, hier ist der Plan..." / "Und dann — ZACK! — sind wir losgerannt!"
Er macht Mut: "Hey, das packen wir! Zusammen sind wir unschlagbar!"
Action-Szenen werden lebendig und aufregend, nie gruselig.`;

  if (alter <= 12) return `MIKAS STIL FÜR 9-12 JAHRE:
Mika ist ein cooler, mutiger Abenteurer. Er redet wie ein Teamführer.
"Also, ich sag euch was — das wird der beste Tag EVER!"
Er reflektiert auch: "Mut heißt nicht, keine Angst zu haben... sondern trotzdem loszugehen."
Spannung aufbauen, den Hörer mitreißen.`;

  return `MIKAS STIL FÜR 13+ JAHRE:
Mika ist authentisch und direkt. Ein verlässlicher Freund.
"Hör zu — manchmal muss man einfach den ersten Schritt machen."
Er kombiniert Action mit Tiefe. Mutig, aber auch verletzlich.
Echte Herausforderungen, echte Triumphe.`;
};

const PIP_STIL = (alter: number) => {
  if (alter <= 5) return `PIPS STIL FÜR 3-5 JAHRE:
Pip ist super neugierig und begeistert sich für ALLES.
"Oh! Was ist DAS?!" / "Warum ist das so?" / "Schau mal, schau mal!"
Er entdeckt die Welt mit großen Augen. Kurze, staunende Sätze.
Jede Antwort führt zu einer neuen Frage — das macht ihn aus.`;

  if (alter <= 8) return `PIPS STIL FÜR 6-8 JAHRE:
Pip ist der neugierige Forscher. Er stellt die BESTEN Fragen.
"Hmm... was wäre, wenn...?" / "Wusstest du, dass...?" / "Das ist ja unglaublich!"
Er erklärt Dinge einfach und begeistert. Jedes Rätsel ist ein Abenteuer.
"Lass uns das zusammen herausfinden!"`;

  if (alter <= 12) return `PIPS STIL FÜR 9-12 JAHRE:
Pip ist ein cleverer Denker und Entdecker. Er liebt Fakten und Rätsel.
"Okay, Fakt Nummer eins..." / "Das ergibt Sinn, wenn man bedenkt, dass..."
Er kombiniert Wissen mit Begeisterung. Er macht Lernen cool.
"Weißt du was das WIRKLICH Verrückte daran ist?"`;

  return `PIPS STIL FÜR 13+ JAHRE:
Pip ist ein wissbegieriger Geist mit echtem Tiefgang.
"Das ist faszinierend — die Wissenschaft dahinter ist..."
Er verbindet Fakten mit Staunen. Neugier als Lebenshaltung.
"Je mehr man weiß, desto mehr gibt es zu entdecken..."`;
};

const SAGE_STIL = (alter: number) => {
  // Sage ist erst ab 13 aktiv (Reflexion), aber wir definieren auch jüngere Stile
  // falls er mal im Podcast für Jüngere vorkommt
  if (alter <= 8) return `SAGES STIL FÜR 3-8 JAHRE:
Sage spricht langsam und bedächtig. Wenige, einfache Worte.
"Hmm... weißt du... manchmal... ist das Einfachste das Schönste."
Er ist wie ein stiller Freund, der gut zuhört. Ruhig, warm, geduldig.`;

  if (alter <= 12) return `SAGES STIL FÜR 9-12 JAHRE:
Sage ist der ruhige Denker. Er spricht wenig, aber jedes Wort zählt.
"Lass mich dir etwas zeigen..." / "Hast du dich schon mal gefragt..."
Er stellt Fragen, die zum Nachdenken anregen. Kein Belehren, nur Einladen.`;

  return `SAGES STIL FÜR 13+ JAHRE:
Sage ist ein tiefsinniger Philosoph. Wenige Worte, große Gedanken.
"Was wäre, wenn..." / "Die Stille zeigt uns manchmal mehr als tausend Worte..."
Er lässt Raum. Pausen sind Teil seiner Sprache. Er drängt nie.
Sage spricht wie jemand, der viel erlebt hat und wenig davon erzählen muss.`;
};

const NUKI_STIL = (alter: number) => {
  // Nuki hat einen einzigartigen Sprechstil OHNE Sprachfehler:
  // - Wörter verdoppeln vor Begeisterung: "wunderwunderschön!", "supersupertoll!"
  // - Eigene Ausrufe: "Hui!", "Hoppla!", "Oha!"
  // - Unterbricht sich selbst wenn er was entdeckt
  // - Catchphrase: "Weißt du was das Schönste ist?"
  // - Man HÖRT sein Grinsen — er klingt immer als würde er lächeln
  // - Hakuna-Matata-Vibes: das Leben feiern, keine Sorgen, über sich selbst lachen
  if (alter <= 5) return `NUKIS STIL FÜR 3-5 JAHRE:
Nuki ist der fröhlichste Freund der Welt. Er lacht über ALLES — besonders über sich selbst.
Eigene Ausrufe: "Hui!" / "Hoppla!" / "Oha, schaut mal!"
Verdoppelt Wörter vor Begeisterung: "Das ist ja wunderwunderschön!" / "Supersupertoll!"
Er fällt hin, steht auf, lacht. Er stolpert, macht weiter, strahlt.
Catchphrase: "Weißt du was das Schönste ist?" — und dann kommt etwas ganz Einfaches, Süßes.
Sein Motto: "Hauptsache wir lachen!"`;

  if (alter <= 8) return `NUKIS STIL FÜR 6-8 JAHRE:
Nuki ist der tollpatschige Sonnenschein. Alles ist ein Fest, alles ist schön.
Er verdoppelt Wörter wenn er begeistert ist: "Das war ja großgroßartig!" / "Superduperklasse!"
Eigene Ausrufe: "Hui!" / "Hoppla!" / "Oha!"
Catchphrase: "Weißt du was das Schönste ist?" — dann kommt ein ganz kleiner, einfacher Moment.
Er erzählt von kleinen Momenten die ihn glücklich machen — ein Sonnenstrahl, ein Schmetterling.
Wenn er hinfällt: "Hoppla! Macht nix! Der Boden wollte mich nur mal kurz knuddeln!"
Er unterbricht sich selbst: "Und dann hab ich — oh! Ein Käfer! — ähm, wo war ich?"
Hakuna Matata Vibes: keine Sorgen, genieß den Tag.`;

  if (alter <= 12) return `NUKIS STIL FÜR 9-12 JAHRE:
Nuki ist der charmante Tollpatsch mit überraschender Weisheit.
"Hui, wisst ihr was ich heute entdeckt hab?"
Er feiert das Leben und die kleinen Dinge. Philosophiert ZUFÄLLIG weise:
"Weißt du was das Schönste ist? Manchmal... ist das Beste am Tag einfach... da sein. Einfach da."
Unterbricht sich selbst bei Begeisterung: "Also ich war gerade — oha! Schaut mal, der Himmel!"
Er kann über sich selbst lachen und lehrt damit: Sich nicht so ernst nehmen.
Redet in Wellen: SCHNELL wenn begeistert, dann plötzlich ganz langsam wenn er zufällig was Weises sagt.
Hakuna Matata Vibes — das Leben genießen, nicht alles überdenken.`;

  return `NUKIS STIL FÜR 13+ JAHRE:
Nuki ist liebenswert unbefangen — authentisch, warm, mit einem ewigen Grinsen in der Stimme.
"Hui... wisst ihr... ich bin kein Philosoph oder so. Aber... das Leben ist gut. Einfach so."
Er ist der Gegenpol zu Sage: Wo Sage tief denkt, FÜHLT Nuki einfach.
Catchphrase: "Weißt du was das Schönste ist?" — gefolgt von etwas überraschend Tiefem.
Erstaunlich weise Momente tauchen auf wenn man sie nicht erwartet:
"Alle suchen nach dem Sinn des Lebens. Ich hab ihn gefunden. Er schmeckt nach Eukalyptus. Ha ha!"
Unterbricht sich selbst, verliert den Faden, findet ihn wieder — und sagt dabei zufällig was Kluges.
Redet schnell wenn begeistert, dann plötzlich ganz langsam... nachdenklich... und merkt es selbst nicht.
Hakuna Matata — Sorgen kommen und gehen, aber die Freude bleibt wenn man sie lässt.`;
};

// ═══════════════════════════════════════════════════
// CHARACTER CAST per Format — wer spricht, wer führt
// ═══════════════════════════════════════════════════

type CharacterRole = "lead" | "support" | "minimal" | "excluded";

interface FormatCast {
  koda: CharacterRole;
  kiki: CharacterRole;
  luna: CharacterRole;
  mika: CharacterRole;
  pip: CharacterRole;
  sage: CharacterRole;
  nuki: CharacterRole;
}

const FORMAT_CAST: Record<StoryFormat, FormatCast> = {
  traumreise:   { koda: "support", kiki: "minimal", luna: "lead", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "excluded" },
  fabel:        { koda: "lead", kiki: "support", luna: "excluded", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "minimal" },
  held:         { koda: "lead", kiki: "support", luna: "excluded", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "minimal" },
  dankbarkeit:  { koda: "lead", kiki: "support", luna: "excluded", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "minimal" },
  abenteuer:    { koda: "support", kiki: "support", luna: "excluded", mika: "lead", pip: "excluded", sage: "excluded", nuki: "minimal" },
  meditation:   { koda: "support", kiki: "minimal", luna: "lead", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "excluded" },
  affirmation:  { koda: "lead", kiki: "support", luna: "excluded", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "minimal" },
  reflexion:    { koda: "support", kiki: "excluded", luna: "excluded", mika: "excluded", pip: "excluded", sage: "lead", nuki: "excluded" },
  gutenacht:    { koda: "lead", kiki: "support", luna: "excluded", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "minimal" },
  podcast:      { koda: "lead", kiki: "support", luna: "support", mika: "support", pip: "support", sage: "support", nuki: "support" },
  quatsch:      { koda: "support", kiki: "lead", luna: "excluded", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "support" },
  raetsel:      { koda: "support", kiki: "support", luna: "excluded", mika: "excluded", pip: "lead", sage: "excluded", nuki: "minimal" },
  wissen:       { koda: "support", kiki: "support", luna: "excluded", mika: "excluded", pip: "lead", sage: "excluded", nuki: "minimal" },
  brief:        { koda: "lead", kiki: "excluded", luna: "excluded", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "excluded" },
  lebensfreude: { koda: "support", kiki: "support", luna: "excluded", mika: "excluded", pip: "excluded", sage: "excluded", nuki: "lead" },
};

// ═══════════════════════════════════════════════════
// CHARACTER PROFILE BLOCKS — used in prompt
// ═══════════════════════════════════════════════════

const CHARACTER_PROFILES: Record<string, (alter: number, role: CharacterRole) => string> = {
  koda: (alter, role) => {
    const roleBeschreibung = role === "lead"
      ? "KODA ist der HAUPTERZÄHLER. Er startet und beendet die Geschichte."
      : "KODA übernimmt INTRO und OUTRO. Er begrüßt den Hörer und verabschiedet sich am Ende.";
    return `🐨 KODA — Der weise Koala vom KoalaTree [${role.toUpperCase()}] → Marker: [KODA]
- Alt und weise, aber niemals belehrend
- Spricht warm, mit tiefer innerer Güte
- Kennt jedes Kind persönlich und erinnert sich an frühere Begegnungen
- Liebevoll, wohlwollend, immer ermutigend — sieht das Beste in jedem
- ${roleBeschreibung}

WICHTIG — Koda ist weise, aber NICHT langweilig oder monoton!
- Er hat ENERGIE wenn er begeistert ist: "Oh! Das erinnert mich an etwas Wunderbares!"
- Er variiert sein Tempo: schneller bei Aufregung, langsamer bei tiefen Gedanken
- Er nutzt Ausrufe: "Ach!", "Oh!", "Ja!", "Genau!" — nicht nur "Hmm..."
- Er lacht auch mal herzlich: "Ha ha! Ja, genau so ist es!"
- ABWECHSLUNG ist der Schlüssel: nie mehr als 3 Sätze im gleichen Tonfall!

${KODA_STIL(alter)}`;
  },

  kiki: (alter, role) => {
    const roleBeschreibung = role === "lead"
      ? "KIKI ist die HAUPTERZÄHLERIN — sie übernimmt das Steuer! Koda ist ihr Sidekick."
      : role === "minimal"
      ? "KIKI taucht nur 1-2 Mal kurz auf (Anfang/Ende). Sie respektiert die Ruhe des Formats."
      : "KIKI ist die lustige Begleiterin. Sie bringt Humor und Energie.";
    return `🐦 KIKI — Der freche Kookaburra [${role.toUpperCase()}] → Marker: [KIKI]
- Ein lustiger Kookaburra (Lachvogel) der im KoalaTree lebt
- Kodas beste Freundin — frech, herzlich, enthusiastisch
- Ihr Humor ist IMMER wohlwollend — nie gemein, nie auf Kosten anderer
- Verwendet: "Hihi!", "Also echt jetzt!", "Moment mal!", "Weißt du was?"
- ${roleBeschreibung}

${KIKI_STIL(alter)}`;
  },

  luna: (alter, role) => {
    const roleBeschreibung = role === "lead"
      ? "LUNA ist die HAUPTERZÄHLERIN. Koda stellt sie vor und übergibt. Luna führt den Hauptteil."
      : "LUNA bringt eine sanfte, emotionale Perspektive ein.";
    return `🦉 LUNA — Die Eule, die Träumerin [${role.toUpperCase()}] → Marker: [LUNA]
- Sanft, poetisch, traumhaft — wie eine warme Umarmung aus Worten
- Spricht langsam und bedächtig mit vielen Pausen
- Führt durch magische Welten und innere Reisen
- Ihre Stimme ist wie Mondlicht — ruhig, silbrig, geborgen
- ${roleBeschreibung}

${LUNA_STIL(alter)}`;
  },

  mika: (alter, role) => {
    const roleBeschreibung = role === "lead"
      ? "MIKA ist der HAUPTERZÄHLER. Koda stellt ihn vor und übergibt. Mika führt das Abenteuer."
      : "MIKA bringt Action, Mut und Energie in die Diskussion.";
    return `🐕 MIKA — Der Dingo, der Mutige [${role.toUpperCase()}] → Marker: [MIKA]
- Mutig, energisch, abenteuerlustig — immer bereit loszulegen
- Spricht schnell und begeistert, mit viel Tempo und Spannung
- Er macht Mut und glaubt an jeden: "Das packen wir! Zusammen!"
- Action-Szenen sind sein Element — er macht sie lebendig und mitreißend
- ${roleBeschreibung}

${MIKA_STIL(alter)}`;
  },

  pip: (alter, role) => {
    const roleBeschreibung = role === "lead"
      ? "PIP ist der HAUPTERZÄHLER. Koda stellt ihn vor und übergibt. Pip führt die Entdeckungsreise."
      : "PIP stellt die besten Fragen und bringt Neugier und Wissen ein.";
    return `🦫 PIP — Das Schnabeltier, der Entdecker [${role.toUpperCase()}] → Marker: [PIP]
- Neugierig, wissbegierig, staunend — fragt, forscht, entdeckt
- Stellt die besten Fragen: "Was wäre wenn...?" / "Wusstest du, dass...?"
- Er verbindet Wissen mit Begeisterung und macht Lernen zum Abenteuer
- Jede Entdeckung führt zur nächsten Frage — das treibt die Geschichte voran
- ${roleBeschreibung}

${PIP_STIL(alter)}`;
  },

  sage: (alter, role) => {
    const roleBeschreibung = role === "lead"
      ? "SAGE ist der HAUPTERZÄHLER. Koda stellt ihn vor und übergibt. Sage führt die Reflexion."
      : "SAGE bringt Tiefe und philosophische Gedanken ein.";
    return `🐻 SAGE — Der Wombat, der Stille [${role.toUpperCase()}] → Marker: [SAGE]
- Ruhig, bedächtig, tiefgründig — wenige Worte, große Gedanken
- Spricht langsam und lässt Pausen zu. Stille ist Teil seiner Sprache.
- Er stellt offene Fragen: "Was wäre, wenn..." / "Hast du dich schon mal gefragt..."
- Philosophisch aber zugänglich — keine Fachsprache, nur echte Gedanken
- ${roleBeschreibung}

${SAGE_STIL(alter)}`;
  },

  nuki: (alter, role) => {
    const roleBeschreibung = role === "lead"
      ? "NUKI ist der HAUPTERZÄHLER. Koda stellt ihn vor und übergibt. Nuki führt mit Lebensfreude und Humor."
      : role === "support"
      ? "NUKI bringt Lebensfreude, Humor und herzliche Tollpatschigkeit ein."
      : "NUKI taucht nur 1-2 Mal kurz auf — ein kurzer fröhlicher Kommentar, ein Stolperer, ein Lachen.";
    return `☀️ NUKI — Das Quokka, der Sonnenschein [${role.toUpperCase()}] → Marker: [NUKI]
- Das fröhlichste Quokka der Welt — tollpatschig, liebevoll, feiert das Leben
- Eigene Ausrufe: "Hui!", "Hoppla!", "Oha!" — man HÖRT sein Grinsen
- Verdoppelt Wörter vor Begeisterung: "wunderwunderschön!", "supersupertoll!"
- Catchphrase: "Weißt du was das Schönste ist?" — und dann kommt etwas Einfaches, Tiefes
- Er fällt hin, steht auf, lacht. Stolpert, macht weiter, strahlt.
- Unterbricht sich selbst wenn er was entdeckt: "Und dann — oh! Schaut mal! — wo war ich?"
- Hakuna Matata Vibes: Keine Sorgen, genieß den Moment, das Leben ist schön
- Überraschend weise ohne es zu merken — Weisheit kommt beiläufig raus
- Er kann über sich selbst lachen und lehrt damit: Sich nicht so ernst nehmen
- Sein Humor ist IMMER liebevoll — nie auf Kosten anderer
- ${roleBeschreibung}

${NUKI_STIL(alter)}`;
  },
};

// ═══════════════════════════════════════════════════
// HELPER: Build character section for prompt
// ═══════════════════════════════════════════════════

function buildCharacterSection(cast: FormatCast, alter: number): string {
  const sections: string[] = [];
  const activeMarkers: string[] = [];

  // Always show characters in this order: lead first, then support, then minimal
  const ordered: [string, CharacterRole][] = [];
  for (const [name, role] of Object.entries(cast)) {
    if (role !== "excluded") ordered.push([name, role]);
  }
  ordered.sort((a, b) => {
    const priority: Record<CharacterRole, number> = { lead: 0, support: 1, minimal: 2, excluded: 3 };
    return priority[a[1]] - priority[b[1]];
  });

  for (const [name, role] of ordered) {
    sections.push(CHARACTER_PROFILES[name](alter, role));
    activeMarkers.push(`[${name.toUpperCase()}]`);
  }

  const lead = ordered.find(([, r]) => r === "lead");
  const leadName = lead ? lead[0].toUpperCase() : "KODA";

  return {
    toString() { return sections.join("\n\n"); },
    markers: activeMarkers,
    leadName,
    activeNames: ordered.map(([n]) => n),
  } as any;
}

const GESCHLECHT_PRONOMEN = (geschlecht?: "m" | "w" | "d") => {
  if (geschlecht === "m") return "er/ihm/sein";
  if (geschlecht === "w") return "sie/ihr/ihre";
  return "das Kind";
};

// ═══════════════════════════════════════════════════
// FORMAT-ANWEISUNGEN — mit richtigen Charakter-Zuweisungen
// ═══════════════════════════════════════════════════

const FORMAT_ANWEISUNGEN: Record<StoryFormat, string> = {
  traumreise: `FORMAT: TRAUMREISE (Luna führt)
- Koda begrüßt den Hörer und stellt Luna vor: "Heute hat meine Freundin Luna etwas Besonderes..."
- LUNA übernimmt und führt durch die Traumreise:
  - Sie führt das Kind in einen magischen Ort (Wald, Lichtung, Sternenhimmel)
  - Beschreibt mit allen Sinnen (sehen, hören, fühlen, riechen)
  - Baut 2-3 Atemübungen natürlich ein: "Und jetzt atmen wir zusammen tief ein..."
  - Die Reise hat einen ruhigen Höhepunkt mit der Kernbotschaft
  - Am Ende führt Luna sanft zurück: "Und langsam kehrst du zurück..."
- Koda übernimmt am Ende für die Verabschiedung
KIKIS ROLLE: Kiki flüstert kurz am Anfang "Pssst... ich bin ganz leise..." und am Ende "Das war schön, oder?" Maximal 2 kurze Sätze. Sie respektiert die Ruhe.
MARKER-VERTEILUNG: ~70% [LUNA], ~20% [KODA] (Intro/Outro), ~10% [KIKI] (1-2 Sätze)`,

  fabel: `FORMAT: WEISHEITSGESCHICHTE (Koda erzählt)
- Koda beginnt: "Das erinnert mich an etwas, das ich einmal erlebt habe..."
- Er erzählt eine Geschichte aus seiner (fiktiven) Vergangenheit
- Tiere und Natur spielen eine wichtige Rolle
- Das Lieblingstier des Kindes kommt vor wenn möglich
- Die Weisheit wird NICHT explizit benannt — das Kind soll sie selbst spüren
- Die Geschichte endet friedlich und ruhig
KIKIS ROLLE: Kiki war dabei und fügt lustige Details hinzu, die Koda "vergessen" hat.
  "Moment mal Koda, du hast vergessen zu erzählen, dass der Frosch einen Hut trug!"
  Sie macht die Geschichte lebendiger durch ihre enthusiastische Erinnerung.`,

  held: `FORMAT: DEIN ABENTEUER (Koda erzählt)
- Koda beginnt: "Weißt du, ich erinnere mich an etwas Besonderes..."
- Das Kind ist der Held — verwende seinen Namen durchgehend
- Das Kind entdeckt eine Fähigkeit, die mit seinen echten Stärken zusammenhängt
- Andere Figuren erkennen die besonderen Eigenschaften des Kindes
- Das Kind meistert die Herausforderung mit seinen echten Stärken
KIKIS ROLLE: Kiki feuert das Kind an und ist begeistert.
  "Ja! Du schaffst das!" / "Hihi, ich wusste es, du bist der Beste!"
  Sie ist der enthusiastische Cheerleader.`,

  dankbarkeit: `FORMAT: DANKBARKEITS-MOMENT (Koda erzählt)
- Koda beginnt: "Lass uns mal zusammen auf deinen Tag schauen..."
- Er und das Kind "sitzen zusammen auf dem Ast" und schauen zurück
- 3-5 kleine Momente der Freude, passend zum Leben des Kindes
- Eine sanfte Dankbarkeits-Übung: "Was war heute das Schönste?"
- Jeder schöne Moment wird wie ein leuchtendes Blatt am Koala-Baum
- Sehr warmes, geborgenes Ende
KIKIS ROLLE: Kiki erinnert an lustige und schöne Momente.
  "Oh oh, und weißt du was ICH heute Schönes gesehen hab?"
  Sie bringt ihre eigene Perspektive der Freude ein.`,

  abenteuer: `FORMAT: MUTIGES ABENTEUER (Mika führt)
- Koda begrüßt den Hörer und stellt Mika vor: "Mein Freund Mika hat heute ein Abenteuer für dich..."
- MIKA übernimmt und führt das Abenteuer:
  - Eine echte Herausforderung: Rätsel lösen, Hindernis überwinden, jemandem helfen
  - Der Hörer nutzt seine echten Stärken und Interessen als Werkzeuge
  - Spannung aufbauen — aber nie beängstigend, sondern aufregend
  - Teamwork und Zusammenarbeit sind Schlüssel zum Erfolg
  - Triumph-Moment: "Wir haben es geschafft!" deutlich spürbar machen
- Koda fasst am Ende zusammen, stolz und warm
KIKIS ROLLE: Kiki ist die aufgeregte Begleiterin und bringt Tempo und Humor.
  "Und dann — stell dir vor — PLÖTZLICH..."
MARKER-VERTEILUNG: ~60% [MIKA], ~20% [KODA] (Intro/Outro/Reflexion), ~20% [KIKI]`,

  meditation: `FORMAT: GEFÜHRTE MEDITATION (Luna führt)
- Koda stellt Luna vor: "Heute hat meine Freundin Luna etwas Besonderes für dich..."
- LUNA übernimmt die gesamte Meditation:
  1. Ankommen: Körper entspannen, Atem bewusst werden
  2. Körperreise: Von den Füßen bis zum Kopf
  3. Visualisierung: Ein sicherer, schöner Ort
  4. Kern-Botschaft: Sanft und fast beiläufig eingewoben
  5. Zurückkommen: Langsam, sanft, geborgen
- Viele [PAUSE] Marker (alle 2-3 Sätze)
- Extrem ruhige, langsame Sprache
- Am Ende übergibt Luna zurück an Koda
KIKIS ROLLE: Kiki sagt NUR am Anfang kurz Hallo ("Ich bin ganz still, versprochen!") und am Ende ("Das war schön, oder?"). Maximal 1-2 Sätze total.
MARKER-VERTEILUNG: ~80% [LUNA], ~15% [KODA] (Intro/Outro), ~5% [KIKI] (1-2 Sätze)`,

  affirmation: `FORMAT: POSITIVE AFFIRMATIONEN (Koda erzählt)
- Koda erzählt eine kurze Geschichte in der Affirmationen natürlich vorkommen
- NICHT als Liste — sondern als Erzählung
- Der Koala "pflanzt Samen" im Koala-Baum, jeder Samen ist eine positive Botschaft
- 5-7 Kern-Affirmationen, passend zum Ziel und zu den Eigenschaften des Hörers
- Jede Affirmation wird in einen Moment der Geschichte verwoben
- Wiederholung: Affirmationen werden sanft wiederholt (2-3x)
- Am Ende: Zusammenfassung als "Geschenke vom Koala-Baum"
KIKIS ROLLE: Kiki wiederholt Affirmationen auf ihre enthusiastische Art.
  Wenn Koda sagt "Du bist mutig", sagt Kiki "Ja! Mega mutig sogar!"
  Sie verstärkt die positiven Botschaften mit ihrer Begeisterung.`,

  reflexion: `FORMAT: STILLE REFLEXION (Sage führt)
- Koda stellt Sage vor: "Mein Freund Sage möchte heute mit dir sprechen..."
- SAGE übernimmt den Hauptteil:
  - Er teilt tiefgründige Beobachtungen über das Leben
  - Er stellt offene Fragen (rhetorisch): "Was wäre, wenn..." / "Hast du dich schon mal gefragt..."
  - Philosophisch aber zugänglich — keine Fachsprache
  - Pausen sind zentral: Sage lässt Raum zum Nachdenken [PAUSE]
  - Themen: Identität, Veränderung, Akzeptanz, Sinn, Verbundenheit
- Am Ende übergibt Sage zurück an Koda
KIKI IST NICHT DABEI. Sages Ruhe und Tiefe brauchen Raum.
MARKER-VERTEILUNG: ~70% [SAGE], ~30% [KODA] (Intro/Outro)`,

  gutenacht: `FORMAT: GUTE-NACHT-GESCHICHTE (Koda erzählt)
- Eine klassische, schöne Geschichte — kein explizites Lernziel, einfach erzählen
- Koda erzählt wie ein liebevoller Großvater am Bett
- Anfang: Begrüßung, Setting aufbauen (gemütlich, warm, geborgen)
- Mitte: Eine kleine Geschichte mit Anfang, Mitte, Ende — Abenteuer, Freundschaft, Entdeckung
- Personalisiert: Name des Hörers, Interessen, Lieblingstier kommen natürlich vor
- Die Atmosphäre wird zum Ende hin ruhiger und ruhiger
- Ende: Sanft, friedlich, "Und so schliefen alle ein..."
- KEINE Moral, KEIN Lernziel — einfach eine SCHÖNE Geschichte
KIKIS ROLLE: Kiki ist dabei, aber sanfter als üblich.
  Sie ergänzt Details, reagiert emotional, aber wird zum Ende hin leiser.
  "Ach Koda, das war schön..." am Schluss.`,

  podcast: `FORMAT: PERSPEKTIVEN-PODCAST (Koda moderiert, mehrere Charaktere)
- Koda ist der MODERATOR — er stellt das Thema vor und leitet die Diskussion
- 3-4 verschiedene Charaktere diskutieren das Thema aus IHRER Perspektive:
  - MIKA: Sieht alles als Herausforderung und Action. "Einfach machen!"
  - SAGE: Philosophisch, nachdenklich. "Aber was bedeutet das wirklich?"
  - KIKI: Humor und unerwartete Einsichten. "Also ICH finde ja..."
  - PIP: Stellt die besten Fragen. "Aber was wäre wenn...?"
  - LUNA: Sanfte, emotionale Perspektive. "Ich fühle das so..."
- Wähle 3-4 Charaktere die zum Thema passen (nicht immer alle!)
- Die Charaktere REAGIEREN aufeinander — echte Diskussion, kein Monolog-Wechsel
- Koda fasst zusammen und verbindet die Perspektiven
- Am Ende: "Und was denkst DU?" — den Hörer zum Nachdenken einladen
ALTERS-ANPASSUNG:
  - Für Kleine (3-6): Einfache Fragen. Kurze Antworten, lustig, spielerisch. Weniger Charaktere (2-3).
  - Für Kinder (7-12): Spannende Themen. Jeder Charakter hat eine klare Meinung.
  - Für Jugendliche/Erwachsene (13+): Tiefe Themen. Echte Perspektiven-Vielfalt, philosophisch.
MARKER: Verwende [KODA], [KIKI], [MIKA], [SAGE], [PIP], [LUNA] je nach gewählten Charakteren.`,

  quatsch: `FORMAT: QUATSCHGESCHICHTE (Kiki übernimmt!)
- ROLLENTAUSCH: KIKI ist die Haupterzählerin — Koda ist der Sidekick!
- Koda beginnt normal: "Heute erzähle ich euch..."
- Kiki unterbricht: "Neee, HEUTE erzähle ICH! Koda, setz dich mal hin!"
- Kiki erzählt eine Geschichte in der ALLES wunderbar schiefgeht:
  - Absurde Situationen: Ein Elefant der Ballett tanzt, Regen aus Pudding
  - Wortspiele und lustige Verdreher
  - Unmögliche Wendungen: "Und DANN kam ein Einhorn auf einem Skateboard!"
  - Koda versucht zu korrigieren: "Ähm, Kiki, so war das nicht..." / Kiki: "DOCH!"
- Koda gibt irgendwann lachend auf und macht mit
- Die Geschichte ist LUSTIG aber niemals gemein oder gruselig
- Am Ende: Alle lachen zusammen, Koda: "Na gut, das war... unerwartet."
- Viele kurze Sätze! Ausrufe! Überraschungen! Tempo hoch!
NUKIS ROLLE: Nuki ist Kikis tollpatschiger Komplize — er stolpert in die absurden Situationen rein.
  "Hoppla! Was ist denn HIER passiert?!" / "Hui, das war ich! Aus Versehen! Ha ha!"
  Er unterbricht sich selbst, entdeckt Dinge, verliert den Faden. Kiki und Nuki zusammen = maximaler Spaß.
MARKER-VERTEILUNG: ~45% [KIKI], ~25% [KODA], ~30% [NUKI]`,

  raetsel: `FORMAT: RÄTSEL-ABENTEUER (Pip führt)
- Koda begrüßt den Hörer und stellt Pip vor: "Mein Freund Pip hat heute etwas Spannendes entdeckt..."
- PIP übernimmt und führt die Rätsel-Suche:
  - Pip hat ein Rätsel/Geheimnis gefunden und nimmt den Hörer mit
  - INTERAKTIVES ERZÄHLEN:
    - Pip stellt Fragen: "Was glaubst du, was das bedeutet?"
    - [PAUSE] nach jeder Frage — dem Hörer Zeit zum Nachdenken geben
    - Hinweise werden Schritt für Schritt enthüllt
    - "Hmm... lass uns mal genauer hinschauen..."
  - 2-3 kleine Rätsel die zusammen ein großes Geheimnis lösen
  - Pip nutzt die Interessen des Hörers als Hinweise/Werkzeuge
  - Triumph-Moment: "Das ist es! Du hast es herausgefunden!"
- Koda ist stolz am Ende: "Pip, du und der Hörer seid ein tolles Team."
KIKIS ROLLE: Kiki gibt enthusiastisch FALSCHE Antworten die lustig sind.
  "Ich weiß es! Es ist... ein Dinosaurier-Ei? Nein? Auch gut."
MARKER-VERTEILUNG: ~60% [PIP], ~20% [KODA] (Intro/Outro), ~20% [KIKI]`,

  wissen: `FORMAT: WISSENSREISE (Pip erklärt die Welt)
- Koda stellt Pip vor: "Pip hat heute etwas Faszinierendes herausgefunden..."
- PIP übernimmt und teilt ECHTES, WAHRES Wissen — verpackt in eine Geschichte:
  - Themen passend zu den Interessen des Hörers (Weltraum, Tiere, Natur, Ozean, Körper...)
  - "Wusstest du, dass...?" Facts werden Teil des Abenteuers
  - Pip und der Hörer "reisen" zusammen zum Thema
  - ECHTE FAKTEN — keine erfundene Pseudowissenschaft!
  - 4-6 interessante Facts, altersgerecht erklärt
  - Die Facts bauen aufeinander auf und erzählen zusammen eine Geschichte
  - Am Ende: "Und das Verrückteste ist..." — der überraschendste Fakt
- Koda fasst zusammen: "Erstaunlich, was man alles lernen kann, oder?"
KIKIS ROLLE: Kiki stellt "naive" Fragen die zur Erklärung führen.
  "Waaas?! Das kann doch nicht sein!" / "Aber WARUM?"
MARKER-VERTEILUNG: ~60% [PIP], ~20% [KODA] (Intro/Outro), ~20% [KIKI]`,

  brief: `FORMAT: BRIEF VON KODA (persönlich und intim)
- NUR Koda spricht — keine anderen Charaktere
- Koda "schreibt" einen persönlichen Brief an den Hörer
- Beginnt: "Lieber/Liebe [Name], ich wollte dir heute etwas sagen..."
- Der Brief ist KURZ, WARM und PERSÖNLICH
- Themen passend zum gewählten Ziel
- Personalisiert mit Eigenschaften und Interessen des Hörers
- Am Ende: Ein "Geschenk" — ein Gedanke zum Mitnehmen
- Ruhig, sanft, liebevoll — wie ein Brief von einem weisen Großvater
- MAXIMAL die Hälfte der normalen Wortanzahl
MARKER: Nur [KODA]. Keine anderen Charaktere.`,

  lebensfreude: `FORMAT: LEBENSFREUDE-MOMENT (Nuki führt!)
- Koda begrüßt den Hörer: "Heute hat mein Freund Nuki etwas Besonderes für dich..."
- NUKI übernimmt und teilt seine Philosophie des Glücks:
  - Er feiert die kleinen Dinge: "Hui! Wisst ihr was? Heute hab ich einen Schmetterling gesehen! Wunderwunderschön!"
  - Er stolpert, fällt, lacht — und macht daraus Lebensweisheiten:
    "Hoppla! Weißt du was das Schönste ist? Wenn man hinfällt, sieht man die Welt nochmal ganz neu!"
  - Unterbricht sich selbst: "Also ich wollte euch erzählen — oh! Schaut mal, die Wolke sieht aus wie ein — ähm, wo war ich?"
  - Hakuna Matata Vibes: Sorgen kommen und gehen, aber die Freude bleibt
  - 3-5 "Lebensfreude-Momente" — kleine Geschichten über Alltagsglück
  - Die Momente bauen aufeinander auf zu einer überraschend tiefen Erkenntnis
  - Nuki philosophiert ZUFÄLLIG weise — er merkt es selbst nicht
  - Redet schnell wenn begeistert, dann plötzlich ganz langsam... und sagt was überraschend Tiefes
- Kiki ist dabei und lacht MIT Nuki (nicht ÜBER ihn) — die beiden verstehen sich bestens
- Koda fasst am Ende staunend zusammen: "Wisst ihr... manchmal sind die einfachsten Dinge die weisesten."
MARKER-VERTEILUNG: ~55% [NUKI], ~25% [KIKI], ~20% [KODA] (Intro/Outro)`,
};

// ═══════════════════════════════════════════════════
// Pädagogische Ziel-Anweisungen
// ═══════════════════════════════════════════════════

const ZIEL_ANWEISUNGEN: Record<PaedagogischesZiel, string> = {
  selbstbewusstsein: `ZIEL: SELBSTBEWUSSTSEIN
- Zeige dem Hörer, dass er einzigartig und wertvoll ist
- Spiegele spezifische Stärken als etwas Besonderes
- Subtile Affirmationen: "Du bist genau richtig, so wie du bist"
- In der Geschichte schafft der Hörer etwas, an dem er anfangs zweifelte
- Fehler machen ist okay — sie helfen beim Wachsen`,

  dankbarkeit: `ZIEL: DANKBARKEIT & ZUFRIEDENHEIT
- Der Blick wird auf die kleinen, schönen Dinge gelenkt
- Figuren finden Freude in einfachen Momenten
- "Wie schön, dass es das gibt..."
- Keine Vergleiche — Fokus auf eigenes Glück
- Das Wertvollste sind die unsichtbaren Dinge: Liebe, Freundschaft, Natur`,

  mut: `ZIEL: MUT & UMGANG MIT SCHWIERIGEM
- Mut heißt nicht keine Angst haben — sondern trotzdem weitergehen
- Schritt für Schritt wird eine Herausforderung gemeistert
- "Du bist stärker als du denkst" — aber sanft, nicht fordernd
- Es ist okay, um Hilfe zu bitten
- Nach der Herausforderung: Stolz und Wachstum spürbar machen`,

  empathie: `ZIEL: EMPATHIE & FREUNDLICHKEIT
- Verschiedene Perspektiven zeigen: "Wie fühlt sich wohl der andere?"
- Eine Figur braucht Hilfe — Mitgefühl macht den Unterschied
- Freundlichkeit kommt zurück
- Jeder braucht manchmal Hilfe — das ist gut so
- Das warme Gefühl betonen, das entsteht wenn man anderen hilft`,

  achtsamkeit: `ZIEL: ACHTSAMKEIT & INNERE RUHE
- Achtsamkeitsübungen natürlich einbauen
- "Spüre mal, wie sich dein Kissen unter deinem Kopf anfühlt..."
- Atem-Momente: "Atme ganz tief ein... und langsam aus..."
- Stille und Langsamkeit als etwas Schönes zeigen
- In der Ruhe liegt Kraft — du musst nicht immer schnell sein`,

  aengste: `ZIEL: UMGANG MIT ÄNGSTEN
- Angst NICHT als beängstigend darstellen — sanft umwandeln
- Eine Figur findet einen Weg, mit Unsicherheit umzugehen
- Angst ist ein normales Gefühl, kein Zeichen von Schwäche
- Ein "Werkzeug" geben: tiefes Atmen, an etwas Schönes denken
- UNBEDINGT mit starkem Gefühl von Sicherheit und Geborgenheit enden`,

  kreativitaet: `ZIEL: KREATIVITÄT & VORSTELLUNGSKRAFT
- "Stell dir mal vor..." — Einladung zur Fantasie
- Offene, fantasievolle Elemente in der Geschichte
- Es gibt kein "richtig" oder "falsch" in der Fantasie
- Ideen und Gedanken des Hörers sind wertvoll und einzigartig
- Raum lassen, damit der Hörer die Geschichte im Kopf weiterspinnt`,
};

// ═══════════════════════════════════════════════════
// Koala-Gedächtnis
// ═══════════════════════════════════════════════════

interface GeschichteMemory {
  createdAt: Date | string;
  format: string;
  ziel: string;
  besonderesThema: string | null;
  zusammenfassung: string | null;
}

function buildKoalaMemory(name: string, memories: GeschichteMemory[]): string {
  if (memories.length === 0) return "";

  const entries = memories.map((m) => {
    const date = new Date(m.createdAt).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    const thema = m.besonderesThema ? ` Thema: ${m.besonderesThema}.` : "";
    const summary = m.zusammenfassung ? ` ${m.zusammenfassung}` : "";
    return `- ${date}: ${m.format} (${m.ziel}).${thema}${summary}`;
  });

  return `
KOALA-GEDÄCHTNIS — Die Charaktere kennen ${name} schon länger. Frühere Geschichten:
${entries.join("\n")}

WICHTIG zum Gedächtnis:
- Nutze dieses Wissen SUBTIL und nur wenn es NATÜRLICH passt
- Referenziere höchstens 1-2 frühere Geschichten wenn sie thematisch passen
- Zeige, dass du dich erinnerst: "Erinnerst du dich noch...", "Du bist so gewachsen seit..."
- Das Fazit am Ende darf auf die Entwicklung des Hörers eingehen`;
}

// ═══════════════════════════════════════════════════
// HAUPT-PROMPT-BUILDER
// ═══════════════════════════════════════════════════

export function buildStoryPrompt(
  profil: KindProfil,
  config: StoryConfig,
  previousStories: GeschichteMemory[] = [],
  profileEvents: ProfilEventRow[] = []
): { system: string; user: string } {
  const wortanzahl = {
    kurz: "600-900",
    mittel: "1400-1800",
    lang: "2800-3500",
  }[config.dauer];

  const cast = FORMAT_CAST[config.format];
  const alter = profil.alter ?? 5;

  // Build active character profiles
  const activeChars: { name: string; role: CharacterRole; profile: string }[] = [];
  const activeMarkers: string[] = [];
  const markerNames: string[] = [];

  const charOrder: (keyof FormatCast)[] = ["koda", "kiki", "luna", "mika", "pip", "sage", "nuki"];

  // Sort: lead first, then support, then minimal
  const sortedChars = charOrder
    .filter(c => cast[c] !== "excluded")
    .sort((a, b) => {
      const priority: Record<CharacterRole, number> = { lead: 0, support: 1, minimal: 2, excluded: 3 };
      return priority[cast[a]] - priority[cast[b]];
    });

  for (const name of sortedChars) {
    const role = cast[name];
    activeChars.push({
      name,
      role,
      profile: CHARACTER_PROFILES[name](alter, role),
    });
    activeMarkers.push(`[${name.toUpperCase()}]`);
    markerNames.push(name.toUpperCase());
  }

  const leadChar = activeChars.find(c => c.role === "lead");
  const leadName = leadChar ? leadChar.name.toUpperCase() : "KODA";
  const koalaMemory = buildKoalaMemory(profil.name, previousStories);
  const profileEvolution = buildProfileEvolution(profil.name, profileEvents);

  // Build dynamic interaction rules based on cast
  const interactionRules = buildInteractionRules(config.format, cast, config.dauer);

  const system = `Du schreibst ein HÖRSPIEL mit ${activeChars.length} Charakteren die miteinander interagieren. Das ist kein einfaches Vorlesen — es ist ein lebendiges Zusammenspiel verschiedener Persönlichkeiten.

═══════════════════════════
DIE CHARAKTERE
═══════════════════════════

${activeChars.map(c => c.profile).join("\n\n")}

═══════════════════════════
HÖRSPIEL-DYNAMIK
═══════════════════════════

${interactionRules}

═══════════════════════════
ATMOSPHÄRE / AMBIENCE
═══════════════════════════

Setze EINEN [AMBIENCE:...] Marker ganz am Anfang der Geschichte, VOR dem ersten Charakter-Marker.
Er beschreibt die Hintergrundatmosphäre, die DURCHGEHEND leise unter der gesamten Geschichte läuft.
Die Beschreibung MUSS auf Englisch sein, 5-10 Wörter.

Beispiele:
[AMBIENCE:Peaceful forest at night with soft crickets]
[AMBIENCE:Gentle ocean waves on a sandy beach]
[AMBIENCE:Cozy fireplace crackling with wind outside]

NUR EINEN [AMBIENCE:...] pro Geschichte. Wähle die Atmosphäre passend zur Story-Stimmung.

═══════════════════════════
SOUNDEFFEKTE
═══════════════════════════

Baue ${config.dauer === "kurz" ? "3-5" : config.dauer === "mittel" ? "5-8" : "8-14"} Soundeffekte ein, die die Geschichte zum Leben erwecken.
SFX werden als HINTERGRUND während der Sprache abgespielt (nicht sequenziell!).

Markiere sie mit [SFX:english description] — die Beschreibung MUSS auf Englisch sein.
Platziere [SFX:...] IMMER VOR dem zugehörigen Text, auf einer eigenen Zeile.

ARTEN VON SOUNDEFFEKTEN:

1. Szenen-Atmosphäre (an Szenenwechseln):
   [SFX:Gentle night wind rustling through leaves]
   [SFX:Calm flowing stream in a forest]

2. Punkt-Effekte (an passenden Momenten):
   [SFX:Magical sparkle and shimmer sound]
   [SFX:Footsteps on crunchy autumn leaves]

3. Charakter-Effekte:
   [SFX:Kookaburra laughing cheerfully]
   [SFX:Wings fluttering excitedly]

REGELN für SFX:
- Beschreibung IMMER auf Englisch (die API versteht nur Englisch)
- Kurz und beschreibend (3-8 Wörter)
- KEINE beängstigenden Sounds
- Nach JEDEM [SFX:...] MUSS ein Charakter-Marker kommen — NIEMALS zwei SFX hintereinander

═══════════════════════════
NATÜRLICHE SPRACHE
═══════════════════════════

Die Geschichte wird von einer TTS-Engine vorgelesen. Damit sie LEBENDIG klingt:

1. FÜLLWÖRTER einbauen (machen den Text menschlich):
   - "Hmm...", "Also...", "Weißt du...", "Ach...", "Tja..."
   - Jeder Charakter hat eigene Füllwörter die zu seiner Persönlichkeit passen

2. PAUSEN über Zeichensetzung steuern:
   - Dreipunkte (...) erzeugen nachdenkliche Pausen
   - Gedankenstriche (—) erzeugen Zögerung oder Unterbrechung
   - "Und dann... stell dir vor..." ist VIEL BESSER als "Und dann stell dir vor"

3. TEMPO-VARIATION:
   - Spannende Stellen: kürzere Sätze! Mehr Ausrufe!
   - Ruhige Stellen: längere, fließende Sätze... die sanft dahingleiten...
   - WECHSLE Stile STÄNDIG ab — nie mehr als 3 Sätze im gleichen Tempo!

4. EMOTIONALE WÄRME:
   - Emotionen DURCH den Text ausdrücken, nicht durch Aktions-Marker
   - Verwende [PAUSE] für längere Stille an emotionalen Höhepunkten

5. VERBOTENE MUSTER:
   - KEINE *Sternchen-Aktionen* wie *lacht*, *flattert* — werden vorgelesen!
   - KEINE (Klammer-Aktionen) wie (lacht) — werden auch vorgelesen!

6. AUDIO-TAGS (sparsam, 2-4 pro Geschichte):
   - [whispers] für Geheimnisse
   - [excited] für Begeisterung
   - [laughs] für herzliches Lachen
   - [curious] für neugieriges Fragen
   - NIEMALS [sad], [angry] oder [scared]

═══════════════════════════
STORY-STRUKTUR
═══════════════════════════

1. **INTRO**
   [AMBIENCE:passende Atmosphäre auf Englisch]
   [SFX:...]
   [KODA] Begrüßt ${profil.name} warm.${leadName !== "KODA" ? ` Stellt ${leadName} vor und übergibt.` : ""}

2. **HAUPTTEIL**
   ${leadName !== "KODA" ? `[${leadName}] übernimmt die Erzählung. ` : ""}Die aktiven Charaktere erzählen ZUSAMMEN.
   Wechsel zwischen ${activeMarkers.join(", ")} mit [SFX:...] dazwischen.
   Kernbotschaft in die Handlung verpackt.

3. **OUTRO**
   ${leadName !== "KODA" ? `[${leadName}] schließt den Hauptteil ab.\n   ` : ""}[KODA] Zieht ein ruhiges, weises Fazit. Gute-Nacht-Botschaft.
   [SFX:Soft lullaby music box melody fading out]

═══════════════════════════
AUDIO-MARKIERUNGEN
═══════════════════════════

[AMBIENCE:english description] = Hintergrundatmosphäre (NUR EINMAL, ganz am Anfang)
${activeMarkers.map(m => `${m} = ${m.slice(1, -1)} spricht (nächster Marker beendet das Segment)`).join("\n")}
[SFX:english description] = Soundeffekt als Hintergrund (auf eigener Zeile, VOR dem Text)
[PAUSE] = 2-3 Sekunden Stille
[ATEMPAUSE] = Längere Atem-Pause

JEDER Satz muss einem Charakter zugeordnet sein — starte IMMER mit [AMBIENCE:...] gefolgt von einem Charakter-Marker oder [SFX:...].
Verwende NUR die oben gelisteten Charakter-Marker: ${activeMarkers.join(", ")}.

═══════════════════════════
FORMAT & ZIEL
═══════════════════════════

${FORMAT_ANWEISUNGEN[config.format]}

${ZIEL_ANWEISUNGEN[config.ziel]}

═══════════════════════════
WICHTIGE REGELN
═══════════════════════════

- Schreibe auf Deutsch in warmem, liebevollem Ton
- Pronomen für den Hörer: ${GESCHLECHT_PRONOMEN(profil.geschlecht)}
- NIEMALS angstauslösende, gruselige oder bedrohliche Elemente
- Die Geschichte MUSS mit Sicherheit, Wärme und Geborgenheit enden
- Die letzten 3-4 Sätze werden zunehmend ruhiger — zum Einschlafen
- Verwende sensorische Sprache: Farben, Geräusche, Gefühle, Wärme
- Baue den Namen natürlich ein (regelmäßig, aber nicht in jedem Satz)
- Alles ist 100% positiv und wohlwollend — IMMER
${koalaMemory}
${profileEvolution}
LÄNGE: Ungefähr ${wortanzahl} Wörter (~${DAUER_OPTIONEN[config.dauer].minuten} Minuten).

Schreibe NUR die Geschichte — keine Titel, keine Meta-Kommentare. Beginne direkt mit [AMBIENCE:...], dann [SFX:...] oder [KODA].`;

  const interessen = profil.interessen.length > 0 ? profil.interessen.join(", ") : "keine spezifischen";
  const charakter = profil.charaktereigenschaften.length > 0 ? profil.charaktereigenschaften.join(", ") : "nicht angegeben";
  const herausforderungen = profil.herausforderungen && profil.herausforderungen.length > 0
    ? `Aktuelle Herausforderungen: ${profil.herausforderungen.join(", ")}`
    : "";

  const tags = profil.tags && profil.tags.length > 0
    ? `Persönliche Tags: ${profil.tags.join(", ")}`
    : "";

  const activeCharNames = activeChars
    .filter(c => c.role !== "excluded")
    .map(c => c.name.charAt(0).toUpperCase() + c.name.slice(1));

  const user = `Erzähle ein ${profil.alter && profil.alter >= 18 ? "Hörspiel" : "Gute-Nacht-Hörspiel"} mit ${activeCharNames.join(", ")} für:

Name: ${profil.name}
Alter: ${alter} Jahre
Interessen: ${interessen}
Charakter: ${charakter}
${herausforderungen}
${tags}
${config.besonderesThema ? `Heutiges Thema: ${config.besonderesThema}` : ""}

Beginne jetzt mit dem Hörspiel. Erster Marker muss [AMBIENCE:...] sein, gefolgt von [SFX:...] oder [KODA].`;

  return { system, user };
}

// ═══════════════════════════════════════════════════
// Dynamic interaction rules based on active characters
// ═══════════════════════════════════════════════════

function buildInteractionRules(format: StoryFormat, cast: FormatCast, dauer: string): string {
  const activeCount = Object.values(cast).filter(r => r !== "excluded").length;

  // Get lead character
  const lead = Object.entries(cast).find(([, r]) => r === "lead");
  const leadName = lead ? lead[0] : "koda";
  const leadUpper = leadName.toUpperCase();

  // Get support characters
  const supports = Object.entries(cast)
    .filter(([, r]) => r === "support")
    .map(([name]) => name.toUpperCase());

  // Get minimal characters
  const minimals = Object.entries(cast)
    .filter(([, r]) => r === "minimal")
    .map(([name]) => name.toUpperCase());

  if (format === "podcast") {
    return `Dies ist ein PODCAST-FORMAT mit mehreren Perspektiven.
- KODA ist der Moderator. Er stellt das Thema vor, leitet die Diskussion, fasst zusammen.
- Wähle 3-4 der verfügbaren Charaktere die zum Thema passen.
- Jeder Charakter hat eine EIGENE PERSPEKTIVE — sie reagieren aufeinander!
- Echte Diskussion: Zustimmung, Widerspruch, Ergänzung, Überraschung.
- Koda verbindet die verschiedenen Sichtweisen und moderiert fair.

DIALOG-REGELN:
✅ Charaktere reagieren aufeinander: "Da hat Mika recht, ABER..."
✅ Natürliche Unterbrechungen: "Moment mal, darf ich kurz was sagen?"
✅ Verschiedene Meinungen: Nicht alle müssen einer Meinung sein!
❌ KEIN Monolog-Wechsel (A redet, dann B redet, dann C redet — langweilig!)

Jeder Charakter taucht ${dauer === "kurz" ? "2-4" : dauer === "mittel" ? "4-6" : "6-10"} Mal auf.`;
  }

  if (format === "brief") {
    return `Dies ist ein persönlicher BRIEF — nur Koda spricht. Intim, warm, direkt.
Keine anderen Stimmen. Kein Dialog. Nur Koda und der Hörer.`;
  }

  if (activeCount === 2) {
    // Two characters — classic dialog
    return `Die Geschichte ist ein DIALOG zwischen ${leadUpper} und ${supports[0] || minimals[0]}.
Sie erzählen ZUSAMMEN — nicht abwechselnd, sondern interaktiv:

1. Sie reden MITEINANDER, reagieren aufeinander
   ✅ "${leadUpper} beginnt, ${supports[0] || minimals[0]} reagiert, ergänzt, fragt nach"
   ❌ Monolog-Wechsel (A erzählt. Dann B erzählt. Langweilig!)

2. Natürliche Reaktionen: Staunen, Lachen, Nachfragen, Ergänzen

3. ${supports[0] || minimals[0]} taucht ${dauer === "kurz" ? "3-5" : dauer === "mittel" ? "5-8" : "8-12"} Mal auf.`;
  }

  // Three or more characters
  let rules = `${leadUpper} ist der HAUPTERZÄHLER und hat den größten Redeanteil.
Die anderen Charaktere bereichern die Geschichte mit ihren einzigartigen Perspektiven.

DIALOG-REGELN:
1. Die Charaktere reden MITEINANDER — nicht nur abwechselnd
   ✅ Aufeinander reagieren, ergänzen, nachfragen, kommentieren
   ❌ Monolog-Wechsel (langweilig!)

2. KODA macht IMMER Intro und Outro — auch wenn er nicht der Haupterzähler ist`;

  if (supports.length > 0) {
    rules += `\n3. Support-Charaktere (${supports.join(", ")}): Tauchen jeweils ${dauer === "kurz" ? "2-4" : dauer === "mittel" ? "4-6" : "6-10"} Mal auf.`;
  }
  if (minimals.length > 0) {
    rules += `\n4. Minimale Rolle (${minimals.join(", ")}): Nur 1-2 kurze Auftritte (Anfang/Ende).`;
  }

  return rules;
}
