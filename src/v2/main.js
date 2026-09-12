// PageForge v2 主入口（canvas 页编辑器垂直切片）
// v2 canvas 编辑器入口：独立于 index.html（flow 编辑器），经 /editor-v2.html 访问；
// 构建由 vite.singlefile-v2.config.mjs 单独产出（build:single 一并执行），双击 dist-single/editor-v2.html 亦可用

import {
  getDoc, onChange, onStackChange, snapshot, undo, redo,
  updateElement, addElement, removeElement, setStage,
  BLOCK_TEMPLATES, makeImage, elId,
} from './store.js';
import { renderStage, updateSelection, styleText } from './render.js';
import { initInteract } from './interact.js';
import { initTextEditing, isEditing } from './textedit.js';
import { initContextMenu } from './contextmenu.js';
import { initStylePanel } from './stylepanel.js';
import { initAIPanel } from '../ai-panel.js';
import { createCanvasAdapter } from './adapter.js';

const $ = (s) => document.querySelector(s);
const viewport = $('#v2-viewport');
const stage = $('#v2-stage');
let zoom = 1;
let sel = null;          // 主选择（手柄/样式面板/AI 上下文）
let multiSel = [];       // 选择集（含主选择；Shift 加选/框选）
const selSubs = new Set();

// —— 渲染订阅 ——
function requestRender() { renderStage(stage, getDoc(), selIds()); }
onChange(requestRender);

// —— 选择（供交互层读写 + adapter 订阅）——
// 选中态走增量更新（保 DOM 节点，双击合成依赖同一节点）
function selIds() { return sel ? [sel, ...multiSel.filter((x) => x !== sel)] : [...multiSel]; }
function afterSelChange() {
  updateSelection(stage, selIds());
  stylePanel.refresh();
}
function setSel(id) {
  sel = id;
  multiSel = id ? [id] : [];
  selSubs.forEach((f) => f(sel ? { elementId: sel } : null));
  afterSelChange();
}
function toggleSel(id) {
  if (multiSel.includes(id)) {
    multiSel = multiSel.filter((x) => x !== id);
    if (sel === id) sel = multiSel[multiSel.length - 1] || null;
  } else {
    multiSel.push(id);
    sel = id; // 后选为主
  }
  afterSelChange();
}
function setMultiIds(ids) {
  multiSel = [...ids];
  sel = multiSel[multiSel.length - 1] || null;
  if (sel) selSubs.forEach((f) => f({ elementId: sel }));
  afterSelChange();
}

// —— CanvasAdapter（AI 层在 canvas 页的执行接口）——
const canvasAdapter = createCanvasAdapter({
  getSelection: () => (sel ? { elementId: sel } : null),
  onSelect: (fn) => { selSubs.add(fn); return () => selSubs.delete(fn); },
  setSel,
});

// —— 文本编辑（先于 interact 初始化：interact 在 mousedown 里查询其状态让路）——
initTextEditing({ stageEl: stage, getDoc, updateElement, snapshot });

// —— 交互层接入 ——
initInteract({
  stageEl: stage,
  getDoc,
  getSel: () => sel,
  setSel,
  toggleSel,
  setMultiIds,
  getMulti: () => multiSel,
  updateElement,
  removeElement,
  snapshot,
  getZoom: () => zoom,
});

// —— 样式面板（容器 + 叶子，写 style/overrides）——
const stylePanel = initStylePanel({
  panelEl: $('#v2-style'),
  getDoc,
  getSel: () => sel,
  updateElement,
  snapshot,
});

// —— 右键菜单（复制/置顶/置底/删除）+ Ctrl+D 快捷复制 ——
const ctx = initContextMenu({
  stageEl: stage,
  isEditing,
  getSel: () => sel,
  setSel,
  getDoc,
  updateElement,
  addElement,
  removeElement,
  snapshot,
  elId,
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && sel) {
    e.preventDefault();
    ctx.actions.dup();
  }
});

// —— 缩放 ——
function applyZoom() {
  stage.style.transform = `scale(${zoom})`;
  $('#v2-zoom-label').textContent = Math.round(zoom * 100) + '%';
}
$('#v2-zoom-in').addEventListener('click', () => { zoom = Math.min(2, +(zoom + 0.25).toFixed(2)); applyZoom(); });
$('#v2-zoom-out').addEventListener('click', () => { zoom = Math.max(0.25, +(zoom - 0.25).toFixed(2)); applyZoom(); });
$('#v2-fit').addEventListener('click', () => {
  const d = getDoc();
  zoom = Math.min(1, +((viewport.clientWidth - 80) / d.stage.width).toFixed(2));
  applyZoom();
});

// —— 撤销 / 恢复（按钮随栈状态置灰）——
function syncUndoButtons(s) {
  $('#v2-undo').disabled = !s.hasUndo;
  $('#v2-redo').disabled = !s.hasRedo;
}
onStackChange(syncUndoButtons);
$('#v2-undo').addEventListener('click', () => undo());
$('#v2-redo').addEventListener('click', () => redo());
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// —— 添加块（首批 3 块；位置 = 已有内容下方居中，stage 向下生长——与 Adapter 放置策略一致）——
document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tpl = BLOCK_TEMPLATES[btn.dataset.add];
    if (!tpl) return;
    const el = tpl();
    el.id = elId();
    const d = getDoc();
    el.x = Math.round((d.stage.width - el.width) / 2);
    const maxY = d.elements.length ? Math.max(...d.elements.map((x) => x.y + x.height)) : 0;
    el.y = d.elements.length ? Math.round(maxY + 40) : el.y;
    if (el.y + el.height + 40 > d.stage.height) setStage({ height: el.y + el.height + 40 });
    snapshot();
    addElement(el);
    setSel(el.id);
  });
});

