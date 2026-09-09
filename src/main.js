import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import './theme.css';
import zhCN from './i18n-zh.js';
import { blocks, starterTemplate } from './blocks.js';
import { presets, generateHarmony, applySchemeToPage, applyColorToSelection, extractColorsFromImage } from './color-panel.js';
import { templates } from './templates.js';
import { renderStylePresets } from './style-presets.js';
import { initFitter } from './fitter.js';
import { initContextMenu } from './context-menu.js';
import { initAIPanel } from './ai-panel.js';
import { themes } from './themes.js';
import { assetIcons, assetImages, assetTexts } from './assets.js';
import html2canvas from 'html2canvas';

const STORAGE_KEY = 'pageforge-project-v1';
// 页面元信息（标题/描述/favicon/OG 分享图）：工程 JSON 只存 title/desc，
// meta 全量走 localStorage 独立持久化（刷新后不再丢，导出时注入 <head>）
const META_KEY = 'pageforge-meta-v1';

function loadPageMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch { return {}; }
}
function savePageMeta(patch) {
  const next = { ...loadPageMeta(), ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
}
// 属性值转义（og/link 的属性上下文）
const escapeAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 启动时把持久化的 meta 回填到界面
function restorePageMetaToUI() {
  const m = loadPageMeta();
  if (m.title) $('#page-title').value = m.title;
  if (m.desc != null) $('#page-meta-desc').value = m.desc;
}

// ============ 动效（滚动渐入，导出时注入）============
// 导出页面的动效 CSS：.pf-reveal 初始隐藏，滚动到视口后加 .pf-shown 渐入
const REVEAL_CSS = `
.pf-reveal{opacity:0;transform:translateY(28px);transition:opacity .7s ease,transform .7s cubic-bezier(.16,1,.3,1);will-change:opacity,transform}
.pf-reveal[data-reveal="fade"]{transform:none}
.pf-reveal[data-reveal="left"]{transform:translateX(-32px)}
.pf-reveal[data-reveal="right"]{transform:translateX(32px)}
.pf-reveal[data-reveal="zoom"]{transform:scale(.94)}
.pf-reveal.pf-shown{opacity:1;transform:none}`;

// 导出页面的动效 JS（IntersectionObserver，零依赖，约 500B）
// threshold 0.05 + 提前 60px 触发：大容器（表格+时间线等）更容易出现，避免"内容一直不显示"
const REVEAL_JS = `(function(){var r=document.querySelectorAll('.pf-reveal');if(!r.length)return;if(!('IntersectionObserver'in window)){r.forEach(function(e){e.classList.add('pf-shown')});return}var o=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('pf-shown');o.unobserve(x.target)}})},{threshold:.05,rootMargin:'0px 0px 60px 0px'});r.forEach(function(e){o.observe(e)})})();`;

// 编辑器画布内：直接显示最终态（避免用户以为内容"消失"；导出后才有动画）
const REVEAL_EDIT_CSS = `.pf-reveal{opacity:1!important;transform:none!important}`;

// ============ 动效：滚动粘性蒙版（Rockstar 式，2026-08-20）============
// 导出引擎：图片 sticky 置顶后继续滚动 → 图片渐模糊 + 渐变蒙版文字渐显
const STICKY_JS = `(function(){var s=document.querySelectorAll('[data-pf-sticky]');if(!s.length)return;function tick(){s.forEach(function(sec){var img=sec.querySelector('[data-pf-blur]');var mask=sec.querySelector('[data-pf-mask]');var txt=mask?mask.querySelector('div'):null;var r=sec.getBoundingClientRect();var vh=window.innerHeight||1;var p=Math.min(1,Math.max(0,-r.top/(vh*.5)));if(img){img.style.filter='blur('+(p*18).toFixed(1)+'px)';img.style.transform=p>0?'scale('+(1+p*.12).toFixed(3)+')':'scale(1)';}if(mask){mask.style.opacity=(0.35+p*.65).toFixed(2);}if(txt){txt.style.transform='translateY('+((1-p)*70).toFixed(1)+'px)';}}) }window.addEventListener('scroll',tick,{passive:true});tick();})();`;

// ============ 小工具 ============
const $ = (sel) => document.querySelector(sel);

// 通用弹窗开关
function openModal(id) { $('#' + id).hidden = false; }
function closeModal(id) { $('#' + id).hidden = true; }
// 所有 .modal-close 按钮 + 点遮罩关闭
document.querySelectorAll('.modal-close').forEach((btn) =>
  btn.addEventListener('click', () => closeModal(btn.closest('.modal-mask').id))
);
document.querySelectorAll('.modal-mask').forEach((mask) =>
  mask.addEventListener('click', (e) => {
    if (e.target === mask) mask.hidden = true;
  })
);

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadProjectJson(editor) {
  const data = editor.store();
  const title = ($('#page-title').value || '我的页面').trim();
  const desc = ($('#page-meta-desc').value || '').trim();
  savePageMeta({ title, desc });
  const payload = { app: 'PageForge', version: 1, title, desc, ...data };
  download(`${title}.pageforge.json`, JSON.stringify(payload, null, 2), 'application/json');
}

// ============ 初始化编辑器 ============
const editor = grapesjs.init({
  container: '#gjs',
  height: '100%',
  width: 'auto',
  fromElement: false,

  // 编辑器画布专用 CSS（不进导出）：页面底部留空隙，方便继续往下加内容
  canvasCss: 'body{padding-bottom:140px;}body:after{content:"";display:block;height:40px;}',

  storageManager: {
    type: 'local',
    autosave: true,
    autoload: true,
    stepsBeforeSave: 1,
    options: { local: { key: STORAGE_KEY } },
  },

  i18n: {
    locale: 'zh-CN',
    messages: { 'zh-CN': zhCN },
    detectLocale: false,
  },

  blockManager: { appendTo: '#left-blocks', blocks: [] },

  styleManager: {
    sectors: [
      {
        name: '排版',
        open: true,
        buildProps: ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height', 'color', 'text-align'],
      },
      { name: '尺寸', open: false, buildProps: ['width', 'height', 'min-width', 'min-height', 'max-width', 'padding', 'margin'] },
      { name: '外观', open: false, buildProps: ['background-color', 'border-radius', 'border', 'box-shadow', 'opacity'] },
      { name: '布局', open: false, buildProps: ['display', 'flex-direction', 'align-items', 'justify-content', 'gap', 'position'] },
    ],
  },

  deviceManager: {
    devices: [
      // 桌面 widthMedia 必须显式为 ''（null 会自动等于 width → 样式被包进 @media(max-width:1200px)，
      // 全屏 >1200px 时样式全部失效）——2026-08-10 踩坑修复
      { id: 'desktop', name: '桌面', width: '1200px', widthMedia: '' },
      { id: 'tablet', name: '平板', width: '768px', widthMedia: '992px' },
      { id: 'mobile', name: '手机', width: '375px', widthMedia: '480px' },
    ],
  },
});

// 注册组件块
// 剥离 AI 槽位标记（data-pf-slot/data-pf-items）：标记只服务 AI 填槽路径，
// 拖拽插入走的是默认文案，不能把标记带进工程/导出 HTML
const stripSlotMarkers = (html) => String(html)
  .replace(/\s*data-pf-slot="[^"]*"/g, '')
  .replace(/\s*data-pf-items="[^"]*"/g, '');
editor.BlockManager.getAll().forEach((b) => editor.BlockManager.remove(b.id));
blocks.forEach((b) => {
  editor.BlockManager.add(b.id, {
    label: b.label,
    category: b.category,
    content: typeof b.content === 'string' ? stripSlotMarkers(b.content) : b.content,
    media: b.media || `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#86868b" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`,
  });
});

// 素材图标组件命名：带 pf-icon class 的行内元素在徽标/图层里显示"图标"（而非"行内"）
editor.on('component:create', (c) => {
  try {
    if (!c || c.get('custom-name') || c.get('name')) return;
    const cls = c.getAttributes()?.class || '';
    if (String(cls).split(/\s+/).includes('pf-icon')) c.set('custom-name', '图标');
  } catch { /* 命名失败不影响插入 */ }
});

// 中文字体预设（全部系统字体零下载；每项带跨平台回退链，Win/macOS 都有着落）
const FONT_PRESETS = [
  { id: `-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`, label: '系统默认（黑体感）' },
  { id: `"PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif`, label: '苹方（macOS 风）' },
  { id: `"Microsoft YaHei", "PingFang SC", sans-serif`, label: '微软雅黑' },
  { id: `"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`, label: '思源黑体' },
  { id: `"Heiti SC", SimHei, "Microsoft YaHei", sans-serif`, label: '黑体' },
  { id: `"Songti SC", SimSun, "Noto Serif SC", serif`, label: '宋体（衬线）' },
  { id: `"Kaiti SC", KaiTi, STKaiti, serif`, label: '楷体' },
  { id: `Arial, "Helvetica Neue", sans-serif`, label: 'Arial（西文）' },
  { id: `Georgia, "Times New Roman", serif`, label: 'Georgia（西文衬线）' },
  { id: `"SF Mono", Menlo, Consolas, "Courier New", monospace`, label: '等宽（代码）' },
];
try {
  const sector = editor.StyleManager.getSectors().find?.((s) => s.get('name') === '排版')
    || [...editor.StyleManager.getSectors().models].find((s) => s.get('name') === '排版');
  const prop = sector && [...(sector.get('properties').models || sector.get('properties'))].find((p) => p.get('property') === 'font-family');
  if (prop) prop.set('options', FONT_PRESETS);
} catch { /* 字体预设注入失败不影响其余功能 */ }


// 图片组件：设置面板加"水平对齐"（左/中/右）
// 说明：styleManager 的 select 类型 0.23.4 有 bug 且 toStyle 只支持复合属性，
// 改用 traits（设置面板）+ trait:update 手动应用样式，稳定可靠
editor.DomComponents.addType('image', {
  model: {
    defaults: {
      traits: [
        {
          type: 'select',
          name: 'align',
          label: '水平对齐',
          options: [
            { value: 'left', label: '左对齐' },
            { value: 'center', label: '居中' },
            { value: 'right', label: '右对齐' },
          ],
        },
      ],
    },
  },
});

// 图片水平对齐：trait（设置面板下拉）→ 写入 align 属性 → 这里转成样式并清除属性
// 用 component:update 兜底；不用 is('img')（addType 覆盖后判断异常），用 align 属性本身判断
editor.on('component:update', (component) => {
  if (!component || !component.getAttributes) return;
  const attrs = component.getAttributes();
  const v = attrs.align;
  if (!v) return;
  const style =
    v === 'center'
      ? { 'margin-left': 'auto', 'margin-right': 'auto' }
      : v === 'right'
        ? { 'margin-left': 'auto', 'margin-right': '0' }
        : { 'margin-left': '0', 'margin-right': '0' };
  component.addStyle(style);
  // 清除 align 属性，避免污染导出的 HTML
  component.removeAttributes(['align']);
});

// 首次使用：写入起步模板（仅当本地没有任何工程时）
if (!localStorage.getItem(STORAGE_KEY)) {
  editor.setComponents(starterTemplate);
  editor.store();
}
restorePageMetaToUI();

// ============ 工具栏事件 ============
// 导出 HTML 文档构建（独立成函数：工具栏按钮与回归测试共用）
function buildExportDoc() {
  const title = ($('#page-title').value || '我的页面').trim();
  const desc = ($('#page-meta-desc').value || '').trim();
  const metaDesc = desc ? `\n<meta name="description" content="${escapeAttr(desc)}">` : '';
  // favicon + Open Graph（社交平台分享卡片：微信/钉钉/LinkedIn 等读 og:*）
  const meta = loadPageMeta();
  const favHtml = meta.fav ? `\n<link rel="icon" href="${escapeAttr(meta.fav)}">` : '';
  const ogHtml = meta.og
    ? `\n<meta property="og:title" content="${escapeAttr(title)}">\n<meta property="og:description" content="${escapeAttr(desc)}">\n<meta property="og:image" content="${escapeAttr(meta.og)}">\n<meta property="og:type" content="website">`
    : '';
  const pages = editor.Pages.getAll();
  let html, css, extraJs = '';

  if (pages.length > 1) {
    // ===== 多页面导出：每页一个区块，导航链接 #页面名 切换 =====
    let htmlAll = '', cssAll = '';
    const pageNames = [];
    pages.forEach(p => {
      editor.Pages.select(p.getId());
      const name = (p.getName() || p.getId()).trim().replace(/"/g, '').replace(/</g, '').replace(/>/g, '');
      pageNames.push(name);
      htmlAll += `\n<section class="pf-page" data-page-name="${name}">${editor.getHtml().replace(/^<body[^>]*>/, '').replace(/<\/body>\s*$/, '')}</section>`;
      const pageCss = editor.getCss();
      cssAll += pageCss + '\n';
    });
    // 合并去重：body 基础规则只保留一份
    cssAll = cssAll.replace(/(\* \{ box-sizing: border-box; \} body \{margin: 0;\}\s*)+/g, '* { box-sizing: border-box; } body {margin: 0;}');
    html = htmlAll;
    css = cssAll;
    // 页面切换 JS（导航链接 #页面名 → 切换显示对应页面）
    const names = pageNames.map(n => `"${n.replace(/"/g, '')}"`).join(',');
    extraJs = `\n<script>(function(){var ps=document.querySelectorAll('.pf-page');var ns=[${names}];function show(n){ps.forEach(function(p){p.style.display=(p.getAttribute('data-page-name')===n)?'':'none'});window.scrollTo(0,0)}if(ns.length)show(ns[0]);document.addEventListener('click',function(e){var a=e.target.closest('a[href^="#"]');if(!a)return;var n=a.getAttribute('href').slice(1);if(ns.indexOf(n)>-1){e.preventDefault();show(n)}})})();</script>`;
  } else {
    // ===== 单页面导出（原逻辑）=====
    html = editor.getHtml().replace(/^<body[^>]*>/, '').replace(/<\/body>\s*$/, '');
    css = editor.getCss();
  }
  // 页面含动效容器时，导出带上动效 CSS + 脚本
  const hasReveal = editor.getHtml().includes('pf-reveal');
  const revealCss = hasReveal ? REVEAL_CSS : '';
  const revealJs = hasReveal ? `\n<script>${REVEAL_JS}</script>` : '';
  // 滚动粘性蒙版引擎（data-pf-sticky 容器）
  const hasSticky = editor.getHtml().includes('data-pf-sticky');
  const stickyJs = hasSticky ? `\n<script>${STICKY_JS}</script>` : '';
  const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>${metaDesc}${favHtml}${ogHtml}
<style>
/* 由 PageForge 生成 */
* { box-sizing: border-box; }
body { margin: 0; background: #ffffff; }
${css}${revealCss}
</style>
</head>
<body>
${html}
</body>
${revealJs}${stickyJs}${extraJs}
</html>
`;
  return { doc, title, pageCount: pages.length };
}

$('#btn-export').addEventListener('click', () => {
  const { doc, title, pageCount } = buildExportDoc();
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  download(`${title}_${ts}.html`, doc, 'text/html');
  const sizeKB = (new Blob([doc]).size / 1024).toFixed(1);
  toast(pageCount > 1 ? `已导出 ${pageCount} 个页面的网站（${sizeKB} KB）` : `已导出 HTML 文件（${sizeKB} KB）`);
});

$('#btn-save').addEventListener('click', () => {
  downloadProjectJson(editor);
  toast('已保存工程文件');
});

$('#btn-new').addEventListener('click', () => {
  // 新建 = 清空画布，先弹确认防误触（setComponents 会清撤销栈，无法 Ctrl+Z 恢复）
  openConfirm('新建页面', '将清空当前画布，未保存的改动会丢失。', () => {
    // 安全清空：setComponents('') 在 GrapesJS 0.23 会解析空字符串崩溃（undefined.add）
    editor.getWrapper().components().reset();
    editor.store();
    $('#page-title').value = '我的页面';
    toast('已新建空白页面');
  });
});

// 通用确认弹窗（新建/模板载入共用）
let pendingConfirm = null;
function openConfirm(title, msg, onConfirm) {
  $('#modal-mask .modal h3').textContent = title;
  $('#modal-mask .modal p').textContent = msg;
  pendingConfirm = onConfirm;
  openModal('modal-mask');
}
$('#modal-cancel').addEventListener('click', () => { closeModal('modal-mask'); });
$('#modal-confirm').addEventListener('click', () => {
  closeModal('modal-mask');
  if (pendingConfirm) pendingConfirm();
  pendingConfirm = null;
});

$('#btn-open').addEventListener('click', () => $('#file-open').click());

// ============ 模板库 ============
// 模板真实缩略图：隐藏 iframe 离线渲染模板 HTML → html2canvas 截图（复用 M9 截图方案）
// 结果缓存 localStorage（TPL_THUMB_VER 变更后自动重生成）
const TPL_THUMB_KEY = 'pageforge-template-thumbs';
const TPL_THUMB_VER = 'v1';
function getThumbCache() {
  try {
    const c = JSON.parse(localStorage.getItem(TPL_THUMB_KEY) || '{}');
    return c.__v === TPL_THUMB_VER ? c : null;
  } catch { return null; }
}
async function renderTemplateThumb(t) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;height:900px;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#fff}
    .pf-reveal{opacity:1!important;transform:none!important}</style></head><body>${t.content}</body></html>`);
  doc.close();
  await new Promise((r) => setTimeout(r, 450)); // 等字体/布局稳定
  let url = null;
  try {
    const canvas = await html2canvas(doc.body, {
      windowWidth: 1200, windowHeight: 900, scale: 0.3,
      backgroundColor: '#ffffff', logging: false, useCORS: true,
    });
    const thumb = document.createElement('canvas');
    thumb.width = 280; thumb.height = 210;
    const ctx = thumb.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 280, 210);
    const s = Math.max(280 / canvas.width, 210 / canvas.height); // cover 居中裁剪
    const w = canvas.width * s, h = canvas.height * s;
    ctx.drawImage(canvas, (280 - w) / 2, (210 - h) / 2, w, h);
    url = thumb.toDataURL('image/jpeg', 0.72);
  } catch { /* 单个失败退回文字占位 */ }
  iframe.remove();
  return url;
}
async function buildTemplateThumbs() {
  const out = { __v: TPL_THUMB_VER };
  for (const t of templates) out[t.id] = await renderTemplateThumb(t);
  try { localStorage.setItem(TPL_THUMB_KEY, JSON.stringify(out)); } catch { /* 存储满则不缓存 */ }
  return out;
}
function renderTemplates(thumbs) {
  const grid = $('#template-grid');
  grid.innerHTML = templates
    .map(
      (t) => `<div class="template-card" data-id="${t.id}">
      <div class="template-preview">${thumbs && thumbs[t.id] ? `<img src="${thumbs[t.id]}" alt="${t.name}">` : t.name}</div>
      <div class="template-name">${t.name}</div>
      <div class="template-desc">${t.desc}</div>
      <button class="btn ghost template-load">载入</button>
    </div>`
    )
    .join('');
  grid.querySelectorAll('.template-load').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.template-card');
      const t = templates.find((x) => x.id === card.dataset.id);
      closeModal('modal-template');
      openConfirm('载入模板', `将用「${t.name}」替换当前内容，继续吗？`, () => {
        editor.setComponents(t.content);
        editor.store();
        toast(`已载入模板「${t.name}」`);
      });
    });
  });
}
$('#btn-template').addEventListener('click', () => {
  const cache = getThumbCache();
  renderTemplates(cache || undefined);
  openModal('modal-template');
  if (!cache) {
    buildTemplateThumbs().then((fresh) => renderTemplates(fresh)); // 后台生成完自动换上真图
  }
});

