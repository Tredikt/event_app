import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Loader, MapPin, Search, X } from 'lucide-react'
import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { authApi, type RegisterData } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

const RUSSIAN_CITIES = [
  'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань',
  'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
  'Уфа', 'Красноярск', 'Воронеж', 'Пермь', 'Волгоград', 'Краснодар',
  'Саратов', 'Тюмень', 'Тольятти', 'Ижевск', 'Барнаул', 'Ульяновск',
  'Иркутск', 'Хабаровск', 'Ярославль', 'Владивосток', 'Махачкала',
  'Томск', 'Оренбург', 'Кемерово', 'Новокузнецк', 'Рязань', 'Астрахань',
  'Набережные Челны', 'Пенза', 'Липецк', 'Киров', 'Тула', 'Чебоксары',
  'Калининград', 'Брянск', 'Курск', 'Иваново', 'Магнитогорск', 'Тверь',
  'Ставрополь', 'Белгород', 'Архангельск', 'Владимир', 'Сочи', 'Симферополь',
  'Новочеркасск', 'Таганрог', 'Шахты', 'Батайск', 'Азов', 'Новошахтинск',
]

interface CityModalProps {
  detectedCity: string | null
  detecting: boolean
  onConfirm: (city: string) => void
  onSkip: () => void
}

