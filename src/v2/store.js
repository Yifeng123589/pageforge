// v2 数据层：canvas 页文档 + 全量快照撤销（Q6：snapshot，200 帧上限）
// 规范见 docs/v2/canvas-schema-draft.md（v1.0 实现基线）

const DOC_KEY = 'pageforge-v2-doc';
const MAX_FRAMES = 200;

export function elId() {
  // 元素 ID 非加密用途；统一 crypto 生成（目标运行时均为 secure context，randomUUID 必可用）
  return 'el_' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

// —— 首批画布块模板（对应 51 块的 canvas 适配版；AI 槽位映射见规范 §4）——
const T = (type, x, y, w, h, z, style, html) => ({
  id: elId(), type, x, y, width: w, height: h, z,
  rotation: 0, opacity: 1, locked: false, style, html, overrides: {},
});

export const BLOCK_TEMPLATES = {
  cta: () => withSlots(T('cta', 120, 40, 1200, 240, 1,
    { padding: '56px 48px', background: 'linear-gradient(135deg,#eef2ff 0%,#ffffff 100%)', borderRadius: '16px', textAlign: 'center' },
    `<h2 data-id="h_title" style="font-size:40px;font-weight:800;letter-spacing:-0.5px;margin:0 0 12px;color:#111827;">现在就开始</h2> <p data-id="p_sub" style="font-size:17px;color:#6b7280;margin:0 0 28px;">几分钟就能拥有一个漂亮的页面。</p> <a data-id="a_btn" href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:13px 32px;border-radius:999px;font-size:16px;font-weight:600;text-decoration:none;">立即开始</a>`),
    (elm, s) => {
      const set = (id, v, max = 50) => { if (v == null || v === '') return; const n = elm.querySelector(`[data-id="${id}"]`); if (n) n.textContent = String(v).slice(0, max); };
      set('h_title', s.title, 20); set('p_sub', s.sub); set('a_btn', s.btn, 10);
    }),
  features3: () => withSlots(T('features3', 120, 300, 1200, 380, 2,
    { padding: '56px 48px', background: '#ffffff', borderRadius: '16px' },
    `<h2 data-id="h_title" style="text-align:center;font-size:36px;font-weight:800;letter-spacing:-0.5px;margin:0 0 10px;color:#111827;">功能特性</h2> <p data-id="p_sub" style="text-align:center;font-size:17px;color:#6b7280;margin:0 0 40px;">三栏介绍你的核心功能。</p> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;"> <div style="padding:24px;border-radius:14px;background:#f5f5f7;"> <h3 data-id="h_c1" style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">极速</h3> <p data-id="p_c1" style="margin:0;font-size:14.5px;line-height:1.65;color:#6b7280;">秒开页面，极致性能。</p> </div> <div style="padding:24px;border-radius:14px;background:#f5f5f7;"> <h3 data-id="h_c2" style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">安全</h3> <p data-id="p_c2" style="margin:0;font-size:14.5px;line-height:1.65;color:#6b7280;">端到端加密。</p> </div> <div style="padding:24px;border-radius:14px;background:#f5f5f7;"> <h3 data-id="h_c3" style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">省心</h3> <p data-id="p_c3" style="margin:0;font-size:14.5px;line-height:1.65;color:#6b7280;">全自动备份。</p> </div> </div>`),
    (elm, s) => {
      const set = (id, v, max = 50) => { if (v == null || v === '') return; const n = elm.querySelector(`[data-id="${id}"]`); if (n) n.textContent = String(v).slice(0, max); };
      set('h_title', s.title, 20); set('p_sub', s.sub);
      (Array.isArray(s.items) ? s.items : []).slice(0, 3).forEach((it, i) => {
        const seg = String(it).split(/[：:]/);
        set(`h_c${i + 1}`, seg[0], 12);
        set(`p_c${i + 1}`, seg.length >= 2 ? seg.slice(1).join('：') : '', 50);
      });
    }),
  footer: () => withSlots(T('footer', 120, 700, 1200, 190, 3,
    { padding: '40px 48px', background: '#0d0d0f', borderRadius: '16px' },
    `<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:40px;align-items:start;"> <div> <p data-id="p_brand" style="color:#ffffff;font-size:20px;font-weight:800;margin:0 0 10px;">你的品牌</p> <p data-id="p_intro" style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0;">一句话介绍你的产品，让访客知道你是做什么的。</p> </div> <div> <p data-id="p_l1" style="color:#e4e4e7;font-size:14px;font-weight:700;margin:0 0 8px;">产品</p> <p data-id="p_l2" style="color:#a1a1aa;font-size:14px;margin:0 0 6px;">功能</p> <p data-id="p_l3" style="color:#a1a1aa;font-size:14px;margin:0;">价格</p> </div> <div> <p data-id="p_l4" style="color:#e4e4e7;font-size:14px;font-weight:700;margin:0 0 8px;">公司</p> <p data-id="p_l5" style="color:#a1a1aa;font-size:14px;margin:0 0 6px;">关于我们</p> <p data-id="p_l6" style="color:#a1a1aa;font-size:14px;margin:0;">联系</p> </div> </div> <p data-id="p_copy" style="color:#71717a;font-size:13px;margin:24px 0 0;padding-top:20px;border-top:1px solid #27272a;text-align:center;">© 2026 你的品牌. All rights reserved.</p>`),
    (elm, s) => {
      const set = (id, v, max = 60) => { if (v == null || v === '') return; const n = elm.querySelector(`[data-id="${id}"]`); if (n) n.textContent = String(v).slice(0, max); };
      if (s.brand) { set('p_brand', s.brand, 20); set('p_copy', `© ${new Date().getFullYear()} ${s.brand}. All rights reserved.`, 80); }
      set('p_intro', s.intro);
    }),
};

// AI 块注册表 id → canvas 模板（EditorAdapter.placeBlock 用）
export const CANVAS_BY_BLOCK = {
  'pf-cta-banner': BLOCK_TEMPLATES.cta,
  'pf-section-features': BLOCK_TEMPLATES.features3,
  'pf-footer': BLOCK_TEMPLATES.footer,
};

function withSlots(el, apply) { el.applySlots = apply; return el; }

export function freshDoc() {
  return {
    id: 'pg_v2demo',
    name: '未命名演示页',
    layoutMode: 'canvas',
    stage: { width: 1440, height: 960, background: '#ffffff' },
    elements: [BLOCK_TEMPLATES.cta(), BLOCK_TEMPLATES.features3(), BLOCK_TEMPLATES.footer()],
  };
}

// —— 文档状态 + 订阅 ——
let doc = load();
const undoStack = [], redoStack = [];
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* 损坏则重置 */ }
  return freshDoc();
}
function save() {
  try { localStorage.setItem(DOC_KEY, JSON.stringify(doc)); } catch { /* 存储满忽略 */ }
}
function emit() { save(); for (const fn of subs) fn(doc); }
export function getDoc() { return doc; }
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }

// —— 快照撤销（Q6）——
export function snapshot() {
  undoStack.push(JSON.stringify(doc));
  if (undoStack.length > MAX_FRAMES) undoStack.shift();
  redoStack.length = 0;
}
export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(JSON.stringify(doc));
  doc = JSON.parse(undoStack.pop());
  emit();
  return true;
}
export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(JSON.stringify(doc));
  doc = JSON.parse(redoStack.pop());
  emit();
  return true;
}

// —— 变更接口（交互层只调这些，不碰 doc 内部）——
export function updateElement(id, patch) {
  const e = doc.elements.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  emit();
}
export function addElement(el) { doc.elements.push(el); emit(); return el; }
export function removeElement(id) { doc.elements = doc.elements.filter((e) => e.id !== id); emit(); }
export function setStage(patch) { Object.assign(doc.stage, patch); emit(); }
export function resetDoc() { doc = freshDoc(); emit(); }
