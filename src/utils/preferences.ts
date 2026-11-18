import {
  BrushProfile,
  ContextBarPosition,
  CornerPosition,
  DashPattern,
  InspectorPosition,
  InspectorTab,
  PaintStyle,
  PencilPrecision,
  ShapeKind,
  StrokeCap,
  StrokeJoin,
  StrokeStyle,
  ToolbarCustomPoint,
  ToolbarCustomPositions,
  ToolbarLayoutSettings,
  ToolRailPosition,
  ToolSettings,
  ToolType,
  TopBarPosition,
} from '../types/vector';
import {
  DEFAULT_HANDLE_SETTINGS,
  loadSavedHandleSettings,
  saveHandleSettings,
} from './handles';
import { createDefaultPaint, createDefaultStroke } from './templates';

export const PREFERENCES_STORAGE_KEY = 'vektora_studio_preferences_v1';

export const DEFAULT_TOOLBAR_LAYOUT: ToolbarLayoutSettings = {
  topBar: 'top',
  toolRail: 'left',
  inspector: 'right',
  contextBar: 'bottom',
  fullscreenBar: 'top-right',
};

export interface StudioPreferences {
  activeTool: ToolType;
  paintTarget: 'fill' | 'stroke';
  currentFill: PaintStyle;
  currentStroke: StrokeStyle;
  rememberedStrokePaint: PaintStyle;
  toolSettings: ToolSettings;
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  toolbarLayout: ToolbarLayoutSettings;
}

const VALID_TOOLS = new Set<ToolType>([
  'select',
  'node',
  'brush',
  'pen',
  'shape',
  'fill',
  'eraser',
  'eyedropper',
  'text',
  'pan',
]);

