import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, /* Star, */ CalendarDays, Award } from 'lucide-react'
import toast from 'react-hot-toast'
import { fmtDate } from '@/utils/date'
import { usersApi, type OrganizerProfile /*, type ReviewOut, type EligibleEvent */ } from '@/api/users'  // RATING DISABLED
import type { EventList } from '@/types'

// RATING DISABLED — Stars and StarInput components commented out
// function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
//   const sz = size === 'lg' ? 'text-2xl' : 'text-sm'
//   return (
//     <span className={sz}>
//       {[1, 2, 3, 4, 5].map((i) => (
//         <span key={i} className={i <= Math.round(value) ? 'text-yellow-400' : 'text-gray-300'}>★</span>
//       ))}
//     </span>
//   )
// }
//
// function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
//   const [hover, setHover] = useState(0)
//   return (
//     <div className="flex gap-1">
//       {[1, 2, 3, 4, 5].map((i) => (
//         <button
//           key={i}
//           type="button"
//           onClick={() => onChange(i)}
//           onMouseEnter={() => setHover(i)}
//           onMouseLeave={() => setHover(0)}
//           className="text-2xl leading-none transition-transform hover:scale-110"
//         >
//           <span className={(hover || value) >= i ? 'text-yellow-400' : 'text-gray-300'}>★</span>
//         </button>
//       ))}
//     </div>
//   )
// }

