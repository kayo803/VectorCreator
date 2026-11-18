import {
  BoundingBox,
  CanvasElement,
  CanvasPageConfig,
  GridConfig,
  Point,
} from '../types/vector';
import { isBoundedCanvas } from './canvasSizes';
import { distance, getCombinedBounds, getPathContours } from './geometry';

export interface SnapGuideLine {
  orientation: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
  kind: 'object' | 'center' | 'node';
}

export interface SmartObjectSnapResult {
  dx: number;
  dy: number;
  guides: SnapGuideLine[];
}

export interface SmartPointSnapResult {
  point: Point;
  guides: SnapGuideLine[];
  snappedNode: Point | null;
}

export function isSmartSnapActive(grid: GridConfig): boolean {
  return grid.smartGuides !== false;
}

export function isAnySnapEnabled(grid: GridConfig): boolean {
  return grid.snap || isSmartSnapActive(grid);
}

export function computeSmartObjectSnap(
  movingBounds: BoundingBox,
  otherElements: CanvasElement[],
  tolerance: number,
  grid: GridConfig,
  canvasSize?: CanvasPageConfig
): SmartObjectSnapResult {
  const smartActive = isSmartSnapActive(grid);
  const snapObjects = smartActive && grid.snapToObjects !== false;

  if (!smartActive && !grid.snap) {
    return { dx: 0, dy: 0, guides: [] };
  }

  let bestDx: number | null = null;
  let bestDxDist = tolerance + 0.0001;
  let bestVGuides: SnapGuideLine[] = [];

  let bestDy: number | null = null;
  let bestDyDist = tolerance + 0.0001;
  let bestHGuides: SnapGuideLine[] = [];

  if (snapObjects) {
    interface RefLine {
      pos: number;
      spanMin: number;
      spanMax: number;
      kind: 'object' | 'center';
    }

    const vRefs: RefLine[] = [
      {
        pos: 0,
        spanMin: Math.min(movingBounds.minY, -240),
        spanMax: Math.max(movingBounds.maxY, 240),
        kind: 'center',
      },
    ];
    const hRefs: RefLine[] = [
      {
        pos: 0,
        spanMin: Math.min(movingBounds.minX, -240),
        spanMax: Math.max(movingBounds.maxX, 240),
        kind: 'center',
      },
    ];

    if (isBoundedCanvas(canvasSize)) {
      const hw = canvasSize.width / 2;
      const hh = canvasSize.height / 2;
      vRefs.push(
        { pos: -hw, spanMin: -hh, spanMax: hh, kind: 'center' },
        { pos: hw, spanMin: -hh, spanMax: hh, kind: 'center' }
      );
      hRefs.push(
        { pos: -hh, spanMin: -hw, spanMax: hw, kind: 'center' },
        { pos: hh, spanMin: -hw, spanMax: hw, kind: 'center' }
      );
    }

    for (const el of otherElements) {
      const b = getCombinedBounds([el]);
      if (!b) continue;
      vRefs.push(
        { pos: b.minX, spanMin: b.minY, spanMax: b.maxY, kind: 'object' },
        { pos: b.cx, spanMin: b.minY, spanMax: b.maxY, kind: 'object' },
        { pos: b.maxX, spanMin: b.minY, spanMax: b.maxY, kind: 'object' }
      );
      hRefs.push(
        { pos: b.minY, spanMin: b.minX, spanMax: b.maxX, kind: 'object' },
        { pos: b.cy, spanMin: b.minX, spanMax: b.maxX, kind: 'object' },
        { pos: b.maxY, spanMin: b.minX, spanMax: b.maxX, kind: 'object' }
      );
    }

    const mvXs = [movingBounds.minX, movingBounds.cx, movingBounds.maxX];
    for (const mx of mvXs) {
      for (const vr of vRefs) {
        const diff = vr.pos - mx;
        const absDiff = Math.abs(diff);
        if (absDiff < bestDxDist - 0.01) {
          bestDxDist = absDiff;
          bestDx = diff;
          bestVGuides = [
            {
              orientation: 'v',
              pos: vr.pos,
              from: Math.min(movingBounds.minY, vr.spanMin) - 16,
              to: Math.max(movingBounds.maxY, vr.spanMax) + 16,
              kind: vr.kind,
            },
          ];
        } else if (
          bestDx !== null &&
          Math.abs(diff - bestDx) < 0.5 &&
          bestVGuides.length < 2
        ) {
          bestVGuides.push({
            orientation: 'v',
            pos: vr.pos,
            from: Math.min(movingBounds.minY, vr.spanMin) - 16,
            to: Math.max(movingBounds.maxY, vr.spanMax) + 16,
            kind: vr.kind,
          });
        }
      }
    }

    const mvYs = [movingBounds.minY, movingBounds.cy, movingBounds.maxY];
    for (const my of mvYs) {
      for (const hr of hRefs) {
        const diff = hr.pos - my;
        const absDiff = Math.abs(diff);
        if (absDiff < bestDyDist - 0.01) {
          bestDyDist = absDiff;
          bestDy = diff;
          bestHGuides = [
            {
              orientation: 'h',
              pos: hr.pos,
              from: Math.min(movingBounds.minX, hr.spanMin) - 16,
              to: Math.max(movingBounds.maxX, hr.spanMax) + 16,
              kind: hr.kind,
            },
          ];
        } else if (
          bestDy !== null &&
          Math.abs(diff - bestDy) < 0.5 &&
          bestHGuides.length < 2
        ) {
          bestHGuides.push({
            orientation: 'h',
            pos: hr.pos,
            from: Math.min(movingBounds.minX, hr.spanMin) - 16,
            to: Math.max(movingBounds.maxX, hr.spanMax) + 16,
            kind: hr.kind,
          });
        }
      }
    }
  }

  let dx = bestDx ?? 0;
  let dy = bestDy ?? 0;

  if (bestDx === null && grid.snap) {
    const snappedMinX = Math.round(movingBounds.minX / grid.size) * grid.size;
    dx = snappedMinX - movingBounds.minX;
  }
  if (bestDy === null && grid.snap) {
    const snappedMinY = Math.round(movingBounds.minY / grid.size) * grid.size;
    dy = snappedMinY - movingBounds.minY;
  }

  return {
    dx,
    dy,
    guides: [...bestVGuides, ...bestHGuides],
  };
}

