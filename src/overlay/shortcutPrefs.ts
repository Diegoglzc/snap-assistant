import { invoke } from "@tauri-apps/api/core";

export interface GlobalShortcutConfig {
  modifiers: string[];
  key: string;
}

const STORAGE_KEY = "snap-assistant.shortcut";

export const DEFAULT_GLOBAL_SHORTCUT: GlobalShortcutConfig = {
  modifiers: ["Super", "Shift"],
  key: "Digit4",
};

const ALLOWED_MODIFIERS = new Set(["Super", "Shift", "Alt", "Control"]);

function isValidShortcut(value: unknown): value is GlobalShortcutConfig {
  if (!value || typeof value !== "object") return false;
  const shortcut = value as GlobalShortcutConfig;
  return (
    Array.isArray(shortcut.modifiers) &&
    shortcut.modifiers.length > 0 &&
    shortcut.modifiers.every(
      (modifier) =>
        typeof modifier === "string" && ALLOWED_MODIFIERS.has(modifier),
    ) &&
    typeof shortcut.key === "string" &&
    shortcut.key.length > 0
  );
}

function modifiersEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((modifier, index) => modifier === sortedB[index]);
}

export function isDefaultGlobalShortcut(
  shortcut: GlobalShortcutConfig,
): boolean {
  return (
    shortcut.key === DEFAULT_GLOBAL_SHORTCUT.key &&
    modifiersEqual(shortcut.modifiers, DEFAULT_GLOBAL_SHORTCUT.modifiers)
  );
}

export function getStoredGlobalShortcut(): GlobalShortcutConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isValidShortcut(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_GLOBAL_SHORTCUT;
}

export function setStoredGlobalShortcut(shortcut: GlobalShortcutConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcut));
  } catch {
    // ignore
  }
}

export function modifierToSymbol(modifier: string): string {
  switch (modifier) {
    case "Super":
      return "⌘";
    case "Shift":
      return "⇧";
    case "Alt":
      return "⌥";
    case "Control":
      return "⌃";
    default:
      return modifier;
  }
}

export function codeToDisplayLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return code.slice(6);

  const special: Record<string, string> = {
    Space: "Space",
    Enter: "↩",
    Escape: "Esc",
    Backspace: "⌫",
    Delete: "⌦",
    Tab: "⇥",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  };

  return special[code] ?? code;
}

export function formatShortcutDisplay(shortcut: GlobalShortcutConfig): string {
  const parts = shortcut.modifiers.map(modifierToSymbol);
  parts.push(codeToDisplayLabel(shortcut.key));
  return parts.join("");
}

export function collectModifiersFromEvent(event: KeyboardEvent): string[] {
  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push("Super");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return modifiers;
}

export function isModifierKeyCode(code: string): boolean {
  return [
    "MetaLeft",
    "MetaRight",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "ShiftLeft",
    "ShiftRight",
  ].includes(code);
}

export async function applyGlobalShortcut(
  shortcut: GlobalShortcutConfig,
): Promise<void> {
  await invoke("update_global_shortcut", {
    modifiers: shortcut.modifiers,
    key: shortcut.key,
  });
}

export async function applyStoredGlobalShortcutIfNeeded(): Promise<void> {
  const shortcut = getStoredGlobalShortcut();
  if (isDefaultGlobalShortcut(shortcut)) return;
  await applyGlobalShortcut(shortcut);
}
