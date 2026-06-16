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
      polygonAvailable: false
    }
  },
  computed: {
    label () {
      const map = { polygon: 'Polygon', yfinance: 'YFinance', unknown: '...' }
      return map[this.active] || this.active
    },
    dsClass () {
      return `ds-${this.active}`
    },
    tooltipText () {
      const lines = []
      if (this.active === 'polygon') lines.push('Data source: Polygon.io')
      else if (this.active === 'yfinance') lines.push('Data source: yfinance (free)')
      else return 'Checking data source...'

      if (this.polygonConfigured && !this.polygonAvailable) lines.push('Polygon: key set, module missing')
      return lines.join('\n')
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
          this.polygonAvailable = res.data.polygon_available
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
.ds-yfinance { color: #999 !important; }
.ds-unknown  { color: #666 !important; }
</style>