export default function OrganizerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const userId = Number(id)

  const [profile, setProfile] = useState<OrganizerProfile | null>(null)
  // const [reviews, setReviews] = useState<ReviewOut[]>([])  // RATING DISABLED
  // const [eligibleEvents, setEligibleEvents] = useState<EligibleEvent[]>([])  // RATING DISABLED
  const [loading, setLoading] = useState(true)

  const [eventsTab, setEventsTab] = useState<'upcoming' | 'past'>('upcoming')
  const [upcomingEvents, setUpcomingEvents] = useState<EventList[]>([])
  const [pastEvents, setPastEvents] = useState<EventList[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  // RATING DISABLED — review form state commented out
  // const [showForm, setShowForm] = useState(false)
  // const [selectedEvent, setSelectedEvent] = useState<number>(0)
  // const [rating, setRating] = useState(5)
  // const [reviewText, setReviewText] = useState('')
  // const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!userId) return
    Promise.all([
      usersApi.getProfile(userId),
      // usersApi.getReviews(userId),  // RATING DISABLED
    ]).then(([p /*, r */]) => {
      setProfile(p.data)
      // setReviews(r.data)  // RATING DISABLED
    }).catch(() => {
      toast.error('Пользователь не найден')
      navigate('/')
    }).finally(() => setLoading(false))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    setEventsLoading(true)
    Promise.all([
      usersApi.getEvents(userId, 'upcoming'),
      usersApi.getEvents(userId, 'past'),
    ]).then(([u, p]) => {
      setUpcomingEvents(u.data)
      setPastEvents(p.data)
    }).catch(() => {}).finally(() => setEventsLoading(false))
  }, [userId])

  // RATING DISABLED — eligible events fetch commented out
  // useEffect(() => {
  //   if (!isAuthenticated || !userId || user?.id === userId) return
  //   usersApi.getEligibleEvents(userId)
  //     .then((r) => {
  //       setEligibleEvents(r.data)
  //       if (r.data.length === 1) setSelectedEvent(r.data[0].id)
  //     })
  //     .catch(() => {})
  // }, [isAuthenticated, userId, user])

  // RATING DISABLED — handleSubmitReview and recalcRating commented out
  // const handleSubmitReview = async (e: React.FormEvent) => {
  //   e.preventDefault()
  //   if (!selectedEvent) { toast.error('Выберите мероприятие'); return }
  //   if (!rating) { toast.error('Поставьте оценку'); return }
  //   setSubmitting(true)
  //   try {
  //     const { data: review } = await usersApi.createReview(userId, {
  //       event_id: selectedEvent,
  //       rating,
  //       text: reviewText.trim() || undefined,
  //     })
  //     setReviews((prev) => [review, ...prev])
  //     setProfile((p) => p ? { ...p, reviews_count: p.reviews_count + 1, rating: recalcRating([review, ...reviews]) } : p)
  //     setEligibleEvents((prev) => prev.filter((e) => e.id !== selectedEvent))
  //     setShowForm(false)
  //     setReviewText('')
  //     setRating(5)
  //     toast.success('Отзыв опубликован!')
  //   } catch (e: any) {
  //     toast.error(e.response?.data?.detail || 'Ошибка')
  //   } finally {
  //     setSubmitting(false)
  //   }
  // }
  //
  // const recalcRating = (revs: ReviewOut[]) =>
  //   revs.length ? Math.round((revs.reduce((s, r) => s + r.rating, 0) / revs.length) * 100) / 100 : 5

  if (loading || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-24 bg-gray-100 rounded-2xl" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  // const canReview = isAuthenticated && user?.id !== userId && eligibleEvents.length > 0  // RATING DISABLED

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="w-4 h-4" />Назад
      </button>

      {/* Profile card */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-start gap-4">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-2xl font-bold flex-shrink-0">
              {profile.first_name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{profile.first_name} {profile.last_name}</h1>
            {profile.telegram_username && (
              <a href={`https://t.me/${profile.telegram_username}`} target="_blank" rel="noreferrer"
                className="text-sm text-blue-700 hover:underline">@{profile.telegram_username}</a>
            )}
            {/* RATING DISABLED — Stars rating display commented out */}
            {/* <div className="flex items-center gap-1.5 mt-1">
              <Stars value={profile.rating} />
              <span className="text-sm font-semibold text-gray-700">{profile.rating.toFixed(1)}</span>
            </div> */}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <CalendarDays className="w-4 h-4 text-blue-700 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900">{profile.events_count}</p>
            <p className="text-xs text-gray-500">мероприятий</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <Award className="w-4 h-4 text-blue-700 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900">{profile.reviews_count}</p>
            <p className="text-xs text-gray-500">отзывов</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
          {profile.city && (
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{profile.city}</span>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            На сайте с {fmtDate(profile.created_at, 'MMMM yyyy')}
          </span>
        </div>

      </div>

      {/* Events section */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-semibold text-gray-900">Мероприятия</h2>
        </div>
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setEventsTab('upcoming')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${eventsTab === 'upcoming' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Предстоящие ({upcomingEvents.length})
          </button>
          <button
            onClick={() => setEventsTab('past')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${eventsTab === 'past' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Прошедшие ({pastEvents.length})
          </button>
        </div>
        {eventsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (eventsTab === 'upcoming' ? upcomingEvents : pastEvents).length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-4">
            {eventsTab === 'upcoming' ? 'Нет предстоящих мероприятий' : 'Нет прошедших мероприятий'}
          </p>
        ) : (
          <div className="space-y-2">
            {(eventsTab === 'upcoming' ? upcomingEvents : pastEvents).map((e) => (
              <button
                key={e.id}
                onClick={() => navigate(`/events/${e.id}`)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                {e.image_url ? (
                  <img src={e.image_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{e.title}</p>
                  {e.date && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmtDate(e.date, 'd MMMM yyyy')}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{e.participants_count}/{e.capacity}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RATING DISABLED — Review form commented out */}
      {/* {canReview && !showForm && (
        <button onClick={() => setShowForm(true)} className="w-full btn-primary text-sm">
          <Star className="w-4 h-4" />Оставить отзыв
        </button>
      )}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Ваш отзыв</h3>
          <form onSubmit={handleSubmitReview} className="space-y-4">
            {eligibleEvents.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Мероприятие</label>
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(Number(e.target.value))}
                  className="input"
                >
                  <option value={0}>Выберите мероприятие...</option>
                  {eligibleEvents.map((e) => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
                </select>
              </div>
            )}
            {eligibleEvents.length === 1 && (
              <p className="text-sm text-gray-600">Мероприятие: <span className="font-medium">{eligibleEvents[0].title}</span></p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Оценка</label>
              <StarInput value={rating} onChange={setRating} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Комментарий (необязательно)</label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                className="input resize-none h-24"
                placeholder="Расскажите о своём опыте..."
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 btn-secondary text-sm">Отмена</button>
              <button type="submit" disabled={submitting || !selectedEvent} className="flex-1 btn-primary text-sm disabled:opacity-50">
                {submitting ? 'Публикуем...' : 'Опубликовать'}
              </button>
            </div>
          </form>
        </div>
      )} */}

      {/* RATING DISABLED — Reviews list commented out */}
      {/* <div className="space-y-3">
        <h2 className="font-semibold text-gray-900 text-sm px-1">Отзывы ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center text-gray-400 text-sm">
            Отзывов пока нет
          </div>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start gap-3">
                {r.reviewer.avatar_url ? (
                  <img src={r.reviewer.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-semibold text-sm flex-shrink-0">
                    {r.reviewer.first_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-gray-900">{r.reviewer.first_name} {r.reviewer.last_name}</span>
                    <Stars value={r.rating} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{r.event_title} · {fmtDate(r.created_at, 'd MMM yyyy')}</p>
                  {r.text && <p className="text-sm text-gray-700 mt-2 leading-relaxed">{r.text}</p>}
                </div>
              </div>
            </div>
          ))
        )}
      </div> */}
    </div>
  )
}
