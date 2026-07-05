-- =====================================================================
-- Phase 1b:keeper 工單系統合併 — 故障樹 / 操作歷程 / 完工作業資料
-- 冪等:可重複執行
-- 依據:2026-07 自線上 keepermanager 系統擷取之實際結構與清單
-- =====================================================================
BEGIN;

-- 1) 故障樹(報修層與派工作業層共用;level 1主系統 2子系統 3類別 4現象) ----
CREATE TABLE IF NOT EXISTS fault_system_node (
  id        integer PRIMARY KEY,
  parent_id integer REFERENCES fault_system_node(id),
  name      text NOT NULL,
  sruid     text,
  level     integer NOT NULL CHECK (level BETWEEN 1 AND 4),
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_fsn_parent ON fault_system_node(parent_id);
CREATE SEQUENCE IF NOT EXISTS fault_system_node_seq START 10000;

-- 2) 工單操作歷程(所有工單類型共用) ------------------------------------
CREATE TABLE IF NOT EXISTS work_order_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES app_user(id),
  actor_text    text,
  action_code   text NOT NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_woe_wo ON work_order_event(work_order_id, created_at);
COMMENT ON COLUMN work_order_event.action_code IS '對應 workflow_option C_STATUS(設定為派工/完工...)或 LOG(一般操作)';
COMMENT ON COLUMN work_order_event.actor_text  IS '歷史匯入時操作者不在 app_user 的降級保存欄位';

-- 3) 完工作業資料(C 工單「建立完工資料」表單) ---------------------------
CREATE TABLE IF NOT EXISTS fault_finish_record (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id      uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  finished_by        uuid REFERENCES app_user(id),
  finished_by_text   text,
  finish_report      text NOT NULL,
  action_code        text,
  warranty_code      text,
  danger_work_code   text,
  is_passenger_ui    boolean NOT NULL DEFAULT false,
  mileage            numeric(14,2) NOT NULL DEFAULT 0,
  removed_serial     text,
  installed_serial   text,
  dispatch_node_id   integer REFERENCES fault_system_node(id),
  dispatch_component text,
  accepted_at        timestamptz,
  is_final           boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ffr_wo ON fault_finish_record(work_order_id);
COMMENT ON COLUMN fault_finish_record.dispatch_component IS '派工作業層零件(儲能電池(ESS)總成、應答器天線...)';

-- 4) fault_work_order 擴充 ----------------------------------------------
ALTER TABLE fault_work_order
  ADD COLUMN IF NOT EXISTS report_node_id  integer REFERENCES fault_system_node(id),
  ADD COLUMN IF NOT EXISTS severity_level  integer CHECK (severity_level BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS deadline_at     timestamptz,
  ADD COLUMN IF NOT EXISTS observe_until   timestamptz,
  ADD COLUMN IF NOT EXISTS shortage_item   text,
  ADD COLUMN IF NOT EXISTS merged_into_id  uuid REFERENCES work_order(id),
  ADD COLUMN IF NOT EXISTS reporter_text   text,
  ADD COLUMN IF NOT EXISTS location_path   text[];
COMMENT ON COLUMN fault_work_order.severity_level IS '1/2/3 依現象自動判定;4=未標示。到期:L1+3天 L2+7天 L3+30天';
COMMENT ON COLUMN fault_work_order.location_path  IS '故障設備位置層,如 {106車,1號駕駛室,左側}';

-- 5) 參照清單 seed -------------------------------------------------------
INSERT INTO workflow_option (option_group, option_code, option_label, sort_order, is_terminal) VALUES
 ('C_STATUS','0','報修',0,false),('C_STATUS','1','接單',1,false),('C_STATUS','2','派工',2,false),
 ('C_STATUS','3','完工',3,false),('C_STATUS','4','覆核',4,false),('C_STATUS','5','結案',5,true),
 ('C_STATUS','6','併單',6,true),('C_STATUS','7','轉單',7,false),('C_STATUS','8','作廢',8,true),
 ('C_STATUS','9','缺料',9,false),('C_STATUS','10','觀察',10,false),
 ('WO_ACTION','01','更換',1,false),('WO_ACTION','02','更換(使用廠商保固用料)',2,false),
 ('WO_ACTION','03','重置',3,false),('WO_ACTION','04','重新安裝軟體',4,false),
 ('WO_ACTION','05','車削',5,false),('WO_ACTION','06','添加',6,false),
 ('WO_ACTION','07','互換',7,false),('WO_ACTION','08','修補',8,false),
 ('WO_ACTION','09','調整',9,false),('WO_ACTION','10','鎖固',10,false),
 ('WO_ACTION','11','清潔',11,false),('WO_ACTION','12','檢測正常',12,false),
 ('WO_ACTION','13','合併工單',13,false),('WO_ACTION','14','專案處理(關閉)',14,false),
 ('WO_ACTION','15','待重置',15,false),('WO_ACTION','16','待料更換',16,false),
 ('WO_ACTION','17','不影響營運',17,false),('WO_ACTION','18','潤滑',18,false),
 ('WO_ACTION','19','觀察',19,false),('WO_ACTION','20','賦歸',20,false),
 ('WO_ACTION','21','移除',21,false),('WO_ACTION','22','黏固',22,false),
 ('WARRANTY_VENDOR','A','A. 牽引馬達',1,false),('WARRANTY_VENDOR','B','B. 齒輪箱',2,false),
 ('WARRANTY_VENDOR','C','C. 車間走道撓性元件',3,false),('WARRANTY_VENDOR','D','D. 煞車卡鉗(不含煞車片)',4,false),
 ('WARRANTY_VENDOR','E','E. 空調機組',5,false),('WARRANTY_VENDOR','F','F. 車門門機',6,false),
 ('WARRANTY_VENDOR','G','G. 車門與車窗之密封材料',7,false),('WARRANTY_VENDOR','H','H. 車體塗裝及/或飾條',8,false),
 ('WARRANTY_VENDOR','I','I. 轉向架塗裝',9,false),('WARRANTY_VENDOR','J','J. 集電弓(不含集電接觸片)',10,false),
 ('WARRANTY_VENDOR','K','K. 彈性車輪之橡膠元件',11,false),('WARRANTY_VENDOR','L','L. 旅客資訊顯示器',12,false),
 ('WARRANTY_VENDOR','X','X非保固範圍X',13,false),('WARRANTY_VENDOR','M','M.兩年保固用料',14,false),
 ('PM_LEVEL','1M','輕軌列車預防檢修(第一級1M)',1,false),('PM_LEVEL','3M','輕軌列車預防檢修(第二級3M)',2,false),
 ('PM_LEVEL','6M','輕軌列車預防檢修(第三級6M)',3,false),('PM_LEVEL','1Y','輕軌列車預防檢修(第四級1Y)',4,false),
 ('PM_LEVEL','5Y','輕軌列車預防檢修(第五級5Y)',5,false),('PM_LEVEL','PROJ','專案修檢',6,false),
 ('PM_LEVEL','WHEEL','車輪鏇銷檢修',7,false)
