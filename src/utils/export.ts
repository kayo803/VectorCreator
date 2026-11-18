import { CanvasElement, PaintStyle, ProjectDocument } from '../types/vector';
import {
  isAndroidNativeApp,
  saveBase64ToAndroidDownloads,
  textToBase64,
} from './androidBridge';
import { isBoundedCanvas } from './canvasSizes';
import { getCombinedBounds, getElementBounds, pathElementToSvgPathD } from './geometry';
import { getBackgroundColors, preloadImages, renderLayers } from './renderer';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paintToSvgAttr(
  paint: PaintStyle,
  defs: string[],
  gradId: string
): { value: string; opacity: number } {
  if (paint.type === 'none') return { value: 'none', opacity: 1 };
  if (paint.type === 'solid') return { value: paint.color, opacity: paint.opacity };

  const angleRad = (paint.gradient.angle * Math.PI) / 180;
  const x1 = 50 - Math.cos(angleRad) * 50;
  const y1 = 50 - Math.sin(angleRad) * 50;
  const x2 = 50 + Math.cos(angleRad) * 50;
  const y2 = 50 + Math.sin(angleRad) * 50;
  const s0 = paint.gradient.stops[0];
  const s1 = paint.gradient.stops[1];

  defs.push(
    `<linearGradient id="${gradId}" x1="${x1.toFixed(1)}%" y1="${y1.toFixed(
      1
    )}%" x2="${x2.toFixed(1)}%" y2="${y2.toFixed(1)}%">
      <stop offset="${Math.round(s0.offset * 100)}%" stop-color="${s0.color}" stop-opacity="${
      s0.opacity * paint.opacity
    }" />
      <stop offset="${Math.round(s1.offset * 100)}%" stop-color="${s1.color}" stop-opacity="${
      s1.opacity * paint.opacity
    }" />
    </linearGradient>`
  );
  return { value: `url(#${gradId})`, opacity: 1 };
}

export function generateSvgString(
  doc: ProjectDocument,
  options: { includeBackground: boolean; padding: number; cropToCanvasSize?: boolean }
): string {
  const allElements: CanvasElement[] = [];
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    for (const el of layer.elements) {
      if (el.visible) allElements.push(el);
    }
  }

  const useCanvasBounds =
    options.cropToCanvasSize !== false && isBoundedCanvas(doc.canvasSize);

  const bounds = useCanvasBounds && doc.canvasSize
    ? {
        minX: -doc.canvasSize.width / 2,
        minY: -doc.canvasSize.height / 2,
        maxX: doc.canvasSize.width / 2,
        maxY: doc.canvasSize.height / 2,
        width: doc.canvasSize.width,
        height: doc.canvasSize.height,
        cx: 0,
        cy: 0,
      }
    : getCombinedBounds(allElements) ?? {
        minX: -400,
        minY: -300,
        maxX: 400,
        maxY: 300,
        width: 800,
        height: 600,
        cx: 0,
        cy: 0,
      };

  const pad = useCanvasBounds ? 0 : options.padding;
  const vx = bounds.minX - pad;
  const vy = bounds.minY - pad;
  const vw = Math.max(100, bounds.width + pad * 2);
  const vh = Math.max(100, bounds.height + pad * 2);

  const defs: string[] = [];
  const layerGroups: string[] = [];
  let gradCounter = 0;

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    const items: string[] = [];

    for (const el of layer.elements) {
      if (!el.visible) continue;
      const fillAttr = paintToSvgAttr(el.fill, defs, `g_${++gradCounter}`);
      const strokeAttr = paintToSvgAttr(el.stroke.paint, defs, `g_${++gradCounter}`);
      const elBounds = getElementBounds(el);
      void elBounds;

      if (el.kind === 'image') {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const parts: string[] = [];
        if (el.rotation || el.flipX || el.flipY) {
          const deg = ((el.rotation || 0) * 180) / Math.PI;
          parts.push(`translate(${cx.toFixed(2)} ${cy.toFixed(2)})`);
          if (deg) parts.push(`rotate(${deg.toFixed(2)})`);
          if (el.flipX || el.flipY) {
            parts.push(`scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1})`);
          }
          parts.push(`translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`);
        }
        const transformAttr = parts.length > 0 ? ` transform="${parts.join(' ')}"` : '';
        items.push(
          `    <image href="${escapeXml(el.src)}" x="${el.x.toFixed(2)}" y="${el.y.toFixed(
            2
          )}" width="${el.width.toFixed(2)}" height="${el.height.toFixed(
            2
          )}" preserveAspectRatio="none" opacity="${el.opacity}"${transformAttr} />`
        );
        if (el.stroke.paint.type !== 'none' && el.stroke.width > 0) {
          items.push(
            `    <rect x="${el.x.toFixed(2)}" y="${el.y.toFixed(2)}" width="${el.width.toFixed(
              2
            )}" height="${el.height.toFixed(2)}" fill="none" stroke="${
              strokeAttr.value
            }" stroke-opacity="${strokeAttr.opacity}" stroke-width="${
              el.stroke.width
            }" opacity="${el.opacity}"${transformAttr} />`
          );
        }
      } else if (el.kind === 'text') {
        const anchor =
          el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
        const deg = ((el.rotation || 0) * 180) / Math.PI;
        const transform = deg ? ` transform="rotate(${deg.toFixed(2)} ${el.x} ${el.y})"` : '';
        items.push(
          `    <text x="${el.x.toFixed(2)}" y="${el.y.toFixed(
            2
          )}" font-family="Plus Jakarta Sans, sans-serif" font-size="${el.fontSize}" font-weight="${
            el.fontWeight
          }" text-anchor="${anchor}" fill="${fillAttr.value}" fill-opacity="${
            fillAttr.opacity
          }" stroke="${strokeAttr.value}" stroke-opacity="${
            strokeAttr.opacity
          }" stroke-width="${el.stroke.width}" opacity="${el.opacity}"${transform}>${escapeXml(
            el.text
          )}</text>`
        );
      } else {
        const d = pathElementToSvgPathD(el);
        if (!d) continue;
        let dashAttr = '';
        if (el.stroke.dash === 'dashed') {
          dashAttr = ` stroke-dasharray="${(el.stroke.width * 2.6).toFixed(1)} ${(
            el.stroke.width * 1.8
          ).toFixed(1)}"`;
        } else if (el.stroke.dash === 'dotted') {
          dashAttr = ` stroke-dasharray="0.1 ${(el.stroke.width * 2.1).toFixed(1)}"`;
        }
        const fillRuleAttr = el.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';
        items.push(
          `    <path d="${d}"${fillRuleAttr} fill="${fillAttr.value}" fill-opacity="${
            fillAttr.opacity
          }" stroke="${strokeAttr.value}" stroke-opacity="${
            strokeAttr.opacity
          }" stroke-width="${el.stroke.width}" stroke-linecap="${
            el.stroke.cap
          }" stroke-linejoin="${el.stroke.join}" opacity="${el.opacity}"${dashAttr} />`
        );
      }
    }

    const blend =
      layer.blendMode !== 'source-over' ? ` style="mix-blend-mode:${layer.blendMode}"` : '';
    layerGroups.push(
      `  <g id="${escapeXml(layer.id)}" opacity="${layer.opacity}"${blend}>\n${items.join(
        '\n'
      )}\n  </g>`
    );
  }

  const bgColor = getBackgroundColors(doc.background).fill;
  const bgRect =
    options.includeBackground && bgColor !== 'transparent'
      ? `  <rect x="${vx.toFixed(2)}" y="${vy.toFixed(2)}" width="${vw.toFixed(
          2
        )}" height="${vh.toFixed(2)}" fill="${bgColor}" />\n`
      : '';

  const defsBlock = defs.length > 0 ? `  <defs>\n    ${defs.join('\n    ')}\n  </defs>\n` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(2)} ${vy.toFixed(
    2
  )} ${vw.toFixed(2)} ${vh.toFixed(2)}" width="${Math.round(vw)}" height="${Math.round(vh)}">
