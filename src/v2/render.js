// v2 渲染层：扁平 JSON → DOM（绝对定位容器 + 内部受限 HTML），无鼠标逻辑
// 缩放/平移由外层 viewport 的 CSS transform 负责（决策：DOM 渲染，非 canvas 库）

const kebab = (s) => String(s).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
export function styleText(rec) {
  return Object.entries(rec || {}).map(([k, v]) => `${kebab(k)}:${v}`).join(';');
}

// 样式覆盖表合并：data-id 叶子的内联 style ← overrides[data-id]（覆盖表胜出）
export function mergeOverrides(rootEl, overrides) {
  rootEl.querySelectorAll('[data-id]').forEach((n) => {
    const ov = overrides[n.getAttribute('data-id')];
    if (!ov) return;
    for (const [k, v] of Object.entries(ov)) n.style.setProperty(kebab(k), v);
  });
}

// 手柄（八点缩放）：挂在选中元素上，交互层通过 data-handle 识别
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
function appendHandles(div) {
  for (const h of HANDLES) {
    const d = document.createElement('div');
    d.className = 'v2-h';
    d.dataset.handle = h;
    div.appendChild(d);
  }
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

// 溢出警告（D2：height 固定 px，内容超出画琥珀虚线）
function markOverflow(stageEl) {
  stageEl.querySelectorAll('[data-el-id]').forEach((div) => {
    if (div.scrollHeight > div.clientHeight + 2) div.classList.add('overflow');
  });
}

// 全量重建（v0.1 策略：元素数 <100，全量重渲染足够快）
export function renderStage(stageEl, doc, selectedId) {
  stageEl.style.width = doc.stage.width + 'px';
  stageEl.style.height = doc.stage.height + 'px';
  stageEl.style.background = doc.stage.background;
  stageEl.innerHTML = '';
  for (const el of doc.elements) {
    stageEl.appendChild(renderElement(el, el.id === selectedId));
  }
  markOverflow(stageEl);
}
