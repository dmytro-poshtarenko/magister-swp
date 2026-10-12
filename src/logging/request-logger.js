import { randomUUID } from 'node:crypto';

function levelFor(status, path) {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  // Swagger UI loads a dozen static files per page view.
  return path.startsWith('/docs') ? 'debug' : 'info';
}

export function requestLogger(logger) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    const requestId = randomUUID();
    req.log = logger.child({ requestId });
    res.set('X-Request-Id', requestId);

    res.on('finish', () => {
      const status = res.statusCode;
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      req.log.log(
        levelFor(status, req.originalUrl),
        `${req.method} ${req.originalUrl} ${status}`,
        {
          event: 'http_request',
          method: req.method,
          path: req.originalUrl,
          status,
          durationMs: Number(durationMs.toFixed(1)),
          userId: req.user?.id,
          ip: req.ip,
          ...res.locals.log,
        },
      );
    });
    next();
  };
}
