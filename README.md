# magister-swp

Лабораторні роботи з дисципліни «Серверне WEB-програмування»
(Черкаський державний технологічний університет, магістратура, 2026).

| Робота | Тема                                                                                                | Стан                   |
| ------ | --------------------------------------------------------------------------------------------------- | ---------------------- |
| № 1    | Створення серверної частини інформаційної системи за REST архітектурою на основі фреймворку Express | виконано, тег `lab-01` |
| № 2    | Налаштування та робота з базами даних в інформаційних системах                                      | виконано, тег `lab-02` |
| № 3    | Авторизація користувачів в інформаційних системах, логування                                        | виконано, тег `lab-03` |

Роботи послідовні: кожна наступна розширює цей самий проєкт, тому стан після кожної роботи позначено тегом git.

## Запуск

Потрібні Node.js 24 і Docker з Docker Compose.

```bash
npm install
cp .env.example .env   # задайте власні DB_PASSWORD, JWT_SECRET і ADMIN_PASSWORD
npm run db:up          # PostgreSQL, Adminer (:8081), Grafana Loki (:3100) і Grafana (:3001)
npm start              # застосовує міграції, створює адміністратора, сервер на http://localhost:3000
npm test               # автоматичні тести на окремій базі magister_swp_test
npm run screenshots    # скриншоти Swagger UI та Grafana у docs/screenshots/lab-03 (потрібен Google Chrome)
```

