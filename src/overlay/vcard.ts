export interface ContactDetails {
  fullName: string;
  phone?: string;
  email?: string;
  organization?: string;
  title?: string;
  note?: string;
}

function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldVCardLine(line: string): string {
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

function splitName(fullName: string): { family: string; given: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { family: "Contacto", given: "" };
  if (parts.length === 1) return { family: parts[0], given: "" };
  return {
    given: parts.slice(0, -1).join(" "),
    family: parts[parts.length - 1] ?? "",
  };
}

/** Builds a vCard 3.0 (.vcf) document from contact fields. */
export function buildVCard(details: ContactDetails): string {
  const name = details.fullName.trim() || "Contacto";
  const { family, given } = splitName(name);

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCardValue(family)};${escapeVCardValue(given)};;;`,
    `FN:${escapeVCardValue(name)}`,
  ];

  if (details.organization?.trim()) {
    lines.push(`ORG:${escapeVCardValue(details.organization.trim())}`);
  }
  if (details.title?.trim()) {
    lines.push(`TITLE:${escapeVCardValue(details.title.trim())}`);
  }
  if (details.phone?.trim()) {
    lines.push(`TEL;TYPE=CELL:${escapeVCardValue(details.phone.trim())}`);
  }
  if (details.email?.trim()) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(details.email.trim())}`);
  }
  if (details.note?.trim()) {
    lines.push(`NOTE:${escapeVCardValue(details.note.trim())}`);
  }

  lines.push("END:VCARD");
  return `${lines.map(foldVCardLine).join("\r\n")}\r\n`;
}

function sanitizeFilename(title: string, fallback: string): string {
  const cleaned = title
    .trim()
    .replace(/[^\w\s\-áéíóúñÁÉÍÓÚÑ]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);

  return cleaned || fallback;
}

/** Triggers a system download of a .vcf file (same mechanism as .ics). */
export function downloadVcfFile(content: string, title: string): void {
  const filename = `${sanitizeFilename(title, "contacto")}.vcf`;
  const blob = new Blob([content], { type: "text/vcard;charset=utf-8" });
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

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}\b/;

export function hasContactPattern(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return EMAIL_PATTERN.test(trimmed) || PHONE_PATTERN.test(trimmed);
}

/** Local heuristic extraction used as fallback / seed for AI. */
export function extractContactHeuristics(text: string): Partial<ContactDetails> {
  const trimmed = text.trim();
  const email = trimmed.match(EMAIL_PATTERN)?.[0];
  const phone = trimmed.match(PHONE_PATTERN)?.[0];

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let fullName: string | undefined;
  let organization: string | undefined;

  for (const line of lines) {
    if (EMAIL_PATTERN.test(line) || PHONE_PATTERN.test(line)) continue;
    if (/^(tel|phone|correo|email|mail|empresa|company|org)\b/i.test(line)) continue;

    if (!fullName && /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\-]{1,60}$/.test(line)) {
      const words = line.split(/\s+/);
      if (words.length >= 2 && words.length <= 5) {
        fullName = line;
        continue;
      }
    }

    if (
      !organization &&
      /(?:S\.?\s*A\.?|S\.?\s*de\s*R\.?\s*L\.?|Inc\.?|LLC|Corp\.?|Ltd\.?|Company|Empresa)/i.test(
        line,
      )
    ) {
      organization = line;
    }
  }

  return {
    fullName,
    phone: phone?.replace(/\s+/g, " ").trim(),
    email: email?.trim(),
    organization,
  };
}
