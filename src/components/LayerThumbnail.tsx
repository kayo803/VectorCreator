import React, { useEffect, useRef, useState } from 'react';
import { CanvasBackground, Layer } from '../types/vector';
import { getCombinedBounds } from '../utils/geometry';
import {
  getBackgroundColors,
  renderElement,
  subscribeImageLoad,
} from '../utils/renderer';

interface LayerThumbnailProps {
  layer: Layer;
  background: CanvasBackground;
}

export const LayerThumbnail: React.FC<LayerThumbnailProps> = ({
  layer,
  background,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageTick, setImageTick] = useState(0);

  useEffect(() => {
    return subscribeImageLoad(() => {
      setImageTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 32;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const bg = getBackgroundColors(background);
    if (bg.fill === 'transparent') {
      ctx.clearRect(0, 0, size, size);
    } else {
      ctx.fillStyle = bg.fill;
      ctx.fillRect(0, 0, size, size);
    }

    const visibleEls = layer.elements.filter((el) => el.visible);
    if (visibleEls.length === 0) {
      ctx.restore();
      return;
    }

    const rawBounds = getCombinedBounds(visibleEls);
    if (!rawBounds) {
      ctx.restore();
      return;
    }

    const maxStroke = visibleEls.reduce((acc, el) => {
      if (el.stroke.paint.type === 'none') return acc;
      return Math.max(acc, el.stroke.width);
    }, 0);

    const padWorld = Math.max(8, maxStroke * 0.75);
    const contentW = Math.max(12, rawBounds.width + padWorld * 2);
    const contentH = Math.max(12, rawBounds.height + padWorld * 2);

    const innerSize = size - 4;
    const scale = Math.min(innerSize / contentW, innerSize / contentH);

    ctx.translate(size / 2, size / 2);
    ctx.scale(scale, scale);
    ctx.translate(-rawBounds.cx, -rawBounds.cy);
    ctx.globalAlpha = Math.max(0.2, layer.opacity);

    for (const el of visibleEls) {
      renderElement(ctx, el);
    }

    ctx.restore();
  }, [layer.elements, layer.opacity, background, imageTick]);

  const isEmpty = layer.elements.every((el) => !el.visible);

  return (
    <div
      className={`relative w-8 h-8 rounded-md border border-white/15 shrink-0 overflow-hidden transition-opacity ${
        background === 'transparent' ? 'checkerboard-bg' : 'bg-[#16181D]'
      } ${layer.visible ? 'opacity-100' : 'opacity-40'}`}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-3 h-3 rounded-sm border border-dashed border-zinc-500/50" />
        </div>
      )}
    </div>
  );
};
