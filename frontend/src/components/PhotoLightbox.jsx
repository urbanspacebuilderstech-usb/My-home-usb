import React, { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

// Full-screen in-page image viewer — close button top-left, left/right
// buttons to step through a photo set (also bound to arrow/Escape keys).
// Renders nothing when closed or empty so it's safe to always mount.
export default function PhotoLightbox({ open, photos, index, onClose, onIndexChange }) {
  const count = photos?.length || 0;
  const safeIndex = count ? ((index % count) + count) % count : 0;

  const goPrev = () => onIndexChange((safeIndex - 1 + count) % count);
  const goNext = () => onIndexChange((safeIndex + 1) % count);

  useEffect(() => {
    if (!open || !count) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && count > 1) goPrev();
      else if (e.key === 'ArrowRight' && count > 1) goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, safeIndex, count]);

  if (!open || !count) return null;
  const photo = photos[safeIndex];
  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      data-testid="photo-lightbox"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="fixed top-4 left-4 z-[101] h-9 w-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg"
        title="Close"
        data-testid="photo-lightbox-close"
      >
        <X className="h-5 w-5 text-gray-800" />
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="fixed left-4 top-1/2 -translate-y-1/2 z-[101] h-10 w-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg"
            title="Previous"
            data-testid="photo-lightbox-prev"
          >
            <ChevronLeft className="h-6 w-6 text-gray-800" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="fixed right-4 top-1/2 -translate-y-1/2 z-[101] h-10 w-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg"
            title="Next"
            data-testid="photo-lightbox-next"
          >
            <ChevronRight className="h-6 w-6 text-gray-800" />
          </button>
        </>
      )}

      <div className="flex flex-col items-center gap-2 max-w-full" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.src}
          alt={photo.label || 'Photo'}
          className="max-h-[85vh] max-w-[90vw] rounded shadow-2xl object-contain"
        />
        {(photo.label || count > 1) && (
          <p className="text-white text-xs font-medium bg-black/50 px-3 py-1 rounded-full">
            {photo.label || ''}{photo.label && count > 1 ? ' · ' : ''}{count > 1 ? `${safeIndex + 1}/${count}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
