import {
  difference,
  Geom,
  intersection,
  MultiPolygon,
  Pair,
  Ring,
  union,
  xor,
} from 'polygon-clipping';
import {
  AnchorNode,
  BooleanOp,
  PathSubpath,
  Point,
  VectorPathElement,
} from '../types/vector';
import {
  createId,
  distance,
  flattenPathPoints,
  getPathContours,
} from './geometry';

function closeRing(points: Point[]): Ring {
  const cleaned: Pair[] = [];
  for (const p of points) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(p.x - prev[0], p.y - prev[1]) > 0.25) {
      cleaned.push([p.x, p.y]);
    }
  }
  if (cleaned.length >= 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.25) {
      cleaned.push([first[0], first[1]]);
    } else {
      cleaned[cleaned.length - 1] = [first[0], first[1]];
    }
  }
  return cleaned;
}

function openStrokeToPolygon(pts: Point[], halfWidth: number): Ring {
  if (pts.length < 2) return [];
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push({ x: pts[i].x + nx * halfWidth, y: pts[i].y + ny * halfWidth });
    right.push({ x: pts[i].x - nx * halfWidth, y: pts[i].y - ny * halfWidth });
  }
  return closeRing([...left, ...right.reverse()]);
}

function contourToRing(contour: PathSubpath, strokeWidth: number): Ring {
  const flat = flattenPathPoints(contour.nodes, contour.closed, 20);
  if (flat.length < 2) return [];
  if (!contour.closed && flat.length < 3) {
    return openStrokeToPolygon(flat, Math.max(2, strokeWidth / 2));
  }
  const ring = closeRing(flat);
  return ring.length >= 4 ? ring : [];
}

function pathElementToGeom(el: VectorPathElement): Geom | null {
  const contours = getPathContours(el);
  const rings: Ring[] = [];
  for (const c of contours) {
    const r = contourToRing(c, el.stroke.width);
    if (r.length >= 4) rings.push(r);
  }
  if (rings.length === 0) return null;
  if (rings.length === 1) return [rings[0]];

  // Combine multiple contours via XOR when evenodd, or union otherwise, so holes nest cleanly
  let geom: MultiPolygon = [[rings[0]]];
  for (let i = 1; i < rings.length; i++) {
    geom =
      el.fillRule === 'evenodd'
        ? xor(geom, [rings[i]])
        : union(geom, [rings[i]]);
  }
  return geom;
}

function simplifyCollinearRing(pts: Point[]): Point[] {
  if (pts.length <= 3) return pts;
  const out: Point[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 0.2 || l2 < 0.2) continue;
    const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
    // Keep vertex unless virtually collinear (< ~1.5 deg deviation)
    if (dot < 0.9996) {
      out.push(curr);
    }
  }
  return out.length >= 3 ? out : pts;
}

function ringToSubpath(ring: Ring): PathSubpath | null {
  if (ring.length < 3) return null;
  const raw: Point[] = [];
  const limit =
    ring.length > 1 &&
    Math.hypot(
      ring[0][0] - ring[ring.length - 1][0],
      ring[0][1] - ring[ring.length - 1][1]
    ) < 0.25
      ? ring.length - 1
      : ring.length;

  for (let i = 0; i < limit; i++) {
    raw.push({ x: ring[i][0], y: ring[i][1] });
  }

  const pts = simplifyCollinearRing(raw);
  if (pts.length < 3) return null;

  const n = pts.length;
  const nodes: AnchorNode[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const cosAngle = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
    const turnAngleDeg = (Math.acos(cosAngle) * 180) / Math.PI;

    // Preserve sharp corners for rects/polygons/stars; smooth tangents for curved arcs
    if (turnAngleDeg > 26) {
      nodes.push({
        id: createId('n'),
        x: curr.x,
        y: curr.y,
        type: 'corner',
      });
    } else {
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const tLen = Math.hypot(tx, ty) || 1;
      const ux = tx / tLen;
      const uy = ty / tLen;
      const dIn = distance(prev, curr) * 0.22;
      const dOut = distance(curr, next) * 0.22;
      nodes.push({
        id: createId('n'),
        x: curr.x,
        y: curr.y,
        handleIn: { x: curr.x - ux * dIn, y: curr.y - uy * dIn },
        handleOut: { x: curr.x + ux * dOut, y: curr.y + uy * dOut },
        type: 'smooth',
      });
    }
  }

  return { nodes, closed: true };
}

function cloneNodesFresh(nodes: AnchorNode[]): AnchorNode[] {
  return nodes.map((n) => ({
    ...n,
    id: createId('n'),
    handleIn: n.handleIn ? { ...n.handleIn } : undefined,
    handleOut: n.handleOut ? { ...n.handleOut } : undefined,
  }));
}

const OP_LABELS: Record<BooleanOp, string> = {
  union: 'Vereint',
  subtract: 'Subtrahiert',
  intersect: 'Schnittmenge',
  exclude: 'Ausgeschlossen',
  combine: 'Kombiniert',
};

export function combineVectorPaths(
  paths: VectorPathElement[],
  op: BooleanOp
): VectorPathElement | null {
  if (paths.length < 2) return null;
  const base = paths[0];

  if (op === 'combine') {
    const allContours: PathSubpath[] = [];
    for (const p of paths) {
      for (const c of getPathContours(p)) {
        if (c.nodes.length >= 2) {
          allContours.push({
            nodes: cloneNodesFresh(c.nodes),
            closed: c.closed,
          });
        }
      }
    }
    if (allContours.length === 0) return null;
    return {
      ...base,
      id: createId('path'),
      name: OP_LABELS[op],
      nodes: allContours[0].nodes,
      closed: allContours[0].closed,
      subpaths: allContours.length > 1 ? allContours : undefined,
      fillRule: 'evenodd',
    };
  }

  const geoms: Geom[] = [];
  for (const p of paths) {
    const g = pathElementToGeom(p);
    if (g) geoms.push(g);
  }
  if (geoms.length < 2) return null;

  let result: MultiPolygon = [];
  const [first, ...rest] = geoms;
  if (op === 'union') {
    result = union(first, ...rest);
  } else if (op === 'subtract') {
    result = difference(first, ...rest);
  } else if (op === 'intersect') {
    result = intersection(first, ...rest);
  } else if (op === 'exclude') {
    result = xor(first, ...rest);
  }

  const subpaths: PathSubpath[] = [];
  for (const polygon of result) {
    for (const ring of polygon) {
      const sp = ringToSubpath(ring);
      if (sp) subpaths.push(sp);
    }
  }

  if (subpaths.length === 0) return null;

  return {
    ...base,
    id: createId('path'),
    name: OP_LABELS[op],
    nodes: subpaths[0].nodes,
    closed: true,
    subpaths: subpaths.length > 1 ? subpaths : undefined,
    fillRule: 'evenodd',
  };
}

export function splitCompoundPath(el: VectorPathElement): VectorPathElement[] {
  const contours = getPathContours(el);
  if (contours.length <= 1) return [el];
  return contours.map((c, idx) => ({
    ...el,
    id: createId('path'),
    name: `${el.name} (${idx + 1})`,
    nodes: cloneNodesFresh(c.nodes),
    closed: c.closed,
    subpaths: undefined,
    fillRule: 'nonzero',
  }));
}
