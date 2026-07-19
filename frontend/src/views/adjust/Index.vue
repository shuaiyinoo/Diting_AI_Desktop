<template>
  <div class="llm-model-page">
    <!-- 顶部说明 -->
    <a-card class="header-card" :bordered="false">
      <div class="header-row">
        <div class="header-info">
          <h2 class="header-title">
            <RobotFilled class="header-icon" />
            语义模型配置
          </h2>
          <p class="header-desc">
            配置大语言模型（LLM）用于智能问答与语义检索。同一时间只能启用一个模型。
          </p>
        </div>
        <a-button type="primary" @click="openAddModal">
          <PlusOutlined />
          添加模型
        </a-button>
      </div>

      <!-- 当前启用模型状态 -->
      <div class="active-model-bar" v-if="enabledModel">
        <a-tag color="success" class="active-tag">
          <CheckCircleFilled />
          当前启用
        </a-tag>
        <span class="active-name">{{ enabledModel.name }}</span>
        <span class="active-meta">
          {{ providerLabel(enabledModel.provider) }} · {{ enabledModel.model_name }}
        </span>
      </div>
      <div class="active-model-bar inactive" v-else>
        <a-tag color="default">
          <ExclamationCircleFilled />
          未启用
        </a-tag>
        <span class="active-name" style="color: #999;">尚未启用任何模型，请添加并启用一个模型</span>
      </div>
    </a-card>

    <!-- 模型列表表格 -->
    <a-card class="table-card" :bordered="false">
      <a-table
        :columns="columns"
        :data-source="modelList"
        :pagination="false"
        :loading="loading"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <!-- 启用状态 -->
          <template v-if="column.key === 'enabled'">
            <a-tag v-if="record.enabled === 1" color="success">已启用</a-tag>
            <a-tag v-else color="default">未启用</a-tag>
          </template>

          <!-- 提供商 -->
          <template v-if="column.key === 'provider'">
            {{ providerLabel(record.provider) }}
          </template>

          <!-- API 地址 -->
          <template v-if="column.key === 'base_url'">
            <a-tooltip :title="record.base_url">
              <span class="url-cell">{{ record.base_url || '(未设置)' }}</span>
            </a-tooltip>
          </template>

          <!-- API Key -->
          <template v-if="column.key === 'api_key'">
            <span class="key-cell">{{ maskKey(record.api_key) }}</span>
          </template>

          <!-- 温度 -->
          <template v-if="column.key === 'temperature'">
            {{ record.temperature }}
          </template>

          <!-- 操作 -->
          <template v-if="column.key === 'action'">
            <a-space>
              <a-button
                v-if="record.enabled !== 1"
                type="link"
                size="small"
                @click="handleEnable(record)"
              >
                启用
              </a-button>
              <a-button
                v-else
                type="link"
                size="small"
                danger
                @click="handleDisable(record)"
              >
                禁用
              </a-button>
              <a-button type="link" size="small" @click="handleTest(record)" :loading="testingId === record.id">
                测试
              </a-button>
              <a-button type="link" size="small" @click="openEditModal(record)">编辑</a-button>
              <a-popconfirm title="确定删除此模型配置吗？" @confirm="handleDelete(record)">
                <a-button type="link" size="small" danger>删除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 添加/编辑模型弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingModel ? '编辑模型' : '添加模型'"
      :confirm-loading="submitting"
      width="640px"
      @ok="handleSubmit"
      @cancel="modalVisible = false"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        layout="vertical"
      >
        <a-form-item label="模型别名" name="name" required>
          <a-input
            v-model:value="formData.name"
            placeholder="如：我的GPT-4o、DeepSeek生产环境"
          />
        </a-form-item>

        <a-form-item label="接口提供商" name="provider">
          <a-select v-model:value="formData.provider" placeholder="选择提供商类型">
            <a-select-option value="openai">OpenAI 兼容（OpenAI / DeepSeek / Moonshot / Qwen 等）</a-select-option>
            <a-select-option value="anthropic">Anthropic Claude</a-select-option>
            <a-select-option value="google">Google Gemini</a-select-option>
            <a-select-option value="custom">自定义</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item label="API 地址 (Base URL)" name="base_url">
          <a-input
            v-model:value="formData.base_url"
            placeholder="如：https://api.openai.com/v1"
          />
          <template #extra>
            <span class="form-tip">不含 /chat/completions 后缀。常见地址：</span>
            <div class="url-presets">
              <a-button size="small" type="link" @click="formData.base_url = 'https://api.openai.com/v1'">OpenAI</a-button>
              <a-button size="small" type="link" @click="formData.base_url = 'https://api.deepseek.com/v1'">DeepSeek</a-button>
              <a-button size="small" type="link" @click="formData.base_url = 'https://api.moonshot.cn/v1'">Moonshot</a-button>
              <a-button size="small" type="link" @click="formData.base_url = 'https://dashscope.aliyuncs.com/compatible-mode/v1'">通义千问</a-button>
              <a-button size="small" type="link" @click="formData.base_url = 'https://api.siliconflow.cn/v1'">硅基流动</a-button>
            </div>
          </template>
        </a-form-item>

        <a-form-item label="API Key" name="api_key">
          <a-input-password
            v-model:value="formData.api_key"
            placeholder="sk-..."
            autocomplete="new-password"
          />
        </a-form-item>

        <a-form-item label="模型名称" name="model_name" required>
          <a-input
            v-model:value="formData.model_name"
            placeholder="如：gpt-4o、deepseek-chat、claude-3-5-sonnet-20241022"
          />
          <template #extra>
            <span class="form-tip">常见模型名：</span>
            <div class="url-presets">
              <a-button size="small" type="link" @click="formData.model_name = 'gpt-4o'">gpt-4o</a-button>
              <a-button size="small" type="link" @click="formData.model_name = 'gpt-4o-mini'">gpt-4o-mini</a-button>
              <a-button size="small" type="link" @click="formData.model_name = 'deepseek-chat'">deepseek-chat</a-button>
              <a-button size="small" type="link" @click="formData.model_name = 'deepseek-reasoner'">deepseek-reasoner</a-button>
              <a-button size="small" type="link" @click="formData.model_name = 'moonshot-v1-8k'">moonshot-v1-8k</a-button>
              <a-button size="small" type="link" @click="formData.model_name = 'qwen-plus'">qwen-plus</a-button>
            </div>
          </template>
        </a-form-item>

        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="温度 (Temperature)" name="temperature">
              <a-input-number
                v-model:value="formData.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                style="width: 100%"
              />
              <template #extra>
                <span class="form-tip">0=精确，2=创造性，默认 0.7</span>
              </template>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="最大输出 Token" name="max_tokens">
              <a-input-number
                v-model:value="formData.max_tokens"
                :min="1"
                :max="128000"
                :step="256"
                style="width: 100%"
              />
              <template #extra>
                <span class="form-tip">默认 4096</span>
              </template>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="备注" name="remark">
          <a-textarea
            v-model:value="formData.remark"
            :rows="2"
            placeholder="可选，如：用于代码生成 / 用于文档总结"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 测试结果弹窗 -->
    <a-modal
      v-model:open="testResultVisible"
      title="连通性测试结果"
      :footer="null"
      width="480px"
    >
      <div class="test-result" v-if="testResult">
        <a-result
          :status="testResult.success ? 'success' : 'error'"
          :title="testResult.success ? '连接成功' : '连接失败'"
          :sub-title="testResult.message"
        >
          <template #extra>
            <div class="test-latency" v-if="testResult.success">
              延迟：{{ testResult.latencyMs }}ms
            </div>
          </template>
        </a-result>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  RobotFilled,
} from '@ant-design/icons-vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';

