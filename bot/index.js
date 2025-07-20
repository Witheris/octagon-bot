const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { sequelize } = require('../database/models');
const feedbackHandler = require('./handlers/feedbackHandler');
const adminHandler = require('./handlers/adminHandler');
const faqHandler = require('./handlers/faqHandler');
require('dotenv').config();


const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });


require('./commands/faq')(bot);
require('./commands/feedback')(bot);
require('./commands/viewRequests')(bot);


const apiApp = require('../server/api');
apiApp.listen(process.env.PORT, () => {
  console.log(`✅ Telegram бот и API работают на порту ${process.env.PORT}`);
});


(async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('📦 База данных синхронизирована');
  } catch (err) {
    console.error('❌ Ошибка при синхронизации БД:', err);
  }
})();


bot.on('callback_query', async (query) => {
  const data = query.data;

  try {
    if (data.startsWith('faq')) {
      const faqHandler = require('./handlers/faqHandler');
      await faqHandler.handleCallback(bot, query);
    } else if (data.startsWith('admin_')) {
      const adminHandler = require('./handlers/adminHandler');
      await adminHandler.handleAdminCallback(bot, query);
    } else if (data.startsWith('admin_ticket_')) {
      const adminHandler = require('./handlers/adminHandler');
      const ticketId = data.split('_').pop();
      await adminHandler.showTicketDetails(bot, query.message, ticketId);
    } else if (data.startsWith('admin_close_ticket_')) {
      const adminHandler = require('./handlers/adminHandler');
      const ticketId = data.split('_').pop();
      await adminHandler.closeTicket(bot, query.message, ticketId);
    } else if (data.startsWith('admin_reply_ticket_')) {
      const adminHandler = require('./handlers/adminHandler');
      const ticketId = data.split('_').pop();
      await adminHandler.promptReply(bot, query.message, ticketId);
    } else if (data === 'send_new_ticket') {
      await feedbackHandler.promptForNewTicket(bot, query.message);
    } else if (data === 'my_tickets') {
      await feedbackHandler.listUserTickets(bot, query.message);
    } else if (data.startsWith('user_ticket_')) {
      const ticketId = data.split('_').pop();
      await feedbackHandler.showUserTicketDetails(bot, query.message, ticketId);
    } else if (data.startsWith('user_reply_ticket_')) {
      const ticketId = data.split('_').pop();
      await feedbackHandler.promptUserReply(bot, query.message, ticketId);
    } else if (data.startsWith('user_close_ticket_')) {
      const ticketId = data.split('_').pop();
      await feedbackHandler.closeUserTicket(bot, query.message, ticketId);
    } else if (data === 'back_to_menu') {
      await feedbackHandler.showFeedbackMenu(bot, query.message);
    } else if (data === 'cancel') {
      await feedbackHandler.cancelCurrentAction(bot, query.message.chat.id);
    } else if (data === 'start') {
      require('./commands/start')(bot, query.message);
    }

    await bot.answerCallbackQuery(query.id);

  } catch (err) {
    console.error('❌ Ошибка в callback_query:', err);
    await bot.sendMessage(query.message.chat.id, 'Произошла ошибка при обработке запроса.');
  }
});


bot.on('message', async (msg) => {
  await feedbackHandler.handleMessage(bot, msg);
});

bot.on('polling_error', (error) => {
  console.error('Polling error message:', error.message);
  console.error('Polling error stack:', error.stack);
});
