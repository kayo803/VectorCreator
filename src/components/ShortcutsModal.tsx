import React from 'react';
import { X } from 'lucide-react';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'V', desc: 'Auswahl-Werkzeug (Objekte verschieben, skalieren, drehen)' },
  { key: 'A', desc: 'Direktauswahl-Werkzeug (Knoten, Griffe & Rahmen)' },
  { key: 'B', desc: 'Freihand-Pinsel' },
  { key: 'P', desc: 'Bézier-Feder (Klicken = Ecke, Ziehen = Kurve)' },
  { key: 'S', desc: 'Formen-Werkzeug' },
  { key: 'G', desc: 'Fülleimer' },
  { key: 'E', desc: 'Vektor-Radierer' },
  { key: 'I', desc: 'Pipette (Farbe aufnehmen)' },
  { key: 'T', desc: 'Text platzieren' },
  { key: 'H / Leertaste', desc: 'Unbegrenzte Leinwand verschieben' },
  { key: 'Mausrad / 2 Finger', desc: 'Stufenlos rein- & rauszoomen' },
  { key: 'Alt + Mausrad', desc: 'Leinwand stufenlos drehen' },
  { key: 'Strg + Z / Y', desc: 'Rückgängig / Wiederholen' },
  { key: 'Strg + X / C / V', desc: 'Auswahl ausschneiden / kopieren / einfügen' },
  { key: 'Strg + D', desc: 'Auswahl duplizieren' },
  { key: 'Entf', desc: 'Ausgewählte Objekte oder Knoten löschen' },
  { key: 'F / Esc', desc: 'Vollbild aktivieren / minimieren' },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#1A1C22] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <h2 className="font-display text-base font-semibold text-white">
            Tastaturkürzel & Steuerung
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2 max-h-[70vh] overflow-y-auto studio-scroll">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-1.5 border-b border-white/[0.05] last:border-none"
            >
              <span className="text-xs text-zinc-300">{s.desc}</span>
              <kbd className="px-2 py-0.5 text-[11px] font-mono-tabular text-zinc-200 bg-[#111215] border border-white/10 rounded">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
