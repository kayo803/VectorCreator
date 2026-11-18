import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minimize2, PanelRight, Redo2, Settings, SlidersHorizontal, Undo2 } from 'lucide-react';
import { CanvasViewport } from './components/CanvasViewport';
import { InspectorPanel, InspectorTab } from './components/InspectorPanel';
import { ExportModal } from './components/ExportModal';
import { HistoryModal } from './components/HistoryModal';
import { ProjectsModal } from './components/ProjectsModal';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import {
  ToolbarDragProvider,
  useClampedToolbarPosition,
  useToolbarLongPress,
} from './components/ToolbarDragOverlay';
import { ToolRail } from './components/ToolRail';
import { TopBar } from './components/TopBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  BooleanOp,
  CanvasElement,
  Layer,
  PaintStyle,
  PathSubpath,
  ProjectDocument,
  StrokeStyle,
  ToolbarLayoutSettings,
  ToolSettings,
  ToolType,
  VectorImageElement,
  VectorPathElement,
} from './types/vector';
import { combineVectorPaths, splitCompoundPath } from './utils/boolean';
import {
  cloneElementWithFreshIds,
  createId,
  getCombinedBounds,
  getPathContours,
  scaleElement,
  simplifyPathElement,
  smoothPathElement,
  subdividePathElement,
} from './utils/geometry';
import { computeFitCanvasViewport } from './utils/canvasSizes';
import { computeImagePlacement, loadAndOptimizeImageFile } from './utils/image';
import {
  DEFAULT_TOOLBAR_LAYOUT,
  getDefaultStudioPreferences,
  getDefaultToolSettings,
  loadSavedStudioPreferences,
  saveStudioPreferences,
} from './utils/preferences';
import {
  createBlankDocument,
  createDefaultPaint,
  createDefaultStroke,
  createMandalaTemplate,
} from './utils/templates';

const STORAGE_KEY = 'vektora_studio_projects_v1';
const ACTIVE_ID_KEY = 'vektora_studio_active_id_v1';

function loadInitialProjects(): {
  projects: ProjectDocument[];
  activeId: string;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectDocument[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const savedId = localStorage.getItem(ACTIVE_ID_KEY);
        const active = parsed.find((p) => p.id === savedId) ?? parsed[0];
        return { projects: parsed, activeId: active.id };
      }
    }
  } catch {
    // Fallback to defaults
  }
  const blank = createBlankDocument('Atelier Leinwand');
  const mandala = createMandalaTemplate();
  return { projects: [blank, mandala], activeId: blank.id };
}

interface FullscreenControlBarProps {
  positionClass: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showTools: boolean;
  onToggleTools: () => void;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  studioOpen: boolean;
  onToggleStudio: () => void;
  onExitFullscreen: () => void;
}

