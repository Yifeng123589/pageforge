// v2 主题应用（A0-4）：复用 v1 的 5 套主题色板映射（src/themes.js）。
//
// 机制：一套主题 = 一张"原始色 → 主题色"的映射表（map）。
// 关键：**连续切换必须先还原**——先用当前主题的**反向表**把元素里的颜色还原回原始色，
//       再套用目标主题的 map。否则第二次切换会因为"元素里已经是主题色、不在 map 的 key 里"而失效。
// 用户手动改过的颜色不在任何 map 的 key 里 → 主题不会动它（符合直觉）。
//
// 本模块是纯函数（无 DOM、无副作用），便于回归断言直接对文档数据校验。

import { themes } from '../themes.js';

const HEX6 = /#[0-9a-fA-F]{6}\b/g;
const HEX3 = /#[0-9a-fA-F]{3}\b/g;

/** #abc → #aabbcc */
function expand(hex) {
  if (hex.length === 4) return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  return hex;
}

/** 反向表：主题色 → 原始色 */
function reverseMap(theme) {
  const rev = {};
  if (theme && theme.map) {
    Object.entries(theme.map).forEach(([from, to]) => { rev[expand(to)] = from; });
  }
  return rev;
}

/** 按表替换字符串里的 hex 颜色（表里没有的原样保留） */
function replaceColors(str, table) {
  if (!str || typeof str !== 'string') return str;
  const hit = (m) => {
    const full = expand(m).toLowerCase();
    const v = table[full] ?? table[m.toLowerCase()];
    return v || m;
  };
  // 先长后短：HEX6 处理完再处理 HEX3（\b 保证不会切进 6 位色值里）
  return str.replace(HEX6, hit).replace(HEX3, hit);
}

export const themeList = themes;
export const getTheme = (id) => themes.find((t) => t.id === id) || null;

/**
 * 把文档从 fromThemeId 换皮成 toThemeId（原地修改传入的 doc，调用方自行控制撤销快照）。
 * @returns {{changed:number, themeId:string|null}} 变更的元素数
 */
export function applyThemeToDoc(doc, fromThemeId, toThemeId) {
  if (!doc) return { changed: 0, themeId: null };
  const from = getTheme(fromThemeId);
  const to = getTheme(toThemeId);
  const rev = reverseMap(from);       // ① 还原当前主题
  const fwd = (to && to.map) || {};   // ② 套用目标主题

  const tx = (s) => replaceColors(replaceColors(s, rev), fwd);
  if (!from && !Object.keys(fwd).length) return { changed: 0, themeId: doc.themeId || null };

  let changed = 0;
  for (const el of doc.elements || []) {
    const before = el.html;
    const html = tx(el.html);
    if (html !== before) changed++;
    el.html = html;
    if (el.style && typeof el.style === 'object') {
      for (const k of Object.keys(el.style)) el.style[k] = tx(el.style[k]);
    }
    if (el.overrides && typeof el.overrides === 'object') {
      for (const leafId of Object.keys(el.overrides)) {
        const ov = el.overrides[leafId];
        if (ov && typeof ov === 'object') {
          for (const k of Object.keys(ov)) ov[k] = tx(ov[k]);
        }
      }
    }
  }
  if (doc.stage && typeof doc.stage.background === 'string') {
    doc.stage.background = tx(doc.stage.background);
  }
  doc.themeId = to ? to.id : null;
  return { changed, themeId: doc.themeId };
}
