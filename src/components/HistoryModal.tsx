import React from 'react';
import { History, RotateCcw, Trash2, X } from 'lucide-react';
import { ProjectDocument } from '../types/vector';

interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
  past: ProjectDocument[];
  future: ProjectDocument[];
  currentDoc: ProjectDocument;
  onJumpToPast: (index: number) => void;
  onJumpToFuture: (index: number) => void;
  onClearHistory: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  open,
  onClose,
  past,
  future,
  currentDoc,
  onJumpToPast,
  onJumpToFuture,
  onClearHistory,
}) => {
  if (!open) return null;

  const totalStates = past.length + 1 + future.length;

  const getElementCount = (doc: ProjectDocument) =>
    doc.layers?.reduce((acc, l) => acc + (l.elements?.length || 0), 0) || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#1A1C22] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-white leading-tight">
                Verlauf & Historie
              </h2>
              <p className="text-[11px] text-zinc-400">
                {totalStates} {totalStates === 1 ? 'Zustand' : 'Zustände'} im Speicher
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* History List */}
        <div className="p-4 space-y-2 overflow-y-auto studio-scroll flex-1">
          {past.length === 0 && future.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs">
              Noch keine Verlaufsschritte vorhanden. Zeichne oder bearbeite etwas auf der Leinwand.
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Past states */}
              {past.map((doc, index) => {
                const stepNum = index + 1;
                const elementCount = getElementCount(doc);
                return (
                  <button
                    key={`past-${index}`}
                    type="button"
                    onClick={() => onJumpToPast(index)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#111215] hover:bg-white/[0.06] border border-white/[0.06] hover:border-blue-500/40 text-left transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-white/[0.04] text-zinc-400 text-[11px] font-mono flex items-center justify-center group-hover:bg-blue-600/20 group-hover:text-blue-300">
                        {stepNum}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-300 group-hover:text-white truncate">
                          Zustand #{stepNum}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {elementCount} {elementCount === 1 ? 'Element' : 'Elemente'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-zinc-400 group-hover:text-blue-400">
                      Wiederherstellen
                    </span>
                  </button>
                );
              })}

              {/* Current state */}
              <div className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-blue-600/15 border border-blue-500/40 text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-[11px] font-mono font-bold flex items-center justify-center shadow-sm">
                    ★
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      Aktueller Zustand
                    </div>
                    <div className="text-[10px] text-blue-200">
                      {getElementCount(currentDoc)} {getElementCount(currentDoc) === 1 ? 'Element' : 'Elemente'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/25 text-blue-200 border border-blue-500/30">
                  Aktiv
                </span>
              </div>

              {/* Future states (redo) */}
              {future.map((doc, index) => {
                const stepNum = past.length + 2 + index;
                const elementCount = getElementCount(doc);
                return (
                  <button
                    key={`future-${index}`}
                    type="button"
                    onClick={() => onJumpToFuture(index)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#111215]/60 hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/20 text-left transition-all group cursor-pointer opacity-70 hover:opacity-100"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-white/[0.03] text-zinc-500 text-[11px] font-mono flex items-center justify-center">
                        {stepNum}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200 truncate">
                          Redo #{index + 1}
                        </div>
                        <div className="text-[10px] text-zinc-600">
                          {elementCount} {elementCount === 1 ? 'Element' : 'Elemente'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-zinc-500 group-hover:text-zinc-300">
                      Vorwärts
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/[0.08] bg-[#14161B] shrink-0">
          <button
            type="button"
            onClick={onClearHistory}
            disabled={past.length === 0 && future.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-300 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Gesamten Verlauf leeren"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Verlauf leeren</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors cursor-pointer"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
