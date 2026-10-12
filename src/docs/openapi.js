const errorResponse = (description, example) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example } },
});

const userResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
});

const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Ідентифікатор користувача',
  schema: { type: 'integer', minimum: 1 },
  example: 1,
};

const notFound = errorResponse('Користувача не знайдено', {
  error: 'NotFound',
  message: 'Користувача з id 42 не знайдено',
});

const badId = errorResponse('Некоректний id', {
  error: 'BadRequest',
  message: 'id має бути додатним цілим числом',
});

const invalid = errorResponse('Некоректні дані', {
  error: 'ValidationError',
  message: 'Некоректні дані користувача',
  details: [{ field: 'email', message: 'email має бути коректною адресою електронної пошти' }],
});

const conflict = errorResponse('Email уже використано', {
  error: 'Conflict',
  message: 'Користувач з email olena@example.com уже існує',
});

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'magister-swp API',
    version: '1.0.0',
    description: 'RESTful API сервер з CRUD-операціями над ресурсом «користувач» (лабораторна робота № 1).',
  },
  servers: [{ url: '/' }],
  tags: [{ name: 'users', description: 'Користувачі' }],
  paths: {
    '/api/users': {
      get: {
        tags: ['users'],
        operationId: 'listUsers',
        summary: 'Отримати список користувачів',
        responses: {
          200: {
            description: 'Список користувачів',
            content: {
              'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } },
            },
          },
        },
      },
      post: {
        tags: ['users'],
        operationId: 'createUser',
        summary: 'Створити користувача',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserInput' },
              example: { name: 'Олена Коваленко', email: 'olena@example.com', age: 23 },
            },
          },
        },
        responses: {
          201: {
            ...userResponse('Користувача створено'),
            headers: { Location: { description: 'Адреса нового ресурсу', schema: { type: 'string' } } },
          },
          400: invalid,
          409: conflict,
        },
      },
    },
    '/api/users/{id}': {
      parameters: [idParameter],
      get: {
        tags: ['users'],
        operationId: 'getUser',
        summary: 'Отримати користувача за id',
        responses: { 200: userResponse('Користувач'), 400: badId, 404: notFound },
      },
      put: {
        tags: ['users'],
        operationId: 'replaceUser',
        summary: 'Повністю замінити дані користувача',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserInput' },
              example: { name: 'Олена Коваленко-Шевчук', email: 'olena.shevchuk@example.com', age: 24 },
            },
          },
        },
        responses: { 200: userResponse('Користувача оновлено'), 400: invalid, 404: notFound, 409: conflict },
      },
      patch: {
        tags: ['users'],
        operationId: 'updateUser',
        summary: 'Частково оновити дані користувача',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserPatch' },
              example: { age: 25 },
            },
          },
        },
        responses: { 200: userResponse('Користувача оновлено'), 400: invalid, 404: notFound, 409: conflict },
      },
      delete: {
        tags: ['users'],
        operationId: 'deleteUser',
        summary: 'Видалити користувача',
        responses: { 204: { description: 'Користувача видалено' }, 400: badId, 404: notFound },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Олена Коваленко' },
          email: { type: 'string', format: 'email', example: 'olena@example.com' },
          age: { type: 'integer', nullable: true, example: 23 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UserInput: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          email: { type: 'string', format: 'email' },
          age: { type: 'integer', minimum: 1, maximum: 150, nullable: true },
        },
        additionalProperties: false,
      },
      UserPatch: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          email: { type: 'string', format: 'email' },
          age: { type: 'integer', minimum: 1, maximum: 150, nullable: true },
        },
        additionalProperties: false,
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          details: {
            type: 'array',
            items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } },
          },
        },
      },
    },
  },
};
