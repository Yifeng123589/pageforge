// v2 起步模板（A0-3）：每个模板 = 一组预设好的画布元素。
//
// 为什么需要：新用户打开 v2 面对的是空白（或三个互不相干的裸块），无从下手。
// 模板让"第一分钟"就有东西可改——这是工程队列 A 批的第一问：能不能做出像样的页面。
//
// 布局约定：标准内容列宽 1200、x=120（1440 画布居中），元素纵向排列、间距 40；
//           海报模板例外（1080×1440 竖版，元素自由摆放）。
// 硬性要求：每个文字/图片叶子必须带 data-id（v2 规范 §3）——否则样式面板改不到、AI 也定位不到。
// 元素 type 取自规范白名单：'card' | 'hero' | 'text' | 'image' | 'shape'。

// ⚠️ 循环依赖约束：store.js 也 import 本文件（freshDoc 用"落地页"模板）。
// 因此本文件**顶层不得访问** BLOCK_TEMPLATES——只能在 build() 被调用时访问（那时它已就绪）。
import { T } from './factory.js';
import { BLOCK_TEMPLATES } from './store.js';

const COL_W = 1200;
const COL_X = 120;
const GAP = 40;

// 纵向堆叠：给出每段高度，自动计算 y
function stack(defs, startY = 40) {
  let y = startY;
  const elements = [];
  for (const d of defs) {
    const el = d.from ? d.from() : T(d.type || 'card', COL_X, y, COL_W, d.h, d.z ?? 1, d.style || {}, d.html);
    el.x = d.x ?? COL_X;
    el.y = y;
    el.width = d.w ?? COL_W;
    el.height = d.h;
    el.rotation = 0;
    el.opacity = 1;
    elements.push(el);
    y += d.h + GAP;
  }
  return { elements, bottom: y - GAP + 40 };
}

// —— 可复用的小段 ——
const NAV = (brand) => `
<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 30px;">
  <p data-id="p_logo" style="margin:0;font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.3px;">${brand}</p>
  <div style="display:flex;gap:28px;">
    <p data-id="p_n1" style="margin:0;font-size:14.5px;color:#4b5563;">产品</p>
    <p data-id="p_n2" style="margin:0;font-size:14.5px;color:#4b5563;">定价</p>
    <p data-id="p_n3" style="margin:0;font-size:14.5px;color:#4b5563;">关于</p>
  </div>
</div>`;

const HERO = (title, sub, btn) => `
<div style="text-align:center;padding:60px 48px;">
  <h1 data-id="h_title" style="margin:0 0 16px;font-size:46px;font-weight:800;letter-spacing:-1px;color:#111827;line-height:1.2;">${title}</h1>
  <p data-id="p_sub" style="margin:0 0 30px;font-size:18px;color:#6b7280;line-height:1.7;">${sub}</p>
  <a data-id="a_btn" href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:14px 34px;border-radius:999px;font-size:16px;font-weight:600;text-decoration:none;">${btn}</a>
</div>`;

const COPY = (brand) => `
<p data-id="p_copy" style="margin:0;text-align:center;font-size:13.5px;color:#9ca3af;">© 2026 ${brand} · 用 PageForge 制作</p>`;

