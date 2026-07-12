-- =====================================================================
-- Phase 1e:修正 — 危險工作項目改回兩層階層原文;派工作業層改為階層樹
-- 執行方式:於 db-design 目錄執行(\copy 相對路徑)
-- 冪等:可重複執行
-- =====================================================================
BEGIN;

-- 1) 危險工作項目:照官方原文重建(大項 + 子項兩層;不合併改寫) -----------
DELETE FROM workflow_option WHERE option_group = 'DANGER_WORK';
INSERT INTO workflow_option (option_group, option_code, option_label, sort_order, description) VALUES
 ('DANGER_WORK','01','一、在活電下進入軌道(第三軌)緊急搶修作業、轉轍器維修及運轉操作等作業',1,NULL),
 ('DANGER_WORK','02','二、AC 16I/22.8KV GIS 及主變壓器檢修',2,NULL),
 ('DANGER_WORK','03','三、PPSS 750V 高速斷路器檢修',3,NULL),
 ('DANGER_WORK','04','四、PPSS GBSS 接地開關(GGBS) 檢修',4,NULL),
 ('DANGER_WORK','05','五、電力設備(22KV 開關盤、整流變壓器、阻環路開關、車站用變壓器)耐壓及功率因數試驗',5,NULL),
 ('DANGER_WORK','06','六、受電室高壓設備保養維修工作',6,NULL),
 ('DANGER_WORK','07','七、低壓高電流(600V以下、100伏特以上)之設備保養維修工作',7,NULL),
 ('DANGER_WORK','08','八、電聯車及軌道養護車推進、低壓供電及空調反向器設備活線檢修作業',8,NULL),
 ('DANGER_WORK','09','九、推進系統推進換流器盤測試',9,NULL),
 ('DANGER_WORK','10','十、靜態換流器(SIV)或電池充電器之靜態試驗',10,NULL),
 ('DANGER_WORK','11','十一、其它簽奉核可之活電作業。',11,NULL),
 ('DANGER_WORK','12','十二、地下車床車輪車削作業',12,NULL),
 ('DANGER_WORK','13','十三、高架作業',13,'群組(含子項)'),
 ('DANGER_WORK','13-01','(一) 挑空區域照明及路燈更換',14,'十三、高架作業'),
 ('DANGER_WORK','13-02','(二)排煙風門、探測器及灑水頭維修保養',15,'十三、高架作業'),
 ('DANGER_WORK','13-03','(三)電聯車頂空調檢修排水孔檢修等車頂作業',16,'十三、高架作業'),
 ('DANGER_WORK','13-04','(四)洗車機更換橫刷馬達作業',17,'十三、高架作業'),
 ('DANGER_WORK','13-05','(五)供電電纜捲揚器、滑動式供電系統檢修作業',18,'十三、高架作業'),
 ('DANGER_WORK','13-06','(六)起重機高空檢修作業',19,'十三、高架作業'),
 ('DANGER_WORK','13-07','(七)站體設備(PIDS、PA、CCTV 等)檢修作業',20,'十三、高架作業'),
 ('DANGER_WORK','13-08','(八)車站屋頂(含屋頂設備)、樑柱結構、建築裝修之檢修作業',21,'十三、高架作業'),
 ('DANGER_WORK','13-09','(九)車站空調送風機維修保養',22,'十三、高架作業'),
 ('DANGER_WORK','13-10','(十)軌道養護車輛車頂設備檢修作業',23,'十三、高架作業'),
 ('DANGER_WORK','13-11','(十一) 其他簽奉核可之高空檢修作業',24,'十三、高架作業'),
 ('DANGER_WORK','14','十四、從事電(扶)梯機坑或升降機頂端之檢修作業',25,NULL),
 ('DANGER_WORK','15','十五、符合局限空間/缺氧之危險作業項目如下：',26,'群組(含子項)'),
 ('DANGER_WORK','15-01','(一)廢水處理廠廢水處理池與儲槽內檢修作業',27,'十五、符合局限空間/缺氧之危險作業項目'),
 ('DANGER_WORK','15-02','(二)車站月台下方廊道檢修作業',28,'十五、符合局限空間/缺氧之危險作業項目'),
 ('DANGER_WORK','15-03','(三)豎坑內電纜更換作業',29,'十五、符合局限空間/缺氧之危險作業項目'),
 ('DANGER_WORK','15-04','(四)機廠涵洞內檢修作業',30,'十五、符合局限空間/缺氧之危險作業項目'),
 ('DANGER_WORK','15-05','(五)電纜人孔內部從事電纜檢修作業',31,'十五、符合局限空間/缺氧之危險作業項目'),
 ('DANGER_WORK','15-06','(六)日用水箱、消防水箱、集水坑、列車清洗儲水坑井內清潔及檢修作業',32,'十五、符合局限空間/缺氧之危險作業項目'),
 ('DANGER_WORK','15-07','(七)其它簽奉核可之局限空間作業',33,'十五、符合局限空間/缺氧之危險作業項目'),
 ('DANGER_WORK','16','十六、軌道鋁熱焊檢修作業',34,NULL);