// ============ 智能配色 ============
// 渲染和谐配色色块到面板
function renderPalette(colors) {
  const box = $('#color-palette');
  box.innerHTML = colors
    .map(
      (c) => `<div class="color-swatch" style="background:${c.hex}" data-hex="${c.hex}" title="${c.name} · ${c.hex}">
      <span class="color-swatch-name">${c.name}</span>
    </div>`
    )
    .join('');
  box.querySelectorAll('.color-swatch').forEach((sw) => {
    const hex = sw.dataset.hex;
    sw.addEventListener('click', () => {
      const ok = applyColorToSelection(editor, hex, 'bg');
      toast(ok ? `已应用 ${hex} 到选中元素背景` : '请先在画布选中一个元素');
    });
    sw.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const ok = applyColorToSelection(editor, hex, 'text');
      toast(ok ? `已应用 ${hex} 到选中元素文字` : '请先在画布选中一个元素');
    });
  });
}

// 渲染预设方案卡片
function renderPresets() {
  const box = $('#color-presets');
  box.innerHTML = presets
    .map(
      (p) => `<div class="preset-card" data-id="${p.name}">
      <div class="preset-bar">
        ${[p.primary, p.background, p.text, p.accent, p.accentSoft]
          .map((c) => `<span style="background:${c}"></span>`)
          .join('')}
      </div>
      <div class="preset-name">${p.name}</div>
      <button class="btn ghost preset-apply">应用</button>
    </div>`
    )
    .join('');
  box.querySelectorAll('.preset-apply').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const name = e.target.closest('.preset-card').dataset.id;
      const p = presets.find((x) => x.name === name);
      applySchemeToPage(editor, p);
      closeModal('modal-color');
      toast(`已应用配色方案「${p.name}」`);
    });
  });
}

