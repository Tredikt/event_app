import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Camera, Send, Loader, CheckCircle, Bell, User } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import type { UserProfile } from '@/types'
import NotificationSettingsPanel from '@/components/notifications/NotificationSettings'

type Tab = 'profile' | 'notifications'

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [tab, setTab] = useState<Tab>('profile')
  const [telegramLink, setTelegramLink] = useState('')
  const [loadingTg, setLoadingTg] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<Partial<UserProfile>>({
    defaultValues: {
      first_name: user?.first_name,
      last_name: user?.last_name,
      email: user?.email || '',
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

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Настройки</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        <button
          onClick={() => setTab('profile')}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            tab === 'profile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <User className="w-4 h-4" />Профиль
        </button>
        <button
          onClick={() => setTab('notifications')}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            tab === 'notifications' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Bell className="w-4 h-4" />Уведомления
        </button>
      </div>

      {tab === 'profile' && (
        <>
          <div className="card p-6 mb-4">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 font-bold text-2xl">
                    {user.first_name[0]}
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-0 right-0 w-7 h-7 bg-sky-500 rounded-full flex items-center justify-center text-white hover:bg-sky-600 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>
              <div>
                <p className="text-lg font-semibold">{user.first_name} {user.last_name}</p>
                <p className="text-sm text-gray-500">{user.phone}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Имя</label>
                  <input {...register('first_name')} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Фамилия</label>
                  <input {...register('last_name')} className="input" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email (для уведомлений)</label>
                <input type="email" {...register('email')} className="input" placeholder="your@email.com" />
              </div>
              <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Сохранить'}
              </button>
            </form>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Привязка Telegram</h2>
            <p className="text-sm text-gray-500 mb-4">
              Необходима для получения уведомлений о мероприятиях
            </p>

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
                  <div className="bg-sky-50 rounded-xl p-3 border border-sky-100">
                    <p className="text-xs text-sky-700 mb-2">Перейдите по ссылке в Telegram и нажмите Start:</p>
                    <a href={telegramLink} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-600 font-medium hover:underline break-all">
                      {telegramLink}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'notifications' && <NotificationSettingsPanel />}
    </div>
  )
}
