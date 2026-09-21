// v2 渲染层：扁平 JSON → DOM（绝对定位容器 + 内部受限 HTML），无鼠标逻辑
// 缩放/平移由外层 viewport 的 CSS transform 负责（决策：DOM 渲染，非 canvas 库）

import { kebab, styleText } from './css-utils.js';

// 样式覆盖表合并：data-id 叶子的内联 style ← overrides[data-id]（覆盖表胜出）
export function mergeOverrides(rootEl, overrides) {
  rootEl.querySelectorAll('[data-id]').forEach((n) => {
    const ov = overrides[n.getAttribute('data-id')];
    if (!ov) return;
    for (const [k, v] of Object.entries(ov)) n.style.setProperty(kebab(k), v);
  });
}

// 手柄（八点缩放 + 旋转）：挂在选中元素上，交互层通过 data-handle 识别
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
function appendHandles(div) {
  for (const h of HANDLES) {
    const d = document.createElement('div');
    d.className = 'v2-h';
    d.dataset.handle = h;
    div.appendChild(d);
  }
  const rot = document.createElement('div');
  rot.className = 'v2-rot';
  rot.dataset.handle = 'rot';
  rot.title = '拖动旋转';
  div.appendChild(rot);
}

export function renderElement(el, selected) {
  const div = document.createElement('div');
  div.dataset.elId = el.id;
  div.style.cssText =
    `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;` +
    `z-index:${el.z};transform:rotate(${el.rotation}deg);opacity:${el.opacity};` +
    styleText(el.style);
  div.innerHTML = el.html;
  mergeOverrides(div, el.overrides);
  div.classList.add('v2-el');
  if (selected) {
    div.classList.add('sel');
    appendHandles(div);
  }
  return div;
}

// 溢出评估（D2）：内容超出固定高度画琥珀虚线警告。
// 测量时临时隐藏手柄——选中态挂的 8 个手柄超出边缘 ~6px 会撑大 scrollHeight 造成误报（实际踩过的 bug）。
// 选中元素本身不评估（编辑/拖拽过程中警告只会添乱），取消选择时再评估。
function markOverflowOne(div) {
  const hs = [...div.querySelectorAll('.v2-h')];
  const prev = hs.map((h) => h.style.display);
  hs.forEach((h) => { h.style.display = 'none'; });
  const over = div.scrollHeight > div.clientHeight + 2;
  hs.forEach((h, i) => { h.style.display = prev[i]; });
  div.classList.toggle('overflow', over);
}

// 选中态增量更新：只切类 + 挂/卸手柄，不重建 DOM
// （双击编辑依赖两次 click 命中同一节点——全量重建会让浏览器无法合成 dblclick）
// selIds：选择集数组，第一个为主元素（承载手柄）
// 审计 BUG-12：主元素重挂手柄前先清理——防连续选中时手柄叠加
export function updateSelection(stageEl, selIds) {
  const ids = Array.isArray(selIds) ? selIds : (selIds ? [selIds] : []);
  stageEl.querySelectorAll('[data-el-id]').forEach((div) => {
    const isSel = ids.includes(div.dataset.elId);
    const isPrimary = ids[0] === div.dataset.elId;
    div.classList.toggle('sel', isSel);
    if (isSel && isPrimary) {
      div.classList.remove('overflow'); // 选中时不评估溢出，取消选择时再评估
      div.querySelectorAll('.v2-h, .v2-rot').forEach((n) => n.remove()); // 先清旧再挂新
      appendHandles(div);
    } else {
      div.querySelectorAll('.v2-h').forEach((n) => n.remove());
      div.querySelectorAll('.v2-rot').forEach((n) => n.remove());
      if (!isSel) markOverflowOne(div);
    }
  });
}

// 全量重建（结构变化时用：添加/删除/内容更新）
export function renderStage(stageEl, doc, selIds) {
  const ids = Array.isArray(selIds) ? selIds : (selIds ? [selIds] : []);
  stageEl.style.width = doc.stage.width + 'px';
  stageEl.style.height = doc.stage.height + 'px';
  stageEl.style.background = doc.stage.background;
  stageEl.innerHTML = '';
  for (const el of doc.elements) {
    const div = renderElement(el, ids.includes(el.id));
    stageEl.appendChild(div);
    if (!ids.includes(el.id)) markOverflowOne(div);
  }
}
