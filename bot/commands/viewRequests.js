const adminHandler = require('../handlers/adminHandler');

module.exports = (bot) => {
  bot.onText(/Посмотреть заявки/, async (msg) => {
    await adminHandler.listAllTickets(bot, msg);
  });

  bot.onText(/\/view_requests/, async (msg) => {
    await adminHandler.listAllTickets(bot, msg);
  });
};
