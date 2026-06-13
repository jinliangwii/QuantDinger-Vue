<template>
  <div class="context-chart-root" :class="{ 'theme-dark': dark }">
    <!-- Panel header -->
    <div class="chart-header">
      <span class="chart-tf-badge">{{ timeframe.toUpperCase() }}</span>
      <span v-if="ticker" class="chart-ticker">{{ ticker }}</span>
      <span v-if="bias" class="chart-bias-dot" :style="{ background: bias.color }" :title="bias.label"></span>
      <span v-if="!ticker" class="chart-hint">select a ticker</span>
    </div>

    <!-- Bias banner -->
    <div v-if="bias" class="bias-bar" :style="{ borderLeftColor: bias.color }">
      <div class="bias-main">
        <span class="bias-dot" :style="{ background: bias.color }"></span>
        <strong class="bias-label">{{ bias.label }}</strong>
        <span class="bias-score">score {{ bias.score > 0 ? '+' : '' }}{{ bias.score }}</span>
      </div>
      <div class="bias-reasons">
        <span v-for="r in bias.reasons" :key="r" class="bias-reason">{{ r }}</span>
      </div>
    </div>

    <!-- Chart -->
    <div class="chart-wrap">
      <div ref="chartEl" class="kline-el"></div>
      <div v-if="loading" class="chart-overlay">
        <a-spin size="large" />
      </div>
      <div v-if="error && !loading" class="chart-overlay error-overlay">
        <a-icon type="warning" style="font-size: 28px; color: #ef5350; margin-bottom: 8px" />
        <span>{{ error }}</span>
      </div>
      <div v-if="!ticker && !loading" class="chart-overlay hint-overlay">
        <a-icon type="arrow-left" style="font-size: 28px; margin-bottom: 8px; opacity: 0.4" />
        <span>Select a ticker from the Watchlist</span>
      </div>
    </div>
  </div>
</template>

<script>
import { init, registerOverlay, registerIndicator } from 'klinecharts'
import { getContext } from '@/api/cockpit'

// ── Register custom overlays/indicators once at module level ──────────────────
let _registered = false
function ensureRegistered () {
  if (_registered) return
  _registered = true

  // VWAP as a price-pane indicator — reads pre-computed `vwap` from each bar
  try {
    registerIndicator({
      name: 'SENECA_VWAP',
      shortName: 'VWAP',
      series: 'price',
      figures: [{
        key: 'vwap',
        title: 'VWAP: ',
        type: 'line'
      }],
      calc (dataList) {
        return dataList.map(d => ({ vwap: (d.vwap != null && d.vwap > 0) ? d.vwap : null }))
      }
    })
  } catch (_) { /* already registered on hot-reload */ }

  // S/R level line with right-aligned label
  try {
    registerOverlay({
      name: 'srLevel',
      totalStep: 1,
      lock: true,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      checkEventOn: () => false,
      createPointFigures ({ coordinates, overlay, bounding }) {
        if (!coordinates || !coordinates[0]) return []
        const { color = '#888', label = '', dash = false, tier = 1 } = overlay.extendData || {}
        const y = coordinates[0].y
        const W = (bounding && bounding.width) ? bounding.width : 3000
        const lineW = tier === 1 ? 1.5 : 1

        return [
          {
            type: 'line',
            attrs: { coordinates: [{ x: 0, y }, { x: W, y }] },
            styles: {
              style: dash ? 'dashed' : 'solid',
              dashedValue: [6, 4],
              size: lineW,
              color
            },
            ignoreEvent: true
          },
          {
            type: 'text',
            attrs: { x: W - 6, y: y - 3, text: label, align: 'right', baseline: 'bottom' },
            styles: {
              color,
              size: 10,
              weight: tier === 1 ? 'bold' : 'normal',
              backgroundColor: 'transparent'
            },
            ignoreEvent: true
          }
        ]
      }
    })
  } catch (_) {}

  // Vertical divider at session open
  try {
    registerOverlay({
      name: 'sessionOpen',
      totalStep: 1,
      lock: true,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      checkEventOn: () => false,
      createPointFigures ({ coordinates, bounding }) {
        if (!coordinates || !coordinates[0]) return []
        const x = coordinates[0].x
        const H = (bounding && bounding.height) ? bounding.height : 3000

        return [
          {
            type: 'line',
            attrs: { coordinates: [{ x, y: 0 }, { x, y: H }] },
            styles: { style: 'dashed', dashedValue: [4, 4], size: 1, color: '#ffa726' },
            ignoreEvent: true
          },
          {
            type: 'text',
            attrs: { x: x + 4, y: 14, text: '9:30 Open', align: 'left', baseline: 'top' },
            styles: { color: '#ffa726', size: 10, weight: 'normal', backgroundColor: 'transparent' },
            ignoreEvent: true
          }
        ]
      }
    })
  } catch (_) {}
}

