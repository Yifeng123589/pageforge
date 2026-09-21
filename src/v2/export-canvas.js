// v2 canvas 页导出构建器：v1（flow）与 v2（canvas）混排导出的共享模块
// canvas 页 = 绝对定位 stage + 根节点等比缩放（规范 §5）；动效复用 pf-reveal 引擎

import { kebab, styleText } from './css-utils.js';

export const REVEAL_CSS = `.pf-reveal{opacity:0;transform:translateY(28px);transition:opacity .7s ease,transform .7s cubic-bezier(.16,1,.3,1);will-change:opacity,transform}.pf-reveal[data-reveal="fade"]{transform:none}.pf-reveal[data-reveal="left"]{transform:translateX(-32px)}.pf-reveal[data-reveal="right"]{transform:translateX(32px)}.pf-reveal[data-reveal="zoom"]{transform:scale(.94)}.pf-reveal.pf-shown{opacity:1;transform:none}`;
export const REVEAL_JS = '(function(){var r=document.querySelectorAll(".pf-reveal");if(!r.length)return;if(!("IntersectionObserver"in window)){r.forEach(function(e){e.classList.add("pf-shown")});return}var o=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add("pf-shown");o.unobserve(x.target)}})},{threshold:.05,rootMargin:"0px 0px 60px 0px"});r.forEach(function(e){o.observe(e)})})();';

// 轻量 HTML 格式化（标签独立成行 + 缩进）
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
export function formatHtml(html, indent = 0) {
  const tokens = String(html).replace(/\r?\n\s*/g, '').match(/<[^>]+>|[^<]+/g) || [];
  let depth = indent;
  const out = [];
  for (const tk of tokens) {
    if (/^<\//.test(tk)) {
      depth = Math.max(indent, depth - 1);
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

// 元素层标记（覆盖表合并 + 动效壳；外层 rotate/定位不受动效影响）
function elementMarkup(el) {
  const tmp = document.createElement('div');
  tmp.innerHTML = el.html;
  tmp.querySelectorAll('[data-id]').forEach((n) => {
    const ov = el.overrides && el.overrides[n.getAttribute('data-id')];
    if (ov) for (const [k, v] of Object.entries(ov)) n.style.setProperty(kebab(k), v);
  });
  const inner = formatHtml(tmp.innerHTML, 2);
  const body = el.motion && el.motion !== 'none'
    ? `    <div class="pf-reveal" data-reveal="${el.motion}" style="width:100%;height:100%;">\n${inner}\n    </div>`
    : inner;
  return `  <div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;z-index:${el.z};transform:rotate(${el.rotation}deg);opacity:${el.opacity};${styleText(el.style)}">
${body}
  </div>`;
}

// stage 内元素层（v2 单页导出复用）
export function canvasStageInner(doc) {
  return doc.elements.map(elementMarkup).join('\n');
}

// 导出高度（D1）：max(stage.height, 元素最低点 + 40)
export function exportHeight(doc) {
  const bottom = doc.elements.length ? Math.max(...doc.elements.map((e) => e.y + e.height)) : 0;
  return Math.max(doc.stage.height, bottom + 40);
}

export function canvasHasMotion(doc) {
  return doc.elements.some((e) => e.motion && e.motion !== 'none');
}

// 单个 canvas 页 → 混排站点里的 <section>（含等比缩放壳）
// 页名转义（审计 BUG-08）：data-page-name 属性防引号截断
export function canvasSectionHtml(doc) {
  const H = exportHeight(doc);
  const els = doc.elements.map(elementMarkup).join('\n');
  const safeName = String(doc.name || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `  <section class="pf-page pf-page-canvas" data-page-name="${safeName}">
    <div class="pf-canvas-wrap" data-h="${H}" style="width:100%;overflow:hidden;">
      <div class="pf-canvas-stage" data-w="${doc.stage.width}" style="position:relative;width:${doc.stage.width}px;height:${H}px;margin:0 auto;background:${doc.stage.background};transform-origin:top center;">
${els}
      </div>
    </div>
  </section>`;
}

// 混排导出的共享 JS：等比缩放全部 canvas stage（含容器高度校正）
export function canvasScaleJs() {
  return `<script>(function(){var ws=document.querySelectorAll('.pf-canvas-stage');function f(){var vw=document.documentElement.clientWidth;ws.forEach(function(s){var z=Math.min(1,vw/parseInt(s.dataset.w||'1440'));s.style.transform='scale('+z+')';var w=s.parentElement;if(w&&w.dataset.h)w.style.height=(parseInt(w.dataset.h)*z)+'px';});}addEventListener('resize',f);f();})();</script>`;
}

// 混排导出的共享 CSS/JS（动效 + 缩放），有动效时才带 reveal 部分
export function canvasAssets(docs) {
  const motion = docs.some(canvasHasMotion);
  return {
    css: motion ? `\n<style>${REVEAL_CSS}</style>` : '',
    js: `\n<script>${canvasScaleJs().replace(/^<script>|<\/script>$/g, '')}</script>${motion ? '\n<script>' + REVEAL_JS + '</script>' : ''}`,
  };
}