const loading = ref(false);
const submitting = ref(false);
const testingId = ref(null);
const modalVisible = ref(false);
const testResultVisible = ref(false);
const editingModel = ref(null);
const modelList = ref([]);
const enabledModel = ref(null);
const testResult = ref(null);
const formRef = ref();

const formData = reactive({
  name: '',
  provider: 'openai',
  base_url: '',
  api_key: '',
  model_name: '',
  temperature: 0.7,
  max_tokens: 4096,
  remark: '',
});

const formRules = {
  name: [{ required: true, message: '请输入模型别名' }],
  model_name: [{ required: true, message: '请输入模型名称' }],
};

const columns = [
  { title: '状态', key: 'enabled', width: 90 },
  { title: '别名', dataIndex: 'name', key: 'name', width: 160 },
  { title: '提供商', key: 'provider', width: 130 },
  { title: '模型名称', dataIndex: 'model_name', key: 'model_name', width: 200 },
  { title: 'API 地址', key: 'base_url', ellipsis: true },
  { title: 'API Key', key: 'api_key', width: 140 },
  { title: '温度', key: 'temperature', width: 70 },
  { title: '操作', key: 'action', width: 260, fixed: 'right' },
];

onMounted(() => {
  fetchModels();
});

async function fetchModels() {
  loading.value = true;
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'list' });
    if (res.code === 0) {
      modelList.value = res.data || [];
      enabledModel.value = modelList.value.find(m => m.enabled === 1) || null;
    } else {
      message.error(res.message || '获取模型列表失败');
    }
  } catch (err) {
    message.error('获取模型列表异常: ' + (err?.message || err));
  } finally {
    loading.value = false;
  }
}

