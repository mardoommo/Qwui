import React from "react";
import ReactDOM from "react-dom/client";
import { installStorageShim } from "./apiStorage.js";
import App from "./App.jsx";
import "./index.css";

// Muss vor dem Rendern der App laufen, da App.jsx window.storage verwendet.
// Speichert jetzt zentral in Cloudflare D1 statt im lokalen Browser-Speicher.
installStorageShim();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  });
}
