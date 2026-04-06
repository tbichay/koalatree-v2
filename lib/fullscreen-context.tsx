"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

interface FullscreenContextValue {
  isFullscreen: boolean;
  isNativeFullscreen: boolean;
  enterFullscreen: (element: HTMLElement) => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: (element: HTMLElement) => Promise<void>;
  /** @deprecated */
  setFullscreen: (v: boolean) => void;
}

const FullscreenContext = createContext<FullscreenContextValue>({
  isFullscreen: false,
  isNativeFullscreen: false,
  enterFullscreen: async () => {},
  exitFullscreen: async () => {},
  toggleFullscreen: async () => {},
  setFullscreen: () => {},
});

// --- Native Fullscreen API helpers (with vendor prefixes) ---

function canUseNativeFS(): boolean {
  if (typeof document === "undefined") return false;
  return !!(
    document.fullscreenEnabled ??
    (document as unknown as Record<string, unknown>).webkitFullscreenEnabled
  );
}

function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  return (
    document.fullscreenElement ??
    ((document as unknown as Record<string, unknown>).webkitFullscreenElement as Element | null) ??
    null
  );
}

async function requestFS(el: HTMLElement): Promise<boolean> {
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    const webkit = el as unknown as { webkitRequestFullscreen?: () => void };
    if (webkit.webkitRequestFullscreen) {
      webkit.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Native API not supported or user denied
  }
  return false;
}

async function exitFS(): Promise<void> {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else {
      const webkit = document as unknown as { webkitExitFullscreen?: () => void };
      webkit.webkitExitFullscreen?.();
    }
  } catch {
    // ignore
  }
}

// --- Scroll lock for CSS-based fullscreen (iOS Safari) ---

let savedScrollY = 0;
let scrollLocked = false;

function lockScroll() {
  if (scrollLocked) return;
  scrollLocked = true;
  savedScrollY = window.scrollY;

  const html = document.documentElement;
  const body = document.body;

  // Store current scroll position as negative top offset
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.overflow = "hidden";
  html.style.overflow = "hidden";
  // Prevent overscroll bounce on iOS
  body.style.overscrollBehavior = "none";
  html.style.overscrollBehavior = "none";
}

function unlockScroll() {
  if (!scrollLocked) return;
  scrollLocked = false;

  const html = document.documentElement;
  const body = document.body;

  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.overflow = "";
  html.style.overflow = "";
  body.style.overscrollBehavior = "";
  html.style.overscrollBehavior = "";

  // Restore scroll position
  window.scrollTo(0, savedScrollY);
}

// --- Provider ---

export function FullscreenProvider({ children }: { children: React.ReactNode }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const fsElementRef = useRef<HTMLElement | null>(null);

  // Sync state with native fullscreen changes (Escape key, etc.)
  useEffect(() => {
    function handleChange() {
      const el = getFullscreenElement();
      const inNative = !!el;
      setIsNativeFullscreen(inNative);
      if (!inNative && isFullscreen) {
        // User exited native fullscreen (e.g. pressed Escape)
        setIsFullscreen(false);
        fsElementRef.current = null;
      }
    }
    document.addEventListener("fullscreenchange", handleChange);
    document.addEventListener("webkitfullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      document.removeEventListener("webkitfullscreenchange", handleChange);
    };
  }, [isFullscreen]);

  const enterFullscreen = useCallback(async (element: HTMLElement) => {
    fsElementRef.current = element;

    // Try native Fullscreen API first
    if (canUseNativeFS()) {
      const success = await requestFS(element);
      if (success) {
        setIsFullscreen(true);
        setIsNativeFullscreen(true);
        return;
      }
    }

    // CSS-based fallscreen with scroll lock (iPhone Safari)
    lockScroll();
    setIsFullscreen(true);
    setIsNativeFullscreen(false);
  }, []);

  const exitFullscreen = useCallback(async () => {
    fsElementRef.current = null;

    if (getFullscreenElement()) {
      await exitFS();
    }

    // Always unlock scroll (safe to call even if not locked)
    unlockScroll();
    setIsFullscreen(false);
    setIsNativeFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(async (element: HTMLElement) => {
    if (isFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen(element);
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  const setFullscreen = useCallback((v: boolean) => {
    if (!v) {
      exitFullscreen();
    }
  }, [exitFullscreen]);

  return (
    <FullscreenContext.Provider
      value={{ isFullscreen, isNativeFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen, setFullscreen }}
    >
      {children}
    </FullscreenContext.Provider>
  );
}

export function useFullscreen() {
  return useContext(FullscreenContext);
}
