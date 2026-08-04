-- 標準と同じ優先順位の個別行を削除し「標準に合わせる」扱いに統一
DELETE FROM "m_kishu_due_priority" k
WHERE k."priority_1" = COALESCE((SELECT "value" FROM "m_param" WHERE "key" = 'KISHU_DUE_PRIORITY_1'), 'pbs')
  AND k."priority_2" = COALESCE((SELECT "value" FROM "m_param" WHERE "key" = 'KISHU_DUE_PRIORITY_2'), 'flexsche')
  AND k."priority_3" = COALESCE((SELECT "value" FROM "m_param" WHERE "key" = 'KISHU_DUE_PRIORITY_3'), 'octopus');
