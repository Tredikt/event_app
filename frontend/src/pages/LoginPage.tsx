import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Loader, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

interface Form {
  phone: string
  password: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>()

  const onSubmit = async (data: Form) => {
    try {
      const { data: token } = await authApi.login(data.phone, data.password)
      setAuth(token.access_token, token.user)
      toast.success(`Добро пожаловать, ${token.user.first_name}!`)
      navigate('/')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Неверный телефон или пароль')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-700 rounded-2xl mb-4 shadow-lg">
            <MapPin className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Войти в Повод</h1>
          <p className="text-gray-500 text-sm mt-1">Найдите мероприятия рядом с вами</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Телефон или Email</label>
              <input
                {...register('phone', { required: 'Введите телефон или email' })}
                className="input"
                placeholder="+7 999 000 00 00 или your@email.com"
              />
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Пароль</label>
              <input
                type="password"
                {...register('password', { required: 'Введите пароль' })}
                className="input"
              />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Войти'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Нет аккаунта?{' '}
            <Link to="/register" className="text-blue-700 hover:underline font-medium">Зарегистрироваться</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