${defsBlock}${bgRect}${layerGroups.join('\n')}
</svg>`;
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  if (isAndroidNativeApp()) {
    const cleanMime = mime.split(';')[0] || 'application/octet-stream';
    if (saveBase64ToAndroidDownloads(filename, textToBase64(content), cleanMime)) {
      return;
    }
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportProjectPng(
  doc: ProjectDocument,
  options: {
    scale: number;
    includeBackground: boolean;
    padding: number;
    cropToCanvasSize?: boolean;
  }
) {
  const allElements: CanvasElement[] = [];
  const imageSrcs: string[] = [];
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    for (const el of layer.elements) {
      if (el.visible) {
        allElements.push(el);
        if (el.kind === 'image') imageSrcs.push(el.src);
      }
    }
  }

  if (imageSrcs.length > 0) {
    await preloadImages(imageSrcs);
  }

  const useCanvasBounds =
    options.cropToCanvasSize !== false && isBoundedCanvas(doc.canvasSize);

  const bounds = useCanvasBounds && doc.canvasSize
    ? {
        minX: -doc.canvasSize.width / 2,
        minY: -doc.canvasSize.height / 2,
        maxX: doc.canvasSize.width / 2,
        maxY: doc.canvasSize.height / 2,
        width: doc.canvasSize.width,
        height: doc.canvasSize.height,
        cx: 0,
        cy: 0,
      }
    : getCombinedBounds(allElements) ?? {
        minX: -400,
        minY: -300,
        maxX: 400,
        maxY: 300,
        width: 800,
        height: 600,
        cx: 0,
        cy: 0,
      };

  const pad = useCanvasBounds ? 0 : options.padding;
  const w = Math.max(64, Math.round(bounds.width + pad * 2));
  const h = Math.max(64, Math.round(bounds.height + pad * 2));
  const scale = options.scale;

  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);

  const bgColor = getBackgroundColors(doc.background).fill;
  if (options.includeBackground && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.translate(-(bounds.minX - pad), -(bounds.minY - pad));
  renderLayers(ctx, doc.layers);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const filename = `${doc.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'artwork'}.png`;
    if (isAndroidNativeApp()) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        if (base64) {
          saveBase64ToAndroidDownloads(filename, base64, 'image/png');
        }
      };
      reader.readAsDataURL(blob);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
