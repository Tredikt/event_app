import api from './client'

export interface ChatPartner {
  id: number
  first_name: string
  last_name: string
  avatar_url: string | null
}

export interface ChatMessage {
  id: number
  chat_id: number
  sender_id: number
  text: string | null
  image_url: string | null
  created_at: string
  is_read: boolean
  sender: ChatPartner | null
}

export interface ChatListItem {
  chat_id: number
  partner: ChatPartner
  last_message: ChatMessage | null
  unread: number
}

export const chatApi = {
  openChat: (user_id: number) =>
    api.post<{ chat_id: number; partner: ChatPartner }>('/chats/open', { user_id }),
  canChat: (user_id: number) =>
    api.get<{ allowed: boolean }>(`/chats/can-chat/${user_id}`),
  listChats: () => api.get<ChatListItem[]>('/chats'),
  getMessages: (chatId: number, skip = 0, limit = 50) =>
    api.get<ChatMessage[]>(`/chats/${chatId}/messages`, { params: { skip, limit } }),
  unreadCount: () => api.get<{ count: number }>('/chats/unread-count'),
}
