// PageForge v2 主入口（canvas 页编辑器垂直切片）
// v2 canvas 编辑器入口：独立于 index.html（flow 编辑器），经 /editor-v2.html 访问；
// 构建由 vite.singlefile-v2.config.mjs 单独产出（build:single 一并执行），双击 dist-single/editor-v2.html 亦可用

import {
  getDoc, getDocs, getCurId, onChange, onStackChange, snapshot, undo, redo,
  updateElement, updateElements, addElement, removeElement, setStage, addDoc, switchDoc, removeDoc,
  placeElement, BLOCK_TEMPLATES, makeImage, elId, applyStarterToCurrentDoc, applyTheme, themeList,
  makeElementFromHTML, onSaveStatus,
} from './store.js';
import { STARTERS } from './starters.js';
import { alignElements, lockAxis } from './align.js';
import { createClipboard } from './clipboard.js';
import { initAssetPanel, iconToHtml, svgToDataUrl } from './assetpanel.js';
import { initLeafInteract } from './leafinteract.js';
import { snapAngle } from './snap.js';
import { blocks } from '../blocks.js';
import { renderStage, updateSelection, previewGeom, previewLeafTransform } from './render.js';
import { initInteract } from './interact.js';
import { initTextEditing, isEditing } from './textedit.js';
import { initPan } from './pan.js';
import { initContextMenu } from './contextmenu.js';
import { initStylePanel } from './stylepanel.js';
import { initAIPanel } from '../ai-panel.js';
import { createCanvasAdapter } from './adapter.js';
import { canvasStageInner, canvasAssets, formatHtml } from './export-canvas.js';
import { escHtml } from '../esc.js';

const $ = (s) => document.querySelector(s);
const viewport = $('#v2-viewport');
const stage = $('#v2-stage');
let zoom = 1;
let sel = null;          // 主选择（手柄/样式面板/AI 上下文）
let multiSel = [];       // 选择集（含主选择；Shift 加选/框选）
const selSubs = new Set();

