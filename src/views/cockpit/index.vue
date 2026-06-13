<template>
  <div class="cockpit-root" :class="{ 'cockpit-dark': isDarkTheme }">

    <!-- ── Top bar ── -->
    <div class="cockpit-topbar">
      <div class="topbar-left">
        <span class="topbar-logo">Seneca Cockpit</span>
        <span v-if="selectedTicker" class="topbar-ticker">{{ selectedTicker }}</span>
        <span class="topbar-market" :class="marketOpen ? 'market-open' : 'market-closed'">
          {{ marketOpen ? 'Market Open' : 'Market Closed' }}
        </span>
        <span v-if="dataDate" class="topbar-date">{{ dataDate }}</span>
      </div>
      <div class="topbar-right">
        <!-- Quick ticker typeahead (appears on keystroke) -->
        <div v-if="typeaheadVisible" class="typeahead-wrap">
          <span class="typeahead-icon">⌨</span>
          <input
            ref="typeaheadInput"
            v-model="typeaheadText"
            class="typeahead-input"
            placeholder="ticker…"
            @keyup.enter="onTypeaheadEnter"
            @keydown.esc="onTypeaheadEsc"
            @keydown="resetTypeaheadTimer"
            @blur="onTypeaheadEsc"
          />
        </div>
        <a-radio-group v-model="mode" button-style="solid" size="small" @change="onModeChange">
          <a-radio-button value="live">Live</a-radio-button>
          <a-radio-button value="history">History</a-radio-button>
        </a-radio-group>
        <a-date-picker
          v-if="mode === 'history'"
          v-model="selectedDate"
          size="small"
          format="YYYY-MM-DD"
          style="width: 130px"
          @change="onDateChange"
        />
        <a-input
          v-if="mode === 'history'"
          v-model="tickerInput"
          placeholder="AAPL"
          size="small"
          style="width: 80px"
          @keyup.enter.native="onTickerInput"
        />
      </div>
    </div>

    <!-- ── Main panel grid ── -->
    <splitpanes class="cockpit-body">

      <!-- Left column: scanner panels -->
      <pane :size="leftSize" min-size="18" class="col-pane">
        <splitpanes horizontal class="h-full">

          <pane min-size="15">
            <scanner-panel
              title="YC Scanner"
              dot-color="#1890ff"
              :columns="ycColumns"
              :rows="ycCandidates"
              :loading="ycLoading"
              :selected-ticker="selectedTicker"
              empty-text="No pre-market candidates"
              @select="selectTicker"
              @refresh="refreshYC"
            />
          </pane>

          <pane min-size="15">
            <scanner-panel
              title="Most Active"
              dot-color="#52c41a"
              :columns="moverColumns"
              :rows="movers.most_actives"
              :loading="moversLoading"
              :selected-ticker="selectedTicker"
              empty-text="No data"
              @select="selectTicker"
              @refresh="refreshMovers"
            />
          </pane>

          <pane min-size="15">
            <scanner-panel
              title="Top Gainers"
              dot-color="#f5a623"
              :columns="moverColumns"
              :rows="movers.top_gainers"
              :loading="moversLoading"
              :selected-ticker="selectedTicker"
              empty-text="No data"
              @select="selectTicker"
              @refresh="refreshMovers"
            />
          </pane>

        </splitpanes>
      </pane>

      <!-- Right column: charts -->
      <pane min-size="30" class="col-pane">
        <splitpanes horizontal class="h-full">

          <pane min-size="15">
            <context-chart
              ref="chart1m"
              :ticker="selectedTicker"
              :date="historyDate || ''"
              timeframe="1m"
              :dark="isDarkTheme"
              :sync-timestamp="syncTimestamps['1m']"
              :sync-source="syncSources['1m']"
              class="h-full"
              @crosshair-change="onCrosshairChange"
              @crosshair-leave="onCrosshairLeave"
              @bar-select="onBarSelect"
              @bar-deselect="onBarDeselect"
            />
          </pane>

          <pane min-size="15">
            <context-chart
              ref="chart5m"
              :ticker="selectedTicker"
              :date="historyDate || ''"
              timeframe="5m"
              :dark="isDarkTheme"
              :sync-timestamp="syncTimestamps['5m']"
              :sync-source="syncSources['5m']"
              class="h-full"
              @crosshair-change="onCrosshairChange"
              @crosshair-leave="onCrosshairLeave"
              @bar-select="onBarSelect"
              @bar-deselect="onBarDeselect"
            />
          </pane>

          <pane min-size="15">
            <context-chart
              ref="chart1d"
              :ticker="selectedTicker"
              :date="historyDate || ''"
              timeframe="1d"
              :dark="isDarkTheme"
              :sync-timestamp="syncTimestamps['1d']"
              :sync-source="syncSources['1d']"
              class="h-full"
              @crosshair-change="onCrosshairChange"
              @crosshair-leave="onCrosshairLeave"
              @bar-select="onBarSelect"
              @bar-deselect="onBarDeselect"
            />
          </pane>

        </splitpanes>
      </pane>

    </splitpanes>

  </div>
