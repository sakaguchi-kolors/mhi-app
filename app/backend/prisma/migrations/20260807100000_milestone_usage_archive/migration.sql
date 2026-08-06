-- FLEXSCHE JND(実績) + 中間マイルストン過去マスタ
ALTER TABLE "t_routing" ADD COLUMN "actual_end" TIMESTAMPTZ;

ALTER TABLE "m_milestone" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "m_milestone" ADD COLUMN "archived_manual" BOOLEAN NOT NULL DEFAULT false;
