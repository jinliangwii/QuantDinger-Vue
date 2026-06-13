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
      </div>
    </div>

    <!-- ── Main panel grid ── -->
    <splitpanes class="cockpit-body">

      <!-- Left column: scanner panels -->
      <pane :size="leftSize" min-size="18" class="col-pane">
        <splitpanes horizontal class="h-full">

          <!-- YC Scanner -->
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
            >
              <template #rank="{ index }">{{ index + 1 }}</template>
              <template #ticker="{ text }"><strong>{{ text }}</strong></template>
              <template #score="{ text, record }">
                <span class="score-badge" :class="scoreBadgeClass(record.score)">{{ record.score.toFixed(1) }}</span>
              </template>
              <template #gap_pct="{ text }"><span class="pos">+{{ text.toFixed(1) }}%</span></template>
              <template #rvol="{ text }"><span :class="text >= 5 ? 'pos' : ''">{{ text.toFixed(1) }}x</span></template>
              <template #vol="{ text }">{{ fmtVol(text) }}</template>
              <template #float="{ text }">{{ fmtFloat(text) }}</template>
            </scanner-panel>
          </pane>

          <!-- Most Active -->
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
            >
              <template #rank="{ record }">{{ record.rank }}</template>
              <template #ticker="{ text }"><strong>{{ text }}</strong></template>
              <template #price="{ text }">${{ text.toFixed(2) }}</template>
              <template #change_pct="{ text }">
                <span :class="text >= 0 ? 'pos' : 'neg'">{{ text >= 0 ? '+' : '' }}{{ text.toFixed(2) }}%</span>
              </template>
              <template #volume="{ text }">{{ fmtVol(text) }}</template>
            </scanner-panel>
          </pane>

          <!-- Top Gainers -->
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
            >
              <template #rank="{ record }">{{ record.rank }}</template>
              <template #ticker="{ text }"><strong>{{ text }}</strong></template>
              <template #price="{ text }">${{ text.toFixed(2) }}</template>
              <template #change_pct="{ text }">
                <span :class="text >= 0 ? 'pos' : 'neg'">{{ text >= 0 ? '+' : '' }}{{ text.toFixed(2) }}%</span>
              </template>
              <template #volume="{ text }">{{ fmtVol(text) }}</template>
            </scanner-panel>
          </pane>

        </splitpanes>
      </pane>

      <!-- Right column: charts -->
      <pane min-size="30" class="col-pane">
        <splitpanes horizontal class="h-full">

          <pane min-size="15">
            <context-chart
              :ticker="selectedTicker"
              :date="historyDate || ''"
              timeframe="1m"
              :dark="isDarkTheme"
              class="h-full"
            />
          </pane>

          <pane min-size="15">
            <context-chart
              :ticker="selectedTicker"
              :date="historyDate || ''"
              timeframe="5m"
              :dark="isDarkTheme"
              class="h-full"
            />
          </pane>

          <pane min-size="15">
            <context-chart
              :ticker="selectedTicker"
              :date="historyDate || ''"
              timeframe="1d"
              :dark="isDarkTheme"
              class="h-full"
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
import { getWatchlist, getWatchlistHistory, getMovers } from '@/api/cockpit'
import ScannerPanel from './ScannerPanel.vue'
import ContextChart from './ContextChart.vue'

const YC_COLUMNS = [
  { title: '#',     key: 'rank',          scopedSlots: { customRender: 'rank' },      width: 28 },
  { title: 'Tick',  dataIndex: 'ticker',  scopedSlots: { customRender: 'ticker' },    width: 52 },
  { title: 'Score', dataIndex: 'score',   scopedSlots: { customRender: 'score' },     width: 52, sorter: (a, b) => a.score - b.score, defaultSortOrder: 'descend' },
  { title: 'Gap%',  dataIndex: 'gap_pct', scopedSlots: { customRender: 'gap_pct' },   width: 50, sorter: (a, b) => a.gap_pct - b.gap_pct },
  { title: 'RVOL',  dataIndex: 'rvol',    scopedSlots: { customRender: 'rvol' },      width: 44, sorter: (a, b) => a.rvol - b.rvol },
  { title: 'Vol',   dataIndex: 'premarket_vol', scopedSlots: { customRender: 'vol' }, width: 50, sorter: (a, b) => a.premarket_vol - b.premarket_vol },
  { title: 'Float', dataIndex: 'float_shares',  scopedSlots: { customRender: 'float' }, width: 46 },
]

const MOVER_COLUMNS = [
  { title: '#',    key: 'rank',         scopedSlots: { customRender: 'rank' },       width: 28 },
  { title: 'Tick', dataIndex: 'ticker', scopedSlots: { customRender: 'ticker' },     width: 56 },
  { title: 'Price',dataIndex: 'price',  scopedSlots: { customRender: 'price' },      width: 54, sorter: (a, b) => a.price - b.price },
  { title: 'Chg%', dataIndex: 'change_pct', scopedSlots: { customRender: 'change_pct' }, width: 58, sorter: (a, b) => a.change_pct - b.change_pct },
  { title: 'Vol',  dataIndex: 'volume', scopedSlots: { customRender: 'volume' },     width: 50, sorter: (a, b) => a.volume - b.volume },
]

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
      ycColumns:     YC_COLUMNS,
      moverColumns:  MOVER_COLUMNS,
    }
  },

  computed: {
    isDarkTheme () { return this.navTheme === 'dark' || this.navTheme === 'realdark' },
    marketOpen ()  { return this.marketStatus !== 'closed' },
  },

  mounted () {
    this.ycTimer    = null
    this.moverTimer = null
    this.refreshYC()
    this.refreshMovers()
  },

  beforeDestroy () {
    clearInterval(this.ycTimer)
    clearInterval(this.moverTimer)
  },

  watch: {
    mode () {
      clearInterval(this.ycTimer)
      clearInterval(this.moverTimer)
      this.ycCandidates  = []
      this.movers        = { most_actives: [], top_gainers: [], top_losers: [] }
      this.selectedTicker = ''
      this.refreshYC()
      if (this.mode === 'live') { this.refreshMovers() }
    }
  },

  methods: {
    selectTicker (ticker) { this.selectedTicker = ticker },
    onModeChange () {},
    onDateChange () { if (this.selectedDate) { this.refreshYC() } },

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
    }
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
.topbar-logo   { font-size: 13px; font-weight: 700; color: #1890ff; letter-spacing: 0.04em; }
.topbar-ticker { font-size: 14px; font-weight: 700; color: #fff; }
.topbar-date   { font-size: 11px; color: #888; }
.market-open   { font-size: 11px; color: #52c41a; }
.market-closed { font-size: 11px; color: #faad14; }

/* ── Body fills remaining height ── */
.cockpit-body { flex: 1; min-height: 0; }
.h-full { height: 100%; }
.col-pane { height: 100%; overflow: hidden; }

/* ── Splitpanes gutter styling ── */
:deep(.splitpanes__splitter) {
  background: #d9d9d9 !important;
  z-index: 1;
  transition: background 0.15s;
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

/* ── Score badges ── */
.score-badge { display: inline-block; padding: 1px 4px; border-radius: 3px; font-weight: 600; font-size: 11px; }
.score-high { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
.score-mid  { background: #fffbe6; color: #d48806; border: 1px solid #ffe58f; }
.score-low  { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }
.pos { color: #389e0d; font-weight: 500; }
.neg { color: #cf1322; font-weight: 500; }
</style>
