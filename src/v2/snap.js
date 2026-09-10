// v2 吸附引擎（模块四）：对齐参考线 + 阈值吸附，自研零依赖
// 候选 = 其他元素的 左/中/右 × 上/中/下 + stage 边缘与中线

export const THRESHOLD = 8; // px，stage 坐标（调用方按 zoom 换算）

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
