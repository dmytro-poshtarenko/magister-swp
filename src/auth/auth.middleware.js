import { sendError } from '../http/errors.js';

function unauthorized(res, message, error) {
  // RFC 6750: a 401 for a bearer token names the scheme and, when a token
  // was sent, why it was refused.
  const challenge = error ? `Bearer error="${error}"` : 'Bearer';
  res.set('WWW-Authenticate', challenge);
  sendError(res, 401, 'Unauthorized', message);
}

export function authenticate(tokens) {
  return (req, res, next) => {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      res.locals.log = { authError: 'TokenMissing' };
      return unauthorized(res, 'Потрібен токен доступу');
    }
    try {
      req.user = tokens.verify(token);
      next();
    } catch (err) {
      res.locals.log = { authError: err.name };
      const message =
        err.name === 'TokenExpiredError'
          ? 'Термін дії токена минув'
          : 'Токен недійсний';
      unauthorized(res, message, 'invalid_token');
    }
  };
}

export function forbidden(res) {
  sendError(res, 403, 'Forbidden', 'Недостатньо прав для цієї дії');
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return forbidden(res);
  next();
}
