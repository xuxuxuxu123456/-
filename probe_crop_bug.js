/**
 * probe_crop_bug.js —— 复现 / 回归 9、10 页裁剪链路的 bug
 *
 * ★ 与 verify_zhuti.js 的关键差别，三处「像真浏览器」：
 *   ① 尺寸打桩模拟 display:none —— 祖先不可见时 clientWidth/clientHeight = 0。
 *      原脚本无条件返回 240/427，等于替页面把 bug 掩盖过去了。
 *   ② 打桩挂在 beforeParse（testkit 的 附加 钩子），页面自己的初始化
 *      （渲染网格 / 同步显示）也吃得到桩，否则测的是「页面跑完之后」的状态。
 *   ③ 任何非空 src 都异步触发 onload，模拟素材存在、解码成功。
 *
 * 跑法：PAGES_DIR=/data/workspace node probe_crop_bug.js
 */
const kit = require('/data/inputs/testkit.js');
const { 造断言器, 起页面 } = kit;
const { ok, errors } = 造断言器();

const 图宽 = 3000, 图高 = 4000;
const 视口宽 = 240;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==';

const 等 = ms => new Promise(r => setTimeout(r, ms));

/** 元素连同祖先都可见才算「量得到」—— 模拟真实浏览器的 display:none 行为 */
function 可见(w, 元素) {
    let n = 元素;
    while (n && n !== w.document.documentElement) {
        const cls = n.classList;
        if (cls && (cls.contains('裁剪遮罩') || cls.contains('来源遮罩'))
            && !cls.contains('显示')) return false;
        n = n.parentElement;
    }
    return true;
}

/** 原型级打桩：必须在 beforeParse 里做，页面自己的初始化才吃得到 */
function 打桩全部(w, 比例) {
    // ① 尺寸：getBoundingClientRect + clientWidth/Height 都按可见性走
    打桩尺寸(w, w.HTMLElement.prototype, 比例);

    // ② 图片：自然尺寸 + 设 src 即异步 onload（模拟解码成功）
    Object.defineProperty(w.HTMLImageElement.prototype, 'naturalWidth',
        { get() { return 图宽; }, configurable: true });
    Object.defineProperty(w.HTMLImageElement.prototype, 'naturalHeight',
        { get() { return 图高; }, configurable: true });
    const 原src = Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype, 'src');
    Object.defineProperty(w.HTMLImageElement.prototype, 'src', {
        get() { return 原src.get.call(this); },
        set(v) {
            原src.set.call(this, v);
            if (v) Promise.resolve().then(() => { if (this.onload) this.onload({ target: this }); });
        },
        configurable: true,
    });

    // ③ FileReader + input.files
    w.FileReader = class {
        readAsDataURL() {
            this.result = 'data:image/png;base64,' + PNG;
            Promise.resolve().then(() => { if (this.onload) this.onload({ target: this }); });
        }
        abort() {}
    };
    Object.defineProperty(w.HTMLInputElement.prototype, 'files', {
        configurable: true, get() { return this._f || []; }, set(v) { this._f = v; },
    });

    // ④ canvas：jsdom 无 2d 上下文，规范化图片会走 catch 降级，这里给个能用的
    const 原上下文 = w.HTMLCanvasElement.prototype.getContext;
    w.HTMLCanvasElement.prototype.getContext = function (型) {
        if (型 === '2d') {
            return {
                transform() {}, drawImage() {},
                toDataURL: () => 'data:image/jpeg;base64,OUT',
                set imageSmoothingQuality(v) {},
            };
        }
        return 原上下文 ? 原上下文.call(this, 型) : null;
    };
}

/** 给原型或单个元素装「可见才量得到」的尺寸 getter */
function 打桩尺寸(w, 目标, 比例) {
    const 量 = el => (可见(w, el) ? { 宽: 视口宽, 高: Math.round(视口宽 * 比例) } : { 宽: 0, 高: 0 });
    Object.defineProperty(目标, 'clientWidth', { get() { return 量(this).宽; }, configurable: true });
    Object.defineProperty(目标, 'clientHeight', { get() { return 量(this).高; }, configurable: true });
    Object.defineProperty(目标, 'getBoundingClientRect', {
        get() {
            return () => {
                const r = 量(this);
                return { left: 0, top: 0, width: r.宽, height: r.高, right: r.宽, bottom: r.高 };
            };
        },
        configurable: true,
    });
}

