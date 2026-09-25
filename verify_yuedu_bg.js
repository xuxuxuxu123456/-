/**
 * verify_yuedu_bg.js —— 22_yuedu 编辑界面背景「与整体主题背景统一」专项
 *
 * 用户诉求：编辑界面背景应该是整页主题背景，而不是显示上一界面的样式。
 *
 * 实测出的三条成因（本脚本逐条钉死）：
 *   ① .编辑中 漏收 .全局白色遮罩 —— 阅读器的 .阅读中 收了，编辑器没收。
 *      主题背景先被 45% 白纱糊一层，再被编辑器 70% 白压一层 → 发灰发白，
 *      跟阅读器里那张图根本不是一个颜色。
 *   ② 作者遮罩 z-index 270 > 编辑遮罩 260 —— 层叠倒挂。
 *      从作者主页点「写」，编辑器被作者主页盖住 → 用户看到的是上一界面。
 *   ③ 作品遮罩 255 在编辑器之下但没关闭 —— 隔着编辑器 30% 的透明缝透上来。
 *
 * 修法是新增 .写稿中（仅编辑器挂）：
 *   ★ 不能直接把这些规则并进 .编辑中 —— 作者主页 / 作品页自己也用 .编辑中，
 *     并进去会把它们自己也藏掉。
 *
 * 用法：PAGES_DIR=/data/workspace/输入适配 node verify_yuedu_bg.js
 */
const path = require('path');
const kit = require(path.join(__dirname, 'testkit.js'));
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();
const 等 = ms => new Promise(r => setTimeout(r, ms));

const 假图 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function 装库(win, 仓库) {
    win.indexedDB = {
        open() {
            const 请 = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
            setTimeout(() => {
                const db = {
                    objectStoreNames: { contains: () => true }, createObjectStore() {},
                    transaction(t) {
                        const 存 = 仓库[t] || (仓库[t] = {});
                        const 事 = { oncomplete: null, onerror: null, error: null };
                        事.objectStore = () => ({
                            put(记) { const r = { result: null }; setTimeout(() => { 存[记.id] = JSON.parse(JSON.stringify(记)); r.result = 记.id; if (事.oncomplete) 事.oncomplete(); }, 0); return r; },
                            get(id) { const r = { result: null }; setTimeout(() => { r.result = 存[id] ? JSON.parse(JSON.stringify(存[id])) : undefined; if (r.onsuccess) r.onsuccess(); if (事.oncomplete) 事.oncomplete(); }, 0); return r; },
                        });
                        return 事;
                    },
                };
                请.result = db;
                if (请.onsuccess) 请.onsuccess();
            }, 0);
            return 请;
        },
    };
}

const 点 = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

const 书数据 = () => ({
    '阅读_笔名': '作者甲',
    '阅读_平台': JSON.stringify([{
        id: 'my_1', 书名: '测试书', 作者: '作者甲', 发布者: '作者甲',
        章数: 0, 字数: 0, 来源: '平台', 时间: Date.now(),
    }]),
    '阅读_书架': JSON.stringify([{ id: 'my_1', 书名: '测试书', 作者: '作者甲', 来源: '平台' }]),
});

function 起(数据, 仓库) {
    return 起页面('22_yuedu.html', 'http://localhost/22.html?from=1', 数据 || 书数据(), errors, '22',
        win => { 装库(win, 仓库 || {}); win.confirm = () => true; });
}

/** 元素此刻在屏幕上是否真的看得见（visibility 会继承，取计算样式即可） */
function 可见(w, el) {
    if (!el) return false;
    const cs = w.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    return true;
}