function FullscreenControlBar({
  positionClass,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showTools,
  onToggleTools,
  settingsOpen,
  onOpenSettings,
  studioOpen,
  onToggleStudio,
  onExitFullscreen,
}: FullscreenControlBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const { isDraggingThis, customPosition, dragProps } =
    useToolbarLongPress('fullscreenBar');
  useClampedToolbarPosition(barRef, customPosition);

  return (
    <div
      ref={barRef}
      {...dragProps}
      className={`fixed ${
        customPosition ? '' : positionClass
      } z-40 flex items-center gap-1 p-1 rounded-xl bg-[#1A1C22]/92 backdrop-blur-md border shadow-2xl select-none touch-none transition-colors ${
        isDraggingThis ? 'border-blue-400/70 ring-2 ring-blue-500/35' : 'border-white/[0.1]'
      }`}
    >
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title="Rückgängig (Strg+Z)"
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title="Wiederholen (Strg+Umschalt+Z)"
      >
        <Redo2 className="w-4 h-4" />
      </button>
      <div className="w-px h-4 bg-white/10 mx-0.5" />
      <button
        type="button"
        onClick={onToggleTools}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
          showTools
            ? 'bg-white/15 text-white'
            : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
        }`}
        title="Werkzeugleisten im Vollbild ein-/ausblenden"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Werkzeuge</span>
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
          settingsOpen
            ? 'bg-white/15 text-white'
            : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
        }`}
        title="Einstellungen & Toolbar-Platzierung"
        aria-label="Einstellungen"
      >
        <Settings className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Einstellungen</span>
      </button>
      <button
        type="button"
        onClick={onToggleStudio}
        className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
          studioOpen
            ? 'bg-white/15 text-white'
            : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
        }`}
        title="Studio-Panel ein-/ausblenden"
        aria-label="Studio"
      >
        <PanelRight className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Studio</span>
      </button>
      <button
        type="button"
        onClick={onExitFullscreen}
        className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
        title="Vollbild minimieren (F / Esc)"
        aria-label="Vollbild minimieren"
      >
        <Minimize2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function App() {
  const initial = useMemo(() => loadInitialProjects(), []);
  const initialPrefs = useMemo(() => loadSavedStudioPreferences(), []);
  const [projects, setProjects] = useState<ProjectDocument[]>(initial.projects);
  const [activeProjectId, setActiveProjectId] = useState<string>(initial.activeId);

  const [past, setPast] = useState<ProjectDocument[]>([]);
  const [future, setFuture] = useState<ProjectDocument[]>([]);

  const smoothingBaseCacheRef = useRef<
    Map<string, { baseContours: PathSubpath[]; lastSignature: string }>
  >(new Map());
  const smoothingUndoSnapshotRef = useRef<ProjectDocument | null>(null);
  const opacityUndoSnapshotRef = useRef<ProjectDocument | null>(null);

  const [activeTool, setActiveTool] = useState<ToolType>(initialPrefs.activeTool);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paintTarget, setPaintTarget] = useState<'fill' | 'stroke'>(
    initialPrefs.paintTarget
  );

  const [currentFill, setCurrentFill] = useState<PaintStyle>(
    initialPrefs.currentFill
  );
  const [currentStroke, setCurrentStroke] = useState<StrokeStyle>(
    initialPrefs.currentStroke
  );
  const rememberedStrokePaintRef = useRef<PaintStyle>(
    initialPrefs.rememberedStrokePaint
  );
  const [toolSettings, setToolSettings] = useState<ToolSettings>(
    initialPrefs.toolSettings
  );

  const [inspectorOpen, setInspectorOpen] = useState(initialPrefs.inspectorOpen);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(
    initialPrefs.inspectorTab
  );
  const [toolbarLayout, setToolbarLayout] = useState<ToolbarLayoutSettings>(
    initialPrefs.toolbarLayout
  );
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportProjectId, setExportProjectId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [fullscreenShowTools, setFullscreenShowTools] = useState(false);
  const wasBrowserFullscreenRef = useRef(false);
  const [clipboardElements, setClipboardElements] = useState<CanvasElement[]>([]);
  const clipboardPasteCountRef = useRef(0);
  const clipboardWasCutRef = useRef(false);
  const lastPasteHandledAtRef = useRef(0);

  const activeDoc = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId]
  );
  const exportDoc = useMemo(
    () => (exportProjectId ? projects.find((p) => p.id === exportProjectId) : undefined) ?? activeDoc,
    [projects, exportProjectId, activeDoc]
  );

  // Persist all studio preferences cleanly to localStorage
  useEffect(() => {
    saveStudioPreferences({
      activeTool,
      paintTarget,
      currentFill,
      currentStroke,
      rememberedStrokePaint: rememberedStrokePaintRef.current,
      toolSettings,
      inspectorOpen,
      inspectorTab,
      toolbarLayout,
    });
  }, [
    activeTool,
    paintTarget,
    currentFill,
    currentStroke,
    toolSettings,
    inspectorOpen,
    inspectorTab,
    toolbarLayout,
  ]);

  // Persist projects cleanly to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      localStorage.setItem(ACTIVE_ID_KEY, activeProjectId);
    } catch {
      // Ignore storage quota errors
    }
  }, [projects, activeProjectId]);

  const updateLiveDoc = useCallback((nextDoc: ProjectDocument) => {
    setProjects((prev) => prev.map((p) => (p.id === nextDoc.id ? nextDoc : p)));
  }, []);

  const commitDoc = useCallback(
    (nextDoc: ProjectDocument, undoSnapshot?: ProjectDocument) => {
      setPast((prev) => [...prev.slice(-39), undoSnapshot ?? activeDoc]);
      setFuture([]);
      updateLiveDoc(nextDoc);
    },
    [activeDoc, updateLiveDoc]
  );

  const handleUndo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [activeDoc, ...prev]);
    updateLiveDoc({ ...previous, grid: activeDoc.grid, viewport: activeDoc.viewport });
    setSelectedIds([]);
  }, [past, activeDoc, updateLiveDoc]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, activeDoc]);
    updateLiveDoc({ ...next, grid: activeDoc.grid, viewport: activeDoc.viewport });
    setSelectedIds([]);
  }, [future, activeDoc, updateLiveDoc]);

  const handleJumpToPast = useCallback((index: number) => {
    const targetDoc = past[index];
    const newPast = past.slice(0, index);
    const movedToFuture = [...past.slice(index + 1), activeDoc, ...future];
    setPast(newPast);
    setFuture(movedToFuture);
    updateLiveDoc({ ...targetDoc, grid: activeDoc.grid, viewport: activeDoc.viewport });
    setSelectedIds([]);
  }, [past, future, activeDoc, updateLiveDoc]);

  const handleJumpToFuture = useCallback((index: number) => {
    const targetDoc = future[index];
    const movedToPast = [...past, activeDoc, ...future.slice(0, index)];
    const newFuture = future.slice(index + 1);
    setPast(movedToPast);
    setFuture(newFuture);
    updateLiveDoc({ ...targetDoc, grid: activeDoc.grid, viewport: activeDoc.viewport });
    setSelectedIds([]);
  }, [past, future, activeDoc, updateLiveDoc]);

  const handleClearHistory = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  const enterFullscreen = useCallback(() => {
    setIsFullscreenMode(true);
    setFullscreenShowTools(false);
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    try {
      if (!document.fullscreenElement) {
        if (typeof root.requestFullscreen === 'function') {
          const res = root.requestFullscreen();
          if (res && typeof res.catch === 'function') res.catch(() => {});
        } else if (typeof root.webkitRequestFullscreen === 'function') {
          root.webkitRequestFullscreen();
        }
      }
    } catch {
      // Fallback to UI-minimized canvas fullscreen inside restricted iframes/iOS
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    setIsFullscreenMode(false);
    setFullscreenShowTools(false);
    const docAny = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    try {
      if (document.fullscreenElement) {
        const res = document.exitFullscreen?.();
        if (res && typeof res.catch === 'function') res.catch(() => {});
      } else if (docAny.webkitFullscreenElement && typeof docAny.webkitExitFullscreen === 'function') {
        docAny.webkitExitFullscreen();
      }
    } catch {
      // Ignore native exit errors
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreenMode) exitFullscreen();
    else enterFullscreen();
  }, [isFullscreenMode, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    const docAny = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    const onFullscreenChange = () => {
      const nativeActive = Boolean(
        document.fullscreenElement || docAny.webkitFullscreenElement
      );
      if (wasBrowserFullscreenRef.current && !nativeActive) {
        setIsFullscreenMode(false);
        setFullscreenShowTools(false);
      }
      wasBrowserFullscreenRef.current = nativeActive;
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  const selectedElements = useMemo(() => {
    const out: CanvasElement[] = [];
    for (const l of activeDoc.layers) {
      for (const el of l.elements) {
        if (selectedIds.includes(el.id)) out.push(el);
      }
    }
    return out;
  }, [activeDoc.layers, selectedIds]);

  const singleStyledElement = useMemo(() => {
    if (selectedElements.length !== 1) return null;
    return selectedElements[0].kind === 'image' ? null : selectedElements[0];
  }, [selectedElements]);

  const inspectorFill = singleStyledElement ? singleStyledElement.fill : currentFill;
  const inspectorStroke = singleStyledElement
    ? singleStyledElement.stroke
    : currentStroke;

  // Keep drawing defaults untouched when merely selecting existing objects or images
  const handleSelectIds = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  // Apply style changes to selection if any, or update active drawing defaults
  const handleChangeFill = useCallback(
    (nextFill: PaintStyle) => {
      if (selectedIds.length > 0) {
        const nextLayers = activeDoc.layers.map((l) =>
          l.locked
            ? l
            : {
                ...l,
                elements: l.elements.map((el) =>
                  selectedIds.includes(el.id) ? { ...el, fill: nextFill } : el
                ),
              }
        );
        commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
      } else {
        setCurrentFill(nextFill);
      }
    },
    [selectedIds, activeDoc, commitDoc]
  );

  const handleChangeStroke = useCallback(
    (nextStroke: StrokeStyle) => {
      if (selectedIds.length > 0) {
        const nextLayers = activeDoc.layers.map((l) =>
          l.locked
            ? l
            : {
                ...l,
                elements: l.elements.map((el) =>
                  selectedIds.includes(el.id) ? { ...el, stroke: nextStroke } : el
                ),
              }
        );
        commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
      } else {
        setCurrentStroke(nextStroke);
        if (nextStroke.paint.type !== 'none' && nextStroke.paint.opacity > 0) {
          rememberedStrokePaintRef.current = nextStroke.paint;
        }
      }
    },
    [selectedIds, activeDoc, commitDoc]
  );

  const handleSwapFillStroke = useCallback(() => {
    if (selectedIds.length > 0) {
      const nextLayers = activeDoc.layers.map((l) =>
        l.locked
          ? l
          : {
              ...l,
              elements: l.elements.map((el) =>
                selectedIds.includes(el.id)
                  ? {
                      ...el,
                      fill: el.stroke.paint,
                      stroke: { ...el.stroke, paint: el.fill },
                    }
                  : el
              ),
            }
      );
      commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
    } else {
      const prevFill = currentFill;
      const prevStrokePaint = currentStroke.paint;
      setCurrentFill(prevStrokePaint);
      setCurrentStroke({ ...currentStroke, paint: prevFill });
      if (prevFill.type !== 'none' && prevFill.opacity > 0) {
        rememberedStrokePaintRef.current = prevFill;
      }
    }
  }, [currentFill, currentStroke, selectedIds, activeDoc, commitDoc]);

  const handleResetStyleAndToolSettings = useCallback(() => {
    const defaults = getDefaultStudioPreferences(inspectorOpen);
    const defaultTool = getDefaultToolSettings();
    setPaintTarget(defaults.paintTarget);
    setCurrentFill(defaults.currentFill);
    setCurrentStroke(defaults.currentStroke);
    rememberedStrokePaintRef.current = defaults.rememberedStrokePaint;
    setToolSettings((prev) => ({
      ...defaultTool,
      handleSettings: prev.handleSettings,
    }));
  }, [inspectorOpen]);

  const handleResetAllSettings = useCallback(() => {
    const defaults = getDefaultStudioPreferences(inspectorOpen);
    const blankGuides = createBlankDocument();
    setActiveTool(defaults.activeTool);
    setPaintTarget(defaults.paintTarget);
    setCurrentFill(defaults.currentFill);
    setCurrentStroke(defaults.currentStroke);
    rememberedStrokePaintRef.current = defaults.rememberedStrokePaint;
    setToolSettings(defaults.toolSettings);
    setToolbarLayout(defaults.toolbarLayout);
    updateLiveDoc({
      ...activeDoc,
      updatedAt: Date.now(),
      grid: blankGuides.grid,
      symmetry: blankGuides.symmetry,
      perspective: blankGuides.perspective,
    });
    saveStudioPreferences({
      ...defaults,
      inspectorOpen,
      inspectorTab,
    });
  }, [activeDoc, inspectorOpen, inspectorTab, updateLiveDoc]);

  const handleChangeToolbarLayout = useCallback(
    (patch: Partial<ToolbarLayoutSettings>) => {
      setToolbarLayout((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const handleResetToolbarLayout = useCallback(() => {
    setToolbarLayout({ ...DEFAULT_TOOLBAR_LAYOUT });
  }, []);

  const handleOpenToolbarSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleToggleFillOnlyBrush = useCallback(() => {
    const isCurrentlyFillOnly =
      currentFill.type !== 'none' &&
      currentFill.opacity > 0 &&
      (currentStroke.paint.type === 'none' ||
        currentStroke.paint.opacity <= 0 ||
        currentStroke.width <= 0);

    if (isCurrentlyFillOnly) {
      const restored =
        rememberedStrokePaintRef.current.type !== 'none'
          ? rememberedStrokePaintRef.current
          : createDefaultPaint('#111827', 'solid');
      setCurrentStroke((prev) => ({
        ...prev,
        paint: { ...restored, opacity: Math.max(0.1, restored.opacity || 1) },
        width: prev.width > 0 ? prev.width : 3,
      }));
      setPaintTarget('stroke');
    } else {
      if (currentStroke.paint.type !== 'none' && currentStroke.paint.opacity > 0) {
        rememberedStrokePaintRef.current = currentStroke.paint;
      }
      if (currentFill.type === 'none' || currentFill.opacity <= 0) {
        const seedPaint =
          currentStroke.paint.type !== 'none'
            ? currentStroke.paint
            : createDefaultPaint(currentFill.color || '#3B82F6', 'solid');
        setCurrentFill({
          ...seedPaint,
          type: seedPaint.type === 'none' ? 'solid' : seedPaint.type,
          opacity: seedPaint.opacity > 0 ? seedPaint.opacity : 1,
        });
      }
      setCurrentStroke((prev) => ({
        ...prev,
        paint: { ...prev.paint, type: 'none' },
      }));
      setPaintTarget('fill');
    }
  }, [currentFill, currentStroke]);

  const handleDeleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const nextLayers = activeDoc.layers.map((l) =>
      l.locked
        ? l
        : {
            ...l,
            elements: l.elements.filter((el) => !selectedIds.includes(el.id)),
          }
    );
    setSelectedIds([]);
    commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
  }, [selectedIds, activeDoc, commitDoc]);

  const handleCopySelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const copied: CanvasElement[] = [];
    for (const l of activeDoc.layers) {
      if (!l.visible) continue;
      for (const el of l.elements) {
        if (selectedIds.includes(el.id)) {
          copied.push(cloneElementWithFreshIds(el, 0, 0));
        }
      }
    }
    if (copied.length === 0) return;
    setClipboardElements(copied);
    clipboardPasteCountRef.current = 0;
    clipboardWasCutRef.current = false;
    try {
      void navigator.clipboard?.writeText?.(
        JSON.stringify({ __vectorCreatorClipboard: true, elements: copied })
      );
    } catch {
      // Ignore clipboard permission errors in restricted contexts
    }
  }, [selectedIds, activeDoc.layers]);

  const handleCutSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const copied: CanvasElement[] = [];
    const nextLayers = activeDoc.layers.map((l) => {
      if (l.locked) return l;
      const kept: CanvasElement[] = [];
      for (const el of l.elements) {
        if (selectedIds.includes(el.id)) {
          copied.push(cloneElementWithFreshIds(el, 0, 0));
        } else {
          kept.push(el);
        }
      }
      return kept.length !== l.elements.length ? { ...l, elements: kept } : l;
    });
    if (copied.length === 0) return;
    setClipboardElements(copied);
    clipboardPasteCountRef.current = 0;
    clipboardWasCutRef.current = true;
    try {
      void navigator.clipboard?.writeText?.(
        JSON.stringify({ __vectorCreatorClipboard: true, elements: copied })
      );
    } catch {
      // Ignore clipboard permission errors in restricted contexts
    }
    setSelectedIds([]);
    commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
  }, [selectedIds, activeDoc, commitDoc]);

  const handlePasteSelection = useCallback(
    (overrideElements?: CanvasElement[]) => {
      const source = overrideElements ?? clipboardElements;
      if (source.length === 0) return;

      const step = clipboardPasteCountRef.current;
      const offset =
        clipboardWasCutRef.current && step === 0
          ? 0
          : (clipboardWasCutRef.current ? step : step + 1) * 24;
      clipboardPasteCountRef.current = step + 1;

      const pasted = source.map((el) => {
        const cloned = cloneElementWithFreshIds(el, offset, offset);
        if (!clipboardWasCutRef.current || step > 0) {
          return {
            ...cloned,
            name: cloned.name.endsWith('Kopie') ? cloned.name : `${cloned.name} Kopie`,
          };
        }
        return cloned;
      });
      const pastedIds = pasted.map((el) => el.id);

      const requestedLayer =
        activeDoc.layers.find((l) => l.id === activeDoc.activeLayerId) ??
        activeDoc.layers[0];
      const fallbackUnlocked = activeDoc.layers.find((l) => !l.locked);
      const targetLayer =
        requestedLayer && !requestedLayer.locked ? requestedLayer : fallbackUnlocked;

      if (!targetLayer) {
        const newLayer: Layer = {
          id: createId('layer'),
          name: `Ebene ${activeDoc.layers.length + 1}`,
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'source-over',
          elements: pasted,
        };
        commitDoc({
          ...activeDoc,
          updatedAt: Date.now(),
          layers: [...activeDoc.layers, newLayer],
          activeLayerId: newLayer.id,
        });
      } else {
        const nextLayers = activeDoc.layers.map((l) =>
          l.id === targetLayer.id
            ? { ...l, visible: true, elements: [...l.elements, ...pasted] }
            : l
        );
        commitDoc({
          ...activeDoc,
          updatedAt: Date.now(),
          layers: nextLayers,
          activeLayerId: targetLayer.id,
        });
      }

      setSelectedIds(pastedIds);
      if (activeTool !== 'select' && activeTool !== 'node') {
        setActiveTool('select');
      }
    },
    [clipboardElements, activeDoc, activeTool, commitDoc]
  );

  const handleDuplicateSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const newIds: string[] = [];
    const nextLayers = activeDoc.layers.map((l) => {
      if (l.locked) return l;
      const clones: CanvasElement[] = [];
      for (const el of l.elements) {
        if (selectedIds.includes(el.id)) {
          const clone = cloneElementWithFreshIds(el, 24, 24);
          clone.name = `${el.name} Kopie`;
          newIds.push(clone.id);
          clones.push(clone);
        }
      }
      return clones.length > 0 ? { ...l, elements: [...l.elements, ...clones] } : l;
    });
    if (newIds.length > 0) {
      setSelectedIds(newIds);
      commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
    }
  }, [selectedIds, activeDoc, commitDoc]);

  const handleFlipSelection = useCallback(
    (axis: 'x' | 'y') => {
      if (selectedElements.length === 0) return;
      const bounds = getCombinedBounds(selectedElements);
      if (!bounds) return;
      const origin = { x: bounds.cx, y: bounds.cy };
      const sx = axis === 'x' ? -1 : 1;
      const sy = axis === 'y' ? -1 : 1;
      const nextLayers = activeDoc.layers.map((l) =>
        l.locked
          ? l
          : {
              ...l,
              elements: l.elements.map((el) =>
                selectedIds.includes(el.id) ? scaleElement(el, origin, sx, sy) : el
              ),
            }
      );
      commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
    },
    [selectedElements, selectedIds, activeDoc, commitDoc]
  );

  const handleReorderSelection = useCallback(
    (dir: 'front' | 'back') => {
      if (selectedIds.length === 0) return;
      const nextLayers = activeDoc.layers.map((l) => {
        if (l.locked) return l;
        const sel = l.elements.filter((el) => selectedIds.includes(el.id));
        const rest = l.elements.filter((el) => !selectedIds.includes(el.id));
        if (sel.length === 0) return l;
        return {
          ...l,
          elements: dir === 'front' ? [...rest, ...sel] : [...sel, ...rest],
        };
      });
      commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
    },
    [selectedIds, activeDoc, commitDoc]
  );

  const handleCombinePaths = useCallback(
    (op: BooleanOp) => {
      const selectedPaths: VectorPathElement[] = [];
      let targetLayerId: string | null = null;
      let insertIndex = -1;

      for (const l of activeDoc.layers) {
        if (l.locked || !l.visible) continue;
        l.elements.forEach((el, idx) => {
          if (selectedIds.includes(el.id) && el.kind === 'path') {
            selectedPaths.push(el);
            if (!targetLayerId) {
              targetLayerId = l.id;
              insertIndex = idx;
            }
          }
        });
      }

      if (selectedPaths.length < 2 || !targetLayerId) return;
      const combined = combineVectorPaths(selectedPaths, op);
      if (!combined) return;

      const selectedPathIdSet = new Set(selectedPaths.map((p) => p.id));
      const nextLayers = activeDoc.layers.map((l) => {
        if (l.locked) return l;
        const filtered = l.elements.filter((el) => !selectedPathIdSet.has(el.id));
        if (l.id !== targetLayerId) {
          return { ...l, elements: filtered };
        }
        const safeIdx = Math.max(0, Math.min(filtered.length, insertIndex));
        const nextEls = [...filtered];
        nextEls.splice(safeIdx, 0, combined);
        return { ...l, elements: nextEls };
      });

      setSelectedIds([combined.id]);
      commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
    },
    [selectedIds, activeDoc, commitDoc]
  );

  const handleSplitCompoundPath = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const targetId = selectedIds[0];
    let spawnedIds: string[] = [];
    const nextLayers = activeDoc.layers.map((l) => {
      if (l.locked) return l;
      const idx = l.elements.findIndex((el) => el.id === targetId);
      if (idx === -1) return l;
      const el = l.elements[idx];
      if (el.kind !== 'path' || (el.subpaths?.length ?? 0) <= 1) return l;
      const parts = splitCompoundPath(el);
      spawnedIds = parts.map((p) => p.id);
      const nextEls = [...l.elements];
      nextEls.splice(idx, 1, ...parts);
      return { ...l, elements: nextEls };
    });

    if (spawnedIds.length > 0) {
      setSelectedIds(spawnedIds);
      commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
    }
  }, [selectedIds, activeDoc, commitDoc]);

  const handleAdjustNodeDensity = useCallback(
    (mode: 'fewer' | 'more') => {
      if (selectedIds.length === 0) return;
      let changed = false;
      const nextLayers = activeDoc.layers.map((l) => {
        if (l.locked) return l;
        return {
          ...l,
          elements: l.elements.map((el) => {
            if (!selectedIds.includes(el.id) || el.kind !== 'path') return el;
            const nextEl =
              mode === 'fewer'
                ? simplifyPathElement(el)
                : subdividePathElement(el);
            if (nextEl !== el) {
              changed = true;
            }
            return nextEl;
          }),
        };
      });
      if (changed) {
        commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
      }
    },
    [selectedIds, activeDoc, commitDoc]
  );

  const handleSmoothSelectedPaths = useCallback(
    (smoothing: number, commit = false) => {
      if (selectedIds.length === 0) {
        smoothingUndoSnapshotRef.current = null;
        return;
      }

      if (commit && !smoothingUndoSnapshotRef.current) {
        return;
      }

      if (!smoothingUndoSnapshotRef.current) {
        smoothingUndoSnapshotRef.current = activeDoc;
      }

      const clamped = Math.round(Math.max(0, Math.min(100, smoothing)) * 10) / 10;
      let anyPathUpdated = false;

      const nextLayers = activeDoc.layers.map((l) => {
        if (l.locked) return l;
        return {
          ...l,
          elements: l.elements.map((el) => {
            if (!selectedIds.includes(el.id) || el.kind !== 'path') return el;
            anyPathUpdated = true;
            const currentSig = JSON.stringify(getPathContours(el));
            const cached = smoothingBaseCacheRef.current.get(el.id);
            const baseContours =
              cached && cached.lastSignature === currentSig
                ? cached.baseContours
                : getPathContours(el).map((sp) => ({
                    closed: sp.closed,
                    nodes: sp.nodes.map((n) => ({
                      ...n,
                      handleIn: n.handleIn ? { ...n.handleIn } : undefined,
                      handleOut: n.handleOut ? { ...n.handleOut } : undefined,
                    })),
                  }));

            const nextEl = smoothPathElement(el, baseContours, clamped);
            const nextSig = JSON.stringify(getPathContours(nextEl));
            smoothingBaseCacheRef.current.set(el.id, {
              baseContours,
              lastSignature: nextSig,
            });
            return nextEl;
          }),
        };
      });

      if (!anyPathUpdated) {
        smoothingUndoSnapshotRef.current = null;
        return;
      }

      const nextDoc: ProjectDocument = {
        ...activeDoc,
        updatedAt: Date.now(),
        layers: nextLayers,
      };

      if (commit) {
        const undoSnapshot = smoothingUndoSnapshotRef.current ?? activeDoc;
        smoothingUndoSnapshotRef.current = null;
        setPast((prev) => [...prev.slice(-39), undoSnapshot]);
        setFuture([]);
        updateLiveDoc(nextDoc);
      } else {
        updateLiveDoc(nextDoc);
      }
    },
    [selectedIds, activeDoc, updateLiveDoc]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleCopySelection();
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleCutSelection();
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        window.setTimeout(() => {
          if (
            performance.now() - lastPasteHandledAtRef.current > 50 &&
            clipboardElements.length > 0
          ) {
            lastPasteHandledAtRef.current = performance.now();
            handlePasteSelection();
          }
        }, 10);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateSelection();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeTool === 'select') {
        e.preventDefault();
        handleDeleteSelection();
        return;
      }

      if (e.key === 'Escape' && !e.defaultPrevented && settingsOpen) {
        e.preventDefault();
        setSettingsOpen(false);
        return;
      }

      if (e.key === 'Escape' && !e.defaultPrevented && isFullscreenMode && !projectsOpen && !exportOpen && !shortcutsOpen && !settingsOpen) {
        e.preventDefault();
        exitFullscreen();
        return;
      }

      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const toolMap: Record<string, ToolType> = {
        v: 'select',
        a: 'node',
        b: 'brush',
        p: 'pen',
        s: 'shape',
        g: 'fill',
        e: 'eraser',
        i: 'eyedropper',
        t: 'text',
        h: 'pan',
      };
      if (toolMap[key]) {
        setActiveTool(toolMap[key]);
      } else if (key === 'x') {
        handleSwapFillStroke();
      } else if (key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTool,
    selectedIds.length,
    clipboardElements.length,
    isFullscreenMode,
    projectsOpen,
    exportOpen,
    shortcutsOpen,
    settingsOpen,
    handleUndo,
    handleRedo,
    handleCopySelection,
    handleCutSelection,
    handlePasteSelection,
    handleDuplicateSelection,
    handleDeleteSelection,
    handleSwapFillStroke,
    toggleFullscreen,
    exitFullscreen,
  ]);

  // Layer actions
  const handleAddLayer = () => {
    const newLayer: Layer = {
      id: createId('layer'),
      name: `Ebene ${activeDoc.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'source-over',
      elements: [],
    };
    commitDoc({
      ...activeDoc,
      updatedAt: Date.now(),
      layers: [...activeDoc.layers, newLayer],
      activeLayerId: newLayer.id,
    });
  };

  const handleDuplicateLayer = (id: string) => {
    const idx = activeDoc.layers.findIndex((l) => l.id === id);
    if (idx === -1) return;
    const src = activeDoc.layers[idx];
    const copy: Layer = {
      ...src,
      id: createId('layer'),
      name: `${src.name} Kopie`,
      elements: src.elements.map((el) => ({ ...el, id: createId(el.kind) })),
    };
    const nextLayers = [...activeDoc.layers];
    nextLayers.splice(idx + 1, 0, copy);
    commitDoc({
      ...activeDoc,
      updatedAt: Date.now(),
      layers: nextLayers,
      activeLayerId: copy.id,
    });
  };

  const handleDeleteLayer = (id: string) => {
    if (activeDoc.layers.length <= 1) return;
    const nextLayers = activeDoc.layers.filter((l) => l.id !== id);
    const nextActive =
      activeDoc.activeLayerId === id
        ? nextLayers[nextLayers.length - 1].id
        : activeDoc.activeLayerId;
    commitDoc({
      ...activeDoc,
      updatedAt: Date.now(),
      layers: nextLayers,
      activeLayerId: nextActive,
    });
  };

  const handleMergeDownLayer = (id: string) => {
    const idx = activeDoc.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    const top = activeDoc.layers[idx];
    const bottom = activeDoc.layers[idx - 1];
    const merged: Layer = {
      ...bottom,
      elements: [...bottom.elements, ...top.elements],
    };
    const nextLayers = activeDoc.layers
      .filter((l) => l.id !== id)
      .map((l) => (l.id === bottom.id ? merged : l));
    commitDoc({
      ...activeDoc,
      updatedAt: Date.now(),
      layers: nextLayers,
      activeLayerId: merged.id,
    });
  };

  const handleMoveLayer = (id: string, dir: 'up' | 'down') => {
    const idx = activeDoc.layers.findIndex((l) => l.id === id);
    if (idx === -1) return;
    const targetIdx = dir === 'up' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= activeDoc.layers.length) return;
    const nextLayers = [...activeDoc.layers];
    const [moved] = nextLayers.splice(idx, 1);
    nextLayers.splice(targetIdx, 0, moved);
    commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
  };

  const handleUpdateLayer = (id: string, patch: Partial<Layer>) => {
    const nextLayers = activeDoc.layers.map((l) =>
      l.id === id ? { ...l, ...patch } : l
    );
    commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
  };

  const handleAddImageToLayer = useCallback(
    async (layerId: string | null, file: File) => {
      if (!file.type.startsWith('image/')) return;
      try {
        const asset = await loadAndOptimizeImageFile(file);
        const placement = computeImagePlacement(
          asset.naturalWidth,
          asset.naturalHeight,
          activeDoc.viewport
        );
        const imgEl: VectorImageElement = {
          id: createId('img'),
          kind: 'image',
          name: asset.name,
          src: asset.src,
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
          rotation: 0,
          fill: createDefaultPaint('#FFFFFF', 'none'),
          stroke: {
            ...createDefaultStroke('#111827', 0),
            paint: createDefaultPaint('#111827', 'none'),
          },
          opacity: 1,
          visible: true,
        };

        const requestedId = layerId ?? activeDoc.activeLayerId;
        const targetLayer =
          activeDoc.layers.find((l) => l.id === requestedId) ?? activeDoc.layers[0];

        if (!targetLayer || targetLayer.locked) {
          const newLayer: Layer = {
            id: createId('layer'),
            name: `Bild: ${asset.name.slice(0, 18)}`,
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'source-over',
            elements: [imgEl],
          };
          commitDoc({
            ...activeDoc,
            updatedAt: Date.now(),
            layers: [...activeDoc.layers, newLayer],
            activeLayerId: newLayer.id,
          });
        } else {
          const nextLayers = activeDoc.layers.map((l) =>
            l.id === targetLayer.id
              ? { ...l, visible: true, elements: [...l.elements, imgEl] }
              : l
          );
          commitDoc({
            ...activeDoc,
            updatedAt: Date.now(),
            layers: nextLayers,
            activeLayerId: targetLayer.id,
          });
        }

        setSelectedIds([imgEl.id]);
        setActiveTool('select');
      } catch {
        // Ignore invalid image files silently
      }
    },
    [activeDoc, commitDoc]
  );

  const handleReplaceImage = useCallback(
    async (elementId: string, file: File) => {
      if (!file.type.startsWith('image/')) return;
      try {
        const asset = await loadAndOptimizeImageFile(file);
        const nextLayers = activeDoc.layers.map((l) =>
          l.locked
            ? l
            : {
                ...l,
                elements: l.elements.map((el) => {
                  if (el.id !== elementId || el.kind !== 'image') return el;
                  const cx = el.x + el.width / 2;
                  const cy = el.y + el.height / 2;
                  const ratio = asset.naturalHeight / Math.max(1, asset.naturalWidth);
                  const nextW = el.width;
                  const nextH = Math.max(16, nextW * ratio);
                  return {
                    ...el,
                    name: asset.name,
                    src: asset.src,
                    x: cx - nextW / 2,
                    y: cy - nextH / 2,
                    width: nextW,
                    height: nextH,
                  };
                }),
              }
        );
        commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
      } catch {
        // Ignore invalid image files silently
      }
    },
    [activeDoc, commitDoc]
  );

  const handleUpdateElementOpacity = useCallback(
    (elementId: string, opacity: number, commit = false) => {
      if (!opacityUndoSnapshotRef.current && !commit) {
        opacityUndoSnapshotRef.current = activeDoc;
      }
      const clamped = Math.max(0, Math.min(1, opacity));
      const nextDoc: ProjectDocument = {
        ...activeDoc,
        updatedAt: Date.now(),
        layers: activeDoc.layers.map((l) =>
          l.locked
            ? l
            : {
                ...l,
                elements: l.elements.map((el) =>
                  el.id === elementId ? { ...el, opacity: clamped } : el
                ),
              }
        ),
      };
      if (commit) {
        const undoSnapshot = opacityUndoSnapshotRef.current ?? activeDoc;
        opacityUndoSnapshotRef.current = null;
        commitDoc(nextDoc, undoSnapshot);
      } else {
        updateLiveDoc(nextDoc);
      }
    },
    [activeDoc, commitDoc, updateLiveDoc]
  );

  // Allow pasting images or copied vector elements from clipboard onto the active layer
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              lastPasteHandledAtRef.current = performance.now();
              void handleAddImageToLayer(null, file);
              return;
            }
          }
        }
      }

      const text = e.clipboardData?.getData('text/plain');
      if (text) {
        try {
          const parsed = JSON.parse(text) as {
            __vectorCreatorClipboard?: boolean;
            elements?: CanvasElement[];
          };
          if (
            parsed?.__vectorCreatorClipboard &&
            Array.isArray(parsed.elements) &&
            parsed.elements.length > 0
          ) {
            e.preventDefault();
            lastPasteHandledAtRef.current = performance.now();
            handlePasteSelection(parsed.elements);
            return;
          }
        } catch {
          // Not a Vector Creator JSON payload
        }
      }

      if (clipboardElements.length > 0) {
        e.preventDefault();
        lastPasteHandledAtRef.current = performance.now();
        handlePasteSelection();
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleAddImageToLayer, handlePasteSelection, clipboardElements.length]);

  // Compute collision-free positioning classes for docked toolbars
  const customPos = toolbarLayout.customPositions;
  const toolsVisible = !isFullscreenMode || fullscreenShowTools;
  const topBarAtTop =
    !isFullscreenMode && toolbarLayout.topBar === 'top' && !customPos?.topBar;
  const topBarAtBottom =
    !isFullscreenMode && toolbarLayout.topBar === 'bottom' && !customPos?.topBar;
  const toolRailAtTop =
    toolsVisible && toolbarLayout.toolRail === 'top' && !customPos?.toolRail;
  const toolRailAtBottom =
    toolsVisible && toolbarLayout.toolRail === 'bottom' && !customPos?.toolRail;
  const toolRailOnLeft =
    toolsVisible && toolbarLayout.toolRail === 'left' && !customPos?.toolRail;
  const toolRailOnRight =
    toolsVisible && toolbarLayout.toolRail === 'right' && !customPos?.toolRail;
  const fullscreenTopCorner =
    isFullscreenMode &&
    !customPos?.fullscreenBar &&
    toolbarLayout.fullscreenBar.startsWith('top-');
  const fullscreenBottomCorner =
    isFullscreenMode &&
    !customPos?.fullscreenBar &&
    toolbarLayout.fullscreenBar.startsWith('bottom-');

  const fullscreenBarPosClass =
    toolbarLayout.fullscreenBar === 'top-left'
      ? 'top-2.5 left-2.5 sm:top-3 sm:left-3'
      : toolbarLayout.fullscreenBar === 'bottom-left'
      ? 'bottom-2.5 left-2.5 sm:bottom-3 sm:left-3'
      : toolbarLayout.fullscreenBar === 'bottom-right'
      ? 'bottom-2.5 right-2.5 sm:bottom-3 sm:right-3'
      : 'top-2.5 right-2.5 sm:top-3 sm:right-3';

  const toolRailPosClass =
    toolbarLayout.toolRail === 'top'
      ? `left-1/2 -translate-x-1/2 ${
          topBarAtTop
            ? 'top-[4.25rem] sm:top-18'
            : fullscreenTopCorner
            ? 'top-14 sm:top-16'
            : 'top-2.5 sm:top-3'
        }`
      : toolbarLayout.toolRail === 'bottom'
      ? `left-1/2 -translate-x-1/2 ${
          topBarAtBottom
            ? 'bottom-[4.25rem] sm:bottom-18'
            : fullscreenBottomCorner
            ? 'bottom-14 sm:bottom-16'
            : 'bottom-2.5 sm:bottom-3'
        }`
      : toolbarLayout.toolRail === 'right'
      ? `right-2.5 sm:right-3 ${
          topBarAtTop
            ? 'top-[4.25rem] sm:top-18'
            : isFullscreenMode && toolbarLayout.fullscreenBar === 'top-right'
            ? 'top-14 sm:top-16'
            : 'top-2.5 sm:top-3'
        }`
      : `left-2.5 sm:left-3 ${
          topBarAtTop
            ? 'top-[4.25rem] sm:top-18'
            : isFullscreenMode && toolbarLayout.fullscreenBar === 'top-left'
            ? 'top-14 sm:top-16'
            : 'top-2.5 sm:top-3'
        }`;

  const inspectorSideClass =
    toolbarLayout.inspector === 'left'
      ? toolRailOnLeft
        ? 'left-[4.5rem] sm:left-[4.75rem]'
        : 'left-2.5 sm:left-3'
      : toolRailOnRight
      ? 'right-[4.5rem] sm:right-[4.75rem]'
      : 'right-2.5 sm:right-3';

  const inspectorTopClass =
    topBarAtTop && toolRailAtTop
      ? 'top-[8rem] sm:top-[8.5rem]'
      : topBarAtTop || toolRailAtTop
      ? 'top-[4.25rem] sm:top-18'
      : isFullscreenMode &&
        !customPos?.fullscreenBar &&
        ((toolbarLayout.inspector === 'left' &&
          toolbarLayout.fullscreenBar === 'top-left') ||
          (toolbarLayout.inspector === 'right' &&
            toolbarLayout.fullscreenBar === 'top-right'))
      ? 'top-14 sm:top-16'
      : 'top-2.5 sm:top-3';

  const inspectorBottomClass =
    topBarAtBottom && toolRailAtBottom
      ? 'bottom-[8rem] sm:bottom-[8.5rem]'
      : topBarAtBottom || toolRailAtBottom
      ? 'bottom-[4.25rem] sm:bottom-18'
      : isFullscreenMode &&
        !customPos?.fullscreenBar &&
        ((toolbarLayout.inspector === 'left' &&
          toolbarLayout.fullscreenBar === 'bottom-left') ||
          (toolbarLayout.inspector === 'right' &&
            toolbarLayout.fullscreenBar === 'bottom-right'))
      ? 'bottom-14 sm:bottom-16'
      : 'bottom-2.5 sm:bottom-3';

  const inspectorOpenPosClass = `${inspectorSideClass} ${inspectorTopClass} ${inspectorBottomClass}`;

  const contextBarPosClass =
    toolbarLayout.contextBar === 'top'
      ? topBarAtTop && toolRailAtTop
        ? 'top-[8.25rem] sm:top-[8.75rem]'
        : topBarAtTop || toolRailAtTop
        ? 'top-[4.25rem] sm:top-[4.5rem]'
        : fullscreenTopCorner
        ? 'top-14 sm:top-3'
        : 'top-3'
      : topBarAtBottom && toolRailAtBottom
      ? 'bottom-[8.25rem] sm:bottom-[8.75rem]'
      : topBarAtBottom || toolRailAtBottom
      ? 'bottom-[4.25rem] sm:bottom-[4.5rem]'
      : fullscreenBottomCorner
      ? 'bottom-14 sm:bottom-3'
      : 'bottom-3';

  const topOccupiedCount =
    (topBarAtTop ? 1 : 0) +
    (toolRailAtTop ? 1 : 0) +
    (!customPos?.contextBar && toolbarLayout.contextBar === 'top' ? 1 : 0) +
    (fullscreenTopCorner ? 1 : 0);
  const bottomOccupiedCount =
    (topBarAtBottom ? 1 : 0) +
    (toolRailAtBottom ? 1 : 0) +
    (!customPos?.contextBar && toolbarLayout.contextBar === 'bottom' ? 1 : 0) +
    (fullscreenBottomCorner ? 1 : 0);

  const mobileZoomPosClass =
    topOccupiedCount === 0
      ? 'top-3'
      : bottomOccupiedCount === 0
      ? 'bottom-3'
      : topOccupiedCount === 1
      ? 'top-[4.25rem]'
      : bottomOccupiedCount === 1
      ? 'bottom-[4.25rem]'
      : topOccupiedCount === 2
      ? 'top-[8rem]'
      : 'bottom-[8rem]';

  return (
    <ToolbarDragProvider
      toolbarLayout={toolbarLayout}
      onChangeToolbarLayout={handleChangeToolbarLayout}
    >
    <div className="relative w-screen h-screen overflow-hidden bg-[#111215]">
      <CanvasViewport
        doc={activeDoc}
        activeTool={activeTool}
        selectedIds={selectedIds}
        onChangeSelectedIds={handleSelectIds}
        currentFill={currentFill}
        currentStroke={currentStroke}
        toolSettings={toolSettings}
        onUpdateLiveDoc={updateLiveDoc}
        onCommitDoc={commitDoc}
        onSampleColor={(paint) => {
          if (paintTarget === 'fill') {
            setCurrentFill(paint);
            if (selectedIds.length > 0) handleChangeFill(paint);
          } else {
            const nextStroke = { ...currentStroke, paint };
            setCurrentStroke(nextStroke);
            if (paint.type !== 'none' && paint.opacity > 0) {
              rememberedStrokePaintRef.current = paint;
            }
            if (selectedIds.length > 0) handleChangeStroke(nextStroke);
          }
        }}
        onCombinePaths={handleCombinePaths}
        onSplitCompoundPath={handleSplitCompoundPath}
        onAdjustNodeDensity={handleAdjustNodeDensity}
        onCutSelection={handleCutSelection}
        onCopySelection={handleCopySelection}
        onPasteSelection={() => handlePasteSelection()}
        canPaste={clipboardElements.length > 0}
        onDeleteSelection={handleDeleteSelection}
        onSelectTool={setActiveTool}
        onToggleFillOnlyBrush={handleToggleFillOnlyBrush}
        onChangeToolSettings={(patch) =>
          setToolSettings((prev) => ({ ...prev, ...patch }))
        }
        onOpenHandleSettings={() => {
          setInspectorOpen(true);
          setInspectorTab('guides');
        }}
        onZoomCanvas={(factor) => {
          const oldZoom = activeDoc.viewport.zoom;
          const nextZoom = Math.max(0.08, Math.min(24, oldZoom * factor));
          const ratio = nextZoom / oldZoom;
          updateLiveDoc({
            ...activeDoc,
            viewport: {
              ...activeDoc.viewport,
              zoom: nextZoom,
              x: activeDoc.viewport.x * ratio,
              y: activeDoc.viewport.y * ratio,
            },
          });
        }}
        onResetView={() =>
          updateLiveDoc({
            ...activeDoc,
            viewport: computeFitCanvasViewport(activeDoc.canvasSize),
          })
        }
        onDropImage={(file) => void handleAddImageToLayer(null, file)}
        isFullscreen={isFullscreenMode}
        contextBarPositionClass={contextBarPosClass}
        mobileZoomPositionClass={mobileZoomPosClass}
      />

      {!isFullscreenMode && (
        <TopBar
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        viewport={activeDoc.viewport}
        onResetView={() =>
          updateLiveDoc({
            ...activeDoc,
            viewport: computeFitCanvasViewport(activeDoc.canvasSize),
          })
        }
        onZoomCanvas={(factor) => {
          const oldZoom = activeDoc.viewport.zoom;
          const nextZoom = Math.max(0.08, Math.min(24, oldZoom * factor));
          const ratio = nextZoom / oldZoom;
          updateLiveDoc({
            ...activeDoc,
            viewport: {
              ...activeDoc.viewport,
              zoom: nextZoom,
              x: activeDoc.viewport.x * ratio,
              y: activeDoc.viewport.y * ratio,
            },
          });
        }}
        onRotateCanvas={(deg) =>
          updateLiveDoc({
            ...activeDoc,
            viewport: {
              ...activeDoc.viewport,
              rotation: activeDoc.viewport.rotation + (deg * Math.PI) / 180,
            },
          })
        }
        onOpenProjects={() => setProjectsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenToolbarSettings={handleOpenToolbarSettings}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((v) => !v)}
        position={toolbarLayout.topBar}
        isFullscreen={isFullscreenMode}
        onToggleFullscreen={toggleFullscreen}
        onOpenHistory={() => setShowHistoryModal(true)}
      />
      )}

      {isFullscreenMode && (
        <FullscreenControlBar
          positionClass={fullscreenBarPosClass}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          showTools={fullscreenShowTools}
          onToggleTools={() => setFullscreenShowTools((v) => !v)}
          settingsOpen={settingsOpen}
          onOpenSettings={() => setSettingsOpen(true)}
          studioOpen={fullscreenShowTools && inspectorOpen}
          onToggleStudio={() => {
            if (!fullscreenShowTools) {
              setFullscreenShowTools(true);
              setInspectorOpen(true);
            } else {
              setInspectorOpen((v) => !v);
            }
          }}
          onExitFullscreen={exitFullscreen}
        />
      )}

      {(!isFullscreenMode || fullscreenShowTools) && (
        <>
          <ToolRail
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            shapeKind={toolSettings.shapeKind}
            onSelectShapeKind={(shapeKind) =>
              setToolSettings((prev) => ({ ...prev, shapeKind }))
            }
            fill={inspectorFill}
            stroke={inspectorStroke.paint}
            paintTarget={paintTarget}
            onSelectPaintTarget={(target) => {
              setPaintTarget(target);
              setInspectorOpen(true);
              setInspectorTab('style');
            }}
            onSwapFillStroke={handleSwapFillStroke}
            canDelete={selectedIds.length > 0}
            onDeleteSelection={handleDeleteSelection}
            position={toolbarLayout.toolRail}
            positionClass={toolRailPosClass}
          />

          <InspectorPanel
            open={inspectorOpen}
            onToggleOpen={() => setInspectorOpen((v) => !v)}
            activeTab={inspectorTab}
            onChangeTab={setInspectorTab}
            position={toolbarLayout.inspector}
            positionClass={inspectorOpenPosClass}
            activeTool={activeTool}
        paintTarget={paintTarget}
        onChangePaintTarget={setPaintTarget}
        currentFill={inspectorFill}
        currentStroke={inspectorStroke}
        onChangeFill={handleChangeFill}
        onChangeStroke={handleChangeStroke}
        onResetStyleAndToolSettings={handleResetStyleAndToolSettings}
        toolSettings={toolSettings}
        onChangeToolSettings={(patch) => {
          setToolSettings((prev) => ({ ...prev, ...patch }));
          if (
            selectedIds.length > 0 &&
            (patch.fontSize !== undefined || patch.fontWeight !== undefined)
          ) {
            const nextLayers = activeDoc.layers.map((l) =>
              l.locked
                ? l
                : {
                    ...l,
                    elements: l.elements.map((el) =>
                      el.kind === 'text' && selectedIds.includes(el.id)
                        ? {
                            ...el,
                            fontSize: patch.fontSize ?? el.fontSize,
                            fontWeight: patch.fontWeight ?? el.fontWeight,
                          }
                        : el
                    ),
                  }
            );
            commitDoc({ ...activeDoc, updatedAt: Date.now(), layers: nextLayers });
          }
        }}
        selectedElements={selectedElements}
        onCutSelection={handleCutSelection}
        onCopySelection={handleCopySelection}
        onPasteSelection={() => handlePasteSelection()}
        canPaste={clipboardElements.length > 0}
        onDuplicateSelection={handleDuplicateSelection}
        onDeleteSelection={handleDeleteSelection}
        onFlipSelection={handleFlipSelection}
        onReorderSelection={handleReorderSelection}
        onEditNodesFromSelection={() => setActiveTool('node')}
        onCombinePaths={handleCombinePaths}
        onSplitCompoundPath={handleSplitCompoundPath}
        onAdjustNodeDensity={handleAdjustNodeDensity}
        onSmoothSelectedPaths={handleSmoothSelectedPaths}
        layers={activeDoc.layers}
        activeLayerId={activeDoc.activeLayerId}
        onSelectLayer={(id) => updateLiveDoc({ ...activeDoc, activeLayerId: id })}
        onAddLayer={handleAddLayer}
        onDuplicateLayer={handleDuplicateLayer}
        onDeleteLayer={handleDeleteLayer}
        onMergeDownLayer={handleMergeDownLayer}
        onMoveLayer={handleMoveLayer}
        onUpdateLayer={handleUpdateLayer}
        onAddImageToLayer={(layerId, file) => void handleAddImageToLayer(layerId, file)}
        onUpdateElementOpacity={handleUpdateElementOpacity}
        onReplaceImage={(elementId, file) => void handleReplaceImage(elementId, file)}
        canvasSize={activeDoc.canvasSize}
        onChangeCanvasSize={(canvasSize) =>
          commitDoc({
            ...activeDoc,
            updatedAt: Date.now(),
            canvasSize,
            viewport: computeFitCanvasViewport(canvasSize),
          })
        }
        onFitCanvasView={() =>
          updateLiveDoc({
            ...activeDoc,
            viewport: computeFitCanvasViewport(activeDoc.canvasSize),
          })
        }
        background={activeDoc.background}
        onChangeBackground={(background) =>
          commitDoc({ ...activeDoc, updatedAt: Date.now(), background })
        }
        symmetry={activeDoc.symmetry}
        onChangeSymmetry={(patch) =>
          updateLiveDoc({
            ...activeDoc,
            symmetry: { ...activeDoc.symmetry, ...patch },
          })
        }
        perspective={activeDoc.perspective}
        onChangePerspective={(patch) =>
          updateLiveDoc({
            ...activeDoc,
            perspective: { ...activeDoc.perspective, ...patch },
          })
        }
          grid={activeDoc.grid}
          onChangeGrid={(patch) =>
            updateLiveDoc({
              ...activeDoc,
              grid: { ...activeDoc.grid, ...patch },
            })
          }
        />
        </>
      )}

      <ProjectsModal
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        projects={projects}
        activeProjectId={activeDoc.id}
        onSelectProject={(proj) => {
          setActiveProjectId(proj.id);
          setSelectedIds([]);
          setPast([]);
          setFuture([]);
        }}
        onCreateProject={(proj) => {
          setProjects((prev) => [proj, ...prev]);
          setActiveProjectId(proj.id);
          setSelectedIds([]);
          setPast([]);
          setFuture([]);
        }}
        onRenameProject={(id, name) => {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, name, updatedAt: Date.now() } : p
            )
          );
        }}
        onDeleteProject={(id) => {
          const remaining = projects.filter((p) => p.id !== id);
          if (remaining.length === 0) return;
          setProjects(remaining);
          if (activeProjectId === id) {
            setActiveProjectId(remaining[0].id);
            setSelectedIds([]);
            setPast([]);
            setFuture([]);
          }
        }}
        onOpenExport={() => {
          setExportProjectId(null);
          setExportOpen(true);
        }}
        onExportProject={(proj) => {
          setExportProjectId(proj.id);
          setExportOpen(true);
        }}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => {
          setExportOpen(false);
          setExportProjectId(null);
        }}
        document={exportDoc}
      />

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        toolbarLayout={toolbarLayout}
        onChangeToolbarLayout={handleChangeToolbarLayout}
        onResetToolbarLayout={handleResetToolbarLayout}
        symmetry={activeDoc.symmetry}
        perspective={activeDoc.perspective}
        grid={activeDoc.grid}
        onToggleSymmetry={() => {
          const nextMode = activeDoc.symmetry.mode === 'none' ? 'radial' : 'none';
          updateLiveDoc({
            ...activeDoc,
            symmetry: { ...activeDoc.symmetry, mode: nextMode },
          });
        }}
        onTogglePerspective={() => {
          const nextMode = activeDoc.perspective.mode === 'none' ? '2-point' : 'none';
          updateLiveDoc({
            ...activeDoc,
            perspective: { ...activeDoc.perspective, mode: nextMode },
          });
        }}
        onToggleGrid={() =>
          updateLiveDoc({
            ...activeDoc,
            grid: { ...activeDoc.grid, visible: !activeDoc.grid.visible },
          })
        }
        onToggleSnap={() => {
          const currentlyOn =
            activeDoc.grid.smartGuides !== false || activeDoc.grid.snap;
          updateLiveDoc({
            ...activeDoc,
            grid: {
              ...activeDoc.grid,
              smartGuides: !currentlyOn,
              snap: currentlyOn ? false : activeDoc.grid.snap,
            },
          });
        }}
        onResetAllSettings={handleResetAllSettings}
        onOpenHistory={() => setShowHistoryModal(true)}
      />

      <HistoryModal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        past={past}
        future={future}
        currentDoc={activeDoc}
        onJumpToPast={handleJumpToPast}
        onJumpToFuture={handleJumpToFuture}
        onClearHistory={handleClearHistory}
      />

      <OfflineIndicator />
    </div>
    </ToolbarDragProvider>
  );
}
