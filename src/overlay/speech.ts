export interface DetectedSpeechLanguage {
  /** BCP-47 tag for SpeechSynthesisUtterance.lang */
  code: string;
  label: string;
}

export interface SpeakOptions {
  onEnd?: () => void;
  onError?: (error: string) => void;
}

const LANGUAGE_LABELS: Record<string, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  ja: "日本語",
  zh: "中文",
};

const LOCALE_BY_LANG: Record<string, string> = {
  es: "es-MX",
  en: "en-US",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-BR",
  it: "it-IT",
  ja: "ja-JP",
  zh: "zh-CN",
};

const WORD_MARKERS: Record<string, string[]> = {
  es: [
    "el",
    "la",
    "los",
    "las",
    "de",
    "que",
    "y",
    "en",
    "un",
    "una",
    "es",
    "por",
    "para",
    "con",
    "del",
    "al",
    "se",
    "no",
    "como",
    "más",
    "está",
    "también",
    "porque",
    "este",
    "esta",
    "hay",
    "muy",
  ],
  en: [
    "the",
    "and",
    "of",
    "to",
    "in",
    "is",
    "that",
    "for",
    "with",
    "on",
    "as",
    "are",
    "this",
    "was",
    "be",
    "have",
    "from",
    "or",
    "not",
    "you",
    "your",
    "will",
  ],
  fr: [
    "le",
    "la",
    "les",
    "de",
    "des",
    "un",
    "une",
    "et",
    "est",
    "dans",
    "pour",
    "que",
    "qui",
    "avec",
    "pas",
    "sur",
    "ce",
    "il",
    "nous",
    "vous",
  ],
  de: [
    "der",
    "die",
    "das",
    "und",
    "ist",
    "nicht",
    "ein",
    "eine",
    "von",
    "zu",
    "mit",
    "auf",
    "für",
    "den",
    "dem",
    "sich",
    "auch",
    "oder",
  ],
  pt: [
    "os",
    "as",
    "da",
    "do",
    "dos",
    "das",
    "que",
    "em",
    "um",
    "uma",
    "para",
    "com",
    "não",
    "por",
    "são",
    "está",
    "você",
    "mais",
  ],
  it: [
    "il",
    "lo",
    "gli",
    "di",
    "che",
    "un",
    "una",
    "per",
    "con",
    "non",
    "sono",
    "del",
    "della",
    "come",
    "anche",
    "questo",
    "questa",
  ],
};

/** Lightweight language guess for TTS (no network). Defaults to Spanish. */
export function detectSpeechLanguage(text: string): DetectedSpeechLanguage {
  const trimmed = text.trim();
  if (!trimmed) {
    return { code: LOCALE_BY_LANG.es, label: LANGUAGE_LABELS.es };
  }

  if (/[\u3040-\u30ff]/.test(trimmed)) {
    return { code: LOCALE_BY_LANG.ja, label: LANGUAGE_LABELS.ja };
  }
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return { code: LOCALE_BY_LANG.zh, label: LANGUAGE_LABELS.zh };
  }

  const scores: Record<string, number> = {
    es: 0,
    en: 0,
    fr: 0,
    de: 0,
    pt: 0,
    it: 0,
  };

  if (/[áéíóúñ¿¡]/i.test(trimmed)) scores.es += 4;
  if (/[äöüß]/i.test(trimmed)) scores.de += 4;
  if (/[ãõ]/i.test(trimmed)) scores.pt += 3;
  if (/[àâçéèêëïîôùûœ]/i.test(trimmed) && !/[ñ¿¡]/.test(trimmed)) {
    scores.fr += 2;
  }

  const words = trimmed
    .toLowerCase()
    .split(/[^a-záéíóúüñàèìòùäöüßçãõœ]+/i)
    .filter(Boolean);

  for (const word of words) {
    for (const [lang, markers] of Object.entries(WORD_MARKERS)) {
      if (markers.includes(word)) scores[lang] = (scores[lang] ?? 0) + 1;
    }
  }

  let best = "es";
  let bestScore = -1;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }

  return {
    code: LOCALE_BY_LANG[best] ?? LOCALE_BY_LANG.es,
    label: LANGUAGE_LABELS[best] ?? LANGUAGE_LABELS.es,
  };
}

function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

function pickVoice(langCode: string): SpeechSynthesisVoice | undefined {
  const voices = getVoices();
  if (voices.length === 0) return undefined;

  const base = langCode.split("-")[0] ?? langCode;
  return (
    voices.find((voice) => voice.lang === langCode) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${base}-`)) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(base))
  );
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSpeaking(): boolean {
  return Boolean(window.speechSynthesis?.speaking);
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel();
}

/**
 * Speaks text with window.speechSynthesis using an auto-detected language.
 * Cancels any utterance already in progress.
 */
export function speakText(
  text: string,
  options: SpeakOptions = {},
): DetectedSpeechLanguage {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("No hay texto OCR para leer en voz alta.");
  }
  if (!isSpeechSupported()) {
    throw new Error("Este entorno no soporta lectura en voz alta (speechSynthesis).");
  }

  const detected = detectSpeechLanguage(trimmed);
  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.lang = detected.code;

  const voice = pickVoice(detected.code);
  if (voice) utterance.voice = voice;

  utterance.onend = () => options.onEnd?.();
  utterance.onerror = (event) => {
    if (event.error === "canceled" || event.error === "interrupted") {
      options.onEnd?.();
      return;
    }
    options.onError?.(event.error || "Error de síntesis de voz");
  };

  // Some WebViews populate voices asynchronously; speaking still works with lang alone.
  if (!voice) {
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        const lateVoice = pickVoice(detected.code);
        if (lateVoice && !window.speechSynthesis.speaking) {
          utterance.voice = lateVoice;
        }
      },
      { once: true },
    );
  }

  window.speechSynthesis.speak(utterance);
  return detected;
}
