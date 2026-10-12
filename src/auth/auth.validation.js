export function validateLogin(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      errors: [{ field: null, message: 'тіло запиту має бути JSON-об’єктом' }],
    };
  }

  const errors = [];
  for (const field of ['email', 'password']) {
    if (typeof body[field] !== 'string' || body[field].length === 0)
      errors.push({ field, message: `поле ${field} обов’язкове` });
  }
  for (const field of Object.keys(body)) {
    if (field !== 'email' && field !== 'password')
      errors.push({ field, message: `невідоме поле ${field}` });
  }

  if (errors.length > 0) return { errors };
  return { value: { email: body.email.trim(), password: body.password } };
}
