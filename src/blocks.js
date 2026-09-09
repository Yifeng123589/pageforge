// PageForge 组件块库 —— 深色编辑器 + 浅色页面（Tailwind slate/indigo 色系）

// 图片占位：渐变背景 + 图片图标（base64 SVG，导出后离线可用）
const PH = (w = 800, h = 450, label = '图片') => {
  const r = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
        <stop offset='0' stop-color='#f8fafc'/>
        <stop offset='1' stop-color='#e2e8f0'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' fill='url(#g)'/>
    <rect x='${w / 2 - 20}' y='${h / 2 - 20}' width='40' height='40' rx='8' fill='#cbd5e1'/>
    <circle cx='${w / 2 - 4}' cy='${h / 2 - 4}' r='7' fill='#94a3b8'/>
    <path d='M${w / 2 - 12} ${h / 2 + 8} L${w / 2 - 4} ${h / 2} L${w / 2 + 4} ${h / 2 + 6} L${w / 2 + 12} ${h / 2 - 2} L${w / 2 + 12} ${h / 2 + 12} Z' fill='#94a3b8'/>
    <text x='50%' y='${h / 2 + 38}' fill='#94a3b8' font-family='sans-serif' font-size='14' text-anchor='middle'>${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(r)))}`;
};

export const blocks = [
  {
    id: 'pf-scroll-reveal',
    category: '动效',
    label: '滚动粘性蒙版',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M4 8h16M4 16h16M8 4l-3 3 3 3M16 20l3-3-3-3\"/><rect x=\"10\" y=\"10\" width=\"4\" height=\"4\" rx=\"1\"/></svg>",
    content: `<section data-pf-sticky style="position:relative;height:180vh;background:#0b0b0f;">
  <div style="position:sticky;top:0;height:100vh;overflow:hidden;">
    <img src="${PH(1200, 800, '主视觉')}" data-pf-blur style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" alt="主视觉">
    <div data-pf-mask style="position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:0 24px 12vh;background:linear-gradient(to top,rgba(0,0,0,.8),rgba(0,0,0,.3) 45%,transparent 72%);pointer-events:none;">
      <div style="text-align:center;max-width:720px;pointer-events:auto;">
        <h2 style="color:#fff;font-size:44px;font-weight:700;margin:0 0 12px;text-shadow:0 2px 24px rgba(0,0,0,.4);">系列标题</h2>
        <p style="color:rgba(255,255,255,.85);font-size:17px;line-height:1.7;margin:0;">说明文字，随着滚动逐渐浮现。</p>
      </div>
    </div>
  </div>
</section>`,
  },
  {
    id: 'pf-carousel',
    category: '动效',
    label: '图片轮播',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3 12l5-5 4 4 3-3 6 6\"/><circle cx=\"16\" cy=\"9\" r=\"1.4\"/></svg>",
    content: `<div data-pf-carousel data-an="fade" style="position:relative;height:560px;overflow:hidden;">
  <img src="${PH(1200, 700, '视觉 1')}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" alt="视觉1">
  <img src="${PH(1200, 700, '视觉 2')}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" alt="视觉2">
  <img src="${PH(1200, 700, '视觉 3')}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" alt="视觉3">
  <style>
    [data-pf-carousel][data-an="fade"]>img{animation:pfCFade 10.8s infinite}
    [data-pf-carousel][data-an="fade"]>img:nth-of-type(2){animation-delay:3.6s}
    [data-pf-carousel][data-an="fade"]>img:nth-of-type(3){animation-delay:7.2s}
    [data-pf-carousel][data-an="slide"]>img{animation:pfCSlide 10.8s infinite}
    [data-pf-carousel][data-an="slide"]>img:nth-of-type(2){animation-delay:3.6s}
    [data-pf-carousel][data-an="slide"]>img:nth-of-type(3){animation-delay:7.2s}
    [data-pf-carousel][data-an="stack"]>img{animation:pfCStack 10.8s infinite}
    [data-pf-carousel][data-an="stack"]>img:nth-of-type(2){animation-delay:3.6s}
    [data-pf-carousel][data-an="stack"]>img:nth-of-type(3){animation-delay:7.2s}
    @keyframes pfCFade{0%{opacity:1}28%{opacity:1}33%{opacity:0}100%{opacity:0}}
    @keyframes pfCSlide{0%{opacity:1;transform:translateX(0)}28%{opacity:1;transform:translateX(0)}33%{opacity:0;transform:translateX(-40px)}100%{opacity:0;transform:translateX(-40px)}}
    @keyframes pfCStack{0%{opacity:0;transform:scale(1.06)}8%{opacity:1;transform:scale(1)}33%{opacity:1;transform:scale(1)}40%{opacity:1;transform:scale(1)}100%{opacity:1;transform:scale(1.04)}}
  </style>
</div>`,
  },
  {
    id: 'pf-marquee',
    category: '动效',
    label: '网格滚动条',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M4 5h16M4 12h16M4 19h16\"/><circle cx=\"8\" cy=\"5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"14\" cy=\"12\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"10\" cy=\"19\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/></svg>",
    content: `<div data-pf-marquee style="overflow:hidden;background:#0d0d0f;padding:48px 0;">
  <div data-pf-track style="display:flex;width:max-content;animation:pfMarquee 36s linear infinite;">
    <div style="flex-shrink:0;">
      <div style="display:flex;gap:16px;padding:0 8px;"><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""></div>
      <div style="display:flex;gap:16px;padding:0 8px 0 88px;"><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""></div>
    </div>
    <div style="flex-shrink:0;">
      <div style="display:flex;gap:16px;padding:0 8px;"><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""></div>
      <div style="display:flex;gap:16px;padding:0 8px 0 88px;"><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""><img src="${PH(220, 150, '封面')}" style="width:220px;border-radius:12px;display:block;transition:transform .4s;" alt=""></div>
    </div>
  </div>
  <style>@keyframes pfMarquee{to{transform:translateX(-50%)}}</style><style>[data-pf-marquee]:hover div{animation-play-state:paused}[data-pf-hover]:hover img{transform:scale(1.08)}</style>
