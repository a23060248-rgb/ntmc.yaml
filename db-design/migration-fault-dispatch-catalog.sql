-- =====================================================================
-- Phase 1d:C 工單維修端互鎖目錄 — 子系統→徵狀→零組件→原因(1,502 條)
-- 資料來源:故障工單階層(車輛).xlsx(9 分頁)
-- 執行方式:於 db-design 目錄執行(\copy 相對路徑)
--   psql -p 5433 -U postgres -d ntmc_erp -v ON_ERROR_STOP=1 -f migration-fault-dispatch-catalog.sql
-- 冪等:可重複執行
-- =====================================================================
BEGIN;

-- 1) 維修端互鎖目錄(扁平表;互鎖下拉以 DISTINCT 逐層過濾) ---------------
CREATE TABLE IF NOT EXISTS fault_dispatch_catalog (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  system_code text NOT NULL DEFAULT 'TS',
  system_name text NOT NULL DEFAULT '電聯車系統',
  subsystem   text NOT NULL,
  symptom     text NOT NULL,
  component   text NOT NULL,
  cause       text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  UNIQUE (subsystem, symptom, component, cause)
);
COMMENT ON TABLE fault_dispatch_catalog IS 'C工單完工「派工系統層」四層互鎖主檔(故障工單階層(車輛).xlsx 故障零組件分頁)';

CREATE TEMP TABLE _fdc_stage (
  system_code text, system_cn text, system_en text,
  subsystem text, symptom text, component text, cause text
);
\copy _fdc_stage FROM 'fault-dispatch-catalog.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

INSERT INTO fault_dispatch_catalog (system_code, system_name, subsystem, symptom, component, cause)
SELECT system_code, system_cn, subsystem, symptom, component, cause
FROM _fdc_stage
WHERE subsystem IS NOT NULL AND symptom IS NOT NULL
ON CONFLICT (subsystem, symptom, component, cause) DO NOTHING;

-- 2) 處理動作補「更換電池」(Excel 主檔第 23 項) ---------------------------
INSERT INTO workflow_option (option_group, option_code, option_label, sort_order)
VALUES ('WO_ACTION','23','更換電池',23)
ON CONFLICT (option_group, option_code) DO NOTHING;

-- 3) 五年保固:M.兩年保固用料非官方主檔項目,保留但排最後並註記 -----------
UPDATE workflow_option
SET sort_order = 99, description = '線上系統存在但不在官方主檔(故障工單階層(車輛).xlsx);保留以相容舊資料'
WHERE option_group = 'WARRANTY_VENDOR' AND option_code = 'M';

-- 4) 危險工作項目全面換新(官方主檔 16 大項 34 選項;含十五局限空間、十六鋁熱焊)
DELETE FROM workflow_option WHERE option_group = 'DANGER_WORK';
INSERT INTO workflow_option (option_group, option_code, option_label, sort_order) VALUES
 ('DANGER_WORK','01','一、在活電下進入軌道(第三軌)緊急搶修作業、轉轍器維修及運轉操作等作業',1),
 ('DANGER_WORK','02','二、AC 16I/22.8KV GIS 及主變壓器檢修',2),
 ('DANGER_WORK','03','三、PPSS 750V 高速斷路器檢修',3),
 ('DANGER_WORK','04','四、PPSS GBSS 接地開關(GGBS) 檢修',4),
 ('DANGER_WORK','05','五、電力設備(22KV 開關盤、整流變壓器、阻環路開關、車站用變壓器)耐壓及功率因數試驗',5),
 ('DANGER_WORK','06','六、受電室高壓設備保養維修工作',6),
 ('DANGER_WORK','07','七、低壓高電流(600V以下、100伏特以上)之設備保養維修工作',7),
 ('DANGER_WORK','08','八、電聯車及軌道養護車推進、低壓供電及空調反向器設備活線檢修作業',8),
 ('DANGER_WORK','09','九、推進系統推進換流器盤測試',9),
 ('DANGER_WORK','10','十、靜態換流器(SIV)或電池充電器之靜態試驗',10),
 ('DANGER_WORK','11','十一、其它簽奉核可之活電作業。',11),
 ('DANGER_WORK','12','十二、地下車床車輪車削作業',12),
 ('DANGER_WORK','13-01','十三、高架作業(一)挑空區域照明及路燈更換',13),
 ('DANGER_WORK','13-02','十三、高架作業(二)排煙風門、探測器及灑水頭維修保養',14),
 ('DANGER_WORK','13-03','十三、高架作業(三)電聯車頂空調檢修排水孔檢修等車頂作業',15),
 ('DANGER_WORK','13-04','十三、高架作業(四)洗車機更換橫刷馬達作業',16),
 ('DANGER_WORK','13-05','十三、高架作業(五)供電電纜捲揚器、滑動式供電系統檢修作業',17),
 ('DANGER_WORK','13-06','十三、高架作業(六)起重機高空檢修作業',18),
 ('DANGER_WORK','13-07','十三、高架作業(七)站體設備(PIDS、PA、CCTV 等)檢修作業',19),
 ('DANGER_WORK','13-08','十三、高架作業(八)車站屋頂(含屋頂設備)、樑柱結構、建築裝修之檢修作業',20),
 ('DANGER_WORK','13-09','十三、高架作業(九)車站空調送風機維修保養',21),
 ('DANGER_WORK','13-10','十三、高架作業(十)軌道養護車輛車頂設備檢修作業',22),
 ('DANGER_WORK','13-11','十三、高架作業(十一)其他簽奉核可之高空檢修作業',23),
 ('DANGER_WORK','14','十四、從事電(扶)梯機坑或升降機頂端之檢修作業',24),
 ('DANGER_WORK','15-01','十五、局限空間/缺氧作業(一)廢水處理廠廢水處理池與儲槽內檢修作業',25),
 ('DANGER_WORK','15-02','十五、局限空間/缺氧作業(二)車站月台下方廊道檢修作業',26),
 ('DANGER_WORK','15-03','十五、局限空間/缺氧作業(三)豎坑內電纜更換作業',27),
 ('DANGER_WORK','15-04','十五、局限空間/缺氧作業(四)機廠涵洞內檢修作業',28),
 ('DANGER_WORK','15-05','十五、局限空間/缺氧作業(五)電纜人孔內部從事電纜檢修作業',29),
 ('DANGER_WORK','15-06','十五、局限空間/缺氧作業(六)日用水箱、消防水箱、集水坑、列車清洗儲水坑井內清潔及檢修作業',30),
 ('DANGER_WORK','15-07','十五、局限空間/缺氧作業(七)其它簽奉核可之局限空間作業',31),
 ('DANGER_WORK','16','十六、軌道鋁熱焊檢修作業',32);

COMMIT;
