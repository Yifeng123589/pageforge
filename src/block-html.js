// 块 HTML 构建器（模式无关纯函数）：块定义 + AI 槽位 → 可插入 HTML
// 被 FlowAdapter（insert 前）与回归脚本共用；data-pf-slot 标记在此剥离

export function buildBlockHTML(def, slots = {}) {
  let html = def.content;
  const ai = def.ai;
  if (ai?.slots) {
    const doc = new DOMParser().parseFromString(`<div id="__pf_root">${html}</div>`, 'text/html');
    const root = doc.getElementById('__pf_root');
    root.querySelectorAll('[data-pf-slot]').forEach((el) => {
      const key = el.getAttribute('data-pf-slot');
      const sch = ai.slots[key];
      const v = slots?.[key];
      if (sch && typeof v === 'string' && v.trim()) el.textContent = v.trim().slice(0, sch.max || 60);
      el.removeAttribute('data-pf-slot');
    });
    // items 槽：容器 data-pf-items，子项按顺序填"名称：描述"
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
    html = root.innerHTML;
  }
  return html;
}
