import { DataTypes, Op } from 'sequelize';

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn(
      'users',
      'password_hash',
      { type: DataTypes.STRING(255), allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'users',
      'role',
      { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'user' },
      { transaction },
    );
    await queryInterface.addConstraint('users', {
      type: 'check',
      name: 'users_role_check',
      fields: ['role'],
      where: { role: { [Op.in]: ['user', 'admin'] } },
      transaction,
    });
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeConstraint('users', 'users_role_check', {
      transaction,
    });
    await queryInterface.removeColumn('users', 'role', { transaction });
    await queryInterface.removeColumn('users', 'password_hash', {
      transaction,
    });
  });
}
