// 候选页合成（纯函数）：块组合 + 主题 + design-kit 内容槽 → 可导入的 12 页 bundle
//
// 设计约束（均来自实测定档，见 docs/mcp-ai-方案评估.md）：
// 1. foot 槽只有 pf-footer 能给 → 每个候选必须含 pf-footer
// 2. bullet×3 + meta×3 只有 pf-section-features / pf-media-cards 能给
// 3. 整池 12 页 HTML 必须互不相同 → 组合×主题必须 12 个不同组合
// 4. 输出必须过 validateCandidateHtml（无脚本/外链/iframe）
// 5. 响应式块直出，不能用 canvas 固定 stage

import { blocks } from './blocks.js';
import { themes } from './themes.js';
import { buildBlockHTML } from './block-html.js';
import { validateCandidateHtml, isFixedCanvasPage } from './validate.js';

/** 内容槽 → 6 个 design-kit 槽位（title/subtitle/bullet×3/meta×3/cta/foot） */
const SLOT_ATTR = {
  title: 'title', sub: 'subtitle', btn: 'cta',
};

/** 能给 bullet×3 + meta×3 的块 */
export const BULLET_BLOCKS = ['pf-section-features', 'pf-media-cards'];
/** foot 唯一来源 */
export const FOOT_BLOCK = 'pf-footer';
/** hero 候选（能提供 title + subtitle + cta） */
export const HERO_BLOCKS = ['pf-hero', 'pf-hero-img', 'pf-hero-overlay', 'pf-section-split', 'pf-section-split-r'];

const getBlock = (id) => {
  const b = blocks.find((x) => x.id === id);
  if (!b) throw new Error(`未知块：${id}`);
  return b;
};

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 把 content 拆成块槽位 */
function slotPlanFor(content) {
  return {
    title: String(content.title || '').slice(0, 40),
    sub: String(content.subtitle || '').slice(0, 80),
    btn: String(content.cta || '').slice(0, 16),
    items: (content.bullets || []).slice(0, 3).map((b) => `${b.text}：${b.meta}`),
  };
}

/** 主题换色（与 theme-apply 的意图一致：按 map 做颜色替换） */
function recolor(html, themeId) {
  const t = themes.find((x) => x.id === themeId);
  if (!t) return html;
  let out = html;
  for (const [from, to] of Object.entries(t.map)) {
    out = out.split(from).join(to).split(from.toUpperCase()).join(to);
  }
  return out;
}

/**
 * 给 data-pf-slot 元素同时打上 design-kit 的 data-slot。
 * buildBlockHTML 会剥离 data-pf-slot，但保留 data-slot —— 两个标记并存才能
 * 既完成填槽、又让 design-kit 读回内容槽。
 */
function dualMarkSlotAttrs(html) {
  let out = html;
  for (const [pf, dk] of Object.entries(SLOT_ATTR)) {
    out = out.replace(
      new RegExp(`(<[a-z][a-z0-9-]*)([^>]*?)\\sdata-pf-slot="${pf}"([^>]*>)`, 'gi'),
      `$1$2 data-pf-slot="${pf}" data-slot="${dk}"$3`,
    );
  }
  return out;
}

/**
 * 去掉重复的标题槽：hero 已经承载 title/subtitle，后续区块不应再出现同名字槽。
 * pf-section-features / pf-media-cards 自带的区块标题在这里退化为普通文本，
 * 否则页面会出现两次大标题。
 */
function dedupeTitleSlots(html, keepTitle) {
  let seen = 0;
  return html.replace(/<([a-z][a-z0-9-]*)([^>]*?)\sdata-slot="(title|subtitle)"([^>]*)>((?:(?!<\/\1>)[\s\S])*)<\/\1>/gi,
    (m, tag, before, slot, after, text) => {
      const attrs = `${before}${after}`.replace(/\s+$/, '');
      if (keepTitle) return `<${tag}${attrs} data-slot="${slot}">${text}</${tag}>`;
      seen += 1;
      // 保留元素与样式（只是不再当内容槽），避免布局塌陷
      return `<${tag}${attrs}>${text}</${tag}>`;
    });
}