</div>`,
  },
  {
    id: 'pf-container',
    category: '布局',
    label: '容器',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/></svg>",
    content: `<div style="max-width:980px;margin:0 auto;padding:32px 24px;"></div>`,
  },
  {
    id: 'pf-columns-2',
    category: '布局',
    label: '双栏',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"4\" width=\"8.4\" height=\"16\" rx=\"1.5\"/><rect x=\"12.6\" y=\"4\" width=\"8.4\" height=\"16\" rx=\"1.5\"/></svg>",
    content: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:16px 0;">
  <div style="border-radius:12px;background:#f8fafc;padding:24px;min-height:80px;"><p style="margin:0;color:#94a3b8;">左栏</p></div>
  <div style="border-radius:12px;background:#f8fafc;padding:24px;min-height:80px;"><p style="margin:0;color:#94a3b8;">右栏</p></div>
</div>`,
  },
  {
    id: 'pf-columns-3',
    category: '布局',
    label: '三栏',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"2.6\" y=\"4\" width=\"5.6\" height=\"16\" rx=\"1\"/><rect x=\"9.2\" y=\"4\" width=\"5.6\" height=\"16\" rx=\"1\"/><rect x=\"15.8\" y=\"4\" width=\"5.6\" height=\"16\" rx=\"1\"/></svg>",
    content: `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:16px 0;">
  <div style="border-radius:12px;background:#f8fafc;padding:20px;min-height:60px;"></div>
  <div style="border-radius:12px;background:#f8fafc;padding:20px;min-height:60px;"></div>
  <div style="border-radius:12px;background:#f8fafc;padding:20px;min-height:60px;"></div>
</div>`,
  },
  {
    id: 'pf-spacer',
    category: '布局',
    label: '间距块',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M12 3v18M8 6l4-3 4 3M8 18l4 3 4-3\"/></svg>",
    content: `<div style="height:48px;"></div>`,
  },
  {
    id: 'pf-gallery',
    category: '布局',
    label: '网格画廊',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"3\" width=\"8\" height=\"8\" rx=\"1.2\"/><rect x=\"13\" y=\"3\" width=\"8\" height=\"8\" rx=\"1.2\"/><rect x=\"3\" y=\"13\" width=\"8\" height=\"8\" rx=\"1.2\"/><rect x=\"13\" y=\"13\" width=\"8\" height=\"8\" rx=\"1.2\"/></svg>",
    content: `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;padding:48px 24px;max-width:1100px;margin:0 auto;">
  <div data-pf-hover style="overflow:hidden;border-radius:14px;"><img src="${PH(600, 400, '作品 1')}" style="width:100%;display:block;transition:transform .45s cubic-bezier(.16,1,.3,1);" alt="作品1"></div>
  <div data-pf-hover style="overflow:hidden;border-radius:14px;"><img src="${PH(600, 400, '作品 2')}" style="width:100%;display:block;transition:transform .45s cubic-bezier(.16,1,.3,1);" alt="作品2"></div>
  <div data-pf-hover style="overflow:hidden;border-radius:14px;"><img src="${PH(600, 400, '作品 3')}" style="width:100%;display:block;transition:transform .45s cubic-bezier(.16,1,.3,1);" alt="作品3"></div>
  <div data-pf-hover style="overflow:hidden;border-radius:14px;"><img src="${PH(600, 400, '作品 4')}" style="width:100%;display:block;transition:transform .45s cubic-bezier(.16,1,.3,1);" alt="作品4"></div>
  <div data-pf-hover style="overflow:hidden;border-radius:14px;"><img src="${PH(600, 400, '作品 5')}" style="width:100%;display:block;transition:transform .45s cubic-bezier(.16,1,.3,1);" alt="作品5"></div>
  <div data-pf-hover style="overflow:hidden;border-radius:14px;"><img src="${PH(600, 400, '作品 6')}" style="width:100%;display:block;transition:transform .45s cubic-bezier(.16,1,.3,1);" alt="作品6"></div>
  <style>[data-pf-hover]:hover img{transform:scale(1.08)}</style>
</div>`,
  },
  {
    id: 'pf-media-cards',
    category: '布局',
    label: '媒体卡片',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"3\" width=\"8\" height=\"8\" rx=\"1.5\"/><rect x=\"13\" y=\"3\" width=\"8\" height=\"8\" rx=\"1.5\"/><rect x=\"3\" y=\"13\" width=\"8\" height=\"8\" rx=\"1.5\"/><rect x=\"13\" y=\"13\" width=\"8\" height=\"8\" rx=\"1.5\"/><rect x=\"5\" y=\"5\" width=\"4\" height=\"4\" fill=\"currentColor\" stroke=\"none\" opacity=\"0.35\"/></svg>",
    content: `<section style="max-width:1100px;margin:0 auto;padding:64px 24px;">
  <h2 style="font-size:32px;font-weight:700;text-align:center;margin:0 0 8px;color:#1e293b;">精选作品</h2>
  <p style="text-align:center;color:#64748b;margin:0 0 40px;line-height:1.7;">一句话介绍这个系列</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:24px;">
    <a href="#" data-pf-hover style="display:block;text-decoration:none;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 20px rgba(15,23,42,0.08);transition:transform 0.2s;">
      <img src="${PH(400, 300, '封面 1')}" style="width:100%;display:block;transition:transform .45s cubic-bezier(.16,1,.3,1);" alt="作品1">
      <div style="padding:16px;">
        <h3 style="font-size:18px;font-weight:700;margin:0 0 6px;color:#1e293b;">作品一</h3>
        <p style="font-size:13px;color:#64748b;margin:0;line-height:1.6;">一句话简介</p>
      </div>
    </a>
    <a href="#" data-pf-hover style="display:block;text-decoration:none;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 20px rgba(15,23,42,0.08);transition:transform 0.2s;">
      <img src="${PH(400, 300, '封面 2')}" style="width:100%;display:block;transition:transform .45s cubic-bezier(.16,1,.3,1);" alt="作品2">
      <div style="padding:16px;">
        <h3 style="font-size:18px;font-weight:700;margin:0 0 6px;color:#1e293b;">作品二</h3>
        <p style="font-size:13px;color:#64748b;margin:0;line-height:1.6;">一句话简介</p>
      </div>
    </a>
    <a href="#" data-pf-hover style="display:block;text-decoration:none;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 20px rgba(15,23,42,0.08);transition:transform 0.2s;">
      <img src="${PH(400, 300, '封面 3')}" style="width:100%;display:block;transition:transform .45s cubic-bezier(.16,1,.3,1);" alt="作品3">
      <div style="padding:16px;">
        <h3 style="font-size:18px;font-weight:700;margin:0 0 6px;color:#1e293b;">作品三</h3>
        <p style="font-size:13px;color:#64748b;margin:0;line-height:1.6;">一句话简介</p>
      </div>
    </a>
  </div>
  <style>[data-pf-hover]:hover img{transform:scale(1.08)}</style>
</section>`,
  },
  {
    id: 'pf-grid-2',
    category: '布局',
    label: '双栏栅格',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"4\" width=\"8.4\" height=\"7.5\" rx=\"1.2\"/><rect x=\"12.6\" y=\"4\" width=\"8.4\" height=\"7.5\" rx=\"1.2\"/><rect x=\"3\" y=\"12.5\" width=\"8.4\" height=\"7.5\" rx=\"1.2\"/><rect x=\"12.6\" y=\"12.5\" width=\"8.4\" height=\"7.5\" rx=\"1.2\"/></svg>",
    content: `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:24px;padding:24px;"></div>`,
  },
  {
    id: 'pf-grid-3',
    category: '布局',
    label: '三栏栅格',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"2.6\" y=\"3.5\" width=\"5.6\" height=\"7.2\" rx=\"1\"/><rect x=\"9.2\" y=\"3.5\" width=\"5.6\" height=\"7.2\" rx=\"1\"/><rect x=\"15.8\" y=\"3.5\" width=\"5.6\" height=\"7.2\" rx=\"1\"/><rect x=\"2.6\" y=\"12.3\" width=\"5.6\" height=\"7.2\" rx=\"1\"/><rect x=\"9.2\" y=\"12.3\" width=\"5.6\" height=\"7.2\" rx=\"1\"/><rect x=\"15.8\" y=\"12.3\" width=\"5.6\" height=\"7.2\" rx=\"1\"/></svg>",
    content: `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:24px;"></div>`,
  },
  {
    id: 'pf-grid-4',
    category: '布局',
    label: '四栏栅格',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"2.2\" y=\"3.5\" width=\"4.4\" height=\"7.2\" rx=\"0.8\"/><rect x=\"7.8\" y=\"3.5\" width=\"4.4\" height=\"7.2\" rx=\"0.8\"/><rect x=\"13.4\" y=\"3.5\" width=\"4.4\" height=\"7.2\" rx=\"0.8\"/><rect x=\"19\" y=\"3.5\" width=\"2.8\" height=\"7.2\" rx=\"0.8\"/><rect x=\"2.2\" y=\"12.3\" width=\"4.4\" height=\"7.2\" rx=\"0.8\"/><rect x=\"7.8\" y=\"12.3\" width=\"4.4\" height=\"7.2\" rx=\"0.8\"/><rect x=\"13.4\" y=\"12.3\" width=\"4.4\" height=\"7.2\" rx=\"0.8\"/><rect x=\"19\" y=\"12.3\" width=\"2.8\" height=\"7.2\" rx=\"0.8\"/></svg>",
    content: `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px;padding:24px;"></div>`,
  },
  {
    id: 'pf-footer',
    category: '布局',
    label: '页脚',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M5 8h14M5 12h14M5 16h9\"/></svg>",
    ai: {
      desc: '页脚。构成：品牌名+一句话介绍+3组链接+版权行。用于页面底部收尾。',
      when: ['页脚', '底部', '收尾', '版权', '备案'],
      not: '营销 CTA 横幅（用 渐变行动横幅）',
      slots: {
        brand: { label: '品牌名', type: 'text', max: 20 },
        intro: { label: '一句话介绍', type: 'text', max: 40 },
      },
    },
    content: `<footer style="background:#0d0d0f;color:#a1a1aa;padding:56px 24px 32px;">
  <div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:40px;">
    <div>
      <p style="margin:0 0 12px;font-size:20px;font-weight:800;color:#fff;"><span data-pf-slot="brand">你的品牌</span></p>
      <p style="margin:0;font-size:14px;line-height:1.7;"><span data-pf-slot="intro">一句话介绍你的产品，让访客知道你是做什么的。</span></p>
    </div>
    <div>
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#fff;">产品</p>
      <p style="margin:0 0 8px;font-size:14px;">功能</p>
      <p style="margin:0 0 8px;font-size:14px;">价格</p>
      <p style="margin:0;font-size:14px;">更新</p>
    </div>
    <div>
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#fff;">公司</p>
      <p style="margin:0 0 8px;font-size:14px;">关于我们</p>
      <p style="margin:0 0 8px;font-size:14px;">加入我们</p>
      <p style="margin:0;font-size:14px;">联系</p>
    </div>
    <div>
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#fff;">资源</p>
      <p style="margin:0 0 8px;font-size:14px;">文档</p>
      <p style="margin:0 0 8px;font-size:14px;">博客</p>
      <p style="margin:0;font-size:14px;">社区</p>
    </div>
  </div>
  <div style="max-width:1100px;margin:32px auto 0;padding-top:24px;border-top:1px solid #27272a;text-align:center;font-size:13px;">© 2026 <span data-pf-slot="brand">你的品牌</span>. All rights reserved.</div>
</footer>`,
  },
  {
    id: 'pf-announce',
    category: '内容',
    label: '公告条',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 11l18-7-4 14-5-4-4 3v-5z\"/><path d=\"M12 14l6-8\"/></svg>",
    content: `<div style="background:#0078d4;color:#ffffff;text-align:center;padding:10px 16px;font-size:14px;line-height:1.6;">
  开学季促销：热门商品限时优惠&nbsp;<a href="#" style="color:#ffffff;text-decoration:underline;font-weight:600;">立即选购 →</a>
</div>`,
  },
  {
    id: 'pf-breadcrumb',
    category: '内容',
    label: '面包屑',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 6l6 6-6 6\"/></svg>",
    content: `<nav style="max-width:1100px;margin:0 auto;padding:16px 24px;font-size:13px;color:#86868b;">
  <a href="#" style="color:#86868b;text-decoration:none;">首页</a>
  <span style="margin:0 8px;color:#c7c7cc;">›</span>
  <a href="#" style="color:#86868b;text-decoration:none;">关于我们</a>
  <span style="margin:0 8px;color:#c7c7cc;">›</span>
  <span style="color:#1d1d1f;">公司简介</span>
</nav>`,
  },
  {
    id: 'pf-anchor-nav',
    category: '内容',
    label: '页内导航',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M4 6h16M4 12h16M4 18h16\"/><circle cx=\"9\" cy=\"6\" r=\"1.4\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15\" cy=\"12\" r=\"1.4\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"11\" cy=\"18\" r=\"1.4\" fill=\"currentColor\" stroke=\"none\"/></svg>",
    content: `<nav style="max-width:1100px;margin:0 auto;padding:12px 24px;display:flex;gap:28px;flex-wrap:wrap;border-bottom:1px solid #e5e5ea;">
  <a href="#" style="color:#1d1d1f;font-size:15px;font-weight:600;text-decoration:none;border-bottom:2px solid #0071e3;padding-bottom:10px;">公司简介</a>
  <a href="#" style="color:#6e6e73;font-size:15px;text-decoration:none;padding-bottom:10px;">管理团队</a>
  <a href="#" style="color:#6e6e73;font-size:15px;text-decoration:none;padding-bottom:10px;">小米文化</a>
  <a href="#" style="color:#6e6e73;font-size:15px;text-decoration:none;padding-bottom:10px;">发展经历</a>
  <a href="#" style="color:#6e6e73;font-size:15px;text-decoration:none;padding-bottom:10px;">小米新闻</a>
</nav>`,
  },
  {
    id: 'pf-heading',
    category: '基础',
    label: '大标题',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M6 5v14M18 5v14M6 12h12\"/></svg>",
    content: `<h1 style="font-size:48px;font-weight:700;letter-spacing:-0.5px;line-height:1.15;margin:0 0 16px;color:#1e293b;">大标题</h1>`,
  },
  {
    id: 'pf-subheading',
    category: '基础',
    label: '副标题',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M7 6v12M17 6v12M7 12h10\"/></svg>",
    content: `<h2 style="font-size:32px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;margin:0 0 12px;color:#1e293b;">副标题</h2>`,
  },
  {
    id: 'pf-paragraph',
    category: '基础',
    label: '段落',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M4 6h16M4 12h11M4 18h14\"/></svg>",
    content: `<p style="font-size:17px;line-height:1.7;color:#64748b;margin:0 0 16px;">这是一段正文文字，用来描述你的产品或内容。可以选中后在右侧调整字体、颜色与间距。</p>`,
  },
  {
    id: 'pf-button',
    category: '基础',
    label: '按钮',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"8\" width=\"18\" height=\"8\" rx=\"4\"/><path d=\"M8.5 12h7\"/></svg>",
    content: `<a href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 28px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;cursor:pointer;">按钮</a>`,
  },
  {
    id: 'pf-button-ghost',
    category: '基础',
    label: '描边按钮',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"><rect x=\"3\" y=\"8\" width=\"18\" height=\"8\" rx=\"4\"/><path d=\"M8.5 12h7\"/></svg>",
    content: `<a href="#" style="display:inline-block;background:#ffffff;color:#1e293b;border:1.5px solid #e2e8f0;padding:10.5px 27px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;cursor:pointer;">按钮</a>`,
  },
  {
    id: 'pf-image',
    category: '基础',
    label: '图片',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"8.5\" cy=\"10\" r=\"1.5\"/><path d=\"M21 15l-5-5L5 21\"/></svg>",
    content: `<img src="${PH()}" alt="图片" style="width:100%;max-width:800px;margin:0 auto;border-radius:12px;display:block;">`,
  },
  {
    id: 'pf-divider',
    category: '基础',
    label: '分隔线',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M4 12h16\"/></svg>",
    content: `<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">`,
  },
  {
    id: 'pf-badge',
    category: '基础',
    label: '徽章',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"5\" y=\"8\" width=\"14\" height=\"8\" rx=\"4\"/><path d=\"M9.5 12h5\"/></svg>",
    content: `<span style="display:inline-block;background:#eef2ff;color:#4f46e5;padding:5px 14px;border-radius:6px;font-size:14px;font-weight:600;">新功能</span>`,
  },
  {
    id: 'pf-navbar',
    category: '组件',
    label: '导航栏',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M7 9h10M7 13h7M7 17h10\"/></svg>",
    content: `<nav style="display:flex;justify-content:space-between;align-items:center;padding:14px 24px;background:#f8fafc;border-radius:12px;">
  <div style="font-weight:700;font-size:18px;color:#1e293b;">Logo</div>
  <div style="display:flex;gap:24px;font-size:15px;">
    <a href="#" style="text-decoration:none;color:#1e293b;">首页</a>
    <a href="#" style="text-decoration:none;color:#64748b;">功能</a>
    <a href="#" style="text-decoration:none;color:#64748b;">关于</a>
  </div>
  <a href="#" style="background:#4f46e5;color:#ffffff;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">开始</a>
</nav>`,
  },
  {
    id: 'pf-card',
    category: '组件',
    label: '卡片',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"M3 17l6-6 12 12\"/></svg>",
    content: `<div style="max-width:360px;border-radius:16px;background:#ffffff;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden;">
  <img src="${PH(720, 400)}" alt="卡片图" style="width:100%;display:block;">
  <div style="padding:24px;">
    <h3 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#1e293b;">卡片标题</h3>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">卡片描述文字，简单介绍这个内容板块。</p>
    <a href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:9px 22px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">了解更多</a>
  </div>
</div>`,
  },
  {
    id: 'pf-form',
    category: '组件',
    label: '表单',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 9h10M7 13h10M7 17h5\"/></svg>",
    content: `<form style="display:flex;gap:12px;flex-wrap:wrap;">
  <input type="email" placeholder="输入你的邮箱" style="flex:1;min-width:200px;padding:12px 16px;border:1px solid #e2e8f0;border-radius:8px;font-size:15px;outline:none;">
  <button type="submit" style="background:#4f46e5;color:#ffffff;border:none;padding:12px 26px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">订阅</button>
</form>`,
  },
  {
    id: 'pf-quote',
    category: '组件',
    label: '引用',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 6h6v5H8a2 2 0 0 0 2 2v1a4 4 0 0 1-4-4v-4z\"/><path d=\"M14 6h6v5h-3a2 2 0 0 0 2 2v1a4 4 0 0 1-4-4v-4z\"/></svg>",
    content: `<blockquote style="margin:0;padding:20px 24px;border-left:4px solid #4f46e5;background:#f8fafc;border-radius:0 12px 12px 0;font-size:18px;font-style:normal;line-height:1.7;color:#1e293b;">「一句打动人的话」</blockquote>`,
  },
  {
    id: 'pf-list',
    category: '组件',
    label: '列表',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M9 6h11M9 12h11M9 18h11\"/><circle cx=\"4.5\" cy=\"6\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"4.5\" cy=\"12\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"4.5\" cy=\"18\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/></svg>",
    content: `<ul style="margin:0;padding-left:22px;font-size:16px;line-height:2;color:#1e293b;">
  <li>第一项</li>
  <li>第二项</li>
  <li>第三项</li>
</ul>`,
  },
  {
    id: 'pf-table',
    category: '组件',
    label: '表格',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"1.5\"/><path d=\"M3 9h18M3 14h18M9 9v11M15 9v11\"/></svg>",
    content: `<table style="width:100%;border-collapse:collapse;font-size:14px;color:#1e293b;">
  <thead>
    <tr>
      <th style="background:#0d0d0f;color:#fff;text-align:left;padding:12px 16px;">项目</th>
      <th style="background:#0d0d0f;color:#fff;text-align:left;padding:12px 16px;">数量</th>
      <th style="background:#0d0d0f;color:#fff;text-align:left;padding:12px 16px;">价格</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="border-bottom:1px solid #e2e8f0;padding:12px 16px;">示例项目一</td><td style="border-bottom:1px solid #e2e8f0;padding:12px 16px;">2</td><td style="border-bottom:1px solid #e2e8f0;padding:12px 16px;">¥199</td></tr>
    <tr style="background:#f8fafc;"><td style="border-bottom:1px solid #e2e8f0;padding:12px 16px;">示例项目二</td><td style="border-bottom:1px solid #e2e8f0;padding:12px 16px;">5</td><td style="border-bottom:1px solid #e2e8f0;padding:12px 16px;">¥499</td></tr>
    <tr><td style="padding:12px 16px;">示例项目三</td><td style="padding:12px 16px;">1</td><td style="padding:12px 16px;">¥99</td></tr>
  </tbody>
</table>`,
  },
  {
    id: 'pf-pricing',
    category: '组件',
    label: '定价表',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"2.5\" y=\"5\" width=\"5.8\" height=\"14\" rx=\"1.2\"/><rect x=\"9.1\" y=\"3\" width=\"5.8\" height=\"16\" rx=\"1.2\"/><rect x=\"15.7\" y=\"5\" width=\"5.8\" height=\"14\" rx=\"1.2\"/><path d=\"M5.5 9h.1M12.2 7h.1M18.9 9h.1\"/></svg>",
    content: `<section style="max-width:1100px;margin:0 auto;padding:80px 24px;">
  <h2 style="text-align:center;font-size:40px;font-weight:700;letter-spacing:-0.4px;margin:0 0 40px;color:#1e293b;">选择你的方案</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;align-items:start;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center;">
      <h3 style="margin:0 0 8px;font-size:18px;color:#64748b;">基础</h3>
      <p style="margin:0 0 20px;font-size:40px;font-weight:700;color:#0f172a;">¥19<span style="font-size:14px;color:#94a3b8;">/月</span></p>
      <p style="font-size:14px;color:#64748b;line-height:2;margin:0 0 24px;">1 个网站<br>10 页容量<br>基础支持</p>
      <a href="#" style="display:block;background:#0d0d0f;color:#fff;padding:12px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">开始使用</a>
    </div>
    <div style="background:#0d0d0f;border-radius:16px;padding:32px;text-align:center;color:#fff;transform:scale(1.03);">
      <h3 style="margin:0 0 8px;font-size:18px;color:#93c5fd;">专业</h3>
      <p style="margin:0 0 20px;font-size:40px;font-weight:700;">¥49<span style="font-size:14px;color:#94a3b8;">/月</span></p>
      <p style="font-size:14px;color:#cbd5e1;line-height:2;margin:0 0 24px;">10 个网站<br>无限容量<br>优先支持</p>
      <a href="#" style="display:block;background:#3b82f6;color:#fff;padding:12px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">最受欢迎</a>
    </div>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center;">
      <h3 style="margin:0 0 8px;font-size:18px;color:#64748b;">旗舰</h3>
      <p style="margin:0 0 20px;font-size:40px;font-weight:700;color:#0f172a;">¥99<span style="font-size:14px;color:#94a3b8;">/月</span></p>
      <p style="font-size:14px;color:#64748b;line-height:2;margin:0 0 24px;">无限网站<br>团队协作<br>专属顾问</p>
      <a href="#" style="display:block;background:#0d0d0f;color:#fff;padding:12px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">联系销售</a>
    </div>
  </div>
</section>`,
  },
  {
    id: 'pf-faq',
    category: '组件',
    label: '问答手风琴',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 8h10M7 12h10M7 16h6\"/><circle cx=\"17.5\" cy=\"16\" r=\"1.3\"/></svg>",
    content: `<section style="max-width:760px;margin:0 auto;padding:80px 24px;">
  <h2 style="text-align:center;font-size:36px;font-weight:700;letter-spacing:-0.4px;margin:0 0 32px;color:#1e293b;">常见问题</h2>
  <details style="border:1px solid #e2e8f0;border-radius:12px;padding:18px 22px;margin-bottom:12px;">
    <summary style="font-size:16px;font-weight:600;color:#0f172a;cursor:pointer;">怎么开始使用？</summary>
    <p style="margin:12px 0 0;font-size:15px;color:#64748b;line-height:1.7;">拖入组件、填写内容、一键导出 HTML，就这么简单。</p>
  </details>
  <details style="border:1px solid #e2e8f0;border-radius:12px;padding:18px 22px;margin-bottom:12px;">
    <summary style="font-size:16px;font-weight:600;color:#0f172a;cursor:pointer;">支持自己上传图片吗？</summary>
    <p style="margin:12px 0 0;font-size:15px;color:#64748b;line-height:1.7;">可以，选中图片在右侧设置里替换图片地址。</p>
  </details>
  <details style="border:1px solid #e2e8f0;border-radius:12px;padding:18px 22px;">
    <summary style="font-size:16px;font-weight:600;color:#0f172a;cursor:pointer;">导出的网页能在手机上打开吗？</summary>
    <p style="margin:12px 0 0;font-size:15px;color:#64748b;line-height:1.7;">可以，导出的页面自带手机适配。</p>
  </details>
</section>`,
  },
  {
    id: 'pf-timeline',
    category: '组件',
    label: '时间线',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M6 4v16\"/><circle cx=\"6\" cy=\"7\" r=\"1.6\"/><circle cx=\"6\" cy=\"12\" r=\"1.6\"/><circle cx=\"6\" cy=\"17\" r=\"1.6\"/><path d=\"M9.5 7h10M9.5 12h8M9.5 17h10\"/></svg>",
    content: `<section style="max-width:720px;margin:0 auto;padding:80px 24px;">
  <h2 style="font-size:36px;font-weight:700;letter-spacing:-0.4px;margin:0 0 40px;color:#1e293b;">发展历程</h2>
  <div style="border-left:3px solid #e2e8f0;padding-left:28px;">
    <div style="position:relative;margin-bottom:32px;">
      <span style="position:absolute;left:-36px;top:6px;width:13px;height:13px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 2px #3b82f6;"></span>
      <p style="margin:0;font-size:13px;font-weight:600;color:#3b82f6;">2024</p>
      <p style="margin:4px 0 0;font-size:17px;font-weight:600;color:#0f172a;">成立</p>
      <p style="margin:6px 0 0;font-size:14px;color:#64748b;line-height:1.6;">故事从这里开始。</p>
    </div>
    <div style="position:relative;margin-bottom:32px;">
      <span style="position:absolute;left:-36px;top:6px;width:13px;height:13px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 2px #3b82f6;"></span>
      <p style="margin:0;font-size:13px;font-weight:600;color:#3b82f6;">2025</p>
      <p style="margin:4px 0 0;font-size:17px;font-weight:600;color:#0f172a;">成长</p>
      <p style="margin:6px 0 0;font-size:14px;color:#64748b;line-height:1.6;">用户突破一万。</p>
    </div>
    <div style="position:relative;">
      <span style="position:absolute;left:-36px;top:6px;width:13px;height:13px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 2px #3b82f6;"></span>
      <p style="margin:0;font-size:13px;font-weight:600;color:#3b82f6;">2026</p>
      <p style="margin:4px 0 0;font-size:17px;font-weight:600;color:#0f172a;">走向世界</p>
      <p style="margin:6px 0 0;font-size:14px;color:#64748b;line-height:1.6;">你的故事也在继续。</p>
    </div>
  </div>
</section>`,
  },
  {
    id: 'pf-video',
    category: '组件',
    label: '视频嵌入',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M10 9.5l5 2.5-5 2.5z\"/></svg>",
    content: `<div style="max-width:900px;margin:0 auto;padding:48px 24px;">
  <div style="position:relative;padding-bottom:56.25%;height:0;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.12);">
    <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="视频" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>
  </div>
</div>`,
  },
  {
    id: 'pf-icon-btns',
    category: '组件',
    label: '图标按钮组',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"8\" width=\"18\" height=\"8\" rx=\"4\"/><circle cx=\"8\" cy=\"12\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"16\" cy=\"12\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/></svg>",
    content: `<div style="display:flex;gap:14px;justify-content:center;padding:48px 24px;flex-wrap:wrap;">
  <a href="#" style="display:inline-flex;align-items:center;gap:8px;background:#0d0d0f;color:#fff;padding:12px 24px;border-radius:980px;font-size:15px;font-weight:600;text-decoration:none;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
    视频
  </a>
  <a href="#" style="display:inline-flex;align-items:center;gap:8px;background:#ffffff;color:#0f172a;border:1.5px solid #e2e8f0;padding:12px 24px;border-radius:980px;font-size:15px;font-weight:600;text-decoration:none;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
    消息
  </a>
  <a href="#" style="display:inline-flex;align-items:center;gap:8px;background:#3b82f6;color:#fff;padding:12px 24px;border-radius:980px;font-size:15px;font-weight:600;text-decoration:none;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
    发送
  </a>
</div>`,
  },
  {
    id: 'pf-logos',
    category: '组件',
    label: '徽标墙',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"2.5\" y=\"5\" width=\"5.6\" height=\"4.5\" rx=\"1\"/><rect x=\"9.2\" y=\"5\" width=\"5.6\" height=\"4.5\" rx=\"1\"/><rect x=\"15.9\" y=\"5\" width=\"5.6\" height=\"4.5\" rx=\"1\"/><rect x=\"2.5\" y=\"12.5\" width=\"5.6\" height=\"4.5\" rx=\"1\"/><rect x=\"9.2\" y=\"12.5\" width=\"5.6\" height=\"4.5\" rx=\"1\"/><rect x=\"15.9\" y=\"12.5\" width=\"5.6\" height=\"4.5\" rx=\"1\"/></svg>",
    content: `<div style="display:flex;gap:40px;justify-content:center;align-items:center;flex-wrap:wrap;padding:48px 24px;opacity:0.55;">
  <span style="font-size:22px;font-weight:800;color:#64748b;">Acme</span>
  <span style="font-size:22px;font-weight:800;color:#64748b;">Globex</span>
  <span style="font-size:22px;font-weight:800;color:#64748b;">Initech</span>
  <span style="font-size:22px;font-weight:800;color:#64748b;">Umbrella</span>
  <span style="font-size:22px;font-weight:800;color:#64748b;">Stark</span>
  <span style="font-size:22px;font-weight:800;color:#64748b;">Wayne</span>
</div>`,
  },
  {
    id: 'pf-stats',
    category: '组件',
    label: '统计数字区',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M4 20V12M10 20V6M16 20V10M21 20H3\"/><path d=\"M4 12l6-6 6 4 5-5\"/></svg>",
    content: `<section style="background:#0d0d0f;padding:64px 24px;">
  <div style="max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:24px;text-align:center;">
    <div><p style="margin:0;font-size:44px;font-weight:800;color:#fff;">99<span style="color:#3b82f6;">%</span></p><p style="margin:8px 0 0;font-size:14px;color:#94a3b8;">满意度</p></div>
    <div><p style="margin:0;font-size:44px;font-weight:800;color:#fff;">10<span style="color:#3b82f6;">K+</span></p><p style="margin:8px 0 0;font-size:14px;color:#94a3b8;">用户</p></div>
    <div><p style="margin:0;font-size:44px;font-weight:800;color:#fff;">24<span style="color:#3b82f6;">/7</span></p><p style="margin:8px 0 0;font-size:14px;color:#94a3b8;">支持</p></div>
    <div><p style="margin:0;font-size:44px;font-weight:800;color:#fff;">50<span style="color:#3b82f6;">+</span></p><p style="margin:8px 0 0;font-size:14px;color:#94a3b8;">国家</p></div>
  </div>
</section>`,
  },
  {
    id: 'pf-hero',
    category: '苹果设计',
    label: '苹果大标题区',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M6 9h12M6 13h8M6 17h10\"/></svg>",
    content: `<section style="text-align:center;padding:110px 24px 100px;max-width:1000px;margin:0 auto;">
  <h1 style="font-size:56px;font-weight:700;letter-spacing:-0.8px;line-height:1.1;margin:0 0 18px;color:#1d1d1f;">让你的想法<br>大放异彩</h1>
  <p style="font-size:22px;line-height:1.6;color:#6e6e73;margin:0 auto 32px;max-width:620px;">用一句话描述你的产品，像苹果官网一样克制而有力。</p>
  <div style="display:flex;gap:32px;justify-content:center;">
    <a href="#" style="color:#2997ff;font-size:19px;text-decoration:none;">了解更多 ›</a>
    <a href="#" style="color:#2997ff;font-size:19px;text-decoration:none;">立即购买 ›</a>
  </div>
</section>`,
  },
  {
    id: 'pf-hero-img',
    category: '苹果设计',
    label: '大图主视觉',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"12\" rx=\"2\"/><circle cx=\"8\" cy=\"8\" r=\"1.2\"/><path d=\"M3 13l5-5 13 13\"/><path d=\"M8 19h8M12 17.5V21\"/></svg>",
    content: `<section style="padding:0;">
  <img src="${PH()}" alt="主视觉" style="width:100%;display:block;">
  <div style="text-align:center;padding:64px 24px 80px;">
    <h2 style="font-size:40px;font-weight:700;letter-spacing:-0.5px;margin:0 0 12px;color:#1d1d1f;">产品名称</h2>
    <p style="font-size:19px;color:#6e6e73;margin:0 0 24px;">一句话介绍，简洁有力。</p>
    <a href="#" style="color:#2997ff;font-size:17px;text-decoration:none;">了解更多 ›</a>
  </div>
</section>`,
  },
  {
    id: 'pf-hero-overlay',
    category: '苹果设计',
    label: '文字叠图标题区',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M7 10h10M7 14h6\"/></svg>",
    content: `<section style="position:relative;text-align:center;overflow:hidden;">
  <img src="${PH(1600, 900, '产品大图')}" alt="产品大图" style="width:100%;display:block;">
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0.2) 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;">
    <h2 style="font-size:48px;font-weight:700;letter-spacing:-0.5px;margin:0 0 12px;color:#ffffff;">产品名称</h2>
    <p style="font-size:21px;line-height:1.5;color:rgba(255,255,255,0.92);margin:0 0 20px;">一句话介绍产品，字叠在大图上，苹果官网的招牌布局。</p>
    <a href="#" style="color:#66bbff;font-size:18px;text-decoration:none;">了解更多 ›</a>
  </div>
</section>`,
  },
  {
    id: 'pf-nav-glass',
    category: '苹果设计',
    label: '毛玻璃导航',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"7\"/><path d=\"M7 9h10M7 13h7M7 17h10\"/></svg>",
    content: `<nav style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 24px;background:rgba(255,255,255,0.72);backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid rgba(0,0,0,0.08);position:sticky;top:0;z-index:50;">
  <div style="font-weight:700;font-size:17px;color:#1d1d1f;">Logo</div>
  <div style="display:flex;gap:28px;font-size:14px;font-weight:500;">
    <a href="#" style="text-decoration:none;color:#1d1d1f;">首页</a>
    <a href="#" style="text-decoration:none;color:#6e6e73;">产品</a>
    <a href="#" style="text-decoration:none;color:#6e6e73;">支持</a>
  </div>
  <a href="#" style="background:#1d1d1f;color:#ffffff;padding:7px 18px;border-radius:980px;font-size:13px;font-weight:600;text-decoration:none;">购买</a>
</nav>`,
  },
  {
    id: 'pf-card-glass',
    category: '苹果设计',
    label: '玻璃卡片',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"5\"/><path d=\"M8 9h8M8 13h5M8 17h8\"/></svg>",
    content: `<div style="border-radius:24px;background:rgba(255,255,255,0.6);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border:1px solid rgba(255,255,255,0.35);box-shadow:0 8px 40px rgba(0,0,0,0.08);padding:36px 32px;max-width:420px;">
  <h3 style="margin:0 0 10px;font-size:24px;font-weight:700;letter-spacing:-0.2px;color:#1d1d1f;">玻璃卡片</h3>
  <p style="margin:0;font-size:16px;line-height:1.6;color:#6e6e73;">放在深色或渐变背景上，毛玻璃质感会非常明显。</p>
</div>`,
  },
  {
    id: 'pf-section-split',
    category: '苹果设计',
    label: '双栏产品区(图左)',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"5\" width=\"9\" height=\"14\" rx=\"1.5\"/><circle cx=\"7.5\" cy=\"9\" r=\"1.2\"/><path d=\"M14 8h7M14 12h5M14 16h7\"/></svg>",
    content: `<section style="max-width:1100px;margin:0 auto;padding:80px 24px;">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;">
    <div style="border-radius:20px;background:linear-gradient(135deg,#e8e8ed,#f5f5f7);min-height:320px;display:flex;align-items:center;justify-content:center;color:#86868b;font-size:16px;font-weight:600;">产品图 / 截图</div>
    <div>
      <h2 style="font-size:36px;font-weight:700;letter-spacing:-0.4px;margin:0 0 14px;color:#1d1d1f;">产品亮点</h2>
      <p style="font-size:18px;line-height:1.7;color:#6e6e73;margin:0 0 24px;">右侧放文字说明，介绍产品最大的卖点，让用户一眼看懂价值。</p>
      <a href="#" style="color:#2997ff;font-size:17px;text-decoration:none;">了解更多 ›</a>
    </div>
  </div>
</section>`,
  },
  {
    id: 'pf-section-split-r',
    category: '苹果设计',
    label: '双栏产品区(文左)',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M3 8h7M3 12h5M3 16h7\"/><rect x=\"12\" y=\"5\" width=\"9\" height=\"14\" rx=\"1.5\"/><circle cx=\"16.5\" cy=\"9\" r=\"1.2\"/></svg>",
    content: `<section style="max-width:1100px;margin:0 auto;padding:80px 24px;">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;">
    <div>
      <h2 style="font-size:36px;font-weight:700;letter-spacing:-0.4px;margin:0 0 14px;color:#1d1d1f;">产品亮点</h2>
      <p style="font-size:18px;line-height:1.7;color:#6e6e73;margin:0 0 24px;">左侧放文字说明，介绍产品最大的卖点，让用户一眼看懂价值。</p>
      <a href="#" style="color:#2997ff;font-size:17px;text-decoration:none;">了解更多 ›</a>
    </div>
    <div style="border-radius:20px;background:linear-gradient(135deg,#e8e8ed,#f5f5f7);min-height:320px;display:flex;align-items:center;justify-content:center;color:#86868b;font-size:16px;font-weight:600;">产品图 / 截图</div>
  </div>
</section>`,
  },
  {
    id: 'pf-section-features',
    category: '苹果设计',
    label: '三栏特性区',
    ai: {
      desc: '三栏特性区。构成：大标题+副标题+三列（每列小标题+描述）。介绍产品功能/优势/服务。',
      when: ['三栏', '三个功能', '特性', '功能介绍', '优势', '服务介绍'],
      not: '空白三栏布局骨架（用 三栏）；双栏内容（用 双栏）',
      slots: {
        title: { label: '区块标题', type: 'text', max: 20 },
        sub: { label: '副标题', type: 'text', max: 40 },
        items: { label: '三项特性（每项"名称：描述"）', type: 'items', max: 3 },
      },
    },
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"2.5\" y=\"5\" width=\"5.6\" height=\"14\" rx=\"1.2\"/><rect x=\"9.2\" y=\"5\" width=\"5.6\" height=\"14\" rx=\"1.2\"/><rect x=\"15.9\" y=\"5\" width=\"5.6\" height=\"14\" rx=\"1.2\"/><path d=\"M5.5 9h.1M12.2 9h.1M18.9 9h.1\"/></svg>",
    content: `<section style="max-width:1100px;margin:0 auto;padding:80px 24px;text-align:center;">
  <h2 style="font-size:40px;font-weight:700;letter-spacing:-0.5px;margin:0 0 12px;color:#1d1d1f;"><span data-pf-slot="title">功能特性</span></h2>
  <p style="font-size:19px;color:#6e6e73;margin:0 0 48px;"><span data-pf-slot="sub">三栏介绍你的核心功能。</span></p>
  <div data-pf-items style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;text-align:left;">
    <div style="padding:24px;border-radius:18px;background:#f5f5f7;">
      <h3 style="margin:0 0 8px;font-size:19px;font-weight:700;color:#1d1d1f;">特性一</h3>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#6e6e73;">特性描述文字。</p>
    </div>
    <div style="padding:24px;border-radius:18px;background:#f5f5f7;">
      <h3 style="margin:0 0 8px;font-size:19px;font-weight:700;color:#1d1d1f;">特性二</h3>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#6e6e73;">特性描述文字。</p>
    </div>
    <div style="padding:24px;border-radius:18px;background:#f5f5f7;">
      <h3 style="margin:0 0 8px;font-size:19px;font-weight:700;color:#1d1d1f;">特性三</h3>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#6e6e73;">特性描述文字。</p>
    </div>
  </div>
</section>`,
  },
  {
    id: 'pf-cta-banner',
    category: '苹果设计',
    label: '渐变行动横幅',
    ai: {
      desc: '渐变行动横幅。构成：大标题+副文案+胶囊按钮。页面收尾促转化。',
      when: ['行动号召', 'CTA', '转化', '注册横幅', '立即开始'],
      not: '单个普通按钮（用 按钮）；页脚收尾（用 页脚）',
      slots: {
        title: { label: '主标题', type: 'text', max: 20 },
        sub: { label: '副文案', type: 'text', max: 50 },
        btn: { label: '按钮文字', type: 'text', max: 10 },
      },
    },
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"6\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M8 10h8M9.5 14h5\"/></svg>",
    content: `<section style="padding:96px 24px;text-align:center;background:linear-gradient(135deg,#f5f5f7 0%,#e8e8ed 100%);">
  <h2 style="font-size:44px;font-weight:700;letter-spacing:-0.5px;margin:0 0 14px;color:#1d1d1f;"><span data-pf-slot="title">现在就开始</span></h2>
  <p style="font-size:19px;color:#6e6e73;margin:0 0 32px;"><span data-pf-slot="sub">还等什么？几分钟就能拥有一个漂亮的页面。</span></p>
  <a href="#" style="display:inline-block;background:#1d1d1f;color:#ffffff;padding:14px 34px;border-radius:980px;font-size:17px;font-weight:600;text-decoration:none;"><span data-pf-slot="btn">立即开始</span></a>
</section>`,
  },
  {
    id: 'pf-quote-big',
    category: '苹果设计',
    label: '大字引用',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 5h6v6H8a2 2 0 0 0 2 2v2a5 5 0 0 1-5-5V5z\"/><path d=\"M14 5h6v6h-3a2 2 0 0 0 2 2v2a5 5 0 0 1-5-5V5z\"/></svg>",
    content: `<section style="max-width:900px;margin:0 auto;padding:88px 24px;text-align:center;">
  <blockquote style="margin:0;font-size:36px;font-weight:700;letter-spacing:-0.4px;line-height:1.35;color:#1d1d1f;">「伟大产品的细节，是看不见的。」</blockquote>
  <p style="margin:16px 0 0;font-size:16px;color:#86868b;">—— 某位设计师</p>
</section>`,
  },
  {
    id: 'pf-reveal',
    category: '苹果设计',
    label: '动效容器',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-dasharray=\"3 2.5\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/></svg>",
    content: `<div class="pf-reveal" data-reveal="up" style="padding:24px;border:2px dashed #cbd5e1;border-radius:16px;">
  <p style="margin:0;font-size:14px;color:#94a3b8;text-align:center;">👆 把组件块拖到本框中央（出现蓝色高亮后松手）—— 页面打开后滚动到此处会渐入出现</p>
</div>`,
  },
  {
    // ★新块（2026-08-23 华硕商城拆解）：商品列表区——左侧促销大图 + 右侧商品卡网格（电商核心/M5 高频）
    id: 'pf-shop-grid',
    category: '电商',
    label: '商品列表',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M8 4v16\"/><path d=\"M15 8h3M15 12h3M15 16h3\"/></svg>",
    content: `<section style="max-width:1300px;margin:0 auto;padding:48px 24px;">
  <h2 style="font-size:28px;font-weight:700;margin:0 0 24px;color:#1d1d1f;">热门活动</h2>
  <div style="display:grid;grid-template-columns:minmax(260px,1fr) 2.6fr;gap:20px;align-items:stretch;">
    <a href="#" style="display:flex;flex-direction:column;justify-content:center;align-items:flex-start;background:linear-gradient(135deg,#f5f5f7,#e8e8ed);border-radius:18px;padding:36px;text-decoration:none;">
      <span style="font-size:26px;font-weight:700;color:#1d1d1f;">无畏16 2026</span>
      <span style="font-size:14px;color:#6e6e73;margin:10px 0 22px;line-height:1.6;">锐龙 R7 8845H · 144Hz 高刷</span>
      <span style="background:#1d1d1f;color:#fff;padding:11px 26px;border-radius:8px;font-size:14px;font-weight:600;">立即抢购</span>
    </a>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">
      <a href="#" style="display:block;background:#fff;border:1px solid #e5e5ea;border-radius:16px;overflow:hidden;text-decoration:none;">
        <img src="${PH(300, 200, '商品')}" style="width:100%;height:150px;object-fit:cover;display:block;" alt="">
        <div style="padding:14px 16px;">
          <div style="font-size:14px;font-weight:600;color:#1d1d1f;line-height:1.4;">无畏16 锐龙版 超轻薄本</div>
          <div style="font-size:12px;color:#86868b;margin:6px 0 10px;line-height:1.5;">锐龙7 8845H 16G 512G 灰</div>
          <div style="font-size:16px;font-weight:700;color:#b00020;">¥5699<span style="font-size:12px;font-weight:400;color:#86868b;text-decoration:line-through;margin-left:6px;">¥5999</span></div>
        </div>
      </a>
      <a href="#" style="display:block;background:#fff;border:1px solid #e5e5ea;border-radius:16px;overflow:hidden;text-decoration:none;">
        <img src="${PH(300, 200, '商品')}" style="width:100%;height:150px;object-fit:cover;display:block;" alt="">
        <div style="padding:14px 16px;">
          <div style="font-size:14px;font-weight:600;color:#1d1d1f;line-height:1.4;">天选4 锐龙版 电竞本</div>
          <div style="font-size:12px;color:#86868b;margin:6px 0 10px;line-height:1.5;">R9 8945H 32G 1T 灰</div>
          <div style="font-size:16px;font-weight:700;color:#b00020;">¥7699<span style="font-size:12px;font-weight:400;color:#86868b;text-decoration:line-through;margin-left:6px;">¥7999</span></div>
        </div>
      </a>
      <a href="#" style="display:block;background:#fff;border:1px solid #e5e5ea;border-radius:16px;overflow:hidden;text-decoration:none;">
        <img src="${PH(300, 200, '商品')}" style="width:100%;height:150px;object-fit:cover;display:block;" alt="">
        <div style="padding:14px 16px;">
          <div style="font-size:14px;font-weight:600;color:#1d1d1f;line-height:1.4;">a豆14 Air 2026 联名款</div>
          <div style="font-size:12px;color:#86868b;margin:6px 0 10px;line-height:1.5;">AI9 365 32G 1T 蓝</div>
          <div style="font-size:16px;font-weight:700;color:#b00020;">¥8799<span style="font-size:12px;font-weight:400;color:#86868b;text-decoration:line-through;margin-left:6px;">¥9999</span></div>
        </div>
      </a>
      <a href="#" style="display:block;background:#fff;border:1px solid #e5e5ea;border-radius:16px;overflow:hidden;text-decoration:none;">
        <img src="${PH(300, 200, '商品')}" style="width:100%;height:150px;object-fit:cover;display:block;" alt="">
        <div style="padding:14px 16px;">
          <div style="font-size:14px;font-weight:600;color:#1d1d1f;line-height:1.4;">ROG 掌机 X 24G</div>
          <div style="font-size:12px;color:#86868b;margin:6px 0 10px;line-height:1.5;">全高清 120Hz 掌机</div>
          <div style="font-size:16px;font-weight:700;color:#b00020;">¥4599<span style="font-size:12px;font-weight:400;color:#86868b;text-decoration:line-through;margin-left:6px;">¥4999</span></div>
        </div>
      </a>
    </div>
  </div>
</section>`,
  },
  {
    // ★新块（2026-08-23 华硕商城拆解）：品类图标入口网格（电商/官网分类快捷入口）
    id: 'pf-category-icons',
    category: '电商',
    label: '品类图标',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M3 7h18M3 12h18M3 17h18\"/><circle cx=\"7\" cy=\"7\" r=\"1.4\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"13\" cy=\"12\" r=\"1.4\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"9\" cy=\"17\" r=\"1.4\" fill=\"currentColor\" stroke=\"none\"/></svg>",
    content: `<section style="max-width:1300px;margin:0 auto;padding:40px 24px;">
  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:18px;">
    <a href="#" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-decoration:none;background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:22px 10px;">
      <img src="${PH(48, 48, '类目')}" style="width:44px;height:44px;border-radius:12px;" alt="">
      <span style="font-size:13px;color:#1d1d1f;">笔记本</span>
    </a>
    <a href="#" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-decoration:none;background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:22px 10px;">
      <img src="${PH(48, 48, '类目')}" style="width:44px;height:44px;border-radius:12px;" alt="">
      <span style="font-size:13px;color:#1d1d1f;">台式机</span>
    </a>
    <a href="#" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-decoration:none;background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:22px 10px;">
      <img src="${PH(48, 48, '类目')}" style="width:44px;height:44px;border-radius:12px;" alt="">
      <span style="font-size:13px;color:#1d1d1f;">显卡</span>
    </a>
    <a href="#" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-decoration:none;background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:22px 10px;">
      <img src="${PH(48, 48, '类目')}" style="width:44px;height:44px;border-radius:12px;" alt="">
      <span style="font-size:13px;color:#1d1d1f;">显示器</span>
    </a>
    <a href="#" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-decoration:none;background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:22px 10px;">
      <img src="${PH(48, 48, '类目')}" style="width:44px;height:44px;border-radius:12px;" alt="">
      <span style="font-size:13px;color:#1d1d1f;">外设</span>
    </a>
    <a href="#" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-decoration:none;background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:22px 10px;">
      <img src="${PH(48, 48, '类目')}" style="width:44px;height:44px;border-radius:12px;" alt="">
      <span style="font-size:13px;color:#1d1d1f;">配件</span>
    </a>
  </div>
</section>`,
  },
  {
    // ★新块（2026-08-24 菜鸟教程拆解）：栏目链接网格——分类标题 + 链接列表卡片（文档站/目录页/资源导航标配）
    id: 'pf-link-grid',
    category: '内容',
    label: '栏目链接',
    media: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M7 6l4 4-4 4M13 14h5\"/></svg>",
    content: `<section style="max-width:1200px;margin:0 auto;padding:48px 24px;">
  <h2 style="font-size:24px;font-weight:700;color:#1d1d1f;margin:0 0 22px;">全部教程</h2>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
    <div style="background:#f5f5f7;border-radius:14px;padding:20px 22px;">
      <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#1d1d1f;">前端开发</h3>
      <div style="display:flex;flex-direction:column;gap:9px;">
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">HTML 教程</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">CSS 教程</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">JavaScript</a>
        <a href="#" style="font-size:14px;color:#86868b;text-decoration:none;">Vue / React</a>
      </div>
    </div>
    <div style="background:#f5f5f7;border-radius:14px;padding:20px 22px;">
      <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#1d1d1f;">后端开发</h3>
      <div style="display:flex;flex-direction:column;gap:9px;">
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Node.js 教程</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Python Django</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Java Spring</a>
        <a href="#" style="font-size:14px;color:#86868b;text-decoration:none;">Go 语言</a>
      </div>
    </div>
    <div style="background:#f5f5f7;border-radius:14px;padding:20px 22px;">
      <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#1d1d1f;">数据库</h3>
      <div style="display:flex;flex-direction:column;gap:9px;">
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">MySQL 教程</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">SQL 教程</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Redis</a>
        <a href="#" style="font-size:14px;color:#86868b;text-decoration:none;">MongoDB</a>
      </div>
    </div>
    <div style="background:#f5f5f7;border-radius:14px;padding:20px 22px;">
      <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#1d1d1f;">移动开发</h3>
      <div style="display:flex;flex-direction:column;gap:9px;">
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Android</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">iOS 开发</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Flutter</a>
        <a href="#" style="font-size:14px;color:#86868b;text-decoration:none;">React Native</a>
      </div>
    </div>
    <div style="background:#f5f5f7;border-radius:14px;padding:20px 22px;">
      <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#1d1d1f;">编程语言</h3>
      <div style="display:flex;flex-direction:column;gap:9px;">
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">C / C++</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Python</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Java</a>
        <a href="#" style="font-size:14px;color:#86868b;text-decoration:none;">C#</a>
      </div>
    </div>
    <div style="background:#f5f5f7;border-radius:14px;padding:20px 22px;">
      <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#1d1d1f;">DevOps</h3>
      <div style="display:flex;flex-direction:column;gap:9px;">
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Git 教程</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Docker</a>
        <a href="#" style="font-size:14px;color:#0071e3;text-decoration:none;">Linux</a>
        <a href="#" style="font-size:14px;color:#86868b;text-decoration:none;">CI / CD</a>
      </div>
    </div>
  </div>
</section>`,
  },
];
// 新建页面时的默认起始内容（本身即新手教程：拖块/AI/导出三个概念都露脸）
export const starterTemplate = `<section style="padding:88px 24px 72px;text-align:center;background:linear-gradient(180deg,#eef2ff 0%,#ffffff 78%);">
  <span style="display:inline-block;background:#ffffff;color:#4f46e5;padding:7px 18px;border-radius:999px;font-size:13.5px;font-weight:600;margin-bottom:24px;border:1px solid #e0e7ff;box-shadow:0 2px 10px rgba(79,70,229,.08);">🧩 PageForge · 可视化网页设计器</span>
  <h1 style="font-size:54px;font-weight:800;letter-spacing:-0.8px;line-height:1.12;margin:0 0 18px;color:#111827;">像拼乐高一样<br>拼出你的网页</h1>
  <p style="font-size:19px;line-height:1.75;color:#6b7280;max-width:560px;margin:0 auto 32px;">从左侧拖一个组件块到画布，或者把想法告诉 AI——<br>做完一键导出 HTML，不需要写一行代码。</p>
  <a href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:14px 34px;border-radius:999px;font-size:16.5px;font-weight:600;text-decoration:none;margin-right:12px;box-shadow:0 8px 24px rgba(79,70,229,.28);">开始拼装 ↓</a>
  <a href="#" style="display:inline-block;background:#ffffff;color:#374151;padding:13px 30px;border-radius:999px;font-size:16.5px;font-weight:600;text-decoration:none;border:1.5px solid #e5e7eb;">让 AI 帮我拼</a>
</section>
<section style="max-width:1080px;margin:0 auto;padding:72px 24px 84px;">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;">
    <div style="padding:32px 28px;border-radius:18px;background:#f8fafc;border:1px solid #eef2f7;">
      <div style="font-size:28px;line-height:1;margin-bottom:14px;">🧱</div>
      <h3 style="margin:0 0 8px;font-size:19px;font-weight:700;color:#111827;">拖拽拼装</h3>
      <p style="margin:0;font-size:14.5px;line-height:1.7;color:#6b7280;">左侧组件库里 51 个现成块，拖到画布就能用，样式随便改。</p>
    </div>
    <div style="padding:32px 28px;border-radius:18px;background:#f8fafc;border:1px solid #eef2f7;">
      <div style="font-size:28px;line-height:1;margin-bottom:14px;">🤖</div>
      <h3 style="margin:0 0 8px;font-size:19px;font-weight:700;color:#111827;">AI 帮你拼</h3>
      <p style="margin:0;font-size:14.5px;line-height:1.7;color:#6b7280;">点右上角 AI，说"加个页脚"或"整页换配色"，它直接动手。</p>
    </div>
    <div style="padding:32px 28px;border-radius:18px;background:#f8fafc;border:1px solid #eef2f7;">
      <div style="font-size:28px;line-height:1;margin-bottom:14px;">📤</div>
      <h3 style="margin:0 0 8px;font-size:19px;font-weight:700;color:#111827;">一键导出</h3>
      <p style="margin:0;font-size:14.5px;line-height:1.7;color:#6b7280;">文件 → 导出，得到一个独立的 HTML 文件，放哪都能打开。</p>
    </div>
  </div>
</section>
<footer style="padding:36px 24px;text-align:center;background:#fafafa;border-top:1px solid #f0f0f2;">
  <p style="margin:0;font-size:13px;color:#9ca3af;">PageForge · 拼装你的第一个页面 —— 试着双击这段文字改掉它</p>
</footer>`;