// 主色 → 和谐配色
function generateFromMain() {
  const hex = $('#color-main').value;
  renderPalette(generateHarmony(hex));
}
$('#btn-color').addEventListener('click', () => {
  renderPresets();
  generateFromMain();
  openModal('modal-color');
});
$('#color-main').addEventListener('input', generateFromMain);
$('#color-generate').addEventListener('click', generateFromMain);

// 从图片取色
$('#color-from-image').addEventListener('click', () => $('#color-image-file').click());
$('#color-image-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const colors = await extractColorsFromImage(file);
    renderPalette(colors.map((hex, i) => ({ name: `取色 ${i + 1}`, hex })));
    toast('已从图片提取配色');
  } catch (err) {
    toast('图片取色失败');
    console.error(err);
  }
  e.target.value = '';
});

// ============ 页面设置 ============
const DARK_SCHEME = {
  name: '深色模式',
  primary: '#2997ff',
  background: '#000000',
  text: '#f5f5f5',
  accent: '#2997ff',
  accentSoft: '#1d1d1f',
};

// 深色模式专用应用（反转组件配色，比通用 scheme 更细）
function applyDarkTheme(editor) {
  const wrapper = editor.getWrapper();
  const find = (sel) => wrapper.find(sel) || [];
  wrapper.addStyle({ background: '#000000', color: '#f5f5f5' });
  find('h1, h2, h3, h4, h5, p, li, blockquote').forEach((c) => {
    const s = c.getStyle();
    const col = s.color || '';
    // 深色文字 → 浅色；次级灰 → 保留灰阶
    if (col === '#1d1d1f' || col === '#1e293b' || col === '#14532d' || col === '#0c4a6e' || col === '#431407' || col === '#4c0519' || col === '#2e1065') {
      c.addStyle({ color: '#f5f5f5' });
    } else if (!col) {
      c.addStyle({ color: '#f5f5f5' });
    }
  });
  // 浅色块 → 深色卡片
  find('div, section').forEach((c) => {
    const s = c.getStyle();
    const bg = s.background || '';
    if (['#f8fafc', '#f5f5f7', '#f1f5f9', '#eef2ff', '#e8e8ed'].includes(bg) || bg.includes('rgba(255,255,255')) {
      c.addStyle({ background: '#1d1d1f' });
    } else if (bg.includes('linear-gradient')) {
      c.addStyle({ background: 'linear-gradient(135deg,#1d1d1f 0%,#0a0a0a 100%)' });
    }
  });
  // 实底按钮 → 苹果蓝；描边按钮 → 深色描边
  find('a').forEach((c) => {
    const s = c.getStyle();
    const bg = s.background || '';
    if (bg && bg !== 'none' && bg !== 'transparent') c.addStyle({ background: '#2997ff' });
    if ((s.border || '').includes('e2e8f0')) c.addStyle({ border: '1.5px solid #3a3a3c', color: '#f5f5f5', background: 'transparent' });
  });
  // 表单/分隔线/导航
  find('input, textarea').forEach((c) => c.addStyle({ background: '#1d1d1f', borderColor: '#3a3a3c', color: '#f5f5f5' }));
  find('button').forEach((c) => c.addStyle({ background: '#2997ff' }));
  find('hr').forEach((c) => c.addStyle({ borderTopColor: '#3a3a3c' }));
  find('nav').forEach((c) => c.addStyle({ background: 'rgba(0,0,0,0.6)' }));
}

$('#btn-page').addEventListener('click', () => {
  $('#page-meta-title').value = $('#page-title').value;
  const m = loadPageMeta();
  $('#page-meta-fav').value = m.fav || '';
  $('#page-meta-og').value = m.og || '';
  openModal('modal-page');
});
$('#page-save').addEventListener('click', () => {
  const title = $('#page-meta-title').value.trim() || '我的页面';
  $('#page-title').value = title;
  savePageMeta({
    title,
    desc: $('#page-meta-desc').value.trim(),
    fav: $('#page-meta-fav').value.trim(),
    og: $('#page-meta-og').value.trim(),
  });
  const theme = document.querySelector('input[name="page-theme"]:checked').value;
  if (theme === 'dark') {
    applyDarkTheme(editor);
    toast('已应用深色配色');
  }
  closeModal('modal-page');
  toast('页面设置已保存');
});
$('#file-open').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result;
      // 工程 JSON（以 { 开头）→ 原逻辑；否则当作普通 HTML 导入（N1）
      if (text.trim().startsWith('{')) {
        const data = JSON.parse(text);
        editor.loadProjectData(data);
        if (data.title) $('#page-title').value = data.title;
        if (data.desc) $('#page-meta-desc').value = data.desc;
        savePageMeta({ title: data.title || '', desc: data.desc || '' });
        toast(`已打开：${file.name}`);
      } else {
        importHTML(text, file.name);
      }
    } catch (err) {
      toast('打开失败：文件格式不正确');
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ============ N1：导入现有 HTML 继续编辑 ============
function importHTML(html, fileName) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bodyHtml = doc.body ? doc.body.innerHTML.trim() : '';
    if (!bodyHtml) { toast('导入失败：HTML 中没有内容'); return; }
    const cssParts = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    const title = doc.title || fileName.replace(/\.html?$/i, '');
    // 标题同步
    if (title && $('#page-title')) $('#page-title').value = title;
    // 清空画布并导入 body 内容（内联样式自动进组件）
    editor.getWrapper().components().reset();
    editor.setComponents(bodyHtml);
    // 外部 CSS（style 标签）导入 CssComposer
    if (cssParts.trim()) {
      try {
        if (typeof editor.setStyle === 'function') editor.setStyle(cssParts);
        else if (editor.CssComposer && typeof editor.CssComposer.addRules === 'function') editor.CssComposer.addRules(cssParts);
      } catch { /* 部分 CSS 规则解析失败时忽略 */ }
    }
    toast(`已导入：${fileName}（可继续编辑）`);
  } catch (err) {
    toast('导入失败：' + err.message);
    console.error(err);
  }
}

