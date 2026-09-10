// v2 交互层（模块三）：mousedown/move/up 监听 → 坐标计算 → 调数据层接口 → 渲染层自动重绘
// 与数据彻底解耦：本文件不持有文档状态，只通过注入的接口读写。
// v0.1 范围：单选、拖拽、八点缩放、键盘微调/删除；旋转手柄、多选、框选留待 v2.1。

import { candidates, snapBox, snapResize, THRESHOLD } from './snap.js';

const MIN = 40; // 最小尺寸（规范 §2）

export function initInteract({ stageEl, getDoc, getSel, setSel, updateElement, removeElement, snapshot, getZoom }) {
  let mode = null; // {kind:'move'|'resize', id, handle, startMouse, start, snapTaken}

  // —— 参考线浮层 ——
  const guides = document.createElement('div');
  guides.className = 'v2-guides';
  function drawGuides(gl, gt) {
    guides.innerHTML = '';
    if (gl != null) { const v = document.createElement('div'); v.className = 'v2-gx'; v.style.left = gl + 'px'; guides.appendChild(v); }
    if (gt != null) { const h = document.createElement('div'); h.className = 'v2-gy'; h.style.top = gt + 'px'; guides.appendChild(h); }
    if (!guides.parentNode) stageEl.appendChild(guides);
  }
  function clearGuides() { guides.innerHTML = ''; }

  const elById = (id) => getDoc().elements.find((x) => x.id === id);

  stageEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const handle = e.target.closest('[data-handle]');
    const elDiv = e.target.closest('[data-el-id]');
    if (handle && elDiv) {
      const el = elById(elDiv.dataset.elId);
      if (!el || el.locked) return;
      mode = { kind: 'resize', handle: handle.dataset.handle, id: el.id, startMouse: { x: e.clientX, y: e.clientY }, start: { x: el.x, y: el.y, width: el.width, height: el.height }, snapTaken: false };
      setSel(el.id);
      e.preventDefault();
    } else if (elDiv) {
      const el = elById(elDiv.dataset.elId);
      if (!el) return;
      setSel(el.id);
      if (el.locked) return;
      mode = { kind: 'move', id: el.id, startMouse: { x: e.clientX, y: e.clientY }, start: { x: el.x, y: el.y, width: el.width, height: el.height }, snapTaken: false };
      e.preventDefault();
    } else {
      setSel(null);
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!mode) return;
    const zoom = getZoom();
    const dx = (e.clientX - mode.startMouse.x) / zoom;
    const dy = (e.clientY - mode.startMouse.y) / zoom;
    if (!mode.snapTaken) { snapshot(); mode.snapTaken = true; } // 快照在首个实际位移时打（避免纯选中污染撤销栈）
    const el = elById(mode.id);
    if (!el) return;
    const cand = candidates(getDoc(), mode.id);
    const th = THRESHOLD / zoom;

    if (mode.kind === 'move') {
      const s = snapBox(
        { x: mode.start.x + dx, y: mode.start.y + dy, width: el.width, height: el.height },
        cand, th,
      );
      updateElement(mode.id, { x: Math.round(s.x), y: Math.round(s.y) });
      drawGuides(s.gl, s.gt);
    } else {
      const h = mode.handle;
      let { x, y, width, height } = mode.start;
      if (h.includes('e')) width = Math.max(MIN, mode.start.width + dx);
      if (h.includes('w')) { width = Math.max(MIN, mode.start.width - dx); x = mode.start.x + (mode.start.width - width); }
      if (h.includes('s')) height = Math.max(MIN, mode.start.height + dy);
      if (h.includes('n')) { height = Math.max(MIN, mode.start.height - dy); y = mode.start.y + (mode.start.height - height); }
      // 缩放吸附：只吸移动中的边
      const s = snapResize({ x, y, width, height }, h, cand, th);
      if (s.dx) {
        if (h.includes('e')) width = Math.max(MIN, width + s.dx);
        if (h.includes('w')) { x += s.dx; width = Math.max(MIN, width - s.dx); }
      }
      if (s.dy) {
        if (h.includes('s')) height = Math.max(MIN, height + s.dy);
        if (h.includes('n')) { y += s.dy; height = Math.max(MIN, height - s.dy); }
      }
      updateElement(mode.id, { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
      drawGuides(s.gl, s.gt);
    }
  });

  document.addEventListener('mouseup', () => {
    if (!mode) return;
    mode = null;
    clearGuides();
  });

  // —— 悬停高亮：告诉用户"这里可以点"（选中态不重复显示）——
  stageEl.addEventListener('mousemove', (e) => {
    if (mode) return;
    const elDiv = e.target.closest('[data-el-id]');
    const id = elDiv ? elDiv.dataset.elId : null;
    stageEl.querySelectorAll('.hov').forEach((n) => { if (n.dataset.elId !== id) n.classList.remove('hov'); });
    if (elDiv && id !== getSel()) elDiv.classList.add('hov');
  });
  stageEl.addEventListener('mouseleave', () => {
    stageEl.querySelectorAll('.hov').forEach((n) => n.classList.remove('hov'));
  });

  // 键盘：方向键微调（Shift=10px），Delete/Backspace 删除选中
  let keySnapTimer = null;
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    const sel = getSel();
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      snapshot();
      removeElement(sel);
      setSel(null);
      e.preventDefault();
      return;
    }
    const d = e.shiftKey ? 10 : 1;
    const nudge = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (nudge && sel && !elById(sel)?.locked) {
      e.preventDefault();
      if (!keySnapTimer) snapshot(); // 连按只记一帧（500ms 窗口）
      clearTimeout(keySnapTimer);
      keySnapTimer = setTimeout(() => { keySnapTimer = null; }, 600);
      const el = elById(sel);
      updateElement(sel, { x: el.x + nudge[0], y: el.y + nudge[1] });
    }
  });
}
