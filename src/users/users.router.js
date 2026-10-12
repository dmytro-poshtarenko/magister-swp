import { Router } from 'express';
import { EmailTakenError } from './users.store.js';
import { validateUser } from './users.validation.js';

function parseId(raw) {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
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

export function usersRouter(store) {
  const router = Router();

  router.param('id', (req, res, next, raw) => {
    const id = parseId(raw);
    if (id === null) {
      const message = 'id має бути додатним цілим числом';
      return sendError(res, 400, 'BadRequest', message);
    }
    req.userId = id;
    next();
  });

  router.get('/', (req, res) => {
    res.json(store.list());
  });

  router.get('/:id', (req, res) => {
    const user = store.get(req.userId);
    if (!user) return notFound(res, req.userId);
    res.json(user);
  });

  router.post('/', (req, res) => {
    const { value, errors } = validateUser(req.body);
    if (errors) return invalidUser(res, errors);
    const user = store.create(value);
    res.status(201).location(`${req.baseUrl}/${user.id}`).json(user);
  });

  router.put('/:id', (req, res) => {
    const { value, errors } = validateUser(req.body);
    if (errors) return invalidUser(res, errors);
    const user = store.update(req.userId, value);
    if (!user) return notFound(res, req.userId);
    res.json(user);
  });

  router.patch('/:id', (req, res) => {
    const { value, errors } = validateUser(req.body, { partial: true });
    if (errors) return invalidUser(res, errors);
    const user = store.update(req.userId, value);
    if (!user) return notFound(res, req.userId);
    res.json(user);
  });

  router.delete('/:id', (req, res) => {
    if (!store.delete(req.userId)) return notFound(res, req.userId);
    res.status(204).end();
  });

  router.use((err, req, res, next) => {
    if (err instanceof EmailTakenError)
      return sendError(res, 409, 'Conflict', err.message);
    next(err);
  });

  return router;
}