// 自动保存状态（静默化：不弹 toast，用右侧小圆点显示 🟢已保存/🟡保存中）
function setSaveState(state) {
  const dot = $('#save-status');
  if (!dot) return;
  dot.dataset.state = state;
}
editor.on('storage:start', () => setSaveState('saving'));
editor.on('storage:end', () => setTimeout(() => setSaveState('saved'), 300));
editor.on('change', () => setSaveState('dirty'));

// 画布内容适配视口（桌面 1200px / 平板 768px / 手机 375px 内容宽于画布时自动缩放，完整显示）
function getDeviceWidth() {
  const d = editor.getDevice();
  if (d === 'mobile') return 375;
  if (d === 'tablet') return 768;
  return 1200;
}
function fitCanvasToView() {
  try {
    const canvas = editor.Canvas;
    const frame = canvas.getFrameEl();
    const doc = frame.contentDocument;
    if (!doc) return;
    const viewW = document.querySelector('.gjs-cv-canvas').clientWidth;
    // 用设备宽度计算（不依赖 DOM 切换时序，避免切回桌面时读到旧宽度）
    const deviceW = getDeviceWidth();
    const contentW = Math.max(deviceW, doc.documentElement.scrollWidth || deviceW);
    if (contentW > 0 && contentW > viewW) canvas.setZoom((viewW / contentW) * 100);
    else canvas.setZoom(100);
    updateZoomUI();
  } catch { /* 忽略 */ }
}
editor.on('load', () => setTimeout(fitCanvasToView, 500));
editor.on('device:select', () => setTimeout(fitCanvasToView, 600));

// 清理旧工程遗留的 1200px 媒体查询规则（GrapesJS widthMedia bug 时代保存的工程，
// 规则 mediaText 带 @media(max-width:1200px) → 全屏样式失效；加载后自动清掉，只影响 1200px）
function cleanLegacyMediaRules() {
  try {
    const rules = editor.CssComposer.getAll();
    let cleaned = 0;
    rules.forEach(r => {
      const mt = r.get('mediaText') || '';
      if (mt.includes('1200px')) { r.set('mediaText', ''); cleaned++; }
    });
    if (cleaned > 0) console.log('[PageForge] 已清理', cleaned, '条旧媒体查询规则');
  } catch { /* 忽略 */ }
}
editor.on('load', () => setTimeout(cleanLegacyMediaRules, 600));

// ============ 画布缩放控件 + 平移（设计器体验）============
const zoomLevelEl = $('#zoom-level');
function updateZoomUI() {
  try { zoomLevelEl.textContent = Math.round(editor.Canvas.getZoom()) + '%'; } catch { /* 忽略 */ }
}
$('#zoom-out').addEventListener('click', () => {
  editor.Canvas.setZoom(Math.max(20, editor.Canvas.getZoom() - 10));
  updateZoomUI();
});
$('#zoom-in').addEventListener('click', () => {
  editor.Canvas.setZoom(Math.min(200, editor.Canvas.getZoom() + 10));
  updateZoomUI();
});
$('#zoom-fit').addEventListener('click', fitCanvasToView);

// Ctrl+滚轮缩放
const cvEl = document.querySelector('.gjs-cv-canvas');
cvEl.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const z = editor.Canvas.getZoom() + (e.deltaY < 0 ? 10 : -10);
    editor.Canvas.setZoom(Math.max(20, Math.min(200, z)));
    updateZoomUI();
  }
}, { passive: false });

// 平移：中键拖动 / 按住空格 + 左键拖动
let panning = false;
let panStart = null;
let spaceHeld = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !isInputFocused()) { spaceHeld = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceHeld = false; });
cvEl.addEventListener('mousedown', (e) => {
  if (e.button === 1 || (e.button === 0 && spaceHeld)) {
    panning = true;
    panStart = { x: e.clientX, y: e.clientY, sl: cvEl.scrollLeft, st: cvEl.scrollTop };
    cvEl.style.cursor = 'grabbing';
    e.preventDefault();
  }
});
window.addEventListener('mousemove', (e) => {
  if (panning && panStart) {
    cvEl.scrollLeft = panStart.sl - (e.clientX - panStart.x);
    cvEl.scrollTop = panStart.st - (e.clientY - panStart.y);
  }
});
window.addEventListener('mouseup', () => {
  panning = false;
  panStart = null;
  cvEl.style.cursor = '';
});
function isInputFocused() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}

// 编辑器画布内：动效容器直接显示最终态（编辑所见 = 导出后的完成状态）
editor.on('load', () => {
  const frame = editor.Canvas.getFrameEl();
  if (!frame || !frame.contentDocument) return;
  const style = frame.contentDocument.createElement('style');
  style.textContent = REVEAL_EDIT_CSS;
  frame.contentDocument.head.appendChild(style);
});

// ============ 美化面板（一键苹果风）============
$('#btn-beautify').addEventListener('click', () => {
  renderStylePresets($('#beautify-grid'), editor, toast);
  openModal('modal-beautify');
});

// ============ 曲线拟合器 ============
let fitterInit = false;
$('#btn-fitter').addEventListener('click', () => {
  if (!fitterInit) {
    initFitter({ editor, toast });
    fitterInit = true;
  }
  openModal('modal-fitter');
});

// ============ 快捷键 ============
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); downloadProjectJson(editor); toast('已保存工程文件'); }
  else if (k === 'o') { e.preventDefault(); $('#btn-open').click(); }
  else if (k === 'e') { e.preventDefault(); $('#btn-export').click(); }
  else if (k === 'n') { e.preventDefault(); $('#btn-new').click(); }
});

// ============ 右键菜单（M4：删除/超链接等基础操作右键唤起）============
initContextMenu({ editor, toast });

// ============ AI 助手（VS Code 式侧边栏）============
initAIPanel({ editor, toast });

// 暴露给外部测试
// ai-panel 也会往 __pageforge 挂测试接口，这里用合并赋值避免互相覆盖
window.__pageforge = Object.assign(window.__pageforge || {}, {
  editor, buildExportDoc, formatHtml, loadPageMeta, blocks,
});

// ============ 插件接口（M4）：为以后更多工具留扩展点 ============
window.PageForge = {
  version: '0.4.0',
  plugins: [],
  /** 注册插件：{ name, onInit(editor) } */
  register(plugin) {
    if (!plugin || typeof plugin !== 'object' || !plugin.name) return false;
    this.plugins.push(plugin);
    if (typeof plugin.onInit === 'function') {
      try { plugin.onInit(editor); } catch (err) { console.error(`插件 ${plugin.name} 初始化失败`, err); }
    }
    toast(`插件「${plugin.name}」已加载`);
    return true;
  },
};

// ============ 组件块搜索过滤 ============
const blockSearch = $('#block-search');
if (blockSearch) {
  blockSearch.addEventListener('input', () => {
    const q = blockSearch.value.trim().toLowerCase();
    // 隐藏无匹配的分类标题（含提示文字）
    document.querySelectorAll('#left-blocks .gjs-blocks-c').forEach((cat) => {
      const blocks = cat.querySelectorAll('.gjs-block');
      let visibleCount = 0;
      blocks.forEach((b) => {
        const label = ((b.getAttribute('title') || '') + ' ' + b.textContent).toLowerCase();
        const show = !q || label.includes(q);
        b.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      });
      const catTitle = cat.querySelector('.gjs-blocks-c-title, .gjs-title, [class*="title"]');
      if (catTitle) catTitle.style.display = (!q || visibleCount > 0) ? '' : 'none';
    });
  });
}

// ============ 预览模式（隐藏编辑器 UI 看成品）============
const btnPreview = $('#btn-preview');
function togglePreview() {
  const on = !document.body.classList.contains('preview-mode');
  document.body.classList.toggle('preview-mode', on);
  // core:preview：GrapesJS 内置预览命令（禁用画布编辑交互：点击不选中/不拖拽）
  try {
    if (on) editor.runCommand('core:preview');
    else editor.stopCommand('core:preview');
  } catch { /* 忽略 */ }
  // iframe 内禁用/恢复文本选择
  setTimeout(() => setFramePreviewMode(on), 120);
  btnPreview.classList.toggle('active', on);
  btnPreview.title = on ? '退出预览（按 Esc）' : '预览模式（隐藏编辑器界面，看成品效果）';
  setTimeout(fitCanvasToView, 100);
}
btnPreview.addEventListener('click', togglePreview);
$('#exit-preview').addEventListener('click', togglePreview);

