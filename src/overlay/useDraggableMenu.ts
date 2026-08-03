import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  adjustMenuPositionForResultPanel,
  clampMenuPosition,
  computeInitialMenuPosition,
  getViewportSize,
  type Point,
} from "./menuPosition";
import type { SelectionRect } from "./types";

interface UseDraggableMenuOptions {
  selection: SelectionRect;
  layoutKey: string;
}

export function useDraggableMenu({ selection, layoutKey }: UseDraggableMenuOptions) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const userDragged = useRef(false);
  const needsInitialPlacement = useRef(true);
  const dragState = useRef<{ startX: number; startY: number; origin: Point } | null>(null);

  const measureAndPlace = useCallback((mode: "initial" | "clamp") => {
    const element = menuRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const menuSize = { width: rect.width, height: rect.height };
    const viewport = getViewportSize();

    setPosition((current) => {
      if (mode === "initial" || current === null) {
        return computeInitialMenuPosition(selection, menuSize, viewport);
      }
      return clampMenuPosition(current, menuSize, viewport);
    });
  }, [selection]);

  useEffect(() => {
    userDragged.current = false;
    needsInitialPlacement.current = true;
    dragState.current = null;
    setIsDragging(false);
    setPosition(null);
  }, [selection]);

  useLayoutEffect(() => {
    measureAndPlace(needsInitialPlacement.current ? "initial" : "clamp");
    needsInitialPlacement.current = false;
  }, [selection, layoutKey, measureAndPlace]);

  useEffect(() => {
    const handleResize = () => measureAndPlace("clamp");
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [measureAndPlace]);

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (position === null) return;

    event.preventDefault();
    event.stopPropagation();

    userDragged.current = true;
    setIsDragging(true);
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !menuRef.current) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = menuRef.current.getBoundingClientRect();
    const deltaX = event.clientX - dragState.current.startX;
    const deltaY = event.clientY - dragState.current.startY;

    setPosition(
      clampMenuPosition(
        {
          x: dragState.current.origin.x + deltaX,
          y: dragState.current.origin.y + deltaY,
        },
        { width: rect.width, height: rect.height },
      ),
    );
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;

    event.preventDefault();
    event.stopPropagation();

    dragState.current = null;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const repositionForResultPanel = useCallback(
    (resultHeight: number) => {
      const element = menuRef.current;
      if (!element || resultHeight <= 0) return;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      setPosition((current) => {
        if (current === null) return current;

        return adjustMenuPositionForResultPanel(
          current,
          { width: rect.width, height: rect.height },
          resultHeight,
        );
      });
    },
    [],
  );

  return {
    menuRef,
    position,
    isDragging,
    isVisible: position !== null,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    repositionForResultPanel,
  };
}
