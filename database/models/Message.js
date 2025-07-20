module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    text: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('user', 'admin'),
      allowNull: false
    }
  });

  Message.associate = (models) => {
    Message.belongsTo(models.Ticket, { foreignKey: 'ticketId' });
    Message.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return Message;
};
