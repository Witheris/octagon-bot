const { sequelize, User, FAQ } = require('../database/models');

async function seed() {
  await sequelize.sync({ force: true });

  await User.create({
    telegramId: '1162246061', 
    name: 'Admin User',
    role: 'admin',
  });

  await User.create({
    telegramId: '',
    name: 'Regular User',
    role: 'user',
  });

  await FAQ.bulkCreate([
    {
      question: 'Как зарегистрироваться на платформе?',
      answer: 'Перейдите по ссылке https://octagon-students.ru и нажмите "Регистрация".',
      section: 'Регистрация',
    },
    {
      question: 'Что такое октокоины?',
      answer: 'Октокоины — это внутренняя валюта платформы, которую можно получить за выполнение заданий.',
      section: 'Октокоины',
    },
    {
      question: 'Как принять участие в спринте?',
      answer: 'Ознакомьтесь с текущими спринтами в разделе "Спринты" и нажмите "Принять участие".',
      section: 'Спринты',
    },
  ]);

  console.log('✔ База данных заполнена тестовыми данными');
  process.exit();
}

seed();