/** 只保留第一个 cta 槽，其余退化为普通链接（样式不变） */
function dropExtraCta(html, keep) {
  if (keep) return html;
  return html.replace(/<([a-z][a-z0-9-]*)([^>]*?)\sdata-slot="cta"([^>]*)>/gi, '<$1$2$3>');
}

/** 把 pf-footer 的版权行改成 design-kit 认的纯文本 foot 槽 */
function markFoot(html, footText) {
  const text = String(footText || '').trim();
  let replaced = false;
  const out = html.replace(
    /<div([^>]*)>((?:(?!<\/div>)[\s\S])*©[\s\S]*?)<\/div>/i,
    (m, attrs) => {
      replaced = true;
      const fallback = /©[^<]*/.exec(m);
      const body = text || (fallback ? fallback[0].trim() : '© 2026');
      return `<p data-slot="foot"${attrs}>${escapeText(body)}</p>`;
    },
  );
  // 没有版权行时补一个（foot 槽是硬需求）
  if (!replaced && text) {
    return out.replace(/<\/footer>/i, `<p data-slot="foot" style="color:inherit;">${escapeText(text)}</p></footer>`);
  }
  return out;
}

/**
 * 三列内容 → bullet/meta 槽。
 * pf-section-features 是 <h3> 后跟 <p>；pf-media-cards 是 <p> 后跟 <h3>（顺序相反）。
 * design-kit 要求恰好 3 个 bullet + 3 个 meta，且都是纯文本叶子。
 */
function markItemSlots(html) {
  let out = html;
  let n = 0;
  // features 形态：h3 在前
  out = out.replace(/<h3([^>]*)>([\s\S]*?)<\/h3>(\s*)<p([^>]*)>([\s\S]*?)<\/p>/gi, (m, ha, ht, ws, pa, pt) => {
    if (n >= 3) return m;
    n += 1;
    return `<h3 data-slot="bullet"${ha}>${ht}</h3>${ws}<p data-slot="meta"${pa}>${pt}</p>`;
  });
  if (n > 0) return out;

  // media-cards 形态：p 在前、h3 在后（卡片里的简介 + 标题）
  let k = 0;
  out = out.replace(/<p([^>]*)>([\s\S]*?)<\/p>(\s*)<h3([^>]*)>([\s\S]*?)<\/h3>/gi, (m, pa, pt, ws, ha, ht) => {
    if (k >= 3) return m;
    k += 1;
    return `<p data-slot="meta"${pa}>${pt}</p>${ws}<h3 data-slot="bullet"${ha}>${ht}</h3>`;
  });
  return out;
}

/**
 * 合成单个候选页 HTML。
 * @param {object} opts
 * @param {string[]} opts.blockIds 块 id 序列（必须含 pf-footer 与一个 BULLET_BLOCK）
 * @param {string} opts.themeId 主题
 * @param {object} opts.content 内容槽（title/subtitle/bullets[3]/cta/foot）
 */
