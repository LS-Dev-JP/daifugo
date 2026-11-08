import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    // 開発時はオンライン対戦の通信を `npm run dev:server`（:8090）へ転送する。
    proxy: {
      "/ws": { target: "ws://localhost:8090", ws: true },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
