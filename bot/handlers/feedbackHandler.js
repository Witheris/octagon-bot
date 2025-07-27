const { Ticket, Message, User } = require('../../database/models');

const userStates = new Map();

function extractMessageData(msg) {
  if (msg.text) return { type: 'text', content: msg.text };
  if (msg.photo) return { type: 'photo', content: msg.photo.at(-1).file_id };
  if (msg.document) return { type: 'document', content: msg.document.file_id };
  if (msg.video) return { type: 'video', content: msg.video.file_id };
  if (msg.audio) return { type: 'audio', content: msg.audio.file_id };
  return null;
}

async function showFeedbackMenu(bot, msgOrQuery) {
  const chatId = msgOrQuery.chat?.id || msgOrQuery.message?.chat?.id;
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Отправить заявку', callback_data: 'send_new_ticket' }],
        [{ text: 'Мои заявки', callback_data: 'my_tickets' }],
        [{ text: 'Главное меню', callback_data: 'start' }]
      ]
    }
  };
  await bot.sendMessage(chatId, 'Выберите действие:', options);
  userStates.delete(chatId);
}

async function promptForNewTicket(bot, msg) {
  const chatId = msg.chat.id;
  userStates.set(chatId, { action: 'waiting_for_ticket_text' });
  await bot.sendMessage(chatId, 'Опишите проблему. Для отмены нажмите "Отмена".', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel' }]]
    }
  });
}

async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  const state = userStates.get(chatId);
  if (!state) return;

  let user = await User.findOne({ where: { telegramId } });
  if (!user) {
    user = await User.create({
      telegramId,
      name: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
      role: 'user'
    });
  }

  const extracted = extractMessageData(msg);
  if (!extracted) {
    return bot.sendMessage(chatId, '❗ Поддерживаются только текст, фото, документы, аудио и видео.');
  }

  if (state.action === 'waiting_for_ticket_text') {
    const ticket = await Ticket.create({
      userId: user.id,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await Message.create({
      ticketId: ticket.id,
      userId: user.id,
      text: extracted.type === 'text' ? extracted.content : null,
      fileId: extracted.type !== 'text' ? extracted.content : null,
      mediaType: extracted.type !== 'text' ? extracted.type : null,
      type: 'user'
    });

    await bot.sendMessage(chatId, 'Заявка отправлена!', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Мои заявки', callback_data: 'my_tickets' }]]
      }
    });

    userStates.delete(chatId);
    return;
  }

  if (state.action === 'user_replying' && state.ticketId) {
    const ticket = await Ticket.findByPk(state.ticketId);
    if (!ticket) {
      await bot.sendMessage(chatId, 'Заявка не найдена.');
      userStates.delete(chatId);
      return;
    }

    await Message.create({
      ticketId: ticket.id,
      userId: user.id,
      text: extracted.type === 'text' ? extracted.content : null,
      fileId: extracted.type !== 'text' ? extracted.content : null,
      mediaType: extracted.type !== 'text' ? extracted.type : null,
      type: 'user'
    });

    ticket.updatedAt = new Date();
    await ticket.save();

    await bot.sendMessage(chatId, 'Ваше сообщение добавлено к заявке.');
    userStates.delete(chatId);

    if (process.env.ADMIN_CHAT_ID) {
      await bot.sendMessage(process.env.ADMIN_CHAT_ID, `📬 Новая заявка от ${user.name || user.telegramId} (#${ticket.id})`);
    }
    return;
  }
}

async function listUserTickets(bot, msg) {
  const chatId = msg.chat.id;
  const user = await User.findOne({ where: { telegramId: chatId.toString() } });

  if (!user) {
    await bot.sendMessage(chatId, 'Пользователь не найден.');
    return;
  }

  const tickets = await Ticket.findAll({ where: { userId: user.id }, order: [['createdAt', 'DESC']] });

  if (tickets.length === 0) {
    await bot.sendMessage(chatId, 'У вас нет заявок.', {
      reply_markup: { inline_keyboard: [[{ text: 'Назад', callback_data: 'back_to_menu' }]] }
    });
    return;
  }

  const buttons = tickets.map(t => [{
    text: `Заявка #${t.id} (${t.status})`,
    callback_data: `user_ticket_${t.id}`
  }]);

  buttons.push([{ text: 'Назад', callback_data: 'back_to_menu' }]);

  await bot.sendMessage(chatId, 'Ваши заявки:', {
    reply_markup: { inline_keyboard: buttons }
  });
}

async function showUserTicketDetails(bot, msg, ticketId) {
  const ticket = await Ticket.findByPk(ticketId, {
    include: [
      {
        model: Message,
        order: [['createdAt', 'ASC']],
      },
      User,
    ],
  });

  if (!ticket) {
    return bot.sendMessage(msg.chat.id, 'Заявка не найдена.');
  }

  const messages = ticket.Messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  let hasAdminReply = false;

  for (const m of messages) {
    const sender = m.type === 'admin' ? '🛠️ Администратор' : '👤 Пользователь';
    let caption = `${sender}:\n${m.text || ''}`;
    if (m.type === 'admin') hasAdminReply = true;

    if (m.fileId) {
      switch (m.mediaType) {
        case 'photo': await bot.sendPhoto(msg.chat.id, m.fileId, { caption }); break;
        case 'document': await bot.sendDocument(msg.chat.id, m.fileId, { caption }); break;
        case 'video': await bot.sendVideo(msg.chat.id, m.fileId, { caption }); break;
        case 'audio': await bot.sendAudio(msg.chat.id, m.fileId, { caption }); break;
        default: await bot.sendMessage(msg.chat.id, caption);
      }
    } else {
      await bot.sendMessage(msg.chat.id, caption);
    }
  }

  if (!hasAdminReply) {
    await bot.sendMessage(msg.chat.id, '🛠️ Администратор: пока не ответил');
  }

  await bot.sendMessage(msg.chat.id, `📝 Заявка #${ticket.id}\n📌 Статус: ${ticket.status}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✍️ Проблема не решена', callback_data: `user_reply_ticket_${ticket.id}` }],
        [{ text: 'Назад', callback_data: 'my_tickets' }],
      ],
    },
  });
}



async function promptUserReply(bot, msg, ticketId) {
  const chatId = msg.chat.id;
  userStates.set(chatId, { action: 'user_replying', ticketId });

  await bot.sendMessage(chatId, 'Напишите сообщение для дополнения заявки. Для отмены нажмите "Отмена".', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel' }]]
    }
  });
}

async function cancelCurrentAction(bot, chatId) {
  userStates.delete(chatId);
  await bot.sendMessage(chatId, 'Действие отменено.', {
    reply_markup: { inline_keyboard: [[{ text: 'Назад', callback_data: 'back_to_menu' }]] }
  });
}

module.exports = {
  showFeedbackMenu,
  promptForNewTicket,
  handleMessage,
  listUserTickets,
  showUserTicketDetails,
  promptUserReply,
  cancelCurrentAction
};
