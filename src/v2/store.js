import { STORAGE_KEYS } from '../storage-keys.js';
import { elId, T } from './factory.js';
import { STARTERS } from './starters.js';
import { applyThemeToDoc, themeList } from './theme-apply.js';
import { pushFrame } from './undo-stack.mjs';
import { BLOCK_TEMPLATES, CANVAS_BY_BLOCK, NATIVE_BLOCK_IDS } from './block-templates.js';
// v2 数据层：canvas 页文档 + 全量快照撤销（Q6：snapshot，200 帧 + 50MB 双预算）
// 规范见 docs/v2/canvas-schema-draft.md（v1.0 实现基线）
// 原生块模板见 block-templates.js（D1）

const DOC_KEY = 'pageforge-v2-doc';

// 元素工厂（elId / T）与 ID 生成器已抽到 factory.js——starters.js 也要用，避免循环依赖。
// 这里 re-export，保持既有 import 路径不变。
export { elId, T };
export { BLOCK_TEMPLATES, CANVAS_BY_BLOCK, NATIVE_BLOCK_IDS };

// 图片元素：src 可为 base64（离线可用，Q5 决策）或 URL
// 注意：圆角/裁剪放在 img 自身（容器不 overflow:hidden）——容器裁剪会把伸出边缘的缩放/旋转手柄一起裁掉（实际踩过的 bug）
export function makeImage(src, w = 480, h = 320) {
  return T('image', 120, 120, w, h, 4,
    { background: '#f1f5f9' },
    `<img src="${src}" alt="" data-id="img_main" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:12px;">`);
}

// —— 任意 HTML → 画布元素（D1a 最小可用降级）——
// 用于：v1 的 51 个块（未做 canvas 原生适配的那批）、AI 自由生成的 HTML。
// 说明：内容仍是流式 HTML（元素内部保留 grid 等排版），只是外层套上绝对定位框；
//       高度按内容粗估（宁可偏高，用户可在属性面板调小），溢出渲染层已有琥珀色提示。
export function estimateHeight(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, '');
  const hasImg = /<img/i.test(String(html || ''));
  const base = hasImg ? 320 : 180;
  return Math.max(base, Math.min(1400, Math.round(text.length * 1.7 + base)));
}

// 块 HTML → 画布元素时为内层可改元素补叶子标记。
// v1 的 51 个块（blocks.js）一个 data-id 都没有：不补的话块内按钮/标题既选不中也改不了。
// 只标"语义叶子"（标题/段落/链接/按钮/图片），跳过 div/span 这类纯容器，避免叶子下拉塞几十项。
const LEAF_TAGS = 'a, button, img, h1, h2, h3, h4, h5, h6, p';
export function annotateLeaves(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '');
  let n = 0;
  tmp.querySelectorAll(LEAF_TAGS).forEach((node) => {
    if (node.hasAttribute('data-id')) return; // 已有标记（v2 原生块）不覆盖
    node.setAttribute('data-id', 'pf' + (++n));
  });
  return tmp.innerHTML;
}

export function makeElementFromHTML(html, opts = {}) {
  const { x = 120, y = 0, w = 1200, z = 1, type = 'card' } = opts;
  const marked = annotateLeaves(html);
  return T(type, x, y, w, estimateHeight(marked), z, {}, marked);
}

// 起步模板构建（A0-3）：未知 id 兜底为空白画布
function buildStarter(starterId) {
  const st = STARTERS.find((s) => s.id === starterId) || STARTERS.find((s) => s.id === 'blank');
  return st ? st.build() : { stage: { width: 1440, height: 900, background: '#ffffff' }, elements: [] };
}

// 首屏文档默认用「落地页」模板：新用户打开就有可改的东西，而不是三个互不相干的裸块。
export function freshDoc(name = '首页画布', starterId = 'landing') {
  const built = buildStarter(starterId);
  return {
    id: newId(),
    name,
    layoutMode: 'canvas',
    stage: { ...built.stage },
    elements: built.elements,
  };
}

