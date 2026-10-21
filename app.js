/* 本文件服务两个页面：首页（#orin-study）与日志页（#journal，见 README「日志」）。分两段——
     共用段：页头（#site-head）的窄屏抽屉、关于与联系两个弹窗。两页都跑。
     首页段：首屏与项目区之间的滚轮吸附、页脚年份、向下箭头。只在首页跑。
   日志页没有 #orin-study，首页段整体关进下面的 if (root) 里。漏掉任一处的判空，整个
   文件都会在顶层抛错，共用段也跟着不执行——所以宁可整段包起来，别逐条判空。 */
const root = document.getElementById('orin-study');   // 日志页为 null

/* ==================== 共用段：页头抽屉与弹窗 ==================== */

/* 页头按 id 选，不用 document.querySelector('header')：日志页的正文是
   <article><header><time><h1>，按标签选会选到文章自己那一个。 */
const header = document.getElementById('site-head');
const nav = header.querySelector('nav');
const menuButton = header.querySelector('.menu');
const navPanel = document.getElementById('nav-panel');
const narrow = matchMedia('(max-width: 700px)');

/* 窄屏把导航收进右上角的菜单抽屉。搬的是同一个 <nav> 元素，不复制第二份菜单，
   所以改导航项时要改的是各页面 HTML 里的那一处（首页与日志页各一份，见 README）。
   桌面端（>700px）什么都不做，导航留在 header 里；没跑 JS 时也留在 header，
   退化成折成两行、靠右收拢的样子。
   抽屉本身仍是 <dialog>，Escape、焦点回到触发点、锁背景滚动都走信息面板那套。 */
function placeNav() {
  const wanted = narrow.matches;
  // 守卫让本函数幂等：重复调用不会把导航搬来搬去，也不会打断抽屉里的焦点
  if (wanted && nav.parentElement !== navPanel) navPanel.append(nav);
  if (!wanted && nav.parentElement !== header) {
    // 转屏或拉宽时抽屉可能正开着，先把导航搬回去再关，免得留下一个空抽屉
    if (navPanel.open) navPanel.close();
    header.insertBefore(nav, menuButton);
  }
  // 触发点只在导航被搬走后显示，所以这个类挂在页头上（CSS 见 #site-head.nav-collapsed）
  header.classList.toggle('nav-collapsed', wanted);
}
placeNav();
narrow.addEventListener('change', placeNav);
// 媒体查询的 change 事件偶尔会与布局不同步（实测撞到过一次），跟随已有的 resize 兜一次底
addEventListener('resize', placeNav);

menuButton.addEventListener('click', () => {
  navPanel.showModal();
  menuButton.setAttribute('aria-expanded', 'true');
});
navPanel.addEventListener('close', () => menuButton.setAttribute('aria-expanded', 'false'));
/* 点菜单里的任意一项就收起抽屉。这件事要在捕获阶段做完：关于/联系 的监听器挂在
   按钮自己身上，会紧接着 showModal() 打开信息面板，两个 modal 叠着的话信息面板
   一关，抽屉又冒出来了。 */
navPanel.addEventListener('click', event => {
  if (event.target.closest('a, button')) navPanel.close();
}, { capture: true });
navPanel.querySelector('.close').addEventListener('click', () => navPanel.close());
navPanel.addEventListener('click', event => {
  if (event.target !== navPanel) return;
  const box = navPanel.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) navPanel.close();
});

const panels = {
  about: ['关于 ORIN Lab', ['这里是澄心实验室 ORIN Lab，', '我个人的「小创意」「小巧思」，', '都会一股脑塞进来！']],
  contact: ['联系', ['联系方式尚未公开。']]
};
const panel = document.getElementById('info-panel');
const aboutFracture = createAboutFracture(panel);
for (const button of document.querySelectorAll('[data-panel]')) {
  button.addEventListener('click', () => {
    aboutFracture.stop();
    const kind = button.dataset.panel;
    const [title, paragraphs] = panels[kind];
    panel.dataset.kind = kind;
    const heading = document.getElementById('panel-title');
    heading.textContent = title;
    // 隐藏视觉标题，仍通过 aria-labelledby 为弹窗提供名称。
    heading.hidden = kind === 'about';
    document.getElementById('panel-copy').replaceChildren(...paragraphs.map(text => {
      const p = document.createElement('p'); p.textContent = text; return p;
    }));
    panel.showModal();
    if (kind === 'about') aboutFracture.open();
  });
}
panel.querySelector('.close').addEventListener('click', () => panel.close());
panel.addEventListener('click', event => {
  if (event.target !== panel) return;
  const box = panel.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) panel.close();
});

