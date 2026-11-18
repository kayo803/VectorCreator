import React from 'react';
import { ArrowLeftRight, RotateCcw } from 'lucide-react';
import {
  ContextBarPosition,
  CornerPosition,
  InspectorPosition,
  ToolbarCustomPositions,
  ToolbarLayoutSettings,
  ToolRailPosition,
  TopBarPosition,
} from '../types/vector';
import { DEFAULT_TOOLBAR_LAYOUT } from '../utils/preferences';

interface ToolbarLayoutControlsProps {
  toolbarLayout: ToolbarLayoutSettings;
  onChangeToolbarLayout: (patch: Partial<ToolbarLayoutSettings>) => void;
  onResetToolbarLayout?: () => void;
}

export const ToolbarLayoutControls: React.FC<ToolbarLayoutControlsProps> = ({
  toolbarLayout,
  onChangeToolbarLayout,
  onResetToolbarLayout,
}) => {
  const custom = toolbarLayout.customPositions;
  const hasCustomPositions = Boolean(custom && Object.keys(custom).length > 0);

  const isDefaultLayout =
    !hasCustomPositions &&
    toolbarLayout.topBar === DEFAULT_TOOLBAR_LAYOUT.topBar &&
    toolbarLayout.toolRail === DEFAULT_TOOLBAR_LAYOUT.toolRail &&
    toolbarLayout.inspector === DEFAULT_TOOLBAR_LAYOUT.inspector &&
    toolbarLayout.contextBar === DEFAULT_TOOLBAR_LAYOUT.contextBar &&
    toolbarLayout.fullscreenBar === DEFAULT_TOOLBAR_LAYOUT.fullscreenBar;

  const withoutCustom = (
    keys: Array<keyof ToolbarCustomPositions>
  ): ToolbarCustomPositions | undefined => {
    if (!custom) return undefined;
    const next: ToolbarCustomPositions = { ...custom };
    for (const k of keys) {
      delete next[k];
    }
    return Object.keys(next).length > 0 ? next : undefined;
  };

  const swapSides = () => {
    const nextInspector: InspectorPosition =
      toolbarLayout.inspector === 'right' ? 'left' : 'right';
    const nextToolRail: ToolRailPosition =
      toolbarLayout.toolRail === 'left'
        ? 'right'
        : toolbarLayout.toolRail === 'right'
        ? 'left'
        : toolbarLayout.toolRail;
    const nextFullscreenBar: CornerPosition =
      toolbarLayout.fullscreenBar === 'top-right'
        ? 'top-left'
        : toolbarLayout.fullscreenBar === 'top-left'
        ? 'top-right'
        : toolbarLayout.fullscreenBar === 'bottom-right'
        ? 'bottom-left'
        : 'bottom-right';
    onChangeToolbarLayout({
      inspector: nextInspector,
      toolRail: nextToolRail,
      fullscreenBar: nextFullscreenBar,
      customPositions: withoutCustom(['inspector', 'toolRail', 'fullscreenBar']),
    });
  };

  const renderSectionHeader = (
    label: string,
    key: keyof ToolbarCustomPositions
  ) => {
    const pt = custom?.[key];
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="block text-[11px] text-zinc-400">{label}</span>
        {pt && (
          <button
            type="button"
            onClick={() =>
              onChangeToolbarLayout({ customPositions: withoutCustom([key]) })
            }
            className="text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
            title="Freie Position aufheben und wieder andocken"
          >
            Frei ({pt.x}, {pt.y}) · Andocken
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-200">Toolbar-Platzierung</h3>
        {onResetToolbarLayout && (
          <button
            type="button"
            disabled={isDefaultLayout}
            onClick={onResetToolbarLayout}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors"
            title="Toolbar-Positionen auf Standard zurücksetzen"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Standard</span>
          </button>
        )}
      </div>

      <p className="text-[11px] text-zinc-400 leading-snug">
        Tipp: Halte eine Leiste kurz gedrückt und ziehe sie frei an jede beliebige Stelle.
      </p>

      <button
        type="button"
        onClick={swapSides}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-[#111215] hover:bg-white/[0.06] border border-white/[0.07] text-[11px] font-medium text-zinc-200 hover:text-white transition-colors"
        title="Werkzeugleiste, Studio-Panel und Vollbild-Menü zwischen Links und Rechts tauschen"
      >
        <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
        <span>Seiten tauschen (Links ↔ Rechts)</span>
      </button>

      {/* TopBar position */}
      <div className="space-y-1">
        {renderSectionHeader('Hauptleiste (Menü & Zoom)', 'topBar')}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111215]">
          {(
            [
              { id: 'top', label: 'Oben' },
              { id: 'bottom', label: 'Unten' },
            ] as Array<{ id: TopBarPosition; label: string }>
          ).map((opt) => {
            const active = !custom?.topBar && toolbarLayout.topBar === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  onChangeToolbarLayout({
                    topBar: opt.id,
                    customPositions: withoutCustom(['topBar']),
                  })
                }
                className={`py-1 text-[11px] font-medium rounded-md transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ToolRail position */}
      <div className="space-y-1">
        {renderSectionHeader('Werkzeugleiste', 'toolRail')}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#111215]">
          {(
            [
              { id: 'left', label: 'Links' },
              { id: 'right', label: 'Rechts' },
              { id: 'top', label: 'Oben' },
              { id: 'bottom', label: 'Unten' },
            ] as Array<{ id: ToolRailPosition; label: string }>
          ).map((opt) => {
            const active = !custom?.toolRail && toolbarLayout.toolRail === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  onChangeToolbarLayout({
                    toolRail: opt.id,
                    customPositions: withoutCustom(['toolRail']),
                  })
                }
                className={`py-1 text-[11px] font-medium rounded-md transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inspector position */}
      <div className="space-y-1">
        {renderSectionHeader('Studio-Panel (Stil / Ebenen)', 'inspector')}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111215]">
          {(
            [
              { id: 'left', label: 'Links' },
              { id: 'right', label: 'Rechts' },
            ] as Array<{ id: InspectorPosition; label: string }>
          ).map((opt) => {
            const active =
              !custom?.inspector && toolbarLayout.inspector === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  onChangeToolbarLayout({
                    inspector: opt.id,
                    customPositions: withoutCustom(['inspector']),
                  })
                }
                className={`py-1 text-[11px] font-medium rounded-md transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Context Action Bar position */}
      <div className="space-y-1">
        {renderSectionHeader('Aktionsleiste (Auswahl / Stift)', 'contextBar')}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111215]">
          {(
            [
              { id: 'bottom', label: 'Unten' },
              { id: 'top', label: 'Oben' },
            ] as Array<{ id: ContextBarPosition; label: string }>
          ).map((opt) => {
            const active =
              !custom?.contextBar && toolbarLayout.contextBar === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  onChangeToolbarLayout({
                    contextBar: opt.id,
                    customPositions: withoutCustom(['contextBar']),
                  })
                }
                className={`py-1 text-[11px] font-medium rounded-md transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fullscreen bar corner */}
      <div className="space-y-1">
        {renderSectionHeader('Vollbild-Steuerung', 'fullscreenBar')}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111215]">
          {(
            [
              { id: 'top-left', label: 'Oben links' },
              { id: 'top-right', label: 'Oben rechts' },
              { id: 'bottom-left', label: 'Unten links' },
              { id: 'bottom-right', label: 'Unten rechts' },
            ] as Array<{ id: CornerPosition; label: string }>
          ).map((opt) => {
            const active =
              !custom?.fullscreenBar && toolbarLayout.fullscreenBar === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  onChangeToolbarLayout({
                    fullscreenBar: opt.id,
                    customPositions: withoutCustom(['fullscreenBar']),
                  })
                }
                className={`py-1 text-[11px] font-medium rounded-md transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
