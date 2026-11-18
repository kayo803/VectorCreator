import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Move } from 'lucide-react';
import { ToolbarCustomPoint, ToolbarLayoutSettings } from '../types/vector';

export type ToolbarKind =
  | 'topBar'
  | 'toolRail'
  | 'inspector'
  | 'contextBar'
  | 'fullscreenBar';

interface ActiveDragState {
  kind: ToolbarKind;
  x: number;
  y: number;
  placeHudAtBottom: boolean;
}

interface ToolbarDragContextValue {
  activeDrag: ActiveDragState | null;
  customPositions: ToolbarLayoutSettings['customPositions'];
  startHold: (kind: ToolbarKind, e: React.PointerEvent<HTMLElement>) => void;
  isDraggingOrHolding: () => boolean;
}

const ToolbarDragContext = createContext<ToolbarDragContextValue | null>(null);

const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 10;
const EDGE_MARGIN = 8;

const TOOLBAR_LABELS: Record<ToolbarKind, string> = {
  topBar: 'Hauptleiste',
  toolRail: 'Werkzeugleiste',
  inspector: 'Studio-Panel',
  contextBar: 'Aktionsleiste',
  fullscreenBar: 'Vollbild-Steuerung',
};

function resolveToolbarElement(el: HTMLElement): HTMLElement {
  return (el.closest('[data-toolbar-root]') as HTMLElement | null) ?? el;
}

function clampToViewport(
  x: number,
  y: number,
  width: number,
  height: number
): ToolbarCustomPoint {
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN);
  return {
    x: Math.round(Math.max(EDGE_MARGIN, Math.min(maxX, x))),
    y: Math.round(Math.max(EDGE_MARGIN, Math.min(maxY, y))),
  };
}

interface ToolbarDragProviderProps {
  toolbarLayout: ToolbarLayoutSettings;
  onChangeToolbarLayout: (patch: Partial<ToolbarLayoutSettings>) => void;
  children: React.ReactNode;
}

