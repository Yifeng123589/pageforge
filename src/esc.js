// 共享转义工具（审计 BUG-03/06/08/09/18）：所有 innerHTML/属性拼接用户或 AI 可控文本前必须使用
export const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// HTML 属性值转义（含 >，防属性截断；审计 BUG-06 指出的两份不一致以此为准）
export const escapeAttr = (s) => escHtml(s);
