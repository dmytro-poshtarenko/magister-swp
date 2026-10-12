import { createApp } from './app.js';
import { createMigrator } from './db/migrator.js';
import { createSequelize } from './db/sequelize.js';
import { defineUser } from './users/user.model.js';
import { UsersService } from './users/users.service.js';

const port = Number(process.env.PORT) || 3000;
const sequelize = createSequelize();

await sequelize.authenticate();
const { database, host, port: dbPort } = sequelize.config;
console.log(`Базу даних ${database} під’єднано (${host}:${dbPort})`);
const applied = await createMigrator(sequelize).up();
for (const { name } of applied) console.log(`Застосовано міграцію ${name}`);

const users = new UsersService(defineUser(sequelize));
const server = createApp({ users }).listen(port, () => {
  console.log(`Сервер запущено на http://localhost:${port}`);
  console.log(`Документація API: http://localhost:${port}/docs`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => sequelize.close()));
}
