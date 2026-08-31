-- 要ウォッチ部品フラグ（アプリ固有③）
CREATE TABLE "t_watch" (
    "os_id" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagged_at" TIMESTAMPTZ,

    CONSTRAINT "t_watch_pkey" PRIMARY KEY ("os_id")
);

-- 中間マイルストン：次MSまでの余裕日数（負=遅れ）
ALTER TABLE "t_timeline" ADD COLUMN "ms_behind" INTEGER;

-- 納期優先：Flexi(小日程)を最後に（PBS・OCTPuSを優先）
UPDATE "m_param" SET "value" = 'octopus', "updated_at" = CURRENT_TIMESTAMP WHERE "key" = 'KISHU_DUE_PRIORITY_2';
UPDATE "m_param" SET "value" = 'flexsche', "updated_at" = CURRENT_TIMESTAMP WHERE "key" = 'KISHU_DUE_PRIORITY_3';
