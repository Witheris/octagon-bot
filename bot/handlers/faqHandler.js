const searchFAQ = require('../utils/fuseSearch');
const { FAQ } = require('../../database/models');

module.exports = {
  handleFAQMenu: async (bot, msg) => {
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Поиск по ключевому слову', callback_data: 'faq_search' }],
          [{ text: 'Поиск по разделам', callback_data: 'faq_sections' }],
        ],
      },
    };
    bot.sendMessage(msg.chat.id, 'Выберите способ поиска FAQ:', opts);
  },

  handleCallback: async (bot, query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'faq_search') {
      bot.sendMessage(chatId, 'Введите ключевое слово:');
      bot.once('message', async (msg) => {
        const results = await searchFAQ(msg.text);
        if (!results.length) {
          return bot.sendMessage(chatId, 'Ничего не найдено. Повторите попытку.', {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Назад', callback_data: 'faq' }],
                [{ text: 'Главное меню', callback_data: 'start' }],
              ],
            },
          });
        }

        results.slice(0, 5).forEach((r) => {
          bot.sendMessage(chatId, `❓ ${r.question}\n\n💡 ${r.answer}`);
        });
      });
    }

    if (data === 'faq_sections') {
      const faqs = await FAQ.findAll();
      const sections = [...new Set(faqs.map(f => f.section))];

      const buttons = sections.map((s) => [{ text: s, callback_data: `faq_section_${s}` }]);
      bot.sendMessage(chatId, 'Выберите раздел:', {
        reply_markup: { inline_keyboard: buttons },
      });
    }

    if (data.startsWith('faq_section_')) {
      const section = data.replace('faq_section_', '');
      const faqs = await FAQ.findAll({ where: { section } });

      const buttons = faqs.map((f) => [{ text: f.question.slice(0, 32), callback_data: `faq_q_${f.id}` }]);
      bot.sendMessage(chatId, 'Вопросы в разделе:', {
        reply_markup: { inline_keyboard: buttons },
      });
    }

    if (data.startsWith('faq_q_')) {
      const id = data.replace('faq_q_', '');
      const faq = await FAQ.findByPk(id);
      bot.sendMessage(chatId, `❓ ${faq.question}\n\n💡 ${faq.answer}`);
    }
    console.log('FAQ callback:', data);
  },
};