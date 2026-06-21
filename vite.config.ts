import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  cloudflare: false,
  vite: {
    server: {
      port: 3001,
      allowedHosts: [".trycloudflare.com"],
      hmr: {
        clientPort: 3001,
        host: "localhost",
        protocol: "ws",
      },
    },
    plugins: [
      nitro({ preset: "node-server" })
    ]
  },
});
