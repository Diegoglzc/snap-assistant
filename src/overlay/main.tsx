import React from "react";
import ReactDOM from "react-dom/client";
import CaptureOverlay from "./CaptureOverlay";
import "./overlay.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CaptureOverlay />
  </React.StrictMode>,
);
