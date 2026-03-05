import api from './client'

export interface NotificationSettings {
  id: number
  telegram_enabled: boolean
  email_enabled: boolean
  notify_new_events: boolean
  notify_organizer_events: boolean
}

export interface CategorySubscription {
  id: number
  category: { id: number; name: string; icon: string; color: string }
  created_at: string
}

export interface OrganizerSubscription {
  id: number
  organizer: {
    id: number
    first_name: string
    last_name: string
    avatar_url: string | null
    gender: string
    telegram_username: string | null
  }
  created_at: string
}

export const notificationsApi = {
  getSettings: () => api.get<NotificationSettings>('/notifications/settings'),

  updateSettings: (data: Partial<NotificationSettings>) =>
    api.put<NotificationSettings>('/notifications/settings', data),

  getCategorySubscriptions: () =>
    api.get<CategorySubscription[]>('/notifications/categories'),

  subscribeCategory: (categoryId: number) =>
    api.post<CategorySubscription>(`/notifications/categories/${categoryId}`),

  unsubscribeCategory: (categoryId: number) =>
    api.delete(`/notifications/categories/${categoryId}`),

  getOrganizerSubscriptions: () =>
    api.get<OrganizerSubscription[]>('/notifications/organizers'),

  followOrganizer: (organizerId: number) =>
    api.post<OrganizerSubscription>(`/notifications/organizers/${organizerId}`),

  unfollowOrganizer: (organizerId: number) =>
    api.delete(`/notifications/organizers/${organizerId}`),

  getFollowStatus: (organizerId: number) =>
    api.get<{ following: boolean }>(`/notifications/organizers/${organizerId}/status`),
}
