import { createMigrator } from '../src/db/migrator.js';
import { createSequelize } from '../src/db/sequelize.js';

const TEST_DATABASE = process.env.DB_TEST_NAME ?? `${process.env.DB_NAME}_test`;

export async function connectTestDatabase() {
  // Tests empty the users table, so they must never run on the main database.
  if (TEST_DATABASE === process.env.DB_NAME) {
    throw new Error('DB_TEST_NAME має відрізнятися від DB_NAME');
  }

  const admin = createSequelize();
  try {
    const [rows] = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = ?',
      { replacements: [TEST_DATABASE] },
    );
    if (rows.length === 0) {
      const name = admin.getQueryInterface().quoteIdentifier(TEST_DATABASE);
      await admin.query(`CREATE DATABASE ${name}`);
    }
  } finally {
    await admin.close();
  }

  const sequelize = createSequelize({ database: TEST_DATABASE });
  await createMigrator(sequelize).up();
  return sequelize;
}
