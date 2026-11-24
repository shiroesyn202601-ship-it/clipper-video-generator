import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const SERVER_URL = "http://127.0.0.1:5174";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: SERVER_URL, changeOrigin: false } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
