import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from "node:path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.REPO_NAME || "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
