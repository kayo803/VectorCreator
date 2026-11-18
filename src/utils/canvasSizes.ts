import {
  CanvasOrientation,
  CanvasPageConfig,
  CanvasSizePreset,
  ViewportTransform,
} from '../types/vector';

export interface CanvasSizePresetDef {
  id: CanvasSizePreset;
  label: string;
  shortLabel: string;
  subtitle: string;
  width: number;
  height: number;
  defaultOrientation: CanvasOrientation;
  lockOrientation?: boolean;
}

export const CANVAS_SIZE_PRESETS: CanvasSizePresetDef[] = [
  {
    id: 'infinite',
    label: 'Unbegrenzt (Frei)',
    shortLabel: 'Unbegrenzt',
    subtitle: 'Endlose Zeichenfläche',
    width: 0,
    height: 0,
    defaultOrientation: 'landscape',
    lockOrientation: true,
  },
  {
    id: 'a4',
    label: 'DIN A4 (210 × 297 mm)',
    shortLabel: 'DIN A4',
    subtitle: '794 × 1123 px',
    width: 794,
    height: 1123,
    defaultOrientation: 'portrait',
  },
  {
    id: 'a3',
    label: 'DIN A3 (297 × 420 mm)',
    shortLabel: 'DIN A3',
    subtitle: '1123 × 1587 px',
    width: 1123,
    height: 1587,
    defaultOrientation: 'portrait',
  },
  {
    id: 'a5',
    label: 'DIN A5 (148 × 210 mm)',
    shortLabel: 'DIN A5',
    subtitle: '559 × 794 px',
    width: 559,
    height: 794,
    defaultOrientation: 'portrait',
  },
  {
    id: 'a2',
    label: 'DIN A2 (420 × 594 mm)',
    shortLabel: 'DIN A2',
    subtitle: '1587 × 2245 px',
    width: 1587,
    height: 2245,
    defaultOrientation: 'portrait',
  },
  {
    id: 'letter',
    label: 'US Letter (8,5 × 11")',
    shortLabel: 'US Letter',
    subtitle: '816 × 1056 px',
    width: 816,
    height: 1056,
    defaultOrientation: 'portrait',
  },
  {
    id: 'square-1080',
    label: 'Quadrat 1:1 (Social)',
    shortLabel: '1:1 Quadrat',
    subtitle: '1080 × 1080 px',
    width: 1080,
    height: 1080,
    defaultOrientation: 'portrait',
    lockOrientation: true,
  },
  {
    id: 'hd-1080',
    label: 'Full HD 16:9',
    shortLabel: '16:9 HD',
    subtitle: '1920 × 1080 px',
    width: 1920,
    height: 1080,
    defaultOrientation: 'landscape',
  },
  {
    id: 'story-1080',
    label: 'Story / Hochformat 9:16',
    shortLabel: '9:16 Story',
    subtitle: '1080 × 1920 px',
    width: 1080,
    height: 1920,
    defaultOrientation: 'portrait',
  },
  {
    id: 'custom',
    label: 'Benutzerdefiniert',
    shortLabel: 'Eigene Größe',
    subtitle: 'Freie Breite × Höhe',
    width: 1200,
    height: 800,
    defaultOrientation: 'landscape',
  },
];

export function buildCanvasPageConfig(
  preset: CanvasSizePreset,
  orientation?: CanvasOrientation,
  customWidth?: number,
  customHeight?: number
): CanvasPageConfig {
  if (preset === 'infinite') {
    return { preset: 'infinite', width: 0, height: 0, orientation: 'landscape' };
  }

  const def =
    CANVAS_SIZE_PRESETS.find((p) => p.id === preset) ?? CANVAS_SIZE_PRESETS[1];

  if (preset === 'custom') {
    const w = Math.max(64, Math.min(8000, Math.round(customWidth ?? def.width)));
    const h = Math.max(64, Math.min(8000, Math.round(customHeight ?? def.height)));
    return {
      preset: 'custom',
      width: w,
      height: h,
      orientation: w >= h ? 'landscape' : 'portrait',
    };
  }

  const targetOrient = def.lockOrientation
    ? def.defaultOrientation
    : orientation ?? def.defaultOrientation;

  const shortSide = Math.min(def.width, def.height);
  const longSide = Math.max(def.width, def.height);

  return {
    preset,
    width: targetOrient === 'portrait' ? shortSide : longSide,
    height: targetOrient === 'portrait' ? longSide : shortSide,
    orientation: targetOrient,
  };
}

export function isBoundedCanvas(canvasSize?: CanvasPageConfig): canvasSize is CanvasPageConfig {
  return Boolean(
    canvasSize &&
      canvasSize.preset !== 'infinite' &&
      canvasSize.width > 0 &&
      canvasSize.height > 0
  );
}

export function formatCanvasSizeLabel(canvasSize?: CanvasPageConfig): string {
  if (!isBoundedCanvas(canvasSize)) return 'Unbegrenzt';
  const def = CANVAS_SIZE_PRESETS.find((p) => p.id === canvasSize.preset);
  const name = def ? def.shortLabel : 'Format';
  return `${name} · ${Math.round(canvasSize.width)} × ${Math.round(canvasSize.height)} px`;
}

export function computeFitCanvasViewport(canvasSize?: CanvasPageConfig): ViewportTransform {
  if (!isBoundedCanvas(canvasSize)) {
    return { x: 0, y: 0, zoom: 1, rotation: 0 };
  }
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  // Leave comfortable breathing room for TopBar, ToolRail & optional Inspector
  const availW = Math.max(220, vw - (vw >= 768 ? 380 : 90));
  const availH = Math.max(220, vh - 160);
  const fitZoom = Math.min(availW / canvasSize.width, availH / canvasSize.height) * 0.9;
  const clampedZoom = Math.max(0.12, Math.min(2.5, fitZoom));
  const xOffset = vw >= 768 ? -110 : 0;
  return {
    x: xOffset,
    y: 12,
    zoom: clampedZoom,
    rotation: 0,
  };
}
