import "./theme/tokens.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { App } from "./App.js";

// createRoot (not hydrateRoot): the client re-renders the SPA over the prerendered
// DOM rather than hydrating it, so a spinner-vs-content mismatch is impossible and
// real-user behavior is byte-identical to before prerendering. See prerender.mjs.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
);
