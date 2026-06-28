import { defineConfig } from '@tanstack/start/config'
export default defineConfig({
  server: {
    preset: 'node-server',
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
