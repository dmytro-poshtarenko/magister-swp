import winston from 'winston';
import { LokiTransport } from './loki-transport.js';

export const SERVICE = 'magister-swp';

// Puts the time, level and message first, so every console line starts the
// same way, as in the structured log example in the guide.
const leadingFields = winston.format(
  ({ timestamp, level, message, ...rest }) => ({
    timestamp,
    level,
    message,
    ...rest,
  }),
);

export function createLogger({
  level = process.env.LOG_LEVEL || 'info',
  lokiUrl = process.env.LOKI_URL,
  transports = [new winston.transports.Console()],
} = {}) {
  const all = lokiUrl
    ? [
        ...transports,
        new LokiTransport({ url: lokiUrl, labels: { service: SERVICE } }),
      ]
    : transports;
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      leadingFields(),
      winston.format.json({ deterministic: false }),
    ),
    defaultMeta: { service: SERVICE },
    transports: all,
  });
}

export async function closeLogger(logger) {
  await Promise.all(logger.transports.map((transport) => transport.close?.()));
}
