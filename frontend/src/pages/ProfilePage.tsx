import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Camera, Send, Loader, CheckCircle, Bell, ChevronRight, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'
import type { UserProfile } from '@/types'
import NotificationSettingsPanel from '@/components/notifications/NotificationSettings'

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuthStore()
  const navigate = useNavigate()
  const [telegramLink, setTelegramLink] = useState('')
  const [loadingTg, setLoadingTg] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<Partial<UserProfile>>({
    defaultValues: {
      first_name: user?.first_name,
      last_name: user?.last_name,
    },
  })

  const onSave = async (data: Partial<UserProfile>) => {
    try {
      const { data: updated } = await authApi.updateMe(data)
      updateUser(updated)
      toast.success('Профиль обновлён')
    } catch {
      toast.error('Ошибка сохранения')
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { data } = await authApi.uploadAvatar(file)
      updateUser(data)
      toast.success('Аватар обновлён')
    } catch {
      toast.error('Ошибка загрузки аватара')
    }
  }

  const generateTelegramLink = async () => {
    if (!user) return
    setLoadingTg(true)
    try {
      const { data } = await authApi.generateTelegramLink()
      setTelegramLink(data.link)
    } catch {
      toast.error('Ошибка генерации ссылки')
    } finally {
      setLoadingTg(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

      {/* Avatar + name */}
      <div className="flex items-center gap-4 px-1 pb-2">
        <div className="relative">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl">
              {user.first_name[0]}
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-0 right-0 w-6 h-6 bg-blue-700 rounded-full flex items-center justify-center text-white hover:bg-blue-800 transition-colors"
          >
            <Camera className="w-3 h-3" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">{user.first_name} {user.last_name}</p>
          <p className="text-sm text-gray-500">{user.phone}</p>
        </div>
      </div>

      {/* Profile form */}
      <div className="card p-5">
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Имя</label>
              <input {...register('first_name')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Фамилия</label>
              <input {...register('last_name')} className="input" />
            </div>
          </div>
          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Сохранить'}
          </button>
        </form>
      </div>

      {/* Telegram */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Привязка Telegram</h2>
        <p className="text-sm text-gray-500 mb-4">Необходима для получения уведомлений о мероприятиях</p>
        {user.telegram_id ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">
              Telegram привязан{user.telegram_username ? ` (@${user.telegram_username})` : ''}
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={generateTelegramLink} disabled={loadingTg} className="btn-secondary w-full">
              {loadingTg ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Получить ссылку для привязки
            </button>
            {telegramLink && (
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <p className="text-xs text-blue-700 mb-2">Перейдите по ссылке в Telegram и нажмите Start:</p>
                <a href={telegramLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 font-medium hover:underline break-all">
                  {telegramLink}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Menu list */}
      <div className="card overflow-hidden divide-y divide-gray-100">
        <button
          onClick={() => setShowNotifications((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
        >
          <Bell className="w-5 h-5 text-gray-300 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium text-gray-800">Уведомления</span>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showNotifications ? 'rotate-90' : ''}`} />
        </button>

        {showNotifications && (
          <div className="px-4 py-4 bg-gray-50">
            <NotificationSettingsPanel />
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
        >
          <LogOut className="w-5 h-5 text-gray-300 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium text-red-500">Выйти</span>
        </button>
      </div>

    </div>
  )
}
