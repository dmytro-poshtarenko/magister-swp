export class EmailTakenError extends Error {
  constructor(email) {
    super(`Користувач з email ${email} уже існує`);
    this.name = 'EmailTakenError';
  }
}

export class UsersStore {
  #users = new Map();
  #nextId = 1;

  list() {
    return [...this.#users.values()];
  }

  get(id) {
    return this.#users.get(id) ?? null;
  }

  create({ name, email, age = null }) {
    this.#assertEmailFree(email);
    const now = new Date().toISOString();
    const user = {
      id: this.#nextId++,
      name,
      email,
      age,
      createdAt: now,
      updatedAt: now,
    };
    this.#users.set(user.id, user);
    return user;
  }

  update(id, changes) {
    const user = this.#users.get(id);
    if (!user) return null;
    if (changes.email !== undefined) this.#assertEmailFree(changes.email, id);
    const updated = {
      ...user,
      ...changes,
      id,
      createdAt: user.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.#users.set(id, updated);
    return updated;
  }

  delete(id) {
    return this.#users.delete(id);
  }

  #assertEmailFree(email, ownId = null) {
    const wanted = email.toLowerCase();
    for (const user of this.#users.values()) {
      if (user.id !== ownId && user.email.toLowerCase() === wanted)
        throw new EmailTakenError(email);
    }
  }
}
