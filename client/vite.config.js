import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5174 keeps the LMS frontend clear of the marketing site's dev server (5173).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  resolve: {
    alias: {
      // '@/components/Empty.jsx' instead of '../../components/Empty.jsx'.
      // Added as an option, not a migration: every existing relative import
      // still resolves exactly as before, so nothing had to be rewritten.
      // Use it in new files and when a path would otherwise climb two levels.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
