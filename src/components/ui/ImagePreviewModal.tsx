'use client';

import { X } from 'lucide-react';

interface ImagePreviewModalProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImagePreviewModal({ src, alt = 'preview', onClose }: ImagePreviewModalProps) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={onClose}>
        <X className="h-7 w-7" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