/* 关于卡片：共用同一组几何切割面绘制缺口、分割线和下落碎片。
   原文保留在 DOM 中；仅动画阶段使用高分屏快照，结束后关闭弹窗。 */
function createAboutFracture(dialog) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const copy = dialog.querySelector('#panel-copy');
  let state = 'closed', canvas, context, source, remaining, remainingContext;
  let shards = [], frame = 0, elapsed = 0, previous = 0, endTime = 0;
  let width = 0, height = 0, ratio = 1, origin, pointer, generation = 0;

  const random = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + 72) * 43758.5453;
    return n - Math.floor(n);
  };
  const area = points => Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2);
  function clip(points, nx, ny, limit, side) {
    const result = [];
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      const da = (a[0] * nx + a[1] * ny - limit) * side;
      const db = (b[0] * nx + b[1] * ny - limit) * side;
      if (da >= -1e-8) result.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const t = da / (da - db);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    });
    return result;
  }
  function partition() {
    let seed = 1;
    const unit = Math.max(.75, Math.min(2, width / 520));
    function split(points, depth = 0) {
      const id = seed++, size = area(points);
      if (size < (550 + random(id, 4) * 1050) * unit * unit || depth > 10) {
        shards.push({ points }); return;
      }
      for (let k = 0; k < 12; k++) {
        const angle = random(id, k + 10) * Math.PI;
        const nx = Math.cos(angle), ny = Math.sin(angle);
        const values = points.map(p => p[0] * nx + p[1] * ny);
        const low = Math.min(...values), high = Math.max(...values);
        const limit = low + (high - low) * (.34 + random(id, k + 30) * .32);
        const a = clip(points, nx, ny, limit, 1), b = clip(points, nx, ny, limit, -1);
        if (a.length >= 3 && b.length >= 3 && Math.min(area(a), area(b)) > size * .19) {
          split(a, depth + 1); split(b, depth + 1); return;
        }
      }
      shards.push({ points });
    }
    shards = [];
    split([[0, 0], [width, 0], [width, height], [0, height]]);
    endTime = 0;
    shards.forEach((shard, i) => {
      shard.x = shard.points.reduce((sum, p) => sum + p[0], 0) / shard.points.length;
      shard.y = shard.points.reduce((sum, p) => sum + p[1], 0) / shard.points.length;
      shard.local = shard.points.map(p => [p[0] - shard.x, p[1] - shard.y]);
      shard.radius = Math.max(...shard.local.map(p => Math.hypot(...p)));
      shard.seed = random(i, 88);
      shard.born = .55 + (shard.x / width * .77 + (1 - shard.y / height) * .23) * 3.3;
      shard.speed = (80 + random(i, 21) * 60) * unit;
      // 结束时间按视口计算，长屏也等到最后一块落出画面。
      const drop = Math.max(0, innerHeight - origin.top - shard.y + shard.radius + 5);
      endTime = Math.max(endTime, shard.born + .14 + Math.sqrt(drop / shard.speed) + .06);
    });
  }
  function path(ctx, points) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
    ctx.closePath();
  }
  function stop() {
    generation++;
    cancelAnimationFrame(frame);
    canvas?.remove();
    canvas = context = source = remaining = remainingContext = null;
    shards = []; pointer = null; previous = 0; elapsed = 0;
    state = 'closed';
    delete dialog.dataset.fracture;
    dialog.style.removeProperty('--fracture-backdrop');
    copy.removeAttribute('tabindex');
    copy.removeAttribute('role');
    copy.removeAttribute('aria-keyshortcuts');
  }
  function finish() {
    stop();
    if (dialog.open) dialog.close();
  }
  function open() {
    state = 'ready';
    copy.tabIndex = 0;
    copy.setAttribute('role', 'button');
    copy.setAttribute('aria-keyshortcuts', 'Enter Space');
  }
  function snapshot() {
    origin = dialog.getBoundingClientRect();
    width = origin.width; height = origin.height;
    ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(4000000 / (innerWidth * innerHeight)));
    source = document.createElement('canvas');
    source.width = Math.ceil(width * ratio); source.height = Math.ceil(height * ratio);
    const ctx = source.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.scale(ratio, ratio);
    const style = getComputedStyle(dialog);
    ctx.fillStyle = style.backgroundColor; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = style.borderTopColor; ctx.lineWidth = parseFloat(style.borderTopWidth) || 1;
    ctx.strokeRect(.5, .5, width - 1, height - 1);
    // Range 采样实际排版位置，保留窄屏换行及当前字号；不手写第二套文案。
    for (const element of [...copy.querySelectorAll('p'), dialog.querySelector('.close')]) {
      const textStyle = getComputedStyle(element);
      ctx.font = `${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`;
      ctx.fillStyle = textStyle.color;
      ctx.textBaseline = 'alphabetic';
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let node;
      while ((node = walker.nextNode())) {
        let offset = 0;
        for (const char of node.textContent) {
          range.setStart(node, offset); offset += char.length; range.setEnd(node, offset);
          const box = range.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          const metrics = ctx.measureText(char);
          const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(textStyle.fontSize) * .8;
          const descent = metrics.fontBoundingBoxDescent ?? parseFloat(textStyle.fontSize) * .2;
          ctx.fillText(char, box.left - origin.left, box.top - origin.top + (box.height - ascent - descent) / 2 + ascent);
        }
      }
    }
    remaining = document.createElement('canvas');
    remaining.width = source.width; remaining.height = source.height;
    remainingContext = remaining.getContext('2d');
    canvas = document.createElement('canvas');
    canvas.className = 'about-fracture'; canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.ceil(innerWidth * ratio); canvas.height = Math.ceil(innerHeight * ratio);
    context = canvas.getContext('2d');
    if (!context || !remainingContext) throw new Error('Canvas unavailable');
    context.scale(ratio, ratio);
    partition();
    dialog.append(canvas);
  }
  function draw(t) {
    context.clearRect(0, 0, innerWidth, innerHeight);
    dialog.style.setProperty('--fracture-backdrop', String(.25 * Math.max(0, Math.min(1, (5.2 - t) / 1.2))));
    const rc = remainingContext;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.clearRect(0, 0, remaining.width, remaining.height);
    rc.globalCompositeOperation = 'source-over'; rc.drawImage(source, 0, 0);
    rc.scale(ratio, ratio); rc.globalCompositeOperation = 'destination-out';
    for (const shard of shards) if (t >= shard.born) {
      path(rc, shard.points); rc.fill(); rc.lineWidth = .6; rc.stroke();
    }
    rc.globalCompositeOperation = 'source-over';
    context.drawImage(remaining, origin.left, origin.top, width, height);
    context.save(); context.translate(origin.left, origin.top);
    for (const shard of shards) {
      const dt = t - shard.born;
      if (dt < -.32 || dt >= 0) continue;
      const u = (dt + .32) / .32;
      path(context, shard.points);
      context.strokeStyle = `rgba(117,177,205,${.25 + u * .65})`; context.lineWidth = 1; context.stroke();
      context.strokeStyle = `rgba(239,250,255,${u * .85})`; context.lineWidth = .45; context.stroke();
    }
    context.restore();
    for (const shard of shards) {
      const age = t - shard.born;
      if (age < 0) continue;
      const falling = Math.max(0, age - .14);
      const dy = -5 * Math.sin(Math.min(1, age / .28) * Math.PI) + shard.speed * falling * falling;
      const dx = (shard.seed - .5) * falling * 33;
      const y = origin.top + shard.y + dy;
      if (y > innerHeight + shard.radius) continue;
      context.save(); context.translate(origin.left + shard.x + dx, y);
      context.rotate(age * (shard.seed - .5) * 2.5);
      const flip = Math.cos(age * (1.5 + shard.seed * 2.2));
      context.scale(1, Math.abs(flip) < .035 ? .035 : flip);
      const scale = 1 - .035 * Math.min(1, age / .15); context.scale(scale, scale);
      path(context, shard.local); context.save(); context.clip();
      if (flip > 0) {
        context.drawImage(source, -shard.x, -shard.y, width, height);
        context.fillStyle = `rgba(64,73,80,${Math.min(.18, age * .08)})`;
      } else context.fillStyle = '#cbd0d1';
      context.fillRect(-width, -height, width * 2, height * 2);
      context.restore(); path(context, shard.local);
      context.strokeStyle = `rgba(131,189,213,${Math.max(.1, .9 - age * 1.6)})`;
      context.lineWidth = .7; context.stroke();
      if (age < .28) {
        context.strokeStyle = `rgba(243,252,255,${1 - age / .28})`;
        context.lineWidth = .4; context.stroke();
      }
      context.restore();
    }
  }
  function tick(now) {
    if (state !== 'running') return;
    if (!dialog.open) { stop(); return; }
    if (previous) elapsed += (now - previous) / 1000;
    previous = now;
    if (elapsed >= endTime) { finish(); return; }
    draw(elapsed);
    frame = requestAnimationFrame(tick);
  }
  async function start() {
    if (state !== 'ready' || !dialog.open) return;
    if (reduced.matches) { finish(); return; }
    state = 'preparing';
    const token = generation;
    await document.fonts.ready;
    if (token !== generation || !dialog.open || state !== 'preparing') return;
    try { snapshot(); } catch {
      stop(); open(); return;
    }
    state = 'running'; elapsed = previous = 0;
    dialog.dataset.fracture = 'running';
    draw(0);
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }
  dialog.addEventListener('pointerdown', event => {
    pointer = null;
    if (state !== 'ready' || !event.isPrimary || event.button !== 0 || event.target.closest('button,a')) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX > box.left && event.clientX < box.right && event.clientY > box.top && event.clientY < box.bottom) {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  });
  dialog.addEventListener('pointermove', event => {
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 6) pointer = null;
  });
  dialog.addEventListener('pointercancel', () => { pointer = null; });
  dialog.addEventListener('pointerup', event => {
    const down = pointer; pointer = null;
    if (!down || down.id !== event.pointerId || event.target.closest('button,a') || !getSelection().isCollapsed) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 6) start();
  });
  copy.addEventListener('keydown', event => {
    if (state === 'ready' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); start();
    }
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame); previous = 0;
    if (!document.hidden && state === 'running') frame = requestAnimationFrame(tick);
  });
  // 窗口尺寸变化时结束本轮，避免旧坐标的碎片留在新的布局上。
  addEventListener('resize', () => { if (state === 'running' || state === 'preparing') finish(); });
  reduced.addEventListener('change', () => { if (reduced.matches && state !== 'ready' && state !== 'closed') finish(); });
  dialog.addEventListener('cancel', stop);
  dialog.addEventListener('close', () => { if (!dialog.open) stop(); });
  return { open, stop };
}