export function computeSmartPointSnap(
  rawWorld: Point,
  elements: CanvasElement[],
  excludeElementIds: Set<string>,
  excludeNodeIds: Set<string>,
  tolerance: number,
  grid: GridConfig,
  extraAnchors: Point[] = [],
  canvasSize?: CanvasPageConfig
): SmartPointSnapResult {
  const smartActive = isSmartSnapActive(grid);
  const snapObjects = smartActive && grid.snapToObjects !== false;
  const snapNodes = smartActive && grid.snapToNodes !== false;

  if (!smartActive && !grid.snap) {
    return { point: rawWorld, guides: [], snappedNode: null };
  }

  // 1. Direct node-to-node / point snapping
  if (snapNodes) {
    let closestPt: Point | null = null;
    let closestDist = tolerance;

    for (const pt of extraAnchors) {
      const d = distance(rawWorld, pt);
      if (d <= closestDist) {
        closestDist = d;
        closestPt = pt;
      }
    }

    for (const el of elements) {
      if (el.kind !== 'path') continue;
      for (const c of getPathContours(el)) {
        for (const n of c.nodes) {
          if (excludeNodeIds.has(n.id)) continue;
          const d = distance(rawWorld, n);
          if (d <= closestDist) {
            closestDist = d;
            closestPt = { x: n.x, y: n.y };
          }
        }
      }
    }

    if (closestPt) {
      return {
        point: closestPt,
        snappedNode: closestPt,
        guides: [
          {
            orientation: 'v',
            pos: closestPt.x,
            from: closestPt.y - 28,
            to: closestPt.y + 28,
            kind: 'node',
          },
          {
            orientation: 'h',
            pos: closestPt.y,
            from: closestPt.x - 28,
            to: closestPt.x + 28,
            kind: 'node',
          },
        ],
      };
    }
  }

  // 2. Axis-aligned guide snapping (canvas center, object edges/centers, node axes)
  let snapX: number | null = null;
  let bestXDist = tolerance + 0.0001;
  let vGuide: SnapGuideLine | null = null;

  let snapY: number | null = null;
  let bestYDist = tolerance + 0.0001;
  let hGuide: SnapGuideLine | null = null;

  if (snapObjects || snapNodes) {
    const checkV = (
      pos: number,
      from: number,
      to: number,
      kind: 'object' | 'center' | 'node'
    ) => {
      const d = Math.abs(pos - rawWorld.x);
      if (d < bestXDist) {
        bestXDist = d;
        snapX = pos;
        vGuide = {
          orientation: 'v',
          pos,
          from: Math.min(from, rawWorld.y) - 16,
          to: Math.max(to, rawWorld.y) + 16,
          kind,
        };
      }
    };

    const checkH = (
      pos: number,
      from: number,
      to: number,
      kind: 'object' | 'center' | 'node'
    ) => {
      const d = Math.abs(pos - rawWorld.y);
      if (d < bestYDist) {
        bestYDist = d;
        snapY = pos;
        hGuide = {
          orientation: 'h',
          pos,
          from: Math.min(from, rawWorld.x) - 16,
          to: Math.max(to, rawWorld.x) + 16,
          kind,
        };
      }
    };

    if (snapObjects) {
      checkV(0, rawWorld.y - 180, rawWorld.y + 180, 'center');
      checkH(0, rawWorld.x - 180, rawWorld.x + 180, 'center');
      if (isBoundedCanvas(canvasSize)) {
        const hw = canvasSize.width / 2;
        const hh = canvasSize.height / 2;
        checkV(-hw, -hh, hh, 'center');
        checkV(hw, -hh, hh, 'center');
        checkH(-hh, -hw, hw, 'center');
        checkH(hh, -hw, hw, 'center');
      }

      for (const el of elements) {
        if (excludeElementIds.has(el.id)) continue;
        const b = getCombinedBounds([el]);
        if (!b) continue;
        checkV(b.minX, b.minY, b.maxY, 'object');
        checkV(b.cx, b.minY, b.maxY, 'object');
        checkV(b.maxX, b.minY, b.maxY, 'object');
        checkH(b.minY, b.minX, b.maxX, 'object');
        checkH(b.cy, b.minX, b.maxX, 'object');
        checkH(b.maxY, b.minX, b.maxX, 'object');
      }
    }

    if (snapNodes) {
      for (const pt of extraAnchors) {
        checkV(pt.x, pt.y, pt.y, 'node');
        checkH(pt.y, pt.x, pt.x, 'node');
      }
      for (const el of elements) {
        if (el.kind !== 'path') continue;
        for (const c of getPathContours(el)) {
          for (const n of c.nodes) {
            if (excludeNodeIds.has(n.id)) continue;
            checkV(n.x, n.y, n.y, 'node');
            checkH(n.y, n.x, n.x, 'node');
          }
        }
      }
    }
  }

  let finalX = snapX ?? rawWorld.x;
  let finalY = snapY ?? rawWorld.y;

  if (snapX === null && grid.snap) {
    finalX = Math.round(rawWorld.x / grid.size) * grid.size;
  }
  if (snapY === null && grid.snap) {
    finalY = Math.round(rawWorld.y / grid.size) * grid.size;
  }

  const guides: SnapGuideLine[] = [];
  if (vGuide) guides.push(vGuide);
  if (hGuide) guides.push(hGuide);

  return {
    point: { x: finalX, y: finalY },
    guides,
    snappedNode: null,
  };
}
