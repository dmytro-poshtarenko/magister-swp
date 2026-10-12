export function sendError(res, status, error, message, details) {
  const body = details ? { error, message, details } : { error, message };
  res.status(status).json(body);
}
