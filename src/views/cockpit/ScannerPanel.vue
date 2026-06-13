<template>
  <div class="scanner-panel">
    <!-- Panel header -->
    <div class="panel-header">
      <span class="panel-dot" :style="{ background: dotColor }"></span>
      <span class="panel-title">{{ title }}</span>
      <span v-if="count !== null" class="panel-count">{{ count }}</span>
      <div class="panel-header-right">
        <slot name="header-extra" />
        <a-button
          size="small"
          type="link"
          :loading="loading"
          class="refresh-btn"
          @click="$emit('refresh')"
        >
          <a-icon type="reload" />
        </a-button>
      </div>
    </div>

    <!-- Table -->
    <div class="panel-body">
      <a-table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        :row-key="rowKey"
        size="small"
        :scroll="{ y: tableHeight }"
        :locale="{ emptyText: loading ? 'Loading…' : emptyText }"
        :custom-row="makeRow"
        :row-class-name="rowClass"
      />
    </div>
  </div>
</template>

<script>
export default {
  name: 'ScannerPanel',
  props: {
    title:          { type: String,  default: 'Scanner' },
    dotColor:       { type: String,  default: '#52c41a' },
    columns:        { type: Array,   default: () => [] },
    rows:           { type: Array,   default: () => [] },
    loading:        { type: Boolean, default: false },
    selectedTicker: { type: String,  default: '' },
    emptyText:      { type: String,  default: 'No data' },
    rowKey:         { type: String,  default: 'ticker' },
    tableHeight:    { type: Number,  default: 300 }
  },
  computed: {
    count () { return this.rows.length || null }
  },
  methods: {
    makeRow (record) {
      return {
        style: { cursor: 'pointer' },
        on: { click: () => this.$emit('select', record.ticker) }
      }
    },
    rowClass (record) {
      return this.selectedTicker === record.ticker ? 'row-selected' : ''
    }
  }
}
</script>

<style scoped>
.scanner-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--panel-bg, #fff);
}

/* ── Header ── */
.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--panel-header-bg, #fafafa);
  border-bottom: 1px solid var(--panel-border, #e8e8e8);
  flex-shrink: 0;
  min-height: 28px;
}
.panel-dot {
  width: 8px; height: 8px;
  border-radius: 50%; flex-shrink: 0;
}
.panel-title {
  font-size: 12px; font-weight: 600;
  letter-spacing: 0.02em; color: var(--panel-title-color, #333);
  flex-shrink: 0;
}
.panel-count {
  font-size: 11px; color: #999;
  background: #f0f0f0; border-radius: 8px;
  padding: 0 5px; line-height: 16px;
  flex-shrink: 0;
}
.panel-header-right {
  margin-left: auto; display: flex; align-items: center; gap: 4px;
}
.refresh-btn { padding: 0 2px; height: 20px; color: #999; }
.refresh-btn:hover { color: #1890ff; }

/* ── Body ── */
.panel-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.panel-body :deep(.ant-table-wrapper) { flex: 1; overflow: hidden; }
.panel-body :deep(.ant-table-thead > tr > th) {
  padding: 4px 6px;
  font-size: 11px;
  font-weight: 600;
  background: var(--panel-thead-bg, #f5f5f5);
  color: #666;
  border-bottom: 1px solid var(--panel-border, #e8e8e8);
}
.panel-body :deep(.ant-table-tbody > tr > td) {
  padding: 3px 6px;
  font-size: 11px;
  border-bottom: 1px solid var(--panel-border-light, #f5f5f5);
}
.panel-body :deep(.ant-table-tbody > tr:hover > td) {
  background: rgba(24,144,255,0.04) !important;
}
.panel-body :deep(.row-selected td) {
  background: rgba(24,144,255,0.08) !important;
}
</style>
