import { createMigrator } from './migrator.js';
import { createSequelize } from './sequelize.js';

const sequelize = createSequelize();
try {
  await createMigrator(sequelize, { logger: console }).runAsCLI();
} finally {
  await sequelize.close();
}