// —— 渲染订阅（文档切换时清空旧页的选择）——
let renderedDocId = null;
function requestRender() {
  const d = getDoc();
  if (renderedDocId !== d.id) {
    renderedDocId = d.id;
    sel = null;
    multiSel = [];
    commitIfEditingSafe();
  }
  renderStage(stage, d, selIds());
  renderEmptyHint(d.elements.length === 0); // A0-3：空白页要有引导，不能是一片虚无
  paintLeafSel(); // renderStage 会全量重建 DOM，叶子高亮必须每次重画
  // 画布背景色回声（A0-6）：只在纯 hex 时回填（渐变背景 color input 表达不了）
  const bgInput = $('#v2-stage-bg');
  const bg = (d.stage && d.stage.background) || '#ffffff';
  if (bgInput && /^#[0-9a-fA-F]{6}$/.test(bg) && bgInput.value !== bg) bgInput.value = bg;
  // 画布尺寸预设回声：应用模板/撤销后尺寸会变，select 必须跟上（否则显示的还是旧尺寸）
  const presetSel = $('#v2-preset');
  if (presetSel && d.stage) {
    const want = `${d.stage.width}x${d.stage.height}`;
    if (presetSel.value !== want && [...presetSel.options].some((o) => o.value === want)) presetSel.value = want;
  }
}
onChange(requestRender);

// 空画布引导（A0-3）：只在没有元素时显示；renderStage 会重建 stage，故每次渲染后复查
function renderEmptyHint(show) {
  const el = stage.querySelector('#v2-empty');
  if (!show) { if (el) el.remove(); return; }
  if (el) return;
  const hint = document.createElement('div');
  hint.id = 'v2-empty';
  hint.innerHTML = '<p>这里还是一张白纸</p><small>点上方「模板」选一个开始，或用「添加」放一个块进来</small>';
  stage.appendChild(hint);
}

// 切页时若在文字编辑中，静默提交（不弹快照）
function commitIfEditingSafe() { try { commitIfEditing(); } catch { /* 忽略 */ } }

// —— 选择（供交互层读写 + adapter 订阅）——
// 选中态走增量更新（保 DOM 节点，双击合成依赖同一节点）
function selIds() { return sel ? [sel, ...multiSel.filter((x) => x !== sel)] : [...multiSel]; }
function afterSelChange() {
  updateSelection(stage, selIds());
  stylePanel.refresh();
  paintLeafSel();
}
function setSel(id) {
  sel = id;
  multiSel = id ? [id] : [];
  leafSel = null;            // 换元素 → 退出"深入选中叶子"
  stylePanel.setLeaf(null);
  selSubs.forEach((f) => f(sel ? { elementId: sel } : null));
  afterSelChange();
}

// —— 深入选中块内叶子（用户报的"复合模块下的按钮选不上/改不了"）——
// 两个入口：① Ctrl/⌘+点击  ② 右键菜单「选中这个内部元素」——后者对小白更可发现
let leafSel = null;
let leafInteract = null; // 块内元素的移动/旋转浮层控制器（初始化后赋值；paintLeafSel 可能先被调用）
function paintLeafSel() {
  stage.querySelectorAll('.v2-leaf-sel').forEach((n) => n.classList.remove('v2-leaf-sel'));
  if (!sel || !leafSel) { leafInteract?.hide(); return; }
  const host = stage.querySelector(`[data-el-id="${sel}"]`);
  const leaf = host && host.querySelector(`[data-id="${leafSel}"]`);
  if (leaf) leaf.classList.add('v2-leaf-sel');
  leafInteract?.place(); // 浮层（移动 + 旋转手柄）
}
/** 选中 elId 内的 leafId；重复进入同一个叶子则退回整块（可来回切，不会"进去出不来"） */
function selectLeaf(elId, leafId) {
  if (!elId) return;
  const same = sel === elId && leafSel === leafId;
  sel = elId;
  multiSel = [elId];
  leafSel = same ? null : (leafId || null);
  stylePanel.setLeaf(leafSel);
  selSubs.forEach((f) => f({ elementId: elId }));
  afterSelChange();
  return leafSel;
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
  // 带上 leafSel：深入选中块内元素时（Ctrl+点击 / 右键「选中这个内部元素」），
  // AI 必须知道"用户选的是模块里的那个按钮"，否则它只会看到整个模块
  getSelection: () => (sel ? { elementId: sel, leafId: leafSel } : null),
  onSelect: (fn) => { selSubs.add(fn); return () => selSubs.delete(fn); },
  setSel,
});

// —— 文本编辑（先于 interact 初始化：interact 在 mousedown 里查询其状态让路）——
const textEditor = initTextEditing({ stageEl: stage, getDoc, updateElement, snapshot });

// —— 剪贴板（A0-10）：Ctrl+C / V / X / A；Alt+拖拽复制（A0-11）——
const clipboard = createClipboard({
  getDoc,
  addElement,
  removeElement,
  snapshot,
  setSel,
  setMulti: setMultiIds,
  getMulti: () => multiSel,
  getSel: () => sel,
  elId,
});

// Alt+拖拽复制：克隆体留在原位，返回新 id 交由交互层继续拖动（原件不动）
function duplicateForDrag(srcId) {
  const src = getDoc().elements.find((e) => e.id === srcId);
  if (!src || src.locked) return null;
  const copy = structuredClone(src);
  copy.id = elId();
  copy.z = Math.max(0, ...getDoc().elements.map((e) => e.z)) + 1;
  copy.locked = false;
  addElement(copy);
  return copy.id;
}

// —— 画布平移（A0-2）：Space+拖拽 / 中键拖拽（捕获阶段拦截，优先于元素拖拽与框选）——
initPan({ viewportEl: viewport, isEditing });

// —— 交互层接入 ——
const interact = initInteract({
  stageEl: stage,
  getDoc,
  getSel: () => sel,
  setSel,
  toggleSel,
  setMultiIds,
  getMulti: () => multiSel,
  updateElement,
  updateElements,
  preview: (id, patch) => previewGeom(stage, id, patch), // 地雷二：拖拽轻路径
  removeElement,
  snapshot,
  getZoom: () => zoom,
  onDuplicate: duplicateForDrag,
  onDeepSelect: selectLeaf,
});

