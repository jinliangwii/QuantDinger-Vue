import request from '@/utils/request'

export function getDatasourceStatus () {
  return request({ url: '/api/settings/datasource/status', method: 'get' })
}
