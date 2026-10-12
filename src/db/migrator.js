import { SequelizeStorage, Umzug } from 'umzug';

export function createMigrator(sequelize, { logger } = {}) {
  return new Umzug({
    migrations: { glob: ['migrations/*.js', { cwd: import.meta.dirname }] },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger,
  });
}
