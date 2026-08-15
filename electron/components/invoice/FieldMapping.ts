/**
 * 票据字段归一化映射配置
 *
 * 从 AI 提取的 structured_data（各类型异构 JSON）中提取通用字段，
 * 写入 invoice_record 表的归一化列，供跨类型查询、统计、搜索使用。
 *
 * 映射规则：每个通用字段对应一组候选 key，按优先级匹配第一个非空值。
 */

/** 通用归一化字段提取规则 */
interface FieldMappingRule {
  /** 通用字段名（对应 invoice_record 表列名） */
  field: string;
  /** 候选 key 列表（按优先级排序，匹配 structured_data 中的 key） */
  keys: string[];
}

/** 所有通用归一化字段的映射规则 */
export const FIELD_MAPPINGS: FieldMappingRule[] = [
  {
    field: 'invoice_number',
    keys: [
      'InvoiceNum', 'invoice_number', 'ticket_num', 'receipt_num',
      '流水号', '回单编号', '车票号', '小票号码', '证件编号',
      'ticket_number', 'serial_number',
    ],
  },
  {
    field: 'invoice_code',
    keys: ['InvoiceCode', 'invoice_code'],
  },
  {
    field: 'issue_date',
    keys: [
      'InvoiceDate', 'invoice_date', 'date', 'Date', '登记日期',
      'InvoiceDate', '签发日期', 'issue_date', 'ApplicationDate',
    ],
  },
  {
    field: 'amount_total',
    keys: [
      'AmountInFiguers', 'amount_total', 'Fare', 'TotalFare',
      'ticket_rates', '小写金额', 'total_amount', 'TotalCarPriceLow',
      'PriceTaxLow', 'total_excluding_tax',
    ],
  },
  {
    field: 'amount_tax',
    keys: ['TotalTax', 'Tax', 'total_tax', 'tax_amount'],
  },
  {
    field: 'payer_name',
    keys: [
      'PurchaserName', 'Purchaser', 'payer_name', 'name', 'Name',
      '姓名', '付款人户名', 'Purchaser', 'buyer_name',
    ],
  },
  {
    field: 'payee_name',
    keys: [
      'SellerName', 'Saler', 'payee_name', 'seller_name',
      '收款人户名', 'SellerName', 'Saler',
    ],
  },
  {
    field: 'province',
    keys: ['Province', 'province'],
  },
  {
    field: 'city',
    keys: ['City', 'city'],
  },
];

/**
 * 从 AI 提取的 structured_data 中提取归一化字段
 *
 * 处理逻辑：
 *   1. 遍历 FIELD_MAPPINGS 中每条规则
 *   2. 按候选 key 优先级在 structured_data 中查找
 *   3. 对于嵌套值（如 {word: "..."} 或 [{word: "..."}]）自动提取 word 属性
 *   4. 对于金额值，去除 ¥/元/, 等非数字字符，转为数值
 *   5. 返回归一化后的字段对象
 */
export function extractNormalizedFields(structuredData: Record<string, any>): Record<string, string | number | null> {
  const result: Record<string, string | number | null> = {};

  for (const rule of FIELD_MAPPINGS) {
    let value: string | null = null;

    for (const key of rule.keys) {
      const raw = structuredData[key];
      if (raw === null || raw === undefined) continue;

      // 处理 {word: "..."} 格式
      if (typeof raw === 'object' && !Array.isArray(raw) && raw.word) {
        value = String(raw.word);
        break;
      }
      // 处理 [{word: "..."}] 格式
      if (Array.isArray(raw) && raw.length > 0) {
        const first = raw[0];
        if (typeof first === 'object' && first.word) {
          value = String(first.word);
        } else if (typeof first === 'string') {
          value = first;
        }
        break;
      }
      // 处理简单值
      if (typeof raw === 'string' || typeof raw === 'number') {
        value = String(raw);
        break;
      }
    }

    // 金额字段转为数值
    if (value !== null && (rule.field === 'amount_total' || rule.field === 'amount_tax')) {
      const num = parseFloat(value.replace(/[¥￥元,/，\s]/g, ''));
      result[rule.field] = isNaN(num) ? null : Math.round(num * 100) / 100;
    } else {
      result[rule.field] = value;
    }
  }

  return result;
}
