/**
 * 手机相册 / 拍照 上传专项回归
 * 覆盖移动端原图三大坑 + 来源选择交互：
 *   ① display:none 的文件输入在移动端 .click() 失效（必须视觉隐藏）
 *   ② iOS HEIC 格式浏览器解不了 → 必须提前拦截并给出可操作引导
 *   ③ EXIF orientation 不摆正 → 裁剪产物躺倒（含大小端两种字节序）
 *   ④ 超大图需降采样，规避 iOS 约 1600 万像素解码上限
 *   ⑤ 拍照 / 相册 双入口（capture 只应加在拍照入口上）
 * 用法：node verify_album_upload.js
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

function 清理(html) {
    return html.replace(/src="2【图片】\/[^"]*"/g, 'src=""')
               .replace(/src="1【音乐】\/[^"]*"/g, 'src=""');
}

const errors = [];
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { errors.push(m); console.log('  ✗ ' + m); } };

function 造存储(数据) {
    return {
        getItem: k => (Object.prototype.hasOwnProperty.call(数据, k) ? 数据[k] : null),
        setItem: (k, v) => { 数据[k] = String(v); },
        removeItem: k => { delete 数据[k]; },
        clear: () => { for (const k in 数据) delete 数据[k]; },
        key: i => Object.keys(数据)[i] || null,
        get length() { return Object.keys(数据).length; },
    };
}

async function 跑(file, url) {
    const dom = new JSDOM(清理(fs.readFileSync(file, 'utf8')), {
        runScripts: 'dangerously', pretendToBeVisual: true, url,
        beforeParse(w) {
            w.console.error = (...a) => errors.push(file + ' console.error ' + a.map(String).join(' '));
            w.addEventListener('error', e => errors.push(file + ' window.error ' + (e.error && e.error.message || e.message)));
            Object.defineProperty(w, 'localStorage', { value: 造存储({}), configurable: true });
        },
    });
    await new Promise(r => dom.window.addEventListener('load', r));
    await new Promise(r => setTimeout(r, 120));
    return dom.window;
}

// —— 构造带 EXIF orientation 的最小 JPEG（可指定字节序）——
function 造JPEG(方向, 大端 = true) {
    const ec = 大端 ? '>' : '<';
    const 段 = [];
    const u16 = v => { const b = Buffer.alloc(2); 大端 ? b.writeUInt16BE(v) : b.writeUInt16LE(v); return b; };
    const u32 = v => { const b = Buffer.alloc(4); 大端 ? b.writeUInt32BE(v) : b.writeUInt32LE(v); return b; };

    let tiff = Buffer.concat([
        大端 ? Buffer.from('MM') : Buffer.from('II'),
        u16(0x002A), u32(8),                      // 魔数 + IFD0 偏移
        u16(1),                                    // 条目数
        u16(0x0112), u16(3), u32(1),              // Orientation: SHORT, count=1
        u16(方向), Buffer.from([0, 0]),           // 值（4 字节，不足补零）
        u32(0),                                    // 下一个 IFD = 0
    ]);
    const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);

    return Buffer.concat([
        Buffer.from([0xFF, 0xD8]),                                  // SOI
        Buffer.from([0xFF, 0xE1]), u16(exif.length + 2), exif,      // APP1
        Buffer.from([0xFF, 0xC0]), u16(11), Buffer.from([8]), u16(1), u16(1),
        Buffer.from([1, 1, 0x11, 0]),                               // SOF0
        Buffer.from([0xFF, 0xDA]), u16(8), Buffer.from([1, 1, 0, 0, 0x3F, 0]),
        Buffer.from([0xFF, 0xD9]),                                  // EOI
    ]);
}

(async () => {
    console.log('\n========== 手机相册 / 拍照 上传专项 ==========');

    for (const [文件, 名] of [['1_shouyeyulan.html', '1页'], ['2_haoyouxinxi.html', '2页']]) {
        console.log('\n---------------- ' + 名 + ' ----------------');
        const w = await 跑(文件, 'http://localhost/' + 文件);
        const d = w.document;

        // ===== 1. 文件输入必须在渲染树内（display:none 会让移动端 .click() 静默失效）=====
        const 相册输入 = d.querySelector('input:not([capture])[type="file"]');
        const 拍照输入 = d.querySelector('input[capture][type="file"]');
        ok(!!相册输入, 名 + '：存在相册入口');
        ok(!!拍照输入, 名 + '：存在拍照入口');
        ok(!!相册输入 && 相册输入.className.includes('视觉隐藏'),
            名 + '：相册输入用 .视觉隐藏（非 display:none，保证移动端 click 有效）实际="' + (相册输入 && 相册输入.className) + '"');
        ok(!!相册输入 && !相册输入.hasAttribute('capture'),
            名 + '：相册入口不带 capture（否则会直接开相机而非相册）');
        ok(!!拍照输入 && 拍照输入.getAttribute('capture') === 'environment',
            名 + '：拍照入口带 capture="environment"');

        // ===== 2. 来源选择面板 =====
        ok(!!d.getElementById('来源遮罩'), 名 + '：存在来源选择面板');
        ok(['来源拍照', '来源相册', '来源取消'].every(i => !!d.getElementById(i)),
            名 + '：面板含 拍照/相册/取消 三项');

        // ===== 3. HEIC 识别 =====
        ok(typeof w.是HEIC === 'function', 名 + '：暴露 是HEIC()');
        const heic = new w.File([new Uint8Array([1, 2, 3])], 'IMG_0001.HEIC', { type: 'image/heic' });
        const heif = new w.File([new Uint8Array([1, 2, 3])], 'a.heif', { type: '' });
        const jpg = new w.File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
        ok(w.是HEIC(heic) === true, 名 + '：识别 HEIC（type）');
        ok(w.是HEIC(heif) === true, 名 + '：识别 HEIF（扩展名兜底）');
        ok(w.是HEIC(jpg) === false, 名 + '：普通 JPG 不误判');

        // ===== 4. EXIF 方向：大小端 × 1/3/6/8 =====
        ok(typeof w.读方向 === 'function', 名 + '：暴露 读方向()');
        for (const 大端 of [true, false]) {
            for (const 方向 of [1, 3, 6, 8]) {
                const buf = 造JPEG(方向, 大端);
                const f = new w.File([new Uint8Array(buf)], 'p.jpg', { type: 'image/jpeg' });
                const 实 = await w.读方向(f);
                ok(实 === 方向, 名 + '：EXIF ' + (大端 ? '大端' : '小端') + ' orientation=' + 方向 +
                    ' → 实际 ' + 实);
            }
        }
        // 非 JPEG 应直接返回 1，不抛错
        const png = new w.File([new Uint8Array([0x89, 0x50])], 'a.png', { type: 'image/png' });
        ok(await w.读方向(png) === 1, 名 + '：PNG 不解析 EXIF，返回 1');

        // ===== 5. 规范化：摆正 + 降采样 =====
        ok(typeof w.规范化图片 === 'function', 名 + '：暴露 规范化图片()');
        // 解码上限与移动端判定是模块内常量（不挂 window，避免污染全局），
        // 且 jsdom 无 canvas 实现，无法走运行时验证 —— 改用源码静态检查。
        const 源码 = fs.readFileSync(文件, 'utf8');
        ok(/解码像素上限\s*=\s*16000000/.test(源码),
            名 + '：解码像素上限 = 1600 万（iOS 安全线）');
        /* ★ 需求变更：点上传一律先弹「拍摄 / 从手机相册选择 / 取消」面板，
           桌面端不再偷偷直开系统文件框 —— 所以源码里不该再有 是移动端 分支。 */
        ok(!/是移动端/.test(源码), 名 + '：★ 已无移动端分支（桌面端也先弹面板）');
        ok(/来源遮罩\.classList\.add\('显示'\)/.test(源码), 名 + '：★ 入口走来源面板');
        // canvas 在部分环境不可用（如无 canvas 包的 jsdom）—— 必须容错，不能让用户卡死
        ok(/catch\s*\([^)]*\)\s*\{[^}]*图片宽\s*=\s*宽/.test(源码) ||
            /catch[^]{0,200}图片宽\s*=\s*宽/.test(源码),
            名 + '：canvas 失败时有兜底（按原图继续，不阻塞用户）');
    }

    console.log('\n---------------- 结果 ----------------');
    const 真错 = errors.filter(e => /console\.error|window\.error|TypeError|ReferenceError|SyntaxError/i.test(e));
    console.log('功能性断言失败:', errors.length);
    console.log('控制台真实报错:', 真错.length);
    if (errors.length || 真错.length) {
        console.log('\n✗ 存在问题:');
        [...errors, ...真错].forEach(e => console.log('   - ' + e));
        process.exit(1);
    }
    console.log('✅ 相册 / 拍照上传全部通过');
    process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
