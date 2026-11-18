import {
  AnchorNode,
  BoundingBox,
  CanvasBackground,
  CanvasElement,
  HandleSettings,
  Layer,
  PaintStyle,
  PerspectiveConfig,
  Point,
  SymmetryConfig,
  VectorPathElement,
  ViewportTransform,
} from '../types/vector';
import { hexToRgba } from './color';
import { flattenPathPoints, getCombinedBounds, getElementBounds, getPathContours } from './geometry';
import {
  DEFAULT_HANDLE_SETTINGS,
  getHandleScaleFactor,
  getNodeTangentStubs,
  getRotationHandleDistanceWorld,
  HANDLE_COLOR_THEMES,
} from './handles';

const imageCache = new Map<string, HTMLImageElement>();
const imageLoadListeners = new Set<() => void>();

export function subscribeImageLoad(cb: () => void): () => void {
  imageLoadListeners.add(cb);
  return () => {
    imageLoadListeners.delete(cb);
  };
}

export function getCachedImage(src: string): HTMLImageElement | null {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => {
      imageLoadListeners.forEach((cb) => cb());
    };
    img.src = src;
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export async function preloadImages(srcs: string[]): Promise<void> {
  await Promise.all(
    srcs.map(
      (src) =>
        new Promise<void>((resolve) => {
          const existing = imageCache.get(src);
          if (existing && existing.complete) {
            resolve();
            return;
          }
          const img = existing ?? new Image();
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          if (!existing) {
            img.src = src;
            imageCache.set(src, img);
          }
        })
    )
  );
}

export function getBackgroundColors(bg: CanvasBackground): {
  fill: string;
  grid: string;
  axis: string;
} {
  switch (bg) {
    case 'white':
      return { fill: '#FFFFFF', grid: 'rgba(15, 23, 42, 0.08)', axis: 'rgba(15, 23, 42, 0.16)' };
    case 'paper':
      return { fill: '#F7F4EE', grid: 'rgba(68, 56, 42, 0.09)', axis: 'rgba(68, 56, 42, 0.18)' };
    case 'dark':
      return { fill: '#16181D', grid: 'rgba(255, 255, 255, 0.07)', axis: 'rgba(255, 255, 255, 0.14)' };
    case 'transparent':
      return { fill: 'transparent', grid: 'rgba(255, 255, 255, 0.08)', axis: 'rgba(255, 255, 255, 0.16)' };
  }
}

function buildCanvasPaint(
  ctx: CanvasRenderingContext2D,
  paint: PaintStyle,
  bounds: BoundingBox
): string | CanvasGradient | null {
  if (paint.type === 'none') return null;
  if (paint.type === 'solid') {
    return hexToRgba(paint.color, paint.opacity);
  }
  const angleRad = (paint.gradient.angle * Math.PI) / 180;
  const rx = bounds.width / 2 || 50;
  const ry = bounds.height / 2 || 50;
  const dx = Math.cos(angleRad) * rx;
  const dy = Math.sin(angleRad) * ry;
  const grad = ctx.createLinearGradient(
    bounds.cx - dx,
    bounds.cy - dy,
    bounds.cx + dx,
    bounds.cy + dy
  );
  const s0 = paint.gradient.stops[0];
  const s1 = paint.gradient.stops[1];
  grad.addColorStop(s0.offset, hexToRgba(s0.color, s0.opacity * paint.opacity));
  grad.addColorStop(s1.offset, hexToRgba(s1.color, s1.opacity * paint.opacity));
  return grad;
}

function appendNodesContour(
  ctx: CanvasRenderingContext2D,
  nodes: AnchorNode[],
  closed: boolean
) {
  if (nodes.length === 0) return;
  ctx.moveTo(nodes[0].x, nodes[0].y);
  for (let i = 0; i < nodes.length - 1; i++) {
    const curr = nodes[i];
    const next = nodes[i + 1];
    if (curr.handleOut || next.handleIn) {
      const c1 = curr.handleOut ?? curr;
      const c2 = next.handleIn ?? next;
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, next.x, next.y);
    } else {
      ctx.lineTo(next.x, next.y);
    }
  }
  if (closed && nodes.length > 1) {
    const last = nodes[nodes.length - 1];
    const first = nodes[0];
    if (last.handleOut || first.handleIn) {
      const c1 = last.handleOut ?? last;
      const c2 = first.handleIn ?? first;
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, first.x, first.y);
    }
    ctx.closePath();
  }
}

