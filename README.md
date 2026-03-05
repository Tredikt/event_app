# Communicate — Платформа мероприятий

## Быстрый старт

### Разработка

**Бэкенд:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
cp .env.example .env   # заполните .env
uvicorn app.main:app --reload
```

**Фронтенд:**
```bash
cd frontend
npm install
npm run dev
```

### Docker (продакшн)
```bash
cp backend/.env.example backend/.env
# Заполните backend/.env
docker-compose up -d
```

Открыть: http://localhost (фронт) | http://localhost:8000/docs (API)

## Telegram Bot

1. Создайте бота через @BotFather
2. Добавьте токен в `backend/.env`: `TELEGRAM_BOT_TOKEN=...`
3. Настройте webhook: `POST https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://yourdomain.com/telegram/webhook`

## Структура

```
communicate_site/
├── backend/              # FastAPI + PostgreSQL
│   ├── app/
│   │   ├── core/         # config, security, database, deps
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── routers/      # API routes
│   │   └── services/     # notifications, file upload
│   └── requirements.txt
└── frontend/             # React + TypeScript + Vite
    └── src/
        ├── api/          # axios API clients
        ├── components/   # UI components
        ├── pages/        # route pages
        ├── stores/       # zustand state
        └── types/        # TypeScript types
```

## API

- `POST /auth/register` — регистрация
- `POST /auth/login` — вход
- `GET /events` — список мероприятий (фильтры)
- `POST /events` — создать мероприятие
- `POST /events/{id}/join` — записаться
- `POST /events/{id}/subscribe` — подписка на уведомления
- `GET /events/{id}/participants` — участники (только организатор)
