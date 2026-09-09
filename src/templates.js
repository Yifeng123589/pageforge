// PageForge 模板库 —— 4 个起始模板（浅色页面风格，与现有块一致）

const nav = `<nav style="display:flex;justify-content:space-between;align-items:center;padding:14px 24px;background:#f8fafc;border-radius:12px;">
  <div style="font-weight:700;font-size:18px;color:#1e293b;">Logo</div>
  <div style="display:flex;gap:24px;font-size:15px;">
    <a href="#" style="text-decoration:none;color:#1e293b;">首页</a>
    <a href="#" style="text-decoration:none;color:#64748b;">功能</a>
    <a href="#" style="text-decoration:none;color:#64748b;">关于</a>
  </div>
  <a href="#" style="background:#4f46e5;color:#ffffff;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">开始</a>
</nav>`;

const footer = `<footer style="max-width:980px;margin:0 auto;padding:32px 24px;text-align:center;color:#94a3b8;font-size:14px;">
  © 2025 PageForge · 由你亲手打造
</footer>`;

const hero = (title, sub, btnText) => `<section style="max-width:980px;margin:0 auto;padding:80px 24px;text-align:center;">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;padding:6px 16px;border-radius:6px;font-size:14px;font-weight:600;margin-bottom:20px;">新功能上线</span>
  <h1 style="font-size:52px;font-weight:700;letter-spacing:-0.6px;line-height:1.15;margin:0 0 16px;color:#1e293b;">${title}</h1>
  <p style="font-size:19px;line-height:1.7;color:#64748b;max-width:560px;margin:0 auto 28px;">${sub}</p>
  <div style="display:flex;gap:12px;justify-content:center;">
    <a href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:13px 32px;border-radius:8px;font-size:17px;font-weight:600;text-decoration:none;">${btnText}</a>
    <a href="#" style="display:inline-block;background:#ffffff;color:#1e293b;border:1.5px solid #e2e8f0;padding:12px 31px;border-radius:8px;font-size:17px;font-weight:600;text-decoration:none;">了解更多</a>
  </div>
</section>`;

const features3 = (items) => `<section style="max-width:980px;margin:0 auto;padding:40px 24px;">
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
    ${items
      .map(
        (t) => `<div style="border-radius:12px;background:#f8fafc;padding:24px;">
      <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1e293b;">${t}</h3>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#64748b;">功能描述文字，介绍这个模块能为你做什么。</p>
    </div>`
      )
      .join('')}
  </div>
</section>`;

