import { Router } from 'express';
import {
  authenticate,
  forbidden,
  requireAdmin,
} from '../auth/auth.middleware.js';
import { hashPassword } from '../auth/passwords.js';
import { sendError } from '../http/errors.js';
import { EmailTakenError } from './users.service.js';
import { validateUser } from './users.validation.js';

// The largest value of the PostgreSQL integer type used for users.id.
const MAX_ID = 2_147_483_647;

function parseId(raw) {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_ID ? id : null;
}

function notFound(res, id) {
  sendError(res, 404, 'NotFound', `Користувача з id ${id} не знайдено`);
}

function invalidUser(res, errors) {
  const message = 'Некоректні дані користувача';
  sendError(res, 400, 'ValidationError', message, errors);
}

function requireSelfOrAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.id !== req.userId)
    return forbidden(res);
  next();
}

export function usersRouter({ users, tokens }) {
  const router = Router();

  router.use(authenticate(tokens));

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

  router.post('/', requireAdmin, async (req, res) => {
    const { value, errors } = validateUser(req.body, {
      extra: { password: {}, role: {} },
    });
    if (errors) return invalidUser(res, errors);
    const { password, ...profile } = value;
    if (password) profile.passwordHash = await hashPassword(password);
    const user = await users.create(profile);
    res.status(201).location(`${req.baseUrl}/${user.id}`).json(user);
  });

  router.put('/:id', requireSelfOrAdmin, async (req, res) => {
    const { value, errors } = validateUser(req.body);
    if (errors) return invalidUser(res, errors);
    const user = await users.update(req.userId, value);
    if (!user) return notFound(res, req.userId);
    res.json(user);
  });

  router.patch('/:id', requireSelfOrAdmin, async (req, res) => {
    const { value, errors } = validateUser(req.body, { partial: true });
    if (errors) return invalidUser(res, errors);
    const user = await users.update(req.userId, value);
    if (!user) return notFound(res, req.userId);
    res.json(user);
  });

  router.delete('/:id', requireAdmin, async (req, res) => {
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
