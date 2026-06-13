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

export function getContext (ticker, { date, timeframe } = {}) {
  const params = {}
  if (date) params.date = date
  if (timeframe) params.timeframe = timeframe
  return request({ url: `/api/cockpit/context/${ticker}`, method: 'get', params })
}

export function getMovers (top = 20) {
  return request({ url: '/api/cockpit/movers', method: 'get', params: { top } })
}
