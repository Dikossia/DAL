// Правила платформы. Совпадают со страницей «Права эксперта» в Dal Studio.
export const RULES = {
  maxFreeLessons: 2,             // бесплатных уроков в курсе для предпросмотра
  maxOpenForecasts: 5,           // открытых прогнозов у эксперта одновременно
  maxVideoBytes: 4 * 1024 ** 3,  // 4 ГБ на видео урока
  maxCoverBytes: 5 * 1024 ** 2,  // 5 МБ на обложку
  commission: 0.2,               // комиссия платформы с продажи
  refundDays: 14,                // возврат возможен столько дней после покупки
  refundMaxProgress: 0.2,        // ...и если пройдено меньше этой доли курса
  forecastMaxDays: 365,          // срок прогноза: от завтра до года
  rationaleMin: 120,             // минимальная длина обоснования прогноза
  sessionDays: 30,               // срок жизни входа
  payoutDays: [5, 20],           // числа месяца, когда идут выплаты
  loginAttempts: 10,             // неудачных попыток входа за окно
  loginWindowMin: 15
} as const;

export const ROLES = ['student', 'expert', 'moderator'] as const;
export type Role = typeof ROLES[number];

export const CATEGORIES = ['beginner', 'advanced', 'workshops'] as const;
export const CATEGORY_NAMES: Record<string, string> = { beginner: 'Для новичков', advanced: 'Для продвинутых', workshops: 'Вебинары и практикумы' };
export const COVER_LIBRARY = ['foundations', 'analytics', 'workshop'];

export const VIDEO_TYPES: Record<string, string> = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/x-m4v': '.m4v' };
export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Продукты режимов «Работа с экспертом», «Сообщество», «Идеи и аналитика».
export const MODES = ['courses', 'experts', 'community', 'ideas'] as const;
export const PRODUCT_MODES = ['experts', 'community', 'ideas'] as const;
export const PRODUCT_TYPES: Record<string, { mode: string; name: string; kind: 'sessions' | 'subscription' | 'material' }> = {
  consultation: { mode: 'experts', name: 'Разовая консультация', kind: 'sessions' },
  personal: { mode: 'experts', name: 'Индивидуальные занятия', kind: 'sessions' },
  mentorship: { mode: 'experts', name: 'Длительное сопровождение', kind: 'sessions' },
  clubs: { mode: 'community', name: 'Закрытый клуб', kind: 'subscription' },
  chats: { mode: 'community', name: 'Чат с экспертом и участниками', kind: 'subscription' },
  investment: { mode: 'ideas', name: 'Инвестиционная идея', kind: 'material' },
  reviews: { mode: 'ideas', name: 'Обзор рынка и компаний', kind: 'material' }
};
export const MODE_NAMES: Record<string, string> = { courses: 'Курсы', experts: 'Работа с экспертом', community: 'Сообщество', ideas: 'Идеи и аналитика' };
export const PRODUCT_RULES = {
  cancelHours: 24,          // отменить запись на встречу можно не позже чем за сутки
  slotMaxDays: 180,         // слоты расписания — не дальше чем на полгода вперёд
  minContent: 300,          // минимальная длина материала идеи или обзора
  previewChars: 400,        // сколько текста платного материала видно до покупки
  messageMax: 1000,
  sessionRefundDays: 14     // встречи: возврат до 14 дней, если ни одна встреча не назначена
};
export const SOCIALS = ['telegram', 'instagram', 'youtube', 'linkedin', 'website'] as const;
