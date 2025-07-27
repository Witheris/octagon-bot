const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { sequelize } = require('../database/models');
const feedbackHandler = require('./handlers/feedbackHandler');
const adminHandler = require('./handlers/adminHandler');
const faqHandler = require('./handlers/faqHandler');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.setMyCommands([
  { command: 'start', description: 'Приветствие и начало работы' },
  { command: 'menu', description: 'Главное меню бота' }
]);

require('./commands/start')(bot);
const menuModule = require('./commands/menu');
menuModule.init(bot);
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
  console.log('callback_query.data:', data);

  try {
    await bot.answerCallbackQuery(query.id);
    if (data.startsWith('faq_search_answer_') || data.startsWith('faq_search_page_')) {
      await faqHandler.handleCallbackSearchAnswer(bot, query);
    } else if (data === 'start') {
      await menuModule.showMainMenu(bot, query.message.chat.id, query.from.id);
      return;
    } else if (data === 'faq_menu') {
      await faqHandler.handleFAQMenu(bot, query.message);
    } else if (data.startsWith('faq')) {
      await faqHandler.handleCallback(bot, query);
    } else if (data === 'admin_requests') {
      await adminHandler.listAllTickets(bot, query);
    } else if (data.startsWith('admin_')) {
      await adminHandler.handleAdminCallback(bot, query);
    } else if (data === 'send_new_ticket') {
      await feedbackHandler.promptForNewTicket(bot, query.message);
    } else if (data === 'feedback_menu') {
      await feedbackHandler.showFeedbackMenu(bot, query.message);
    } else if (data === 'my_tickets') {
      await feedbackHandler.listUserTickets(bot, query.message);
    } else if (data.startsWith('user_ticket_')) {
      const ticketId = data.split('_').pop();
      await feedbackHandler.showUserTicketDetails(bot, query.message, ticketId);
    } else if (data.startsWith('user_reply_ticket_')) {
      const ticketId = data.split('_').pop();
      await feedbackHandler.promptUserReply(bot, query.message, ticketId);
    } else if (data === 'back_to_menu') {
      await feedbackHandler.showFeedbackMenu(bot, query.message);
    } else if (data === 'cancel') {
      await feedbackHandler.cancelCurrentAction(bot, query.message.chat.id);
    }
  } catch (err) {
    console.error('❌ Ошибка в callback_query:', err);
    if (query.message && query.message.chat) {
      await bot.sendMessage(query.message.chat.id, 'Произошла ошибка при обработке запроса.');
    }
  }
});

bot.on('message', async (msg) => {
  const userId = msg.from.id;

  const adminState = adminHandler?.adminStates?.get?.(userId);
  if (adminState?.action === 'replying') {
    return adminHandler.handleMessage(bot, msg);
  }

  const faqState = faqHandler.userStates?.get?.(userId);
  if (faqState?.step === 'awaiting_keyword') {
    return faqHandler.handleMessage(bot, msg);
  }

  await feedbackHandler.handleMessage(bot, msg);
});

bot.on('polling_error', (error) => {
  console.error('Polling error message:', error.message);
  console.error('Polling error stack:', error.stack);
});