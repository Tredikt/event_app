import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Loader, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi, type RegisterData } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegisterData & { confirm_password: string }>()
  const password = watch('password')

  const onSubmit = async (data: RegisterData & { confirm_password: string }) => {
    const { confirm_password, ...registerData } = data
    try {
      const { data: token } = await authApi.register(registerData)
      setAuth(token.access_token, token.user)
      toast.success('Добро пожаловать!')
      navigate('/telegram/connect')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка регистрации')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-blue-100 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-sky-500 rounded-2xl mb-4 shadow-lg">
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
              <input {...register('phone', { required: 'Обязательно' })} className="input" placeholder="+7 999 000 00 00" />
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

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Зарегистрироваться'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-sky-600 hover:underline font-medium">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
