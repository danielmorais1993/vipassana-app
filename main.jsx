// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App"; // adjust filename if needed
import "./index.css"; // if you have global CSS; otherwise remove

const container = document.getElementById("root");
if (!container) {
  throw new Error("No #root element found in index.html");
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
