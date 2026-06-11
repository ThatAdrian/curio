import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";

// HashRouter avoids GitHub Pages 404s on deep links — swap to BrowserRouter
// later if you move to a host with SPA rewrites (Vercel/Netlify/Cloudflare).
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
