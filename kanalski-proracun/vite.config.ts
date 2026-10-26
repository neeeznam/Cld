import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// "single" mod pravi jedan HTML fajl (za web pregled); običan build je za Tauri.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  base: './',
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', target: 'es2020' },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  test: { globals: true },
}));
