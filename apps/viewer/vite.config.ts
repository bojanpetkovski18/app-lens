import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the built viewer works from any folder; the CLI copies it into generated sites.
  base: './',
  plugins: [react()],
});
