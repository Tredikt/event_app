import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, ArrowRight, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

export default function ConnectTelegramPage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()
  const [link, setLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.telegram_id) {
      navigate('/', { replace: true })
      return
    }
    authApi.generateTelegramLink()
      .then((r) => setLink(r.data.link))
      .catch(() => toast.error('Не удалось получить ссылку. Проверьте настройки бота.'))
      .finally(() => setLoading(false))
  }, [])

  // Poll every 3s until Telegram linked
  useEffect(() => {
    if (!link) return
    const interval = setInterval(async () => {
      try {
        const { data: me } = await authApi.getMe()
        if (me.telegram_id) {
          clearInterval(interval)
          updateUser(me)
          toast.success('Telegram успешно привязан! 🎉')
          navigate('/', { replace: true })
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [link])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-blue-100 px-4">
      <div className="w-full max-w-md">
        <div className="card p-8 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-500 rounded-2xl mx-auto shadow-lg">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Привяжите Telegram</h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              Telegram нужен для создания мероприятий и записи на них.
              <br />
              Через него вы будете получать уведомления.
            </p>
          </div>

          {loading ? (
            <Loader className="w-6 h-6 animate-spin text-sky-500 mx-auto" />
          ) : link ? (
            <div className="space-y-4">
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
              >
                <MessageCircle className="w-5 h-5" />
                Открыть в Telegram
                <ArrowRight className="w-4 h-4" />
              </a>
              <p className="text-xs text-gray-400">
                Нажмите кнопку выше, затем нажмите <strong>Старт</strong> в боте.
                Страница обновится автоматически.
              </p>
              <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
                <Loader className="w-3 h-3 animate-spin" />
                Ожидаем подтверждения...
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-500">Не удалось создать ссылку</p>
          )}

          <button
            onClick={() => navigate('/', { replace: true })}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Пропустить — некоторые функции будут недоступны
          </button>
        </div>
      </div>
    </div>
  )
}