function CityModal({ detectedCity, detecting, onConfirm, onSkip }: CityModalProps) {
  const [search, setSearch] = useState('')
  const [showList, setShowList] = useState(!detectedCity)

  const filtered = RUSSIAN_CITIES.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Ваш город</h2>
          <button onClick={onSkip} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {detecting ? (
          <div className="p-8 flex flex-col items-center gap-3 text-gray-500">
            <Loader className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-sm">Определяем ваш город...</span>
          </div>
        ) : !showList && detectedCity ? (
          <div className="p-5 space-y-4">
            <p className="text-gray-600 text-sm">Определили ваш город:</p>
            <div className="flex items-center gap-2 bg-blue-50 rounded-xl p-3">
              <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="font-medium text-blue-900">{detectedCity}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onConfirm(detectedCity)}
                className="btn-primary flex-1 text-sm py-2"
              >
                Да, верно
              </button>
              <button
                onClick={() => setShowList(true)}
                className="btn-secondary flex-1 text-sm py-2"
              >
                Нет, изменить
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                autoFocus
                className="input pl-9"
                placeholder="Поиск города..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Город не найден</p>
              )}
              {filtered.map((city) => (
                <button
                  key={city}
                  onClick={() => onConfirm(city)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 text-sm text-gray-800 transition-colors"
                >
                  {city}
                </button>
              ))}
            </div>
            <button onClick={onSkip} className="w-full text-xs text-gray-400 hover:text-gray-600 pt-1">
              Пропустить
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<RegisterData & { confirm_password: string }>()
  const password = watch('password')
  const [agreed, setAgreed] = useState(false)
  const [agreeError, setAgreeError] = useState(false)
  const [phoneDigits, setPhoneDigits] = useState('')
  const phoneRef = useRef<HTMLInputElement>(null)
  const [cityModal, setCityModal] = useState<{ open: boolean; city: string | null; detecting: boolean }>({
    open: false, city: null, detecting: false,
  })

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
    setPhoneDigits(digits)
    setValue('phone', '+7' + digits, { shouldValidate: true })
  }

  const detectCity = (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
              { headers: { 'Accept-Language': 'ru' } }
            )
            const json = await res.json()
            const addr = json.address || {}
            resolve(addr.city || addr.town || addr.village || addr.county || null)
          } catch {
            resolve(null)
          }
        },
        () => resolve(null),
        { timeout: 5000 }
      )
    })
  }

  const handleCityConfirm = async (city: string) => {
    setCityModal({ open: false, city: null, detecting: false })
    try {
      const { data: updated } = await authApi.updateMe({ city })
      useAuthStore.getState().updateUser(updated)
    } catch { /* ignore */ }
    navigate('/telegram/connect')
  }

  const handleCitySkip = () => {
    setCityModal({ open: false, city: null, detecting: false })
    navigate('/telegram/connect')
  }

  const onSubmit = async (data: RegisterData & { confirm_password: string }) => {
    if (!agreed) { setAgreeError(true); return }
    setAgreeError(false)
    const { confirm_password, ...registerData } = data
    try {
      const { data: token } = await authApi.register(registerData)
      setAuth(token.access_token, token.user)
      toast.success('Добро пожаловать!')

      // Show modal with detecting state, then fill in city
      setCityModal({ open: true, city: null, detecting: true })
      const city = await detectCity()
      setCityModal({ open: true, city, detecting: false })
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка регистрации')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 px-4 py-8">
      {cityModal.open && (
        <CityModal
          detectedCity={cityModal.city}
          detecting={cityModal.detecting}
          onConfirm={handleCityConfirm}
          onSkip={handleCitySkip}
        />
      )}

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-700 rounded-2xl mb-4 shadow-lg">
            <MapPin className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Создать аккаунт</h1>
          <p className="text-gray-500 text-sm mt-1">Присоединяйтесь к сообществу</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Имя *</label>
                <input {...register('first_name', { required: 'Обязательно' })} className="input" placeholder="Иван" />
                {errors.first_name && <p className="text-xs text-red-500 mt-1">{errors.first_name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Фамилия *</label>
                <input {...register('last_name', { required: 'Обязательно' })} className="input" placeholder="Иванов" />
                {errors.last_name && <p className="text-xs text-red-500 mt-1">{errors.last_name.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Номер телефона *</label>
              {/* hidden input registers phone with react-hook-form */}
              <input type="hidden" {...register('phone', {
                required: 'Обязательно',
                validate: (v) => (v && v.length >= 12) || 'Введите 10 цифр',
              })} />
              <div className="flex items-center input p-0 overflow-hidden">
                <span className="pl-3 pr-2 text-gray-700 font-medium select-none">+7</span>
                <div className="w-px h-5 bg-gray-300" />
                <input
                  ref={phoneRef}
                  type="tel"
                  inputMode="numeric"
                  value={phoneDigits}
                  onChange={handlePhoneChange}
                  className="flex-1 px-2 py-2 outline-none bg-transparent"
                  placeholder="999 000 00 00"
                  maxLength={10}
                />
              </div>
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Пол *</label>
              <select {...register('gender', { required: 'Выберите пол' })} className="input">
                <option value="">Выберите пол</option>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
              </select>
              {errors.gender && <p className="text-xs text-red-500 mt-1">{errors.gender.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email (необязательно)</label>
              <input type="email" {...register('email')} className="input" placeholder="your@email.com" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Пароль *</label>
              <input
                type="password"
                {...register('password', { required: 'Обязательно', minLength: { value: 6, message: 'Минимум 6 символов' } })}
                className="input"
              />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Повторите пароль *</label>
              <input
                type="password"
                {...register('confirm_password', {
                  required: 'Обязательно',
                  validate: (v) => v === password || 'Пароли не совпадают',
                })}
                className="input"
              />
              {errors.confirm_password && <p className="text-xs text-red-500 mt-1">{errors.confirm_password.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => { setAgreed(e.target.checked); if (e.target.checked) setAgreeError(false) }}
                  className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0"
                />
                <span className="text-sm text-gray-600">
                  Я соглашаюсь с{' '}
                  <Link to="/privacy" target="_blank" className="text-blue-700 hover:underline font-medium">
                    политикой конфиденциальности
                  </Link>{' '}
                  и даю согласие на обработку персональных данных
                </span>
              </label>
              {agreeError && <p className="text-xs text-red-500 pl-6">Необходимо дать согласие</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Зарегистрироваться'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-blue-700 hover:underline font-medium">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
