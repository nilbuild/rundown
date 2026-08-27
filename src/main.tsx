import React from "react";
import ReactDOM from "react-dom/client";
import App from "~/app";
import { ErrorBoundary } from "~/components/ui/error-boundary";
import { TooltipProvider } from "~/components/ui/tooltip";
import "~/styles/base.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
