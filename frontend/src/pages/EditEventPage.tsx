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

  const handleSubmit = async (data: CreateEventData, newFiles: File[], removedIds: number[]) => {
    try {
      await eventsApi.update(Number(id), data)
      await Promise.all(removedIds.filter(imgId => imgId > 0).map((imgId) => eventsApi.deleteImage(Number(id), imgId).catch(() => {})))
      if (newFiles.length > 0) {
        try { await eventsApi.uploadImages(Number(id), newFiles) } catch {}
      }
      toast.success('Мероприятие обновлено')
      navigate(`/events/${id}`)
    } catch (e: any) {
      const d = e.response?.data?.detail
      toast.error(Array.isArray(d) ? d.map((x: any) => x.msg).join(', ') : (d || 'Ошибка обновления'))
    }
  }

  const toLocalInput = (iso: string) => {
    // Treat no-tz backend strings as Moscow time
    const s = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + '+03:00'
    const d = new Date(new Date(s).toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
          defaultImages={
            event.images.length > 0
              ? event.images.map((img) => ({ id: img.id, url: img.image_url }))
              : event.image_url
              ? [{ id: -1, url: event.image_url }]
              : []
          }
          defaultValues={{
            title: event.title,
            description: event.description,
            date: event.date ? toLocalInput(event.date) : undefined,
            capacity: event.capacity,
            min_participants: event.min_participants ?? undefined,
            address: event.address,
            latitude: event.latitude ?? undefined,
            longitude: event.longitude ?? undefined,
            category_id: event.category.id,
            is_tour: event.is_tour,
          }}
          onSubmit={handleSubmit}
          submitLabel="Сохранить изменения"
        />
      </div>
    </div>
  )
}
