const { User } = require('../../database/models');

const newsletterStates = new Map();

async function startNewsletter(bot, msg) {
  const chatId = msg.chat.id;
  newsletterStates.set(chatId, { step: 'awaiting_text' });
  await bot.sendMessage(chatId, 'Введите текст рассылки или нажмите Отмена.', {
    reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel' }]] }
  });
}

async function handleNewsletterMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = newsletterStates.get(chatId);
  if (!state) return;

  if (msg.text === 'Отмена' || msg.text === '/cancel') {
    newsletterStates.delete(chatId);
    await bot.sendMessage(chatId, 'Рассылка отменена.');
    return;
  }

  if (state.step === 'awaiting_text') {
    state.text = msg.text;
    state.step = 'confirm';
    await bot.sendMessage(chatId, `Вы хотите отправить рассылку с текстом:\n\n${msg.text}\n\nПодтвердите или отмените.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Подтвердить', callback_data: 'newsletter_confirm' }],
          [{ text: 'Отмена', callback_data: 'cancel' }]
        ]
      }
    });
  }
}

async function sendNewsletter(bot, chatId) {
  const state = newsletterStates.get(chatId);
  if (!state) return;

  const users = await User.findAll();
  for (const user of users) {
    try {
      await bot.sendMessage(user.telegramId, state.text);
    } catch (e) {
      console.warn(`Не удалось отправить пользователю ${user.telegramId}`, e);
    }
  }

  newsletterStates.delete(chatId);
  await bot.sendMessage(chatId, 'Рассылка отправлена.');
}

module.exports = {
  startNewsletter,
  handleNewsletterMessage,
  sendNewsletter
};
