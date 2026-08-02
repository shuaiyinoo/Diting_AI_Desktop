<template>
  <div class="setting-workspace" ref="workspaceRef">
    <!-- ========== 第二部分：设置菜单 ========== -->
    <div class="panel panel--sidebar" :style="{ width: panel2Width + 'px', flexShrink: 0 }">
      <div class="panel__toolbar">
        <span class="panel__path">设置</span>
      </div>
      <div class="panel__body">
        <button
          v-for="item in settingTabs"
          :key="item.key"
          class="setting-nav-item"
          :class="{ 'setting-nav-item--active': activeTab === item.key }"
          @click="onTabChange(item.key)"
        >
          <component :is="item.icon" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>

    <!-- 分隔条 -->
    <PanelDivider @resize="onPanel2Resize" />

    <!-- ========== 第三部分：设置内容区 ========== -->
    <div class="panel panel--content">
      <div class="panel__toolbar">
        <span class="panel__path">{{ currentTabLabel }}</span>
      </div>

      <div class="panel__body panel__body--scroll">
        <!-- ===== 模型管理 ===== -->
        <div v-if="activeTab === 'model'" class="setting-section setting-section--full">
          <div class="model-header">
            <div class="model-header__info">
              <h3 class="setting-section__title">
                <RobotFilled class="model-header__icon" />
                语义模型配置
              </h3>
              <p class="setting-section__desc">配置大语言模型（LLM）用于智能问答与语义检索。同一时间只能启用一个模型。</p>
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
            <span class="active-name inactive-text">尚未启用任何模型，请添加并启用一个模型</span>
          </div>

          <!-- 模型列表表格 -->
          <a-table
            :columns="modelColumns"
            :data-source="modelList"
            :pagination="false"
            :loading="modelLoading"
            row-key="id"
            size="small"
            class="model-table"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'enabled'">
                <a-tag v-if="record.enabled === 1" color="success">已启用</a-tag>
                <a-tag v-else color="default">未启用</a-tag>
              </template>
              <template v-if="column.key === 'provider'">
                {{ providerLabel(record.provider) }}
              </template>
              <template v-if="column.key === 'base_url'">
                <a-tooltip :title="record.base_url">
                  <span class="url-cell">{{ record.base_url || '(未设置)' }}</span>
                </a-tooltip>
              </template>
              <template v-if="column.key === 'api_key'">
                <span class="key-cell">{{ maskKey(record.api_key) }}</span>
              </template>
              <template v-if="column.key === 'action'">
                <a-space>
                  <a-button
                    v-if="record.enabled !== 1"
                    type="link"
                    size="small"
                    @click="handleEnable(record)"
                  >启用</a-button>
                  <a-button
                    v-else
                    type="link"
                    size="small"
                    danger
                    @click="handleDisable(record)"
                  >禁用</a-button>
                  <a-button type="link" size="small" :loading="testingId === record.id" @click="handleTest(record)">测试</a-button>
                  <a-button type="link" size="small" @click="openEditModal(record)">编辑</a-button>
                  <a-popconfirm title="确定删除此模型配置吗？" @confirm="handleDelete(record)">
                    <a-button type="link" size="small" danger>删除</a-button>
                  </a-popconfirm>
                </a-space>
              </template>
            </template>
          </a-table>
        </div>

        <!-- Skills 管理 -->
        <div v-if="activeTab === 'skills'" class="setting-section">
          <h3 class="setting-section__title">Skills 管理</h3>
          <p class="setting-section__desc">管理 Agent 工作区的 Skills。Skills 是可复用的流程模板。</p>
          <div class="skill-list">
            <div v-for="skill in skills" :key="skill.slug" class="skill-card">
              <div class="skill-card__header">
                <span class="skill-card__name">{{ skill.name }}</span>
                <a-switch :checked="skill.enabled" size="small" @change="(v) => toggleSkill(skill.slug, v)" />
              </div>
              <p class="skill-card__desc">{{ skill.description || '无描述' }}</p>
              <div class="skill-card__meta">
                <span v-if="skill.version" class="skill-card__tag">v{{ skill.version }}</span>
                <span v-if="skill.group" class="skill-card__tag">{{ skill.group }}</span>
              </div>
            </div>
            <div v-if="skills.length === 0" class="setting-empty">暂无 Skills，请先创建工作区</div>
          </div>
        </div>

        <!-- MCP 管理 -->
        <div v-if="activeTab === 'mcp'" class="setting-section">
          <h3 class="setting-section__title">内置 MCP</h3>
          <p class="setting-section__desc">内置 MCP 服务器为 Agent 提供工具调用能力。</p>
          <div class="mcp-list">
            <div v-for="mcp in mcpServers" :key="mcp.id" class="mcp-card">
              <div class="mcp-card__header">
                <div>
                  <span class="mcp-card__name">{{ mcp.displayName }}</span>
                  <span class="mcp-card__id">{{ mcp.id }}</span>
                </div>
                <a-switch
                  :checked="mcp.enabled"
                  :disabled="!mcp.toggleable"
                  size="small"
                  @change="(v) => toggleMcp(mcp.id, v)"
                />
              </div>
              <p class="mcp-card__desc">{{ mcp.description }}</p>
              <div class="mcp-card__tools">
                <span v-for="tool in mcp.tools" :key="tool.name" class="mcp-card__tool">{{ tool.name }}</span>
              </div>
              <div v-if="!mcp.available && mcp.availabilityReason" class="mcp-card__warn">
                {{ mcp.availabilityReason }}
              </div>
            </div>
          </div>
        </div>

        <!-- 常规 -->
        <div v-if="activeTab === 'general'" class="setting-section">
          <h3 class="setting-section__title">常规</h3>
          <div class="setting-form">
            <div class="setting-form__row">
              <label class="setting-form__label">应用名称</label>
              <span class="setting-form__value">Diting AI</span>
            </div>
            <div class="setting-form__row">
              <label class="setting-form__label">版本</label>
              <span class="setting-form__value">v5.0.0</span>
            </div>
          </div>
        </div>

        <!-- 外观 -->
        <div v-if="activeTab === 'appearance'" class="setting-section">
          <h3 class="setting-section__title">外观</h3>
          <p class="setting-section__desc">自定义应用的视觉风格与 Markdown 渲染字号</p>
          <div class="appearance-card">
            <!-- Markdown 字号 -->
            <div class="appearance-row">
              <div class="appearance-row__info">
                <div class="appearance-row__label">Markdown 字号</div>
                <div class="appearance-row__desc">调整 AI 回复与 Markdown 内容的正文字号</div>
              </div>
              <div class="seg-control">
                <button
                  v-for="opt in fontSizeOptions"
                  :key="opt.value"
                  class="seg-control__btn"
                  :class="{ 'seg-control__btn--active': markdownFontSize === opt.value }"
                  @click="onFontSizeChange(opt.value)"
                >{{ opt.label }}</button>
              </div>
            </div>

            <!-- 主题 -->
            <div class="appearance-row">
              <div class="appearance-row__info">
                <div class="appearance-row__label">主题</div>
                <div class="appearance-row__desc">选择应用的配色方案</div>
              </div>
              <div class="seg-control">
                <button
                  v-for="opt in themeOptions"
                  :key="opt.value"
                  class="seg-control__btn"
                  :class="{ 'seg-control__btn--active': theme === opt.value }"
                  @click="theme = opt.value; onThemeChange()"
                >{{ opt.label }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 模型添加/编辑弹窗 ===== -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingModel ? '编辑模型' : '添加模型'"
      :confirm-loading="submitting"
      width="640px"
      @ok="handleSubmit"
      @cancel="modalVisible = false"
    >
      <a-form ref="formRef" :model="formData" :rules="formRules" layout="vertical">
        <a-form-item label="模型别名" name="name" required>
          <a-input v-model:value="formData.name" placeholder="如：我的GPT-4o、DeepSeek生产环境" />
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
          <a-input v-model:value="formData.base_url" placeholder="如：https://api.openai.com/v1" />
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
          <a-input-password v-model:value="formData.api_key" placeholder="sk-..." autocomplete="new-password" />
        </a-form-item>
        <a-form-item label="模型名称" name="model_name" required>
          <a-input v-model:value="formData.model_name" placeholder="如：gpt-4o、deepseek-chat、claude-3-5-sonnet-20241022" />
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
              <a-input-number v-model:value="formData.temperature" :min="0" :max="2" :step="0.1" style="width: 100%" />
              <template #extra>
                <span class="form-tip">0=精确，2=创造性，默认 0.7</span>
              </template>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="最大输出 Token" name="max_tokens">
              <a-input-number v-model:value="formData.max_tokens" :min="1" :max="128000" :step="256" style="width: 100%" />
              <template #extra>
                <span class="form-tip">默认 4096</span>
              </template>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注" name="remark">
          <a-textarea v-model:value="formData.remark" :rows="2" placeholder="可选，如：用于代码生成 / 用于文档总结" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 测试结果弹窗 -->
    <a-modal v-model:open="testResultVisible" title="连通性测试结果" :footer="null" width="480px">
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
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  SettingOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  BgColorsOutlined,
  RobotOutlined,
  RobotFilled,
  PlusOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
} from '@ant-design/icons-vue'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import PanelDivider from '@/components/layout/PanelDivider.vue'
import {
  FONT_SIZE_OPTIONS,
  getMarkdownFontSize,
  setMarkdownFontSize,
} from '@/utils/markdown-font-size'

