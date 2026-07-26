import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// フロント(React/TS)の設定。ソースは frontend/、ビルド出力は web/（Expressが静的配信）。
// 本番は web/ の静的成果物を IIS 配信に置き換え。API契約は据え置き（/api/*）。
export default defineConfig({
  root: 'frontend',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // 開発時は Vite dev サーバ(:5173)から API(:8787) へプロキシ
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
