import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
  },
  build: {
    // 纯静态输出目录，未来直接作为 Tauri 的 frontendDist
    outDir: 'dist',
    emptyOutDir: true,
  },
});
