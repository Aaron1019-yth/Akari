import React from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/geist";

import { App } from "./App";
import { ErrorBoundary } from "./shared/ui/ErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