// —— 块内元素的移动 / 旋转（选中叶子后出现浮层手柄：拖框移动、拖圆点旋转）——
leafInteract = initLeafInteract({
  stageEl: stage,
  getSel: () => sel,
  getLeaf: () => leafSel,
  getDoc,
  updateElement,
  preview: (elId, lfId, value) => previewLeafTransform(stage, elId, lfId, value), // 地雷二：叶子拖拽轻路径
  snapshot,
  getZoom: () => zoom,
  snapAngle,
  toast,
});

// —— 素材库（A1-1）：图标 / 插画 / 文案 插入为独立画布元素 ——
// 插入位置取"当前可视区中心"并夹进画布：否则新元素可能落在画布外，用户以为没插进去
function viewportCenter() {
  const vr = viewport.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const z = zoom || 1;
  return { x: (vr.left - sr.left) / z + vr.width / z / 2, y: (vr.top - sr.top) / z + vr.height / z / 2 };
}
function insertCentered(el) {
  const c = viewportCenter();
  const d = getDoc();
  el.x = Math.round(Math.max(0, Math.min(c.x - el.width / 2, Math.max(0, d.stage.width - el.width))));
  el.y = Math.round(Math.max(0, Math.min(c.y - el.height / 2, Math.max(0, d.stage.height - el.height))));
  el.z = Math.max(0, ...d.elements.map((e) => e.z)) + 1;
  snapshot();
  addElement(el);
  setSel(el.id);
}
const assetPanel = initAssetPanel({
  toast,
  onInsertIcon: (ic) => {
    const el = makeElementFromHTML(iconToHtml(ic.svg), { w: 56 });
    el.height = 56;              // 图标是正方形，覆盖按文字估算的高度
    insertCentered(el);
  },
  onInsertImage: (im) => {
    const el = makeImage(svgToDataUrl(im.svg));
    el.width = 320; el.height = 240;
    insertCentered(el);
  },
  onInsertText: (t) => insertCentered(makeElementFromHTML(t.html, { w: 720 })),
});
$('#v2-asset-btn')?.addEventListener('click', () => assetPanel.open());

// —— 样式面板（容器 + 叶子 + 动效，写 style/overrides/motion）——
const stylePanel = initStylePanel({
  panelEl: $('#v2-style'),
  getDoc,
  getSel: () => sel,
  updateElement,
  snapshot,
  toast,
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
  getZoom: () => zoom,
  openImagePicker: (o) => openImagePicker(o),
  openLinkEditor: (o) => openLinkEditor(o),
  removeLink: (elementId, leafId) => removeLinkFrom(elementId, leafId),
  onDeepSelect: selectLeaf,
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && sel) {
    e.preventDefault();
    ctx.actions.dup();
  }
});

// —— 剪贴板与 Enter 进编辑（A0-10 / A0-11）——
// 文字编辑中、或焦点在输入控件里时一律不抢（否则会选不中文字、打不出字）
function inTextInput(t) {
  const tag = (t?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!t?.isContentEditable;
}
document.addEventListener('keydown', (e) => {
  if (isEditing() || inTextInput(e.target)) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = String(e.key || '').toLowerCase();
  if (mod && k === 'c') {
    const n = clipboard.copy();
    if (n) { e.preventDefault(); toast(`已复制 ${n} 个元素（可跨页粘贴）`); }
  } else if (mod && k === 'v') {
    const n = clipboard.paste();
    if (n) { e.preventDefault(); toast(`已粘贴 ${n} 个元素`); }
  } else if (mod && k === 'x') {
    const n = clipboard.cut();
    if (n) { e.preventDefault(); toast(`已剪切 ${n} 个元素（Ctrl+Z 可恢复）`); }
  } else if (mod && k === 'a') {
    const ids = clipboard.selectAllIds();
    if (ids.length) { e.preventDefault(); setMultiIds(ids); toast(`已全选 ${ids.length} 个元素`); }
  } else if (e.key === 'Enter' && sel) {
    if (textEditor.startEditing(sel)) e.preventDefault();
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
    placeElement(el);
    snapshot();
    addElement(el);
    setSel(el.id);
  });
});

