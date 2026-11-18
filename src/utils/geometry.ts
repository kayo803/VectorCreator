import {
  AnchorNode,
  BoundingBox,
  CanvasElement,
  PathSubpath,
  PencilPrecision,
  PerspectiveConfig,
  Point,
  ShapeKind,
  SymmetryConfig,
  VectorPathElement,
  ViewportTransform,
} from '../types/vector';

let idCounter = 0;
export function createId(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function screenToWorld(
  screenPt: Point,
  vp: ViewportTransform,
  viewportCenter: Point
): Point {
  // Screen = center + rotate(world * zoom) + (vp.x, vp.y) - center?
  // Let's define transform cleanly:
  // screen = (vp.x, vp.y) + viewportCenter + rotate((world) * vp.zoom, vp.rotation)
  const dx = screenPt.x - (viewportCenter.x + vp.x);
  const dy = screenPt.y - (viewportCenter.y + vp.y);
  const cos = Math.cos(-vp.rotation);
  const sin = Math.sin(-vp.rotation);
  return {
    x: (dx * cos - dy * sin) / vp.zoom,
    y: (dx * sin + dy * cos) / vp.zoom,
  };
}

export function worldToScreen(
  worldPt: Point,
  vp: ViewportTransform,
  viewportCenter: Point
): Point {
  const cos = Math.cos(vp.rotation);
  const sin = Math.sin(vp.rotation);
  const sx = worldPt.x * vp.zoom;
  const sy = worldPt.y * vp.zoom;
  return {
    x: viewportCenter.x + vp.x + (sx * cos - sy * sin),
    y: viewportCenter.y + vp.y + (sx * sin + sy * cos),
  };
}

export function snapToGrid(pt: Point, gridSize: number): Point {
  return {
    x: Math.round(pt.x / gridSize) * gridSize,
    y: Math.round(pt.y / gridSize) * gridSize,
  };
}

export function snapToPerspective(
  start: Point,
  current: Point,
  perspective: PerspectiveConfig
): Point {
  if (perspective.mode === 'none' || !perspective.snapToGuides) return current;

  const candidates: Point[] = [];
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return current;

  const projectOntoRay = (target: Point) => {
    const rx = target.x - start.x;
    const ry = target.y - start.y;
    const rLen = Math.hypot(rx, ry);
    if (rLen < 1e-3) return current;
    const ux = rx / rLen;
    const uy = ry / rLen;
    const proj = dx * ux + dy * uy;
    return { x: start.x + ux * proj, y: start.y + uy * proj };
  };

  const projectOntoAngle = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const proj = dx * ux + dy * uy;
    return { x: start.x + ux * proj, y: start.y + uy * proj };
  };

  if (perspective.mode === 'isometric') {
    candidates.push(
      projectOntoAngle(30),
      projectOntoAngle(150),
      projectOntoAngle(90),
      projectOntoAngle(0)
    );
  } else {
    // Vertical and horizontal
    candidates.push({ x: start.x, y: current.y });
    if (perspective.mode === '1-point') {
      candidates.push({ x: current.x, y: start.y });
      candidates.push(projectOntoRay(perspective.vp1));
    } else if (perspective.mode === '2-point') {
      candidates.push(projectOntoRay(perspective.vp1));
      candidates.push(projectOntoRay(perspective.vp2));
    } else if (perspective.mode === '3-point') {
      candidates.push(projectOntoRay(perspective.vp1));
      candidates.push(projectOntoRay(perspective.vp2));
      candidates.push(projectOntoRay(perspective.vp3));
    }
  }

  let best = current;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = distance(current, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// Ramer-Douglas-Peucker simplification
function perpendicularDist(pt: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return distance(pt, lineStart);
  return Math.abs(dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / mag;
}

export function simplifyPoints<T extends Point>(points: T[], epsilon: number): T[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDist(points[i], points[0], points[end]);
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPoints(points.slice(0, index + 1), epsilon);
    const right = simplifyPoints(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}

// Convert freehand points into smooth cubic Bezier AnchorNodes using pre-smoothing + zoom-aware simplification + bisector Catmull-Rom fitting
export function pointsToBezierNodes(
  rawPoints: Array<Point & { pressure?: number }>,
  smoothingPercent: number,
  closed = false,
  precision: PencilPrecision = 'normal',
  zoom = 1
): AnchorNode[] {
  if (rawPoints.length === 0) return [];
  if (rawPoints.length === 1) {
    return [
      {
        id: createId('n'),
        x: rawPoints[0].x,
        y: rawPoints[0].y,
        type: 'corner',
        pressure: rawPoints[0].pressure ?? 0.7,
      },
    ];
  }

  const s = Math.max(0, Math.min(100, smoothingPercent)) / 100;
  const safeZoom = Math.max(0.08, zoom);
  const invZoom = 1 / safeZoom;

  // 1. Pre-smooth raw pointer jitter with non-shrinking Taubin passes.
  // Only wrap start/end in Taubin smoothing when start & end actually meet;
  // otherwise keep endpoints pinned so fill-only / auto-closed open arcs don't bowtie.
  let pre: Array<{ x: number; y: number; pressure?: number }> = rawPoints.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: p.pressure,
  }));
  const naturalCloseDist = Math.max(18 * invZoom, 2);
  const isNaturallyClosed =
    closed &&
    pre.length >= 4 &&
    distance(pre[0], pre[pre.length - 1]) <= naturalCloseDist;

  const exactPrePasses =
    s <= 0.001
      ? 0
      : precision === 'fine'
      ? 0.5 + s * 3.5
      : precision === 'coarse'
      ? 2.0 + s * 8.0
      : 1.0 + s * 6.0;
  const fullPrePasses = Math.floor(exactPrePasses);
  const fracPrePass = exactPrePasses - fullPrePasses;

  const runTaubinPass = (
    input: Array<{ x: number; y: number; pressure?: number }>
  ) => {
    const lambda = 0.42;
    const mu = -0.43;
    const len = input.length;
    const step1 = input.map((p, i) => {
      if (!isNaturallyClosed && (i === 0 || i === len - 1)) return p;
      const prev = input[(i - 1 + len) % len];
      const next = input[(i + 1) % len];
      return {
        ...p,
        x: p.x + lambda * ((prev.x + next.x) * 0.5 - p.x),
        y: p.y + lambda * ((prev.y + next.y) * 0.5 - p.y),
      };
    });
    return step1.map((p, i) => {
      if (!isNaturallyClosed && (i === 0 || i === len - 1)) return p;
      const prev = step1[(i - 1 + len) % len];
      const next = step1[(i + 1) % len];
      return {
        ...p,
        x: p.x + mu * ((prev.x + next.x) * 0.5 - p.x),
        y: p.y + mu * ((prev.y + next.y) * 0.5 - p.y),
      };
    });
  };

  if (pre.length >= 4 && exactPrePasses > 0) {
    for (let pass = 0; pass < fullPrePasses; pass++) {
      pre = runTaubinPass(pre);
    }
    if (fracPrePass > 0.001) {
      const nextPass = runTaubinPass(pre);
      pre = pre.map((p, i) => ({
        ...p,
        x: lerp(p.x, nextPass[i].x, fracPrePass),
        y: lerp(p.y, nextPass[i].y, fracPrePass),
      }));
    }
  }

  // 2. Zoom-aware Ramer-Douglas-Peucker simplification (measured in screen px, converted to world units)
  const epsilonPx =
    precision === 'fine'
      ? 0.45 + s * 1.9
      : precision === 'coarse'
      ? 1.6 + s * 8.0
      : 0.85 + s * 4.2;
  const epsilon = epsilonPx * invZoom;

  let pts = closed && pre.length > 3
    ? simplifyPoints([...pre, pre[0]], epsilon).slice(0, -1)
    : simplifyPoints(pre, epsilon);

  if (closed && pts.length > 3 && distance(pts[0], pts[pts.length - 1]) < epsilon * 0.75) {
    pts = pts.slice(0, -1);
  }

  // Ensure closed / fill-only curves with real geometry never collapse to 1-2 degenerate nodes
  if (closed && pre.length >= 3 && pts.length < 3) {
    if (pts.length === 1) {
      let farIdx = 0;
      let maxD = 0;
      for (let i = 1; i < pre.length; i++) {
        const d = distance(pts[0], pre[i]);
        if (d > maxD) {
          maxD = d;
          farIdx = i;
        }
      }
      if (maxD > 0.05 * invZoom && farIdx > 0) {
        pts = [pts[0], pre[farIdx]];
      }
    }
    if (pts.length === 2) {
      let bestIdx = -1;
      let bestPerp = 0.05 * invZoom;
      for (let i = 1; i < pre.length - 1; i++) {
        const d = perpendicularDist(pre[i], pts[0], pts[1]);
        if (d > bestPerp) {
          bestPerp = d;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        pts = [pts[0], pre[bestIdx], pts[1]];
      }
    }
  }

  if (pts.length <= 1) {
    return [
      {
        id: createId('n'),
        x: rawPoints[0].x,
        y: rawPoints[0].y,
        type: 'corner',
        pressure: rawPoints[0].pressure ?? 0.7,
      },
    ];
  }

  // 3. Smooth C1 cubic Bezier fitting using normalized chord-bisector tangents
  const tension =
    s <= 0.001
      ? 0
      : s <= 0.1
      ? (s / 0.1) * 0.28
      : 0.28 + ((s - 0.1) / 0.9) * 0.14;
  const n = pts.length;
  const nodes: AnchorNode[] = [];

  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    if (tension === 0 || (!closed && (i === 0 || i === n - 1))) {
      nodes.push({
        id: createId('n'),
        x: curr.x,
        y: curr.y,
        type: tension === 0 ? 'corner' : 'smooth',
        pressure: curr.pressure ?? 0.7,
      });
      continue;
    }

    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const d1 = distance(prev, curr);
    const d2 = distance(curr, next);
    if (d1 < 1e-6 || d2 < 1e-6) {
      nodes.push({
        id: createId('n'),
        x: curr.x,
        y: curr.y,
        type: 'smooth',
        pressure: curr.pressure ?? 0.7,
      });
      continue;
    }

    const v1x = (curr.x - prev.x) / d1;
    const v1y = (curr.y - prev.y) / d1;
    const v2x = (next.x - curr.x) / d2;
    const v2y = (next.y - curr.y) / d2;
    const dot = v1x * v2x + v1y * v2y;

    // Preserve intentional sharp cusps (> ~110° turn), keep all smooth turns genuinely C1
    if (dot < -0.35) {
      nodes.push({
        id: createId('n'),
        x: curr.x,
        y: curr.y,
        type: 'corner',
        pressure: curr.pressure ?? 0.7,
      });
      continue;
    }

    let tx = v1x + v2x;
    let ty = v1y + v2y;
    let tLen = Math.hypot(tx, ty);
    if (tLen < 1e-5) {
      tx = next.x - prev.x;
      ty = next.y - prev.y;
      tLen = Math.hypot(tx, ty) || 1;
    }
    const ux = tx / tLen;
    const uy = ty / tLen;

    const handleInLen = Math.min(d1 * tension, d1 * 0.45);
    const handleOutLen = Math.min(d2 * tension, d2 * 0.45);

    nodes.push({
      id: createId('n'),
      x: curr.x,
      y: curr.y,
      handleIn: {
        x: curr.x - ux * handleInLen,
        y: curr.y - uy * handleInLen,
      },
      handleOut: {
        x: curr.x + ux * handleOutLen,
        y: curr.y + uy * handleOutLen,
      },
      type: 'smooth',
      pressure: curr.pressure ?? 0.7,
    });
  }

  // 4. Relaxed cubic spline boundary tangents for open endpoints
  if (!closed && tension > 0 && nodes.length >= 2) {
    const first = nodes[0];
    const second = nodes[1];
    if (second.handleIn) {
      first.handleOut = {
        x: first.x + (second.handleIn.x - first.x) * 0.52,
        y: first.y + (second.handleIn.y - first.y) * 0.52,
      };
    } else if (nodes.length === 2) {
      first.handleOut = lerpPoint(first, second, 0.33);
    }

    const last = nodes[nodes.length - 1];
    const beforeLast = nodes[nodes.length - 2];
    if (beforeLast.handleOut) {
      last.handleIn = {
        x: last.x + (beforeLast.handleOut.x - last.x) * 0.52,
        y: last.y + (beforeLast.handleOut.y - last.y) * 0.52,
      };
    } else if (nodes.length === 2) {
      last.handleIn = lerpPoint(last, beforeLast, 0.33);
    }
  }

  return nodes;
}

export function getPathContours(el: VectorPathElement): PathSubpath[] {
  if (el.subpaths && el.subpaths.length > 0) {
    return el.subpaths;
  }
  return [{ nodes: el.nodes, closed: el.closed }];
}

export function nodesToSvgPathD(nodes: AnchorNode[], closed: boolean): string {
  if (nodes.length === 0) return '';
  const first = nodes[0];
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  for (let i = 0; i < nodes.length - 1; i++) {
    const curr = nodes[i];
    const next = nodes[i + 1];
    if (curr.handleOut || next.handleIn) {
      const c1 = curr.handleOut ?? curr;
      const c2 = next.handleIn ?? next;
      d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    } else {
      d += ` L ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    }
  }

  if (closed && nodes.length > 1) {
    const last = nodes[nodes.length - 1];
    if (last.handleOut || first.handleIn) {
      const c1 = last.handleOut ?? last;
      const c2 = first.handleIn ?? first;
      d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
    }
    d += ' Z';
  }
  return d;
}

export function pathElementToSvgPathD(el: VectorPathElement): string {
  return getPathContours(el)
    .map((sp) => nodesToSvgPathD(sp.nodes, sp.closed))
    .filter(Boolean)
    .join(' ');
}

export function buildShapeNodes(
  shapeKind: ShapeKind,
  start: Point,
  end: Point,
  options: { polygonSides: number; starPoints: number; starInnerRatio: number }
): { nodes: AnchorNode[]; closed: boolean } {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  if (shapeKind === 'rect') {
    return {
      closed: true,
      nodes: [
        { id: createId('n'), x: minX, y: minY, type: 'corner' },
        { id: createId('n'), x: maxX, y: minY, type: 'corner' },
        { id: createId('n'), x: maxX, y: maxY, type: 'corner' },
        { id: createId('n'), x: minX, y: maxY, type: 'corner' },
      ],
    };
  }

  if (shapeKind === 'ellipse') {
    const rx = w / 2;
    const ry = h / 2;
    const k = 0.5522847498; // Bezier circle magic constant
    const kx = rx * k;
    const ky = ry * k;
    return {
      closed: true,
      nodes: [
        {
          id: createId('n'),
          x: cx,
          y: minY,
          handleIn: { x: cx - kx, y: minY },
          handleOut: { x: cx + kx, y: minY },
          type: 'smooth',
        },
        {
          id: createId('n'),
          x: maxX,
          y: cy,
          handleIn: { x: maxX, y: cy - ky },
          handleOut: { x: maxX, y: cy + ky },
          type: 'smooth',
        },
        {
          id: createId('n'),
          x: cx,
          y: maxY,
          handleIn: { x: cx + kx, y: maxY },
          handleOut: { x: cx - kx, y: maxY },
          type: 'smooth',
        },
        {
          id: createId('n'),
          x: minX,
          y: cy,
          handleIn: { x: minX, y: cy + ky },
          handleOut: { x: minX, y: cy - ky },
          type: 'smooth',
        },
      ],
    };
  }

  if (shapeKind === 'polygon') {
    const sides = Math.max(3, Math.min(24, options.polygonSides));
    const rx = w / 2;
    const ry = h / 2;
    const nodes: AnchorNode[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        id: createId('n'),
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
        type: 'corner',
      });
    }
    return { closed: true, nodes };
  }

  if (shapeKind === 'star') {
    const pts = Math.max(3, Math.min(24, options.starPoints));
    const outerRx = w / 2;
    const outerRy = h / 2;
    const innerRx = outerRx * options.starInnerRatio;
    const innerRy = outerRy * options.starInnerRatio;
    const nodes: AnchorNode[] = [];
    for (let i = 0; i < pts * 2; i++) {
      const angle = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
      const isOuter = i % 2 === 0;
      const rx = isOuter ? outerRx : innerRx;
      const ry = isOuter ? outerRy : innerRy;
      nodes.push({
        id: createId('n'),
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
        type: 'corner',
      });
    }
    return { closed: true, nodes };
  }

  if (shapeKind === 'line') {
    return {
      closed: false,
      nodes: [
        { id: createId('n'), x: start.x, y: start.y, type: 'corner' },
        { id: createId('n'), x: end.x, y: end.y, type: 'corner' },
      ],
    };
  }

  // arrow
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.min(28, len * 0.32);
  const headW = headLen * 0.55;
  const baseX = end.x - ux * headLen;
  const baseY = end.y - uy * headLen;
  const px = -uy;
  const py = ux;

  return {
    closed: false,
    nodes: [
      { id: createId('n'), x: start.x, y: start.y, type: 'corner' },
      { id: createId('n'), x: end.x, y: end.y, type: 'corner' },
      { id: createId('n'), x: baseX + px * headW, y: baseY + py * headW, type: 'corner' },
      { id: createId('n'), x: end.x, y: end.y, type: 'corner' },
      { id: createId('n'), x: baseX - px * headW, y: baseY - py * headW, type: 'corner' },
    ],
  };
}

// Sample cubic Bezier at t
export function evalCubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

export function flattenPathPoints(
  nodes: AnchorNode[],
  closed: boolean,
  stepsPerSegment = 14
): Array<Point & { pressure: number }> {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [{ x: nodes[0].x, y: nodes[0].y, pressure: nodes[0].pressure ?? 0.7 }];
  }
  const out: Array<Point & { pressure: number }> = [];
  const segCount = closed ? nodes.length : nodes.length - 1;

  for (let i = 0; i < segCount; i++) {
    const curr = nodes[i];
    const next = nodes[(i + 1) % nodes.length];
    const pCurr = curr.pressure ?? 0.7;
    const pNext = next.pressure ?? 0.7;

    if (curr.handleOut || next.handleIn) {
      const c1 = curr.handleOut ?? curr;
      const c2 = next.handleIn ?? next;
      for (let s = 0; s < stepsPerSegment; s++) {
        const t = s / stepsPerSegment;
        const pt = evalCubic(curr, c1, c2, next, t);
        out.push({ ...pt, pressure: lerp(pCurr, pNext, t) });
      }
    } else {
      out.push({ x: curr.x, y: curr.y, pressure: pCurr });
    }
  }
  if (!closed) {
    const last = nodes[nodes.length - 1];
    out.push({ x: last.x, y: last.y, pressure: last.pressure ?? 0.7 });
  }
  return out;
}

export function getElementBounds(el: CanvasElement): BoundingBox {
  if (el.kind === 'image') {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    if (!el.rotation) {
      return {
        minX: el.x,
        minY: el.y,
        maxX: el.x + el.width,
        maxY: el.y + el.height,
        width: el.width,
        height: el.height,
        cx,
        cy,
      };
    }
    const cos = Math.cos(el.rotation);
    const sin = Math.sin(el.rotation);
    const hw = el.width / 2;
    const hh = el.height / 2;
    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ].map((c) => ({
      x: cx + c.x * cos - c.y * sin,
      y: cy + c.x * sin + c.y * cos,
    }));
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      cx,
      cy,
    };
  }

  if (el.kind === 'text') {
    const estW = Math.max(24, el.text.length * el.fontSize * 0.56);
    const estH = el.fontSize * 1.25;
    let minX = el.x;
    if (el.align === 'center') minX = el.x - estW / 2;
    else if (el.align === 'right') minX = el.x - estW;
    const minY = el.y - el.fontSize * 0.9;
    return {
      minX,
      minY,
      maxX: minX + estW,
      maxY: minY + estH,
      width: estW,
      height: estH,
      cx: minX + estW / 2,
      cy: minY + estH / 2,
    };
  }

  const contours = getPathContours(el);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let anyPt = false;
  for (const contour of contours) {
    const pts = flattenPathPoints(contour.nodes, contour.closed, 10);
    for (const p of pts) {
      anyPt = true;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!anyPt) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };
  }
  // Ensure minimum hit area for straight lines
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

export function getCombinedBounds(elements: CanvasElement[]): BoundingBox | null {
  if (elements.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    const b = getElementBounds(el);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(pt: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return distance(pt, a);
  let t = ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(pt, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

export function hitTestElement(el: CanvasElement, pt: Point, tolerance = 8): boolean {
  if (!el.visible) return false;
  const b = getElementBounds(el);
  const pad = tolerance + (el.stroke.paint.type !== 'none' ? el.stroke.width / 2 : 0);
  if (pt.x < b.minX - pad || pt.x > b.maxX + pad || pt.y < b.minY - pad || pt.y > b.maxY + pad) {
    return false;
  }

  if (el.kind === 'text') return true;

  if (el.kind === 'image') {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const cos = Math.cos(-(el.rotation || 0));
    const sin = Math.sin(-(el.rotation || 0));
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return (
      Math.abs(lx) <= el.width / 2 + pad &&
      Math.abs(ly) <= el.height / 2 + pad
    );
  }

  const contours = getPathContours(el);
  if (el.fill.type !== 'none') {
    let insideCount = 0;
    for (const contour of contours) {
      const poly = flattenPathPoints(contour.nodes, contour.closed, 12);
      if (poly.length >= 3 && pointInPolygon(pt, poly)) {
        insideCount += 1;
      }
    }
    if (el.fillRule === 'evenodd') {
      if (insideCount % 2 === 1) return true;
    } else if (insideCount > 0) {
      return true;
    }
  }

  const strokeTol = Math.max(tolerance, el.stroke.width / 2 + 4);
  for (const contour of contours) {
    const poly = flattenPathPoints(contour.nodes, contour.closed, 12);
    if (poly.length === 0) continue;
    const count = contour.closed ? poly.length : poly.length - 1;
    for (let i = 0; i < count; i++) {
      const a = poly[i];
      const bPt = poly[(i + 1) % poly.length];
      if (distToSegment(pt, a, bPt) <= strokeTol) return true;
    }
  }
  return false;
}

function mapPathNodes(
  el: VectorPathElement,
  mapNode: (n: AnchorNode) => AnchorNode
): Pick<VectorPathElement, 'nodes' | 'subpaths'> {
  if (el.subpaths && el.subpaths.length > 0) {
    const nextSubpaths = el.subpaths.map((sp) => ({
      ...sp,
      nodes: sp.nodes.map(mapNode),
    }));
    return {
      nodes: nextSubpaths[0].nodes,
      subpaths: nextSubpaths,
    };
  }
  return {
    nodes: el.nodes.map(mapNode),
    subpaths: undefined,
  };
}

export function translateElement(el: CanvasElement, dx: number, dy: number): CanvasElement {
  if (el.kind === 'text' || el.kind === 'image') {
    return { ...el, x: el.x + dx, y: el.y + dy };
  }
  const mapped = mapPathNodes(el, (n) => ({
    ...n,
    x: n.x + dx,
    y: n.y + dy,
    handleIn: n.handleIn ? { x: n.handleIn.x + dx, y: n.handleIn.y + dy } : undefined,
    handleOut: n.handleOut ? { x: n.handleOut.x + dx, y: n.handleOut.y + dy } : undefined,
  }));
  return {
    ...el,
    ...mapped,
  };
}

export function cloneElementWithFreshIds(
  el: CanvasElement,
  dx = 0,
  dy = 0
): CanvasElement {
  const clonePaint = (paint: CanvasElement['fill']): CanvasElement['fill'] => ({
    ...paint,
    gradient: {
      ...paint.gradient,
      stops: [
        { ...paint.gradient.stops[0] },
        { ...paint.gradient.stops[1] },
      ],
    },
  });

  const cloneStroke = (stroke: CanvasElement['stroke']): CanvasElement['stroke'] => ({
    ...stroke,
    paint: clonePaint(stroke.paint),
  });

  const base = {
    ...el,
    id: createId(el.kind),
    fill: clonePaint(el.fill),
    stroke: cloneStroke(el.stroke),
  };

  if (base.kind === 'text' || base.kind === 'image') {
    return {
      ...base,
      x: base.x + dx,
      y: base.y + dy,
    };
  }

  const cloneNode = (n: AnchorNode): AnchorNode => ({
    ...n,
    id: createId('n'),
    x: n.x + dx,
    y: n.y + dy,
    handleIn: n.handleIn ? { x: n.handleIn.x + dx, y: n.handleIn.y + dy } : undefined,
    handleOut: n.handleOut ? { x: n.handleOut.x + dx, y: n.handleOut.y + dy } : undefined,
  });

  if (base.subpaths && base.subpaths.length > 0) {
    const nextSubpaths = base.subpaths.map((sp) => ({
      ...sp,
      nodes: sp.nodes.map(cloneNode),
    }));
    return {
      ...base,
      nodes: nextSubpaths[0].nodes,
      subpaths: nextSubpaths,
    };
  }

  return {
    ...base,
    nodes: base.nodes.map(cloneNode),
    subpaths: undefined,
  };
}

export function scaleElement(
  el: CanvasElement,
  origin: Point,
  sx: number,
  sy: number
): CanvasElement {
  const scalePt = (p: Point): Point => ({
    x: origin.x + (p.x - origin.x) * sx,
    y: origin.y + (p.y - origin.y) * sy,
  });

  if (el.kind === 'image') {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const nextCenter = scalePt({ x: cx, y: cy });
    const nextW = Math.max(8, el.width * Math.abs(sx));
    const nextH = Math.max(8, el.height * Math.abs(sy));
    return {
      ...el,
      x: nextCenter.x - nextW / 2,
      y: nextCenter.y - nextH / 2,
      width: nextW,
      height: nextH,
      flipX: sx < 0 ? !el.flipX : el.flipX,
      flipY: sy < 0 ? !el.flipY : el.flipY,
    };
  }

  if (el.kind === 'text') {
    const nextPos = scalePt({ x: el.x, y: el.y });
    const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2;
    return {
      ...el,
      x: nextPos.x,
      y: nextPos.y,
      fontSize: Math.max(8, Math.round(el.fontSize * avgScale)),
    };
  }

  const mapped = mapPathNodes(el, (n) => {
    const p = scalePt(n);
    return {
      ...n,
      x: p.x,
      y: p.y,
      handleIn: n.handleIn ? scalePt(n.handleIn) : undefined,
      handleOut: n.handleOut ? scalePt(n.handleOut) : undefined,
    };
  });
  return {
    ...el,
    ...mapped,
  };
}

export function rotateElement(el: CanvasElement, origin: Point, angleRad: number): CanvasElement {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const rotPt = (p: Point): Point => {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    return {
      x: origin.x + dx * cos - dy * sin,
      y: origin.y + dx * sin + dy * cos,
    };
  };

  if (el.kind === 'image') {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const nextCenter = rotPt({ x: cx, y: cy });
    return {
      ...el,
      x: nextCenter.x - el.width / 2,
      y: nextCenter.y - el.height / 2,
      rotation: (el.rotation || 0) + angleRad,
    };
  }

  if (el.kind === 'text') {
    const p = rotPt({ x: el.x, y: el.y });
    return { ...el, x: p.x, y: p.y, rotation: el.rotation + angleRad };
  }

  const mapped = mapPathNodes(el, (n) => {
    const p = rotPt(n);
    return {
      ...n,
      x: p.x,
      y: p.y,
      handleIn: n.handleIn ? rotPt(n.handleIn) : undefined,
      handleOut: n.handleOut ? rotPt(n.handleOut) : undefined,
    };
  });
  return {
    ...el,
    ...mapped,
  };
}

// Generate mirrored/rotated symmetry copies of a VectorPathElement!
export function generateSymmetryElements(
  base: VectorPathElement,
  symmetry: SymmetryConfig
): VectorPathElement[] {
  if (symmetry.mode === 'none') return [base];
  const c = symmetry.center;

  const mirrorPtX = (p: Point): Point => ({ x: 2 * c.x - p.x, y: p.y });
  const mirrorPtY = (p: Point): Point => ({ x: p.x, y: 2 * c.y - p.y });
  const rotPt = (p: Point, rad: number): Point => {
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  };

  const mapElementNodes = (fn: (p: Point) => Point) =>
    mapPathNodes(base, (n) => {
      const p = fn(n);
      return {
        ...n,
        id: createId('n'),
        x: p.x,
        y: p.y,
        handleIn: n.handleIn ? fn(n.handleIn) : undefined,
        handleOut: n.handleOut ? fn(n.handleOut) : undefined,
      };
    });

  if (symmetry.mode === 'vertical') {
    return [
      base,
      {
        ...base,
        id: createId('path'),
        name: `${base.name} (Spiegel)`,
        ...mapElementNodes(mirrorPtX),
      },
    ];
  }

  if (symmetry.mode === 'horizontal') {
    return [
      base,
      {
        ...base,
        id: createId('path'),
        name: `${base.name} (Spiegel)`,
        ...mapElementNodes(mirrorPtY),
      },
    ];
  }

  // radial
  const count = Math.max(3, Math.min(12, symmetry.segments));
  const result: VectorPathElement[] = [base];
  for (let i = 1; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    result.push({
      ...base,
      id: createId('path'),
      name: `${base.name} (${i + 1})`,
      ...mapElementNodes((p) => rotPt(p, angle)),
    });
  }
  return result;
}

export function polylineLength(pts: Point[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += distance(pts[i - 1], pts[i]);
  }
  return total;
}

export function reverseAnchorNodes(nodes: AnchorNode[]): AnchorNode[] {
  return [...nodes].reverse().map((n) => ({
    ...n,
    handleIn: n.handleOut ? { ...n.handleOut } : undefined,
    handleOut: n.handleIn ? { ...n.handleIn } : undefined,
  }));
}

export interface OpenEndpointMatch {
  element: VectorPathElement;
  end: 'start' | 'end';
  point: Point;
}

export function findNearestOpenEndpoint(
  elements: CanvasElement[],
  pt: Point,
  radius: number,
  excludeId?: string
): OpenEndpointMatch | null {
  let best: OpenEndpointMatch | null = null;
  let bestDist = radius;

  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (
      el.kind !== 'path' ||
      !el.visible ||
      el.closed ||
      (el.subpaths && el.subpaths.length > 0) ||
      el.nodes.length < 2 ||
      el.id === excludeId
    ) {
      continue;
    }

    const startNode = el.nodes[0];
    const dStart = distance(pt, startNode);
    if (dStart <= bestDist) {
      bestDist = dStart;
      best = {
        element: el,
        end: 'start',
        point: { x: startNode.x, y: startNode.y },
      };
    }

    const endNode = el.nodes[el.nodes.length - 1];
    const dEnd = distance(pt, endNode);
    if (dEnd <= bestDist) {
      bestDist = dEnd;
      best = {
        element: el,
        end: 'end',
        point: { x: endNode.x, y: endNode.y },
      };
    }
  }

  return best;
}

export function mergeAnchorNodeChains(
  first: AnchorNode[],
  second: AnchorNode[]
): AnchorNode[] {
  if (first.length === 0) return second;
  if (second.length === 0) return first;
  const joinLeft = first[first.length - 1];
  const joinRight = second[0];
  const mergedJoin: AnchorNode = {
    ...joinLeft,
    handleOut: joinRight.handleOut ?? joinLeft.handleOut,
    type: joinLeft.handleIn && joinRight.handleOut ? 'smooth' : 'corner',
  };
  return [...first.slice(0, -1), mergedJoin, ...second.slice(1)];
}

function subdivideContour(nodes: AnchorNode[], closed: boolean): AnchorNode[] {
  if (nodes.length < 2 || nodes.length >= 400) return nodes;

  const working: AnchorNode[] = nodes.map((n) => ({
    ...n,
    handleIn: n.handleIn ? { ...n.handleIn } : undefined,
    handleOut: n.handleOut ? { ...n.handleOut } : undefined,
  }));

  const out: AnchorNode[] = [];
  const segCount = closed ? working.length : working.length - 1;

  for (let i = 0; i < segCount; i++) {
    const curr = working[i];
    const next = working[(i + 1) % working.length];
    const hasCurve = Boolean(curr.handleOut || next.handleIn);

    if (!hasCurve) {
      out.push(curr);
      out.push({
        id: createId('n'),
        x: (curr.x + next.x) / 2,
        y: (curr.y + next.y) / 2,
        type: 'corner',
      });
    } else {
      const p0 = curr;
      const p1 = curr.handleOut ?? curr;
      const p2 = next.handleIn ?? next;
      const p3 = next;

      const q0 = lerpPoint(p0, p1, 0.5);
      const q1 = lerpPoint(p1, p2, 0.5);
      const q2 = lerpPoint(p2, p3, 0.5);
      const r0 = lerpPoint(q0, q1, 0.5);
      const r1 = lerpPoint(q1, q2, 0.5);
      const s = lerpPoint(r0, r1, 0.5);

      curr.handleOut = q0;
      next.handleIn = q2;

      out.push(curr);
      out.push({
        id: createId('n'),
        x: s.x,
        y: s.y,
        handleIn: r0,
        handleOut: r1,
        type: 'smooth',
      });
    }
  }

  if (!closed) {
    out.push(working[working.length - 1]);
  }
  return out;
}

function evalCubicPt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

function evalCubicPrime(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x:
      3 * mt * mt * (p1.x - p0.x) +
      6 * mt * t * (p2.x - p1.x) +
      3 * t * t * (p3.x - p2.x),
    y:
      3 * mt * mt * (p1.y - p0.y) +
      6 * mt * t * (p2.y - p1.y) +
      3 * t * t * (p3.y - p2.y),
  };
}

function evalCubicSecond(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: 6 * mt * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x),
    y: 6 * mt * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y),
  };
}

function sampleSegmentPoints(a: AnchorNode, b: AnchorNode): Point[] {
  const hasCurve = Boolean(a.handleOut || b.handleIn);
  const steps = hasCurve ? 12 : 6;
  const pts: Point[] = [{ x: a.x, y: a.y }];
  if (!hasCurve) {
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      pts.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
    }
  } else {
    const p1 = a.handleOut ?? a;
    const p2 = b.handleIn ?? b;
    for (let i = 1; i < steps; i++) {
      pts.push(evalCubicPt(a, p1, p2, b, i / steps));
    }
  }
  pts.push({ x: b.x, y: b.y });
  return pts;
}

function downsampleSamplesPreservingEnds(pts: Point[], maxPts = 48): Point[] {
  if (pts.length <= maxPts) return pts;
  const out: Point[] = [pts[0]];
  const step = (pts.length - 1) / (maxPts - 1);
  for (let i = 1; i < maxPts - 1; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function normalizeVec(dx: number, dy: number): Point | null {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

function sampleEndpointTangent(samples: Point[], fromStart: boolean): Point {
  const n = samples.length;
  if (n < 2) return { x: 1, y: 0 };
  if (fromStart) {
    const origin = samples[0];
    for (let i = 1; i < n; i++) {
      const v = normalizeVec(samples[i].x - origin.x, samples[i].y - origin.y);
      if (v) return v;
    }
    return { x: 1, y: 0 };
  }
  const origin = samples[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    const v = normalizeVec(samples[i].x - origin.x, samples[i].y - origin.y);
    if (v) return v;
  }
  return { x: -1, y: 0 };
}

function solveCubicHandleLengths(
  samples: Point[],
  u: number[],
  p0: Point,
  p3: Point,
  tHat1: Point,
  tHat2: Point,
  chord: number
): { alpha1: number; alpha2: number } {
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  for (let i = 1; i < samples.length - 1; i++) {
    const t = u[i];
    const mt = 1 - t;
    const b0 = mt * mt * mt;
    const b1 = 3 * mt * mt * t;
    const b2 = 3 * mt * t * t;
    const b3 = t * t * t;

    const a1x = b1 * tHat1.x;
    const a1y = b1 * tHat1.y;
    const a2x = b2 * tHat2.x;
    const a2y = b2 * tHat2.y;

    const rx = samples[i].x - ((b0 + b1) * p0.x + (b2 + b3) * p3.x);
    const ry = samples[i].y - ((b0 + b1) * p0.y + (b2 + b3) * p3.y);

    c00 += a1x * a1x + a1y * a1y;
    c01 += a1x * a2x + a1y * a2y;
    c11 += a2x * a2x + a2y * a2y;
    x0 += rx * a1x + ry * a1y;
    x1 += rx * a2x + ry * a2y;
  }

  const det = c00 * c11 - c01 * c01;
  let alpha1 = chord / 3;
  let alpha2 = chord / 3;

  if (Math.abs(det) > 1e-9) {
    alpha1 = (x0 * c11 - x1 * c01) / det;
    alpha2 = (c00 * x1 - c01 * x0) / det;
  } else if (c00 > 1e-9 && c11 > 1e-9) {
    alpha1 = x0 / c00;
    alpha2 = x1 / c11;
  }

  const maxAlpha = Math.max(4, chord * 1.45);
  const eps = 1e-3 * Math.max(1, chord);
  if (!Number.isFinite(alpha1) || !Number.isFinite(alpha2) || alpha1 < eps || alpha2 < eps) {
    const fallback = chord / 3;
    alpha1 = Number.isFinite(alpha1) && alpha1 >= eps ? Math.min(maxAlpha, alpha1) : fallback;
    alpha2 = Number.isFinite(alpha2) && alpha2 >= eps ? Math.min(maxAlpha, alpha2) : fallback;
  } else {
    alpha1 = Math.min(maxAlpha, alpha1);
    alpha2 = Math.min(maxAlpha, alpha2);
  }

  return { alpha1, alpha2 };
}

interface CubicFitResult {
  handleOut?: Point;
  handleIn?: Point;
  maxErr: number;
}

function fitCubicForMergedSamples(
  samples: Point[],
  prev: AnchorNode,
  next: AnchorNode,
  allowCurveHandles: boolean
): CubicFitResult {
  const p0 = { x: prev.x, y: prev.y };
  const p3 = { x: next.x, y: next.y };
  const m = samples.length;

  let straightMaxErr = 0;
  for (let i = 1; i < m - 1; i++) {
    const d = distToSegment(samples[i], p0, p3);
    if (d > straightMaxErr) straightMaxErr = d;
  }

  if (!allowCurveHandles || straightMaxErr <= 0.3) {
    return { handleOut: undefined, handleIn: undefined, maxErr: straightMaxErr };
  }

  const chord = distance(p0, p3);
  if (chord < 1e-4) {
    return { handleOut: undefined, handleIn: undefined, maxErr: straightMaxErr };
  }

  // Chord-length parameterization
  const u = new Array<number>(m);
  u[0] = 0;
  for (let i = 1; i < m; i++) {
    u[i] = u[i - 1] + distance(samples[i - 1], samples[i]);
  }
  const totalLen = u[m - 1] || 1;
  for (let i = 1; i < m - 1; i++) {
    u[i] /= totalLen;
  }
  u[m - 1] = 1;

  // Preserve smooth node tangent continuity when present; otherwise use original curve endpoint tangents
  let tHat1: Point | null = null;
  if (prev.handleOut) {
    tHat1 = normalizeVec(prev.handleOut.x - prev.x, prev.handleOut.y - prev.y);
  }
  if (!tHat1 && prev.type === 'smooth' && prev.handleIn) {
    tHat1 = normalizeVec(prev.x - prev.handleIn.x, prev.y - prev.handleIn.y);
  }
  if (!tHat1) {
    tHat1 = sampleEndpointTangent(samples, true);
  }

  let tHat2: Point | null = null;
  if (next.handleIn) {
    tHat2 = normalizeVec(next.handleIn.x - next.x, next.handleIn.y - next.y);
  }
  if (!tHat2 && next.type === 'smooth' && next.handleOut) {
    tHat2 = normalizeVec(next.x - next.handleOut.x, next.y - next.handleOut.y);
  }
  if (!tHat2) {
    tHat2 = sampleEndpointTangent(samples, false);
  }

  let { alpha1, alpha2 } = solveCubicHandleLengths(samples, u, p0, p3, tHat1, tHat2, chord);
  let p1: Point = { x: p0.x + tHat1.x * alpha1, y: p0.y + tHat1.y * alpha1 };
  let p2: Point = { x: p3.x + tHat2.x * alpha2, y: p3.y + tHat2.y * alpha2 };

  // Two fast Newton reparameterization passes (Schneider curve-fitting refinement)
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 1; i < m - 1; i++) {
      const t = u[i];
      const q = evalCubicPt(p0, p1, p2, p3, t);
      const q1 = evalCubicPrime(p0, p1, p2, p3, t);
      const q2 = evalCubicSecond(p0, p1, p2, p3, t);
      const dx = q.x - samples[i].x;
      const dy = q.y - samples[i].y;
      const num = dx * q1.x + dy * q1.y;
      const den = q1.x * q1.x + q1.y * q1.y + dx * q2.x + dy * q2.y;
      if (Math.abs(den) > 1e-7) {
        const nextU = t - num / den;
        if (nextU > u[i - 1] && nextU < u[i + 1]) {
          u[i] = nextU;
        }
      }
    }
    const refined = solveCubicHandleLengths(samples, u, p0, p3, tHat1, tHat2, chord);
    alpha1 = refined.alpha1;
    alpha2 = refined.alpha2;
    p1 = { x: p0.x + tHat1.x * alpha1, y: p0.y + tHat1.y * alpha1 };
    p2 = { x: p3.x + tHat2.x * alpha2, y: p3.y + tHat2.y * alpha2 };
  }

  let curveMaxErr = 0;
  for (let i = 1; i < m - 1; i++) {
    const fittedPt = evalCubicPt(p0, p1, p2, p3, u[i]);
    const err = distance(samples[i], fittedPt);
    if (err > curveMaxErr) curveMaxErr = err;
  }

  if (straightMaxErr <= curveMaxErr && straightMaxErr <= 0.6) {
    return { handleOut: undefined, handleIn: undefined, maxErr: straightMaxErr };
  }

  return { handleOut: p1, handleIn: p2, maxErr: curveMaxErr };
}

function simplifyContour(nodes: AnchorNode[], closed: boolean): AnchorNode[] {
  const minCount = closed ? 3 : 2;
  if (nodes.length <= minCount) return nodes;

  const working: AnchorNode[] = nodes.map((n) => ({
    ...n,
    handleIn: n.handleIn ? { ...n.handleIn } : undefined,
    handleOut: n.handleOut ? { ...n.handleOut } : undefined,
  }));

  const segCount = closed ? working.length : working.length - 1;
  const segSamples: Point[][] = [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < segCount; i++) {
    const s = sampleSegmentPoints(working[i], working[(i + 1) % working.length]);
    segSamples.push(s);
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);

  const maxRemovable = working.length - minCount;
  const targetRemove = Math.min(
    maxRemovable,
    Math.max(1, Math.round(working.length * 0.3))
  );
  const errorBudget = Math.max(2.5, diag * 0.018);

  const evaluateCandidate = (idx: number) => {
    const len = working.length;
    const prevIdx = (idx - 1 + len) % len;
    const nextIdx = (idx + 1) % len;
    const prev = working[prevIdx];
    const curr = working[idx];
    const next = working[nextIdx];
    const mergedSamples = downsampleSamplesPreservingEnds([
      ...segSamples[prevIdx],
      ...segSamples[idx].slice(1),
    ]);
    const hasCurve = Boolean(
      prev.handleOut || curr.handleIn || curr.handleOut || next.handleIn
    );
    const allowCurveHandles = hasCurve || len >= 6;
    const fit = fitCubicForMergedSamples(mergedSamples, prev, next, allowCurveHandles);

    // Protect sharp corner vertices relative to redundant smooth/collinear nodes
    let cornerPenalty = 1;
    if (curr.type === 'corner') {
      const inVec = curr.handleIn
        ? normalizeVec(curr.x - curr.handleIn.x, curr.y - curr.handleIn.y)
        : normalizeVec(curr.x - prev.x, curr.y - prev.y);
      const outVec = curr.handleOut
        ? normalizeVec(curr.handleOut.x - curr.x, curr.handleOut.y - curr.y)
        : normalizeVec(next.x - curr.x, next.y - curr.y);
      if (inVec && outVec) {
        const dot = Math.max(-1, Math.min(1, inVec.x * outVec.x + inVec.y * outVec.y));
        if (dot < 0.85) {
          cornerPenalty = 1.4;
        }
      }
    }

    return {
      idx,
      score: fit.maxErr * cornerPenalty,
      fit,
      mergedSamples,
    };
  };

  let removedCount = 0;
  while (removedCount < targetRemove && working.length > minCount) {
    const len = working.length;
    let best: ReturnType<typeof evaluateCandidate> | null = null;

    for (let i = 0; i < len; i++) {
      if (!closed && (i === 0 || i === len - 1)) continue;
      const cand = evaluateCandidate(i);
      if (!best || cand.score < best.score) {
        best = cand;
      }
    }

    if (!best) break;
    // After at least 1 reduction, avoid mangling the shape once curve error exceeds budget
    if (removedCount >= 1 && best.fit.maxErr > errorBudget) {
      break;
    }

    const prevIdx = (best.idx - 1 + len) % len;
    const nextIdx = (best.idx + 1) % len;
    working[prevIdx] = {
      ...working[prevIdx],
      handleOut: best.fit.handleOut,
    };
    working[nextIdx] = {
      ...working[nextIdx],
      handleIn: best.fit.handleIn,
    };
    segSamples[prevIdx] = best.mergedSamples;

    working.splice(best.idx, 1);
    segSamples.splice(best.idx, 1);
    removedCount += 1;
  }

  return working;
}

export function subdividePathElement(el: VectorPathElement): VectorPathElement {
  if (el.subpaths && el.subpaths.length > 0) {
    const nextSubpaths = el.subpaths.map((sp) => ({
      ...sp,
      nodes: subdivideContour(sp.nodes, sp.closed),
    }));
    return {
      ...el,
      nodes: nextSubpaths[0].nodes,
      subpaths: nextSubpaths,
    };
  }
  return {
    ...el,
    nodes: subdivideContour(el.nodes, el.closed),
  };
}

export function simplifyPathElement(el: VectorPathElement): VectorPathElement {
  if (el.subpaths && el.subpaths.length > 0) {
    const nextSubpaths = el.subpaths.map((sp) => ({
      ...sp,
      nodes: simplifyContour(sp.nodes, sp.closed),
    }));
    return {
      ...el,
      nodes: nextSubpaths[0].nodes,
      subpaths: nextSubpaths,
    };
  }
  return {
    ...el,
    nodes: simplifyContour(el.nodes, el.closed),
  };
}

function smoothContourFromSource(
  sourceNodes: AnchorNode[],
  closed: boolean,
  smoothingPercent: number
): AnchorNode[] {
  const minCount = closed ? 3 : 2;
  if (sourceNodes.length < 2) return sourceNodes;

  const clamped = Math.max(0, Math.min(100, smoothingPercent));
  const s = clamped / 100;

  // At 0%, keep anchor points sharp with no Bezier tangents
  if (s <= 0.001) {
    return sourceNodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      type: 'corner',
      pressure: n.pressure,
    }));
  }

  // Work on a copy of anchor positions & pressures
  let pts: Array<{ id: string; x: number; y: number; pressure?: number }> =
    sourceNodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      pressure: n.pressure,
    }));

  // 1. Continuous fractional Taubin smoothing (interpolated sub-passes prevent step jumps)
  const exactPasses = pts.length > 4 ? s * 6 : s * 2;
  const fullPasses = Math.floor(exactPasses);
  const fracPass = exactPasses - fullPasses;

  const runTaubinStep = (
    input: Array<{ id: string; x: number; y: number; pressure?: number }>
  ) => {
    const lambda = 0.42;
    const mu = -0.43;
    const n = input.length;
    const step1 = input.map((p, i) => {
      if (!closed && (i === 0 || i === n - 1)) return p;
      const prev = input[(i - 1 + n) % n];
      const next = input[(i + 1) % n];
      const mx = (prev.x + next.x) * 0.5;
      const my = (prev.y + next.y) * 0.5;
      return {
        ...p,
        x: p.x + lambda * (mx - p.x),
        y: p.y + lambda * (my - p.y),
      };
    });
    return step1.map((p, i) => {
      if (!closed && (i === 0 || i === n - 1)) return p;
      const prev = step1[(i - 1 + n) % n];
      const next = step1[(i + 1) % n];
      const mx = (prev.x + next.x) * 0.5;
      const my = (prev.y + next.y) * 0.5;
      return {
        ...p,
        x: p.x + mu * (mx - p.x),
        y: p.y + mu * (my - p.y),
      };
    });
  };

  for (let pass = 0; pass < fullPasses; pass++) {
    pts = runTaubinStep(pts);
  }
  if (fracPass > 0.001) {
    const nextPts = runTaubinStep(pts);
    pts = pts.map((p, i) => ({
      ...p,
      x: lerp(p.x, nextPts[i].x, fracPass),
      y: lerp(p.y, nextPts[i].y, fracPass),
    }));
  }

  // 2. Gentle adaptive Ramer-Douglas-Peucker simplification (0–15% preserves all nodes for micro-smoothing)
  if (pts.length > minCount && s > 0.15) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const diag = Math.hypot(maxX - minX, maxY - minY);
    const simpProgress = (s - 0.15) / 0.85;
    const epsilon = Math.pow(simpProgress, 1.9) * Math.max(0.02, Math.min(24, diag * 0.026));
    if (closed) {
      const simplified = simplifyPoints([...pts, pts[0]], epsilon).slice(0, -1);
      if (simplified.length >= minCount) {
        pts = simplified;
      }
    } else {
      const simplified = simplifyPoints(pts, epsilon);
      if (simplified.length >= minCount) {
        pts = simplified;
      }
    }
  }

  // 3. Smooth bisector Catmull-Rom cubic Bezier tangent fitting with smooth 0–10% ramp
  const tension =
    s <= 0.1 ? (s / 0.1) * 0.24 : 0.24 + ((s - 0.1) / 0.9) * 0.18;
  const n = pts.length;
  const outNodes: AnchorNode[] = pts.map((curr, i) => {
    if (!closed && (i === 0 || i === n - 1)) {
      return {
        id: curr.id,
        x: curr.x,
        y: curr.y,
        type: 'smooth' as const,
        pressure: curr.pressure,
      };
    }
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const d1 = distance(prev, curr);
    const d2 = distance(curr, next);
    if (d1 < 1e-6 || d2 < 1e-6) {
      return {
        id: curr.id,
        x: curr.x,
        y: curr.y,
        type: 'smooth' as const,
        pressure: curr.pressure,
      };
    }
    const v1x = (curr.x - prev.x) / d1;
    const v1y = (curr.y - prev.y) / d1;
    const v2x = (next.x - curr.x) / d2;
    const v2y = (next.y - curr.y) / d2;
    let tx = v1x + v2x;
    let ty = v1y + v2y;
    let tLen = Math.hypot(tx, ty);
    if (tLen < 1e-5) {
      tx = next.x - prev.x;
      ty = next.y - prev.y;
      tLen = Math.hypot(tx, ty) || 1;
    }
    const ux = tx / tLen;
    const uy = ty / tLen;
    return {
      id: curr.id,
      x: curr.x,
      y: curr.y,
      handleIn: {
        x: curr.x - ux * Math.min(d1 * tension, d1 * 0.45),
        y: curr.y - uy * Math.min(d1 * tension, d1 * 0.45),
      },
      handleOut: {
        x: curr.x + ux * Math.min(d2 * tension, d2 * 0.45),
        y: curr.y + uy * Math.min(d2 * tension, d2 * 0.45),
      },
      type: 'smooth' as const,
      pressure: curr.pressure,
    };
  });

  if (!closed && outNodes.length >= 2) {
    const first = outNodes[0];
    const second = outNodes[1];
    if (second.handleIn) {
      first.handleOut = {
        x: first.x + (second.handleIn.x - first.x) * 0.52,
        y: first.y + (second.handleIn.y - first.y) * 0.52,
      };
    }
    const last = outNodes[outNodes.length - 1];
    const beforeLast = outNodes[outNodes.length - 2];
    if (beforeLast.handleOut) {
      last.handleIn = {
        x: last.x + (beforeLast.handleOut.x - last.x) * 0.52,
        y: last.y + (beforeLast.handleOut.y - last.y) * 0.52,
      };
    }
  }

  return outNodes;
}

export function smoothPathElement(
  el: VectorPathElement,
  sourceContours: PathSubpath[],
  smoothingPercent: number
): VectorPathElement {
  const precise = Math.round(Math.max(0, Math.min(100, smoothingPercent)) * 10) / 10;
  if (el.subpaths && el.subpaths.length > 0) {
    const nextSubpaths = sourceContours.map((sp) => ({
      ...sp,
      nodes: smoothContourFromSource(sp.nodes, sp.closed, precise),
    }));
    return {
      ...el,
      smoothing: precise,
      nodes: nextSubpaths[0]?.nodes ?? el.nodes,
      subpaths: nextSubpaths,
    };
  }
  const primary = sourceContours[0] ?? { nodes: el.nodes, closed: el.closed };
  return {
    ...el,
    smoothing: precise,
    nodes: smoothContourFromSource(primary.nodes, primary.closed, precise),
  };
}
