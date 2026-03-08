import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPolicyPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => window.history.length > 1 ? navigate(-1) : window.close()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </button>

        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5 text-sm text-gray-700 leading-relaxed">
          <h1 className="text-xl font-bold text-gray-900">Политика конфиденциальности</h1>
          <p className="text-gray-500 text-xs">Последнее обновление: март 2025 г.</p>

          <section className="space-y-2">
            <h2 className="font-semibold text-gray-900">1. Общие положения</h2>
            <p>
              Настоящая Политика конфиденциальности определяет порядок сбора, хранения, использования
              и защиты персональных данных пользователей сервиса «Досуг» (далее — Сервис).
              Используя Сервис, вы соглашаетесь с условиями настоящей Политики.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-gray-900">2. Какие данные мы собираем</h2>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Имя и фамилия</li>
              <li>Номер телефона</li>
              <li>Адрес электронной почты (при указании)</li>
              <li>Фотография профиля (аватар)</li>
              <li>Данные о мероприятиях, которые вы создаёте или посещаете</li>
              <li>Telegram-аккаунт (при подключении)</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-gray-900">3. Цели обработки данных</h2>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Регистрация и аутентификация в Сервисе</li>
              <li>Отображение профиля пользователя другим участникам мероприятий</li>
              <li>Отправка уведомлений о новых мероприятиях и изменениях</li>
              <li>Улучшение качества работы Сервиса</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-gray-900">4. Передача данных третьим лицам</h2>
            <p>
              Мы не продаём и не передаём ваши персональные данные третьим лицам без вашего согласия,
              за исключением случаев, предусмотренных законодательством Российской Федерации.
              Для отправки уведомлений может использоваться сервис Telegram.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-gray-900">5. Хранение данных</h2>
            <p>
              Данные хранятся на защищённых серверах. Срок хранения — до момента удаления аккаунта
              пользователем или по его письменному запросу.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-gray-900">6. Права пользователя</h2>
            <p>Вы вправе в любой момент:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Получить сведения о хранящихся персональных данных</li>
              <li>Запросить исправление или удаление своих данных</li>
              <li>Отозвать согласие на обработку персональных данных</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-gray-900">7. Контактная информация</h2>
            <p>
              По вопросам, связанным с обработкой персональных данных, обращайтесь через
              форму обратной связи в приложении.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
