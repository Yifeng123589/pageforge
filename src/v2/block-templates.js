// v2 原生画布块模板（D1）：带 data-id 叶子 + AI 槽位纯函数
// store.js / adapter 经 CANVAS_BY_BLOCK 引用；未登记的块仍走 makeElementFromHTML 降级（D1a）

import { T } from './factory.js';

/** 离线占位图（SVG dataURL，与 v1 blocks.js 同思路） */
function ph(w = 800, h = 450, label = '图片') {
  const r = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#f8fafc'/><stop offset='1' stop-color='#e2e8f0'/>
    </linearGradient></defs>
    <rect width='100%' height='100%' fill='url(#g)'/>
    <rect x='${w / 2 - 20}' y='${h / 2 - 20}' width='40' height='40' rx='8' fill='#cbd5e1'/>
    <text x='50%' y='${h / 2 + 38}' fill='#94a3b8' font-family='sans-serif' font-size='14' text-anchor='middle'>${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(r)))}`;
}

function setLeaf(elm, id, v, max = 50) {
  if (v == null || v === '') return;
  const n = elm.querySelector(`[data-id="${id}"]`);
  if (n) n.textContent = String(v).slice(0, max);
}

function withSlots(el, apply) {
  el.applySlots = apply;
  return el;
}

export const BLOCK_TEMPLATES = {
  cta: () => withSlots(T('cta', 120, 40, 1200, 240, 1,
    { padding: '56px 48px', background: 'linear-gradient(135deg,#eef2ff 0%,#ffffff 100%)', borderRadius: '16px', textAlign: 'center' },
    `<h2 data-id="h_title" style="font-size:40px;font-weight:800;letter-spacing:-0.5px;margin:0 0 12px;color:#111827;">现在就开始</h2> <p data-id="p_sub" style="font-size:17px;color:#6b7280;margin:0 0 28px;">几分钟就能拥有一个漂亮的页面。</p> <a data-id="a_btn" href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:13px 32px;border-radius:999px;font-size:16px;font-weight:600;text-decoration:none;">立即开始</a>`),
  (elm, s) => {
    setLeaf(elm, 'h_title', s.title, 20);
    setLeaf(elm, 'p_sub', s.sub);
    setLeaf(elm, 'a_btn', s.btn, 10);
  }),

  features3: () => withSlots(T('features3', 120, 300, 1200, 380, 2,
    { padding: '56px 48px', background: '#ffffff', borderRadius: '16px' },
    `<h2 data-id="h_title" style="text-align:center;font-size:36px;font-weight:800;letter-spacing:-0.5px;margin:0 0 10px;color:#111827;">功能特性</h2> <p data-id="p_sub" style="text-align:center;font-size:17px;color:#6b7280;margin:0 0 40px;">三栏介绍你的核心功能。</p> <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;"> <div style="padding:24px;border-radius:14px;background:#f5f5f7;"> <h3 data-id="h_c1" style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">极速</h3> <p data-id="p_c1" style="margin:0;font-size:14.5px;line-height:1.65;color:#6b7280;">秒开页面，极致性能。</p> </div> <div style="padding:24px;border-radius:14px;background:#f5f5f7;"> <h3 data-id="h_c2" style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">安全</h3> <p data-id="p_c2" style="margin:0;font-size:14.5px;line-height:1.65;color:#6b7280;">端到端加密。</p> </div> <div style="padding:24px;border-radius:14px;background:#f5f5f7;"> <h3 data-id="h_c3" style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">省心</h3> <p data-id="p_c3" style="margin:0;font-size:14.5px;line-height:1.65;color:#6b7280;">全自动备份。</p> </div> </div>`),
  (elm, s) => {
    setLeaf(elm, 'h_title', s.title, 20);
    setLeaf(elm, 'p_sub', s.sub);
    (Array.isArray(s.items) ? s.items : []).slice(0, 3).forEach((it, i) => {
      const seg = String(it).split(/[：:]/);
      setLeaf(elm, `h_c${i + 1}`, seg[0], 12);
      setLeaf(elm, `p_c${i + 1}`, seg.length >= 2 ? seg.slice(1).join('：') : '', 50);
    });
  }),

  footer: () => withSlots(T('footer', 120, 700, 1200, 190, 3,
    { padding: '40px 48px', background: '#0d0d0f', borderRadius: '16px' },
    `<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:40px;align-items:start;"> <div> <p data-id="p_brand" style="color:#ffffff;font-size:20px;font-weight:800;margin:0 0 10px;">你的品牌</p> <p data-id="p_intro" style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0;">一句话介绍你的产品，让访客知道你是做什么的。</p> </div> <div> <p data-id="p_l1" style="color:#e4e4e7;font-size:14px;font-weight:700;margin:0 0 8px;">产品</p> <p data-id="p_l2" style="color:#a1a1aa;font-size:14px;margin:0 0 6px;">功能</p> <p data-id="p_l3" style="color:#a1a1aa;font-size:14px;margin:0;">价格</p> </div> <div> <p data-id="p_l4" style="color:#e4e4e7;font-size:14px;font-weight:700;margin:0 0 8px;">公司</p> <p data-id="p_l5" style="color:#a1a1aa;font-size:14px;margin:0 0 6px;">关于我们</p> <p data-id="p_l6" style="color:#a1a1aa;font-size:14px;margin:0;">联系</p> </div> </div> <p data-id="p_copy" style="color:#71717a;font-size:13px;margin:24px 0 0;padding-top:20px;border-top:1px solid #27272a;text-align:center;">© 2026 你的品牌. All rights reserved.</p>`),
  (elm, s) => {
    if (s.brand) {
      setLeaf(elm, 'p_brand', s.brand, 20);
      setLeaf(elm, 'p_copy', `© ${new Date().getFullYear()} ${s.brand}. All rights reserved.`, 80);
    }
    setLeaf(elm, 'p_intro', s.intro);
  }),

  // —— D1 高频：导航栏（频率 #1）——
  navbar: () => withSlots(T('navbar', 120, 40, 1200, 72, 10,
    { padding: '14px 28px', background: '#f8fafc', borderRadius: '12px' },
    `<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:100%;box-sizing:border-box;">
  <div data-id="p_brand" style="font-weight:700;font-size:18px;color:#1e293b;">你的品牌</div>
  <div style="display:flex;gap:28px;font-size:15px;">
    <a data-id="a_l1" href="#" style="text-decoration:none;color:#1e293b;">首页</a>
    <a data-id="a_l2" href="#" style="text-decoration:none;color:#64748b;">功能</a>
    <a data-id="a_l3" href="#" style="text-decoration:none;color:#64748b;">关于</a>
  </div>
  <a data-id="a_cta" href="#" style="background:#4f46e5;color:#ffffff;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">开始</a>
</div>`),
  (elm, s) => {
    setLeaf(elm, 'p_brand', s.brand, 16);
    setLeaf(elm, 'a_cta', s.btn, 8);
    const links = Array.isArray(s.links) ? s.links : (s.links ? String(s.links).split(/[,，]/) : []);
    links.slice(0, 3).forEach((lab, i) => setLeaf(elm, `a_l${i + 1}`, lab.trim(), 8));
  }),

  // —— D1 高频：媒体卡片（频率 #4）——
  mediaCards: () => withSlots(T('mediaCards', 120, 200, 1200, 480, 2,
    { padding: '48px 40px', background: '#ffffff', borderRadius: '16px' },
    `<h2 data-id="h_title" style="font-size:32px;font-weight:700;text-align:center;margin:0 0 8px;color:#1e293b;">精选作品</h2>
<p data-id="p_sub" style="text-align:center;color:#64748b;margin:0 0 36px;line-height:1.7;">一句话介绍这个系列</p>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;">
  <div style="border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 20px rgba(15,23,42,0.08);">
    <img data-id="img_1" src="${ph(400, 260, '封面 1')}" alt="" style="width:100%;height:160px;object-fit:cover;display:block;">
    <div style="padding:16px;">
      <h3 data-id="h_c1" style="font-size:18px;font-weight:700;margin:0 0 6px;color:#1e293b;">作品一</h3>
      <p data-id="p_c1" style="font-size:13px;color:#64748b;margin:0;line-height:1.6;">一句话简介</p>
    </div>
  </div>
  <div style="border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 20px rgba(15,23,42,0.08);">
    <img data-id="img_2" src="${ph(400, 260, '封面 2')}" alt="" style="width:100%;height:160px;object-fit:cover;display:block;">
    <div style="padding:16px;">
      <h3 data-id="h_c2" style="font-size:18px;font-weight:700;margin:0 0 6px;color:#1e293b;">作品二</h3>
      <p data-id="p_c2" style="font-size:13px;color:#64748b;margin:0;line-height:1.6;">一句话简介</p>
    </div>
  </div>
  <div style="border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 20px rgba(15,23,42,0.08);">
    <img data-id="img_3" src="${ph(400, 260, '封面 3')}" alt="" style="width:100%;height:160px;object-fit:cover;display:block;">
    <div style="padding:16px;">
      <h3 data-id="h_c3" style="font-size:18px;font-weight:700;margin:0 0 6px;color:#1e293b;">作品三</h3>
      <p data-id="p_c3" style="font-size:13px;color:#64748b;margin:0;line-height:1.6;">一句话简介</p>
    </div>
  </div>
</div>`),
  (elm, s) => {
    setLeaf(elm, 'h_title', s.title, 20);
    setLeaf(elm, 'p_sub', s.sub);
    (Array.isArray(s.items) ? s.items : []).slice(0, 3).forEach((it, i) => {
      const seg = String(it).split(/[：:]/);
      setLeaf(elm, `h_c${i + 1}`, seg[0], 16);
      setLeaf(elm, `p_c${i + 1}`, seg.length >= 2 ? seg.slice(1).join('：') : '', 40);
    });
  }),

  // —— D1 高频：苹果大标题区（频率 #4 hero）——
  hero: () => withSlots(T('hero', 120, 80, 1200, 360, 1,
    { padding: '72px 48px', background: '#ffffff', borderRadius: '16px', textAlign: 'center' },
    `<h1 data-id="h_title" style="font-size:48px;font-weight:700;letter-spacing:-0.8px;line-height:1.15;margin:0 0 16px;color:#1d1d1f;">让你的想法大放异彩</h1>
<p data-id="p_sub" style="font-size:20px;line-height:1.6;color:#6e6e73;margin:0 auto 28px;max-width:620px;">用一句话描述你的产品，克制而有力。</p>
<div style="display:flex;gap:32px;justify-content:center;">
  <a data-id="a_primary" href="#" style="color:#2997ff;font-size:18px;text-decoration:none;">了解更多 ›</a>
  <a data-id="a_secondary" href="#" style="color:#2997ff;font-size:18px;text-decoration:none;">立即购买 ›</a>
</div>`),
  (elm, s) => {
    setLeaf(elm, 'h_title', s.title, 24);
    setLeaf(elm, 'p_sub', s.sub, 60);
    setLeaf(elm, 'a_primary', s.btn || s.primary, 12);
    setLeaf(elm, 'a_secondary', s.secondary, 12);
  }),

  // —— D1 高频：图片轮播（频率 #1；canvas 固定高 + 内联 CSS 淡入，导出保真）——
  carousel: () => withSlots(T('carousel', 0, 40, 1440, 420, 1,
    { background: '#0f172a', overflow: 'hidden' },
    `<div data-pf-carousel data-an="fade" style="position:relative;width:100%;height:100%;overflow:hidden;">
  <img data-id="img_1" src="${ph(1440, 420, '视觉 1')}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
  <img data-id="img_2" src="${ph(1440, 420, '视觉 2')}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
  <img data-id="img_3" src="${ph(1440, 420, '视觉 3')}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
  <style>
    [data-pf-carousel][data-an="fade"]>img{animation:pfCFade 10.8s infinite}
    [data-pf-carousel][data-an="fade"]>img:nth-of-type(2){animation-delay:3.6s}
    [data-pf-carousel][data-an="fade"]>img:nth-of-type(3){animation-delay:7.2s}
    @keyframes pfCFade{0%{opacity:1}28%{opacity:1}33%{opacity:0}100%{opacity:0}}
  </style>
</div>`),
  (elm, s) => {
    // 槽位可选：imgs 为 URL 数组；无则保留占位
    const imgs = Array.isArray(s.imgs) ? s.imgs : [];
    imgs.slice(0, 3).forEach((src, i) => {
      if (!src) return;
      const n = elm.querySelector(`[data-id="img_${i + 1}"]`);
      if (n) n.setAttribute('src', String(src));
    });
  }),

  // —— D1 第二批：大图主视觉 ——
  heroImg: () => withSlots(T('heroImg', 120, 40, 1200, 560, 1,
    { background: '#ffffff', borderRadius: '16px', overflow: 'hidden' },
    `<img data-id="img_main" src="${ph(1200, 360, '主视觉')}" alt="" style="width:100%;height:280px;object-fit:cover;display:block;">
<div style="text-align:center;padding:40px 40px 48px;">
  <h2 data-id="h_title" style="font-size:36px;font-weight:700;letter-spacing:-0.5px;margin:0 0 12px;color:#1d1d1f;">产品名称</h2>
  <p data-id="p_sub" style="font-size:18px;color:#6e6e73;margin:0 0 22px;">一句话介绍，简洁有力。</p>
  <a data-id="a_btn" href="#" style="color:#2997ff;font-size:17px;text-decoration:none;">了解更多 ›</a>
</div>`),
  (elm, s) => {
    setLeaf(elm, 'h_title', s.title, 24);
    setLeaf(elm, 'p_sub', s.sub, 60);
    setLeaf(elm, 'a_btn', s.btn, 12);
    if (s.img) {
      const n = elm.querySelector('[data-id="img_main"]');
      if (n) n.setAttribute('src', String(s.img));
    }
  }),

  // —— D1 第二批：毛玻璃导航（canvas 内 sticky 意义弱，做成顶部条即可）——
  navGlass: () => withSlots(T('navGlass', 120, 20, 1200, 64, 12,
    { padding: '12px 28px', background: 'rgba(255,255,255,0.72)', borderRadius: '999px', border: '1px solid rgba(0,0,0,0.08)' },
    `<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:100%;box-sizing:border-box;backdrop-filter:saturate(180%) blur(20px);">
  <div data-id="p_brand" style="font-weight:700;font-size:17px;color:#1d1d1f;">你的品牌</div>
  <div style="display:flex;gap:28px;font-size:14px;font-weight:500;">
    <a data-id="a_l1" href="#" style="text-decoration:none;color:#1d1d1f;">首页</a>
    <a data-id="a_l2" href="#" style="text-decoration:none;color:#6e6e73;">产品</a>
    <a data-id="a_l3" href="#" style="text-decoration:none;color:#6e6e73;">支持</a>
  </div>
  <a data-id="a_cta" href="#" style="background:#1d1d1f;color:#ffffff;padding:7px 18px;border-radius:980px;font-size:13px;font-weight:600;text-decoration:none;">购买</a>
</div>`),
  (elm, s) => {
    setLeaf(elm, 'p_brand', s.brand, 16);
    setLeaf(elm, 'a_cta', s.btn, 8);
    const links = Array.isArray(s.links) ? s.links : (s.links ? String(s.links).split(/[,，]/) : []);
    links.slice(0, 3).forEach((lab, i) => setLeaf(elm, `a_l${i + 1}`, lab.trim(), 8));
  }),

  // —— D1 第二批：公告条 ——
  announce: () => withSlots(T('announce', 120, 20, 1200, 48, 11,
    { padding: '10px 20px', background: '#0078d4', borderRadius: '10px', textAlign: 'center' },
    `<p style="margin:0;font-size:14px;line-height:1.6;color:#ffffff;">
  <span data-id="p_text">开学季促销：热门商品限时优惠</span>
  &nbsp;<a data-id="a_btn" href="#" style="color:#ffffff;text-decoration:underline;font-weight:600;">立即选购 →</a>
</p>`),
  (elm, s) => {
    setLeaf(elm, 'p_text', s.text || s.title, 60);
    setLeaf(elm, 'a_btn', s.btn, 12);
  }),

  // —— D1 第二批：双栏产品区（图左 / 文左一对）——
  sectionSplit: () => withSlots(T('sectionSplit', 120, 160, 1200, 380, 2,
    { padding: '48px 40px', background: '#ffffff', borderRadius: '16px' },
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;height:100%;">
  <img data-id="img_main" src="${ph(560, 320, '产品图')}" alt="" style="width:100%;height:280px;object-fit:cover;border-radius:20px;display:block;background:#e8e8ed;">
  <div>
    <h2 data-id="h_title" style="font-size:32px;font-weight:700;letter-spacing:-0.4px;margin:0 0 14px;color:#1d1d1f;">产品亮点</h2>
    <p data-id="p_sub" style="font-size:17px;line-height:1.7;color:#6e6e73;margin:0 0 24px;">右侧放文字说明，介绍产品最大的卖点，让用户一眼看懂价值。</p>
    <a data-id="a_btn" href="#" style="color:#2997ff;font-size:17px;text-decoration:none;">了解更多 ›</a>
  </div>
</div>`),
  applySplitSlots),

  sectionSplitR: () => withSlots(T('sectionSplitR', 120, 160, 1200, 380, 2,
    { padding: '48px 40px', background: '#ffffff', borderRadius: '16px' },
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;height:100%;">
  <div>
    <h2 data-id="h_title" style="font-size:32px;font-weight:700;letter-spacing:-0.4px;margin:0 0 14px;color:#1d1d1f;">产品亮点</h2>
    <p data-id="p_sub" style="font-size:17px;line-height:1.7;color:#6e6e73;margin:0 0 24px;">左侧放文字说明，介绍产品最大的卖点，让用户一眼看懂价值。</p>
    <a data-id="a_btn" href="#" style="color:#2997ff;font-size:17px;text-decoration:none;">了解更多 ›</a>
  </div>
  <img data-id="img_main" src="${ph(560, 320, '产品图')}" alt="" style="width:100%;height:280px;object-fit:cover;border-radius:20px;display:block;background:#e8e8ed;">
</div>`),
  applySplitSlots),
};