export const ToolbarDragProvider: React.FC<ToolbarDragProviderProps> = ({
  toolbarLayout,
  onChangeToolbarLayout,
  children,
}) => {
  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);
  const layoutRef = useRef(toolbarLayout);
  const onChangeRef = useRef(onChangeToolbarLayout);
  layoutRef.current = toolbarLayout;
  onChangeRef.current = onChangeToolbarLayout;

  const sessionRef = useRef<{
    kind: ToolbarKind;
    toolbarEl: HTMLElement;
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    originLeft: number;
    originTop: number;
    width: number;
    height: number;
    activated: boolean;
    x: number;
    y: number;
    timerId: number | null;
    rafId: number | null;
    cleanupListeners: (() => void) | null;
  } | null>(null);

  const clearSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    if (s.timerId !== null) {
      window.clearTimeout(s.timerId);
    }
    if (s.rafId !== null) {
      window.cancelAnimationFrame(s.rafId);
    }
    s.cleanupListeners?.();
    sessionRef.current = null;
    setActiveDrag(null);
  }, []);

  useEffect(() => {
    return () => {
      clearSession();
    };
  }, [clearSession]);

  const commitCustomPosition = useCallback(
    (kind: ToolbarKind, pt: ToolbarCustomPoint) => {
      const prevCustom = layoutRef.current.customPositions ?? {};
      onChangeRef.current({
        customPositions: {
          ...prevCustom,
          [kind]: { x: Math.round(pt.x), y: Math.round(pt.y) },
        },
      });
    },
    []
  );

  const blockNextClick = useCallback(() => {
    const prevent = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    window.addEventListener('click', prevent, { capture: true, once: true });
    window.setTimeout(() => {
      window.removeEventListener('click', prevent, { capture: true });
    }, 180);
  }, []);

  const startHold = useCallback(
    (kind: ToolbarKind, e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl?.closest(
          'input, textarea, select, [data-no-toolbar-drag="true"]'
        )
      ) {
        return;
      }

      clearSession();

      const toolbarEl = resolveToolbarElement(e.currentTarget);
      const initialRect = toolbarEl.getBoundingClientRect();

      const session = {
        kind,
        toolbarEl,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        originLeft: initialRect.left,
        originTop: initialRect.top,
        width: initialRect.width,
        height: initialRect.height,
        activated: false,
        x: Math.round(initialRect.left),
        y: Math.round(initialRect.top),
        timerId: null as number | null,
        rafId: null as number | null,
        cleanupListeners: null as (() => void) | null,
      };

      const onWindowPointerMove = (ev: PointerEvent) => {
        if (ev.pointerId !== session.pointerId) return;
        session.currentX = ev.clientX;
        session.currentY = ev.clientY;

        if (!session.activated) {
          const dist = Math.hypot(
            ev.clientX - session.startX,
            ev.clientY - session.startY
          );
          if (dist > MOVE_CANCEL_PX) {
            clearSession();
          }
          return;
        }

        ev.preventDefault();
        const liveRect = session.toolbarEl.getBoundingClientRect();
        session.width = liveRect.width || session.width;
        session.height = liveRect.height || session.height;

        const nextRawX = session.originLeft + (ev.clientX - session.startX);
        const nextRawY = session.originTop + (ev.clientY - session.startY);
        const clamped = clampToViewport(
          nextRawX,
          nextRawY,
          session.width,
          session.height
        );

        session.x = clamped.x;
        session.y = clamped.y;
        setActiveDrag({
          kind,
          x: clamped.x,
          y: clamped.y,
          placeHudAtBottom: ev.clientY < window.innerHeight * 0.45,
        });
      };

      const onWindowTouchMove = (ev: TouchEvent) => {
        if (session.activated) {
          ev.preventDefault();
        }
      };

      const onWindowPointerEnd = (ev: PointerEvent) => {
        if (ev.pointerId !== session.pointerId) return;
        const wasActivated = session.activated;
        let finalPt = { x: session.x, y: session.y };
        if (wasActivated && ev.type === 'pointerup') {
          const liveRect = session.toolbarEl.getBoundingClientRect();
          finalPt = clampToViewport(
            session.originLeft + (ev.clientX - session.startX),
            session.originTop + (ev.clientY - session.startY),
            liveRect.width || session.width,
            liveRect.height || session.height
          );
        }
        clearSession();
        if (wasActivated) {
          blockNextClick();
          if (ev.type === 'pointerup') {
            commitCustomPosition(kind, finalPt);
          }
        }
      };

      window.addEventListener('pointermove', onWindowPointerMove, {
        passive: false,
      });
      window.addEventListener('touchmove', onWindowTouchMove, {
        passive: false,
      });
      window.addEventListener('pointerup', onWindowPointerEnd);
      window.addEventListener('pointercancel', onWindowPointerEnd);

      session.cleanupListeners = () => {
        window.removeEventListener('pointermove', onWindowPointerMove);
        window.removeEventListener('touchmove', onWindowTouchMove);
        window.removeEventListener('pointerup', onWindowPointerEnd);
        window.removeEventListener('pointercancel', onWindowPointerEnd);
      };

      session.timerId = window.setTimeout(() => {
        if (sessionRef.current !== session) return;
        session.activated = true;
        session.timerId = null;

        const currentRect = session.toolbarEl.getBoundingClientRect();
        session.originLeft = currentRect.left;
        session.originTop = currentRect.top;
        session.width = currentRect.width;
        session.height = currentRect.height;

        const clamped = clampToViewport(
          session.originLeft,
          session.originTop,
          session.width,
          session.height
        );
        session.x = clamped.x;
        session.y = clamped.y;

        try {
          navigator.vibrate?.(16);
        } catch {
          // Ignore environments without vibration support
        }

        setActiveDrag({
          kind,
          x: clamped.x,
          y: clamped.y,
          placeHudAtBottom: session.currentY < window.innerHeight * 0.45,
        });

        // If switching to free layout changed toolbar dimensions (e.g. TopBar width),
        // keep the pointer inside the toolbar smoothly.
        session.rafId = window.requestAnimationFrame(() => {
          if (sessionRef.current !== session) return;
          const afterRect = session.toolbarEl.getBoundingClientRect();
          if (Math.abs(afterRect.width - session.width) > 4) {
            session.width = afterRect.width;
            session.height = afterRect.height;
            if (
              session.currentX < session.originLeft ||
              session.currentX > session.originLeft + afterRect.width - 12
            ) {
              const recentered = clampToViewport(
                session.currentX - afterRect.width / 2,
                session.originTop,
                afterRect.width,
                afterRect.height
              );
              session.originLeft = recentered.x;
              session.x = recentered.x;
              setActiveDrag({
                kind,
                x: recentered.x,
                y: session.y,
                placeHudAtBottom: session.currentY < window.innerHeight * 0.45,
              });
            }
          }
        });
      }, LONG_PRESS_MS);

      sessionRef.current = session;
    },
    [blockNextClick, clearSession, commitCustomPosition]
  );

  const isDraggingOrHolding = useCallback(() => {
    return Boolean(sessionRef.current);
  }, []);

  return (
    <ToolbarDragContext.Provider
      value={{
        activeDrag,
        customPositions: toolbarLayout.customPositions,
        startHold,
        isDraggingOrHolding,
      }}
    >
      {children}
      {activeDrag && <LiveDragHud drag={activeDrag} />}
    </ToolbarDragContext.Provider>
  );
};

