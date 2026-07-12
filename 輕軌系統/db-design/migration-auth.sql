-- =====================================================================
-- Phase 1a:帳號申請 / 審核 / 權限(對齊 keepermanager 人員管理設計)
-- 冪等:可重複執行
-- 使用者狀態:0 正常、1 待確認(申請中)、2 作廢、9 須重設密碼
-- 功能權限 perm_items:0 可登入管理平台、1 接單、2 派工、3 完工、4 覆核、
--                     5 結案、6 併單、7 轉單、8 作廢、9 缺料、10 觀察、11 報修
-- =====================================================================
BEGIN;

-- 1) app_user 擴充 -----------------------------------------------------
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS account        text,
  ADD COLUMN IF NOT EXISTS password_hash  text,
  ADD COLUMN IF NOT EXISTS status         integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS perm_items     integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS perm_systems   text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS note           text,
  ADD COLUMN IF NOT EXISTS applied_at     timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_by    uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS approved_at    timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='app_user_account_key') THEN
    ALTER TABLE app_user ADD CONSTRAINT app_user_account_key UNIQUE (account);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='app_user_status_chk') THEN
    ALTER TABLE app_user ADD CONSTRAINT app_user_status_chk CHECK (status IN (0,1,2,9));
  END IF;
END $$;

COMMENT ON COLUMN app_user.account       IS '登入帳號(Email 格式,如 0907M0065@ntmetro.com.tw)';
COMMENT ON COLUMN app_user.password_hash IS 'bcrypt 雜湊;NULL 表示「密碼=帳號本身」的初始狀態';
COMMENT ON COLUMN app_user.status        IS '0正常 1待確認(申請中,不可登入) 2作廢 9須重設密碼';
COMMENT ON COLUMN app_user.perm_items    IS '功能權限碼:0登入 1接單 2派工 3完工 4覆核 5結案 6併單 7轉單 8作廢 9缺料 10觀察 11報修';
COMMENT ON COLUMN app_user.perm_systems  IS '設備主系統功能權限(電聯車系統/機廠設備系統...)';

-- 2) 登入 session ------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_session (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS idx_user_session_user ON user_session(user_id);
CREATE INDEX IF NOT EXISTS idx_user_session_expiry ON user_session(expires_at);

-- 3) 參照清單 ----------------------------------------------------------
INSERT INTO workflow_option (option_group, option_code, option_label, sort_order, is_terminal) VALUES
 ('USER_STATUS','0','正常',0,false),
 ('USER_STATUS','1','待確認',1,false),
 ('USER_STATUS','2','作廢',2,true),
 ('USER_STATUS','9','重設密碼',3,false),
 ('MENU_PERMISSION','0','可登入管理平台',0,false),
 ('MENU_PERMISSION','11','可報修',1,false),
 ('MENU_PERMISSION','1','可接單',2,false),
 ('MENU_PERMISSION','2','可派工',3,false),
 ('MENU_PERMISSION','3','可完工',4,false),
 ('MENU_PERMISSION','4','可覆核',5,false),
 ('MENU_PERMISSION','5','可結案',6,false),
 ('MENU_PERMISSION','6','可併單',7,false),
 ('MENU_PERMISSION','7','可轉單',8,false),
 ('MENU_PERMISSION','8','可作廢',9,false),
 ('MENU_PERMISSION','9','可缺料',10,false),
 ('MENU_PERMISSION','10','可觀察',11,false)
ON CONFLICT (option_group, option_code) DO NOTHING;

-- 4) 既有 10 位使用者補上帳號欄位(依姓名對應 keeper 工號) ---------------
UPDATE app_user SET
  employee_no = v.emp_no,
  account     = v.acc,
  status      = 0,
  perm_items  = v.items,
  perm_systems= ARRAY['電聯車系統','機廠設備系統']
FROM (VALUES
  ('李孟哲','0907M0065','0907M0065@ntmetro.com.tw','{0,1,2,3,4,5,6,7,8,9,10,11}'::integer[]),
  ('謝宗凱','1012M0193','1012M0193@ntmetro.com.tw','{0,1,2,3,6,7,8,9,10}'::integer[]),
  ('吳琮彬','1304M0729','1304M0729@ntmetro.com.tw','{0,1,2,3,6,7,8,9,10}'::integer[])
) AS v(name, emp_no, acc, items)
WHERE app_user.display_name = v.name
  AND app_user.account IS NULL;

-- 4b) 既有種子使用者(U00x)視為在職員工:狀態設為正常 ---------------------
UPDATE app_user SET status = 0
WHERE employee_no LIKE 'U%' AND status = 1;

-- 5) 補入 keeper 其餘人員(冪等 upsert by employee_no) -------------------
INSERT INTO app_user (employee_no, display_name, department, role_name, account, status, perm_items, perm_systems)
VALUES
 ('1304M0727','李高賢','輕軌維修處','承辦','1304M0727@ntmetro.com.tw',0,'{0,1,2,3,6,7,8,9,10}','{電聯車系統}'),
 ('1112M0403','羅國榮','輕軌維修處','承辦','1112M0403@ntmetro.com.tw',0,'{0,1,2,3,4,5,6,7,8,9,10}','{電聯車系統,機廠設備系統}'),
 ('1012M0215','陳威吉','輕軌維修處','承辦','1012M0215@ntmetro.com.tw',0,'{0,1,2,3,6,7,8,9,10}','{電聯車系統}'),
 ('1207M0686','張晉銓','輕軌維修處','承辦','1207M0686@ntmetro.com.tw',0,'{0,1,2,3,6,7,8,9,10}','{電聯車系統}'),
 ('1012M0224','葉家辰','輕軌維修處','承辦','1012M0224@ntmetro.com.tw',0,'{0,1,2,3,4,5,6,7,8,9,10}','{電聯車系統}'),
 ('1012M0227','王煥廷','輕軌維修處','承辦','1012M0227@ntmetro.com.tw',0,'{0,1,2,3,6,7,8,9,10}','{電聯車系統}'),
 ('1012M0217','蔣孟勳','輕軌維修處','承辦','1012M0217@ntmetro.com.tw',0,'{0,1,2,3,4,6,7,8,9,10}','{電聯車系統}'),
 ('1111M0390','李政道','輕軌維修處','承辦','1111M0390@ntmetro.com.tw',0,'{0,1,2,3,6,7,8,9,10}','{電聯車系統}'),
 ('1305W0812','王筌儀','輕軌營運處','報修/覆核','1305W0812@ntmetro.com.tw',0,'{0,4,11}','{電聯車系統}'),
 ('1208W0530','郭韋妤','輕軌營運處','報修/覆核','1208W0530@ntmetro.com.tw',0,'{0,4,11}','{電聯車系統}'),
 ('1101W0288','鄭先任','輕軌營運處','報修/覆核','1101W0288@ntmetro.com.tw',0,'{0,4,11}','{電聯車系統}'),
 ('1099W0021','王立雄','輕軌營運處','報修/覆核','1099W0021@ntmetro.com.tw',0,'{0,4,11}','{電聯車系統}'),
 ('1210W0641','廖威荏','輕軌營運處','報修/覆核','1210W0641@ntmetro.com.tw',1,'{0,4,11}','{電聯車系統}')
ON CONFLICT (employee_no) DO UPDATE SET
  account = EXCLUDED.account,
  perm_items = EXCLUDED.perm_items,
  perm_systems = EXCLUDED.perm_systems
WHERE app_user.account IS NULL;

COMMIT;
