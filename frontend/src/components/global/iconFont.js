import { h } from 'vue'
import { Wind } from '@lucide/vue'

// 原 iconFont 组件已移除（依赖 ant-design-icons-vue 的 createFromIconfontCN）
// 替换为 Lucide 图标，默认使用 Wind（风车）图标
const DynamicIconFont = (props) => {
  return h(Wind, { size: props.size || 18, class: props.class })
}

export default DynamicIconFont
