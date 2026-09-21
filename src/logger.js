// PageForge 统一日志抽象（审计 E1）：按级别过滤，生产环境默认 warn 起
// 用法：import { log } from './logger.js';  log.warn('配色应用不完整', err)
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
// dev（vite serve 注入 import.meta.env.DEV）→ debug 起；构建产物 → warn 起
const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
let currentLevel = LEVELS[isDev ? 'debug' : 'warn'];
// 运行时可调（控制台：localStorage.setItem('pf-log-level', 'debug')）
try {
  const saved = localStorage.getItem('pf-log-level');
  if (saved && saved in LEVELS) currentLevel = LEVELS[saved];
} catch { /* 忽略 */ }

export const log = {
  setLevel(name) { if (name in LEVELS) currentLevel = LEVELS[name]; },
  debug: (...a) => { if (currentLevel <= LEVELS.debug) console.debug('[PF]', ...a); },
  info: (...a) => { if (currentLevel <= LEVELS.info) console.info('[PF]', ...a); },
  warn: (...a) => { if (currentLevel <= LEVELS.warn) console.warn('[PF]', ...a); },
  error: (...a) => { if (currentLevel <= LEVELS.error) console.error('[PF]', ...a); },
};
