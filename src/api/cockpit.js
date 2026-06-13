import request from '@/utils/request'

export function getWatchlist () {
  return request({ url: '/api/cockpit/watchlist', method: 'get' })
}

export function getWatchlistHistory (date) {
  return request({ url: '/api/cockpit/watchlist/history', method: 'get', params: { date } })
}
