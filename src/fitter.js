// PageForge 曲线拟合器（Desmos 式）
// 功能：SVG 网格画布点击/拖拽数据点 → 多项式/指数/正弦最小二乘拟合 →
//       实时表达式 + R² → 一键转 SVG 波浪分割线插入页面（零依赖，自写数学）

// ============ 数学：高斯消元解线性方程组 ============
function gaussSolve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) A[i] = [...A[i], b[i]];
  for (let col = 0; col < n; col++) {
    // 找主元
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null; // 奇异
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    for (let j = col; j <= n; j++) A[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let j = col; j <= n; j++) A[r][j] -= f * A[col][j];
    }
  }
  return A.map((row) => row[n]);
}

// 多项式回归 y = c0 + c1 x + c2 x² + ...
export function polyfit(xs, ys, degree) {
  const n = xs.length;
  if (n < degree + 1) return null;
  const A = [];
  const b = [];
  for (let i = 0; i <= degree; i++) {
    A.push([]);
    for (let j = 0; j <= degree; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += Math.pow(xs[k], i + j);
      A[i].push(s);
    }
    let s = 0;
    for (let k = 0; k < n; k++) s += ys[k] * Math.pow(xs[k], i);
    b.push(s);
  }
  const coeffs = gaussSolve(A, b);
  if (!coeffs) return null;
  const r2 = calcR2(xs, ys, (x) => coeffs.reduce((acc, c, i) => acc + c * Math.pow(x, i), 0));
  return { coeffs, r2 };
}

// 指数拟合 y = a·e^(bx)（ln y 线性化）
export function expfit(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const ly = ys.map((y) => (y > 0 ? Math.log(y) : null));
  if (ly.some((v) => v === null)) return null;
  const lx = xs, lly = ly;
  const mx = lx.reduce((a, b) => a + b, 0) / n;
  const my = lly.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (lx[i] - mx) ** 2;
    sxy += (lx[i] - mx) * (lly[i] - my);
  }
  if (Math.abs(sxx) < 1e-12) return null;
  const b = sxy / sxx;
  const a = Math.exp(my - b * mx);
  const r2 = calcR2(xs, ys, (x) => a * Math.exp(b * x));
  return { a, b, r2 };
}

// 正弦拟合 y = A sin(ωx) + B cos(ωx) + c（ω 网格搜索 + 正规方程最小二乘）
export function sinfit(xs, ys) {
  const n = xs.length;
  if (n < 4) return null;
  const xr = Math.max(...xs) - Math.min(...xs);
  let best = null;
  for (let w = 0.2; w <= 20.01; w += 0.1) {
    // 正规方程 AᵀA·c = Aᵀy（3×3 方阵，gaussSolve 只解方阵）
    const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const Atb = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const s = Math.sin(w * xs[i]);
      const c = Math.cos(w * xs[i]);
      AtA[0][0] += s * s; AtA[0][1] += s * c; AtA[0][2] += s;
      AtA[1][0] += s * c; AtA[1][1] += c * c; AtA[1][2] += c;
      AtA[2][0] += s; AtA[2][1] += c; AtA[2][2] += 1;
      Atb[0] += ys[i] * s; Atb[1] += ys[i] * c; Atb[2] += ys[i];
    }
    const sol = gaussSolve(AtA.map((r) => [...r]), [...Atb]);
    if (!sol) continue;
    const r2 = calcR2(xs, ys, (x) => sol[0] * Math.sin(w * x) + sol[1] * Math.cos(w * x) + sol[2]);
    if (!best || r2 > best.r2) {
      const amp = Math.sqrt(sol[0] ** 2 + sol[1] ** 2);
      const phi = Math.atan2(sol[1], sol[0]);
      best = { a: amp, omega: w, phi, c: sol[2], r2 };
    }
  }
  return best && best.r2 > -0.5 ? best : null;
}

// R² = 1 - SS_res / SS_tot
function calcR2(xs, ys, f) {
  const n = xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - f(xs[i])) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  if (ssTot < 1e-12) return 1;
  return 1 - ssRes / ssTot;
}

// 表达式格式化
function fmt(v) {
  if (Math.abs(v) < 1e-10) return '0';
  return parseFloat(v.toFixed(4)).toString();
}
export function formatPoly(coeffs) {
  const parts = [];
  for (let i = coeffs.length - 1; i >= 0; i--) {
    const c = coeffs[i];
    if (Math.abs(c) < 1e-10) continue;
    const sign = c < 0 ? ' − ' : (parts.length ? ' + ' : '');
    const abs = fmt(Math.abs(c));
    const term = i === 0 ? abs : i === 1 ? `${abs}x` : `${abs}x<sup>${i}</sup>`;
    parts.push(sign + term);
  }
  return parts.join('') || '0';
}
export function formatExp({ a, b }) {
  return `${fmt(a)}·e<sup>${fmt(b)}x</sup>`;
}
export function formatSin({ a, omega, phi, c }) {
  return `${fmt(a)}·sin(${fmt(omega)}x ${phi >= 0 ? '+' : '−'} ${fmt(Math.abs(phi))})${Math.abs(c) > 1e-10 ? ` + ${fmt(c)}` : ''}`;
}

