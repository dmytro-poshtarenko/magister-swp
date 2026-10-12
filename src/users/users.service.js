import { UniqueConstraintError } from 'sequelize';

export class EmailTakenError extends Error {
  constructor(email) {
    super(`Користувач з email ${email} уже існує`);
    this.name = 'EmailTakenError';
  }
}

const toUser = ({ id, name, email, age, createdAt, updatedAt }) => ({
  id,
  name,
  email,
  age,
  createdAt,
  updatedAt,
});

// The unique index on lower(email) is the only unique constraint a write
// can break, so a violation always means the email is taken.
async function saveEmail(email, write) {
  try {
    return await write();
  } catch (err) {
    if (err instanceof UniqueConstraintError) throw new EmailTakenError(email);
    throw err;
  }
}

export class UsersService {
  #User;

  constructor(User) {
    this.#User = User;
  }

  async list() {
    const users = await this.#User.findAll({ order: [['id', 'ASC']] });
    return users.map(toUser);
  }

  async get(id) {
    const user = await this.#User.findByPk(id);
    return user ? toUser(user) : null;
  }

  async create(data) {
    const user = await saveEmail(data.email, () => this.#User.create(data));
    return toUser(user);
  }

  async update(id, changes) {
    const [count, [user] = []] = await saveEmail(changes.email, () =>
      this.#User.update(changes, { where: { id }, returning: true }),
    );
    return count === 0 ? null : toUser(user);
  }

  async delete(id) {
    const count = await this.#User.destroy({ where: { id } });
    return count > 0;
  }
}
