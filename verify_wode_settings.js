/**
 * verify_wode_photos.js —— 8_wode（我的）· 三张方形照片「点击换图 + 裁剪」专项
 *
 * 覆盖：
 *   [A] 三张照片可点击 → 弹出来源面板（拍摄 / 从手机相册选择 / 取消）
 *   [B] ★ 相册 / 拍照双入口：.视觉隐藏（非 display:none）+ capture 只加在拍照
 *   [C] ★ 1:1 裁剪几何：transform-origin = 0 0 且渲染区完整覆盖取景框
 *   [D] ★ 写「我的照片_<名>」，三张各自独立，互不覆盖
 *   [E] ★ 刷新后（重新起页面）读回自定义图，不再退回默认素材
 *   [F] HEIC 拦截 + EXIF 方向（大小端 × 1/3/6/8）
 *
 * ★ 与 verify_zhuti.js 的关键差别：尺寸打桩模拟真实浏览器 —— 祖先处于
 *   display:none 时 clientWidth/clientHeight 返回 0。无条件返回固定值会
 *   替页面把「取景框量到 0 → 图片缩成小点」这个 bug 掩盖过去。
 *   （该 bug 已在 9 / 10 页修过，见 probe_crop_bug.js）
 *
 * 用法：PAGES_DIR=/data/workspace node verify_wode_photos.js
 */
const kit = require('/data/inputs/testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

/** 模拟真实手机照片：3000 × 4000（大图最能暴露 transform-origin 问题） */
const 图宽 = 3000, 图高 = 4000;
const 视口宽 = 250;                 // 1:1，取景框宽高都是它
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

/** 原型级打桩：必须挂在 beforeParse，页面自己的初始化（加载拍立得）才吃得到 */
function 打桩(w) {
    // ① 尺寸：按可见性 —— 不可见时返回 0，正是 9 / 10 页踩过的坑
    const 量 = el => (可见(w, el) ? 视口宽 : 0);
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth',
        { get() { return 量(this); }, configurable: true });
    Object.defineProperty(w.HTMLElement.prototype, 'clientHeight',
        { get() { return 量(this); }, configurable: true });
    Object.defineProperty(w.HTMLElement.prototype, 'getBoundingClientRect', {
        get() {
            return () => ({ left: 0, top: 0, width: 量(this), height: 量(this),
                            right: 量(this), bottom: 量(this) });
        },
        configurable: true,
    });

    // ② 图片：自然尺寸 + 设 src 即异步 onload（模拟素材存在、解码成功）
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

    // ③ FileReader：dataURL 与 arrayBuffer 都要有（读方向 走后者）
    const 原始FR = w.FileReader;
    w.FileReader = class {
        readAsDataURL() {
            this.result = 'data:image/png;base64,' + PNG;
            Promise.resolve().then(() => { if (this.onload) this.onload({ target: this }); });
        }
        readAsArrayBuffer(blob) {
            const r = new 原始FR();                // 真读交给原生实现，只转发结果
            r.onload = () => {
                this.result = r.result;
                if (this.onload) this.onload({ target: this });
            };
            r.onerror = () => { if (this.onerror) this.onerror(); };
            r.readAsArrayBuffer(blob);
        }
        abort() {}
    };
    Object.defineProperty(w.HTMLInputElement.prototype, 'files', {
        configurable: true, get() { return this._f || []; }, set(v) { this._f = v; },
    });

    /* ④ canvas：jsdom 未装 canvas 包时 getContext / toDataURL 都只会抛
         "Not implemented" 并返回 null，整条导出链路会静默产出 null。
         两处都桩掉：getContext 给一个只吞调用的假 2d，toDataURL 给固定产物。 */
    const 原 = w.HTMLCanvasElement.prototype.getContext;
    w.HTMLCanvasElement.prototype.getContext = function (型) {
        if (型 === '2d') {
            return {
                transform() {}, drawImage() {},
                set imageSmoothingQuality(v) {},
            };
        }
        return 原 ? 原.call(this, 型) : null;
    };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,OUT';
}

function 解析变换(str) {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(str || '');
    return m ? { tx: +m[1], ty: +m[2], scale: +m[3] } : null;
}

/** 走完整链路：点第 N 张 → 来源面板 → 相册 → 选中文件 → 裁剪弹窗打开 */
async function 走换图流程(w, 序) {
    const d = w.document;
    const 框 = d.getElementById('图' + 序).parentElement;
    框.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(60);
    d.getElementById('来源相册').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(60);
    const 输入 = d.getElementById('相册输入');
    输入._f = [{ name: 'p.png', type: 'image/png' }];
    输入.dispatchEvent(new w.Event('change', { bubbles: true }));
    await 等(250);
}

