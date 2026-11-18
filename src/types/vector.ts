export interface Point {
  x: number;
  y: number;
}

export interface AnchorNode {
  id: string;
  x: number;
  y: number;
  handleIn?: Point;
  handleOut?: Point;
  type: 'corner' | 'smooth';
  pressure?: number;
}

export interface GradientStop {
  offset: number;
  color: string;
  opacity: number;
}

export interface LinearGradientDef {
  angle: number; // degrees 0-360
  stops: [GradientStop, GradientStop];
}

export interface PaintStyle {
  type: 'none' | 'solid' | 'linear';
  color: string;
  opacity: number;
  gradient: LinearGradientDef;
}

export type StrokeCap = 'round' | 'square' | 'butt';
export type StrokeJoin = 'round' | 'miter' | 'bevel';
export type DashPattern = 'solid' | 'dashed' | 'dotted';
export type BrushProfile = 'monoline' | 'tapered' | 'calligraphy';

export interface StrokeStyle {
  paint: PaintStyle;
  width: number;
  cap: StrokeCap;
  join: StrokeJoin;
  dash: DashPattern;
  profile: BrushProfile;
}

export interface PathSubpath {
  nodes: AnchorNode[];
  closed: boolean;
}

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude' | 'combine';

export interface VectorPathElement {
  id: string;
  kind: 'path';
  name: string;
  nodes: AnchorNode[];
  closed: boolean;
  subpaths?: PathSubpath[];
  fillRule?: 'nonzero' | 'evenodd';
  smoothing?: number;
  fill: PaintStyle;
  stroke: StrokeStyle;
  opacity: number;
  visible: boolean;
}

export interface VectorTextElement {
  id: string;
  kind: 'text';
  name: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  align: 'left' | 'center' | 'right';
  rotation: number; // radians
  fill: PaintStyle;
  stroke: StrokeStyle;
  opacity: number;
  visible: boolean;
}

export interface VectorImageElement {
  id: string;
  kind: 'image';
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // radians
  flipX?: boolean;
  flipY?: boolean;
  fill: PaintStyle;
  stroke: StrokeStyle;
  opacity: number;
  visible: boolean;
}

export type CanvasElement = VectorPathElement | VectorTextElement | VectorImageElement;

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blendMode: BlendMode;
  elements: CanvasElement[];
}

export type ToolType =
  | 'select'
  | 'node'
  | 'brush'
  | 'pen'
  | 'shape'
  | 'fill'
  | 'eraser'
  | 'eyedropper'
  | 'text'
  | 'pan';

export type InspectorTab = 'style' | 'layers' | 'guides';

export type TopBarPosition = 'top' | 'bottom';
export type ToolRailPosition = 'left' | 'right' | 'top' | 'bottom';
export type InspectorPosition = 'left' | 'right';
export type ContextBarPosition = 'bottom' | 'top';
export type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ToolbarCustomPoint {
  x: number;
  y: number;
}

export interface ToolbarCustomPositions {
  topBar?: ToolbarCustomPoint;
  toolRail?: ToolbarCustomPoint;
  inspector?: ToolbarCustomPoint;
  contextBar?: ToolbarCustomPoint;
  fullscreenBar?: ToolbarCustomPoint;
}

export interface ToolbarLayoutSettings {
  topBar: TopBarPosition;
  toolRail: ToolRailPosition;
  inspector: InspectorPosition;
  contextBar: ContextBarPosition;
  fullscreenBar: CornerPosition;
  customPositions?: ToolbarCustomPositions;
}

export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'line'
  | 'arrow';

export type SymmetryMode = 'none' | 'vertical' | 'horizontal' | 'radial';

export interface SymmetryConfig {
  mode: SymmetryMode;
  segments: number; // 3..12 for radial
  center: Point;
  showAxes: boolean;
}

export type PerspectiveMode = 'none' | '1-point' | '2-point' | '3-point' | 'isometric';

export interface PerspectiveConfig {
  mode: PerspectiveMode;
  horizonY: number;
  vp1: Point;
  vp2: Point;
  vp3: Point;
  snapToGuides: boolean;
  opacity: number;
}

export interface GridConfig {
  visible: boolean;
  size: number;
  snap: boolean;
  smartGuides?: boolean;
  snapToObjects?: boolean;
  snapToNodes?: boolean;
}

export type CanvasBackground = 'white' | 'paper' | 'dark' | 'transparent';

export type CanvasSizePreset =
  | 'infinite'
  | 'a5'
  | 'a4'
  | 'a3'
  | 'a2'
  | 'letter'
  | 'square-1080'
  | 'hd-1080'
  | 'story-1080'
  | 'custom';

export type CanvasOrientation = 'portrait' | 'landscape';

export interface CanvasPageConfig {
  preset: CanvasSizePreset;
  width: number;
  height: number;
  orientation: CanvasOrientation;
}

export interface ViewportTransform {
  x: number; // screen offset of world origin
  y: number;
  zoom: number; // scale factor
  rotation: number; // radians
}

export type PencilPrecision = 'fine' | 'normal' | 'coarse';

export type HandleSizePreset = 'small' | 'normal' | 'large';
export type BezierHandleVisibility = 'auto' | 'selected' | 'all' | 'none';
export type BezierTangentMode = 'aligned' | 'symmetrical' | 'free';
export type HandleColorPreset = 'blue' | 'emerald' | 'pink' | 'amber';

export interface HandleSettings {
  size: HandleSizePreset;
  bezierVisibility: BezierHandleVisibility;
  tangentMode: BezierTangentMode;
  largeHitArea: boolean;
  accentColor: HandleColorPreset;
  showRotationHandle: boolean;
  showEdgeHandles: boolean;
  lockAspectRatio?: boolean;
}

export interface ToolSettings {
  smoothing: number; // 0..100
  pencilMode: PencilPrecision;
  autoCloseBrushPath: boolean;
  shapeKind: ShapeKind;
  polygonSides: number;
  starPoints: number;
  starInnerRatio: number;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  textAlign: 'left' | 'center' | 'right';
  handleSettings: HandleSettings;
}

export interface ProjectDocument {
  id: string;
  name: string;
  updatedAt: number;
  background: CanvasBackground;
  canvasSize?: CanvasPageConfig;
  layers: Layer[];
  activeLayerId: string;
  symmetry: SymmetryConfig;
  perspective: PerspectiveConfig;
  grid: GridConfig;
  viewport: ViewportTransform;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}