// —— 起步模板（A0-3）：替换当前页内容，一步可撤销 ——
const tplModal = $('#v2-tpl-modal');
const tplGrid = $('#v2-tpl-grid');

function openStarterModal() {
  tplGrid.innerHTML = STARTERS.map((s) => `
    <div class="v2-tpl-card" data-tpl="${s.id}">
      <div class="v2-tpl-thumb" style="background:${s.id === 'poster' ? 'linear-gradient(135deg,#18181b,#3f3f46)' : 'linear-gradient(135deg,#e0e7ff,#f5f5f7)'}"></div>
      <b>${escHtml(s.name)}</b><span>${escHtml(s.desc)}</span>
    </div>`).join('');
  tplModal.hidden = false;
}

function applyStarter(starterId) {
  const st = STARTERS.find((s) => s.id === starterId);
  if (!st) return;
  snapshot(); // 模板替换 = 一步撤销
  applyStarterToCurrentDoc(st.build(), st.name);
  setSel(null);
  toast(`已应用「${st.name}」模板 — Ctrl+Z 可撤销`);
  requestAnimationFrame(() => { try { $('#v2-fit').click(); } catch { /* 忽略 */ } });
}

$('#v2-tpl-btn').addEventListener('click', openStarterModal);
$('#v2-tpl-cancel').addEventListener('click', () => { tplModal.hidden = true; });
tplModal.addEventListener('click', (e) => { if (e.target === tplModal) tplModal.hidden = true; });
tplGrid.addEventListener('click', (e) => {
  const card = e.target.closest('[data-tpl]');
  if (!card) return;
  tplModal.hidden = true;
  applyStarter(card.dataset.tpl);
});

// —— 一键换肤（A0-4）：复用 v1 的 5 套主题色板 ——
const themeModal = $('#v2-theme-modal');
const themeGrid = $('#v2-theme-grid');

function openThemeModal() {
  const cur = getDoc().themeId;
  themeGrid.innerHTML = themeList.map((t) => `
    <div class="v2-theme-card" data-theme="${t.id}">
      <div class="v2-theme-swatches">${t.icon.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
      <b>${escHtml(t.name)}${cur === t.id ? ' ✓' : ''}</b><span>${escHtml(t.desc)}</span>
    </div>`).join('');
  themeModal.hidden = false;
}

function useTheme(themeId) {
  snapshot(); // 换肤 = 一步撤销
  const res = applyTheme(themeId);
  const t = themeList.find((x) => x.id === themeId);
  toast(t ? `已换成「${t.name}」— 改动 ${res.changed} 个元素，Ctrl+Z 可撤销` : '已应用主题');
}

$('#v2-theme-btn').addEventListener('click', openThemeModal);
$('#v2-theme-cancel').addEventListener('click', () => { themeModal.hidden = true; });
themeModal.addEventListener('click', (e) => { if (e.target === themeModal) themeModal.hidden = true; });
themeGrid.addEventListener('click', (e) => {
  const card = e.target.closest('[data-theme]');
  if (!card) return;
  themeModal.hidden = true;
  useTheme(card.dataset.theme);
});

// —— 对齐与分布（A0-5）：单选对画布，多选对选区；一次对齐 = 一步撤销 ——
document.querySelectorAll('[data-align]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const ids = selIds();
    if (!ids.length) { toast('先选中元素再对齐'); return; }
    const d = getDoc();
    const els = ids
      .map((id) => d.elements.find((e) => e.id === id))
      .filter(Boolean)
      .filter((e) => !e.locked);
    if (!els.length) { toast('选中的元素已锁定'); return; }
    const moves = alignElements(els, d.stage, btn.dataset.align);
    if (!moves.length) { toast('已经对齐好了'); return; }
    snapshot();
    for (const m of moves) updateElement(m.id, { x: m.x, y: m.y });
    toast(`已对齐 ${moves.length} 个元素 — Ctrl+Z 可撤销`);
  });
});

// —— 插入图片（URL 或本地文件转 base64 内嵌，Q5 决策）——
// 两种模式：insert（可带 x/y 指定落点）/ replace（替换目标元素内第一个 <img> 的 src）
let imgMode = { mode: 'insert' };
const imgModal = $('#v2-img-modal');

