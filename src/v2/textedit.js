// v2 叶级文本编辑：双击文字叶子 → 单叶 contenteditable → 失焦/Esc 提交
// 设计要点（规范 §3 / 硬伤一解法）：
//   - 只把被双击的叶子设为可编辑，外部元素零重绘（光标不乱跳）
//   - 提交时白名单清洗（标签/属性），整元素 html 回写 + 撤销快照
//   - 编辑期间 interact 层让路（v2-editing 类 + isEditing()）

const ALLOWED_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'STRONG', 'EM', 'UL', 'LI', 'BR', 'IMG', 'DIV', 'SECTION']);
const ALLOWED_ATTRS = new Set(['style', 'href', 'src', 'alt', 'data-id']);

let editing = null; // { elementId, leafId }
let commitFn = null;

export function isEditing() { return !!editing; }
export function commitIfEditing() { if (editing && commitFn) commitFn(); }

// 白名单清洗：非白名单标签解包（保留子内容），属性只留白名单
function sanitize(container) {
  const walk = (node) => {
    [...node.children].forEach((child) => {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        const frag = document.createDocumentFragment();
        while (child.firstChild) frag.appendChild(child.firstChild);
        child.replaceWith(frag);
        return;
      }
      [...child.attributes].forEach((a) => {
        if (!ALLOWED_ATTRS.has(a.name)) child.removeAttribute(a.name);
      });
      if (child.tagName === 'A') {
        const href = child.getAttribute('href') || '#';
        if (!/^(https?:|#)/i.test(href)) child.setAttribute('href', '#');
      }
      walk(child);
    });
  };
  walk(container);
}

export function initTextEditing({ stageEl, getDoc, updateElement, snapshot }) {
  function commit() {
    commitFn = null;
    if (!editing) return;
    const { elementId } = editing;
    editing = null;
    stageEl.classList.remove('v2-editing');
    const elDiv = stageEl.querySelector(`[data-el-id="${elementId}"]`);
    if (!elDiv) return;
    const leaf = elDiv.querySelector('[contenteditable="true"]');
    if (leaf) {
      leaf.contentEditable = 'false';
      sanitize(leaf);
    }
    // 回写元素 html：克隆容器去掉手柄/编辑痕迹后序列化
    const clone = elDiv.cloneNode(true);
    clone.querySelectorAll('.v2-h').forEach((n) => n.remove());
    clone.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'));
    updateElement(elementId, { html: clone.innerHTML });
  }

  stageEl.addEventListener('dblclick', (e) => {
    const leaf = e.target.closest('[data-id]');
    const elDiv = e.target.closest('[data-el-id]');
    if (!leaf || !elDiv || editing) return;
    const elementId = elDiv.dataset.elId;
    const el = getDoc().elements.find((x) => x.id === elementId);
    if (!el || el.locked) return;
    if (!el.html.includes(`data-id="${leaf.dataset.id}"`)) return; // 只允许编辑文档里有记录的叶子
    snapshot(); // 编辑前快照：Ctrl+Z 可整体回到编辑前
    editing = { elementId, leafId: leaf.dataset.id };
    leaf.contentEditable = 'true';
    stageEl.classList.add('v2-editing');
    leaf.focus();
    const range = document.createRange();
    range.selectNodeContents(leaf);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    e.preventDefault();
  });

  // 编辑中回车 = 换行（避免产生无 data-id 的嵌套块）
  stageEl.addEventListener('keydown', (e) => {
    if (!editing || e.key !== 'Enter' || e.shiftKey) return;
    const leaf = e.target.closest?.('[contenteditable="true"]');
    if (!leaf) return;
    e.preventDefault();
    document.execCommand('insertLineBreak');
  });
  stageEl.addEventListener('keydown', (e) => {
    if (!editing || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation(); // 只退出编辑，不触发外层的取消选择
    commit();
  });
  // 失焦即提交
  stageEl.addEventListener('focusout', (e) => {
    if (!editing) return;
    if (e.target.closest?.('[contenteditable="true"]')) commit();
  });

  commitFn = commit;
  return { commit };
}
