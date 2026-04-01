import { KindProfil } from "./types";

const STORAGE_KEY = "dreamweaver-profile";

export function getProfile(): KindProfil[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function getProfilById(id: string): KindProfil | undefined {
  return getProfile().find((p) => p.id === id);
}

export function saveProfil(profil: KindProfil): void {
  const profile = getProfile();
  const index = profile.findIndex((p) => p.id === profil.id);
  if (index >= 0) {
    profile[index] = profil;
  } else {
    profile.push(profil);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function deleteProfil(id: string): void {
  const profile = getProfile().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