</template>

<script>
import moment from 'moment'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import { baseMixin } from '@/store/app-mixin'
import { getWatchlist, getWatchlistHistory, getMovers, clearContextCache } from '@/api/cockpit'
import ScannerPanel from './ScannerPanel.vue'
import ContextChart from './ContextChart.vue'

const REFRESH_MS = 120_000

export default {
  name: 'CockpitPage',
  components: { Splitpanes, Pane, ScannerPanel, ContextChart },
  mixins: [baseMixin],

  data () {
    return {
      selectedTicker: '',
      ycCandidates:  [],
      ycLoading:     false,
      movers:        { most_actives: [], top_gainers: [], top_losers: [] },
      moversLoading: false,
      mode:          'live',
      selectedDate:  null,
      historyDate:   null,
      marketStatus:  'closed',
      dataDate:      null,
      leftSize:      28,
      tickerInput:   '',
      // Crosshair sync
      syncTimestamps:  { '1m': null, '5m': null, '1d': null },
      syncSources:     { '1m': '',   '5m': '',   '1d': '' },
      lastHoveredChart: null,
      // Keyboard typeahead
      typeaheadVisible: false,
      typeaheadText:    '',
      typeaheadTimer:   null,
      // Scanner keyboard nav
      scannerHighlightIndex: -1,
    }
  },

  computed: {
    isDarkTheme () { return this.navTheme === 'dark' || this.navTheme === 'realdark' },
    marketOpen ()  { return this.marketStatus !== 'closed' },

    ycColumns () {
      const h = this.$createElement
      const fmtVol   = this.fmtVol
      const fmtFloat = this.fmtFloat
      const scoreClass = this.scoreBadgeClass
      return [
        {
          title: '#', key: 'rank', width: 30,
          customRender: (text, record, index) => index + 1
        },
        {
          title: 'Ticker', dataIndex: 'ticker', width: 58,
          customRender: (text) => h('strong', [text])
        },
        {
          title: 'Score', dataIndex: 'score', width: 56,
          defaultSortOrder: 'descend',
          sorter: (a, b) => a.score - b.score,
          customRender: (text, record) => h('span', { class: ['score-badge', scoreClass(record.score)] }, [record.score.toFixed(1)])
        },
        {
          title: 'Gap%', dataIndex: 'gap_pct', width: 52,
          sorter: (a, b) => a.gap_pct - b.gap_pct,
          customRender: (text) => h('span', { class: text >= 0 ? 'pos' : 'neg' }, [(text > 0 ? '+' : '') + text.toFixed(1) + '%'])
        },
        {
          title: 'RVOL', dataIndex: 'rvol', width: 46,
          sorter: (a, b) => a.rvol - b.rvol,
          customRender: (text) => h('span', { class: text >= 5 ? 'pos' : '' }, [text.toFixed(1) + 'x'])
        },
        {
          title: 'Vol', dataIndex: 'premarket_vol', width: 52,
          sorter: (a, b) => a.premarket_vol - b.premarket_vol,
          customRender: (text) => fmtVol(text)
        },
        {
          title: 'Float', dataIndex: 'float_shares', width: 48,
          sorter: (a, b) => a.float_shares - b.float_shares,
          customRender: (text) => fmtFloat(text)
        },
        {
          title: 'Price', dataIndex: 'price', width: 52,
          sorter: (a, b) => a.price - b.price,
          customRender: (text) => text ? '$' + text.toFixed(2) : '—'
        },
        {
          title: 'Prev H/L', key: 'prev_hl', width: 100,
          customRender: (text, record) => {
            const hi = record.prev_high
            const lo = record.prev_low
            if (!hi && !lo) return '—'
            const parts = []
            if (hi) parts.push(h('span', { style: { color: '#cf1322', fontWeight: 500 } }, ['$' + hi.toFixed(2)]))
            if (hi && lo) parts.push(h('span', { style: { color: '#bbb' } }, [' / ']))
            if (lo) parts.push(h('span', { style: { color: '#389e0d', fontWeight: 500 } }, ['$' + lo.toFixed(2)]))
            return h('span', parts)
          }
        },
        {
          title: 'Key $', key: 'key_dollars', width: 90,
          customRender: (text, record) => {
            const above = record.whole_dollar_above
            const below = record.whole_dollar_below
            if (!above && !below) return '—'
            const parts = []
            if (above) parts.push(h('span', { style: { color: '#cf1322', fontWeight: 500 } }, ['↑$' + above]))
            if (below) parts.push(h('span', { style: { color: '#389e0d', fontWeight: 500 } }, [' ↓$' + below]))
            return h('span', parts)
          }
        },
      ]
    },

    moverColumns () {
      const h = this.$createElement
      const fmtVol = this.fmtVol
      return [
        {
          title: '#', key: 'rank', width: 30,
          customRender: (text, record) => record.rank
        },
        {
          title: 'Ticker', dataIndex: 'ticker', width: 60,
          customRender: (text) => h('strong', [text])
        },
        {
          title: 'Price', dataIndex: 'price', width: 58,
          sorter: (a, b) => a.price - b.price,
          customRender: (text) => (text != null && text !== 0) ? '$' + text.toFixed(2) : '—'
        },
        {
          title: 'Chg%', dataIndex: 'change_pct', width: 62,
          sorter: (a, b) => a.change_pct - b.change_pct,
          customRender: (text) => (text == null || text === 0)
            ? '—'
            : h('span', { class: text > 0 ? 'pos' : 'neg' }, [(text > 0 ? '+' : '') + text.toFixed(2) + '%'])
        },
        {
          title: 'Vol', dataIndex: 'volume', width: 52,
          sorter: (a, b) => a.volume - b.volume,
          customRender: (text) => fmtVol(text)
        },
      ]
    },
  },

  mounted () {
    this.ycTimer    = null
    this.moverTimer = null
    // Keyboard handler for typeahead + scanner navigation
    this._onGlobalKeyDown = this._onGlobalKeyDown.bind(this)
    document.addEventListener('keydown', this._onGlobalKeyDown)
    // Initial load — only runs once because keepAlive: true keeps the component alive
    this.refreshYC()
    this.refreshMovers()
  },

  activated () {
    // Re-entered from keep-alive: restart auto-refresh timers if they lapsed
    if (!this.ycTimer && this.mode === 'live' && this.marketOpen) {
      this.ycTimer = setInterval(() => this.refreshYC(), REFRESH_MS)
    }
    if (!this.moverTimer && this.mode === 'live') {
      this.moverTimer = setInterval(() => this.refreshMovers(), REFRESH_MS)
    }
    // Re-attach keyboard handler (deactivated removed it)
    if (this._onGlobalKeyDown) {
      document.addEventListener('keydown', this._onGlobalKeyDown)
    }
  },

  deactivated () {
    // Navigating away — pause timers, component state is preserved
    clearInterval(this.ycTimer)
    clearInterval(this.moverTimer)
    this.ycTimer    = null
    this.moverTimer = null
    // Remove keyboard handler when navigating away
    if (this._onGlobalKeyDown) {
      document.removeEventListener('keydown', this._onGlobalKeyDown)
    }
  },

  beforeDestroy () {
    clearInterval(this.ycTimer)
    clearInterval(this.moverTimer)
    clearTimeout(this.typeaheadTimer)
    if (this._onGlobalKeyDown) {
      document.removeEventListener('keydown', this._onGlobalKeyDown)
    }
  },

  watch: {
    mode () {
      clearInterval(this.ycTimer);   this.ycTimer    = null
      clearInterval(this.moverTimer); this.moverTimer = null
      this.ycCandidates   = []
      this.movers         = { most_actives: [], top_gainers: [], top_losers: [] }
      this.selectedTicker = ''
      this.dataDate       = null
      clearContextCache() // mode switch must bypass cache
      this.refreshYC()
      if (this.mode === 'live') { this.refreshMovers() }
    }
  },

  methods: {
    selectTicker (ticker) { this.selectedTicker = ticker },
    onModeChange () {},
    onDateChange () { if (this.selectedDate) { this.refreshYC() } },
    onTickerInput () {
      const t = this.tickerInput.trim().toUpperCase()
      if (t) { this.selectedTicker = t; this.tickerInput = '' }
    },

    async refreshYC () {
      this.ycLoading = true
      try {
        let res
        if (this.mode === 'history' && this.selectedDate) {
          const d = moment(this.selectedDate).format('YYYY-MM-DD')
          res = await getWatchlistHistory(d)
          this.historyDate = d
        } else {
          res = await getWatchlist()
          this.historyDate = null
        }
        if (res && res.success) {
          this.ycCandidates = res.data.candidates || []
          this.marketStatus = res.data.market_status || 'closed'
          this.dataDate     = res.data.data_date || null
          if (this.mode === 'live' && this.marketOpen) {
            clearInterval(this.ycTimer)
            this.ycTimer = setInterval(() => this.refreshYC(), REFRESH_MS)
          }
        }
      } catch (_) {} finally { this.ycLoading = false }
    },

    async refreshMovers () {
      if (this.mode !== 'live') { return }
      this.moversLoading = true
      try {
        const res = await getMovers(20)
        if (res && res.success) {
          this.movers = res.data
          clearInterval(this.moverTimer)
          this.moverTimer = setInterval(() => this.refreshMovers(), REFRESH_MS)
        }
      } catch (_) {} finally { this.moversLoading = false }
    },

    fmtVol (n) {
      if (!n) { return '—' }
      if (n >= 1e6) { return (n / 1e6).toFixed(1) + 'M' }
      if (n >= 1e3) { return (n / 1e3).toFixed(0) + 'K' }
      return String(n)
    },
    fmtFloat (n) {
      if (!n) { return '—' }
      return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : String(n)
    },
    scoreBadgeClass (s) {
      return s >= 100 ? 'score-high' : s >= 40 ? 'score-mid' : 'score-low'
    },

    // ═══════════════════════════════════════════════════════════════════
    // Crosshair sync coordinator
    // ═══════════════════════════════════════════════════════════════════
    onCrosshairChange ({ source, timestamp }) {
      // Forward crosshair position to all sibling charts
      this.lastHoveredChart = source
      const allTimeframes = ['1m', '5m', '1d']
      const newSync = {}
      const newSources = {}
      for (const tf of allTimeframes) {
        if (tf === source) {
          // Don't sync back to the source chart
          newSync[tf] = null
          newSources[tf] = ''
        } else {
          newSync[tf] = timestamp
          newSources[tf] = source
        }
      }
      this.syncTimestamps = newSync
      this.syncSources = newSources
    },

    onCrosshairLeave ({ source }) {
      if (this.lastHoveredChart === source) {
        this.lastHoveredChart = null
        this.syncTimestamps = { '1m': null, '5m': null, '1d': null }
        this.syncSources = { '1m': '', '5m': '', '1d': '' }
      }
    },

    onBarSelect ({ source, timestamp, kLineData }) {
      // Bar was clicked → locked on one chart. Optionally sync this to siblings.
      // For now, just log — the locked state is per-chart.
    },

    onBarDeselect ({ source }) {
      // Bar unlocked
    },

    // ═══════════════════════════════════════════════════════════════════
    // Keyboard typeahead — TradingView-style symbol search
    // ═══════════════════════════════════════════════════════════════════
    _onGlobalKeyDown (e) {
      // Ignore if in an input/textarea
      const tag = (e.target && e.target.tagName) || ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Ignore if modifier keys are held
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const key = e.key

      // Arrow up/down → navigate scanner rows
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault()
        this._navigateScanner(key === 'ArrowDown' ? 1 : -1)
        return
      }

      // Enter → confirm typeahead or scanner selection
      if (key === 'Enter') {
        if (this.typeaheadVisible && this.typeaheadText.trim()) {
          this.onTypeaheadEnter()
        }
        return
      }

      // Escape → dismiss typeahead
      if (key === 'Escape') {
        if (this.typeaheadVisible) this.onTypeaheadEsc()
        return
      }

      // Letter/digit → accumulate typeahead
      if (key.length === 1 && /[a-zA-Z0-9.]/.test(key)) {
        this._startTypeahead(key)
      }
    },

    _startTypeahead (char) {
      this.typeaheadVisible = true
      this.typeaheadText += char.toUpperCase()
      // Auto-dismiss after 2s of inactivity
      clearTimeout(this.typeaheadTimer)
      this.typeaheadTimer = setTimeout(() => { this.typeaheadVisible = false; this.typeaheadText = '' }, 2000)
      // Focus the hidden input
      this.$nextTick(() => {
        const inp = this.$refs.typeaheadInput
        if (inp) inp.focus()
      })
    },

    onTypeaheadEnter () {
      const t = this.typeaheadText.trim().toUpperCase()
      if (t) {
        this.selectedTicker = t
        clearContextCache()
        if (this.mode === 'live') {
          this.refreshYC()
          this.refreshMovers()
        }
      }
      this.typeaheadVisible = false
      this.typeaheadText = ''
    },

    onTypeaheadEsc () {
      this.typeaheadVisible = false
      this.typeaheadText = ''
    },

    resetTypeaheadTimer () {
      // Keep typeahead visible while user is typing in the input
      clearTimeout(this.typeaheadTimer)
      this.typeaheadTimer = setTimeout(() => { this.typeaheadVisible = false; this.typeaheadText = '' }, 2000)
    },

    _navigateScanner (dir) {
      // Navigate through YC Scanner candidates
      const list = this.ycCandidates
      if (!list || !list.length) return
      const max = list.length - 1
      let idx = this.scannerHighlightIndex + dir
      if (idx < 0) idx = max
      if (idx > max) idx = 0
      this.scannerHighlightIndex = idx
      // Select the ticker
      const item = list[idx]
      if (item && item.ticker) {
        this.selectedTicker = item.ticker
      }
    },
  }
}
</script>

