// v2 块内元素的"移动 / 旋转"——选中小元素后也能拖能转。
//
// 为什么不用绝对定位：叶子在块的 HTML 流里，位置由布局决定；改成 position:absolute 会破坏
// 块的版式（按钮掉出容器、文字错位、导出后全乱）。所以用 CSS transform 做"相对自身原位的
// 偏移 + 旋转"，写进 overrides[leafId].transform，导出时随覆盖表一并带出。
//
// 浮层（.v2-leaf-frame）挂在 stage 内，用叶子的 getBoundingClientRect 定位；
// renderStage 会 innerHTML='' 把浮层抹掉，所以每次 place() 都要确认重新挂载（同 marquee 的处理）。

const RAD = 180 / Math.PI;

import { snapBox, THRESHOLD } from './snap.js';

/** 解析 "translate(Xpx, Ypx) rotate(Ddeg)"（缺项按 0 处理） */
export function parseTransform(str) {
  const s = String(str || '');
  const t = /translate\(\s*(-?[\d.]+)px\s*[,\s]\s*(-?[\d.]+)px\s*\)/.exec(s);
  const r = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(s);
  return { x: t ? Number(t[1]) : 0, y: t ? Number(t[2]) : 0, rot: r ? Number(r[1]) : 0 };
}

/** 合成 transform 字符串；全为 0 时返回空串（便于清除属性） */
export function composeTransform({ x = 0, y = 0, rot = 0 }) {
  const parts = [];
  if (Math.round(x) || Math.round(y)) parts.push(`translate(${Math.round(x)}px, ${Math.round(y)}px)`);
  if (Math.round(rot)) parts.push(`rotate(${Math.round(rot)}deg)`);
  return parts.join(' ');
}

