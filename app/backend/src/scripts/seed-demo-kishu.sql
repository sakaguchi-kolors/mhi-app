-- 担当者×機種 UI 確認用の仮データ（本番データには混ぜないこと）
-- 戻す: seed-demo-kishu-revert.sql を実行

BEGIN;

-- 機種マスタ（TJ は既存）
INSERT INTO m_kishu (kishu, active) VALUES
  ('37B', true), ('37C', true), ('37D', true), ('37E', true),
  ('38A', true), ('38B', true),
  ('40A', true), ('40B', true), ('40C', true),
  ('41A', true), ('41B', true), ('42A', true),
  ('43A', true), ('43B', true), ('44A', true), ('45A', true), ('46A', true)
ON CONFLICT (kishu) DO NOTHING;

-- デモ担当者（パスワード: demo1234）
INSERT INTO m_user (email, password_hash, display_name, role, active) VALUES
  ('yamada@mhi.example.com', '$2a$10$/kVZTvwyLifB1GvGxOLA2OoBhEoWOhhuNz0etNhfpzXJc/XKyrQZa', '山田 太郎', '工程員', true),
  ('sato@mhi.example.com',   '$2a$10$/kVZTvwyLifB1GvGxOLA2OoBhEoWOhhuNz0etNhfpzXJc/XKyrQZa', '佐藤 花子', '工程員', true),
  ('suzuki@mhi.example.com', '$2a$10$/kVZTvwyLifB1GvGxOLA2OoBhEoWOhhuNz0etNhfpzXJc/XKyrQZa', '鈴木 一郎', '工程員', true),
  ('kanri2@mhi.example.com', '$2a$10$/kVZTvwyLifB1GvGxOLA2OoBhEoWOhhuNz0etNhfpzXJc/XKyrQZa', '高橋 管理', '管理者', true)
ON CONFLICT (email) DO NOTHING;

-- 担当者×機種（既存分は温存、デモ分を追加）
INSERT INTO m_user_kishu (user_id, kishu)
SELECT u.user_id, v.kishu
FROM (VALUES
  ('admin@mhi.example.com', 'TJ'),
  ('admin@mhi.example.com', '37B'),
  ('admin@mhi.example.com', '37C'),
  ('yamada@mhi.example.com', '37D'),
  ('yamada@mhi.example.com', '37E'),
  ('yamada@mhi.example.com', '38A'),
  ('yamada@mhi.example.com', '38B'),
  ('sato@mhi.example.com', '40A'),
  ('sato@mhi.example.com', '40B'),
  ('sato@mhi.example.com', '40C'),
  ('suzuki@mhi.example.com', '41A'),
  ('suzuki@mhi.example.com', '41B'),
  ('suzuki@mhi.example.com', '42A'),
  ('kanri2@mhi.example.com', '43A'),
  ('kanri2@mhi.example.com', '44A'),
  ('kanri2@mhi.example.com', '45A'),
  ('kanri2@mhi.example.com', '46A')
) AS v(email, kishu)
JOIN m_user u ON u.email = v.email
ON CONFLICT DO NOTHING;

-- 部品を複数機種に分散（一覧フィルタ確認用）
WITH kishu_list AS (
  SELECT unnest(ARRAY[
    'TJ','37B','37C','37D','37E','38A','38B',
    '40A','40B','40C','41A','41B','42A',
    '43A','43B','44A','45A','46A'
  ]) AS kishu, generate_series(1, 18) AS idx
),
numbered AS (
  SELECT os_id, row_number() OVER (ORDER BY os_id) AS rn FROM t_part_status
)
UPDATE t_part_status ps
SET kishu = kl.kishu
FROM numbered n
JOIN kishu_list kl ON ((n.rn - 1) % 18) + 1 = kl.idx
WHERE ps.os_id = n.os_id;

UPDATE t_part p
SET kishu = ps.kishu
FROM t_part_status ps
WHERE p.os_id = ps.os_id;

COMMIT;
