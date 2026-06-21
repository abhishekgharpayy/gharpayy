import { defineConfig } from '@tanstack/start/config'
export default defineConfig({
  server: {
    preset: 'vercel',
  },
  react: {
    babel: {
      plugins: [],
    },
  },
  tsr: {
    appDirectory: './src',
  },
})
