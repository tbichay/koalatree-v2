import {
  KindProfil,
  StoryConfig,
  StoryFormat,
  PaedagogischesZiel,
  DAUER_OPTIONEN,
} from "./types";

const ALTERSGRUPPE = (alter: number) => {
  if (alter <= 5) return "3-5 Jahre: Verwende sehr einfache, kurze Sätze. Viele Wiederholungen. Konkrete, greifbare Bilder. Keine abstrakten Konzepte.";
  if (alter <= 8) return "6-8 Jahre: Verwende klare, bildhafte Sprache. Einfache Metaphern sind erlaubt. Die Geschichte darf etwas komplexer sein.";
  return "9-12 Jahre: Die Sprache darf reicher sein. Philosophische Gedanken können eingeflochten werden. Respektiere die wachsende Reife des Kindes.";
};

const GESCHLECHT_PRONOMEN = (geschlecht?: "m" | "w" | "d") => {
  if (geschlecht === "m") return "er/ihm/sein";
  if (geschlecht === "w") return "sie/ihr/ihre";
  return "das Kind";
};

const FORMAT_ANWEISUNGEN: Record<StoryFormat, string> = {
  traumreise: `FORMAT: MEDITATIVE TRAUMREISE
- Beginne mit einer sanften Einladung, die Augen zu schließen und tief durchzuatmen
- Führe das Kind an einen magischen, sicheren Ort
- Beschreibe die Umgebung mit allen Sinnen (sehen, hören, fühlen, riechen)
- Baue 2-3 Atemübungen natürlich in die Geschichte ein (markiere mit [ATEMPAUSE])
- Die Reise hat einen ruhigen Höhepunkt, in dem die Kernbotschaft liegt
- Ende mit einem sanften Zurückkehren ins warme Bett
- Die letzten Sätze werden immer ruhiger und langsamer
- Markiere Stellen für besonders langsames Vorlesen mit [LANGSAM]`,

  fabel: `FORMAT: PHILOSOPHISCHE FABEL
- Erzähle eine Geschichte mit Tieren als Hauptfiguren
- Das Lieblingstier des Kindes sollte eine wichtige Rolle spielen
- Die Tiere stehen vor einem Problem, das die Kernbotschaft widerspiegelt
- Die Lösung kommt durch Einsicht, nicht durch Gewalt oder List
- Die Moral wird NICHT explizit genannt — das Kind soll sie selbst spüren
- Ende ruhig und friedlich, mit den Tieren die einschlafen
- Markiere Stellen für Pausen mit [PAUSE]`,

  held: `FORMAT: MAGISCHE ICH-GESCHICHTE
- Das Kind selbst ist der Held — verwende den Namen des Kindes durchgehend
- Das Kind entdeckt eine besondere Fähigkeit, die mit seinen echten Stärken zusammenhängt
- Es gibt ein kleines Abenteuer, das mit dem pädagogischen Ziel verknüpft ist
- Andere Figuren erkennen die besonderen Eigenschaften des Kindes an
- Das Kind löst die Herausforderung mit seinen echten Charakterstärken
- Ende: Das Kind kehrt zufrieden und stolz ins Bett zurück
- Markiere emotionale Höhepunkte mit [PAUSE]`,

  dankbarkeit: `FORMAT: DANKBARKEITS-RITUAL
- Beginne mit einer kurzen, warmen Geschichte über den Tag eines Kindes
- Webe 3-5 kleine Momente der Freude ein, die zum Leben des Kindes passen
- In der Mitte gibt es eine "magische Dankbarkeits-Übung" eingebettet in die Geschichte
- Zum Beispiel: Das Kind sammelt leuchtende Sterne, jeder steht für etwas Schönes
- Die Übung lädt zum Nachdenken ein: "Wofür bist du heute dankbar?"
- Markiere die Dankbarkeits-Momente mit [DANKBARKEIT]
- Ende sehr sanft und warm, mit dem Gefühl von Geborgenheit`,
};