// ========== 面板布局 ==========
const workspaceRef = ref(null)
const panel2Width = ref(200)
const activeTab = ref('model')
const theme = ref('light')
const markdownFontSize = ref('medium')

/** 主题选项 */
const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

/** Markdown 字号选项 */
const fontSizeOptions = FONT_SIZE_OPTIONS

const settingTabs = [
  { key: 'model', label: '模型管理', icon: RobotOutlined },
  { key: 'skills', label: 'Skills', icon: ThunderboltOutlined },
  { key: 'mcp', label: 'MCP 工具', icon: ApiOutlined },
  { key: 'general', label: '常规', icon: SettingOutlined },
  { key: 'appearance', label: '外观', icon: BgColorsOutlined },
]

const currentTabLabel = computed(() => settingTabs.find((t) => t.key === activeTab.value)?.label || '')

function onPanel2Resize(delta) {
  panel2Width.value = Math.min(280, Math.max(160, panel2Width.value + delta))
}

function onTabChange(key) {
  activeTab.value = key
  if (key === 'skills' && skills.value.length === 0) {
    loadSkills()
  }
}

// ========== Skills / MCP 数据 ==========
const skills = ref([])
const mcpServers = ref([])

onMounted(async () => {
  // 初始化 Markdown 字号
  markdownFontSize.value = getMarkdownFontSize()
  await loadMcpServers()
  await fetchModels()
})

