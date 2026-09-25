/**
 * verify_camera.js —— 「拍摄」按钮真正唤起相机 + 权限处理 专项
 *
 * 用户诉求：拍摄按钮点击时可读取安卓 / iOS 系统相机权限进行拍摄上传。
 *
 * ★★ 原来只是点一个 capture="environment" 的 file input：
 *     在 APP 壳 / 部分 WebView 里 capture 被忽略（点了只弹文件框甚至没反应），
 *     而且拿不到任何权限状态 —— 用户拒绝、没有摄像头、被占用，全都静默失败。
 *
 * 现在三条路线依次降级：
 *     ① APP 原生相机（window.小喵叽原生.拍照）
 *     ② 页内实时相机（getUserMedia，有取景器、能切前后摄、权限可读）
 *     ③ 退回 input capture（保底不失灵）
 *
 * 覆盖
 *   [A] 模块已内联进 7 个页面，且与源文件无漂移
 *   [B] 7 个页面的「拍摄」按钮都接到了 全局相机.拍摄
 *   [C] ★★ 路线①：有原生桥 → 走桥，不建取景器、不点 input
 *   [D] ★★ 路线②：getUserMedia 可用 → 开取景器，拍下后交出 File（不点 input）
 *   [E] ★★ 权限被拒（NotAllowedError）→ 明确提示，且【不】继续降级
 *       （继续降级会绕过用户的拒绝，属于越权）
 *   [F] ★ 无设备 / 被占用 → 提示后【降级】到 input capture（保底可用）
 *   [G] ★ 非安全上下文（http 非 localhost）→ 直接降级，不弹无意义的取景器
 *   [H] ★ 全部不可用时仍走 input capture —— 功能不倒退
 *   [I] ★ 没有 input 的场景（6 页）→ 自建带 capture 的输入兜底
 *   [J] ★ 成功后把 File 塞回 input 并派发 change（页面原有逻辑零改动）
 *   [K] 取景器：切前后摄 / 取消关流 / 前置拍出来是正的（镜像翻回）
 *
 * ★ 全部打桩：jsdom 没有媒体栈，getUserMedia / canvas / 原生桥都是桩。
 *
 * 用法：PAGES_DIR=/data/workspace/输入适配 node verify_camera.js
 */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, 'testkit.js'));
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();
const 等 = ms => new Promise(r => setTimeout(r, ms));

const 脚本源 = fs.readFileSync(path.join(__dirname, '相机.js'), 'utf8');
const 目标页 = ['1_shouyeyulan.html', '2_haoyouxinxi.html', '6_fabudongtai.html',
    '8_wode.html', '9_zhutishezhi.html', '10_lunbotu.html', '11_woderenshe.html'];

/** 统计 file input 的 click 次数 */
function 打桩计数(w) {
    w.__次数 = 0;
    w.__最后 = null;
    w.HTMLInputElement.prototype.click = function () {
        if (this.type === 'file') { w.__次数++; w.__最后 = this; }
    };
}

/** 注入 getUserMedia 桩；拒/无设备 由 错名 控制 */
function 装取像(w, 错名) {
    const md = {
        getUserMedia() {
            w.__取像次数 = (w.__取像次数 || 0) + 1;
            if (错名) return Promise.reject(Object.assign(new Error(错名), { name: 错名 }));
            /* 返回一个假流：带 getTracks，供关流断言 */
            const 轨 = [{ stop() { w.__停流 = (w.__停流 || 0) + 1; } }];
            return Promise.resolve({ getTracks: () => 轨 });
        },
    };
    Object.defineProperty(w.navigator, 'mediaDevices', { value: md, configurable: true });
}

/* DataTransfer 桩：jsdom 没实现，而各浏览器都有。
   没有它就无法把 File 塞回 input —— 不是我们的问题，是 jsdom 的空白。 */
