import React, { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  ImagePlus,
  Layers,
  Lock,
  Merge,
  Plus,
  RotateCcw,
  Scissors,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  BezierHandleVisibility,
  BezierTangentMode,
  BlendMode,
  BooleanOp,
  BrushProfile,
  CanvasBackground,
  CanvasElement,
  CanvasOrientation,
  CanvasPageConfig,
  CanvasSizePreset,
  DashPattern,
  GridConfig,
  HandleColorPreset,
  HandleSettings,
  HandleSizePreset,
  InspectorPosition,
  InspectorTab,
  Layer,
  PaintStyle,
  PencilPrecision,
  PerspectiveConfig,
  PerspectiveMode,
  StrokeCap,
  StrokeStyle,
  SymmetryConfig,
  SymmetryMode,
  ToolSettings,
  ToolType,
  VectorPathElement,
} from '../types/vector';
import {
  buildCanvasPageConfig,
  CANVAS_SIZE_PRESETS,
  isBoundedCanvas,
} from '../utils/canvasSizes';
import { getPathContours } from '../utils/geometry';
import { DEFAULT_HANDLE_SETTINGS, HANDLE_COLOR_THEMES } from '../utils/handles';
import { ColorPicker } from './ColorPicker';
import { LayerThumbnail } from './LayerThumbnail';
import {
  useClampedToolbarPosition,
  useToolbarLongPress,
} from './ToolbarDragOverlay';

export type { InspectorTab };

interface InspectorPanelProps {
  open: boolean;
  onToggleOpen: () => void;
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  activeTool: ToolType;
  paintTarget: 'fill' | 'stroke';
  onChangePaintTarget: (target: 'fill' | 'stroke') => void;
  currentFill: PaintStyle;
  currentStroke: StrokeStyle;
  onChangeFill: (next: PaintStyle) => void;
  onChangeStroke: (next: StrokeStyle) => void;
  onResetStyleAndToolSettings?: () => void;
  toolSettings: ToolSettings;
  onChangeToolSettings: (next: Partial<ToolSettings>) => void;
  selectedElements: CanvasElement[];
  onCutSelection?: () => void;
  onCopySelection?: () => void;
  onPasteSelection?: () => void;
  canPaste?: boolean;
  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
  onFlipSelection: (axis: 'x' | 'y') => void;
  onReorderSelection: (dir: 'front' | 'back') => void;
  onEditNodesFromSelection: () => void;
  onCombinePaths: (op: BooleanOp) => void;
  onSplitCompoundPath: () => void;
  onAdjustNodeDensity: (mode: 'fewer' | 'more') => void;
  onSmoothSelectedPaths?: (smoothing: number, commit?: boolean) => void;
  layers: Layer[];
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onMergeDownLayer: (id: string) => void;
  onMoveLayer: (id: string, dir: 'up' | 'down') => void;
  onUpdateLayer: (id: string, patch: Partial<Layer>) => void;
  onAddImageToLayer: (layerId: string, file: File) => void;
  onUpdateElementOpacity?: (elementId: string, opacity: number, commit?: boolean) => void;
  onReplaceImage?: (elementId: string, file: File) => void;
  canvasSize?: CanvasPageConfig;
  onChangeCanvasSize: (next: CanvasPageConfig) => void;
  onFitCanvasView: () => void;
  background: CanvasBackground;
  onChangeBackground: (bg: CanvasBackground) => void;
  symmetry: SymmetryConfig;
  onChangeSymmetry: (patch: Partial<SymmetryConfig>) => void;
  perspective: PerspectiveConfig;
  onChangePerspective: (patch: Partial<PerspectiveConfig>) => void;
  grid: GridConfig;
  onChangeGrid: (patch: Partial<GridConfig>) => void;
  position?: InspectorPosition;
  positionClass?: string;
  topOffsetClass?: string;
}

