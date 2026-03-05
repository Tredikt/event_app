import api from './client'
import type { Event, EventList, Category, Participant, Subscription } from '@/types'

export interface EventFilters {
  category_id?: number
  date_from?: string
  date_to?: string
  only_available?: boolean
  search?: string
  skip?: number
  limit?: number
}

export interface CreateEventData {
  title: string
  description: string
  date: string
  capacity: number
  address: string
  latitude?: number
  longitude?: number
  category_id: number
}

export const eventsApi = {
  getCategories: () => api.get<Category[]>('/events/categories'),

  list: (filters?: EventFilters) => api.get<EventList[]>('/events', { params: filters }),

  get: (id: number) => api.get<Event>(`/events/${id}`),

  create: (data: CreateEventData) => api.post<Event>('/events', data),

  update: (id: number, data: Partial<CreateEventData>) => api.put<Event>(`/events/${id}`, data),

  delete: (id: number) => api.delete(`/events/${id}`),

  uploadImage: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<Event>(`/events/${id}/image`, form)
  },

  join: (id: number) => api.post(`/events/${id}/join`),

  leave: (id: number) => api.delete(`/events/${id}/join`),

  getParticipants: (id: number) => api.get<Participant[]>(`/events/${id}/participants`),

  myStatus: (id: number) =>
    api.get<{ joined: boolean; subscribed: boolean }>(`/events/${id}/my-status`),

  subscribe: (id: number, notify_telegram: boolean, notify_email: boolean) =>
    api.post<Subscription>(`/events/${id}/subscribe`, { notify_telegram, notify_email }),

  unsubscribe: (id: number) => api.delete(`/events/${id}/subscribe`),

  myOrganized: () => api.get<EventList[]>('/events/my/organized'),

  myJoined: () => api.get<EventList[]>('/events/my/joined'),
}
