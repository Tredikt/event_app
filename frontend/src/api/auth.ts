import api from './client'
import type { AuthToken, UserProfile } from '@/types'

export interface RegisterData {
  first_name: string
  last_name: string
  phone: string
  password: string
  gender: string
  email?: string
}

export interface UserUpdateData {
  first_name?: string
  last_name?: string
  email?: string
  gender?: string
  city?: string
}

export const authApi = {
  register: (data: RegisterData) => api.post<AuthToken>('/auth/register', data),
  login: (phone: string, password: string) => api.post<AuthToken>('/auth/login', { phone, password }),
  getMe: () => api.get<UserProfile>('/auth/me'),
  updateMe: (data: UserUpdateData) => api.put<UserProfile>('/auth/me', data),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<UserProfile>('/auth/me/avatar', form)
  },
  connectTelegram: (telegram_id: number, telegram_username?: string) =>
    api.post<UserProfile>('/auth/me/telegram', { telegram_id, telegram_username }),
  generateTelegramLink: () =>
    api.post<{ token: string; link: string }>('/telegram/generate-link-token'),
}
