import { Sequelize } from 'sequelize';

export function createSequelize(options = {}) {
  return new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    ...options,
  });
}
