/**
 * verify_yuedu_fix.js —— 22_yuedu 本轮三处修复的回归哨兵
 *
 * ① 笔名弹窗：prompt → 底部上滑弹层（与书籍详情同一套 .详情层）
 *      · 弹得开、预填旧笔名、实时字数、空值禁用保存
 *      · 保存后落盘 + 已发布作品作者名一起改
 *      · 点遮罩 / × / 取消 / Esc 都能关，且不落盘
 * ② 编辑界面 BUG
 *      · ★ 只改标题也要刷新「有改动」（原来只置 脏 不刷新，改了没反馈）
 *      · ★ 脏 判定要认标题（原来只认正文，标题草稿重开后显示「已保存」）
 * ③ 背景统一 + 主题背景同步
 *      · ★★ 自定义主题背景真能生效（原来调了不存在的 设()，抛 ReferenceError）
 *      · 阅读器 / 编辑器 / 作者主页 三处白度统一 70%
 *
 * ★ 全部走打桩：IndexedDB 桩、不发真实请求。
 *
 * 用法：PAGES_DIR=/data/workspace/输入适配 node verify_yuedu_fix.js
 */
const path = require('path');
const kit = require(path.join(__dirname, 'testkit.js'));
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));

const 假图 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** 极简 IndexedDB 桩（与 verify_yuedu.js 同款） */
function 装库(win, 仓库) {
    win.indexedDB = {
        open() {
            const 请 = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
            setTimeout(() => {
                const db = {
                    objectStoreNames: { contains: () => true },
                    createObjectStore() {},
                    transaction(表名) {
                        const 存 = 仓库[表名] || (仓库[表名] = {});
                        const 事 = { oncomplete: null, onerror: null, error: null };
                        事.objectStore = () => ({
                            put(记) {
                                const r = { result: null };
                                setTimeout(() => { 存[记.id] = JSON.parse(JSON.stringify(记)); r.result = 记.id; if (事.oncomplete) 事.oncomplete(); }, 0);
                                return r;
                            },
                            get(id) {
                                const r = { result: null };
                                setTimeout(() => { r.result = 存[id] ? JSON.parse(JSON.stringify(存[id])) : undefined; if (r.onsuccess) r.onsuccess(); if (事.oncomplete) 事.oncomplete(); }, 0);
                                return r;
                            },
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
function 输(w, el, v) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); }

function 起(数据, 仓库) {
    return 起页面('22_yuedu.html', 'http://localhost/22.html?from=1', 数据 || {}, errors, '22',
        win => { 装库(win, 仓库 || {}); win.confirm = () => true; });
}

const 书数据 = (笔名) => ({
    '阅读_笔名': 笔名 || '',
    '阅读_平台': JSON.stringify([{
        id: 'my_1', 书名: '测试书', 作者: 笔名 || '旧作者', 发布者: 笔名 || '旧作者',
        章数: 0, 字数: 0, 来源: '平台', 时间: Date.now(),
    }]),
    '阅读_书架': JSON.stringify([{ id: 'my_1', 书名: '测试书', 作者: 笔名 || '旧作者', 来源: '平台' }]),
});

(async function main() {

    console.log('[A] ★★ 笔名弹窗：不再是 prompt，是底部上滑弹层');
    {
        const 源码 = 读('22_yuedu.html');
        /* ★ 必须剥注释：注释里会写「原 prompt 已废」当说明，
             不剥的话这条断言会把教学用的文字判成真调用（假阳性）。 */
        const 净 = 源码.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        ok(!/\bprompt\s*\(/.test(净), '★ ★ 代码里已无 prompt() 调用（改笔名不再用系统弹窗）');
        ok(/<script id="软键盘适配">/.test(源码), '（前置）页面仍内联着软键盘适配');
    }

    console.log('\n[B] ★ 弹层骨架：输入框 / 字数 / 取消 · 保存');
    {
        const 数据 = 书数据('旧笔名');
        const w = await 起(数据); await 等(800);
        const d = w.document;

        ok(!!d.getElementById('笔名遮罩'), '★ 存在 #笔名遮罩');
        ok(!!d.getElementById('笔名输入'), '★ 存在 #笔名输入');
        ok(!!d.getElementById('笔名字数'), '★ 存在字数显示');
        ok(!!d.getElementById('笔名保存') && !!d.getElementById('笔名取消'), '★ 有 取消 / 保存 两个钮');
        ok(d.getElementById('笔名输入').getAttribute('maxlength') === '16', '★ 限长 16');
        ok(!d.getElementById('笔名遮罩').classList.contains('显示'), '初始是收起的');
    }

    console.log('\n[C] ★★ 点「修改」→ 弹开 + 预填旧笔名 + 字数');
    {
        const 数据 = 书数据('旧笔名');
        const w = await 起(数据); await 等(800);
        const d = w.document;

        点(w, d.getElementById('改笔名钮'));
        await 等(100);
        ok(d.getElementById('笔名遮罩').classList.contains('显示'), '★ ★ 弹层已打开');
        ok(d.getElementById('笔名输入').value === '旧笔名', '★ 预填了旧笔名（实际 "' + d.getElementById('笔名输入').value + '"）');
        await 等(280);
        ok(d.getElementById('笔名字数').textContent === '3 / 16',
            '★ 字数正确（实际 ' + d.getElementById('笔名字数').textContent + '）');
        ok(d.getElementById('笔名保存').disabled === false, '★ 有内容 → 保存可用');
    }

    console.log('\n[D] ★ 空值 → 保存禁用 + 报警；只敲空格也算空');
    {
        const 数据 = 书数据('旧笔名');
        const w = await 起(数据); await 等(800);
        const d = w.document;
        点(w, d.getElementById('改笔名钮')); await 等(100);

        输(w, d.getElementById('笔名输入'), '');
        await 等(60);
        ok(d.getElementById('笔名保存').disabled === true, '★ 清空 → 保存禁用');

        输(w, d.getElementById('笔名输入'), '   ');
        await 等(60);
        ok(d.getElementById('笔名保存').disabled === true, '★ ★ 只敲空格 → 仍禁用（trim 后为空）');
        ok(d.getElementById('笔名警').classList.contains('显示'), '★ 空格时给出「不能为空」提示');

        输(w, d.getElementById('笔名输入'), '新笔名');
        await 等(60);
        ok(d.getElementById('笔名保存').disabled === false, '★ 有有效内容 → 恢复可用');
        ok(!d.getElementById('笔名警').classList.contains('显示'), '★ 提示收起');
    }

    console.log('\n[E] ★★ 保存 → 落盘 + 已发布作品作者名一起改 + 弹层关闭');
    {
        const 数据 = 书数据('旧笔名');
        const w = await 起(数据); await 等(800);
        const d = w.document;
        点(w, d.getElementById('改笔名钮')); await 等(100);
        输(w, d.getElementById('笔名输入'), '全新的名字');
        点(w, d.getElementById('笔名保存'));
        await 等(200);

        ok(数据['阅读_笔名'] === '全新的名字', '★ ★ 笔名已落盘（实际 ' + 数据['阅读_笔名'] + '）');
        const 表 = JSON.parse(数据['阅读_平台'] || '[]');
        /* ★ 按 id 找，不能取 [0] —— 平台表里排在最前的是内置的 demo 书。 */
        const 我的 = 表.find(x => x.id === 'my_1');
        ok(!!我的 && 我的.作者 === '全新的名字' && 我的.发布者 === '全新的名字',
            '★ ★ 已发布作品的作者名一起改了（否则「我的作品」里会凭空消失）'
            + '（实际 ' + (我的 ? 我的.作者 + '/' + 我的.发布者 : '找不到 my_1') + '）');
        ok(!d.getElementById('笔名遮罩').classList.contains('显示'), '★ 保存后弹层自动关闭');
    }

    console.log('\n[F] ★ 三种关法：× / 取消 / 点遮罩 / Esc —— 都不落盘');
    {
        for (const [名, 关法] of [
            ['点 ×', (w, d) => 点(w, d.getElementById('笔名关闭'))],
            ['点取消', (w, d) => 点(w, d.getElementById('笔名取消'))],
            ['点遮罩', (w, d) => { const m = d.getElementById('笔名遮罩'); m.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }],
            ['Esc', (w, d) => d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
        ]) {
            const 数据 = 书数据('旧笔名');
            const w = await 起(数据); await 等(800);
            const d = w.document;
            点(w, d.getElementById('改笔名钮')); await 等(100);
            输(w, d.getElementById('笔名输入'), '不该被存下的名字');
            关法(w, d);
            await 等(100);
            ok(!d.getElementById('笔名遮罩').classList.contains('显示'), '★ ' + 名 + ' → 弹层关闭');
            ok(数据['阅读_笔名'] === '旧笔名', '★ ' + 名 + ' → 笔名没被改（仍 ' + 数据['阅读_笔名'] + '）');
        }
    }

    console.log('\n[G] ★★ 编辑 BUG①：只改章节标题 → 状态要变成「有改动」');
    {
        const 仓库 = {};
        const 数据 = 书数据('作者甲');
        const w = await 起(数据, 仓库); await 等(800);
        const d = w.document;

        await w.阅读.开编辑器('my_1');
        await 等(400);
        ok(d.getElementById('编辑保存').textContent === '已保存', '刚进来是「已保存」');

        输(w, d.getElementById('章题输入'), '第一章 新的标题');
        await 等(100);
        ok(d.getElementById('编辑保存').textContent === '有改动',
            '★ ★ 只改标题 → 状态刷新为「有改动」（实际 "' + d.getElementById('编辑保存').textContent + '"）');
    }

    console.log('\n[H] ★★ 编辑 BUG②：只改标题存草稿 → 重开仍显示「有改动」');
    {
        const 仓库 = {};
        const 数据 = 书数据('作者甲');
        const w = await 起(数据, 仓库); await 等(800);
        const d = w.document;

        await w.阅读.开编辑器('my_1'); await 等(400);
        /* 只填标题，正文留空 */
        d.getElementById('正文输入').value = '';
        d.getElementById('正文输入').dispatchEvent(new w.Event('input', { bubbles: true }));
        输(w, d.getElementById('章题输入'), '只有标题的章');
        await 等(80);

        w.阅读.存草稿();
        await 等(200);
        ok(d.getElementById('编辑保存').textContent === '已保存', '存完草稿当下是「已保存」');

        w.阅读.关编辑器(); await 等(150);
        await w.阅读.开编辑器('my_1'); await 等(400);

        ok(d.getElementById('章题输入').value === '只有标题的章',
            '★ 重开后标题是草稿里的（实际 "' + d.getElementById('章题输入').value + '"）');
        ok(d.getElementById('编辑保存').textContent === '有改动',
            '★ ★ 重开显示「有改动」—— 草稿还没发布到书城，不能假装已保存'
            + '（实际 "' + d.getElementById('编辑保存').textContent + '"）');
    }

    console.log('\n[I] ★★ 主题背景：自定义图真能生效（原来调了不存在的 设()）');
    {
        const 记错 = [];
        const 数据 = { '主题背景': JSON.stringify({ 源: '自定义', 数据: 假图 }) };
        const w = await 起页面('22_yuedu.html', 'http://localhost/22.html?from=1', 数据, 记错, '22',
            win => { 装库(win, {}); win.addEventListener('error', e => 记错.push('err:' + (e.error && e.error.message || e.message))); });
        await 等(700);

        const 图 = w.document.querySelector('.主题背景图片');
        ok(!!图 && 图.src === 假图, '★ ★ 自定义主题背景已应用到 <img>（实际 ' + (图 && 图.src || '').slice(0, 28) + '）');
        const 真错 = 记错.filter(e => /err:|window\.error/.test(e));
        ok(真错.length === 0, '★ ★ 不再抛 ReferenceError（实际 ' + (真错.slice(0, 1)[0] || '无') + '）');
    }

    console.log('\n[J] ★ 主题背景：内置索引也能生效（0 保持默认、>0 换图）');
    {
        const 数据0 = { '主题背景': JSON.stringify({ 源: '默认', 索引: 0 }) };
        const w0 = await 起页面('22_yuedu.html', 'http://localhost/22.html?from=1', 数据0, errors, '22', win => 装库(win, {}));
        await 等(600);
        const 图0 = w0.document.querySelector('.主题背景图片');
        /* ★ testkit 的 清理() 会把 src="2【图片】/…" 整段抹成空串（避免 jsdom 去加载素材），
             所以这里不能断言「还等于默认主题背景.png」—— 只能断言脚本没去换图。 */
        ok(!/背景0|背景1/.test(图0.getAttribute('src') || ''),
            '★ 索引 0 → 不换图，保持页面写死的默认（实际 src="' + (图0.getAttribute('src') || '') + '"）');

        const 数据2 = { '主题背景': JSON.stringify({ 源: '默认', 索引: 2 }) };
        const w2 = await 起页面('22_yuedu.html', 'http://localhost/22.html?from=1', 数据2, errors, '22', win => 装库(win, {}));
        await 等(600);
        const 图2 = w2.document.querySelector('.主题背景图片');
        ok(/背景2/.test(图2.getAttribute('src') || ''), '★ 索引 2 → 换成 背景2（实际 ' + (图2.getAttribute('src') || '') + '）');
    }

    console.log('\n[K] ★★ 背景统一：阅读器 / 编辑器 / 作者主页 白度都是 70%');
    {
        const 源码 = 读('22_yuedu.html');
        const 取白 = 名 => {
            const m = new RegExp('\\.' + 名 + '::(after|before)\\s*\\{[\\s\\S]*?background:\\s*rgba\\(255,\\s*255,\\s*255,\\s*([\\d.]+)\\)').exec(源码);
            return m ? m[2] : null;
        };
        const 阅 = 取白('阅读遮罩'), 编 = 取白('编辑遮罩'), 作 = 取白('作者遮罩');
        ok(阅 === '0.70', '★ 阅读器白度 0.70（实际 ' + 阅 + '）');
        ok(编 === '0.70', '★ 编辑器白度 0.70（实际 ' + 编 + '）');
        ok(作 === '0.70', '★ 作者主页白度 0.70（实际 ' + 作 + '）');
        ok(阅 === 编 && 编 === 作, '★ ★ 三处一致 —— 切界面时主题背景不再「忽白忽灰」');
    }

    收尾(errors, '✅ 22_yuedu 三处修复全部通过');
})().catch(e => { console.error('脚本异常:', e.message); console.error(e.stack); process.exit(2); });
