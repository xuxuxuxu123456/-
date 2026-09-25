/**
 * verify_zhuti.js —— 主题设置（9 页）+ 轮播图设置（10 页）专项验证
 *
 * 覆盖：
 *   [A] 9 页能起来，且无运行时报错
 *   [B] 顶部三件套：返回 / 标题（随入口变）/ 右侧占位
 *   [B2] from=1 时标题显示「图库」
 *   [C] ★ 6 张内置主题格：文件名 默认主题背景 + 背景1~5，默认选中第 1 张
 *   [D] ★ 点第 N 张 → 写入「主题背景」{ 源:'默认', 索引:N-1 } 且该格选中
 *   [E] ★ 相册 / 拍照双入口：.视觉隐藏（非 display:none）+ capture 只加在拍照入口
 *   [F] ★ HEIC 拦截 + EXIF orientation（大小端 × 1/3/6/8）+ 降采样常量
 *   [G] ★ 裁剪几何：transform-origin = 0 0，且渲染区完整覆盖 9:16 取景框
 *   [H] 1 页加号菜单含「扭蛋机」且映射到 15 页
 *   [I] ★ 1~8 页 + 10 页都挂了主题背景读取脚本（全局生效的前提）
 *   [J] 10 页：4 张缩略图、?序=2 → 第 3 张为当前、写入「轮播图_2」
 *   [K] 5 页：8 张轮播卡各带 data-序，轻点卡片 → 打开轮播设置并带上正确序号
 *
 * 用法：node verify_zhuti.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 各页 = ['1_shouyeyulan.html', '2_haoyouxinxi.html', '3_YINSEAPI.html', '4_tongxun.html',
              '5_dongtai.html', '6_fabudongtai.html', '7_liaotian.html', '8_wode.html'];

/** 模拟真实手机照片：3000 × 4000（大图最能暴露 transform-origin 问题） */
const 图宽 = 3000, 图高 = 4000;
const 视口宽 = 240;                       // 9 页裁剪视口 clientWidth 打桩值
const 视口高 = Math.round(视口宽 * 16 / 9); // 9:16
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==';

/** 解析 transform 字符串 → { tx, ty, scale } */
function 解析变换(str) {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(str || '');
    if (!m) return null;
    return { tx: parseFloat(m[1]), ty: parseFloat(m[2]), scale: parseFloat(m[3]) };
}

/** 按实际 transform-origin 算图片在取景框坐标系里的渲染区 */
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

/**
 * 给 9 页打桩：FileReader / naturalWidth / 视口尺寸 / input.files
 * ★ 必须在页面 load 之后调用 —— testkit 的 附加 钩子跑在 beforeParse，
 *   那时 DOM 还没建起来，getElementById 一律返回 null。
 */
function 打桩9页(w) {
    w.FileReader = class {
        readAsDataURL() {
            this.result = 'data:image/png;base64,' + PNG;
            Promise.resolve().then(() => { if (this.onload) this.onload({ target: this }); });
        }
        abort() {}
    };
    const 视口 = w.document.getElementById('裁剪视口');
    Object.defineProperty(视口, 'clientWidth', { get: () => 视口宽, configurable: true });
    const 裁剪图 = w.document.getElementById('裁剪图片');
    Object.defineProperty(裁剪图, 'naturalWidth', { get: () => 图宽, configurable: true });
    Object.defineProperty(裁剪图, 'naturalHeight', { get: () => 图高, configurable: true });
    let _src = '';
    Object.defineProperty(裁剪图, 'src', {
        get() { return _src; },
        set(v) {
            _src = v;
            if (/^data:image\//.test(v)) {
                Promise.resolve().then(() => { if (裁剪图.onload) 裁剪图.onload({ target: 裁剪图 }); });
            }
        },
        configurable: true,
    });
    Object.defineProperty(w.HTMLInputElement.prototype, 'files', {
        configurable: true,
        get() { return this._f || []; },
        set(v) { this._f = v; },
    });
}

