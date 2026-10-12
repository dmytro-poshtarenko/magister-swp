import { DataTypes, Op, col, fn } from 'sequelize';

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable(
      'users',
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING(100), allowNull: false },
        email: { type: DataTypes.STRING(254), allowNull: false },
        age: { type: DataTypes.INTEGER, allowNull: true },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: fn('now'),
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: fn('now'),
        },
      },
      { transaction },
    );
    await queryInterface.addConstraint('users', {
      type: 'check',
      name: 'users_age_check',
      fields: ['age'],
      where: { age: { [Op.between]: [1, 150] } },
      transaction,
    });
    await queryInterface.addIndex('users', {
      name: 'users_email_lower_key',
      unique: true,
      fields: [fn('lower', col('email'))],
      transaction,
    });
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable('users');
}