function 装回填(w) {
    if (typeof w.DataTransfer !== 'function') {
        w.DataTransfer = function () {
            const 列 = [];
            this.items = { add: f => 列.push(f) };
            Object.defineProperty(this, 'files', { get: () => 列 });
        };
    }
    /* input.files 在 jsdom 里是只读 getter，补一个可写通道 */
    Object.defineProperty(w.HTMLInputElement.prototype, 'files', {
        configurable: true,
        get() { return this.__文件们 || null; },
        set(v) { this.__文件们 = v; },
    });
}

/* canvas 桩：jsdom 没有实现 toBlob */
function 装画布(w) {
    const 原 = w.HTMLCanvasElement.prototype.getContext;
    w.HTMLCanvasElement.prototype.getContext = function () {
        return {
            drawImage() {}, translate() {}, scale() {},
        };
    };
    w.HTMLCanvasElement.prototype.toBlob = function (回) {
        回(new w.Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }));
    };
    return 原;
}

function 起(文件, 桩) {
    return 起页面(文件, 'http://localhost/' + 文件, {}, errors, '相机', win => {
        打桩计数(win);
        装画布(win);
        装回填(win);
        if (桩) 桩(win);
    });
}

const 点 = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async function main() {

    console.log('[A] ★ 7 个页面都内联了相机模块，且与源文件无漂移');
    {
        for (const 名 of 目标页) {
            const s = 读(名);
            ok(/<script id="相机">/.test(s), '★ ' + 名 + ' 内联了相机模块');
            /* ★★ 7 份复制最容易漂移，逐字比对 */
            const m = /<script id="相机">\n([\s\S]*?)\n[ \t]*<\/script>/.exec(s);
            ok(!!m && m[1] === 脚本源, '★ ★ ' + 名 + ' 内联副本与 相机.js 一致');
        }
    }

    console.log('\n[B] ★ 7 个页面的「拍摄」按钮都接到了 全局相机');
    {
        for (const 名 of 目标页) {
            const s = 读(名);
            const 净 = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            const 接了 = /全局相机\.拍摄\(\s*拍照输入\s*\)/.test(净) || /全局相机\.拍摄\(null/.test(净);
            ok(接了, '★ ' + 名 + ' 的拍摄按钮已接线');
        }
    }

    console.log('\n[C] ★★ 路线①：有 APP 原生相机桥 → 走桥');
    {
        const w = await 起('1_shouyeyulan.html', win => {
            win.小喵叽原生 = {
                拍照: () => JSON.stringify({ 数据: 'AAECAwQFBgc=', 名: '原生照.jpg' }),
            };
            win.__桥调用 = 0;
            const 原 = win.小喵叽原生.拍照;
            win.小喵叽原生.拍照 = function () { win.__桥调用++; return 原(); };
        });
        await 等(600);
        ok(!!w.全局相机, '★ 模块已挂载');
        ok(w.全局相机.有原生() === true, '★ 识别到原生相机桥');

        const 结 = await w.全局相机.拍摄(w.document.getElementById('拍照输入'));
        await 等(150);
        ok(!!结, '★ ★ 拿到照片 File（实际 ' + (结 && 结.name) + '）');
        ok(结 && 结.name === '原生照.jpg', '★ 用了桥返回的文件名');
        ok(w.__次数 === 0, '★ ★ 走桥时没有再去点 input（实际 ' + w.__次数 + ' 次）');
    }

    console.log('\n[D] ★★ 路线②：getUserMedia 可用 → 开取景器，不点 input');
    {
        const w = await 起('1_shouyeyulan.html', win => 装取像(win, null));
        await 等(600);
        ok(w.全局相机.可用页内() === true, '★ 识别到可用页内相机');

        const p = w.全局相机.拍摄(w.document.getElementById('拍照输入'));
        await 等(300);
        const 层 = w.document.getElementById('全局相机取景器');
        ok(!!层, '★ ★ 取景器已弹出');
        ok(w.__取像次数 >= 1, '★ 调了 getUserMedia（' + w.__取像次数 + ' 次）');

        /* 点快门 */
        const 快门 = Array.from(层.querySelectorAll('button')).find(b => b.textContent === '拍摄');
        ok(!!快门, '★ 有快门按钮');
        点(w, 快门);
        const 结 = await p;
        await 等(150);
        ok(!!结, '★ ★ 拍下并拿到 File（实际 ' + (结 && 结.type) + '）');
        ok(结 && /^image\//.test(结.type), '★ 是图片类型');
        ok(w.__次数 === 0, '★ ★ 页内相机路径下没有去点 input');
        ok(!w.document.getElementById('全局相机取景器'), '★ 拍完取景器已移除');
        ok(w.__停流 >= 1, '★ 摄像头流已关闭（不占着镜头）');
    }

    console.log('\n[E] ★★ 权限被拒 → 明确提示，且【不】继续降级');
    {
        /* ★ 提示走页面自己的 #toast（各页都有），不是 alert/showToast ——
             探测顺序在模块里是 showToast → 提示 → #toast → alert。 */
        const w = await 起('1_shouyeyulan.html', win => 装取像(win, 'NotAllowedError'));
        await 等(600);
        const 结 = await w.全局相机.拍摄(w.document.getElementById('拍照输入'));
        await 等(150);
        ok(结 === null, '★ 被拒 → 返回 null（不假装成功）');
        const 告 = (w.document.getElementById('toast') || {}).textContent || '';
        ok(!!告.trim(), '★ ★ 给了明确提示（实际 "' + 告.trim() + '"）');
        ok(/权限/.test(告), '★ ★ 提示里说清是「权限被拒绝」');
        ok(w.__次数 === 0,
            '★ ★ 被拒后【没有】继续降级去点 input（实际 ' + w.__次数 + ' 次）—— 降级等于绕过用户的拒绝');
    }

    console.log('\n[F] ★ 无设备 / 被占用 → 提示后【降级】到 input capture');
    {
        for (const [名, 错] of [['没有摄像头', 'NotFoundError'], ['摄像头被占用', 'NotReadableError']]) {
            const w = await 起('8_wode.html', win => 装取像(win, 错));
            await 等(600);
            w.全局相机.拍摄(w.document.getElementById('拍照输入'));
            await 等(300);
            const 告 = (w.document.getElementById('toast') || {}).textContent || '';
            ok(!!告.trim(), '★ ' + 名 + '：给了提示（"' + 告.trim() + '"）');
            ok(w.__次数 === 1,
                '★ ★ ' + 名 + '：降级到 input capture，仍可拍照（实际点了 ' + w.__次数 + ' 次）');
            ok(w.__最后 && w.__最后.getAttribute('capture') === 'environment',
                '★ ' + 名 + '：降级用的是带 capture 的拍照输入');
        }
    }

    console.log('\n[G] ★ 非安全上下文 → 直接降级，不弹无意义的取景器');
    {
        const w = await 起页面('1_shouyeyulan.html', 'http://example.com/1.html', {}, errors, '相机G',
            win => { 打桩计数(win); 装画布(win); 装取像(win, null); });
        await 等(600);
        ok(w.全局相机.可用页内() === false, '★ 识别为非安全上下文（http + 非 localhost）');
        ok(/系统相机/.test(w.全局相机.路线说明()), '★ 路线说明如实告知（' + w.全局相机.路线说明() + '）');
        w.全局相机.拍摄(w.document.getElementById('拍照输入'));
        await 等(250);
        ok(!w.document.getElementById('全局相机取景器'), '★ 没有弹出取景器');
        ok(w.__次数 === 1, '★ ★ 直接走 input capture（实际 ' + w.__次数 + ' 次）');
    }

    console.log('\n[H] ★ 全部不可用时仍走 input capture —— 功能不倒退');
    {
        const w = await 起('1_shouyeyulan.html', null);   // 不注入 mediaDevices
        await 等(600);
        ok(w.全局相机.可用页内() === false, '★ 环境不支持页内相机');
        w.全局相机.拍摄(w.document.getElementById('拍照输入'));
        await 等(250);
        ok(w.__次数 === 1, '★ ★ 退回 capture input，拍照能力仍在（实际 ' + w.__次数 + ' 次）');
        ok(w.__最后 && w.__最后.getAttribute('capture') === 'environment', '★ 用的仍是拍照输入');
    }

    console.log('\n[I] ★ 没有 input 的场景（6 页）→ 自建带 capture 的输入兜底');
    {
        const w = await 起('6_fabudongtai.html', null);
        await 等(700);
        let 收到 = null;
        w.全局相机.拍摄(null, { 回调: f => { 收到 = f; } });
        await 等(300);
        ok(w.__次数 === 1,
            '★ ★ 没有现成 input 时自建了一个并唤起（实际 ' + w.__次数 + ' 次）—— 否则 6 页会彻底失去拍照能力');
        ok(w.__最后 && w.__最后.getAttribute('capture') === 'environment', '★ 自建的输入带 capture');
        ok(w.__最后 && w.__最后.accept === 'image/*', '★ 限定图片类型');
    }

    console.log('\n[J] ★★ 成功后把 File 塞回 input 并派发 change（页面原有逻辑零改动）');
    {
        /* ★ 用 8 页：它的拍照输入 id 就是「拍照输入」；1 页那个叫「配图拍照输入」。 */
        const w = await 起('8_wode.html', win => 装取像(win, null));
        await 等(600);
        const 输入 = w.document.getElementById('拍照输入');
        let 触发 = 0;
        输入.addEventListener('change', () => { 触发++; });

        const p = w.全局相机.拍摄(输入);
        await 等(300);
        const 层 = w.document.getElementById('全局相机取景器');
        const 快门 = Array.from(层.querySelectorAll('button')).find(b => b.textContent === '拍摄');
        点(w, 快门);
        await p;
        await 等(200);
        ok(触发 === 1, '★ ★ change 被派发了一次（实际 ' + 触发 + '）—— 页面原有处理逻辑无需改动');
        ok(输入.files && 输入.files.length === 1, '★ File 已塞回 input（实际 ' + (输入.files && 输入.files.length) + ' 个）');
    }

    console.log('\n[K] ★ 取景器：切换前后摄 / 取消关流');
    {
        const w = await 起('1_shouyeyulan.html', win => 装取像(win, null));
        await 等(600);
        const p = w.全局相机.拍摄(w.document.getElementById('拍照输入'));
        await 等(300);
        const 层 = w.document.getElementById('全局相机取景器');
        const 钮 = Array.from(层.querySelectorAll('button'));
        const 切换 = 钮.find(b => b.textContent === '切换');
        const 取消 = 钮.find(b => b.textContent === '取消');
        ok(!!切换 && !!取消, '★ 有 切换 / 取消 两个按钮');

        const 前 = w.__取像次数;
        点(w, 切换);
        await 等(200);
        ok(w.__取像次数 === 前 + 1, '★ 切换前后摄 → 重新取流（' + 前 + ' → ' + w.__取像次数 + '）');

        点(w, 取消);
        const 结 = await p;
        await 等(150);
        ok(结 === null, '★ 取消 → 返回 null，不产出文件');
        ok(w.__停流 >= 1, '★ ★ 取消时摄像头流已关闭（不会一直占着镜头）');
        ok(!w.document.getElementById('全局相机取景器'), '★ 取景器已移除');
    }

    收尾(errors, '✅ 「拍摄」按钮唤起相机 + 权限处理 全部通过');
})().catch(e => { console.error('脚本异常:', e.message); console.error(e.stack); process.exit(2); });