// ============ 全屏模式（F11 / 按钮）============
const btnFullscreen = $('#btn-fullscreen');
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  } catch { /* 忽略（环境不支持时静默） */ }
}
btnFullscreen.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  btnFullscreen.classList.toggle('active', on);
  btnFullscreen.title = on ? '退出全屏 (F11)' : '全屏 / 退出全屏 (F11)';
  setTimeout(fitCanvasToView, 150); // 全屏后重新适配画布
});
// Electron 里 F11 无原生全屏，手动绑定；浏览器（单文件版）F11 由浏览器原生处理
if (navigator.userAgent.includes('Electron')) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      toggleFullscreen();
    }
  });
}
// ============ M9 演示模式（Keynote 化：全屏 + PPT 缩略图侧栏 + 翻页）============
let demoMode = false;
let demoThumbs = {}; // pageId → dataURL
const btnDemo = $('#btn-demo');
function demoPages() { return editor.Pages.getAll(); }
function updateDemoPage() {
  const pages = demoPages();
  const idx = pages.findIndex((p) => p.getId() === editor.Pages.getSelected().getId());
  $('#demo-page').textContent = `${Math.max(idx, 0) + 1} / ${pages.length}`;
  // 缩略图高亮当前页
  document.querySelectorAll('#demo-thumbs .demo-thumb').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === editor.Pages.getSelected().getId());
  });
}
function demoGo(delta) {
  const pages = demoPages();
  const idx = pages.findIndex((p) => p.getId() === editor.Pages.getSelected().getId());
  const next = Math.min(Math.max(idx + delta, 0), pages.length - 1);
  if (next !== idx) {
    editor.Pages.select(pages[next].getId());
    setTimeout(updateDemoPage, 400);
  }
}
// 截图当前 iframe 可视区域（html2canvas 真实渲染：中文走系统字体，无 foreignObject 乱码问题）
async function captureFrameShot() {
  try {
    const frame = editor.Canvas.getFrameEl();
    const doc = frame.contentDocument;
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    const canvas = await html2canvas(doc.body, {
      windowWidth: w,
      windowHeight: h,
      scale: 0.4,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });
    const thumb = document.createElement('canvas');
    thumb.width = 168;
    thumb.height = Math.max(Math.round((h / w) * 168), 100);
    const ctx = thumb.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, thumb.width, thumb.height);
    ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL('image/jpeg', 0.65);
  } catch {
    return null;
  }
}
// 为所有页面生成缩略图（逐页切换截图，完成后回当前页）
async function buildDemoThumbs() {
  const pages = demoPages();
  const origId = editor.Pages.getSelected().getId();
  const thumbs = {};
  for (const p of pages) {
    editor.Pages.select(p.getId());
    await new Promise((r) => setTimeout(r, 350)); // 等 iframe 渲染
    thumbs[p.getId()] = await captureFrameShot();
  }
  editor.Pages.select(origId);
  await new Promise((r) => setTimeout(r, 350));
  demoThumbs = thumbs;
  renderDemoThumbs();
}
function renderDemoThumbs() {
  const box = $('#demo-thumbs');
  box.innerHTML = '';
  demoPages().forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'demo-thumb';
    el.dataset.page = p.getId();
    el.innerHTML = `<img src="${demoThumbs[p.getId()] || ''}" alt=""><span>${i + 1}. ${p.getName() || '页面'}</span>`;
    el.addEventListener('click', () => {
      if (editor.Pages.getSelected().getId() !== p.getId()) {
        editor.Pages.select(p.getId());
        setTimeout(updateDemoPage, 400);
      }
    });
    box.appendChild(el);
  });
  updateDemoPage();
}
function startDemo() {
  demoMode = true;
  document.body.classList.add('preview-mode'); // 复用预览模式的隐藏 UI 逻辑
  try { editor.runCommand('core:preview'); } catch { /* 忽略 */ }
  document.documentElement.requestFullscreen().catch(() => { /* 无全屏权限时继续 */ });
  setTimeout(() => {
    setFramePreviewMode(true);
    fitCanvasToView();
    updateDemoPage();
  }, 200);
  btnDemo.classList.add('active');
  btnDemo.title = '退出演示（Esc）';
  $('#demo-ui').hidden = false;
  $('#exit-preview').hidden = true; // 演示用右下角自己的退出
  $('#demo-thumbs').hidden = false; // PPT 缩略图侧栏
  buildDemoThumbs(); // 异步生成缩略图（页多时稍等）
  toast('演示模式：点左侧缩略图换页，← → 翻页，Esc 退出');
}
function stopDemo() {
  demoMode = false;
  document.body.classList.remove('preview-mode');
  try { editor.stopCommand('core:preview'); } catch { /* 忽略 */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* 忽略 */ });
  setFramePreviewMode(false);
  btnDemo.classList.remove('active');
  btnDemo.title = '演示模式（全屏逐页演示，左右键翻页）';
  $('#demo-ui').hidden = true;
  $('#demo-thumbs').hidden = true;
  $('#exit-preview').hidden = false;
  setTimeout(fitCanvasToView, 150);
}
btnDemo.addEventListener('click', () => (demoMode ? stopDemo() : startDemo()));
$('#demo-exit').addEventListener('click', stopDemo);
document.addEventListener('keydown', (e) => {
  if (!demoMode) return;
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') {
    e.preventDefault();
    demoGo(1);
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
    e.preventDefault();
    demoGo(-1);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    stopDemo();
  }
});
document.addEventListener('fullscreenchange', () => {
  // 演示中用户用系统方式（如 Alt+F4 场景）退出全屏 → 同步退出演示
  if (demoMode && !document.fullscreenElement) stopDemo();
});

document.addEventListener('keydown', (e) => {
  const inModal = e.target && e.target.closest ? !!e.target.closest('.modal-mask:not([hidden])') : false;
  if (e.key === 'Escape' && document.body.classList.contains('preview-mode') && !inModal && !demoMode) {
    togglePreview();
  }
});

// 预览模式：iframe 内点击放行链接（外链新窗口、锚点切页），并拦截编辑交互
// 预览时禁用 iframe 内文本选择（否则点文字会出现蓝色选中高亮，像"选中"了）
function setFramePreviewMode(on) {
  try {
    const doc = editor.Canvas.getFrameEl().contentDocument;
    if (!doc || !doc.head) { setTimeout(() => setFramePreviewMode(on), 30); return; }
    let st = doc.getElementById('pf-preview-style');
    if (on) {
      if (!st) {
        st = doc.createElement('style');
        st.id = 'pf-preview-style';
        doc.head.appendChild(st);
      }
      st.textContent = 'body, body * { user-select: none !important; -webkit-user-select: none !important; cursor: default; } a, a * { cursor: pointer; } .gjs-selected, .gjs-hovered, .gjs-highlighted, .gjs-hover, [class*="gjs-selected"], [class*="gjs-highlight"], [class*="gjs-hover"] { outline: none !important; box-shadow: none !important; }';
    } else if (st) {
      st.remove();
    }
  } catch { /* 忽略 */ }
}
function bindPreviewFrame() {
  try {
    const frameDoc = editor.Canvas.getFrameEl().contentDocument;
    if (!frameDoc) { setTimeout(bindPreviewFrame, 50); return; }
    // 文档重建后若在预览模式，重新注入禁用文本选择样式
    if (document.body.classList.contains('preview-mode')) setFramePreviewMode(true);
    // 去重（iframe 文档重建后重绑）
    if (frameDoc.__pfPreviewHandler) frameDoc.removeEventListener('click', frameDoc.__pfPreviewHandler, true);
    frameDoc.__pfPreviewHandler = (e) => {
      if (!document.body.classList.contains('preview-mode')) return;
      e.stopPropagation(); // 阻止 GrapesJS 的选中/编辑处理
      const a = e.target.closest('a[href]');
      if (a) {
        const href = a.getAttribute('href');
        e.preventDefault();
        if (href.startsWith('#')) {
          // 锚点：多页切换（#页面名）或页内锚点
          const name = href.slice(1);
          const page = editor.Pages.getAll().find((p) => (p.getName() || p.getId()).trim() === name);
          if (page) editor.Pages.select(page.getId());
          // 普通锚点交给浏览器（iframe 内滚动）
        } else {
          window.open(href, '_blank'); // 外链新窗口（避免 iframe 导航替换编辑器）
        }
      }
    };
    frameDoc.addEventListener('click', frameDoc.__pfPreviewHandler, true);
    // 双击拦截：预览下禁止文本编辑/双击选词（GrapesJS 双击文本会进编辑模式）
    if (frameDoc.__pfDblHandler) frameDoc.removeEventListener('dblclick', frameDoc.__pfDblHandler, true);
    frameDoc.__pfDblHandler = (e) => {
      if (!document.body.classList.contains('preview-mode')) return;
      e.stopPropagation();
      e.preventDefault(); // 阻止浏览器双击选词 + GrapesJS 文本编辑
    };
    frameDoc.addEventListener('dblclick', frameDoc.__pfDblHandler, true);
  } catch { /* 忽略 */ }
}
editor.on('load', () => setTimeout(bindPreviewFrame, 800));
// iframe 文档重建（渲染/切页）后重绑——快速（切页后用户马上点导航也要能拦截）
try {
  const frameEl = editor.Canvas.getFrameEl();
  if (frameEl) frameEl.addEventListener('load', () => setTimeout(bindPreviewFrame, 60));
} catch { /* 忽略 */ }
// 切页事件后立即安排重绑（不等 iframe load，双保险；bindFrame 去重）
editor.on('page:select', () => setTimeout(bindPreviewFrame, 250));

