// 块 HTML 构建器（模式无关纯函数）：块定义 + AI 槽位 → 可插入 HTML
// 被 FlowAdapter（insert 前）与回归脚本共用；data-pf-slot 标记在此剥离
//
// DOM 依赖可注入（方案 Phase 0 P3）：浏览器用原生 DOMParser，Node 侧可传 linkedom
// 或退化为纯字符串实现。默认自动探测，两边都能跑。

/** 取出可用的 DOMParser（浏览器）或调用方注入的实现 */
function resolveParser(dom) {
  if (dom && typeof dom.parseFromString === 'function') return dom;
  if (typeof DOMParser !== 'undefined') return new DOMParser();
  return null;
}

/** 无 DOM 时的兜底：按 data-pf-slot 正则在字符串上填槽（只处理纯文本叶子） */
function fillSlotsByString(html, ai, slots) {
  let out = html;
  // 纯文本叶子：<tag ... data-pf-slot="key" ...>text</tag>
  // 文本里可能含 <br>（如 pf-hero 的标题），用 [\s\S]*? 但要避开嵌套同名标签
  out = out.replace(
    /<([a-z][a-z0-9-]*)([^>]*?)\sdata-pf-slot="([^"]+)"([^>]*)>((?:(?!<\/\1>)[\s\S])*)<\/\1>/gi,
    (m, tag, before, key, after, _text) => {
      const sch = ai.slots[key];
      // list 型（links 等多值槽）交给下面的专用逻辑，原样保留标记与内容
      if (sch?.type === 'list') return m;
      const v = slots?.[key];
      const attrs = `${before}${after}`.replace(/\s+$/, '');
      const text = sch && typeof v === 'string' && v.trim()
        ? escapeText(v.trim().slice(0, sch.max || 60))
        : _text;
      return `<${tag}${attrs}>${text}</${tag}>`;
    },
  );
  // items 槽：容器 data-pf-items，子项按顺序填「名称：描述」
  if (ai.slots.items) {
    const arr = Array.isArray(slots.items) ? slots.items : [];
    let idx = 0;
    out = out.replace(/<div([^>]*)\sdata-pf-items([^>]*)>/gi, (m, before, after) => `<div${before}${after}>`);
    // 逐个 <h3> 与紧随的 <p> 对应一条 items
    out = out.replace(/<h3([^>]*)>([^<]*)<\/h3>(\s*)<p([^>]*)>([^<]*)<\/p>/gi, (m, ha, ht, ws, pa, pt) => {
      const raw = typeof arr[idx] === 'string' ? arr[idx].trim() : '';
      idx += 1;
      if (!raw) return m;
      const seg = raw.split(/[：:]/);
      const h = seg.length >= 2 ? seg[0].trim().slice(0, 12) : raw.slice(0, 12);
      const p = seg.length >= 2 ? seg.slice(1).join('：').trim().slice(0, 50) : pt;
      return `<h3${ha}>${escapeText(h)}</h3>${ws}<p${pa}>${escapeText(p)}</p>`;
    });
  }
  // img 数组槽
  const imgKey = Object.keys(ai.slots).find((k) => ai.slots[k]?.type === 'list' && Array.isArray(slots?.[k]));
  if (imgKey) {
    const arr = slots[imgKey];
    out = out.replace(
      /(<img[^>]*?)\sdata-pf-slot-img="(\d+)"([^>]*>)/gi,
      (m, before, idx, after) => {
        const src = arr[Number(idx)];
        const attrs = `${before}${after}`;
        if (typeof src !== 'string' || !src.trim()) return `<img${attrs}>`;
        return /src="/.test(attrs)
          ? `<img${attrs.replace(/src="[^"]*"/, `src="${escapeText(src.trim())}"`)}>`
          : `<img src="${escapeText(src.trim())}"${attrs}>`;
      },
    );
  }
  // links 型多值文本槽：type:'list'，值为逗号分隔字符串，按文档顺序填入所有同名叶子
  for (const [key, sch] of Object.entries(ai.slots)) {
    if (sch?.type !== 'list') continue;
    const raw = slots?.[key];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const items = raw.split(/[,，|]/).map((s) => s.trim()).filter(Boolean);
    let n = 0;
    const re = new RegExp(
      `<([a-z][a-z0-9-]*)([^>]*?)\\sdata-pf-slot="${key}"([^>]*)>((?:(?!<\\/\\1>)[\\s\\S])*)<\\/\\1>`,
      'gi',
    );
    out = out.replace(re, (m, tag, before, after, text) => {
      const val = n < items.length ? escapeText(items[n++].slice(0, sch.max || 8)) : text;
      return `<${tag}${before}${after}>${val}</${tag}>`;
    });
    out = out.replace(new RegExp(`\\sdata-pf-slot="${key}"`, 'g'), '');
  }
  return out;
}

function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 块定义 + 槽位 → HTML。
 * @param {object} def 块定义（含 content / ai.slots）
 * @param {object} slots 槽位值
 * @param {object} [options]
 * @param {object} [options.dom] 可注入的 DOMParser（Node 侧用 linkedom 的 DOMParser）
 */
export function buildBlockHTML(def, slots = {}, options = {}) {
  const html = def.content;
  const ai = def.ai;
  if (!ai?.slots) return html;

  const parser = resolveParser(options.dom);
  if (!parser) return fillSlotsByString(html, ai, slots);

  const doc = parser.parseFromString(`<div id="__pf_root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__pf_root');
  if (!root) return fillSlotsByString(html, ai, slots);

  root.querySelectorAll('[data-pf-slot]').forEach((el) => {
    const key = el.getAttribute('data-pf-slot');
    const sch = ai.slots[key];
    const v = slots?.[key];
    if (sch && typeof v === 'string' && v.trim()) el.textContent = v.trim().slice(0, sch.max || 60);
    el.removeAttribute('data-pf-slot');
  });
  // items 槽：容器 data-pf-items，子项按顺序填「名称：描述」
  const itemsEl = root.querySelector('[data-pf-items]');
  if (itemsEl && ai.slots.items) {
    const arr = Array.isArray(slots.items) ? slots.items : [];
    [...itemsEl.children].forEach((col, i) => {
      const raw = typeof arr[i] === 'string' ? arr[i].trim() : '';
      if (!raw) return;
      const seg = raw.split(/[：:]/);
      const h3 = col.querySelector('h3');
      const p = col.querySelector('p');
      if (seg.length >= 2) {
        if (h3) h3.textContent = seg[0].trim().slice(0, 12);
        if (p) p.textContent = seg.slice(1).join('：').trim().slice(0, 50);
      } else if (h3) h3.textContent = raw.slice(0, 12);
    });
    itemsEl.removeAttribute('data-pf-items');
  }
  // img 数组槽：data-pf-slot-img="0|1|2"，值来自 slots[槽名]（如 imgs）
  const imgSlots = [...root.querySelectorAll('[data-pf-slot-img]')];
  if (imgSlots.length > 0) {
    const key = Object.keys(ai.slots).find((k) => ai.slots[k]?.type === 'list' && Array.isArray(slots?.[k]));
    const arr = key && Array.isArray(slots[key]) ? slots[key] : [];
    imgSlots.forEach((el) => {
      const idx = Number(el.getAttribute('data-pf-slot-img'));
      const src = arr[idx];
      if (typeof src === 'string' && src.trim()) el.setAttribute('src', src.trim());
      el.removeAttribute('data-pf-slot-img');
    });
  }
  return root.innerHTML;
}
