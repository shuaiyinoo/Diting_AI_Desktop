import { toast } from 'vue-sonner'

/**
 * useToast — 兼容 ant-design-vue message API 的 toast 封装
 *
 * 用法：
 *   const { toast: t } = useToast()
 *   t.success('操作成功')
 *   t.error('操作失败')
 *   t.warning('警告信息')
 *   t.loading('加载中...')
 *
 * 也可直接使用：
 *   import { toast } from 'vue-sonner'
 *   toast.success('xxx')
 */

export function useToast() {
  return {
    toast: {
      success: (message, options) => toast.success(message, options),
      error: (message, options) => toast.error(message, options),
      warning: (message, options) => toast.warning(message, options),
      info: (message, options) => toast.info(message, options),
      loading: (message, options) => toast.loading(message, options),
      message: (message, options) => toast(message, options),
    },
    raw: toast,
  }
}

export { toast }
