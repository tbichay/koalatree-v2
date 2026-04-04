/**
 * Koda Check-In triggers — determines when and why to show a check-in.
 */
import { HoererProfil } from "./types";
import { berechneAlter } from "./utils";

export type CheckInReason = "first-visit" | "stale-profile" | "age-milestone";

const STALE_DAYS = 30;
const DISMISS_COOLDOWN_DAYS = 7; // After dismissing, wait at least 7 days

function getAgeBracket(alter: number): string {
  if (alter <= 3) return "0-3";
  if (alter <= 6) return "4-6";
  if (alter <= 10) return "7-10";
  if (alter <= 14) return "11-14";
  if (alter <= 17) return "15-17";
  return "18+";
}

/**
 * Check if a profile needs a Koda check-in and why.
 */
export function shouldShowCheckIn(
  profil: HoererProfil,
  lastDismissed: string | null
): CheckInReason | null {
  // Respect dismiss cooldown
  if (lastDismissed) {
    const dismissedAt = new Date(lastDismissed);
    const daysSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < DISMISS_COOLDOWN_DAYS) return null;
  }

  // First visit: profile has no interests and no character traits
  const hasContent =
    profil.interessen.length > 0 ||
    profil.charaktereigenschaften.length > 0 ||
    (profil.herausforderungen && profil.herausforderungen.length > 0) ||
    (profil.tags && profil.tags.length > 0);

  if (!hasContent) return "first-visit";

  // Age milestone: if bracket changed since last update
  if (profil.geburtsdatum && profil.updatedAt) {
    const currentAlter = berechneAlter(profil.geburtsdatum);
    const currentBracket = getAgeBracket(currentAlter);

    // Check if the stored bracket (from localStorage) differs
    const storedBracketKey = `koda-bracket-${profil.id}`;
    if (typeof window !== "undefined") {
      const storedBracket = localStorage.getItem(storedBracketKey);
      if (storedBracket && storedBracket !== currentBracket) {
        return "age-milestone";
      }
      // Store current bracket if not set
      if (!storedBracket) {
        localStorage.setItem(storedBracketKey, currentBracket);
      }
    }
  }

  // Stale profile: not updated in 30+ days
  if (profil.updatedAt) {
    const updatedAt = new Date(profil.updatedAt);
    const daysSince = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > STALE_DAYS) return "stale-profile";
  }

  return null;
}

/**
 * Get Koda's message for the check-in reason.
 */
export function getCheckInMessage(reason: CheckInReason, name: string, alter?: number): string {
  switch (reason) {
    case "first-visit":
      return `Toll, dass du da bist! Erzähl mir ein bisschen über ${name}, damit meine Geschichten richtig persönlich werden. Je mehr ich weiß, desto besser!`;
    case "stale-profile":
      return `Hey! Bei ${name} hat sich bestimmt was verändert, oder? Schau mal ob die Interessen und Themen noch passen — dann werden die Geschichten noch besser.`;
    case "age-milestone":
      return `${name} ist jetzt ${alter}! Da ändern sich Interessen oft. Sollen wir mal schauen, was gerade aktuell ist?`;
  }
}
