import type { OverlayPhase, SelectionRect } from "./types";

interface SelectionFrameProps {
  rect: SelectionRect;
  phase: OverlayPhase;
}

const CORNER_SIZE = 12;

function CornerMarks({ x, y, width, height }: SelectionRect) {
  const corners = [
    { left: x, top: y, borders: "border-l-2 border-t-2" },
    { left: x + width - CORNER_SIZE, top: y, borders: "border-r-2 border-t-2" },
    { left: x, top: y + height - CORNER_SIZE, borders: "border-l-2 border-b-2" },
    {
      left: x + width - CORNER_SIZE,
      top: y + height - CORNER_SIZE,
      borders: "border-r-2 border-b-2",
    },
  ];

  return (
    <>
      {corners.map((corner, index) => (
        <div
          key={index}
          className={`pointer-events-none fixed border-violet-400 ${corner.borders}`}
          style={{
            left: corner.left,
            top: corner.top,
            width: CORNER_SIZE,
            height: CORNER_SIZE,
          }}
        />
      ))}
    </>
  );
}

export default function SelectionFrame({ rect, phase }: SelectionFrameProps) {
  const { x, y, width, height } = rect;
  const isLocked = phase === "menu";

  return (
    <>
      <div
        className={`pointer-events-none fixed border border-violet-400/90 shadow-[0_0_6px_rgba(139,92,246,0.35)] transition-opacity duration-200 ${
          isLocked ? "opacity-100" : "opacity-90"
        }`}
        style={{ left: x, top: y, width, height }}
      />

      <CornerMarks x={x} y={y} width={width} height={height} />

      <div
        className={`pointer-events-none fixed -translate-x-1/2 -translate-y-full rounded-full border border-violet-300/30 bg-slate-900/90 px-3 py-1 text-[11px] font-medium tracking-wide text-violet-100 shadow-md transition-all duration-200 ${
          isLocked ? "animate-pill-reveal" : ""
        }`}
        style={{ left: x + width / 2, top: Math.max(8, y - 6) }}
      >
        {Math.round(width)} × {Math.round(height)}px
      </div>
    </>
  );
}
