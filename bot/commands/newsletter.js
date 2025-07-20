const newsletterHandler = require('../handlers/newsletterHandler');
const checkAdmin = require('../middlewares/checkAdmin');

module.exports = (bot) => {
  bot.onText(/Рассылка/, checkAdmin, async (msg) => {
    await newsletterHandler.startNewsletter(bot, msg);
  });

  bot.on('message', async (msg) => {
    if (!checkAdmin.isAdmin(msg.from.id)) return;
    await newsletterHandler.handleNewsletterMessage(bot, msg);
  });
};
