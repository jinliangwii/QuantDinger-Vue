<template>
  <div
    class="context-chart-root"
    :class="{
      'theme-dark': dark,
      'has-data': hasData,
      'loading-data': loading && hasData,
      'locked': crosshairLocked
    }"
    @contextmenu.prevent="onContextMenu"
  >
    <!-- Panel header -->
    <div class="chart-header">
      <span class="chart-tf-badge">{{ timeframe.toUpperCase() }}</span>
      <span v-if="ticker" class="chart-ticker">{{ ticker }}</span>
      <span v-if="bias" class="chart-bias-dot" :style="{ background: bias.color }" :title="bias.label"></span>
      <span v-if="!ticker" class="chart-hint">select a ticker</span>
      <span class="chart-header-spacer"></span>
      <span v-if="ticker && lastPrice != null" class="chart-last-price" :class="lastPriceClass">
        {{ lastPriceDisplay }}
      </span>
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

    <!-- Chart area -->
    <div class="chart-wrap" ref="wrapEl">
      <div ref="chartEl" class="kline-el" @contextmenu.prevent="onContextMenu"></div>

      <!-- Loading skeleton: dim old chart instead of spinner (TradingView pattern) -->
      <div v-if="loading && hasData" class="chart-overlay skeleton-overlay">
        <div class="skeleton-pulse"></div>
      </div>

      <!-- First-load spinner: no prior data to show -->
      <div v-if="loading && !hasData" class="chart-overlay">
        <a-spin size="large" />
      </div>

      <!-- Error -->
      <div v-if="error && !loading" class="chart-overlay error-overlay">
        <a-icon type="warning" style="font-size: 28px; color: #ef5350; margin-bottom: 8px" />
        <span>{{ error }}</span>
      </div>

      <!-- Empty state -->
      <div v-if="!ticker && !loading" class="chart-overlay hint-overlay">
        <a-icon type="arrow-left" style="font-size: 28px; margin-bottom: 8px; opacity: 0.4" />
        <span>Click a row in the scanner to load</span>
      </div>

      <!-- Locked crosshair detail card -->
      <div v-if="crosshairLocked && lockedBar" class="locked-card">
        <div class="locked-card-header">
          <span>{{ lockedBar.timeStr || '' }}</span>
          <a-icon type="close" class="locked-close" @click="unlockCrosshair" />
        </div>
        <div class="locked-card-body">
          <div class="locked-row"><span class="locked-label">O</span><span>{{ fmtPrice(lockedBar.open) }}</span></div>
          <div class="locked-row"><span class="locked-label">H</span><span class="pos">{{ fmtPrice(lockedBar.high) }}</span></div>
          <div class="locked-row"><span class="locked-label">L</span><span class="neg">{{ fmtPrice(lockedBar.low) }}</span></div>
          <div class="locked-row"><span class="locked-label">C</span><span :class="lockedBar.close >= lockedBar.open ? 'pos' : 'neg'">{{ fmtPrice(lockedBar.close) }}</span></div>
          <div class="locked-row"><span class="locked-label">V</span><span>{{ fmtVol(lockedBar.volume) }}</span></div>
        </div>
      </div>

      <!-- Right-click context menu -->
      <div v-if="ctxMenu.visible" class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }">
        <div class="ctx-menu-item" @click="ctxCopyPrice">Copy price</div>
        <div class="ctx-menu-item" @click="ctxCopyOHLCV">Copy OHLCV</div>
      </div>
    </div>
  </div>
</template>

<script>
import { init, registerOverlay, registerIndicator, ActionType } from 'klinecharts'
import { getContext } from '@/api/cockpit'

// ══════════════════════════════════════════════════════════════════════════════
// Design tokens
// ══════════════════════════════════════════════════════════════════════════════
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"

const TV = {
  bg:         '#131722',
  bgElevated: '#1e222d',
  border:     '#2a2e39',
  textPri:    '#d1d4dc',
  textSec:    '#787b86',
  upColor:    '#26a69a',
  downColor:  '#ef5350',
  accent:     '#2962ff',
  gridH:      'rgba(255,255,255,0.06)',
  gridV:      'rgba(255,255,255,0.04)',
  xhairLine:  'rgba(255,255,255,0.20)',
  xhairBg:    '#2a2e39',
  syncLine:   'rgba(41,98,255,0.45)',
  syncBg:     'rgba(41,98,255,0.18)',
}