// —— 插入图片（URL 或本地文件转 base64 内嵌，Q5 决策）——
function addImageElement(src) {
  const el = makeImage(src);
  const d = getDoc();
  el.id = elId();
  el.x = Math.round((d.stage.width - el.width) / 2);
  const maxY = d.elements.length ? Math.max(...d.elements.map((x) => x.y + x.height)) : 0;
  el.y = d.elements.length ? Math.round(maxY + 40) : el.y;
  if (el.y + el.height + 40 > d.stage.height) setStage({ height: el.y + el.height + 40 });
  snapshot();
  addElement(el);
  setSel(el.id);
}
const imgModal = $('#v2-img-modal');
$('#v2-img-btn').addEventListener('click', () => {
  $('#v2-img-url').value = '';
  $('#v2-img-file').value = '';
  $('#v2-img-hint').textContent = '';
  imgModal.hidden = false;
});
$('#v2-img-cancel').addEventListener('click', () => { imgModal.hidden = true; });
imgModal.addEventListener('click', (e) => { if (e.target === imgModal) imgModal.hidden = true; });
$('#v2-img-ok').addEventListener('click', () => {
  const url = $('#v2-img-url').value.trim();
  if (!url) { $('#v2-img-hint').textContent = '请填写图片地址或选择本地文件'; return; }
  imgModal.hidden = true;
  addImageElement(url);
});
$('#v2-img-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { $('#v2-img-hint').textContent = '图片超过 3MB，内嵌会显著增大文档体积'; e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    imgModal.hidden = true;
    addImageElement(reader.result);
  };
  reader.readAsDataURL(file);
});

// —— stage 尺寸预设（Q2：改尺寸不缩放已放元素）——
$('#v2-preset').addEventListener('change', (e) => {
  const [w, h] = e.target.value.split('x').map(Number);
  snapshot();
  setStage({ width: w, height: h });
});

// 轻量 HTML 格式化（与 v1 同款）：标签独立成行 + 缩进，导出可读
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
function formatHtml(html, indent = 0) {
  const tokens = String(html).replace(/\r?\n\s*/g, '').match(/<[^>]+>|[^<]+/g) || [];
  let depth = indent;
  const out = [];
  for (const tk of tokens) {
    if (/^<\//.test(tk)) {
      depth = Math.max(indent, depth - 1);
      out.push('  '.repeat(depth) + tk);
    } else if (/^</.test(tk)) {
      out.push('  '.repeat(depth) + tk);
      const tag = (tk.match(/^<\s*([a-zA-Z0-9-]+)/) || [])[1];
      if (tag && !VOID_TAGS.has(tag.toLowerCase()) && !/\/>$/.test(tk)) depth++;
    } else {
      if (tk.trim()) out.push('  '.repeat(depth) + tk.trim());
    }
  }
  return out.join('\n');
}

// —— 导出（规范 §5：绝对定位 + 覆盖表合并 + 根节点等比缩放）——
export function exportHtml() {
  const d = getDoc();
  const els = d.elements.map((el) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = el.html;
    tmp.querySelectorAll('[data-id]').forEach((n) => {
      const ov = el.overrides[n.getAttribute('data-id')];
      if (ov) for (const [k, v] of Object.entries(ov)) n.style.setProperty(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v);
    });
    return `  <div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;z-index:${el.z};transform:rotate(${el.rotation}deg);opacity:${el.opacity};${styleText(el.style)}">
${formatHtml(tmp.innerHTML, 2)}
  </div>`;
  }).join('\n');
  // D1：导出高度 = max(stage.height, 元素最低点 + 40)——元素超出 stage 不被裁切
  const bottom = d.elements.length ? Math.max(...d.elements.map((e) => e.y + e.height)) : 0;
  const exportH = Math.max(d.stage.height, bottom + 40);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${d.name}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#e5e5e5}</style>
</head>
<body>
<div id="pf-stage" style="position:relative;width:${d.stage.width}px;height:${exportH}px;margin:0 auto;background:${d.stage.background};overflow:hidden;transform-origin:top center;">
${els}
</div>
<script>(function(){var s=document.getElementById('pf-stage');function f(){s.style.transform='scale('+Math.min(1,document.documentElement.clientWidth/${d.stage.width})+')';}addEventListener('resize',f);f();})();</script>
</body>
</html>`;
}
$('#v2-export').addEventListener('click', () => {
  const html = exportHtml();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (getDoc().name || 'canvas') + '.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// —— 取消选择：点击画布外区域（深色边距/面板外）即取消；AI 面板/弹窗/工具栏内点击不影响 ——
document.addEventListener('mousedown', (e) => {
  if (isEditing()) return;
  if (e.target.closest('#ai-panel, .modal-mask, .v2-ctx, #v2-bar, #v2-style')) return;
  if (!e.target.closest('#v2-stage') && sel) setSel(null);
});

// —— 轻量 toast（AI 面板依赖）——
const toastEl = document.createElement('div');
toastEl.id = 'v2-toast';
document.body.appendChild(toastEl);
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// —— 测试/控制台接口 ——
window.__v2 = { getDoc, exportHtml, snapshot, undo, redo, setSel, adapter: canvasAdapter, ctx };

// —— AI 面板（CanvasAdapter：拼块/改样式/答疑；配色/诊断/初稿按能力门控隐藏）——
initAIPanel({ editor: null, toast, adapter: canvasAdapter });

// —— 启动 ——
requestRender();
applyZoom();
$('#v2-fit').click();
