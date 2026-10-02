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