function applySplitSlots(elm, s) {
  setLeaf(elm, 'h_title', s.title, 24);
  setLeaf(elm, 'p_sub', s.sub, 80);
  setLeaf(elm, 'a_btn', s.btn, 12);
  if (s.img) {
    const n = elm.querySelector('[data-id="img_main"]');
    if (n) n.setAttribute('src', String(s.img));
  }
}

/** AI / 规则层块 id → 原生 canvas 工厂 */
export const CANVAS_BY_BLOCK = {
  'pf-cta-banner': BLOCK_TEMPLATES.cta,
  'pf-section-features': BLOCK_TEMPLATES.features3,
  'pf-footer': BLOCK_TEMPLATES.footer,
  'pf-navbar': BLOCK_TEMPLATES.navbar,
  'pf-media-cards': BLOCK_TEMPLATES.mediaCards,
  'pf-hero': BLOCK_TEMPLATES.hero,
  'pf-carousel': BLOCK_TEMPLATES.carousel,
  'pf-hero-img': BLOCK_TEMPLATES.heroImg,
  'pf-nav-glass': BLOCK_TEMPLATES.navGlass,
  'pf-announce': BLOCK_TEMPLATES.announce,
  'pf-section-split': BLOCK_TEMPLATES.sectionSplit,
  'pf-section-split-r': BLOCK_TEMPLATES.sectionSplitR,
};

/** 原生适配块 id 列表（回归 / 文档用） */
export const NATIVE_BLOCK_IDS = Object.keys(CANVAS_BY_BLOCK);
