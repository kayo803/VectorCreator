import React, { useRef, useState } from 'react';
import {
  ArrowRightLeft,
  ArrowUpRight,
  Circle,
  Eraser,
  Hand,
  Hexagon,
  Minus,
  PaintBucket,
  PenTool,
  Pencil,
  Pipette,
  Shapes,
  Square,
  Star,
  Trash2,
  Type,
} from 'lucide-react';
import { PaintStyle, ShapeKind, ToolRailPosition, ToolType } from '../types/vector';
import {
  useClampedToolbarPosition,
  useToolbarLongPress,
} from './ToolbarDragOverlay';

const SelectArrowIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M5.5 3.5L19 12.2l-5.8 1.5-2.6 5.6L5.5 3.5z" />
  </svg>
);

const DirectSelectArrowIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinejoin="round"
    strokeLinecap="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M5 3.5L17.5 11.8l-5.3 1.4-2.4 5.3L5 3.5z" />
    <rect x="15.5" y="15.5" width="4.5" height="4.5" rx="0.8" fill="currentColor" stroke="none" />
  </svg>
);

interface ToolRailProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  shapeKind: ShapeKind;
  onSelectShapeKind: (kind: ShapeKind) => void;
  fill: PaintStyle;
  stroke: PaintStyle;
  paintTarget: 'fill' | 'stroke';
  onSelectPaintTarget: (target: 'fill' | 'stroke') => void;
  onSwapFillStroke: () => void;
  canDelete?: boolean;
  onDeleteSelection?: () => void;
  position?: ToolRailPosition;
  positionClass?: string;
  topOffsetClass?: string;
}

const TOOLS: Array<{
  id: ToolType;
  label: string;
  shortcut: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'select', label: 'Auswahl-Werkzeug', shortcut: 'V', icon: SelectArrowIcon },
  { id: 'node', label: 'Direktauswahl-Werkzeug', shortcut: 'A', icon: DirectSelectArrowIcon },
  { id: 'brush', label: 'Freihand-Pinsel', shortcut: 'B', icon: Pencil },
  { id: 'pen', label: 'Bézier-Feder', shortcut: 'P', icon: PenTool },
  { id: 'shape', label: 'Formen', shortcut: 'S', icon: Shapes },
  { id: 'fill', label: 'Fülleimer', shortcut: 'G', icon: PaintBucket },
  { id: 'eraser', label: 'Vektor-Radierer', shortcut: 'E', icon: Eraser },
  { id: 'eyedropper', label: 'Pipette', shortcut: 'I', icon: Pipette },
  { id: 'text', label: 'Text', shortcut: 'T', icon: Type },
  { id: 'pan', label: 'Leinwand verschieben', shortcut: 'H', icon: Hand },
];

const SHAPE_OPTIONS: Array<{
  id: ShapeKind;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'rect', label: 'Rechteck', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'polygon', label: 'Polygon', icon: Hexagon },
  { id: 'star', label: 'Stern', icon: Star },
  { id: 'line', label: 'Linie', icon: Minus },
  { id: 'arrow', label: 'Pfeil', icon: ArrowUpRight },
];

function paintPreviewCss(paint: PaintStyle): string {
  if (paint.type === 'none') return 'transparent';
  if (paint.type === 'solid') return paint.color;
  return `linear-gradient(${paint.gradient.angle}deg, ${paint.gradient.stops[0].color}, ${paint.gradient.stops[1].color})`;
}

