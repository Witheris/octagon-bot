const faqHandler = require('../handlers/faqHandler');
const { User } = require('../../database/models');

module.exports = (bot) => {
  bot.onText(/\/start/, async (msg) => {
    const user = await User.findOne({ where: { telegramId: msg.from.id.toString() } });
    const isAdmin = user?.role === 'admin';

    const buttons = [
      ['FAQ', 'Обратная связь'],
      ['Мои заявки', 'Рассылки']
    ];

    if (isAdmin) {
      buttons.push(['Посмотреть заявки']);
    }

    const text = `👋 Добро пожаловать в бота *Октагон*! Здесь вы можете:

📚 Получить информацию по платформе  
📝 Найти ответ в FAQ  
📩 Связаться с администрацией  
📬 Следить за своими заявками`;

    bot.sendMessage(msg.chat.id, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: buttons,
        resize_keyboard: true
      }
    });
  });

  bot.onText(/FAQ/, async (msg) => {
    await faqHandler.handleFAQMenu(bot, msg);
  });
  bot.onText(/\/whoami/, async (msg) => {
    const user = await User.findOne({ where: { telegramId: msg.from.id.toString() } });
    if (!user) return bot.sendMessage(msg.chat.id, 'Вы не зарегистрированы.');
    bot.sendMessage(msg.chat.id, `Вы: ${user.name} (${user.role})`);
  });
};
