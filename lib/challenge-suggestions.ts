/**
 * Age-appropriate challenge/situation suggestions.
 * Extracted from ProfilForm for reuse in KodaCheckIn.
 */
export function getHerausforderungenFuerAlter(alter: number): string[] {
  if (alter <= 6) {
    return [
      "Angst vor Dunkelheit",
      "neues Geschwisterchen",
      "Eingewöhnung Kita",
      "Trennungsangst",
      "Wutanfälle",
      "Schüchternheit",
    ];
  }
  if (alter <= 12) {
    return [
      "Schulwechsel",
      "Mobbing",
      "neues Geschwisterchen",
      "Scheidung der Eltern",
      "Leistungsdruck",
      "Freundschaftsprobleme",
      "Angst vor Tests",
    ];
  }
  if (alter <= 17) {
    return [
      "Prüfungsstress",
      "Identitätsfindung",
      "Liebeskummer",
      "Social Media Druck",
      "Zukunftsangst",
      "Gruppenzwang",
      "Selbstzweifel",
    ];
  }
  // 18+
  return [
    "Burnout",
    "Schlafprobleme",
    "Beziehungsstress",
    "Selbstzweifel",
    "Neuanfang",
    "Trauer",
    "Überforderung",
    "Einsamkeit",
  ];
}