export const STARTERS = [
  // —— 1. 空白（引导由 UI 层给出："拖入块，或从上方选一个模板"）——
  {
    id: 'blank',
    name: '空白画布',
    desc: '从零开始，自由摆放',
    build: () => ({
      stage: { width: 1440, height: 900, background: '#ffffff' },
      elements: [],
    }),
  },

  // —— 2. 落地页：导航 · 主视觉 · 三栏特性 · 行动号召 · 页脚 ——
  {
    id: 'landing',
    name: '落地页',
    desc: '导航 · 主视觉 · 三栏特性 · 行动号召 · 页脚',
    build() {
      const { elements, bottom } = stack([
        { h: 72, style: { background: '#ffffff', borderRadius: '14px' }, html: NAV('你的品牌') },
        {
          h: 340,
          type: 'hero',
          style: { background: 'linear-gradient(140deg,#eef2ff 0%,#ffffff 70%)', borderRadius: '18px' },
          html: HERO('打造你的下一个伟大产品', '简洁、现代、专业的页面，几分钟就能上线。', '立即开始'),
        },
        { from: BLOCK_TEMPLATES.features3, h: 380 },
        { from: BLOCK_TEMPLATES.cta, h: 240 },
        { from: BLOCK_TEMPLATES.footer, h: 190 },
      ]);
      return { stage: { width: 1440, height: bottom, background: '#f5f5f7' }, elements };
    },
  },

  // —— 3. 产品介绍：主视觉 · 图文两栏 · 页脚 ——
  {
    id: 'product',
    name: '产品介绍',
    desc: '主视觉 · 图文两栏 · 页脚',
    build() {
      const { elements, bottom } = stack([
        { h: 72, style: { background: '#ffffff', borderRadius: '14px' }, html: NAV('产品名') },
        {
          h: 320,
          type: 'hero',
          style: { background: '#ffffff', borderRadius: '18px' },
          html: HERO('重新定义工作方式', '介绍你的产品如何解决问题，让用户一眼看懂价值。', '免费试用'),
        },
        {
          h: 360,
          style: { background: '#ffffff', borderRadius: '18px' },
          html: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center;height:100%;padding:8px;">
  <div>
    <h3 data-id="h_feat" style="margin:0 0 12px;font-size:26px;font-weight:800;color:#111827;letter-spacing:-0.4px;">为什么选择我们</h3>
    <p data-id="p_feat" style="margin:0 0 18px;font-size:16px;line-height:1.75;color:#6b7280;">左侧放说明文字，右侧配图，形成清晰的产品介绍布局。</p>
    <p data-id="p_f1" style="margin:0 0 8px;font-size:15px;color:#111827;">· 核心优势一</p>
    <p data-id="p_f2" style="margin:0 0 8px;font-size:15px;color:#111827;">· 核心优势二</p>
    <p data-id="p_f3" style="margin:0;font-size:15px;color:#111827;">· 核心优势三</p>
  </div>
  <div style="height:100%;border-radius:16px;background:linear-gradient(135deg,#eef2ff,#e0e7ff);display:flex;align-items:center;justify-content:center;">
    <p data-id="p_shot" style="margin:0;font-size:16px;font-weight:600;color:#6366f1;">产品截图区域</p>
  </div>
</div>`,
        },
        { from: BLOCK_TEMPLATES.footer, h: 190 },
      ]);
      return { stage: { width: 1440, height: bottom, background: '#f5f5f7' }, elements };
    },
  },

  // —— 4. 个人主页：头像 · 简介 · 链接 · 页脚 ——
  {
    id: 'profile',
    name: '个人主页',
    desc: '头像 · 简介 · 链接 · 页脚',
    build() {
      const { elements, bottom } = stack([
        {
          h: 340,
          type: 'hero',
          style: { background: 'linear-gradient(160deg,#f8fafc 0%,#eef2ff 100%)', borderRadius: '18px' },
          html: `<div style="text-align:center;padding:48px 40px;">
  <div style="width:104px;height:104px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#818cf8);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
    <p data-id="p_avatar" style="margin:0;font-size:38px;font-weight:800;color:#ffffff;">我</p>
  </div>
  <h1 data-id="h_name" style="margin:0 0 10px;font-size:34px;font-weight:800;color:#111827;letter-spacing:-0.5px;">你的名字</h1>
  <p data-id="p_intro" style="margin:0;font-size:16.5px;line-height:1.75;color:#6b7280;">一句话介绍自己：做什么、擅长什么、想认识什么样的人。</p>
</div>`,
        },
        {
          h: 300,
          style: { background: '#ffffff', borderRadius: '18px' },
          html: `<div style="padding:36px 44px;">
  <h3 data-id="h_links" style="margin:0 0 20px;font-size:20px;font-weight:800;color:#111827;">找到我</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
    <div style="padding:16px 20px;border-radius:12px;background:#f5f5f7;"><p data-id="p_l1" style="margin:0;font-size:15px;font-weight:600;color:#111827;">邮件</p><p data-id="p_l2" style="margin:4px 0 0;font-size:14px;color:#6b7280;">your@mail.com</p></div>
    <div style="padding:16px 20px;border-radius:12px;background:#f5f5f7;"><p data-id="p_l3" style="margin:0;font-size:15px;font-weight:600;color:#111827;">社交账号</p><p data-id="p_l4" style="margin:4px 0 0;font-size:14px;color:#6b7280;">@yourname</p></div>
    <div style="padding:16px 20px;border-radius:12px;background:#f5f5f7;"><p data-id="p_l5" style="margin:0;font-size:15px;font-weight:600;color:#111827;">作品集</p><p data-id="p_l6" style="margin:4px 0 0;font-size:14px;color:#6b7280;">your.site</p></div>
    <div style="padding:16px 20px;border-radius:12px;background:#f5f5f7;"><p data-id="p_l7" style="margin:0;font-size:15px;font-weight:600;color:#111827;">微信</p><p data-id="p_l8" style="margin:4px 0 0;font-size:14px;color:#6b7280;">your_id</p></div>
  </div>
</div>`,
        },
        {
          h: 120,
          style: { background: '#ffffff', borderRadius: '18px' },
          html: `<div style="padding:44px 40px;">${COPY('你的名字')}</div>`,
        },
      ]);
      return { stage: { width: 1440, height: bottom, background: '#f5f5f7' }, elements };
    },
  },

  // —— 5. 活动海报（1080×1440 竖版，展示画布的自由摆放能力）——
  {
    id: 'poster',
    name: '活动海报',
    desc: '竖版 1080×1440 · 大标题 · 时间地点 · 报名',
    build() {
      return {
        stage: { width: 1080, height: 1440, background: '#0d0d0f' },
        elements: [
          T('hero', 80, 120, 920, 300, 1, {}, `
<h1 data-id="h_title" style="margin:0 0 18px;font-size:72px;font-weight:900;letter-spacing:-2px;line-height:1.05;color:#ffffff;">你的活动<br>名称在这里</h1>
<p data-id="p_sub" style="margin:0;font-size:20px;line-height:1.6;color:#a1a1aa;">一句让人想来的话。</p>`),
          T('card', 80, 450, 920, 120, 2, {}, `
<div style="display:flex;gap:40px;">
  <div><p data-id="p_d1" style="margin:0;font-size:14px;color:#71717a;letter-spacing:1px;">时间</p><p data-id="p_d2" style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">10 月 1 日 19:00</p></div>
  <div><p data-id="p_d3" style="margin:0;font-size:14px;color:#71717a;letter-spacing:1px;">地点</p><p data-id="p_d4" style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">城市 · 场地名</p></div>
</div>`),
          T('image', 80, 620, 920, 520, 3, { background: '#18181b', borderRadius: '20px' },
            `<img src="data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="920" height="520"><rect width="920" height="520" fill="#18181b"/><text x="460" y="268" font-family="sans-serif" font-size="26" fill="#52525b" text-anchor="middle">双击这里，或右键更换图片</text></svg>')}" alt="" data-id="img_main" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:20px;">`),
          T('card', 80, 1180, 920, 120, 4, {}, `
<a data-id="a_btn" href="#" style="display:block;text-align:center;background:#ffffff;color:#0d0d0f;padding:22px;border-radius:999px;font-size:20px;font-weight:700;text-decoration:none;">立即报名</a>`),
        ],
      };
    },
  },

  // —— 6. 博客文章：标题 · 正文 · 页脚 ——
  {
    id: 'article',
    name: '博客文章',
    desc: '标题 · 正文段落 · 页脚',
    build() {
      const { elements, bottom } = stack([
        {
          h: 260,
          type: 'hero',
          style: { background: '#ffffff', borderRadius: '18px' },
          html: `<div style="padding:52px 60px;">
  <p data-id="p_tag" style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:1.2px;color:#6366f1;">随笔</p>
  <h1 data-id="h_title" style="margin:0 0 14px;font-size:42px;font-weight:800;letter-spacing:-0.8px;color:#111827;line-height:1.25;">文章标题写在这里</h1>
  <p data-id="p_meta" style="margin:0;font-size:14.5px;color:#9ca3af;">2026 年 9 月 · 5 分钟读完</p>
</div>`,
        },
        {
          h: 420,
          style: { background: '#ffffff', borderRadius: '18px' },
          html: `<div style="padding:52px 60px;">
  <p data-id="p_b1" style="margin:0 0 20px;font-size:17px;line-height:1.9;color:#374151;">第一段：把你想说的第一件事写在这里。段落之间留出呼吸感，阅读体验会好很多。</p>
  <p data-id="p_b2" style="margin:0 0 20px;font-size:17px;line-height:1.9;color:#374151;">第二段：可以举一个例子，或者讲一个小故事，让读者更容易读下去。</p>
  <p data-id="p_b3" style="margin:0;font-size:17px;line-height:1.9;color:#374151;">第三段：收个尾，给读者一个可以带走的结论或问题。</p>
</div>`,
        },
        { from: BLOCK_TEMPLATES.footer, h: 190 },
      ]);
      return { stage: { width: 1440, height: bottom, background: '#f5f5f7' }, elements };
    },
  },
];

export const findByStarterId = (id) => STARTERS.find((s) => s.id === id) || null;
