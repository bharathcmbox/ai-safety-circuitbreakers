import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `base` is relative so the build works on GitHub Pages sub-paths, Netlify, Vercel, or a file share.
// `--mode single` inlines everything into one HTML file (handy for sharing a single file).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