<style scoped>
.cockpit-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #f0f2f5;
}
.cockpit-dark { background: #111; }

/* ── Top bar ── */
.cockpit-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 32px;
  flex-shrink: 0;
  background: #001529;
  color: #fff;
  gap: 12px;
}
.topbar-left  { display: flex; align-items: center; gap: 10px; }
.topbar-right { display: flex; align-items: center; gap: 8px; }

/* ── Typeahead (TradingView symbol search) ── */
.typeahead-wrap {
  display: flex; align-items: center; gap: 4px;
  background: #1e222d; border: 1px solid #2a2e39;
  border-radius: 4px; padding: 0 8px; height: 28px;
}
.typeahead-icon { font-size: 13px; color: #787b86; }
.typeahead-input {
  width: 80px; height: 22px; border: none; outline: none;
  background: transparent; color: #d1d4dc;
  font-size: 13px; font-family: 'SF Mono', 'Menlo', monospace;
  font-weight: 600; letter-spacing: 0.5px;
}
.typeahead-input::placeholder { color: #555; }
.topbar-logo   { font-size: 13px; font-weight: 700; color: #1890ff; letter-spacing: 0.04em; }
.topbar-ticker { font-size: 14px; font-weight: 700; color: #fff; }
.topbar-date   { font-size: 11px; color: #888; }
.market-open   { font-size: 11px; color: #52c41a; }
.market-closed { font-size: 11px; color: #faad14; }

/* ── Body fills remaining height ── */
.cockpit-body { flex: 1; min-height: 0; }
.h-full { height: 100%; }
.col-pane { height: 100%; overflow: hidden; }

/* ── Splitpanes gutter ── */
:deep(.splitpanes__splitter) {
  background: #d9d9d9 !important; z-index: 1; transition: background 0.15s;
}
:deep(.splitpanes__splitter:hover),
:deep(.splitpanes__splitter:active) { background: #1890ff !important; }
.cockpit-dark :deep(.splitpanes__splitter) { background: #2a2a2a !important; }
:deep(.splitpanes--horizontal > .splitpanes__splitter) {
  height: 4px !important; min-height: 4px; cursor: row-resize;
}
:deep(.splitpanes--vertical > .splitpanes__splitter) {
  width: 4px !important; min-width: 4px; cursor: col-resize;
}

/* ── Score badges (used in customRender VNodes) ── */
:deep(.score-badge) { display: inline-block; padding: 1px 4px; border-radius: 3px; font-weight: 600; font-size: 11px; }
:deep(.score-high)  { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
:deep(.score-mid)   { background: #fffbe6; color: #d48806; border: 1px solid #ffe58f; }
:deep(.score-low)   { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }
:deep(.pos) { color: #389e0d; font-weight: 500; }
:deep(.neg) { color: #cf1322; font-weight: 500; }
</style>
