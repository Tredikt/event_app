export type Gender = 'male' | 'female' | 'other'
export type EventStatus = 'active' | 'cancelled' | 'completed'
export type ParticipantStatus = 'registered' | 'cancelled'

export interface Category {
  id: number
  name: string
  icon: string
  color: string
}

export interface UserPublic {
  id: number
  first_name: string
  last_name: string
  gender: Gender
  avatar_url: string | null
  telegram_username: string | null
  rating: number
}

export interface UserProfile extends UserPublic {
  phone: string
  email: string | null
  telegram_id: number | null
  is_admin: boolean
  city: string | null
  created_at: string
}

export interface Event {
  id: number
  title: string
  description: string
  date: string
  capacity: number
  participants_count: number
  address: string
  latitude: number | null
  longitude: number | null
  status: EventStatus
  image_url: string | null
  is_tour: boolean
  category: Category
  organizer: UserPublic
  created_at: string
  is_full: boolean
}

export interface EventList {
  id: number
  title: string
  date: string
  capacity: number
  participants_count: number
  address: string
  latitude: number | null
  longitude: number | null
  status: EventStatus
  image_url: string | null
  is_tour: boolean
  category: Category
  organizer: UserPublic
  is_full: boolean
}

export interface Participant {
  id: number
  user: UserPublic
  status: ParticipantStatus
  joined_at: string
}

export interface AttendanceParticipant {
  user_id: number
  user: UserPublic
  attended: boolean | null
}

export interface Subscription {
  id: number
  event_id: number
  notify_telegram: boolean
  notify_email: boolean
}

export interface AuthToken {
  access_token: string
  token_type: string
  user: UserProfile
}
