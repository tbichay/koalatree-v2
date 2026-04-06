"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FullscreenContextValue {
  isFullscreen: boolean;
  isNativeFullscreen: boolean;
  enterFullscreen: (element: HTMLElement) => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: (element: HTMLElement) => Promise<void>;
  /** The <dialog> element for portal-based fullscreen (iPhone Safari fallback) */
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  /** @deprecated -- use exitFullscreen instead */
  setFullscreen: (v: boolean) => void;
}

const FullscreenContext = createContext<FullscreenContextValue>({
  isFullscreen: false,
  isNativeFullscreen: false,
  enterFullscreen: async () => {},
  exitFullscreen: async () => {},
  toggleFullscreen: async () => {},
  dialogRef: { current: null },
  setFullscreen: () => {},
});

// ---------------------------------------------------------------------------
// Native Fullscreen API helpers (with vendor prefixes)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function FullscreenProvider({ children }: { children: ReactNode }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fsElementRef = useRef<HTMLElement | null>(null);

  // Sync state with native fullscreen changes (Escape key, etc.)
  useEffect(() => {
    function handleChange() {
      const el = getFullscreenElement();
      const inNative = !!el;
      setIsNativeFullscreen(inNative);
      if (!inNative && isFullscreen && !dialogRef.current?.open) {
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

  // Handle dialog close via Escape key
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault(); // prevent default close so we can clean up state
      setIsFullscreen(false);
      setIsNativeFullscreen(false);
      dialog.close();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

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

    // Fallback: open <dialog> as modal (iPhone Safari, etc.)
    // The dialog uses the browser's top-layer, so no z-index issues,
    // touch events work inside it, and everything else becomes inert.
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    setIsFullscreen(true);
    setIsNativeFullscreen(false);
  }, []);

  const exitFullscreen = useCallback(async () => {
    fsElementRef.current = null;

    if (getFullscreenElement()) {
      await exitFS();
    }

    // Close dialog if open
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }

    setIsFullscreen(false);
    setIsNativeFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(
    async (element: HTMLElement) => {
      if (isFullscreen) {
        await exitFullscreen();
      } else {
        await enterFullscreen(element);
      }
    },
    [isFullscreen, enterFullscreen, exitFullscreen],
  );

  const setFullscreen = useCallback(
    (v: boolean) => {
      if (!v) {
        exitFullscreen();
      }
    },
    [exitFullscreen],
  );

  return (
    <FullscreenContext.Provider
      value={{
        isFullscreen,
        isNativeFullscreen,
        enterFullscreen,
        exitFullscreen,
        toggleFullscreen,
        dialogRef,
        setFullscreen,
      }}
    >
      {children}

      {/*
        The <dialog> element lives at the root of the React tree.
        When showModal() is called, the browser places it in the "top layer"
        above everything else. Touch events, click events, focus -- all work
        correctly inside the dialog on every device including iPhone Safari.

        Components use createPortal() to render their fullscreen content
        directly into this dialog element when isDialogFullscreen is true.
      */}
      <dialog
        ref={dialogRef}
        className="fs-dialog"
        aria-label="Vollbild-Modus"
      />
    </FullscreenContext.Provider>
  );
}

export function useFullscreen() {
  return useContext(FullscreenContext);
}
