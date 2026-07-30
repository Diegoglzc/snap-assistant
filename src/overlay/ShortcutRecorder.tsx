import { useEffect, useState } from "react";
import {
  applyGlobalShortcut,
  collectModifiersFromEvent,
  formatShortcutDisplay,
  getStoredGlobalShortcut,
  isModifierKeyCode,
  setStoredGlobalShortcut,
  type GlobalShortcutConfig,
} from "./shortcutPrefs";

interface ShortcutRecorderProps {
  onChange?: (shortcut: GlobalShortcutConfig) => void;
}

export default function ShortcutRecorder({ onChange }: ShortcutRecorderProps) {
  const [shortcut, setShortcut] = useState<GlobalShortcutConfig>(
    getStoredGlobalShortcut,
  );
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;

    function handleKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (isModifierKeyCode(event.code)) return;

      const modifiers = collectModifiersFromEvent(event);
      if (modifiers.length === 0) {
        setError(
          "El atajo debe incluir al menos un modificador (⌘, ⌥, ⇧ o ⌃).",
        );
        return;
      }

      const nextShortcut: GlobalShortcutConfig = {
        modifiers,
        key: event.code,
      };

      setShortcut(nextShortcut);
      setStoredGlobalShortcut(nextShortcut);
      onChange?.(nextShortcut);
      setRecording(false);
      setError(null);

      void applyGlobalShortcut(nextShortcut).catch((err) => {
        setError(String(err));
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recording]);

  return (
    <div className="shortcut-recorder">
      <span className="shortcut-recorder-label">Atajo global:</span>
      <kbd className="shortcut-recorder-value">
        {formatShortcutDisplay(shortcut)}
      </kbd>
      <button
        type="button"
        className={recording ? "recording" : undefined}
        onClick={() => {
          setError(null);
          setRecording(true);
        }}
      >
        {recording ? "Presiona una combinación…" : "Grabar atajo"}
      </button>
      {error && <span className="shortcut-recorder-error">{error}</span>}
    </div>
  );
}
