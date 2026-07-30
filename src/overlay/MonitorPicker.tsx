import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

function readPickerParams() {
  const params = new URLSearchParams(window.location.search);
  const index = Number.parseInt(params.get("index") ?? "0", 10);
  const total = Number.parseInt(params.get("total") ?? "1", 10);

  return {
    index: Number.isFinite(index) ? index : 0,
    total: Number.isFinite(total) ? total : 1,
  };
}

export default function MonitorPicker() {
  const { index, total } = useMemo(readPickerParams, []);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void invoke("cancel_monitor_picker");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleMouseEnter = () => {
    setHovered(true);
    void getCurrentWebviewWindow().setFocus();
  };

  const handleClick = () => {
    void invoke("confirm_monitor_selection", { monitorIndex: index });
  };

  return (
    <div
      className={`fixed inset-0 cursor-pointer transition-[background-color,box-shadow] duration-150 ${
        hovered
          ? "bg-violet-500/12 shadow-[inset_0_0_0_3px_rgba(167,139,250,0.75)]"
          : "bg-black/5"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      {hovered && (
        <div className="pointer-events-none fixed left-1/2 top-4 -translate-x-1/2 rounded-full border border-violet-300/25 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 shadow-md">
          Pantalla {index + 1} de {total} · Clic para capturar · Esc para cancelar
        </div>
      )}
    </div>
  );
}
