// v2 共享 CSS 工具（审计 2.2：kebab/styleText 此前在 render.js 与 export-canvas.js 各一份）
export const kebab = (s) => String(s).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
export const styleText = (rec) => Object.entries(rec || {}).map(([k, v]) => `${kebab(k)}:${v}`).join(';');
