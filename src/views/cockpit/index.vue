<template>
  <div class="cockpit-page" :class="{ 'theme-dark': isDarkTheme }">
    <!-- Page header -->
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">
          <a-icon type="radar-chart" class="title-icon" />
          Pre-market Cockpit
        </h2>
        <p class="page-subtitle">Selection layer — ranked gap-and-go candidates</p>
      </div>
      <div class="page-header-right">
        <a-radio-group v-model="mode" button-style="solid" size="small" @change="onModeChange">
          <a-radio-button value="live">Live</a-radio-button>
          <a-radio-button value="history">History</a-radio-button>
        </a-radio-group>
        <a-date-picker
          v-if="mode === 'history'"
          v-model="selectedDate"
          size="small"
          format="YYYY-MM-DD"
          style="margin-left: 8px; width: 140px"
          @change="onDateChange"
        />
        <a-button size="small" style="margin-left: 8px" :loading="loading" @click="refresh">
          <a-icon type="reload" />
        </a-button>
        <span v-if="lastFetched" class="last-fetched">{{ lastFetched }}</span>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-icon" style="color: #1890ff; background: rgba(24,144,255,0.1)">
          <a-icon type="unordered-list" />
        </div>
        <div class="kpi-body">
          <div class="kpi-label">Candidates</div>
          <div class="kpi-value">{{ candidates.length || '—' }}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="color: #52c41a; background: rgba(82,196,26,0.1)">
          <a-icon type="trophy" />
        </div>
        <div class="kpi-body">
          <div class="kpi-label">Top score</div>
          <div class="kpi-value">{{ topScore }}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" :style="marketOpen ? 'color:#52c41a;background:rgba(82,196,26,0.1)' : 'color:#faad14;background:rgba(250,173,20,0.1)'">
          <a-icon :type="marketOpen ? 'check-circle' : 'clock-circle'" />
        </div>
        <div class="kpi-body">
          <div class="kpi-label">Market</div>
          <div class="kpi-value">{{ marketOpen ? 'Open' : 'Closed' }}</div>
        </div>
      </div>
      <div class="kpi-card" v-if="dataDate">
        <div class="kpi-icon" style="color: #722ed1; background: rgba(114,46,209,0.1)">
          <a-icon type="calendar" />
        </div>
        <div class="kpi-body">
          <div class="kpi-label">Data date</div>
          <div class="kpi-value">{{ dataDate }}</div>
        </div>
      </div>
    </div>

    <!-- Alerts -->
    <a-alert
      v-if="mode === 'live' && !marketOpen"
      type="warning"
      :message="`Market closed — showing last trading session (${dataDate})`"
      show-icon
      style="margin-bottom: 12px"
    />
    <a-alert
      v-if="error"
      type="error"
      :message="error"
      closable
      style="margin-bottom: 12px"
      @close="error = null"
    />

    <!-- Main tabs -->
    <a-tabs v-model="activeTab" :animated="false">
      <!-- ── Watchlist tab ── -->
      <a-tab-pane key="watchlist" tab="Watchlist">
        <a-table
          :columns="columns"
          :data-source="candidates"
          :loading="loading"
          :pagination="false"
          row-key="ticker"
          size="small"
          :locale="{ emptyText: emptyText }"
          :custom-row="makeRow"
          :row-class-name="rowClass"
        >
          <span slot="rank" slot-scope="text, record, index">{{ index + 1 }}</span>
          <span slot="ticker" slot-scope="text"><strong>{{ text }}</strong></span>
          <span slot="score" slot-scope="text, record">
            <a-tooltip :title="scoreTooltip(record)">
              <span class="score-badge" :class="scoreBadgeClass(record.score)">
                {{ record.score.toFixed(2) }}
              </span>
            </a-tooltip>
          </span>
          <span slot="gap_pct" slot-scope="text">
            <span class="positive">+{{ text.toFixed(1) }}%</span>
          </span>
          <span slot="rvol" slot-scope="text">
            <span :class="text >= 5 ? 'positive' : ''">{{ text.toFixed(1) }}x</span>
          </span>
          <span slot="premarket_vol" slot-scope="text">{{ formatVol(text) }}</span>
          <span slot="float_shares" slot-scope="text, record">
            <span :class="{ 'stale-flag': record.float_stale }">
              {{ formatFloat(text) }}
              <a-tooltip v-if="record.float_stale" title="Float data is stale (>30 days)">
                <a-icon type="warning" style="color: #faad14; margin-left: 4px" />
              </a-tooltip>
            </span>
          </span>
          <span slot="price" slot-scope="text">${{ text.toFixed(2) }}</span>
          <span slot="prev_hl" slot-scope="text, record">
            <span v-if="record.prev_high" class="level-resistance">${{ record.prev_high.toFixed(2) }}</span>
            <span v-if="record.prev_high && record.prev_low" class="level-sep"> / </span>
            <span v-if="record.prev_low" class="level-support">${{ record.prev_low.toFixed(2) }}</span>
            <span v-if="!record.prev_high && !record.prev_low" class="muted">—</span>
          </span>
          <span slot="key_dollars" slot-scope="text, record">
            <span v-if="record.whole_dollar_above" class="level-resistance">↑${{ record.whole_dollar_above }}</span>
            <span v-if="record.whole_dollar_above && record.whole_dollar_below"> </span>
            <span v-if="record.whole_dollar_below" class="level-support">↓${{ record.whole_dollar_below }}</span>
            <span v-if="!record.whole_dollar_above && !record.whole_dollar_below" class="muted">—</span>
          </span>
        </a-table>

        <div v-if="!loading && candidates.length" class="cockpit-footer">
          {{ candidates.length }} candidate{{ candidates.length !== 1 ? 's' : '' }}
          <span v-if="mode === 'history' && historyDate"> for {{ historyDate }}</span>
          <span v-else-if="mode === 'live'"> · auto-refresh every 2 min{{ marketOpen ? '' : ' (paused — market closed)' }}</span>
          <span v-if="selectedCandidate" class="footer-hint"> · click a row to view levels</span>
        </div>
      </a-tab-pane>

      <!-- ── Levels tab ── -->
      <a-tab-pane key="levels" tab="Levels">
        <!-- No selection yet -->
        <div v-if="!selectedCandidate" class="levels-empty">
          <a-icon type="arrow-left" class="levels-empty-icon" />
          <p>Select a ticker from the Watchlist to view its S/R context</p>
        </div>

        <!-- Levels panel -->
        <div v-else class="levels-panel">
          <!-- Ticker header -->
          <div class="levels-header">
            <div class="levels-ticker">
              <strong>{{ selectedCandidate.ticker }}</strong>
              <span class="levels-price">${{ selectedCandidate.price.toFixed(2) }}</span>
              <span class="positive levels-gap">+{{ selectedCandidate.gap_pct.toFixed(1) }}%</span>
            </div>
            <a-button size="small" @click="selectedCandidate = null; fullLevels = null">
              <a-icon type="close" /> Clear
            </a-button>
          </div>

          <!-- Two-column layout: quick levels + session levels -->
          <div class="levels-grid">
            <!-- Quick levels (from watchlist data, instant) -->
            <div class="levels-section">
              <div class="levels-section-title">Quick Levels</div>
              <div class="level-row">
                <span class="level-dot resistance"></span>
                <span class="level-name">Prev Day High</span>
                <span class="level-val level-resistance">
                  {{ selectedCandidate.prev_high ? '$' + selectedCandidate.prev_high.toFixed(2) : '—' }}
                </span>
              </div>
              <div class="level-row">
                <span class="level-dot resistance"></span>
                <span class="level-name">Next $ Up</span>
                <span class="level-val level-resistance">
                  {{ selectedCandidate.whole_dollar_above ? '$' + selectedCandidate.whole_dollar_above.toFixed(0) : '—' }}
                </span>
              </div>
              <div class="level-row current">
                <span class="level-dot current"></span>
                <span class="level-name">Current Price</span>
                <span class="level-val level-current">${{ selectedCandidate.price.toFixed(2) }}</span>
              </div>
              <div class="level-row">
                <span class="level-dot support"></span>
                <span class="level-name">Next $ Down</span>
                <span class="level-val level-support">
                  {{ selectedCandidate.whole_dollar_below ? '$' + selectedCandidate.whole_dollar_below.toFixed(0) : '—' }}
                </span>
              </div>
              <div class="level-row">
                <span class="level-dot support"></span>
                <span class="level-name">Prev Day Low</span>
                <span class="level-val level-support">
                  {{ selectedCandidate.prev_low ? '$' + selectedCandidate.prev_low.toFixed(2) : '—' }}
                </span>
              </div>
            </div>

            <!-- Session levels (from /levels API, async) -->
            <div class="levels-section">
              <div class="levels-section-title">
                Session Levels
                <a-spin v-if="levelsLoading" size="small" style="margin-left: 8px" />
              </div>
              <template v-if="levelsError">
                <a-alert type="warning" :message="levelsError" style="font-size: 12px" />
              </template>
              <template v-else>
                <div class="level-row">
                  <span class="level-dot pm-resistance"></span>
                  <span class="level-name">Pre-mkt High</span>
                  <span class="level-val">
                    {{ fullLevels && fullLevels.premarket_high ? '$' + fullLevels.premarket_high.toFixed(2) : (levelsLoading ? '…' : '—') }}
                  </span>
                </div>
                <div class="level-row">
                  <span class="level-dot vwap"></span>
                  <span class="level-name">VWAP</span>
                  <span class="level-val level-vwap">
                    {{ fullLevels && fullLevels.vwap ? '$' + fullLevels.vwap.toFixed(2) : (levelsLoading ? '…' : '—') }}
                  </span>
                </div>
                <div class="level-row">
                  <span class="level-dot pm-support"></span>
                  <span class="level-name">Pre-mkt Low</span>
                  <span class="level-val">
                    {{ fullLevels && fullLevels.premarket_low ? '$' + fullLevels.premarket_low.toFixed(2) : (levelsLoading ? '…' : '—') }}
                  </span>
                </div>
              </template>
            </div>
          </div>

          <!-- Price ruler -->
          <div class="ruler-section" v-if="priceRulerItems.length">
            <div class="levels-section-title">Price Ruler</div>
            <div class="price-ruler">
              <div
                v-for="item in priceRulerItems"
                :key="item.key"
                class="ruler-line"
                :class="['ruler-' + item.type]"
                :style="{ bottom: item.pct + '%' }"
              >
                <span class="ruler-price">${{ item.price.toFixed(2) }}</span>
                <span class="ruler-track-line" :style="{ borderColor: item.color, borderStyle: item.dash ? 'dashed' : 'solid' }"></span>
                <span class="ruler-label">{{ item.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </a-tab-pane>

      <!-- ── Signals tab (deferred) ── -->
      <a-tab-pane key="signals" tab="Signals (M2)">
        <div class="coming-soon">
          <a-icon type="bell" class="coming-soon-icon" />
          <p>Real-time trigger alerts — coming in M2</p>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script>
import moment from 'moment'
import { baseMixin } from '@/store/app-mixin'
import { getWatchlist, getWatchlistHistory, getLevels } from '@/api/cockpit'

const COLUMNS = [
  { title: '#', key: 'rank', scopedSlots: { customRender: 'rank' }, width: 40 },
  { title: 'Ticker', dataIndex: 'ticker', scopedSlots: { customRender: 'ticker' }, width: 80 },
  { title: 'Score', dataIndex: 'score', scopedSlots: { customRender: 'score' }, width: 80, defaultSortOrder: 'descend', sorter: (a, b) => a.score - b.score },
  { title: 'Gap %', dataIndex: 'gap_pct', scopedSlots: { customRender: 'gap_pct' }, width: 80, sorter: (a, b) => a.gap_pct - b.gap_pct },
  { title: 'RVOL', dataIndex: 'rvol', scopedSlots: { customRender: 'rvol' }, width: 70, sorter: (a, b) => a.rvol - b.rvol },
  { title: 'Pre-mkt Vol', dataIndex: 'premarket_vol', scopedSlots: { customRender: 'premarket_vol' }, width: 100, sorter: (a, b) => a.premarket_vol - b.premarket_vol },
  { title: 'Float', dataIndex: 'float_shares', scopedSlots: { customRender: 'float_shares' }, width: 90, sorter: (a, b) => a.float_shares - b.float_shares },
  { title: 'Price', dataIndex: 'price', scopedSlots: { customRender: 'price' }, width: 70, sorter: (a, b) => a.price - b.price },
  { title: 'Prev H/L', key: 'prev_hl', scopedSlots: { customRender: 'prev_hl' }, width: 110 },
  { title: 'Key $', key: 'key_dollars', scopedSlots: { customRender: 'key_dollars' }, width: 90 }
]

const REFRESH_INTERVAL_MS = 120_000

export default {
  name: 'CockpitPage',
  mixins: [baseMixin],
  data () {
    return {
      candidates: [],
      loading: false,
      error: null,
      mode: 'live',
      activeTab: 'watchlist',
      selectedDate: null,
      historyDate: null,
      lastFetched: null,
      marketStatus: 'live',
      dataDate: null,
      columns: COLUMNS,
      _timer: null,
      // Context layer
      selectedCandidate: null,
      fullLevels: null,
      levelsLoading: false,
      levelsError: null
    }
  },
  computed: {
    isDarkTheme () {
      return this.navTheme === 'dark' || this.navTheme === 'realdark'
    },
    marketOpen () {
      return this.marketStatus !== 'closed'
    },
    topScore () {
      if (!this.candidates.length) return '—'
      return this.candidates[0].score.toFixed(1)
    },
    emptyText () {
      if (this.loading) return 'Loading...'
      if (this.mode === 'live') return 'No candidates — run pre-market (before 9:30am ET)'
      return 'No candidates for this date'
    },
    priceRulerItems () {
      const c = this.selectedCandidate
      if (!c) return []
      const fl = this.fullLevels || {}

      const raw = [
        { key: 'prev_high', label: 'Prev High', price: c.prev_high, type: 'resistance', color: '#cf1322', dash: true },
        { key: 'dollar_up', label: `$${c.whole_dollar_above}`, price: c.whole_dollar_above, type: 'resistance', color: '#fa8c16', dash: false },
        { key: 'price', label: 'Price', price: c.price, type: 'current', color: '#1890ff', dash: false },
        { key: 'dollar_dn', label: `$${c.whole_dollar_below}`, price: c.whole_dollar_below, type: 'support', color: '#52c41a', dash: false },
        { key: 'prev_low', label: 'Prev Low', price: c.prev_low, type: 'support', color: '#389e0d', dash: true }
      ]

      if (fl.premarket_high) raw.push({ key: 'pm_high', label: 'PM High', price: fl.premarket_high, type: 'pm-resistance', color: '#d46b08', dash: true })
      if (fl.vwap) raw.push({ key: 'vwap', label: 'VWAP', price: fl.vwap, type: 'vwap', color: '#722ed1', dash: true })
      if (fl.premarket_low) raw.push({ key: 'pm_low', label: 'PM Low', price: fl.premarket_low, type: 'pm-support', color: '#7cb305', dash: true })

      const prices = raw.filter(l => l.price > 0).map(l => l.price)
      if (!prices.length) return []

      const minP = Math.min(...prices)
      const maxP = Math.max(...prices)
      const range = maxP - minP || 0.01
      const pad = range * 0.12

      return raw
        .filter(l => l.price > 0)
        .map(l => ({ ...l, pct: ((l.price - (minP - pad)) / (range + 2 * pad)) * 100 }))
        .sort((a, b) => a.price - b.price)
    }
  },
  mounted () {
    this.refresh()
  },
  beforeDestroy () {
    this._clearTimer()
  },
  watch: {
    mode (val) {
      this._clearTimer()
      this.candidates = []
      this.selectedCandidate = null
      this.fullLevels = null
      if (val === 'live') this.refresh()
    }
  },
  methods: {
    async refresh () {
      this.loading = true
      this.error = null
      try {
        let res
        if (this.mode === 'history' && this.selectedDate) {
          const dateStr = moment(this.selectedDate).format('YYYY-MM-DD')
          res = await getWatchlistHistory(dateStr)
          this.historyDate = dateStr
        } else {
          res = await getWatchlist()
          this.historyDate = null
        }
        if (res && res.success) {
          this.candidates = res.data.candidates || []
          this.marketStatus = res.data.market_status || 'live'
          this.dataDate = res.data.data_date || null
          this.lastFetched = 'Updated ' + moment().format('HH:mm:ss')
          this._startTimer()
          // Re-fetch levels for selected candidate if it's still in the list
          if (this.selectedCandidate) {
            const refreshed = this.candidates.find(c => c.ticker === this.selectedCandidate.ticker)
            if (refreshed) this.selectedCandidate = refreshed
          }
        } else {
          this.error = (res && res.error) || 'Fetch failed'
        }
      } catch (e) {
        this.error = e.message || 'Network error'
      } finally {
        this.loading = false
      }
    },
    async selectCandidate (record) {
      this.selectedCandidate = record
      this.fullLevels = null
      this.levelsError = null
      this.activeTab = 'levels'
      await this.fetchFullLevels(record.ticker)
    },
    async fetchFullLevels (ticker) {
      this.levelsLoading = true
      this.levelsError = null
      try {
        const date = this.historyDate || null
        const res = await getLevels(ticker, date)
        if (res && res.success) {
          this.fullLevels = res.data
        } else {
          this.levelsError = (res && res.error) || 'Levels fetch failed'
        }
      } catch (e) {
        this.levelsError = e.message || 'Network error'
      } finally {
        this.levelsLoading = false
      }
    },
    makeRow (record) {
      return {
        style: { cursor: 'pointer' },
        on: { click: () => this.selectCandidate(record) }
      }
    },
    rowClass (record) {
      return this.selectedCandidate && this.selectedCandidate.ticker === record.ticker
        ? 'row-selected'
        : ''
    },
    _startTimer () {
      this._clearTimer()
      if (this.mode !== 'live' || !this.marketOpen) return
      this._timer = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS)
    },
    _clearTimer () {
      if (this._timer) { clearInterval(this._timer); this._timer = null }
    },
    onModeChange () {
      // watch handles reset + refresh
    },
    onDateChange () {
      if (this.selectedDate) this.refresh()
    },
    formatVol (n) {
      if (!n) return '—'
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
      return String(n)
    },
    formatFloat (n) {
      if (!n) return '—'
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
      return String(n)
    },
    scoreTooltip (record) {
      const c = record.score_components || {}
      return `gap ${c.gap_pct}% × rvol ${c.rvol}x × float-tier ${c.float_tier} = ${c.raw}`
    },
    scoreBadgeClass (score) {
      if (score >= 100) return 'score-high'
      if (score >= 40) return 'score-mid'
      return 'score-low'
    }
  }
}
</script>

<style scoped>
.cockpit-page {
  padding: 16px 24px;
  min-height: 100%;
}

/* ── Header ── */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}
.page-header-left { flex: 1; }
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
}
.title-icon { margin-right: 8px; }
.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: #888;
}
.page-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.last-fetched {
  font-size: 11px;
  color: #888;
  margin-left: 6px;
}

