<script setup>
import { SelectRoot } from 'reka-ui'

const props = defineProps({
  disabled: { type: Boolean, default: false },
})
const emits = defineEmits(['update:open'])
const modelValue = defineModel()
</script>

<template>
  <SelectRoot
    v-model="modelValue"
    :disabled="props.disabled"
    @update:open="emits('update:open', $event)"
  >
    <slot />
  </SelectRoot>
</template>
