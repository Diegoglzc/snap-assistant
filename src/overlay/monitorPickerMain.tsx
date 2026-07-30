import React from "react";
import ReactDOM from "react-dom/client";
import MonitorPicker from "./MonitorPicker";
import "./overlay.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MonitorPicker />
  </React.StrictMode>,
);