const BLEND_MODES: Array<{ value: BlendMode; label: string }> = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiplizieren' },
  { value: 'screen', label: 'Negativ multiplizieren' },
  { value: 'overlay', label: 'Ineinanderkopieren' },
  { value: 'darken', label: 'Abdunkeln' },
  { value: 'lighten', label: 'Aufhellen' },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  open,
  onToggleOpen,
  activeTab,
  onChangeTab,
  activeTool,
  paintTarget,
  onChangePaintTarget,
  currentFill,
  currentStroke,
  onChangeFill,
  onChangeStroke,
  onResetStyleAndToolSettings,
  toolSettings,
  onChangeToolSettings,
  selectedElements,
  onCutSelection,
  onCopySelection,
  onPasteSelection,
  canPaste = false,
  onDuplicateSelection,
  onDeleteSelection,
  onFlipSelection,
  onReorderSelection,
  onEditNodesFromSelection,
  onCombinePaths,
  onSplitCompoundPath,
  onAdjustNodeDensity,
  onSmoothSelectedPaths,
  layers,
  activeLayerId,
  onSelectLayer,
  onAddLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onMergeDownLayer,
  onMoveLayer,
  onUpdateLayer,
  onAddImageToLayer,
  onUpdateElementOpacity,
  onReplaceImage,
  canvasSize,
  onChangeCanvasSize,
  onFitCanvasView,
  background,
  onChangeBackground,
  symmetry,
  onChangeSymmetry,
  perspective,
  onChangePerspective,
  grid,
  onChangeGrid,
  position = 'right',
  positionClass,
  topOffsetClass = 'top-[4.25rem] sm:top-18',
}) => {
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [layerDraft, setLayerDraft] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImageActionRef = useRef<
    | { mode: 'add'; layerId: string }
    | { mode: 'replace'; elementId: string }
  >({ mode: 'add', layerId: activeLayerId });

  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? layers[0];

  const triggerLayerImageUpload = (layerId: string) => {
    pendingImageActionRef.current = { mode: 'add', layerId };
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
      imageInputRef.current.click();
    }
  };

  const triggerReplaceImage = (elementId: string) => {
    pendingImageActionRef.current = { mode: 'replace', elementId };
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
      imageInputRef.current.click();
    }
  };

  const handleSettings = toolSettings.handleSettings ?? DEFAULT_HANDLE_SETTINGS;
  const updateHandleSettings = (patch: Partial<HandleSettings>) => {
    onChangeToolSettings({
      handleSettings: { ...handleSettings, ...patch },
    });
  };
  const isDefaultHandleSettings =
    handleSettings.size === DEFAULT_HANDLE_SETTINGS.size &&
    handleSettings.bezierVisibility === DEFAULT_HANDLE_SETTINGS.bezierVisibility &&
    handleSettings.tangentMode === DEFAULT_HANDLE_SETTINGS.tangentMode &&
    handleSettings.largeHitArea === DEFAULT_HANDLE_SETTINGS.largeHitArea &&
    handleSettings.accentColor === DEFAULT_HANDLE_SETTINGS.accentColor &&
    handleSettings.showRotationHandle === DEFAULT_HANDLE_SETTINGS.showRotationHandle &&
    handleSettings.showEdgeHandles === DEFAULT_HANDLE_SETTINGS.showEdgeHandles &&
    Boolean(handleSettings.lockAspectRatio) === Boolean(DEFAULT_HANDLE_SETTINGS.lockAspectRatio);

  const renderHandleSettingsBlock = () => (
    <div className="space-y-3 pt-4 border-t border-white/[0.07]">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-200">Anfasser-Einstellungen</h3>
        <button
          type="button"
          disabled={isDefaultHandleSettings}
          onClick={() => onChangeToolSettings({ handleSettings: DEFAULT_HANDLE_SETTINGS })}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors"
          title="Anfasser-Einstellungen auf Standard zurücksetzen"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Zurücksetzen</span>
        </button>
      </div>

      {/* Handle Size */}
      <div className="space-y-1.5">
        <span className="block text-xs text-zinc-400">Anfasser-Größe</span>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111215]">
          {(
            [
              { id: 'small', label: 'Klein' },
              { id: 'normal', label: 'Normal' },
              { id: 'large', label: 'Groß' },
            ] as Array<{ id: HandleSizePreset; label: string }>
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => updateHandleSettings({ size: opt.id })}
              className={`py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                handleSettings.size === opt.id
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bezier Handles Visibility */}
      <div className="space-y-1.5">
        <span className="block text-xs text-zinc-400">Bézier-Tangenten anzeigen</span>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#111215]">
          {(
            [
              { id: 'auto', label: 'Auto' },
              { id: 'selected', label: 'Auswahl' },
              { id: 'all', label: 'Alle' },
              { id: 'none', label: 'Aus' },
            ] as Array<{ id: BezierHandleVisibility; label: string }>
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => updateHandleSettings({ bezierVisibility: opt.id })}
              className={`py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                handleSettings.bezierVisibility === opt.id
                  ? 'bg-[#2A2E37] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tangent Drag Behavior */}
      <div className="space-y-1.5">
        <span className="block text-xs text-zinc-400">Tangenten-Verhalten</span>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111215]">
          {(
            [
              { id: 'aligned', label: 'Gekoppelt' },
              { id: 'symmetrical', label: 'Symmetrisch' },
              { id: 'free', label: 'Frei' },
            ] as Array<{ id: BezierTangentMode; label: string }>
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => updateHandleSettings({ tangentMode: opt.id })}
              className={`py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                handleSettings.tangentMode === opt.id
                  ? 'bg-[#2A2E37] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 leading-snug">
          {handleSettings.tangentMode === 'symmetrical'
            ? 'Spiegelt Richtung und Länge beider Tangenten synchron.'
            : handleSettings.tangentMode === 'free'
            ? 'Jede Tangente lässt sich unabhängig verschieben.'
            : 'Hält gegenüberliegende Tangenten auf einer Geraden (Alt = frei).'}
        </p>
      </div>

      {/* Accent Color */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Anfasser-Farbe</span>
        <div className="flex items-center gap-1.5">
          {(Object.keys(HANDLE_COLOR_THEMES) as HandleColorPreset[]).map((colorKey) => {
            const theme = HANDLE_COLOR_THEMES[colorKey];
            const active = handleSettings.accentColor === colorKey;
            return (
              <button
                key={colorKey}
                type="button"
                onClick={() => updateHandleSettings({ accentColor: colorKey })}
                title={theme.label}
                className={`w-5 h-5 rounded-md ${theme.swatchClass} transition-transform ${
                  active
                    ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1A1C22] scale-110'
                    : 'opacity-70 hover:opacity-100'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Visibility & Hit Area Toggles */}
      <div className="space-y-2 pt-0.5">
        <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
          <span>Großer Greifbereich (Touch)</span>
          <input
            type="checkbox"
            checked={handleSettings.largeHitArea}
            onChange={(e) => updateHandleSettings({ largeHitArea: e.target.checked })}
            className="accent-blue-500"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
          <span>Dreh-Anfasser anzeigen</span>
          <input
            type="checkbox"
            checked={handleSettings.showRotationHandle !== false}
            onChange={(e) =>
              updateHandleSettings({ showRotationHandle: e.target.checked })
            }
            className="accent-blue-500"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
          <span>Seiten-Anfasser (Mitte) anzeigen</span>
          <input
            type="checkbox"
            checked={handleSettings.showEdgeHandles !== false}
            onChange={(e) =>
              updateHandleSettings({ showEdgeHandles: e.target.checked })
            }
            className="accent-blue-500"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
          <span>Form beibehalten (Proportional)</span>
          <input
            type="checkbox"
            checked={Boolean(handleSettings.lockAspectRatio)}
            onChange={(e) =>
              updateHandleSettings({ lockAspectRatio: e.target.checked })
            }
            className="accent-blue-500"
          />
        </label>
      </div>
    </div>
  );

  const defaultOpenPosClass =
    position === 'left'
      ? `left-2.5 sm:left-3 ${topOffsetClass} bottom-2.5 sm:bottom-3`
      : `right-2.5 sm:right-3 ${topOffsetClass} bottom-2.5 sm:bottom-3`;

  const panelRef = useRef<HTMLElement>(null);
  const { isDraggingThis, customPosition, dragProps } =
    useToolbarLongPress('inspector');
  useClampedToolbarPosition(panelRef, open ? customPosition : null, {
    reserveHeight: 240,
  });

  if (!open) {
    return null;
  }

  return (
    <aside
      ref={panelRef}
      data-toolbar-root="inspector"
      className={`fixed ${
        customPosition ? '' : positionClass ?? defaultOpenPosClass
      } z-20 w-[calc(100vw-20px)] max-w-[292px] rounded-xl bg-[#1A1C22]/94 backdrop-blur-md border shadow-2xl flex flex-col overflow-hidden transition-colors ${
        isDraggingThis ? 'border-blue-400/70 ring-2 ring-blue-500/35' : 'border-white/[0.08]'
      }`}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const action = pendingImageActionRef.current;
          if (action.mode === 'replace') {
            onReplaceImage?.(action.elementId, file);
          } else {
            onAddImageToLayer(action.layerId, file);
          }
        }}
      />
      {/* Inspector Tab Header */}
      <div
        {...dragProps}
        className="flex items-center justify-between gap-1.5 p-2 border-b border-white/[0.07] select-none touch-none cursor-grab active:cursor-grabbing"
        title="Gedrückt halten zum Verschieben (Links / Rechts)"
      >
        <div className="grid grid-cols-3 gap-1 flex-1 p-0.5 rounded-lg bg-[#111215]">
          {(
            [
              { id: 'style', label: 'Stil' },
              { id: 'layers', label: 'Ebenen' },
              { id: 'guides', label: 'Hilfen' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-[#2A2E37] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onToggleOpen}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
          title="Panel einklappen"
        >
          {position === 'left' ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto studio-scroll p-3.5 space-y-5">
        {activeTab === 'style' && (
          <>
            {/* Paste Quick Action when clipboard has items and nothing is selected */}
            {selectedElements.length === 0 && canPaste && onPasteSelection && (
              <div className="pb-4 border-b border-white/[0.07]">
                <button
                  type="button"
                  onClick={onPasteSelection}
                  className="w-full py-2 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-200 hover:text-white flex items-center justify-center gap-2 text-xs font-medium transition-colors"
                  title="Auswahl aus Zwischenablage einfügen (Strg+V)"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Aus Zwischenablage einfügen</span>
                </button>
              </div>
            )}

            {/* Selection Quick Actions */}
            {selectedElements.length > 0 && (
              <div className="space-y-2 pb-4 border-b border-white/[0.07]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-200">
                    Auswahl ({selectedElements.length})
                  </span>
                  {selectedElements.length === 1 && selectedElements[0].kind === 'path' && (
                    <button
                      type="button"
                      onClick={onEditNodesFromSelection}
                      className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                    >
                      Direktauswahl
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {onCutSelection && (
                    <button
                      type="button"
                      onClick={onCutSelection}
                      className="py-1.5 px-2 rounded-lg bg-[#111215] hover:bg-[#252830] text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors"
                      title="Ausschneiden (Strg+X)"
                    >
                      <Scissors className="w-3.5 h-3.5 shrink-0" />
                      <span>Ausschneiden</span>
                    </button>
                  )}
                  {onCopySelection && (
                    <button
                      type="button"
                      onClick={onCopySelection}
                      className="py-1.5 px-2 rounded-lg bg-[#111215] hover:bg-[#252830] text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors"
                      title="Kopieren (Strg+C)"
                    >
                      <Copy className="w-3.5 h-3.5 shrink-0" />
                      <span>Kopieren</span>
                    </button>
                  )}
                  {onPasteSelection && (
                    <button
                      type="button"
                      onClick={onPasteSelection}
                      disabled={!canPaste}
                      className="py-1.5 px-2 rounded-lg bg-[#111215] hover:bg-[#252830] disabled:opacity-35 disabled:pointer-events-none text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors"
                      title="Einfügen (Strg+V)"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5 shrink-0" />
                      <span>Einfügen</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-6 gap-1">
                  <button
                    type="button"
                    onClick={onDuplicateSelection}
                    className="p-2 rounded-lg bg-[#111215] hover:bg-[#252830] text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
                    title="Duplizieren (Strg+D)"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onFlipSelection('x')}
                    className="p-2 rounded-lg bg-[#111215] hover:bg-[#252830] text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
                    title="Horizontal spiegeln"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onFlipSelection('y')}
                    className="p-2 rounded-lg bg-[#111215] hover:bg-[#252830] text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
                    title="Vertikal spiegeln"
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReorderSelection('front')}
                    className="p-2 rounded-lg bg-[#111215] hover:bg-[#252830] text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
                    title="Ganz nach vorn"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReorderSelection('back')}
                    className="p-2 rounded-lg bg-[#111215] hover:bg-[#252830] text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
                    title="Ganz nach hinten"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteSelection}
                    className="p-2 rounded-lg bg-[#111215] hover:bg-red-500/20 text-zinc-300 hover:text-red-400 flex items-center justify-center transition-colors"
                    title="Löschen (Entf)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Knoten-Dichte (Weniger / Mehr) */}
                {(() => {
                  const selectedPaths = selectedElements.filter(
                    (el): el is VectorPathElement => el.kind === 'path'
                  );
                  if (selectedPaths.length === 0) return null;
                  const contours = selectedPaths.flatMap((p) => getPathContours(p));
                  const totalNodes = contours.reduce((acc, c) => acc + c.nodes.length, 0);
                  const canReduce = contours.some(
                    (c) => c.nodes.length > (c.closed ? 3 : 2)
                  );
                  const canIncrease = contours.some(
                    (c) => c.nodes.length >= 2 && c.nodes.length < 400
                  );
                  const currentSmoothValue =
                    Math.round(
                      (selectedPaths.reduce((sum, p) => {
                        if (typeof p.smoothing === 'number') return sum + p.smoothing;
                        const hasCurves = p.nodes.some((n) => n.handleIn || n.handleOut);
                        return sum + (hasCurves ? 50 : 0);
                      }, 0) /
                        selectedPaths.length) *
                        10
                    ) / 10;
                  const stepObjectSmooth = (delta: number) => {
                    const nextVal =
                      Math.round(Math.max(0, Math.min(100, currentSmoothValue + delta)) * 10) / 10;
                    onSmoothSelectedPaths?.(nextVal, false);
                    onSmoothSelectedPaths?.(nextVal, true);
                  };
                  return (
                    <div className="pt-2 space-y-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
                          <span>Knoten</span>
                          <span className="font-mono-tabular text-zinc-300">
                            {totalNodes}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            disabled={!canReduce}
                            onClick={() => onAdjustNodeDensity('fewer')}
                            className="py-1.5 px-2 rounded-lg bg-[#111215] hover:bg-blue-600/25 border border-white/[0.06] hover:border-blue-500/40 disabled:opacity-35 disabled:pointer-events-none text-[11px] font-medium text-zinc-200 transition-colors"
                            title="Weniger Knoten (Pfad vereinfachen)"
                          >
                            − Weniger
                          </button>
                          <button
                            type="button"
                            disabled={!canIncrease}
                            onClick={() => onAdjustNodeDensity('more')}
                            className="py-1.5 px-2 rounded-lg bg-[#111215] hover:bg-blue-600/25 border border-white/[0.06] hover:border-blue-500/40 disabled:opacity-35 disabled:pointer-events-none text-[11px] font-medium text-zinc-200 transition-colors"
                            title="Mehr Knoten (Segmente unterteilen)"
                          >
                            + Mehr
                          </button>
                        </div>
                      </div>

                      {onSmoothSelectedPaths && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5 text-[11px] font-medium text-zinc-400">
                            <span className="truncate">Pfad-Glättung (Objekt)</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => stepObjectSmooth(e.shiftKey ? -0.1 : -0.5)}
                                className="w-5 h-5 rounded bg-[#111215] hover:bg-white/10 border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center leading-none"
                                title="−0,5% feiner (Umschalt: −0,1%)"
                              >
                                −
                              </button>
                              <div className="flex items-center bg-[#111215] border border-white/[0.08] rounded px-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.1}
                                  value={currentSmoothValue}
                                  onChange={(e) => {
                                    const raw = Number(e.target.value);
                                    if (!Number.isFinite(raw)) return;
                                    const clamped = Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
                                    onSmoothSelectedPaths(clamped, false);
                                  }}
                                  onBlur={(e) => {
                                    const raw = Number(e.target.value);
                                    const clamped = Number.isFinite(raw)
                                      ? Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10
                                      : currentSmoothValue;
                                    onSmoothSelectedPaths(clamped, true);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const raw = Number((e.target as HTMLInputElement).value);
                                      const clamped = Number.isFinite(raw)
                                        ? Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10
                                        : currentSmoothValue;
                                      onSmoothSelectedPaths(clamped, true);
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  className="w-10 py-0.5 text-[11px] text-right font-mono-tabular text-zinc-100 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-[10px] text-zinc-400 pl-0.5">%</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => stepObjectSmooth(e.shiftKey ? 0.1 : 0.5)}
                                className="w-5 h-5 rounded bg-[#111215] hover:bg-white/10 border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center leading-none"
                                title="+0,5% feiner (Umschalt: +0,1%)"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={0.5}
                            value={currentSmoothValue}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              onSmoothSelectedPaths(val, false);
                            }}
                            onPointerUp={(e) => {
                              const val = Number((e.target as HTMLInputElement).value);
                              onSmoothSelectedPaths(val, true);
                            }}
                            onTouchEnd={(e) => {
                              const val = Number((e.target as HTMLInputElement).value);
                              onSmoothSelectedPaths(val, true);
                            }}
                            onBlur={(e) => {
                              const val = Number((e.target as HTMLInputElement).value);
                              onSmoothSelectedPaths(val, true);
                            }}
                            onKeyUp={(e) => {
                              const val = Number((e.target as HTMLInputElement).value);
                              onSmoothSelectedPaths(val, true);
                            }}
                            className="studio-slider w-full"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Kombinieren / Pfadfinder */}
                {selectedElements.filter((el) => el.kind === 'path').length >= 2 && (
                  <div className="pt-2 space-y-1.5">
                    <span className="block text-[11px] font-medium text-zinc-400">
                      Kombinieren (Pfadfinder)
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { op: 'union', label: 'Vereinen' },
                          { op: 'subtract', label: 'Abziehen' },
                          { op: 'intersect', label: 'Schnittmenge' },
                          { op: 'exclude', label: 'Ausschließen' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.op}
                          type="button"
                          onClick={() => onCombinePaths(item.op)}
                          className="py-1.5 px-2 rounded-lg bg-[#111215] hover:bg-blue-600/25 border border-white/[0.06] hover:border-blue-500/40 text-[11px] font-medium text-zinc-200 transition-colors"
                        >
                          {item.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => onCombinePaths('combine')}
                        className="col-span-2 py-1.5 px-2 rounded-lg bg-[#111215] hover:bg-blue-600/25 border border-white/[0.06] hover:border-blue-500/40 text-[11px] font-medium text-zinc-200 transition-colors"
                      >
                        Pfade kombinieren (Loch-Pfad)
                      </button>
                    </div>
                  </div>
                )}

                {selectedElements.length === 1 &&
                  selectedElements[0].kind === 'path' &&
                  (selectedElements[0].subpaths?.length ?? 0) > 1 && (
                    <button
                      type="button"
                      onClick={onSplitCompoundPath}
                      className="w-full py-1.5 px-2 rounded-lg bg-[#111215] hover:bg-amber-600/25 border border-white/[0.06] hover:border-amber-500/40 text-[11px] font-medium text-zinc-200 transition-colors"
                    >
                      Kombinierten Pfad trennen
                    </button>
                  )}

                {/* Selected Image Controls */}
                {selectedElements.length === 1 && selectedElements[0].kind === 'image' && (
                  <div className="pt-2 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
                      <span>Bild-Deckkraft</span>
                      <span className="font-mono-tabular text-zinc-200">
                        {Math.round(selectedElements[0].opacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={Math.round(selectedElements[0].opacity * 100)}
                      onChange={(e) =>
                        onUpdateElementOpacity?.(
                          selectedElements[0].id,
                          Number(e.target.value) / 100,
                          false
                        )
                      }
                      onPointerUp={(e) =>
                        onUpdateElementOpacity?.(
                          selectedElements[0].id,
                          Number((e.target as HTMLInputElement).value) / 100,
                          true
                        )
                      }
                      className="studio-slider w-full"
                    />
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-[11px] font-mono-tabular text-zinc-400">
                        {Math.round(selectedElements[0].width)} ×{' '}
                        {Math.round(selectedElements[0].height)} px
                      </span>
                      <button
                        type="button"
                        onClick={() => triggerReplaceImage(selectedElements[0].id)}
                        className="flex items-center gap-1 py-1 px-2 rounded-lg bg-[#111215] hover:bg-blue-600/25 border border-white/[0.06] hover:border-blue-500/40 text-[11px] font-medium text-zinc-200 transition-colors"
                      >
                        <ImagePlus className="w-3 h-3 text-blue-400" />
                        <span>Bild ersetzen</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fill / Stroke Target Switch */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111215] border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => onChangePaintTarget('fill')}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                    paintTarget === 'fill'
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Füllung
                </button>
                <button
                  type="button"
                  onClick={() => onChangePaintTarget('stroke')}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                    paintTarget === 'stroke'
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Kontur
                </button>
              </div>

              <ColorPicker
                paint={paintTarget === 'fill' ? currentFill : currentStroke.paint}
                onChange={(nextPaint) => {
                  if (paintTarget === 'fill') onChangeFill(nextPaint);
                  else onChangeStroke({ ...currentStroke, paint: nextPaint });
                }}
              />
            </div>

            {/* Stroke & Brush Controls */}
            <div className="space-y-3 pt-4 border-t border-white/[0.07]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-200">Kontur & Pinsel</h3>
                {onResetStyleAndToolSettings && (
                  <button
                    type="button"
                    onClick={onResetStyleAndToolSettings}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors"
                    title="Farben, Kontur, Pinsel & Glättung auf Standard zurücksetzen"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Zurücksetzen</span>
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Strichstärke</span>
                  <span className="font-mono-tabular text-zinc-200">
                    {currentStroke.width.toFixed(1)} px
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={48}
                  step={0.5}
                  value={currentStroke.width}
                  onChange={(e) =>
                    onChangeStroke({ ...currentStroke, width: Number(e.target.value) })
                  }
                  className="studio-slider w-full"
                />
              </div>

              {/* Brush Profile */}
              <div className="space-y-1.5">
                <span className="block text-xs text-zinc-400">Pinselprofil</span>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111215]">
                  {(
                    [
                      { id: 'monoline', label: 'Monolinie' },
                      { id: 'tapered', label: 'Spitz' },
                      { id: 'calligraphy', label: 'Kalligrafie' },
                    ] as Array<{ id: BrushProfile; label: string }>
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onChangeStroke({ ...currentStroke, profile: p.id })}
                      className={`py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                        currentStroke.profile === p.id
                          ? 'bg-[#2A2E37] text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pencil Precision Mode (Fein / Normal / Grob) */}
              <div className="space-y-1.5">
                <span className="block text-xs text-zinc-400">Stift-Modus (Fein / Grob)</span>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111215]">
                  {(
                    [
                      { id: 'fine', label: 'Fein', smoothing: 25 },
                      { id: 'normal', label: 'Normal', smoothing: 55 },
                      { id: 'coarse', label: 'Grob', smoothing: 85 },
                    ] as Array<{ id: PencilPrecision; label: string; smoothing: number }>
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        onChangeToolSettings({
                          pencilMode: mode.id,
                          smoothing: mode.smoothing,
                        })
                      }
                      className={`py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                        toolSettings.pencilMode === mode.id
                          ? 'bg-blue-600 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Smoothing (brush default; hidden when a path is selected so only the object smoothing slider shows) */}
              {!selectedElements.some((el) => el.kind === 'path') && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5 text-xs text-zinc-400">
                    <span className="truncate">Pfad-Glättung (Stift)</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          const step = e.shiftKey ? 0.1 : 0.5;
                          const nextVal =
                            Math.round(Math.max(0, Math.min(100, toolSettings.smoothing - step)) * 10) / 10;
                          onChangeToolSettings({ smoothing: nextVal });
                        }}
                        className="w-5 h-5 rounded bg-[#111215] hover:bg-white/10 border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center text-[11px] leading-none"
                        title="−0,5% feiner (Umschalt: −0,1%)"
                      >
                        −
                      </button>
                      <div className="flex items-center bg-[#111215] border border-white/[0.08] rounded px-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={Math.round(toolSettings.smoothing * 10) / 10}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            if (!Number.isFinite(raw)) return;
                            const clamped = Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
                            onChangeToolSettings({ smoothing: clamped });
                          }}
                          onBlur={(e) => {
                            const raw = Number(e.target.value);
                            const clamped = Number.isFinite(raw)
                              ? Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10
                              : toolSettings.smoothing;
                            onChangeToolSettings({ smoothing: clamped });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const raw = Number((e.target as HTMLInputElement).value);
                              const clamped = Number.isFinite(raw)
                                ? Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10
                                : toolSettings.smoothing;
                              onChangeToolSettings({ smoothing: clamped });
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="w-10 py-0.5 text-[11px] text-right font-mono-tabular text-zinc-100 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-[10px] text-zinc-400 pl-0.5">%</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          const step = e.shiftKey ? 0.1 : 0.5;
                          const nextVal =
                            Math.round(Math.max(0, Math.min(100, toolSettings.smoothing + step)) * 10) / 10;
                          onChangeToolSettings({ smoothing: nextVal });
                        }}
                        className="w-5 h-5 rounded bg-[#111215] hover:bg-white/10 border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center text-[11px] leading-none"
                        title="+0,5% feiner (Umschalt: +0,1%)"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={toolSettings.smoothing}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onChangeToolSettings({ smoothing: val });
                    }}
                    className="studio-slider w-full"
                  />
                </div>
              )}

              {/* Auto-Close Stift Path */}
              <label className="flex items-center justify-between gap-2 pt-0.5 text-xs text-zinc-300 cursor-pointer">
                <span>Stift-Pfad immer automatisch schließen</span>
                <input
                  type="checkbox"
                  checked={toolSettings.autoCloseBrushPath}
                  onChange={(e) =>
                    onChangeToolSettings({ autoCloseBrushPath: e.target.checked })
                  }
                  className="accent-blue-500"
                />
              </label>

              {/* Line Cap & Dash */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Abschluss</label>
                  <select
                    value={currentStroke.cap}
                    onChange={(e) =>
                      onChangeStroke({
                        ...currentStroke,
                        cap: e.target.value as StrokeCap,
                      })
                    }
                    className="w-full px-2 py-1.5 text-xs bg-[#111215] border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="round">Rund</option>
                    <option value="butt">Flach</option>
                    <option value="square">Quadrat</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Linienart</label>
                  <select
                    value={currentStroke.dash}
                    onChange={(e) =>
                      onChangeStroke({
                        ...currentStroke,
                        dash: e.target.value as DashPattern,
                      })
                    }
                    className="w-full px-2 py-1.5 text-xs bg-[#111215] border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="solid">Durchgezogen</option>
                    <option value="dashed">Gestrichelt</option>
                    <option value="dotted">Gepunktet</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Shape specific options */}
            {activeTool === 'shape' &&
              (toolSettings.shapeKind === 'polygon' || toolSettings.shapeKind === 'star') && (
                <div className="space-y-3 pt-4 border-t border-white/[0.07]">
                  <h3 className="text-xs font-semibold text-zinc-200">Form-Parameter</h3>
                  {toolSettings.shapeKind === 'polygon' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span>Ecken</span>
                        <span className="font-mono-tabular text-zinc-200">
                          {toolSettings.polygonSides}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={3}
                        max={16}
                        value={toolSettings.polygonSides}
                        onChange={(e) =>
                          onChangeToolSettings({ polygonSides: Number(e.target.value) })
                        }
                        className="studio-slider w-full"
                      />
                    </div>
                  )}
                  {toolSettings.shapeKind === 'star' && (
                    <>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span>Zacken</span>
                          <span className="font-mono-tabular text-zinc-200">
                            {toolSettings.starPoints}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={3}
                          max={16}
                          value={toolSettings.starPoints}
                          onChange={(e) =>
                            onChangeToolSettings({ starPoints: Number(e.target.value) })
                          }
                          className="studio-slider w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span>Innenradius</span>
                          <span className="font-mono-tabular text-zinc-200">
                            {Math.round(toolSettings.starInnerRatio * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={15}
                          max={85}
                          value={Math.round(toolSettings.starInnerRatio * 100)}
                          onChange={(e) =>
                            onChangeToolSettings({
                              starInnerRatio: Number(e.target.value) / 100,
                            })
                          }
                          className="studio-slider w-full"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

            {/* Text specific options */}
            {(activeTool === 'text' ||
              (selectedElements.length === 1 && selectedElements[0].kind === 'text')) && (
              <div className="space-y-3 pt-4 border-t border-white/[0.07]">
                <h3 className="text-xs font-semibold text-zinc-200">Typografie</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Schriftgröße</span>
                    <span className="font-mono-tabular text-zinc-200">
                      {toolSettings.fontSize} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={140}
                    value={toolSettings.fontSize}
                    onChange={(e) =>
                      onChangeToolSettings({ fontSize: Number(e.target.value) })
                    }
                    className="studio-slider w-full"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111215]">
                  {([400, 600, 700] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onChangeToolSettings({ fontWeight: w })}
                      className={`py-1 text-xs rounded-md transition-colors ${
                        toolSettings.fontWeight === w
                          ? 'bg-[#2A2E37] text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {w === 400 ? 'Normal' : w === 600 ? 'Halbfett' : 'Fett'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'layers' && (
          <>
            {/* Layer Actions Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <Layers className="w-3.5 h-3.5 text-zinc-400" />
                <span>Ebenen ({layers.length})</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onAddLayer}
                  className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                  title="Neue Ebene"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => activeLayer && onDuplicateLayer(activeLayer.id)}
                  className="p-1.5 rounded-lg bg-[#111215] hover:bg-[#252830] text-zinc-300 hover:text-white transition-colors"
                  title="Ebene duplizieren"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => activeLayer && onMergeDownLayer(activeLayer.id)}
                  disabled={layers.length <= 1 || layers[0]?.id === activeLayer?.id}
                  className="p-1.5 rounded-lg bg-[#111215] hover:bg-[#252830] text-zinc-300 hover:text-white disabled:opacity-30 transition-colors"
                  title="Mit darunterliegender Ebene vereinen"
                >
                  <Merge className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => activeLayer && onDeleteLayer(activeLayer.id)}
                  disabled={layers.length <= 1}
                  className="p-1.5 rounded-lg bg-[#111215] hover:bg-red-500/20 text-zinc-300 hover:text-red-400 disabled:opacity-30 transition-colors"
                  title="Ebene löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Clear "Bild zur Ebene hinzufügen" Button */}
            {activeLayer && (
              <button
                type="button"
                disabled={activeLayer.locked}
                onClick={() => triggerLayerImageUpload(activeLayer.id)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#111215] hover:bg-blue-600/20 border border-white/[0.08] hover:border-blue-500/45 disabled:opacity-35 disabled:pointer-events-none text-xs font-medium text-zinc-200 hover:text-white transition-colors"
              >
                <ImagePlus className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">
                  Bild zu „{activeLayer.name}“ hinzufügen
                </span>
              </button>
            )}

            {/* Active Layer Opacity & Blend Mode */}
            {activeLayer && (
              <div className="p-2.5 rounded-lg bg-[#111215] border border-white/[0.06] space-y-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Ebenen-Deckkraft</span>
                    <span className="font-mono-tabular text-zinc-200">
                      {Math.round(activeLayer.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(activeLayer.opacity * 100)}
                    onChange={(e) =>
                      onUpdateLayer(activeLayer.id, {
                        opacity: Number(e.target.value) / 100,
                      })
                    }
                    className="studio-slider w-full"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-400 shrink-0">Mischmodus</span>
                  <select
                    value={activeLayer.blendMode}
                    onChange={(e) =>
                      onUpdateLayer(activeLayer.id, {
                        blendMode: e.target.value as BlendMode,
                      })
                    }
                    className="flex-1 px-2 py-1 text-xs bg-[#1A1C22] border border-white/10 rounded text-zinc-200 focus:outline-none focus:border-blue-500"
                  >
                    {BLEND_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Layers Stack (Top-most layer rendered first visually) */}
            <div className="space-y-1.5">
              {[...layers].reverse().map((layer) => {
                const isActive = layer.id === activeLayerId;
                return (
                  <div
                    key={layer.id}
                    onClick={() => onSelectLayer(layer.id)}
                    className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-blue-600/15 border-blue-500/45 text-white'
                        : 'bg-[#111215] border-white/[0.05] text-zinc-300 hover:border-white/15'
                    }`}
                  >
                    <LayerThumbnail layer={layer} background={background} />

                    <div className="min-w-0 flex-1">
                      {renamingLayerId === layer.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={layerDraft}
                          onChange={(e) => setLayerDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => {
                            if (layerDraft.trim()) {
                              onUpdateLayer(layer.id, { name: layerDraft.trim() });
                            }
                            setRenamingLayerId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (layerDraft.trim()) {
                                onUpdateLayer(layer.id, { name: layerDraft.trim() });
                              }
                              setRenamingLayerId(null);
                            }
                          }}
                          className="w-full px-1.5 py-0.5 text-xs bg-[#1A1C22] border border-blue-500 rounded text-white focus:outline-none"
                        />
                      ) : (
                        <div
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setLayerDraft(layer.name);
                            setRenamingLayerId(layer.id);
                          }}
                          className="text-xs font-medium truncate"
                          title="Doppelklick zum Umbenennen"
                        >
                          {layer.name}
                        </div>
                      )}
                      <div className="text-[11px] text-zinc-500 font-mono-tabular truncate">
                        {(() => {
                          const imgCount = layer.elements.filter((el) => el.kind === 'image').length;
                          const objLabel =
                            imgCount > 0
                              ? `${layer.elements.length} Obj. (${imgCount} Bild${imgCount > 1 ? 'er' : ''})`
                              : `${layer.elements.length} Elem.`;
                          return `${objLabel} · ${Math.round(layer.opacity * 100)}%`;
                        })()}
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={layer.locked}
                        onClick={() => triggerLayerImageUpload(layer.id)}
                        className="p-0.5 text-zinc-500 hover:text-blue-400 disabled:opacity-25 rounded"
                        title={
                          layer.locked
                            ? 'Ebene ist gesperrt'
                            : 'Bild zu dieser Ebene hinzufügen'
                        }
                      >
                        <ImagePlus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveLayer(layer.id, 'up')}
                        className="p-0.5 text-zinc-500 hover:text-white rounded"
                        title="Ebene nach oben"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveLayer(layer.id, 'down')}
                        className="p-0.5 text-zinc-500 hover:text-white rounded"
                        title="Ebene nach unten"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateLayer(layer.id, { locked: !layer.locked })
                        }
                        className={`p-0.5 rounded ${
                          layer.locked ? 'text-amber-400' : 'text-zinc-500 hover:text-white'
                        }`}
                        title={layer.locked ? 'Entsperren' : 'Sperren'}
                      >
                        {layer.locked ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateLayer(layer.id, { visible: !layer.visible })
                        }
                        className={`p-0.5 rounded ${
                          layer.visible ? 'text-zinc-300 hover:text-white' : 'text-zinc-600'
                        }`}
                        title={layer.visible ? 'Ausblenden' : 'Einblenden'}
                      >
                        {layer.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Canvas Size & Format (A4, A3, A5, Social, Custom, Infinite) */}
            <div className="space-y-2.5 pt-4 border-t border-white/[0.07]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-200">
                  Leinwandgröße & Format
                </h3>
                {isBoundedCanvas(canvasSize) && (
                  <button
                    type="button"
                    onClick={onFitCanvasView}
                    className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    title="Blatt mittig einpassen"
                  >
                    Einpassen
                  </button>
                )}
              </div>

              <select
                value={canvasSize?.preset ?? 'infinite'}
                onChange={(e) => {
                  const preset = e.target.value as CanvasSizePreset;
                  onChangeCanvasSize(
                    buildCanvasPageConfig(
                      preset,
                      undefined,
                      canvasSize?.width,
                      canvasSize?.height
                    )
                  );
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-[#111215] border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                {CANVAS_SIZE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              {/* Quick Format Chips */}
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'infinite', label: 'Frei' },
                    { id: 'a4', label: 'A4' },
                    { id: 'a3', label: 'A3' },
                    { id: 'a5', label: 'A5' },
                    { id: 'square-1080', label: '1:1' },
                    { id: 'hd-1080', label: '16:9' },
                  ] as Array<{ id: CanvasSizePreset; label: string }>
                ).map((chip) => {
                  const active = (canvasSize?.preset ?? 'infinite') === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() =>
                        onChangeCanvasSize(
                          buildCanvasPageConfig(
                            chip.id,
                            undefined,
                            canvasSize?.width,
                            canvasSize?.height
                          )
                        )
                      }
                      className={`py-1 text-[11px] font-medium rounded-md border transition-colors ${
                        active
                          ? 'bg-blue-600/25 border-blue-500/60 text-white'
                          : 'bg-[#111215] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {isBoundedCanvas(canvasSize) && (
                <div className="space-y-2 pt-0.5">
                  {canvasSize.preset !== 'square-1080' && (
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111215]">
                      {(
                        [
                          { id: 'portrait', label: 'Hochformat' },
                          { id: 'landscape', label: 'Querformat' },
                        ] as Array<{ id: CanvasOrientation; label: string }>
                      ).map((ori) => (
                        <button
                          key={ori.id}
                          type="button"
                          onClick={() => {
                            if (canvasSize.preset === 'custom') {
                              const s = Math.min(canvasSize.width, canvasSize.height);
                              const l = Math.max(canvasSize.width, canvasSize.height);
                              onChangeCanvasSize({
                                preset: 'custom',
                                width: ori.id === 'portrait' ? s : l,
                                height: ori.id === 'portrait' ? l : s,
                                orientation: ori.id,
                              });
                            } else {
                              onChangeCanvasSize(
                                buildCanvasPageConfig(canvasSize.preset, ori.id)
                              );
                            }
                          }}
                          className={`py-1 text-[11px] font-medium rounded-md transition-colors ${
                            canvasSize.orientation === ori.id
                              ? 'bg-[#2A2E37] text-white'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {ori.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {canvasSize.preset === 'custom' ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-0.5">
                          Breite (px)
                        </label>
                        <input
                          type="number"
                          min={64}
                          max={8000}
                          value={Math.round(canvasSize.width)}
                          onChange={(e) => {
                            const nextW = Math.max(
                              64,
                              Math.min(8000, Number(e.target.value) || 64)
                            );
                            onChangeCanvasSize({
                              preset: 'custom',
                              width: nextW,
                              height: canvasSize.height,
                              orientation:
                                nextW >= canvasSize.height ? 'landscape' : 'portrait',
                            });
                          }}
                          className="w-full px-2 py-1 text-xs font-mono-tabular bg-[#111215] border border-white/10 rounded text-zinc-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-0.5">
                          Höhe (px)
                        </label>
                        <input
                          type="number"
                          min={64}
                          max={8000}
                          value={Math.round(canvasSize.height)}
                          onChange={(e) => {
                            const nextH = Math.max(
                              64,
                              Math.min(8000, Number(e.target.value) || 64)
                            );
                            onChangeCanvasSize({
                              preset: 'custom',
                              width: canvasSize.width,
                              height: nextH,
                              orientation:
                                canvasSize.width >= nextH ? 'landscape' : 'portrait',
                            });
                          }}
                          className="w-full px-2 py-1 text-xs font-mono-tabular bg-[#111215] border border-white/10 rounded text-zinc-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono-tabular text-zinc-400 text-center">
                      {Math.round(canvasSize.width)} × {Math.round(canvasSize.height)} px
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Canvas Background */}
            <div className="space-y-2 pt-4 border-t border-white/[0.07]">
              <h3 className="text-xs font-semibold text-zinc-200">Leinwand-Hintergrund</h3>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    { id: 'white', label: 'Weiß', cls: 'bg-white' },
                    { id: 'paper', label: 'Papier', cls: 'bg-[#F7F4EE]' },
                    { id: 'dark', label: 'Dunkel', cls: 'bg-[#16181D]' },
                    { id: 'transparent', label: 'Alpha', cls: 'checkerboard-bg' },
                  ] as Array<{ id: CanvasBackground; label: string; cls: string }>
                ).map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => onChangeBackground(bg.id)}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border text-[11px] transition-colors ${
                      background === bg.id
                        ? 'border-blue-500 text-white bg-blue-500/10'
                        : 'border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span className={`w-full h-5 rounded border border-white/20 ${bg.cls}`} />
                    <span>{bg.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'guides' && (
          <>
            {/* Symmetry Studio */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-200">Echtzeit-Symmetrie</h3>
                {symmetry.mode !== 'none' && (
                  <button
                    type="button"
                    onClick={() => onChangeSymmetry({ center: { x: 0, y: 0 } })}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Zentrieren</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'none', label: 'Aus' },
                    { id: 'vertical', label: 'Vertikal' },
                    { id: 'horizontal', label: 'Horizontal' },
                    { id: 'radial', label: 'Kaleidoskop' },
                  ] as Array<{ id: SymmetryMode; label: string }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onChangeSymmetry({ mode: m.id })}
                    className={`py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors ${
                      symmetry.mode === m.id
                        ? 'bg-pink-500/20 border-pink-500/50 text-pink-200'
                        : 'bg-[#111215] border-white/[0.06] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {symmetry.mode === 'radial' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Segmente</span>
                    <span className="font-mono-tabular text-zinc-200">
                      {symmetry.segments}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={12}
                    value={symmetry.segments}
                    onChange={(e) =>
                      onChangeSymmetry({ segments: Number(e.target.value) })
                    }
                    className="studio-slider w-full"
                  />
                </div>
              )}

              {symmetry.mode !== 'none' && (
                <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                  <span>Symmetrie-Achsen anzeigen</span>
                  <input
                    type="checkbox"
                    checked={symmetry.showAxes}
                    onChange={(e) => onChangeSymmetry({ showAxes: e.target.checked })}
                    className="accent-pink-500"
                  />
                </label>
              )}
            </div>

            {/* Perspective Guides */}
            <div className="space-y-3 pt-4 border-t border-white/[0.07]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-200">
                  Perspektiv-Hilfslinien
                </h3>
                {perspective.mode !== 'none' && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangePerspective({
                        horizonY: 0,
                        vp1: { x: 0, y: 0 },
                        vp2: { x: 380, y: 0 },
                        vp3: { x: 0, y: 360 },
                      })
                    }
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'none', label: 'Aus' },
                    { id: '1-point', label: '1-Punkt' },
                    { id: '2-point', label: '2-Punkt' },
                    { id: '3-point', label: '3-Punkt' },
                    { id: 'isometric', label: 'Isometrisch' },
                  ] as Array<{ id: PerspectiveMode; label: string }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onChangePerspective({ mode: m.id })}
                    className={`py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors ${
                      perspective.mode === m.id
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-200'
                        : 'bg-[#111215] border-white/[0.06] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {perspective.mode !== 'none' && (
                <>
                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                    <span>An Perspektive einrasten (Linien)</span>
                    <input
                      type="checkbox"
                      checked={perspective.snapToGuides}
                      onChange={(e) =>
                        onChangePerspective({ snapToGuides: e.target.checked })
                      }
                      className="accent-blue-500"
                    />
                  </label>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>Linien-Deckkraft</span>
                      <span className="font-mono-tabular text-zinc-200">
                        {Math.round(perspective.opacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round(perspective.opacity * 100)}
                      onChange={(e) =>
                        onChangePerspective({ opacity: Number(e.target.value) / 100 })
                      }
                      className="studio-slider w-full"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Ziehe die farbigen Fluchtpunkte direkt auf der Leinwand, um den Horizont anzupassen.
                  </p>
                </>
              )}
            </div>

            {/* Grid & Snapping Controls */}
            <div className="space-y-3 pt-4 border-t border-white/[0.07]">
              <h3 className="text-xs font-semibold text-zinc-200">Einrasten & Raster</h3>
              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                <span>Magnet-Einrasten (Hilfslinien)</span>
                <input
                  type="checkbox"
                  checked={grid.smartGuides !== false}
                  onChange={(e) =>
                    onChangeGrid({ smartGuides: e.target.checked })
                  }
                  className="accent-emerald-500"
                />
              </label>
              {grid.smartGuides !== false && (
                <div className="pl-2.5 space-y-2 border-l border-white/10">
                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                    <span>An Objekten & Mitte</span>
                    <input
                      type="checkbox"
                      checked={grid.snapToObjects !== false}
                      onChange={(e) =>
                        onChangeGrid({ snapToObjects: e.target.checked })
                      }
                      className="accent-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                    <span>An Knoten & Punkten</span>
                    <input
                      type="checkbox"
                      checked={grid.snapToNodes !== false}
                      onChange={(e) =>
                        onChangeGrid({ snapToNodes: e.target.checked })
                      }
                      className="accent-emerald-500"
                    />
                  </label>
                </div>
              )}
              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                <span>Am Raster einrasten</span>
                <input
                  type="checkbox"
                  checked={grid.snap}
                  onChange={(e) => onChangeGrid({ snap: e.target.checked })}
                  className="accent-blue-500"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                <span>Raster anzeigen</span>
                <input
                  type="checkbox"
                  checked={grid.visible}
                  onChange={(e) => onChangeGrid({ visible: e.target.checked })}
                  className="accent-blue-500"
                />
              </label>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Rastergröße</span>
                  <span className="font-mono-tabular text-zinc-200">{grid.size} px</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={grid.size}
                  onChange={(e) => onChangeGrid({ size: Number(e.target.value) })}
                  className="studio-slider w-full"
                />
              </div>
            </div>

            {/* Handle Settings */}
            {renderHandleSettingsBlock()}
          </>
        )}
      </div>
    </aside>
  );
};
