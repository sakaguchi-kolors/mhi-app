-- 担当者=ログインユーザーへ統合

-- 1) ユーザー×機種
CREATE TABLE "m_user_kishu" (
    "user_id" INTEGER NOT NULL,
    "kishu" TEXT NOT NULL,
    CONSTRAINT "m_user_kishu_pkey" PRIMARY KEY ("user_id","kishu")
);
ALTER TABLE "m_user_kishu" ADD CONSTRAINT "m_user_kishu_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "m_user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- m_owner_kishu → m_user_kishu（氏名=display_name で突合）
INSERT INTO "m_user_kishu" ("user_id", "kishu")
SELECT u."user_id", ok."kishu"
FROM "m_owner_kishu" ok
JOIN "m_owner" o ON o."owner_id" = ok."owner_id"
JOIN "m_user" u ON u."display_name" = o."name"
ON CONFLICT DO NOTHING;

-- 2) 割当を user_id 化
ALTER TABLE "t_assignment" ADD COLUMN "user_id" INTEGER;
ALTER TABLE "t_assignment" ADD CONSTRAINT "t_assignment_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "m_user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- owner 文字列 → user（display_name 一致）
UPDATE "t_assignment" a
SET "user_id" = u."user_id"
FROM "m_user" u
WHERE a."owner" = u."display_name" AND a."owner" <> '未割当';

-- owner 文字列 → user（旧 m_owner 経由）
UPDATE "t_assignment" a
SET "user_id" = u."user_id"
FROM "m_owner" o
JOIN "m_user" u ON u."display_name" = o."name"
WHERE a."owner" = o."name" AND a."owner" <> '未割当' AND a."user_id" IS NULL;

ALTER TABLE "t_assignment" DROP COLUMN "owner";
