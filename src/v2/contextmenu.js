// v2 右键菜单：按"右键命中的东西"动态出项
//   · 空白处         → 插入图片
//   · <a> 叶子       → 修改链接 / 移除链接 / 更换图片(若图) / 通用
//   · 图片           → 更换图片 / 插入图片 / 通用
//   · 块内含图的元素 → 更换图片（块内的 <img>）/ 另插入一张 / 通用
//   · 普通元素/文字  → 设置超链接 / 插入图片 / 通用
// 与其他交互模块同构：只经注入接口操作数据；图片与链接的弹窗由 main 提供（openImagePicker / openLinkEditor）。
// 编辑文字时放行原生右键菜单（复制粘贴文本用）。

export function initContextMenu({
  stageEl, isEditing, getSel, setSel, getDoc, updateElement, addElement, removeElement, snapshot, elId,
  getZoom, openImagePicker, openLinkEditor, removeLink, onDeepSelect,
}) {
  const menu = document.createElement('div');
  menu.className = 'v2-ctx';
  menu.hidden = true;
  document.body.appendChild(menu);

  let ctxTarget = null; // { blank, x, y } | { elementId, leafId, leafTag, isImg, hasTextLeaf }

  const zRange = () => {
    const zs = getDoc().elements.map((e) => e.z);
    return { max: zs.length ? Math.max(...zs) : 0, min: zs.length ? Math.min(...zs) : 0 };
  };

  // —— 菜单项（按目标动态生成）——
  function buildItems() {
    const t = ctxTarget;
    const items = [];
    if (!t || t.blank) {
      items.push({ act: 'insertImg', label: '插入图片' });
      return items;
    }
    // 深入选中块内元素：复合模块里的按钮/标题靠这个进得去（Ctrl+点击同效）
    if (t.leafId) items.push({ act: 'deep', label: '选中这个内部元素' });
    if (t.leafTag === 'a') {
      items.push({ act: 'link', label: '修改链接' });
      items.push({ act: 'unlink', label: '移除链接' });
    } else if (t.hasTextLeaf) {
      items.push({ act: 'link', label: '设置超链接' });
    }
    if (t.isImg || t.elHasImg) items.push({ act: 'replaceImg', label: '更换图片' });
    items.push({ act: 'insertImg', label: t.isImg || t.elHasImg ? '另插入一张图片' : '插入图片' });
    items.push({ act: 'dup', label: '复制', hint: 'Ctrl+D' });
    items.push({ act: 'top', label: '置于顶层' });
    items.push({ act: 'bottom', label: '置于底层' });
    items.push({ act: 'del', label: '删除', hint: 'Del', danger: true });
    return items;
  }

  function renderMenu() {
    menu.innerHTML = buildItems().map((i) =>
      `<button class="v2-ctx-item${i.danger ? ' danger' : ''}" data-act="${i.act}">${i.label}${i.hint ? `<span class="v2-ctx-hint">${i.hint}</span>` : ''}</button>`
    ).join('');
  }

  // —— 动作 ——
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

    // 深入选中块内元素（block 内部 → 具体按钮/标题/段落）
    deep() {
      const t = ctxTarget;
      if (!t || t.blank || !t.leafId) return;
      onDeepSelect?.(t.elementId, t.leafId);
    },

    // 修改/设置超链接（弹窗由 main 提供；此处只传目标）
    link() {
      const t = ctxTarget;
      if (!t || t.blank) return;
      openLinkEditor?.({ elementId: t.elementId, leafId: t.leafId });
    },

    // 移除链接：由 main 提供实现（与链接弹窗的「移除链接」共用同一段逻辑）
    unlink() {
      const t = ctxTarget;
      if (!t || t.blank) return;
      removeLink?.(t.elementId, t.leafId);
    },

    // 更换图片：走图片弹窗的替换模式（块内含图时也走这里——由 main 决定换块内哪张）
    replaceImg() {
      const t = ctxTarget;
      if (!t || t.blank) return;
      openImagePicker?.({ mode: 'replace', elementId: t.elementId, leafId: t.leafId, elHasImg: t.elHasImg });
    },

    // 插入图片：一律放在右键点处（所见即所得）
    // 之前元素上右键不带坐标 → 走 placeElement() 兜底被丢到全页元素下方（用户报的 bug）
    insertImg() {
      const t = ctxTarget;
      openImagePicker?.({ mode: 'insert', x: t?.x, y: t?.y });
    },
  };

  function show(x, y) {
    menu.hidden = false;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    // 审计 BUG-15：补下限，左上角附近右键时菜单不溢出屏幕
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - mw - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - mh - 8)) + 'px';
  }
  function hide() { menu.hidden = true; }

  // 右键：命中元素 → 记录目标并弹菜单；空白 → 仍弹菜单（提供"插入图片"）
  stageEl.addEventListener('contextmenu', (e) => {
    if (isEditing()) return; // 原生菜单（复制/粘贴文字）
    e.preventDefault();
    const elDiv = e.target.closest('[data-el-id]');
    const leafEl = e.target.closest('[data-id]');

    // 右键点的画布坐标：空白处和元素上一律记录（"插入图片"就是所见即所得）
    const rect = stageEl.getBoundingClientRect();
    const z = getZoom ? getZoom() : 1;
    const px = (e.clientX - rect.left) / z;
    const py = (e.clientY - rect.top) / z;

    if (!elDiv) {
      ctxTarget = { blank: true, x: px, y: py };
      setSel(null);
      renderMenu();
      show(e.clientX, e.clientY);
      return;
    }

    const elementId = elDiv.dataset.elId;
    const el = getDoc().elements.find((x) => x.id === elementId);
    const leafTag = (leafEl?.tagName || '').toLowerCase();
    ctxTarget = {
      elementId,
      leafId: leafEl?.getAttribute('data-id') || null,
      leafTag,
      isImg: leafTag === 'img' || el?.type === 'image',
      // 块内含图（如 v1 块降级成的画布元素，图片位是内部 div/ img，元素 type 不是 image）
      elHasImg: !!el && /<img\b/i.test(el.html || ''),
      hasTextLeaf: !!el && /<(p|h[1-6]|span|a)\b[^>]*data-id=/i.test(el.html),
      x: px,
      y: py,
    };
    setSel(elementId);
    renderMenu();
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
    target: () => ctxTarget,
  };
}