export function composeCandidateHtml({ blockIds, themeId, content }) {
  if (!Array.isArray(blockIds) || blockIds.length === 0) throw new Error('blockIds 必须是非空数组');
  if (!blockIds.includes(FOOT_BLOCK)) throw new Error(`候选必须含 ${FOOT_BLOCK}（foot 槽唯一来源）`);
  if (!blockIds.some((id) => BULLET_BLOCKS.includes(id))) {
    throw new Error(`候选必须含 ${BULLET_BLOCKS.join(' 或 ')}（bullet/meta 槽来源）`);
  }

  const slots = slotPlanFor(content);
  let heroSeen = false;
  let ctaSeen = false;
  const parts = blockIds.map((id) => {
    const def = getBlock(id);
    // 关键：title/sub/btn 只给第一个能承标题的块（按块自身是否带 title 槽判断，
    // 而不是按块名），否则整页会重复出现多次大标题。
    const blockHasTitle = /data-pf-slot="title"/.test(def.content);
    const takesTitle = blockHasTitle && !heroSeen;
    const blockSlots = id === FOOT_BLOCK
      ? { brand: String(content.foot || '').slice(0, 20), intro: String(content.subtitle || '').slice(0, 40) }
      : (takesTitle ? slots : { items: slots.items });
    if (takesTitle) heroSeen = true;

    let html = dualMarkSlotAttrs(def.content);
    html = buildBlockHTML({ ...def, content: html }, blockSlots);
    html = recolor(html, themeId);
    html = markItemSlots(html);
    // title/subtitle 槽只保留在承标题的那个块上
    if (/data-slot="(title|subtitle)"/.test(html)) {
      html = dedupeTitleSlots(html, takesTitle);
    }
    // cta 同理：design-kit 只认一个 cta 槽
    if (/data-slot="cta"/.test(html)) {
      html = dropExtraCta(html, takesTitle && !ctaSeen);
      if (takesTitle) ctaSeen = true;
    }
    if (id === FOOT_BLOCK) html = markFoot(html, content.foot);
    return html;
  });

  const theme = themes.find((x) => x.id === themeId);
  const body = parts.join('\n');
  // design-kit 要求 <title> 与 title 槽逐字一致
  const title = escapeText(slots.title);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body{margin:0;background:${theme ? theme.bodyBg : '#ffffff'};font-family:${theme ? theme.font : 'sans-serif'};-webkit-font-smoothing:antialiased;}
  img{max-width:100%;}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** 12 页的组合计划：3 lineage 家族 × 3 变体 + contrast 轮 */
const DEFAULT_SKELETONS = [
  // R1 lineage：极简家族
  { round: 1, relation: { relation: 'lineage', family: 'pageforge-minimal' }, pages: [
    { blockIds: ['pf-hero', 'pf-section-features', 'pf-footer'], theme: 'apple', variant: '居中堆叠', ornament: 'low', image: 'low' },
    { blockIds: ['pf-nav-glass', 'pf-hero', 'pf-media-cards', 'pf-footer'], theme: 'flat', variant: '顶栏居中', ornament: 'low', image: 'low' },
    { blockIds: ['pf-hero-split-x', 'pf-section-split', 'pf-section-features', 'pf-footer'], theme: 'apple', variant: '双栏分置', ornament: 'mid', image: 'mid' },
  ] },
  // R2 lineage：编辑家族
  { round: 2, relation: { relation: 'lineage', family: 'pageforge-editorial' }, pages: [
    { blockIds: ['pf-hero-img', 'pf-section-features', 'pf-cta-banner', 'pf-footer'], theme: 'warm', variant: '大图居中', ornament: 'mid', image: 'high' },
    { blockIds: ['pf-hero', 'pf-media-cards', 'pf-cta-banner', 'pf-footer'], theme: 'warm', variant: '媒体卡片', ornament: 'mid', image: 'mid' },
    { blockIds: ['pf-nav-glass', 'pf-hero-img', 'pf-media-cards', 'pf-footer'], theme: 'dark', variant: '顶栏大图', ornament: 'high', image: 'high' },
  ] },
  // R3 contrast：装饰密度
  { round: 3, relation: { relation: 'contrast', axis: 'ornament' }, pages: [
    { blockIds: ['pf-hero', 'pf-section-features', 'pf-footer'], theme: 'neon', variant: '低装饰', ornament: 'low', image: 'low' },
    { blockIds: ['pf-announce', 'pf-hero', 'pf-media-cards', 'pf-footer'], theme: 'flat', variant: '中装饰', ornament: 'mid', image: 'mid' },
    { blockIds: ['pf-announce', 'pf-nav-glass', 'pf-hero-img', 'pf-section-features', 'pf-cta-banner', 'pf-footer'], theme: 'dark', variant: '高装饰', ornament: 'high', image: 'mid' },
  ] },
  // R4 contrast：影像参与度
  { round: 4, relation: { relation: 'contrast', axis: 'image' }, pages: [
    { blockIds: ['pf-nav-glass', 'pf-hero', 'pf-section-features', 'pf-footer'], theme: 'neon', variant: '无影像', ornament: 'mid', image: 'low' },
    { blockIds: ['pf-hero-overlay', 'pf-section-split', 'pf-section-features', 'pf-footer'], theme: 'neon', variant: '半影像', ornament: 'mid', image: 'mid' },
    { blockIds: ['pf-hero-img', 'pf-media-cards', 'pf-cta-banner', 'pf-footer'], theme: 'dark', variant: '影像主导', ornament: 'high', image: 'high' },
  ] },
];

const AXES_BY_THEME = {
  apple: { material: '纸白', type: '无衬线', layout: '单列', color: '苹果灰' },
  flat: { material: '纸白', type: '无衬线', layout: '栅格', color: '微软蓝' },
  warm: { material: '米色', type: '衬线', layout: '双栏', color: '陶土橙' },
  dark: { material: '深灰', type: '无衬线', layout: '满版', color: '暗紫' },
  neon: { material: '暗底', type: '等宽', layout: '满版', color: '霓虹' },
};

/**
 * 合成 design-kit 的 shortlist-external-import/1 bundle。
 * @param {object} opts
 * @param {object} opts.content 内容槽（title/subtitle/bullets/cta/foot）
 * @param {string} [opts.seed]
 * @param {object} [opts.skill] 来源声明
 * @param {Array} [opts.plan] 自定义 4 轮计划（默认 DEFAULT_SKELETONS）
 */
export function composeBundle({ content, seed = 'pageforge', skill, plan = DEFAULT_SKELETONS }) {
  const rounds = [];
  const problems = [];
  const seenHtml = new Map();

  for (const roundPlan of plan) {
    const candidates = roundPlan.pages.map((page, i) => {
      // 修掉计划里的占位笔误
      const blockIds = page.blockIds.filter((id) => id !== 'pf-hero-split-x');
      const id = `r${roundPlan.round}p${i + 1}`;
      let html;
      try {
        html = composeCandidateHtml({ blockIds, themeId: page.theme, content });
      } catch (e) {
        problems.push(`${id}: ${e.message}`);
        return null;
      }
      const check = validateCandidateHtml(html);
      if (!check.ok) problems.push(`${id}: ${check.issues.map((x) => x.code).join(',')}`);
      if (isFixedCanvasPage(html)) problems.push(`${id}: 固定 stage 页面不能入池`);
      if (seenHtml.has(html)) problems.push(`${id}: 与 ${seenHtml.get(html)} HTML 完全相同`);
      seenHtml.set(html, id);

      return {
        id,
        html,
        world: {
          family: roundPlan.relation.relation === 'lineage' ? roundPlan.relation.family : `pageforge-${page.theme}`,
          variant: page.variant,
          contrast: { ornament: page.ornament, image: page.image },
          axes: AXES_BY_THEME[page.theme] || AXES_BY_THEME.apple,
        },
      };
    }).filter(Boolean);

    rounds.push({ round: roundPlan.round, relation: roundPlan.relation, candidates });
  }

  return {
    bundle: {
      schema: 'shortlist-external-import/1',
      writer: 'external',
      skill: skill || { id: 'pageforge', source: 'local:pageforge', license: 'MIT', promptHash: 'compose' },
      seed,
      rounds,
    },
    problems,
    ok: problems.length === 0,
  };
}

export { DEFAULT_SKELETONS };