const VALID_TABS = new Set<InspectorTab>(['style', 'layers', 'guides']);
const VALID_PENCIL_MODES = new Set<PencilPrecision>(['fine', 'normal', 'coarse']);
const VALID_SHAPES = new Set<ShapeKind>([
  'rect',
  'ellipse',
  'polygon',
  'star',
  'line',
  'arrow',
]);
const VALID_CAPS = new Set<StrokeCap>(['round', 'square', 'butt']);
const VALID_JOINS = new Set<StrokeJoin>(['round', 'miter', 'bevel']);
const VALID_DASHES = new Set<DashPattern>(['solid', 'dashed', 'dotted']);
const VALID_PROFILES = new Set<BrushProfile>(['monoline', 'tapered', 'calligraphy']);
const VALID_TOPBAR_POS = new Set<TopBarPosition>(['top', 'bottom']);
const VALID_TOOLRAIL_POS = new Set<ToolRailPosition>(['left', 'right', 'top', 'bottom']);
const VALID_INSPECTOR_POS = new Set<InspectorPosition>(['left', 'right']);
const VALID_CONTEXT_POS = new Set<ContextBarPosition>(['bottom', 'top']);
const VALID_CORNER_POS = new Set<CornerPosition>([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

export function getDefaultToolSettings(): ToolSettings {
  return {
    smoothing: 55,
    pencilMode: 'normal',
    autoCloseBrushPath: false,
    shapeKind: 'rect',
    polygonSides: 6,
    starPoints: 5,
    starInnerRatio: 0.45,
    fontSize: 36,
    fontWeight: 600,
    textAlign: 'left',
    handleSettings: { ...DEFAULT_HANDLE_SETTINGS },
  };
}

export function getDefaultStudioPreferences(
  defaultInspectorOpen?: boolean
): StudioPreferences {
  const open =
    typeof defaultInspectorOpen === 'boolean'
      ? defaultInspectorOpen
      : typeof window === 'undefined' || window.innerWidth >= 768;
  return {
    activeTool: 'brush',
    paintTarget: 'stroke',
    currentFill: createDefaultPaint('#3B82F6', 'solid'),
    currentStroke: createDefaultStroke('#111827', 3),
    rememberedStrokePaint: createDefaultPaint('#111827', 'solid'),
    toolSettings: getDefaultToolSettings(),
    inspectorOpen: open,
    inspectorTab: 'style',
    toolbarLayout: { ...DEFAULT_TOOLBAR_LAYOUT },
  };
}

function clamp(val: number, min: number, max: number, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val)
    ? Math.max(min, Math.min(max, val))
    : fallback;
}

function sanitizePaintStyle(
  raw: Partial<PaintStyle> | undefined,
  fallback: PaintStyle
): PaintStyle {
  if (!raw || typeof raw !== 'object') return fallback;
  const type =
    raw.type === 'none' || raw.type === 'solid' || raw.type === 'linear'
      ? raw.type
      : fallback.type;
  const color =
    typeof raw.color === 'string' && raw.color.trim().length > 0
      ? raw.color
      : fallback.color;
  const opacity = clamp(raw.opacity ?? fallback.opacity, 0, 1, fallback.opacity);
  const rawGrad = raw.gradient;
  const stops =
    rawGrad &&
    Array.isArray(rawGrad.stops) &&
    rawGrad.stops.length >= 2
      ? ([
          {
            offset: clamp(rawGrad.stops[0]?.offset ?? 0, 0, 1, 0),
            color:
              typeof rawGrad.stops[0]?.color === 'string'
                ? rawGrad.stops[0].color
                : fallback.gradient.stops[0].color,
            opacity: clamp(rawGrad.stops[0]?.opacity ?? 1, 0, 1, 1),
          },
          {
            offset: clamp(rawGrad.stops[1]?.offset ?? 1, 0, 1, 1),
            color:
              typeof rawGrad.stops[1]?.color === 'string'
                ? rawGrad.stops[1].color
                : fallback.gradient.stops[1].color,
            opacity: clamp(rawGrad.stops[1]?.opacity ?? 1, 0, 1, 1),
          },
        ] as PaintStyle['gradient']['stops'])
      : fallback.gradient.stops;

  return {
    type,
    color,
    opacity,
    gradient: {
      angle: clamp(rawGrad?.angle ?? fallback.gradient.angle, 0, 360, fallback.gradient.angle),
      stops,
    },
  };
}

function sanitizeStrokeStyle(
  raw: Partial<StrokeStyle> | undefined,
  fallback: StrokeStyle
): StrokeStyle {
  if (!raw || typeof raw !== 'object') return fallback;
  return {
    paint: sanitizePaintStyle(raw.paint, fallback.paint),
    width: clamp(raw.width ?? fallback.width, 0.5, 48, fallback.width),
    cap: raw.cap && VALID_CAPS.has(raw.cap) ? raw.cap : fallback.cap,
    join: raw.join && VALID_JOINS.has(raw.join) ? raw.join : fallback.join,
    dash: raw.dash && VALID_DASHES.has(raw.dash) ? raw.dash : fallback.dash,
    profile:
      raw.profile && VALID_PROFILES.has(raw.profile)
        ? raw.profile
        : fallback.profile,
  };
}

function sanitizeCustomPoint(raw: unknown): ToolbarCustomPoint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const pt = raw as Partial<ToolbarCustomPoint>;
  if (
    typeof pt.x !== 'number' ||
    !Number.isFinite(pt.x) ||
    typeof pt.y !== 'number' ||
    !Number.isFinite(pt.y)
  ) {
    return undefined;
  }
  return {
    x: Math.round(Math.max(0, Math.min(10000, pt.x))),
    y: Math.round(Math.max(0, Math.min(10000, pt.y))),
  };
}

function sanitizeCustomPositions(
  raw: unknown
): ToolbarCustomPositions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: ToolbarCustomPositions = {};
  let count = 0;
  for (const key of [
    'topBar',
    'toolRail',
    'inspector',
    'contextBar',
    'fullscreenBar',
  ] as const) {
    const pt = sanitizeCustomPoint(r[key]);
    if (pt) {
      out[key] = pt;
      count += 1;
    }
  }
  return count > 0 ? out : undefined;
}

function sanitizeToolbarLayout(
  raw: Partial<ToolbarLayoutSettings> | undefined
): ToolbarLayoutSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TOOLBAR_LAYOUT };
  const customPositions = sanitizeCustomPositions(raw.customPositions);
  return {
    topBar:
      raw.topBar && VALID_TOPBAR_POS.has(raw.topBar)
        ? raw.topBar
        : DEFAULT_TOOLBAR_LAYOUT.topBar,
    toolRail:
      raw.toolRail && VALID_TOOLRAIL_POS.has(raw.toolRail)
        ? raw.toolRail
        : DEFAULT_TOOLBAR_LAYOUT.toolRail,
    inspector:
      raw.inspector && VALID_INSPECTOR_POS.has(raw.inspector)
        ? raw.inspector
        : DEFAULT_TOOLBAR_LAYOUT.inspector,
    contextBar:
      raw.contextBar && VALID_CONTEXT_POS.has(raw.contextBar)
        ? raw.contextBar
        : DEFAULT_TOOLBAR_LAYOUT.contextBar,
    fullscreenBar:
      raw.fullscreenBar && VALID_CORNER_POS.has(raw.fullscreenBar)
        ? raw.fullscreenBar
        : DEFAULT_TOOLBAR_LAYOUT.fullscreenBar,
    ...(customPositions ? { customPositions } : {}),
  };
}

