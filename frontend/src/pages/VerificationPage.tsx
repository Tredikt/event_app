import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Clock, CheckCircle, XCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

const LEGAL_TYPES = ['ИП', 'ООО', 'АО', 'НКО', 'Самозанятый', 'Другое']

interface FormData {
  legal_type: string
  legal_name: string
  inn: string
  contact_info: string
}

export default function VerificationPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>()
  const selectedType = watch('legal_type')

  const onSubmit = async (data: FormData) => {
    try {
      await authApi.submitVerification({
        legal_type: data.legal_type,
        legal_name: data.legal_name,
        inn: data.inn,
        contact_info: data.contact_info?.trim() || undefined,
      })
      toast.success('Заявка отправлена! Мы рассмотрим её в течение 1–3 рабочих дней.')
      navigate(-1)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Ошибка отправки')
    }
  }

  const status = user?.verification_status

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" />Назад
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-blue-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Верификация организатора</h1>
          <p className="text-sm text-gray-500">Для создания платных мероприятий</p>
        </div>
      </div>

      {/* Status banner */}
      {status === 'approved' && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl p-4 mb-6">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-800 text-sm">Верификация подтверждена</p>
            <p className="text-xs text-green-700 mt-0.5">Вы можете создавать платные мероприятия</p>
          </div>
        </div>
      )}
      {status === 'pending' && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-6">
          <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-yellow-800 text-sm">Заявка на рассмотрении</p>
            <p className="text-xs text-yellow-700 mt-0.5">Мы рассмотрим её в течение 1–3 рабочих дней</p>
          </div>
        </div>
      )}
      {status === 'rejected' && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-800 text-sm">Заявка отклонена</p>
            <p className="text-xs text-red-700 mt-0.5">Вы можете подать повторную заявку</p>
          </div>
        </div>
      )}

      {/* Why section */}
      <div className="card p-5 mb-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Зачем нужна верификация?</h2>
        <p className="text-sm text-gray-600">
          Платные мероприятия — это финансовые обязательства перед участниками. Мы допускаем сбор денег только от юридически оформленных организаторов: ИП, ООО, АО и других форм.
        </p>
        <ul className="space-y-2 text-sm text-gray-600">
          {[
            'Защита участников: деньги принимает официально зарегистрированный субъект',
            'Доверие к платформе: только проверенные организаторы берут оплату',
            'Ответственность: юр. лицо несёт правовую ответственность за мероприятие',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-blue-700 font-bold mt-0.5">·</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {status !== 'approved' && (
        <form onSubmit={handleSubmit(onSubmit)} className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Заявка на верификацию</h2>

          {/* Legal type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Форма организации</label>
            <div className="flex flex-wrap gap-2">
              {LEGAL_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setValue('legal_type', t)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                    selectedType === t
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input type="hidden" {...register('legal_type', { required: 'Выберите форму организации' })} />
            {errors.legal_type && <p className="text-xs text-red-500 mt-1">{errors.legal_type.message}</p>}
          </div>

          {/* Legal name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Официальное название
            </label>
            <input
              {...register('legal_name', { required: 'Укажите название' })}
              className="input w-full"
              placeholder='Например: ИП Иванов Иван Иванович'
            />
            {errors.legal_name && <p className="text-xs text-red-500 mt-1">{errors.legal_name.message}</p>}
          </div>

          {/* INN */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ИНН</label>
            <input
              {...register('inn', {
                required: 'Укажите ИНН',
                pattern: { value: /^\d{10,12}$/, message: 'ИНН должен содержать 10 или 12 цифр' },
              })}
              className="input w-full"
              placeholder="10 или 12 цифр"
              inputMode="numeric"
            />
            {errors.inn && <p className="text-xs text-red-500 mt-1">{errors.inn.message}</p>}
          </div>

          {/* Contact */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Контактная информация <span className="text-gray-400 font-normal">(необязательно)</span>
            </label>
            <textarea
              {...register('contact_info')}
              className="input w-full resize-none"
              rows={3}
              placeholder="Сайт, email, телефон — любые дополнительные данные для проверки"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-blue-700 text-white font-semibold text-sm hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Отправка...' : status === 'rejected' ? 'Отправить повторно' : 'Отправить заявку'}
          </button>
        </form>
      )}
    </div>
  )
}
