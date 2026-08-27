<script setup>
import { computed } from 'vue'
import { SelectRoot } from 'reka-ui'

const props = defineProps({
  disabled: { type: Boolean, default: false },
})
const emits = defineEmits(['update:open'])
const modelValue = defineModel()

// reka-ui SelectRoot 不允许 null 作为 modelValue，转换为 undefined 以显示 placeholder
const safeModelValue = computed(() =>
  modelValue.value === null || modelValue.value === '' ? undefined : modelValue.value
)

function handleUpdate(value) {
  modelValue.value = value ?? null
}
</script>

<template>
  <SelectRoot
    :model-value="safeModelValue"
    :disabled="props.disabled"
    @update:model-value="handleUpdate"
    @update:open="emits('update:open', $event)"
  >
    <slot />
  </SelectRoot>
</template>