export function loadSavedStudioPreferences(): StudioPreferences {
  const defaults = getDefaultStudioPreferences();
  const savedHandleSettings = loadSavedHandleSettings();
  defaults.toolSettings.handleSettings = savedHandleSettings;

  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<StudioPreferences>;
    if (!parsed || typeof parsed !== 'object') return defaults;

    const rawTool = parsed.toolSettings as Partial<ToolSettings> | undefined;
    const mergedHandleSettings =
      rawTool?.handleSettings && typeof rawTool.handleSettings === 'object'
        ? { ...savedHandleSettings, ...rawTool.handleSettings }
        : savedHandleSettings;

    const fontWeight =
      rawTool?.fontWeight === 400 ||
      rawTool?.fontWeight === 600 ||
      rawTool?.fontWeight === 700
        ? rawTool.fontWeight
        : defaults.toolSettings.fontWeight;

    const textAlign =
      rawTool?.textAlign === 'left' ||
      rawTool?.textAlign === 'center' ||
      rawTool?.textAlign === 'right'
        ? rawTool.textAlign
        : defaults.toolSettings.textAlign;

    return {
      activeTool:
        parsed.activeTool && VALID_TOOLS.has(parsed.activeTool)
          ? parsed.activeTool
          : defaults.activeTool,
      paintTarget:
        parsed.paintTarget === 'fill' || parsed.paintTarget === 'stroke'
          ? parsed.paintTarget
          : defaults.paintTarget,
      currentFill: sanitizePaintStyle(parsed.currentFill, defaults.currentFill),
      currentStroke: sanitizeStrokeStyle(parsed.currentStroke, defaults.currentStroke),
      rememberedStrokePaint: sanitizePaintStyle(
        parsed.rememberedStrokePaint,
        defaults.rememberedStrokePaint
      ),
      toolSettings: {
        smoothing:
          Math.round(
            clamp(
              rawTool?.smoothing ?? defaults.toolSettings.smoothing,
              0,
              100,
              defaults.toolSettings.smoothing
            ) * 10
          ) / 10,
        pencilMode:
          rawTool?.pencilMode && VALID_PENCIL_MODES.has(rawTool.pencilMode)
            ? rawTool.pencilMode
            : defaults.toolSettings.pencilMode,
        autoCloseBrushPath:
          typeof rawTool?.autoCloseBrushPath === 'boolean'
            ? rawTool.autoCloseBrushPath
            : defaults.toolSettings.autoCloseBrushPath,
        shapeKind:
          rawTool?.shapeKind && VALID_SHAPES.has(rawTool.shapeKind)
            ? rawTool.shapeKind
            : defaults.toolSettings.shapeKind,
        polygonSides: Math.round(
          clamp(
            rawTool?.polygonSides ?? defaults.toolSettings.polygonSides,
            3,
            16,
            defaults.toolSettings.polygonSides
          )
        ),
        starPoints: Math.round(
          clamp(
            rawTool?.starPoints ?? defaults.toolSettings.starPoints,
            3,
            16,
            defaults.toolSettings.starPoints
          )
        ),
        starInnerRatio: clamp(
          rawTool?.starInnerRatio ?? defaults.toolSettings.starInnerRatio,
          0.15,
          0.85,
          defaults.toolSettings.starInnerRatio
        ),
        fontSize: Math.round(
          clamp(
            rawTool?.fontSize ?? defaults.toolSettings.fontSize,
            12,
            140,
            defaults.toolSettings.fontSize
          )
        ),
        fontWeight,
        textAlign,
        handleSettings: mergedHandleSettings,
      },
      inspectorOpen:
        typeof parsed.inspectorOpen === 'boolean'
          ? parsed.inspectorOpen
          : defaults.inspectorOpen,
      inspectorTab:
        parsed.inspectorTab && VALID_TABS.has(parsed.inspectorTab)
          ? parsed.inspectorTab
          : defaults.inspectorTab,
      toolbarLayout: sanitizeToolbarLayout(parsed.toolbarLayout),
    };
  } catch {
    return defaults;
  }
}

export function saveStudioPreferences(prefs: StudioPreferences): void {
  saveHandleSettings(prefs.toolSettings.handleSettings);
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}
