import express from 'express';
import { ConnectionError } from 'sequelize';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './docs/openapi.js';
import { usersRouter } from './users/users.router.js';

export function createApp({ users }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/', (req, res) => {
    res.json({
      name: 'magister-swp',
      description:
        'RESTful API сервер з CRUD-операціями над користувачами в PostgreSQL',
      resources: { users: '/api/users' },
      documentation: '/docs',
    });
  });

  app.use('/api/users', usersRouter(users));

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
    const message = `Маршрут ${req.method} ${req.path} не існує`;
    res.status(404).json({ error: 'NotFound', message });
  });

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      const message = 'Тіло запиту не є коректним JSON';
      return res.status(400).json({ error: 'BadRequest', message });
    }
    if (err instanceof ConnectionError) {
      console.error(`${err.name}: ${err.parent?.code ?? err.message}`);
      const message = 'База даних тимчасово недоступна';
      return res.status(503).json({ error: 'ServiceUnavailable', message });
    }
    console.error(err);
    const message = 'Внутрішня помилка сервера';
    res.status(500).json({ error: 'InternalServerError', message });
  });

  return app;
}
