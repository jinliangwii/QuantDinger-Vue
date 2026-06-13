import request from '@/utils/request'

export function getWatchlist () {
  return request({ url: '/api/cockpit/watchlist', method: 'get' })
}

export function getWatchlistHistory (date) {
  return request({ url: '/api/cockpit/watchlist/history', method: 'get', params: { date } })
}

export function getLevels (ticker, date) {
  const params = date ? { date } : {}
  return request({ url: `/api/cockpit/levels/${ticker}`, method: 'get', params })
}

// ── Context cache ────────────────────────────────────────────────────────────
// Historical dates are immutable → cached forever.
// Live data (no date) gets a 5-minute TTL so a session refresh still lands fresh data.
// In-flight deduplication: if the same (ticker, timeframe, date) is already
// pending, the second caller gets the same promise — no duplicate XHR.
const _ctxCache    = new Map()
const _ctxInflight = new Map()
const LIVE_TTL_MS  = 5 * 60 * 1000

export function getContext (ticker, { date, timeframe } = {}) {
  const key = `${ticker}|${timeframe || ''}|${date || ''}`

  // Cache hit
  const hit = _ctxCache.get(key)
  if (hit && (Boolean(date) || Date.now() - hit.ts < LIVE_TTL_MS)) {
    return Promise.resolve(hit.data)
  }

  // In-flight dedup — reuse pending promise instead of firing duplicate XHR
  if (_ctxInflight.has(key)) return _ctxInflight.get(key)

  const params = {}
  if (date) params.date = date
  if (timeframe) params.timeframe = timeframe

  const promise = request({ url: `/api/cockpit/context/${ticker}`, method: 'get', params })
    .then(res => {
      _ctxInflight.delete(key)
      if (res && res.success) _ctxCache.set(key, { data: res, ts: Date.now() })
      return res
    })
    .catch(err => { _ctxInflight.delete(key); throw err })

  _ctxInflight.set(key, promise)
  return promise
}

export function clearContextCache () { _ctxCache.clear(); _ctxInflight.clear() }

export function getMovers (top = 20) {
  return request({ url: '/api/cockpit/movers', method: 'get', params: { top } })
}
