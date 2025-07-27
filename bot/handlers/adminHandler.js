const { Ticket, Message, User } = require('../../database/models');
const adminStates = new Map();

const SUPPORTED_TYPES = ['text', 'photo', 'document', 'video', 'audio'];

function extractMessageData(msg) {
  if (msg.text) return { type: 'text', content: msg.text };
  if (msg.photo) return { type: 'photo', content: msg.photo[msg.photo.length - 1].file_id };
  if (msg.document) return { type: 'document', content: msg.document.file_id };
  if (msg.video) return { type: 'video', content: msg.video.file_id };
  if (msg.audio) return { type: 'audio', content: msg.audio.file_id };
  return null;
}

function formatPreview(message) {
  if (!message) return '[без содержимого]';
  if (message.text) return message.text.slice(0, 32);
  if (message.fileId) return `[${message.mediaType || 'вложение'}]`;
  return '[без текста]';
}

async function listAllTickets(bot, query) {
  const userId = query.from.id.toString();

  const adminUser = await User.findOne({ where: { telegramId: userId } });
  if (!adminUser || adminUser.role !== 'admin') {
    return bot.sendMessage(userId, 'У вас нет доступа к этому разделу.');
  }

  const tickets = await Ticket.findAll({ order: [['createdAt', 'DESC']], include: [User] });
  if (!tickets.length) return bot.sendMessage(userId, 'Заявок нет.');

  const buttons = await Promise.all(tickets.map(async (ticket) => {
    const firstMsg = await Message.findOne({
      where: { ticketId: ticket.id },
      order: [['createdAt', 'ASC']]
    });

    const preview = formatPreview(firstMsg);
    return [{
      text: `Заявка #${ticket.id} - ${ticket.status}`,
      callback_data: `admin_ticket_${ticket.id}`
    }];
  }));

  buttons.push([{ text: 'Главное меню', callback_data: 'start' }]);

  await bot.sendMessage(userId, 'Список заявок:', {
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

  for (const m of ticket.Messages) {
    const sender = m.type === 'admin' ? '🛠️ Администратор' : '👤 Пользователь';
    const caption = `${sender}:\n${m.text || ''}`;

    if (m.fileId) {
      switch (m.mediaType) {
        case 'photo': await bot.sendPhoto(chatId, m.fileId, { caption }); break;
        case 'document': await bot.sendDocument(chatId, m.fileId, { caption }); break;
        case 'video': await bot.sendVideo(chatId, m.fileId, { caption }); break;
        case 'audio': await bot.sendAudio(chatId, m.fileId, { caption }); break;
        default: await bot.sendMessage(chatId, caption);
      }
    } else {
      await bot.sendMessage(chatId, caption);
    }
  }

  await bot.sendMessage(chatId, `📝 Заявка #${ticket.id}\n📌 Статус: ${ticket.status}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✍️ Ответить', callback_data: `admin_reply_ticket_${ticket.id}` }],
        [{ text: '✅ Закрыть заявку', callback_data: `admin_close_ticket_${ticket.id}` }],
        [{ text: 'Назад', callback_data: 'admin_requests' }]
      ]
    }
  });
}


async function promptReply(bot, msg, ticketId) {
  adminStates.set(msg.chat.id, { action: 'replying', ticketId });
  await bot.sendMessage(msg.chat.id, 'Введите сообщение для ответа пользователю:');
}

async function closeTicket(bot, msg, ticketId) {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) return bot.sendMessage(msg.chat.id, 'Заявка не найдена.');

  ticket.status = 'closed';
  await ticket.save();
  await bot.sendMessage(msg.chat.id, `Заявка #${ticket.id} закрыта.`);
}

async function handleMessage(bot, msg) {
  const state = adminStates.get(msg.chat.id);
  if (!state || state.action !== 'replying') return;

  const ticket = await Ticket.findByPk(state.ticketId);
  const adminUser = await User.findOne({ where: { telegramId: msg.chat.id } });
  const user = await User.findByPk(ticket.userId);

  if (!ticket || !adminUser || !user) {
    adminStates.delete(msg.chat.id);
    return bot.sendMessage(msg.chat.id, '❌ Ошибка: заявка или пользователь не найдены.');
  }

  const data = extractMessageData(msg);
  if (!data) return bot.sendMessage(msg.chat.id, '❌ Неподдерживаемый тип сообщения.');


  await Message.create({
    ticketId: ticket.id,
    userId: adminUser.id,
    type: 'admin',
    text: data.type === 'text' ? data.content : null,
    fileId: data.type !== 'text' ? data.content : null,
    mediaType: data.type !== 'text' ? data.type : null
  });

  const caption = `🛠️ Администратор:\n${data.type === 'text' ? data.content : 'Вложение'}`;

  try {
  switch (data.type) {
    case 'text':
      await bot.sendMessage(Number(user.telegramId), caption);
      break;
    case 'photo':
      await bot.sendPhoto(Number(user.telegramId), data.content, { caption });
      break;
    case 'document':
      await bot.sendDocument(Number(user.telegramId), data.content, { caption });
      break;
    case 'video':
      await bot.sendVideo(Number(user.telegramId), data.content, { caption });
      break;
    case 'audio':
      await bot.sendAudio(Number(user.telegramId), data.content, { caption });
      break;
    default:
      throw new Error('Unsupported media type');
  }
  await bot.sendMessage(msg.chat.id, '✅ Ответ отправлен пользователю.');
} catch (error) {
  console.error('Ошибка при отправке пользователю:', error);
  await bot.sendMessage(msg.chat.id, '❌ Ошибка при отправке пользователю. Проверьте ID.');
}

  adminStates.delete(msg.chat.id);
}

async function handleAdminCallback(bot, query) {
  const data = query.data;
  if (data.startsWith('admin_ticket_')) {
    const ticketId = data.replace('admin_ticket_', '');
    return showTicketDetails(bot, query, ticketId);
  }
  if (data.startsWith('admin_reply_ticket_')) {
    const ticketId = data.replace('admin_reply_ticket_', '');
    return promptReply(bot, { chat: { id: query.from.id } }, ticketId);
  }
  if (data.startsWith('admin_close_ticket_')) {
    const ticketId = data.replace('admin_close_ticket_', '');
    return closeTicket(bot, { chat: { id: query.from.id } }, ticketId);
  }
}

module.exports = {
  listAllTickets,
  handleAdminCallback,
  handleMessage,
  extractMessageData,
  promptReply,
  closeTicket,
  showTicketDetails,
  adminStates
};
  