ON CONFLICT (option_group, option_code) DO NOTHING;

INSERT INTO workflow_option (option_group, option_code, option_label, sort_order) VALUES
 ('DANGER_WORK','D01','一、在活電下進入軌道(第三軌)緊急搶修作業、轉轍器維修及運轉操作等作業',1),
 ('DANGER_WORK','D02','二、AC 16I/22.8KV GIS 及主變壓器檢修',2),
 ('DANGER_WORK','D03','三、PPSS 750V 高速斷路器檢修',3),
 ('DANGER_WORK','D04','四、PPSS GBSS 接地開關(GGBS) 檢修',4),
 ('DANGER_WORK','D05','五、電力設備(22KV 開關盤、整流變壓器、阻環路開關、車站用變壓器)耐壓及功率因數試驗',5),
 ('DANGER_WORK','D06','六、受電室高壓設備保養維修工作',6),
 ('DANGER_WORK','D07','七、低壓高電流(600V以下、100伏特以上)之設備保養維修工作',7),
 ('DANGER_WORK','D08','八、電聯車及軌道養護車推進、低壓供電及空調反向器設備活線檢修作業',8),
 ('DANGER_WORK','D09','九、推進系統推進換流器盤測試',9),
 ('DANGER_WORK','D10','十、靜態換流器(SIV)或電池充電器之靜態試驗',10),
 ('DANGER_WORK','D11','十一、其它簽奉核可之活電作業。',11),
 ('DANGER_WORK','D12','十二、地下車床車輪車削作業',12),
 ('DANGER_WORK','D13','十三、高架作業(一)、挑空區域照明及路燈更換',13),
 ('DANGER_WORK','D14','十三、高架作業(二)、排煙風門、探測器及灑水頭維修保養',14),
 ('DANGER_WORK','D15','十三、高架作業(三)、電聯車頂空調檢修排水孔檢修等車頂作業',15),
 ('DANGER_WORK','D16','十三、高架作業(四)、洗車機更換橫刷馬達作業',16),
 ('DANGER_WORK','D17','十三、高架作業(五)、供電電纜捲揚器、滑動式供電系統檢修作業',17),
 ('DANGER_WORK','D18','十三、高架作業(六)、起重機高空檢修作業',18),
 ('DANGER_WORK','D19','十三、高架作業(七)、站體設備(PIDS、PA、CCTV 等)檢修作業',19),
 ('DANGER_WORK','D20','十三、高架作業(八)、車站屋頂(含屋頂設備)、樑柱結構、建築裝修之檢修作業',20),
 ('DANGER_WORK','D21','十三、高架作業(九)、車站空調送風機維修保養',21),
 ('DANGER_WORK','D22','十三、高架作業(十)、軌道養護車輛車頂設備檢修作業',22),
 ('DANGER_WORK','D23','十三、高架作業(十一)、其他簽奉核可之高空檢修作業',23),
 ('DANGER_WORK','D24','十四、從事電(扶)梯機坑或升降機頂端之檢修作業',24)
