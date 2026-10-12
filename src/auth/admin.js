import { hashPassword } from './passwords.js';

// Registration only creates the user role, so the first administrator comes
// from ADMIN_EMAIL and ADMIN_PASSWORD in .env when the server starts.
export async function ensureAdmin({
  users,
  logger,
  email = process.env.ADMIN_EMAIL,
  password = process.env.ADMIN_PASSWORD,
  name = process.env.ADMIN_NAME || 'Адміністратор',
}) {
  if (!email || !password) return;
  if (await users.findCredentials(email)) return;
  const admin = await users.create({
    name,
    email,
    age: null,
    role: 'admin',
    passwordHash: await hashPassword(password),
  });
  logger.info('Створено адміністратора', {
    event: 'admin_created',
    userId: admin.id,
  });
}
