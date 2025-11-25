# Boss Grammar (EasyTalks Mini App)

Стартовая заготовка для Telegram Mini App: фронт на React + Vite и бэкенд на Express.

## Структура
- `webapp/` — Vite + React, подключен Telegram WebApp SDK.
- `backend/` — Express API c заглушкой верификации initData.
- `.gitignore` — игнорирует `node_modules`, `.env`, сборки (`dist`, `build`).

## Установка
1. Фронт:  
   ```bash
   cd easytalks-bot/webapp
   npm install
   ```
2. Бэкенд:  
   ```bash
   cd easytalks-bot/backend
   npm install
   ```

## Запуск (две консоли)
- Консоль 1 — фронт:  
  ```bash
  cd easytalks-bot/webapp
  npm run dev
  ```  
  По умолчанию: http://localhost:5173

- Консоль 2 — бэкенд:  
  ```bash
  cd easytalks-bot/backend
  npm run dev
  ```  
  По умолчанию: http://localhost:4000

## Минимальная проверка
- Бэкенд: `curl http://localhost:4000/health` → `{"status":"ok"}`
- Фронт: открыть http://localhost:5173 — увидите заголовок Boss Grammar. В Telegram окружении компонент вызывает `Telegram.WebApp.ready()` и `expand()`.

### Проверка авторизации initData
1. В `easytalks-bot/backend/.env` укажите токен бота:  
   ```
   BOT_TOKEN=123456:ABC...
   FRONTEND_ORIGIN=http://localhost:5173
   ```
2. В `easytalks-bot/webapp/.env` (для локальной отладки без Telegram) можно сгенерировать и подставить мок:  
   ```
   VITE_API_BASE=http://localhost:4000
   VITE_MOCK_INIT_DATA=<строка initData>
   ```  
   Строку initData можно получить из реального Telegram окружения (выведя `Telegram.WebApp.initData`) или сгенерировать скриптом:  
   ```js
   // scripts/mock-initdata.js (пример)
   import crypto from 'crypto';
   const botToken = process.env.BOT_TOKEN;
   const payload = {
     auth_date: Math.floor(Date.now() / 1000),
     user: JSON.stringify({ id: 1, first_name: 'Test', username: 'tester' }),
   };
   const params = new URLSearchParams(payload);
   const dataCheckString = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\\n');
   const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
   const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
   params.append('hash', hash);
   console.log(params.toString());
   ```  
   Запуск: `BOT_TOKEN=... node scripts/mock-initdata.js`.
3. Запустить оба сервера (`npm run dev` в webapp и backend). Фронт выполнит `POST /api/auth/verify` с initData; при успехе увидите статус `ok` и данные пользователя.

## Переменные окружения
- Создайте `.env` файлы при необходимости (ключи/токены не храним в коде).
- `DB_FILE` (опционально) — путь к SQLite файлу, по умолчанию `./db/dev.sqlite` относительно backend.

## API боёв (SQLite)
- `POST /api/session/start` — body `{ bossId }` → `{ ok, sessionId, boss, seed, serverNow }`
- `GET /api/session/:id/nextTask` — → `{ ok, task?, progress, attempts?, done? }` (answer скрыт)
- `POST /api/session/:id/answer` — body `{ taskId, answer }` → `{ ok, isCorrect, damage, penalty, progress, attempts, nextTask?, done }`
- `POST /api/session/:id/finish` — закрывает сессию.
- `GET /review/daily` — 5–10 карточек для повторения по последним ошибкам.

### Тестовый сценарий (curl)
```bash
# 1) Старт боя
SID=$(curl -s -X POST http://localhost:4000/api/session/start -H "Content-Type: application/json" -d '{"bossId":"present-perfect-dragon"}' | node -pe "JSON.parse(fs.readFileSync(0)).sessionId")

# 2) Получить задачу
curl -s http://localhost:4000/api/session/$SID/nextTask | jq

# 3) Ответить (подставьте реальный taskId/option)
curl -s -X POST http://localhost:4000/api/session/$SID/answer \
  -H "Content-Type: application/json" \
  -d '{"taskId":"t1","answer":"I have done my homework."}' | jq

# Повторять шаги 2-3 пока done=true, затем finish
curl -s -X POST http://localhost:4000/api/session/$SID/finish | jq
```
Сценарий с ошибками: на шаге 3 отправляйте неверный вариант — увидите `isCorrect:false`, `penalty` и снижение `hp` в `progress`.

## База данных (SQLite)
- Миграции: `cd easytalks-bot/backend && npm run db:migrate`
- Сиды (30 задач уровня A2): `npm run db:seed`
- Таблицы:  
  - `bosses(id, code, title, week)`  
  - `tasks(id, boss_id, type, payload_json, answer_key, cefr)`  
  - `sessions(id, boss_id, seed, created_at, finished_at, hp, score, combo, current_index, total, correct)`  
  - `attempts(id, session_id, task_id, selected, is_correct, at_ms, task_snapshot)`

### Проверка боёв через БД
1. `npm run db:migrate && npm run db:seed`
2. Backend `npm run dev`, фронт `npm run dev`.
3. В UI: выбрать босса → «Начать бой» → отвечать → результат.  
   Для ошибок: выбрать неверные ответы, в Result в «Разбор ошибок» появятся сохранённые попытки.
