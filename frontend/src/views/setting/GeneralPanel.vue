<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">{{ t('general.title') }}</h3>
    <div class="mt-4 rounded-lg border border-border bg-card shadow-sm">
      <div class="flex items-center border-b border-border px-4 py-2.5">
        <label class="w-[100px] shrink-0 text-xs text-muted-foreground">{{ t('general.appName') }}</label>
        <span class="text-xs text-foreground">Diting</span>
      </div>
      <div class="flex items-center px-4 py-2.5">
        <label class="w-[100px] shrink-0 text-xs text-muted-foreground">{{ t('general.version') }}</label>
        <span class="text-xs text-foreground">v5.0.0</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