(async function main() {

    console.log('[A] ★★ CSS 规则：.写稿中 收掉全局白纱与下层浮层');
    {
        const src = 读('22_yuedu.html');
        /* ★ 必须锚定到【行首】：注释正文里也会提到「.写稿中」，
             不锚定就会从注释里的那次提及开始匹配，抓到的是上一条规则的 body。
             同时用「非贪婪直到第一个 {」而不是写死长度（注释很长，写死会截断）。 */
        const 块 = /(?:^|\n)[ \t]*\.写稿中[^{]*\{[^}]*\}/.exec(src);
        ok(!!块, '★ 存在 .写稿中 规则');
        const 文 = 块 ? 块[0] : '';
        ok(/\.写稿中 \.作品遮罩/.test(文), '★ 收 .作品遮罩');
        ok(/\.写稿中 \.作者遮罩/.test(文), '★★ 收 .作者遮罩（270 盖住 260 的层叠倒挂）');

        /* ★ 关键约束：界面【本身】绝不能挂在 .编辑中 上 ——
             作者主页 / 作品页自己也加 .编辑中，挂上去会把自己藏掉。 */
        ok(!/\.编辑中 \.作者遮罩/.test(src), '★★ 作者遮罩【没有】挂在 .编辑中 下（否则作者主页会把自己藏掉）');
        ok(!/\.编辑中 \.作品遮罩/.test(src), '★★ 作品遮罩同样没挂 .编辑中');
        /* ★ 但【白纱】相反：它是装饰层不是界面，必须挂在 .编辑中，
             这样作品页 / 作者主页 / 编辑器三处才都收得到
             （只挂 .写稿中的话，会漏掉作品页与作者主页这两家）。 */
        ok(/\.编辑中 \.全局白色遮罩/.test(src), '★★ 白纱挂在 .编辑中 —— 三处沉浸式界面统一收起');
        const 编辑中块 = /\.编辑中 \.顶部固定区[^{]*\{[^}]*\}/.exec(src);
        const 编辑中文 = 编辑中块 ? 编辑中块[0] : '';
        ok(/\.编辑中 \.顶部固定区/.test(编辑中文), '（对照）.编辑中 仍保留原有三项：顶栏 / 内容区 / 底栏');
    }

    console.log('\n[B] ★★ 开编辑器 → 挂 .写稿中；关编辑器 → 摘掉（配对）');
    {
        const w = await 起(); await 等(800);
        const d = w.document;
        const 容器 = d.querySelector('.手机主题背景容器');

        ok(!容器.classList.contains('写稿中'), '初始没有 .写稿中');

        await w.阅读.开编辑器('my_1'); await 等(400);
        ok(d.getElementById('编辑遮罩').classList.contains('显示'), '编辑器已打开');
        ok(容器.classList.contains('写稿中'), '★★ 开编辑器 → 挂上 .写稿中');

        w.阅读.关编辑器(); await 等(200);
        ok(!容器.classList.contains('写稿中'), '★★ 关编辑器 → 摘掉 .写稿中（漏摘会让界面一直缺白纱）');
        ok(!容器.classList.contains('编辑中'), '★ .编辑中 也一并摘掉');
    }

    console.log('\n[C] ★★ 编辑时：全局白纱与下层浮层都真的不可见');
    {
        const w = await 起(); await 等(800);
        const d = w.document;

        /* 开之前：白纱是可见的（页面原本的样子） */
        ok(可见(w, d.querySelector('.全局白色遮罩')), '（对照）未进编辑器时白纱可见');

        await w.阅读.开编辑器('my_1'); await 等(400);

        ok(!可见(w, d.querySelector('.全局白色遮罩')),
            '★★ 编辑时 .全局白色遮罩 不可见（原本漏收 → 背景发灰发白）');
        ok(!可见(w, d.getElementById('作品遮罩')),
            '★★ 编辑时 .作品遮罩 不可见（原本隔着 30% 透上来）');
        ok(!可见(w, d.getElementById('作者遮罩')),
            '★★ 编辑时 .作者遮罩 不可见（原本 270 盖住编辑器 260）');
        ok(!可见(w, d.querySelector('.顶部固定区')), '★ 顶栏收起');
        ok(!可见(w, d.querySelector('.内容区')), '★ 内容区收起');
        ok(!可见(w, d.querySelector('.底部导航栏')), '★ 底栏收起');

        /* 编辑器自己必须可见 */
        ok(可见(w, d.getElementById('编辑遮罩')), '★ 编辑器本身可见');
    }

    console.log('\n[D] ★★ 层叠倒挂验证：作者主页(270) 与 编辑器(260)');
    {
        const src = 读('22_yuedu.html');
        const 取z = 名 => {
            const m = new RegExp('\\.' + 名 + '\\s*\\{[^}]*z-index:\\s*(\\d+)').exec(src);
            return m ? Number(m[1]) : null;
        };
        const 作 = 取z('作者遮罩'), 编 = 取z('编辑遮罩');
        ok(作 === 270 && 编 === 260, '（事实）作者遮罩 270 > 编辑遮罩 260，z-index 确实倒挂');
        /* ★ 我们【不改】z-index —— 改动它会牵动阅读器(250)、作品页(255)、
             更多菜单(320) 的既有秩序。改用 .写稿中 把上层浮层收掉，
             效果一样且零风险。下面断言：靠收掉而非提权，编辑器照样看得见。 */
        const w = await 起(); await 等(800);
        const d = w.document;
        await w.阅读.开编辑器('my_1'); await 等(400);
        ok(可见(w, d.getElementById('编辑遮罩')), '★★ 即便 z-index 倒挂，编辑器依然可见（靠收掉上层）');
        ok(!可见(w, d.getElementById('作者遮罩')), '★★ 上一界面（作者主页）不再遮挡');
    }

    console.log('\n[E] ★★ 编辑界面背景 = 整页主题背景（同一张图）');
    {
        const 数据 = Object.assign(书数据(), {
            '主题背景': JSON.stringify({ 源: '自定义', 数据: 假图 }),
        });
        const w = await 起(数据); await 等(800);
        const d = w.document;
        const 图 = d.querySelector('.主题背景图片');

        ok(!!图 && 图.src === 假图, '★ 主题背景图已应用（自定义）');

        await w.阅读.开编辑器('my_1'); await 等(400);

        /* ★ 编辑器底下只剩这一张图：主题背景没被替换、没被覆盖 */
        ok(图.src === 假图, '★★ 进入编辑器后，主题背景仍是同一张（没被换掉）');
        ok(!可见(w, d.querySelector('.全局白色遮罩')), '★★ 挡在主题图之上的白纱已收 → 背景不被二次稀释');

        /* 编辑器自身透明 + 70% 白，透出的就是主题图 */
        const 编块 = /\.编辑遮罩\s*\{([\s\S]*?)\}/.exec(读('22_yuedu.html'));
        ok(/background:\s*transparent/.test(编块 ? 编块[1] : ''), '★ 编辑器本身透明 → 透出主题背景');
        const 白块 = /\.编辑遮罩::before\s*\{([\s\S]*?)\}/.exec(读('22_yuedu.html'));
        ok(/rgba\(255,\s*255,\s*255,\s*0\.70\)/.test(白块 ? 白块[1] : ''), '★ 压 70% 白（与阅读器一致）');
    }

    console.log('\n[F] ★ 三处沉浸式界面互不干扰（作者主页 / 作品页不被自己藏掉）');
    {
        const w = await 起(); await 等(800);
        const d = w.document;
        const 容器 = d.querySelector('.手机主题背景容器');

        /* 作者主页：加 .编辑中 但【不加】.写稿中 → 必须仍可见 */
        await w.阅读.开作者主页('作者甲'); await 等(400);
        ok(容器.classList.contains('编辑中'), '作者主页挂了 .编辑中');
        ok(!容器.classList.contains('写稿中'), '★★ 作者主页【不】挂 .写稿中');
        ok(可见(w, d.getElementById('作者遮罩')), '★★ 作者主页自己仍然可见（没被 .编辑中 藏掉）');
        ok(!可见(w, d.querySelector('.全局白色遮罩')), '★ 作者主页下白纱同样收起（与阅读器 / 作品页统一）');
        w.阅读.关作者主页(); await 等(200);

        /* 作品页同理 */
        await w.阅读.开作品页('my_1'); await 等(400);
        ok(!容器.classList.contains('写稿中'), '★★ 作品页【不】挂 .写稿中');
        ok(可见(w, d.getElementById('作品遮罩')), '★★ 作品页自己仍然可见');
        w.阅读.关作品页(); await 等(200);
    }

    console.log('\n[G] ★ 返回后恢复：白纱与浮层都回来');
    {
        const w = await 起(); await 等(800);
        const d = w.document;
        await w.阅读.开编辑器('my_1'); await 等(400);
        ok(!可见(w, d.querySelector('.全局白色遮罩')), '编辑时白纱收起');
        w.阅读.关编辑器(); await 等(250);
        ok(可见(w, d.querySelector('.全局白色遮罩')), '★★ 关掉编辑器后白纱恢复（界面不会一直发暗）');
        ok(可见(w, d.querySelector('.内容区')), '★ 内容区恢复');
    }

    console.log('\n[H] ★★ 作品详情 → 点进章节 → 退出：背景仍是主题背景，不是上一界面');
    {
        const w = await 起(); await 等(800);
        const d = w.document;
        const 容器 = d.querySelector('.手机主题背景容器');
        const 作品 = d.getElementById('作品遮罩');

        await w.阅读.开作品页('my_1'); await 等(400);
        ok(作品.classList.contains('显示'), '作品详情已打开');
        ok(容器.classList.contains('编辑中'), '作品页挂上 .编辑中（靠它收起内容区）');
        ok(!可见(w, d.querySelector('.内容区')), '内容区收起 → 露出的是主题背景');

        /* 点进章节 */
        await w.阅读.开编辑器('my_1'); await 等(400);
        ok(容器.classList.contains('写稿中'), '编辑器挂上 .写稿中');
        ok(!可见(w, 作品), '编辑时作品页被收起（免得隔着透明缝透上来）');

        /* ★★ 退出章节 → 回到作品详情 */
        w.阅读.关编辑器(); await 等(300);

        ok(!容器.classList.contains('写稿中'), '.写稿中 已摘');
        ok(作品.classList.contains('显示'), '作品详情仍在（没被编辑器顺手关掉）');
        ok(容器.classList.contains('编辑中'),
            '★★ .编辑中【保留】—— 作品页还开着、正依赖它；无条件摘就会露出上一界面');
        ok(!可见(w, d.querySelector('.内容区')),
            '★★ 上一界面（作者中心的内容区）仍收起 → 不会透过作品遮罩显出来');
        ok(可见(w, 作品), '★★ 作品详情可见，底下只剩主题背景');
        ok(!可见(w, d.querySelector('.全局白色遮罩')), '★ 白纱已收 → 主题背景不被二次稀释');

        /* 真正关掉作品页，才轮到摘 .编辑中 */
        w.阅读.关作品页(); await 等(250);
        ok(!容器.classList.contains('编辑中'), '★★ 关掉作品页后 .编辑中 才摘掉');
        ok(可见(w, d.querySelector('.内容区')), '★ 回到作者中心，内容区恢复');
        ok(可见(w, d.querySelector('.全局白色遮罩')), '★ 白纱恢复');
    }

    console.log('\n[I] ★ 四条白度全站一致（阅读 / 编辑 / 作者 / 作品）');
    {
        const src = 读('22_yuedu.html');
        const 取白 = 名 => {
            const m = new RegExp('\\.' + 名 + '::(after|before)\\s*\\{[\\s\\S]*?background:\\s*rgba\\(255,\\s*255,\\s*255,\\s*([\\d.]+)\\)').exec(src);
            return m ? m[2] : null;
        };
        for (const 名 of ['阅读遮罩', '编辑遮罩', '作者遮罩', '作品遮罩']) {
            ok(取白(名) === '0.70', '★ ' + 名 + ' 白度 0.70（实际 ' + 取白(名) + '）');
        }
    }

    收尾(errors, '✅ 22_yuedu 编辑界面背景与主题背景统一 全部通过');
})().catch(e => { console.error('脚本异常:', e.message); console.error(e.stack); process.exit(2); });
