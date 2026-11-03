import { defineConfig } from 'vite';

// base: './' で GitHub Pages など任意のサブパスに置けるようにする
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
