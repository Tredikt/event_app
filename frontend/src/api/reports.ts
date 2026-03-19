import api from './client'

export const reportsApi = {
  getReasons: () => api.get<string[]>('/reports/reasons'),
  create: (data: { reported_user_id: number; reason: string; comment?: string }) =>
    api.post('/reports', data),
}
