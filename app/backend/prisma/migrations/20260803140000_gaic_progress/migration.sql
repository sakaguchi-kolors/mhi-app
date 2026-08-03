-- 外注工程進捗表示：希望納期 + タイムラインへの外注日付・フェーズ

ALTER TABLE "t_routing" ADD COLUMN "req_due_date" DATE;

ALTER TABLE "t_timeline" ADD COLUMN "gaic_phase" TEXT;
ALTER TABLE "t_timeline" ADD COLUMN "out_date" DATE;
ALTER TABLE "t_timeline" ADD COLUMN "in_date" DATE;
ALTER TABLE "t_timeline" ADD COLUMN "eta_date" DATE;
ALTER TABLE "t_timeline" ADD COLUMN "req_due_date" DATE;