/* ==================== 首页段：首屏与项目区的滚轮吸附 ==================== */
/* 整段关在 if (root) 里。里面的代码保持顶格不缩进，是为了让 diff 看得出这一段
   「只是被包起来」，逻辑一行没动——缩进一遍的话每行都变，反而没人能核对。 */

if (root) {
document.getElementById('year').textContent = new Date().getFullYear();

const projects = document.getElementById('orin-projects');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

/* 首屏与项目区之间只做边界吸附，动画全部交给浏览器原生的平滑滚动：下箭头和滚轮
   走同一个 goTo()，「观感一致」由构造保证，而不是靠参数调校接近。这是与之前几版
   （CSS 吸附、JS 跟手、拦截式）的根本区别——那几版都自绘了运动轨迹，所以怎么调都
   不可能和下箭头一样。

   两个吸附位置：
     A = 首屏顶部（scrollY 为 0）
     B = 项目区顶部。项目区和页脚至少占满一屏，使该位置始终可达。
         landing 仍夹到文档滚动范围内，作为尺寸取整等边界情况的保护。
   除此之外的任何位置都不接管，完全原生。 */
const HOLD = 800;    // 在途滚轮保护的基础时长(ms)，长距离跳转按距离扩展
const ARMED = 16;    // 距吸附位置的容差(px)。正常情况滚动被吞掉，位置会稳稳停在边界上
const TRIGGER = 24;  // 累积到多少像素才触发，滤掉轻微蹭动
const LINE = 16;     // deltaMode=1 时浏览器按行报，一行约 16px

/* Safari(WebKit) 不参与滚轮吸附，完全走原生滚动。WebKit 在动画期间对滚轮输入的处理与
   其它引擎不同——会忽略用户的滚动输入，且一个手势里可能只有首个 wheel 事件可取消——
   实测表现为「很快就到位、偶尔停在中间」。与其为它单独维护一套分支，不如回到加入本特性
   之前的行为。下箭头不受影响，仍用 Safari 自己的平滑滚动。
   这是全站唯一一处针对浏览器身份的判断；若日后 WebKit 行为改变，去掉这个常量即可。 */
const NO_WHEEL_SNAP = /^Apple/.test(navigator.vendor || '') && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR)/.test(navigator.userAgent);

