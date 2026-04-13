"use client";

/**
 * ImageLightbox — Flicker-free fullscreen image viewer
 *
 * Uses React Portal to render OUTSIDE the component tree,
 * preventing event propagation issues and re-render flickering.
 *
 * Usage:
 *   <ImageLightbox src={url} onClose={() => setShow(false)} />
 */

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt = "Preview", onClose }: ImageLightboxProps) {
  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    // Prevent body scroll while lightbox is open
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Render via Portal — completely outside the React component tree
  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6"
      onClick={onClose}
      style={{ isolation: "isolate" }} // Prevents any parent effects
    >
      {/* Image — click stops propagation (only backdrop closes) */}
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded-xl select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Close button */}
      <button
        className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 text-xl transition-all"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        ✕
      </button>
    </div>,
    document.body,
  );
}