async function loadMcpServers() {
  try {
    const res = await ipc.invoke('controller/piAgent/mcpOperation', { action: 'list' })
    if (res.code === 0 && res.data) mcpServers.value = res.data
  } catch (err) {
    console.error('加载 MCP 失败:', err)
  }
}

async function loadSkills() {
  try {
    const res = await ipc.invoke('controller/piAgent/skillsOperation', {
      action: 'list',
      workspaceSlug: 'default',
    })
    if (res.code === 0 && res.data) skills.value = res.data
  } catch (err) {
    console.error('加载 Skills 失败:', err)
  }
}

async function toggleMcp(id, enabled) {
  try {
    const res = await ipc.invoke('controller/piAgent/mcpOperation', { action: 'toggle', id, enabled })
    if (res.code === 0 && res.data) mcpServers.value = res.data
  } catch (err) {
    console.error('切换 MCP 失败:', err)
  }
}

async function toggleSkill(slug, enabled) {
  try {
    const res = await ipc.invoke('controller/piAgent/skillsOperation', {
      action: 'toggle',
      skillSlug: slug,
      enabled,
      workspaceSlug: 'default',
    })
    if (res.code === 0 && res.data) skills.value = res.data
  } catch (err) {
    console.error('切换 Skill 失败:', err)
  }
}

function onThemeChange() {
  document.documentElement.setAttribute('data-theme', theme.value)
}

/** 切换 Markdown 字号 */
function onFontSizeChange(size) {
  markdownFontSize.value = size
  setMarkdownFontSize(size)
}

