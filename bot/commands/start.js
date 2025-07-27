const { User } = require('../../database/models');

module.exports = (bot) => {
  bot.onText(/\/start/, async (msg) => {
    const user = await User.findOne({ where: { telegramId: msg.from.id.toString() } });
    const isAdmin = user?.role === 'admin';

    const text = `👋 Добро пожаловать в бота *Октагон*! Здесь вы можете:

    📚 Получить информацию по платформе  
    📝 Найти ответ в FAQ  
    📩 Связаться с администрацией  
    📬 Следить за своими заявками`;

    bot.sendMessage(msg.chat.id, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        reply_markup: { remove_keyboard: true }
      }
    });
  });
};
