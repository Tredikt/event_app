import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { eventsApi, type CreateEventData } from '@/api/events'
import type { Category } from '@/types'
import EventForm from '@/components/events/EventForm'
import { useAuthStore } from '@/stores/authStore'
import AuthPromptModal from '@/components/ui/AuthPromptModal'

export default function CreateEventPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isTour = searchParams.get('tour') === '1'
  const { user, isAuthenticated } = useAuthStore()
  const [categories, setCategories] = useState<Category[]>([])
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return
    if (!user?.telegram_id && !user?.is_admin) {
      toast.error('Для создания мероприятий необходимо привязать Telegram')
      navigate('/telegram/connect')
      return
    }
    eventsApi.getCategories().then((r) => setCategories(r.data))
  }, [isAuthenticated])

  const handleSubmit = async (data: CreateEventData, newFiles: File[]) => {
    try {
      const { data: event } = await eventsApi.create(data)
      if (newFiles.length > 0) {
        try { await eventsApi.uploadImages(event.id, newFiles) } catch {}
      }
      toast.success('Мероприятие создано!')
      navigate(`/events/${event.id}`, { replace: true })
    } catch (e: any) {
      const d = e.response?.data?.detail
      toast.error(Array.isArray(d) ? d.map((x: any) => x.msg).join(', ') : (d || 'Ошибка создания'))
    }
  }

  return (
    <>
      <div
        className="max-w-2xl mx-auto px-4 py-6"
        onClickCapture={!isAuthenticated ? (e) => { e.preventDefault(); e.stopPropagation(); setShowPrompt(true) } : undefined}
      >
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />Назад
        </button>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {isTour ? 'Новый тип мероприятия' : 'Новое мероприятие'}
        </h1>
        <div className="card p-6">
          <EventForm
            categories={categories}
            onSubmit={handleSubmit}
            submitLabel={isTour ? 'Создать тип мероприятия' : 'Создать мероприятие'}
            defaultValues={{ capacity: 10, is_tour: isTour }}
          />
        </div>
      </div>

      {showPrompt && (
        <AuthPromptModal
          onClose={() => setShowPrompt(false)}
          message="Чтобы создавать мероприятия, необходимо войти в аккаунт."
        />
      )}
    </>
  )
}
