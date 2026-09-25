/**
 * 裁剪预览可见性 · 几何专项测试
 * 验证：添加好友(mode=new) / 编辑联系人(mode=edit) 上传头像时，
 *       裁剪弹窗打开后「图片确实落在取景框内」→ 预览可见
 *
 * 核心：验证 transform-origin 与 tx/ty/scale 的几何一致性
 *   —— 若 transform-origin 不是 0 0，大图会被推到视口外 → 预览看不见
 *
 * 用法：node verify_crop_preview.js
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('2_haoyouxinxi.html', 'utf8')
  .replace(/src="2【图片】\/默认主题背景\.png"/g, 'src=""');

// 模拟真实手机照片：3000 × 4000（大图最能暴露 origin 问题）
const 图宽 = 3000, 图高 = 4000;
const 视口边长 = 300;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==';

(async function main() {
  let errors = [];
  const ok = (c, m) => { if (c) { console.log('  ✓ ' + m); return true; } errors.push(m); console.log('  ✗ ' + m); return false; };

  // 解析 transform 字符串 → { tx, ty, scale }
  function 解析变换(str) {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(str || '');
    if (!m) return null;
    return { tx: parseFloat(m[1]), ty: parseFloat(m[2]), scale: parseFloat(m[3]) };
  }

  // ★ 按【实际 transform-origin】计算图片在取景框坐标系里的渲染区域。
  //   origin = 0 0  → 左上角固定：区域 = [tx, tx+W·s] × [ty, ty+H·s]
  //   origin = 中心 → 中心点固定：区域 = [W/2 - W·s/2 + tx, W/2 + W·s/2 + tx] × ...
  //   只有区域覆盖 [0, vp]²，预览才真正可见。
  function 计算渲染区(t, origin, W, H) {
    const s = t.scale;
    const 是左上 = /^0(px)?\s+0(px)?$/.test(String(origin || '').trim());
    const 原点X = 是左上 ? 0 : W / 2;
    const 原点Y = 是左上 ? 0 : H / 2;
    return {
      左: 原点X - 原点X * s + t.tx,
      上: 原点Y - 原点Y * s + t.ty,
      右: 原点X + (W - 原点X) * s + t.tx,
      下: 原点Y + (H - 原点Y) * s + t.ty,
    };
  }

  async function 选图后取状态(mode) {
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      url: 'http://localhost/2_haoyouxinxi.html' + (mode ? '?mode=' + mode : ''),
      beforeParse(window) {
        window.console.error = (...a) => errors.push('console.error ' + a.map(String).join(' '));
        window.addEventListener('error', e => errors.push('window.error ' + e.message));

        window.FileReader = class {
          readAsDataURL() {
            this.result = 'data:image/png;base64,' + PNG;
            Promise.resolve().then(() => { if (this.onload) this.onload({ target: this }); });
          }
          abort() {}
        };
        Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
          get() { return this._f || []; }, set(v) { this._f = v; }
        });
      }
    });

    await new Promise(r => dom.window.addEventListener('load', r));
    const w = dom.window, d = w.document, get = id => d.getElementById(id);

    // 给裁剪视口一个真实尺寸（jsdom 无布局，clientWidth 恒为 0）
    const 视口 = get('裁剪视口');
    Object.defineProperty(视口, 'clientWidth', { get: () => 视口边长, configurable: true });
    Object.defineProperty(视口, 'clientHeight', { get: () => 视口边长, configurable: true });

    // 让裁剪图成为"真实大图"：赋值 src 后异步触发 onload，并报告 naturalWidth/Height
    const 裁剪图 = get('裁剪图片');
    Object.defineProperty(裁剪图, 'naturalWidth', { get: () => 图宽, configurable: true });
    Object.defineProperty(裁剪图, 'naturalHeight', { get: () => 图高, configurable: true });
    let _src = '';
    Object.defineProperty(裁剪图, 'src', {
      get() { return _src; },
      set(v) {
        _src = v;
        if (/^data:image\//.test(v)) Promise.resolve().then(() => { if (裁剪图.onload) 裁剪图.onload({ target: 裁剪图 }); });
      },
      configurable: true
    });

    // 模拟选图
    const 文件输入 = get('头像文件输入');
    文件输入._f = [{ name: 'photo.png', type: 'image/png' }];
    const ev = new w.Event('change', { bubbles: true });
    Object.defineProperty(ev, 'target', { value: 文件输入 });
    文件输入.dispatchEvent(ev);

    // 等 onload + requestAnimationFrame(初始化状态)
    await new Promise(r => setTimeout(r, 80));

    return {
      遮罩显示: get('裁剪遮罩').classList.contains('显示'),
      src: 裁剪图.src,
      transform: 裁剪图.style.transform,
      transformOrigin: 裁剪图.style.transformOrigin,
    };
  }

  console.log('[A] 添加好友(mode=new)：选图 → 裁剪预览应可见');
  {
    const s = await 选图后取状态('new');
    ok(s.遮罩显示, '弹窗已打开');
    ok(/^data:image\//.test(s.src), '裁剪图 src 已设为所选图片');

    const t = 解析变换(s.transform);
    ok(t !== null, '已应用初始变换 transform=' + s.transform);

    // ★★ 核心修复点：transform-origin 必须是 0 0（与 1 页 CSS 一致）
    ok(s.transformOrigin === '0px 0px' || s.transformOrigin === '0 0' || /^0(px)?\s+0(px)?$/.test(s.transformOrigin),
      '★ transform-origin = 0 0（缩放原点在左上角，与 tx/ty 公式匹配）实际=' + s.transformOrigin);

    // ★★ 几何验证：按实际 origin 算出的渲染区必须完整覆盖取景框 → 预览才可见
    if (t) {
      const r = 计算渲染区(t, s.transformOrigin, 图宽, 图高);
      console.log(`    实际渲染区: X[${r.左}, ${r.右}] Y[${r.上}, ${r.下}]  取景框: [0, ${视口边长}]`);
      ok(r.左 <= 0 && r.右 >= 视口边长, `★ 横向覆盖取景框（左≤0 且 右≥${视口边长}）`);
      ok(r.上 <= 0 && r.下 >= 视口边长, `★ 纵向覆盖取景框（上≤0 且 下≥${视口边长}）`);
    }
  }

  console.log('\n[B] 编辑联系人(mode=edit)：选图 → 裁剪预览同样应可见');
  {
    const s = await 选图后取状态('edit');
    ok(s.遮罩显示, '弹窗已打开');
    const t = 解析变换(s.transform);
    if (t) {
      const r = 计算渲染区(t, s.transformOrigin, 图宽, 图高);
      ok(r.左 <= 0 && r.右 >= 视口边长, '★ 横向覆盖取景框（编辑模式）');
      ok(r.上 <= 0 && r.下 >= 视口边长, '★ 纵向覆盖取景框（编辑模式）');
    }
  }

  console.log('\n--- 结果 ---');
  const real = errors.filter(e => /console\.error|window\.error|TypeError|ReferenceError/.test(e));
  console.log('功能性断言失败:', errors.length);
  console.log('控制台真实报错:', real.length);
  if (real.length) real.forEach(e => console.log('  ! ' + e));
  process.exit(errors.length || real.length ? 1 : 0);
})();
