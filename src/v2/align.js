// v2 对齐与分布（A0-5）：纯函数，不碰 DOM —— 给定元素集合 + 画布，返回需要移动的元素及其新坐标。
//
// 语义（对齐主流设计工具）：
//   · 单选  → 对齐到**画布**（stage）
//   · 多选  → 对齐到**选区包围盒**
//   · 分布  → 至少 3 个元素；首尾元素位置保持不动，中间元素等距排开
// 调用方负责 snapshot() 与 updateElement()（一次对齐 = 一步撤销）。

const round = (n) => Math.round(n);

/** 对齐基准：单选取画布，多选取选区包围盒 */
function baseline(els, stage) {
  if (els.length === 1) {
    const s = stage || { width: 1440, height: 900 };
    return { left: 0, centerX: s.width / 2, right: s.width, top: 0, centerY: s.height / 2, bottom: s.height };
  }
  const minX = Math.min(...els.map((e) => e.x));
  const maxX = Math.max(...els.map((e) => e.x + e.width));
  const minY = Math.min(...els.map((e) => e.y));
  const maxY = Math.max(...els.map((e) => e.y + e.height));
  return {
    left: minX, centerX: (minX + maxX) / 2, right: maxX,
    top: minY, centerY: (minY + maxY) / 2, bottom: maxY,
  };
}

/**
 * @param {Array} els   参与对齐的元素（已过滤 locked）
 * @param {Object} stage 画布 {width,height}
 * @param {string} mode 'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom'|'distH'|'distV'
 * @returns {Array<{id:string,x:number,y:number}>} 仅包含真正需要移动的元素
 */
export function alignElements(els, stage, mode) {
  if (!Array.isArray(els) || els.length === 0) return [];

  // —— 分布：首尾不动，中间等距 ——
  if (mode === 'distH' || mode === 'distV') {
    if (els.length < 3) return [];
    const horiz = mode === 'distH';
    const key = horiz ? 'x' : 'y';
    const size = horiz ? 'width' : 'height';
    const sorted = [...els].sort((a, b) => a[key] - b[key]);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const span = (last[key] + last[size]) - first[key];
    const total = sorted.reduce((s, e) => s + e[size], 0);
    const gap = (span - total) / (sorted.length - 1);
    const out = [];
    let cursor = first[key];
    for (const e of sorted) {
      const next = round(cursor);
      if (next !== e[key]) out.push(horiz ? { id: e.id, x: next, y: e.y } : { id: e.id, x: e.x, y: next });
      cursor += e[size] + gap;
    }
    return out;
  }

  const base = baseline(els, stage);
  const out = [];
  for (const e of els) {
    let x = e.x;
    let y = e.y;
    if (mode === 'left') x = base.left;
    else if (mode === 'hcenter') x = round(base.centerX - e.width / 2);
    else if (mode === 'right') x = round(base.right - e.width);
    else if (mode === 'top') y = base.top;
    else if (mode === 'vcenter') y = round(base.centerY - e.height / 2);
    else if (mode === 'bottom') y = round(base.bottom - e.height);
    else return []; // 未知模式：不做任何事
    x = round(x);
    y = round(y);
    if (x !== e.x || y !== e.y) out.push({ id: e.id, x, y });
  }
  return out;
}

export const ALIGN_MODES = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom', 'distH', 'distV'];

/**
 * 拖拽轴向锁定（A0-11）：按住 Shift 时只沿位移更大的那根轴移动。
 * 抽成纯函数是为了可单测——GUI 的拖拽路径依赖真实鼠标命中，不适合做确定性断言。
 * @param {{x:number,y:number}} start 起始左上角
 * @param {number} dx 水平位移
 * @param {number} dy 垂直位移
 * @param {boolean} shift 是否按住 Shift（false 时原样返回位移结果）
 */
export function lockAxis(start, dx, dy, shift) {
  let x = start.x + dx;
  let y = start.y + dy;
  if (shift) {
    if (Math.abs(dx) >= Math.abs(dy)) y = start.y; // 横向为主 → 锁 Y
    else x = start.x;                              // 纵向为主 → 锁 X
  }
  return { x, y };
}
