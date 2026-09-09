// PageForge 样式预设面板 —— 选中元素一键变"苹果风"
// 用法：选中画布里的元素 → 点预设 → addStyle 应用

export const stylePresets = [
  {
    id: 'pill-btn',
    name: '胶囊按钮',
    desc: '变成苹果式圆角胶囊按钮',
    css: { 'border-radius': '980px', 'padding-top': '12px', 'padding-bottom': '12px', 'padding-left': '30px', 'padding-right': '30px' },
  },
  {
    id: 'glass-card',
    name: '玻璃卡片',
    desc: '毛玻璃质感 + 柔和阴影（建议放深色/渐变背景上）',
    css: {
      'border-radius': '24px',
      background: 'rgba(255,255,255,0.6)',
      'backdrop-filter': 'blur(20px) saturate(180%)',
      '-webkit-backdrop-filter': 'blur(20px) saturate(180%)',
      border: '1px solid rgba(255,255,255,0.35)',
      'box-shadow': '0 8px 40px rgba(0,0,0,0.08)',
    },
  },
  {
    id: 'soft-shadow',
    name: '柔和阴影',
    desc: '细腻的悬浮阴影',
    css: { 'box-shadow': '0 12px 40px rgba(0,0,0,0.1)' },
  },
  {
    id: 'big-radius',
    name: '大圆角',
    desc: '24px 圆角（苹果卡片风格）',
    css: { 'border-radius': '24px' },
  },
  {
    id: 'gradient-bg',
    name: '渐变背景',
    desc: '浅灰到白的细腻渐变（苹果章节背景）',
    css: { background: 'linear-gradient(135deg,#f5f5f7 0%,#e8e8ed 100%)' },
  },
  {
    id: 'hairline',
    name: '细描边',
    desc: '1px 浅色细边框（分割感）',
    css: { border: '1px solid rgba(0,0,0,0.08)' },
  },
  {
    id: 'link-blue',
    name: '蓝色链接',
    desc: '苹果蓝链接（#2997ff，适合 a 标签）',
    css: { color: '#2997ff', 'text-decoration': 'none' },
  },
  {
    id: 'big-title',
    name: '苹果大标题',
    desc: '56px 超大字重标题（适合 h1）',
    css: { 'font-size': '56px', 'font-weight': '700', 'letter-spacing': '-0.8px', 'line-height': '1.1' },
  },
  {
    id: 'spacious',
    name: '加大留白',
    desc: '容器内边距加大到 40px（区块呼吸感）',
    css: { padding: '40px' },
  },
  {
    id: 'compact',
    name: '紧凑留白',
    desc: '容器内边距收窄到 8px（信息密集）',
    css: { padding: '8px' },
  },
];

// 渲染预设面板 + 绑定点击
export function renderStylePresets(container, editor, toast) {
  container.innerHTML = stylePresets
    .map(
      (p) => `<div class="preset-card" data-id="${p.id}">
      <div class="preset-name">${p.name}</div>
      <div class="template-desc">${p.desc}</div>
      <button class="btn ghost preset-apply">应用</button>
    </div>`
    )
    .join('');
  container.querySelectorAll('.preset-apply').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.preset-card').dataset.id;
      const p = stylePresets.find((x) => x.id === id);
      const selected = editor.getSelected();
      if (!selected) {
        toast('请先在画布选中一个元素');
        return;
      }
      selected.addStyle(p.css);
      toast(`已应用「${p.name}」`);
    });
  });
}
