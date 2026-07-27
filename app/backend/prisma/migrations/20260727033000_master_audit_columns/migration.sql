-- マスタ行に更新者・更新日時を追加（履歴追跡の第1層）
ALTER TABLE "m_param" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_param" ADD COLUMN "created_by" TEXT;
ALTER TABLE "m_param" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_param" ADD COLUMN "updated_by" TEXT;

ALTER TABLE "m_milestone" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_milestone" ADD COLUMN "created_by" TEXT;
ALTER TABLE "m_milestone" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_milestone" ADD COLUMN "updated_by" TEXT;

ALTER TABLE "m_shop_lt" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_shop_lt" ADD COLUMN "created_by" TEXT;
ALTER TABLE "m_shop_lt" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_shop_lt" ADD COLUMN "updated_by" TEXT;

ALTER TABLE "m_calendar" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_calendar" ADD COLUMN "created_by" TEXT;
ALTER TABLE "m_calendar" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_calendar" ADD COLUMN "updated_by" TEXT;

ALTER TABLE "m_vendor" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_vendor" ADD COLUMN "created_by" TEXT;
ALTER TABLE "m_vendor" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_vendor" ADD COLUMN "updated_by" TEXT;

ALTER TABLE "m_category" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_category" ADD COLUMN "created_by" TEXT;
ALTER TABLE "m_category" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "m_category" ADD COLUMN "updated_by" TEXT;

-- 行単位の監査ログ検索用
CREATE INDEX "idx_audit_log_target_ref" ON "t_audit_log"("target", "ref", "id" DESC);
