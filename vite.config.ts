import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: false,
  cacheDir: process.env.VITE_CACHE_DIR,
  resolve: {
    alias: [
      { find: /^assert$/, replacement: "assert/" },
      { find: /^process$/, replacement: "process/browser" },
    ],
  },
  server: { port: 4173 },
});
