// PageForge v2 主入口（canvas 页编辑器垂直切片）
// v1 完全不动：本入口独立于 index.html，通过 /editor-v2.html 访问（仅 dev，暂不入构建）

import {
  getDoc, onChange, snapshot, undo, redo,
  updateElement, addElement, removeElement, setStage,
  BLOCK_TEMPLATES, elId,
} from './store.js';
import { renderStage, styleText } from './render.js';
import { initInteract } from './interact.js';
import { createCanvasAdapter } from './adapter.js';

const $ = (s) => document.querySelector(s);
const viewport = $('#v2-viewport');
const stage = $('#v2-stage');
let zoom = 1;
let sel = null;
const selSubs = new Set();

// —— 渲染订阅 ——
function requestRender() { renderStage(stage, getDoc(), sel); }
onChange(requestRender);

// —— 选择（供交互层读写 + adapter 订阅）——
function setSel(id) {
  sel = id;
  selSubs.forEach((f) => f(sel ? { elementId: sel } : null));
  requestRender();
}

// —— CanvasAdapter（AI 层在 canvas 页的执行接口）——
const canvasAdapter = createCanvasAdapter({
  getSelection: () => (sel ? { elementId: sel } : null),
  onSelect: (fn) => { selSubs.add(fn); return () => selSubs.delete(fn); },
});

// —— 交互层接入 ——
initInteract({
  stageEl: stage,
  getDoc,
  getSel: () => sel,
  setSel,
  updateElement,
  removeElement,
  snapshot,
  getZoom: () => zoom,
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

// —— 撤销 / 恢复 ——
$('#v2-undo').addEventListener('click', () => undo());
$('#v2-redo').addEventListener('click', () => redo());
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// —— 添加块（首批 3 块；位置 = 已有内容下方居中）——
document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tpl = BLOCK_TEMPLATES[btn.dataset.add];
    if (!tpl) return;
    const el = tpl();
    el.id = elId();
    const d = getDoc();
    el.x = Math.round((d.stage.width - el.width) / 2);
    const maxY = d.elements.length ? Math.max(...d.elements.map((x) => x.y + x.height)) : 0;
    el.y = maxY ? Math.min(maxY + 40, d.stage.height - 60) : el.y;
    snapshot();
    addElement(el);
    setSel(el.id);
  });
});

// —— stage 尺寸预设（Q2：改尺寸不缩放已放元素）——
$('#v2-preset').addEventListener('change', (e) => {
  const [w, h] = e.target.value.split('x').map(Number);
  snapshot();
  setStage({ width: w, height: h });
});

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
    return `  <div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;z-index:${el.z};transform:rotate(${el.rotation}deg);opacity:${el.opacity};${styleText(el.style)}">${tmp.innerHTML}</div>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${d.name}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#e5e5e5}</style>
</head>
<body>
<div id="pf-stage" style="position:relative;width:${d.stage.width}px;height:${d.stage.height}px;margin:0 auto;background:${d.stage.background};overflow:hidden;transform-origin:top center;">
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

// —— 测试/控制台接口 ——
window.__v2 = { getDoc, exportHtml, snapshot, undo, redo, setSel, adapter: canvasAdapter };

// —— 启动 ——
requestRender();
applyZoom();
$('#v2-fit').click();
