/**
 * Конфигурация моделей оценки (экспериментальная V1).
 * Веса и пороги — начальные гипотезы, а не научно откалиброванная модель.
 */

export type ExperienceWeights = {
  parity: number;
  agency: number;
  teamwork: number;
  pace: number;
};

export type PerformanceWeights = {
  economy: number;
  teamfights: number;
  objectives: number;
  survivability: number;
  utility: number;
  items: number;
};

/** Веса Match Experience Score (сумма = 1). */
export const EXPERIENCE_WEIGHTS: ExperienceWeights = {
  parity: 0.3,
  agency: 0.25,
  teamwork: 0.25,
  pace: 0.2,
};

/** Веса Player Performance Score для Turbo (сумма = 1). */
export const PERFORMANCE_WEIGHTS: PerformanceWeights = {
  economy: 0.2,
  teamfights: 0.25,
  objectives: 0.2,
  survivability: 0.15,
  utility: 0.1,
  items: 0.1,
};

/**
 * Минимальное покрытие данных, ниже которого итоговый балл не рассчитывается.
 * Для Match Experience Score: доля доступных весов компонентов.
 */
export const MIN_EXPERIENCE_COVERAGE = 0.5;

/** Минимальное покрытие компонентов для Player Performance Score. */
export const MIN_PERFORMANCE_COVERAGE = 0.5;

/** Пороги интерпретации (настраиваются). */
export const THRESHOLDS = {
  /** «Равный матч»: |преимущество золота| ниже этого значения в % серии. */
  closeLeadGoldShare: 0.4,
  /** Порог «интриги» — преимущество в золоте меньше N при пересчёте на 10 мин. */
  intrigueGoldPer10Min: 1500,
  /** Смена лидерства: смена знака преимущества. */
  minLeadChangesForComeback: 2,
  /** Участие в убийствах команды, считающееся высоким. */
  highKillParticipation: 0.55,
  /** Участие в убийствах команды, считающееся низким. */
  lowKillParticipation: 0.25,
  /** Turbo: длительность в секундах для «нормального» темпа. */
  turboDurationIdeal: [1200, 2100] as [number, number],
  /** Turbo: смертей в минуту, считающихся избыточными. */
  deathsPerMinuteHigh: 0.09,
  /** Turbo: GPM без покупок-отставания. */
  gpmLow: 300,
  gpmHigh: 700,
  xpmLow: 300,
  xpmHigh: 800,
  /** Урон по строениям. */
  towerDamageLow: 500,
  towerDamageHigh: 4000,
  /** Лечение. */
  healingLow: 0,
  healingHigh: 3000,
} as const;
