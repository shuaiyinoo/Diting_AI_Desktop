/**
 * 票据/文档类型注册表
 *
 * 从 docs/schema.sql 的 receipt_types 表提取，作为前端与后端共享的类型定义。
 * 每种类型包含：
 *   - type_code:       唯一编码
 *   - type_name:       显示名（小类）
 *   - category:        大类编码
 *   - category_display: 大类显示名
 *   - description:     描述
 *   - example_json:    JSON 示例（供大模型参考输出格式）
 */

/** 单条票据类型定义 */
export interface ReceiptType {
  type_code: string;
  type_name: string;
  category: string;
  category_display: string;
  description: string;
  example_json: string;
}

/** 所有支持的票据/文档类型（按大类分组） */
export const RECEIPT_TYPES: ReceiptType[] = [
  // ===== 财税报销 =====
  {
    type_code: 'vat_invoice',
    type_name: '增值税发票',
    category: 'finance',
    category_display: '财税报销',
    description: '增值税专用发票、普通发票、电子发票、卷票、区块链发票',
    example_json: '{"InvoiceNumDigit":"123456","ServiceType":"其他","InvoiceNum":"14641426","SellerName":"上海易火广告传媒有限公司","SellerBank":"中国银行南翔支行446863841354","Checker":":沈园园","TotalAmount":"94339.62","InvoiceDate":"2016年06月02日","PurchaserName":"百度时代网络技术(北京)有限公司","PurchaserBank":"招商银行北京分行大屯路支行8661820285100030","Remarks":"告传","SellerAddress":":嘉定区胜辛南路500号15幢1161室55033753","PurchaserAddress":"北京市海淀区东北旺西路8号中关村软件园17号楼二属A2010-59108001","InvoiceCode":"3100153130","Payee":":徐蓉","PurchaserRegisterNum":"110108787751579","NoteDrawer":"沈园园","AmountInWords":"壹拾万圆整","AmountInFiguers":"100000.00","TotalTax":"5660.38","InvoiceType":"专用发票","SellerRegisterNum":"913101140659591751","CommodityName":"信息服务费"}',
  },
  {
    type_code: 'quota_invoice',
    type_name: '定额发票',
    category: 'finance',
    category_display: '财税报销',
    description: '各类定额发票',
    example_json: '{"InvoiceCode":"123456789012","InvoiceNum":"12345678","Amount":"100.00","Province":"北京市"}',
  },
  {
    type_code: 'machine_invoice',
    type_name: '通用机打发票',
    category: 'finance',
    category_display: '财税报销',
    description: '国家/地方税务局发行的通用机打发票',
    example_json: '{"InvoiceNum":"12345678","InvoiceCode":"123456789012","InvoiceDate":"2026年01月01日","TotalAmount":"1000.00","InvoiceType":"机打发票"}',
  },
  {
    type_code: 'train_ticket',
    type_name: '火车票',
    category: 'finance',
    category_display: '财税报销',
    description: '大陆火车票',
    example_json: '{"ticket_no":"1234567890","starting_station":"北京南站","train_number":"G0000","destination_station":"廊坊站","date":"2024年12月08日","ticket_price":"￥26.00元","seat_category":"二等座","passenger_name":"小度"}',
  },
  {
    type_code: 'taxi_receipt',
    type_name: '出租车票',
    category: 'finance',
    category_display: '财税报销',
    description: '全国各大城市出租车发票',
    example_json: '{"InvoiceNum":"12345678","CarNumber":"京A12345","Date":"2026年01月01日","TotalAmount":"50.00","GetOnTime":"08:00","GetOffTime":"08:30"}',
  },
  {
    type_code: 'air_ticket',
    type_name: '飞机行程单',
    category: 'finance',
    category_display: '财税报销',
    description: '飞机行程单',
    example_json: '{"发票名称":"电子发票(航空运输电子客票行程单)","旅客姓名":"小度","始发站":"北京首都T3","目的站":"西安咸阳T2","承运人":"国航","航班号":"CA0000","日期":"2025-01-03","票价":"2165.14","燃油附加费":"45.87","增值税税额":"198.99","合计":"2460.00"}',
  },
  {
    type_code: 'bus_ticket',
    type_name: '汽车票',
    category: 'finance',
    category_display: '财税报销',
    description: '全国范围汽车票',
    example_json: '{"InvoiceCode":"123456789012","InvoiceNum":"12345678","ArrivalStation":"到达站","DepartureStation":"出发站","Date":"2026年01月01日","Amount":"100.00","Name":"张三"}',
  },
  {
    type_code: 'toll_invoice',
    type_name: '过路过桥费发票',
    category: 'finance',
    category_display: '财税报销',
    description: '过路、过桥费发票',
    example_json: '{"InvoiceCode":"123456789012","InvoiceNum":"12345678","Entrance":"京承高速入口","Exit":"京承高速出口","Date":"2026年01月01日","Amount":"50.00","Province":"北京市"}',
  },
  {
    type_code: 'ferry_ticket',
    type_name: '船票',
    category: 'finance',
    category_display: '财税报销',
    description: '客运船票、货运船票',
    example_json: '{"InvoiceCode":"123456789012","InvoiceNum":"12345678","InvoiceDate":"2026年01月01日","InvoiceType":"客运船票","TotalAmount":"200.00","DepartureLocation":"出发港","ArrivalLocation":"到达港"}',
  },
  {
    type_code: 'online_taxi',
    type_name: '网约车行程单',
    category: 'finance',
    category_display: '财税报销',
    description: '滴滴、高德等网约车行程单',
    example_json: '{"TotalFare":"2316","EndTime":"2020-07-30 19:00","Phone":"13000000000","ServiceProvider":"滴滴企业版","StartTime":"2020-07-01 16:00","ApplicationDate":"2017-12-08","ItemId":"3","items":[{"ItemId":"1","StartPlace":"鱼化寨地铁-D口","PickupTime":"16:00","CarType":"快车","City":"西安市","Distance":"9.7","PickupDate":"20-07-01","DestinationPlace":"创新港","Fare":"20.86"},{"ItemId":"2","StartPlace":"科学园东门","PickupTime":"14:56","CarType":"快车","City":"西安市","Distance":"91","PickupDate":"20-07-02","DestinationPlace":"鱼化寨地铁站","Fare":"18.58"},{"ItemId":"3","StartPlace":"中俄丝路创新园东门","PickupTime":"19:00","CarType":"快车","City":"西安市","Distance":"9.1","PickupDate":"20-07-30","DestinationPlace":"新门地铁站","Fare":"20.38"}]}',
  },
  {
    type_code: 'shopping_receipt',
    type_name: '购物小票',
    category: 'finance',
    category_display: '财税报销',
    description: '商场、超市、药店购物小票',
    example_json: '{"StoreName":"XX超市","ConsumptionDate":"2026-01-01","TotalAmount":"100.00","ProductDetails":[{"ProductName":"商品1","UnitPrice":"10.00","Quantity":"2","Subtotal":"20.00"}]}',
  },
  {
    type_code: 'bank_receipt',
    type_name: '银行回单',
    category: 'finance',
    category_display: '财税报销',
    description: '各大银行回单',
    example_json: '{"PayerName":"付款人名称","PayerAccount":"1234567890","PayeeName":"收款人名称","Amount":"10000.00","Date":"2026年01月01日"}',
  },
  {
    type_code: 'multiple_invoice',
    type_name: '智能票据混贴',
    category: 'finance',
    category_display: '财税报销',
    description: '13类票据混贴识别',
    example_json: '{"words_result_num":2,"words_result":[{"type":"增值税发票","words_result":{"InvoiceCode":"123456789012","InvoiceNum":"12345678"}}]}',
  },

  // ===== 交通出行 =====
  {
    type_code: 'license_plate',
    type_name: '车牌',
    category: 'traffic',
    category_display: '交通出行',
    description: '机动车车牌',
    example_json: '{"color":"blue","number":"京KBT355","probability":0.9999}',
  },
  {
    type_code: 'vin_code',
    type_name: 'VIN码',
    category: 'traffic',
    category_display: '交通出行',
    description: '车辆识别代号',
    example_json: '{"VIN":"LSVAU2180N2183847"}',
  },
  {
    type_code: 'driving_license',
    type_name: '驾驶证',
    category: 'traffic',
    category_display: '交通出行',
    description: '机动车驾驶证',
    example_json: '{"证号":"1****************4","姓名":"张三","性别":"男","出生日期":"2000年01月01日","准驾车型":"C1"}',
  },
  {
    type_code: 'vehicle_license',
    type_name: '行驶证',
    category: 'traffic',
    category_display: '交通出行',
    description: '机动车行驶证',
    example_json: '{"号牌号码":"京A12345","车辆类型":"小型轿车","所有人":"张三","车辆识别代号":"LSVAU2180N2183847","发动机号码":"12345678"}',
  },
  {
    type_code: 'vehicle_invoice',
    type_name: '机动车销售发票',
    category: 'traffic',
    category_display: '交通出行',
    description: '机动车销售发票',
    example_json: '{"发票号码":"12345678","开票日期":"2026年01月01日","价税合计":"200000.00","购买方名称":"张三","车辆识别代号":"LSVAU2180N2183847","销货单位名称":"北京XX汽车销售有限公司"}',
  },
  {
    type_code: 'vehicle_certificate',
    type_name: '车辆合格证',
    category: 'traffic',
    category_display: '交通出行',
    description: '车辆合格证',
    example_json: '{"合格证编号":"WB12345678901234","车辆品牌":"宝马","车辆型号":"BMW7200LG","车辆识别代号":"LSVAU2180N2183847","排放标准":"国VI"}',
  },
  {
    type_code: 'used_vehicle_invoice',
    type_name: '二手车销售发票',
    category: 'traffic',
    category_display: '交通出行',
    description: '二手车销售发票',
    example_json: '{"发票号码":"12345678","开票日期":"2026年01月01日","买方":"李四","卖方":"张三","车牌号":"京A12345","价款合计":"100000.00"}',
  },

  // ===== 资质证照 =====
  {
    type_code: 'idcard',
    type_name: '身份证',
    category: 'card',
    category_display: '资质证照',
    description: '二代居民身份证',
    example_json: '{"公民身份号码":"1****************4","出生":"2000年01月01日","姓名":"张三","性别":"男","民族":"汉","住址":"北京市海淀区XX路XX号"}',
  },
  {
    type_code: 'bankcard',
    type_name: '银行卡',
    category: 'card',
    category_display: '资质证照',
    description: '各类银行卡',
    example_json: '{"bank_card_number":"6222021234567890123","valid_date":"08/25","bank_card_type":"借记卡","bank_name":"中国工商银行","holder_name":"张三"}',
  },
  {
    type_code: 'business_license',
    type_name: '营业执照',
    category: 'card',
    category_display: '资质证照',
    description: '各类营业执照',
    example_json: '{"社会信用代码":"91110000123456789X","单位名称":"北京XX科技有限公司","类型":"有限责任公司","法定代表人":"张三","成立日期":"2020年01月01日"}',
  },
  {
    type_code: 'passport',
    type_name: '护照',
    category: 'card',
    category_display: '资质证照',
    description: '中国大陆居民护照',
    example_json: '{"国家码":"CHN","姓名":"ZHANG SAN","护照号":"E12345678","出生日期":"2000年01月01日"}',
  },
  {
    type_code: 'hk_macao_tw_pass',
    type_name: '港澳台证件',
    category: 'card',
    category_display: '资质证照',
    description: '港澳通行证、台湾通行证等',
    example_json: '{"证件类型":"港澳居民来往内地通行证","姓名":"张三","证件号码":"H1234567890"}',
  },
  {
    type_code: 'household_register',
    type_name: '户口本',
    category: 'card',
    category_display: '资质证照',
    description: '居民户口簿',
    example_json: '{"姓名":"张三","性别":"男","出生日期":"2000年01月01日","身份证号码":"1****************4"}',
  },
  {
    type_code: 'birth_certificate',
    type_name: '出生证明',
    category: 'card',
    category_display: '资质证照',
    description: '出生医学证明',
    example_json: '{"出生时间":"2025年01月01日","姓名":"张小三","性别":"男","出生证编号":"B202501010001","父亲姓名":"张三","母亲姓名":"李四"}',
  },
  {
    type_code: 'marriage_certificate',
    type_name: '结婚证',
    category: 'card',
    category_display: '资质证照',
    description: '结婚证',
    example_json: '{"持证人_男":"张三","持证人_女":"李四","结婚证字号":"京海结字20250001","登记日期":"2025年01月01日"}',
  },
  {
    type_code: 'divorce_certificate',
    type_name: '离婚证',
    category: 'card',
    category_display: '资质证照',
    description: '离婚证',
    example_json: '{"持证人_男":"张三","持证人_女":"李四","离婚证字号":"京海离字20250001","登记日期":"2025年01月01日"}',
  },
  {
    type_code: 'house_property',
    type_name: '房产证',
    category: 'card',
    category_display: '资质证照',
    description: '房产证',
    example_json: '{"权利人":"张三","坐落":"北京市海淀区XX路XX号XX室","面积":"100.00平方米","用途":"住宅"}',
  },
  {
    type_code: 'social_security_card',
    type_name: '社保卡',
    category: 'card',
    category_display: '资质证照',
    description: '社会保障卡',
    example_json: '{"社会保障卡号":"1234567890","姓名":"张三","性别":"男","出生日期":"2000年01月01日"}',
  },

  // ===== 医疗健康 =====
  // TODO: 暂时屏蔽医疗健康类识别能力
  /*
  {
    type_code: 'medical_invoice',
    type_name: '医疗发票',
    category: 'medical',
    category_display: '医疗健康',
    description: '门诊/住院发票',
    example_json: '{"发票号":"12345678","姓名":"张三","性别":"男","金额小写":"1000.00","收款单位":"XX医院","医保统筹支付":"800.00","自费金额":"200.00"}',
  },
  {
    type_code: 'medical_detail',
    type_name: '医疗费用明细',
    category: 'medical',
    category_display: '医疗健康',
    description: '医疗费用明细清单',
    example_json: '{"姓名":"张三","日期":"2026年01月01日","总金额":"500.00","明细项目":[{"项目类型":"药品费","项目名称":"阿莫西林","单价":"10.00","数量":"3","金额":"30.00"}]}',
  },
  {
    type_code: 'medical_statement',
    type_name: '费用结算单',
    category: 'medical',
    category_display: '医疗健康',
    description: '医疗费用结算单',
    example_json: '{"姓名":"张三","入院时间":"2026年01月01日","出院时间":"2026年01月10日","发票总金额":"10000.00","自费金额":"2000.00","医保支付金额":"8000.00"}',
  },
  {
    type_code: 'medical_report',
    type_name: '检验报告单',
    category: 'medical',
    category_display: '医疗健康',
    description: '医疗检验报告单',
    example_json: '{"姓名":"张三","医院名称":"XX医院","报告单名称":"血常规检验报告","检查项目":[{"项目名称":"白细胞计数","结果":"6.5","单位":"10^9/L","参考区间":"3.5-9.5"}]}',
  },
  {
    type_code: 'medical_diagnosis',
    type_name: '诊断报告单',
    category: 'medical',
    category_display: '医疗健康',
    description: '医疗诊断报告单',
    example_json: '{"医院名称":"XX医院","报告名称":"CT诊断报告","姓名":"张三","检查部位":"胸部","检查提示":"未见明显异常"}',
  },
  {
    type_code: 'medical_record_home',
    type_name: '病案首页',
    category: 'medical',
    category_display: '医疗健康',
    description: '病案首页',
    example_json: '{"病案号":"BA202501010001","姓名":"张三","性别":"男","入院科别":"内科","出院科别":"内科","住院次数":"1"}',
  },
  {
    type_code: 'discharge_summary',
    type_name: '出院小结',
    category: 'medical',
    category_display: '医疗健康',
    description: '出院小结',
    example_json: '{"科室":"内科","姓名":"张三","入院日期":"2026年01月01日","出院日期":"2026年01月10日","入院诊断":"上呼吸道感染","出院医嘱":"注意休息"}',
  },
  */

  // ===== 教育培训 =====
  // TODO: 暂时屏蔽教育培训类识别能力
  /*
  {
    type_code: 'exam_analysis',
    type_name: '试卷分析',
    category: 'education',
    category_display: '教育培训',
    description: '作业、试卷分析',
    example_json: '{"words_result":[{"type":"title","words":"2025-2026学年第一学期期末考试"},{"type":"text","words":"第一题 选择题..."}]}',
  },
  {
    type_code: 'exam_cut',
    type_name: '试卷切题',
    category: 'education',
    category_display: '教育培训',
    description: '试卷题目切分识别',
    example_json: '{"题目":[{"题号":"1","题型":"选择题","题干":"下列哪个是中国的首都？","选项":["A. 上海","B. 北京","C. 广州","D. 深圳"],"答案":"B"}]}',
  },
  */

  // ===== 通用识别 =====
  // TODO: 暂时屏蔽通用识别类
  /*
  {
    type_code: 'general_basic',
    type_name: '通用文字识别',
    category: 'general',
    category_display: '通用识别',
    description: '通用文字识别',
    example_json: '{"words_result":[{"words":"百度OCR"},{"words":"高效准确"}]}',
  },
  {
    type_code: 'accurate_basic',
    type_name: '高精度识别',
    category: 'general',
    category_display: '通用识别',
    description: '高精度文字识别',
    example_json: '{"words_result":[{"words":"百度OCR","probability":0.999}]}',
  },
  {
    type_code: 'table_ocr',
    type_name: '表格识别',
    category: 'general',
    category_display: '通用识别',
    description: '表格文字识别',
    example_json: '{"table_count":1,"tables":[{"header":[{"word":"姓名"}],"body":[{"word":"张三"}]}]}',
  },
  {
    type_code: 'qrcode',
    type_name: '二维码识别',
    category: 'general',
    category_display: '通用识别',
    description: '二维码/条形码识别',
    example_json: '{"codes_result":[{"type":"qrcode","text":"https://www.baidu.com"}]}',
  },
  {
    type_code: 'seal',
    type_name: '印章识别',
    category: 'general',
    category_display: '通用识别',
    description: '印章检测识别',
    example_json: '{"words_result":[{"words":"北京XX科技有限公司","probability":0.99}]}',
  },
  */

  // ===== 其他场景 =====
  // TODO: 暂时屏蔽其他场景类识别能力
  /*
  {
    type_code: 'meter',
    type_name: '仪器仪表盘读数',
    category: 'other',
    category_display: '其他场景',
    description: '血糖仪、血压仪等读数',
    example_json: '{"readings":[{"value":"120","label":"高压"},{"value":"80","label":"低压"}]}',
  },
  {
    type_code: 'door_plate',
    type_name: '门脸文字',
    category: 'other',
    category_display: '其他场景',
    description: '店铺门脸文字',
    example_json: '{"texts":[{"text":"星巴克咖啡"}]}',
  },
  */
];

/** 按 type_code 查找类型定义 */
export function findReceiptType(typeCode: string): ReceiptType | undefined {
  return RECEIPT_TYPES.find((t) => t.type_code === typeCode);
}

/** 获取所有大类列表（去重） */
export function getCategories(): { category: string; category_display: string }[] {
  const map = new Map<string, string>();
  for (const t of RECEIPT_TYPES) {
    if (!map.has(t.category)) {
      map.set(t.category, t.category_display);
    }
  }
  return Array.from(map.entries()).map(([category, category_display]) => ({ category, category_display }));
}

/** 按大类获取该类下所有小类 */
export function getTypesByCategory(category: string): ReceiptType[] {
  return RECEIPT_TYPES.filter((t) => t.category === category);
}