export function initLeafInteract({
  stageEl, getSel, getLeaf, getDoc, updateElement, snapshot, getZoom, snapAngle, toast,
}) {
  const frame = document.createElement('div');
  frame.className = 'v2-leaf-frame';
  frame.hidden = true;
  frame.innerHTML = '<div class="lf-move" title="拖动移动"></div><div class="lf-rot" title="拖动旋转（Shift 每 15°，双击归零）"></div>';
  const rotKnob = frame.querySelector('.lf-rot');

  const leafEl = () => {
    const elId = getSel();
    const lfId = getLeaf();
    if (!elId || !lfId) return null;
    const host = stageEl.querySelector(`[data-el-id="${elId}"]`);
    return host ? host.querySelector(`[data-id="${lfId}"]`) : null;
  };
  const docEl = () => getDoc().elements.find((e) => e.id === getSel()) || null;

  // —— 参考线浮层（与整块拖拽共用 .v2-guides 样式）——
  const guides = document.createElement('div');
  guides.className = 'v2-guides';
  function drawGuides(gl, gt) {
    guides.innerHTML = '';
    if (gl != null) { const v = document.createElement('div'); v.className = 'v2-gx'; v.style.left = gl + 'px'; guides.appendChild(v); }
    if (gt != null) { const h = document.createElement('div'); h.className = 'v2-gy'; h.style.top = gt + 'px'; guides.appendChild(h); }
    if (!guides.parentNode) stageEl.appendChild(guides);
  }
  function clearGuides() { guides.innerHTML = ''; if (guides.parentNode) guides.remove(); }

  /**
   * 叶子移动的吸附候选（用户报"小模块的移动吸附没有了"）。
   * 叶子在块内，所以候选不是"页面其他元素"，而是**块容器边缘与中线** + **块内其他叶子**——
   * 这才是"把按钮和标题左对齐""把按钮在块里居中"真正需要的那几条线。
   * 全部换算成 stage 坐标（与 snapBox 的坐标系一致）。
   */
  function leafCandidates() {
    const host = stageEl.querySelector(`[data-el-id="${getSel()}"]`);
    if (!host) return null;
    const sr = stageEl.getBoundingClientRect();
    const z = getZoom() || 1;
    const toStage = (r) => ({ x: (r.left - sr.left) / z, y: (r.top - sr.top) / z, w: r.width / z, h: r.height / z });
    const push = (xs, ys, b) => {
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    };
    const xs = []; const ys = [];
    push(xs, ys, toStage(host.getBoundingClientRect())); // 块容器：左/中/右、上/中/下
    const me = leafEl();
    host.querySelectorAll('[data-id]').forEach((n) => {
      if (n === me || (me && me.contains(n))) return;
      push(xs, ys, toStage(n.getBoundingClientRect()));
    });
    return { xs, ys };
  }

  // 叶子当前矩形（stage 坐标）；rect 已含 transform，减掉偏移才是"原位"
  function leafBox(t) {
    const leaf = leafEl();
    const sr = stageEl.getBoundingClientRect();
    const z = getZoom() || 1;
    const r = leaf.getBoundingClientRect();
    return { x: (r.left - sr.left) / z - t.x, y: (r.top - sr.top) / z - t.y, w: r.width / z, h: r.height / z };
  }

  const curTransform = () => {
    const el = docEl();
    const lfId = getLeaf();
    if (!el || !lfId) return { x: 0, y: 0, rot: 0 };
    const ov = (el.overrides || {})[lfId] || {};
    // 覆盖表优先；没有则回落到叶子自身的行内 transform
    const own = leafEl();
    return parseTransform(ov.transform || (own && own.style.transform) || '');
  };
  function writeTransform(t) {
    const el = docEl();
    const lfId = getLeaf();
    if (!el || !lfId) return;
    const value = composeTransform(t);
    const prev = (el.overrides || {})[lfId] || {};
    const next = { ...prev };
    if (value) next.transform = value; else delete next.transform;
    updateElement(el.id, { overrides: { ...el.overrides, [lfId]: next } });
  }

  /** 按叶子的实际盒定位浮层；每次渲染后都要调用（DOM 会被重建） */
  function place() {
    const leaf = leafEl();
    if (!leaf) { frame.hidden = true; return; }
    if (!frame.parentNode) stageEl.appendChild(frame); // renderStage 会把它抹出 DOM，用前重挂
    const sr = stageEl.getBoundingClientRect();
    const r = leaf.getBoundingClientRect();
    const z = getZoom() || 1;
    frame.hidden = false;
    frame.style.left = `${(r.left - sr.left) / z}px`;
    frame.style.top = `${(r.top - sr.top) / z}px`;
    frame.style.width = `${r.width / z}px`;
    frame.style.height = `${r.height / z}px`;
  }
  function hide() { frame.hidden = true; }

  // —— 移动：拖整个框（旋转点除外）——
  frame.addEventListener('mousedown', (e) => {
    if (e.target === rotKnob) return;
    const leaf = leafEl();
    if (!leaf) return;
    e.preventDefault(); e.stopPropagation();      // 别让画布把它当成"拖整个模块"
    const z = getZoom() || 1;
    const base = curTransform();
    const box = leafBox(base);                    // 叶子"原位"矩形（stage 坐标）
    const cand = leafCandidates();                // 块容器 + 块内其他叶子
    const th = THRESHOLD / z;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const onMove = (ev) => {
      if (!moved) { snapshot(); moved = true; }   // 首次真正位移才压快照
      let dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
      if (ev.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; } // 轴向锁定
      // box 是"原位"（不含现有偏移），而鼠标位移是相对"当前位置"的 →
      // 目标位置必须补上现有偏移 base，否则拖拽量会整体少一个 base 的量
      let nx = box.x + base.x + dx, ny = box.y + base.y + dy;
      let gl = null, gt = null;
      if (cand) {
        const s = snapBox({ x: nx, y: ny, width: box.w, height: box.h }, cand, th);
        // 轴向锁定时只让"还能动的那一轴"吸附，被锁住的轴不动
        if (!ev.shiftKey || dx !== 0) nx = s.x;
        if (!ev.shiftKey || dy !== 0) ny = s.y;
        gl = s.gl; gt = s.gt;
      }
      writeTransform({ x: nx - box.x, y: ny - box.y, rot: base.rot });
      drawGuides(gl, gt);
      place();
    };
    const onUp = () => {
      clearGuides();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // —— 旋转：拖顶部圆点；Shift 15° 步进，否则直角附近自动吸附；双击归零 ——
  rotKnob.addEventListener('dblclick', (e) => {
    e.preventDefault(); e.stopPropagation();
    const t = curTransform();
    snapshot();
    writeTransform({ ...t, rot: 0 });
    place();
    toast?.('已把内部元素的角度归零');
  });
  rotKnob.addEventListener('mousedown', (e) => {
    const leaf = leafEl();
    if (!leaf) return;
    e.preventDefault(); e.stopPropagation();
    const t = curTransform();
    const r = leaf.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;       // 视口坐标下绕叶子中心
    const startPointer = Math.atan2(e.clientY - cy, e.clientX - cx);
    let moved = false;
    const onMove = (ev) => {
      if (!moved) { snapshot(); moved = true; }
      let deg = t.rot + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - startPointer) * RAD;
      deg = ev.shiftKey ? Math.round(deg / 15) * 15 : (snapAngle ? snapAngle(deg) : deg);
      writeTransform({ ...t, rot: deg });
      place();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  return { place, hide, frame };
}
