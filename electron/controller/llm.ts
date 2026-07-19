import { llmdbService } from '../service/database/llmdb';
import type {
  LlmModelRecord,
  LlmProvider,
  UpsertLlmModelParams,
} from '../service/database/llmdb';
import { logger } from 'ee-core/log';

/**
 * LLM 模型管理控制器
 *
 * 提供 LLM 语义模型配置的增删改查 API，供前端"模型"设置界面调用。
 * 所有配置持久化到 SQLite 数据库，同一时间只能启用一个模型。
 */
interface LlmModelArgs {
  action: 'list' | 'get' | 'add' | 'update' | 'delete' | 'enable' | 'disable' | 'getEnabled' | 'test';
  id?: number;
  params?: Partial<UpsertLlmModelParams>;
}

interface LlmModelResult {
  action: string;
  code: number;
  message?: string;
  data?: LlmModelRecord | LlmModelRecord[] | null;
  testResult?: { success: boolean; message: string; latencyMs: number };
}

class LlmController {
  /**
   * LLM 模型操作
   * @param args.action 操作类型
   * @param args.id 模型 ID（get/update/delete/enable/disable/test 时需要）
   * @param args.params 模型参数（add/update 时需要）
   */
  async modelOperation(args: LlmModelArgs): Promise<LlmModelResult> {
    const { action, id, params } = args;
    logger.info(`[LlmController] modelOperation: action=${action}, id=${id ?? '-'}`);

    try {
      switch (action) {
        case 'list': {
          const list = llmdbService.getAllModels();
          return { action, code: 0, data: list };
        }

        case 'getEnabled': {
          const model = llmdbService.getEnabledModel();
          return { action, code: 0, data: model };
        }

        case 'get': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          const model = llmdbService.getModelById(id);
          return { action, code: 0, data: model };
        }

        case 'add': {
          if (!params || !params.name || !params.model_name) {
            return { action, code: -1, message: '缺少必要参数（name, model_name）' };
          }
          const newId = llmdbService.addModel({
            name: params.name,
            provider: (params.provider as LlmProvider) || 'openai',
            base_url: params.base_url || '',
            api_key: params.api_key || '',
            model_name: params.model_name,
            temperature: params.temperature,
            max_tokens: params.max_tokens,
            remark: params.remark,
          });
          const model = llmdbService.getModelById(newId);
          return { action, code: 0, data: model ?? undefined, message: '添加成功' };
        }

        case 'update': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          if (!params) return { action, code: -1, message: '缺少 params 参数' };
          const ok = llmdbService.updateModel(id, params);
          const model = llmdbService.getModelById(id);
          return { action, code: ok ? 0 : -1, data: model ?? undefined, message: ok ? '更新成功' : '更新失败' };
        }

        case 'delete': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          const ok = llmdbService.deleteModel(id);
          return { action, code: ok ? 0 : -1, message: ok ? '删除成功' : '删除失败' };
        }

        case 'enable': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          const ok = llmdbService.enableModel(id);
          const model = llmdbService.getModelById(id);
          return { action, code: ok ? 0 : -1, data: model ?? undefined, message: ok ? '启用成功' : '启用失败（模型不存在）' };
        }

        case 'disable': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          const ok = llmdbService.disableModel(id);
          return { action, code: ok ? 0 : -1, message: ok ? '禁用成功' : '禁用失败' };
        }

        case 'test': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          const testResult = await llmdbService.testModel(id);
          return { action, code: 0, testResult };
        }

        default:
          return { action, code: -1, message: `未知操作: ${action}` };
      }
    } catch (error: any) {
      logger.error(`[LlmController] modelOperation 异常:`, error);
      return {
        action,
        code: -1,
        message: `操作失败: ${error?.message || String(error)}`,
      };
    }
  }
}

export default LlmController;
