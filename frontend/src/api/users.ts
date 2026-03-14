import api from './client'
import type { EventList } from '@/types'

export interface OrganizerProfile {
  id: number
  first_name: string
  last_name: string
  avatar_url?: string
  telegram_username?: string
  rating: number
  city?: string
  created_at: string
  events_count: number
  reviews_count: number
}

export interface ReviewOut {
  id: number
  reviewer: {
    id: number
    first_name: string
    last_name: string
    avatar_url?: string
    gender: string
    telegram_username?: string
    rating: number
  }
  event_id: number
  event_title: string
  rating: number
  text?: string
  created_at: string
}

export interface EligibleEvent {
  id: number
  title: string
  date: string
}

export const usersApi = {
  listOrganizers: (params?: { search?: string; category_id?: number; skip?: number; limit?: number }) =>
    api.get<OrganizerProfile[]>('/users', { params }),
  getProfile: (userId: number) => api.get<OrganizerProfile>(`/users/${userId}`),
  getReviews: (userId: number) => api.get<ReviewOut[]>(`/users/${userId}/reviews`),
  getEligibleEvents: (userId: number) => api.get<EligibleEvent[]>(`/users/${userId}/eligible-events`),
  createReview: (userId: number, data: { event_id: number; rating: number; text?: string }) =>
    api.post<ReviewOut>(`/users/${userId}/reviews`, data),
  getEvents: (userId: number, tab: 'upcoming' | 'past') =>
    api.get<EventList[]>(`/users/${userId}/events`, { params: { tab } }),
}
