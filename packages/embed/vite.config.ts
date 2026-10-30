import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Library builds don't replace this automatically, and React needs it to pick its production build.
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
  build: {
    lib: {
      entry: 'src/index.tsx',
      name: 'AppLens',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'es' ? 'app-lens.mjs' : 'app-lens.js'),
    },
  },
}));