export function traceNodesPath(
  ctx: CanvasRenderingContext2D,
  nodes: AnchorNode[],
  closed: boolean
) {
  if (nodes.length === 0) return;
  ctx.beginPath();
  appendNodesContour(ctx, nodes, closed);
}

export function traceElementPath(ctx: CanvasRenderingContext2D, el: VectorPathElement) {
  const contours = getPathContours(el);
  ctx.beginPath();
  for (const contour of contours) {
    appendNodesContour(ctx, contour.nodes, contour.closed);
  }
}

function drawVariableWidthStroke(
  ctx: CanvasRenderingContext2D,
  el: VectorPathElement,
  strokePaint: string | CanvasGradient
) {
  const pts = flattenPathPoints(el.nodes, el.closed, 28);
  if (pts.length < 2) {
    if (pts.length === 1) {
      ctx.fillStyle = strokePaint;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, el.stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  const baseW = el.stroke.width;
  const profile = el.stroke.profile;
  const n = pts.length;
  const leftSide: Point[] = [];
  const rightSide: Point[] = [];
  let startHalfW = baseW / 2;
  let endHalfW = baseW / 2;

  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // Normal vector
    const nx = -dy;
    const ny = dx;

    let halfW = (baseW / 2) * (pts[i].pressure || 0.75);
    if (profile === 'tapered') {
      if (el.closed) {
        halfW = (baseW / 2) * (0.65 + 0.35 * (pts[i].pressure || 0.75));
      } else {
        const t = i / (n - 1);
        const envelope = Math.sin(t * Math.PI); // 0 at ends, 1 in middle
        halfW = (baseW / 2) * (0.15 + 0.85 * Math.pow(envelope, 0.55)) * (0.6 + 0.5 * (pts[i].pressure || 0.7));
      }
    } else if (profile === 'calligraphy') {
      // Fixed 40-deg nib projection
      const nibAngle = Math.PI / 4.5;
      const nibDot = Math.abs(dx * Math.sin(nibAngle) - dy * Math.cos(nibAngle));
      halfW = (baseW / 2) * (0.25 + 0.9 * nibDot);
    }

    if (i === 0) startHalfW = halfW;
    if (i === n - 1) endHalfW = halfW;

    leftSide.push({ x: pts[i].x + nx * halfW, y: pts[i].y + ny * halfW });
    rightSide.push({ x: pts[i].x - nx * halfW, y: pts[i].y - ny * halfW });
  }

  ctx.fillStyle = strokePaint;
  ctx.beginPath();
  ctx.moveTo(leftSide[0].x, leftSide[0].y);
  for (let i = 1; i < leftSide.length; i++) {
    ctx.lineTo(leftSide[i].x, leftSide[i].y);
  }
  if (!el.closed && el.stroke.cap === 'round' && endHalfW > 0.05) {
    const endPt = pts[n - 1];
    const startAngle = Math.atan2(
      leftSide[n - 1].y - endPt.y,
      leftSide[n - 1].x - endPt.x
    );
    ctx.arc(endPt.x, endPt.y, endHalfW, startAngle, startAngle + Math.PI, true);
  }
  for (let i = rightSide.length - 1; i >= 0; i--) {
    ctx.lineTo(rightSide[i].x, rightSide[i].y);
  }
  if (!el.closed && el.stroke.cap === 'round' && startHalfW > 0.05) {
    const startPt = pts[0];
    const startAngle = Math.atan2(
      rightSide[0].y - startPt.y,
      rightSide[0].x - startPt.x
    );
    ctx.arc(startPt.x, startPt.y, startHalfW, startAngle, startAngle + Math.PI, true);
  }
  ctx.closePath();
  ctx.fill();
}

export function renderElement(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  if (!el.visible) return;
  ctx.save();
  ctx.globalAlpha *= el.opacity;
  const bounds = getElementBounds(el);

  if (el.kind === 'image') {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);
    if (el.rotation) ctx.rotate(el.rotation);
    if (el.flipX || el.flipY) {
      ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
    }
    const img = getCachedImage(el.src);
    if (img) {
      ctx.drawImage(img, -el.width / 2, -el.height / 2, el.width, el.height);
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.fillRect(-el.width / 2, -el.height / 2, el.width, el.height);
    }
    const localBounds: BoundingBox = {
      ...bounds,
      cx: 0,
      cy: 0,
    };
    const strokePaint = buildCanvasPaint(ctx, el.stroke.paint, localBounds);
    if (strokePaint && el.stroke.width > 0) {
      ctx.strokeStyle = strokePaint;
      ctx.lineWidth = el.stroke.width;
      ctx.lineJoin = el.stroke.join;
      ctx.strokeRect(-el.width / 2, -el.height / 2, el.width, el.height);
    }
    ctx.restore();
    return;
  }

  if (el.kind === 'text') {
    ctx.translate(el.x, el.y);
    if (el.rotation) ctx.rotate(el.rotation);
    ctx.font = `${el.fontWeight} ${el.fontSize}px "Plus Jakarta Sans", "DM Sans", sans-serif`;
    ctx.textAlign = el.align;
    ctx.textBaseline = 'alphabetic';

    const localBounds: BoundingBox = {
      ...bounds,
      cx: 0,
      cy: -el.fontSize * 0.35,
    };

    const fillPaint = buildCanvasPaint(ctx, el.fill, localBounds);
    if (fillPaint) {
      ctx.fillStyle = fillPaint;
      ctx.fillText(el.text, 0, 0);
    }
    const strokePaint = buildCanvasPaint(ctx, el.stroke.paint, localBounds);
    if (strokePaint && el.stroke.width > 0) {
      ctx.strokeStyle = strokePaint;
      ctx.lineWidth = el.stroke.width;
      ctx.lineJoin = el.stroke.join;
      ctx.strokeText(el.text, 0, 0);
    }
    ctx.restore();
    return;
  }

  // VectorPathElement
  traceElementPath(ctx, el);

  const fillPaint = buildCanvasPaint(ctx, el.fill, bounds);
  if (fillPaint && el.nodes.length >= 2) {
    ctx.fillStyle = fillPaint;
    ctx.fill(el.fillRule ?? 'nonzero');
  }

  const strokePaint = buildCanvasPaint(ctx, el.stroke.paint, bounds);
  if (strokePaint && el.stroke.width > 0) {
    if (
      el.stroke.profile !== 'monoline' &&
      el.stroke.dash === 'solid' &&
      el.nodes.length >= 2 &&
      (!el.subpaths || el.subpaths.length <= 1)
    ) {
      drawVariableWidthStroke(ctx, el, strokePaint);
    } else {
      ctx.strokeStyle = strokePaint;
      ctx.lineWidth = el.stroke.width;
      ctx.lineCap = el.stroke.cap;
      ctx.lineJoin = el.stroke.join;
      if (el.stroke.dash === 'dashed') {
        ctx.setLineDash([el.stroke.width * 2.6, el.stroke.width * 1.8]);
      } else if (el.stroke.dash === 'dotted') {
        ctx.setLineDash([0.1, el.stroke.width * 2.1]);
        ctx.lineCap = 'round';
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function renderLayers(ctx: CanvasRenderingContext2D, layers: Layer[]) {
  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    for (const el of layer.elements) {
      renderElement(ctx, el);
    }
    ctx.restore();
  }
}

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  vp: ViewportTransform,
  gridSize: number,
  color: string,
  axisColor: string,
  isometric: boolean
) {
  ctx.save();
  // Determine visible world bounds approximately
  const diag = Math.hypot(width, height) / vp.zoom;
  const centerX = -vp.x / vp.zoom;
  const centerY = -vp.y / vp.zoom;
  const half = diag * 0.8;

  const minX = Math.floor((centerX - half) / gridSize) * gridSize;
  const maxX = Math.ceil((centerX + half) / gridSize) * gridSize;
  const minY = Math.floor((centerY - half) / gridSize) * gridSize;
  const maxY = Math.ceil((centerY + half) / gridSize) * gridSize;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / vp.zoom;

  if (!isometric) {
    ctx.beginPath();
    for (let x = minX; x <= maxX; x += gridSize) {
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    for (let y = minY; y <= maxY; y += gridSize) {
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y);
    }
    ctx.stroke();
  } else {
    // 30-deg isometric grid
    const step = gridSize * 1.25;
    const tan30 = Math.tan(Math.PI / 6);
    ctx.beginPath();
    for (let x = minX - half; x <= maxX + half; x += step) {
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    for (let y = minY - half * 2; y <= maxY + half * 2; y += step) {
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y + (maxX - minX) * tan30);
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y - (maxX - minX) * tan30);
    }
    ctx.stroke();
  }

  // Origin crosshair
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1.25 / vp.zoom;
  ctx.beginPath();
  ctx.moveTo(-24 / vp.zoom, 0);
  ctx.lineTo(24 / vp.zoom, 0);
  ctx.moveTo(0, -24 / vp.zoom);
  ctx.lineTo(0, 24 / vp.zoom);
  ctx.stroke();

  ctx.restore();
}

export function renderPerspectiveGuides(
  ctx: CanvasRenderingContext2D,
  perspective: PerspectiveConfig,
  vp: ViewportTransform,
  viewportSpan: number
) {
  if (perspective.mode === 'none') return;
  ctx.save();
  const radius = (viewportSpan / vp.zoom) * 1.4;
  ctx.globalAlpha = perspective.opacity;

  const drawVanishingFan = (pt: Point, color: string, rays = 24) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / vp.zoom;
    ctx.setLineDash([6 / vp.zoom, 6 / vp.zoom]);
    ctx.beginPath();
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x + Math.cos(a) * radius, pt.y + Math.sin(a) * radius);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Vanishing point handle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 7 / vp.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2 / vp.zoom;
    ctx.stroke();
  };

  if (perspective.mode !== 'isometric') {
    // Horizon line
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 1.5 / vp.zoom;
    ctx.beginPath();
    ctx.moveTo(-radius, perspective.horizonY);
    ctx.lineTo(radius, perspective.horizonY);
    ctx.stroke();
  }

  if (perspective.mode === '1-point') {
    drawVanishingFan(perspective.vp1, '#3B82F6', 24);
  } else if (perspective.mode === '2-point') {
    drawVanishingFan(perspective.vp1, '#3B82F6', 20);
    drawVanishingFan(perspective.vp2, '#10B981', 20);
  } else if (perspective.mode === '3-point') {
    drawVanishingFan(perspective.vp1, '#3B82F6', 18);
    drawVanishingFan(perspective.vp2, '#10B981', 18);
    drawVanishingFan(perspective.vp3, '#F59E0B', 18);
  }

  ctx.restore();
}

