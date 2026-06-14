import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: {
      preset: 'vercel'
    }
  },
  vite: {
    server: {
      port: 3001,
      allowedHosts: [".trycloudflare.com"],
    },
  },
});
