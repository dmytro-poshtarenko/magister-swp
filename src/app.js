import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './docs/openapi.js';
import { usersRouter } from './users/users.router.js';
import { UsersStore } from './users/users.store.js';

export function createApp({ store = new UsersStore() } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/', (req, res) => {
    res.json({
      name: 'magister-swp',
      description: 'RESTful API сервер з CRUD-операціями над користувачами',
      resources: { users: '/api/users' },
      documentation: '/docs',
    });
  });

  app.use('/api/users', usersRouter(store));

  app.get('/openapi.json', (req, res) => res.json(openApiSpec));
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'magister-swp API',
      customCss: '.swagger-ui .topbar { display: none }',
    }),
  );

  app.use((req, res) => {
    res.status(404).json({ error: 'NotFound', message: `Маршрут ${req.method} ${req.path} не існує` });
  });

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'BadRequest', message: 'Тіло запиту не є коректним JSON' });
    }
    console.error(err);
    res.status(500).json({ error: 'InternalServerError', message: 'Внутрішня помилка сервера' });
  });

  return app;
}
