import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5174 keeps the LMS frontend clear of the marketing site's dev server (5173).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
