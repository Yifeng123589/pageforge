// PageForge 右键菜单（M4 质感打磨）
// 画布内右键元素 → 中文菜单：复制 / 设置超链接 / 移除链接 / 置顶 / 置底 / 删除
export function initContextMenu({ editor, toast }) {
  const menu = document.getElementById('context-menu');
  const modalLink = document.getElementById('modal-link');
  const linkInput = document.getElementById('link-url');

  function hide() {
    menu.hidden = true;
    modalLink.hidden = true;
  }

  function showMenu(x, y, comp) {
    const isLink = comp.get('tagName') === 'a';
    const isImg = comp.get('tagName') === 'img';
    // 动效容器（轮播/网格滚动条）：悬浮放大开关
    const isMotionBox = !!comp.getAttributes() && (comp.getAttributes()['data-pf-carousel'] !== undefined || comp.getAttributes()['data-pf-marquee'] !== undefined);
    const items = [];
    items.push({ label: '复制', action: () => copyComp(comp) });
    if (isImg) {
      // 图片组件：直接替换图片（不改结构）
      items.push({ label: '更换图片', action: () => openImageModal(comp) });
    } else {
      items.push({ label: '插入图片', action: () => openImageModal(null) });
    }
    if (isMotionBox) {
      const hoverOn = comp.getAttributes()['data-pf-hover'] !== undefined;
      items.push({
        label: hoverOn ? '悬浮放大：开 ✓（点击关闭）' : '悬浮放大：关（点击开启）',
        action: () => {
          const attrs = { ...comp.getAttributes() };
          if (hoverOn) delete attrs['data-pf-hover'];
          else attrs['data-pf-hover'] = '';
          comp.setAttributes(attrs);
          toast(hoverOn ? '已关闭悬浮放大' : '已开启悬浮放大（鼠标移上图片放大）');
        },
      });
      // 网格滚动条：列数/行数调节（斜向错位网格重建）
      if (comp.getAttributes()['data-pf-marquee'] !== undefined) {
        const cols = +(comp.getAttributes()['data-pf-cols'] || 5);
        const rows = +(comp.getAttributes()['data-pf-rows'] || 2);
        items.push({
          label: `列数：${cols}（− 加少 / ＋ 加多）`,
          action: () => adjustMarquee(comp, cols - 1 >= 2 ? cols - 1 : cols, rows),
        });
        items.push({
          label: `列数：${cols} ＋`,
          action: () => adjustMarquee(comp, Math.min(12, cols + 1), rows),
        });
        items.push({
          label: `行数：${rows} −`,
          action: () => adjustMarquee(comp, cols, Math.max(1, rows - 1)),
        });
        items.push({
          label: `行数：${rows} ＋`,
          action: () => adjustMarquee(comp, cols, Math.min(4, rows + 1)),
        });
      }
    }
    items.push({
      label: isLink ? '修改链接' : '设置超链接',
      action: () => openLinkModal(comp),
    });
    if (isLink) items.push({ label: '移除链接', action: () => removeLink(comp) });
    items.push({ label: '置于顶层', action: () => toTop(comp) });
    items.push({ label: '置于底层', action: () => toBottom(comp) });
    items.push({ sep: true });
    items.push({ label: '删除', danger: true, action: () => removeComp(comp) });

    menu.innerHTML = '';
    for (const it of items) {
      if (it.sep) {
        const d = document.createElement('div');
        d.className = 'ctx-sep';
        menu.appendChild(d);
        continue;
      }
      const b = document.createElement('button');
      b.className = 'ctx-item' + (it.danger ? ' danger' : '');
      b.textContent = it.label;
      b.addEventListener('click', () => { hide(); it.action(); });
      menu.appendChild(b);
    }
    menu.hidden = false;
    // 防溢出
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - mw - 8)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - mh - 8)) + 'px';
  }

  // ===== 网格滚动条：列数/行数重建（斜向错位 + 圆角 + 双份无缝）=====
  function adjustMarquee(comp, cols, rows) {
    // 收集现有图片 src（保留用户换过的图）
    const srcs = comp.find('img').map((i) => i.getAttributes().src);
    if (!srcs.length) srcs.push('');
    // 构建一份网格：rows 行 × cols 图，奇行错位 88px（斜向网感）
    let one = '';
    for (let r = 0; r < rows; r++) {
      const pad = r % 2 ? 'padding:0 8px 0 88px;' : 'padding:0 8px;';
      one += `<div style="display:flex;gap:16px;${pad}">`;
      for (let c = 0; c < cols; c++) {
        const src = srcs[(r * cols + c) % srcs.length];
        one += `<img src="${src}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt="">`;
      }
      one += '</div>';
    }
    // 替换 track 内容：双份（无缝循环）
    const track = comp.find('[data-pf-track]')[0];
    if (track) {
      track.components().reset();
      track.append(`<div style="flex-shrink:0;">${one}</div><div style="flex-shrink:0;">${one}</div>`);
    }
    comp.setAttributes({ ...comp.getAttributes(), 'data-pf-cols': String(cols), 'data-pf-rows': String(rows) });
    toast(`网格已调整为 ${cols} 列 × ${rows} 行`);
  }

  // ===== 菜单操作 =====
  function copyComp(comp) {
    const parent = comp.parent();
    const clone = comp.clone();
    parent.components().add(clone, { at: comp.index() + 1 });
    editor.select(clone);
    toast('已复制');
  }

  function removeComp(comp) {
    comp.remove();
    toast('已删除');
  }

  function toTop(comp) {
    comp.parent().append(comp);
    toast('已置于顶层');
  }

  function toBottom(comp) {
    comp.parent().components().add(comp, { at: 0 });
    toast('已置于底层');
  }

  function removeLink(comp) {
    const inner = comp.components().map((c) => c.toHTML()).join('');
    comp.replaceWith(inner || '');
    toast('已移除链接');
  }

  // ===== 插入图片（右键菜单）=====
  const modalImage = document.getElementById('modal-image');
  const imgFileInput = document.getElementById('img-file');
  const imgUrlInput = document.getElementById('img-url');

  function insertImage(src, comp) {
    // 更换图片模式：直接替换目标 img 的 src（保留原组件结构/样式）
    const replaceTarget = window.__pfReplaceImg;
    window.__pfReplaceImg = null;
    if (replaceTarget) {
      replaceTarget.setAttributes({ src });
      toast('图片已更换');
      return;
    }
    const html = `<img src="${src}" alt="图片" style="width:100%;max-width:800px;margin:0 auto;border-radius:12px;display:block;">`;
    const target = comp || editor.getSelected();
    if (target) {
      const parent = target.parent();
      const at = target.index() + 1;
      parent.components().add(html, { at });
      const added = parent.components().at(at);
      if (added) editor.select(added);
    } else {
      editor.addComponents(html);
    }
    toast('图片已插入');
  }

  // 本地图片 → base64 压缩（最大宽 1600，JPEG 质量 0.85；PNG/透明保留）
  function compressImage(file, maxW, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const keepPng = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
          resolve(canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('图片读取失败'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  function openImageModal(replaceComp) {
    window.__pfReplaceImg = replaceComp || null;
    modalImage.hidden = false;
    setTimeout(() => imgUrlInput.focus(), 60);
  }
  // 暴露给主模块（轮播控制面板等复用）
  window.__pfOpenImageModal = openImageModal;
  window.__pfInsertImage = insertImage;
  document.getElementById('img-close').addEventListener('click', () => { modalImage.hidden = true; });
  document.getElementById('img-file-btn').addEventListener('click', () => imgFileInput.click());
  document.getElementById('img-ph-btn').addEventListener('click', () => {
    modalImage.hidden = true;
    // 与左侧"图片"块一致的占位图（中文需 UTF-8 编码后 base64）
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#f1f5f9"/><rect x="8" y="8" width="784" height="434" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="10 8"/><text x="400" y="225" font-family="Arial" font-size="26" fill="#94a3b8" text-anchor="middle">图片占位（可替换）</text></svg>';
    insertImage('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))));
  });
  imgFileInput.addEventListener('change', async () => {
    const file = imgFileInput.files[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 1600, 0.85);
      modalImage.hidden = true;
      insertImage(dataUrl);
    } catch (e) {
      toast('图片处理失败：' + e.message);
    }
    imgFileInput.value = '';
  });
  document.getElementById('img-url-insert').addEventListener('click', () => {
    const url = imgUrlInput.value.trim();
    if (!url) { toast('请输入图片网址'); return; }
    modalImage.hidden = true;
    imgUrlInput.value = '';
    insertImage(url);
  });
  imgUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('img-url-insert').click();
  });

  // ===== 超链接弹窗 =====
  let linkComp = null;
  function openLinkModal(comp) {
    linkComp = comp;
    linkInput.value = comp.get('tagName') === 'a' ? (comp.get('href') || '') : '';
    modalLink.hidden = false;
    linkInput.focus();
    linkInput.select();
  }
  document.getElementById('link-save').addEventListener('click', () => {
    const url = linkInput.value.trim();
    if (!url) { toast('链接地址不能为空'); return; }
    if (linkComp.get('tagName') === 'a') {
      linkComp.setAttributes({ href: url });
    } else {
      // 用 a 包裹选中元素（继承原有样式，点击跳转）
      try {
        const wrapped = linkComp.wrap(`<a href="${escapeAttr(url)}" target="_blank" style="text-decoration:inherit;color:inherit;"></a>`);
        if (wrapped) editor.select(wrapped);
      } catch {
        // wrap 不可用时：替换为 a 包裹的 HTML
        const html = linkComp.toHTML();
        linkComp.replaceWith(`<a href="${escapeAttr(url)}" target="_blank" style="text-decoration:inherit;color:inherit;">${html}</a>`);
      }
    }
    hide();
    toast('链接已设置');
  });
  document.getElementById('link-cancel').addEventListener('click', hide);
  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('link-save').click();
  });

  function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ===== 画布 iframe 内右键监听 =====
  function bindFrame() {
    const frame = editor.Canvas.getFrameEl();
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.removeEventListener('contextmenu', onCtx);
    doc.addEventListener('contextmenu', onCtx);
    doc.removeEventListener('click', hide);
    doc.addEventListener('click', hide);
    // 拖入图片文件 → 直接插入（#9）
    doc.removeEventListener('dragover', onFrameDragOver);
    doc.addEventListener('dragover', onFrameDragOver);
    doc.removeEventListener('drop', onFrameDrop);
    doc.addEventListener('drop', onFrameDrop);
  }

  // 允许图片文件拖放（不 preventDefault 则浏览器默认打开图片）
  function onFrameDragOver(e) {
    const types = e.dataTransfer && e.dataTransfer.types;
    if (types && [...types].includes('Files')) e.preventDefault();
  }

  // 图片文件拖入画布 → 压缩插入到目标组件后（无目标则页末）
  function onFrameDrop(e) {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const imgFile = [...files].find((f) => f.type.startsWith('image/'));
    if (!imgFile) return;
    e.preventDefault();
    e.stopPropagation();
    const targetComp = findCompByEl(editor.getWrapper(), e.target);
    compressImage(imgFile, 1600, 0.85)
      .then((dataUrl) => insertImage(dataUrl, targetComp))
      .catch((err) => toast('图片处理失败：' + err.message));
  }

  // 通过组件树遍历查找 DOM 元素对应的组件（0.23 无 getElementComponent API）
  function findCompByEl(root, el) {
    if (!root) return null;
    const view = root.view;
    if (view && view.el && (view.el === el || view.el.contains(el))) {
      let deepest = root;
      for (const child of root.components()) {
        const c = findCompByEl(child, el);
        if (c) deepest = c;
      }
      return deepest;
    }
    return null;
  }

  function onCtx(e) {
    e.preventDefault();
    e.stopPropagation();
    const comp = findCompByEl(editor.getWrapper(), e.target);
    if (!comp) return;
    editor.select(comp);
    const fr = editor.Canvas.getFrameEl().getBoundingClientRect();
    showMenu(fr.left + e.clientX, fr.top + e.clientY, comp);
  }

  editor.on('load', bindFrame);
  // GrapesJS 切页会重建 iframe document（旧监听随旧文档销毁）→ 切页后重新绑定
  editor.on('page:select', () => setTimeout(bindFrame, 500));
  // iframe 重新加载（document 重建）兜底
  try {
    const frameEl = editor.Canvas.getFrameEl();
    if (frameEl) frameEl.addEventListener('load', () => setTimeout(bindFrame, 300));
  } catch { /* 忽略 */ }
  // 主页面点击菜单外关闭
  document.addEventListener('mousedown', (e) => {
    if (!menu.contains(e.target) && !modalLink.contains(e.target)) hide();
  });
}
