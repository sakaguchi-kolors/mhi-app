import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// フロント(React/TS)。ソースは frontend/、ビルド出力は frontend/dist（本番は IIS 配信）。
// 開発時は Vite dev(:5173) から API(:8787) へ /api をプロキシ。API契約は /api/* で据え置き。
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