Документація API відкривається на http://localhost:3000/docs, логи й дашборд — у Grafana на http://localhost:3001
(вхід без пароля, бо Grafana доступна лише з локального комп'ютера).

Інші команди:

```bash
npm run db:migrate     # застосувати нові міграції без запуску сервера
npm run db:rollback    # відкотити останню міграцію
npm run db:down        # зупинити контейнери; база даних лишається в томі db-data, логи Loki зникають
```

Налаштування читаються з файлу `.env` (зразок у `.env.example`, сам `.env` не потрапляє в git):

| Змінна                                        | Призначення                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `PORT`                                        | порт сервера, типово 3000                                                  |
| `DB_HOST`, `DB_PORT`                          | адреса PostgreSQL; контейнер публікує порт 5442 лише на `127.0.0.1`        |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`           | база даних і обліковий запис; Docker створює їх під час першого запуску    |
| `DB_TEST_NAME`                                | окрема база для тестів; тести самі створюють її                            |
| `DB_LOGGING`                                  | `true` виводить у консоль кожен SQL-запит Sequelize                        |
| `ADMINER_PORT`                                | порт веб-інтерфейсу Adminer, типово 8081                                   |
| `JWT_SECRET`                                  | секрет для підпису токенів, щонайменше 32 символи (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN`                              | час дії токена, секунди, типово 3600                                       |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | адміністратор, якого сервер створює під час запуску, якщо його ще немає    |
| `LOG_LEVEL`                                   | найнижчий рівень логів: `error`, `warn`, `info` або `debug`                |
| `LOKI_URL`                                    | адреса Grafana Loki; без неї логи виводяться лише в консоль                |
| `LOKI_PORT`, `GRAFANA_PORT`                   | порти Loki і Grafana, типово 3100 і 3001                                   |

## Лабораторна робота № 1: RESTful API

Сервер на Express 5 реалізує операції CRUD (create, read, update, delete) над ресурсом «користувач».
Користувача описують поля `id`, `name`, `email`, `age`, `createdAt` і `updatedAt`. У роботі № 1 дані
зберігалися в пам'яті процесу, а з роботи № 2 — у PostgreSQL.

| Метод  | URL               | Дія                     | Успішна відповідь          | Помилки       |
| ------ | ----------------- | ----------------------- | -------------------------- | ------------- |
| GET    | `/api/users`      | список користувачів     | 200                        |               |
| POST   | `/api/users`      | створити користувача    | 201 і заголовок `Location` | 400, 409      |
| GET    | `/api/users/{id}` | отримати користувача    | 200                        | 400, 404      |
| PUT    | `/api/users/{id}` | повністю замінити дані  | 200                        | 400, 404, 409 |
| PATCH  | `/api/users/{id}` | частково оновити дані   | 200                        | 400, 404, 409 |
| DELETE | `/api/users/{id}` | видалити користувача    | 204 без тіла               | 400, 404      |
| GET    | `/`               | короткий опис API       | 200                        |               |
| GET    | `/docs`           | документація Swagger UI | 200                        |               |
| GET    | `/openapi.json`   | специфікація OpenAPI 3  | 200                        |               |

Правила перевірки даних:

- `name` — обов'язковий рядок довжиною від 2 до 100 символів (пробіли на краях обрізаються);
- `email` — обов'язкова коректна адреса, унікальна без урахування регістру (інакше 409);
- `age` — необов'язкове ціле число від 1 до 150 або `null`;
- невідомі поля відхиляються з кодом 400;
- `id` у шляху — ціле число від 1 до 2147483647 (межа типу `integer` у PostgreSQL), інакше 400.

`PUT` вимагає повного подання користувача, і пропущене `age` стає `null`; `PATCH` змінює лише передані поля.
Кожна помилка повертається як JSON `{ "error", "message", "details" }`, де `details` перелічує всі хибні поля.

```bash
curl -i -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"name": "Олена Коваленко", "email": "olena@example.com", "age": 23}'
```

Скриншоти виконаних запитів лежать у [docs/screenshots/lab-01](docs/screenshots/lab-01).

## Лабораторна робота № 2: база даних PostgreSQL

Сервер зберігає користувачів у PostgreSQL 18 через ORM Sequelize 6. Схему бази створює міграція
`src/db/migrations/20261012000000-create-users.js`, яку виконує бібліотека Umzug: сервер під час запуску
застосовує всі ще не виконані міграції, а таблиця `SequelizeMeta` пам'ятає вже виконані.

Таблиця `users`:

| Колонка      | Тип                        | Обмеження                                           |
| ------------ | -------------------------- | --------------------------------------------------- |
| `id`         | `integer`                  | первинний ключ, автоматичне збільшення              |
| `name`       | `character varying(100)`   | `NOT NULL`                                          |
| `email`      | `character varying(254)`   | `NOT NULL`, унікальний індекс на `lower(email)`     |
| `age`        | `integer`                  | може бути `NULL`, перевірка `age BETWEEN 1 AND 150` |
| `created_at` | `timestamp with time zone` | `NOT NULL`, типово `now()`                          |
| `updated_at` | `timestamp with time zone` | `NOT NULL`, типово `now()`                          |

Унікальність email без урахування регістру тепер гарантує сама база: індекс `users_email_lower_key` не дає
записати дві однакові адреси навіть двом одночасним запитам, а порушення індексу сервер повертає як 409.
Обмеження довжини і віку дублюють перевірку в коді, тож некоректні дані не потраплять у таблицю і в обхід API.
Якщо PostgreSQL недоступна, запити до `/api/users` отримують 503 замість 500.

Скриншоти Swagger UI та Adminer лежать у [docs/screenshots/lab-02](docs/screenshots/lab-02).

## Лабораторна робота № 3: авторизація та логування

Доступ до API захищено токенами JWT (JSON Web Token) з бібліотекою `jsonwebtoken`. Користувач реєструється
через `POST /api/auth/register`, отримує токен через `POST /api/auth/login` і надсилає його в заголовку
`Authorization: Bearer <токен>`. Токен підписано алгоритмом HS256 секретом `JWT_SECRET`, він містить
ідентифікатор користувача (`sub`) і роль (`role`) і діє `JWT_EXPIRES_IN` секунд. Паролі зберігаються лише як
хеш scrypt з вбудованого модуля `node:crypto` з параметрами OWASP (N = 2^17, r = 8, p = 1).

| Метод і URL                                 | Хто має доступ                               |
| ------------------------------------------- | -------------------------------------------- |
| `POST /api/auth/register`                   | будь-хто; нові користувачі мають роль `user` |
| `POST /api/auth/login`                      | будь-хто                                     |
| `GET /api/auth/me`                          | власник токена                               |
| `GET /api/users`, `GET /api/users/{id}`     | будь-який користувач з токеном               |
| `PUT`, `PATCH /api/users/{id}`              | сам користувач або `admin`                   |
| `POST /api/users`, `DELETE /api/users/{id}` | лише `admin`                                 |

Без токена або з недійсним чи простроченим токеном сервер відповідає 401 із заголовком `WWW-Authenticate`
(RFC 6750), без потрібної ролі — 403. Першого адміністратора сервер створює з `ADMIN_EMAIL` і `ADMIN_PASSWORD`.

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "olena@example.com", "password": "olena-password-2026"}' | jq -r .accessToken)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/users
```

Логи пише Winston у форматі JSON: один рядок на подію в консолі і ті самі записи в Grafana Loki, куди їх пакетами
раз на секунду надсилає власний транспорт через HTTP API Loki. Кожен вхідний запит дає запис `http_request` з
методом, шляхом, кодом відповіді, тривалістю, `userId` і `requestId` (його ж сервер повертає в заголовку
`X-Request-Id`). Рівень залежить від результату: `info` для успіху, `warn` для 4xx, `error` для 5xx. Окремо
записуються реєстрація, вхід і невдалі спроби входу. Паролі, токени й тіла запитів у логи не потрапляють.

У Grafana джерело даних Loki і дашборд «magister-swp: запити та логи» підключаються автоматично. Логи шукаються в
Explore запитом LogQL, наприклад `{service="magister-swp"} | json | status >= 400`.

Скриншоти Swagger UI та Grafana і приклад виводу консолі лежать у [docs/screenshots/lab-03](docs/screenshots/lab-03).

## Структура

```text
compose.yaml                  контейнери PostgreSQL, Adminer, Grafana Loki і Grafana
docker/loki/config.yaml       налаштування Loki
docker/grafana/               джерело даних Loki і дашборд для Grafana
.env.example                  зразок налаштувань
src/
  app.js                      збирання застосунку: middleware, маршрути, обробка помилок
  server.js                   під'єднання до бази, міграції, адміністратор, запуск і зупинка сервера
  auth/auth.router.js         маршрути /api/auth: реєстрація, вхід, власний профіль
  auth/auth.middleware.js     перевірка токена і ролі
  auth/tokens.js              видача і перевірка JWT
  auth/passwords.js           хешування паролів scrypt
  auth/admin.js               створення першого адміністратора з .env
  logging/logger.js           налаштування Winston
  logging/request-logger.js   запис кожного вхідного запиту
  logging/loki-transport.js   надсилання логів у Grafana Loki
  db/                         підключення Sequelize, Umzug і міграції
  users/                      модель, сервіс, маршрути і перевірка даних користувачів
  http/errors.js              однаковий формат помилок
  docs/openapi.js             специфікація OpenAPI для Swagger UI
test/users.test.js            тести ендпоінтів /api/users
test/auth.test.js             тести реєстрації, входу, токенів і прав доступу
test/logging.test.js          тести логування запитів і транспорту Loki
test/helpers.js, database.js  тестовий застосунок, токени і тестова база
scripts/screenshots.js        скриншоти Swagger UI та Grafana через Chrome без вікна
```
