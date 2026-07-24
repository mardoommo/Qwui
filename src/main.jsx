import React from "react";
import ReactDOM from "react-dom/client";
import { installStorageShim as installCloudStorageShim } from "./apiStorage.js";
import { installStorageShim as installElectronStorageShim } from "./electronStorage.js";
import App from "./App.jsx";
import "./index.css";

// Muss vor dem Rendern der App laufen, da App.jsx window.storage verwendet.
// Läuft die App in der Windows-Desktop-Version (Electron), stellt das
// Preload-Skript window.qwuiDesktopStorage bereit — dann lokal in die
// Excel-Datei/firma.json speichern statt in Cloudflare D1.
const isElectron = typeof window !== "undefined" && !!window.qwuiDesktopStorage;
if (isElectron) {
  installElectronStorageShim();
} else {
  installCloudStorageShim();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker ist nur für die gehostete Web-Version relevant (Offline-Cache
// der Oberfläche). Unter Electron (file://) funktionieren Service Worker
// ohnehin nicht und würden nur eine unnötige Konsolen-Warnung erzeugen.
if (!isElectron && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  });
}
