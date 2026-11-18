import {
  CanvasPageConfig,
  PaintStyle,
  ProjectDocument,
  StrokeStyle,
  VectorPathElement,
} from '../types/vector';
import { computeFitCanvasViewport } from './canvasSizes';
import { buildShapeNodes, createId, generateSymmetryElements } from './geometry';

export function createDefaultPaint(color = '#3B82F6', type: 'none' | 'solid' | 'linear' = 'solid'): PaintStyle {
  return {
    type,
    color,
    opacity: 1,
    gradient: {
      angle: 45,
      stops: [
        { offset: 0, color: '#3B82F6', opacity: 1 },
        { offset: 1, color: '#EC4899', opacity: 1 },
      ],
    },
  };
}

export function createDefaultStroke(color = '#111827', width = 3): StrokeStyle {
  return {
    paint: createDefaultPaint(color, 'solid'),
    width,
    cap: 'round',
    join: 'round',
    dash: 'solid',
    profile: 'monoline',
  };
}

export function createBlankDocument(
  name = 'Unbenanntes Projekt',
  canvasSize?: CanvasPageConfig
): ProjectDocument {
  const layerId = createId('layer');
  return {
    id: createId('proj'),
    name,
    updatedAt: Date.now(),
    background: 'white',
    canvasSize,
    layers: [
      {
        id: layerId,
        name: 'Ebene 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'source-over',
        elements: [],
      },
    ],
    activeLayerId: layerId,
    symmetry: {
      mode: 'none',
      segments: 6,
      center: { x: 0, y: 0 },
      showAxes: true,
    },
    perspective: {
      mode: 'none',
      horizonY: 0,
      vp1: { x: 0, y: 0 },
      vp2: { x: 380, y: 0 },
      vp3: { x: 0, y: 360 },
      snapToGuides: true,
      opacity: 0.45,
    },
    grid: {
      visible: false,
      size: 40,
      snap: false,
      smartGuides: true,
      snapToObjects: true,
      snapToNodes: true,
    },
    viewport: computeFitCanvasViewport(canvasSize),
  };
}

export function createMandalaTemplate(): ProjectDocument {
  const doc = createBlankDocument('Geometrisches Mandala');
  doc.background = 'dark';
  doc.symmetry = {
    mode: 'radial',
    segments: 8,
    center: { x: 0, y: 0 },
    showAxes: true,
  };

  const petal: VectorPathElement = {
    id: createId('path'),
    kind: 'path',
    name: 'Blütenblatt',
    closed: true,
    opacity: 0.85,
    visible: true,
    fill: {
      type: 'linear',
      color: '#3B82F6',
      opacity: 0.35,
      gradient: {
        angle: 90,
        stops: [
          { offset: 0, color: '#06B6D4', opacity: 0.8 },
          { offset: 1, color: '#6366F1', opacity: 0.2 },
        ],
      },
    },
    stroke: {
      ...createDefaultStroke('#38BDF8', 2.5),
      profile: 'tapered',
    },
    nodes: [
      { id: createId('n'), x: 0, y: -36, type: 'corner' },
      {
        id: createId('n'),
        x: 56,
        y: -155,
        handleIn: { x: 52, y: -88 },
        handleOut: { x: 42, y: -200 },
        type: 'smooth',
      },
      { id: createId('n'), x: 0, y: -245, type: 'corner' },
      {
        id: createId('n'),
        x: -56,
        y: -155,
        handleIn: { x: -42, y: -200 },
        handleOut: { x: -52, y: -88 },
        type: 'smooth',
      },
    ],
  };

  const innerRing: VectorPathElement = {
    id: createId('path'),
    kind: 'path',
    name: 'Zentrum',
    closed: true,
    opacity: 1,
    visible: true,
    fill: createDefaultPaint('#F59E0B', 'none'),
    stroke: createDefaultStroke('#FBBF24', 2.5),
    nodes: buildShapeNodes(
      'star',
      { x: -75, y: -75 },
      { x: 75, y: 75 },
      { polygonSides: 8, starPoints: 8, starInnerRatio: 0.52 }
    ).nodes,
  };

  const outerRing: VectorPathElement = {
    id: createId('path'),
    kind: 'path',
    name: 'Außenring',
    closed: true,
    opacity: 0.7,
    visible: true,
    fill: createDefaultPaint('#FFFFFF', 'none'),
    stroke: createDefaultStroke('#818CF8', 2),
    nodes: buildShapeNodes(
      'ellipse',
      { x: -265, y: -265 },
      { x: 265, y: 265 },
      { polygonSides: 6, starPoints: 5, starInnerRatio: 0.45 }
    ).nodes,
  };

  const petals = generateSymmetryElements(petal, doc.symmetry);
  doc.layers[0].name = 'Mandala-Geometrie';
  doc.layers[0].elements = [outerRing, ...petals, innerRing];
  return doc;
}