-- 2) 派工作業層:階層樹(主系統→子系統→徵狀→零組件→原因) ---------------
CREATE TABLE IF NOT EXISTS fault_dispatch_node (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id integer REFERENCES fault_dispatch_node(id),
  name      text NOT NULL,
  level     integer NOT NULL CHECK (level BETWEEN 1 AND 5),
  -- level:1 主系統(電聯車系統) 2 子系統 3 故障徵狀 4 故障零組件 5 故障原因
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  UNIQUE (parent_id, name)
);
COMMENT ON TABLE fault_dispatch_node IS 'C工單派工作業系統層階層樹(故障工單階層(車輛).xlsx);互鎖下拉逐層取子節點';

-- 由 CSV 主檔建樹(只在樹為空時執行)
CREATE TEMP TABLE _fdt_stage (
  system_code text, system_cn text, system_en text,
  subsystem text, symptom text, component text, cause text
);
\copy _fdt_stage FROM 'fault-dispatch-catalog.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

DO $$
DECLARE root_id integer; r record; sub_id integer; sym_id integer; comp_id integer;
BEGIN
  IF EXISTS (SELECT 1 FROM fault_dispatch_node) THEN
    RAISE NOTICE '派工樹已存在,略過建樹';
    RETURN;
  END IF;
  INSERT INTO fault_dispatch_node (parent_id, name, level) VALUES (NULL,'電聯車系統',1) RETURNING id INTO root_id;
  FOR r IN SELECT DISTINCT subsystem, symptom, component, cause FROM _fdt_stage
           WHERE subsystem IS NOT NULL ORDER BY subsystem, symptom, component, cause LOOP
    SELECT id INTO sub_id FROM fault_dispatch_node WHERE parent_id = root_id AND name = r.subsystem;
    IF sub_id IS NULL THEN
      INSERT INTO fault_dispatch_node (parent_id, name, level) VALUES (root_id, r.subsystem, 2) RETURNING id INTO sub_id;
    END IF;
    SELECT id INTO sym_id FROM fault_dispatch_node WHERE parent_id = sub_id AND name = r.symptom;
    IF sym_id IS NULL THEN
      INSERT INTO fault_dispatch_node (parent_id, name, level) VALUES (sub_id, r.symptom, 3) RETURNING id INTO sym_id;
    END IF;
    SELECT id INTO comp_id FROM fault_dispatch_node WHERE parent_id = sym_id AND name = r.component;
    IF comp_id IS NULL THEN
      INSERT INTO fault_dispatch_node (parent_id, name, level) VALUES (sym_id, r.component, 4) RETURNING id INTO comp_id;
    END IF;
    INSERT INTO fault_dispatch_node (parent_id, name, level) VALUES (comp_id, r.cause, 5)
      ON CONFLICT (parent_id, name) DO NOTHING;
  END LOOP;
END $$;

-- 3) 扁平目錄改為樹的檢視(單一事實來源 = 樹) ---------------------------
DROP TABLE IF EXISTS fault_dispatch_catalog;
CREATE OR REPLACE VIEW fault_dispatch_catalog AS
SELECT sub.name AS subsystem, sym.name AS symptom, comp.name AS component, cause.name AS cause,
       sub.id AS subsystem_id, sym.id AS symptom_id, comp.id AS component_id, cause.id AS cause_id
FROM fault_dispatch_node cause
JOIN fault_dispatch_node comp ON comp.id = cause.parent_id AND comp.level = 4
JOIN fault_dispatch_node sym  ON sym.id  = comp.parent_id  AND sym.level  = 3
JOIN fault_dispatch_node sub  ON sub.id  = sym.parent_id   AND sub.level  = 2
WHERE cause.level = 5;

-- 4) 完工紀錄的派工節點改指向派工樹 --------------------------------------
ALTER TABLE fault_finish_record DROP CONSTRAINT IF EXISTS fault_finish_record_dispatch_node_id_fkey;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ffr_dispatch_node_fkey') THEN
    ALTER TABLE fault_finish_record
      ADD CONSTRAINT ffr_dispatch_node_fkey FOREIGN KEY (dispatch_node_id) REFERENCES fault_dispatch_node(id);
  END IF;
END $$;

COMMIT;
