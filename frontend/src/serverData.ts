import type { NewsPost } from '@/api/news'
import type { EventList, Category } from '@/types'

export interface ServerData {
  news?: NewsPost[]
  events?: EventList[]
  categories?: Category[]
}

// Server-side: set before renderToString
let _serverSideData: ServerData = {}

export function setServerData(data: ServerData) {
  _serverSideData = data
}

// Works both on server (module var) and client (window.__INITIAL_DATA__)
export function getServerData(): ServerData {
  if (typeof window !== 'undefined') {
    return (window as any).__INITIAL_DATA__ ?? {}
  }
  return _serverSideData
}
