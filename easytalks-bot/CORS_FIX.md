# Решение проблемы CORS

## Причина ошибки

Ошибка `No 'Access-Control-Allow-Origin' header is present on the requested resource` возникает, когда:

1. **Preflight запрос (OPTIONS) не получает правильные заголовки** - браузер отправляет OPTIONS запрос перед основным POST запросом, и этот запрос должен получить заголовки CORS
2. **Railway может блокировать OPTIONS запросы** на уровне прокси до того, как они доходят до Express приложения
3. **Middleware не срабатывает в правильном порядке** - CORS middleware должен быть ПЕРВЫМ

## Что было исправлено

1. ✅ Добавлена обработка OPTIONS запросов ДО всех других middleware
2. ✅ Упрощена конфигурация CORS - разрешены все origins
3. ✅ Добавлена тройная защита: кастомный middleware + cors middleware + явный обработчик OPTIONS
4. ✅ Используется `setHeader` вместо `header` для надежности
5. ✅ OPTIONS запросы обрабатываются сразу с возвратом статуса 204

## Проверка работы

### 1. Проверьте логи Railway

После деплоя проверьте логи на Railway. Вы должны видеть:
```
[CORS] Preflight OPTIONS from: https://easy-talk-gamma.vercel.app to /api/session/start
```

Если этих логов нет, значит OPTIONS запросы не доходят до приложения (блокируются Railway).

### 2. Проверьте в браузере

Откройте DevTools (F12) → Network → попробуйте создать бой. Вы должны увидеть:
- OPTIONS запрос к `/api/session/start` со статусом 204
- POST запрос к `/api/session/start` со статусом 200

### 3. Проверьте заголовки ответа

В Network tab проверьте, что ответ OPTIONS содержит:
- `Access-Control-Allow-Origin: https://easy-talk-gamma.vercel.app`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE, PATCH`
- `Access-Control-Allow-Headers: Content-Type, Authorization, ...`

## Если проблема все еще есть

### Вариант 1: Railway блокирует OPTIONS

Если в логах Railway нет записей об OPTIONS запросах, значит Railway блокирует их на уровне прокси.

**Решение:** Добавьте в Railway настройки прокси или используйте другой хостинг.

### Вариант 2: Проверьте переменные окружения

Убедитесь, что в Railway установлены правильные переменные:
- `PORT` - должен быть установлен автоматически Railway
- `NODE_ENV` - опционально

### Вариант 3: Используйте другой подход

Если Railway продолжает блокировать, можно:
1. Использовать другой хостинг (Render, Fly.io, Heroku)
2. Настроить Railway прокси для пропуска OPTIONS
3. Использовать Cloudflare Workers как прокси

## Текущая конфигурация

Код настроен на:
- ✅ Разрешение всех origins (можно ужесточить позже)
- ✅ Обработку OPTIONS запросов
- ✅ Установку правильных CORS заголовков
- ✅ Логирование всех CORS запросов

## Дополнительная информация

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Express CORS](https://expressjs.com/en/resources/middleware/cors.html)
- [Railway Documentation](https://docs.railway.app/)

