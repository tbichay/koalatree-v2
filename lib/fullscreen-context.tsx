"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface FullscreenContextValue {
  isFullscreen: boolean;
  enterFullscreen: (element: HTMLElement) => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: (element: HTMLElement) => Promise<void>;
  /** @deprecated Use enterFullscreen/exitFullscreen instead */
  setFullscreen: (v: boolean) => void;
}

const FullscreenContext = createContext<FullscreenContextValue>({
  isFullscreen: false,
  enterFullscreen: async () => {},
  exitFullscreen: async () => {},
  toggleFullscreen: async () => {},
  setFullscreen: () => {},
});

function isNativeSupported(): boolean {
  return typeof document !== "undefined" && (
    "fullscreenEnabled" in document ||
    "webkitFullscreenEnabled" in document
  );
}

function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  return (document as unknown as Record<string, unknown>).fullscreenElement as Element | null
    ?? (document as unknown as Record<string, unknown>).webkitFullscreenElement as Element | null
    ?? null;
}

async function requestFS(el: HTMLElement): Promise<void> {
  if (el.requestFullscreen) {
    await el.requestFullscreen();
  } else if ((el as unknown as Record<string, unknown>).webkitRequestFullscreen) {
    (el as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
  }
}

async function exitFS(): Promise<void> {
  if (document.exitFullscreen) {
    await document.exitFullscreen();
  } else if ((document as unknown as Record<string, unknown>).webkitExitFullscreen) {
    (document as unknown as { webkitExitFullscreen: () => void }).webkitExitFullscreen();
  }
}

export function FullscreenProvider({ children }: { children: React.ReactNode }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync state with native fullscreen changes (e.g. user presses Escape)
  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!getFullscreenElement());
    }
    document.addEventListener("fullscreenchange", handleChange);
    document.addEventListener("webkitfullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      document.removeEventListener("webkitfullscreenchange", handleChange);
    };
  }, []);

  const enterFullscreen = useCallback(async (element: HTMLElement) => {
    if (isNativeSupported()) {
      try {
        await requestFS(element);
        // State will be set by the fullscreenchange event
      } catch (err) {
        console.warn("[Fullscreen] Native API failed, using fallback:", err);
        setIsFullscreen(true); // CSS fallback
      }
    } else {
      setIsFullscreen(true); // CSS fallback
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (getFullscreenElement()) {
      try {
        await exitFS();
      } catch {
        setIsFullscreen(false);
      }
    } else {
      setIsFullscreen(false);
    }
  }, []);

  const toggleFullscreen = useCallback(async (element: HTMLElement) => {
    if (isFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen(element);
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Legacy compat
  const setFullscreen = useCallback((v: boolean) => {
    if (v) {
      setIsFullscreen(true);
    } else {
      if (getFullscreenElement()) {
        exitFS().catch(() => {});
      }
      setIsFullscreen(false);
    }
  }, []);

  return (
    <FullscreenContext.Provider
      value={{ isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen, setFullscreen }}
    >
      {children}
    </FullscreenContext.Provider>
  );
}

export function useFullscreen() {
  return useContext(FullscreenContext);
}