// ============ 右侧面板 Tab（样式 / 图层 / 设置）============
// GrapesJS 默认右侧有 4 个图标按钮（样式/设置/布局/块），替换为清晰中文 Tab
function clickDefaultPanelBtn(title) {
  const btn = [...document.querySelectorAll('.gjs-pn-views .gjs-pn-btn')].find((b) => b.title === title);
  if (btn) { btn.click(); return true; }
  return false;
}
const rtabMap = {
  styles: '打开样式管理器',
  layers: '打开布局管理器',
  traits: '设置',
};
function closeAIPanelForTab() {
  // P1-1：AI 面板打开时切右侧 Tab → 先收起 AI 面板（让出右侧空间）
  if (document.body.classList.contains('ai-open')) {
    document.body.classList.remove('ai-open');
    const p = $('#ai-panel');
    const m = $('#ai-panel-mask');
    if (p) p.classList.remove('open');
    if (m) m.hidden = true;
  }
}
document.querySelectorAll('#right-tabs .rtab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#right-tabs .rtab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.tab === 'code') {
      // P1-2 代码视图：弹窗查看/编辑页面 HTML
      closeAIPanelForTab();
      $('#code-input').value = formatHtml(getPageHTML());
      openModal('modal-code');
      return;
    }
    closeAIPanelForTab();
    const title = rtabMap[tab.dataset.tab];
    if (title) clickDefaultPanelBtn(title);
    // 选中元素时"设置"才有内容；无选中时提示
    if (tab.dataset.tab === 'traits' && !editor.getSelected()) {
      const sc = document.querySelector('.gjs-pn-views-container');
      if (sc && sc.querySelector('.gjs-sm-sector, .gjs-layers, .gjs-trt-traits')) {
        // 默认 TraitManager 面板有空态提示，保持默认
      }
    }
  });
});

// ============ 轮播专属控制面板（2026-08-23）============
function isCarousel(comp) {
  return comp && comp.get('tagName') === 'div' && comp.getAttributes()['data-pf-carousel'] !== undefined;
}
function initCarouselPanel() {
  const panel = document.createElement('div');
  panel.id = 'carousel-panel';
  panel.hidden = true;
  document.body.appendChild(panel);
  const refresh = (comp) => {
    if (!isCarousel(comp)) { panel.hidden = true; return; }
    panel.hidden = false;
    const imgs = comp.find('img');
    const anim = comp.getAttributes()['data-an'] || 'fade';
    panel.innerHTML = `
      <div class="cp-head">🖼 轮播管理<button class="cp-close" title="收起">✕</button></div>
      <div class="cp-anim-row"><label>切换动画</label>
        <select id="cp-anim">
          <option value="fade" ${anim === 'fade' ? 'selected' : ''}>淡入淡出</option>
          <option value="slide" ${anim === 'slide' ? 'selected' : ''}>普通（滑动）</option>
          <option value="stack" ${anim === 'stack' ? 'selected' : ''}>层叠</option>
        </select>
      </div>
      <div class="cp-views">
        ${imgs.map((img, i) => `<div class="cp-view">
          <img class="cp-thumb" src="${(img.getAttributes().src || '').replace(/"/g, '&quot;')}">
          <span class="cp-vname">视觉 ${i + 1}</span>
          <span class="cp-vbtns"><button data-act="swap" data-i="${i}">换图</button><button data-act="del" data-i="${i}" class="danger">✕</button></span>
        </div>`).join('')}
      </div>
      <button class="cp-add">＋ 添加视图</button>`;
    panel.querySelector('.cp-close').addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('#cp-anim').addEventListener('change', (e) => {
      comp.setAttributes({ ...comp.getAttributes(), 'data-an': e.target.value });
      toast('切换动画：' + ({ fade: '淡入淡出', slide: '普通（滑动）', stack: '层叠' })[e.target.value]);
    });
    panel.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
      const i = +btn.dataset.i;
      const imgList = comp.find('img');
      const target = imgList[i];
      if (btn.dataset.act === 'swap' && target && window.__pfOpenImageModal) {
        window.__pfOpenImageModal(target);
      } else if (btn.dataset.act === 'del' && imgList.length > 1 && target) {
        target.remove();
        refresh(comp);
      }
    }));
    panel.querySelector('.cp-add').addEventListener('click', () => {
      const imgList = comp.find('img');
      const last = imgList[imgList.length - 1];
      const src = last.getAttributes().src || '';
      comp.append(`<img src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" alt="视觉${imgList.length + 1}">`);
      refresh(comp);
      toast('已添加视图，可右键该图片换图');
    });
  };
  editor.on('component:selected', (c) => refresh(c));
  editor.on('component:deselected', () => { panel.hidden = true; });
  editor.on('component:update', (c) => { if (isCarousel(c)) setTimeout(() => refresh(c), 120); });
}
initCarouselPanel();

