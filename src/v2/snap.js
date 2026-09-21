// v2 吸附引擎（模块四）：对齐参考线 + 阈值吸附，自研零依赖
// 候选 = 其他元素的 左/中/右 × 上/中/下 + stage 边缘与中线

export const THRESHOLD = 8; // px，stage 坐标（调用方按 zoom 换算）

/**
 * 旋转角度吸附：接近 0 / 90 / 180 / 270 时吸附过去（±4° 内），其余原样返回。
 * 抽成纯函数便于单测（GUI 的旋转依赖真实指针位置，不适合做确定性断言）。
 * 注意与 Shift 步进的关系：Shift 是"每 15° 一格"的强制步进，本函数是"直角附近自动吸"，
 * 两者互斥使用——按住 Shift 时按步进取整，否则走这里的吸附。
 * @param {number} deg 当前角度（度，可为负值或超过 360）
 */
export function snapAngle(deg) {
  const n = ((deg % 360) + 360) % 360;
  for (const target of [0, 90, 180, 270]) {
    if (Math.abs(n - target) <= 4) return target;
  }
  // 359° 附近也应吸附到 0（等价于 -1°）
  if (Math.abs(n - 360) <= 4) return 0;
  return deg;
}

export function candidates(doc, excludeId) {
  const xs = [0, doc.stage.width / 2, doc.stage.width];
  const ys = [0, doc.stage.height / 2, doc.stage.height];
  for (const el of doc.elements) {
    if (el.id === excludeId) continue;
    xs.push(el.x, el.x + el.width / 2, el.x + el.width);
    ys.push(el.y, el.y + el.height / 2, el.y + el.height);
  }
  return { xs, ys };
}

// 从多个自身值里找离候选线最近的（|d| ≤ 阈值），返回 {d(增量), line(线位置)}
function bestSnap(values, lines, threshold) {
  let best = null;
  for (const v of values) {
    for (const c of lines) {
      const d = c - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) {
        best = { d, line: c };
      }
    }
  }
  return best;
}

// 拖拽吸附：传入移动中的盒子，返回吸附后的 {x, y, gl(竖线x), gt(横线y)}
export function snapBox(box, cand, threshold) {
  const gx = bestSnap(
    [box.x, box.x + box.width / 2, box.x + box.width],
    cand.xs, threshold,
  );
  const gy = bestSnap(
    [box.y, box.y + box.height / 2, box.y + box.height],
    cand.ys, threshold,
  );
  return {
    x: box.x + (gx ? gx.d : 0),
    y: box.y + (gy ? gy.d : 0),
    gl: gx ? gx.line : null,
    gt: gy ? gy.line : null,
  };
}

// 缩放吸附：只吸正在移动的边（h ∈ nw|n|ne|e|se|s|sw|w）
// 返回 {dx, dy, gl, gt}——调用方把增量加进 x/y/w/h
export function snapResize(box, h, cand, threshold) {
  const mx = [], my = [];
  if (h.includes('e')) mx.push(box.x + box.width);
  if (h.includes('w')) mx.push(box.x);
  if (h.includes('s')) my.push(box.y + box.height);
  if (h.includes('n')) my.push(box.y);
  const sx = mx.length ? bestSnap(mx, cand.xs, threshold) : null;
  const sy = my.length ? bestSnap(my, cand.ys, threshold) : null;
  return {
    dx: sx ? sx.d : 0,
    dy: sy ? sy.d : 0,
    gl: sx ? sx.line : null,
    gt: sy ? sy.line : null,
  };
}
