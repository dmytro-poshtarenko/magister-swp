import { DataTypes } from 'sequelize';

export function defineUser(sequelize) {
  return sequelize.define(
    'User',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      email: { type: DataTypes.STRING(254), allowNull: false },
      age: { type: DataTypes.INTEGER, allowNull: true },
      passwordHash: { type: DataTypes.STRING(255), allowNull: true },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'user',
      },
    },
    { tableName: 'users', underscored: true },
  );
}