export const templates = [
  {
    id: 'landing',
    name: '落地页',
    desc: '导航 + 主视觉 + 三栏特性 + 行动号召',
    content: `${nav}${hero('打造你的下一个伟大产品', '简洁、现代、专业的页面模板，适合产品官网与活动落地页。', '立即开始')}${features3(['高效', '美观', '易用'])}<section style="max-width:980px;margin:0 auto;padding:60px 24px;text-align:center;background:#f8fafc;border-radius:16px;margin-top:24px;">
  <h2 style="margin:0 0 12px;font-size:32px;font-weight:700;color:#1e293b;">准备好开始了吗？</h2>
  <p style="margin:0 0 24px;font-size:17px;color:#64748b;">现在就创建你的页面，几分钟就能上线。</p>
  <a href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:13px 32px;border-radius:8px;font-size:17px;font-weight:600;text-decoration:none;">免费开始</a>
</section>${footer}`,
  },
  {
    id: 'blog',
    name: '博客页',
    desc: '文章列表网格，适合个人博客与内容站',
    content: `${nav}<section style="max-width:980px;margin:0 auto;padding:64px 24px 32px;">
  <h1 style="font-size:48px;font-weight:700;letter-spacing:-0.5px;margin:0 0 8px;color:#1e293b;">博客</h1>
  <p style="margin:0;font-size:18px;color:#64748b;">记录思考，分享见闻。</p>
</section><section style="max-width:980px;margin:0 auto;padding:16px 24px 60px;">
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;">
    <div style="border-radius:16px;background:#ffffff;border:1px solid #e2e8f0;overflow:hidden;">
      <div style="height:140px;background:linear-gradient(135deg,#e0e7ff,#c7d2fe);"></div>
      <div style="padding:20px;">
        <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1e293b;">文章标题一</h3>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">摘要文字，吸引读者点击进来阅读全文。</p>
      </div>
    </div>
    <div style="border-radius:16px;background:#ffffff;border:1px solid #e2e8f0;overflow:hidden;">
      <div style="height:140px;background:linear-gradient(135deg,#fce7f3,#fbcfe8);"></div>
      <div style="padding:20px;">
        <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1e293b;">文章标题二</h3>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">摘要文字，吸引读者点击进来阅读全文。</p>
      </div>
    </div>
    <div style="border-radius:16px;background:#ffffff;border:1px solid #e2e8f0;overflow:hidden;">
      <div style="height:140px;background:linear-gradient(135deg,#dcfce7,#bbf7d0);"></div>
      <div style="padding:20px;">
        <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1e293b;">文章标题三</h3>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">摘要文字，吸引读者点击进来阅读全文。</p>
      </div>
    </div>
  </div>
</section>${footer}`,
  },
  {
    id: 'product',
    name: '产品介绍',
    desc: '主视觉 + 大图 + 双栏特性 + 订阅表单',
    content: `${nav}${hero('重新定义工作方式', '介绍你的产品如何解决问题，让用户一眼看懂价值。', '免费试用')}<section style="max-width:980px;margin:0 auto;padding:16px 24px 40px;">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
    <div style="border-radius:16px;background:#f8fafc;padding:32px;">
      <h3 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1e293b;">为什么选择我们</h3>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#64748b;">左侧放文字说明，右侧配图或功能列表，形成清晰的产品介绍布局。</p>
      <ul style="margin:0;padding-left:22px;font-size:15px;line-height:2;color:#1e293b;">
        <li>核心优势一</li>
        <li>核心优势二</li>
        <li>核心优势三</li>
      </ul>
    </div>
    <div style="border-radius:16px;background:linear-gradient(135deg,#eef2ff,#e0e7ff);min-height:280px;display:flex;align-items:center;justify-content:center;color:#6366f1;font-weight:600;font-size:18px;">产品截图区域</div>
  </div>
</section><section style="max-width:980px;margin:0 auto;padding:40px 24px 60px;text-align:center;">
  <h2 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#1e293b;">订阅更新</h2>
  <form style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
    <input type="email" placeholder="输入你的邮箱" style="flex:1;max-width:320px;padding:12px 16px;border:1px solid #e2e8f0;border-radius:8px;font-size:15px;outline:none;">
    <button type="submit" style="background:#4f46e5;color:#ffffff;border:none;padding:12px 26px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">订阅</button>
  </form>
</section>${footer}`,
  },
  {
    id: 'profile',
    name: '个人主页',
    desc: '头像 + 简介 + 技能列表 + 联系方式',
    content: `${nav}<section style="max-width:980px;margin:0 auto;padding:64px 24px;text-align:center;">
  <div style="width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#818cf8);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;font-weight:700;">我</div>
  <h1 style="font-size:40px;font-weight:700;letter-spacing:-0.4px;margin:0 0 8px;color:#1e293b;">你的名字</h1>
  <p style="font-size:18px;color:#64748b;max-width:480px;margin:0 auto 28px;">一句话介绍自己：你的职业、热爱与正在做的事。</p>
  <div style="display:flex;gap:12px;justify-content:center;">
    <a href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:11px 28px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">联系我</a>
    <a href="#" style="display:inline-block;background:#ffffff;color:#1e293b;border:1.5px solid #e2e8f0;padding:10px 27px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">作品集</a>
  </div>
</section><section style="max-width:980px;margin:0 auto;padding:32px 24px 60px;">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
    <div style="border-radius:16px;background:#f8fafc;padding:28px;">
      <h3 style="margin:0 0 14px;font-size:18px;font-weight:700;color:#1e293b;">技能</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="background:#eef2ff;color:#4f46e5;padding:5px 14px;border-radius:6px;font-size:13px;font-weight:600;">技能一</span>
        <span style="background:#eef2ff;color:#4f46e5;padding:5px 14px;border-radius:6px;font-size:13px;font-weight:600;">技能二</span>
        <span style="background:#eef2ff;color:#4f46e5;padding:5px 14px;border-radius:6px;font-size:13px;font-weight:600;">技能三</span>
        <span style="background:#eef2ff;color:#4f46e5;padding:5px 14px;border-radius:6px;font-size:13px;font-weight:600;">技能四</span>
      </div>
    </div>
    <div style="border-radius:16px;background:#f8fafc;padding:28px;">
      <h3 style="margin:0 0 14px;font-size:18px;font-weight:700;color:#1e293b;">联系方式</h3>
      <p style="margin:0 0 8px;font-size:15px;color:#64748b;">邮箱：you@example.com</p>
      <p style="margin:0 0 8px;font-size:15px;color:#64748b;">微信：your-wechat</p>
      <p style="margin:0;font-size:15px;color:#64748b;">GitHub：@yourname</p>
    </div>
  </div>
</section>${footer}`,
  },
];
