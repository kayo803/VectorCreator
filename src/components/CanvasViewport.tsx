import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClipboardPaste,
  Copy,
  Lock,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  AnchorNode,
  BezierTangentMode,
  BooleanOp,
  BoundingBox,
  CanvasElement,
  PaintStyle,
  PencilPrecision,
  Point,
  ProjectDocument,
  StrokeStyle,
  ToolSettings,
  ToolType,
  VectorPathElement,
  VectorTextElement,
} from '../types/vector';
import {
  buildShapeNodes,
  createId,
  distance,
  evalCubic,
  findNearestOpenEndpoint,
  generateSymmetryElements,
  getCombinedBounds,
  getPathContours,
  hitTestElement,
  lerpPoint,
  mergeAnchorNodeChains,
  OpenEndpointMatch,
  pointsToBezierNodes,
  polylineLength,
  reverseAnchorNodes,
  rotateElement,
  scaleElement,
  screenToWorld,
  snapToGrid,
  snapToPerspective,
  translateElement,
} from '../utils/geometry';
import { formatCanvasSizeLabel, isBoundedCanvas } from '../utils/canvasSizes';
import {
  getHandleHitToleranceWorld,
  getNodeTangentStubs,
  getRotationHandleDistanceWorld,
  getTangentRetractToleranceWorld,
} from '../utils/handles';
import {
  computeSmartObjectSnap,
  computeSmartPointSnap,
  SnapGuideLine,
} from '../utils/snapping';
import {
  getBackgroundColors,
  getSelectedNodesTransformBounds,
  renderElement,
  renderGrid,
  renderLayers,
  renderNodeGroupTransformOverlay,
  renderNodeOverlay,
  renderPerspectiveGuides,
  renderSelectionOverlay,
  renderSymmetryGuides,
  subscribeImageLoad,
  traceElementPath,
} from '../utils/renderer';
import {
  useClampedToolbarPosition,
  useToolbarLongPress,
} from './ToolbarDragOverlay';

const ContextBarShell: React.FC<{
  positionClass: string;
  className?: string;
  children: React.ReactNode;
}> = ({ positionClass, className = '', children }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const { isDraggingThis, customPosition, dragProps } =
    useToolbarLongPress('contextBar');
  useClampedToolbarPosition(barRef, customPosition);

  return (
    <div
      ref={barRef}
      {...dragProps}
      className={`fixed ${
        customPosition ? '' : `${positionClass} left-1/2 -translate-x-1/2`
      } z-20 max-w-[calc(100vw-24px)] overflow-x-auto studio-scroll flex items-center rounded-xl bg-[#1A1C22]/95 backdrop-blur-md border shadow-xl select-none transition-colors ${
        isDraggingThis
          ? 'border-blue-400/70 ring-2 ring-blue-500/35'
          : 'border-white/10'
      } ${className}`}
    >
      {children}
    </div>
  );
};

interface CanvasViewportProps {
  doc: ProjectDocument;
  activeTool: ToolType;
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  currentFill: PaintStyle;
  currentStroke: StrokeStyle;
  toolSettings: ToolSettings;
  onUpdateLiveDoc: (doc: ProjectDocument) => void;
  onCommitDoc: (doc: ProjectDocument, undoSnapshot?: ProjectDocument) => void;
  onSampleColor: (paint: PaintStyle) => void;
  onCombinePaths?: (op: BooleanOp) => void;
  onSplitCompoundPath?: () => void;
  onAdjustNodeDensity?: (mode: 'fewer' | 'more') => void;
  onCutSelection?: () => void;
  onCopySelection?: () => void;
  onPasteSelection?: () => void;
  canPaste?: boolean;
  onDeleteSelection?: () => void;
  onSelectTool?: (tool: ToolType) => void;
  onToggleFillOnlyBrush?: () => void;
  onZoomCanvas?: (factor: number) => void;
  onResetView?: () => void;
  onChangeToolSettings?: (patch: Partial<ToolSettings>) => void;
  onOpenHandleSettings?: () => void;
  onDropImage?: (file: File) => void;
  isFullscreen?: boolean;
  contextBarPositionClass?: string;
  mobileZoomPositionClass?: string;
}

