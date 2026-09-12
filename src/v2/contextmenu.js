// v2 右键菜单（骨架版）：复制 / 置于顶层 / 置于底层 / 删除
// 与其他交互模块同构：只经注入接口操作数据；后续按需加项（超链接/锁定/多选操作等）
// 编辑文字时放行原生右键菜单（复制粘贴文本用）

export function initContextMenu({ stageEl, isEditing, getSel, setSel, getDoc, updateElement, addElement, removeElement, snapshot, elId }) {
  const menu = document.createElement('div');
  menu.className = 'v2-ctx';
  menu.hidden = true;
  document.body.appendChild(menu);

  const ITEMS = [
    { act: 'dup', label: '复制', hint: 'Ctrl+D' },
    { act: 'top', label: '置于顶层' },
    { act: 'bottom', label: '置于底层' },
    { act: 'del', label: '删除', hint: 'Del', danger: true },
  ];
  menu.innerHTML = ITEMS.map((i) =>
    `<button class="v2-ctx-item${i.danger ? ' danger' : ''}" data-act="${i.act}">${i.label}${i.hint ? `<span class="v2-ctx-hint">${i.hint}</span>` : ''}</button>`
  ).join('');

  const zRange = () => {
    const zs = getDoc().elements.map((e) => e.z);
    return { max: zs.length ? Math.max(...zs) : 0, min: zs.length ? Math.min(...zs) : 0 };
  };
  const actions = {
    dup() {
      const id = getSel();
      const src = id && getDoc().elements.find((e) => e.id === id);
      if (!src) return;
      snapshot();
      const copy = structuredClone(src);
      copy.id = elId();
      copy.x += 24; copy.y += 24;
      copy.z = zRange().max + 1;
      copy.locked = false;
      addElement(copy);
      setSel(copy.id);
    },
    top() { const id = getSel(); if (!id) return; snapshot(); updateElement(id, { z: zRange().max + 1 }); },
    bottom() { const id = getSel(); if (!id) return; snapshot(); updateElement(id, { z: zRange().min - 1 }); },
    del() {
      const id = getSel();
      if (!id) return;
      snapshot();
      removeElement(id);
      setSel(null);
    },
  };

  function show(x, y) {
    menu.hidden = false;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - mh - 8) + 'px';
  }
  function hide() { menu.hidden = true; }

  // 右键：命中元素 → 选中并弹菜单；空白 → 取消选中不弹（编辑文字时放行原生菜单）
  stageEl.addEventListener('contextmenu', (e) => {
    if (isEditing()) return; // 原生菜单（复制/粘贴文字）
    const elDiv = e.target.closest('[data-el-id]');
    e.preventDefault();
    if (!elDiv) { setSel(null); hide(); return; }
    setSel(elDiv.dataset.elId);
    show(e.clientX, e.clientY);
  });

  menu.addEventListener('mousedown', (e) => e.stopPropagation()); // 防止 document 关闭逻辑抢先
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    hide();
    actions[btn.dataset.act]?.();
  });

  // 点外面 / Esc 关闭
  document.addEventListener('mousedown', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  return {
    hide,
    actions, // 快捷键复用：main 里 Ctrl+D → actions.dup()
  };
}
