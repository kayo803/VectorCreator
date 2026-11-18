import React, { useRef } from 'react';
import {
  FolderOpen,
  HelpCircle,
  History,
  Maximize2,
  Minimize2,
  PanelRight,
  Redo2,
  RotateCcw,
  RotateCw,
  Settings,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  TopBarPosition,
  ViewportTransform,
} from '../types/vector';
import {
  useClampedToolbarPosition,
  useToolbarLongPress,
} from './ToolbarDragOverlay';

interface TopBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  viewport: ViewportTransform;
  onResetView: () => void;
  onZoomCanvas: (factor: number) => void;
  onRotateCanvas: (deltaDeg: number) => void;
  onOpenProjects: () => void;
  onOpenShortcuts: () => void;
  onOpenToolbarSettings?: () => void;
  inspectorOpen?: boolean;
  onToggleInspector?: () => void;
  position?: TopBarPosition;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onOpenHistory?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  viewport,
  onResetView,
  onZoomCanvas,
  onRotateCanvas,
  onOpenProjects,
  onOpenShortcuts,
  onOpenToolbarSettings,
  inspectorOpen = false,
  onToggleInspector,
  position = 'top',
  isFullscreen = false,
  onToggleFullscreen,
  onOpenHistory,
}) => {
  const zoomPct = Math.round(viewport.zoom * 100);
  const rotDeg = Math.round(((viewport.rotation * 180) / Math.PI) % 360) || 0;
  const verticalPosClass =
    position === 'bottom' ? 'bottom-2.5 sm:bottom-3' : 'top-2.5 sm:top-3';
  const headerRef = useRef<HTMLElement>(null);
  const { isDraggingThis, customPosition, dragProps } = useToolbarLongPress('topBar');
  useClampedToolbarPosition(headerRef, customPosition);

  return (
    <header
      ref={headerRef}
      {...dragProps}
      className={`fixed ${
        customPosition
          ? 'w-fit max-w-[calc(100vw-16px)]'
          : `${verticalPosClass} left-2.5 right-2.5 sm:left-3 sm:right-3`
      } z-30 h-12 px-2.5 sm:px-3 rounded-xl bg-[#1A1C22]/92 backdrop-blur-md border shadow-xl flex items-center justify-between gap-2 sm:gap-4 select-none touch-none transition-colors ${
        isDraggingThis ? 'border-blue-400/70 ring-2 ring-blue-500/35' : 'border-white/[0.08]'
      }`}
    >
      {/* Left Zone: Project */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">

        <button
          type="button"
          onClick={onOpenProjects}
          className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors whitespace-nowrap shrink-0"
          title="Projekte"
        >
          <FolderOpen className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">Projekte</span>
        </button>

        {/* Mobile Undo / Redo */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white disabled:opacity-30"
            title="Rückgängig"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white disabled:opacity-30"
            title="Wiederholen"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Zone: History */}
      <div className="hidden md:flex items-center gap-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Rückgängig (Strg+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Wiederholen (Strg+Umschalt+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Verlauf & Historie bearbeiten"
            aria-label="Verlauf bearbeiten"
          >
            <History className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Right Zone: Viewport & Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="hidden sm:flex items-center bg-[#111215] border border-white/[0.07] rounded-lg px-1 py-0.5">
          <button
            type="button"
            onClick={() => onZoomCanvas(0.8)}
            className="p-1 text-zinc-400 hover:text-white rounded transition-colors"
            title="Herauszoomen"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onZoomCanvas(1.25)}
            className="p-1 text-zinc-400 hover:text-white rounded transition-colors"
            title="Hineinzoomen"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onResetView}
            className="px-2 py-0.5 text-xs font-mono-tabular text-zinc-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
            title="Ansicht zurücksetzen (Zoom & Drehung)"
          >
            {zoomPct}% · {rotDeg}°
          </button>
          <button
            type="button"
            onClick={() => onRotateCanvas(-15)}
            className="p-1 text-zinc-400 hover:text-white rounded transition-colors"
            title="Leinwand -15° drehen"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRotateCanvas(15)}
            className="p-1 text-zinc-400 hover:text-white rounded transition-colors"
            title="Leinwand +15° drehen"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenShortcuts}
          className="hidden sm:inline-flex p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Tastaturkürzel"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {onOpenToolbarSettings && (
          <button
            type="button"
            onClick={onOpenToolbarSettings}
            className="inline-flex p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
            title="Einstellungen & Toolbar-Platzierung"
            aria-label="Einstellungen"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {onToggleInspector && (
          <button
            type="button"
            onClick={onToggleInspector}
            className={`inline-flex items-center gap-1.5 p-1.5 sm:px-2 sm:py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              inspectorOpen
                ? 'bg-white/15 text-white'
                : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Studio-Panel ein-/ausblenden"
            aria-label="Studio"
          >
            <PanelRight className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden lg:inline">Studio</span>
          </button>
        )}

        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className={`inline-flex items-center gap-1.5 p-2 rounded-lg transition-colors shrink-0 ${
              isFullscreen
                ? 'bg-blue-600 text-white'
                : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
            }`}
            title={isFullscreen ? 'Vollbild minimieren (F)' : 'Vollbild aktivieren (F)'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </header>
  );
};
