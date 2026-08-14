<script setup>
import {
  AlertDialogContent,
  AlertDialogOverlay, AlertDialogPortal,
} from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps({})
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay
      class="fixed inset-0 z-[9998] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <AlertDialogContent
      v-bind="props"
      :class="cn(
        'fixed left-[50%] top-[50%] z-[9999] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
        props.class
      )"
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
