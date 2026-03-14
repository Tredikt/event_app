import api from './client'
import type { AttendanceParticipant, Event, EventList, Category, Participant, Subscription, Review } from '@/types'

export interface EventFilters {
  category_id?: number
  date_from?: string
  date_to?: string
  only_available?: boolean
  is_free?: boolean
  search?: string
  is_tour?: boolean
  skip?: number
  limit?: number
}

export interface CreateEventData {
  title: string
  description: string
  date: string
  capacity: number
  min_participants?: number | null
  address: string
  latitude?: number
  longitude?: number
  category_id: number
  is_tour?: boolean
  price?: number | null
  payment_details?: string | null
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

  uploadImages: (id: number, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return api.post<Event>(`/events/${id}/images`, form)
  },

  deleteImage: (eventId: number, imageId: number) =>
    api.delete(`/events/${eventId}/images/${imageId}`),

  join: (id: number) => api.post(`/events/${id}/join`),

  leave: (id: number) => api.delete(`/events/${id}/join`),

  instantiate: (id: number, date: string) =>
    api.post<Event>(`/events/${id}/instantiate`, { date }),

  repeat: (id: number, date: string) =>
    api.post<Event>(`/events/${id}/repeat`, { date }),

  getParticipants: (id: number) => api.get<Participant[]>(`/events/${id}/participants`),

  myStatus: (id: number) =>
    api.get<{ joined: boolean; subscribed: boolean; payment_status: string | null }>(`/events/${id}/my-status`),

  confirmPayment: (id: number) => api.post(`/events/${id}/payment-confirm`),

  approveParticipant: (eventId: number, userId: number) =>
    api.post(`/events/${eventId}/participants/${userId}/approve`),

  rejectParticipant: (eventId: number, userId: number) =>
    api.post(`/events/${eventId}/participants/${userId}/reject`),

  subscribe: (id: number, notify_telegram: boolean, notify_email: boolean) =>
    api.post<Subscription>(`/events/${id}/subscribe`, { notify_telegram, notify_email }),

  unsubscribe: (id: number) => api.delete(`/events/${id}/subscribe`),

  myOrganized: () => api.get<EventList[]>('/events/my/organized'),

  myJoined: () => api.get<EventList[]>('/events/my/joined'),

  requestAttendanceNotification: (id: number) =>
    api.post(`/events/${id}/attendance/notify`),

  getAttendance: (id: number) =>
    api.get<AttendanceParticipant[]>(`/events/${id}/attendance`),

  markAttendance: (id: number, items: { user_id: number; attended: boolean }[]) =>
    api.post(`/events/${id}/attendance`, { items }),

  getReviews: (id: number) => api.get<Review[]>(`/events/${id}/reviews`),

  createReview: (id: number, rating: number, text?: string) =>
    api.post<Review>(`/events/${id}/reviews`, { rating, text }),

  deleteReview: (eventId: number, reviewId: number) =>
    api.delete(`/events/${eventId}/reviews/${reviewId}`),
}
