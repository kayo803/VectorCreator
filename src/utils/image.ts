import { ViewportTransform } from '../types/vector';
import { screenToWorld } from './geometry';

export interface LoadedImageAsset {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  name: string;
}

export async function loadAndOptimizeImageFile(
  file: File | Blob,
  fallbackName = 'Bild'
): Promise<LoadedImageAsset> {
  const rawName =
    file instanceof File && file.name
      ? file.name.replace(/\.[^.]+$/, '')
      : fallbackName;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
      el.src = objectUrl;
    });

    const natW = Math.max(1, img.naturalWidth || 400);
    const natH = Math.max(1, img.naturalHeight || 400);

    const encodeScaled = (maxDim: number, quality: number, forceJpeg: boolean): string => {
      const scale = Math.min(1, maxDim / Math.max(natW, natH));
      const w = Math.max(1, Math.round(natW * scale));
      const h = Math.max(1, Math.round(natH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(img, 0, 0, w, h);
      if (forceJpeg || file.type === 'image/jpeg' || file.type === 'image/jpg') {
        return canvas.toDataURL('image/jpeg', quality);
      }
      return canvas.toDataURL('image/png');
    };

    let src = encodeScaled(1600, 0.88, false);
    // Keep localStorage footprint reasonable for huge opaque PNG screenshots
    if (src.length > 1_400_000) {
      const smallerPng = encodeScaled(1100, 0.85, false);
      src =
        smallerPng.length <= 1_400_000
          ? smallerPng
          : encodeScaled(1280, 0.84, true);
    }

    if (!src) {
      throw new Error('Bild-Konvertierung fehlgeschlagen');
    }

    return {
      src,
      naturalWidth: natW,
      naturalHeight: natH,
      name: rawName || fallbackName,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function computeImagePlacement(
  naturalWidth: number,
  naturalHeight: number,
  viewport: ViewportTransform
): { x: number; y: number; width: number; height: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const centerScreen = { x: vw / 2, y: vh / 2 };
  const worldCenter = screenToWorld(centerScreen, viewport, centerScreen);

  const maxScreenSpan = Math.max(180, Math.min(440, Math.min(vw, vh) * 0.55));
  const maxWorldSpan = maxScreenSpan / Math.max(0.08, viewport.zoom);
  const scale = Math.min(1, maxWorldSpan / Math.max(naturalWidth, naturalHeight));
  // Ensure tiny icons aren't microscopic, while normal photos fit neatly
  const minWorldSpan = 120 / Math.max(0.08, viewport.zoom);
  const finalScale =
    Math.max(naturalWidth, naturalHeight) * scale < minWorldSpan
      ? minWorldSpan / Math.max(naturalWidth, naturalHeight)
      : scale;

  const width = Math.max(16, naturalWidth * finalScale);
  const height = Math.max(16, naturalHeight * finalScale);

  return {
    x: worldCenter.x - width / 2,
    y: worldCenter.y - height / 2,
    width,
    height,
  };
}
