# アプリ本体（ETL＋API＋フロントビルド）のコンテナ。
# 「ワンコマンド確認モード」= docker compose --profile full up で使用。
# 日常の開発は Docker=DBのみ＋ホストNodeのホットリロードを推奨（README参照）。
FROM node:20-slim

WORKDIR /app

# 依存だけ先に入れてレイヤキャッシュを効かせる
COPY package*.json ./
RUN npm install

# ソース一式（.dockerignore で node_modules/web/.env/.git は除外）
COPY . .

# フロント(React)を web/ へ静的ビルド
RUN npm run build:web

EXPOSE 8787

# 起動時：スキーマ適用＆マスタ既定シード → CSV取込・算出 → API＋静的配信
CMD ["sh", "-c", "npm run db:init && npm run etl && npm run dev"]
