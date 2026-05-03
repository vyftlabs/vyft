import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "./components/ui/sonner";
import { queryClient } from "./lib/reactquery";
import "./index.css";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("missing #root");
}
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
