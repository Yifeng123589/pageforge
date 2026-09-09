// PageForge 智能配色模块
// 功能：预设方案一键应用、主色生成和谐配色、图片取色、色块应用到选中元素

// ============ 颜色工具 ============
export function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// 基于主色生成和谐配色（互补/类似/三角）
export function generateHarmony(mainHex) {
  const [h, s, l] = hexToHsl(mainHex);
  const norm = (x) => ((x % 360) + 360) % 360;
  return [
    { name: '主色', hex: mainHex },
    { name: '互补', hex: hslToHex(norm(h + 180), s, l) },
    { name: '类似 1', hex: hslToHex(norm(h + 30), s, Math.min(100, l + 5)) },
    { name: '类似 2', hex: hslToHex(norm(h - 30), s, Math.max(0, l - 5)) },
    { name: '三角', hex: hslToHex(norm(h + 120), s, l) },
    { name: '浅色', hex: hslToHex(h, Math.max(0, s - 30), Math.min(100, l + 35)) },
    { name: '深色', hex: hslToHex(h, Math.min(100, s + 15), Math.max(0, l - 30)) },
  ];
}

// ============ 预设方案 ============
// 结构：{ name, primary(主色/按钮), background(页面背景), text(文字), accent(强调), accentSoft(浅强调) }
export const presets = [
  { name: '靛蓝现代', primary: '#4f46e5', background: '#ffffff', text: '#1e293b', accent: '#818cf8', accentSoft: '#eef2ff' },
  { name: '苹果灰', primary: '#1d1d1f', background: '#f5f5f7', text: '#1d1d1f', accent: '#0071e3', accentSoft: '#e8e8ed' },
  { name: '森林绿', primary: '#16a34a', background: '#f0fdf4', text: '#14532d', accent: '#4ade80', accentSoft: '#dcfce7' },
  { name: '海洋蓝', primary: '#0284c7', background: '#f0f9ff', text: '#0c4a6e', accent: '#38bdf8', accentSoft: '#e0f2fe' },
  { name: '日落橙', primary: '#ea580c', background: '#fff7ed', text: '#431407', accent: '#fb923c', accentSoft: '#ffedd5' },
  { name: '玫瑰红', primary: '#e11d48', background: '#fff1f2', text: '#4c0519', accent: '#fb7185', accentSoft: '#ffe4e6' },
  { name: '暗夜金', primary: '#f59e0b', background: '#1c1917', text: '#fafaf9', accent: '#fbbf24', accentSoft: '#292524' },
  { name: '薰衣草', primary: '#7c3aed', background: '#faf5ff', text: '#2e1065', accent: '#a78bfa', accentSoft: '#f3e8ff' },
];

// 把方案应用到页面（遍历组件，可视化反馈）
export function applySchemeToPage(editor, scheme) {
  const { primary, background, text, accent } = scheme;
  const wrapper = editor.getWrapper();
  const find = (sel) => wrapper.find(sel) || [];

  // body 背景 + 默认文字色
  wrapper.addStyle({ background, color: text });
  // 标题
  find('h1, h2, h3, h4, h5').forEach((c) => c.addStyle({ color: text }));
  // 正文
  find('p, li').forEach((c) => c.addStyle({ color: text }));
  // 按钮（有背景的设为 primary，文字链接设为 accent）
  find('a').forEach((c) => {
    const s = c.getStyle();
    const bg = s.background || '';
    if (bg && bg !== 'none' && bg !== 'transparent') c.addStyle({ background: primary });
    else c.addStyle({ color: accent });
  });
  // 徽章
  find('span, blockquote').forEach((c) => {
    const s = c.getStyle();
    if (s.background && s.background !== 'none' && s.background !== 'transparent') {
      c.addStyle({ background: accentSoft, color: primary });
    }
  });
  // 表单输入框边框 + 按钮
  find('input, textarea').forEach((c) => c.addStyle({ borderColor: accentSoft }));
  find('button').forEach((c) => c.addStyle({ background: primary, color: '#ffffff' }));
  // 分隔线
  find('hr').forEach((c) => c.addStyle({ borderTopColor: accentSoft }));
  // 卡片/容器背景（浅色块 → 方案背景派生）
  find('div').forEach((c) => {
    const s = c.getStyle();
    const bg = s.background || '';
    if (bg === '#f8fafc' || bg === '#f5f5f7' || bg === '#f1f5f9') {
      c.addStyle({ background: background === '#ffffff' ? accentSoft : background });
    }
  });
  return true;
}

// 应用到选中元素：mode = 'bg' | 'text'
export function applyColorToSelection(editor, hex, mode) {
  const selected = editor.getSelected();
  if (!selected) return false;
  if (mode === 'text') selected.addStyle({ color: hex });
  else selected.addStyle({ background: hex });
  return true;
}

// 图片取色：返回主色 + 辅助色（canvas 量化）
export function extractColorsFromImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 48;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const data = ctx.getImageData(0, 0, size, size).data;
      // 量化到 4 级色桶，统计最多像素的桶
      const buckets = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 128) continue; // 跳过透明
        const r = data[i] >> 6, g = data[i + 1] >> 6, b = data[i + 2] >> 6;
        const key = `${r}-${g}-${b}`;
        const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
        bucket.r += data[i]; bucket.g += data[i + 1]; bucket.b += data[i + 2];
        bucket.n += 1;
        buckets.set(key, bucket);
      }
      const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
      const toHex = (b) =>
        `#${[Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)]
          .map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const colors = sorted.slice(0, 6).map((b) => toHex(b));
      resolve(colors);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}