type InteractionState =
  | { type: 'idle' }
  | { type: 'pan'; startScreen: Point; startVpX: number; startVpY: number }
  | { type: 'drag-guide'; target: 'sym' | 'vp1' | 'vp2' | 'vp3' }
  | {
      type: 'brush';
      points: Array<Point & { pressure: number }>;
      lastTime: number;
      connectStart: OpenEndpointMatch | null;
      snapPoint: Point | null;
      willCloseLoop: boolean;
      snapRadius: number;
    }
  | {
      type: 'shape';
      start: Point;
      current: Point;
      shiftKey: boolean;
    }
  | {
      type: 'pen-drag-handle';
      nodeIndex: number;
    }
  | {
      type: 'marquee';
      start: Point;
      current: Point;
      additive?: boolean;
    }
  | {
      type: 'marquee-nodes';
      start: Point;
      current: Point;
      additive: boolean;
    }
  | {
      type: 'move-selection';
      startWorld: Point;
      startBounds: BoundingBox | null;
      snapshotDoc: ProjectDocument;
      moved?: boolean;
    }
  | {
      type: 'scale-selection';
      handleIdx: number;
      startBounds: BoundingBox;
      snapshotDoc: ProjectDocument;
      shiftKey: boolean;
      moved?: boolean;
    }
  | {
      type: 'rotate-selection';
      center: Point;
      startAngle: number;
      snapshotDoc: ProjectDocument;
      moved?: boolean;
    }
  | {
      type: 'drag-node';
      elementId: string;
      nodeId: string;
      dragNodeIds: Set<string>;
      toggleOnTapNodeId?: string;
      startWorld: Point;
      startNodePos: Point;
      part: 'anchor' | 'in' | 'out';
      snapshotDoc: ProjectDocument;
      altKey: boolean;
      moved?: boolean;
    }
  | {
      type: 'scale-nodes';
      cornerIdx: number;
      startBounds: BoundingBox;
      snapshotDoc: ProjectDocument;
      shiftKey: boolean;
      moved?: boolean;
    }
  | {
      type: 'rotate-nodes';
      center: Point;
      startAngle: number;
      snapshotDoc: ProjectDocument;
      moved?: boolean;
    }
  | {
      type: 'pull-tangent';
      elementId: string;
      nodeId: string;
      snapshotDoc: ProjectDocument;
      moved?: boolean;
    }
  | {
      type: 'erase';
      erasedAny: boolean;
      snapshotDoc: ProjectDocument;
      workingDoc: ProjectDocument;
    }
  | {
      type: 'pinch-zoom';
      pointerIds: [number, number];
      startDist: number;
      startZoom: number;
      startRotation: number;
      lastAngle: number;
      rawDeltaAngle: number;
      appliedDeltaAngle: number;
      rotationEngaged: boolean;
      anchorWorld: Point;
    }
  | {
      type: 'pinch-cooldown';
    };

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  doc,
  activeTool,
  selectedIds,
  onChangeSelectedIds,
  currentFill,
  currentStroke,
  toolSettings,
  onUpdateLiveDoc,
  onCommitDoc,
  onSampleColor,
  onCombinePaths,
  onSplitCompoundPath,
  onAdjustNodeDensity,
  onCutSelection,
  onCopySelection,
  onPasteSelection,
  canPaste = false,
  onDeleteSelection,
  onSelectTool,
  onToggleFillOnlyBrush,
  onZoomCanvas,
  onResetView,
  onChangeToolSettings,
  onOpenHandleSettings,
  onDropImage,
  isFullscreen = false,
  contextBarPositionClass = 'bottom-3',
  mobileZoomPositionClass = 'top-[4.25rem]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interactionRef = useRef<InteractionState>({ type: 'idle' });
  const activePointersRef = useRef<Map<number, Point>>(new Map());
  const pointerDownStartRef = useRef<{
    pointerId: number;
    screen: Point;
    world: Point;
    time: number;
    pointerType: string;
  } | null>(null);
  const lastTapRef = useRef<{
    time: number;
    screen: Point;
    pointerType: string;
    tool: ToolType;
  } | null>(null);
  const lastDoubleTapHandledAtRef = useRef<number>(0);
  const snapVisualRef = useRef<{ guides: SnapGuideLine[]; snapPoint: Point | null }>({
    guides: [],
    snapPoint: null,
  });

  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [spacePressed, setSpacePressed] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiNodeSelectMode, setMultiNodeSelectMode] = useState(false);
  const [pullTangentMode, setPullTangentMode] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [imageLoadTick, setImageLoadTick] = useState(0);
  const [penNodes, setPenNodes] = useState<AnchorNode[]>([]);
  const [penConnectStart, setPenConnectStart] = useState<OpenEndpointMatch | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [textDraft, setTextDraft] = useState<{
    world: Point;
    screen: Point;
    value: string;
  } | null>(null);

  const isFillOnlyMode =
    currentFill.type !== 'none' &&
    currentFill.opacity > 0 &&
    (currentStroke.paint.type === 'none' ||
      currentStroke.paint.opacity <= 0 ||
      currentStroke.width <= 0);

  useEffect(() => {
    return subscribeImageLoad(() => {
      setImageLoadTick((t) => t + 1);
    });
  }, []);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: Math.max(100, entry.contentRect.width),
          height: Math.max(100, entry.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Spacebar pan & Pen Enter/Esc handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setSpacePressed(true);
      }
      if (activeTool === 'pen' && penNodes.length > 0) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitPenPath(false);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setPenNodes([]);
          setPenConnectStart(null);
        }
      }
      if ((activeTool === 'select' || activeTool === 'node') && e.key === 'Escape') {
        e.preventDefault();
        setSelectedNodeIds(new Set());
        onChangeSelectedIds([]);
        return;
      }
      if (activeTool === 'node') {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          const allIds: string[] = [];
          for (const l of doc.layers) {
            if (!l.visible || l.locked) continue;
            for (const el of l.elements) {
              if (!selectedIds.includes(el.id) || el.kind !== 'path') continue;
              for (const c of getPathContours(el)) {
                for (const n of c.nodes) allIds.push(n.id);
              }
            }
          }
          if (allIds.length > 0) {
            e.preventDefault();
            const allAlready = allIds.every((id) => selectedNodeIds.has(id));
            setSelectedNodeIds(allAlready ? new Set() : new Set(allIds));
            return;
          }
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.size > 0) {
          e.preventDefault();
          deleteSelectedNodes();
          return;
        }
        if (
          selectedNodeIds.size > 0 &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
        ) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          let moved = false;
          const shiftNode = (n: AnchorNode): AnchorNode => {
            if (!selectedNodeIds.has(n.id)) return n;
            moved = true;
            return {
              ...n,
              x: n.x + dx,
              y: n.y + dy,
              handleIn: n.handleIn ? { x: n.handleIn.x + dx, y: n.handleIn.y + dy } : undefined,
              handleOut: n.handleOut ? { x: n.handleOut.x + dx, y: n.handleOut.y + dy } : undefined,
            };
          };
          const nextLayers = doc.layers.map((l) => {
            if (l.locked) return l;
            return {
              ...l,
              elements: l.elements.map((el) => {
                if (el.kind !== 'path' || !selectedIds.includes(el.id)) return el;
                if (el.subpaths && el.subpaths.length > 0) {
                  const nextSubpaths = el.subpaths.map((sp) => ({
                    ...sp,
                    nodes: sp.nodes.map(shiftNode),
                  }));
                  return { ...el, nodes: nextSubpaths[0].nodes, subpaths: nextSubpaths };
                }
                return { ...el, nodes: el.nodes.map(shiftNode) };
              }),
            };
          });
          if (moved) {
            onCommitDoc({ ...doc, updatedAt: Date.now(), layers: nextLayers });
          }
          return;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  // Clear pen path when switching away from pen
  useEffect(() => {
    if (activeTool !== 'pen' && penNodes.length > 0) {
      setPenNodes([]);
      setPenConnectStart(null);
    }
  }, [activeTool, penNodes.length]);

  const getActiveLayer = useCallback(
    (targetDoc: ProjectDocument = doc) => {
      return (
        targetDoc.layers.find((l) => l.id === targetDoc.activeLayerId) ??
        targetDoc.layers[0]
      );
    },
    [doc]
  );

  const commitConnectedNodes = useCallback(
    (
      newNodes: AnchorNode[],
      startMatch: OpenEndpointMatch | null,
      endMatch: OpenEndpointMatch | null,
      snapRadius: number,
      fallbackName: string
    ): boolean => {
      if (!startMatch && !endMatch) return false;
      const layer = getActiveLayer();
      if (!layer || layer.locked || newNodes.length < 2) return false;

      // Case 1: Start and End touch the two ends of the SAME open path -> closes the contour!
      if (
        startMatch &&
        endMatch &&
        startMatch.element.id === endMatch.element.id &&
        startMatch.end !== endMatch.end
      ) {
        const existing = startMatch.element;
        const orderedExisting =
          startMatch.end === 'end' ? existing.nodes : reverseAnchorNodes(existing.nodes);
        const mergedNodes = mergeAnchorNodeChains(orderedExisting, newNodes);
        const seamFirst = mergedNodes[0];
        const seamLast = mergedNodes[mergedNodes.length - 1];
        const closedNodes =
          distance(seamFirst, seamLast) <= snapRadius && mergedNodes.length > 3
            ? mergedNodes.slice(0, -1)
            : mergedNodes;
        const closedEl: VectorPathElement = {
          ...existing,
          name: 'Verbundene Kontur',
          nodes: closedNodes,
          closed: true,
          fill: existing.fill.type !== 'none' ? existing.fill : currentFill,
        };
        onCommitDoc({
          ...doc,
          updatedAt: Date.now(),
          layers: doc.layers.map((l) =>
            l.id === layer.id
              ? {
                  ...l,
                  elements: l.elements.map((el) =>
                    el.id === existing.id ? closedEl : el
                  ),
                }
              : l
          ),
        });
        return true;
      }

      // Case 2: Connects one or two open paths into one continuous contour
      let mergedChain = newNodes;
      const removedIds = new Set<string>();
      let templateEl: VectorPathElement | null = null;

      if (startMatch) {
        const sEl = startMatch.element;
        templateEl = sEl;
        removedIds.add(sEl.id);
        const prefix =
          startMatch.end === 'end' ? sEl.nodes : reverseAnchorNodes(sEl.nodes);
        mergedChain = mergeAnchorNodeChains(prefix, mergedChain);
      }

      if (endMatch && (!startMatch || endMatch.element.id !== startMatch.element.id)) {
        const eEl = endMatch.element;
        if (!templateEl) templateEl = eEl;
        removedIds.add(eEl.id);
        const suffix =
          endMatch.end === 'start' ? eEl.nodes : reverseAnchorNodes(eEl.nodes);
        mergedChain = mergeAnchorNodeChains(mergedChain, suffix);
      }

      const baseStyle = templateEl!;
      const isNowClosed =
        mergedChain.length >= 4 &&
        distance(mergedChain[0], mergedChain[mergedChain.length - 1]) <= snapRadius;
      const finalNodes = isNowClosed ? mergedChain.slice(0, -1) : mergedChain;

      const connectedEl: VectorPathElement = {
        ...baseStyle,
        id: createId('path'),
        name: isNowClosed ? 'Verbundene Kontur' : fallbackName || baseStyle.name,
        nodes: finalNodes,
        closed: isNowClosed,
        fill:
          isNowClosed || isFillOnlyMode
            ? baseStyle.fill.type !== 'none'
              ? baseStyle.fill
              : currentFill
            : baseStyle.fill,
      };

      onCommitDoc({
        ...doc,
        updatedAt: Date.now(),
        layers: doc.layers.map((l) => {
          if (l.id !== layer.id) return l;
          const filtered = l.elements.filter((el) => !removedIds.has(el.id));
          return { ...l, elements: [...filtered, connectedEl] };
        }),
      });
      return true;
    },
    [getActiveLayer, currentFill, isFillOnlyMode, doc, onCommitDoc]
  );

  const commitPenPath = useCallback(
    (closed: boolean, endMatch: OpenEndpointMatch | null = null) => {
      if (penNodes.length < 2) {
        setPenNodes([]);
        setPenConnectStart(null);
        return;
      }
      const layer = getActiveLayer();
      if (!layer || layer.locked) {
        setPenNodes([]);
        setPenConnectStart(null);
        return;
      }

      if (!closed && doc.symmetry.mode === 'none' && (penConnectStart || endMatch)) {
        const ok = commitConnectedNodes(
          penNodes,
          penConnectStart,
          endMatch,
          20 / doc.viewport.zoom,
          'Bézier-Pfad'
        );
        if (ok) {
          setPenNodes([]);
          setPenConnectStart(null);
          return;
        }
      }

      const basePath: VectorPathElement = {
        id: createId('path'),
        kind: 'path',
        name: closed ? 'Geschlossene Kontur' : isFillOnlyMode ? 'Füllform' : 'Bézier-Pfad',
        nodes: penNodes,
        closed,
        fill: closed || isFillOnlyMode ? currentFill : { ...currentFill, type: 'none' },
        stroke: currentStroke,
        opacity: 1,
        visible: true,
      };
      const copies = generateSymmetryElements(basePath, doc.symmetry);
      const nextDoc: ProjectDocument = {
        ...doc,
        updatedAt: Date.now(),
        layers: doc.layers.map((l) =>
          l.id === layer.id ? { ...l, elements: [...l.elements, ...copies] } : l
        ),
      };
      setPenNodes([]);
      setPenConnectStart(null);
      onCommitDoc(nextDoc);
    },
    [
      penNodes,
      penConnectStart,
      getActiveLayer,
      commitConnectedNodes,
      currentFill,
      currentStroke,
      isFillOnlyMode,
      doc,
      onCommitDoc,
    ]
  );

  const deleteSelectedNodes = useCallback(() => {
    if (selectedIds.length === 0 || selectedNodeIds.size === 0) return;
    let changed = false;
    const nextLayers = doc.layers.map((l) => {
      if (l.locked) return l;
      return {
        ...l,
        elements: l.elements.map((el) => {
          if (!selectedIds.includes(el.id) || el.kind !== 'path') return el;
          if (el.subpaths && el.subpaths.length > 0) {
            let elChanged = false;
            const nextSubpaths = el.subpaths.map((sp) => {
              const minKeep = sp.closed ? 3 : 2;
              const remaining = sp.nodes.filter((n) => !selectedNodeIds.has(n.id));
              if (remaining.length >= minKeep && remaining.length !== sp.nodes.length) {
                elChanged = true;
                changed = true;
                return { ...sp, nodes: remaining };
              }
              return sp;
            });
            return elChanged
              ? { ...el, nodes: nextSubpaths[0].nodes, subpaths: nextSubpaths }
              : el;
          }
          const minKeep = el.closed ? 3 : 2;
          const remaining = el.nodes.filter((n) => !selectedNodeIds.has(n.id));
          if (remaining.length >= minKeep && remaining.length !== el.nodes.length) {
            changed = true;
            return { ...el, nodes: remaining };
          }
          return el;
        }),
      };
    });
    if (changed) {
      setSelectedNodeIds(new Set());
      onCommitDoc({ ...doc, updatedAt: Date.now(), layers: nextLayers });
    }
  }, [doc, selectedIds, selectedNodeIds, onCommitDoc]);

  const commitTextDraft = useCallback(() => {
    if (!textDraft) return;
    const trimmed = textDraft.value.trim();
    if (trimmed) {
      const layer = getActiveLayer();
      if (layer && !layer.locked) {
        const textEl: VectorTextElement = {
          id: createId('txt'),
          kind: 'text',
          name: trimmed.slice(0, 20),
          x: textDraft.world.x,
          y: textDraft.world.y,
          text: trimmed,
          fontSize: toolSettings.fontSize,
          fontWeight: toolSettings.fontWeight,
          align: toolSettings.textAlign,
          rotation: 0,
          fill:
            currentFill.type === 'none'
              ? { ...currentFill, type: 'solid', color: currentStroke.paint.color }
              : currentFill,
          stroke: {
            ...currentStroke,
            paint: { ...currentStroke.paint, type: 'none' },
            width: 0,
          },
          opacity: 1,
          visible: true,
        };
        const nextDoc: ProjectDocument = {
          ...doc,
          updatedAt: Date.now(),
          layers: doc.layers.map((l) =>
            l.id === layer.id ? { ...l, elements: [...l.elements, textEl] } : l
          ),
        };
        onCommitDoc(nextDoc);
        onChangeSelectedIds([textEl.id]);
      }
    }
    setTextDraft(null);
  }, [
    textDraft,
    getActiveLayer,
    toolSettings,
    currentFill,
    currentStroke,
    doc,
    onCommitDoc,
    onChangeSelectedIds,
  ]);

  const getPointerCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const center = { x: size.width / 2, y: size.height / 2 };
      const rawWorld = screenToWorld(screen, doc.viewport, center);
      const snappedWorld = doc.grid.snap
        ? snapToGrid(rawWorld, doc.grid.size)
        : rawWorld;
      return { screen, rawWorld, snappedWorld };
    },
    [size, doc.viewport, doc.grid]
  );

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Background
    const bg = getBackgroundColors(doc.background);
    const bounded = isBoundedCanvas(doc.canvasSize);

    if (bounded) {
      if (bg.fill === 'transparent') {
        ctx.clearRect(0, 0, size.width, size.height);
      } else {
        ctx.fillStyle = '#0D0E12';
        ctx.fillRect(0, 0, size.width, size.height);
      }
    } else {
      if (bg.fill === 'transparent') {
        ctx.clearRect(0, 0, size.width, size.height);
      } else {
        ctx.fillStyle = bg.fill;
        ctx.fillRect(0, 0, size.width, size.height);
      }
    }

    // 2. Apply Infinite Viewport Transform
    const center = { x: size.width / 2, y: size.height / 2 };
    ctx.translate(center.x + doc.viewport.x, center.y + doc.viewport.y);
    ctx.rotate(doc.viewport.rotation);
    ctx.scale(doc.viewport.zoom, doc.viewport.zoom);

    const span = Math.max(size.width, size.height);

    // 2b. Bounded Artboard / Page Surface (DIN A4, A3, etc.)
    if (bounded && doc.canvasSize) {
      const pw = doc.canvasSize.width;
      const ph = doc.canvasSize.height;
      const px = -pw / 2;
      const py = -ph / 2;

      if (bg.fill === 'transparent') {
        // Mask out everything outside the artboard so checkerboard appears only inside the page
        ctx.save();
        ctx.fillStyle = '#0D0E12';
        ctx.beginPath();
        ctx.rect(-100000, -100000, 200000, 200000);
        ctx.rect(px, py, pw, ph);
        ctx.fill('evenodd');
        ctx.restore();
      } else {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = bg.fill;
        ctx.fillRect(px, py, pw, ph);
        ctx.restore();
      }

      // Crisp sheet border & format label
      ctx.save();
      ctx.strokeStyle =
        doc.background === 'dark' || doc.background === 'transparent'
          ? 'rgba(255, 255, 255, 0.22)'
          : 'rgba(15, 23, 42, 0.2)';
      ctx.lineWidth = 1.25 / doc.viewport.zoom;
      ctx.strokeRect(px, py, pw, ph);

      const fontPx = 11 / doc.viewport.zoom;
      ctx.font = `600 ${fontPx}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.textBaseline = 'bottom';
      ctx.fillText(formatCanvasSizeLabel(doc.canvasSize), px, py - 8 / doc.viewport.zoom);
      ctx.restore();
    }

    // 3. Grid (clipped to page sheet when bounded)
    if (doc.grid.visible) {
      ctx.save();
      if (bounded && doc.canvasSize) {
        ctx.beginPath();
        ctx.rect(
          -doc.canvasSize.width / 2,
          -doc.canvasSize.height / 2,
          doc.canvasSize.width,
          doc.canvasSize.height
        );
        ctx.clip();
      }
      renderGrid(
        ctx,
        size.width,
        size.height,
        doc.viewport,
        doc.grid.size,
        bg.grid,
        bg.axis,
        doc.perspective.mode === 'isometric'
      );
      ctx.restore();
    }

    // 4. Layers & Vector Artwork
    renderLayers(ctx, doc.layers);

    // 5. Live In-Progress Drawing Previews
    const inter = interactionRef.current;
    if (inter.type === 'brush' && inter.points.length > 0) {
      const ptsForPreview =
        inter.willCloseLoop &&
        inter.points.length > 3 &&
        distance(inter.points[0], inter.points[inter.points.length - 1]) <=
          inter.snapRadius
          ? inter.points.slice(0, -1)
          : inter.points;
      const previewClosed =
        inter.willCloseLoop || (isFillOnlyMode && ptsForPreview.length >= 3);
      const liveNodes = pointsToBezierNodes(
        ptsForPreview,
        toolSettings.smoothing,
        previewClosed,
        toolSettings.pencilMode,
        doc.viewport.zoom
      );
      const previewEl: VectorPathElement = {
        id: 'preview_brush',
        kind: 'path',
        name: 'Preview',
        nodes: liveNodes,
        closed: previewClosed,
        fill:
          previewClosed || isFillOnlyMode
            ? currentFill
            : { ...currentFill, type: 'none' },
        stroke: currentStroke,
        opacity: 1,
        visible: true,
      };
      for (const copy of generateSymmetryElements(previewEl, doc.symmetry)) {
        renderElement(ctx, copy);
        if (isFillOnlyMode && liveNodes.length >= 2) {
          ctx.save();
          traceElementPath(ctx, copy);
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.72)';
          ctx.lineWidth = 1.25 / doc.viewport.zoom;
          ctx.setLineDash([4 / doc.viewport.zoom, 3 / doc.viewport.zoom]);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (inter.snapPoint) {
        ctx.save();
        ctx.strokeStyle = '#10B981';
        ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
        ctx.lineWidth = 2 / doc.viewport.zoom;
        ctx.beginPath();
        ctx.arc(inter.snapPoint.x, inter.snapPoint.y, 9 / doc.viewport.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } else if (inter.type === 'shape') {
      let endPt = inter.current;
      if (inter.shiftKey) {
        const dx = endPt.x - inter.start.x;
        const dy = endPt.y - inter.start.y;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        endPt = {
          x: inter.start.x + Math.sign(dx || 1) * side,
          y: inter.start.y + Math.sign(dy || 1) * side,
        };
      }
      if (toolSettings.shapeKind === 'line' || toolSettings.shapeKind === 'arrow') {
        endPt = snapToPerspective(inter.start, endPt, doc.perspective);
      }
      const { nodes, closed } = buildShapeNodes(toolSettings.shapeKind, inter.start, endPt, {
        polygonSides: toolSettings.polygonSides,
        starPoints: toolSettings.starPoints,
        starInnerRatio: toolSettings.starInnerRatio,
      });
      const previewEl: VectorPathElement = {
        id: 'preview_shape',
        kind: 'path',
        name: 'Preview',
        nodes,
        closed,
        fill: closed ? currentFill : { ...currentFill, type: 'none' },
        stroke: currentStroke,
        opacity: 1,
        visible: true,
      };
      for (const copy of generateSymmetryElements(previewEl, doc.symmetry)) {
        renderElement(ctx, copy);
      }
    }

    // 6. Live Pen / Bezier Path Preview
    if (activeTool === 'pen' && penNodes.length > 0) {
      const previewPen: VectorPathElement = {
        id: 'preview_pen',
        kind: 'path',
        name: 'Pen',
        nodes: penNodes,
        closed: false,
        fill: isFillOnlyMode ? currentFill : { ...currentFill, type: 'none' },
        stroke: currentStroke,
        opacity: 1,
        visible: true,
      };
      for (const copy of generateSymmetryElements(previewPen, doc.symmetry)) {
        renderElement(ctx, copy);
        if (isFillOnlyMode && penNodes.length >= 2) {
          ctx.save();
          traceElementPath(ctx, copy);
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.72)';
          ctx.lineWidth = 1.25 / doc.viewport.zoom;
          ctx.setLineDash([4 / doc.viewport.zoom, 3 / doc.viewport.zoom]);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Rubber band to cursor + emerald snap ring
      if (cursorWorld) {
        const last = penNodes[penNodes.length - 1];
        const snapTol = 20 / doc.viewport.zoom;
        const canCloseLoop =
          penNodes.length >= 3 && distance(cursorWorld, penNodes[0]) <= snapTol;
        const activeLayer = getActiveLayer();
        const endpointSnap =
          !canCloseLoop && doc.symmetry.mode === 'none' && activeLayer
            ? findNearestOpenEndpoint(activeLayer.elements, cursorWorld, snapTol)
            : null;

        const target = canCloseLoop
          ? penNodes[0]
          : endpointSnap
          ? endpointSnap.point
          : snapToPerspective(last, cursorWorld, doc.perspective);

        ctx.save();
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 1.2 / doc.viewport.zoom;
        ctx.setLineDash([5 / doc.viewport.zoom, 4 / doc.viewport.zoom]);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        if (last.handleOut) {
          ctx.bezierCurveTo(
            last.handleOut.x,
            last.handleOut.y,
            target.x,
            target.y,
            target.x,
            target.y
          );
        } else {
          ctx.lineTo(target.x, target.y);
        }
        ctx.stroke();
        ctx.restore();

        const snapRingPt = canCloseLoop
          ? penNodes[0]
          : endpointSnap
          ? endpointSnap.point
          : null;
        if (snapRingPt) {
          ctx.save();
          ctx.strokeStyle = '#10B981';
          ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
          ctx.lineWidth = 2 / doc.viewport.zoom;
          ctx.beginPath();
          ctx.arc(snapRingPt.x, snapRingPt.y, 9 / doc.viewport.zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      renderNodeOverlay(ctx, previewPen, new Set(), doc.viewport, {
        ...toolSettings.handleSettings,
        bezierVisibility: 'all',
      });
    }

    // 7. Perspective & Symmetry Guides
    renderPerspectiveGuides(ctx, doc.perspective, doc.viewport, span);
    renderSymmetryGuides(ctx, doc.symmetry, doc.viewport, span);

    // 8. Selection or Node Editor Overlays
    const allElements: CanvasElement[] = [];
    for (const l of doc.layers) {
      if (l.visible) allElements.push(...l.elements);
    }
    const selectedEls = allElements.filter((el) => selectedIds.includes(el.id));

    if (activeTool === 'select' && selectedEls.length > 0) {
      renderSelectionOverlay(ctx, selectedEls, doc.viewport, toolSettings.handleSettings);
    } else if (activeTool === 'node' && selectedEls.length > 0) {
      const selectedPathsForOverlay: VectorPathElement[] = [];
      for (const el of selectedEls) {
        if (el.kind === 'path') {
          selectedPathsForOverlay.push(el);
          renderNodeOverlay(
            ctx,
            el,
            selectedNodeIds,
            doc.viewport,
            toolSettings.handleSettings
          );
        }
      }
      if (selectedNodeIds.size >= 2) {
        renderNodeGroupTransformOverlay(
          ctx,
          selectedPathsForOverlay,
          selectedNodeIds,
          doc.viewport,
          toolSettings.handleSettings
        );
      }
    }

    // 9. Marquee selection box (Objekte oder Knoten)
    if (inter.type === 'marquee' || inter.type === 'marquee-nodes') {
      const x = Math.min(inter.start.x, inter.current.x);
      const y = Math.min(inter.start.y, inter.current.y);
      const w = Math.abs(inter.current.x - inter.start.x);
      const h = Math.abs(inter.current.y - inter.start.y);
      if (Math.hypot(w, h) >= 6 / doc.viewport.zoom) {
        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 1.2 / doc.viewport.zoom;
        if (inter.type === 'marquee-nodes') {
          ctx.setLineDash([4 / doc.viewport.zoom, 3 / doc.viewport.zoom]);
        }
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }
    }

    // 10. Smart Snap Guides & Node Snap Indicator
    const snapVis = snapVisualRef.current;
    if (snapVis.guides.length > 0 || snapVis.snapPoint) {
      ctx.save();
      for (const g of snapVis.guides) {
        ctx.strokeStyle =
          g.kind === 'center' ? '#06B6D4' : g.kind === 'node' ? '#10B981' : '#EC4899';
        ctx.lineWidth = 1.25 / doc.viewport.zoom;
        ctx.setLineDash([4 / doc.viewport.zoom, 3 / doc.viewport.zoom]);
        ctx.beginPath();
        if (g.orientation === 'v') {
          ctx.moveTo(g.pos, g.from);
          ctx.lineTo(g.pos, g.to);
        } else {
          ctx.moveTo(g.from, g.pos);
          ctx.lineTo(g.to, g.pos);
        }
        ctx.stroke();
      }
      if (snapVis.snapPoint) {
        const s = 5.5 / doc.viewport.zoom;
        ctx.setLineDash([]);
        ctx.fillStyle = '#10B981';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.4 / doc.viewport.zoom;
        ctx.beginPath();
        ctx.moveTo(snapVis.snapPoint.x, snapVis.snapPoint.y - s);
        ctx.lineTo(snapVis.snapPoint.x + s, snapVis.snapPoint.y);
        ctx.lineTo(snapVis.snapPoint.x, snapVis.snapPoint.y + s);
        ctx.lineTo(snapVis.snapPoint.x - s, snapVis.snapPoint.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 11. Eraser cursor ring
    if (activeTool === 'eraser' && cursorWorld) {
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.lineWidth = 1.5 / doc.viewport.zoom;
      ctx.beginPath();
      ctx.arc(cursorWorld.x, cursorWorld.y, 12 / doc.viewport.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [
    doc,
    size,
    activeTool,
    selectedIds,
    selectedNodeIds,
    penNodes,
    cursorWorld,
    currentFill,
    currentStroke,
    toolSettings,
    imageLoadTick,
  ]);

  // Helper to find top-most element at point
  const findTopElementAt = useCallback(
    (
      pt: Point,
      includeLocked = false,
      customTol?: number
    ): { element: CanvasElement; layerId: string } | null => {
      const tol = customTol ?? 8 / doc.viewport.zoom;
      for (let li = doc.layers.length - 1; li >= 0; li--) {
        const layer = doc.layers[li];
        if (!layer.visible || (!includeLocked && layer.locked)) continue;
        for (let ei = layer.elements.length - 1; ei >= 0; ei--) {
          const el = layer.elements[ei];
          if (hitTestElement(el, pt, tol)) {
            return { element: el, layerId: layer.id };
          }
        }
      }
      return null;
    },
    [doc.layers, doc.viewport.zoom]
  );

  // Pointer Down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (textDraft) {
      commitTextDraft();
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic or already-ended pointer capture errors
    }
    const { screen, rawWorld, snappedWorld } = getPointerCoords(e);
    activePointersRef.current.set(e.pointerId, screen);
    if (activePointersRef.current.size === 1) {
      pointerDownStartRef.current = {
        pointerId: e.pointerId,
        screen,
        world: rawWorld,
        time: performance.now(),
        pointerType: e.pointerType,
      };
    } else {
      pointerDownStartRef.current = null;
      lastTapRef.current = null;
    }

    // 2-Finger Pinch Zoom, Rotate & Pan
    if (activePointersRef.current.size >= 2) {
      const prevInter = interactionRef.current;
      let baseDoc = doc;
      if (
        prevInter.type === 'move-selection' ||
        prevInter.type === 'scale-selection' ||
        prevInter.type === 'rotate-selection' ||
        prevInter.type === 'drag-node' ||
        prevInter.type === 'scale-nodes' ||
        prevInter.type === 'rotate-nodes' ||
        prevInter.type === 'pull-tangent' ||
        prevInter.type === 'erase'
      ) {
        baseDoc = prevInter.snapshotDoc;
        onUpdateLiveDoc(prevInter.snapshotDoc);
      } else if (prevInter.type === 'pen-drag-handle' && penNodes.length > 0) {
        setPenNodes((prev) => prev.slice(0, -1));
      }
      snapVisualRef.current = { guides: [], snapPoint: null };

      const entries = Array.from(activePointersRef.current.entries());
      const [id1, p1] = entries[0];
      const [id2, p2] = entries[1];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const dist = Math.max(10, Math.hypot(p2.x - p1.x, p2.y - p1.y));
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const center = { x: size.width / 2, y: size.height / 2 };
      const anchorWorld = screenToWorld(mid, baseDoc.viewport, center);

      interactionRef.current = {
        type: 'pinch-zoom',
        pointerIds: [id1, id2],
        startDist: dist,
        startZoom: baseDoc.viewport.zoom,
        startRotation: baseDoc.viewport.rotation,
        lastAngle: angle,
        rawDeltaAngle: 0,
        appliedDeltaAngle: 0,
        rotationEngaged: false,
        anchorWorld,
      };
      return;
    }

    if (interactionRef.current.type === 'pinch-cooldown') {
      return;
    }

    // Pan with Space, Middle Mouse, or Pan Tool
    if (activeTool === 'pan' || spacePressed || e.button === 1) {
      interactionRef.current = {
        type: 'pan',
        startScreen: screen,
        startVpX: doc.viewport.x,
        startVpY: doc.viewport.y,
      };
      return;
    }

    // Check draggable guide handles (Symmetry center / Perspective vanishing points)
    const guideHitRadius = 14 / doc.viewport.zoom;
    if (
      doc.symmetry.mode !== 'none' &&
      doc.symmetry.showAxes &&
      distance(rawWorld, doc.symmetry.center) <= guideHitRadius
    ) {
      interactionRef.current = { type: 'drag-guide', target: 'sym' };
      return;
    }
    if (doc.perspective.mode !== 'none' && doc.perspective.mode !== 'isometric') {
      if (distance(rawWorld, doc.perspective.vp1) <= guideHitRadius) {
        interactionRef.current = { type: 'drag-guide', target: 'vp1' };
        return;
      }
      if (
        (doc.perspective.mode === '2-point' || doc.perspective.mode === '3-point') &&
        distance(rawWorld, doc.perspective.vp2) <= guideHitRadius
      ) {
        interactionRef.current = { type: 'drag-guide', target: 'vp2' };
        return;
      }
      if (
        doc.perspective.mode === '3-point' &&
        distance(rawWorld, doc.perspective.vp3) <= guideHitRadius
      ) {
        interactionRef.current = { type: 'drag-guide', target: 'vp3' };
        return;
      }
    }

    // Tool-specific handlers
    if (activeTool === 'brush') {
      const layer = getActiveLayer();
      if (!layer || layer.locked) return;
      const pressure = e.pressure && e.pressure !== 0.5 ? e.pressure : 0.75;
      const baseSnapPx =
        toolSettings.pencilMode === 'fine'
          ? e.pointerType === 'touch'
            ? 15
            : 10
          : e.pointerType === 'touch'
          ? 28
          : 18;
      const snapRadius = baseSnapPx / doc.viewport.zoom;
      const connectStart =
        !toolSettings.autoCloseBrushPath &&
        !isFillOnlyMode &&
        doc.symmetry.mode === 'none'
          ? findNearestOpenEndpoint(layer.elements, rawWorld, snapRadius)
          : null;
      const startPt = connectStart ? connectStart.point : rawWorld;
      interactionRef.current = {
        type: 'brush',
        points: [{ x: startPt.x, y: startPt.y, pressure }],
        lastTime: performance.now(),
        connectStart,
        snapPoint: connectStart ? connectStart.point : null,
        willCloseLoop: false,
        snapRadius,
      };
      return;
    }

    if (activeTool === 'shape') {
      const layer = getActiveLayer();
      if (!layer || layer.locked) return;
      const snapTol = (e.pointerType === 'touch' ? 14 : 9) / doc.viewport.zoom;
      const visibleEls = doc.layers.flatMap((l) => (l.visible ? l.elements : []));
      const startSnap = e.altKey
        ? { point: rawWorld, guides: [], snappedNode: null }
        : computeSmartPointSnap(
            rawWorld,
            visibleEls,
            new Set(),
            new Set(),
            snapTol,
            doc.grid,
            [],
            doc.canvasSize
          );
      snapVisualRef.current = {
        guides: startSnap.guides,
        snapPoint: startSnap.snappedNode,
      };
      interactionRef.current = {
        type: 'shape',
        start: startSnap.point,
        current: startSnap.point,
        shiftKey: e.shiftKey,
      };
      return;
    }

    if (activeTool === 'pen') {
      const layer = getActiveLayer();
      if (!layer || layer.locked) return;

      const snapRadius = (e.pointerType === 'touch' ? 26 : 16) / doc.viewport.zoom;
      const guideSnapTol = (e.pointerType === 'touch' ? 14 : 9) / doc.viewport.zoom;
      const visibleEls = doc.layers.flatMap((l) => (l.visible ? l.elements : []));

      // Close path if clicking first node
      if (penNodes.length >= 3 && distance(rawWorld, penNodes[0]) <= snapRadius) {
        snapVisualRef.current = { guides: [], snapPoint: null };
        commitPenPath(true);
        return;
      }

      // If starting a new pen path near an existing open endpoint, snap & connect
      if (penNodes.length === 0) {
        const startMatch =
          doc.symmetry.mode === 'none'
            ? findNearestOpenEndpoint(layer.elements, rawWorld, snapRadius)
            : null;
        if (startMatch) {
          setPenConnectStart(startMatch);
        } else {
          setPenConnectStart(null);
        }
        const ptSnap =
          !startMatch && !e.altKey
            ? computeSmartPointSnap(
                rawWorld,
                visibleEls,
                new Set(),
                new Set(),
                guideSnapTol,
                doc.grid,
                [],
                doc.canvasSize
              )
            : null;
        const pt = startMatch ? startMatch.point : ptSnap ? ptSnap.point : snappedWorld;
        const newNode: AnchorNode = {
          id: createId('n'),
          x: pt.x,
          y: pt.y,
          type: 'corner',
        };
        setPenNodes([newNode]);
        interactionRef.current = {
          type: 'pen-drag-handle',
          nodeIndex: 0,
        };
        return;
      }

      // Check if closing/connecting onto an existing open endpoint
      const endMatch =
        doc.symmetry.mode === 'none'
          ? findNearestOpenEndpoint(layer.elements, rawWorld, snapRadius)
          : null;

      if (endMatch) {
        const endNode: AnchorNode = {
          id: createId('n'),
          x: endMatch.point.x,
          y: endMatch.point.y,
          type: 'corner',
        };
        const completedNodes = [...penNodes, endNode];
        commitConnectedNodes(
          completedNodes,
          penConnectStart,
          endMatch,
          snapRadius,
          'Bézier-Pfad'
        );
        setPenNodes([]);
        setPenConnectStart(null);
        snapVisualRef.current = { guides: [], snapPoint: null };
        interactionRef.current = { type: 'idle' };
        return;
      }

      const ptSnap = e.altKey
        ? null
        : computeSmartPointSnap(
            rawWorld,
            visibleEls,
            new Set(),
            new Set(),
            guideSnapTol,
            doc.grid,
            penNodes,
            doc.canvasSize
          );
      const basePt = ptSnap ? ptSnap.point : snappedWorld;
      const pt = snapToPerspective(
        penNodes[penNodes.length - 1],
        basePt,
        doc.perspective
      );

      const newNode: AnchorNode = {
        id: createId('n'),
        x: pt.x,
        y: pt.y,
        type: 'corner',
      };
      const nextNodes = [...penNodes, newNode];
      setPenNodes(nextNodes);
      interactionRef.current = {
        type: 'pen-drag-handle',
        nodeIndex: nextNodes.length - 1,
      };
      return;
    }

    if (activeTool === 'select') {
      // Check selection transform handles first
      const allEls = doc.layers.flatMap((l) => (l.visible ? l.elements : []));
      const selectedEls = allEls.filter((el) => selectedIds.includes(el.id));
      const bounds = getCombinedBounds(selectedEls);
      const hs = toolSettings.handleSettings;

      if (bounds) {
        const hitTol = getHandleHitToleranceWorld(
          doc.viewport.zoom,
          e.pointerType === 'touch',
          hs
        );
        if (hs.showRotationHandle !== false) {
          const rotDist = getRotationHandleDistanceWorld(doc.viewport.zoom, hs);
          const rotHandle = { x: bounds.cx, y: bounds.minY - rotDist };
          if (distance(rawWorld, rotHandle) <= hitTol) {
            interactionRef.current = {
              type: 'rotate-selection',
              center: { x: bounds.cx, y: bounds.cy },
              startAngle: Math.atan2(rawWorld.y - bounds.cy, rawWorld.x - bounds.cx),
              snapshotDoc: doc,
            };
            return;
          }
        }

        const handles: Point[] = [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.cx, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.cy },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.cx, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.cy },
        ];
        const handleIdx = handles.findIndex((h, idx) => {
          if (idx % 2 === 1 && hs.showEdgeHandles === false) return false;
          return distance(rawWorld, h) <= hitTol;
        });
        if (handleIdx !== -1) {
          interactionRef.current = {
            type: 'scale-selection',
            handleIdx,
            startBounds: bounds,
            snapshotDoc: doc,
            shiftKey: e.shiftKey,
          };
          return;
        }
      }

      const hit = findTopElementAt(rawWorld);
      if (hit) {
        let nextSelected: string[];
        if (e.shiftKey || multiSelectMode) {
          nextSelected = selectedIds.includes(hit.element.id)
            ? selectedIds.filter((id) => id !== hit.element.id)
            : [...selectedIds, hit.element.id];
        } else {
          nextSelected = selectedIds.includes(hit.element.id)
            ? selectedIds
            : [hit.element.id];
        }
        onChangeSelectedIds(nextSelected);
        const nextSelectedEls = allEls.filter((el) => nextSelected.includes(el.id));
        interactionRef.current = {
          type: 'move-selection',
          startWorld: rawWorld,
          startBounds: getCombinedBounds(nextSelectedEls),
          snapshotDoc: doc,
        };
      } else {
        if (!e.shiftKey && !multiSelectMode) {
          onChangeSelectedIds([]);
          setSelectedNodeIds(new Set());
        }
        interactionRef.current = {
          type: 'marquee',
          start: rawWorld,
          current: rawWorld,
          additive: e.shiftKey || multiSelectMode,
        };
      }
      return;
    }

    if (activeTool === 'node') {
      const allEls = doc.layers.flatMap((l) => (l.visible && !l.locked ? l.elements : []));
      const selectedPaths = allEls.filter(
        (el): el is VectorPathElement =>
          selectedIds.includes(el.id) && el.kind === 'path'
      );
      const hs = toolSettings.handleSettings;
      const hitTol = getHandleHitToleranceWorld(
        doc.viewport.zoom,
        e.pointerType === 'touch',
        hs
      );
      const visMode = hs.bezierVisibility ?? 'auto';

      if (selectedPaths.length > 0) {
        // 1. Check visible Bezier handles first across selected paths
        if (visMode !== 'none') {
          for (const pathEl of selectedPaths) {
            const allNodes = getPathContours(pathEl).flatMap((c) => c.nodes);
            const totalNodes = allNodes.length;
            for (const node of allNodes) {
              const isSel = selectedNodeIds.has(node.id);
              const showBezier =
                visMode === 'all' ||
                (visMode === 'selected' && isSel) ||
                (visMode === 'auto' && (isSel || totalNodes <= 16));
              if (!showBezier) continue;

              if (node.handleIn && distance(rawWorld, node.handleIn) <= hitTol) {
                setSelectedNodeIds(new Set([node.id]));
                interactionRef.current = {
                  type: 'drag-node',
                  elementId: pathEl.id,
                  nodeId: node.id,
                  dragNodeIds: new Set([node.id]),
                  startWorld: rawWorld,
                  startNodePos: { x: node.handleIn.x, y: node.handleIn.y },
                  part: 'in',
                  snapshotDoc: doc,
                  altKey: e.altKey,
                };
                return;
              }
              if (node.handleOut && distance(rawWorld, node.handleOut) <= hitTol) {
                setSelectedNodeIds(new Set([node.id]));
                interactionRef.current = {
                  type: 'drag-node',
                  elementId: pathEl.id,
                  nodeId: node.id,
                  dragNodeIds: new Set([node.id]),
                  startWorld: rawWorld,
                  startNodePos: { x: node.handleOut.x, y: node.handleOut.y },
                  part: 'out',
                  snapshotDoc: doc,
                  altKey: e.altKey,
                };
                return;
              }
            }
          }
        }

        // 2. Check anchor points across selected paths
        for (const pathEl of selectedPaths) {
          const allNodes = getPathContours(pathEl).flatMap((c) => c.nodes);
          for (const node of allNodes) {
            if (distance(rawWorld, node) <= hitTol) {
              if (e.altKey || pullTangentMode) {
                setSelectedNodeIds(new Set([node.id]));
                interactionRef.current = {
                  type: 'pull-tangent',
                  elementId: pathEl.id,
                  nodeId: node.id,
                  snapshotDoc: doc,
                };
                return;
              }

              const additive = e.shiftKey || multiNodeSelectMode;
              let nextSet: Set<string>;
              let toggleOnTapNodeId: string | undefined;
              if (additive) {
                nextSet = new Set(selectedNodeIds);
                if (nextSet.has(node.id)) {
                  toggleOnTapNodeId = node.id;
                } else {
                  nextSet.add(node.id);
                }
              } else if (selectedNodeIds.has(node.id)) {
                nextSet = new Set(selectedNodeIds);
              } else {
                nextSet = new Set([node.id]);
              }
              setSelectedNodeIds(nextSet);

              interactionRef.current = {
                type: 'drag-node',
                elementId: pathEl.id,
                nodeId: node.id,
                dragNodeIds: nextSet,
                toggleOnTapNodeId,
                startWorld: rawWorld,
                startNodePos: { x: node.x, y: node.y },
                part: 'anchor',
                snapshotDoc: doc,
                altKey: e.altKey,
              };
              return;
            }
          }
        }

        // 2b. Check ghost pull-out tangent stubs on selected nodes missing handles
        if (visMode !== 'none') {
          for (const pathEl of selectedPaths) {
            for (const contour of getPathContours(pathEl)) {
              for (let ni = 0; ni < contour.nodes.length; ni++) {
                const node = contour.nodes[ni];
                if (!selectedNodeIds.has(node.id)) continue;
                if (node.handleIn && node.handleOut) continue;
                const stubs = getNodeTangentStubs(
                  contour.nodes,
                  ni,
                  contour.closed,
                  doc.viewport.zoom,
                  hs
                );
                if (stubs.inStub && distance(rawWorld, stubs.inStub) <= hitTol) {
                  interactionRef.current = {
                    type: 'drag-node',
                    elementId: pathEl.id,
                    nodeId: node.id,
                    dragNodeIds: new Set([node.id]),
                    startWorld: rawWorld,
                    startNodePos: { x: stubs.inStub.x, y: stubs.inStub.y },
                    part: 'in',
                    snapshotDoc: doc,
                    altKey: e.altKey,
                  };
                  return;
                }
                if (stubs.outStub && distance(rawWorld, stubs.outStub) <= hitTol) {
                  interactionRef.current = {
                    type: 'drag-node',
                    elementId: pathEl.id,
                    nodeId: node.id,
                    dragNodeIds: new Set([node.id]),
                    startWorld: rawWorld,
                    startNodePos: { x: stubs.outStub.x, y: stubs.outStub.y },
                    part: 'out',
                    snapshotDoc: doc,
                    altKey: e.altKey,
                  };
                  return;
                }
              }
            }
          }
        }

        // 2c. Check multi-node transform box handles (scale / rotate selected nodes)
        if (selectedNodeIds.size >= 2) {
          const nodeBox = getSelectedNodesTransformBounds(
            selectedPaths,
            selectedNodeIds,
            doc.viewport,
            hs
          );
          if (nodeBox) {
            if (hs.showRotationHandle !== false) {
              const rotDist = getRotationHandleDistanceWorld(doc.viewport.zoom, hs);
              const rotHandle = { x: nodeBox.cx, y: nodeBox.minY - rotDist };
              if (distance(rawWorld, rotHandle) <= hitTol) {
                interactionRef.current = {
                  type: 'rotate-nodes',
                  center: { x: nodeBox.cx, y: nodeBox.cy },
                  startAngle: Math.atan2(
                    rawWorld.y - nodeBox.cy,
                    rawWorld.x - nodeBox.cx
                  ),
                  snapshotDoc: doc,
                };
                return;
              }
            }
            const corners: Point[] = [
              { x: nodeBox.minX, y: nodeBox.minY },
              { x: nodeBox.maxX, y: nodeBox.minY },
              { x: nodeBox.maxX, y: nodeBox.maxY },
              { x: nodeBox.minX, y: nodeBox.maxY },
            ];
            const cornerIdx = corners.findIndex((c) => distance(rawWorld, c) <= hitTol);
            if (cornerIdx !== -1) {
              interactionRef.current = {
                type: 'scale-nodes',
                cornerIdx,
                startBounds: nodeBox,
                snapshotDoc: doc,
                shiftKey: e.shiftKey,
              };
              return;
            }
          }
        }
      }

      // 3. Hit-test another unselected path to jump straight into its nodes
      const hit = findTopElementAt(
        rawWorld,
        false,
        e.pointerType === 'touch' ? 14 / doc.viewport.zoom : undefined
      );
      if (hit && hit.element.kind === 'path' && !selectedIds.includes(hit.element.id)) {
        const nextIds =
          e.shiftKey || multiNodeSelectMode
            ? [...selectedIds, hit.element.id]
            : [hit.element.id];
        onChangeSelectedIds(nextIds);
        setSelectedNodeIds(new Set());
        return;
      }

      // 4. Dragging on empty space starts node-marquee (or path marquee if none active); tapping releases selection
      if (selectedPaths.length > 0) {
        interactionRef.current = {
          type: 'marquee-nodes',
          start: rawWorld,
          current: rawWorld,
          additive: e.shiftKey || multiNodeSelectMode,
        };
      } else {
        if (!e.shiftKey && !multiNodeSelectMode && selectedIds.length > 0) {
          onChangeSelectedIds([]);
          setSelectedNodeIds(new Set());
        }
        interactionRef.current = {
          type: 'marquee',
          start: rawWorld,
          current: rawWorld,
          additive: e.shiftKey || multiNodeSelectMode,
        };
      }
      return;
    }

    if (activeTool === 'fill') {
      const hit = findTopElementAt(rawWorld);
      if (!hit) return;
      const nextLayers = doc.layers.map((l) => {
        if (l.id !== hit.layerId) return l;
        return {
          ...l,
          elements: l.elements.map((el) => {
            if (el.id !== hit.element.id) return el;
            if (e.shiftKey) {
              return { ...el, stroke: { ...el.stroke, paint: currentFill } };
            }
            return { ...el, fill: currentFill };
          }),
        };
      });
      onCommitDoc({ ...doc, updatedAt: Date.now(), layers: nextLayers });
      return;
    }

    if (activeTool === 'eyedropper') {
      const hit = findTopElementAt(rawWorld, true);
      if (!hit) return;
      if (hit.element.fill.type !== 'none') {
        onSampleColor(hit.element.fill);
      } else if (hit.element.stroke.paint.type !== 'none') {
        onSampleColor(hit.element.stroke.paint);
      }
      return;
    }

    if (activeTool === 'eraser') {
      interactionRef.current = {
        type: 'erase',
        erasedAny: false,
        snapshotDoc: doc,
        workingDoc: doc,
      };
      const hit = findTopElementAt(rawWorld);
      if (hit) {
        const workingDoc: ProjectDocument = {
          ...doc,
          updatedAt: Date.now(),
          layers: doc.layers.map((l) =>
            l.id === hit.layerId
              ? { ...l, elements: l.elements.filter((el) => el.id !== hit.element.id) }
              : l
          ),
        };
        interactionRef.current = {
          type: 'erase',
          erasedAny: true,
          snapshotDoc: doc,
          workingDoc,
        };
        onUpdateLiveDoc(workingDoc);
      }
      return;
    }

    if (activeTool === 'text') {
      const layer = getActiveLayer();
      if (!layer || layer.locked) return;
      setTextDraft({ world: snappedWorld, screen, value: '' });
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { screen, rawWorld, snappedWorld } = getPointerCoords(e);
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, screen);
    }

    const inter = interactionRef.current;

    if (inter.type === 'pinch-cooldown') {
      return;
    }

    if (inter.type === 'pinch-zoom') {
      const p1 = activePointersRef.current.get(inter.pointerIds[0]);
      const p2 = activePointersRef.current.get(inter.pointerIds[1]);
      if (!p1 || !p2) return;

      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const dist = Math.max(10, Math.hypot(p2.x - p1.x, p2.y - p1.y));
      const nextZoom = Math.max(
        0.08,
        Math.min(24, inter.startZoom * (dist / inter.startDist))
      );

      const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      let stepDelta = currentAngle - inter.lastAngle;
      while (stepDelta > Math.PI) stepDelta -= Math.PI * 2;
      while (stepDelta < -Math.PI) stepDelta += Math.PI * 2;
      inter.lastAngle = currentAngle;

      if (dist >= 24) {
        inter.rawDeltaAngle += stepDelta;
        if (!inter.rotationEngaged) {
          if (Math.abs(inter.rawDeltaAngle) >= 0.052) {
            inter.rotationEngaged = true;
            inter.appliedDeltaAngle += stepDelta;
          }
        } else {
          inter.appliedDeltaAngle += stepDelta;
        }
      }

      let nextRotation = inter.startRotation + inter.appliedDeltaAngle;
      while (nextRotation > Math.PI) nextRotation -= Math.PI * 2;
      while (nextRotation <= -Math.PI) nextRotation += Math.PI * 2;

      if (inter.rotationEngaged) {
        const rightAngle = Math.PI / 2;
        const nearestRight = Math.round(nextRotation / rightAngle) * rightAngle;
        if (Math.abs(nextRotation - nearestRight) <= 0.032) {
          nextRotation = nearestRight === 0 ? 0 : nearestRight;
          if (nextRotation <= -Math.PI) nextRotation = Math.PI;
        }
      }
      if (Object.is(nextRotation, -0)) nextRotation = 0;

      const center = { x: size.width / 2, y: size.height / 2 };
      const cos = Math.cos(nextRotation);
      const sin = Math.sin(nextRotation);
      const sx = inter.anchorWorld.x * nextZoom;
      const sy = inter.anchorWorld.y * nextZoom;
      const rx = sx * cos - sy * sin;
      const ry = sx * sin + sy * cos;

      onUpdateLiveDoc({
        ...doc,
        viewport: {
          ...doc.viewport,
          zoom: nextZoom,
          rotation: nextRotation,
          x: mid.x - center.x - rx,
          y: mid.y - center.y - ry,
        },
      });
      return;
    }

    if (inter.type === 'idle') {
      if (activeTool === 'pen' && penNodes.length > 0 && !e.altKey) {
        const snapTol = (e.pointerType === 'touch' ? 14 : 9) / doc.viewport.zoom;
        const visibleEls = doc.layers.flatMap((l) => (l.visible ? l.elements : []));
        const ptSnap = computeSmartPointSnap(
          rawWorld,
          visibleEls,
          new Set(),
          new Set(),
          snapTol,
          doc.grid,
          penNodes,
          doc.canvasSize
        );
        snapVisualRef.current = {
          guides: ptSnap.guides,
          snapPoint: ptSnap.snappedNode,
        };
        setCursorWorld(ptSnap.point);
      } else {
        if (snapVisualRef.current.guides.length > 0 || snapVisualRef.current.snapPoint) {
          snapVisualRef.current = { guides: [], snapPoint: null };
        }
        setCursorWorld(snappedWorld);
      }
      return;
    }

    setCursorWorld(snappedWorld);

    if (inter.type === 'pan') {
      const dx = screen.x - inter.startScreen.x;
      const dy = screen.y - inter.startScreen.y;
      onUpdateLiveDoc({
        ...doc,
        viewport: {
          ...doc.viewport,
          x: inter.startVpX + dx,
          y: inter.startVpY + dy,
        },
      });
      return;
    }

    if (inter.type === 'drag-guide') {
      if (inter.target === 'sym') {
        onUpdateLiveDoc({
          ...doc,
          symmetry: { ...doc.symmetry, center: rawWorld },
        });
      } else {
        const nextPersp = { ...doc.perspective };
        if (inter.target === 'vp1') {
          nextPersp.vp1 = rawWorld;
          nextPersp.horizonY = rawWorld.y;
          nextPersp.vp2 = { ...nextPersp.vp2, y: rawWorld.y };
        } else if (inter.target === 'vp2') {
          nextPersp.vp2 = rawWorld;
          nextPersp.horizonY = rawWorld.y;
          nextPersp.vp1 = { ...nextPersp.vp1, y: rawWorld.y };
        } else {
          nextPersp.vp3 = rawWorld;
        }
        onUpdateLiveDoc({ ...doc, perspective: nextPersp });
      }
      return;
    }

    if (inter.type === 'brush') {
      const minStepPx =
        toolSettings.pencilMode === 'fine'
          ? 0.9
          : toolSettings.pencilMode === 'coarse'
          ? 3.8
          : 1.8;
      const minStepWorld = minStepPx / doc.viewport.zoom;

      const rect = e.currentTarget.getBoundingClientRect();
      const vpCenter = { x: size.width / 2, y: size.height / 2 };
      const rawCoalesced =
        typeof e.nativeEvent.getCoalescedEvents === 'function'
          ? e.nativeEvent.getCoalescedEvents()
          : [];
      const validCoalesced = rawCoalesced.filter(
        (s) =>
          Number.isFinite(s.clientX) &&
          Number.isFinite(s.clientY) &&
          !(s.clientX === 0 && s.clientY === 0 && (e.clientX !== 0 || e.clientY !== 0))
      );
      const samples =
        validCoalesced.length > 0 ? [...validCoalesced, e.nativeEvent] : [e.nativeEvent];

      let addedAny = false;
      for (const sample of samples) {
        const ptScreen = {
          x: sample.clientX - rect.left,
          y: sample.clientY - rect.top,
        };
        const ptWorld = screenToWorld(ptScreen, doc.viewport, vpCenter);
        const last = inter.points[inter.points.length - 1];
        const dist = distance(last, ptWorld);
        if (dist < minStepWorld) continue;

        const now = sample.timeStamp || performance.now();
        const dt = Math.max(4, now - inter.lastTime);
        const velocity = (dist * doc.viewport.zoom) / dt; // screen px per ms
        const pressureVal = sample.pressure && sample.pressure !== 0.5
          ? sample.pressure
          : Math.max(0.32, Math.min(1, 0.92 - velocity * 0.16));

        inter.points.push({ x: ptWorld.x, y: ptWorld.y, pressure: pressureVal });
        inter.lastTime = now;
        addedAny = true;
      }

      if (!addedAny) return;

      const latestPt = inter.points[inter.points.length - 1];
      const snapRadius = inter.snapRadius;
      const firstPt = inter.points[0];
      const totalLen = polylineLength(inter.points);

      let snapPoint: Point | null = null;
      let willCloseLoop = false;

      if (
        !inter.connectStart &&
        totalLen >= 30 / doc.viewport.zoom &&
        distance(latestPt, firstPt) <= snapRadius
      ) {
        snapPoint = firstPt;
        willCloseLoop = true;
      } else if (
        !toolSettings.autoCloseBrushPath &&
        !isFillOnlyMode &&
        doc.symmetry.mode === 'none' &&
        totalLen >= 16 / doc.viewport.zoom
      ) {
        const layer = getActiveLayer();
        if (layer) {
          const endMatch = findNearestOpenEndpoint(layer.elements, latestPt, snapRadius);
          if (endMatch) {
            snapPoint = endMatch.point;
          }
        }
      }

      if (
        (toolSettings.autoCloseBrushPath || isFillOnlyMode) &&
        !inter.connectStart &&
        inter.points.length >= 3 &&
        totalLen >= 8 / doc.viewport.zoom
      ) {
        willCloseLoop = true;
      }

      inter.snapPoint = snapPoint;
      inter.willCloseLoop = willCloseLoop;
      return;
    }

    if (inter.type === 'shape') {
      const snapTol = (e.pointerType === 'touch' ? 14 : 9) / doc.viewport.zoom;
      const visibleEls = doc.layers.flatMap((l) => (l.visible ? l.elements : []));
      const endSnap = e.altKey
        ? { point: rawWorld, guides: [], snappedNode: null }
        : computeSmartPointSnap(
            rawWorld,
            visibleEls,
            new Set(),
            new Set(),
            snapTol,
            doc.grid,
            [inter.start],
            doc.canvasSize
          );
      snapVisualRef.current = {
        guides: endSnap.guides,
        snapPoint: endSnap.snappedNode,
      };
      inter.current = endSnap.point;
      inter.shiftKey = e.shiftKey;
      return;
    }

    if (inter.type === 'pen-drag-handle') {
      setPenNodes((prev) =>
        prev.map((n, idx) => {
          if (idx !== inter.nodeIndex) return n;
          if (distance(n, rawWorld) < 5 / doc.viewport.zoom) return n;
          return {
            ...n,
            type: 'smooth',
            handleOut: rawWorld,
            handleIn: { x: 2 * n.x - rawWorld.x, y: 2 * n.y - rawWorld.y },
          };
        })
      );
      return;
    }

    if (inter.type === 'marquee' || inter.type === 'marquee-nodes') {
      inter.current = rawWorld;
      return;
    }

    if (inter.type === 'move-selection') {
      const rawDx = rawWorld.x - inter.startWorld.x;
      const rawDy = rawWorld.y - inter.startWorld.y;
      let snapDx = rawDx;
      let snapDy = rawDy;

      if (inter.startBounds && !e.altKey) {
        const b = inter.startBounds;
        const movedBounds: BoundingBox = {
          minX: b.minX + rawDx,
          minY: b.minY + rawDy,
          maxX: b.maxX + rawDx,
          maxY: b.maxY + rawDy,
          cx: b.cx + rawDx,
          cy: b.cy + rawDy,
          width: b.width,
          height: b.height,
        };
        const otherEls = inter.snapshotDoc.layers
          .flatMap((l) => (l.visible ? l.elements : []))
          .filter((el) => !selectedIds.includes(el.id));
        const snapTol = (e.pointerType === 'touch' ? 14 : 9) / doc.viewport.zoom;
        const snapRes = computeSmartObjectSnap(
          movedBounds,
          otherEls,
          snapTol,
          doc.grid,
          doc.canvasSize
        );
        snapDx = rawDx + snapRes.dx;
        snapDy = rawDy + snapRes.dy;
        snapVisualRef.current = { guides: snapRes.guides, snapPoint: null };
      } else {
        snapVisualRef.current = { guides: [], snapPoint: null };
      }

      const nextLayers = inter.snapshotDoc.layers.map((l) => {
        if (l.locked) return l;
        return {
          ...l,
          elements: l.elements.map((el) =>
            selectedIds.includes(el.id) ? translateElement(el, snapDx, snapDy) : el
          ),
        };
      });
      if (snapDx !== 0 || snapDy !== 0) {
        inter.moved = true;
      }
      onUpdateLiveDoc({ ...doc, layers: nextLayers });
      return;
    }

    if (inter.type === 'scale-selection') {
      const b = inter.startBounds;
      // Opposite anchor based on handle index 0..7 (TL, TC, TR, RC, BR, BC, BL, LC)
      const anchors: Point[] = [
        { x: b.maxX, y: b.maxY },
        { x: b.cx, y: b.maxY },
        { x: b.minX, y: b.maxY },
        { x: b.minX, y: b.cy },
        { x: b.minX, y: b.minY },
        { x: b.cx, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.cy },
      ];
      const origin = anchors[inter.handleIdx];
      let sx = 1;
      let sy = 1;
      if (![1, 5].includes(inter.handleIdx)) {
        sx = (rawWorld.x - origin.x) / (b.width * (origin.x === b.minX ? 1 : -1) || 1);
      }
      if (![3, 7].includes(inter.handleIdx)) {
        sy = (rawWorld.y - origin.y) / (b.height * (origin.y === b.minY ? 1 : -1) || 1);
      }
      const preserveAspect =
        Boolean(toolSettings.handleSettings.lockAspectRatio) !== e.shiftKey;
      if (preserveAspect) {
        if (inter.handleIdx === 1 || inter.handleIdx === 5) {
          sx = sy;
        } else if (inter.handleIdx === 3 || inter.handleIdx === 7) {
          sy = sx;
        } else {
          const uniform = Math.max(Math.abs(sx), Math.abs(sy));
          sx = Math.sign(sx || 1) * uniform;
          sy = Math.sign(sy || 1) * uniform;
        }
      }
      if (Math.abs(sx) < 0.05) sx = 0.05 * Math.sign(sx || 1);
      if (Math.abs(sy) < 0.05) sy = 0.05 * Math.sign(sy || 1);

      const nextLayers = inter.snapshotDoc.layers.map((l) =>
        l.locked
          ? l
          : {
              ...l,
              elements: l.elements.map((el) =>
                selectedIds.includes(el.id) ? scaleElement(el, origin, sx, sy) : el
              ),
            }
      );
      inter.moved = true;
      onUpdateLiveDoc({ ...doc, layers: nextLayers });
      return;
    }

    if (inter.type === 'rotate-selection') {
      const currAngle = Math.atan2(
        rawWorld.y - inter.center.y,
        rawWorld.x - inter.center.x
      );
      let delta = currAngle - inter.startAngle;
      if (e.shiftKey) {
        const deg15 = Math.PI / 12;
        delta = Math.round(delta / deg15) * deg15;
      }
      const nextLayers = inter.snapshotDoc.layers.map((l) =>
        l.locked
          ? l
          : {
              ...l,
              elements: l.elements.map((el) =>
                selectedIds.includes(el.id) ? rotateElement(el, inter.center, delta) : el
              ),
            }
      );
      inter.moved = true;
      onUpdateLiveDoc({ ...doc, layers: nextLayers });
      return;
    }

    if (inter.type === 'scale-nodes') {
      const b = inter.startBounds;
      const anchors: Point[] = [
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
      ];
      const origin = anchors[inter.cornerIdx];
      const spanX = b.width * (origin.x === b.minX ? 1 : -1);
      const spanY = b.height * (origin.y === b.minY ? 1 : -1);
      let sx = (rawWorld.x - origin.x) / (spanX || 1);
      let sy = (rawWorld.y - origin.y) / (spanY || 1);
      const preserveAspect =
        Boolean(toolSettings.handleSettings.lockAspectRatio) !== e.shiftKey;
      if (preserveAspect) {
        const uniform = Math.max(Math.abs(sx), Math.abs(sy));
        sx = Math.sign(sx || 1) * uniform;
        sy = Math.sign(sy || 1) * uniform;
      }
      if (Math.abs(sx) < 0.05) sx = 0.05 * Math.sign(sx || 1);
      if (Math.abs(sy) < 0.05) sy = 0.05 * Math.sign(sy || 1);

      const scalePt = (p: Point): Point => ({
        x: origin.x + (p.x - origin.x) * sx,
        y: origin.y + (p.y - origin.y) * sy,
      });
      const transformNode = (n: AnchorNode): AnchorNode => {
        if (!selectedNodeIds.has(n.id)) return n;
        const pos = scalePt(n);
        return {
          ...n,
          x: pos.x,
          y: pos.y,
          handleIn: n.handleIn ? scalePt(n.handleIn) : undefined,
          handleOut: n.handleOut ? scalePt(n.handleOut) : undefined,
        };
      };

      const nextLayers = inter.snapshotDoc.layers.map((l) =>
        l.locked
          ? l
          : {
              ...l,
              elements: l.elements.map((el) => {
                if (el.kind !== 'path' || !selectedIds.includes(el.id)) return el;
                if (el.subpaths && el.subpaths.length > 0) {
                  const nextSubpaths = el.subpaths.map((sp) => ({
                    ...sp,
                    nodes: sp.nodes.map(transformNode),
                  }));
                  return { ...el, nodes: nextSubpaths[0].nodes, subpaths: nextSubpaths };
                }
                return { ...el, nodes: el.nodes.map(transformNode) };
              }),
            }
      );
      inter.moved = true;
      onUpdateLiveDoc({ ...doc, layers: nextLayers });
      return;
    }

    if (inter.type === 'rotate-nodes') {
      const currAngle = Math.atan2(
        rawWorld.y - inter.center.y,
        rawWorld.x - inter.center.x
      );
      let delta = currAngle - inter.startAngle;
      if (e.shiftKey) {
        const deg15 = Math.PI / 12;
        delta = Math.round(delta / deg15) * deg15;
      }
      const cos = Math.cos(delta);
      const sin = Math.sin(delta);
      const rotPt = (p: Point): Point => {
        const dx = p.x - inter.center.x;
        const dy = p.y - inter.center.y;
        return {
          x: inter.center.x + dx * cos - dy * sin,
          y: inter.center.y + dx * sin + dy * cos,
        };
      };
      const transformNode = (n: AnchorNode): AnchorNode => {
        if (!selectedNodeIds.has(n.id)) return n;
        const pos = rotPt(n);
        return {
          ...n,
          x: pos.x,
          y: pos.y,
          handleIn: n.handleIn ? rotPt(n.handleIn) : undefined,
          handleOut: n.handleOut ? rotPt(n.handleOut) : undefined,
        };
      };

      const nextLayers = inter.snapshotDoc.layers.map((l) =>
        l.locked
          ? l
          : {
              ...l,
              elements: l.elements.map((el) => {
                if (el.kind !== 'path' || !selectedIds.includes(el.id)) return el;
                if (el.subpaths && el.subpaths.length > 0) {
                  const nextSubpaths = el.subpaths.map((sp) => ({
                    ...sp,
                    nodes: sp.nodes.map(transformNode),
                  }));
                  return { ...el, nodes: nextSubpaths[0].nodes, subpaths: nextSubpaths };
                }
                return { ...el, nodes: el.nodes.map(transformNode) };
              }),
            }
      );
      inter.moved = true;
      onUpdateLiveDoc({ ...doc, layers: nextLayers });
      return;
    }

    if (inter.type === 'drag-node') {
      let anchorDx = rawWorld.x - inter.startWorld.x;
      let anchorDy = rawWorld.y - inter.startWorld.y;

      if (inter.part === 'anchor') {
        const targetPos: Point = {
          x: inter.startNodePos.x + anchorDx,
          y: inter.startNodePos.y + anchorDy,
        };
        if (!e.altKey) {
          const snapTol = (e.pointerType === 'touch' ? 14 : 9) / doc.viewport.zoom;
          const snapshotVisibleEls = inter.snapshotDoc.layers.flatMap((l) =>
            l.visible ? l.elements : []
          );
          const snapRes = computeSmartPointSnap(
            targetPos,
            snapshotVisibleEls,
            new Set(),
            inter.dragNodeIds,
            snapTol,
            doc.grid,
            [],
            doc.canvasSize
          );
          snapVisualRef.current = {
            guides: snapRes.guides,
            snapPoint: snapRes.snappedNode,
          };
          anchorDx = snapRes.point.x - inter.startNodePos.x;
          anchorDy = snapRes.point.y - inter.startNodePos.y;
        } else {
          snapVisualRef.current = { guides: [], snapPoint: null };
        }
      }

      const nextLayers = inter.snapshotDoc.layers.map((l) => {
        if (l.locked) return l;
        return {
          ...l,
          elements: l.elements.map((el) => {
            if (el.kind !== 'path') return el;
            if (inter.part !== 'anchor' && el.id !== inter.elementId) return el;
            if (inter.part === 'anchor' && !selectedIds.includes(el.id) && el.id !== inter.elementId) {
              return el;
            }
            const updateNode = (n: AnchorNode): AnchorNode => {
              if (inter.part === 'anchor') {
                if (!inter.dragNodeIds.has(n.id)) return n;
                return {
                  ...n,
                  x: n.x + anchorDx,
                  y: n.y + anchorDy,
                  handleIn: n.handleIn
                    ? { x: n.handleIn.x + anchorDx, y: n.handleIn.y + anchorDy }
                    : undefined,
                  handleOut: n.handleOut
                    ? { x: n.handleOut.x + anchorDx, y: n.handleOut.y + anchorDy }
                    : undefined,
                };
              }
              if (n.id !== inter.nodeId) return n;
              const effectiveTangentMode = e.altKey
                ? 'free'
                : toolSettings.handleSettings.tangentMode;
              const retractTol = getTangentRetractToleranceWorld(
                doc.viewport.zoom,
                e.pointerType === 'touch',
                toolSettings.handleSettings
              );
              const isRetracting = distance(rawWorld, n) <= retractTol;

              if (isRetracting) {
                snapVisualRef.current = { guides: [], snapPoint: { x: n.x, y: n.y } };
                if (inter.part === 'in') {
                  const nextOut =
                    n.type === 'smooth' && effectiveTangentMode === 'symmetrical'
                      ? undefined
                      : n.handleOut;
                  return {
                    ...n,
                    type: nextOut ? 'corner' : 'corner',
                    handleIn: undefined,
                    handleOut: nextOut,
                  };
                }
                const nextIn =
                  n.type === 'smooth' && effectiveTangentMode === 'symmetrical'
                    ? undefined
                    : n.handleIn;
                return {
                  ...n,
                  type: 'corner',
                  handleOut: undefined,
                  handleIn: nextIn,
                };
              }

              snapVisualRef.current = { guides: [], snapPoint: null };
              if (inter.part === 'in') {
                let nextOut = n.handleOut;
                if (n.type === 'smooth' && effectiveTangentMode === 'symmetrical') {
                  nextOut = {
                    x: 2 * n.x - rawWorld.x,
                    y: 2 * n.y - rawWorld.y,
                  };
                } else if (
                  n.type === 'smooth' &&
                  effectiveTangentMode === 'aligned' &&
                  n.handleOut
                ) {
                  const outLen = distance(n, n.handleOut);
                  const inDist = distance(n, rawWorld) || 1;
                  nextOut = {
                    x: n.x - ((rawWorld.x - n.x) / inDist) * outLen,
                    y: n.y - ((rawWorld.y - n.y) / inDist) * outLen,
                  };
                }
                return { ...n, handleIn: rawWorld, handleOut: nextOut };
              }
              let nextIn = n.handleIn;
              if (n.type === 'smooth' && effectiveTangentMode === 'symmetrical') {
                nextIn = {
                  x: 2 * n.x - rawWorld.x,
                  y: 2 * n.y - rawWorld.y,
                };
              } else if (
                n.type === 'smooth' &&
                effectiveTangentMode === 'aligned' &&
                n.handleIn
              ) {
                const inLen = distance(n, n.handleIn);
                const outDist = distance(n, rawWorld) || 1;
                nextIn = {
                  x: n.x - ((rawWorld.x - n.x) / outDist) * inLen,
                  y: n.y - ((rawWorld.y - n.y) / outDist) * inLen,
                };
              }
              return { ...n, handleOut: rawWorld, handleIn: nextIn };
            };
            if (el.subpaths && el.subpaths.length > 0) {
              const nextSubpaths = el.subpaths.map((sp) => ({
                ...sp,
                nodes: sp.nodes.map(updateNode),
              }));
              return {
                ...el,
                nodes: nextSubpaths[0].nodes,
                subpaths: nextSubpaths,
              };
            }
            return {
              ...el,
              nodes: el.nodes.map(updateNode),
            };
          }),
        };
      });
      if (distance(rawWorld, inter.startWorld) > 0) {
        inter.moved = true;
      }
      onUpdateLiveDoc({ ...doc, layers: nextLayers });
      return;
    }

    if (inter.type === 'pull-tangent') {
      const retractTol = getTangentRetractToleranceWorld(
        doc.viewport.zoom,
        e.pointerType === 'touch',
        toolSettings.handleSettings
      );
      const nextLayers = inter.snapshotDoc.layers.map((l) => {
        if (l.locked) return l;
        return {
          ...l,
          elements: l.elements.map((el) => {
            if (el.kind !== 'path' || el.id !== inter.elementId) return el;
            const updateNode = (n: AnchorNode): AnchorNode => {
              if (n.id !== inter.nodeId) return n;
              if (distance(rawWorld, n) <= retractTol) {
                snapVisualRef.current = { guides: [], snapPoint: { x: n.x, y: n.y } };
                return {
                  ...n,
                  type: 'corner',
                  handleIn: undefined,
                  handleOut: undefined,
                };
              }
              snapVisualRef.current = { guides: [], snapPoint: null };
              return {
                ...n,
                type: 'smooth',
                handleOut: rawWorld,
                handleIn: { x: 2 * n.x - rawWorld.x, y: 2 * n.y - rawWorld.y },
              };
            };
            if (el.subpaths && el.subpaths.length > 0) {
              const nextSubpaths = el.subpaths.map((sp) => ({
                ...sp,
                nodes: sp.nodes.map(updateNode),
              }));
              return {
                ...el,
                nodes: nextSubpaths[0].nodes,
                subpaths: nextSubpaths,
              };
            }
            return {
              ...el,
              nodes: el.nodes.map(updateNode),
            };
          }),
        };
      });
      inter.moved = true;
      onUpdateLiveDoc({ ...doc, layers: nextLayers });
      return;
    }

    if (inter.type === 'erase') {
      const tol = 12 / doc.viewport.zoom;
      let hitId: string | null = null;
      let hitLayerId: string | null = null;
      for (let li = inter.workingDoc.layers.length - 1; li >= 0; li--) {
        const l = inter.workingDoc.layers[li];
        if (!l.visible || l.locked) continue;
        for (let ei = l.elements.length - 1; ei >= 0; ei--) {
          if (hitTestElement(l.elements[ei], rawWorld, tol)) {
            hitId = l.elements[ei].id;
            hitLayerId = l.id;
            break;
          }
        }
        if (hitId) break;
      }
      if (hitId && hitLayerId) {
        const nextWorking: ProjectDocument = {
          ...inter.workingDoc,
          updatedAt: Date.now(),
          layers: inter.workingDoc.layers.map((l) =>
            l.id === hitLayerId
              ? { ...l, elements: l.elements.filter((el) => el.id !== hitId) }
              : l
          ),
        };
        inter.workingDoc = nextWorking;
        inter.erasedAny = true;
        onUpdateLiveDoc(nextWorking);
      }
    }
  };

  // Pointer Up
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    const inter = interactionRef.current;
    snapVisualRef.current = { guides: [], snapPoint: null };

    if (inter.type === 'pinch-zoom' || inter.type === 'pinch-cooldown') {
      pointerDownStartRef.current = null;
      lastTapRef.current = null;
      interactionRef.current =
        activePointersRef.current.size > 0
          ? { type: 'pinch-cooldown' }
          : { type: 'idle' };
      return;
    }

    const now = performance.now();
    const { screen } = getPointerCoords(e);
    const downStart = pointerDownStartRef.current;
    if (downStart && downStart.pointerId === e.pointerId) {
      pointerDownStartRef.current = null;
    }

    const tapMoveTol = e.pointerType === 'touch' ? 16 : 8;
    const isCleanTap =
      e.type === 'pointerup' &&
      !!downStart &&
      downStart.pointerId === e.pointerId &&
      now - downStart.time < 450 &&
      distance(screen, downStart.screen) <= tapMoveTol;

    if (isCleanTap) {
      const prevTap = lastTapRef.current;
      const doubleTapDist =
        e.pointerType === 'touch' || prevTap?.pointerType === 'touch' ? 28 : 14;
      const isDoubleTap =
        !!prevTap &&
        prevTap.tool === activeTool &&
        now - prevTap.time <= 400 &&
        distance(screen, prevTap.screen) <= doubleTapDist;

      if (isDoubleTap) {
        lastTapRef.current = null;
        if (activeTool === 'node') {
          const handled = triggerNodeDoubleTapAt(
            screen,
            e.pointerType === 'touch'
          );
          if (handled) {
            lastDoubleTapHandledAtRef.current = now;
            interactionRef.current = { type: 'idle' };
            return;
          }
        }
      } else {
        lastTapRef.current = {
          time: now,
          screen,
          pointerType: e.pointerType,
          tool: activeTool,
        };
      }
    } else {
      lastTapRef.current = null;
    }

    interactionRef.current = { type: 'idle' };

    if (inter.type === 'brush') {
      const rect = e.currentTarget.getBoundingClientRect();
      const endWorld = screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        doc.viewport,
        { x: size.width / 2, y: size.height / 2 }
      );
      const lastRecorded = inter.points[inter.points.length - 1];
      if (
        lastRecorded &&
        Number.isFinite(endWorld.x) &&
        Number.isFinite(endWorld.y) &&
        distance(lastRecorded, endWorld) >= 0.5 / doc.viewport.zoom
      ) {
        inter.points.push({
          x: endWorld.x,
          y: endWorld.y,
          pressure: lastRecorded.pressure,
        });
      }

      if (inter.points.length >= 2) {
        const layer = getActiveLayer();
        if (layer && !layer.locked) {
          const snapRadius = inter.snapRadius;
          const totalLen = polylineLength(inter.points);
          const firstPt = inter.points[0];
          const lastPt = inter.points[inter.points.length - 1];

          const closeSelfLoop =
            !inter.connectStart &&
            ((totalLen >= 30 / doc.viewport.zoom &&
              distance(firstPt, lastPt) <= snapRadius) ||
              ((toolSettings.autoCloseBrushPath || isFillOnlyMode) &&
                totalLen >= 8 / doc.viewport.zoom &&
                inter.points.length >= 2));

          if (closeSelfLoop) {
            const loopPts =
              inter.points.length > 3 && distance(firstPt, lastPt) <= snapRadius
                ? inter.points.slice(0, -1)
                : inter.points;
            const nodes = pointsToBezierNodes(
              loopPts,
              toolSettings.smoothing,
              true,
              toolSettings.pencilMode,
              doc.viewport.zoom
            );
            const basePath: VectorPathElement = {
              id: createId('path'),
              kind: 'path',
              name: isFillOnlyMode ? 'Füllform' : 'Geschlossene Kontur',
              nodes,
              closed: true,
              smoothing: toolSettings.smoothing,
              fill: currentFill,
              stroke: currentStroke,
              opacity: 1,
              visible: true,
            };
            const copies = generateSymmetryElements(basePath, doc.symmetry);
            onCommitDoc({
              ...doc,
              updatedAt: Date.now(),
              layers: doc.layers.map((l) =>
                l.id === layer.id ? { ...l, elements: [...l.elements, ...copies] } : l
              ),
            });
            return;
          }

          // Check endpoint connections on active layer when symmetry is off (skip in fill-only mode)
          const startMatch =
            !toolSettings.autoCloseBrushPath &&
            !isFillOnlyMode &&
            doc.symmetry.mode === 'none'
              ? inter.connectStart
              : null;
          const endMatch =
            !toolSettings.autoCloseBrushPath &&
            !isFillOnlyMode &&
            doc.symmetry.mode === 'none' &&
            totalLen >= 12 / doc.viewport.zoom
              ? findNearestOpenEndpoint(layer.elements, lastPt, snapRadius)
              : null;

          if (startMatch || endMatch) {
            const strokePts = [...inter.points];
            if (startMatch) {
              strokePts[0] = { ...strokePts[0], x: startMatch.point.x, y: startMatch.point.y };
            }
            if (endMatch) {
              const lastIdx = strokePts.length - 1;
              strokePts[lastIdx] = {
                ...strokePts[lastIdx],
                x: endMatch.point.x,
                y: endMatch.point.y,
              };
            }

            const newNodes = pointsToBezierNodes(
              strokePts,
              toolSettings.smoothing,
              false,
              toolSettings.pencilMode,
              doc.viewport.zoom
            );
            if (commitConnectedNodes(newNodes, startMatch, endMatch, snapRadius, 'Verbundene Kontur')) {
              return;
            }
          }

          // Standard open brush stroke (preserve fill + close when drawing in fill-only mode)
          const closeFillFallback = isFillOnlyMode && inter.points.length >= 2;
          const nodes = pointsToBezierNodes(
            inter.points,
            toolSettings.smoothing,
            closeFillFallback,
            toolSettings.pencilMode,
            doc.viewport.zoom
          );
          const basePath: VectorPathElement = {
            id: createId('path'),
            kind: 'path',
            name: isFillOnlyMode ? 'Füllform' : 'Pinselstrich',
            nodes,
            closed: closeFillFallback,
            smoothing: toolSettings.smoothing,
            fill: isFillOnlyMode ? currentFill : { ...currentFill, type: 'none' },
            stroke: currentStroke,
            opacity: 1,
            visible: true,
          };
          const copies = generateSymmetryElements(basePath, doc.symmetry);
          onCommitDoc({
            ...doc,
            updatedAt: Date.now(),
            layers: doc.layers.map((l) =>
              l.id === layer.id ? { ...l, elements: [...l.elements, ...copies] } : l
            ),
          });
        }
      }
      return;
    }

    if (inter.type === 'shape') {
      if (distance(inter.start, inter.current) >= 4 / doc.viewport.zoom) {
        const layer = getActiveLayer();
        if (layer && !layer.locked) {
          let endPt = inter.current;
          if (inter.shiftKey) {
            const dx = endPt.x - inter.start.x;
            const dy = endPt.y - inter.start.y;
            const side = Math.max(Math.abs(dx), Math.abs(dy));
            endPt = {
              x: inter.start.x + Math.sign(dx || 1) * side,
              y: inter.start.y + Math.sign(dy || 1) * side,
            };
          }
          if (toolSettings.shapeKind === 'line' || toolSettings.shapeKind === 'arrow') {
            endPt = snapToPerspective(inter.start, endPt, doc.perspective);
          }
          const { nodes, closed } = buildShapeNodes(
            toolSettings.shapeKind,
            inter.start,
            endPt,
            {
              polygonSides: toolSettings.polygonSides,
              starPoints: toolSettings.starPoints,
              starInnerRatio: toolSettings.starInnerRatio,
            }
          );
          const shapeEl: VectorPathElement = {
            id: createId('path'),
            kind: 'path',
            name: `Form (${toolSettings.shapeKind})`,
            nodes,
            closed,
            fill: closed ? currentFill : { ...currentFill, type: 'none' },
            stroke: currentStroke,
            opacity: 1,
            visible: true,
          };
          const copies = generateSymmetryElements(shapeEl, doc.symmetry);
          onCommitDoc({
            ...doc,
            updatedAt: Date.now(),
            layers: doc.layers.map((l) =>
              l.id === layer.id ? { ...l, elements: [...l.elements, ...copies] } : l
            ),
          });
        }
      }
      return;
    }

    if (inter.type === 'marquee') {
      if (e.type !== 'pointercancel') {
        const minX = Math.min(inter.start.x, inter.current.x);
        const maxX = Math.max(inter.start.x, inter.current.x);
        const minY = Math.min(inter.start.y, inter.current.y);
        const maxY = Math.max(inter.start.y, inter.current.y);
        const minMarqueeWorld = (e.pointerType === 'touch' ? 14 : 6) / doc.viewport.zoom;
        if (Math.hypot(maxX - minX, maxY - minY) >= minMarqueeWorld) {
          const inside: string[] = [];
          for (const l of doc.layers) {
            if (!l.visible || l.locked) continue;
            for (const el of l.elements) {
              if (activeTool === 'node' && el.kind !== 'path') continue;
              const b = getCombinedBounds([el]);
              if (
                b &&
                b.cx >= minX &&
                b.cx <= maxX &&
                b.cy >= minY &&
                b.cy <= maxY
              ) {
                inside.push(el.id);
              }
            }
          }
          const nextIds = inter.additive
            ? Array.from(new Set([...selectedIds, ...inside]))
            : inside;
          onChangeSelectedIds(nextIds);
          setSelectedNodeIds(new Set());
        } else {
          // Tap on empty screen -> release all selected objects and nodes
          setSelectedNodeIds(new Set());
          onChangeSelectedIds([]);
        }
      }
      setCursorWorld(null);
      return;
    }

    if (inter.type === 'marquee-nodes') {
      if (e.type !== 'pointercancel') {
        const minX = Math.min(inter.start.x, inter.current.x);
        const maxX = Math.max(inter.start.x, inter.current.x);
        const minY = Math.min(inter.start.y, inter.current.y);
        const maxY = Math.max(inter.start.y, inter.current.y);
        const minMarqueeWorld = (e.pointerType === 'touch' ? 14 : 6) / doc.viewport.zoom;
        if (Math.hypot(maxX - minX, maxY - minY) >= minMarqueeWorld) {
          const nextNodes = inter.additive ? new Set(selectedNodeIds) : new Set<string>();
          for (const l of doc.layers) {
            if (!l.visible || l.locked) continue;
            for (const el of l.elements) {
              if (!selectedIds.includes(el.id) || el.kind !== 'path') continue;
              for (const c of getPathContours(el)) {
                for (const n of c.nodes) {
                  if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
                    nextNodes.add(n.id);
                  }
                }
              }
            }
          }
          setSelectedNodeIds(nextNodes);
        } else {
          // Tap on screen outside nodes/handles/unselected paths -> release everything selected
          setSelectedNodeIds(new Set());
          onChangeSelectedIds([]);
        }
      }
      setCursorWorld(null);
      return;
    }

    if (inter.type === 'drag-node') {
      const rect = e.currentTarget.getBoundingClientRect();
      const endWorld = screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        doc.viewport,
        { x: size.width / 2, y: size.height / 2 }
      );
      if (
        inter.part === 'anchor' &&
        distance(endWorld, inter.startWorld) < 3 / doc.viewport.zoom
      ) {
        if (inter.toggleOnTapNodeId) {
          const next = new Set(selectedNodeIds);
          next.delete(inter.toggleOnTapNodeId);
          setSelectedNodeIds(next);
        }
        return;
      }
      if (inter.moved) {
        onCommitDoc({ ...doc, updatedAt: Date.now() }, inter.snapshotDoc);
      }
      return;
    }

    if (
      inter.type === 'move-selection' ||
      inter.type === 'scale-selection' ||
      inter.type === 'rotate-selection' ||
      inter.type === 'scale-nodes' ||
      inter.type === 'rotate-nodes' ||
      inter.type === 'pull-tangent'
    ) {
      if (inter.moved) {
        onCommitDoc({ ...doc, updatedAt: Date.now() }, inter.snapshotDoc);
      }
      return;
    }

    if (inter.type === 'erase' && inter.erasedAny) {
      onCommitDoc(inter.workingDoc, inter.snapshotDoc);
    }
  };

  // Direct Selection double-tap: toggle node corner/smooth OR insert node on segment
  const triggerNodeDoubleTapAt = (screen: Point, isTouch: boolean): boolean => {
    if (activeTool !== 'node') return false;

    const rawWorld = screenToWorld(screen, doc.viewport, {
      x: size.width / 2,
      y: size.height / 2,
    });
    const hitTol = getHandleHitToleranceWorld(
      doc.viewport.zoom,
      isTouch,
      toolSettings.handleSettings
    );

    const visiblePaths: VectorPathElement[] = [];
    for (let li = doc.layers.length - 1; li >= 0; li--) {
      const layer = doc.layers[li];
      if (!layer.visible || layer.locked) continue;
      for (let ei = layer.elements.length - 1; ei >= 0; ei--) {
        const el = layer.elements[ei];
        if (el.visible && el.kind === 'path') {
          visiblePaths.push(el);
        }
      }
    }
    const candidatePaths = [
      ...visiblePaths.filter((el) => selectedIds.includes(el.id)),
      ...visiblePaths.filter((el) => !selectedIds.includes(el.id)),
    ];

    const updatePathContour = (
      el: VectorPathElement,
      contourIndex: number,
      updater: (nodes: AnchorNode[], closed: boolean) => AnchorNode[]
    ): VectorPathElement => {
      if (el.subpaths && el.subpaths.length > 0) {
        const nextSubpaths = el.subpaths.map((sp, idx) =>
          idx === contourIndex
            ? { ...sp, nodes: updater(sp.nodes, sp.closed) }
            : sp
        );
        return {
          ...el,
          nodes: nextSubpaths[0].nodes,
          subpaths: nextSubpaths,
        };
      }
      return {
        ...el,
        nodes: updater(el.nodes, el.closed),
      };
    };

    const commitTarget = (
      targetId: string,
      targetNodeId: string,
      contourIndex: number,
      updater: (nodes: AnchorNode[], closed: boolean) => AnchorNode[]
    ) => {
      const nextLayers = doc.layers.map((l) => {
        if (l.locked) return l;
        return {
          ...l,
          elements: l.elements.map((el) =>
            el.id === targetId && el.kind === 'path'
              ? updatePathContour(el, contourIndex, updater)
              : el
          ),
        };
      });
      if (!selectedIds.includes(targetId) || selectedIds.length !== 1) {
        onChangeSelectedIds([targetId]);
      }
      setSelectedNodeIds(new Set([targetNodeId]));
      onCommitDoc({ ...doc, updatedAt: Date.now(), layers: nextLayers });
    };

    // 1. Check existing anchor nodes first (selected paths prioritized)
    for (const pathEl of candidatePaths) {
      const contours = getPathContours(pathEl);
      for (let ci = 0; ci < contours.length; ci++) {
        const contour = contours[ci];
        let bestIdx = -1;
        let bestDist = hitTol;
        for (let ni = 0; ni < contour.nodes.length; ni++) {
          const d = distance(rawWorld, contour.nodes[ni]);
          if (d <= bestDist) {
            bestDist = d;
            bestIdx = ni;
          }
        }
        if (bestIdx !== -1) {
          const targetNode = contour.nodes[bestIdx];
          commitTarget(pathEl.id, targetNode.id, ci, (nodes, closed) =>
            nodes.map((n, i) => {
              if (i !== bestIdx) return n;
              if (n.type === 'smooth') {
                return {
                  ...n,
                  type: 'corner' as const,
                  handleIn: undefined,
                  handleOut: undefined,
                };
              }
              const lenNodes = nodes.length;
              if (lenNodes < 2) {
                return { ...n, type: 'smooth' as const };
              }
              const prev = closed
                ? nodes[(i - 1 + lenNodes) % lenNodes]
                : nodes[Math.max(0, i - 1)];
              const next = closed
                ? nodes[(i + 1) % lenNodes]
                : nodes[Math.min(lenNodes - 1, i + 1)];
              let tx = next.x - prev.x;
              let ty = next.y - prev.y;
              let len = Math.hypot(tx, ty);
              if (len < 1e-3) {
                const other = nodes[(i + 1) % lenNodes];
                tx = -(other.y - n.y);
                ty = other.x - n.x;
                len = Math.hypot(tx, ty) || 1;
              }
              const ux = tx / len;
              const uy = ty / len;
              const d = Math.min(40, len * 0.22);
              return {
                ...n,
                type: 'smooth' as const,
                handleIn: { x: n.x - ux * d, y: n.y - uy * d },
                handleOut: { x: n.x + ux * d, y: n.y + uy * d },
              };
            })
          );
          return true;
        }
      }
    }

    // 2. Check path segments -> insert new node at closest curve point
    let bestSegMatch: {
      pathId: string;
      contourIndex: number;
      segIndex: number;
      t: number;
      dist: number;
    } | null = null;

    for (const pathEl of candidatePaths) {
      const isSelected = selectedIds.includes(pathEl.id);
      const segHitTol = Math.max(
        hitTol,
        (pathEl.stroke.paint.type !== 'none' ? pathEl.stroke.width * 0.5 : 0) +
          4 / doc.viewport.zoom
      );
      const contours = getPathContours(pathEl);
      for (let ci = 0; ci < contours.length; ci++) {
        const contour = contours[ci];
        const segCount = contour.closed
          ? contour.nodes.length
          : contour.nodes.length - 1;
        for (let i = 0; i < segCount; i++) {
          const curr = contour.nodes[i];
          const next = contour.nodes[(i + 1) % contour.nodes.length];
          const c1 = curr.handleOut ?? curr;
          const c2 = next.handleIn ?? next;

          let bestT = 0.5;
          let minD = Infinity;
          const coarseSteps = 32;
          for (let s = 1; s < coarseSteps; s++) {
            const t = s / coarseSteps;
            const pt = evalCubic(curr, c1, c2, next, t);
            const d = distance(rawWorld, pt);
            if (d < minD) {
              minD = d;
              bestT = t;
            }
          }
          const span = 1 / coarseSteps;
          const fineStart = Math.max(0.02, bestT - span);
          const fineEnd = Math.min(0.98, bestT + span);
          for (let f = 0; f <= 12; f++) {
            const t = fineStart + ((fineEnd - fineStart) * f) / 12;
            const pt = evalCubic(curr, c1, c2, next, t);
            const d = distance(rawWorld, pt);
            if (d < minD) {
              minD = d;
              bestT = t;
            }
          }

          if (minD <= segHitTol) {
            if (
              !bestSegMatch ||
              (isSelected && !selectedIds.includes(bestSegMatch.pathId)) ||
              (isSelected === selectedIds.includes(bestSegMatch.pathId) &&
                minD < bestSegMatch.dist)
            ) {
              bestSegMatch = {
                pathId: pathEl.id,
                contourIndex: ci,
                segIndex: i,
                t: bestT,
                dist: minD,
              };
            }
          }
        }
      }
      if (bestSegMatch && isSelected) break;
    }

    if (bestSegMatch) {
      const newNodeId = createId('n');
      const { pathId, contourIndex, segIndex, t } = bestSegMatch;
      commitTarget(pathId, newNodeId, contourIndex, (nodes) => {
        const nextIdx = (segIndex + 1) % nodes.length;
        const curr = nodes[segIndex];
        const next = nodes[nextIdx];
        const isCurved = Boolean(curr.handleOut || next.handleIn);
        const p1 = curr.handleOut ?? curr;
        const p2 = next.handleIn ?? next;

        const q0 = lerpPoint(curr, p1, t);
        const q1 = lerpPoint(p1, p2, t);
        const q2 = lerpPoint(p2, next, t);
        const r0 = lerpPoint(q0, q1, t);
        const r1 = lerpPoint(q1, q2, t);
        const s0 = lerpPoint(r0, r1, t);

        const newNode: AnchorNode = isCurved
          ? {
              id: newNodeId,
              x: s0.x,
              y: s0.y,
              handleIn: r0,
              handleOut: r1,
              type: 'smooth',
            }
          : {
              id: newNodeId,
              x: s0.x,
              y: s0.y,
              type: 'corner',
            };

        const nextNodes = nodes.map((n, idx) => {
          if (!isCurved) return n;
          if (idx === segIndex) return { ...n, handleOut: q0 };
          if (idx === nextIdx) return { ...n, handleIn: q2 };
          return n;
        });
        nextNodes.splice(segIndex + 1, 0, newNode);
        return nextNodes;
      });
      return true;
    }

    return false;
  };

  // Double-click: Finish Pen path OR fallback for Direct Selection double-tap
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (performance.now() - lastDoubleTapHandledAtRef.current < 250) {
      return;
    }
    if (activeTool === 'pen' && penNodes.length >= 2) {
      commitPenPath(false);
      return;
    }
    if (activeTool === 'node') {
      const rect = e.currentTarget.getBoundingClientRect();
      const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      triggerNodeDoubleTapAt(screen, false);
    }
  };

  // Wheel Zoom & Rotation
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const center = { x: size.width / 2, y: size.height / 2 };

    if (e.altKey) {
      const deltaRad = (e.deltaY * 0.15 * Math.PI) / 180;
      onUpdateLiveDoc({
        ...doc,
        viewport: { ...doc.viewport, rotation: doc.viewport.rotation + deltaRad },
      });
      return;
    }

    const worldBefore = screenToWorld(screen, doc.viewport, center);
    const factor = e.deltaY < 0 ? 1.1 : 0.909;
    const nextZoom = Math.max(0.08, Math.min(24, doc.viewport.zoom * factor));

    // Recompute vp.x / vp.y so worldBefore stays anchored under screen cursor
    const cos = Math.cos(doc.viewport.rotation);
    const sin = Math.sin(doc.viewport.rotation);
    const sx = worldBefore.x * nextZoom;
    const sy = worldBefore.y * nextZoom;
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;

    onUpdateLiveDoc({
      ...doc,
      viewport: {
        ...doc.viewport,
        zoom: nextZoom,
        x: screen.x - center.x - rx,
        y: screen.y - center.y - ry,
      },
    });
  };

  const cursorClass =
    spacePressed || activeTool === 'pan'
      ? 'cursor-grab active:cursor-grabbing'
      : activeTool === 'select' || activeTool === 'node'
      ? 'cursor-default'
      : activeTool === 'text'
      ? 'cursor-text'
      : 'cursor-crosshair';

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        if (onDropImage && Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault();
          if (!isDraggingImage) setIsDraggingImage(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsDraggingImage(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingImage(false);
        if (!onDropImage) return;
        const files = Array.from(e.dataTransfer.files);
        const imgFile = files.find((f) => f.type.startsWith('image/'));
        if (imgFile) {
          onDropImage(imgFile);
        }
      }}
      className={`fixed inset-0 z-0 overflow-hidden ${
        doc.background === 'transparent' ? 'checkerboard-bg' : ''
      }`}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        className={`w-full h-full touch-none ${cursorClass}`}
      />

      {isDraggingImage && (
        <div className="fixed inset-4 z-40 pointer-events-none rounded-2xl border-2 border-dashed border-blue-400 bg-blue-500/10 backdrop-blur-[2px] flex items-center justify-center">
          <div className="px-5 py-3 rounded-xl bg-[#1A1C22]/95 border border-blue-500/40 text-sm font-medium text-white shadow-2xl">
            Bild ablegen, um es zur Ebene hinzuzufügen
          </div>
        </div>
      )}

      {/* Inline Text Entry Box */}
      {textDraft && (
        <input
          type="text"
          autoFocus
          placeholder="Text eingeben…"
          value={textDraft.value}
          onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          onBlur={commitTextDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTextDraft();
            } else if (e.key === 'Escape') {
              setTextDraft(null);
            }
          }}
          style={{
            left: textDraft.screen.x,
            top: textDraft.screen.y - toolSettings.fontSize * 0.85,
            fontSize: `${Math.max(14, Math.min(42, toolSettings.fontSize * doc.viewport.zoom))}px`,
          }}
          className="fixed z-30 min-w-[160px] px-2 py-1 bg-[#1A1C22]/90 text-white border border-blue-500 rounded-md shadow-lg focus:outline-none"
        />
      )}

      {/* Contextual Direktauswahl Bar (Node Multi-Select / Density / Close / Corner-Smooth / Delete) */}
      {activeTool === 'node' && (() => {
        const selectedPaths = doc.layers
          .flatMap((l) => (l.visible && !l.locked ? l.elements : []))
          .filter(
            (el): el is VectorPathElement =>
              selectedIds.includes(el.id) && el.kind === 'path'
          );

        if (selectedPaths.length === 0) {
          return (
            <ContextBarShell
              positionClass={contextBarPositionClass}
              className="gap-2 px-3 py-1.5"
            >
              <span className="text-xs text-zinc-300 whitespace-nowrap">
                Direktauswahl: Pfad antippen oder Rahmen ziehen
              </span>
              {onSelectTool && (
                <button
                  type="button"
                  onClick={() => onSelectTool('select')}
                  className="px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Auswahl
                </button>
              )}
            </ContextBarShell>
          );
        }

        const singleEl = selectedPaths.length === 1 ? selectedPaths[0] : null;
        const isSingleNonCompound =
          singleEl !== null && !(singleEl.subpaths && singleEl.subpaths.length > 1);

        const allContours = selectedPaths.flatMap((p) => getPathContours(p));
        const totalNodes = allContours.reduce((acc, c) => acc + c.nodes.length, 0);
        const canReduce = allContours.some(
          (c) => c.nodes.length > (c.closed ? 3 : 2)
        );
        const canIncrease = allContours.some(
          (c) => c.nodes.length >= 2 && c.nodes.length < 400
        );

        const toggleClosed = () => {
          if (!singleEl) return;
          const nextClosed = !singleEl.closed;
          const nextLayers = doc.layers.map((l) => {
            if (l.locked) return l;
            return {
              ...l,
              elements: l.elements.map((el) =>
                el.id === singleEl.id && el.kind === 'path'
                  ? {
                      ...el,
                      closed: nextClosed,
                      fill: nextClosed && el.fill.type === 'none' ? currentFill : el.fill,
                    }
                  : el
              ),
            };
          });
          onCommitDoc({ ...doc, updatedAt: Date.now(), layers: nextLayers });
        };

        const allNodeIds = allContours.flatMap((c) => c.nodes.map((n) => n.id));
        const allNodesSelected =
          allNodeIds.length > 0 && allNodeIds.every((id) => selectedNodeIds.has(id));

        const toggleSelectAllNodes = () => {
          setSelectedNodeIds(allNodesSelected ? new Set() : new Set(allNodeIds));
        };

        const toggleSelectedNodeType = () => {
          if (selectedNodeIds.size === 0) return;
          let hasCorner = false;
          for (const c of allContours) {
            for (const n of c.nodes) {
              if (selectedNodeIds.has(n.id) && n.type === 'corner') {
                hasCorner = true;
                break;
              }
            }
            if (hasCorner) break;
          }
          const targetSmooth = hasCorner;

          const updateContourNodes = (nodes: AnchorNode[], closed: boolean): AnchorNode[] =>
            nodes.map((n, i) => {
              if (!selectedNodeIds.has(n.id)) return n;
              if (!targetSmooth) {
                return {
                  ...n,
                  type: 'corner' as const,
                  handleIn: undefined,
                  handleOut: undefined,
                };
              }
              const prev = closed
                ? nodes[(i - 1 + nodes.length) % nodes.length]
                : nodes[Math.max(0, i - 1)];
              const next = closed
                ? nodes[(i + 1) % nodes.length]
                : nodes[Math.min(nodes.length - 1, i + 1)];
              const tx = next.x - prev.x;
              const ty = next.y - prev.y;
              const len = Math.hypot(tx, ty) || 1;
              const ux = tx / len;
              const uy = ty / len;
              const d = Math.min(40, len * 0.22);
              return {
                ...n,
                type: 'smooth' as const,
                handleIn: { x: n.x - ux * d, y: n.y - uy * d },
                handleOut: { x: n.x + ux * d, y: n.y + uy * d },
              };
            });

          const nextLayers = doc.layers.map((l) => {
            if (l.locked) return l;
            return {
              ...l,
              elements: l.elements.map((el) => {
                if (!selectedIds.includes(el.id) || el.kind !== 'path') return el;
                if (el.subpaths && el.subpaths.length > 0) {
                  const nextSubpaths = el.subpaths.map((sp) => ({
                    ...sp,
                    nodes: updateContourNodes(sp.nodes, sp.closed),
                  }));
                  return { ...el, nodes: nextSubpaths[0].nodes, subpaths: nextSubpaths };
                }
                return { ...el, nodes: updateContourNodes(el.nodes, el.closed) };
              }),
            };
          });
          onCommitDoc({ ...doc, updatedAt: Date.now(), layers: nextLayers });
        };

        const alignSelectedNodes = (axis: 'x' | 'y') => {
          if (selectedNodeIds.size < 2) return;
          let sumX = 0;
          let sumY = 0;
          let count = 0;
          for (const c of allContours) {
            for (const n of c.nodes) {
              if (!selectedNodeIds.has(n.id)) continue;
              sumX += n.x;
              sumY += n.y;
              count += 1;
            }
          }
          if (count < 2) return;
          const targetX = sumX / count;
          const targetY = sumY / count;

          const alignNode = (n: AnchorNode): AnchorNode => {
            if (!selectedNodeIds.has(n.id)) return n;
            const dx = axis === 'x' ? targetX - n.x : 0;
            const dy = axis === 'y' ? targetY - n.y : 0;
            return {
              ...n,
              x: n.x + dx,
              y: n.y + dy,
              handleIn: n.handleIn ? { x: n.handleIn.x + dx, y: n.handleIn.y + dy } : undefined,
              handleOut: n.handleOut ? { x: n.handleOut.x + dx, y: n.handleOut.y + dy } : undefined,
            };
          };

          const nextLayers = doc.layers.map((l) => {
            if (l.locked) return l;
            return {
              ...l,
              elements: l.elements.map((el) => {
                if (!selectedIds.includes(el.id) || el.kind !== 'path') return el;
                if (el.subpaths && el.subpaths.length > 0) {
                  const nextSubpaths = el.subpaths.map((sp) => ({
                    ...sp,
                    nodes: sp.nodes.map(alignNode),
                  }));
                  return { ...el, nodes: nextSubpaths[0].nodes, subpaths: nextSubpaths };
                }
                return { ...el, nodes: el.nodes.map(alignNode) };
              }),
            };
          });
          onCommitDoc({ ...doc, updatedAt: Date.now(), layers: nextLayers });
        };

        return (
          <ContextBarShell
            positionClass={contextBarPositionClass}
            className="gap-1.5 px-2.5 py-1.5"
          >
            <button
              type="button"
              onClick={() => {
                setMultiNodeSelectMode((v) => !v);
                setPullTangentMode(false);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                multiNodeSelectMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/[0.06] text-zinc-300 hover:text-white'
              }`}
              title="Mehrere Knoten per Antippen auswählen"
            >
              + Mehrfach
            </button>
            <button
              type="button"
              onClick={toggleSelectAllNodes}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                allNodesSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/[0.06] text-zinc-300 hover:text-white'
              }`}
              title="Alle Knoten auswählen / abwählen (Strg+A)"
            >
              Alle
            </button>
            <button
              type="button"
              onClick={() => {
                setPullTangentMode((v) => !v);
                setMultiNodeSelectMode(false);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                pullTangentMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/[0.06] text-zinc-300 hover:text-white'
              }`}
              title="Tangenten aus Knoten herausziehen (oder Alt+Ziehen) · In Knoten zurückziehen rastet sie wieder ein"
            >
              Tangente ziehen
            </button>
            <span className="text-xs text-zinc-300 font-mono-tabular whitespace-nowrap px-1">
              {selectedNodeIds.size > 0
                ? `${selectedNodeIds.size}/${totalNodes} Knoten`
                : `${totalNodes} Knoten`}
            </span>
            {onAdjustNodeDensity && (
              <>
                <button
                  type="button"
                  disabled={!canReduce}
                  onClick={() => {
                    setSelectedNodeIds(new Set());
                    onAdjustNodeDensity('fewer');
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] disabled:opacity-35 disabled:pointer-events-none text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  title="Weniger Knoten (Pfad vereinfachen)"
                >
                  − Weniger
                </button>
                <button
                  type="button"
                  disabled={!canIncrease}
                  onClick={() => onAdjustNodeDensity('more')}
                  className="px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] disabled:opacity-35 disabled:pointer-events-none text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  title="Mehr Knoten (Segmente unterteilen)"
                >
                  + Mehr
                </button>
              </>
            )}
            {isSingleNonCompound && (
              <>
                <div className="w-px h-4 bg-white/10 shrink-0" />
                <button
                  type="button"
                  onClick={toggleClosed}
                  className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {singleEl.closed ? 'Kontur öffnen' : 'Kontur schließen'}
                </button>
              </>
            )}
            {selectedNodeIds.size > 0 && (
              <>
                <div className="w-px h-4 bg-white/10 shrink-0" />
                <button
                  type="button"
                  onClick={toggleSelectedNodeType}
                  className="px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  title="Ausgewählte Knoten zwischen Ecke und Glatt umschalten"
                >
                  Ecke / Glatt
                </button>
                {selectedNodeIds.size >= 2 && (
                  <>
                    <button
                      type="button"
                      onClick={() => alignSelectedNodes('x')}
                      className="px-2 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      title="Ausgewählte Knoten vertikal auf gleiche X-Linie ausrichten"
                    >
                      X=
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelectedNodes('y')}
                      className="px-2 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      title="Ausgewählte Knoten horizontal auf gleiche Y-Linie ausrichten"
                    >
                      Y=
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={deleteSelectedNodes}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600/85 hover:bg-red-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                  title="Ausgewählte Knoten löschen (Entf)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Löschen</span>
                </button>
              </>
            )}
            {selectedNodeIds.size === 0 && selectedIds.length > 0 && onDeleteSelection && (
              <>
                <div className="w-px h-4 bg-white/10 shrink-0" />
                <button
                  type="button"
                  onClick={onDeleteSelection}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600/85 hover:bg-red-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                  title="Ausgewählte Objekte löschen (Entf)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Auswahl löschen</span>
                </button>
              </>
            )}
            {onChangeToolSettings && (
              <>
                <div className="w-px h-4 bg-white/10 shrink-0" />
                {selectedNodeIds.size >= 2 && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangeToolSettings({
                        handleSettings: {
                          ...toolSettings.handleSettings,
                          lockAspectRatio: !toolSettings.handleSettings.lockAspectRatio,
                        },
                      })
                    }
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      toolSettings.handleSettings.lockAspectRatio
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/[0.08] hover:bg-white/[0.16] text-zinc-200'
                    }`}
                    title="Seitenverhältnis / Form beim Vergrößern & Verkleinern beibehalten (Umschalt = temporär wechseln)"
                  >
                    {toolSettings.handleSettings.lockAspectRatio ? (
                      <Lock className="w-3 h-3" />
                    ) : (
                      <Unlock className="w-3 h-3" />
                    )}
                    <span>Form beibehalten</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const order: BezierTangentMode[] = ['aligned', 'symmetrical', 'free'];
                    const cur = toolSettings.handleSettings.tangentMode;
                    const next = order[(order.indexOf(cur) + 1) % order.length];
                    onChangeToolSettings({
                      handleSettings: {
                        ...toolSettings.handleSettings,
                        tangentMode: next,
                      },
                    });
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  title="Bézier-Tangenten-Verhalten umschalten (Alt = temporär frei)"
                >
                  Tangente:{' '}
                  {toolSettings.handleSettings.tangentMode === 'symmetrical'
                    ? 'Symm.'
                    : toolSettings.handleSettings.tangentMode === 'free'
                    ? 'Frei'
                    : 'Gekoppelt'}
                </button>
              </>
            )}
            {onOpenHandleSettings && (
              <button
                type="button"
                onClick={onOpenHandleSettings}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] text-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                title="Anfasser-Einstellungen öffnen"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Anfasser</span>
              </button>
            )}
          </ContextBarShell>
        );
      })()}

      {/* Contextual Pen Path Action Bar */}
      {activeTool === 'pen' && penNodes.length > 0 && (
        <ContextBarShell
          positionClass={contextBarPositionClass}
          className="gap-2 px-3 py-1.5"
        >
          <span className="text-xs text-zinc-300 font-mono-tabular whitespace-nowrap">
            {penNodes.length} Knoten
          </span>
          {penNodes.length >= 3 && (
            <button
              type="button"
              onClick={() => commitPenPath(true)}
              className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              Schließen
            </button>
          )}
          <button
            type="button"
            onClick={() => commitPenPath(false)}
            className="px-2.5 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            Fertig (Enter)
          </button>
          <button
            type="button"
            onClick={() => {
              setPenNodes([]);
              setPenConnectStart(null);
            }}
            className="px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-white rounded-lg transition-colors whitespace-nowrap"
          >
            Abbrechen
          </button>
        </ContextBarShell>
      )}

      {/* Contextual Auswahl & Kombinieren Action Bar */}
      {activeTool === 'select' && (() => {
        const selectedPaths = doc.layers
          .flatMap((l) => (l.visible ? l.elements : []))
          .filter(
            (el): el is VectorPathElement =>
              selectedIds.includes(el.id) && el.kind === 'path'
          );
        const canSplit =
          selectedPaths.length === 1 &&
          (selectedPaths[0].subpaths?.length ?? 0) > 1;

        return (
          <ContextBarShell
            positionClass={contextBarPositionClass}
            className="gap-1.5 px-2.5 py-1.5"
          >
            <button
              type="button"
              onClick={() => setMultiSelectMode((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                multiSelectMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/[0.06] text-zinc-300 hover:text-white'
              }`}
              title="Mehrfachauswahl per Antippen umschalten"
            >
              + Mehrfach
            </button>

            {onChangeToolSettings && (
              <button
                type="button"
                onClick={() =>
                  onChangeToolSettings({
                    handleSettings: {
                      ...toolSettings.handleSettings,
                      lockAspectRatio: !toolSettings.handleSettings.lockAspectRatio,
                    },
                  })
                }
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  toolSettings.handleSettings.lockAspectRatio
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/[0.06] text-zinc-300 hover:text-white'
                }`}
                title="Seitenverhältnis / Form beim Vergrößern & Verkleinern beibehalten (Umschalt = temporär wechseln)"
              >
                {toolSettings.handleSettings.lockAspectRatio ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <Unlock className="w-3 h-3" />
                )}
                <span>Form beibehalten</span>
              </button>
            )}

            {selectedPaths.length >= 1 && onSelectTool && (
              <button
                type="button"
                onClick={() => onSelectTool('node')}
                className="px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-blue-600 text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                title="Zum Direktauswahl-Werkzeug wechseln (A)"
              >
                Direktauswahl
              </button>
            )}

            {selectedIds.length > 0 && (
              <>
                {onCutSelection && (
                  <button
                    type="button"
                    onClick={onCutSelection}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    title="Auswahl ausschneiden (Strg+X)"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Ausschneiden</span>
                  </button>
                )}
                {onCopySelection && (
                  <button
                    type="button"
                    onClick={onCopySelection}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    title="Auswahl kopieren (Strg+C)"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Kopieren</span>
                  </button>
                )}
              </>
            )}

            {canPaste && onPasteSelection && (
              <button
                type="button"
                onClick={onPasteSelection}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-600/85 hover:bg-blue-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                title="Zwischenablage einfügen (Strg+V)"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Einfügen</span>
              </button>
            )}

            {selectedIds.length > 0 && onDeleteSelection && (
              <button
                type="button"
                onClick={onDeleteSelection}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600/85 hover:bg-red-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                title="Ausgewählte Objekte löschen (Entf)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Auswahl löschen</span>
              </button>
            )}

            {selectedPaths.length >= 2 && onCombinePaths && (
              <>
                <div className="w-px h-4 bg-white/10 shrink-0" />
                {(
                  [
                    { op: 'union', label: 'Vereinen' },
                    { op: 'subtract', label: 'Abziehen' },
                    { op: 'intersect', label: 'Schnitt' },
                    { op: 'exclude', label: 'Ausschließen' },
                    { op: 'combine', label: 'Kombinieren' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.op}
                    type="button"
                    onClick={() => onCombinePaths(item.op)}
                    className="px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-blue-600 text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {item.label}
                  </button>
                ))}
              </>
            )}

            {canSplit && onSplitCompoundPath && (
              <>
                <div className="w-px h-4 bg-white/10 shrink-0" />
                <button
                  type="button"
                  onClick={onSplitCompoundPath}
                  className="px-2.5 py-1 text-xs font-medium bg-white/[0.08] hover:bg-amber-600 text-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Trennen
                </button>
              </>
            )}
            {onOpenHandleSettings && (
              <>
                <div className="w-px h-4 bg-white/10 shrink-0" />
                <button
                  type="button"
                  onClick={onOpenHandleSettings}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.16] text-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  title="Anfasser-Einstellungen öffnen"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Anfasser</span>
                </button>
              </>
            )}
          </ContextBarShell>
        );
      })()}

      {/* Contextual Stift-Präzision Bar (Fein / Normal / Grob) */}
      {activeTool === 'brush' && onChangeToolSettings && (
        <ContextBarShell
          positionClass={contextBarPositionClass}
          className="gap-1 px-2 py-1.5"
        >
          <span className="text-[11px] font-medium text-zinc-400 px-1.5 whitespace-nowrap">
            Stift:
          </span>
          {(
            [
              { id: 'fine', label: 'Fein', smoothing: 25 },
              { id: 'normal', label: 'Normal', smoothing: 55 },
              { id: 'coarse', label: 'Grob', smoothing: 85 },
            ] as Array<{ id: PencilPrecision; label: string; smoothing: number }>
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                onChangeToolSettings({ pencilMode: m.id, smoothing: m.smoothing })
              }
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                toolSettings.pencilMode === m.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/[0.06] text-zinc-300 hover:text-white'
              }`}
              title={
                m.id === 'fine'
                  ? 'Feiner Detail-Modus (mehr Punkte, exakte Linien)'
                  : m.id === 'coarse'
                  ? 'Grober Skizzen-Modus (weiche, vereinfachte Kurven)'
                  : 'Ausgewogener Standard-Modus'
              }
            >
              {m.label}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 shrink-0 mx-0.5" />
          <button
            type="button"
            onClick={() =>
              onChangeToolSettings({
                autoCloseBrushPath: !toolSettings.autoCloseBrushPath,
              })
            }
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              toolSettings.autoCloseBrushPath
                ? 'bg-blue-600 text-white'
                : 'bg-white/[0.06] text-zinc-300 hover:text-white'
            }`}
            title="Gezeichnete Stift-Pfade nach dem Loslassen immer automatisch schließen"
          >
            Auto-Schließen
          </button>
          {onToggleFillOnlyBrush && (
            <button
              type="button"
              onClick={onToggleFillOnlyBrush}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                isFillOnlyMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/[0.06] text-zinc-300 hover:text-white'
              }`}
              title="Mit dem Stift nur geschlossene Füllformen ohne Kontur zeichnen"
            >
              Nur Füllung
            </button>
          )}
        </ContextBarShell>
      )}

      {/* Mobile Compact Zoom Controls */}
      {onZoomCanvas && !isFullscreen && (
        <div className={`sm:hidden fixed ${mobileZoomPositionClass} left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 px-1.5 py-1 rounded-xl bg-[#1A1C22]/92 backdrop-blur-md border border-white/[0.08] shadow-xl`}>
          <button
            type="button"
            onClick={() => onZoomCanvas(0.8)}
            className="p-1.5 text-zinc-300 hover:text-white rounded-lg transition-colors"
            title="Herauszoomen"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onResetView?.()}
            className="px-1.5 py-0.5 text-[11px] font-mono-tabular text-zinc-200 hover:text-white whitespace-nowrap"
            title="Ansicht zurücksetzen (Zoom & Drehung)"
          >
            {Math.round(doc.viewport.zoom * 100)}%
            {Math.abs(doc.viewport.rotation) > 0.005
              ? ` · ${Math.round(((doc.viewport.rotation * 180) / Math.PI) % 360) || 0}°`
              : ''}
          </button>
          <button
            type="button"
            onClick={() => onZoomCanvas(1.25)}
            className="p-1.5 text-zinc-300 hover:text-white rounded-lg transition-colors"
            title="Hineinzoomen"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Subtle Bottom-Left Coordinate Readout */}
      {cursorWorld && (
        <div className="hidden sm:block fixed bottom-3 left-3 z-10 pointer-events-none px-2.5 py-1 rounded-lg bg-[#1A1C22]/75 border border-white/[0.06] text-[11px] font-mono-tabular text-zinc-400">
          X {Math.round(cursorWorld.x)} · Y {Math.round(cursorWorld.y)}
        </div>
      )}
    </div>
  );
};