// ============ 拟合器 UI ============
export function initFitter({ editor, toast }) {
  const svg = document.getElementById('fit-canvas');
  const NS = 'http://www.w3.org/2000/svg';
  const W = 800, H = 400;
  // 数据域：x ∈ [0, 10]，y ∈ [0, 4]
  const X0 = 60, X1 = 760, Y0 = 380, Y1 = 20;
  const toPx = (x, y) => [X0 + (x / 10) * (X1 - X0), Y0 - (y / 4) * (Y0 - Y1)];
  const toData = (px, py) => [((px - X0) / (X1 - X0)) * 10, ((Y0 - py) / (Y0 - Y1)) * 4];

  let points = [];      // [{x, y}]
  let fitResult = null; // {formula, fn, r2, type}
  let dragIdx = -1;

  const typeSel = document.getElementById('fit-type');
  const formulaEl = document.getElementById('fit-formula');
  const r2El = document.getElementById('fit-r2');
  const insertBtn = document.getElementById('fit-insert');

  // 网格
  function drawGrid() {
    let g = svg.querySelector('.grid');
    if (!g) {
      g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'grid');
      svg.prepend(g);
    }
    g.innerHTML = '';
    const mk = (x1, y1, x2, y2, cls) => {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('class', cls);
      g.appendChild(l);
    };
    for (let i = 0; i <= 10; i++) {
      const [px, py] = toPx(i, 0);
      mk(px, Y1, px, Y0, i === 0 || i === 10 ? 'grid-main' : 'grid-line');
    }
    for (let i = 0; i <= 4; i++) {
      const [px, py] = toPx(0, i);
      mk(X0, py, X1, py, i === 0 || i === 4 ? 'grid-main' : 'grid-line');
    }
    // 轴标签
    for (let i = 0; i <= 10; i += 2) {
      const [px, py] = toPx(i, 0);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', px); t.setAttribute('y', Y0 + 16);
      t.setAttribute('class', 'grid-label');
      t.textContent = i;
      g.appendChild(t);
    }
    for (let i = 0; i <= 4; i++) {
      const [px, py] = toPx(0, i);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', X0 - 10); t.setAttribute('y', py + 4);
      t.setAttribute('class', 'grid-label');
      t.setAttribute('text-anchor', 'end');
      t.textContent = i;
      g.appendChild(t);
    }
  }

  // 拟合计算
  function fit() {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const type = typeSel.value;
    let res = null;
    if (type.startsWith('poly')) {
      const deg = parseInt(type.slice(4), 10);
      const r = polyfit(xs, ys, deg);
      if (r) res = { type, formula: formatPoly(r.coeffs), r2: r.r2, fn: (x) => r.coeffs.reduce((a, c, i) => a + c * Math.pow(x, i), 0) };
    } else if (type === 'exp') {
      const r = expfit(xs, ys);
      if (r) res = { type, formula: formatExp(r), r2: r.r2, fn: (x) => r.a * Math.exp(r.b * x) };
    } else if (type === 'sin') {
      const r = sinfit(xs, ys);
      if (r) res = { type, formula: formatSin(r), r2: r.r2, fn: (x) => r.a * Math.sin(r.omega * x + r.phi) + r.c };
    }
    fitResult = res;
    if (!res) {
      formulaEl.innerHTML = points.length === 0 ? '在上方网格上点击添加数据点' : points.length === 1 ? `已添加 1 个数据点，再点 1 个即可拟合曲线` : '至少需要 2 个数据点';
    } else {
      formulaEl.innerHTML = `y = ${res.formula}`;
    }
    r2El.textContent = res ? `拟合优度 R² = ${res.r2.toFixed(4)}` : '';
    r2El.style.color = res && res.r2 > 0.9 ? '#10b981' : res ? '#f59e0b' : '';
    insertBtn.disabled = !res;
    renderPreview();
    render();
  }

  // 渲染点 + 曲线
  function render() {
    drawGrid();
    let layer = svg.querySelector('.layer');
    if (!layer) {
      layer = document.createElementNS(NS, 'g');
      layer.setAttribute('class', 'layer');
      svg.appendChild(layer);
    }
    layer.innerHTML = '';
    // 空画布：网格中央引导水印（不拦截点击，点文字/网格都会加点）
    if (points.length === 0) {
      const hint = document.createElementNS(NS, 'text');
      hint.setAttribute('x', W / 2);
      hint.setAttribute('y', H / 2);
      hint.setAttribute('text-anchor', 'middle');
      hint.setAttribute('class', 'fit-hint-text');
      hint.setAttribute('pointer-events', 'none');
      hint.textContent = '点击网格添加数据点';
      layer.appendChild(hint);
    }
    // 拟合曲线
    if (fitResult) {
      const path = document.createElementNS(NS, 'path');
      let d = '';
      for (let px = X0; px <= X1; px += 4) {
        const x = ((px - X0) / (X1 - X0)) * 10;
        const y = fitResult.fn(x);
        const py = Y0 - (y / 4) * (Y0 - Y1);
        d += (d ? ' L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
      }
      path.setAttribute('d', d);
      path.setAttribute('class', 'fit-curve');
      layer.appendChild(path);
    }
    // 数据点
    points.forEach((p, i) => {
      const [px, py] = toPx(p.x, p.y);
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', px); c.setAttribute('cy', py); c.setAttribute('r', 7);
      c.setAttribute('class', 'fit-point');
      c.dataset.idx = i;
      layer.appendChild(c);
    });
  }

  // 交互：点击加点 / 拖动 / 右键删点
  function svgPos(evt) {
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width, scaleY = H / rect.height;
    const px = (evt.clientX - rect.left) * scaleX;
    const py = (evt.clientY - rect.top) * scaleY;
    const [x, y] = toData(px, py);
    return { x: Math.min(10, Math.max(0, x)), y: Math.min(4, Math.max(0, y)) };
  }

  svg.addEventListener('pointerdown', (e) => {
    const pos = svgPos(e);
    if (e.button === 2) {
      // 右键删最近点
      let best = -1, bd = 1e9;
      points.forEach((p, i) => {
        const d = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0 && bd < 0.5) {
        points.splice(best, 1);
        fit();
      }
      return;
    }
    // 左键：命中点则拖动，否则添加
    const hit = points.findIndex((p) => (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2 < 0.09);
    if (hit >= 0) {
      dragIdx = hit;
    } else {
      points.push(pos);
      toast(points.length < 2 ? `已添加第 ${points.length} 个点，再点 1 个即可拟合` : `已添加第 ${points.length} 个点`);
      fit();
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (dragIdx < 0) return;
    const pos = svgPos(e);
    points[dragIdx] = pos;
    fit();
  });
  svg.addEventListener('pointerup', () => { dragIdx = -1; });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());

  // 示例数据
  function loadSample(kind) {
    points = [];
    if (kind === 'sin') {
      for (let i = 0; i <= 20; i++) {
        const x = (i / 20) * 10;
        points.push({ x, y: 2 + 1.3 * Math.sin(x * 1.8 + 0.5) + (Math.random() - 0.5) * 0.25 });
      }
      typeSel.value = 'sin';
    } else {
      for (let i = 0; i <= 12; i++) {
        const x = (i / 12) * 10;
        points.push({ x, y: 0.6 + 3.2 * Math.pow((x - 5) / 5, 2) + (Math.random() - 0.5) * 0.3 });
      }
      typeSel.value = 'poly2';
    }
    fit();
  }
  document.getElementById('fit-sample-sin').addEventListener('click', () => loadSample('sin'));
  document.getElementById('fit-sample-poly').addEventListener('click', () => loadSample('poly'));
  document.getElementById('fit-clear').addEventListener('click', () => {
    points = [];
    fitResult = null;
    formulaEl.textContent = '点击添加数据点';
    r2El.textContent = '';
    insertBtn.disabled = true;
    render();
  });
  typeSel.addEventListener('change', () => points.length >= 2 && fit());

  // 颜色选择联动 hex 显示 + 预览
  const colorInput = document.getElementById('fit-color');
  const colorHex = document.getElementById('fit-color-hex');
  colorInput.addEventListener('input', () => {
    colorHex.textContent = colorInput.value;
    renderPreview();
  });

  // 插入页面：根据形式生成 SVG（波浪分割线 / 曲线按钮 / 曲线徽章）
  // 把拟合函数归一化到目标宽度，作为形状顶边/轮廓
  function curvePoints(f, w, h, amp) {
    const ys = [];
    for (let px = 0; px <= w; px += 4) {
      const x = (px / w) * 10;
      ys.push(f(x));
    }
    const min = Math.min(...ys), max = Math.max(...ys);
    const span = Math.max(max - min, 1e-6);
    let d = '';
    for (let i = 0; i < ys.length; i++) {
      const px = i * 4;
      const py = h * 0.5 - ((ys[i] - min) / span - 0.5) * amp;
      d += (d ? ' L' : 'M') + px + ' ' + py.toFixed(1);
    }
    return d;
  }

  // 左右外凸曲线形状（梭形按钮/徽章）：拟合曲线决定左右轮廓的凸出量
  // f 归一化到 [0,1] → 左轮廓 x = 6 + v*maxBulge，右轮廓对称
  function bulgeShape(f, w, h, maxBulge) {
    const samples = 26;
    const fvals = [];
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * 10;
      fvals.push(f(t));
    }
    const fmin = Math.min(...fvals), fmax = Math.max(...fvals);
    const fspan = Math.max(fmax - fmin, 1e-6);
    const leftPts = [];
    for (let i = 0; i <= samples; i++) {
      const y = (i / samples) * h;
      const v = (fvals[i] - fmin) / fspan;             // 0..1
      const x = 5 + v * maxBulge;                       // 左轮廓外凸
      leftPts.push([x, y]);
    }
    const rightPts = leftPts.map(([x, y]) => [w - x, y]).reverse();
    const d = 'M' + leftPts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L')
      + ' L' + rightPts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L') + ' Z';
    return d;
  }

  // 生成形状 SVG（插入与预览共用；id 加随机后缀防重复）
  function buildShapeSvg(kind, color) {
    const f = fitResult.fn;
    const uid = Math.random().toString(36).slice(2, 7);
    if (kind === 'wave') {
      const w = 800, h = 140, mid = h / 2;
      const ys = [];
      for (let px = 0; px <= w; px += 8) {
        const x = (px / w) * 10;
        ys.push(f(x));
      }
      const min = Math.min(...ys), max = Math.max(...ys);
      const span = Math.max(max - min, 1e-6);
      let d = '';
      for (let i = 0; i < ys.length; i++) {
        const px = i * 8;
        const py = mid - ((ys[i] - min) / span - 0.5) * (h - 40);
        d += (d ? ' L' : 'M') + px + ' ' + py.toFixed(1);
      }
      const lineD = d + ` L ${w} ${h} L 0 ${h} Z`;
      return `<div style="padding:8px 0;">
  <svg viewBox="0 0 ${w} ${h}" style="width:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pfw${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity="0.35"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${lineD}" fill="url(#pfw${uid})"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>
</div>`;
    }
    if (kind === 'btn') {
      // 曲线按钮：左右两侧沿曲线外凸（梭形），顶底平直
      const w = 240, h = 64, maxBulge = 30;
      const path = bulgeShape(f, w, h, maxBulge);
      return `<div style="padding:8px 0;text-align:center;">
  <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:240px;display:inline-block;" xmlns="http://www.w3.org/2000/svg">
    <path d="${path}" fill="${color}"/>
    <text x="${w / 2}" y="${h / 2 + 6}" text-anchor="middle" fill="#ffffff" font-size="17" font-weight="600" font-family="system-ui, sans-serif">按钮</text>
  </svg>
</div>`;
    }
    // 曲线徽章：左右外凸的小尺寸徽章
    const w = 170, h = 46, maxBulge = 20;
    const path = bulgeShape(f, w, h, maxBulge);
    const colorSoft = color + '26';
    return `<div style="padding:8px 0;text-align:center;">
  <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:170px;display:inline-block;" xmlns="http://www.w3.org/2000/svg">
    <path d="${path}" fill="${colorSoft}"/>
    <text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" fill="${color}" font-size="13.5" font-weight="600" font-family="system-ui, sans-serif">徽章</text>
  </svg>
</div>`;
  }

  // 实时预览（插入形式 / 曲线 / 颜色 变化时刷新）
  const previewBox = document.getElementById('fit-preview');
  function renderPreview() {
    if (!fitResult) { previewBox.innerHTML = ''; return; }
    previewBox.innerHTML = buildShapeSvg(document.getElementById('fit-insert-type').value, document.getElementById('fit-color').value);
  }
  const insertTypeSel = document.getElementById('fit-insert-type');
  insertTypeSel.addEventListener('change', renderPreview);

  insertBtn.addEventListener('click', () => {
    if (!fitResult) return;
    const kind = insertTypeSel.value;
    const color = document.getElementById('fit-color').value;
    editor.addComponents(buildShapeSvg(kind, color));
    toast(kind === 'wave' ? '已插入波浪分割线' : kind === 'btn' ? '已插入曲线按钮' : '已插入曲线徽章');
    document.getElementById('modal-fitter').hidden = true;
  });

  // 初始化：空白画布，节点由用户点击添加（示例按钮可快速体验）
  drawGrid();
  render(); // 空状态水印引导
  return { getPoints: () => points };
}