ON CONFLICT (option_group, option_code) DO NOTHING;

-- 6) 故障樹 seed:16 個主系統(id 沿用線上 sid) ---------------------------
INSERT INTO fault_system_node (id, parent_id, name, sruid, level) VALUES
 (1,NULL,'自動收費系統','AFC',1),(2,NULL,'電聯車系統','TS',1),(3,NULL,'供電系統','PSS',1),
 (4,NULL,'軌道系統','TI',1),(5,NULL,'通訊系統','COM',1),(6,NULL,'號誌系統','SIG',1),
 (7,NULL,'中央監控系統','SCADA',1),(8,NULL,'建物管理系統','BMS',1),(9,NULL,'機廠設備系統','DE',1),
 (11,NULL,'電扶梯系統','ES',1),(12,NULL,'電梯系統','EE',1),(2081,NULL,'水環系統','HE',1),
 (2082,NULL,'廠站設備系統','FE',1),(2083,NULL,'消防系統','FC',1),(2084,NULL,'橋梁系統','BG',1),
 (3883,NULL,'電聯車系統(舊版)','TS',1)
ON CONFLICT (id) DO NOTHING;

-- 7) 電聯車系統子樹(子系統→類別→現象;自線上系統擷取) --------------------
DO $$
DECLARE
  tree jsonb := $j$
  {
   "車載通訊系統":[
     {"cat":"閉路電視系統異常（CCTV）","ph":["顯示異常","設備異常，未影響營運","無作動","設備異常，影響營運"]},
     {"cat":"旅客資訊顯示系統異常(TMDS)","ph":["其他","無作動","設備異常，未影響營運","顯示異常"]},
     {"cat":"後視鏡異常","ph":["無作動","設備異常，未影響營運","設備異常，影響營運","顯示異常"]},
     {"cat":"車載網路異常","ph":["顯示異常","無作動","設備異常，未影響營運"]},
     {"cat":"司機員人機界面(DCI)","ph":["其他","設備異常，未影響營運","無作動","設備異常，影響營運"]},
     {"cat":"緊急對講機異常","ph":["顯示異常","其他","設備異常，影響營運","設備異常，未影響營運"]},
     {"cat":"路徑開通功能異常","ph":["設備異常，影響營運"]},
     {"cat":"廣播喇叭異常","ph":["其他","無作動"]},
     {"cat":"車載通訊系統異常","ph":["車載控制單元(OBCU)","司機員人機界面(DCI)","旅客緊急對講機(PEI)"]},
     {"cat":"閉路電視系統異常","ph":["IP客室攝影機","IP後視攝影機","列車多媒體資訊顯示器(TMDS)","後視鏡顯示器(左)","後視鏡顯示器(右)"]}],
   "車輛操作及控制設備系統":[
     {"cat":"撒砂裝置異常","ph":["無作動","設備異常，未影響營運","設備異常，影響營運","其他","電磁閥(蓄壓器)","撒砂裝置空壓機"]},
     {"cat":"GPS輪緣潤滑機異常","ph":["無作動","設備異常，未影響營運","其他"]},
     {"cat":"遮陽捲簾裝置異常","ph":["無作動","設備異常，未影響營運"]},
     {"cat":"輪緣潤滑裝置異常","ph":["無作動","設備異常，未影響營運"]},
     {"cat":"雨刷裝置異常","ph":["無作動","設備異常，未影響營運","設備異常，影響營運","傳動桿"]},
     {"cat":"控制開關異常","ph":["設備異常，未影響營運","其他","方向燈/警示燈轉盤開關","警笛按鈕開關"]},
     {"cat":"警音裝置異常","ph":["設備異常，未影響營運","室內蜂鳴器(聲音控制模組)","警鈴按鈕"]}],
   "電力與推進系統":[
     {"cat":"儲能裝置異常","ph":["設備異常，未影響營運","設備異常，影響營運","其他","儲能電池(ESS)總成","乾燥包"]},
     {"cat":"集電系統異常","ph":["設備異常，未影響營運","火花","設備異常，影響營運","其他","集電弓碳刷片(PanTrac)"]},
     {"cat":"牽引T字燈異常","ph":["設備異常，未影響營運","其他"]},
     {"cat":"主控制器功能異常","ph":["設備異常，影響營運","其他","抖動"]},
     {"cat":"牽引推進數值顯示異常","ph":["設備異常，未影響營運"]},
     {"cat":"冷卻系統異常","ph":["其他"]},
     {"cat":"輔助電源／24V異常","ph":["其他","設備異常，未影響營運"]},
     {"cat":"牽引換流器及輔助電源供應器異常","ph":["TCU卡板"]}],
   "車體系統":[
     {"cat":"駕駛室座椅異常","ph":["設備異常，未影響營運","設備鬆動，未影響營運"]},
     {"cat":"駕駛室腳踏板異常","ph":["設備異常，未影響營運"]},
     {"cat":"車體漏水異常","ph":["漏水 / 滴水","設備異常，未影響營運","膠合處"]},
     {"cat":"內裝襯板異常","ph":["設備鬆動，未影響營運"]},
     {"cat":"車身外板異常","ph":["設備異常，未影響營運","脫漆"]}],
   "監控與安全裝置系統":[
     {"cat":"列車監控資訊系統異常","ph":["顯示異常","設備異常，未影響營運"]},
     {"cat":"人機界面觸控螢幕異常(CMS)","ph":["顯示異常","其他","無作動"]},
     {"cat":"CMS 顯示 E1","ph":["顯示異常"]},
     {"cat":"總故障燈亮紅燈","ph":["設備異常，影響營運"]},
     {"cat":"車輛控制單元異常","ph":["顯示時間異常","人機界面觸控螢幕"]}],
   "空調與通風系統":[
     {"cat":"駕駛室暖風機異常","ph":["無作動","設備異常，未影響營運","不暖"]},
     {"cat":"駕駛室空調異常","ph":["設備異常，未影響營運","不冷","駕駛室空調總成"]},
     {"cat":"客室空調異常","ph":["設備異常，影響營運","不冷","空調F4、F5斷路器"]}],
   "煞車系統":[
     {"cat":"煞車卡鉗異常","ph":["設備異常，未影響營運","漏油","其他","非動力式金屬護框"]},
     {"cat":"煞車來令片異常","ph":["設備異常，未影響營運"]},
     {"cat":"轉向架ERR","ph":["設備異常，影響營運","其他"]},
     {"cat":"煞車控制單元(BCU)異常","ph":["其他"]}],
   "轉向架系統":[
     {"cat":"轉向架異常","ph":["設備異常，未影響營運","異音","其他","設備異常，影響營運"]},
     {"cat":"齒輪傳動裝置異常","ph":["齒輪油"]},
     {"cat":"車輪與車軸異常","ph":["其他"]}],
   "車門系統":[
     {"cat":"車門作動異常","ph":["無作動","設備異常，影響營運","設備遺失，未影響營運"]},
     {"cat":"防夾裝置做動","ph":["設備異常，未影響營運"]},
     {"cat":"車門按鈕異常","ph":["無作動"]},
     {"cat":"車門隔離裝置異常","ph":["其他"]},
     {"cat":"門機總成異常","ph":["LED警示燈"]},
     {"cat":"旋轉立柱異常","ph":["加壓輪"]}],
   "車載號誌系統":[
     {"cat":"異常代碼「E3904」","ph":["顯示異常","設備異常，影響營運"]},
     {"cat":"輔助速限裝置異常","ph":["設備異常，未影響營運","應答器天線"]},
     {"cat":"BDG顯示「E」","ph":["顯示異常"]}],
   "照明系統":[
     {"cat":"客室照明異常","ph":["設備異常，未影響營運","無作動","客室照明變壓器"]},
     {"cat":"車內照明異常","ph":["無作動","客室LED燈板1(含光源)"]}]
  }
  $j$::jsonb;
  sub record; cat record; ph record;
  sub_id integer; cat_id integer;
BEGIN
  IF EXISTS (SELECT 1 FROM fault_system_node WHERE level = 2) THEN
    RAISE NOTICE '故障樹子層已存在,略過 seed';
    RETURN;
  END IF;
  FOR sub IN SELECT key, value FROM jsonb_each(tree) LOOP
    sub_id := nextval('fault_system_node_seq');
    INSERT INTO fault_system_node (id, parent_id, name, level) VALUES (sub_id, 2, sub.key, 2);
    FOR cat IN SELECT value FROM jsonb_array_elements(sub.value) LOOP
      cat_id := nextval('fault_system_node_seq');
      INSERT INTO fault_system_node (id, parent_id, name, level)
        VALUES (cat_id, sub_id, cat.value->>'cat', 3);
      FOR ph IN SELECT value FROM jsonb_array_elements_text(cat.value->'ph') LOOP
        INSERT INTO fault_system_node (id, parent_id, name, level)
          VALUES (nextval('fault_system_node_seq'), cat_id, ph.value, 4);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
