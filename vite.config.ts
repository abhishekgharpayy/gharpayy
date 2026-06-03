import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: false,
  vite: {
    server: {
      port: 3001,
      allowedHosts: [".trycloudflare.com"],
    },
  },
});
