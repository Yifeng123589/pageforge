// v2 样式面板：容器样式（el.style）+ 文字叶子样式（overrides[data-id]）——纯数据驱动
// 容器字段改动写 el.style；叶子字段改动写 overrides（渲染层合并预览，导出时合并为内联）

function parseStyleAttr(str) {
  const out = {};
  String(str || '').split(';').forEach((p) => {
    const i = p.indexOf(':');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

export function initStylePanel({ panelEl, getDoc, getSel, updateElement, snapshot, toast = () => {} }) {
  let leafId = null;

  const q = (sel) => panelEl.querySelector(sel);
  const cur = () => {
    const id = getSel();
    return id ? getDoc().elements.find((e) => e.id === id) : null;
  };

  function refresh() {
    const el = cur();
    panelEl.hidden = !el;
    if (!el) return;
    // 容器字段
    for (const f of ['background', 'borderRadius', 'padding']) {
      q(`[data-f="${f}"]`).value = el.style[f] || '';
    }
    // 动效
    q('#sp-motion').value = el.motion || 'none';
    refreshLeaves(el);
  }

  function refreshLeaves(el) {
    const tmp = document.createElement('div');
    tmp.innerHTML = el.html;
    const leaves = [...tmp.querySelectorAll('[data-id]')];
    if (!leaves.some((l) => l.getAttribute('data-id') === leafId)) leafId = leaves[0]?.getAttribute('data-id') || null;
    const sel = q('#sp-leaf');
    sel.innerHTML = leaves.map((l) => {
      const id = l.getAttribute('data-id');
      return `<option value="${id}">${id} · ${l.textContent.trim().slice(0, 10) || '(空)'}</option>`;
    }).join('');
    sel.value = leafId || '';
    refreshLeaf(el);
  }

  function refreshLeaf(el) {
    const box = q('#sp-leaf-box');
    if (!leafId) { box.hidden = true; return; }
    box.hidden = false;
    const tmp = document.createElement('div');
    tmp.innerHTML = el.html;
    const leaf = tmp.querySelector(`[data-id="${leafId}"]`);
    const eff = { ...parseStyleAttr(leaf?.getAttribute('style')), ...(el.overrides[leafId] || {}) };
    q('#sp-leaf-color').value = /^#[0-9a-fA-F]{6}$/.test(eff.color || '') ? eff.color : '#333333';
    q('#sp-leaf-size').value = eff['font-size'] || '';
    q('#sp-leaf-line').value = eff['line-height'] || '';
  }

  // 容器字段
  panelEl.querySelectorAll('[data-f]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const el = cur();
      if (!el) return;
      snapshot();
      const patch = { style: { ...el.style, [inp.dataset.f]: inp.value.trim() } };
      // 图片元素：圆角要作用到 img 自身（容器不裁剪，否则裁掉缩放/旋转手柄）
      if (inp.dataset.f === 'borderRadius' && el.type === 'image') {
        patch.overrides = { ...(el.overrides || {}), img_main: { ...(el.overrides?.img_main || {}), borderRadius: inp.value.trim() } };
      }
      updateElement(el.id, patch);
    });
  });

  // 动效（声明式属性：滚动到视口触发，导出时注入 reveal 引擎）
  q('#sp-motion').addEventListener('change', (e) => {
    const el = cur();
    if (!el) return;
    snapshot();
    updateElement(el.id, { motion: e.target.value === 'none' ? '' : e.target.value });
    toast(e.target.value === 'none' ? '已移除动效' : '已设置动效——导出的网页滚动到这里会触发');
  });

  // 叶子切换
  q('#sp-leaf').addEventListener('change', (e) => { leafId = e.target.value; refreshLeaf(cur()); });

  // 叶子字段（写覆盖表）
  const leafField = (sel, key) => {
    q(sel).addEventListener('change', () => {
      const el = cur();
      if (!el || !leafId) return;
      snapshot();
      const v = q(sel).value.trim();
      const next = { ...(el.overrides[leafId] || {}) };
      if (v) next[key] = v; else delete next[key];
      updateElement(el.id, { overrides: { ...el.overrides, [leafId]: next } });
      refreshLeaf(getDoc().elements.find((e) => e.id === el.id));
    });
  };
  leafField('#sp-leaf-color', 'color');
  leafField('#sp-leaf-size', 'font-size');
  leafField('#sp-leaf-line', 'line-height');

  return { refresh, setLeaf: (id) => { leafId = id; } };
}