(async function main() {
    const 源码 = 读('8_wode.html');

    console.log('[A] 三张照片可点击 → 弹出来源面板');
    const 共享 = {};                        // 三张共用一个存储，模拟 localStorage
    const w = await 起页面('8_wode.html', 'http://localhost/8.html', 共享, errors, '8', 打桩);
    await 等(150);
    const d = w.document;

    const 图 = ['图1', '图2', '图3'].map(n => d.getElementById(n));
    ok(图.every(i => !!i), '三张照片元素都在');
    ok(图.every(i => i.parentElement.classList.contains('方形图')), '三张都包在 .方形图 内');

    ok(!!d.getElementById('来源遮罩'), '存在来源选择面板');
    ok(['来源拍照', '来源相册', '来源取消'].every(i => !!d.getElementById(i)),
        '面板含 拍摄 / 从手机相册选择 / 取消 三项');

    图[1].parentElement.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(60);
    ok(d.getElementById('来源遮罩').classList.contains('显示'), '★ 点第 2 张 → 来源面板弹出');
    d.getElementById('来源取消').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(60);
    ok(!d.getElementById('来源遮罩').classList.contains('显示'), '点「取消」→ 面板收起');

    console.log('\n[B] ★ 相册 / 拍照双入口');
    {
        const 相册 = d.querySelector('input:not([capture])[type="file"]');
        const 拍照 = d.querySelector('input[capture][type="file"]');
        ok(!!相册, '存在相册入口');
        ok(!!拍照, '存在拍照入口');
        ok(!!相册 && 相册.className.includes('视觉隐藏'),
            '相册输入用 .视觉隐藏（非 display:none，移动端 click 才有效）');
        ok(!!相册 && !相册.hasAttribute('capture'), '相册入口不带 capture');
        ok(!!拍照 && 拍照.getAttribute('capture') === 'environment', '拍照入口带 capture="environment"');
    }

    console.log('\n[C] ★ 1:1 裁剪几何：origin = 0 0 且渲染区完整覆盖取景框');
    await 走换图流程(w, 2);
    {
        ok(d.getElementById('裁剪遮罩').classList.contains('显示'), '选图后裁剪弹窗已打开');
        const 裁剪图 = d.getElementById('裁剪图片');
        ok(/^data:image\//.test(裁剪图.src), '裁剪图 src 已设为所选图片');

        const t = 解析变换(裁剪图.style.transform);
        ok(!!t, '已应用初始 transform（实际 "' + 裁剪图.style.transform + '"）');
        ok(/^0(px)?\s+0(px)?$/.test(String(裁剪图.style.transformOrigin).trim()),
            '★ transform-origin = 0 0（实际 "' + 裁剪图.style.transformOrigin + '"）');
        if (t) {
            const 显宽 = 图宽 * t.scale, 显高 = 图高 * t.scale;
            console.log('    缩放后 ' + 显宽.toFixed(1) + ' × ' + 显高.toFixed(1)
                + '   取景框 ' + 视口宽 + ' × ' + 视口宽);
            ok(显宽 > 视口宽 * 0.9,
                '★ 图片未被缩成小点（宽 ' + 显宽.toFixed(1) + ' ≥ ' + (视口宽 * 0.9).toFixed(0) + '）');
            ok(t.tx <= 0 && t.tx + 显宽 >= 视口宽 && t.ty <= 0 && t.ty + 显高 >= 视口宽,
                '★ 渲染区完整覆盖取景框（不露底）');
        }
        ok(/\.裁剪视口\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/.test(源码),
            'CSS：取景框是 1:1（与照片格同比例）');
    }

    console.log('\n[D] ★ 写「我的照片_<名>」，三张各自独立');
    {
        d.getElementById('裁剪确定').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(120);
        ok(!d.getElementById('裁剪遮罩').classList.contains('显示'), '点「使用」→ 裁剪弹窗关闭');
        ok(共享['我的照片_图2'] === 'data:image/jpeg;base64,OUT',
            '★ 写入「我的照片_图2」（实际 ' + (共享['我的照片_图2'] || '无') + '）');
        ok(共享['我的照片_图1'] === undefined && 共享['我的照片_图3'] === undefined,
            '★ 第 1、3 张未被牵连（三张独立）');

        // 换第 3 张，验证「待换」会跟着点击走，不会一直写死在第 2 张
        await 走换图流程(w, 3);
        d.getElementById('裁剪确定').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(120);
        ok(共享['我的照片_图3'] === 'data:image/jpeg;base64,OUT', '★ 点第 3 张 → 写入「我的照片_图3」');
        ok(共享['我的照片_图2'] === 'data:image/jpeg;base64,OUT', '第 2 张的图仍在，没被覆盖');
    }

    console.log('\n[E] ★ 刷新后读回自定义图（不再退回默认素材）');
    {
        const w2 = await 起页面('8_wode.html', 'http://localhost/8.html', 共享, errors, '8', 打桩);
        await 等(150);
        const d2 = w2.document;
        ok(d2.getElementById('图2').src === 'data:image/jpeg;base64,OUT',
            '第 2 张读回自定义图（实际 ' + String(d2.getElementById('图2').src).slice(0, 40) + '）');
        ok(d2.getElementById('图3').src === 'data:image/jpeg;base64,OUT', '第 3 张读回自定义图');
        // 第 1 张没换过 → 走默认素材探测，不应被标成空
        ok(!d2.getElementById('图1').parentElement.classList.contains('空'),
            '第 1 张没换过 → 走默认素材，未误标为「空」');
    }

    console.log('\n[F] ★ HEIC 拦截 + EXIF 方向（大小端 × 1/3/6/8）');
    {
        const w3 = await 起页面('8_wode.html', 'http://localhost/8.html', {}, errors, '8', 打桩);
        await 等(120);

        ok(typeof w3.是HEIC === 'function', '暴露 是HEIC()');
        const heic = new w3.File([new Uint8Array([1, 2, 3])], 'IMG.HEIC', { type: 'image/heic' });
        const heif = new w3.File([new Uint8Array([1, 2, 3])], 'a.heif', { type: '' });
        const jpg = new w3.File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
        ok(w3.是HEIC(heic) === true, '识别 HEIC（type）');
        ok(w3.是HEIC(heif) === true, '识别 HEIF（扩展名兜底）');
        ok(w3.是HEIC(jpg) === false, '普通 JPG 不误判');

        ok(typeof w3.读方向 === 'function', '暴露 读方向()');
        function 造JPEG(方向, 大端) {
            const u16 = v => { const b = Buffer.alloc(2); 大端 ? b.writeUInt16BE(v) : b.writeUInt16LE(v); return b; };
            const u32 = v => { const b = Buffer.alloc(4); 大端 ? b.writeUInt32BE(v) : b.writeUInt32LE(v); return b; };
            const tiff = Buffer.concat([
                大端 ? Buffer.from('MM') : Buffer.from('II'),
                u16(0x002A), u32(8), u16(1),
                u16(0x0112), u16(3), u32(1),
                u16(方向), Buffer.from([0, 0]), u32(0),
            ]);
            const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
            return Buffer.concat([
                Buffer.from([0xFF, 0xD8]),
                Buffer.from([0xFF, 0xE1]), u16(exif.length + 2), exif,
                Buffer.from([0xFF, 0xC0]), u16(11), Buffer.from([8]), u16(1), u16(1),
                Buffer.from([1, 1, 0x11, 0]),
                Buffer.from([0xFF, 0xDA]), u16(8), Buffer.from([1, 1, 0, 0, 0x3F, 0]),
                Buffer.from([0xFF, 0xD9]),
            ]);
        }
        for (const 大端 of [true, false]) {
            for (const 方向 of [1, 3, 6, 8]) {
                const f = new w3.File([new Uint8Array(造JPEG(方向, 大端))], 'p.jpg', { type: 'image/jpeg' });
                const 实 = await w3.读方向(f);
                ok(实 === 方向, 'EXIF ' + (大端 ? '大端' : '小端') + ' orientation=' + 方向 + ' → 实际 ' + 实);
            }
        }
        const png = new w3.File([new Uint8Array([0x89, 0x50])], 'a.png', { type: 'image/png' });
        ok(await w3.读方向(png) === 1, 'PNG 不解析 EXIF，返回 1');
        ok(/解码像素上限\s*=\s*16000000/.test(源码), '定义了 1600 万像素解码上限（降采样）');
    }

    收尾(errors, '✅ 8 页照片「点击换图 + 1:1 裁剪」全部通过');
})().catch(e => { console.error(e); process.exit(2); });
