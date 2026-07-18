// entry-prerender.tsx — the SSR entry Vite builds for Node (vite build --ssr).
// prerender.mjs imports the built version of this and calls render(url) once per
// content route, then injects the returned body + head into the built index.html.
//
// This renders the SAME route table as the browser (AppRoutes), but wrapped in a
// StaticRouter instead of BrowserRouter so no window.history is touched. The
// __PRERENDER__ flag is set here (belt-and-suspenders with prerender.mjs) so the
// App's auth-loading gate is bypassed and real page content renders.
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { HelmetProvider, type HelmetServerState } from "react-helmet-async";
import { AppRoutes } from "./App";

globalThis.__PRERENDER__ = true;

export type PrerenderResult = {
  /** Inner HTML for <div id="root">…</div>. */
  html: string;
  /** Rendered <head> tags (title, meta, link, script/JSON-LD) as HTML strings. */
  head: string;
};

export function render(url: string): PrerenderResult {
  const helmetContext: { helmet?: HelmetServerState } = {};

  const html = renderToString(
    <StrictMode>
      <HelmetProvider context={helmetContext}>
        <StaticRouter location={url}>
          <AppRoutes />
        </StaticRouter>
      </HelmetProvider>
    </StrictMode>,
  );

  const h = helmetContext.helmet;
  const head = h
    ? [
        h.title.toString(),
        h.meta.toString(),
        h.link.toString(),
        h.script.toString(),
      ]
        .filter(Boolean)
        .join("\n    ")
    : "";

  return { html, head };
}
