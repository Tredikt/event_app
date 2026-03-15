import { useEffect, useState } from 'react'
import { Loader, X, UserCheck, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { notificationsApi, type NotificationSettings, type CategorySubscription, type OrganizerSubscription } from '@/api/notifications'
import { eventsApi } from '@/api/events'
import { useAuthStore } from '@/stores/authStore'
import type { Category } from '@/types'

export default function NotificationSettingsPanel() {
  const { user } = useAuthStore()
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [catSubs, setCatSubs] = useState<CategorySubscription[]>([])
  const [orgSubs, setOrgSubs] = useState<OrganizerSubscription[]>([])
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      notificationsApi.getSettings(),
      notificationsApi.getCategorySubscriptions(),
      notificationsApi.getOrganizerSubscriptions(),
      eventsApi.getCategories(),
    ]).then(([s, cs, os, cats]) => {
      setSettings(s.data)
      setCatSubs(cs.data)
      setOrgSubs(os.data)
      setAllCategories(cats.data)
    }).catch(() => toast.error('Не удалось загрузить настройки'))
      .finally(() => setLoading(false))
  }, [])

  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    if (!settings) return
    setSaving(true)
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    try {
      const { data } = await notificationsApi.updateSettings({ [key]: value })
      setSettings(data)
    } catch {
      setSettings(settings)
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const subscribeToCategory = async (catId: number) => {
    if (!user?.telegram_id) {
      toast.error('Сначала привяжите Telegram в профиле')
      return
    }
    try {
      const { data } = await notificationsApi.subscribeCategory(catId)
      setCatSubs((prev) => [...prev, data])
      toast.success('Подписка оформлена')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка')
    }
  }

  const unsubscribeFromCategory = async (catId: number) => {
    try {
      await notificationsApi.unsubscribeCategory(catId)
      setCatSubs((prev) => prev.filter((s) => s.category.id !== catId))
      toast.success('Подписка отменена')
    } catch {
      toast.error('Ошибка')
    }
  }

  const unfollowOrganizer = async (orgId: number) => {
    try {
      await notificationsApi.unfollowOrganizer(orgId)
      setOrgSubs((prev) => prev.filter((s) => s.organizer.id !== orgId))
      toast.success('Отписались от организатора')
    } catch {
      toast.error('Ошибка')
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-400"><Loader className="w-5 h-5 animate-spin inline" /></div>
  if (!settings) return null

  const subscribedCatIds = new Set(catSubs.map((s) => s.category.id))

  return (
    <div className="space-y-6">
      {/* Global toggles */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Способы уведомлений</h3>
          {saving && <Loader className="w-4 h-4 animate-spin text-gray-400" />}
        </div>

        {!user?.telegram_id && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 mb-4">
            ⚠️ Для получения Telegram-уведомлений <strong>привяжите Telegram</strong> в профиле.
          </div>
        )}

        <div className="space-y-3">
          <Toggle
            label="Telegram"
            description="Уведомления в Telegram"
            icon="💬"
            value={settings.telegram_enabled}
            disabled={!user?.telegram_id}
            onChange={(v) => updateSetting('telegram_enabled', v)}
          />
        </div>

        <div className="border-t border-gray-100 mt-4 pt-4 space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Типы уведомлений</p>
          <Toggle
            label="Новые мероприятия по категориям"
            description="Когда выходит новое событие в категории, на которую вы подписаны"
            icon="🏷️"
            value={settings.notify_new_events}
            onChange={(v) => updateSetting('notify_new_events', v)}
          />
          <Toggle
            label="События от организаторов"
            description="Когда организатор, за которым вы следите, создаёт мероприятие"
            icon="👤"
            value={settings.notify_organizer_events}
            onChange={(v) => updateSetting('notify_organizer_events', v)}
          />
        </div>
      </div>

      {/* Category subscriptions */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-4 h-4 text-blue-700" />
          <h3 className="font-semibold text-gray-900">Подписки на категории</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Получайте уведомление, когда появляется новое мероприятие в выбранной категории
        </p>

        <div className="flex flex-wrap gap-2">
          {allCategories.map((cat) => {
            const isSubscribed = subscribedCatIds.has(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => isSubscribed ? unsubscribeFromCategory(cat.id) : subscribeToCategory(cat.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
                  isSubscribed
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
                style={isSubscribed ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
                {isSubscribed && <X className="w-3 h-3 ml-0.5" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Organizer subscriptions */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="w-4 h-4 text-blue-700" />
          <h3 className="font-semibold text-gray-900">Организаторы</h3>
        </div>
        {orgSubs.length === 0 ? (
          <p className="text-sm text-gray-400">
            Вы ни на кого не подписаны. На странице мероприятия можно подписаться на организатора.
          </p>
        ) : (
          <div className="space-y-2">
            {orgSubs.map((sub) => (
              <div key={sub.id} className="flex items-center gap-3 py-2">
                {sub.organizer.avatar_url ? (
                  <img src={sub.organizer.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold flex-shrink-0">
                    {sub.organizer.first_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {sub.organizer.first_name} {sub.organizer.last_name}
                  </p>
                </div>
                <button
                  onClick={() => unfollowOrganizer(sub.organizer.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors flex items-center gap-1 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />Отписаться
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({
  label, description, icon, value, disabled, onChange,
}: {
  label: string
  description: string
  icon: string
  value: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={clsx('flex items-start gap-3', disabled && 'opacity-50')}>
      <span className="text-lg mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!value)}
        className={clsx(
          'relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 mt-0.5',
          value && !disabled ? 'bg-blue-700' : 'bg-gray-200'
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
            value ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  )
}
