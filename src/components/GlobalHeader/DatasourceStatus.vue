<template>
  <a-tooltip :title="tooltipText">
    <span :class="[prefixCls, dsClass]" @click="refresh">
      {{ label }}
    </span>
  </a-tooltip>
</template>

<script>
import { getDatasourceStatus } from '@/api/datasource'

export default {
  name: 'DatasourceStatus',
  props: {
    prefixCls: {
      type: String,
      default: 'ant-pro-global-header-index-action'
    }
  },
  data () {
    return {
      active: 'unknown',
      polygonConfigured: false,
      alpacaConfigured: false
    }
  },
  computed: {
    label () {
      const map = { polygon: 'Polygon', alpaca: 'Alpaca', yfinance: 'YFinance', unknown: '...' }
      return map[this.active] || this.active
    },
    dsClass () {
      return `ds-${this.active}`
    },
    tooltipText () {
      if (this.active === 'polygon') return 'Data source: Polygon.io'
      if (this.active === 'alpaca') return 'Data source: Alpaca'
      if (this.active === 'yfinance') return 'Data source: yfinance (free)'
      return 'Checking data source...'
    }
  },
  mounted () {
    this.refresh()
  },
  methods: {
    async refresh () {
      try {
        const res = await getDatasourceStatus()
        if (res && res.success && res.data) {
          this.active = res.data.active || 'unknown'
          this.polygonConfigured = res.data.polygon_configured
          this.alpacaConfigured = res.data.alpaca_configured
        }
      } catch (_) {
        this.active = 'unknown'
      }
    }
  }
}
</script>

<style scoped>
.ds-polygon  { color: #a78bfa !important; }
.ds-alpaca   { color: #69c0ff !important; }
.ds-yfinance { color: #999 !important; }
.ds-unknown  { color: #666 !important; }
</style>
