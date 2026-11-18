import React, { useEffect, useRef, useState } from 'react';
import { PaintStyle } from '../types/vector';
import { clamp, hexToHsv, hsvToHex, STUDIO_SWATCHES } from '../utils/color';

interface ColorPickerProps {
  paint: PaintStyle;
  onChange: (next: PaintStyle) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ paint, onChange }) => {
  const [activeStopIdx, setActiveStopIdx] = useState<0 | 1>(0);
  const svRef = useRef<HTMLDivElement>(null);
  const isDraggingSv = useRef(false);

  const activeHex =
    paint.type === 'linear' ? paint.gradient.stops[activeStopIdx].color : paint.color;
  const hsv = hexToHsv(activeHex);

  const updateActiveHex = (hex: string) => {
    if (paint.type === 'linear') {
      const nextStops: [
        typeof paint.gradient.stops[0],
        typeof paint.gradient.stops[1]
      ] = [{ ...paint.gradient.stops[0] }, { ...paint.gradient.stops[1] }];
      nextStops[activeStopIdx] = { ...nextStops[activeStopIdx], color: hex };
      onChange({
        ...paint,
        gradient: { ...paint.gradient, stops: nextStops },
      });
    } else {
      onChange({ ...paint, type: 'solid', color: hex });
    }
  };

  const handleSvPointer = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const v = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100);
    updateActiveHex(hsvToHex(hsv.h, s, v));
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!isDraggingSv.current) return;
      handleSvPointer(e.clientX, e.clientY);
    };
    const onUp = () => {
      isDraggingSv.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  });

  const pureHueHex = hsvToHex(hsv.h, 100, 100);

  return (
    <div className="space-y-3">
      {/* Paint Mode Segmented Selector */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111215] border border-white/[0.06]">
        {(
          [
            { id: 'none', label: 'Keine' },
            { id: 'solid', label: 'Farbe' },
            { id: 'linear', label: 'Verlauf' },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange({ ...paint, type: mode.id })}
            className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              paint.type === mode.id
                ? 'bg-[#2A2E37] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {paint.type !== 'none' && (
        <>
          {/* Gradient Stops & Angle */}
          {paint.type === 'linear' && (
            <div className="space-y-2 p-2.5 rounded-lg bg-[#111215] border border-white/[0.06]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-400">Verlaufs-Punkte</span>
                <div className="flex items-center gap-1.5">
                  {([0, 1] as const).map((idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveStopIdx(idx)}
                      className={`w-6 h-6 rounded border transition-transform ${
                        activeStopIdx === idx
                          ? 'border-blue-500 scale-105'
                          : 'border-white/20 opacity-80'
                      }`}
                      style={{ backgroundColor: paint.gradient.stops[idx].color }}
                      title={`Stopp ${idx + 1}`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const stops = paint.gradient.stops;
                      const nextStops: [typeof stops[0], typeof stops[1]] = [
                        { ...stops[1] },
                        { ...stops[0] },
                      ];
                      onChange({
                        ...paint,
                        gradient: { ...paint.gradient, stops: nextStops },
                      });
                    }}
                    className="px-2 py-1 text-[11px] font-medium rounded bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Verlauf umkehren"
                  >
                    Umkehren
                  </button>
                </div>
              </div>

              {/* Gradient preview bar */}
              <div
                className="w-full h-5 rounded border border-white/10 cursor-pointer relative overflow-hidden"
                style={{
                  background: `linear-gradient(to right, ${paint.gradient.stops[0].color}, ${paint.gradient.stops[1].color})`,
                }}
                title="Klicken, um Stopp auszuwählen"
              >
                <div
                  className={`absolute top-0 bottom-0 w-2.5 bg-white border border-black shadow cursor-pointer -translate-x-1/2 transition-all ${
                    activeStopIdx === 0 ? 'ring-2 ring-blue-500' : 'opacity-70'
                  }`}
                  style={{ left: `${paint.gradient.stops[0].offset * 100}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveStopIdx(0);
                  }}
                />
                <div
                  className={`absolute top-0 bottom-0 w-2.5 bg-white border border-black shadow cursor-pointer -translate-x-1/2 transition-all ${
                    activeStopIdx === 1 ? 'ring-2 ring-blue-500' : 'opacity-70'
                  }`}
                  style={{ left: `${paint.gradient.stops[1].offset * 100}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveStopIdx(1);
                  }}
                />
              </div>

              {/* Quick Gradient Presets */}
              <div className="space-y-1 pt-1">
                <span className="text-[11px] text-zinc-400">Verlaufs-Vorlagen</span>
                <div className="grid grid-cols-6 gap-1">
                  {[
                    ['#3B82F6', '#8B5CF6'],
                    ['#EC4899', '#8B5CF6'],
                    ['#10B981', '#3B82F6'],
                    ['#F59E0B', '#EF4444'],
                    ['#06B6D4', '#3B82F6'],
                    ['#111827', '#4B5563'],
                  ].map(([c1, c2], i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...paint,
                          gradient: {
                            ...paint.gradient,
                            stops: [
                              { offset: 0, color: c1, opacity: 1 },
                              { offset: 1, color: c2, opacity: 1 },
                            ],
                          },
                        })
                      }
                      className="w-full aspect-square rounded border border-white/15 hover:scale-105 transition-transform shadow-sm cursor-pointer"
                      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                      title={`${c1} → ${c2}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-zinc-400 w-14 shrink-0">Winkel</span>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={paint.gradient.angle}
                  onChange={(e) =>
                    onChange({
                      ...paint,
                      gradient: { ...paint.gradient, angle: Number(e.target.value) },
                    })
                  }
                  className="studio-slider flex-1"
                />
                <span className="text-xs font-mono-tabular text-zinc-300 w-9 text-right">
                  {paint.gradient.angle}°
                </span>
              </div>
            </div>
          )}

          {/* 2D Saturation / Value Field */}
          <div
            ref={svRef}
            onPointerDown={(e) => {
              isDraggingSv.current = true;
              handleSvPointer(e.clientX, e.clientY);
            }}
            className="relative w-full h-36 rounded-lg overflow-hidden cursor-crosshair border border-white/10"
            style={{ backgroundColor: pureHueHex }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to right, #FFFFFF, rgba(255,255,255,0))',
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to top, #000000, rgba(0,0,0,0))',
              }}
            />
            <div
              className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                backgroundColor: activeHex,
              }}
            />
          </div>

          {/* Hue Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Farbton</span>
              <span className="font-mono-tabular text-zinc-300">{Math.round(hsv.h)}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={hsv.h}
              onChange={(e) => updateActiveHex(hsvToHex(Number(e.target.value), hsv.s, hsv.v))}
              className="w-full h-3 rounded-full appearance-none cursor-pointer border border-white/10"
              style={{
                background:
                  'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
              }}
            />
          </div>

          {/* Opacity + Hex */}
          <div className="grid grid-cols-[1fr_84px] gap-2 items-center">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Deckkraft</span>
                <span className="font-mono-tabular text-zinc-300">
                  {Math.round(paint.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(paint.opacity * 100)}
                onChange={(e) =>
                  onChange({ ...paint, opacity: Number(e.target.value) / 100 })
                }
                className="studio-slider w-full"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Hex</label>
              <input
                type="text"
                value={activeHex}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                    if (val.length === 7) updateActiveHex(val.toUpperCase());
                  }
                }}
                className="w-full px-2 py-1 text-xs font-mono-tabular bg-[#111215] border border-white/10 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Swatches */}
          <div className="grid grid-cols-9 gap-1.5 pt-1">
            {STUDIO_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => updateActiveHex(swatch)}
                className={`w-full aspect-square rounded border transition-transform hover:scale-110 ${
                  activeHex.toUpperCase() === swatch.toUpperCase()
                    ? 'border-blue-400 ring-1 ring-blue-400'
                    : 'border-white/15'
                }`}
                style={{ backgroundColor: swatch }}
                title={swatch}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
