-- 中間マイルストン: ルール形式 → SHOP×JOB チェック形式へ移行
DROP TABLE IF EXISTS "m_milestone";

CREATE TABLE "m_milestone" (
    "shop" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "gaic" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "m_milestone_pkey" PRIMARY KEY ("shop","job")
);
