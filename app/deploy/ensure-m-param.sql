-- m_param 既定パラメータの補完（冪等）
-- description は NULL（画面側の日本語ヘルプを使う）。PowerShell へ SQL 直貼りすると文字化けするため。
INSERT INTO m_param (key, value, description, created_at, updated_at)
VALUES
  ('SHOP_LT_DAYS', '4', NULL, now(), now()),
  ('MILESTONE_LT_DAYS', '5', NULL, now(), now()),
  ('STAGNANT_THRESHOLD', '10', NULL, now(), now()),
  ('BUFFER_GREEN', '1', NULL, now(), now()),
  ('BUFFER_YELLOW', '0', NULL, now(), now())
ON CONFLICT (key) DO UPDATE SET
  description = NULL,
  updated_at = now();

UPDATE m_param
SET description = NULL, updated_at = now()
WHERE key IN ('SHOP_LT_DAYS', 'MILESTONE_LT_DAYS', 'STAGNANT_THRESHOLD', 'BUFFER_GREEN', 'BUFFER_YELLOW');
