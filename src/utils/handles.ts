import {
  AnchorNode,
  HandleColorPreset,
  HandleSettings,
  HandleSizePreset,
  Point,
} from '../types/vector';

export const HANDLE_SETTINGS_STORAGE_KEY = 'vektora_studio_handle_settings_v1';

export const DEFAULT_HANDLE_SETTINGS: HandleSettings = {
  size: 'normal',
  bezierVisibility: 'auto',
  tangentMode: 'aligned',
  largeHitArea: false,
  accentColor: 'blue',
  showRotationHandle: true,
  showEdgeHandles: true,
  lockAspectRatio: false,
};

export const HANDLE_SCALE_FACTORS: Record<HandleSizePreset, number> = {
  small: 0.78,
  normal: 1.0,
  large: 1.45,
};

export const HANDLE_COLOR_THEMES: Record<
  HandleColorPreset,
  {
    label: string;
    primary: string;
    soft: string;
    outline: string;
    swatchClass: string;
  }
> = {
  blue: {
    label: 'Blau',
    primary: '#3B82F6',
    soft: 'rgba(59, 130, 246, 0.55)',
    outline: 'rgba(59, 130, 246, 0.8)',
    swatchClass: 'bg-blue-500',
  },
  emerald: {
    label: 'Smaragd',
    primary: '#10B981',
    soft: 'rgba(16, 185, 129, 0.55)',
    outline: 'rgba(16, 185, 129, 0.82)',
    swatchClass: 'bg-emerald-500',
  },
  pink: {
    label: 'Pink',
    primary: '#EC4899',
    soft: 'rgba(236, 72, 153, 0.55)',
    outline: 'rgba(236, 72, 153, 0.82)',
    swatchClass: 'bg-pink-500',
  },
  amber: {
    label: 'Bernstein',
    primary: '#F59E0B',
    soft: 'rgba(245, 158, 11, 0.55)',
    outline: 'rgba(245, 158, 11, 0.85)',
    swatchClass: 'bg-amber-500',
  },
};

export function getHandleScaleFactor(settings?: HandleSettings): number {
  return HANDLE_SCALE_FACTORS[settings?.size ?? 'normal'];
}

export function getRotationHandleDistanceWorld(
  zoom: number,
  settings?: HandleSettings
): number {
  const scale = getHandleScaleFactor(settings);
  return (26 + Math.max(-4, (scale - 1) * 10)) / zoom;
}

export function getHandleHitToleranceWorld(
  zoom: number,
  isTouch: boolean,
  settings?: HandleSettings
): number {
  const base = isTouch ? 20 : 11;
  const sizeBoost = Math.max(1, getHandleScaleFactor(settings));
  const areaBoost = settings?.largeHitArea ? 1.45 : 1;
  return (base * sizeBoost * areaBoost) / zoom;
}

export function getTangentRetractToleranceWorld(
  zoom: number,
  isTouch: boolean,
  settings?: HandleSettings
): number {
  const base = isTouch ? 16 : 10;
  const sizeBoost = Math.max(1, getHandleScaleFactor(settings));
  const areaBoost = settings?.largeHitArea ? 1.25 : 1;
  return (base * sizeBoost * areaBoost) / zoom;
}

export function getTangentStubDistanceWorld(
  zoom: number,
  settings?: HandleSettings
): number {
  const scale = Math.max(1, getHandleScaleFactor(settings));
  const base = settings?.largeHitArea ? 34 : 26;
  return (base * scale) / zoom;
}

export interface TangentStubInfo {
  inStub?: Point;
  outStub?: Point;
}

export function getNodeTangentStubs(
  nodes: AnchorNode[],
  index: number,
  closed: boolean,
  zoom: number,
  settings?: HandleSettings
): TangentStubInfo {
  const node = nodes[index];
  if (!node || nodes.length < 2) return {};
  const stubDist = getTangentStubDistanceWorld(zoom, settings);
  const out: TangentStubInfo = {};

  if (!node.handleIn && (closed || index > 0)) {
    const prev = nodes[(index - 1 + nodes.length) % nodes.length];
    const dx = prev.x - node.x;
    const dy = prev.y - node.y;
    const len = Math.hypot(dx, dy);
    const ux = len >= 1e-3 ? dx / len : -1;
    const uy = len >= 1e-3 ? dy / len : 0;
    out.inStub = { x: node.x + ux * stubDist, y: node.y + uy * stubDist };
  }

  if (!node.handleOut && (closed || index < nodes.length - 1)) {
    const next = nodes[(index + 1) % nodes.length];
    const dx = next.x - node.x;
    const dy = next.y - node.y;
    const len = Math.hypot(dx, dy);
    const ux = len >= 1e-3 ? dx / len : 1;
    const uy = len >= 1e-3 ? dy / len : 0;
    out.outStub = { x: node.x + ux * stubDist, y: node.y + uy * stubDist };
  }

  return out;
}

export function loadSavedHandleSettings(): HandleSettings {
  try {
    const raw = localStorage.getItem(HANDLE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_HANDLE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<HandleSettings>;
    return {
      ...DEFAULT_HANDLE_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_HANDLE_SETTINGS;
  }
}

export function saveHandleSettings(settings: HandleSettings): void {
  try {
    localStorage.setItem(HANDLE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}
