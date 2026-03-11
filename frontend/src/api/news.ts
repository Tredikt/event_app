import api from './client'

export interface NewsAuthor {
  id: number
  first_name: string
  last_name: string
  avatar_url?: string
}

export interface NewsImage {
  id: number
  image_url: string
  order: number
}

export interface NewsPost {
  id: number
  title: string
  content: string
  image_url?: string
  images: NewsImage[]
  city?: string
  author: NewsAuthor
  event_id?: number
  event_image_url?: string
  created_at: string
}

export const newsApi = {
  list: (city?: string) =>
    api.get<NewsPost[]>('/news', { params: city ? { city } : {} }),

  create: (data: FormData) =>
    api.post<NewsPost>('/news', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  uploadImages: (postId: number, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return api.post<NewsPost>(`/news/${postId}/images`, form)
  },

  deleteImage: (postId: number, imageId: number) =>
    api.delete(`/news/${postId}/images/${imageId}`),

  delete: (id: number) =>
    api.delete(`/news/${id}`),
}