// —— 多文档存储（canvas 页可多页，混排导出的基础）——
// 存储：{ docs: [doc...], curId }；旧单文档 key 自动迁移
const DOCS_KEY = STORAGE_KEYS.V2_DOCS;
const OLD_KEY = STORAGE_KEYS.V2_DOC_LEGACY;
let docs = [];
let curId = null;
const subs = new Set();

let docIdSeq = 0;
function newId() { return 'pg_' + Date.now().toString(36) + (++docIdSeq); }

// 懒迁移：早期版本插入的块 HTML 没有叶子标记（v1 的 51 个块一个 data-id 都没有），
// 导致块内按钮/标题既选不中也改不了。加载时给"含语义叶子却一个标记都没有"的元素补一次。
// 只加属性、不动内容与样式；已有标记的（v2 原生块）原样保留。
function migrateLeaves(list) {
  for (const d of list) {
    for (const el of (d.elements || [])) {
      const html = String(el.html || '');
      if (!html || html.indexOf('data-id=') >= 0) continue;
      if (!/<(a|button|img|h[1-6]|p)\b/i.test(html)) continue;
      el.html = annotateLeaves(html);
    }
  }
  return list;
}

function loadState() {
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.docs) && s.docs.length) return { docs: migrateLeaves(s.docs), curId: s.curId || s.docs[0].id };
    }
    // 旧单文档迁移
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const d = JSON.parse(old);
      if (d && d.elements) return { docs: migrateLeaves([d]), curId: d.id };
    }
  } catch { /* 损坏则重置 */ }
  const demo = freshDoc();
  return { docs: [demo], curId: demo.id };
}
// 审计 BUG-11：拖拽时 mousemove 每帧 emit → 同步序列化整文档写 localStorage 会阻塞主线程。
// 改为 200ms 防抖异步落盘（内存态即时生效不受影响；意外断电最多丢最后 200ms，可接受）
// 数据安全补丁：失败不再只 console.warn（用户看不到 = 静默丢数据），改为状态订阅（main.js 弹可见警告）
let saveTimer = null;
let saveOk = true;
const saveSubs = new Set();
export function onSaveStatus(fn) { saveSubs.add(fn); return () => saveSubs.delete(fn); }
function notifySave(status) { for (const fn of saveSubs) fn(status); }
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DOCS_KEY, JSON.stringify({ docs, curId }));
      if (!saveOk) { saveOk = true; notifySave({ ok: true }); } // 恢复：撤下警告
    } catch (e) {
      console.warn('[PageForge v2] 文档保存失败（存储满或隐私模式），改动不会保留:', e.message);
      if (saveOk) { saveOk = false; notifySave({ ok: false, error: e }); } // 进入失败态只通知一次，不刷屏
    }
  }, 200);
}
function emit() { save(); for (const fn of subs) fn(getDoc()); }
export function getDoc() { return docs.find((d) => d.id === curId) || docs[0]; }
export function getDocs() { return docs; }
export function getCurId() { return curId; }
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }

// —— 模块初始化：加载或创建文档（loadState 依赖上方函数定义，置于此处执行）——
const initState = loadState();
docs = initState.docs;
curId = initState.curId;

// 新建页默认空白（符合"再加一页"的直觉）；传 starterId 可从模板新建（A0-3）
export function addDoc(name, starterId = 'blank') {
  const built = buildStarter(starterId);
  const d = { id: newId(), name: name || ('画布页 ' + (docs.length + 1)), layoutMode: 'canvas', stage: { ...built.stage }, elements: built.elements };
  docs.push(d);
  curId = d.id;
  emit();
  notifyStack();
  return d;
}
export function switchDoc(id) {
  if (!docs.some((d) => d.id === id)) return;
  curId = id;
  emit();
  notifyStack();
}
export function removeDoc(id) {
  if (docs.length <= 1) return;
  docs = docs.filter((d) => d.id !== id);
  if (curId === id) curId = docs[0].id;
  delete stacks[id];
  emit();
  notifyStack();
}
export function renameDoc(id, name) {
  const d = docs.find((x) => x.id === id);
  if (d && name) { d.name = String(name).slice(0, 30); emit(); }
}