export function renderSymmetryGuides(
  ctx: CanvasRenderingContext2D,
  symmetry: SymmetryConfig,
  vp: ViewportTransform,
  viewportSpan: number
) {
  if (symmetry.mode === 'none' || !symmetry.showAxes) return;
  ctx.save();
  const c = symmetry.center;
  const len = (viewportSpan / vp.zoom) * 1.2;

  ctx.strokeStyle = 'rgba(236, 72, 153, 0.72)';
  ctx.lineWidth = 1.4 / vp.zoom;
  ctx.setLineDash([8 / vp.zoom, 6 / vp.zoom]);
  ctx.beginPath();

  if (symmetry.mode === 'vertical') {
    ctx.moveTo(c.x, c.y - len);
    ctx.lineTo(c.x, c.y + len);
  } else if (symmetry.mode === 'horizontal') {
    ctx.moveTo(c.x - len, c.y);
    ctx.lineTo(c.x + len, c.y);
  } else if (symmetry.mode === 'radial') {
    const count = Math.max(3, Math.min(12, symmetry.segments));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + Math.cos(a) * len, c.y + Math.sin(a) * len);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Center pivot handle
  ctx.fillStyle = '#EC4899';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 7 / vp.zoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2 / vp.zoom;
  ctx.stroke();

  ctx.restore();
}

