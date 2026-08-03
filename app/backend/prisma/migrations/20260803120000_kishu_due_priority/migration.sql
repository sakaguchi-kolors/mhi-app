-- OCTPuS JND 候補日の保持 + 機種別納期優先順位マスタ
ALTER TABLE "t_part" ADD COLUMN "oct_due" DATE;

CREATE TABLE "m_kishu_due_priority" (
    "kishu" TEXT NOT NULL,
    "priority_1" TEXT NOT NULL,
    "priority_2" TEXT NOT NULL,
    "priority_3" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    CONSTRAINT "m_kishu_due_priority_pkey" PRIMARY KEY ("kishu")
);

ALTER TABLE "m_kishu_due_priority" ADD CONSTRAINT "m_kishu_due_priority_kishu_fkey"
    FOREIGN KEY ("kishu") REFERENCES "m_kishu"("kishu") ON DELETE CASCADE ON UPDATE CASCADE;