// 用起步模板替换当前页内容（A0-3）。
// 调用方先 snapshot() 即可整体撤销（模板替换 = 一步）。
export function applyStarterToCurrentDoc(built, name) {
  const d = getDoc();
  if (!d || !built) return;
  d.stage = { ...built.stage };
  d.elements = built.elements;
  if (name) d.name = String(name).slice(0, 30);
  emit();
}

// 应用主题（A0-4）：从当前主题换皮到目标主题（调用方先 snapshot 即可整体撤销）
export function applyTheme(themeId) {
  const d = getDoc();
  if (!d) return { changed: 0 };
  const res = applyThemeToDoc(d, d.themeId || null, themeId);
  emit();
  return res;
}

export { themeList };

// —— 快照撤销（Q6）：按文档独立栈，切页互不串 ——
const stacks = {}; // docId -> { undo: [], redo: [] }
const stackSubs = new Set();
export function onStackChange(fn) { stackSubs.add(fn); return () => stackSubs.delete(fn); }
function st() {
  const id = getDoc().id;
  if (!stacks[id]) stacks[id] = { undo: [], redo: [] };
  return stacks[id];
}
function notifyStack() {
  const s = st();
  for (const fn of stackSubs) fn({ hasUndo: s.undo.length > 0, hasRedo: s.redo.length > 0 });
}
export function snapshot() {
  const s = st();
  pushFrame(s.undo, JSON.stringify(getDoc()));
  s.redo.length = 0;
  notifyStack();
}
export function undo() {
  const s = st();
  if (!s.undo.length) return false;
  pushFrame(s.redo, JSON.stringify(getDoc()));
  const restored = JSON.parse(s.undo.pop());
  const i = docs.findIndex((d) => d.id === restored.id);
  if (i >= 0) docs[i] = restored;
  else docs.push(restored); // 审计 BUG-16：文档已被删除 → 回插恢复（撤销删页也能工作）
  curId = restored.id;
  emit();
  notifyStack();
  return true;
}
export function redo() {
  const s = st();
  if (!s.redo.length) return false;
  pushFrame(s.undo, JSON.stringify(getDoc()));
  const restored = JSON.parse(s.redo.pop());
  const i = docs.findIndex((d) => d.id === restored.id);
  if (i >= 0) docs[i] = restored;
  else docs.push(restored); // 同上：redo 方向也回插
  curId = restored.id;
  emit();
  notifyStack();
  return true;
}

// —— 变更接口（交互层只调这些，不碰 doc 内部）——
export function updateElement(id, patch) {
  const e = getDoc().elements.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  emit();
}
// 地雷二：批量更新（拖拽松手一次性提交）——只发一次 emit，避免 N 次全量重建
export function updateElements(patches) {
  if (!patches || !patches.length) return;
  const d = getDoc();
  for (const { id, patch } of patches) {
    const e = d.elements.find((x) => x.id === id);
    if (e && patch) Object.assign(e, patch);
  }
  emit();
}
export function addElement(el) { getDoc().elements.push(el); emit(); return el; }

// 审计 2.3：放置策略统一（内容底部 +40、水平居中、stage 向下生长）——三处调用收敛于此
export function placeElement(el) {
  const d = getDoc();
  el.x = Math.round((d.stage.width - el.width) / 2);
  const maxY = d.elements.length ? Math.max(...d.elements.map((x) => x.y + x.height)) : 0;
  el.y = d.elements.length ? Math.round(maxY + 40) : el.y;
  if (el.y + el.height + 40 > d.stage.height) d.stage.height = el.y + el.height + 40;
  return el;
}
export function removeElement(id) {
  const d = getDoc();
  d.elements = d.elements.filter((e) => e.id !== id);
  emit();
}
export function setStage(patch) { Object.assign(getDoc().stage, patch); emit(); }
export function resetDoc() {
  const d = getDoc();
  const fresh = freshDoc(d.name);
  Object.assign(d, fresh, { id: d.id, name: d.name });
  st().undo.length = 0; st().redo.length = 0;
  emit();
}
