import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/mini-game/" : "/",
  plugins: [react()],
  build: {
    outDir: "dist/client",
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  test: {
    exclude: [...configDefaults.exclude, "games/brasshaven/tests/**"],
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.ts"],
  },
}));
