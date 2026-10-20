import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5174 keeps the LMS frontend clear of the marketing site's dev server (5173).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  // Pre-bundle the chat SDK when the dev server starts. Chat.jsx is lazy, so
  // without this Vite only discovers Ably on the first visit to the tab,
  // re-bundles mid-session, and answers the stale copies with a 504
  // "Outdated Optimize Dep" — the lazy import fails and the page lands on the
  // error boundary. Dev only; `vite build` never had the problem.
  optimizeDeps: { include: ['ably', '@ably/chat'] },
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
