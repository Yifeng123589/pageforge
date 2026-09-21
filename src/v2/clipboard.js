// v2 剪贴板（A0-10）：元素级 复制 / 剪切 / 粘贴 / 全选。
//
// 设计取舍：
//   · 用**模块内存**做剪贴板，不碰系统剪贴板——所以**跨页可用**（切到别的画布页照样能粘）
//   · 粘贴生成新 id、置于顶层、按阶梯偏移错开（连续粘贴一次比一次多错 24px）
//   · 剪切 = 复制 + 删除，整批一步撤销（撤销后元素原样回来）
//   · 锁定的元素不参与复制/全选（与画布上的锁定语义一致）

export function createClipboard({ getDoc, addElement, removeElement, snapshot, setSel, getMulti, getSel, elId, setMulti }) {
  let buffer = [];   // 元素快照（structuredClone 的副本）
  let pasteCount = 0; // 连续粘贴计数（决定偏移量）

  const maxZ = () => {
    const zs = getDoc().elements.map((e) => e.z);
    return zs.length ? Math.max(...zs) : 0;
  };

  /** 当前要操作的元素：优先多选，其次主选择；锁定的一律剔除 */
  function pick() {
    const multi = (getMulti && getMulti()) || [];
    const ids = multi.length ? [...multi] : (getSel() ? [getSel()] : []);
    return ids
      .map((id) => getDoc().elements.find((e) => e.id === id))
      .filter((e) => e && !e.locked);
  }

  function copy() {
    const els = pick();
    if (!els.length) return 0;
    buffer = structuredClone(els);
    pasteCount = 0;
    return els.length;
  }

  function cut() {
    const els = pick();
    if (!els.length) return 0;
    buffer = structuredClone(els);
    pasteCount = 0;
    snapshot();
    for (const e of els) removeElement(e.id);
    setSel(null);
    if (setMulti) setMulti([]);
    return els.length;
  }

  function paste() {
    if (!buffer.length) return 0;
    snapshot();
    pasteCount += 1;
    const offset = 24 * pasteCount;
    let z = maxZ();
    const created = [];
    for (const src of buffer) {
      const copy = structuredClone(src);
      copy.id = elId();
      copy.x += offset;
      copy.y += offset;
      copy.z = ++z;
      copy.locked = false;
      addElement(copy);
      created.push(copy.id);
    }
    // 选中新粘贴的内容（多个则设为多选），方便立刻继续拖动
    if (created.length > 1 && setMulti) setMulti(created);
    else setSel(created[created.length - 1]);
    return created.length;
  }

  function selectAllIds() {
    return getDoc().elements.filter((e) => !e.locked).map((e) => e.id);
  }

  return {
    copy,
    cut,
    paste,
    selectAllIds,
    hasContent: () => buffer.length > 0,
    size: () => buffer.length,
    clear: () => { buffer = []; pasteCount = 0; },
  };
}
