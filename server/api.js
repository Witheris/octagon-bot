const express = require('express');
const bodyParser = require('body-parser');
const { Ticket, Message, User } = require('../database/models');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

app.use((req, res, next) => {
  const token = req.headers['x-api-key'];
  if (token !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

app.get('/tickets', async (req, res) => {
  const tickets = await Ticket.findAll({
    where: { status: 'open' },
    include: [{ model: User }],
    order: [['createdAt', 'DESC']],
  });

  res.json(tickets.map((t) => ({
    id: t.id,
    user: t.User.name,
    telegramId: t.User.telegramId,
    createdAt: t.createdAt,
  })));
});

app.get('/tickets/:id/messages', async (req, res) => {
  const ticket = await Ticket.findByPk(req.params.id, {
    include: [Message],
  });

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  res.json(ticket.Messages.map((m) => ({
    id: m.id,
    sender: m.sender,
    content: m.content,
    fileId: m.fileId,
    createdAt: m.createdAt,
  })));
});

app.post('/tickets/:id/close', async (req, res) => {
  const ticket = await Ticket.findByPk(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  ticket.status = 'closed';
  await ticket.save();

  res.json({ message: 'Ticket closed' });
});

module.exports = app;
