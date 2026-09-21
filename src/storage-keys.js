// PageForge localStorage 键集中注册（审计 2.6）：防碰撞 + 支持"清除全部数据"
// 新增键必须在此登记；迁移旧键时保留旧常量并注明
export const STORAGE_KEYS = {
  PROJECT: 'pageforge-project-v1',      // v1 GrapesJS 工程
  META: 'pageforge-meta-v1',            // 标题/描述/favicon/OG
  AI_CONFIG: 'pageforge-ai-config-v1',  // AI 服务商/模型/Key
  AI_KEY_LEGACY: 'pageforge-ai-key',    // 旧版 DeepSeek Key（迁移来源，不再写入）
  GAP_LOG: 'pageforge-gap-log-v1',      // AI 缺口日志
  ACE_MEMORY: 'pageforge-ace-memory-v1',// ACE 成本记忆
  V2_DOCS: 'pageforge-v2-docs-v1',      // v2 canvas 多文档
  V2_DOC_LEGACY: 'pageforge-v2-doc',    // v2 旧单文档（迁移来源）
  TEMPLATE_THUMBS: 'pageforge-template-thumbs',
  THEME: 'pageforge-theme',
  WELCOMED: 'pageforge-welcomed-v1',
  GUIDE_DONE: 'pageforge-guide-done-v1',
  VISITED: 'pageforge-visited',
  MEDIA_CLEANED: 'pf-media-cleaned-v1', // 旧媒体查询一次性迁移标记
  LOG_LEVEL: 'pf-log-level',
};

/** 清除 PageForge 全部本地数据（"清除全部数据"功能的基础） */
export function clearAllPageForgeStorage() {
  Object.values(STORAGE_KEYS).forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* 忽略 */ }
  });
}
