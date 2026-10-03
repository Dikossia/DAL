// Platform rules. They match the "Expert rights" page in Dal Studio.
export const RULES = {
  maxFreeLessons: 2,             // free preview lessons per course
  maxOpenForecasts: 5,           // open forecasts per expert at a time
  maxVideoBytes: 4 * 1024 ** 3,  // 4 GB per lesson video
  maxCoverBytes: 5 * 1024 ** 2,  // 5 MB per cover
  commission: 0.2,               // platform commission per sale
  refundDays: 14,                // refunds allowed this many days after purchase
  refundMaxProgress: 0.2,        // ...and only if less than this share of the course is completed
  forecastMaxDays: 365,          // forecast horizon: from tomorrow up to one year
  rationaleMin: 120,             // minimum forecast rationale length
  sessionDays: 30,               // session lifetime
  payoutDays: [5, 20],           // days of the month when payouts happen
  loginAttempts: 10,             // failed sign-in attempts per window
  loginWindowMin: 15
} as const;

export const ROLES = ['student', 'expert', 'moderator'] as const;
export type Role = typeof ROLES[number];

export const CATEGORIES = ['beginner', 'advanced', 'workshops'] as const;
export const CATEGORY_NAMES: Record<string, string> = { beginner: 'Для новичков', advanced: 'Для продвинутых', workshops: 'Вебинары и практикумы' };
export const COVER_LIBRARY = ['foundations', 'analytics', 'workshop'];

export const VIDEO_TYPES: Record<string, string> = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/x-m4v': '.m4v' };
export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Products for the "Work with an expert", "Community" and "Ideas & analysis" modes.
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
  cancelHours: 24,          // a session booking can be cancelled no later than 24 hours before
  slotMaxDays: 180,         // schedule slots at most six months ahead
  minContent: 300,          // minimum length of an idea or review material
  previewChars: 400,        // how much of a paid material's text is visible before purchase
  messageMax: 1000,
  sessionRefundDays: 14     // sessions: refund within 14 days if no session has been scheduled
};
export const SOCIALS = ['telegram', 'instagram', 'youtube', 'linkedin', 'website'] as const;