// ============ 代码视图（P1-2）============
function getPageHTML() {
  try {
    return editor.getHtml().replace(/<body[^>]*>|<\/body>/g, '');
  } catch {
    return '';
  }
}
// 轻量 HTML 格式化（零依赖）：标签独立成行 + 缩进，方便在代码视图里阅读。
// 注意：格式化仅用于展示；"应用代码"按文本原样回贴（内联元素间换行折叠成一个空格，属可接受差异）
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
function formatHtml(html) {
  const tokens = html.replace(/\r?\n\s*/g, '').match(/<[^>]+>|[^<]+/g) || [];
  let depth = 0;
  const out = [];
  for (const tk of tokens) {
    if (/^<\//.test(tk)) {
      depth = Math.max(0, depth - 1);
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
$('#code-close').addEventListener('click', () => closeModal('modal-code'));
$('#code-refresh').addEventListener('click', () => {
  $('#code-input').value = formatHtml(getPageHTML());
  toast('已重新读取画布代码');
});
$('#code-apply').addEventListener('click', () => {
  const code = $('#code-input').value.trim();
  if (!code) { toast('代码为空'); return; }
  try {
    editor.getWrapper().components().reset();
    editor.setComponents(code);
    $('#code-input').value = getPageHTML();
    toast('代码已应用（Ctrl+Z 可撤销）');
    closeModal('modal-code');
  } catch (e) {
    toast('应用失败：' + e.message);
  }
});

// ============ 空画布引导态 ============
const guide = $('#canvas-guide');
function updateGuide() {
  if (!guide) return;
  // 删除当前页面的瞬间页面悬空，getComponents() 会返回 undefined（回归测试抓到的真 bug）
  const comps = editor.getComponents();
  const hasContent = !!comps && comps.length > 0;
  guide.hidden = hasContent || sessionStorage.getItem('pf-guide-dismissed') === '1';
}
editor.on('load', () => setTimeout(updateGuide, 800));
editor.on('component:add', () => setTimeout(updateGuide, 0));
editor.on('component:remove', () => setTimeout(updateGuide, 100));
document.getElementById('guide-template')?.addEventListener('click', () => {
  document.getElementById('btn-template')?.click();
  guide.hidden = true;
});
document.getElementById('guide-close')?.addEventListener('click', () => {
  sessionStorage.setItem('pf-guide-dismissed', '1');
  guide.hidden = true;
});

// ============ 开屏 + 三步引导（第一分钟体验）============
// 开屏只出现一次（视图 → 新手引导 可重看）；引导走完或跳过都记档
const WELCOME_KEY = 'pageforge-welcomed-v1';
const GUIDE_KEY = 'pageforge-guide-done-v1';
function showWelcome() { $('#welcome').hidden = false; }
function closeWelcome(markSeen = true) {
  $('#welcome').hidden = true;
  if (markSeen) localStorage.setItem(WELCOME_KEY, '1');
}
function guideSeen() { return !!localStorage.getItem(GUIDE_KEY); }
const GUIDE_STEPS = [
  { t: '① 从左边拖一个块', d: '组件库里全是现成的——试着把「三栏」拖到画布中间。', cls: 'gl-left', next: '下一步' },
  { t: '② 点画布，右边改样式', d: '点选任何元素：字体、颜色、间距即时生效，Ctrl+Z 随时后悔。', cls: 'gl-right', next: '下一步' },
  { t: '③ AI 帮拼 & 一键导出', d: '顶部 AI 菜单能拼块、配色、出初稿；完成后 文件 → 导出 得到独立 HTML。', cls: 'gl-toolbar', next: '完成' },
];
let guideIdx = 0;
function renderGuideStep() {
  const s = GUIDE_STEPS[guideIdx];
  document.body.classList.remove('gl-left', 'gl-right', 'gl-toolbar');
  document.body.classList.add(s.cls);
  $('#gf-title').textContent = s.t;
  $('#gf-text').textContent = s.d;
  $('#gf-next').textContent = s.next;
  [...document.querySelectorAll('.gf-dots i')].forEach((d, i) => d.classList.toggle('on', i <= guideIdx));
}
function startGuide() {
  guideIdx = 0;
  $('#guide-float').hidden = false;
  renderGuideStep();
}
function endGuide() {
  document.body.classList.remove('gl-left', 'gl-right', 'gl-toolbar');
  $('#guide-float').hidden = true;
  localStorage.setItem(GUIDE_KEY, '1');
}
$('#gf-next').addEventListener('click', () => {
  guideIdx++;
  if (guideIdx >= GUIDE_STEPS.length) { endGuide(); toast('引导完成，开始拼装吧 🧩'); } else renderGuideStep();
});
$('#gf-skip').addEventListener('click', () => endGuide());
// 开屏三条路径 + 关闭（关闭后若没走过引导，顺势进入三步引导）
$('#welcome-close').addEventListener('click', () => {
  closeWelcome();
  if (!guideSeen()) setTimeout(startGuide, 350);
});
$('#welcome').addEventListener('click', (e) => {
  if (e.target.id === 'welcome') {
    closeWelcome();
    if (!guideSeen()) setTimeout(startGuide, 350);
  }
});
$('#welcome-tpl').addEventListener('click', () => {
  closeWelcome(false);
  localStorage.setItem(GUIDE_KEY, '1');
  $('#btn-template').click();
});
$('#welcome-ai').addEventListener('click', () => {
  closeWelcome(false);
  localStorage.setItem(GUIDE_KEY, '1');
  document.getElementById('btn-ai').click();
  setTimeout(() => document.getElementById('ai-tool-gen')?.click(), 400);
});
$('#welcome-blank').addEventListener('click', () => {
  closeWelcome(false);
  localStorage.setItem(GUIDE_KEY, '1');
  editor.getWrapper().components().reset();
  editor.store();
  toast('画布已清空，从左边拖个块开始吧');
  setTimeout(startGuide, 350);
});
// 视图 → 新手引导（重看开屏）
$('#btn-welcome').addEventListener('click', () => showWelcome());
// 首次进入：画布就绪后弹开屏（editor load 后稍候，避免和画布首帧抢渲染）
editor.on('load', () => setTimeout(() => { if (!localStorage.getItem(WELCOME_KEY)) showWelcome(); }, 300));

// ============ 快捷键帮助（按 ? 弹出）============
const MODAL_KEYS = `<h3>快捷键</h3>
<table class="keys-table">
  <tr><td>撤销</td><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td></tr>
  <tr><td>恢复</td><td><kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td></tr>
  <tr><td>新建页面</td><td><kbd>Ctrl</kbd> + <kbd>N</kbd></td></tr>
  <tr><td>打开工程</td><td><kbd>Ctrl</kbd> + <kbd>O</kbd></td></tr>
  <tr><td>保存工程</td><td><kbd>Ctrl</kbd> + <kbd>S</kbd></td></tr>
  <tr><td>导出网页</td><td><kbd>Ctrl</kbd> + <kbd>E</kbd></td></tr>
  <tr><td>画布缩放</td><td><kbd>Ctrl</kbd> + 滚轮</td></tr>
  <tr><td>画布平移</td><td>按住 <kbd>空格</kbd> + 拖拽，或按住鼠标中键拖拽</td></tr>
  <tr><td>预览 / 退出预览</td><td><kbd>Esc</kbd></td></tr>
</table>`;
function openKeysModal() {
  const mask = document.getElementById('modal-mask');
  mask.querySelector('.modal h3').textContent = '快捷键';
  mask.querySelector('.modal p').textContent = '';
  const body = mask.querySelector('.modal .modal-actions');
  mask.querySelector('.modal').insertAdjacentHTML('beforeend', MODAL_KEYS.replace('<h3>快捷键</h3>', ''));
  openModal('modal-mask');
  // 清理重复插入
  const tables = mask.querySelectorAll('.keys-table');
  if (tables.length > 1) tables[0].remove();
}
document.addEventListener('keydown', (e) => {
  if (e.key === '?' && !isInputFocused() && !e.ctrlKey && !e.metaKey) {
    openKeysModal();
  }
});

// ============ M6 风格系统（一键换皮）============
let lastThemeId = null;
let pristineCompStyles = null; // 首次换皮前的组件样式快照（cid → style）
let pristineCssRules = null; // 首次换皮前的 CSS 规则快照（selector → style，body/伪元素等）
function snapshotPristine() {
  if (pristineCompStyles) return;
  // 若工程是上次换过主题后保存的，快照前先把主题色反向还原成原始色板，
  // 这样已保存的暖色页面切到其他主题时背景等颜色也能正确切换
  const savedThemeId = localStorage.getItem('pageforge-theme');
  const savedTheme = savedThemeId ? themes.find((t) => t.id === savedThemeId) : null;
  const rev = {};
  if (savedTheme) Object.entries(savedTheme.map).forEach(([from, to]) => { rev[to] = from; });
  const norm = (style) => {
    const s = JSON.parse(JSON.stringify(style || {}));
    if (savedTheme) {
      Object.keys(s).forEach((prop) => {
        if (typeof s[prop] === 'string') {
          Object.entries(rev).forEach(([cur, orig]) => {
            if (s[prop].includes(cur)) s[prop] = s[prop].split(cur).join(orig);
          });
        }
      });
    }
    return s;
  };
  pristineCompStyles = {};
  editor.getWrapper().find('*').forEach((c) => {
    pristineCompStyles[c.cid] = norm(c.get('style'));
  });
  pristineCssRules = {};
  editor.CssComposer.getAll().forEach((r) => {
    const sel = (r.getSelectors && r.getSelectors().getFullString()) || r.cid;
    pristineCssRules[sel] = norm(r.get('style'));
  });
}
// 把颜色映射 + 字体应用到一份样式对象
function applyMapToStyle(style, theme) {
  const next = {};
  Object.keys(style).forEach((prop) => {
    let v = style[prop];
    if (typeof v === 'string') {
      // 颜色映射替换（含 linear-gradient 内的颜色）
      Object.entries(theme.map).forEach(([from, to]) => {
        if (v.includes(from)) v = v.split(from).join(to);
      });
      // 字体替换
      if (prop === 'font-family' && theme.font && !v.includes(theme.font.split(',')[0].trim())) {
        v = theme.font;
      }
    }
    next[prop] = v;
  });
  return next;
}

// ===== 智能对比度修正：主题应用后，文字色与背景色接近时自动调亮/调暗 =====
function parseColor(str) {
  if (!str) return null;
  str = str.trim();
  if (str.startsWith('#')) {
    let h = str.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    if (isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = str.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  return null;
}
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
// 取元素的"实际背景色"：自身背景 → 祖先背景 → 页面默认背景
function getEffectiveBg(comp, bodyBg) {
  let cur = comp;
  while (cur) {
    const s = cur.get('style') || {};
    const bg = s['background-color'] || s.background;
    if (bg && bg !== 'transparent' && bg !== 'none') {
      const c = parseColor(bg);
      if (c) return c;
    }
    cur = cur.parent();
  }
  return parseColor(bodyBg) || [255, 255, 255];
}
// 主题应用后修正对比度（文字色与背景太接近 → 深底亮字/浅底深字）
// 在 iframe 渲染层遍历：组件样式在 CssComposer 规则里（avoidInlineStyle），组件 model style 为空
function fixContrast(theme) {
  try {
    const bodyBg = theme.bodyBg || '#ffffff';
    const doc = editor.Canvas.getFrameEl().contentDocument;
    if (!doc) return;
    doc.querySelectorAll('*').forEach((el) => {
      if (el === doc.body || el === doc.documentElement) return;
      const cs = getComputedStyle(el);
      const color = cs.color;
      if (!color || color === 'transparent') return;
      const fg = parseColor(color);
      if (!fg) return;
      // 实际背景：自身 + 祖先（跳过透明），最后回退页面背景
      let bg = null;
      let cur = el;
      while (cur && cur !== doc.body) {
        const b = getComputedStyle(cur).backgroundColor;
        if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') {
          const c = parseColor(b);
          if (c) { bg = c; break; }
        }
        cur = cur.parentElement;
      }
      if (!bg) bg = parseColor(bodyBg) || [255, 255, 255];
      const ratio = contrastRatio(fg, bg);
      if (ratio < 3.2) {
        const newColor = luminance(bg) < 0.35 ? '#f5f5f7' : '#1d1d1f';
        // 找到对应组件规则（GrapesJS 元素 id = 组件 id）改 color
        const id = el.id;
        if (id) {
          const rule = editor.CssComposer.getAll().find(
            (r) => (r.getSelectors && r.getSelectors().getFullString()) === '#' + id
          );
          if (rule) {
            rule.set('style', { ...rule.get('style'), color: newColor });
          }
        }
      }
    });
  } catch { /* 忽略 */ }
}
function applyTheme(theme) {
  // 首次换皮前记录原始样式（此后所有主题切换都从原始色板出发，任意切换不漂移）
  snapshotPristine();
  // 1. 组件样式：从快照恢复原始色板 → 应用主题
  editor.getWrapper().find('*').forEach((c) => {
    const base = pristineCompStyles[c.cid] ? JSON.parse(JSON.stringify(pristineCompStyles[c.cid])) : (c.get('style') || {});
    c.set('style', applyMapToStyle(base, theme));
  });
  // 2. 非组件 CSS 规则（body 背景/伪元素/媒体查询等）：同样从快照出发
  editor.CssComposer.getAll().forEach((r) => {
    const sel = (r.getSelectors && r.getSelectors().getFullString()) || r.cid;
    const base = pristineCssRules[sel] ? JSON.parse(JSON.stringify(pristineCssRules[sel])) : (r.get('style') || {});
    r.set('style', applyMapToStyle(base, theme));
  });
  lastThemeId = theme.id;
  // 记录当前主题（下次打开工程时快照前反向还原用）
  localStorage.setItem('pageforge-theme', theme.id);
  // 智能对比度修正：文字与背景太接近时自动调亮/调暗
  fixContrast(theme);
  // 触发画布刷新（渲染层更新）
  editor.select(editor.getSelected());
  editor.refresh();
}

function renderThemes() {
  const list = $('#theme-list');
  list.innerHTML = '';
  themes.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'theme-card' + (lastThemeId === t.id ? ' active' : '');
    card.innerHTML = `<div class="theme-swatches">${t.icon.map((c) => `<span style="background:${c}"></span>`).join('')}</div>
      <div class="theme-info"><div class="theme-name">${t.name}</div><div class="theme-desc">${t.desc}</div></div>`;
    card.addEventListener('click', () => {
      applyTheme(t);
      renderThemes();
      toast(`已应用「${t.name}」风格（Ctrl+Z 可撤销）`);
    });
    list.appendChild(card);
  });
}
$('#btn-theme').addEventListener('click', () => { renderThemes(); openModal('modal-theme'); });
$('#theme-close').addEventListener('click', () => closeModal('modal-theme'));

// ============ M7 素材系统（图标 / 图片 / 文案）============
const ltabBtns = document.querySelectorAll('#left-tabs .ltab');
ltabBtns.forEach((t) => {
  t.addEventListener('click', () => {
    ltabBtns.forEach((x) => x.classList.toggle('active', x === t));
    const mode = t.dataset.ltab;
    $('#left-blocks').hidden = mode !== 'blocks';
    $('#left-assets').hidden = mode !== 'assets';
    $('#block-search').style.display = mode === 'blocks' ? '' : 'none';
  });
});
let currentAssetTab = 'icons';
document.querySelectorAll('#asset-tabs .atab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('#asset-tabs .atab').forEach((x) => x.classList.toggle('active', x === t));
    currentAssetTab = t.dataset.atab;
    renderAssets();
  });
});
function insertAssetHTML(html) {
  const sel = editor.getSelected();
  if (sel && sel.parent()) {
    sel.parent().components().add(html, { at: sel.index() + 1 });
  } else {
    editor.getWrapper().components().add(html);
  }
  toast('已插入素材');
}
function renderAssets() {
  const body = $('#asset-body');
  body.innerHTML = '';
  if (currentAssetTab === 'icons') {
    const grid = document.createElement('div');
    grid.className = 'asset-icon-grid';
    assetIcons.forEach((ic) => {
      const el = document.createElement('div');
      el.className = 'asset-cell';
      el.title = ic.name;
      el.innerHTML = ic.svg;
      el.addEventListener('click', () => {
        insertAssetHTML(
          `<span class="pf-icon" style="display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:12px;color:#4f46e5;background:rgba(79,70,229,0.08);">${ic.svg.replace('width="22" height="22"', 'width="26" height="26"')}</span>`
        );
      });
      grid.appendChild(el);
    });
    body.appendChild(grid);
  } else if (currentAssetTab === 'images') {
    const cats = [...new Set(assetImages.map((i) => i.cat))];
    cats.forEach((cat) => {
      const h = document.createElement('div');
      h.className = 'asset-cat-title';
      h.textContent = cat;
      body.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'asset-img-grid';
      assetImages.filter((i) => i.cat === cat).forEach((img) => {
        const el = document.createElement('div');
        el.className = 'asset-img-cell';
        el.title = img.name;
        el.innerHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(img.svg)}" alt="${img.name}"><span>${img.name}</span>`;
        el.addEventListener('click', () => {
          insertAssetHTML(
            `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(img.svg)}" alt="${img.name}" style="width:100%;max-width:900px;border-radius:16px;display:block;margin:0 auto;">`
          );
        });
        grid.appendChild(el);
      });
      body.appendChild(grid);
    });
  } else {
    assetTexts.forEach((t) => {
      const el = document.createElement('div');
      el.className = 'asset-text-cell';
      el.title = `插入：${t.name}`;
      el.innerHTML = `<span>${t.name}</span>`;
      el.addEventListener('click', () => insertAssetHTML(t.html));
      body.appendChild(el);
    });
  }
}
renderAssets();

