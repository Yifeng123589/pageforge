// 内容卫生校验（纯函数，Node/浏览器通用）
// 用于候选页 / design-kit 池的准入检查。
//
// 与 design-kit 的 EXTERNAL_PATTERNS 的差别（方案 §4.0 C）：
// design-kit 用全局 /https?:\/\// 判外链，会把内联 SVG 的
// xmlns="http://www.w3.org/2000/svg" 误判为外链（39 个素材图标全被拒）。
// 这里改成属性级判定：只有「会发起网络请求的属性」才算外链。

/** 会发起网络请求的属性（含 CSS url()） */
const URL_ATTRS = ['src', 'href', 'xlink:href', 'srcset', 'poster', 'data', 'action', 'formaction', 'background'];

/** XML 命名空间声明——不是外链，必须放行 */
const NAMESPACE_ATTRS = ['xmlns', 'xmlns:xlink'];

/** 允许的 data: 协议（内联资源） */
const SAFE_DATA = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif)[;,]|^data:font\/(woff2?|ttf|otf)[;,]|^data:text\/css[;,]|^#/i;

/** 固定三栏以上 grid（与 design-kit 0.1.14 的判据逐字一致）；有 @media 时不判 */
export const FIXED_MULTI_COLUMN_PATTERN =
  /grid-template-columns\s*:\s*(?:repeat\(\s*(?:[3-9]|[1-9]\d+)\s*,\s*(?:minmax\([^)]*\)|1fr)\s*\)|(?:1fr\s+){2,}1fr)/i;

/** 危险标签（可执行 / 可嵌入 / 可加载外部资源） */
const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'base', 'link', 'meta-http-equiv'];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 HTML 里提取所有「值」为 URL 的属性。
 * @returns {Array<{attr:string, value:string, raw:string}>}
 */
export function extractUrlAttributes(html) {
  if (typeof html !== 'string' || html === '') return [];
  const out = [];
  const attrRe = new RegExp(`\\b(${URL_ATTRS.map(escapeRe).join('|')})\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi');
  for (const m of html.matchAll(attrRe)) {
    const attr = m[1].toLowerCase();
    const value = (m[3] ?? m[4] ?? m[5] ?? '').trim();
    out.push({ attr, value, raw: m[0] });
  }
  return out;
}

/** CSS url(...) 里的值 */
export function extractCssUrls(html) {
  if (typeof html !== 'string') return [];
  const out = [];
  for (const m of html.matchAll(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    out.push(m[1].trim());
  }
  return out;
}

/** 单个值是否指向外部网络资源 */
export function isExternalUrl(value) {
  const v = String(value).trim();
  if (v === '') return false;
  if (v.startsWith('#')) return false;              // 页内锚点
  if (safevData(v)) return false;                   // 内联资源
  if (/^javascript:/i.test(v)) return true;         // 可执行
  if (/^https?:\/\//i.test(v)) return true;         // 绝对外链
  if (/^\/\//.test(v)) return true;                 // 协议相对外链
  if (/^file:/i.test(v)) return true;               // 本地文件
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return true;  // 其它协议（ftp/mailto 等）按外链处理
  return false;                                     // 相对路径（站内）
}

function safevData(v) {
  return SAFE_DATA.test(v);
}

/**
 * 校验候选页是否可进入 design-kit 池。
 * @returns {{ok:boolean, issues:Array<{code:string,message:string,detail?:string}>}}
 */
export function validateCandidateHtml(html) {
  const issues = [];
  if (typeof html !== 'string' || html.length < 200) {
    return { ok: false, issues: [{ code: 'TOO_SHORT', message: 'HTML 过短或不是字符串' }] };
  }
  if (html.length > 200 * 1024) {
    issues.push({ code: 'TOO_LARGE', message: `超过 200KB（当前 ${Math.round(html.length / 1024)}KB）` });
  }

  // 1. 危险标签
  for (const tag of DANGEROUS_TAGS) {
    if (tag === 'meta-http-equiv') {
      if (/<meta[^>]+http-equiv\s*=/i.test(html)) {
        issues.push({ code: 'META_REFRESH', message: '含 <meta http-equiv>（可做重定向）' });
      }
      continue;
    }
    if (new RegExp(`<${tag}\\b`, 'i').test(html)) {
      issues.push({ code: 'DANGEROUS_TAG', message: `含 <${tag}>`, detail: tag });
    }
  }

  // 2. 内联事件处理器
  const evt = /\son[a-z]+\s*=\s*["']/i.exec(html);
  if (evt) {
    issues.push({ code: 'INLINE_EVENT', message: `含内联事件处理器（${evt[0].trim()}）` });
  }

  // 3. javascript: 协议
  if (/javascript\s*:/i.test(html)) {
    issues.push({ code: 'JAVASCRIPT_URL', message: '含 javascript: 协议' });
  }

  // 4. 外链属性（属性级，不误杀 xmlns）
  for (const { attr, value } of extractUrlAttributes(html)) {
    if (NAMESPACE_ATTRS.includes(attr)) continue;
    if (isExternalUrl(value)) {
      issues.push({ code: 'EXTERNAL_URL', message: `属性 ${attr} 指向外部资源`, detail: value.slice(0, 80) });
    }
  }

  // 5. CSS url() 外链
  for (const u of extractCssUrls(html)) {
    if (isExternalUrl(u)) {
      issues.push({ code: 'EXTERNAL_CSS_URL', message: 'CSS url() 指向外部资源', detail: u.slice(0, 80) });
    }
  }

  // 6. @import
  if (/@import/i.test(html)) {
    issues.push({ code: 'CSS_IMPORT', message: '含 @import' });
  }

  // 7. 运行时能力
  if (/\bfetch\s*\(/i.test(html)) issues.push({ code: 'FETCH', message: '含 fetch()' });
  if (/\blocalStorage\b/i.test(html)) issues.push({ code: 'STORAGE', message: '含 localStorage' });

  // 8. 360 可读性：无 @media 的固定三栏以上 grid
  // 与 design-kit 0.1.14 的 FIXED_MULTI_COLUMN_PATTERN 对齐——两边判定必须一致，
  // 否则会出现「PageForge 放行、kit 拒绝」的集成分歧（实测 2 例）。
  if (!/@media\b/i.test(html) && FIXED_MULTI_COLUMN_PATTERN.test(html)) {
    issues.push({
      code: 'FIXED_MULTI_COLUMN',
      message: '含固定三栏以上 grid 且没有 @media：360 下会挤压，改用 auto-fit 或 @media 单列',
    });
  }

  return { ok: issues.length === 0, issues };
}

/** 固定 stage（canvas 导出）检测：这类页面不能进候选池 */
export function isFixedCanvasPage(html) {
  if (typeof html !== 'string') return false;
  return /pf-canvas-stage/.test(html)
    || /data-pf-canvas/.test(html)
    || (/width:\s*1440px/.test(html) && /transform-origin:\s*top center/.test(html));
}
