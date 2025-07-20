const { Ticket, Message, User } = require('../../database/models');
const adminStates = new Map();
const SUPPORTED_TYPES = ['text', 'photo', 'document', 'video', 'audio'];

function extractMessageData(msg) {
  if (msg.text) return { type: 'text', content: msg.text };
  if (msg.photo) {
    const photo = msg.photo[msg.photo.length - 1];
    return { type: 'photo', content: photo.file_id };
  }
  if (msg.document) return { type: 'document', content: msg.document.file_id };
  if (msg.video) return { type: 'video', content: msg.video.file_id };
  if (msg.audio) return { type: 'audio', content: msg.audio.file_id };

  return null;
}

async function listAllTickets(bot, msg) {
  const chatId = msg.chat.id;
  const tickets = await Ticket.findAll({ order: [['createdAt', 'DESC']], include: [User] });

  if (!tickets.length) {
    return bot.sendMessage(chatId, 'Заявок нет.');
  }

  const buttons = await Promise.all(tickets.map(async (ticket) => {
    const firstMessage = await Message.findOne({
      where: { ticketId: ticket.id, type: 'user' },
      order: [['createdAt', 'ASC']]
    });

    const shortText = firstMessage?.content
      ? firstMessage.content.slice(0, 32) + (firstMessage.content.length > 32 ? '…' : '')
      : '[без текста]';

    return [{
      text: `#${ticket.id} - ${shortText}`,
      callback_data: `admin_ticket_${ticket.id}`
    }];
  }));

  buttons.push([{ text: 'Назад', callback_data: 'admin_back' }]);

  await bot.sendMessage(chatId, 'Список заявок:', {
    reply_markup: { inline_keyboard: buttons }
  });
}


async function showTicketDetails(bot, query, ticketId) {
  const chatId = query.from.id;

  const ticket = await Ticket.findByPk(ticketId, {
    include: [
      { model: Message, include: [User] },
      User
    ],
    order: [[Message, 'createdAt', 'ASC']]
  });

  if (!ticket) return bot.sendMessage(chatId, 'Заявка не найдена.');

  let text = `Заявка #${ticket.id} от ${ticket.User?.name || ticket.User?.telegramId}\nСтатус: ${ticket.status}`;
  await bot.sendMessage(chatId, text);

for (const m of ticket.Messages) {
  const sender = m.User?.name || 'Пользователь';
  const caption = `${sender}:\n${m.content || ''}`;

  switch (m.type) {
    case 'text':
      await bot.sendMessage(chatId, caption);
      break;
    case 'photo':
      await bot.sendPhoto(chatId, m.fileId, { caption });
      break;
    case 'document':
      await bot.sendDocument(chatId, m.fileId, { caption });
      break;
    case 'video':
      await bot.sendVideo(chatId, m.fileId, { caption });
      break;
    case 'audio':
      await bot.sendAudio(chatId, m.fileId, { caption });
      break;
    default:
      await bot.sendMessage(chatId, caption);
  }
}


  const buttons = [
    [{ text: 'Ответить', callback_data: `admin_reply_ticket_${ticket.id}` }],
    [{ text: 'Закрыть заявку', callback_data: `admin_close_ticket_${ticket.id}` }],
    [{ text: 'Назад', callback_data: 'admin_back' }]
  ];

  await bot.sendMessage(chatId, 'Действие:', {
    reply_markup: { inline_keyboard: buttons }
  });
}
async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = adminStates.get(chatId);
  if (!state || state.action !== 'replying') return;

  const ticket = await Ticket.findByPk(state.ticketId);
  if (!ticket) {
    await bot.sendMessage(chatId, 'Заявка не найдена.');
    adminStates.delete(chatId);
    return;
  }

  const adminUser = await User.findOne({ where: { telegramId: chatId } });
  if (!adminUser) {
    await bot.sendMessage(chatId, 'Вы не зарегистрированы как администратор.');
    adminStates.delete(chatId);
    return;
  }

  const extracted = extractMessageData(msg);
  if (!extracted) {
    await bot.sendMessage(chatId, 'Поддерживаются только текст, фото, документы, аудио и видео.');
    return;
  }

  await Message.create({
    ticketId: ticket.id,
    userId: adminUser.id,
    type: 'admin',
    content: extracted.type === 'text' ? extracted.content : null,
    fileId: extracted.type !== 'text' ? extracted.content : null
  });



const user = await User.findByPk(ticket.userId);

if (!user || !user.telegramId) {
  await bot.sendMessage(chatId, 'Пользователь для отправки ответа не найден.');
  adminStates.delete(chatId);
  return;
}

if (isNaN(user.telegramId)) {
  await bot.sendMessage(chatId, 'Невозможно отправить сообщение: telegramId пользователя невалидный.');
  adminStates.delete(chatId);
  return;
}

const caption = `Ответ администратора:\n${extracted.type === 'text' ? extracted.content : ''}`;

try {
  switch (extracted.type) {
    case 'text':
      await bot.sendMessage(user.telegramId, caption);
      break;
    case 'photo':
      await bot.sendPhoto(user.telegramId, extracted.content, { caption });
      break;
    case 'document':
      await bot.sendDocument(user.telegramId, extracted.content, { caption });
      break;
    case 'video':
      await bot.sendVideo(user.telegramId, extracted.content, { caption });
      break;
    case 'audio':
      await bot.sendAudio(user.telegramId, extracted.content, { caption });
      break;
  }
} catch (err) {
  console.error('Ошибка при отправке ответа пользователю:', err.message);
  await bot.sendMessage(chatId, 'Не удалось отправить сообщение пользователю. Возможно, это бот или пользователь заблокировал бота.');
}

await bot.sendMessage(chatId, 'Ответ отправлен пользователю.', {
  reply_markup: {
    inline_keyboard: [[{ text: 'Назад', callback_data: 'admin_back' }]]
  }
});

adminStates.delete(chatId);

}

async function handleAdminCallback(bot, query) {
  const data = query.data;
  if (data.startsWith('admin_ticket_')) {
    const ticketId = data.replace('admin_ticket_', '');
    return showTicketDetails(bot, query, ticketId);
  }
  if (data.startsWith('admin_reply_ticket_')) {
    const ticketId = data.replace('admin_reply_ticket_', '');
    return promptReply(bot, { chat: { id: query.message.chat.id } }, ticketId);
  }
  if (data.startsWith('admin_close_ticket_')) {
    const ticketId = data.replace('admin_close_ticket_', '');
    return closeTicket(bot, { chat: { id: query.message.chat.id } }, ticketId);
  }
}

module.exports = {
  listAllTickets,
  handleAdminCallback,
  showTicketDetails,
  extractMessageData,
  handleMessage
};
