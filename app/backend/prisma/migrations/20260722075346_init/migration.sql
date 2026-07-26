-- CreateTable
CREATE TABLE "t_part" (
    "os_id" TEXT NOT NULL,
    "part_no" TEXT,
    "part_name" TEXT,
    "category" TEXT,
    "kishu" TEXT,
    "final_due" DATE,
    "pbs_due" DATE,
    "urgent_flag" BOOLEAN NOT NULL DEFAULT false,
    "shortage_flag" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "t_part_pkey" PRIMARY KEY ("os_id")
);

-- CreateTable
CREATE TABLE "t_shop_name" (
    "shop" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "t_shop_name_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "t_routing" (
    "os_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "seq_label" TEXT,
    "shop" TEXT,
    "job" TEXT,
    "plan_start" TIMESTAMPTZ,
    "plan_end" TIMESTAMPTZ,
    "wip_flag" BOOLEAN NOT NULL DEFAULT false,
    "material_status" TEXT,
    "out_date" DATE,
    "in_date" DATE,
    "eta_date" DATE,
    "order_no" TEXT,

    CONSTRAINT "t_routing_pkey" PRIMARY KEY ("os_id","seq")
);

-- CreateTable
CREATE TABLE "t_shop_master" (
    "shop" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "name" TEXT,
    "machine" TEXT,

    CONSTRAINT "t_shop_master_pkey" PRIMARY KEY ("shop","job")
);

-- CreateTable
CREATE TABLE "t_part_status" (
    "os_id" TEXT NOT NULL,
    "part_no" TEXT,
    "part_name" TEXT,
    "category" TEXT,
    "kishu" TEXT,
    "final_due" DATE,
    "total_shops" INTEGER,
    "done_shops" INTEGER,
    "remain_shops" INTEGER,
    "current_shop" TEXT,
    "days_left" INTEGER,
    "buffer" INTEGER,
    "color" TEXT,
    "stagnant_days" INTEGER,
    "urgent" BOOLEAN,
    "shortage" BOOLEAN,
    "computed_at" TIMESTAMPTZ,

    CONSTRAINT "t_part_status_pkey" PRIMARY KEY ("os_id")
);

-- CreateTable
CREATE TABLE "t_timeline" (
    "os_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "shop" TEXT,
    "name" TEXT,
    "status" TEXT,
    "plan_end" DATE,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "ms_passed" BOOLEAN,
    "ms_color" TEXT,
    "ms_due" DATE,
    "gaic" BOOLEAN NOT NULL DEFAULT false,
    "gaic_status" TEXT,
    "order_no" TEXT,

    CONSTRAINT "t_timeline_pkey" PRIMARY KEY ("os_id","seq")
);

-- CreateTable
CREATE TABLE "t_assignment" (
    "os_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '未割当',
    "assigned_at" TIMESTAMPTZ,

    CONSTRAINT "t_assignment_pkey" PRIMARY KEY ("os_id")
);

-- CreateTable
CREATE TABLE "t_trouble" (
    "os_id" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagged_at" TIMESTAMPTZ,
    "memo" TEXT,

    CONSTRAINT "t_trouble_pkey" PRIMARY KEY ("os_id")
);

-- CreateTable
CREATE TABLE "t_note" (
    "os_id" TEXT NOT NULL,
    "body" TEXT,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "t_note_pkey" PRIMARY KEY ("os_id")
);

-- CreateTable
CREATE TABLE "m_owner" (
    "owner_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "dept" TEXT,
    "team" TEXT,
    "ad_account" TEXT,
    "role" TEXT NOT NULL DEFAULT '工程員',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "m_owner_pkey" PRIMARY KEY ("owner_id")
);

-- CreateTable
CREATE TABLE "m_param" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "m_param_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "m_milestone" (
    "id" SERIAL NOT NULL,
    "match_type" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "m_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m_shop_lt" (
    "shop" TEXT NOT NULL,
    "lt_days" DECIMAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "m_shop_lt_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "m_calendar" (
    "cal_date" DATE NOT NULL,
    "is_workday" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "m_calendar_pkey" PRIMARY KEY ("cal_date")
);

-- CreateTable
CREATE TABLE "m_vendor" (
    "order_prefix" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "return_lt" DECIMAL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "m_vendor_pkey" PRIMARY KEY ("order_prefix")
);

-- CreateTable
CREATE TABLE "m_category" (
    "id" SERIAL NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "m_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m_kishu" (
    "kishu" TEXT NOT NULL,
    "team" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "m_kishu_pkey" PRIMARY KEY ("kishu")
);

-- CreateTable
CREATE TABLE "m_owner_kishu" (
    "owner_id" INTEGER NOT NULL,
    "kishu" TEXT NOT NULL,

    CONSTRAINT "m_owner_kishu_pkey" PRIMARY KEY ("owner_id","kishu")
);

-- CreateTable
CREATE TABLE "t_audit_log" (
    "id" SERIAL NOT NULL,
    "app_user" TEXT,
    "action" TEXT,
    "target" TEXT,
    "ref" TEXT,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_user_role" (
    "app_user" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '工程員',

    CONSTRAINT "t_user_role_pkey" PRIMARY KEY ("app_user")
);

-- CreateIndex
CREATE INDEX "idx_routing_osid" ON "t_routing"("os_id");

-- CreateIndex
CREATE INDEX "idx_status_color" ON "t_part_status"("color");

-- CreateIndex
CREATE INDEX "idx_timeline_osid" ON "t_timeline"("os_id");
