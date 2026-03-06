import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { eventsApi, type CreateEventData } from '@/api/events'
import type { Category } from '@/types'
import EventForm from '@/components/events/EventForm'
import { useAuthStore } from '@/stores/authStore'

export default function CreateEventPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    if (!user?.telegram_id) {
      toast.error('Для создания мероприятий необходимо привязать Telegram')
      navigate('/telegram/connect')
      return
    }
    eventsApi.getCategories().then((r) => setCategories(r.data))
  }, [])

  const handleSubmit = async (data: CreateEventData, imageFile?: File) => {
    try {
      const { data: event } = await eventsApi.create(data)
      if (imageFile) {
        try { await eventsApi.uploadImage(event.id, imageFile) } catch {}
      }
      toast.success('Мероприятие создано!')
      navigate(`/events/${event.id}`, { replace: true })
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка создания')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />Назад
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Создать мероприятие</h1>
      <div className="card p-6">
        <EventForm categories={categories} onSubmit={handleSubmit} submitLabel="Создать мероприятие" />
      </div>
    </div>
  )
}
