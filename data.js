window.DAL = {
  modes: [
    { id: 'courses', name: 'Курсы', icon: 'book-open', accent: '#21755a', soft: '#e8f3ed', eyebrow: 'ОБУЧЕНИЕ И ПРАКТИКА', title: 'Хорошие решения начинаются со знаний.', description: 'Учитесь у практиков. Разбирайтесь в инвестициях в своём темпе.', categories: [
      { id: 'beginner', name: 'Для новичков', subtitle: 'Первый шаг — с уверенностью', description: 'Личные финансы, первые инвестиции и понятный портфель.', image: 'foundations', label: 'С НУЛЯ', icon: 'sprout' },
      { id: 'advanced', name: 'Для продвинутых', subtitle: 'Глубже в анализ. Точнее в решениях.', description: 'Оценка компаний, стратегии и управление риском.', image: 'analytics', label: 'СЛЕДУЮЩИЙ УРОВЕНЬ', icon: 'chart-no-axes-combined' },
      { id: 'workshops', name: 'Вебинары и практикумы', subtitle: 'От теории к реальным задачам', description: 'Живые встречи, разборы и практика вместе с экспертами.', image: 'workshop', label: 'ВМЕСТЕ С ЭКСПЕРТОМ', icon: 'video' }
    ]},
    { id: 'experts', name: 'Работа с экспертом', icon: 'users-round', accent: '#6552a0', soft: '#f0edf8', eyebrow: 'ВАШ ОПЫТНЫЙ СОБЕСЕДНИК', title: 'Важные вопросы заслуживают внимания.', description: 'Одна встреча или совместная работа на длинной дистанции.', categories: [
      { id: 'consultation', name: 'Разовая консультация', description: 'Обсудите финансовые цели и получите ответы на свои вопросы.', image: 'foundations', label: 'ОДИН НА ОДИН', icon: 'messages-square' },
      { id: 'personal', name: 'Индивидуальные занятия', description: 'Персональная программа под ваши знания и интересы.', image: 'workshop', label: 'ВАШ ТЕМП', icon: 'notebook-pen' },
      { id: 'mentorship', name: 'Длительное сопровождение', description: 'Регулярные встречи, обратная связь и последовательное обучение.', image: 'analytics', label: 'НА ДИСТАНЦИИ', icon: 'route' }
    ]},
    { id: 'community', name: 'Сообщество', icon: 'messages-square', accent: '#af5b43', soft: '#faf0e9', eyebrow: 'ЛЮДИ С ОБЩИМИ ИНТЕРЕСАМИ', title: 'Учиться интереснее вместе.', description: 'Разговоры по делу, новые знакомства и разные точки зрения.', categories: [
      { id: 'clubs', name: 'Закрытый клуб', description: 'Регулярные встречи с практиками и обсуждения в небольшом кругу.', image: 'workshop', label: 'СВОЙ КРУГ', icon: 'circle-user-round' },
      { id: 'chats', name: 'Чат с экспертом и участниками', description: 'Задавайте вопросы, делитесь находками и обсуждайте рынок.', image: 'foundations', label: 'НА СВЯЗИ', icon: 'messages-square' }
    ]},
    { id: 'ideas', name: 'Идеи и аналитика', icon: 'chart-no-axes-combined', accent: '#326db6', soft: '#eaf1fb', eyebrow: 'ВЗГЛЯД НА РЫНОК', title: 'За каждым решением — своя логика.', description: 'Изучайте идеи, аргументы и историю прогнозов экспертов.', categories: [
      { id: 'signals', name: 'Сигналы', description: 'Открытые прогнозы с условиями, сроками и историей результатов.', image: 'analytics', label: 'ОТКРЫТЫЙ ДОСТУП', icon: 'radio' },
      { id: 'investment', name: 'Инвестиционные идеи', description: 'Подходы, техники и гипотезы от практикующих инвесторов.', image: 'foundations', label: 'ТОЧКИ ЗРЕНИЯ', icon: 'lightbulb' },
      { id: 'reviews', name: 'Обзоры рынка и компаний', description: 'Контекст событий, отчётность и разборы бизнес-моделей.', image: 'workshop', label: 'В ДЕТАЛЯХ', icon: 'newspaper' }
    ]}
  ],
  experts: [
    { id: 'arman', name: 'Арман Садыков', role: 'Долгосрочные инвестиции', image: 'avatar-arman', experience: '8 лет практики', students: 248, ratings: [4.9,4.8,4.7,4.8], bio: 'Помогает разобраться в личных финансах и собрать понятный подход к долгосрочным инвестициям. Объясняет через практику, конкретные ситуации и расчёты.', achievements: ['Автор программы «Первая инвестиция»', '24 открытых разбора компаний', 'Работает с начинающими инвесторами'], success: 16, forecasts: 25 },
    { id: 'aliya', name: 'Алия Нурланова', role: 'Анализ компаний и портфелей', image: 'avatar-aliya', experience: '6 лет практики', students: 182, ratings: [4.95,4.9,4.8,4.9], bio: 'Преподаёт фундаментальный анализ и оценку бизнеса. На занятиях уделяет внимание исходным данным, проверке гипотез и ограничениям любого прогноза.', achievements: ['Автор практикума по финансовой отчётности', 'Ведущая еженедельных разборов', 'Специализация: оценка компаний'], success: 19, forecasts: 28 },
    { id: 'timur', name: 'Тимур Ким', role: 'Риск и инвестиционные стратегии', image: 'avatar-timur', experience: '10 лет практики', students: 315, ratings: [4.8,4.85,4.9,4.7], bio: 'Разбирает инвестиционные стратегии через риск, горизонт и дисциплину. Помогает отличать красивую историю от проверяемого инвестиционного решения.', achievements: ['Автор курса по управлению риском', '35 практических занятий', 'Ведущий клуба инвесторов'], success: 22, forecasts: 34 }
  ],
  products: [
    {id:'c1',mode:'courses',category:'beginner',title:'Первая инвестиция: от цели к портфелю',expert:'arman',price:24900,rating:4.9,reviews:48,lessons:12,duration:'4 недели',image:'foundations',tag:'Выбор учеников',about:'Разберитесь, как устроены инвестиции, сформулируйте цели и составьте первый учебный портфель. Все шаги разбираем на понятных примерах.',modules:['Финансовые цели и горизонт','Резерв и личный бюджет','Как устроен фондовый рынок','Риск и доходность','Акции: доля в бизнесе','Облигации: как устроен долг','Фонды и диверсификация','Выбор брокера: что проверить','Комиссии и расходы','Собираем учебный портфель','Проверяем решения','Личный план следующих шагов']},
    {id:'c2',mode:'courses',category:'beginner',title:'Финансовая грамотность без сложных слов',expert:'aliya',price:14900,rating:4.95,reviews:32,lessons:8,duration:'2 недели',image:'workshop',tag:'С нуля'},
    {id:'c3',mode:'courses',category:'beginner',title:'ETF и облигации: спокойный старт',expert:'timur',price:19900,rating:4.8,reviews:27,lessons:10,duration:'3 недели',image:'analytics',tag:'Практический курс'},
    {id:'c4',mode:'courses',category:'advanced',title:'Читаем отчётность и оцениваем бизнес',expert:'aliya',price:44900,rating:4.95,reviews:42,lessons:18,duration:'6 недель',image:'analytics',tag:'Глубокий разбор'},
    {id:'c5',mode:'courses',category:'advanced',title:'Управление риском в портфеле',expert:'timur',price:34900,rating:4.8,reviews:36,lessons:14,duration:'4 недели',image:'foundations',tag:'Стратегия'},
    {id:'c6',mode:'courses',category:'advanced',title:'Стоимость компании: от данных к модели',expert:'arman',price:39900,rating:4.9,reviews:19,lessons:16,duration:'5 недель',image:'workshop',tag:'С расчётами'},
    {id:'c7',mode:'courses',category:'workshops',title:'Разбираем годовой отчёт вместе',expert:'aliya',price:7900,rating:4.95,reviews:18,lessons:1,duration:'90 минут',image:'workshop',tag:'10 октября · 19:00'},
    {id:'c8',mode:'courses',category:'workshops',title:'Портфель на практике: открытый разбор',expert:'timur',price:9900,rating:4.8,reviews:24,lessons:1,duration:'2 часа',image:'analytics',tag:'12 октября · 18:00'},
    {id:'e1',mode:'experts',category:'consultation',title:'Финансовые цели: с чего начать',expert:'arman',price:15000,rating:4.8,reviews:25,lessons:1,duration:'60 минут',image:'foundations',tag:'Видеовстреча'},
    {id:'e2',mode:'experts',category:'consultation',title:'Обсудим ваш инвестиционный подход',expert:'aliya',price:20000,rating:4.9,reviews:21,lessons:1,duration:'60 минут',image:'workshop',tag:'Видеовстреча'},
    {id:'e3',mode:'experts',category:'personal',title:'Фундаментальный анализ один на один',expert:'aliya',price:65000,rating:4.9,reviews:14,lessons:4,duration:'4 занятия',image:'analytics',tag:'Персонально'},
    {id:'e4',mode:'experts',category:'personal',title:'Учимся понимать риск',expert:'timur',price:55000,rating:4.85,reviews:17,lessons:4,duration:'4 занятия',image:'foundations',tag:'Персонально'},
    {id:'e5',mode:'experts',category:'mentorship',title:'Три месяца осознанных инвестиций',expert:'arman',price:99000,rating:4.8,reviews:18,lessons:12,duration:'3 месяца',image:'workshop',tag:'Сопровождение'},
    {id:'e6',mode:'experts',category:'mentorship',title:'Системный подход к портфелю',expert:'timur',price:119000,rating:4.85,reviews:16,lessons:12,duration:'3 месяца',image:'analytics',tag:'Сопровождение'},
    {id:'g1',mode:'community',category:'clubs',title:'Клуб долгосрочных инвесторов',expert:'timur',price:7900,rating:4.9,reviews:37,lessons:4,duration:'1 месяц',image:'workshop',tag:'Встречи каждую неделю'},
    {id:'g2',mode:'community',category:'clubs',title:'Книжный клуб: деньги и мышление',expert:'arman',price:4900,rating:4.7,reviews:23,lessons:4,duration:'1 месяц',image:'foundations',tag:'Небольшая группа'},
    {id:'g3',mode:'community',category:'chats',title:'Разговор о рынке с Алией',expert:'aliya',price:3900,rating:4.8,reviews:28,lessons:4,duration:'1 месяц',image:'analytics',tag:'Обсуждения каждый день'},
    {id:'g4',mode:'community',category:'chats',title:'Первые шаги: вопросы и ответы',expert:'arman',price:0,rating:4.7,reviews:46,lessons:4,duration:'Открытый чат',image:'workshop',tag:'Бесплатно'},
    {id:'i1',mode:'ideas',category:'investment',title:'Как искать компании с устойчивым бизнесом',expert:'aliya',price:4900,rating:4.9,reviews:22,lessons:3,duration:'25 минут',image:'foundations',tag:'Методика'},
    {id:'i2',mode:'ideas',category:'investment',title:'Диверсификация: что скрывается за словом',expert:'timur',price:0,rating:4.7,reviews:34,lessons:2,duration:'15 минут',image:'analytics',tag:'Открытый материал'},
    {id:'i3',mode:'ideas',category:'reviews',title:'Как читать рынок в сезон отчётности',expert:'arman',price:0,rating:4.8,reviews:31,lessons:3,duration:'20 минут',image:'analytics',tag:'Обзор'},
    {id:'i4',mode:'ideas',category:'reviews',title:'Разбор компании: от выручки к денежному потоку',expert:'aliya',price:5900,rating:4.9,reviews:29,lessons:4,duration:'35 минут',image:'workshop',tag:'Аналитика'}
  ],
  signals: [
    {id:'s1',ticker:'AAPL',name:'Apple',expert:'aliya',date:'15 сентября 2026',deadline:'15 октября 2026',target:250,start:230,current:241,status:'active',note:'Гипотеза о росте на фоне результатов компании. Условие: цена закрытия 15 октября не ниже $250. Источник: учебный набор данных.'},
    {id:'s2',ticker:'MSFT',name:'Microsoft',expert:'arman',date:'1 сентября 2026',deadline:'30 сентября 2026',target:460,start:430,current:468,status:'success',note:'Условие: цена закрытия 30 сентября не ниже $460. Учебный результат: $468.'},
    {id:'s3',ticker:'NVDA',name:'NVIDIA',expert:'timur',date:'1 сентября 2026',deadline:'30 сентября 2026',target:190,start:170,current:164,status:'miss',note:'Условие: цена закрытия 30 сентября не ниже $190. Учебный результат: $164. Неуспешный прогноз остаётся в истории.'},
    {id:'s4',ticker:'SPY',name:'S&P 500 ETF',expert:'arman',date:'20 сентября 2026',deadline:'20 октября 2026',target:650,start:620,current:632,status:'active',note:'Условие: цена закрытия 20 октября не ниже $650. Источник: учебный набор данных.'}
  ]
};