function addImageElement(src, x, y) {
  const el = makeImage(src);
  el.id = elId();
  if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) {
    const d = getDoc();
    // 夹进画布内：右键点可能在边缘/页脚下方，别让图片落在画布外找不回来
    el.x = Math.round(Math.max(0, Math.min(x, Math.max(0, d.stage.width - el.width))));
    el.y = Math.round(Math.max(0, Math.min(y, Math.max(0, d.stage.height - el.height))));
  } else {
    placeElement(el); // 工具栏按钮进入（无坐标）：放到内容下方
  }
  snapshot();
  addElement(el);
  setSel(el.id);
}

// 更换图片：优先按右键命中的那张叶子换；命中不到就换元素内第一张 <img>
// 块降级来的画布元素（v1 块）图片位是内部 div/img，元素 type 不是 image —— 只看 type 会漏
function replaceImageIn(elementId, src, leafId) {
  const el = getDoc().elements.find((e) => e.id === elementId);
  if (!el) return { ok: false, reason: '元素不存在' };
  const tmp = document.createElement('div');
  tmp.innerHTML = el.html;
  let img = null;
  if (leafId) {
    const leaf = tmp.querySelector(`[data-id="${leafId}"]`);
    img = (leaf && (leaf.tagName === 'IMG' ? leaf : leaf.querySelector('img'))) || null;
  }
  if (!img) img = tmp.querySelector('img');
  if (!img) return { ok: false, reason: '这个元素里没有可替换的图片' };
  const total = tmp.querySelectorAll('img').length;
  snapshot();
  img.setAttribute('src', src);
  updateElement(elementId, { html: tmp.innerHTML });
  return { ok: true, total };
}

function openImagePicker(opts = {}) {
  imgMode = opts && opts.mode ? opts : { mode: 'insert' };
  const title = imgModal.querySelector('h3');
  if (title) title.textContent = imgMode.mode === 'replace' ? '更换图片' : '插入图片';
  $('#v2-img-url').value = '';
  $('#v2-img-file').value = '';
  $('#v2-img-hint').textContent = '';
  imgModal.hidden = false;
}

function applyImage(src) {
  if (imgMode.mode === 'replace') {
    const res = replaceImageIn(imgMode.elementId, src, imgMode.leafId);
    if (!res.ok) toast(res.reason);
    else if (res.total > 1) toast(`已更换图片（该元素内有 ${res.total} 张，换的是第一张）`);
    else toast('已更换图片');
  } else {
    addImageElement(src, imgMode.x, imgMode.y);
    toast(typeof imgMode.x === 'number' ? '已在右键位置插入图片' : '已插入图片（放在内容下方）');
  }
}

$('#v2-img-btn').addEventListener('click', () => openImagePicker({ mode: 'insert' }));
$('#v2-img-cancel').addEventListener('click', () => { imgModal.hidden = true; });
imgModal.addEventListener('click', (e) => { if (e.target === imgModal) imgModal.hidden = true; });
$('#v2-img-ok').addEventListener('click', () => {
  const url = $('#v2-img-url').value.trim();
  if (!url) { $('#v2-img-hint').textContent = '请填写图片地址或选择本地文件'; return; }
  imgModal.hidden = true;
  applyImage(url);
});
$('#v2-img-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { $('#v2-img-hint').textContent = '图片超过 3MB，内嵌会显著增大文档体积'; e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => { imgModal.hidden = true; applyImage(reader.result); };
  reader.readAsDataURL(file);
});

// —— 超链接：设置 / 修改 / 移除（由右键菜单调用）——
const linkModal = $('#v2-link-modal');
let linkTarget = null;

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:|#|\.\/|\/)/i.test(s)) return s;
  return 'https://' + s;
}

function findLink(html, leafId) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const a = (leafId && tmp.querySelector(`a[data-id="${leafId}"]`)) || tmp.querySelector('a');
  return { tmp, a };
}

