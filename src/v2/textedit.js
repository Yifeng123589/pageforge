// v2 叶级文本编辑：双击文字叶子 → 单叶 contenteditable → 失焦/Esc 提交
// 设计要点（规范 §3 / 硬伤一解法）：
//   - 只把被双击的叶子设为可编辑，外部元素零重绘（光标不乱跳）
//   - 提交时白名单清洗（标签/属性），整元素 html 回写 + 撤销快照
//   - 编辑期间 interact 层让路（v2-editing 类 + isEditing()）

const ALLOWED_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'STRONG', 'EM', 'UL', 'LI', 'BR', 'IMG', 'DIV', 'SECTION']);
const ALLOWED_ATTRS = new Set(['style', 'href', 'src', 'alt', 'data-id']);

let editing = null; // { elementId, leafId }
let commitFn = null;
let composing = false;     // IME 组字中（拼音/候选词尚未确认）
let pendingCommit = false; // 组字期间被要求提交 → 等 compositionend 后再提交

export function isEditing() { return !!editing; }
export function commitIfEditing() { if (editing && commitFn) commitFn(); }

// 白名单清洗：非白名单标签解包（保留子内容），属性只留白名单。
// 审计 BUG-02 修复：解包标签后其子节点成为 node 的新子节点，需重扫——
// 改为"索引不递增"的循环（子节点被提升后原地重新检查），避免快照漏检嵌套非法标签
function sanitize(container) {
  const walk = (node) => {
    let i = 0;
    while (i < node.children.length) {
      const child = node.children[i];
      if (!ALLOWED_TAGS.has(child.tagName)) {
        const frag = document.createDocumentFragment();
        while (child.firstChild) frag.appendChild(child.firstChild);
        child.replaceWith(frag);
        // 不递增 i：提升的子节点顶到当前位置，下一轮继续检查
        continue;
      }
      [...child.attributes].forEach((a) => {
        if (!ALLOWED_ATTRS.has(a.name)) child.removeAttribute(a.name);
      });
      if (child.tagName === 'A') {
        const href = child.getAttribute('href') || '#';
        if (!/^(https?:|#)/i.test(href)) child.setAttribute('href', '#');
      }
      walk(child);
      i++;
    }
  };
  walk(container);
}

export function initTextEditing({ stageEl, getDoc, updateElement, snapshot }) {
  function commit() {
    commitFn = null;
    composing = false;
    pendingCommit = false;
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

  // 进入编辑态（双击与 Enter 键共用）——返回是否成功进入
  function enterEdit(leaf, elDiv) {
    const elementId = elDiv.dataset.elId;
    const el = getDoc().elements.find((x) => x.id === elementId);
    if (!el || el.locked) return false;
    if (!el.html.includes(`data-id="${leaf.dataset.id}"`)) return false; // 只允许编辑文档里有记录的叶子
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
    return true;
  }

  stageEl.addEventListener('dblclick', (e) => {
    const leaf = e.target.closest('[data-id]');
    const elDiv = e.target.closest('[data-el-id]');
    if (!leaf || !elDiv || editing) return;
    if (enterEdit(leaf, elDiv)) e.preventDefault();
  });

  // Enter 进编辑（A0-11）：由 main 的快捷键调用——编辑该元素的第一个文字叶子
  function startEditing(elementId) {
    if (editing || !elementId) return false;
    const elDiv = stageEl.querySelector(`[data-el-id="${elementId}"]`);
    if (!elDiv) return false;
    const leaf = elDiv.querySelector('p[data-id], h1[data-id], h2[data-id], h3[data-id], h4[data-id], span[data-id], a[data-id], div[data-id]');
    if (!leaf) return false;
    return enterEdit(leaf, elDiv);
  }

  // IME 组字跟踪（A0-1）：组字期间（拼音/候选尚未确认）绝不能把中间态当内容处理。
  // 中文输入法约定：组字中 Enter = 确认候选词、Escape = 取消组字——一律交给输入法。
  stageEl.addEventListener('compositionstart', (e) => {
    if (!editing) return;
    if (e.target.closest?.('[contenteditable="true"]')) composing = true;
  });
  stageEl.addEventListener('compositionend', (e) => {
    if (!editing) return;
    if (!e.target.closest?.('[contenteditable="true"]')) return;
    composing = false;
    // 组字期间发生过失焦（例如点了输入法候选面板）→ 现在补提交
    if (pendingCommit) { pendingCommit = false; commit(); }
  });

  // 编辑中回车 = 换行（避免产生无 data-id 的嵌套块）
  stageEl.addEventListener('keydown', (e) => {
    if (!editing) return;
    if (e.isComposing || composing || e.keyCode === 229) return; // 组字中：Enter 是确认候选词
    if (e.key !== 'Enter' || e.shiftKey) return;
    const leaf = e.target.closest?.('[contenteditable="true"]');
    if (!leaf) return;
    e.preventDefault();
    document.execCommand('insertLineBreak');
  });
  stageEl.addEventListener('keydown', (e) => {
    if (!editing) return;
    if (e.isComposing || composing || e.keyCode === 229) return; // 组字中：Escape 是取消组字
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation(); // 只退出编辑，不触发外层的取消选择
    commit();
  });
  // 失焦即提交；组字中则延后到 compositionend（避免把未确认的拼音写进叶子）
  stageEl.addEventListener('focusout', (e) => {
    if (!editing) return;
    if (!e.target.closest?.('[contenteditable="true"]')) return;
    if (composing) { pendingCommit = true; return; }
    commit();
  });

  commitFn = commit;
  return { commit, startEditing };
}