const docTop = el => el.getBoundingClientRect().top + scrollY;
const landing = () => Math.min(docTop(projects), document.documentElement.scrollHeight - innerHeight);

let holdUntil = 0;   // 在途跳转的独占截止时刻
let holdDir = 0;     // 在途跳转的方向：-1 回首屏，+1 去项目区
let acc = 0;         // 当前吸附位置上的累积意图(px)

function goTo(target) {
  // 4K 的整屏距离更长，扩大在途保护上限；到达目的地仍立即解除保护。
  const distance = Math.abs((target === 'hero' ? 0 : landing()) - scrollY);
  holdUntil = performance.now() + Math.min(1600, Math.max(HOLD, HOLD * Math.sqrt(distance / 900)));
  holdDir = target === 'hero' ? -1 : 1;
  acc = 0;
  const behavior = reduce.matches ? 'instant' : 'smooth';
  if (target === 'hero') scrollTo({ top: 0, behavior });
  else projects.scrollIntoView({ behavior });
}

root.querySelector('.down').addEventListener('click', () => goTo('projects'));

// 从项目区调整窗口或缩放时保持该边界；在内容中途阅读时不强制跳页。
let previousLanding = landing();
window.addEventListener('resize', () => {
  const wasAtLanding = previousLanding > ARMED && Math.abs(scrollY - previousLanding) <= ARMED;
  previousLanding = landing();
  holdUntil = 0; holdDir = 0; acc = 0;
  if (wasAtLanding) scrollTo({ top: previousLanding, behavior: 'instant' });
});

