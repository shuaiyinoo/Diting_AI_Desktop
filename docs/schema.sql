-- ============================================
-- OCR票据识别结果 - 数据库Schema设计
-- 存储引擎: SQLite (开发/轻量) / PostgreSQL (生产)
-- 设计思路: 固定列(常用查询字段) + JSON列(全量识别数据)
-- ============================================

-- 票据类型注册表：维护所有支持的票据类型
CREATE TABLE IF NOT EXISTS receipt_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_code VARCHAR(50) NOT NULL UNIQUE,          -- 类型编码: vat_invoice, train_ticket, idcard...
    type_name VARCHAR(100) NOT NULL,                -- 类型显示名: 增值税发票, 火车票...
    category VARCHAR(50) NOT NULL,                  -- 大类编码: receipt, certificate, report, document, card, general
    category_display VARCHAR(50) NOT NULL,          -- 大类显示名: 票据类, 证件类, 报告类, 文档类, 卡品类, 通用类
    api_endpoint VARCHAR(200),                      -- OCR API地址
    description TEXT,                               -- 描述
    default_search_fields TEXT DEFAULT '[]',         -- 常用查询字段(JSON数组)
    schema_definition TEXT,                         -- 字段定义(JSON Schema格式)
    example_json TEXT,                              -- 票据JSON示例(供大模型参考)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipt_types_category ON receipt_types(category);
CREATE INDEX IF NOT EXISTS idx_receipt_types_code ON receipt_types(type_code);

-- ============================================
-- 核心表: 识记录主表
-- 设计原则: 常用查询条件固化为列，全量数据存JSON
-- ============================================
CREATE TABLE IF NOT EXISTS ocr_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- ===== 基础信息 =====
    receipt_type_code VARCHAR(50) NOT NULL,         -- 票据类型编码(关联receipt_types)
    batch_id VARCHAR(64),                           -- 批次号(同一次上传的关联记录)
    
    -- ===== 图片信息 =====
    image_path VARCHAR(500),                        -- 本地图片存储路径
    image_url VARCHAR(500),                         -- 原始图片URL
    image_hash VARCHAR(64),                         -- MD5/SHA256用于去重
    image_size_bytes INTEGER,                       -- 图片文件大小
    
    -- ===== 识别结果(高频查询字段 固定列) =====
    vendor_name VARCHAR(200),                       -- 销方/商家名称
    customer_name VARCHAR(200),                      -- 购方/客户名称
    total_amount DECIMAL(15, 2),                    -- 金额
    receipt_date DATE,                              -- 票据日期
    receipt_number VARCHAR(100),                    -- 发票号/票号
    receipt_code VARCHAR(100),                      -- 发票代码
    
    -- ===== 发票专用常用字段 =====
    invoice_type VARCHAR(50),                       -- 发票类型: 专票/普票/电子...
    tax_amount DECIMAL(15, 2),                      -- 税额
    amount_without_tax DECIMAL(15, 2),              -- 不含税金额
    tax_rate DECIMAL(5, 2),                         -- 税率
    
    -- ===== 交通票据专用字段 =====
    departure VARCHAR(200),                         -- 出发地
    destination VARCHAR(200),                       -- 目的地
    travel_date DATE,                               -- 出行时间
    vehicle_number VARCHAR(50),                     -- 车次/航班号
    seat_class VARCHAR(50),                         -- 座位等级
    
    -- ===== 卡证专用字段 =====
    person_name VARCHAR(100),                       -- 人员姓名
    id_number VARCHAR(50),                          -- 身份证号/证件号
    gender VARCHAR(10),                             -- 性别
    birth_date DATE,                                -- 出生日期
    issuing_authority VARCHAR(200),                 -- 签发机关
    valid_period VARCHAR(100),                      -- 有效期限
    
    -- ===== 医疗专用字段 =====
    hospital_name VARCHAR(200),                     -- 医院名称
    medical_insurance_amount DECIMAL(15, 2),        -- 医保支付金额
    self_pay_amount DECIMAL(15, 2),                 -- 自费金额
    
    -- ===== 全量识别数据 =====
    raw_data TEXT NOT NULL,                         -- OCR返回的完整JSON
    normalized_data TEXT,                           -- 清洗标准化后的JSON
    
    -- ===== 状态与管理 =====
    confidence DECIMAL(5, 4),                       -- 整体置信度(0~1)
    is_verified INTEGER DEFAULT 0,                  -- 是否已人工核验: 0/1
    verify_status VARCHAR(20) DEFAULT 'pending',   -- 核验状态: pending/verified/rejected
    data_source VARCHAR(20) DEFAULT 'api',          -- 来源: api/upload/manual
    remark TEXT,                                    -- 备注
    
    -- ===== 时间戳 =====
    recognized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 识别时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 外键
    FOREIGN KEY (receipt_type_code) REFERENCES receipt_types(type_code)
);

