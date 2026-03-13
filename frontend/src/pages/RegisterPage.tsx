import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Loader, MapPin } from 'lucide-react'
import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { authApi, type RegisterData } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegisterData & { confirm_password: string }>()
  const password = watch('password')
  const [agreed, setAgreed] = useState(false)
  const [agreeError, setAgreeError] = useState(false)
  const [phoneDigits, setPhoneDigits] = useState('')
  const phoneRef = useRef<HTMLInputElement>(null)

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
    setPhoneDigits(digits)
    // Write +7XXXXXXXXXX into the form value
    const { onChange } = register('phone', { required: 'Обязательно' })
    const syntheticEvent = { target: { value: '+7' + digits } } as React.ChangeEvent<HTMLInputElement>
    onChange(syntheticEvent)
  }

  const detectCity = async (): Promise<string | null> => {
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

  const onSubmit = async (data: RegisterData & { confirm_password: string }) => {
    if (!agreed) { setAgreeError(true); return }
    setAgreeError(false)
    const { confirm_password, ...registerData } = data
    try {
      const { data: token } = await authApi.register(registerData)
      setAuth(token.access_token, token.user)
      toast.success('Добро пожаловать!')
      navigate('/telegram/connect')
      // Fire & forget — don't block navigation
      detectCity().then(async (city) => {
        if (!city) return
        try {
          const { data: updated } = await authApi.updateMe({ city })
          useAuthStore.getState().updateUser(updated)
        } catch { /* ignore */ }
      })
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка регистрации')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 px-4 py-8">
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
