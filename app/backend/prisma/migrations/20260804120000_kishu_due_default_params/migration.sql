-- 標準の納期優先順位を m_param に移行（機種別は個別設定のみ DB 保持）
INSERT INTO "m_param" ("key", "value", "description", "created_at", "updated_at")
VALUES
  ('KISHU_DUE_PRIORITY_1', 'pbs', '機種別納期優先順位（標準・第1優先）', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('KISHU_DUE_PRIORITY_2', 'flexsche', '機種別納期優先順位（標準・第2優先）', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('KISHU_DUE_PRIORITY_3', 'octopus', '機種別納期優先順位（標準・第3優先）', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- 標準と同じ値の個別行は削除（標準設定を参照させる）
DELETE FROM "m_kishu_due_priority"
WHERE "priority_1" = 'pbs' AND "priority_2" = 'flexsche' AND "priority_3" = 'octopus';