export function renderSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  selectedElements: CanvasElement[],
  vp: ViewportTransform,
  handleSettings: HandleSettings = DEFAULT_HANDLE_SETTINGS
) {
  const bounds = getCombinedBounds(selectedElements);
  if (!bounds) return;

  ctx.save();
  const invZ = 1 / vp.zoom;
  const scale = getHandleScaleFactor(handleSettings);
  const theme = HANDLE_COLOR_THEMES[handleSettings.accentColor ?? 'blue'];

  // Individual element outlines if multi-selected
  if (selectedElements.length > 1) {
    ctx.strokeStyle = theme.soft;
    ctx.lineWidth = 1 * invZ;
    for (const el of selectedElements) {
      const b = getElementBounds(el);
      ctx.strokeRect(b.minX, b.minY, b.width, b.height);
    }
  }

  // Main bounding box
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = (scale > 1.2 ? 1.8 : 1.5) * invZ;
  ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);

  // Rotation stem & handle
  if (handleSettings.showRotationHandle !== false) {
    const rotDist = getRotationHandleDistanceWorld(vp.zoom, handleSettings);
    const rotPt = { x: bounds.cx, y: bounds.minY - rotDist };
    ctx.beginPath();
    ctx.moveTo(bounds.cx, bounds.minY);
    ctx.lineTo(rotPt.x, rotPt.y);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 1.6 * invZ;
    ctx.beginPath();
    ctx.arc(rotPt.x, rotPt.y, 5 * scale * invZ, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 8 resize handles (even = corners, odd = edge midpoints)
  const handles: Point[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.cx, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.cy },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.cx, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.cy },
  ];

  const hs = 4.5 * scale * invZ;
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 1.5 * invZ;
  for (let i = 0; i < handles.length; i++) {
    if (i % 2 === 1 && handleSettings.showEdgeHandles === false) continue;
    const h = handles[i];
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(h.x - hs, h.y - hs, hs * 2, hs * 2);
    ctx.strokeRect(h.x - hs, h.y - hs, hs * 2, hs * 2);
  }

  ctx.restore();
}

