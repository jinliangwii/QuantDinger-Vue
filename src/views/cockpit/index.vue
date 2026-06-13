<template>
  <div class="cockpit-page" :class="{ 'theme-dark': isDarkTheme }">
    <!-- Page header — matches trading-bot / strategy-center pattern -->
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
      <a-tab-pane key="watchlist" tab="Watchlist">
        <a-table
          :columns="columns"
          :data-source="candidates"
          :loading="loading"
          :pagination="false"
          row-key="ticker"
          size="small"
          :locale="{ emptyText: emptyText }"
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
        </a-table>

        <div v-if="!loading && candidates.length" class="cockpit-footer">
          {{ candidates.length }} candidate{{ candidates.length !== 1 ? 's' : '' }}
          <span v-if="mode === 'history' && historyDate"> for {{ historyDate }}</span>
          <span v-else-if="mode === 'live'"> · auto-refresh every 2 min{{ marketOpen ? '' : ' (paused — market closed)' }}</span>
        </div>
      </a-tab-pane>

      <a-tab-pane key="chart" tab="Chart (M2)">
        <div class="coming-soon">
          <a-icon type="area-chart" class="coming-soon-icon" />
          <p>Chart overlays (VWAP, S/R levels, prev-day H/L) — coming in M2</p>
        </div>
      </a-tab-pane>

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
import { getWatchlist, getWatchlistHistory } from '@/api/cockpit'

const COLUMNS = [
  { title: '#', key: 'rank', scopedSlots: { customRender: 'rank' }, width: 40 },
  { title: 'Ticker', dataIndex: 'ticker', scopedSlots: { customRender: 'ticker' }, width: 80 },
  { title: 'Score', dataIndex: 'score', scopedSlots: { customRender: 'score' }, width: 80, defaultSortOrder: 'descend', sorter: (a, b) => a.score - b.score },
  { title: 'Gap %', dataIndex: 'gap_pct', scopedSlots: { customRender: 'gap_pct' }, width: 80, sorter: (a, b) => a.gap_pct - b.gap_pct },
  { title: 'RVOL', dataIndex: 'rvol', scopedSlots: { customRender: 'rvol' }, width: 70, sorter: (a, b) => a.rvol - b.rvol },
  { title: 'Pre-mkt Vol', dataIndex: 'premarket_vol', scopedSlots: { customRender: 'premarket_vol' }, width: 100, sorter: (a, b) => a.premarket_vol - b.premarket_vol },
  { title: 'Float', dataIndex: 'float_shares', scopedSlots: { customRender: 'float_shares' }, width: 90, sorter: (a, b) => a.float_shares - b.float_shares },
  { title: 'Price', dataIndex: 'price', scopedSlots: { customRender: 'price' }, width: 70, sorter: (a, b) => a.price - b.price }
]

const REFRESH_INTERVAL_MS = 120_000  // 2 minutes

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
      _timer: null
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
        } else {
          this.error = (res && res.error) || 'Fetch failed'
        }
      } catch (e) {
        this.error = e.message || 'Network error'
      } finally {
        this.loading = false
      }
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
      // watch handles the reset + refresh trigger
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

/* ── Footer ── */
.cockpit-footer {
  margin-top: 8px;
  font-size: 12px;
  color: #888;
  text-align: right;
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
