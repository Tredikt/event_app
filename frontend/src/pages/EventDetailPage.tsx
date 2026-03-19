import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Calendar, MapPin, Bell, ArrowLeft, Edit, Share2, CheckCircle, UserPlus, UserMinus, Navigation, Loader2, X, ClipboardList, Trash2, MessageSquare } from 'lucide-react'
import { chatApi } from '@/api/chat'
import toast from 'react-hot-toast'
import { fmtDate, isMoscowPast } from '@/utils/date'
import { eventsApi } from '@/api/events'
import { notificationsApi } from '@/api/notifications'
import type { AttendanceParticipant, Event, Participant /*, Review */ } from '@/types'  // RATING DISABLED
import EventMap from '@/components/map/EventMap'
import ClientOnly from '@/components/ClientOnly'
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
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [instantiateDate, setInstantiateDate] = useState('')
  const [instantiateLoading, setInstantiateLoading] = useState(false)
  const [repeatModal, setRepeatModal] = useState(false)
  const [repeatDate, setRepeatDate] = useState('')
  const [repeatLoading, setRepeatLoading] = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  // RATING DISABLED — review state commented out
  // const [reviews, setReviews] = useState<Review[]>([])
  // const [myReview, setMyReview] = useState<Review | null>(null)
  // const [reviewRating, setReviewRating] = useState(5)
  // const [reviewText, setReviewText] = useState('')
  // const [reviewLoading, setReviewLoading] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null)
  const [paymentModal, setPaymentModal] = useState(false)

  useEffect(() => {
    if (!id) return
    eventsApi.get(Number(id)).then((r) => {
      setEvent(r.data)
      setLoading(false)
    }).catch(() => {
      toast.error('Мероприятие не найдено')
      navigate('/')
    })
    // eventsApi.getReviews(Number(id)).then((r) => setReviews(r.data)).catch(() => {})  // RATING DISABLED
  }, [id, navigate])

  // RATING DISABLED — myReview sync effect commented out
  // useEffect(() => {
  //   if (!user) return
  //   const mine = reviews.find((r) => r.reviewer.id === user.id) || null
  //   setMyReview(mine)
  //   if (mine) { setReviewRating(mine.rating); setReviewText(mine.text || '') }
  // }, [reviews, user])

  useEffect(() => {
    if (!event || !isAuthenticated || !user) return
    if (event.organizer.id === user.id) {
      eventsApi.getParticipants(event.id).then((r) => setParticipants(r.data))
      const isPast = event.date ? isMoscowPast(event.date) : false
      if (isPast) {
        eventsApi.getAttendance(event.id).then((r) => setAttendance(r.data)).catch(() => {})
      }
    } else {
      eventsApi.myStatus(event.id)
        .then((r) => {
          setJoined(r.data.joined)
          setSubscribed(r.data.subscribed)
          setPaymentStatus(r.data.payment_status)
        })
        .catch(() => {})
      notificationsApi.getFollowStatus(event.organizer.id)
        .then((r) => setFollowing(r.data.following))
        .catch(() => {})
    }
  }, [event, isAuthenticated, user])

  const handleShare = async () => {
    const url = window.location.href
    const title = event?.title ?? 'Мероприятие'
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch { /* user cancelled */ }
    } else {
      navigator.clipboard.writeText(url)
      toast.success('Ссылка скопирована!')
    }
  }

  const carouselImages = event?.images && event.images.length > 0
    ? event.images.map((img) => img.image_url)
    : event?.image_url ? [event.image_url] : []
  const carouselTotal = carouselImages.length

  const prevSlide = useCallback(() => setCarouselIndex((i) => (i - 1 + carouselTotal) % carouselTotal), [carouselTotal])
  const nextSlide = useCallback(() => setCarouselIndex((i) => (i + 1) % carouselTotal), [carouselTotal])

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
  const isPast = event.date ? isMoscowPast(event.date) : false

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

    // Paid event: show payment modal instead of joining directly
    if (event.price && event.price > 0 && !joined && !paymentStatus) {
      setPaymentModal(true)
      return
    }

    setActionLoading(true)
    try {
      if (joined || paymentStatus) {
        await eventsApi.leave(event.id)
        if (joined) {
          setEvent((e) => e ? { ...e, participants_count: e.participants_count - 1, is_full: false } : e)
        }
        setJoined(false)
        setPaymentStatus(null)
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

  const handleSubmitPaymentApplication = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    setActionLoading(true)
    try {
      await eventsApi.join(event.id)
      setPaymentStatus('pending_payment')
      setPaymentModal(false)
      toast.success('Заявка подана! Переведите оплату и нажмите «Я оплатил»')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка')
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmPayment = async () => {
    setActionLoading(true)
    try {
      await eventsApi.confirmPayment(event.id)
      setPaymentStatus('payment_submitted')
      toast.success('Оплата отмечена! Ожидайте подтверждения организатора')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка')
    } finally {
      setActionLoading(false)
    }
  }

  const handleApproveParticipant = async (userId: number) => {
    try {
      await eventsApi.approveParticipant(event.id, userId)
      setParticipants((prev) => prev.map((p) =>
        p.user.id === userId ? { ...p, status: 'registered' as const, payment_status: 'registered' } : p
      ))
      setEvent((e) => e ? { ...e, participants_count: e.participants_count + 1 } : e)
      toast.success('Участие подтверждено')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка')
    }
  }

  const handleRejectParticipant = async (userId: number) => {
    try {
      await eventsApi.rejectParticipant(event.id, userId)
      setParticipants((prev) => prev.filter((p) => p.user.id !== userId))
      toast.success('Заявка отклонена')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка')
    }
  }

  const handleSubscribe = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    setActionLoading(true)
    try {
      if (subscribed) {
        await eventsApi.unsubscribe(event.id)
        setSubscribed(false)
        setEvent((e) => e ? { ...e, subscriptions_count: Math.max(0, e.subscriptions_count - 1) } : e)
        toast.success('Подписка отменена')
      } else {
        await eventsApi.subscribe(event.id, !!user?.telegram_id, !!user?.email)
        setSubscribed(true)
        setEvent((e) => e ? { ...e, subscriptions_count: e.subscriptions_count + 1 } : e)
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

  const handleDelete = async () => {
    if (!event) return
    setDeleteLoading(true)
    try {
      await eventsApi.delete(event.id)
      toast.success('Мероприятие удалено')
      navigate('/')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка удаления')
    } finally {
      setDeleteLoading(false)
      setDeleteConfirm(false)
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

  // RATING DISABLED — handleSubmitReview commented out
  // const handleSubmitReview = async () => {
  //   if (!isAuthenticated) { navigate('/login'); return }
  //   setReviewLoading(true)
  //   try {
  //     const r = await eventsApi.createReview(Number(id), reviewRating, reviewText.trim() || undefined)
  //     setReviews((prev) => [r.data, ...prev])
  //     toast.success('Отзыв оставлен!')
  //   } catch (e: any) {
  //     toast.error(e.response?.data?.detail || 'Ошибка')
  //   } finally {
  //     setReviewLoading(false)
  //   }
  // }

  // RATING DISABLED — handleDeleteReview commented out
  // const handleDeleteReview = async (reviewId: number) => {
  //   try {
  //     await eventsApi.deleteReview(Number(id), reviewId)
  //     setReviews((prev) => prev.filter((r) => r.id !== reviewId))
  //     setMyReview(null)
  //     setReviewText('')
  //     setReviewRating(5)
  //     toast.success('Отзыв удалён')
  //   } catch {
  //     toast.error('Ошибка удаления')
  //   }
  // }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />Назад
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card overflow-hidden">
            <div
              className="relative h-56 bg-gray-100 overflow-hidden select-none"
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
              onTouchEnd={(e) => {
                if (touchStartX.current === null || carouselTotal <= 1) return
                const diff = touchStartX.current - e.changedTouches[0].clientX
                if (Math.abs(diff) > 40) diff > 0 ? nextSlide() : prevSlide()
                touchStartX.current = null
              }}
            >
              {carouselImages.length > 0 ? (
                <img
                  key={carouselIndex}
                  src={carouselImages[carouselIndex]}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-7xl" style={{ background: `${event.category.color}15` }}>
                  {event.category.icon}
                </div>
              )}

              {/* Prev / Next arrows */}
              {carouselTotal > 1 && (
                <>
                  <button
                    onClick={prevSlide}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                    aria-label="Назад"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <button
                    onClick={nextSlide}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                    aria-label="Вперёд"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                  {/* Dots */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {carouselImages.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCarouselIndex(i)}
                        className={`rounded-full transition-all ${i === carouselIndex ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'}`}
                      />
                    ))}
                  </div>
                </>
              )}

              <div className="absolute top-3 left-3">
                <span className="badge text-white" style={{ backgroundColor: event.category.color }}>
                  {event.category.icon} {event.category.name}
                </span>
              </div>
              {isOrganizer && (
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="btn-secondary text-xs py-1.5 text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <Link to={`/events/${event.id}/edit`} className="btn-secondary text-xs py-1.5">
                    <Edit className="w-3.5 h-3.5" />Редактировать
                  </Link>
                </div>
              )}
            </div>

            <div className="p-5">
              <h1 className="text-xl font-bold text-gray-900 mb-4">{event.title}</h1>

              {/* Action buttons row */}
              {!isOrganizer && (
                <div className="flex flex-col border-b border-gray-100 mb-5 -mx-5 px-5 pb-5">
                  <div className="flex">
                  <button
                    onClick={handleSubscribe}
                    disabled={actionLoading}
                    className="flex-1 flex flex-col items-center gap-1 py-1 text-gray-600 hover:text-blue-700 transition-colors"
                  >
                    <div className={clsx('w-11 h-11 rounded-full flex items-center justify-center', subscribed ? 'bg-blue-100' : 'bg-gray-100')}>
                      {subscribed ? <Bell className="w-5 h-5 text-blue-700" /> : <Bell className="w-5 h-5 text-gray-500" />}
                    </div>
                    <span className="text-xs font-medium">{subscribed ? 'Напомнить ✓' : 'Напомнить'}</span>
                  </button>
                  {paymentStatus === 'pending_payment' ? (
                    <button
                      onClick={handleConfirmPayment}
                      disabled={actionLoading}
                      className="flex-1 flex flex-col items-center gap-1 py-1 text-gray-600 hover:text-green-700 transition-colors disabled:opacity-40"
                    >
                      <div className="w-11 h-11 rounded-full flex items-center justify-center bg-yellow-100">
                        <CheckCircle className="w-5 h-5 text-yellow-600" />
                      </div>
                      <span className="text-xs font-medium text-yellow-700">Я оплатил</span>
                    </button>
                  ) : paymentStatus === 'payment_submitted' ? (
                    <button
                      disabled
                      className="flex-1 flex flex-col items-center gap-1 py-1 text-gray-400 cursor-default"
                    >
                      <div className="w-11 h-11 rounded-full flex items-center justify-center bg-gray-100">
                        <CheckCircle className="w-5 h-5 text-gray-400" />
                      </div>
                      <span className="text-xs font-medium">На рассмотрении</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleJoin}
                      disabled={actionLoading || (event.is_full && !joined && !paymentStatus)}
                      className="flex-1 flex flex-col items-center gap-1 py-1 text-gray-600 hover:text-blue-700 transition-colors disabled:opacity-40"
                    >
                      <div className={clsx('w-11 h-11 rounded-full flex items-center justify-center', joined ? 'bg-blue-100' : 'bg-gray-100')}>
                        <CheckCircle className={clsx('w-5 h-5', joined ? 'text-blue-700' : 'text-gray-500')} />
                      </div>
                      <span className="text-xs font-medium">{joined ? 'Пойду ✓' : event.is_full ? 'Мест нет' : 'Пойду'}</span>
                    </button>
                  )}
                  </div>
                  {subscribed && event.date && (
                    <p className="text-xs text-gray-400 text-center mt-2">Напоминание придёт за 2 часа до начала</p>
                  )}
                </div>
              )}

              {/* Add to Google Calendar — shown when joined and event has date */}
              {!isOrganizer && isAuthenticated && joined && event.date && (
                <button
                  onClick={() => {
                    // Format Moscow datetime as YYYYMMDDTHHmmss (no Z) + ctz=Europe/Moscow
                    const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '').replace('Z', '').slice(0, 15)
                    const start = fmt(event.date!)
                    const end = event.end_time
                      ? fmt(event.end_time)
                      : fmt(new Date(new Date(event.date! + '+03:00').getTime() + 2 * 60 * 60 * 1000).toISOString().replace('Z', ''))
                    const params = new URLSearchParams({
                      action: 'TEMPLATE',
                      text: event.title,
                      dates: `${start}/${end}`,
                      details: event.description,
                      location: event.address,
                      ctz: 'Europe/Moscow',
                    })
                    window.open(`https://calendar.google.com/calendar/render?${params}`, '_blank')
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-50 border border-green-200 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors mb-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 18H5V9h14v12zm0-14H5V5h14v2z"/></svg>
                  Добавить в Google Календарь
                </button>
              )}

              {/* Contact organizer — shown when joined */}
              {!isOrganizer && isAuthenticated && joined && (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={async () => {
                      try {
                        const { data } = await chatApi.openChat(event.organizer.id)
                        navigate(`/chats/${data.chat_id}`)
                      } catch {
                        toast.error('Ошибка открытия чата')
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Написать организатору
                  </button>
                  <button
                    onClick={() => navigate(`/users/${event.organizer.id}`)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    Профиль
                  </button>
                </div>
              )}

              {/* Stats block */}
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100 mb-4">
                {event.date && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      Дата
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {fmtDate(event.date, 'd MMMM, HH:mm')}
                      {event.end_time && `\u2013${fmtDate(event.end_time, 'HH:mm')}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-600">Осталось мест</span>
                  <span className={clsx('text-sm font-semibold', event.is_full ? 'text-red-500' : 'text-gray-900')}>
                    {event.is_full ? 'Нет мест' : `${event.capacity - event.participants_count}/${event.capacity}`}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-600">Пойдут</span>
                  <span className="text-sm font-semibold text-gray-900">{event.participants_count}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-600">Интересуются</span>
                  <span className="text-sm font-semibold text-gray-900">{event.subscriptions_count}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-600">Стоимость участия</span>
                  <span className={clsx('text-sm font-semibold', event.price ? 'text-gray-900' : 'text-green-600')}>
                    {event.price ? `${event.price.toLocaleString('ru')} ₽` : 'Бесплатно'}
                  </span>
                </div>
                {event.min_participants && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-600">Мин. для проведения</span>
                    <span className={clsx('text-sm font-semibold', event.participants_count >= event.min_participants ? 'text-green-600' : 'text-orange-500')}>
                      {event.participants_count}/{event.min_participants}
                    </span>
                  </div>
                )}
              </div>

              <div className="mb-5">
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
                  {event.address}
                </div>
              </div>

              {/* Share button */}
              <button
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors mb-4"
              >
                <Share2 className="w-4 h-4" />
                Поделиться мероприятием
              </button>

              <div className="prose prose-sm max-w-none text-gray-700">
                <p className="whitespace-pre-wrap">{event.description}</p>
              </div>
            </div>
          </div>

          {/* RATING DISABLED — Reviews block commented out */}
          {/* {!event.is_tour && (
            <div className="card p-5">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Отзывы ({reviews.length})</h3>
              {isAuthenticated && !isOrganizer && isPast && joined && !myReview && (
                <div className="mb-5 pb-5 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-2">Оставить отзыв</p>
                  <div className="flex gap-1 mb-3">
                    {[1,2,3,4,5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setReviewRating(s)}
                        className={`text-2xl transition-transform hover:scale-110 ${s <= reviewRating ? 'text-yellow-400' : 'text-gray-200'}`}
                      >★</button>
                    ))}
                  </div>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    className="input resize-none w-full mb-3"
                    rows={3}
                    placeholder="Расскажите о мероприятии (необязательно)..."
                  />
                  <button
                    onClick={handleSubmitReview}
                    disabled={reviewLoading}
                    className="btn-primary text-sm"
                  >
                    {reviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Опубликовать'}
                  </button>
                </div>
              )}
              {reviews.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Отзывов пока нет</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((r) => (
                    <div key={r.id} className="flex gap-3">
                      {r.reviewer.avatar_url ? (
                        <img src={r.reviewer.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
                          {r.reviewer.first_name[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-medium text-gray-900">{r.reviewer.first_name} {r.reviewer.last_name}</span>
                            <span className="ml-2 text-xs text-gray-400">{fmtDate(r.created_at, 'd MMM yyyy')}</span>
                          </div>
                          {user?.id === r.reviewer.id && (
                            <button onClick={() => handleDeleteReview(r.id)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="flex gap-0.5 my-0.5">
                          {[1,2,3,4,5].map((s) => (
                            <span key={s} className={`text-sm ${s <= r.rating ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                          ))}
                        </div>
                        {r.text && <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{r.text}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )} */}

          {(event.latitude && event.longitude) && (
            <div className="card overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h3 className="text-lg font-bold text-gray-900">Где вы будете</h3>
              </div>
              <ClientOnly>
                <EventMap
                  events={[{ ...event }] as any}
                  center={[event.latitude, event.longitude]}
                  zoom={14}
                  height="240px"
                  interactive={false}
                />
              </ClientOnly>
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
                <Link to={`/users/${event.organizer.id}`} className="font-medium text-sm hover:text-blue-700 transition-colors">
                  {event.organizer.first_name} {event.organizer.last_name}
                </Link>
                {/* RATING DISABLED — organizer rating stars commented out */}
                {/* <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(i => (
                    <span key={i} className={`text-xs ${i <= Math.round(event.organizer.rating) ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
                  ))}
                  <span className="text-xs text-gray-500">{event.organizer.rating.toFixed(1)}</span>
                </div> */}
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


          </div>

          {/* Instantiate catalog item as a real event */}
          {isOrganizer && event.is_tour && (
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-1">Создать мероприятие из типа</h3>
              <p className="text-xs text-gray-500 mb-3">Выберите дату — появится разовое мероприятие в ленте с данными этого типа мероприятия.</p>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={instantiateDate}
                  onChange={(e) => setInstantiateDate(e.target.value)}
                  className="input flex-1 text-sm"
                  style={{ colorScheme: 'light' }}
                />
                <button
                  disabled={!instantiateDate || instantiateLoading}
                  onClick={async () => {
                    if (!instantiateDate) return
                    setInstantiateLoading(true)
                    try {
                      const { data: newEvent } = await eventsApi.instantiate(event.id, instantiateDate)
                      toast.success('Мероприятие создано!')
                      navigate(`/events/${newEvent.id}`)
                    } catch {
                      toast.error('Не удалось создать мероприятие')
                    } finally {
                      setInstantiateLoading(false)
                    }
                  }}
                  className="btn-primary text-sm px-4 flex-shrink-0 flex items-center gap-1.5"
                >
                  {instantiateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                  Создать
                </button>
              </div>
            </div>
          )}

          {isOrganizer && participants.length > 0 && !isPast && (
            <div className="card p-4">
              <h3 className="font-semibold mb-3 text-gray-900">
                Участники ({participants.filter(p => p.status === 'registered').length}/{event.capacity})
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-start gap-2">
                    {p.user.avatar_url ? (
                      <img src={p.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500 flex-shrink-0 mt-0.5">
                        {p.user.first_name[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.user.first_name} {p.user.last_name}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{fmtDate(p.joined_at, 'd MMM, HH:mm')}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">
                          📅 записей: <span className="font-semibold text-gray-600">{p.total_registrations}</span>
                        </span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">
                          ✅ посещений: <span className={clsx('font-semibold', p.total_attended > 0 ? 'text-green-600' : 'text-gray-500')}>{p.total_attended}</span>
                        </span>
                      </div>
                      {/* Payment status badge */}
                      {p.status === 'pending_payment' && (
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-md font-medium">Ожидает оплаты</span>
                          <button
                            onClick={() => handleRejectParticipant(p.user.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Отклонить
                          </button>
                        </div>
                      )}
                      {p.status === 'payment_submitted' && (
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-medium">Оплата отправлена</span>
                          <button
                            onClick={() => handleApproveParticipant(p.user.id)}
                            className="text-xs text-green-600 hover:text-green-800 font-semibold"
                          >
                            Принять
                          </button>
                          <button
                            onClick={() => handleRejectParticipant(p.user.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Отклонить
                          </button>
                        </div>
                      )}
                      {p.status === 'registered' && event.price != null && event.price > 0 && (
                        <span className="mt-1 inline-block text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md font-medium">Оплата подтверждена</span>
                      )}
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
              {/* RATING DISABLED — note about rating penalty removed */}
              {/* <p className="text-xs text-gray-400 mb-3">Отметьте, кто пришёл. Рейтинг не пришедших снизится на 0.1</p> */}
              <p className="text-xs text-gray-400 mb-3">Отметьте, кто пришёл.</p>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* RATING DISABLED — user rating in attendance list commented out */}
                        {/* <span className="text-xs text-gray-400">⭐ {a.user.rating.toFixed(1)}</span> */}
                      </div>
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

          {/* Repeat event button — for organizer on past events */}
          {isOrganizer && isPast && !event.is_tour && (
            <div className="card p-4">
              <button
                onClick={() => setRepeatModal(true)}
                className="w-full btn-secondary text-sm flex items-center justify-center gap-2"
              >
                🔁 Повторить мероприятие
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Repeat modal */}
      {repeatModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRepeatModal(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Повторить мероприятие</h3>
              <button onClick={() => setRepeatModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Будет создана копия «{event.title}» с новой датой. Все остальные данные сохранятся.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Новая дата и время</label>
            <input
              type="datetime-local"
              value={repeatDate}
              onChange={(e) => setRepeatDate(e.target.value)}
              className="input w-full mb-4"
            />
            <button
              disabled={!repeatDate || repeatLoading}
              onClick={async () => {
                if (!repeatDate) return
                setRepeatLoading(true)
                try {
                  const { data } = await eventsApi.repeat(event.id, new Date(repeatDate).toISOString())
                  setRepeatModal(false)
                  navigate(`/events/${data.id}`)
                  toast.success('Мероприятие создано')
                } catch {
                  toast.error('Ошибка создания')
                } finally {
                  setRepeatLoading(false)
                }
              }}
              className="w-full btn-primary text-sm disabled:opacity-50"
            >
              {repeatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать'}
            </button>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {paymentModal && event.price != null && event.price > 0 && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPaymentModal(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Оплата участия</h3>
              <button onClick={() => setPaymentModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-3">
              {event.price.toLocaleString('ru')} ₽
            </div>
            {event.payment_details && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1 font-medium">Реквизиты для оплаты:</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{event.payment_details}</p>
              </div>
            )}
            <p className="text-sm text-gray-500 mb-5">
              После оплаты нажмите «Я оплатил» — организатор проверит и подтвердит участие.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPaymentModal(false)}
                className="flex-1 btn-secondary"
              >
                Отмена
              </button>
              <button
                onClick={handleSubmitPaymentApplication}
                disabled={actionLoading}
                className="flex-1 btn-primary"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Подать заявку'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="font-bold text-gray-900 text-lg mb-2">Удалить мероприятие?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Это действие нельзя отменить. Все участники будут удалены из списка.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 btn-secondary"
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

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