export function renderNodeOverlay(
  ctx: CanvasRenderingContext2D,
  el: VectorPathElement,
  selectedNodeIds: Set<string>,
  vp: ViewportTransform,
  handleSettings: HandleSettings = DEFAULT_HANDLE_SETTINGS
) {
  ctx.save();
  const invZ = 1 / vp.zoom;
  const scale = getHandleScaleFactor(handleSettings);
  const theme = HANDLE_COLOR_THEMES[handleSettings.accentColor ?? 'blue'];
  const contours = getPathContours(el);

  // Outline path skeleton
  traceElementPath(ctx, el);
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = 1.2 * invZ;
  ctx.stroke();

  const totalNodes = contours.reduce((acc, c) => acc + c.nodes.length, 0);
  const visMode = handleSettings.bezierVisibility ?? 'auto';

  for (const contour of contours) {
    for (let ni = 0; ni < contour.nodes.length; ni++) {
      const node = contour.nodes[ni];
      const isSel = selectedNodeIds.has(node.id);
      const showBezier =
        visMode === 'all' ||
        (visMode === 'selected' && isSel) ||
        (visMode === 'auto' && (isSel || totalNodes <= 16));

      // Draw Bezier handles
      if (showBezier) {
        ctx.strokeStyle = theme.soft;
        ctx.lineWidth = (scale > 1.2 ? 1.25 : 1) * invZ;
        const bezierR = 3.6 * scale * invZ;
        if (node.handleIn) {
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(node.handleIn.x, node.handleIn.y);
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = theme.primary;
          ctx.beginPath();
          ctx.arc(node.handleIn.x, node.handleIn.y, bezierR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        if (node.handleOut) {
          ctx.strokeStyle = theme.soft;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(node.handleOut.x, node.handleOut.y);
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = theme.primary;
          ctx.beginPath();
          ctx.arc(node.handleOut.x, node.handleOut.y, bezierR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Draw ghost pull-out tangent stubs on selected nodes for missing handles
      if (isSel && visMode !== 'none' && (!node.handleIn || !node.handleOut)) {
        const stubs = getNodeTangentStubs(
          contour.nodes,
          ni,
          contour.closed,
          vp.zoom,
          handleSettings
        );
        const stubR = 3.2 * scale * invZ;
        const drawStub = (pt: Point) => {
          ctx.save();
          ctx.strokeStyle = theme.soft;
          ctx.lineWidth = 1 * invZ;
          ctx.setLineDash([3 * invZ, 2.5 * invZ]);
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(pt.x, pt.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(26, 28, 34, 0.72)';
          ctx.strokeStyle = theme.outline;
          ctx.lineWidth = 1.2 * invZ;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, stubR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = theme.primary;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.3 * scale * invZ, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        };
        if (stubs.inStub) drawStub(stubs.inStub);
        if (stubs.outStub) drawStub(stubs.outStub);
      }

      // Anchor node marker
      ctx.fillStyle = isSel ? theme.primary : '#FFFFFF';
      ctx.strokeStyle = isSel ? '#FFFFFF' : theme.primary;
      ctx.lineWidth = 1.5 * invZ;
      const r = (isSel ? 5 : 4) * scale * invZ;

      if (node.type === 'smooth') {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(node.x - r, node.y - r, r * 2, r * 2);
        ctx.strokeRect(node.x - r, node.y - r, r * 2, r * 2);
      }
    }
  }

  ctx.restore();
}

export function getSelectedNodesTransformBounds(
  selectedPaths: VectorPathElement[],
  selectedNodeIds: Set<string>,
  vp: ViewportTransform,
  handleSettings: HandleSettings = DEFAULT_HANDLE_SETTINGS
): BoundingBox | null {
  if (selectedNodeIds.size < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (const el of selectedPaths) {
    for (const c of getPathContours(el)) {
      for (const n of c.nodes) {
        if (!selectedNodeIds.has(n.id)) continue;
        count += 1;
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
      }
    }
  }
  if (count < 2) return null;

  const pad = (16 * Math.max(1, getHandleScaleFactor(handleSettings))) / vp.zoom;
  const pMinX = minX - pad;
  const pMinY = minY - pad;
  const pMaxX = maxX + pad;
  const pMaxY = maxY + pad;
  return {
    minX: pMinX,
    minY: pMinY,
    maxX: pMaxX,
    maxY: pMaxY,
    width: Math.max(1, pMaxX - pMinX),
    height: Math.max(1, pMaxY - pMinY),
    cx: (pMinX + pMaxX) / 2,
    cy: (pMinY + pMaxY) / 2,
  };
}

export function renderNodeGroupTransformOverlay(
  ctx: CanvasRenderingContext2D,
  selectedPaths: VectorPathElement[],
  selectedNodeIds: Set<string>,
  vp: ViewportTransform,
  handleSettings: HandleSettings = DEFAULT_HANDLE_SETTINGS
) {
  const bounds = getSelectedNodesTransformBounds(
    selectedPaths,
    selectedNodeIds,
    vp,
    handleSettings
  );
  if (!bounds) return;

  ctx.save();
  const invZ = 1 / vp.zoom;
  const scale = getHandleScaleFactor(handleSettings);
  const theme = HANDLE_COLOR_THEMES[handleSettings.accentColor ?? 'blue'];

  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = 1.25 * invZ;
  ctx.setLineDash([5 * invZ, 4 * invZ]);
  ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
  ctx.setLineDash([]);

  if (handleSettings.showRotationHandle !== false) {
    const rotDist = getRotationHandleDistanceWorld(vp.zoom, handleSettings);
    const rotPt = { x: bounds.cx, y: bounds.minY - rotDist };
    ctx.beginPath();
    ctx.moveTo(bounds.cx, bounds.minY);
    ctx.lineTo(rotPt.x, rotPt.y);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 1.5 * invZ;
    ctx.beginPath();
    ctx.arc(rotPt.x, rotPt.y, 4.6 * scale * invZ, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const corners: Point[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
  const hs = 4.2 * scale * invZ;
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 1.5 * invZ;
  for (const c of corners) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(c.x - hs, c.y - hs, hs * 2, hs * 2);
    ctx.strokeRect(c.x - hs, c.y - hs, hs * 2, hs * 2);
  }

  ctx.restore();
}
