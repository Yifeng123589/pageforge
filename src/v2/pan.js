// v2 画布平移（A0-2）：Space+拖拽 / 中键拖拽。
//
// 缺陷背景（工程队列 §二）：v2 没有任何平移实现，放大后看不到画布边缘、只能缩回去——
// 平移与缩放是配对能力，缺了它"缩放"本身就不完整。
//
// 实现要点：
//   - 捕获阶段拦截 mousedown：平移态下事件不得落到元素上（否则会拖动元素/触发框选）
//   - 中键拖拽为惯例操作；Chrome 的中键"自动滚动"用 auxclick 抑制
//   - 只改 viewport 的 scrollLeft/scrollTop，不触碰文档坐标（元素绝不会被平移改动）
//   - 编辑中（文字编辑态）或焦点在输入框时，空格键交还给用户（正常打字）

export function initPan({ viewportEl, isEditing }) {
  let spaceDown = false;
  let pan = null;

  const isTypingTarget = (t) => {
    const tag = (t?.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!t?.isContentEditable;
  };

  const setReady = (on) => viewportEl.classList.toggle('pf-pan-ready', on);

  // —— 空格：进入/退出"准备平移"（光标变抓手）——
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || spaceDown) return;
    if (isEditing() || isTypingTarget(e.target)) return; // 打字/编辑中不抢空格
    spaceDown = true;
    setReady(true);
    e.preventDefault(); // 阻止浏览器把空格当滚动
  });
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    spaceDown = false;
    setReady(false);
  });
  // 切换窗口/失焦时复位，避免"卡在平移态"
  window.addEventListener('blur', () => {
    spaceDown = false;
    setReady(false);
  });

  // —— 起手：捕获阶段拦截，确保平移优先于元素拖拽/框选 ——
  viewportEl.addEventListener('mousedown', (e) => {
    const start = (spaceDown && e.button === 0) || e.button === 1;
    if (!start) return;
    e.preventDefault();
    e.stopPropagation();
    pan = {
      x: e.clientX, y: e.clientY,
      left: viewportEl.scrollLeft, top: viewportEl.scrollTop,
    };
    viewportEl.classList.add('pf-panning');
  }, true);

  // —— 拖动 ——
  document.addEventListener('mousemove', (e) => {
    if (!pan) return;
    e.preventDefault();
    viewportEl.scrollLeft = pan.left - (e.clientX - pan.x);
    viewportEl.scrollTop = pan.top - (e.clientY - pan.y);
  }, true);

  const end = () => {
    if (!pan) return;
    pan = null;
    viewportEl.classList.remove('pf-panning');
  };
  document.addEventListener('mouseup', end);
  // Esc 中断平移（与"松开即退出"并列的手感）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pan) { e.preventDefault(); e.stopPropagation(); end(); }
  }, true);

  // 中键默认的"自动滚动"会与拖拽抢事件
  viewportEl.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

  return { isPanning: () => !!pan };
}
