import { Router } from 'express';
import { EmailTakenError } from './users.service.js';
import { validateUser } from './users.validation.js';

// The largest value of the PostgreSQL integer type used for users.id.
const MAX_ID = 2_147_483_647;

function parseId(raw) {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_ID ? id : null;
}

function sendError(res, status, error, message, details) {
  const body = details ? { error, message, details } : { error, message };
  res.status(status).json(body);
}

function notFound(res, id) {
  sendError(res, 404, 'NotFound', `Користувача з id ${id} не знайдено`);
}

function invalidUser(res, errors) {
  const message = 'Некоректні дані користувача';
  sendError(res, 400, 'ValidationError', message, errors);
}

export function usersRouter(users) {
  const router = Router();

  router.param('id', (req, res, next, raw) => {
    const id = parseId(raw);
    if (id === null) {
      const message = `id має бути цілим числом від 1 до ${MAX_ID}`;
      return sendError(res, 400, 'BadRequest', message);
    }
    req.userId = id;
    next();
  });

  router.get('/', async (req, res) => {
    res.json(await users.list());
  });

  router.get('/:id', async (req, res) => {
    const user = await users.get(req.userId);
    if (!user) return notFound(res, req.userId);
    res.json(user);
  });

  router.post('/', async (req, res) => {
    const { value, errors } = validateUser(req.body);
    if (errors) return invalidUser(res, errors);
    const user = await users.create(value);
    res.status(201).location(`${req.baseUrl}/${user.id}`).json(user);
  });

  router.put('/:id', async (req, res) => {
    const { value, errors } = validateUser(req.body);
    if (errors) return invalidUser(res, errors);
    const user = await users.update(req.userId, value);
    if (!user) return notFound(res, req.userId);
    res.json(user);
  });

  router.patch('/:id', async (req, res) => {
    const { value, errors } = validateUser(req.body, { partial: true });
    if (errors) return invalidUser(res, errors);
    const user = await users.update(req.userId, value);
    if (!user) return notFound(res, req.userId);
    res.json(user);
  });

  router.delete('/:id', async (req, res) => {
    if (!(await users.delete(req.userId))) return notFound(res, req.userId);
    res.status(204).end();
  });

  router.use((err, req, res, next) => {
    if (err instanceof EmailTakenError)
      return sendError(res, 409, 'Conflict', err.message);
    next(err);
  });

  return router;
}