// ========== 模型管理（移植自 adjust/Index.vue） ==========
const modelLoading = ref(false)
const submitting = ref(false)
const testingId = ref(null)
const modalVisible = ref(false)
const testResultVisible = ref(false)
const editingModel = ref(null)
const modelList = ref([])
const enabledModel = computed(() => modelList.value.find((m) => m.enabled === 1) || null)
const testResult = ref(null)
const formRef = ref()

const formData = reactive({
  name: '',
  provider: 'openai',
  base_url: '',
  api_key: '',
  model_name: '',
  temperature: 0.7,
  max_tokens: 4096,
  remark: '',
})

const formRules = {
  name: [{ required: true, message: '请输入模型别名' }],
  model_name: [{ required: true, message: '请输入模型名称' }],
}

const modelColumns = [
  { title: '状态', key: 'enabled', width: 80 },
  { title: '别名', dataIndex: 'name', key: 'name', width: 140 },
  { title: '提供商', key: 'provider', width: 120 },
  { title: '模型名称', dataIndex: 'model_name', key: 'model_name', width: 180 },
  { title: 'API 地址', key: 'base_url', ellipsis: true },
  { title: 'API Key', key: 'api_key', width: 130 },
  { title: '操作', key: 'action', width: 220, fixed: 'right' },
]

async function fetchModels() {
  modelLoading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'list' })
    if (res.code === 0) {
      modelList.value = res.data || []
    } else {
      message.error(res.message || '获取模型列表失败')
    }
  } catch (err) {
    message.error('获取模型列表异常: ' + (err?.message || err))
  } finally {
    modelLoading.value = false
  }
}

function providerLabel(provider) {
  const map = {
    openai: 'OpenAI 兼容',
    anthropic: 'Anthropic',
    google: 'Google',
    custom: '自定义',
  }
  return map[provider] || provider
}

function maskKey(key) {
  if (!key) return '(未设置)'
  if (key.length <= 8) return '****'
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
}

function openAddModal() {
  editingModel.value = null
  Object.assign(formData, {
    name: '',
    provider: 'openai',
    base_url: '',
    api_key: '',
    model_name: '',
    temperature: 0.7,
    max_tokens: 4096,
    remark: '',
  })
  modalVisible.value = true
}

function openEditModal(record) {
  editingModel.value = record
  Object.assign(formData, {
    name: record.name,
    provider: record.provider,
    base_url: record.base_url,
    api_key: record.api_key,
    model_name: record.model_name,
    temperature: record.temperature,
    max_tokens: record.max_tokens,
    remark: record.remark || '',
  })
  modalVisible.value = true
}

async function handleSubmit() {
  try {
    await formRef.value.validateFields()
  } catch {
    return
  }

  submitting.value = true
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
    }

    let res
    if (editingModel.value) {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
        action: 'update',
        id: editingModel.value.id,
        params,
      })
    } else {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
        action: 'add',
        params,
      })
    }

    if (res.code === 0) {
      message.success(res.message || (editingModel.value ? '更新成功' : '添加成功'))
      modalVisible.value = false
      fetchModels()
    } else {
      message.error(res.message || '操作失败')
    }
  } catch (err) {
    message.error('操作异常: ' + (err?.message || err))
  } finally {
    submitting.value = false
  }
}

async function handleEnable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
      action: 'enable',
      id: record.id,
    })
    if (res.code === 0) {
      message.success(`已启用: ${record.name}`)
      fetchModels()
    } else {
      message.error(res.message || '启用失败')
    }
  } catch (err) {
    message.error('启用异常: ' + (err?.message || err))
  }
}

async function handleDisable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
      action: 'disable',
      id: record.id,
    })
    if (res.code === 0) {
      message.success(`已禁用: ${record.name}`)
      fetchModels()
    } else {
      message.error(res.message || '禁用失败')
    }
  } catch (err) {
    message.error('禁用异常: ' + (err?.message || err))
  }
}

async function handleDelete(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
      action: 'delete',
      id: record.id,
    })
    if (res.code === 0) {
      message.success('删除成功')
      fetchModels()
    } else {
      message.error(res.message || '删除失败')
    }
  } catch (err) {
    message.error('删除异常: ' + (err?.message || err))
  }
}

