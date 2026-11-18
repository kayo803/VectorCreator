import React, { useState } from 'react';
import { Download, FileCode2, FileImage, FileJson, X } from 'lucide-react';
import { ProjectDocument } from '../types/vector';
import { formatCanvasSizeLabel, isBoundedCanvas } from '../utils/canvasSizes';
import { downloadTextFile, exportProjectPng, generateSvgString } from '../utils/export';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  document: ProjectDocument;
}

export const ExportModal: React.FC<ExportModalProps> = ({ open, onClose, document }) => {
  const [format, setFormat] = useState<'svg' | 'png' | 'json'>('svg');
  const [scale, setScale] = useState<1 | 2 | 3>(2);
  const [includeBackground, setIncludeBackground] = useState(true);
  const [padding, setPadding] = useState(32);
  const [cropToCanvasSize, setCropToCanvasSize] = useState(true);

  if (!open) return null;

  const hasBoundedCanvas = isBoundedCanvas(document.canvasSize);
  const safeName =
    document.name.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-') || 'vektora-artwork';

  const handleExport = () => {
    if (format === 'svg') {
      const svg = generateSvgString(document, {
        includeBackground,
        padding,
        cropToCanvasSize: hasBoundedCanvas && cropToCanvasSize,
      });
      downloadTextFile(`${safeName}.svg`, svg, 'image/svg+xml;charset=utf-8');
    } else if (format === 'png') {
      void exportProjectPng(document, {
        scale,
        includeBackground,
        padding,
        cropToCanvasSize: hasBoundedCanvas && cropToCanvasSize,
      });
    } else {
      downloadTextFile(
        `${safeName}.vektora.json`,
        JSON.stringify(document, null, 2),
        'application/json'
      );
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#1A1C22] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <h2 className="font-display text-base font-semibold text-white">
            Artwork exportieren
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Format Selection */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'svg' as const, label: 'SVG Vektor', icon: FileCode2 },
              { id: 'png' as const, label: 'PNG Bild', icon: FileImage },
              { id: 'json' as const, label: 'JSON Projekt', icon: FileJson },
            ].map((item) => {
              const Icon = item.icon;
              const active = format === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id)}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-[#111215] border-white/[0.07] text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {format !== 'json' && (
            <div className="space-y-3.5">
              {format === 'png' && (
                <div className="space-y-1.5">
                  <span className="block text-xs text-zinc-400">Auflösung</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([1, 2, 3] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setScale(s)}
                        className={`py-1.5 text-xs font-mono-tabular rounded-lg border transition-colors ${
                          scale === s
                            ? 'bg-[#2A2E37] border-blue-500 text-white'
                            : 'bg-[#111215] border-white/[0.07] text-zinc-400 hover:text-white'
                        }`}
                      >
                        {s}× Retina
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {hasBoundedCanvas && (
                <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#111215] border border-white/[0.07] text-xs text-zinc-200 cursor-pointer">
                  <div>
                    <div className="font-medium">Auf Leinwandformat zuschneiden</div>
                    <div className="text-[11px] text-zinc-400 font-mono-tabular">
                      {formatCanvasSizeLabel(document.canvasSize)}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={cropToCanvasSize}
                    onChange={(e) => setCropToCanvasSize(e.target.checked)}
                    className="accent-blue-500"
                  />
                </label>
              )}

              {(!hasBoundedCanvas || !cropToCanvasSize) && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Außenabstand (Rand)</span>
                    <span className="font-mono-tabular text-zinc-200">{padding} px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={120}
                    step={4}
                    value={padding}
                    onChange={(e) => setPadding(Number(e.target.value))}
                    className="studio-slider w-full"
                  />
                </div>
              )}

              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                <span>Leinwand-Hintergrund einbeziehen</span>
                <input
                  type="checkbox"
                  checked={includeBackground}
                  onChange={(e) => setIncludeBackground(e.target.checked)}
                  className="accent-blue-500"
                />
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white rounded-lg hover:bg-white/[0.06]"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Herunterladen</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