-- 创建索引(优化查询性能)
CREATE INDEX IF NOT EXISTS idx_records_type ON ocr_records(receipt_type_code);
CREATE INDEX IF NOT EXISTS idx_records_date ON ocr_records(receipt_date);
CREATE INDEX IF NOT EXISTS idx_records_vendor ON ocr_records(vendor_name);
CREATE INDEX IF NOT EXISTS idx_records_customer ON ocr_records(customer_name);
CREATE INDEX IF NOT EXISTS idx_records_amount ON ocr_records(total_amount);
CREATE INDEX IF NOT EXISTS idx_records_receipt_number ON ocr_records(receipt_number);
CREATE INDEX IF NOT EXISTS idx_records_image_hash ON ocr_records(image_hash);
CREATE INDEX IF NOT EXISTS idx_records_batch ON ocr_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_records_person ON ocr_records(person_name);
CREATE INDEX IF NOT EXISTS idx_records_id_number ON ocr_records(id_number);

-- 常用组合查询索引
CREATE INDEX IF NOT EXISTS idx_records_type_date ON ocr_records(receipt_type_code, receipt_date);
CREATE INDEX IF NOT EXISTS idx_records_vendor_date ON ocr_records(vendor_name, receipt_date);

-- ============================================
-- 票据明细表: 用于存储商品/费用明细(一对多)
-- ============================================
CREATE TABLE IF NOT EXISTS ocr_record_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL,                     -- 关联ocr_records.id
    
    -- 商品/项目信息
    item_name VARCHAR(500) NOT NULL,                -- 商品/项目名称
    specification VARCHAR(200),                     -- 规格型号
    unit VARCHAR(50),                               -- 单位
    quantity DECIMAL(15, 4),                        -- 数量
    unit_price DECIMAL(15, 4),                      -- 单价
    amount DECIMAL(15, 2),                          -- 金额
    tax_rate DECIMAL(5, 2),                         -- 税率
    tax_amount DECIMAL(15, 2),                      -- 税额
    item_category VARCHAR(50),                      -- 项目类别
    
    -- 原始行数据
    raw_line_data TEXT,
    
    FOREIGN KEY (record_id) REFERENCES ocr_records(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_record ON ocr_record_items(record_id);
CREATE INDEX IF NOT EXISTS idx_items_name ON ocr_record_items(item_name);

-- ============================================
-- 标签表: 实现灵活分类
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(20),                              -- 显示颜色
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS record_tags (
    record_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (record_id, tag_id),
    FOREIGN KEY (record_id) REFERENCES ocr_records(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ============================================
-- 自定义字段表: 用户个性化字段扩展
-- ============================================
CREATE TABLE IF NOT EXISTS custom_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    field_value TEXT,
    field_type VARCHAR(20) DEFAULT 'text',        -- text/number/date
    FOREIGN KEY (record_id) REFERENCES ocr_records(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_custom_field_record ON custom_fields(record_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_field_unique ON custom_fields(record_id, field_name);

-- ============================================
-- 导入批次表: 管理批量导入
-- ============================================
CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id VARCHAR(64) NOT NULL UNIQUE,
    file_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'processing',       -- processing/completed/failed
    source VARCHAR(50),                             -- 来源: upload/api/sync
    operator VARCHAR(100),
    error_log TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- ============================================
-- 票据类型初始化数据（含JSON示例）
-- ============================================
INSERT OR IGNORE INTO receipt_types (type_code, type_name, category, category_display, api_endpoint, description, example_json) VALUES
-- 财务票据 -> 财税报销大类
('vat_invoice', '增值税发票', 'finance', '财税报销', '/ocr/v1/vat_invoice', 
 '增值税专用发票、普通发票、电子发票、卷票、区块链发票',
 '{"log_id":"5425496231209218858","words_result_num":36,"words_result":{"InvoiceNumDigit":"123456","ServiceType":"其他","InvoiceNum":"14641426","InvoiceNumConfirm":"14641426","SellerName":"上海易火广告传媒有限公司","CommodityTaxRate":[{"word":"6%","row":"1"}],"SellerBank":"中国银行南翔支行446863841354","Checker":":沈园园","TotalAmount":"94339.62","CommodityAmount":[{"word":"94339.62","row":"1"}],"InvoiceDate":"2016年06月02日","CommodityTax":[{"word":"5660.38","row":"1"}],"PurchaserName":"百度时代网络技术(北京)有限公司","CommodityNum":[{"word":"","row":"1"}],"Province":"上海","City":"","SheetNum":"第三联","Agent":"否","PurchaserBank":"招商银行北京分行大屯路支行8661820285100030","Remarks":"告传","Password":"074/45781873408>/6>8>65*887676033/51+<5415>9/32--852>1+29<65>641-5>66<500>87/*-34<943359034>716905113*4242>","SellerAddress":":嘉定区胜辛南路500号15幢1161室55033753","PurchaserAddress":"北京市海淀区东北旺西路8号中关村软件园17号楼二属A2010-59108001","InvoiceCode":"3100153130","InvoiceCodeConfirm":"3100153130","CommodityUnit":[{"word":"","row":"1"}],"Payee":":徐蓉","PurchaserRegisterNum":"110108787751579","CommodityPrice":[{"word":"","row":"1"}],"NoteDrawer":"沈园园","AmountInWords":"壹拾万圆整","AmountInFiguers":"100000.00","TotalTax":"5660.38","InvoiceType":"专用发票","SellerRegisterNum":"913101140659591751","CommodityName":[{"word":"信息服务费","row":"1"}],"CommodityType":[{"word":"","row":"1"}],"CommodityPlateNum":[],"CommodityVehicleType":[],"CommodityStartDate":[],"CommodityEndDate":[],"OnlinePay":""}}'
),
('quota_invoice', '定额发票', 'finance', '财税报销', '/ocr/v1/quota_invoice', 
 '各类定额发票',
 '{"words_result":{"InvoiceCode":"123456789012","InvoiceNum":"12345678","Amount":"100.00","Province":"北京市"},"log_id":123456789}'
),
('machine_invoice', '通用机打发票', 'finance', '财税报销', '/ocr/v1/invoice', 
 '国家/地方税务局发行的通用机打发票',
 '{"words_result":{"InvoiceNum":"12345678","InvoiceCode":"123456789012","InvoiceDate":"2026年01月01日","TotalAmount":"1000.00","InvoiceType":"机打发票"},"log_id":123456789}'
),
('train_ticket', '火车票', 'finance', '财税报销', '/ocr/v1/train_ticket', 
 '大陆火车票',
 '{"words_result":{"ticket_no":"1234567890","starting_station":"北京南站","train_number":"G0000","destination_station":"廊坊站","date":"2024年12月08日","ticket_price":"￥26.00元","seat_category":"二等座","passenger_name":"小度"},"log_id":123456789}'
),
('taxi_receipt', '出租车票', 'finance', '财税报销', '/ocr/v1/taxi_receipt', 
 '全国各大城市出租车发票',
 '{"words_result":{"InvoiceNum":"12345678","CarNumber":"京A12345","Date":"2026年01月01日","TotalAmount":"50.00","GetOnTime":"08:00","GetOffTime":"08:30"},"log_id":123456789}'
),
('air_ticket', '飞机行程单', 'finance', '财税报销', '/ocr/v1/air_ticket', 
 '飞机行程单',
 '{"words_result":{"发票名称":"电子发票(航空运输电子客票行程单)","旅客姓名":"小度","始发站":"北京首都T3","目的站":"西安咸阳T2","承运人":"国航","航班号":"CA0000","日期":"2025-01-03","票价":"2165.14","燃油附加费":"45.87","增值税税额":"198.99","合计":"2460.00"},"log_id":123456789}'
),
('bus_ticket', '汽车票', 'finance', '财税报销', '/ocr/v1/bus_ticket', 
 '全国范围汽车票',
 '{"words_result":{"InvoiceCode":"123456789012","InvoiceNum":"12345678","ArrivalStation":"到达站","DepartureStation":"出发站","Date":"2026年01月01日","Amount":"100.00","Name":"张三"},"log_id":123456789}'
),
('toll_invoice', '过路过桥费发票', 'finance', '财税报销', '/ocr/v1/toll_invoice', 
 '过路、过桥费发票',
 '{"words_result":{"InvoiceCode":"123456789012","InvoiceNum":"12345678","Entrance":"京承高速入口","Exit":"京承高速出口","Date":"2026年01月01日","Amount":"50.00","Province":"北京市"},"log_id":123456789}'
),
('ferry_ticket', '船票', 'finance', '财税报销', '/ocr/v1/ferry_ticket', 
 '客运船票、货运船票',
 '{"words_result":{"InvoiceCode":"123456789012","InvoiceNum":"12345678","InvoiceDate":"2026年01月01日","InvoiceType":"客运船票","TotalAmount":"200.00","DepartureLocation":"出发港","ArrivalLocation":"到达港"},"log_id":123456789}'
),
('online_taxi', '网约车行程单', 'finance', '财税报销', '/ocr/v1/online_taxi_itinerary', 
 '滴滴、高德等网约车行程单',
 '{"words_result":{"ServiceProvider":"滴滴出行","StartTime":"2026-01-01 08:00","EndTime":"2026-01-01 08:30","CarModel":"快车","TotalAmount":"50.00","Mileage":"20.5"},"log_id":123456789}'
),
('shopping_receipt', '购物小票', 'finance', '财税报销', '/ocr/v1/shopping_receipt', 
 '商场、超市、药店购物小票',
 '{"words_result":{"StoreName":"XX超市","ConsumptionDate":"2026-01-01","TotalAmount":"100.00","ProductDetails":[{"ProductName":"商品1","UnitPrice":"10.00","Quantity":"2","Subtotal":"20.00"}]},"log_id":123456789}'
),
('bank_receipt', '银行回单', 'finance', '财税报销', '/ocr/v1/bank_receipt', 
 '各大银行回单',
 '{"words_result":{"PayerName":"付款人名称","PayerAccount":"1234567890","PayeeName":"收款人名称","Amount":"10000.00","Date":"2026年01月01日"},"log_id":123456789}'
),
('multiple_invoice', '智能票据混贴', 'finance', '财税报销', '/ocr/v1/multiple_invoice', 
 '13类票据混贴识别',
 '{"words_result_num":2,"words_result":[{"type":"增值税发票","location":{"left":0,"top":0,"width":1000,"height":600},"words_result":{"InvoiceCode":"123456789012","InvoiceNum":"12345678"}}]}'
),

-- 交通证照 -> 资质证照大类
('license_plate', '车牌', 'traffic', '交通出行', '/ocr/v1/license_plate', 
 '机动车车牌',
 '{"words_result":[{"color":"blue","number":"京KBT355","probability":[0.9999992847,0.999999404,0.9999910593]}],"log_id":123456789}'
),
('vin_code', 'VIN码', 'traffic', '交通出行', '/ocr/v1/vin_code', 
 '车辆识别代号',
 '{"words_result":{"VIN":"LSVAU2180N2183847"},"log_id":123456789}'
),
('driving_license', '驾驶证', 'traffic', '交通出行', '/ocr/v1/driving_license', 
 '机动车驾驶证',
 '{"words_result":{"证号":{"words":"1****************4"},"姓名":{"words":"张三"},"性别":{"words":"男"},"出生日期":{"words":"2000年01月01日"},"准驾车型":{"words":"C1"}},"log_id":123456789}'
),
('vehicle_license', '行驶证', 'traffic', '交通出行', '/ocr/v1/vehicle_license', 
 '机动车行驶证',
 '{"words_result":{"号牌号码":{"words":"京A12345"},"车辆类型":{"words":"小型轿车"},"所有人":{"words":"张三"},"车辆识别代号":{"words":"LSVAU2180N2183847"},"发动机号码":{"words":"12345678"}},"log_id":123456789}'
),
('vehicle_invoice', '机动车销售发票', 'traffic', '交通出行', '/ocr/v1/vehicle_invoice', 
 '机动车销售发票',
 '{"words_result":{"发票号码":"12345678","开票日期":"2026年01月01日","价税合计":"200000.00","购买方名称":"张三","车辆识别代号":"LSVAU2180N2183847","销货单位名称":"北京XX汽车销售有限公司"},"log_id":123456789}'
),
('vehicle_certificate', '车辆合格证', 'traffic', '交通出行', '/ocr/v1/vehicle_certificate', 
 '车辆合格证',
 '{"words_result":{"合格证编号":"WB12345678901234","车辆品牌":"宝马","车辆型号":"BMW7200LG","车辆识别代号":"LSVAU2180N2183847","排放标准":"国VI"},"log_id":123456789}'
),
('used_vehicle_invoice', '二手车销售发票', 'traffic', '交通出行', '/ocr/v1/used_vehicle_invoice', 
 '二手车销售发票',
 '{"words_result":{"发票号码":"12345678","开票日期":"2026年01月01日","买方":"李四","卖方":"张三","车牌号":"京A12345","价款合计":"100000.00"},"log_id":123456789}'
),

-- 卡证 -> 资质证照大类
('idcard', '身份证', 'card', '资质证照', '/ocr/v1/idcard', 
 '二代居民身份证',
 '{"words_result":{"公民身份号码":{"words":"1****************4"},"出生":{"words":"2000年01月01日"},"姓名":{"words":"张三"},"性别":{"words":"男"},"民族":{"words":"汉"},"住址":{"words":"北京市海淀区XX路XX号"}},"words_result_num":8,"image_status":"normal","log_id":123456789}'
),
('bankcard', '银行卡', 'card', '资质证照', '/ocr/v1/bankcard', 
 '各类银行卡',
 '{"result":{"bank_card_number":"6222021234567890123","valid_date":"08/25","bank_card_type":"借记卡","bank_name":"中国工商银行","holder_name":"张三"},"log_id":123456789}'
),
('business_license', '营业执照', 'card', '资质证照', '/ocr/v1/business_license', 
 '各类营业执照',
 '{"words_result":{"社会信用代码":{"words":"91110000123456789X"},"单位名称":{"words":"北京XX科技有限公司"},"类型":{"words":"有限责任公司"},"法定代表人":{"words":"张三"},"成立日期":{"words":"2020年01月01日"}},"log_id":123456789}'
),
('passport', '护照', 'card', '资质证照', '/ocr/v1/passport', 
 '中国大陆居民护照',
 '{"words_result":{"国家码":{"words":"CHN"},"姓名":{"words":"ZHANG SAN"},"护照号":{"words":"E12345678"},"出生日期":{"words":"2000年01月01日"}},"log_id":123456789}'
),
('hk_macao_tw_pass', '港澳台证件', 'card', '资质证照', '/ocr/v1/HK_Macau_Taiwan_pass', 
 '港澳通行证、台湾通行证等',
 '{"words_result":{"证件类型":{"words":"港澳居民来往内地通行证"},"姓名":{"words":"张三"},"证件号码":{"words":"H1234567890"}},"log_id":123456789}'
),
('household_register', '户口本', 'card', '资质证照', '/ocr/v1/household_register', 
 '居民户口簿',
 '{"words_result":{"姓名":{"words":"张三"},"性别":{"words":"男"},"出生日期":{"words":"2000年01月01日"},"身份证号码":{"words":"1****************4"}},"log_id":123456789}'
),
('birth_certificate', '出生证明', 'card', '资质证照', '/ocr/v1/birth_certificate', 
 '出生医学证明',
 '{"words_result":{"出生时间":{"words":"2025年01月01日"},"姓名":{"words":"张小三"},"性别":{"words":"男"},"出生证编号":{"words":"B202501010001"},"父亲姓名":{"words":"张三"},"母亲姓名":{"words":"李四"}},"log_id":123456789}'
),
('marriage_certificate', '结婚证', 'card', '资质证照', '/ocr/v1/marriage_certificate', 
 '结婚证',
 '{"words_result":{"持证人_男":{"words":"张三"},"持证人_女":{"words":"李四"},"结婚证字号":{"words":"京海结字20250001"},"登记日期":{"words":"2025年01月01日"}},"log_id":123456789}'
),
('divorce_certificate', '离婚证', 'card', '资质证照', '/ocr/v1/divorce_certificate', 
 '离婚证',
 '{"words_result":{"持证人_男":{"words":"张三"},"持证人_女":{"words":"李四"},"离婚证字号":{"words":"京海离字20250001"},"登记日期":{"words":"2025年01月01日"}},"log_id":123456789}'
),
('house_property', '房产证', 'card', '资质证照', '/ocr/v1/house_property', 
 '房产证',
 '{"words_result":{"权利人":{"words":"张三"},"坐落":{"words":"北京市海淀区XX路XX号XX室"},"面积":{"words":"100.00平方米"},"用途":{"words":"住宅"}},"log_id":123456789}'
),
('social_security_card', '社保卡', 'card', '资质证照', '/ocr/v1/social_security_card', 
 '社会保障卡',
 '{"words_result":{"社会保障卡号":{"words":"1234567890"},"姓名":{"words":"张三"},"性别":{"words":"男"},"出生日期":{"words":"2000年01月01日"}},"log_id":123456789}'
),

-- 医疗 -> 医疗健康大类
('medical_invoice', '医疗发票', 'medical', '医疗健康', '/ocr/v1/medical_invoice', 
 '门诊/住院发票',
 '{"words_result":{"发票号":"12345678","姓名":"张三","性别":"男","金额小写":"1000.00","收款单位":"XX医院","医保统筹支付":"800.00","自费金额":"200.00"},"log_id":123456789}'
),
('medical_detail', '医疗费用明细', 'medical', '医疗健康', '/ocr/v1/medical_detail', 
 '医疗费用明细清单',
 '{"words_result":{"姓名":"张三","日期":"2026年01月01日","总金额":"500.00","明细项目":[{"项目类型":"药品费","项目名称":"阿莫西林","单价":"10.00","数量":"3","金额":"30.00"}]},"log_id":123456789}'
),
('medical_statement', '费用结算单', 'medical', '医疗健康', '/ocr/v1/medical_statement', 
 '医疗费用结算单',
 '{"words_result":{"姓名":"张三","入院时间":"2026年01月01日","出院时间":"2026年01月10日","发票总金额":"10000.00","自费金额":"2000.00","医保支付金额":"8000.00"},"log_id":123456789}'
),
('medical_report', '检验报告单', 'medical', '医疗健康', '/ocr/v1/medical_report', 
 '医疗检验报告单',
 '{"words_result":{"姓名":"张三","医院名称":"XX医院","报告单名称":"血常规检验报告","检查项目":[{"项目名称":"白细胞计数","结果":"6.5","单位":"10^9/L","参考区间":"3.5-9.5"}]},"log_id":123456789}'
),
('medical_diagnosis', '诊断报告单', 'medical', '医疗健康', '/ocr/v1/medical_diagnosis_report', 
 '医疗诊断报告单',
 '{"words_result":{"医院名称":"XX医院","报告名称":"CT诊断报告","姓名":"张三","检查部位":"胸部","检查提示":"未见明显异常"},"log_id":123456789}'
),
('medical_record_home', '病案首页', 'medical', '医疗健康', '/ocr/v1/medical_record_home', 
 '病案首页',
 '{"words_result":{"病案号":"BA202501010001","姓名":"张三","性别":"男","入院科别":"内科","出院科别":"内科","住院次数":"1"},"log_id":123456789}'
),
('discharge_summary', '出院小结', 'medical', '医疗健康', '/ocr/v1/medical_discharge_summary', 
 '出院小结',
 '{"words_result":{"科室":"内科","姓名":"张三","入院日期":"2026年01月01日","出院日期":"2026年01月10日","入院诊断":"上呼吸道感染","出院医嘱":"注意休息"},"log_id":123456789}'
),

-- 教育 -> 教育培训大类
('exam_analysis', '试卷分析', 'education', '教育培训', '/ocr/v1/exam_analysis', 
 '作业、试卷分析',
 '{"words_result_num":2,"words_result":[{"type":"title","words":"2025-2026学年第一学期期末考试"},{"type":"text","words":"第一题 选择题..."}]}'
),
('exam_cut', '试卷切题', 'education', '教育培训', '/ocr/v1/exam_cut', 
 '试卷题目切分识别',
 '{"words_result":[{"题号":"1","题型":"选择题","题干":"下列哪个是中国的首都？","选项":["A. 上海","B. 北京","C. 广州","D. 深圳"],"答案":"B"}]}'
),

-- 通用 -> 通用识别大类
('general_basic', '通用文字识别', 'general', '通用识别', '/ocr/v1/general_basic', 
 '通用文字识别',
 '{"words_result_num":2,"words_result":[{"words":"百度OCR"},{"words":"高效准确"}],"log_id":123456789}'
),
('accurate_basic', '高精度识别', 'general', '通用识别', '/ocr/v1/accurate_basic', 
 '高精度文字识别',
 '{"words_result_num":1,"words_result":[{"words":"百度OCR","probability":{"average":0.999}}],"log_id":123456789}'
),
('table_ocr', '表格识别', 'general', '通用识别', '/ocr/v1/table', 
 '表格文字识别',
 '{"result":{"table_count":1,"tables":[{"header":[{"row":[1,1],"col":[1,1],"word":"姓名"}],"body":[{"row":[2,2],"col":[1,1],"word":"张三"}]}]},"log_id":123456789}'
),
('qrcode', '二维码识别', 'general', '通用识别', '/ocr/v1/qrcode', 
 '二维码/条形码识别',
 '{"codes_result_num":1,"codes_result":[{"type":"qrcode","text":"https://www.baidu.com"}],"log_id":123456789}'
),
('seal', '印章识别', 'general', '通用识别', '/ocr/v1/seal', 
 '印章检测识别',
 '{"words_result":[{"words":"北京XX科技有限公司","probability":0.99}],"log_id":123456789}'
),

-- 其他 -> 其他场景大类
('meter', '仪器仪表盘读数', 'other', '其他场景', '/ocr/v1/meter', 
 '血糖仪、血压仪等读数',
 '{"words_result":[{"words":"120","location":{"x":100,"y":100}}],"log_id":123456789}'
),
('door_plate', '门脸文字', 'other', '其他场景', '/ocr/v1/door_plate', 
 '店铺门脸文字',
 '{"words_result":[{"words":"星巴克咖啡","location":{"x":100,"y":100}}],"log_id":123456789}'
);