function 解析变换(str) {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(str || '');
    return m ? { tx: +m[1], ty: +m[2], scale: +m[3] } : null;
}

(async function main() {
    for (const [文件, 比例, 名] of [
        ['9_zhutishezhi.html', 16 / 9, '9 页（9:16 取景框）'],
        ['10_lunbotu.html', 9 / 16, '10 页（16:9 取景框）'],
    ]) {
        console.log('\n================ ' + 名 + ' ================');
        const 视口高 = Math.round(视口宽 * 比例);

        const w = await 起页面(文件, 'http://localhost/x.html', {}, errors, 'x',
            win => 打桩全部(win, 比例));
        await 等(150);
        const d = w.document;

        /* ---------- 1. 裁剪几何 ---------- */
        const 输入 = d.getElementById('相册输入');
        输入._f = [{ name: 'p.png', type: 'image/png' }];
        输入.dispatchEvent(new w.Event('change', { bubbles: true }));
        await 等(250);

        ok(d.getElementById('裁剪遮罩').classList.contains('显示'), '裁剪弹窗已打开');

        const 图 = d.getElementById('裁剪图片');
        const t = 解析变换(图.style.transform);
        ok(!!t, '已应用初始 transform（实际 "' + 图.style.transform + '"）');
        ok(/^0(px)?\s+0(px)?$/.test(String(图.style.transformOrigin).trim()),
            'transform-origin = 0 0');
        if (t) {
            const 显宽 = 图宽 * t.scale, 显高 = 图高 * t.scale;
            console.log('    缩放后 ' + 显宽.toFixed(1) + ' × ' + 显高.toFixed(1)
                + '   取景框 ' + 视口宽 + ' × ' + 视口高);
            ok(显宽 > 视口宽 * 0.9,
                '★ 图片未被缩成小点（宽 ' + 显宽.toFixed(1) + ' ≥ ' + (视口宽 * 0.9).toFixed(0) + '）');
            ok(t.tx <= 0 && t.tx + 显宽 >= 视口宽 && t.ty <= 0 && t.ty + 显高 >= 视口高,
                '★ 渲染区完整覆盖取景框（不露底）');
        }

        /* ---------- 2. 10 页专属：大预览必须显示图片 ---------- */
        if (文件 === '10_lunbotu.html') {
            const 预览区 = d.getElementById('预览区');
            ok(!预览区.classList.contains('空'),
                '★ 大预览已撤掉占位文字、显示图片（classList="' + 预览区.className + '"）');
        }

        /* ---------- 3. error 监听器不得累积 ---------- */
        const 源码 = require('fs').readFileSync(
            require('path').join(process.env.PAGES_DIR || '/data/inputs', 文件), 'utf8');
        /* 全站共用的主题背景脚本（页尾 IIFE，只跑一次）保留 addEventListener 无妨；
           会被反复调用的 载入默认 / 载入缩略 / 应用背景 必须改用 onerror 赋值，
           否则监听器累加 → 一次失败触发 N 次重试、src 来回跳。 */
        const 监听数 = (源码.match(/addEventListener\('error'/g) || []).length;
        ok(监听数 <= 1,
            '★ 会被反复调用的地方已改用 onerror 赋值（文件内仅剩页尾共用脚本 1 处，实际 '
            + 监听数 + '）');
        ok(/img\.onerror = /.test(源码) && /\.classList\.remove\('空'\)/.test(源码),
            '★ 图加载成功会撤掉 .空（不会一直显示占位文字）');
    }

    console.log('\n--- 结果 ---');
    console.log('断言失败: ' + errors.filter(e => /^断言/.test(e)).length);
    const 真报错 = errors.filter(e => /console\.error|window\.error|TypeError|ReferenceError|SyntaxError/.test(e));
    console.log('控制台真实报错: ' + 真报错.length);
    真报错.slice(0, 5).forEach(e => console.log('  ' + e));
    process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
