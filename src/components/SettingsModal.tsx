import React, { useState } from 'react';
import {
  Compass,
  Grid,
  History,
  Magnet,
  RotateCcw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import {
  GridConfig,
  PerspectiveConfig,
  SymmetryConfig,
  ToolbarLayoutSettings,
} from '../types/vector';
import { PWAInstallButton } from './PWAInstallButton';
import { ToolbarLayoutControls } from './ToolbarLayoutControls';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  toolbarLayout: ToolbarLayoutSettings;
  onChangeToolbarLayout: (patch: Partial<ToolbarLayoutSettings>) => void;
  onResetToolbarLayout: () => void;
  symmetry: SymmetryConfig;
  perspective: PerspectiveConfig;
  grid: GridConfig;
  onToggleSymmetry: () => void;
  onTogglePerspective: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onResetAllSettings?: () => void;
  onOpenHistory?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  toolbarLayout,
  onChangeToolbarLayout,
  onResetToolbarLayout,
  symmetry,
  perspective,
  grid,
  onToggleSymmetry,
  onTogglePerspective,
  onToggleGrid,
  onToggleSnap,
  onResetAllSettings,
  onOpenHistory,
}) => {
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  if (!open) return null;

  const snapActive = grid.smartGuides !== false || grid.snap;
  const symmetryActive = symmetry.mode !== 'none';
  const perspectiveActive = perspective.mode !== 'none';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#1A1C22] border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-400" />
            <h2 className="font-display text-base font-semibold text-white">
              Einstellungen
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Schließen"
            aria-label="Einstellungen schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto studio-scroll">
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-zinc-200">App</h3>
            <PWAInstallButton variant="settings" />
          </div>

          {onOpenHistory && (
            <div className="pt-4 border-t border-white/[0.07] space-y-2">
              <h3 className="text-xs font-semibold text-zinc-200">Verlauf & Historie</h3>
              <button
                type="button"
                onClick={() => {
                  onOpenHistory();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium text-zinc-200 bg-[#111215] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/20 rounded-lg transition-colors cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-blue-400" />
                <span>Verlauf bearbeiten & Zustände verwalten</span>
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-white/[0.07] space-y-2.5">
            <h3 className="text-xs font-semibold text-zinc-200">
              Zeichenhilfen & Einrasten
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onToggleSymmetry}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  symmetryActive
                    ? 'bg-pink-500/20 border-pink-500/40 text-pink-200'
                    : 'bg-[#111215] border-white/[0.08] text-zinc-300 hover:text-white hover:border-white/20'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Symmetrie</span>
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    symmetryActive
                      ? 'bg-pink-500/25 text-pink-200'
                      : 'bg-white/[0.06] text-zinc-400'
                  }`}
                >
                  {symmetryActive ? 'Aktiv' : 'Aus'}
                </span>
              </button>

              <button
                type="button"
                onClick={onTogglePerspective}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  perspectiveActive
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                    : 'bg-[#111215] border-white/[0.08] text-zinc-300 hover:text-white hover:border-white/20'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Compass className="w-3.5 h-3.5 shrink-0" />
                  <span>Perspektive</span>
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    perspectiveActive
                      ? 'bg-blue-500/25 text-blue-200'
                      : 'bg-white/[0.06] text-zinc-400'
                  }`}
                >
                  {perspectiveActive ? 'Aktiv' : 'Aus'}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleGrid}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  grid.visible
                    ? 'bg-white/15 border-white/25 text-white'
                    : 'bg-[#111215] border-white/[0.08] text-zinc-300 hover:text-white hover:border-white/20'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Grid className="w-3.5 h-3.5 shrink-0" />
                  <span>Raster</span>
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    grid.visible
                      ? 'bg-white/20 text-white'
                      : 'bg-white/[0.06] text-zinc-400'
                  }`}
                >
                  {grid.visible ? 'Aktiv' : 'Aus'}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleSnap}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  snapActive
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                    : 'bg-[#111215] border-white/[0.08] text-zinc-300 hover:text-white hover:border-white/20'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Magnet className="w-3.5 h-3.5 shrink-0" />
                  <span>Einrasten</span>
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    snapActive
                      ? 'bg-emerald-500/25 text-emerald-200'
                      : 'bg-white/[0.06] text-zinc-400'
                  }`}
                >
                  {snapActive ? 'Aktiv' : 'Aus'}
                </span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.07]">
            <ToolbarLayoutControls
              toolbarLayout={toolbarLayout}
              onChangeToolbarLayout={onChangeToolbarLayout}
              onResetToolbarLayout={onResetToolbarLayout}
            />
          </div>

          {onResetAllSettings && (
            <div className="pt-4 border-t border-white/[0.07]">
              {confirmResetAll ? (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 space-y-2">
                  <p className="text-[11px] text-red-200 leading-snug">
                    Alle Pinsel-, Anfasser-, Hilfslinien- und Toolbar-Einstellungen auf Standard zurücksetzen?
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onResetAllSettings();
                        setConfirmResetAll(false);
                      }}
                      className="flex-1 py-1.5 text-[11px] font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors"
                    >
                      Ja, zurücksetzen
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResetAll(false)}
                      className="flex-1 py-1.5 text-[11px] font-medium rounded-md bg-[#111215] hover:bg-white/10 text-zinc-300 transition-colors"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetAll(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#111215] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/20 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
                  title="Alle gespeicherten Einstellungen auf Standardwerte zurücksetzen"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Alle Einstellungen zurücksetzen</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