/* 滚轮只在两个边界上接管，其余位置一律交还原生滚动。吞噬规则统一为一句话：只吞噬
   方向指向另一个边界的事件——所以在 A 永远能向上、在 B 永远能向下，用户不会被困住。 */
const onWheel = event => {
  // 页面缩放与触控板捏合走的也是滚轮事件，绝不能碰
  if (event.ctrlKey || event.metaKey) return;
  // 尊重「减少动态效果」：完全不介入。一格格轮就整屏跳，比原生滚动更呛。
  if (reduce.matches) return;
  // 横向手势
  if (event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  // 弹窗打开时文档已被 overflow:hidden 冻结，此时接管只会白吞事件
  if (panel.open || navPanel.open) return;

  const dy = event.deltaY * (event.deltaMode === 1 ? LINE : event.deltaMode === 2 ? innerHeight : 1);
  const now = performance.now();
  const y = scrollY;
  const land = landing();
  // 落点与首屏顶部重合时（整页装得下一屏）没有可跳的地方，接管只会让滚轮变死。
  if (land <= ARMED) return;

  const atHero = y <= ARMED;
  const atLanding = !atHero && Math.abs(y - land) <= ARMED;

  /* 在途跳转独占滚轮。原生的平滑滚动被输入打断时各家浏览器行为并不一致（Safari 直接
     忽略用户的滚动输入把动画跑完，Chrome 提前触发 scrollend 再继续朝原目标滚），所以
     这里显式定义：反向输入中止这次跳转并放行，让用户能中途反悔。 */
  if (now < holdUntil) {
    // 时间保护并不知道动画是否已经结束。落点很近时动画很快就跑完，
    // 此时用户的反向输入不该再被当成「中途反悔」——先看是否已经停在目的地上。
    if (holdDir > 0 ? atLanding : atHero) {
      holdUntil = 0; holdDir = 0;           // 已经到位，落回下面的常规判定
    } else {
      if (dy * holdDir < 0) {
        // 光靠放行不够——Safari 会忽略用户输入。程序化滚动按规范必然 abort 进行中的
        // 平滑滚动，显式调一次三家行为才一致。
        scrollTo({ top: y, behavior: 'instant' });
        holdUntil = 0; holdDir = 0; acc = 0;
        return;
      }
      event.preventDefault();
      return;
    }
  }

  if (dy > 0) {
    if (!atHero) { acc = 0; return; }
    // 吞在阈值之前，一是挡住首屏滚到一半的中间态，二是保证动画从 scrollY 恰好为 0
    // 起跑，与点击路径的起点完全相同。
    event.preventDefault();
    acc += dy;
    if (acc >= TRIGGER) goTo('projects');
    return;
  }

  if (dy < 0) {
    if (!atLanding) { acc = 0; return; }
    event.preventDefault();
    acc -= dy;
    if (acc >= TRIGGER) goTo('hero');
  }
};

// Safari 下连监听器都不注册：非被动 wheel 监听会让滚动走不了快通道，不参与就别挂。
// 日志页根本没有这一段，阅读页保持完全原生的滚动。
if (!NO_WHEEL_SNAP) window.addEventListener('wheel', onWheel, { passive: false });
}   // ← 首页段到此为止，以上只在首页执行