export function createPerspectiveArchitectureTemplate(): ProjectDocument {
  const doc = createBlankDocument('Architektur-Perspektive');
  doc.background = 'paper';
  doc.perspective = {
    mode: '2-point',
    horizonY: 30,
    vp1: { x: -420, y: 30 },
    vp2: { x: 420, y: 30 },
    vp3: { x: 0, y: 420 },
    snapToGuides: true,
    opacity: 0.5,
  };

  const leftWall: VectorPathElement = {
    id: createId('path'),
    kind: 'path',
    name: 'Linke Fassade',
    closed: true,
    opacity: 1,
    visible: true,
    fill: createDefaultPaint('#E2E8F0', 'solid'),
    stroke: createDefaultStroke('#1E293B', 2.5),
    nodes: [
      { id: createId('n'), x: 0, y: -150, type: 'corner' },
      { id: createId('n'), x: -210, y: -60, type: 'corner' },
      { id: createId('n'), x: -210, y: 120, type: 'corner' },
      { id: createId('n'), x: 0, y: 165, type: 'corner' },
    ],
  };

  const rightWall: VectorPathElement = {
    id: createId('path'),
    kind: 'path',
    name: 'Rechte Fassade',
    closed: true,
    opacity: 1,
    visible: true,
    fill: createDefaultPaint('#CBD5E1', 'solid'),
    stroke: createDefaultStroke('#1E293B', 2.5),
    nodes: [
      { id: createId('n'), x: 0, y: -150, type: 'corner' },
      { id: createId('n'), x: 220, y: -55, type: 'corner' },
      { id: createId('n'), x: 220, y: 118, type: 'corner' },
      { id: createId('n'), x: 0, y: 165, type: 'corner' },
    ],
  };

  const windowGlass: VectorPathElement = {
    id: createId('path'),
    kind: 'path',
    name: 'Atelier-Fenster',
    closed: true,
    opacity: 0.9,
    visible: true,
    fill: {
      type: 'linear',
      color: '#3B82F6',
      opacity: 0.75,
      gradient: {
        angle: 135,
        stops: [
          { offset: 0, color: '#93C5FD', opacity: 0.9 },
          { offset: 1, color: '#1D4ED8', opacity: 0.85 },
        ],
      },
    },
    stroke: createDefaultStroke('#1E293B', 2),
    nodes: [
      { id: createId('n'), x: 40, y: -85, type: 'corner' },
      { id: createId('n'), x: 165, y: -42, type: 'corner' },
      { id: createId('n'), x: 165, y: 65, type: 'corner' },
      { id: createId('n'), x: 40, y: 82, type: 'corner' },
    ],
  };

  doc.layers[0].name = 'Baukörper';
  doc.layers[0].elements = [leftWall, rightWall, windowGlass];
  return doc;
}

export function createEditorialPosterTemplate(): ProjectDocument {
  const doc = createBlankDocument('Bauhaus Komposition');
  doc.background = 'paper';

  const circle: VectorPathElement = {
    id: createId('path'),
    kind: 'path',
    name: 'Sonne',
    closed: true,
    opacity: 0.95,
    visible: true,
    fill: {
      type: 'linear',
      color: '#EF4444',
      opacity: 1,
      gradient: {
        angle: 45,
        stops: [
          { offset: 0, color: '#F97316', opacity: 1 },
          { offset: 1, color: '#E11D48', opacity: 1 },
        ],
      },
    },
    stroke: { ...createDefaultStroke('#111827', 0), paint: createDefaultPaint('#111827', 'none') },
    nodes: buildShapeNodes(
      'ellipse',
      { x: -120, y: -190 },
      { x: 120, y: 50 },
      { polygonSides: 6, starPoints: 5, starInnerRatio: 0.45 }
    ).nodes,
  };

  const hill1: VectorPathElement = {
    id: createId('path'),
    kind: 'path',
    name: 'Bogen Vorn',
    closed: true,
    opacity: 0.92,
    visible: true,
    fill: createDefaultPaint('#1E3A8A', 'solid'),
    stroke: { ...createDefaultStroke('#111827', 0), paint: createDefaultPaint('#111827', 'none') },
    nodes: [
      { id: createId('n'), x: -240, y: 170, type: 'corner' },
      {
        id: createId('n'),
        x: -20,
        y: -25,
        handleIn: { x: -160, y: -25 },
        handleOut: { x: 105, y: -25 },
        type: 'smooth',
      },
      { id: createId('n'), x: 240, y: 170, type: 'corner' },
    ],
  };

  const accentLine: VectorPathElement = {
    id: createId('path'),
    kind: 'path',
    name: 'Kontur-Linie',
    closed: false,
    opacity: 1,
    visible: true,
    fill: createDefaultPaint('#111827', 'none'),
    stroke: {
      ...createDefaultStroke('#111827', 8),
      profile: 'tapered',
    },
    nodes: [
      { id: createId('n'), x: -230, y: 110, type: 'smooth' },
      {
        id: createId('n'),
        x: 0,
        y: 35,
        handleIn: { x: -100, y: 80 },
        handleOut: { x: 110, y: -10 },
        type: 'smooth',
      },
      { id: createId('n'), x: 230, y: -70, type: 'smooth' },
    ],
  };

  doc.layers[0].name = 'Formen';
  doc.layers[0].elements = [circle, hill1, accentLine];
  return doc;
}
