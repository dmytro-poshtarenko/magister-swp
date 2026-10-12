const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const rules = {
  name(value) {
    if (
      typeof value !== 'string' ||
      value.trim().length < 2 ||
      value.trim().length > 100
    ) {
      return 'name має бути рядком довжиною від 2 до 100 символів';
    }
    return null;
  },
  email(value) {
    if (typeof value !== 'string' || !EMAIL.test(value) || value.length > 254) {
      return 'email має бути коректною адресою електронної пошти';
    }
    return null;
  },
  age(value) {
    if (value === null) return null;
    if (!Number.isInteger(value) || value < 1 || value > 150) {
      return 'age має бути цілим числом від 1 до 150 або null';
    }
    return null;
  },
};

const REQUIRED = ['name', 'email'];

/**
 * Checks a request body against the user schema.
 * With `partial` (PATCH) only the fields present are checked, and at least
 * one is required; without it (POST, PUT) name and email are required and
 * a missing age becomes null.
 */
export function validateUser(body, { partial = false } = {}) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      errors: [{ field: null, message: 'тіло запиту має бути JSON-об’єктом' }],
    };
  }

  const errors = [];
  const value = {};
  for (const field of Object.keys(rules)) {
    if (body[field] === undefined) {
      if (!partial && REQUIRED.includes(field))
        errors.push({ field, message: `поле ${field} обов’язкове` });
      continue;
    }
    const message = rules[field](body[field]);
    if (message) errors.push({ field, message });
    else
      value[field] =
        typeof body[field] === 'string' ? body[field].trim() : body[field];
  }

  const unknown = Object.keys(body).filter((field) => !(field in rules));
  for (const field of unknown)
    errors.push({ field, message: `невідоме поле ${field}` });

  if (partial && errors.length === 0 && Object.keys(value).length === 0) {
    errors.push({
      field: null,
      message: 'потрібно передати хоча б одне з полів name, email, age',
    });
  }
  if (!partial && value.age === undefined && errors.length === 0)
    value.age = null;

  return errors.length > 0 ? { errors } : { value };
}
