-- 一旦置いておく部品（通常一覧から除外）
CREATE TABLE "t_shelved" (
    "os_id" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagged_at" TIMESTAMPTZ,
    CONSTRAINT "t_shelved_pkey" PRIMARY KEY ("os_id")
);