(async function main() {
    const 源码9 = 读('9_zhutishezhi.html');
    const 源码10 = 读('10_lunbotu.html');
    const 源码5 = 读('5_dongtai.html');
    const 源码1 = 读('1_shouyeyulan.html');

    console.log('[A] 9 页能起来，且无运行时报错');
    {
        const w = await 起页面('9_zhutishezhi.html', 'http://localhost/9.html', {}, errors, '9');
        await new Promise(r => setTimeout(r, 120));
        ok(!!w.document.getElementById('主题网格'), '页面已渲染出主题网格');
        ok(!!w.document.getElementById('裁剪遮罩'), '页面已渲染出裁剪弹窗');
    }

    console.log('\n[B] 顶部三件套：返回 / 标题（随入口变）/ 右侧占位');
    {
        const w = await 起页面('9_zhutishezhi.html', 'http://localhost/9.html', {}, errors, '9');
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        ok(!!d.getElementById('返回按钮'), '左侧有返回键');
        ok(!!d.querySelector('#返回按钮 svg'), '返回键是箭头图标');
        const 标题 = d.querySelector('.中间标题');
        /* 无 ?from= → 走默认标题「主题设置」（8 页设置入口就是这个） */
        ok(!!标题 && 标题.textContent.trim() === '主题设置',
            '默认中间标题为「主题设置」（实际 ' + (标题 && 标题.textContent.trim()) + '）');
    }

    console.log('\n[B2] ★ 标题固定为「主题设置」（图库已独立成 15 页）');
    {
        const w = await 起页面('9_zhutishezhi.html',
            'http://localhost/9.html?from=8', {}, errors, '9-主题');
        await new Promise(r => setTimeout(r, 150));
        const 题 = w.document.querySelector('.中间标题');
        ok(!!题 && 题.textContent.trim() === '主题设置',
            '★ from=8 → 标题「主题设置」（实际 ' + (题 && 题.textContent.trim()) + '）');
        ok(!/图库/.test(题.textContent), '★ 标题里不再出现「图库」');
        /* 1 页的「图库」入口已指向 15_tuku.html，本页不再需要按入口换标题 */
        ok(!/同步标题/.test(源码9), '★ 已移除按入口切换标题的逻辑');
    }

    console.log('\n[C] ★ 6 张内置主题：默认主题背景 + 背景1~5，默认选中第 1 张');
    {
        const w = await 起页面('9_zhutishezhi.html', 'http://localhost/9.html', {}, errors, '9');
        await new Promise(r => setTimeout(r, 150));
        const 格 = Array.from(w.document.querySelectorAll('.主题格'));
        ok(格.length === 6, '渲染出 6 张内置主题（实际 ' + 格.length + '）');
        const 名 = 格.map(e => (e.querySelector('.主题名') || {}).textContent);
        ok(名.join(',') === '默认,背景 1,背景 2,背景 3,背景 4,背景 5',
            '标题依次为 默认 / 背景 1~5（实际 ' + 名.join(',') + '）');

        const 期望文件 = ['默认主题背景', '背景1', '背景2', '背景3', '背景4', '背景5'];
        // ★ 用 getAttribute('src') 而非 .src —— 后者是 jsdom 解析后的绝对 URL，
        //   中文目录名会被百分号编码，正则匹配不到
        const 实际文件 = 格.map(e => {
            const img = e.querySelector('img');
            const m = /2【图片】\/(.+?)\.(png|jpe?g|webp)$/.exec(img ? (img.getAttribute('src') || '') : '');
            return m ? m[1] : '?';
        });
        ok(实际文件.join(',') === 期望文件.join(','),
            '图片指向 2【图片】/' + 期望文件.join(', ') + '（实际 ' + 实际文件.join(',') + '）');

        ok(格[0].classList.contains('选中'), '默认选中第 1 张（默认主题背景）');
        ok(格.filter(e => e.classList.contains('选中')).length === 1, '只有 1 张处于选中态');
        ok(!!格[0].querySelector('.主题勾'), '选中项有勾选徽标');
    }

    console.log('\n[D] ★ 点第 N 张 → 写入「主题背景」且该格选中');
    {
        const 数据 = {};
        const w = await 起页面('9_zhutishezhi.html', 'http://localhost/9.html', 数据, errors, '9');
        await new Promise(r => setTimeout(r, 150));
        const 格 = Array.from(w.document.querySelectorAll('.主题格'));
        格[3].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 60));

        const 存 = JSON.parse(数据['主题背景'] || 'null');
        ok(!!存 && 存.源 === '默认' && 存.索引 === 3,
            '点第 4 张 → 写入 { 源:默认, 索引:3 }（实际 ' + (数据['主题背景'] || '无') + '）');
        const 新格 = Array.from(w.document.querySelectorAll('.主题格'));
        ok(新格[3].classList.contains('选中'), '第 4 张变为选中态');
        ok(!新格[0].classList.contains('选中'), '第 1 张取消选中');
    }

    console.log('\n[E] ★ 相册 / 拍照双入口');
    {
        const w = await 起页面('9_zhutishezhi.html', 'http://localhost/9.html', {}, errors, '9');
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        const 相册 = d.querySelector('input:not([capture])[type="file"]');
        const 拍照 = d.querySelector('input[capture][type="file"]');
        ok(!!相册, '存在相册入口');
        ok(!!拍照, '存在拍照入口');
        ok(!!相册 && 相册.className.includes('视觉隐藏'),
            '相册输入用 .视觉隐藏（非 display:none，移动端 click 才有效）');
        ok(!!相册 && !相册.hasAttribute('capture'), '相册入口不带 capture');
        ok(!!拍照 && 拍照.getAttribute('capture') === 'environment', '拍照入口带 capture="environment"');
        ok(!!d.getElementById('来源遮罩'), '存在来源选择面板');
        ok(['来源拍照', '来源相册', '来源取消'].every(i => !!d.getElementById(i)),
            '面板含 拍照 / 相册 / 取消 三项');
    }

    console.log('\n[F] ★ HEIC 拦截 + EXIF 方向（大小端 × 1/3/6/8）');
    {
        const w = await 起页面('9_zhutishezhi.html', 'http://localhost/9.html', {}, errors, '9');
        await new Promise(r => setTimeout(r, 120));

        ok(typeof w.是HEIC === 'function', '暴露 是HEIC()');
        const heic = new w.File([new Uint8Array([1, 2, 3])], 'IMG_0001.HEIC', { type: 'image/heic' });
        const heif = new w.File([new Uint8Array([1, 2, 3])], 'a.heif', { type: '' });
        const jpg = new w.File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
        ok(w.是HEIC(heic) === true, '识别 HEIC（type）');
        ok(w.是HEIC(heif) === true, '识别 HEIF（扩展名兜底）');
        ok(w.是HEIC(jpg) === false, '普通 JPG 不误判');

        ok(typeof w.读方向 === 'function', '暴露 读方向()');
        // 复用 verify_album_upload 里的构造法
        function 造JPEG(方向, 大端 = true) {
            const u16 = v => { const b = Buffer.alloc(2); 大端 ? b.writeUInt16BE(v) : b.writeUInt16LE(v); return b; };
            const u32 = v => { const b = Buffer.alloc(4); 大端 ? b.writeUInt32BE(v) : b.writeUInt32LE(v); return b; };
            const tiff = Buffer.concat([
                大端 ? Buffer.from('MM') : Buffer.from('II'),
                u16(0x002A), u32(8),
                u16(1),
                u16(0x0112), u16(3), u32(1),
                u16(方向), Buffer.from([0, 0]),
                u32(0),
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
                const f = new w.File([new Uint8Array(造JPEG(方向, 大端))], 'p.jpg', { type: 'image/jpeg' });
                const 实 = await w.读方向(f);
                ok(实 === 方向, 'EXIF ' + (大端 ? '大端' : '小端') + ' orientation=' + 方向 + ' → 实际 ' + 实);
            }
        }
        const png = new w.File([new Uint8Array([0x89, 0x50])], 'a.png', { type: 'image/png' });
        ok(await w.读方向(png) === 1, 'PNG 不解析 EXIF，返回 1');
        ok(/解码像素上限\s*=\s*16000000/.test(源码9), '定义了 1600 万像素解码上限（降采样）');
    }

    console.log('\n[G] ★ 裁剪几何：origin = 0 0 且渲染区完整覆盖 9:16 取景框');
    {
        const w = await 起页面('9_zhutishezhi.html', 'http://localhost/9.html', {}, errors, '9');
        await new Promise(r => setTimeout(r, 100));
        const d = w.document;
        打桩9页(w);

        const 输入 = d.getElementById('相册输入');
        输入._f = [{ name: 'photo.png', type: 'image/png' }];
        输入.dispatchEvent(new w.Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));

        ok(d.getElementById('裁剪遮罩').classList.contains('显示'), '选图后裁剪弹窗已打开');
        const 裁剪图 = d.getElementById('裁剪图片');
        ok(/^data:image\//.test(裁剪图.src), '裁剪图 src 已设为所选图片');

        const t = 解析变换(裁剪图.style.transform);
        ok(t !== null, '已应用初始变换 transform=' + 裁剪图.style.transform);
        ok(/^0(px)?\s+0(px)?$/.test(String(裁剪图.style.transformOrigin).trim()),
            '★ transform-origin = 0 0（实际 "' + 裁剪图.style.transformOrigin + '"）');

        if (t) {
            const r = 计算渲染区(t, 裁剪图.style.transformOrigin, 图宽, 图高);
            console.log(`    渲染区 X[${r.左.toFixed(1)}, ${r.右.toFixed(1)}] Y[${r.上.toFixed(1)}, ${r.下.toFixed(1)}]  取景框 [0, ${视口宽}] × [0, ${视口高}]`);
            ok(r.左 <= 0 && r.右 >= 视口宽, `★ 横向覆盖取景框（左≤0 且 右≥${视口宽}）`);
            ok(r.上 <= 0 && r.下 >= 视口高, `★ 纵向覆盖取景框（上≤0 且 下≥${视口高}）`);
        }
        ok(/\.裁剪视口\s*\{[^}]*aspect-ratio:\s*9\s*\/\s*16/.test(源码9), 'CSS：取景框是 9:16（竖屏，贴合手机主题背景）');
    }

    console.log('\n[H] ★ 1 页加号菜单含「扭蛋机」且映射到 15 页');
    {
        ok(/data-动作="扭蛋机"/.test(源码1), '★ 1 页菜单存在「扭蛋机」项');
        ok(!/data-动作="图库"/.test(源码1), '★ 上一版的「图库」项已改名');
        ok(!/data-动作="主题设置"/.test(源码1), '★ 旧的「主题设置」项已移除');
        ok(/扭蛋机:\s*'15_tuku\.html\?from=1'/.test(源码1), '★ 菜单映射指向 15_tuku.html?from=1');
        ok(/case '扭蛋机'/.test(源码1), '★ switch 分支已接入「扭蛋机」');
        ok(!/case '主题设置'/.test(源码1), '★ 旧的 switch 分支已移除');
        /* ★ 文字与 data-动作 必须一致：只改属性不改文字，界面上还是「主题设置」。
             直接找那行 <span> 比按距离匹配稳（中间夹着一整个 svg，距离会变）。 */
        ok(/<span class="添加菜单文字">扭蛋机<\/span>/.test(源码1),
            '★ ★ 菜单显示文字也是「扭蛋机」（不是只改了 data-动作）');
        ok(!/添加菜单文字">图库</.test(源码1), '★ 界面上已没有「图库」文字');
        ok(!/添加菜单文字">主题设置</.test(源码1), '★ 界面上已没有「主题设置」文字');

        const w = await 起页面('1_shouyeyulan.html', 'http://localhost/1.html', {}, errors, '1');
        await new Promise(r => setTimeout(r, 200));
        const 项 = Array.from(w.document.querySelectorAll('.添加菜单项'));
        ok(项.length === 4, '菜单渲染出 4 项（实际 ' + 项.length + '）');
        ok(项.some(e => e.dataset.动作 === '扭蛋机'),
            '★ 菜单项「扭蛋机」已渲染（' + 项.map(e => e.dataset.动作).join('/') + '）');
        const 机项 = 项.find(e => e.dataset.动作 === '扭蛋机');
        ok(!!机项 && 机项.querySelector('.添加菜单文字').textContent.trim() === '扭蛋机',
            '★ 渲染出的文字是「扭蛋机」（实际 '
            + (机项 && 机项.querySelector('.添加菜单文字').textContent.trim()) + '）');
        ok(!!机项 && !!机项.querySelector('svg'), '★ 扭蛋机项有图标');
    }

    console.log('\n[I] ★ 1~8 页 + 10 / 15 页都挂了主题背景读取脚本（全局生效的前提）');
    {
        for (const f of 各页.concat(['10_lunbotu.html', '15_tuku.html'])) {
            const s = 读(f);
            ok(/主题背景：读全局设置/.test(s), f + '：已挂主题背景读取脚本');
            ok(/localStorage\.getItem\('主题背景'/.test(s), f + '：读的是「主题背景」键');
            ok(/'背景' \+ 存\.索引/.test(s), f + '：内置主题按索引拼 背景N');
        }
    }

    console.log('\n[J] 10 页：4 张缩略图 / ?序= 定位 / 写入「轮播图_2」');
    {
        const w = await 起页面('10_lunbotu.html', 'http://localhost/10.html?序=2', {}, errors, '10');
        await new Promise(r => setTimeout(r, 150));
        const d = w.document;

        const 缩略 = Array.from(d.querySelectorAll('.缩略格'));
        ok(缩略.length === 4, '渲染出 4 张缩略图（实际 ' + 缩略.length + '）');
        ok(缩略[2].classList.contains('当前'), '?序=2 → 第 3 张为当前');
        ok(d.getElementById('页面标题').textContent.indexOf('3') !== -1,
            '标题随序号变化（实际 "' + d.getElementById('页面标题').textContent + '"）');
        ok(d.getElementById('预览角标').textContent.indexOf('3') !== -1, '预览角标显示「第 3 张」');

        // 非法序号应回落第 1 张，不能崩
        const w2 = await 起页面('10_lunbotu.html', 'http://localhost/10.html?序=99', {}, errors, '10');
        await new Promise(r => setTimeout(r, 120));
        ok(Array.from(w2.document.querySelectorAll('.缩略格'))[0].classList.contains('当前'),
            '?序=99（越界）→ 回落第 1 张');

        // 写入
        const 数据 = {};
        const w3 = await 起页面('10_lunbotu.html', 'http://localhost/10.html?序=2', 数据, errors, '10');
        await new Promise(r => setTimeout(r, 150));
        w3.应用轮播图(2, 'data:image/jpeg;base64,FAKE');
        await new Promise(r => setTimeout(r, 80));
        ok(数据['轮播图_2'] === 'data:image/jpeg;base64,FAKE', '写「轮播图_2」成功');
        ok(w3.document.getElementById('预览角标').classList.contains('自定义'), '预览角标标出「自定义」');

        // 5 页能读到（源码级：载入图片里优先读 轮播图_<序>）
        ok(/localStorage\.getItem\('轮播图_' \+ 序位\)/.test(源码5), '5 页轮播优先读「轮播图_<序>」');
        ok(/img\.dataset\.序/.test(源码5), '5 页按 data-序 取对应张');
    }

    console.log('\n[K] 5 页：8 张卡各带 data-序，轻点 → 打开轮播设置并带正确序号');
    {
        const w = await 起页面('5_dongtai.html', 'http://localhost/5.html', {}, errors, '5');
        await new Promise(r => setTimeout(r, 200));
        const d = w.document;

        const 序表 = Array.from(d.querySelectorAll('.轮播图')).map(i => i.dataset.序);
        ok(序表.length === 8, '轨道含 8 张卡（4 张 × 2 组）实际 ' + 序表.length);
        ok(序表.join(',') === '0,1,2,3,0,1,2,3', '8 张的 data-序 为 0,1,2,3,0,1,2,3（实际 ' + 序表.join(',') + '）');

        // 接管跳转，记录被点的序号
        let 记录 = null;
        w.打开轮播设置 = 序 => { 记录 = 序; };
        const 目标页 = d.querySelectorAll('.轮播页')[2];
        w.document.elementFromPoint = () => 目标页;

        const 视窗 = d.getElementById('轮播视窗');
        const 按下 = new w.MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50 });
        const 松开 = new w.MouseEvent('pointerup', { bubbles: true, clientX: 52, clientY: 51 });
        视窗.dispatchEvent(按下);
        目标页.dispatchEvent(松开);
        await new Promise(r => setTimeout(r, 60));
        ok(记录 === '2', '★ 轻点第 3 张 → 带 序=2 打开设置页（实际 ' + 记录 + '）');

        // 拖动（位移超阈值）不应触发跳转
        记录 = null;
        const 拖开 = new w.MouseEvent('pointerup', { bubbles: true, clientX: 150, clientY: 60 });
        视窗.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50 }));
        目标页.dispatchEvent(拖开);
        await new Promise(r => setTimeout(r, 60));
        ok(记录 === null, '★ 拖动（位移 > 8px）不跳转，不误触');

        ok(/10_lunbotu\.html\?序=/.test(源码5), '跳转目标为 10_lunbotu.html?序=');
    }

    收尾(errors, '主题设置 + 轮播图设置 全部通过');
})().catch(e => { console.error(e); process.exit(1); });
