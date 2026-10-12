import { Router } from 'express';
import { sendError } from '../http/errors.js';
import { EmailTakenError } from '../users/users.service.js';
import { validateUser } from '../users/users.validation.js';
import { authenticate } from './auth.middleware.js';
import { validateLogin } from './auth.validation.js';
import { hashPassword, verifyPassword } from './passwords.js';

// A login with an unknown email is checked against this hash, so it takes as
// long as one with a wrong password and does not reveal which emails exist.
let dummyHash;
const getDummyHash = () => (dummyHash ??= hashPassword('no such account'));

function invalidBody(res, errors) {
  sendError(res, 400, 'ValidationError', 'Некоректні дані', errors);
}

export function authRouter({ users, tokens }) {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { value, errors } = validateUser(req.body, {
      extra: { password: { required: true } },
    });
    if (errors) return invalidBody(res, errors);
    const { password, ...profile } = value;
    const passwordHash = await hashPassword(password);
    const user = await users.create({ ...profile, passwordHash, role: 'user' });
    req.log.info('Користувача зареєстровано', {
      event: 'user_registered',
      userId: user.id,
    });
    res.status(201).location(`/api/users/${user.id}`).json(user);
  });

  router.post('/login', async (req, res) => {
    const { value, errors } = validateLogin(req.body);
    if (errors) return invalidBody(res, errors);
    const account = await users.findCredentials(value.email);
    const stored = account?.passwordHash ?? (await getDummyHash());
    const valid = await verifyPassword(value.password, stored);
    if (!account?.passwordHash || !valid) {
      req.log.warn('Невдала спроба входу', {
        event: 'login_failed',
        email: value.email,
      });
      return sendError(res, 401, 'Unauthorized', 'Невірний email або пароль');
    }
    req.log.info('Користувач увійшов', {
      event: 'login_succeeded',
      userId: account.id,
    });
    res.json({
      accessToken: tokens.sign(account),
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
    });
  });

  router.get('/me', authenticate(tokens), async (req, res) => {
    const user = await users.get(req.user.id);
    if (!user)
      return sendError(res, 404, 'NotFound', 'Користувача не знайдено');
    res.json(user);
  });

  router.use((err, req, res, next) => {
    if (err instanceof EmailTakenError)
      return sendError(res, 409, 'Conflict', err.message);
    next(err);
  });

  return router;
}