export default {
  name: 'ContextChart',
  props: {
    ticker:    { type: String, default: '' },
    date:      { type: String, default: '' },
    timeframe: { type: String, default: '1m' },
    dark:      { type: Boolean, default: false }
  },
  data () {
    return {
      loading: false,
      error: null,
      bias: null
    }
  },
  watch: {
    ticker (val)    { if (val) { this.load() } else { this.clearChart() } },
    date ()         { if (this.ticker) { this.load() } },
    timeframe ()    { if (this.ticker) { this.load() } }
  },
  mounted () {
    // Non-reactive instance properties (Vue 2 skips _ prefix in data())
    this.chart = null
    this.levelIds = []
    this.dividerIds = []

    ensureRegistered()
    this.chart = init(this.$refs.chartEl)
    this.chart.setPriceVolumePrecision(2, 0)
    if (this.dark) this._applyDarkTheme()
    if (this.ticker) this.load()
  },
  beforeDestroy () {
    if (this.chart) {
      try { this.chart.destroy() } catch (_) {}
      this.chart = null
    }
  },
  methods: {
    async load () {
      if (!this.ticker) return
      this.loading = true
      this.error = null
      this.bias = null

      try {
        const res = await getContext(this.ticker, { date: this.date || null, timeframe: this.timeframe })
        if (!res || !res.success) {
          this.error = (res && res.error) || 'Context fetch failed'
          return
        }
        this._applyContext(res.data)
      } catch (e) {
        this.error = e.message || 'Network error'
      } finally {
        this.loading = false
      }
    },

    _applyContext (ctx) {
      if (!this.chart) return
      const { candles, levels, bias, session_open_ms } = ctx

      this.bias = bias

      this.chart.applyNewData(candles)
      this.chart.setPriceVolumePrecision(2, 0)

      try { this.chart.createIndicator('VOL', false, { height: 72, minHeight: 40 }) } catch (_) {}
      try { this.chart.createIndicator('SENECA_VWAP', false, { id: 'candle_pane' }) } catch (_) {}

      this._clearOverlays()

      if (session_open_ms && candles.length) {
        const id = this.chart.createOverlay({
          name: 'sessionOpen',
          lock: true,
          points: [{ timestamp: session_open_ms, value: candles[0].close }],
          extendData: {}
        })
        if (id) this.dividerIds.push(id)
      }

      if (candles.length) {
        const anchorTs = candles[0].timestamp
        for (const lvl of levels) {
          const id = this.chart.createOverlay({
            name: 'srLevel',
            lock: true,
            points: [{ timestamp: anchorTs, value: lvl.price }],
            extendData: {
              color: lvl.color,
              label: `${lvl.label}  $${lvl.price.toFixed(2)}`,
              dash:  lvl.dash,
              tier:  lvl.tier
            }
          })
          if (id) this.levelIds.push(id)
        }
      }
    },

    _clearOverlays () {
      const remove = (id) => {
        try { this.chart.removeOverlay(id) } catch (_) {}
      }
      this.levelIds.forEach(remove)
      this.dividerIds.forEach(remove)
      this.levelIds = []
      this.dividerIds = []
    },

    clearChart () {
      this.bias = null
      this.error = null
      this._clearOverlays()
      if (this.chart) {
        try { this.chart.applyNewData([]) } catch (_) {}
      }
    },

    _applyDarkTheme () {
      if (!this.chart) return
      try {
        this.chart.setStyles({
          grid: { horizontal: { color: 'rgba(255,255,255,0.06)' }, vertical: { color: 'rgba(255,255,255,0.04)' } },
          candle: {
            bar: { upColor: '#26a69a', downColor: '#ef5350', noChangeColor: '#888' },
            tooltip: { text: { color: '#d1d4dc' } }
          },
          xAxis: { axisLine: { color: '#333' }, tickLine: { color: '#333' }, tickText: { color: '#888' } },
          yAxis: { axisLine: { color: '#333' }, tickLine: { color: '#333' }, tickText: { color: '#888' } }
        })
      } catch (_) {}
    }
  }
}
</script>

<style scoped>
.context-chart-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 180px;
}

/* ── Chart panel header ── */
.chart-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
  min-height: 26px;
}
.theme-dark .chart-header { background: #1a1a1a; border-color: #333; }
.chart-tf-badge {
  font-size: 11px; font-weight: 700;
  color: #1890ff;
  background: rgba(24,144,255,0.1);
  padding: 1px 5px; border-radius: 3px;
}
.chart-ticker { font-size: 12px; font-weight: 600; color: #333; }
.theme-dark .chart-ticker { color: #d1d4dc; }
.chart-bias-dot { width: 7px; height: 7px; border-radius: 50%; }
.chart-hint { font-size: 11px; color: #bbb; }

/* ── Bias banner ── */
.bias-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 10px;
  background: rgba(0,0,0,0.03);
  border-left: 3px solid #888;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.theme-dark .bias-bar { background: rgba(255,255,255,0.04); }

.bias-main { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.bias-dot {
  width: 10px; height: 10px;
  border-radius: 50%; flex-shrink: 0;
}
.bias-label { font-size: 14px; font-weight: 600; }
.bias-score { font-size: 11px; color: #888; }

.bias-reasons {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
}
.bias-reason {
  font-size: 11px;
  background: rgba(0,0,0,0.05);
  padding: 2px 8px;
  border-radius: 10px;
  color: #555;
}
.theme-dark .bias-reason { background: rgba(255,255,255,0.08); color: #aaa; }

/* ── Chart wrap ── */
.chart-wrap {
  position: relative;
  flex: 1;
  min-height: 360px;
}

.kline-el {
  width: 100%;
  height: 100%;
  min-height: 360px;
}

.chart-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.85);
  gap: 10px;
  font-size: 14px;
  color: #555;
  z-index: 10;
}
.theme-dark .chart-overlay { background: rgba(20,20,20,0.88); color: #aaa; }
.error-overlay { color: #ef5350; }
.hint-overlay  { color: #bbb; }
</style>