export function useToolbarLongPress(kind: ToolbarKind) {
  const ctx = useContext(ToolbarDragContext);
  if (!ctx) {
    return {
      isDraggingThis: false,
      customPosition: null as ToolbarCustomPoint | null,
      dragProps: {} as Partial<React.HTMLAttributes<HTMLElement>>,
    };
  }

  const isDraggingThis = ctx.activeDrag?.kind === kind;
  const customPosition: ToolbarCustomPoint | null = isDraggingThis
    ? { x: ctx.activeDrag!.x, y: ctx.activeDrag!.y }
    : ctx.customPositions?.[kind] ?? null;

  return {
    isDraggingThis,
    customPosition,
    dragProps: {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        ctx.startHold(kind, e);
      },
      onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
        if (ctx.isDraggingOrHolding()) {
          e.preventDefault();
        }
      },
    },
  };
}

/**
 * Applies exact clamped left/top coordinates to a toolbar element whenever
 * a custom free-drag position is active, and clears them when returning to
 * a docked preset layout.
 */
export function useClampedToolbarPosition(
  elRef: React.RefObject<HTMLElement | null>,
  customPosition: ToolbarCustomPoint | null,
  options?: { reserveHeight?: number }
) {
  const reserveHeight = options?.reserveHeight ?? 0;

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;

    if (!customPosition) {
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      el.style.removeProperty('max-height');
      return;
    }

    const applyClamp = () => {
      const target = elRef.current;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const effectiveHeight = Math.max(rect.height, reserveHeight);
      const maxX = Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN);
      const maxY = Math.max(
        EDGE_MARGIN,
        window.innerHeight - effectiveHeight - EDGE_MARGIN
      );
      const cx = Math.round(Math.max(EDGE_MARGIN, Math.min(maxX, customPosition.x)));
      const cy = Math.round(Math.max(EDGE_MARGIN, Math.min(maxY, customPosition.y)));

      target.style.left = `${cx}px`;
      target.style.top = `${cy}px`;
      if (reserveHeight > 0) {
        target.style.maxHeight = `${Math.max(
          reserveHeight,
          window.innerHeight - cy - EDGE_MARGIN
        )}px`;
      } else {
        target.style.removeProperty('max-height');
      }
    };

    applyClamp();

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => applyClamp())
        : null;
    ro?.observe(el);
    window.addEventListener('resize', applyClamp);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', applyClamp);
    };
  }, [elRef, customPosition, reserveHeight]);
}

const LiveDragHud: React.FC<{ drag: ActiveDragState }> = ({ drag }) => {
  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none px-3.5 py-2 rounded-full bg-[#1A1C22]/95 backdrop-blur-md border border-blue-400/50 shadow-2xl flex items-center gap-2 text-xs text-white whitespace-nowrap ${
        drag.placeHudAtBottom ? 'bottom-4' : 'top-4'
      }`}
    >
      <Move className="w-3.5 h-3.5 text-blue-400 shrink-0" />
      <span className="font-medium">{TOOLBAR_LABELS[drag.kind]}</span>
      <span className="text-zinc-400 font-mono-tabular text-[11px]">
        X {drag.x} · Y {drag.y}
      </span>
    </div>
  );
};
