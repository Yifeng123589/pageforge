// v2 样式面板：位置与尺寸（A0-6）+ 容器样式 + 文字样式（A0-7）
//
// 实时预览与撤销的取舍（A0-7 验收要求 "input 事件实时生效，非失焦才生效"）：
//   · input  → 立即写入，但**同一次连续编辑只压一次快照**（会话标记 editSession）
//   · change → 结束会话（下次编辑重新压快照）
//   这样连续拖滑块 / 连打字 / 在取色器里来回选，都只产生一步撤销，撤销能整体回到编辑前。
//
// 写入目标：
//   · 容器字段 → el.style[key]（渲染层用 styleText 展开）
//   · 文字字段 → el.overrides[leafId][key]（渲染/导出时合并到该叶子，不污染原 HTML）

import { FONT_PRESETS, WEIGHT_PRESETS } from './font-presets.js';
import { escHtml } from '../esc.js';

function parseStyleAttr(str) {
  const out = {};
  String(str || '').split(';').forEach((p) => {
    const i = p.indexOf(':');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

/** 解析 box-shadow（只认编辑器自己合成的形态：Xpx Ypx Bpx color） */
function parseShadow(v) {
  const m = /^\s*(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s+(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[a-z]+)\s*$/i.exec(String(v || ''));
  if (!m) return null;
  return { x: m[1], y: m[2], b: m[3], c: m[4] };
}
function composeShadow(x, y, b, c) {
  const any = [x, y, b].some((v) => String(v).trim() !== '');
  if (!any) return '';
  return `${Number(x) || 0}px ${Number(y) || 0}px ${Number(b) || 0}px ${c || '#000000'}`;
}

const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ''));

export function initStylePanel({ panelEl, getDoc, getSel, updateElement, snapshot, toast = () => {} }) {
  let leafId = null;
  let editSession = null; // 正在连续编辑的字段（用于把一串 input 合并成一步撤销）

  const q = (sel) => panelEl.querySelector(sel);
  const cur = () => {
    const id = getSel();
    return id ? getDoc().elements.find((e) => e.id === id) : null;
  };

  // —— 读写字段 ——
  const getLeafStyle = (el) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = el.html;
    const textLeaves = () => [...tmp.querySelectorAll('[data-id]')].filter((n) => /^(P|H1|H2|H3|H4|H5|H6|SPAN|A)$/.test(n.tagName));
    // 目标为空（整个模块）时，用第一个文字叶子的原始内联样式做参考值
    const leaf = leafId ? tmp.querySelector(`[data-id="${leafId}"]`) : (textLeaves()[0] || null);
    if (!leaf) return {};
    const own = parseStyleAttr(leaf.getAttribute('style'));
    return leafId ? { ...own, ...((el.overrides || {})[leafId] || {}) } : own;
  };

  function writeContainer(key, value) {
    const el = cur();
    if (!el) return;
    const next = { ...(el.style || {}) };
    if (value) next[key] = value; else delete next[key];
    const patch = { style: next };
    // 图片元素的圆角要作用到 img 自身（容器不裁剪，否则会裁掉缩放/旋转手柄）
    if (key === 'borderRadius' && el.type === 'image') {
      patch.overrides = { ...(el.overrides || {}), img_main: { ...(el.overrides?.img_main || {}), borderRadius: value } };
    }
    updateElement(el.id, patch);
  }

  function writeLeaf(key, value) {
    const el = cur();
    if (!el || !leafId) return;
    const next = { ...((el.overrides || {})[leafId] || {}) };
    if (value) next[key] = value; else delete next[key];
    updateElement(el.id, { overrides: { ...el.overrides, [leafId]: next } });
  }

  // 目标是"整个模块"时，文字类字段写进全部文字叶子（对容器本身无意义）
  function writeAllTextLeaves(key, value) {
    const el = cur();
    if (!el) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = el.html;
    const leaves = [...tmp.querySelectorAll('[data-id]')].filter((n) => /^(P|H1|H2|H3|H4|H5|H6|SPAN|A)$/.test(n.tagName));
    if (!leaves.length) return;
    const overrides = { ...(el.overrides || {}) };
    for (const n of leaves) {
      const id = n.getAttribute('data-id');
      const next = { ...(overrides[id] || {}) };
      if (value) next[key] = value; else delete next[key];
      overrides[id] = next;
    }
    updateElement(el.id, { overrides });
  }

  /**
   * 统一"作用目标"语义——这是修"伪选中"的关键。
   * 之前 scope 在 bind 时写死（'container'/'leaf'），于是界面看着选中了内部元素、
   * 调不透明度/背景/圆角却改的是整块。
   *   · 目标是某个内部元素（深入选中 → 下拉自动切到它）→ **所有字段**都写它的覆盖表
   *   · 目标是整个模块（下拉选「整个模块」）→ 容器字段写 el.style，文字字段写全部文字叶子
   */
  function write(scope, key, value) {
    if (leafId) return writeLeaf(key, value);
    if (scope === 'container') writeContainer(key, value);
    else writeAllTextLeaves(key, value);
  }

  /**
   * 不透明度：目标是内部元素 → 写该叶子的 CSS opacity（覆盖表）；
   * 目标是整个模块 → 写元素级 opacity（元素属性，渲染时作用于整块）。
   * 不这么分就会"选了按钮却整块变透明"。
   */
  function writeOpacity(v) {
    const el = cur();
    if (!el) return;
    if (leafId) { writeLeaf('opacity', v > 0.999 ? '' : String(v)); return; }
    if (v !== el.opacity) updateElement(el.id, { opacity: v });
  }

  // —— 编辑会话：一串 input 只压一次快照 ——
  function beginOnce(sid) {
    if (editSession === sid) return;
    snapshot();
    editSession = sid;
  }

  /**
   * 绑定一个字段控件。
   * @param sel    选择器
   * @param scope  'container' | 'leaf'
   * @param key    CSS 属性名
   * @param opts   { toCss, toInput, sid } —— toCss 把控件原始值转成 CSS 值
   */
  function bind(sel, scope, key, opts = {}) {
    const inp = q(sel);
    if (!inp) return;
    const toCss = opts.toCss || ((v) => String(v).trim());
    const sid = opts.sid || `${scope}:${key}`;
    const apply = () => write(scope, key, toCss(inp.value));
    inp.addEventListener('input', () => { beginOnce(sid); apply(); });   // 实时预览
    inp.addEventListener('change', () => {                              // 提交 + 结束会话
      if (editSession !== sid) snapshot();
      apply();
      editSession = null;
    });
    inp.addEventListener('blur', () => { editSession = null; });
  }

  // —— 字体 / 字重预设填充（A0-8）——
  // 注意：字体 id 里含双引号（"Microsoft YaHei", …），拼进 value="…" 必须转义，否则属性会被截断
  q('#sp-font').innerHTML = '<option value="">默认字体</option>'
    + FONT_PRESETS.map((f) => `<option value="${f.id.replace(/"/g, '&quot;')}">${f.label}</option>`).join('');
  q('#sp-weight').innerHTML = '<option value="">默认字重</option>'
    + WEIGHT_PRESETS.map((w) => `<option value="${w.id}">${w.label}</option>`).join('');

  // —— 回填 ——
  function refresh() {
    const el = cur();
    panelEl.hidden = !el;
    if (!el) return;

    // 位置与尺寸（A0-6）
    q('#sp-x').value = Math.round(el.x);
    q('#sp-y').value = Math.round(el.y);
    q('#sp-w').value = Math.round(el.width);
    q('#sp-h').value = Math.round(el.height);
    q('#sp-rot').value = Math.round(el.rotation || 0);
    q('#sp-op').value = el.opacity ?? 1;
    q('#sp-z').value = el.z ?? 0;

    // 容器（A0-7）
    const st = el.style || {};
    q('#sp-bg').value = isHex(st.background) ? st.background : '#ffffff';
    q('#sp-bg-txt').value = st.background && !isHex(st.background) ? st.background : '';
    q('#sp-radius').value = st.borderRadius || '';
    q('#sp-pad').value = st.padding || '';
    q('#sp-bd-w').value = st.borderWidth || '';
    q('#sp-bd-s').value = st.borderStyle || '';
    q('#sp-bd-c').value = isHex(st.borderColor) ? st.borderColor : '#e5e7eb';
    const sh = parseShadow(st.boxShadow);
    q('#sp-sh-x').value = sh ? sh.x : '';
    q('#sp-sh-y').value = sh ? sh.y : '';
    q('#sp-sh-b').value = sh ? sh.b : '';
    q('#sp-sh-c').value = sh && isHex(sh.c) ? sh.c : '#000000';
    q('#sp-opa').value = String(el.opacity ?? 1);
    q('#sp-motion').value = el.motion || 'none';

    refreshLeaves(el);
  }

  function refreshLeaves(el) {
    const tmp = document.createElement('div');
    tmp.innerHTML = el.html;
    const leaves = [...tmp.querySelectorAll('[data-id]')];
    // 目标由"深入选中"决定（main 的 selectLeaf / setSel 调 setLeaf），面板下拉可手动切。
    // 不再回落到第一个叶子——那会让"整块选中"看起来像选了某个叶子（伪选中）。
    if (leafId && !leaves.some((l) => l.getAttribute('data-id') === leafId)) leafId = null;
    const sel = q('#sp-leaf');
    // 下拉显示"内容 · 这是什么"，而不是裸 id（pf3 没人看得懂）
    const TAG_CN = {
      a: '按钮/链接', button: '按钮', img: '图片', h1: '大标题', h2: '标题', h3: '小标题',
      h4: '小标题', h5: '小标题', h6: '小标题', p: '文字',
    };
    sel.innerHTML = '<option value="">整个模块（整块一起改）</option>' + leaves.map((l) => {
      const id = l.getAttribute('data-id');
      const tag = l.tagName.toLowerCase();
      const txt = (l.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14);
      const what = TAG_CN[tag] || tag;
      const label = tag === 'img' ? what : (txt ? `${txt} · ${what}` : `(空) · ${what}`);
      return `<option value="${id}">${escHtml ? escHtml(label) : label}</option>`;
    }).join('');
    sel.value = leafId || '';
    // 不透明度回填必须放在"目标已确定"之后：目标是内部元素就显示那个叶子的值，否则显示元素级值
    {
      const eff = getLeafStyle(el);
      const opa = leafId ? Number(eff.opacity ?? 1) : Number(el.opacity ?? 1);
      q('#sp-opa').value = String(opa);
      q('#sp-op').value = String(opa);
    }
    refreshLeaf(el);
  }

  function refreshLeaf(el) {
    const box = q('#sp-leaf-box');
    // 目标是"整个模块"时也保留文字字段（它们作用于全部文字），仅当元素完全没有文字元素时才隐藏
    if (!/<(p|h[1-6]|span|a)\b/i.test(el.html)) { box.hidden = true; return; }
    box.hidden = false;
    const eff = getLeafStyle(el);
    q('#sp-leaf-color').value = isHex(eff.color) ? eff.color : '#333333';
    q('#sp-leaf-size').value = eff['font-size'] || '';
    q('#sp-leaf-line').value = eff['line-height'] || '';
    q('#sp-leaf-ls').value = eff['letter-spacing'] || '';
    q('#sp-font').value = eff['font-family'] || '';
    q('#sp-weight').value = eff['font-weight'] || '';
    // 对齐 / 样式按钮的激活态
    const ta = eff['text-align'] || 'left';
    panelEl.querySelectorAll('[data-ta]').forEach((b) => b.classList.toggle('on', b.dataset.ta === ta));
    const fw = String(eff['font-weight'] || '');
    const td = String(eff['text-decoration'] || '');
    panelEl.querySelectorAll('[data-td]').forEach((b) => {
      const k = b.dataset.td;
      const on = k === 'bold' ? (fw === '700' || fw === 'bold' || Number(fw) >= 600)
        : k === 'italic' ? /italic/.test(eff['font-style'] || '')
          : /underline/.test(td);
      b.classList.toggle('on', on);
    });
  }

  // —— 位置与尺寸（A0-6）：非法值回填、超范围夹紧、无变化不压快照 ——
  const NUM_FIELDS = [
    ['#sp-x', 'x', -5000, 5000, true],
    ['#sp-y', 'y', -5000, 5000, true],
    ['#sp-w', 'width', 40, 5000, true],
    ['#sp-h', 'height', 40, 5000, true],
    ['#sp-rot', 'rotation', -360, 360, true],
    ['#sp-op', 'opacity', 0, 1, false],
    ['#sp-z', 'z', -999, 9999, true],
  ];
  for (const [sel, key, min, max, isInt] of NUM_FIELDS) {
    q(sel).addEventListener('change', () => {
      const el = cur();
      if (!el) return;
      const raw = q(sel).value.trim();
      if (raw === '') { q(sel).value = el[key] ?? ''; return; }
      let n = Number(raw);
      if (!isFinite(n)) { q(sel).value = el[key] ?? ''; return; }
      if (isInt) n = Math.round(n);
      n = Math.min(max, Math.max(min, n));
      // 不透明度 + 目标是内部元素 → 写该叶子的覆盖表（否则会整块变透明）
      if (key === 'opacity' && leafId) {
        const now = Number(getLeafStyle(el).opacity ?? 1);
        if (n === now) { q(sel).value = n; return; }
        snapshot();
        writeLeaf('opacity', n > 0.999 ? '' : String(n));
        q(sel).value = n;
        return;
      }
      if (n === el[key]) { q(sel).value = n; return; }
      snapshot();
      updateElement(el.id, { [key]: n });
      q(sel).value = n;
    });
  }

  // —— 容器字段（A0-7）——
  bind('#sp-bg', 'container', 'background', { sid: 'bg' });
  bind('#sp-bg-txt', 'container', 'background', { sid: 'bg' });
  bind('#sp-radius', 'container', 'borderRadius', { sid: 'radius' });
  bind('#sp-pad', 'container', 'padding', { sid: 'pad' });
  bind('#sp-bd-w', 'container', 'borderWidth', { sid: 'bd' });
  bind('#sp-bd-s', 'container', 'borderStyle', { sid: 'bd' });
  bind('#sp-bd-c', 'container', 'borderColor', { sid: 'bd' });

  // 阴影：四个输入合成一个 box-shadow
  const shadowApply = () => {
    const v = composeShadow(q('#sp-sh-x').value, q('#sp-sh-y').value, q('#sp-sh-b').value, q('#sp-sh-c').value);
    write('container', 'boxShadow', v);
  };
  for (const sel of ['#sp-sh-x', '#sp-sh-y', '#sp-sh-b', '#sp-sh-c']) {
    q(sel).addEventListener('input', () => { beginOnce('shadow'); shadowApply(); });
    q(sel).addEventListener('change', () => { if (editSession !== 'shadow') snapshot(); shadowApply(); editSession = null; });
  }

  // 不透明度滑块（与 A0-6 的数值框同源字段，滑块走实时预览）
  // 经 writeOpacity：目标是内部元素时写叶子覆盖表，否则写元素级 opacity
  q('#sp-opa').addEventListener('input', () => {
    if (!cur()) return;
    beginOnce('opa');
    writeOpacity(Number(q('#sp-opa').value));
  });
  q('#sp-opa').addEventListener('change', () => {
    if (!cur()) return;
    if (editSession !== 'opa') snapshot();
    writeOpacity(Number(q('#sp-opa').value));
    editSession = null;
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

  // —— 文字字段（A0-7）——
  bind('#sp-leaf-color', 'leaf', 'color', { sid: 'leaf-color' });
  bind('#sp-leaf-size', 'leaf', 'font-size', { sid: 'leaf-size' });
  bind('#sp-leaf-line', 'leaf', 'line-height', { sid: 'leaf-line' });
  bind('#sp-leaf-ls', 'leaf', 'letter-spacing', { sid: 'leaf-ls' });
  bind('#sp-font', 'leaf', 'font-family', { sid: 'leaf-font' });
  bind('#sp-weight', 'leaf', 'font-weight', { sid: 'leaf-weight' });

  // 对齐按钮组（text-align）
  panelEl.querySelectorAll('[data-ta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = cur();
      if (!el || !leafId) return;
      const v = btn.dataset.ta;
      if (v === readLeaf('text-align')) return; // 已是该对齐方式
      snapshot();
      editSession = null;
      writeLeaf('text-align', v);
      refreshLeaf(getDoc().elements.find((e) => e.id === el.id));
    });
  });

  // 样式按钮组（粗体 / 斜体 / 下划线）——取反切换
  panelEl.querySelectorAll('[data-td]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = cur();
      if (!el || !leafId) return;
      const k = btn.dataset.td;
      const eff = getLeafStyle(el);
      const fw = String(eff['font-weight'] || '');
      const isBold = fw === '700' || fw === 'bold' || Number(fw) >= 600;
      const isItalic = /italic/.test(eff['font-style'] || '');
      const tdList = String(eff['text-decoration'] || '');
      const isUnderline = /underline/.test(tdList);
      let key;
      let value;
      if (k === 'bold') { key = 'font-weight'; value = isBold ? '400' : '700'; }
      else if (k === 'italic') { key = 'font-style'; value = isItalic ? '' : 'italic'; }
      else {
        key = 'text-decoration';
        const parts = tdList.split(/\s+/).filter((x) => x && x !== 'underline');
        value = isUnderline ? parts.join(' ') : [...parts, 'underline'].join(' ');
      }
      snapshot();
      editSession = null;
      writeLeaf(key, value);
      refreshLeaf(getDoc().elements.find((e) => e.id === el.id));
    });
  });

  function readLeaf(key) {
    const el = cur();
    if (!el || !leafId) return '';
    return getLeafStyle(el)[key] || '';
  }

  return { refresh, setLeaf: (id) => { leafId = id; } };
}