// ══════════════════════════════════════════════════════════════════════════════
// Dark chart styles (TradingView palette)
// ══════════════════════════════════════════════════════════════════════════════
function darkChartStyles () {
  return {
    grid: {
      show: true,
      horizontal: { show: true, size: 1, color: TV.gridH, style: 'solid', dashedValue: [] },
      vertical:   { show: true, size: 1, color: TV.gridV, style: 'solid', dashedValue: [] }
    },
    candle: {
      type: 'candle_solid',
      bar: {
        upColor: TV.upColor, downColor: TV.downColor, noChangeColor: '#888',
        upBorderColor: TV.upColor, downBorderColor: TV.downColor, noChangeBorderColor: '#888',
        upWickColor: TV.upColor, downWickColor: TV.downColor, noChangeWickColor: '#888'
      },
      priceMark: {
        show: true,
        high: { show: true, color: TV.textSec, textMargin: 5, textSize: 10, textFamily: FONT_STACK, textWeight: 'normal' },
        low:  { show: true, color: TV.textSec, textMargin: 5, textSize: 10, textFamily: FONT_STACK, textWeight: 'normal' },
        last: {
          show: true,
          upColor: TV.upColor, downColor: TV.downColor, noChangeColor: '#888',
          line: { show: true, style: 'dashed', dashedValue: [4, 3], size: 1, color: TV.textSec },
          text: {
            show: true, style: 'fill', size: 12,
            paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3,
            borderStyle: 'solid', borderSize: 0, borderColor: 'transparent',
            color: '#FFFFFF', family: FONT_STACK, weight: 'bold', borderRadius: 3
          }
        }
      },
      tooltip: {
        showRule: 'always',
        showType: 'standard',
        rect: {
          position: 'fixed',
          paddingLeft: 8, paddingRight: 8, paddingTop: 6, paddingBottom: 6,
          borderRadius: 4, borderSize: 1, borderColor: TV.border, color: TV.bgElevated
        },
        text: {
          size: 12, family: FONT_STACK, weight: 'normal', color: TV.textPri,
          marginLeft: 8, marginRight: 8, marginTop: 4, marginBottom: 4
        }
      }
    },
    indicator: {
      tooltip: {
        showRule: 'always',
        showType: 'standard',
        text: {
          size: 11, family: FONT_STACK, weight: 'normal', color: TV.textSec,
          marginLeft: 8, marginRight: 8, marginTop: 3, marginBottom: 3
        }
      }
    },
    xAxis: {
      show: true,
      axisLine: { show: true, color: TV.border, size: 1 },
      tickLine: { show: false },
      tickText: { show: true, color: TV.textSec, family: FONT_STACK, weight: 'normal', size: 11, marginStart: 4, marginEnd: 4 }
    },
    yAxis: {
      show: true,
      axisLine: { show: false },
      tickLine: { show: false },
      tickText: { show: true, color: TV.textSec, family: FONT_STACK, weight: 'normal', size: 11, marginStart: 6, marginEnd: 4 }
    },
    separator: {
      size: 1,
      color: TV.border,
      fill: true,
      activeBackgroundColor: 'rgba(41,98,255,0.08)'
    },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: TV.xhairLine },
        text: {
          show: true, style: 'fill', color: TV.textPri, size: 11,
          family: FONT_STACK, weight: 'bold',
          borderStyle: 'solid', borderSize: 0, borderColor: 'transparent',
          borderRadius: 2, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2,
          backgroundColor: TV.xhairBg
        }
      },
      vertical: {
        show: true,
        line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: TV.xhairLine },
        text: {
          show: true, style: 'fill', color: TV.textPri, size: 11,
          family: FONT_STACK, weight: 'bold',
          borderStyle: 'solid', borderSize: 0, borderColor: 'transparent',
          borderRadius: 2, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2,
          backgroundColor: TV.xhairBg
        }
      }
    },
    overlay: {
      line:   { style: 'solid', smooth: false, color: TV.accent, size: 1, dashedValue: [6, 4] },
      text:   { style: 'fill', color: TV.textPri, size: 11, family: FONT_STACK, weight: 'normal', backgroundColor: 'transparent', borderSize: 0, borderColor: 'transparent', borderRadius: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
      rect:   { style: 'fill', color: 'rgba(41,98,255,0.12)', borderColor: TV.accent, borderSize: 1, borderRadius: 2 },
      circle: { style: 'fill', color: 'rgba(41,98,255,0.12)', borderColor: TV.accent, borderSize: 1 },
      point:  { color: TV.accent, borderColor: 'rgba(41,98,255,0.35)', borderSize: 1, radius: 4, activeColor: TV.accent, activeBorderColor: 'rgba(41,98,255,0.50)', activeBorderSize: 2, activeRadius: 5 }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Custom overlays & indicators (module-level registration)
// ══════════════════════════════════════════════════════════════════════════════
let _registered = false
function ensureRegistered () {
  if (_registered) return
  _registered = true

  // ── VWAP indicator ──
  try {
    registerIndicator({
      name: 'SENECA_VWAP',
      shortName: 'VWAP',
      series: 'price',
      figures: [{ key: 'vwap', title: 'VWAP: ', type: 'line' }],
      calc (dataList) {
        return dataList.map(d => ({ vwap: (d.vwap != null && d.vwap > 0) ? d.vwap : null }))
      }
    })
  } catch (_) {}

  // ── S/R level overlay ──
  try {
    registerOverlay({
      name: 'srLevel',
      totalStep: 1, lock: true,
      needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
      checkEventOn: () => false,
      createPointFigures ({ coordinates, overlay, bounding }) {
        if (!coordinates || !coordinates[0]) return []
        const { color = '#888', label = '', dash = false, tier = 1 } = overlay.extendData || {}
        const y = coordinates[0].y
        const W = (bounding && bounding.width) ? bounding.width : 3000
        const lineW = tier === 1 ? 1.5 : 1
        return [
          { type: 'line', attrs: { coordinates: [{ x: 0, y }, { x: W, y }] }, styles: { style: dash ? 'dashed' : 'solid', dashedValue: [6, 4], size: lineW, color }, ignoreEvent: true },
          { type: 'text', attrs: { x: W - 6, y: y - 3, text: label, align: 'right', baseline: 'bottom' }, styles: { color, size: 10, weight: tier === 1 ? 'bold' : 'normal', backgroundColor: 'transparent' }, ignoreEvent: true }
        ]
      }
    })
  } catch (_) {}

  // ── Session open divider ──
  try {
    registerOverlay({
      name: 'sessionOpen',
      totalStep: 1, lock: true,
      needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
      checkEventOn: () => false,
      createPointFigures ({ coordinates, bounding }) {
        if (!coordinates || !coordinates[0]) return []
        const x = coordinates[0].x
        const H = (bounding && bounding.height) ? bounding.height : 3000
        return [
          { type: 'line', attrs: { coordinates: [{ x, y: 0 }, { x, y: H }] }, styles: { style: 'dashed', dashedValue: [4, 4], size: 1, color: '#ffa726' }, ignoreEvent: true },
          { type: 'text', attrs: { x: x + 4, y: 14, text: '9:30 Open', align: 'left', baseline: 'top' }, styles: { color: '#ffa726', size: 10, weight: 'normal', backgroundColor: 'transparent' }, ignoreEvent: true }
        ]
      }
    })
  } catch (_) {}

  // ── Crosshair sync line (drawn on sibling charts during crosshair sync) ──
  try {
    registerOverlay({
      name: 'syncLine',
      totalStep: 1, lock: true,
      needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
      checkEventOn: () => false,
      createPointFigures ({ coordinates, bounding, overlay }) {
        if (!coordinates || !coordinates[0]) return []
        const { label = '' } = overlay.extendData || {}
        const x = coordinates[0].x
        const H = (bounding && bounding.height) ? bounding.height : 3000
        return [
          { type: 'line', attrs: { coordinates: [{ x, y: 0 }, { x, y: H }] }, styles: { style: 'dashed', dashedValue: [4, 2], size: 1, color: TV.syncLine }, ignoreEvent: true },
          { type: 'text', attrs: { x: x + 4, y: 14, text: label, align: 'left', baseline: 'top' }, styles: { color: TV.accent, size: 10, weight: 'normal', backgroundColor: TV.syncBg, paddingLeft: 3, paddingRight: 3, paddingTop: 1, paddingBottom: 1, borderRadius: 2 }, ignoreEvent: true }
        ]
      }
    })
  } catch (_) {}
}

export default {
  name: 'ContextChart',
  props: {
    ticker:          { type: String,  default: '' },
    date:            { type: String,  default: '' },
    timeframe:       { type: String,  default: '1m' },
    dark:            { type: Boolean, default: false },
    // Crosshair sync (from parent)
    syncTimestamp:   { type: Number,  default: null },
    syncSource:      { type: String,  default: '' },
  },
  data () {
    return {
      loading:   false,
      error:     null,
      bias:      null,
      lastPrice: null,
      lastPriceChange: 0,
      hasData:   false,
      // Crosshair lock
      crosshairLocked: false,
      lockedBar: null,
      // Context menu
      ctxMenu: { visible: false, x: 0, y: 0, clickedBar: null },
    }
  },
  computed: {
    lastPriceDisplay () {
      if (this.lastPrice == null) return ''
      return '$' + this.lastPrice.toFixed(2)
    },
    lastPriceClass () {
      if (this.lastPriceChange > 0) return 'price-up'
      if (this.lastPriceChange < 0) return 'price-down'
      return 'price-flat'
    }
  },
  watch: {
    ticker (val) {
      if (val) { this.load() } else { this.clearChart() }
    },
    date () {
      if (this.ticker) { this.load() }
    },
    timeframe () {
      if (this.ticker) { this.load() }
    },
    dark (val) {
      this._applyTheme()
    },
    syncTimestamp (ts) {
      this._updateSyncLine(ts)
    },
  },
  mounted () {
    // Non-reactive instance state
    this.chart          = null
    this.levelIds       = []
    this.dividerIds     = []
    this.syncLineId     = null
    this.volIndicatorId = null
    this.vwapIndicatorId = null
    this._loadToken     = 0
    this._lastEmitIndex = -1
    this._lastCrosshairData = null

    ensureRegistered()
    this.chart = init(this.$refs.chartEl)
    this.chart.setPriceVolumePrecision(2, 0)
    this._applyTheme()

    // ── Subscribe to chart events ──
    try {
      this.chart.subscribeAction(ActionType.OnCrosshairChange, (data) => {
        this._lastCrosshairData = data
        this._onCrosshairChange(data)
      })
      this.chart.subscribeAction(ActionType.OnCandleBarClick, (data) => {
        this._onBarClick(data)
      })
    } catch (_) {}

    // ── Wheel event forwarder (ensure splitpanes doesn't eat scroll) ──
    this._onWheel = (e) => {
      // klinecharts handles wheel natively on its canvas
    }
    if (this.$refs.wrapEl) {
      this.$refs.wrapEl.addEventListener('wheel', this._onWheel, { passive: false })
    }

    // ── Global click to dismiss context menu ──
    this._onGlobalClick = () => { this.ctxMenu.visible = false }
    document.addEventListener('click', this._onGlobalClick)

    // ── Escape key to unlock crosshair ──
    this._onKeyDown = (e) => {
      if (e.key === 'Escape' && this.crosshairLocked) {
        this.unlockCrosshair()
      }
    }
    document.addEventListener('keydown', this._onKeyDown)

    if (this.ticker) this.load()
  },
  beforeDestroy () {
    if (this._onWheel && this.$refs.wrapEl) {
      this.$refs.wrapEl.removeEventListener('wheel', this._onWheel)
    }
    document.removeEventListener('click', this._onGlobalClick)
    document.removeEventListener('keydown', this._onKeyDown)
    if (this.chart) {
      try { this.chart.destroy() } catch (_) {}
      this.chart = null
    }
  },
  methods: {
    // ═══════════════════════════════════════════════════════════════════
    // Theme
    // ═══════════════════════════════════════════════════════════════════
    _applyTheme () {
      if (!this.chart) return
      try {
        if (this.dark) {
          this.chart.setStyles(darkChartStyles())
        } else {
          // Reset to klinecharts light defaults
          this.chart.setStyles({
            grid: {
              show: true,
              horizontal: { show: true, size: 1, color: '#e8e8e8', style: 'solid', dashedValue: [] },
              vertical:   { show: true, size: 1, color: '#f0f0f0', style: 'solid', dashedValue: [] }
            },
            candle: {
              type: 'candle_solid',
              bar: {
                upColor: '#26a69a', downColor: '#ef5350', noChangeColor: '#888',
                upBorderColor: '#26a69a', downBorderColor: '#ef5350', noChangeBorderColor: '#888',
                upWickColor: '#26a69a', downWickColor: '#ef5350', noChangeWickColor: '#888'
              },
              priceMark: {
                show: true,
                high: { show: true, color: '#999', textMargin: 5, textSize: 10, textFamily: FONT_STACK, textWeight: 'normal' },
                low:  { show: true, color: '#999', textMargin: 5, textSize: 10, textFamily: FONT_STACK, textWeight: 'normal' },
                last: {
                  show: true,
                  upColor: '#26a69a', downColor: '#ef5350', noChangeColor: '#888',
                  line: { show: true, style: 'dashed', dashedValue: [4, 3], size: 1, color: '#bbb' },
                  text: {
                    show: true, style: 'fill', size: 12,
                    paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3,
                    borderStyle: 'solid', borderSize: 0, borderColor: 'transparent',
                    color: '#FFFFFF', family: FONT_STACK, weight: 'bold', borderRadius: 3
                  }
                }
              },
              tooltip: {
                showRule: 'always',
                showType: 'standard',
                rect: {
                  position: 'fixed',
                  paddingLeft: 8, paddingRight: 8, paddingTop: 6, paddingBottom: 6,
                  borderRadius: 4, borderSize: 1, borderColor: '#d9d9d9', color: '#ffffff'
                },
                text: {
                  size: 12, family: FONT_STACK, weight: 'normal', color: '#333',
                  marginLeft: 8, marginRight: 8, marginTop: 4, marginBottom: 4
                }
              }
            },
            indicator: {
              tooltip: {
                showRule: 'always',
                showType: 'standard',
                text: {
                  size: 11, family: FONT_STACK, weight: 'normal', color: '#666',
                  marginLeft: 8, marginRight: 8, marginTop: 3, marginBottom: 3
                }
              }
            },
            xAxis: {
              show: true,
              axisLine: { show: true, color: '#d9d9d9', size: 1 },
              tickLine: { show: false },
              tickText: { show: true, color: '#999', family: FONT_STACK, weight: 'normal', size: 11, marginStart: 4, marginEnd: 4 }
            },
            yAxis: {
              show: true,
              axisLine: { show: false },
              tickLine: { show: false },
              tickText: { show: true, color: '#999', family: FONT_STACK, weight: 'normal', size: 11, marginStart: 6, marginEnd: 4 }
            },
            separator: {
              size: 1,
              color: '#d9d9d9',
              fill: true,
              activeBackgroundColor: 'rgba(24,144,255,0.08)'
            },
            crosshair: {
              show: true,
              horizontal: {
                show: true,
                line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(0,0,0,0.25)' },
                text: {
                  show: true, style: 'fill', color: '#333', size: 11,
                  family: FONT_STACK, weight: 'bold',
                  borderStyle: 'solid', borderSize: 0, borderColor: 'transparent',
                  borderRadius: 2, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2,
                  backgroundColor: '#e8e8e8'
                }
              },
              vertical: {
                show: true,
                line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(0,0,0,0.25)' },
                text: {
                  show: true, style: 'fill', color: '#333', size: 11,
                  family: FONT_STACK, weight: 'bold',
                  borderStyle: 'solid', borderSize: 0, borderColor: 'transparent',
                  borderRadius: 2, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2,
                  backgroundColor: '#e8e8e8'
                }
              }
            },
            overlay: {
              line:   { style: 'solid', smooth: false, color: '#1890ff', size: 1, dashedValue: [6, 4] },
              text:   { style: 'fill', color: '#333', size: 11, family: FONT_STACK, weight: 'normal', backgroundColor: 'transparent', borderSize: 0, borderColor: 'transparent', borderRadius: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
              rect:   { style: 'fill', color: 'rgba(24,144,255,0.10)', borderColor: '#1890ff', borderSize: 1, borderRadius: 2 },
              circle: { style: 'fill', color: 'rgba(24,144,255,0.10)', borderColor: '#1890ff', borderSize: 1 },
              point:  { color: '#1890ff', borderColor: 'rgba(24,144,255,0.30)', borderSize: 1, radius: 4, activeColor: '#1890ff', activeBorderColor: 'rgba(24,144,255,0.50)', activeBorderSize: 2, activeRadius: 5 }
            }
          })
        }
      } catch (_) {}
    },

    // ═══════════════════════════════════════════════════════════════════
    // Data loading
    // ═══════════════════════════════════════════════════════════════════
    async load () {
      if (!this.ticker) return
      const token = ++this._loadToken
      this.loading = true
      this.error = null
      this.bias = null
      this.lockedBar = null
      if (this.crosshairLocked) this.unlockCrosshair()

      try {
        const res = await getContext(this.ticker, { date: this.date || null, timeframe: this.timeframe })
        if (token !== this._loadToken) return
        if (!res || !res.success) {
          this.error = (res && res.error) || 'Context fetch failed'
          return
        }
        this._applyContext(res.data)
      } catch (e) {
        if (token !== this._loadToken) return
        this.error = e.message || 'Network error'
      } finally {
        if (token === this._loadToken) this.loading = false
      }
    },

    _applyContext (ctx) {
      if (!this.chart) return
      const { candles, levels, bias, session_open_ms } = ctx

      this.bias = bias
      this.hasData = true

      if (candles && candles.length) {
        const last = candles[candles.length - 1]
        this.lastPrice = last.close
        if (candles.length >= 2) {
          const prev = candles[candles.length - 2]
          this.lastPriceChange = last.close > prev.close ? 1 : last.close < prev.close ? -1 : 0
        }
      }

      this.chart.applyNewData(candles)
      this.chart.setPriceVolumePrecision(2, 0)

      // Remove old indicators before creating new ones (prevents accumulation
      // across ticker switches if applyNewData doesn't clear them)
      if (this.volIndicatorId) { try { this.chart.removeIndicator(this.volIndicatorId) } catch (_) {} this.volIndicatorId = null }
      if (this.vwapIndicatorId) { try { this.chart.removeIndicator(this.vwapIndicatorId) } catch (_) {} this.vwapIndicatorId = null }

      try { this.volIndicatorId = this.chart.createIndicator('VOL', false, { height: 72, minHeight: 40 }) } catch (_) {}
      try { this.vwapIndicatorId = this.chart.createIndicator('SENECA_VWAP', false, { id: 'candle_pane' }) } catch (_) {}

      this._clearOverlays()

      if (session_open_ms && candles.length) {
        const id = this.chart.createOverlay({
          name: 'sessionOpen', lock: true,
          points: [{ timestamp: session_open_ms, value: candles[0].close }],
          extendData: {}
        })
        if (id) this.dividerIds.push(id)
      }

      if (candles.length) {
        const anchorTs = candles[0].timestamp
        for (const lvl of levels) {
          const id = this.chart.createOverlay({
            name: 'srLevel', lock: true,
            points: [{ timestamp: anchorTs, value: lvl.price }],
            extendData: {
              color: lvl.color,
              label: `${lvl.label}  $${lvl.price.toFixed(2)}`,
              dash: lvl.dash,
              tier: lvl.tier
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
      // Also clear any lingering syncLine from crosshair sync
      if (this.syncLineId != null) {
        remove(this.syncLineId)
        this.syncLineId = null
      }
    },

    clearChart () {
      this.bias = null
      this.error = null
      this.lastPrice = null
      this.lastPriceChange = 0
      this.hasData = false
      this.lockedBar = null
      if (this.crosshairLocked) this.unlockCrosshair()
      this._clearOverlays()
      this._removeSyncLine()
      if (this.chart) {
        try { this.chart.applyNewData([]) } catch (_) {}
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // Crosshair sync — emit to parent
    // ═══════════════════════════════════════════════════════════════════
    _onCrosshairChange (data) {
      if (this.crosshairLocked) return
      if (!data || !data.kLineData) {
        if (this._lastEmitIndex !== -1) {
          this._lastEmitIndex = -1
          this.$emit('crosshair-leave', { source: this.timeframe, timestamp: null })
        }
        return
      }
      const di = data.dataIndex
      if (di !== this._lastEmitIndex) {
        this._lastEmitIndex = di
        this.$emit('crosshair-change', {
          source: this.timeframe,
          timestamp: data.kLineData.timestamp,
          kLineData: data.kLineData,
          dataIndex: di
        })
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // Crosshair sync — receive from sibling (draw sync line overlay)
    // ═══════════════════════════════════════════════════════════════════
    _updateSyncLine (ts) {
      this._removeSyncLine()
      if (ts == null || !this.chart || !this.hasData) return

      try {
        const id = this.chart.createOverlay({
          name: 'syncLine',
          lock: true,
          points: [{ timestamp: ts, value: 0 }],
          extendData: {
            label: this.syncSource || ''
          }
        })
        if (id) this.syncLineId = id
      } catch (_) {}
    },

    _removeSyncLine () {
      if (this.syncLineId != null && this.chart) {
        try { this.chart.removeOverlay(this.syncLineId) } catch (_) {}
        this.syncLineId = null
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // Click-to-lock crosshair
    // ═══════════════════════════════════════════════════════════════════
    _onBarClick (data) {
      if (!data || !data.kLineData) return
      if (this.crosshairLocked) {
        this.unlockCrosshair()
        return
      }
      this.crosshairLocked = true
      const bar = data.kLineData
      this.lockedBar = {
        ...bar,
        timeStr: this._fmtTime(bar.timestamp)
      }
      this.$emit('bar-select', {
        source: this.timeframe,
        timestamp: bar.timestamp,
        kLineData: bar
      })
    },

    unlockCrosshair () {
      this.crosshairLocked = false
      this.lockedBar = null
      this.$emit('bar-deselect', { source: this.timeframe })
    },

    _fmtTime (ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },

    // ═══════════════════════════════════════════════════════════════════
    // Right-click context menu
    // ═══════════════════════════════════════════════════════════════════
    onContextMenu (e) {
      this.ctxMenu.visible = true
      this.ctxMenu.x = e.offsetX
      this.ctxMenu.y = e.offsetY

      if (this.chart && this._lastCrosshairData) {
        this.ctxMenu.clickedBar = this._lastCrosshairData.kLineData
      }
    },

    ctxCopyPrice () {
      const bar = this.ctxMenu.clickedBar
      const price = bar ? bar.close : this.lastPrice
      if (price != null) {
        navigator.clipboard.writeText('$' + Number(price).toFixed(2)).catch(() => {})
      }
      this.ctxMenu.visible = false
    },

    ctxCopyOHLCV () {
      const bar = this.ctxMenu.clickedBar
      if (bar) {
        const o = Number(bar.open).toFixed(2)
        const h = Number(bar.high).toFixed(2)
        const l = Number(bar.low).toFixed(2)
        const c = Number(bar.close).toFixed(2)
        const v = bar.volume || 0
        navigator.clipboard.writeText(`O:${o} H:${h} L:${l} C:${c} V:${v}`).catch(() => {})
      }
      this.ctxMenu.visible = false
    },

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════
    fmtPrice (v) {
      if (v == null) return '—'
      return Number(v).toFixed(2)
    },
    fmtVol (v) {
      if (v == null) return '—'
      if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
      if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K'
      return String(v)
    },
    getChart () {
      return this.chart
    }
  }
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════
   Light theme (default). .theme-dark overrides below.
   ══════════════════════════════════════════════════════════════════════ */

.context-chart-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 180px;
  font-feature-settings: 'tnum', 'lnum';
  background: #fff;
  color: #333;
}

/* ── Header ── */
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

.chart-tf-badge {
  font-size: 11px; font-weight: 700;
  color: #1890ff;
  background: rgba(24,144,255,0.1);
  padding: 1px 5px; border-radius: 3px;
  text-transform: uppercase;
}
.chart-ticker {
  font-size: 12px; font-weight: 600;
  color: #333;
}
.chart-bias-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.chart-hint {
  font-size: 11px; color: #bbb; font-style: italic;
}
.chart-header-spacer { flex: 1; }

.chart-last-price {
  font-size: 12px; font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 1px 8px; border-radius: 3px;
}
.chart-last-price.price-up   { color: #fff; background: #26a69a; }
.chart-last-price.price-down { color: #fff; background: #ef5350; }
.chart-last-price.price-flat { color: #888; background: #f0f0f0; }

/* ── Bias banner ── */
.bias-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 3px 10px;
  background: rgba(0,0,0,0.03);
  border-left: 3px solid #888;
  flex-wrap: wrap; flex-shrink: 0;
}
.bias-main { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.bias-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.bias-label { font-size: 14px; font-weight: 600; }
.bias-score { font-size: 11px; color: #888; }
.bias-reasons { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.bias-reason {
  font-size: 11px;
  background: rgba(0,0,0,0.05);
  padding: 2px 8px;
  border-radius: 10px;
  color: #555;
}

/* ── Chart canvas ── */
.chart-wrap {
  position: relative; flex: 1; min-height: 360px;
}
.kline-el {
  width: 100%; height: 100%; min-height: 360px;
}

/* ── Chart overlays (loading, error, empty) ── */
.chart-overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: rgba(255,255,255,0.85);
  gap: 10px; font-size: 14px; color: #555; z-index: 10;
}
.error-overlay { color: #ef5350; }
.hint-overlay  { color: #bbb; }

/* Loading skeleton: dim the existing chart, subtle pulse */
.skeleton-overlay {
  background: rgba(255,255,255,0.30);
  pointer-events: none;
}
.skeleton-pulse {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.03);
  animation: skPulse 1.2s ease-in-out infinite;
}
@keyframes skPulse {
  0%, 100% { opacity: 0.3; }
  50%      { opacity: 0.6; }
}

/* ── Locked crosshair detail card ── */
.locked-card {
  position: absolute;
  top: 8px; right: 8px;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 8px 12px;
  min-width: 140px;
  z-index: 20;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  font-size: 12px;
}
.locked-card-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px; padding-bottom: 4px;
  border-bottom: 1px solid #e8e8e8;
  font-size: 11px; color: #999;
}
.locked-close {
  cursor: pointer; color: #999; font-size: 12px;
}
.locked-close:hover { color: #333; }
.locked-card-body { display: flex; flex-direction: column; gap: 3px; }
.locked-row {
  display: flex; justify-content: space-between; gap: 16px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
}
.locked-label { color: #999; width: 14px; }
.pos { color: #26a69a; }
.neg { color: #ef5350; }

/* ── Right-click context menu ── */
.ctx-menu {
  position: absolute;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 120px;
  z-index: 30;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.ctx-menu-item {
  padding: 6px 12px; font-size: 12px; color: #333;
  cursor: pointer; white-space: nowrap;
}
.ctx-menu-item:hover { background: #f5f5f5; }


/* ══════════════════════════════════════════════════════════════════════
   Dark-theme overrides
   ══════════════════════════════════════════════════════════════════════ */
.theme-dark.context-chart-root {
  background: #131722;
  color: #d1d4dc;
}

.theme-dark .chart-header {
  background: #131722;
  border-bottom-color: #2a2e39;
}
.theme-dark .chart-tf-badge {
  color: #5b8cff;
  background: rgba(41,98,255,0.18);
}
.theme-dark .chart-ticker { color: #d1d4dc; }
.theme-dark .chart-hint { color: #555; }
.theme-dark .chart-last-price.price-flat { color: #888; background: rgba(255,255,255,0.06); }

.theme-dark .bias-bar { background: rgba(255,255,255,0.04); }
.theme-dark .bias-reason { background: rgba(255,255,255,0.08); color: #aaa; }
.theme-dark .bias-score { color: #787b86; }

.theme-dark .chart-overlay {
  background: rgba(19,23,34,0.90);
  color: #aaa;
}
.theme-dark .skeleton-overlay {
  background: rgba(19,23,34,0.30);
}
.theme-dark .skeleton-pulse {
  background: rgba(255,255,255,0.02);
}
.theme-dark .error-overlay { color: #ef5350; }
.theme-dark .hint-overlay  { color: #555; }

.theme-dark .locked-card {
  background: #1e222d;
  border-color: #2a2e39;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.theme-dark .locked-card-header {
  border-bottom-color: #2a2e39;
  color: #787b86;
}
.theme-dark .locked-close { color: #787b86; }
.theme-dark .locked-close:hover { color: #d1d4dc; }
.theme-dark .locked-label { color: #787b86; }

.theme-dark .ctx-menu {
  background: #1e222d;
  border-color: #2a2e39;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.theme-dark .ctx-menu-item { color: #d1d4dc; }
.theme-dark .ctx-menu-item:hover { background: #2a2e39; }
</style>