function openLinkEditor({ elementId, leafId }) {
  const el = getDoc().elements.find((e) => e.id === elementId);
  if (!el) return;
  linkTarget = { elementId, leafId };
  const { a } = findLink(el.html, leafId);
  const editing = !!a;
  $('#v2-link-title').textContent = editing ? '修改链接' : '设置超链接';
  $('#v2-link-url').value = editing ? (a.getAttribute('href') || '') : '';
  $('#v2-link-hint').textContent = editing ? '' : '会把这一段文字变成可点击的链接。';
  linkModal.hidden = false;
  setTimeout(() => { try { $('#v2-link-url').focus(); } catch { /* 忽略 */ } }, 30);
}

// 应用链接：已有 <a> → 改 href；没有 → 把目标叶子（或首个文字叶子）包成 <a>
function applyLink(url) {
  const t = linkTarget;
  const el = t && getDoc().elements.find((e) => e.id === t.elementId);
  if (!el) return false;
  const href = normalizeUrl(url);
  if (!href) return false;
  const { tmp, a } = findLink(el.html, t.leafId);
  if (a) {
    a.setAttribute('href', href);
  } else {
    const leaf = (t.leafId && tmp.querySelector(`[data-id="${t.leafId}"]`))
      || tmp.querySelector('p[data-id], h1[data-id], h2[data-id], h3[data-id], h4[data-id], span[data-id]');
    if (!leaf) return false;
    const link = document.createElement('a');
    const did = leaf.getAttribute('data-id');
    if (did) link.setAttribute('data-id', did);
    link.setAttribute('href', href);
    link.setAttribute('style', (leaf.getAttribute('style') || '') + 'text-decoration:none;color:inherit;cursor:pointer;');
    link.innerHTML = leaf.innerHTML;
    leaf.replaceWith(link);
  }
  snapshot();
  updateElement(t.elementId, { html: tmp.innerHTML });
  return true;
}

function removeLinkFrom(elementId, leafId) {
  const el = getDoc().elements.find((e) => e.id === elementId);
  if (!el) return false;
  const { tmp, a } = findLink(el.html, leafId);
  if (!a) return false;
  const span = document.createElement('span');
  span.innerHTML = a.innerHTML;
  const did = a.getAttribute('data-id');
  if (did) span.setAttribute('data-id', did);
  const st = a.getAttribute('style');
  if (st) span.setAttribute('style', st.replace(/text-decoration\s*:[^;]*;?/gi, ''));
  a.replaceWith(span);
  snapshot();
  updateElement(elementId, { html: tmp.innerHTML });
  return true;
}

$('#v2-link-cancel').addEventListener('click', () => { linkModal.hidden = true; });
linkModal.addEventListener('click', (e) => { if (e.target === linkModal) linkModal.hidden = true; });
$('#v2-link-ok').addEventListener('click', () => {
  const url = $('#v2-link-url').value.trim();
  if (!url) { $('#v2-link-hint').textContent = '请填写链接地址，或点「移除链接」'; return; }
  if (applyLink(url)) { linkModal.hidden = true; toast('已设置链接'); }
  else $('#v2-link-hint').textContent = '这一段里没有可加链接的文字';
});
$('#v2-link-remove').addEventListener('click', () => {
  const t = linkTarget;
  if (t && removeLinkFrom(t.elementId, t.leafId)) { linkModal.hidden = true; toast('已移除链接'); }
  else { linkModal.hidden = true; }
});

// —— stage 尺寸预设（Q2：改尺寸不缩放已放元素）——
$('#v2-preset').addEventListener('change', (e) => {
  const [w, h] = e.target.value.split('x').map(Number);
  snapshot();
  setStage({ width: w, height: h });
});

// 画布背景色（A0-6）：常驻工具栏，不依赖是否选中元素
$('#v2-stage-bg').addEventListener('change', (e) => {
  snapshot();
  setStage({ background: e.target.value });
});

// —— 导出（规范 §5：绝对定位 + 覆盖表合并 + 根节点等比缩放）——
export function exportHtml() {
  const d = getDoc();
  const els = canvasStageInner(d);
  // D1：导出高度 = max(stage.height, 元素最低点 + 40)——元素超出 stage 不被裁切
  const bottom = d.elements.length ? Math.max(...d.elements.map((e) => e.y + e.height)) : 0;
  const exportH = Math.max(d.stage.height, bottom + 40);
  const assets = canvasAssets([d]);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(d.name)}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#e5e5e5}</style>${assets.css}