// ============ 工具栏下拉菜单（P0-1：文件/AI/工具/视图 分组）============
function closeAllDropdowns() {
  document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
  document.querySelectorAll('.dd-menu.open').forEach((m) => m.classList.remove('open'));
}
document.querySelectorAll('.dd').forEach((dd) => {
  const btn = dd.querySelector('.dd-btn');
  const menu = dd.querySelector('.dd-menu');
  if (!btn || !menu) return;
  // portal：菜单移出 toolbar 的 stacking context（否则被 GrapesJS iframe 合成层盖住），fixed 定位由 JS 控制
  document.body.appendChild(menu);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dd.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) {
      const r = btn.getBoundingClientRect();
      menu.style.top = r.bottom + 8 + 'px';
      menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 210)) + 'px';
      dd.classList.add('open');
      menu.classList.add('open');
    }
  });
  // 菜单项点击后关闭（stopPropagation 防止 document 点击抢先关闭）
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
  });
});
document.addEventListener('click', closeAllDropdowns);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllDropdowns();
});

// ============ 页面管理（多页面）============
// 默认页命名"首页"（GrapesJS 默认页 name 为空；load 后执行确保工程恢复后也生效）
function ensureDefaultPageName() {
  try {
    const cur = editor.Pages.getSelected();
    if (cur && !cur.getName()) cur.setName('首页');
  } catch { /* 忽略 */ }
}
editor.on('load', () => setTimeout(ensureDefaultPageName, 500));
ensureDefaultPageName();

function renderPages() {
  const list = $('#pages-list');
  list.innerHTML = '';
  const pages = editor.Pages.getAll();
  const cur = editor.Pages.getSelected();
  const curId = cur ? cur.getId() : '';
  pages.forEach(p => {
    const name = (p.getName() || (p.getId() === curId && pages.length === 1 ? '首页' : p.getId()) || '未命名').trim();
    const item = document.createElement('div');
    item.className = 'page-item' + (p.getId() === curId ? ' active' : '');
    item.innerHTML = `<span class="page-name">${name}</span>
      <span class="page-link-hint">#${name}</span>
      <button class="page-rename" title="重命名">✎</button>
      ${pages.length > 1 ? '<button class="page-del" title="删除页面">🗑</button>' : ''}`;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.page-rename')) { openPageRename(p); return; }
      if (e.target.closest('.page-del')) {
        openConfirm('删除页面', `删除「${name}」页面？此操作不可恢复。`, () => {
          editor.Pages.remove(p.getId());
          renderPages();
          toast('已删除页面');
        });
        return;
      }
      editor.Pages.select(p.getId());
      renderPages();
      toast(`已切换到「${name}」`);
    });
    list.appendChild(item);
  });
}

// 新增页面
$('#pages-add').addEventListener('click', () => {
  const count = editor.Pages.getAll().length + 1;
  const name = `页面 ${count}`;
  const id = 'page-' + Date.now().toString(36);
  const page = editor.Pages.add({ id, name, component: '<h1 style="text-align:center;padding:120px 24px;font-size:40px;color:#1e293b;">' + name + '</h1>' });
  editor.Pages.select(page.getId());
  renderPages();
  toast(`已新增「${name}」，可双击编辑内容`);
});

// 重命名页面
let renameTarget = null;
function openPageRename(p) {
  renameTarget = p;
  $('#page-name-input').value = p.getName() || '';
  openModal('modal-page-name');
  setTimeout(() => $('#page-name-input').focus(), 60);
}
$('#page-name-save').addEventListener('click', () => {
  const name = $('#page-name-input').value.trim();
  if (renameTarget && name) {
    renameTarget.setName(name);
    renderPages();
    toast('已重命名');
  }
  closeModal('modal-page-name');
});
$('#page-name-cancel').addEventListener('click', () => closeModal('modal-page-name'));

$('#btn-pages').addEventListener('click', () => { renderPages(); openModal('modal-pages'); });
$('#pages-close').addEventListener('click', () => closeModal('modal-pages'));

// 画布内点击导航链接（#页面名）→ 编辑器内直接切换页面预览
editor.on('load', () => {
  setTimeout(() => {
    try {
      const frameDoc = editor.Canvas.getFrameEl().contentDocument;
      frameDoc.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        const name = a.getAttribute('href').slice(1);
        const page = editor.Pages.getAll().find(p => (p.getName() || p.getId()).trim() === name);
        if (page) { e.preventDefault(); editor.Pages.select(page.getId()); toast(`已切换到「${name}」`); }
      });
    } catch { /* 忽略 */ }
  }, 800);
});

// ============ 撤销 / 恢复 ============
const btnUndo = $('#btn-undo');
const btnRedo = $('#btn-redo');
function updateUndoState() {
  try {
    const um = editor.UndoManager;
    btnUndo.disabled = !um.hasUndo();
    btnRedo.disabled = !um.hasRedo();
  } catch { /* 忽略 */ }
}
btnUndo.addEventListener('click', () => { editor.UndoManager.undo(); });
btnRedo.addEventListener('click', () => { editor.UndoManager.redo(); });
// 任何编辑/撤销/重做后刷新按钮状态
editor.on('update undo redo', updateUndoState);
editor.on('load', () => setTimeout(updateUndoState, 400));

// 撤销/恢复快捷键（Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z）
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) editor.UndoManager.redo();
    else editor.UndoManager.undo();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    editor.UndoManager.redo();
  }
});

// 首启动欢迎（M4：质感打磨）
if (!localStorage.getItem('pageforge-visited')) {
  localStorage.setItem('pageforge-visited', '1');
  setTimeout(() => toast('欢迎使用 PageForge！从左侧拖入组件开始设计'), 900);
}
