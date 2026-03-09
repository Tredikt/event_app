import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { eventsApi, type CreateEventData } from '@/api/events'
import type { Category, Event } from '@/types'
import EventForm from '@/components/events/EventForm'

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [event, setEvent] = useState<Event | null>(null)

  useEffect(() => {
    eventsApi.getCategories().then((r) => setCategories(r.data))
    if (id) eventsApi.get(Number(id)).then((r) => setEvent(r.data))
  }, [id])

  if (!event) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400">Загрузка...</div>

  const handleSubmit = async (data: CreateEventData, imageFile?: File) => {
    try {
      await eventsApi.update(Number(id), data)
      if (imageFile) {
        try { await eventsApi.uploadImage(Number(id), imageFile) } catch {}
      }
      toast.success('Мероприятие обновлено')
      navigate(`/events/${id}`)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка обновления')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />Назад
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Редактировать мероприятие</h1>
      <div className="card p-6">
        <EventForm
          categories={categories}
          defaultImageUrl={event.image_url ?? undefined}
          defaultValues={{
            title: event.title,
            description: event.description,
            date: event.date ? new Date(event.date).toISOString().slice(0, 16) : undefined,
            capacity: event.capacity,
            address: event.address,
            latitude: event.latitude ?? undefined,
            longitude: event.longitude ?? undefined,
            category_id: event.category.id,
          }}
          onSubmit={handleSubmit}
          submitLabel="Сохранить изменения"
        />
      </div>
    </div>
  )
}
