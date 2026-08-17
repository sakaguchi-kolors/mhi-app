-- 標準時間(Hs)の取込先。FLEXSCHE の Hs 列（単位:時間）
ALTER TABLE "t_routing" ADD COLUMN "hs" DECIMAL;

-- Shop別 実績リードタイム集計（バッチ再生成）
CREATE TABLE "t_shop_lt_stat" (
    "shop" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "p50" DECIMAL NOT NULL,
    "p75" DECIMAL NOT NULL,
    "p90" DECIMAL NOT NULL,
    "mean" DECIMAL NOT NULL,
    "hs_median" DECIMAL,
    "computed_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "t_shop_lt_stat_pkey" PRIMARY KEY ("shop")
);