</head>
<body>
<div id="pf-stage" style="position:relative;width:${d.stage.width}px;height:${exportH}px;margin:0 auto;background:${d.stage.background};transform-origin:top center;">
${els}
</div>
${assets.js}
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

// —— 页面切换 / 新建 / 删除（canvas 多页）——
function refreshPageSel() {
  const selEl = $('#v2-page-sel');
  selEl.innerHTML = getDocs().map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
  selEl.value = getCurId();
}
onChange(refreshPageSel);
$('#v2-page-sel').addEventListener('change', (e) => switchDoc(e.target.value));
$('#v2-page-add').addEventListener('click', () => {
  addDoc();
  toast('已新建画布页，从左边工具栏添加内容');
});
$('#v2-page-del').addEventListener('click', () => {
  if (getDocs().length <= 1) { toast('至少保留一个页面'); return; }
  const d = getDoc();
  openConfirmCanvas('删除画布页', `将删除「${d.name}」，不可撤销。`, () => removeDoc(d.id));
});
// 通用确认（v2 简版）
function openConfirmCanvas(title, msg, onOk) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.style.zIndex = 65000;
  // 审计 BUG-18：title/msg 走 textContent（内容含 HTML 字符时不被解析）
  const box = document.createElement('div');
  box.className = 'modal';
  box.style.width = '330px';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  const p = document.createElement('p');
  p.textContent = msg;
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  actions.innerHTML = '<button class="btn ghost" data-c>取消</button><button class="btn primary" data-k>确定</button>';
  box.append(h3, p, actions);
  mask.appendChild(box);
  document.body.appendChild(mask);
  mask.querySelector('[data-c]').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  mask.querySelector('[data-k]').addEventListener('click', () => { mask.remove(); onOk(); });
}

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

// —— 保存失败可见警告（数据安全）：localStorage 写满时改动会被静默丢弃，必须让用户看见 ——
// 提示常驻直到保存恢复（成功一次自动撤下）；关闭按钮只隐藏本次警告。
let saveWarnEl = null;
function showSaveWarn() {
  if (saveWarnEl) return;
  saveWarnEl = document.createElement('div');
  saveWarnEl.id = 'v2-save-warn';
  saveWarnEl.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:92000;' +
    'display:flex;align-items:center;gap:12px;max-width:640px;padding:10px 14px;border-radius:10px;' +
    'background:#7f1d1d;color:#fff;font-size:13px;line-height:1.6;box-shadow:0 10px 30px rgba(0,0,0,.5);';
  const msg = document.createElement('span');
  msg.textContent = '⚠ 自动保存失败（浏览器存储已满）——继续编辑可能丢失改动。请立即用右上角「导出 HTML」备份。';
  const close = document.createElement('button');
  close.textContent = '✕';
  close.title = '关闭提示';
  close.style.cssText = 'flex:none;background:none;border:none;color:#fecaca;font-size:14px;cursor:pointer;padding:2px 4px;';
  close.addEventListener('click', hideSaveWarn);
  saveWarnEl.append(msg, close);
  document.body.appendChild(saveWarnEl);
}
function hideSaveWarn() {
  if (saveWarnEl) { saveWarnEl.remove(); saveWarnEl = null; }
}
onSaveStatus((st) => { if (st.ok) hideSaveWarn(); else showSaveWarn(); });

// —— 测试/控制台接口 ——
window.__v2 = { getDoc, getDocs, getCurId, exportHtml, snapshot, undo, redo, updateElement, setSel, setMulti: setMultiIds, adapter: canvasAdapter, ctx, blocks, interact, lockAxis, selectLeaf, snapAngle, leafInteract };

// —— AI 面板（CanvasAdapter：拼块/改样式/答疑；配色/诊断/初稿按能力门控隐藏）——
initAIPanel({ editor: null, toast, adapter: canvasAdapter });

// —— 启动 ——
requestRender();
applyZoom();
$('#v2-fit').click();
