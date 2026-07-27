-- seed-demo-kishu.sql の仮データを戻す
BEGIN;

DELETE FROM m_user_kishu
WHERE user_id IN (SELECT user_id FROM m_user WHERE email IN (
  'yamada@mhi.example.com', 'sato@mhi.example.com',
  'suzuki@mhi.example.com', 'kanri2@mhi.example.com'
));

DELETE FROM m_user WHERE email IN (
  'yamada@mhi.example.com', 'sato@mhi.example.com',
  'suzuki@mhi.example.com', 'kanri2@mhi.example.com'
);

DELETE FROM m_kishu WHERE kishu IN (
  '37B','37C','37D','37E','38A','38B',
  '40A','40B','40C','41A','41B','42A',
  '43A','43B','44A','45A','46A'
);

UPDATE t_part_status SET kishu = 'TJ';
UPDATE t_part SET kishu = 'TJ';

COMMIT;
