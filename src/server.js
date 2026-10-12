import { createApp } from './app.js';
import { ensureAdmin } from './auth/admin.js';
import { createTokens } from './auth/tokens.js';
import { createMigrator } from './db/migrator.js';
import { createSequelize } from './db/sequelize.js';
import { closeLogger, createLogger } from './logging/logger.js';
import { defineUser } from './users/user.model.js';
import { UsersService } from './users/users.service.js';

const port = Number(process.env.PORT) || 3000;
const logger = createLogger();
const tokens = createTokens();
const sequelize = createSequelize();

await sequelize.authenticate();
const { database, host, port: dbPort } = sequelize.config;
logger.info(`Базу даних ${database} під’єднано (${host}:${dbPort})`, {
  event: 'db_connected',
});
const applied = await createMigrator(sequelize).up();
for (const { name } of applied)
  logger.info(`Застосовано міграцію ${name}`, { event: 'migration_applied' });

const users = new UsersService(defineUser(sequelize));
await ensureAdmin({ users, logger });

const server = createApp({ users, tokens, logger }).listen(port, () => {
  logger.info(`Сервер запущено на http://localhost:${port}`, {
    event: 'server_started',
    docs: `http://localhost:${port}/docs`,
  });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    logger.info('Сервер зупиняється', { event: 'server_stopping', signal });
    server.close(async () => {
      await sequelize.close();
      await closeLogger(logger);
    });
  });
}
