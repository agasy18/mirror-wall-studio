import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production is served from https://agasy18.github.io/mirror-wall-studio/, so
// built asset URLs need that prefix. Dev stays at "/" so the local server and
// the ?demo shortcuts keep working at the root. Anything loaded from public/ at
// runtime must be built with `import.meta.env.BASE_URL`, which tracks this.
//
// Keyed on `mode`, NOT `command`: `vite preview` runs as command==="serve" with
// mode==="production", so keying on command left preview serving a build whose
// asset URLs it does not host — a blank page, and no way to smoke-test a real
// production bundle locally.
export default defineConfig(({ mode }) => ({
  base: mode === "development" ? "/" : "/mirror-wall-studio/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
