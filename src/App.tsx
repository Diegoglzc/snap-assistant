import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import OpenAIModelSelector from "./overlay/OpenAIModelSelector";
import {
  getDefaultOpenAIModel,
  setDefaultOpenAIModel,
  type OpenAIModelId,
} from "./overlay/openaiPrefs";
import TranslateLanguageSelector from "./overlay/TranslateLanguageSelector";
import {
  getDefaultTargetLanguage,
  setDefaultTargetLanguage,
  type TargetLanguageCode,
} from "./overlay/translationPrefs";
import "./App.css";

interface ProcessCaptureResult {
  capture: {
    x: number;
    y: number;
    width: number;
    height: number;
    image_base64: string;
  };
  ocr_text: string;
  ocr_lines: string[];
  ocr_confidence: number;
}

function App() {
  const [lastCapture, setLastCapture] = useState<ProcessCaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultTargetLanguage, setDefaultTargetLanguageState] =
    useState<TargetLanguageCode>(getDefaultTargetLanguage);
  const [defaultOpenAIModel, setDefaultOpenAIModelState] =
    useState<OpenAIModelId>(getDefaultOpenAIModel);

  useEffect(() => {
    const unlisten = listen<ProcessCaptureResult>("capture-complete", (event) => {
      setLastCapture(event.payload);
      setError(null);
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  async function startCapture() {
    setError(null);
    try {
      await invoke("start_capture_overlay");
    } catch (err) {
      setError(String(err));
    }
  }

  function handleDefaultLanguageChange(code: TargetLanguageCode) {
    setDefaultTargetLanguageState(code);
    setDefaultTargetLanguage(code);
  }

  function handleDefaultOpenAIModelChange(model: OpenAIModelId) {
    setDefaultOpenAIModelState(model);
    setDefaultOpenAIModel(model);
  }

  return (
    <main className="container">
      <h1>snap-assistant</h1>
      <p className="subtitle">Captura parcial de pantalla para macOS</p>

      <section className="capture-section">
        <button type="button" onClick={() => void startCapture()}>
          Iniciar captura
        </button>
        <p className="shortcuts">
          Atajos globales: <kbd>⌘⇧4</kbd> o <kbd>⌘⌥S</kbd>
        </p>
        <p className="note">
          Tras seleccionar una región verás un menú flotante con OCR local
          (Apple Vision) y funciones inteligentes vía OpenAI.
        </p>
      </section>

      <section className="settings-section">
        <h2>Preferencias</h2>
        <TranslateLanguageSelector
          value={defaultTargetLanguage}
          onChange={handleDefaultLanguageChange}
        />
        <p className="note">
          Idioma de salida predeterminado para traducciones. Puedes cambiarlo
          también en el menú flotante antes de traducir.
        </p>
        <OpenAIModelSelector
          value={defaultOpenAIModel}
          onChange={handleDefaultOpenAIModelChange}
        />
        <p className="note">
          Modelo de OpenAI para Visión IA, Shop y acciones de texto cuando el
          OCR local no detecta contenido. Requiere{" "}
          <code>VITE_OPENAI_API_KEY</code> en tu archivo <code>.env</code>.
        </p>
      </section>

      {error && <p className="error">{error}</p>}

      {lastCapture && (
        <section className="preview-section">
          <h2>Última captura</h2>
          <p className="region-info">
            Región: {lastCapture.capture.width} × {lastCapture.capture.height} px
          </p>
          {lastCapture.ocr_text && (
            <p className="ocr-preview">
              OCR: {lastCapture.ocr_text.slice(0, 180)}
              {lastCapture.ocr_text.length > 180 ? "…" : ""}
            </p>
          )}
          <img
            className="capture-preview"
            src={`data:image/png;base64,${lastCapture.capture.image_base64}`}
            alt={`Captura ${lastCapture.capture.width}x${lastCapture.capture.height}`}
          />
        </section>
      )}
    </main>
  );
}

export default App;
