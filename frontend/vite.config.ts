import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 開発時のみ。本番は VITE_API_BASE（.env）または同一オリジンの /api
  server: {
    proxy: {
      '/api': 'https://share-photo-api.bysontech.jp',
    },
  },
});
