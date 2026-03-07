import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Calendar, MapPin, Users, Bell, BellOff, ArrowLeft, Edit, Share2, CheckCircle, UserPlus, UserMinus, Navigation, Loader2, X, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { eventsApi } from '@/api/events'
import { notificationsApi } from '@/api/notifications'
import type { AttendanceParticipant, Event, Participant } from '@/types'
import EventMap from '@/components/map/EventMap'
import { useAuthStore } from '@/stores/authStore'
import clsx from 'clsx'

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [joined, setJoined] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [following, setFollowing] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [routeModal, setRouteModal] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [manualFrom, setManualFrom] = useState('')
  const manualInputRef = useRef<HTMLInputElement>(null)
  const [attendance, setAttendance] = useState<AttendanceParticipant[]>([])
  const [attendanceSaving, setAttendanceSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    eventsApi.get(Number(id)).then((r) => {
      setEvent(r.data)
      setLoading(false)
    }).catch(() => {
      toast.error('Мероприятие не найдено')
      navigate('/')
    })
  }, [id, navigate])

  useEffect(() => {
    if (!event || !isAuthenticated || !user) return
    if (event.organizer.id === user.id) {
      eventsApi.getParticipants(event.id).then((r) => setParticipants(r.data))
      const isPast = new Date(event.date) < new Date()
      if (isPast) {
        eventsApi.getAttendance(event.id).then((r) => setAttendance(r.data)).catch(() => {})
        eventsApi.requestAttendanceNotification(event.id).catch(() => {})
      }
    } else {
      eventsApi.myStatus(event.id)
        .then((r) => { setJoined(r.data.joined); setSubscribed(r.data.subscribed) })
        .catch(() => {})
      notificationsApi.getFollowStatus(event.organizer.id)
        .then((r) => setFollowing(r.data.following))
        .catch(() => {})
    }
  }, [event, isAuthenticated, user])

  if (loading || !event) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-gray-100 rounded-2xl" />
          <div className="h-8 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
    )
  }

  const isOrganizer = user?.id === event.organizer.id
  const isPast = new Date(event.date) < new Date()
  const fillPercent = (event.participants_count / event.capacity) * 100

  const toggleAttended = (userId: number) => {
    setAttendance((prev) =>
      prev.map((a) =>
        a.user_id === userId ? { ...a, attended: a.attended === true ? false : true } : a
      )
    )
  }

  const saveAttendance = async () => {
    setAttendanceSaving(true)
    try {
      const items = attendance
        .filter((a) => a.attended !== null)
        .map((a) => ({ user_id: a.user_id, attended: a.attended as boolean }))
      await eventsApi.markAttendance(event.id, items)
      toast.success('Посещаемость сохранена')
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setAttendanceSaving(false)
    }
  }

  const handleJoin = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    if (!user?.telegram_id) {
      toast.error('Для участия необходимо привязать Telegram')
      navigate('/telegram/connect')
      return
    }
    setActionLoading(true)
    try {
      if (joined) {
        await eventsApi.leave(event.id)
        setEvent((e) => e ? { ...e, participants_count: e.participants_count - 1, is_full: false } : e)
        setJoined(false)
        toast.success('Вы отменили участие')
      } else {
        await eventsApi.join(event.id)
        setEvent((e) => e ? { ...e, participants_count: e.participants_count + 1, is_full: e.participants_count + 1 >= e.capacity } : e)
        setJoined(true)
        toast.success('Вы записались на мероприятие!')
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSubscribe = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    setActionLoading(true)
    try {
      if (subscribed) {
        await eventsApi.unsubscribe(event.id)
        setSubscribed(false)
        toast.success('Подписка отменена')
      } else {
        await eventsApi.subscribe(event.id, !!user?.telegram_id, !!user?.email)
        setSubscribed(true)
        toast.success('Вы подписались на уведомления')
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка')
    } finally {
      setActionLoading(false)
    }
  }

  const handleFollow = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    setActionLoading(true)
    try {
      if (following) {
        await notificationsApi.unfollowOrganizer(event.organizer.id)
        setFollowing(false)
        toast.success('Вы отписались от организатора')
      } else {
        await notificationsApi.followOrganizer(event.organizer.id)
        setFollowing(true)
        toast.success('Вы подписались на организатора')
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка')
    } finally {
      setActionLoading(false)
    }
  }

  const openAppOrWeb = (appUrl: string, webUrl: string) => {
    window.location.href = appUrl
    setTimeout(() => { if (!document.hidden) window.open(webUrl, '_blank') }, 2000)
  }

  const openYandexRoute = (fromLat: number, fromLon: number) => {
    const to = `${event!.latitude},${event!.longitude}`
    const from = `${fromLat},${fromLon}`
    openAppOrWeb(
      `yandexmaps://maps.yandex.ru/?rtext=${from}~${to}&rtt=auto`,
      `https://yandex.ru/maps/?rtext=${from}~${to}&rtt=auto`
    )
    setRouteModal(false)
  }

  const handleTaxi = () => {
    if (!event?.latitude || !event?.longitude) return
    const toLat = event.latitude
    const toLon = event.longitude
    if (!navigator.geolocation) {
      openAppOrWeb(
        `yandextaxi://route?end-lat=${toLat}&end-lon=${toLon}&appmetrica_tracking_id=1178268795219780156`,
        `https://go.yandex/`
      )
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: fromLat, longitude: fromLon } = pos.coords
        openAppOrWeb(
          `yandextaxi://route?start-lat=${fromLat}&start-lon=${fromLon}&end-lat=${toLat}&end-lon=${toLon}&appmetrica_tracking_id=1178268795219780156`,
          `https://go.yandex/`
        )
      },
      () => openAppOrWeb(
        `yandextaxi://route?end-lat=${toLat}&end-lon=${toLon}&appmetrica_tracking_id=1178268795219780156`,
        `https://go.yandex/`
      ),
      { timeout: 5000 }
    )
  }

  const handleGeoRoute = () => {
    if (!navigator.geolocation) {
      toast.error('Геолокация не поддерживается браузером')
      return
    }
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false)
        openYandexRoute(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setGeoLoading(false)
        toast.error('Не удалось определить местоположение')
      },
      { timeout: 8000 }
    )
  }

  const handleManualRoute = async () => {
    const q = manualFrom.trim()
    if (!q) return
    setGeoLoading(true)
    try {
      const params = new URLSearchParams({ q, format: 'json', limit: '1', 'accept-language': 'ru' })
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': 'communicate-site/1.0' },
      })
      const data = await res.json()
      if (!data.length) { toast.error('Адрес не найден'); return }
      openYandexRoute(parseFloat(data[0].lat), parseFloat(data[0].lon))
    } catch {
      toast.error('Ошибка геокодирования')
    } finally {
      setGeoLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />Назад
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card overflow-hidden">
            <div className="relative h-56 bg-gray-100">
              {event.image_url ? (
                <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-7xl" style={{ background: `${event.category.color}15` }}>
                  {event.category.icon}
                </div>
              )}
              <div className="absolute top-3 left-3">
                <span className="badge text-white" style={{ backgroundColor: event.category.color }}>
                  {event.category.icon} {event.category.name}
                </span>
              </div>
              {isOrganizer && (
                <Link to={`/events/${event.id}/edit`} className="absolute top-3 right-3 btn-secondary text-xs py-1.5">
                  <Edit className="w-3.5 h-3.5" />Редактировать
                </Link>
              )}
            </div>

            <div className="p-5">
              <h1 className="text-2xl font-bold text-gray-900 mb-3">{event.title}</h1>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4 text-blue-700 flex-shrink-0" />
                  {format(new Date(event.date), "d MMMM yyyy, HH:mm", { locale: ru })}
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
                  {event.address}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users className="w-4 h-4 text-blue-700 flex-shrink-0" />
                  {event.participants_count} из {event.capacity} мест занято
                  {event.is_full && <span className="text-red-500 font-medium">• Мест нет</span>}
                </div>
              </div>

              <div className="h-2 bg-gray-100 rounded-full mb-5">
                <div
                  className={clsx('h-full rounded-full transition-all', event.is_full ? 'bg-red-400' : 'bg-blue-400')}
                  style={{ width: `${Math.min(fillPercent, 100)}%` }}
                />
              </div>

              <div className="prose prose-sm max-w-none text-gray-700">
                <p className="whitespace-pre-wrap">{event.description}</p>
              </div>
            </div>
          </div>

          {(event.latitude && event.longitude) && (
            <div className="card overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h3 className="text-lg font-bold text-gray-900">Где вы будете</h3>
              </div>
              <EventMap
                events={[{ ...event }] as any}
                center={[event.latitude, event.longitude]}
                zoom={14}
                height="240px"
                interactive={false}
              />
              <div className="p-4 space-y-2.5">
                <button
                  onClick={() => { setRouteModal(true); setManualFrom('') }}
                  className="w-full bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-yellow-900 font-semibold py-4 rounded-2xl text-base transition-colors"
                >
                  Проложить маршрут
                </button>
                <button
                  onClick={handleTaxi}
                  className="w-full btn-secondary text-sm"
                >
                  🚕 Добраться на такси
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-3">
              {event.organizer.avatar_url ? (
                <img src={event.organizer.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                  {event.organizer.first_name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Организатор</p>
                <p className="font-medium text-sm">{event.organizer.first_name} {event.organizer.last_name}</p>
                {event.organizer.telegram_username && (
                  <a
                    href={`https://t.me/${event.organizer.telegram_username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-700 hover:text-blue-700 transition-colors"
                  >
                    @{event.organizer.telegram_username}
                  </a>
                )}
              </div>
            </div>

            {!isOrganizer && isAuthenticated && (
              <button
                onClick={handleFollow}
                disabled={actionLoading}
                className={clsx(
                  'w-full btn text-sm transition-colors',
                  following
                    ? 'btn-secondary text-blue-700 hover:text-red-500'
                    : 'btn-secondary'
                )}
              >
                {following
                  ? <><UserMinus className="w-4 h-4" />Отписаться от организатора</>
                  : <><UserPlus className="w-4 h-4" />Следить за организатором</>}
              </button>
            )}

            {!isOrganizer && (
              <div className="space-y-2">
                <button
                  onClick={handleJoin}
                  disabled={actionLoading || (event.is_full && !joined)}
                  className={clsx('w-full btn text-sm', joined ? 'btn-secondary' : 'btn-primary', event.is_full && !joined && 'opacity-50')}
                >
                  {joined ? <><CheckCircle className="w-4 h-4" />Вы записаны</> : event.is_full ? 'Мест нет' : '✓ Записаться'}
                </button>
                <button onClick={handleSubscribe} disabled={actionLoading} className="w-full btn-secondary text-sm">
                  {subscribed ? <><BellOff className="w-4 h-4" />Отменить напоминание</> : <><Bell className="w-4 h-4" />Напомнить перед событием</>}
                </button>
              </div>
            )}

            <button
              onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Ссылка скопирована!') }}
              className="w-full btn-secondary text-sm"
            >
              <Share2 className="w-4 h-4" />Поделиться
            </button>
          </div>

          {isOrganizer && participants.length > 0 && !isPast && (
            <div className="card p-4">
              <h3 className="font-semibold mb-3 text-gray-900">
                Участники ({participants.length}/{event.capacity})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    {p.user.avatar_url ? (
                      <img src={p.user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500 flex-shrink-0">
                        {p.user.first_name[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.user.first_name} {p.user.last_name}</p>
                      <p className="text-xs text-gray-400">{format(new Date(p.joined_at), 'd MMM, HH:mm', { locale: ru })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isOrganizer && isPast && attendance.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-blue-700" />
                <h3 className="font-semibold text-gray-900">Отметить посещаемость</h3>
              </div>
              <p className="text-xs text-gray-400 mb-3">Отметьте, кто пришёл. Рейтинг не пришедших снизится на 0.1</p>
              <div className="space-y-2">
                {attendance.map((a) => (
                  <div
                    key={a.user_id}
                    onClick={() => toggleAttended(a.user_id)}
                    className={clsx(
                      'flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors',
                      a.attended === true
                        ? 'bg-green-50 border border-green-200'
                        : a.attended === false
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                    )}
                  >
                    {a.user.avatar_url ? (
                      <img src={a.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 flex-shrink-0">
                        {a.user.first_name[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.user.first_name} {a.user.last_name}</p>
                      <p className="text-xs text-gray-400">⭐ {a.user.rating.toFixed(1)}</p>
                    </div>
                    <div className={clsx(
                      'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
                      a.attended === true ? 'bg-green-500 text-white' : a.attended === false ? 'bg-red-400 text-white' : 'bg-gray-300 text-gray-500'
                    )}>
                      {a.attended === true ? '✓' : a.attended === false ? '✗' : '?'}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={saveAttendance}
                disabled={attendanceSaving || attendance.every((a) => a.attended === null)}
                className="w-full btn-primary text-sm mt-3 disabled:opacity-50"
              >
                {attendanceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Route modal */}
      {routeModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRouteModal(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Откуда вы?</h3>
              <button onClick={() => setRouteModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Укажите своё местоположение, чтобы построить маршрут до <span className="font-medium text-gray-700">{event.title}</span>
            </p>

            <button
              onClick={handleGeoRoute}
              disabled={geoLoading}
              className="w-full btn-primary mb-3 text-sm"
            >
              {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              Определить моё местоположение
            </button>

            <div className="relative flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 flex-shrink-0">или введите адрес</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="flex gap-2">
              <input
                ref={manualInputRef}
                type="text"
                value={manualFrom}
                onChange={(e) => setManualFrom(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualRoute()}
                placeholder="Моя улица, дом…"
                className="flex-1 input"
                style={{ fontSize: '16px' }}
              />
              <button
                onClick={handleManualRoute}
                disabled={geoLoading || !manualFrom.trim()}
                className="btn-primary text-sm px-4 disabled:opacity-50"
              >
                {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '→'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
