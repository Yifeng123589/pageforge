// v2 素材面板（A1-1）：图标 / 插画 / 文案 三类内嵌素材——可搜索、可插入画布。
//
// 素材全部来自 v1 的 assets.js（内联 SVG、内联 HTML），所以**导出后不依赖网络**（A1-1 验收标准）。
// 面板只负责"选"：真正的插入动作由 main 通过 onInsertXxx 回调完成（保持与数据层解耦）。
//
// 三类素材的插入形态：
//   · 图标 → 正方形容器元素，内含 SVG（颜色跟随容器的 color 属性，所以改文字颜色就能改图标色）
//   · 插画 → image 元素（SVG 转 dataURL，走既有 makeImage 通路）
//   · 文案 → 独立文字元素（走 makeElementFromHTML，自动补叶子标记，插入后点进去就能改字）

import { assetIcons, assetImages, assetTexts } from '../assets.js';

/** 图标库的 SVG 是 22×22 固定尺寸；插入到画布要撑满容器，否则放大后图标不变大 */
const asFillingSvg = (svg) => svg
  .replace(/width="22"/, 'width="100%"')
  .replace(/height="22"/, 'height="100%"');

/** 插画是 SVG 源码，图片元素需要 dataURL（encodeURIComponent 防中文/特殊字符出问题） */
export const svgToDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** 图标 → 可插画布的 HTML（颜色走 currentColor，选中容器改文字色即改图标色） */
export const iconToHtml = (svg, color = '#4f46e5') =>
  `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:${color}">${asFillingSvg(svg)}</div>`;

export function initAssetPanel({ onInsertIcon, onInsertImage, onInsertText, toast }) {
  const mask = document.getElementById('v2-asset-modal');
  if (!mask) return { open: () => {}, close: () => {} };
  const body = document.getElementById('v2-asset-body');
  const q = document.getElementById('v2-asset-q');
  const tabs = [...mask.querySelectorAll('.asset-tab')];
  let tab = 'icon';
  let keyword = '';

  const hit = (name, extra = '') => {
    if (!keyword) return true;
    const k = keyword.toLowerCase();
    return name.toLowerCase().includes(k) || String(extra).toLowerCase().includes(k);
  };

  function render() {
    if (tab === 'icon') {
      const list = assetIcons.filter((ic) => hit(ic.name));
      body.innerHTML = list.length ? `<div class="asset-grid">${list.map((ic) => {
        const i = assetIcons.indexOf(ic);
        return `<button class="asset-cell" data-kind="icon" data-i="${i}" title="${ic.name}">`
          + `<span class="asset-prev">${asFillingSvg(ic.svg)}</span><span class="asset-name">${ic.name}</span></button>`;
      }).join('')}</div>` : '<p class="asset-empty">没有匹配的图标</p>';
    } else if (tab === 'image') {
      const list = assetImages.filter((im) => hit(im.name, im.cat));
      body.innerHTML = list.length ? `<div class="asset-grid">${list.map((im) => {
        const i = assetImages.indexOf(im);
        return `<button class="asset-cell tall" data-kind="image" data-i="${i}" title="${im.cat} · ${im.name}">`
          + `<span class="asset-prev">${im.svg}</span><span class="asset-name">${im.name}<em>${im.cat}</em></span></button>`;
      }).join('')}</div>` : '<p class="asset-empty">没有匹配的插画</p>';
    } else {
      const list = assetTexts.filter((t) => hit(t.name));
      body.innerHTML = list.length ? `<div class="asset-list">${list.map((t) => {
        const i = assetTexts.indexOf(t);
        return `<button class="asset-row" data-kind="text" data-i="${i}"><b>${t.name}</b><span>${t.html.replace(/<[^>]+>/g, '').slice(0, 42)}</span></button>`;
      }).join('')}</div>` : '<p class="asset-empty">没有匹配的文案</p>';
    }
  }

  // 事件委托：素材卡片是动态渲染的，逐张绑定会在每次搜索后失效
  body.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-kind]');
    if (!cell) return;
    const i = Number(cell.dataset.i);
    const kind = cell.dataset.kind;
    if (kind === 'icon') {
      onInsertIcon?.(assetIcons[i]);
      toast?.(`已插入图标「${assetIcons[i].name}」`);
    } else if (kind === 'image') {
      onInsertImage?.(assetImages[i]);
      toast?.(`已插入插画「${assetImages[i].name}」`);
    } else {
      onInsertText?.(assetTexts[i]);
      toast?.(`已插入文案「${assetTexts[i].name}」`);
    }
  });

  tabs.forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    tabs.forEach((x) => x.classList.toggle('on', x === b));
    render();
  }));
  q.addEventListener('input', () => { keyword = q.value.trim(); render(); });

  const open = () => { mask.hidden = false; render(); q.focus(); };
  const close = () => { mask.hidden = true; };
  document.getElementById('v2-asset-cancel')?.addEventListener('click', close);
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });

  return { open, close, render };
}