const ZIEL_ANWEISUNGEN: Record<PaedagogischesZiel, string> = {
  selbstbewusstsein: `PÄDAGOGISCHES ZIEL: SELBSTBEWUSSTSEIN
- Zeige, dass das Kind einzigartig und wertvoll ist, genau so wie es ist
- Betone seine spezifischen Stärken und Eigenschaften als Superkräfte
- Baue Affirmationen subtil ein: "Du bist genau richtig" / "In dir steckt so viel Kraft"
- Lasse das Kind in der Geschichte etwas schaffen, an dem es anfangs zweifelte
- Vermittle: Fehler machen ist okay und gehört zum Wachsen`,

  dankbarkeit: `PÄDAGOGISCHES ZIEL: DANKBARKEIT & ZUFRIEDENHEIT
- Lenke den Blick auf die kleinen, schönen Dinge im Alltag
- Zeige Figuren, die Freude in einfachen Momenten finden
- Baue sanft die Idee ein: "Wie schön, dass es das gibt"
- Vermeide Vergleiche mit anderen — fokussiere auf das eigene Glück
- Vermittle: Das Wertvollste sind oft die unsichtbaren Dinge (Liebe, Freundschaft, Natur)`,

  mut: `PÄDAGOGISCHES ZIEL: MUT & RESILIENZ
- Zeige, dass Mut nicht bedeutet, keine Angst zu haben — sondern trotzdem weiterzugehen
- Das Kind/die Figur begegnet einer Herausforderung Schritt für Schritt
- Vermittle: "Du bist stärker als du denkst"
- Zeige, dass es okay ist, um Hilfe zu bitten
- Nach der Herausforderung fühlt sich das Kind/die Figur stärker und stolz`,

  empathie: `PÄDAGOGISCHES ZIEL: EMPATHIE & FREUNDLICHKEIT
- Zeige verschiedene Perspektiven: "Wie fühlt sich wohl der andere?"
- Eine Figur braucht Hilfe, und Mitgefühl macht den Unterschied
- Vermittle: Freundlichkeit kommt zu einem zurück
- Zeige, dass jeder manchmal Hilfe braucht — und das ist gut so
- Betone das warme Gefühl, das entsteht, wenn man anderen hilft`,

  achtsamkeit: `PÄDAGOGISCHES ZIEL: ACHTSAMKEIT & INNERE RUHE
- Baue Achtsamkeitsübungen natürlich in die Geschichte ein
- "Spüre mal, wie sich dein Kissen unter deinem Kopf anfühlt..."
- Atme-Momente: "Und jetzt atmet [Name/Figur] ganz tief ein... und langsam aus..."
- Zeige, dass Stille und Langsamkeit etwas Schönes sind
- Vermittle: In der Ruhe liegt Kraft — du musst nicht immer schnell sein`,

  aengste: `PÄDAGOGISCHES ZIEL: UMGANG MIT ÄNGSTEN
- Benenne die Angst NICHT direkt als beängstigend — wandle sie in etwas Verständliches um
- Zeige eine Figur, die einen Weg findet, mit Unsicherheit umzugehen
- Vermittle: Angst ist ein normales Gefühl und kein Zeichen von Schwäche
- Gib dem Kind ein "Werkzeug": z.B. tiefes Atmen, an etwas Schönes denken, ein Schutz-Gedanke
- Ende unbedingt mit einem starken Gefühl von Sicherheit und Geborgenheit`,

  kreativitaet: `PÄDAGOGISCHES ZIEL: KREATIVITÄT & VORSTELLUNGSKRAFT
- Lade das Kind ein, sich Dinge vorzustellen: "Stell dir mal vor..."
- Die Geschichte hat offene, fantasievolle Elemente
- Zeige, dass es kein "richtig" oder "falsch" in der Fantasie gibt
- Vermittle: Deine Ideen und Gedanken sind wertvoll und einzigartig
- Lasse Raum für das Kind, die Geschichte im Kopf weiterzuspinnen`,
};

export function buildStoryPrompt(profil: KindProfil, config: StoryConfig): { system: string; user: string } {
  const wortanzahl = {
    kurz: "400-600",
    mittel: "800-1200",
    lang: "1500-2000",
  }[config.dauer];

  const system = `Du bist ein einfühlsamer Geschichtenerzähler für Kinder. Du schreibst pädagogisch wertvolle Gute-Nacht-Geschichten, die Kinder stärken, beruhigen und positive Werte vermitteln.

WICHTIGE REGELN:
- Schreibe auf Deutsch in warmem, liebevollem Ton
- ${ALTERSGRUPPE(profil.alter)}
- Verwende NIEMALS angstauslösende, gruselige oder bedrohliche Elemente
- Die Geschichte muss immer mit einem Gefühl von Sicherheit, Wärme und Geborgenheit enden
- Das Ende soll zum Einschlafen einladen — die letzten 3-4 Sätze werden zunehmend ruhiger
- Verwende sensorische Sprache: Farben, Geräusche, Gefühle, Wärme
- Baue den Namen des Kindes natürlich ein (nicht in jedem Satz, aber regelmäßig)
- Pronomen: ${GESCHLECHT_PRONOMEN(profil.geschlecht)}

AUDIO-HINWEISE (im Text markieren):
- [ATEMPAUSE] = 3 Sekunden Stille für bewusstes Atmen
- [PAUSE] = 2 Sekunden Stille für Wirkung
- [LANGSAM] = Ab hier langsamer sprechen
- [DANKBARKEIT] = Dankbarkeits-Moment, sanfter Ton

${FORMAT_ANWEISUNGEN[config.format]}

${ZIEL_ANWEISUNGEN[config.ziel]}

LÄNGE: Ungefähr ${wortanzahl} Wörter (ca. ${DAUER_OPTIONEN[config.dauer].minuten} Minuten Vorlesezeit).

Schreibe NUR die Geschichte — keine Titel, keine Einleitung, keine Erklärungen. Beginne direkt mit dem ersten Satz der Geschichte.`;

  const interessen = profil.interessen.length > 0 ? profil.interessen.join(", ") : "keine spezifischen";
  const charakter = profil.charaktereigenschaften.length > 0 ? profil.charaktereigenschaften.join(", ") : "nicht angegeben";
  const herausforderungen = profil.herausforderungen && profil.herausforderungen.length > 0
    ? `Aktuelle Herausforderungen: ${profil.herausforderungen.join(", ")}`
    : "";

  const user = `Schreibe eine Gute-Nacht-Geschichte für folgendes Kind:

Name: ${profil.name}
Alter: ${profil.alter} Jahre
Interessen: ${interessen}
${profil.lieblingstier ? `Lieblingstier: ${profil.lieblingstier}` : ""}
${profil.lieblingsfarbe ? `Lieblingsfarbe: ${profil.lieblingsfarbe}` : ""}
Charaktereigenschaften: ${charakter}
${herausforderungen}
${config.besonderesThema ? `Besonderes Thema/Anlass: ${config.besonderesThema}` : ""}

Generiere jetzt die Geschichte.`;

  return { system, user };
}
