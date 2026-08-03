export interface CalendarEventDetails {
  title: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Formats a date as UTC iCalendar DATETIME (YYYYMMDDTHHMMSSZ). */
export function formatIcsDateUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;

  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, max));
  remaining = remaining.slice(max);

  while (remaining.length > 0) {
    parts.push(` ${remaining.slice(0, max - 1)}`);
    remaining = remaining.slice(max - 1);
  }

  return parts.join("\r\n");
}

function buildIcsDocument(componentLines: string[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//snap-assistant//ES",
    "CALSCALE:GREGORIAN",
    ...componentLines,
    "END:VCALENDAR",
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function newUid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@snap-assistant`;
}

export function buildEventIcs(details: CalendarEventDetails): string {
  const now = formatIcsDateUtc(new Date());
  const lines = [
    "BEGIN:VEVENT",
    `UID:${newUid("event")}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsDateUtc(details.start)}`,
    `DTEND:${formatIcsDateUtc(details.end)}`,
    `SUMMARY:${escapeIcsText(details.title)}`,
  ];

  if (details.location?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(details.location.trim())}`);
  }
  if (details.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(details.description.trim())}`);
  }

  lines.push("END:VEVENT");
  return buildIcsDocument(lines);
}

export function buildTodoIcs(details: CalendarEventDetails): string {
  const now = formatIcsDateUtc(new Date());
  const lines = [
    "BEGIN:VTODO",
    `UID:${newUid("todo")}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsDateUtc(details.start)}`,
    `DUE:${formatIcsDateUtc(details.end)}`,
    `SUMMARY:${escapeIcsText(details.title)}`,
    "STATUS:NEEDS-ACTION",
  ];

  if (details.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(details.description.trim())}`);
  }

  lines.push("END:VTODO");
  return buildIcsDocument(lines);
}

function sanitizeFilename(title: string, fallback: string): string {
  const cleaned = title
    .trim()
    .replace(/[^\w\s\-áéíóúñÁÉÍÓÚÑ]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);

  return cleaned || fallback;
}

/** Triggers a system download of a .ics file so the OS can open the default calendar app. */
export function downloadIcsFile(content: string, title: string, kind: "event" | "todo"): void {
  const filename = `${sanitizeFilename(title, kind === "todo" ? "recordatorio" : "evento")}.ics`;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
