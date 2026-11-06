import { readFileSync } from "node:fs";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), publicAquaConfig()],
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

function publicAquaConfig(): Plugin {
  const install = (server: Pick<ViteDevServer, "middlewares">) => {
    server.middlewares.use("/aqua-config", (_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Cache-Control", "no-store");
      try {
        const path = process.env.AQUA_PUBLIC_CONFIG_PATH;
        if (!path) throw new Error("Missing configuration");
        const raw = JSON.parse(readFileSync(path, "utf8"));
        response.end(
          JSON.stringify({
            chainId: raw.chainId,
            rpcUrl: raw.rpcUrl,
            router: raw.router,
            registry: raw.registry,
            tokens: raw.tokens,
            codeHashes: raw.codeHashes,
            orders: raw.orders?.map((order: { encoded: string }) => ({ encoded: order.encoded })),
          }),
        );
      } catch {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: "Public Aqua configuration unavailable" }));
      }
    });
  };
  return { name: "public-aqua-config", configureServer: install, configurePreviewServer: install };
}
