-- 全機種に標準の納期優先順位（PBS → 小日程 → OCTPuS）を seed
INSERT INTO "m_kishu_due_priority" ("kishu", "priority_1", "priority_2", "priority_3", "created_at", "updated_at")
SELECT k."kishu", 'pbs', 'flexsche', 'octopus', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "m_kishu" k
WHERE k."active" = true
ON CONFLICT ("kishu") DO NOTHING;

-- 旧2択パラメータは機種別優先順位に統合
DELETE FROM "m_param" WHERE "key" = 'DUE_SOURCE';