async function handleTest(record) {
  testingId.value = record.id
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, {
      action: 'test',
      id: record.id,
    })
    if (res.code === 0 && res.testResult) {
      testResult.value = res.testResult
      testResultVisible.value = true
    } else {
      message.error(res.message || '测试失败')
    }
  } catch (err) {
    message.error('测试异常: ' + (err?.message || err))
  } finally {
    testingId.value = null
  }
}
</script>

<style lang="less" scoped>
.setting-workspace {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-panel);
}

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background-color: var(--bg-panel);

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
  }

  &__path {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px;
    min-height: 0;

    &--scroll {
      padding: 16px 20px;
    }
  }
}

.panel--sidebar {
  background-color: var(--bg-panel);
}

.panel--content {
  flex: 1;
  min-width: 300px;
}

// 设置导航项
.setting-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  transition: all 0.15s;
  width: 100%;
  text-align: left;
  margin-bottom: 2px;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  &--active {
    background-color: var(--bg-active);
    color: var(--accent);
    font-weight: 500;
  }
}

.setting-section {
  max-width: 640px;

  &--full {
    max-width: 100%;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 6px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__desc {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0 0 16px;
    line-height: 1.5;
  }
}

// ===== 模型管理 =====
.model-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;

  &__info {
    flex: 1;
  }

  &__icon {
    color: #1677ff;
  }
}

.active-model-bar {
  margin-bottom: 14px;
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

    &.inactive-text {
      color: #999;
      font-weight: 400;
    }
  }

  .active-meta {
    color: #888;
    font-size: 13px;
  }
}

.model-table {
  :deep(.ant-table) {
    font-size: 13px;
  }
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

// ===== Skills =====
.skill-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-card {
  background: var(--bg-panel);
  border-radius: 10px;
  padding: 12px;
  box-shadow: var(--shadow-sm);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  &__name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__desc {
    font-size: 11px;
    color: var(--text-muted);
    margin: 0 0 6px;
    line-height: 1.4;
  }

  &__meta {
    display: flex;
    gap: 6px;
  }

  &__tag {
    font-size: 10px;
    color: var(--text-muted);
    background: rgba(0, 0, 0, 0.04);
    padding: 2px 6px;
    border-radius: 4px;
  }
}

.setting-empty {
  text-align: center;
  padding: 32px;
  color: var(--text-muted);
  font-size: 12px;
}

// ===== MCP =====
.mcp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-card {
  background: var(--bg-panel);
  border-radius: 10px;
  padding: 12px;
  box-shadow: var(--shadow-sm);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  &__name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-right: 6px;
  }

  &__id {
    font-size: 10px;
    color: var(--text-muted);
  }

  &__desc {
    font-size: 11px;
    color: var(--text-muted);
    margin: 0 0 6px;
    line-height: 1.4;
  }

  &__tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  &__tool {
    font-size: 10px;
    color: var(--accent);
    background: rgba(22, 119, 255, 0.06);
    padding: 2px 6px;
    border-radius: 4px;
  }

  &__warn {
    margin-top: 6px;
    font-size: 11px;
    color: #faad14;
  }
}

// ===== 常规 / 外观 =====
.setting-form {
  &__row {
    display: flex;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--border-color);
  }

  &__label {
    width: 100px;
    font-size: 12px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  &__value {
    font-size: 12px;
    color: var(--text-primary);
  }
}

// ===== 外观设置卡片 =====
.appearance-card {
  background: var(--bg-panel);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.appearance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color-light);

  &:last-child {
    border-bottom: none;
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  &__desc {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 2px;
    line-height: 1.4;
  }
}

// 分段选择器（参考 Proma SettingsSegmentedControl 设计）
.seg-control {
  display: inline-flex;
  align-items: center;
  background: var(--bg-hover);
  border-radius: 8px;
  padding: 2px;
  gap: 0;
  flex-shrink: 0;

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    padding: 0 14px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;

    &:hover {
      color: var(--text-primary);
    }

    &--active {
      background: var(--bg-panel);
      color: var(--text-primary);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
  }
}
</style>
