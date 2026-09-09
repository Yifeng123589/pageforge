// PageForge M7 素材系统 —— 图标库 + 图片库 + 文案库（全部内嵌，离线可用）
// 图标：24x24 stroke 风格（currentColor，插入后可改颜色/大小）
// 图片：SVG 插画（渐变 + 图形，dataURL 内嵌）

// ============ 图标库（30 个常用图标）============
const I = (body) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const assetIcons = [
  { name: '搜索', svg: I('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>') },
  { name: '主页', svg: I('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>') },
  { name: '用户', svg: I('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') },
  { name: '爱心', svg: I('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>') },
  { name: '星标', svg: I('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>') },
  { name: '铃铛', svg: I('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') },
  { name: '邮件', svg: I('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>') },
  { name: '电话', svg: I('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>') },
  { name: '定位', svg: I('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>') },
  { name: '时钟', svg: I('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>') },
  { name: '日历', svg: I('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>') },
  { name: '相机', svg: I('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>') },
  { name: '播放', svg: I('<polygon points="5 3 19 12 5 21 5 3"/>') },
  { name: '下载', svg: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>') },
  { name: '上传', svg: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>') },
  { name: '分享', svg: I('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>') },
  { name: '链接', svg: I('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>') },
  { name: '菜单', svg: I('<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>') },
  { name: '关闭', svg: I('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>') },
  { name: '左箭头', svg: I('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>') },
  { name: '右箭头', svg: I('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>') },
  { name: '上箭头', svg: I('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>') },
  { name: '下箭头', svg: I('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>') },
  { name: '对勾', svg: I('<polyline points="20 6 9 17 4 12"/>') },
  { name: '加号', svg: I('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>') },
  { name: '信息', svg: I('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>') },
  { name: '警告', svg: I('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>') },
  { name: '锁', svg: I('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>') },
  { name: '云', svg: I('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>') },
  { name: '文件', svg: I('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>') },
  { name: '文件夹', svg: I('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>') },
  { name: '齿轮', svg: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>') },
  { name: '刷新', svg: I('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>') },
  { name: '眼睛', svg: I('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>') },
  { name: '铅笔', svg: I('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>') },
  { name: '垃圾桶', svg: I('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>') },
  { name: '购物车', svg: I('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>') },
  { name: '手机', svg: I('<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>') },
  { name: '购物袋', svg: I('<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>') },
];

// ============ 图片库（20 张 SVG 插画，渐变 + 图形 + 标签）============
let _gid = 0; // 每张图唯一渐变 id（多张插入同一页面不冲突）
const P = (body, c1, c2) => {
  _gid++;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g${_gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g${_gid})"/>${body}</svg>`;
};

export const assetImages = [
  // 风景
  { name: '日出', cat: '风景', svg: P('<circle cx="200" cy="180" r="52" fill="#ffd166" opacity="0.9"/><path d="M0 220 Q100 160 200 210 T400 200 V300 H0 Z" fill="#fff" opacity="0.35"/><path d="M0 240 Q120 190 240 235 T400 230 V300 H0 Z" fill="#2d6a4f" opacity="0.55"/>', '#f6d365', '#fd9a5b') },
  { name: '山峦', cat: '风景', svg: P('<path d="M0 300 L120 140 L220 260 L300 170 L400 260 V300 Z" fill="#3a7d5c" opacity="0.9"/><path d="M0 300 L90 190 L170 270 L260 210 L400 280 V300 Z" fill="#2a5d44"/><circle cx="300" cy="70" r="34" fill="#ffd166"/>', '#74b9ff', '#4a69bd') },
  { name: '海洋', cat: '风景', svg: P('<path d="M0 210 Q100 190 200 205 T400 200 V300 H0 Z" fill="#2d7fb8" opacity="0.8"/><path d="M0 240 Q130 220 260 235 T400 230 V300 H0 Z" fill="#1a5d8f" opacity="0.9"/><circle cx="330" cy="80" r="30" fill="#ffd166"/>', '#a8e6ff', '#5bc0de') },
  { name: '森林', cat: '风景', svg: P('<path d="M80 300 V180 L110 130 L140 180 V300 Z" fill="#2d6a4f"/><path d="M170 300 V160 L210 95 L250 160 V300 Z" fill="#40916c"/><path d="M270 300 V190 L295 145 L320 190 V300 Z" fill="#2d6a4f"/><rect x="0" y="280" width="400" height="20" fill="#1b4332"/>', '#95d5b2', '#52b788') },
  // 科技
  { name: '电脑', cat: '科技', svg: P('<rect x="80" y="80" width="240" height="150" rx="12" fill="#0d0d0f"/><rect x="96" y="96" width="208" height="118" rx="6" fill="#5e6ad2"/><rect x="150" y="230" width="100" height="12" rx="6" fill="#0d0d0f"/>', '#6c5ce7', '#341f97') },
  { name: '手机', cat: '科技', svg: P('<rect x="150" y="60" width="100" height="190" rx="16" fill="#0d0d0f"/><rect x="158" y="74" width="84" height="150" rx="8" fill="#00cec9"/><circle cx="200" cy="238" r="4" fill="#636e72"/>', '#00b894', '#0984e3') },
  { name: '机器人', cat: '科技', svg: P('<rect x="120" y="110" width="160" height="120" rx="20" fill="#dfe6e9"/><circle cx="165" cy="160" r="16" fill="#5e6ad2"/><circle cx="235" cy="160" r="16" fill="#5e6ad2"/><rect x="180" y="185" width="40" height="10" rx="5" fill="#b2bec3"/><rect x="155" y="230" width="90" height="12" rx="6" fill="#636e72"/>', '#a29bfe', '#6c5ce7') },
  { name: '芯片', cat: '科技', svg: P('<rect x="120" y="100" width="160" height="160" rx="14" fill="#0d0d0f"/><rect x="140" y="120" width="120" height="120" rx="8" fill="#5e6ad2"/><rect x="155" y="135" width="90" height="90" rx="6" fill="#7c7ff5"/><circle cx="200" cy="180" r="22" fill="#fff" opacity="0.85"/>', '#74b9ff', '#5e6ad2') },
  // 美食
  { name: '咖啡', cat: '美食', svg: P('<rect x="120" y="130" width="120" height="110" rx="12" fill="#8d6e63"/><rect x="130" y="90" width="100" height="46" rx="8" fill="#a1887f"/><path d="M240 130 h30 a20 20 0 0 1 0 40 h-30" fill="none" stroke="#8d6e63" stroke-width="14"/><path d="M140 160 q30 -20 60 0 q30 20 60 0" stroke="#fff" stroke-width="6" fill="none" opacity="0.7"/>', '#d7ccc8', '#8d6e63') },
  { name: '蛋糕', cat: '美食', svg: P('<path d="M130 200 h140 l-18 50 h-104 Z" fill="#f8bbd0"/><rect x="120" y="180" width="160" height="24" rx="8" fill="#f06292"/><circle cx="160" cy="180" r="10" fill="#fff"/><circle cx="200" cy="180" r="10" fill="#fff"/><circle cx="240" cy="180" r="10" fill="#fff"/>', '#f8bbd0', '#f06292') },
  { name: '水果', cat: '美食', svg: P('<circle cx="150" cy="180" r="44" fill="#ff7675"/><circle cx="250" cy="180" r="44" fill="#ffeaa7"/><rect x="195" y="120" width="10" height="36" rx="5" fill="#6d4c41"/><path d="M200 124 q-15 -20 -28 -8" stroke="#6d4c41" stroke-width="6" fill="none"/><path d="M250 136 q10 -20 -6 -30" stroke="#6d4c41" stroke-width="6" fill="none"/>', '#fff3e0', '#ffb74d') },
  { name: '面条', cat: '美食', svg: P('<rect x="130" y="140" width="140" height="90" rx="14" fill="#ffe0b2"/><path d="M150 170 h100 M150 190 h100 M150 210 h80" stroke="#e65100" stroke-width="8" stroke-linecap="round"/><path d="M120 120 h160" stroke="#ff8a65" stroke-width="16" stroke-linecap="round"/>', '#ffcc80', '#ff8a65') },
  // 商务
  { name: '图表', cat: '商务', svg: P('<rect x="80" y="210" width="40" height="60" rx="6" fill="#5e6ad2"/><rect x="140" y="170" width="40" height="100" rx="6" fill="#74b9ff"/><rect x="200" y="130" width="40" height="140" rx="6" fill="#00b894"/><rect x="260" y="90" width="40" height="180" rx="6" fill="#ffd166"/>', '#dfe6e9', '#b2bec3') },
  { name: '会议', cat: '商务', svg: P('<circle cx="140" cy="130" r="36" fill="#74b9ff"/><circle cx="270" cy="130" r="36" fill="#ffd166"/><rect x="90" y="180" width="100" height="70" rx="16" fill="#5e6ad2"/><rect x="220" y="180" width="100" height="70" rx="16" fill="#00b894"/><rect x="80" y="190" width="240" height="60" rx="12" fill="#dfe6e9"/>', '#a29bfe', '#6c5ce7') },
  { name: '写字楼', cat: '商务', svg: P('<rect x="90" y="90" width="90" height="180" rx="6" fill="#636e72"/><rect x="190" y="60" width="110" height="210" rx="6" fill="#74b9ff"/><path d="M110 120 h40 M110 150 h40 M110 180 h40 M210 100 h60 M210 130 h60 M210 160 h60" stroke="#fff" stroke-width="8" opacity="0.8"/>', '#a4b0be', '#57606f') },
  { name: '握手', cat: '商务', svg: P('<path d="M60 210 Q90 150 150 160 L200 170 Q260 180 340 160" stroke="#dfe6e9" stroke-width="22" fill="none" stroke-linecap="round"/><rect x="70" y="210" width="80" height="60" rx="10" fill="#636e72"/><rect x="250" y="210" width="80" height="60" rx="10" fill="#636e72"/>', '#74b9ff', '#5e6ad2') },
  // 抽象
  { name: '渐变圆', cat: '抽象', svg: P('<circle cx="200" cy="150" r="90" fill="#fff" opacity="0.35"/><circle cx="200" cy="150" r="55" fill="#fff" opacity="0.5"/><circle cx="200" cy="150" r="24" fill="#fff" opacity="0.8"/>', '#f093fb', '#f5576c') },
  { name: '波浪', cat: '抽象', svg: P('<path d="M0 150 Q50 100 100 150 T200 150 T300 150 T400 150 V300 H0 Z" fill="#fff" opacity="0.3"/><path d="M0 200 Q50 150 100 200 T200 200 T300 200 T400 200 V300 H0 Z" fill="#fff" opacity="0.5"/><path d="M0 250 Q50 200 100 250 T200 250 T300 250 T400 250 V300 H0 Z" fill="#fff" opacity="0.75"/>', '#4facfe', '#00f2fe') },
  { name: '几何', cat: '抽象', svg: P('<polygon points="200,60 320,180 260,260 140,260 80,180" fill="#fff" opacity="0.4"/><polygon points="200,100 290,190 245,250 155,250 110,190" fill="#fff" opacity="0.6"/><polygon points="200,140 260,200 230,240 170,240 140,200" fill="#fff" opacity="0.85"/>', '#667eea', '#764ba2') },
  { name: '星空', cat: '抽象', svg: P('<circle cx="90" cy="80" r="3" fill="#fff"/><circle cx="200" cy="50" r="2.5" fill="#fff"/><circle cx="310" cy="90" r="3.5" fill="#fff"/><circle cx="150" cy="160" r="2" fill="#fff"/><circle cx="280" cy="190" r="2.5" fill="#fff"/><circle cx="90" cy="220" r="3" fill="#fff"/><circle cx="330" cy="230" r="2" fill="#fff"/><circle cx="200" cy="140" r="60" fill="#fff" opacity="0.15"/><circle cx="200" cy="140" r="30" fill="#fff" opacity="0.25"/>', '#0f2027', '#2c5364') },
  // 人物
  { name: '头像', cat: '人物', svg: P('<circle cx="200" cy="110" r="55" fill="#ffd166"/><path d="M120 280 Q130 190 200 190 Q270 190 280 280 Z" fill="#74b9ff"/>', '#a29bfe', '#6c5ce7') },
  { name: '团队', cat: '人物', svg: P('<circle cx="120" cy="120" r="34" fill="#ffd166"/><circle cx="280" cy="120" r="34" fill="#ff7675"/><circle cx="200" cy="140" r="38" fill="#55efc4"/><path d="M70 260 Q80 185 120 185 Q160 185 170 260 Z" fill="#74b9ff"/><path d="M230 260 Q240 200 280 200 Q320 200 330 260 Z" fill="#ff7675"/><path d="M150 270 Q160 195 200 195 Q240 195 250 270 Z" fill="#55efc4"/>', '#74b9ff', '#00b894') },
];

// ============ 文案库（常用文案，点击插入）============
export const assetTexts = [
  { name: '主标题', html: '<h2 style="font-size:42px;font-weight:800;line-height:1.2;color:#1e293b;text-align:center;">让想法变成网站</h2>' },
  { name: '副标题', html: '<p style="font-size:18px;line-height:1.7;color:#64748b;text-align:center;">无需编程，拖拽即可搭建出有设计感的网页</p>' },
  { name: '按钮文案', html: '<a style="display:inline-block;background:#4f46e5;color:#ffffff;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;">立即开始</a>' },
  { name: '段落示例', html: '<p style="font-size:16px;line-height:1.8;color:#334155;">PageForge 帮你把灵感变成可分享的网页——拼积木一样简单，几十种组件随取随用，一键切换风格。</p>' },
  { name: '品牌标语', html: '<h2 style="font-size:34px;font-weight:800;line-height:1.3;color:#1e293b;text-align:center;">简单，是一种美</h2>' },
  { name: '产品标题', html: '<h3 style="font-size:24px;font-weight:700;color:#1e293b;">我们的产品</h3>' },
  { name: '特性口号', html: '<p style="font-size:20px;font-weight:600;color:#4f46e5;text-align:center;">快速 · 简单 · 美观</p>' },
  { name: '页脚文字', html: '<p style="font-size:13px;color:#94a3b8;text-align:center;">© 2026 PageForge · 保留所有权利</p>' },
  { name: '行动号召', html: '<a style="display:inline-block;background:#1e293b;color:#ffffff;padding:16px 40px;border-radius:999px;font-size:17px;font-weight:600;cursor:pointer;">免费开始使用 →</a>' },
  { name: '名言引用', html: '<blockquote style="font-size:22px;font-style:italic;color:#475569;text-align:center;border-left:4px solid #4f46e5;padding:12px 24px;">设计让复杂变简单。—— 乔布斯</blockquote>' },
];
