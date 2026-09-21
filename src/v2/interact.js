// v2 交互层（模块三）：mousedown/move/up 监听 → 坐标计算 → 调数据层接口 → 渲染层自动重绘
// 与数据彻底解耦：本文件不持有文档状态，只通过注入的接口读写。
// 选择模型：主选择（primary，承载手柄/样式面板）+ 选择集（multi，Shift 加选/框选）。
// v2.1 范围：单选、拖拽、八点缩放、旋转、多选（Shift 点选 + 框选）、组拖拽、多选删除。

import { candidates, snapBox, snapResize, snapAngle, THRESHOLD } from './snap.js';
import { isEditing, commitIfEditing } from './textedit.js';
import { lockAxis } from './align.js';

const MIN = 40; // 最小尺寸（规范 §2）

export function initInteract({ stageEl, getDoc, getSel, setSel, toggleSel, setMultiIds, getMulti, updateElement, removeElement, snapshot, getZoom, onDuplicate, onDeepSelect }) {
  let mode = null; // {kind:'move'|'move-group'|'resize'|'rotate'|'marquee', ...}

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

  // —— 框选浮层 ——
  const marquee = document.createElement('div');
  marquee.className = 'v2-marquee';
  marquee.hidden = true;
  stageEl.appendChild(marquee);

  const elById = (id) => getDoc().elements.find((x) => x.id === id);
  const multiIds = () => { const m = getMulti(); return m && m.length ? m : (getSel() ? [getSel()] : []); };

  // —— 手柄几何命中（比 DOM elementFromPoint 稳：不被 overflow/裁剪/遮挡影响）——
  // 返回 { handle, elDiv } 或 null；只对主选中元素生效
  function hitHandle(e) {
    const id = getSel();
    const el = id && elById(id);
    if (!el || el.locked) return null;
    const r = stageEl.getBoundingClientRect();
    const zoom = getZoom();
    const px = (e.clientX - r.left) / zoom, py = (e.clientY - r.top) / zoom;
    const w = el.width, h = el.height;
    const pts = {
      nw: [0, 0], n: [w / 2, 0], ne: [w, 0], e: [w, h / 2],
      se: [w, h], s: [w / 2, h], sw: [0, h], w: [0, h / 2],
    };
    const R = 8; // 命中半径（stage 坐标，与手柄视觉尺寸匹配）
    for (const [handle, [hx, hy]] of Object.entries(pts)) {
      if (Math.abs(px - hx) <= R && Math.abs(py - hy) <= R) return { handle, elDiv: stageEl.querySelector(`[data-el-id="${id}"]`) };
    }
    const rx = w / 2, ry = -34 / zoom; // 旋转柄：顶部中点上方 ~34px（stage 坐标）
    if (Math.abs(px - rx) <= R && Math.abs(py - ry) <= R) return { handle: 'rot', elDiv: stageEl.querySelector(`[data-el-id="${id}"]`) };
    return null;
  }

  stageEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // 块内元素浮层（移动/旋转手柄）自己处理拖拽，别当成框选或拖整个模块
    if (e.target && e.target.closest && e.target.closest('.v2-leaf-frame')) return;
    // 叶级编辑中：点回编辑叶子保持光标；点别处先提交，再按提交后的 DOM 重新命中
    if (isEditing()) {
      if (e.target.closest('[contenteditable="true"]')) { e.preventDefault(); return; }
      commitIfEditing();
    }
    // 先做手柄几何命中（主选中元素），未命中再走元素命中
    const hhit = hitHandle(e);
    const hit = hhit || document.elementFromPoint(e.clientX, e.clientY) || e.target;
    const handle = hhit ? { dataset: { handle: hhit.handle } } : (hit.closest ? hit.closest('[data-handle]') : null);
    const elDiv = hhit ? hhit.elDiv : (hit.closest ? hit.closest('[data-el-id]') : null);

    if (handle && elDiv) {
      const el = elById(elDiv.dataset.elId);
      if (!el || el.locked) return;
      const st = stageEl.getBoundingClientRect();
      const zoom = getZoom();
      if (handle.dataset.handle === 'rot') {
        const cx = st.left + (el.x + el.width / 2) * zoom;
        const cy = st.top + (el.y + el.height / 2) * zoom;
        mode = { kind: 'rotate', id: el.id, center: { x: cx, y: cy }, startAngle: el.rotation, startPointer: Math.atan2(e.clientY - cy, e.clientX - cx), snapTaken: false };
      } else {
        mode = { kind: 'resize', handle: handle.dataset.handle, id: el.id, startMouse: { x: e.clientX, y: e.clientY }, start: { x: el.x, y: el.y, width: el.width, height: el.height }, snapTaken: false };
      }
      setSel(el.id);
      e.preventDefault();
    } else if (elDiv) {
      const el = elById(elDiv.dataset.elId);
      if (!el) return;
      if (e.shiftKey) { toggleSel(el.id); e.preventDefault(); return; } // Shift 点选：不加拖拽模式
      // Ctrl/⌘+点击：深入选中块内叶子（再点同一处退回整块）——复合模块里的按钮/标题靠这个进得去
      if ((e.ctrlKey || e.metaKey) && onDeepSelect) {
        const leafEl = e.target && e.target.closest ? e.target.closest('[data-id]') : null;
        const leafId = leafEl && leafEl.getAttribute('data-id');
        if (leafId) { e.preventDefault(); onDeepSelect(el.id, leafId); return; }
      }
      // 点击已在选择集内的元素（多选态）→ 组拖拽，不重置选择；否则单选
      const inMulti = multiIds().length > 1 && multiIds().includes(el.id);
      if (!inMulti) setSel(el.id);
      if (el.locked) return;
      if (inMulti) {
        // 组拖拽：记录选择集内全部起点
        const starts = {};
        for (const id of multiIds()) { const m = elById(id); if (m && !m.locked) starts[id] = { x: m.x, y: m.y }; }
        mode = { kind: 'move-group', starts, startMouse: { x: e.clientX, y: e.clientY }, snapTaken: false };
      } else {
        mode = { kind: 'move', id: el.id, startMouse: { x: e.clientX, y: e.clientY }, start: { x: el.x, y: el.y, width: el.width, height: el.height }, snapTaken: false };
      }
      e.preventDefault();
    } else {
      // 空白处：框选（Shift 框选为追加）
      const st = stageEl.getBoundingClientRect();
      const zoom = getZoom();
      const px = (e.clientX - st.left) / zoom, py = (e.clientY - st.top) / zoom;
      mode = { kind: 'marquee', base: e.shiftKey ? [...multiIds()] : [], start: { x: px, y: py } };
      setSel(null);
      setMultiIds(mode.base);
      // renderStage 的 innerHTML='' 会把浮层抹出 DOM——每次显示前重挂
      if (!marquee.parentNode) stageEl.appendChild(marquee);
      marquee.hidden = false;
      marquee.style.cssText = '';
      e.preventDefault();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!mode) return;
    const zoom = getZoom();
    // rotate/marquee 不用位移增量（角度差 / stage 坐标直算），其余模式需要 startMouse
    if (mode.kind !== 'rotate' && mode.kind !== 'marquee' && !mode.startMouse) return;
    const dx = mode.startMouse ? (e.clientX - mode.startMouse.x) / zoom : 0;
    const dy = mode.startMouse ? (e.clientY - mode.startMouse.y) / zoom : 0;
    if (!mode.snapTaken) { snapshot(); mode.snapTaken = true; } // 快照在首个实际位移时打（避免纯选中污染撤销栈）
    const el = mode.id ? elById(mode.id) : null;
    if (mode.id && !el) return;
    const cand = mode.id ? candidates(getDoc(), mode.id) : null;
    const th = THRESHOLD / zoom;

    if (mode.kind === 'move') {
      // Alt+拖拽 = 复制（A0-11）：原件留在原位，拖的是副本（首帧检测一次）
      // 快照已在本次拖拽的首个位移时压过，故复制与移动合并为同一步撤销
      if (e.altKey && !mode.dupDone && onDuplicate) {
        mode.dupDone = true;
        const newId = onDuplicate(mode.id);
        if (newId) mode.id = newId;
      }
      // Shift = 轴向锁定（只沿位移更大的一轴；拖拽中途按下即生效；逻辑在 align.js，可单测）
      const locked = lockAxis(mode.start, dx, dy, e.shiftKey);
      const mx = locked.x;
      const my = locked.y;
      const s = snapBox(
        { x: mx, y: my, width: el.width, height: el.height },
        cand, th,
      );
      updateElement(mode.id, { x: Math.round(s.x), y: Math.round(s.y) });
      drawGuides(s.gl, s.gt);
    } else if (mode.kind === 'move-group') {
      // 组拖拽：同位移应用到选择集全部（不吸附，保持相对位置）
      for (const [id, s0] of Object.entries(mode.starts)) {
        updateElement(id, { x: Math.round(s0.x + dx), y: Math.round(s0.y + dy) });
      }
    } else if (mode.kind === 'rotate') {
      // 旋转：当前指针相对中心的角度 - 初始角度 + 初始 rotation
      // 按住 Shift = 15° 强制步进；否则接近直角（0/90/180/270）时自动吸附，避免手动对不齐
      let rot = mode.startAngle + (Math.atan2(e.clientY - mode.center.y, e.clientX - mode.center.x) - mode.startPointer) * 180 / Math.PI;
      rot = e.shiftKey ? Math.round(rot / 15) * 15 : snapAngle(rot);
      updateElement(mode.id, { rotation: Math.round(rot) });
    } else if (mode.kind === 'resize') {
      const h = mode.handle;
      let { x, y, width, height } = mode.start;
      if (h.includes('e')) width = Math.max(MIN, mode.start.width + dx);
      if (h.includes('w')) { width = Math.max(MIN, mode.start.width - dx); x = mode.start.x + (mode.start.width - width); }
      if (h.includes('s')) height = Math.max(MIN, mode.start.height + dy);
      if (h.includes('n')) { height = Math.max(MIN, mode.start.height - dy); y = mode.start.y + (mode.start.height - height); }
      // 比例锁定：图片元素角柄默认等比（边缘自由）；其他元素 Shift+角柄等比
      const lockRatio = (el.type === 'image' || e.shiftKey) && h.length === 2;
      if (lockRatio) {
        height = Math.max(MIN, Math.round(width * (mode.start.height / mode.start.width)));
        if (h.includes('n')) y = mode.start.y + (mode.start.height - height);
        if (h.includes('w')) x = mode.start.x + (mode.start.width - width);
        // 锁比例时跳过吸附（双边吸附会破坏比例）
        updateElement(mode.id, { x: Math.round(x), y: Math.round(y), width: Math.round(width), height });
      } else {
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
    } else if (mode.kind === 'marquee') {
      const px = (e.clientX - stageEl.getBoundingClientRect().left) / zoom;
      const py = (e.clientY - stageEl.getBoundingClientRect().top) / zoom;
      const x = Math.min(mode.start.x, px), y = Math.min(mode.start.y, py);
      const w = Math.abs(px - mode.start.x), h = Math.abs(py - mode.start.y);
      marquee.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
      mode.rect = { x, y, w, h };
    }
  });

  document.addEventListener('mouseup', () => {
    if (!mode) return;
    if (mode.kind === 'marquee' && mode.rect) {
      const { x, y, w, h } = mode.rect;
      if (w > 6 && h > 6) {
        // 框选：与选框相交的元素全部入选（基础集 = Shift 追加）
        const hit = getDoc().elements
          .filter((el) => !el.locked && el.opacity !== 0 && el.x < x + w && el.x + el.width > x && el.y < y + h && el.y + el.height > y) // 审计 BUG-19：跳过全透明
          .map((el) => el.id);
        setMultiIds([...new Set([...mode.base, ...hit])]);
      } else {
        setMultiIds(mode.base); // 视为误触，还原
      }
      marquee.hidden = true;
    }
    mode = null;
    clearGuides();
  });

  // —— 悬停高亮：告诉用户"这里可以点"（选中态不重复显示）——
  stageEl.addEventListener('mousemove', (e) => {
    if (mode) return;
    const elDiv = e.target.closest('[data-el-id]');
    const id = elDiv ? elDiv.dataset.elId : null;
    stageEl.querySelectorAll('.hov').forEach((n) => { if (n.dataset.elId !== id) n.classList.remove('hov'); });
    if (elDiv && !multiIds().includes(id)) elDiv.classList.add('hov');
  });
  stageEl.addEventListener('mouseleave', () => {
    stageEl.querySelectorAll('.hov').forEach((n) => n.classList.remove('hov'));
  });

  // 键盘：Esc 取消选择（编辑中由 textedit 处理）；方向键微调（Shift=10px），Delete/Backspace 删除选择集
  let keySnapTimer = null;
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (e.key === 'Escape' && !isEditing() && (getSel() || multiIds().length)) {
      setMultiIds([]);
      setSel(null);
      e.preventDefault();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace')) {
      const ids = multiIds();
      if (ids.length) {
        snapshot();
        ids.forEach((id) => removeElement(id));
        setMultiIds([]);
        setSel(null);
        e.preventDefault();
        return;
      }
    }
    const d = e.shiftKey ? 10 : 1;
    const nudge = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    const ids = multiIds().filter((id) => { const m = elById(id); return m && !m.locked; });
    if (nudge && ids.length) {
      e.preventDefault();
      if (!keySnapTimer) snapshot(); // 连按只记一帧（500ms 窗口）
      clearTimeout(keySnapTimer);
      keySnapTimer = setTimeout(() => { keySnapTimer = null; }, 600);
      ids.forEach((id) => {
        const el = elById(id);
        updateElement(id, { x: el.x + nudge[0], y: el.y + nudge[1] });
      });
    }
  });

  // 调试出口：供回归断言观察拖拽状态（生产逻辑不依赖它）
  return {
    modeInfo: () => (mode ? { kind: mode.kind, id: mode.id, dupDone: !!mode.dupDone } : null),
  };
}
