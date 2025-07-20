const { Ticket, Message, User } = require('../../database/models');

const userStates = new Map();

async function showFeedbackMenu(bot, msgOrQuery) {
  const chatId = msgOrQuery.chat?.id || msgOrQuery.message?.chat?.id;
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Отправить заявку', callback_data: 'send_new_ticket' }],
        [{ text: 'Мои заявки', callback_data: 'my_tickets' }]
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

  if (state.action === 'waiting_for_ticket_text') {
    // Чтобы избежать дублирования, проверяем, не было ли уже создано
    // можно добавить временную метку в userStates и проверять ее
    // либо отключить повторные вызовы этой функции во внешнем коде

    const ticket = await Ticket.create({
      userId: user.id,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await Message.create({
      ticketId: ticket.id,
      userId: user.id,
      text: msg.text,
      type: 'user'
    });

    await bot.sendMessage(chatId, 'Заявка отправлена!', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Мои заявки', callback_data: 'my_tickets' }]]
      }
    });

    userStates.delete(chatId);
    return;  // Добавил return, чтобы избежать двойной обработки
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
      text: msg.text,
      type: 'user'
    });

    ticket.updatedAt = new Date();
    await ticket.save();

    await bot.sendMessage(chatId, 'Ваше сообщение добавлено к заявке.');
    userStates.delete(chatId);

    const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID, `Новый ответ от пользователя в заявке #${ticket.id}`);
    }
    return;
  }
}

async function listUserTickets(bot, msg) {
  const chatId = msg.chat.id;
  const user = await User.findOne({ where: { telegramId: chatId.toString() } }); // исправил - telegramId это id пользователя из Telegram, а не chatId

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
  const chatId = msg.chat.id;
  const ticket = await Ticket.findByPk(ticketId, {
    include: [{
      model: Message,
      include: [User],
      order: [['createdAt', 'ASC']]
    }]
  });

  if (!ticket) {
    await bot.sendMessage(chatId, 'Заявка не найдена.');
    return;
  }

  let text = `📝 Заявка #${ticket.id}\n📌 Статус: ${ticket.status}\n\n`;

  for (const m of ticket.Messages) {
    const sender = m.userId === ticket.userId ? '👤 Пользователь' : '🛠 Админ';
    text += `${sender}: ${m.text || m.content}\n`;
  }

  const buttons = [];
  if (ticket.status === 'open') {
    buttons.push([{ text: '✍️ Проблема не решена', callback_data: `user_reply_ticket_${ticket.id}` }]);
    buttons.push([{ text: '✅ Закрыть заявку', callback_data: `user_close_ticket_${ticket.id}` }]);
  }

  buttons.push([{ text: '↩️ Назад', callback_data: 'my_tickets' }]);

  await bot.sendMessage(chatId, text.slice(0, 4096), {
    reply_markup: { inline_keyboard: buttons }
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

async function closeUserTicket(bot, msg, ticketId) {
  const chatId = msg.chat.id;
  const ticket = await Ticket.findByPk(ticketId);

  if (!ticket) {
    await bot.sendMessage(chatId, 'Заявка не найдена.');
    return;
  }

  ticket.status = 'closed';
  await ticket.save();

  await bot.sendMessage(chatId, `Заявка #${ticket.id} закрыта.`, {
    reply_markup: {
      inline_keyboard: [[{ text: 'Назад', callback_data: 'my_tickets' }]]
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
  closeUserTicket,
  promptUserReply,
  cancelCurrentAction
};