export const ToolRail: React.FC<ToolRailProps> = ({
  activeTool,
  onSelectTool,
  shapeKind,
  onSelectShapeKind,
  fill,
  stroke,
  paintTarget,
  onSelectPaintTarget,
  onSwapFillStroke,
  canDelete = false,
  onDeleteSelection,
  position = 'left',
  positionClass,
  topOffsetClass = 'top-[4.25rem] sm:top-18',
}) => {
  const [shapesFlyoutOpen, setShapesFlyoutOpen] = useState(false);
  const isHorizontal = position === 'top' || position === 'bottom';

  const resolvedPosClass =
    positionClass ??
    (position === 'right'
      ? `right-2.5 sm:right-3 ${topOffsetClass}`
      : position === 'top'
      ? `${topOffsetClass} left-1/2 -translate-x-1/2`
      : position === 'bottom'
      ? 'bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2'
      : `left-2.5 sm:left-3 ${topOffsetClass}`);

  const flyoutPositionClass =
    position === 'top'
      ? 'absolute top-full mt-2 left-1/2 -translate-x-1/2'
      : position === 'bottom'
      ? 'absolute bottom-full mb-2 left-1/2 -translate-x-1/2'
      : position === 'right'
      ? 'absolute right-full mr-2 top-36'
      : 'absolute left-full ml-2 top-36';

  const asideRef = useRef<HTMLElement>(null);
  const { isDraggingThis, customPosition, dragProps } =
    useToolbarLongPress('toolRail');
  useClampedToolbarPosition(asideRef, customPosition);

  const effectiveFlyoutClass = customPosition
    ? isHorizontal
      ? customPosition.y > (typeof window !== 'undefined' ? window.innerHeight * 0.55 : 400)
        ? 'absolute bottom-full mb-2 left-1/2 -translate-x-1/2'
        : 'absolute top-full mt-2 left-1/2 -translate-x-1/2'
      : customPosition.x > (typeof window !== 'undefined' ? window.innerWidth * 0.55 : 400)
      ? 'absolute right-full mr-2 top-36'
      : 'absolute left-full ml-2 top-36'
    : flyoutPositionClass;

  return (
    <aside
      ref={asideRef}
      {...dragProps}
      className={`fixed ${customPosition ? '' : resolvedPosClass} z-20 flex items-start select-none`}
    >
      <div
        className={`flex items-center gap-1 p-1.5 rounded-xl bg-[#1A1C22]/92 backdrop-blur-md border shadow-xl studio-scroll transition-colors ${
          isDraggingThis ? 'border-blue-400/70 ring-2 ring-blue-500/35' : 'border-white/[0.08]'
        } ${
          isHorizontal
            ? 'flex-row max-w-[calc(100vw-20px)] overflow-x-auto'
            : 'flex-col max-h-[calc(100vh-5.5rem)] overflow-y-auto'
        }`}
      >
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                if (tool.id === 'shape') {
                  if (activeTool === 'shape') {
                    setShapesFlyoutOpen((v) => !v);
                  } else {
                    onSelectTool('shape');
                    setShapesFlyoutOpen(true);
                  }
                } else {
                  setShapesFlyoutOpen(false);
                  onSelectTool(tool.id);
                }
              }}
              className={`relative w-10 h-10 shrink-0 rounded-lg flex items-center justify-center transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title={`${tool.label} (${tool.shortcut})`}
            >
              <Icon className="w-[18px] h-[18px]" />
              {tool.id === 'shape' && (
                <span className="absolute bottom-1 right-1 w-1.5 h-1.5 border-r border-b border-current opacity-70" />
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setShapesFlyoutOpen(false);
            onDeleteSelection?.();
          }}
          disabled={!canDelete || !onDeleteSelection}
          className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center transition-colors text-zinc-400 hover:text-red-400 hover:bg-red-500/15 disabled:opacity-30 disabled:pointer-events-none"
          title="Auswahl löschen (Entf)"
          aria-label="Auswahl löschen"
        >
          <Trash2 className="w-[18px] h-[18px]" />
        </button>

        <div
          className={
            isHorizontal
              ? 'h-7 w-px bg-white/10 mx-1 shrink-0'
              : 'w-7 h-px bg-white/10 my-1 shrink-0'
          }
        />

        {/* Fill / Stroke Dual Swatch Control */}
        <div className="relative w-10 h-11 shrink-0 flex items-center justify-center">
          {/* Fill swatch */}
          <button
            type="button"
            onClick={() => onSelectPaintTarget('fill')}
            title="Füllfarbe bearbeiten"
            className={`absolute top-0.5 left-1 w-6 h-6 rounded-md border-2 transition-transform ${
              paintTarget === 'fill'
                ? 'border-blue-400 z-10 scale-105'
                : 'border-white/30 z-0'
            } ${fill.type === 'none' ? 'checkerboard-bg' : ''}`}
            style={{
              background: fill.type === 'none' ? undefined : paintPreviewCss(fill),
            }}
          >
            {fill.type === 'none' && (
              <span className="block w-full h-0.5 bg-red-500 rotate-45 translate-y-2.5" />
            )}
          </button>

          {/* Stroke swatch */}
          <button
            type="button"
            onClick={() => onSelectPaintTarget('stroke')}
            title="Konturfarbe bearbeiten"
            className={`absolute bottom-0.5 right-1 w-6 h-6 rounded-md border-2 transition-transform flex items-center justify-center bg-[#1A1C22] ${
              paintTarget === 'stroke'
                ? 'border-blue-400 z-10 scale-105'
                : 'border-white/30 z-0'
            }`}
          >
            <span
              className="relative w-4 h-4 rounded-sm border-[3px] flex items-center justify-center overflow-hidden"
              style={{
                borderColor:
                  stroke.type === 'none'
                    ? 'rgba(255,255,255,0.22)'
                    : stroke.type === 'solid'
                    ? stroke.color
                    : stroke.gradient.stops[0].color,
              }}
            >
              {stroke.type === 'none' && (
                <span className="block w-5 h-0.5 bg-red-500 rotate-45" />
              )}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onSwapFillStroke}
          className="w-9 h-7 shrink-0 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Füllung & Kontur tauschen (X)"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Shapes Flyout */}
      {shapesFlyoutOpen && activeTool === 'shape' && (
        <div className={`${effectiveFlyoutClass} p-1.5 rounded-xl bg-[#1A1C22]/95 backdrop-blur-md border border-white/[0.08] shadow-xl grid grid-cols-2 gap-1 w-36`}>
          {SHAPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = shapeKind === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onSelectShapeKind(opt.id);
                  setShapesFlyoutOpen(false);
                }}
                className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="whitespace-nowrap">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
};
