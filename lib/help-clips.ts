/**
 * Help-Audio Clip Definitions
 * Verschiedene KoalaTree-Charaktere erklaeren die App.
 */

export interface HelpClip {
  id: string;
  characterId: string;
  text: string; // Text mit Character-Marker fuer ElevenLabs
  label: string; // Kurze Beschreibung fuer UI
}

export const HELP_CLIPS: Record<string, HelpClip> = {
  "willkommen": {
    id: "willkommen",
    characterId: "koda",
    text: "[KODA] Willkommen am KoalaTree! Hier in meinem magischen Baum erzählen ich und meine Freunde Geschichten — nur für dich. Für Kinder zum Einschlafen und für Erwachsene zum Nachdenken und Loslassen. Erstelle ein Profil, und los geht's!",
    label: "Koda begrüßt dich",
  },
  "profil-erstellen": {
    id: "profil-erstellen",
    characterId: "koda",
    text: "[KODA] Erzähl mir ein bisschen von dir oder deinem Kind — den Namen, das Alter. Je mehr ich weiß, desto besser werden meine Geschichten. Keine Sorge, du kannst alles jederzeit ändern.",
    label: "Koda erklärt",
  },
  "interessen": {
    id: "interessen",
    characterId: "pip",
    text: "[PIP] Hey, hey! Interessen sind total wichtig! Wenn ich weiß, dass du Dinosaurier magst, dann bau ich die in die Geschichte ein. Oder Weltraum! Oder Pizza! Wähl einfach aus, was dir gefällt!",
    label: "Pip erklärt",
  },
  "charaktereigenschaften": {
    id: "charaktereigenschaften",
    characterId: "pip",
    text: "[PIP] Hier sagst du uns, wie du so bist! Bist du mutig? Neugierig? Schüchtern? Das hilft Koda, eine Geschichte zu erzählen, in der du dich wiederfindest.",
    label: "Pip erklärt",
  },
  "herausforderungen": {
    id: "herausforderungen",
    characterId: "pip",
    text: "[PIP] Aktuelle Themen sind Sachen, die dich gerade beschäftigen. Vielleicht ein neues Geschwisterchen, oder der erste Schultag. Koda baut das ganz sanft in die Geschichte ein, ohne es direkt zu benennen.",
    label: "Pip erklärt",
  },
  "tags": {
    id: "tags",
    characterId: "pip",
    text: "[PIP] Hier kannst du alles reinschreiben, was dir wichtig ist! Freie Tags — das können Lieblingsfiguren sein, besondere Orte, oder Themen, die in keiner Geschichte fehlen dürfen.",
    label: "Pip erklärt",
  },
  "story-format": {
    id: "story-format",
    characterId: "kiki",
    text: "[KIKI] Ha! Hier wird's spannend! Du kannst zwischen Abenteuer, Traumreise, Meditation und vielem mehr wählen. Jedes Format klingt anders — probier einfach durch! Ich persönlich mag ja die Quatschgeschichten am liebsten!",
    label: "Kiki erklärt",
  },
  "story-ziel": {
    id: "story-ziel",
    characterId: "sage",
    text: "[SAGE] Hmm... der Fokus bestimmt, welche Botschaft in der Geschichte steckt. Mut, Dankbarkeit, Achtsamkeit — die Geschichte stärkt das, was du gerade brauchst. Ganz unterbewusst, ganz sanft.",
    label: "Sage erklärt",
  },
  "story-thema": {
    id: "story-thema",
    characterId: "koda",
    text: "[KODA] Hier kannst du ein besonderes Thema angeben. Vielleicht beschäftigt dich etwas Bestimmtes, oder du hast Lust auf eine ganz besondere Geschichte. Ich merke mir das für die Zukunft.",
    label: "Koda erklärt",
  },
  "bibliothek": {
    id: "bibliothek",
    characterId: "nuki",
    text: "[NUKI] Willkommen in deiner Bibliothek! Hier findest du alle Geschichten, die wir für dich erzählt haben. Du kannst sie jederzeit wieder anhören, teilen, oder in die Warteschlange packen! Viel Spaß beim Stöbern!",
    label: "Nuki erklärt",
  },
  "profil-teilen": {
    id: "profil-teilen",
    characterId: "luna",
    text: "[LUNA] Du kannst dein Profil mit anderen teilen — zum Beispiel mit Großeltern oder Freunden. Die können dann alle Geschichten anhören. Und du bestimmst, was sie über dich sehen dürfen.",
    label: "Luna erklärt",
  },
};

export const HELP_CLIP_IDS = Object.keys(HELP_CLIPS);
