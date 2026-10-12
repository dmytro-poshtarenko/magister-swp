const errorResponse = (description, example) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      example,
    },
  },
});

const userResponse = (description) => ({
  description,
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/User' } },
  },
});

const jsonBody = (schema, example) => ({
  required: true,
  content: {
    'application/json': {
      schema: { $ref: `#/components/schemas/${schema}` },
      example,
    },
  },
});

const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Ідентифікатор користувача',
  schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  example: 1,
};

const bearer = [{ bearerAuth: [] }];

const notFound = errorResponse('Користувача не знайдено', {
  error: 'NotFound',
  message: 'Користувача з id 42 не знайдено',
});

const badId = errorResponse('Некоректний id', {
  error: 'BadRequest',
  message: 'id має бути цілим числом від 1 до 2147483647',
});

const invalid = errorResponse('Некоректні дані', {
  error: 'ValidationError',
  message: 'Некоректні дані користувача',
  details: [
    {
      field: 'email',
      message: 'email має бути коректною адресою електронної пошти',
    },
  ],
});

const conflict = errorResponse('Email уже використано', {
  error: 'Conflict',
  message: 'Користувач з email olena@example.com уже існує',
});

const unauthorized = errorResponse('Немає токена або токен недійсний', {
  error: 'Unauthorized',
  message: 'Потрібен токен доступу',
});

const forbidden = errorResponse('Недостатньо прав', {
  error: 'Forbidden',
  message: 'Недостатньо прав для цієї дії',
});

const unavailable = errorResponse('База даних недоступна', {
  error: 'ServiceUnavailable',
  message: 'База даних тимчасово недоступна',
});

const profile = {
  name: { type: 'string', minLength: 2, maxLength: 100 },
  email: { type: 'string', format: 'email' },
  age: { type: 'integer', minimum: 1, maximum: 150, nullable: true },
};

const password = { type: 'string', minLength: 8, maxLength: 128 };

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'magister-swp API',
    version: '3.0.0',
    description:
      'RESTful API сервер з CRUD-операціями над ресурсом «користувач». Дані зберігаються в PostgreSQL, доступ до /api/users потребує токена JWT, отриманого через /api/auth/login (лабораторна робота № 3).',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'auth', description: 'Реєстрація та вхід' },
    { name: 'users', description: 'Користувачі' },
  ],
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['auth'],
        operationId: 'register',
        summary: 'Зареєструватися з роллю user',
        requestBody: jsonBody('RegisterInput', {
          name: 'Олена Коваленко',
          email: 'olena@example.com',
          age: 23,
          password: 'olena-password-2026',
        }),
        responses: {
          201: userResponse('Користувача зареєстровано'),
          400: invalid,
          409: conflict,
          503: unavailable,
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['auth'],
        operationId: 'login',
        summary: 'Увійти й отримати токен доступу',
        requestBody: jsonBody('LoginInput', {
          email: 'olena@example.com',
          password: 'olena-password-2026',
        }),
        responses: {
          200: {
            description: 'Токен доступу',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Token' },
              },
            },
          },
          400: invalid,
          401: errorResponse('Невірний email або пароль', {
            error: 'Unauthorized',
            message: 'Невірний email або пароль',
          }),
          503: unavailable,
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['auth'],
        operationId: 'me',
        summary: 'Отримати власний профіль',
        security: bearer,
        responses: {
          200: userResponse('Профіль користувача, якому належить токен'),
          401: unauthorized,
          404: notFound,
          503: unavailable,
        },
      },
    },
    '/api/users': {
      get: {
        tags: ['users'],
        operationId: 'listUsers',
        summary: 'Отримати список користувачів',
        security: bearer,
        responses: {
          200: {
            description: 'Список користувачів',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/User' },
                },
              },
            },
          },
          401: unauthorized,
          503: unavailable,
        },
      },
      post: {
        tags: ['users'],
        operationId: 'createUser',
        summary: 'Створити користувача (лише admin)',
        security: bearer,
        requestBody: jsonBody('UserCreate', {
          name: 'Іван Петренко',
          email: 'ivan@example.com',
          age: 31,
          password: 'ivan-password-2026',
          role: 'user',
        }),
        responses: {
          201: {
            ...userResponse('Користувача створено'),
            headers: {
              Location: {
                description: 'Адреса нового ресурсу',
                schema: { type: 'string' },
              },
            },
          },
          400: invalid,
          401: unauthorized,
          403: forbidden,
          409: conflict,
          503: unavailable,
        },
      },
    },
    '/api/users/{id}': {
      parameters: [idParameter],
      get: {
        tags: ['users'],
        operationId: 'getUser',
        summary: 'Отримати користувача за id',
        security: bearer,
        responses: {
          200: userResponse('Користувач'),
          400: badId,
          401: unauthorized,
          404: notFound,
          503: unavailable,
        },
      },
      put: {
        tags: ['users'],
        operationId: 'replaceUser',
        summary: 'Повністю замінити дані (власник або admin)',
        security: bearer,
        requestBody: jsonBody('UserInput', {
          name: 'Олена Коваленко-Шевчук',
          email: 'olena.shevchuk@example.com',
          age: 24,
        }),
        responses: {
          200: userResponse('Користувача оновлено'),
          400: invalid,
          401: unauthorized,
          403: forbidden,
          404: notFound,
          409: conflict,
          503: unavailable,
        },
      },
      patch: {
        tags: ['users'],
        operationId: 'updateUser',
        summary: 'Частково оновити дані (власник або admin)',
        security: bearer,
        requestBody: jsonBody('UserPatch', { age: 25 }),
        responses: {
          200: userResponse('Користувача оновлено'),
          400: invalid,
          401: unauthorized,
          403: forbidden,
          404: notFound,
          409: conflict,
          503: unavailable,
        },
      },
      delete: {
        tags: ['users'],
        operationId: 'deleteUser',
        summary: 'Видалити користувача (лише admin)',
        security: bearer,
        responses: {
          204: { description: 'Користувача видалено' },
          400: badId,
          401: unauthorized,
          403: forbidden,
          404: notFound,
          503: unavailable,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Олена Коваленко' },
          email: {
            type: 'string',
            format: 'email',
            example: 'olena@example.com',
          },
          age: { type: 'integer', nullable: true, example: 23 },
          role: { type: 'string', enum: ['user', 'admin'], example: 'user' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UserInput: {
        type: 'object',
        required: ['name', 'email'],
        properties: profile,
        additionalProperties: false,
      },
      UserCreate: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          ...profile,
          password,
          role: { type: 'string', enum: ['user', 'admin'], default: 'user' },
        },
        additionalProperties: false,
      },
      UserPatch: {
        type: 'object',
        minProperties: 1,
        properties: profile,
        additionalProperties: false,
      },
      RegisterInput: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: { ...profile, password },
        additionalProperties: false,
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string' }, password: { type: 'string' } },
        additionalProperties: false,
      },
      Token: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          tokenType: { type: 'string', example: 'Bearer' },
          expiresIn: {
            type: 'integer',
            description: 'Час дії токена, секунди',
            example: 3600,
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};
