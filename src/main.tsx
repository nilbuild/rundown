import "~/styles/base.css";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "~/app";
import { ErrorBoundary } from "~/components/ui/error-boundary";
import { TooltipProvider } from "~/components/ui/tooltip-provider";
import { platform } from "@tauri-apps/plugin-os";

/// The stylesheet needs the platform too, not just the components — scrollbars
/// are drawn differently on each one.
document.documentElement.dataset.platform = platform();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