/* ── KPI strip ── */
.kpi-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.kpi-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 10px 16px;
  min-width: 120px;
  flex: 1;
}
.theme-dark .kpi-card {
  background: #1f1f1f;
  border-color: #333;
}
.kpi-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.kpi-body { line-height: 1.3; }
.kpi-label { font-size: 11px; color: #888; }
.kpi-value { font-size: 18px; font-weight: 600; }

/* ── Score badges ── */
.score-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 12px;
}
.score-high { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
.score-mid  { background: #fffbe6; color: #d48806; border: 1px solid #ffe58f; }
.score-low  { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }

.positive { color: #389e0d; font-weight: 500; }
.stale-flag { opacity: 0.75; }
.muted { color: #bbb; }

/* Level colors in table */
.level-resistance { color: #cf1322; font-weight: 500; }
.level-support    { color: #389e0d; font-weight: 500; }
.level-sep        { color: #bbb; }

/* ── Selected row highlight ── */
:deep(.row-selected td) { background: rgba(24, 144, 255, 0.06) !important; }

/* ── Footer ── */
.cockpit-footer {
  margin-top: 8px;
  font-size: 12px;
  color: #888;
  text-align: right;
}
.footer-hint { font-style: italic; }

/* ── Levels tab ── */
.levels-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  color: #bbb;
  text-align: center;
}
.levels-empty-icon {
  font-size: 36px;
  margin-bottom: 12px;
  opacity: 0.4;
}
.levels-empty p { font-size: 14px; margin: 0; }

.levels-panel { padding: 4px 0; }

.levels-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}
.theme-dark .levels-header { border-bottom-color: #333; }
.levels-ticker { display: flex; align-items: baseline; gap: 10px; }
.levels-ticker strong { font-size: 22px; }
.levels-price { font-size: 18px; color: #1890ff; font-weight: 600; }
.levels-gap { font-size: 14px; }

.levels-grid {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.levels-section {
  flex: 1;
  min-width: 200px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px 16px;
}
.theme-dark .levels-section {
  background: #1a1a1a;
  border-color: #333;
}
.levels-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

.level-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  font-size: 13px;
}
.level-row:last-child { border-bottom: none; }
.level-row.current { font-weight: 600; }

.level-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.level-dot.resistance   { background: #cf1322; }
.level-dot.support      { background: #389e0d; }
.level-dot.current      { background: #1890ff; }
.level-dot.vwap         { background: #722ed1; }
.level-dot.pm-resistance{ background: #d46b08; }
.level-dot.pm-support   { background: #7cb305; }

.level-name { flex: 1; color: #555; }
.theme-dark .level-name { color: #aaa; }

.level-val { font-weight: 600; font-variant-numeric: tabular-nums; }
.level-current { color: #1890ff; }
.level-vwap    { color: #722ed1; }

/* ── Price ruler ── */
.ruler-section {
  margin-top: 8px;
}

.price-ruler {
  position: relative;
  height: 280px;
  margin: 12px 16px;
  border-left: 2px solid #d9d9d9;
}
.theme-dark .price-ruler { border-left-color: #444; }

.ruler-line {
  position: absolute;
  left: -1px;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translateY(50%);
}

.ruler-price {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #555;
  width: 48px;
  text-align: right;
  flex-shrink: 0;
  margin-left: 6px;
}
.theme-dark .ruler-price { color: #aaa; }

.ruler-track-line {
  flex: 1;
  border-top-width: 1.5px;
  border-top-style: solid;
  display: block;
  height: 0;
}

.ruler-label {
  font-size: 11px;
  color: #888;
  white-space: nowrap;
}

/* Current price line is thicker and solid */
.ruler-current .ruler-track-line {
  border-width: 2px !important;
  border-style: solid !important;
}
.ruler-current .ruler-price,
.ruler-current .ruler-label {
  color: #1890ff;
  font-weight: 700;
}

/* ── Coming soon placeholder ── */
.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  color: #bbb;
  text-align: center;
}
.coming-soon-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.4;
}
.coming-soon p { font-size: 14px; margin: 0; }
</style>