function providerLabel(provider) {
  const map = {
    openai: 'OpenAI 兼容',
    anthropic: 'Anthropic',
    google: 'Google',
    custom: '自定义',
  };
  return map[provider] || provider;
}

function maskKey(key) {
  if (!key) return '(未设置)';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

function openAddModal() {
  editingModel.value = null;
  Object.assign(formData, {
    name: '',
    provider: 'openai',
    base_url: '',
    api_key: '',
    model_name: '',
    temperature: 0.7,
    max_tokens: 4096,
    remark: '',
  });
  modalVisible.value = true;
}

function openEditModal(record) {
  editingModel.value = record;
  Object.assign(formData, {
    name: record.name,
    provider: record.provider,
    base_url: record.base_url,
    api_key: record.api_key,
    model_name: record.model_name,
    temperature: record.temperature,
    max_tokens: record.max_tokens,
    remark: record.remark || '',
  });
  modalVisible.value = true;
}

async function handleSubmit() {
  try {
    await formRef.value.validateFields();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    const params = {
      name: formData.name,
      provider: formData.provider,
      base_url: formData.base_url,
      api_key: formData.api_key,
      model_name: formData.model_name,
      temperature: Number(formData.temperature),
      max_tokens: Number(formData.max_tokens),
      remark: formData.remark,
    };

    let res;
    if (editingModel.value) {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
        action: 'update',
        id: editingModel.value.id,
        params,
      });
    } else {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
        action: 'add',
        params,
      });
    }

    if (res.code === 0) {
      message.success(res.message || (editingModel.value ? '更新成功' : '添加成功'));
      modalVisible.value = false;
      fetchModels();
    } else {
      message.error(res.message || '操作失败');
    }
  } catch (err) {
    message.error('操作异常: ' + (err?.message || err));
  } finally {
    submitting.value = false;
  }
}

async function handleEnable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
      action: 'enable',
      id: record.id,
    });
    if (res.code === 0) {
      message.success(`已启用: ${record.name}`);
      fetchModels();
    } else {
      message.error(res.message || '启用失败');
    }
  } catch (err) {
    message.error('启用异常: ' + (err?.message || err));
  }
}

async function handleDisable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
      action: 'disable',
      id: record.id,
    });
    if (res.code === 0) {
      message.success(`已禁用: ${record.name}`);
      fetchModels();
    } else {
      message.error(res.message || '禁用失败');
    }
  } catch (err) {
    message.error('禁用异常: ' + (err?.message || err));
  }
}

async function handleDelete(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
      action: 'delete',
      id: record.id,
    });
    if (res.code === 0) {
      message.success('删除成功');
      fetchModels();
    } else {
      message.error(res.message || '删除失败');
    }
  } catch (err) {
    message.error('删除异常: ' + (err?.message || err));
  }
}

async function handleTest(record) {
  testingId.value = record.id;
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
      action: 'test',
      id: record.id,
    });
    if (res.code === 0 && res.testResult) {
      testResult.value = res.testResult;
      testResultVisible.value = true;
    } else {
      message.error(res.message || '测试失败');
    }
  } catch (err) {
    message.error('测试异常: ' + (err?.message || err));
  } finally {
    testingId.value = null;
  }
}
</script>

<style lang="less" scoped>
.llm-model-page {
  height: 100%;
  overflow: auto;
  padding: 16px;
  background: #f5f6f8;
}

.header-card {
  margin-bottom: 12px;
  border-radius: 8px;

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .header-info {
    flex: 1;
  }

  .header-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 6px 0;
    display: flex;
    align-items: center;
    gap: 8px;

    .header-icon {
      color: #1677ff;
    }
  }

  .header-desc {
    color: #888;
    font-size: 13px;
    margin: 0;
  }
}

.active-model-bar {
  margin-top: 14px;
  padding: 10px 14px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 10px;

  &.inactive {
    background: #fffbe6;
    border-color: #ffe58f;
  }

  .active-tag {
    margin: 0;
  }

  .active-name {
    font-weight: 600;
    font-size: 14px;
  }

  .active-meta {
    color: #888;
    font-size: 13px;
  }
}

.table-card {
  border-radius: 8px;
}

.url-cell,
.key-cell {
  color: #666;
  font-size: 13px;
  font-family: 'SF Mono', Monaco, monospace;
}

.form-tip {
  color: #999;
  font-size: 12px;
}

.url-presets {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 0;

  :deep(.ant-btn) {
    padding: 0 8px;
    font-size: 12px;
    height: 22px;
  }
}

.test-latency {
  color: #52c41a;
  font-size: 14px;
  margin-top: 8px;
}
</style>
