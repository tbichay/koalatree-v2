"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Cropper, { Area } from "react-easy-crop";
import Image from "next/image";

interface Props {
  currentImage?: string | null;
  fallback: React.ReactNode;
  size?: number;
  onUpload: (file: Blob) => Promise<void>;
  onRemove?: () => Promise<void>;
}

async function getCroppedImage(imageSrc: string, crop: Area): Promise<Blob> {
  const image = new window.Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const s = 512;
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, s, s);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas export failed"));
    }, "image/png", 0.9);
  });
}

function CropModal({
  imageSrc,
  onSave,
  onCancel,
}: {
  imageSrc: string;
  onSave: (blob: Blob) => Promise<void>;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedArea) return;
    setUploading(true);
    try {
      const blob = await getCroppedImage(imageSrc, croppedArea);
      await onSave(blob);
    } catch (err) {
      console.error("Crop failed:", err);
      alert("Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  };

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black"
      style={{ isolation: "isolate" }}
    >
      {/* Crop area */}
      <div className="absolute inset-0 bottom-[120px]">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: { width: "100%", height: "100%", position: "absolute" },
          }}
        />
      </div>

      {/* Bottom controls — fixed at bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#1a2e1a] px-6 py-4 space-y-3 z-10">
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-[#4a7c59]"
        />
        <div className="flex items-center justify-between">
          <button
            onClick={onCancel}
            className="text-white/60 hover:text-white transition-colors text-sm py-2"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={uploading}
            className="btn-primary text-sm px-6 py-2 disabled:opacity-50"
          >
            {uploading ? "Wird hochgeladen..." : "Speichern"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function AvatarUpload({ currentImage, fallback, size = 80, onUpload, onRemove }: Props) {
  const [showCropper, setShowCropper] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Bild darf maximal 5MB sein.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <>
      {/* Avatar circle */}
      <div
        className="relative cursor-pointer shrink-0 group/avatar"
        style={{ width: size, height: size }}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-full h-full rounded-full overflow-hidden">
          {currentImage ? (
            <Image
              src={currentImage}
              alt="Avatar"
              width={size}
              height={size}
              className="object-cover w-full h-full"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#3d6b4a] text-[#f5eed6]">
              {fallback}
            </div>
          )}
        </div>

        {/* Camera overlay */}
        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 transition-opacity flex items-center justify-center pointer-events-none group-hover/avatar:opacity-100">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        {/* Remove button */}
        {currentImage && onRemove && (
          <button
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500/80 text-white text-xs flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity hover:bg-red-500 z-10"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            ✕
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Crop modal — rendered via portal to avoid z-index/overflow issues */}
      {showCropper && imageSrc && (
        <CropModal
          imageSrc={imageSrc}
          onSave={async (blob) => {
            await onUpload(blob);
            setShowCropper(false);
            setImageSrc(null);
          }}
          onCancel={() => {
            setShowCropper(false);
            setImageSrc(null);
          }}
        />
      )}
    </>
  );
}
