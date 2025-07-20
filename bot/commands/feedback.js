const feedbackHandler = require('../handlers/feedbackHandler');

module.exports = (bot) => {
  bot.onText(/Обратная связь/, async (msg) => {
    await feedbackHandler.showFeedbackMenu(bot, msg);
  });
};
