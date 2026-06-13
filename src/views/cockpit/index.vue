<template>
  <div class="cockpit-page">
    <div class="cockpit-header">
      <h2 class="cockpit-title">Pre-market Watchlist</h2>
      <div class="cockpit-controls">
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

    <a-alert
      v-if="mode === 'live' && marketStatus === 'closed'"
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

    <a-table
      :columns="columns"
      :data-source="candidates"
      :loading="loading"
      :pagination="false"
      row-key="ticker"
      size="small"
      :locale="{ emptyText: emptyText }"
    >
      <!-- Rank -->
      <span slot="rank" slot-scope="text, record, index">{{ index + 1 }}</span>

      <!-- Ticker -->
      <span slot="ticker" slot-scope="text">
        <strong>{{ text }}</strong>
      </span>

      <!-- Score -->
      <span slot="score" slot-scope="text, record">
        <a-tooltip :title="scoreTooltip(record)">
          <span class="score-badge" :class="scoreBadgeClass(record.score)">
            {{ record.score.toFixed(2) }}
          </span>
        </a-tooltip>
      </span>

      <!-- Gap % -->
      <span slot="gap_pct" slot-scope="text">
        <span class="positive">+{{ text.toFixed(1) }}%</span>
      </span>

      <!-- RVOL -->
      <span slot="rvol" slot-scope="text">
        <span :class="text >= 5 ? 'positive' : ''">{{ text.toFixed(1) }}x</span>
      </span>

      <!-- Pre-market vol -->
      <span slot="premarket_vol" slot-scope="text">
        {{ formatVol(text) }}
      </span>

      <!-- Float -->
      <span slot="float_shares" slot-scope="text, record">
        <span :class="{ 'stale-flag': record.float_stale }">
          {{ formatFloat(text) }}
          <a-tooltip v-if="record.float_stale" title="Float data is stale (>30 days)">
            <a-icon type="warning" style="color: #faad14; margin-left: 4px" />
          </a-tooltip>
        </span>
      </span>

      <!-- Price -->
      <span slot="price" slot-scope="text">${{ text.toFixed(2) }}</span>
    </a-table>

    <div v-if="!loading && candidates.length" class="cockpit-footer">
      {{ candidates.length }} candidate{{ candidates.length !== 1 ? 's' : '' }}
      <span v-if="mode === 'history' && historyDate"> for {{ historyDate }}</span>
      <span v-else> (live)</span>
    </div>
  </div>
</template>

<script>
import moment from 'moment'
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

export default {
  name: 'CockpitPage',
  data () {
    return {
      candidates: [],
      loading: false,
      error: null,
      mode: 'live',
      selectedDate: null,
      historyDate: null,
      lastFetched: null,
      marketStatus: 'live',
      dataDate: null,
      columns: COLUMNS
    }
  },
  computed: {
    emptyText () {
      if (this.loading) return 'Loading...'
      if (this.mode === 'live') return 'No candidates — run pre-market (before 9:30am ET)'
      return 'No candidates for this date'
    }
  },
  mounted () {
    this.refresh()
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
        } else {
          this.error = (res && res.error) || 'Fetch failed'
        }
      } catch (e) {
        this.error = e.message || 'Network error'
      } finally {
        this.loading = false
      }
    },
    onModeChange () {
      this.candidates = []
      if (this.mode === 'live') this.refresh()
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

.cockpit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.cockpit-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.cockpit-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.last-fetched {
  font-size: 11px;
  color: #888;
  margin-left: 8px;
}

.score-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 12px;
}

.score-high  { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
.score-mid   { background: #fffbe6; color: #d48806; border: 1px solid #ffe58f; }
.score-low   { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }

.positive { color: #389e0d; font-weight: 500; }

.stale-flag { opacity: 0.75; }

.cockpit-footer {
  margin-top: 8px;
  font-size: 12px;
  color: #888;
  text-align: right;
}
</style>
