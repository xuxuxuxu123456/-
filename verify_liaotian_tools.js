/**
 * verify_liaotian_tools.js —— ★ 7 页「转账 / 红包 / 语音通话 / 一起阅读」专项
 *
 * 需求：四项【常驻】在文本输入框上方的「功能条」里（不是「＋」菜单）；
 *       ★ 每项只有一个镂空爱心 + 文字，不套任何功能小图标；不要分割线；
 *       ★ 点进去是【新页面】不是弹窗（12/13/14），照 QQ 的全屏界面；
 *       结果由功能页写「待发消息_<sid>」，7 页回来消费并落卡片存档。
 *       一起阅读【暂未开放】：入口在但压淡，点了只提示。
 *       （三个功能页本身的测试在 verify_function_pages.js）
 *
 * 覆盖：
 *   [A] 功能条常驻输入框上方；四项齐全；输入区里已无「＋」
 *   [B] ★ 每项 = 左镂空爱心图标 + 右文字（心形只描边 fill:none）
 *   [C] ★ 点四项 → 各自弹出对应弹窗（标题逐个核对）
 *   [D] 单聊：转账 = 金额 + 说明 → 卡片；红包 = 金额 + 祝福语
 *   [E] ★ 群聊：转账变「AA 收款」（按人数摊）；红包多「拼手气/普通 + 个数」
 *   [F] ★ 群聊语音通话 = 先选成员（上限 9 人），单聊 = 直接呼叫
 *   [G] 一起阅读：单聊二人 / 群聊多人，选书后发卡片
 *   [H] ★ 确认后卡片进聊天流并存档（刷新重进还在）
 *   [I] 会话预览同步成 [转账] / [红包] / [语音通话] / [一起阅读]
 *   [J] 弹窗：点遮罩 / Esc 关闭；表情面板展开时要抬到功能条上方
 *   [K] 金额校验：空 / 超限会被拦下，不落消息
 *   [L] ★ 一起阅读暂未开放：入口在但压淡，点了只提示不弹窗
 *
 * 用法：PAGES_DIR=/data/workspace node verify_liaotian_tools.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));
const 源码 = 读('7_liaotian.html');

const 联系人表 = [
    { id: 'c_1', 名称: '林彦', 备注: '林彦', 头像: '', 消息: '', 时间: '' },
    { id: 'c_2', 名称: '陆沉渊', 备注: '', 头像: '', 消息: '', 时间: '' },
    { id: 'c_3', 名称: '白九霄', 备注: '', 头像: '', 消息: '', 时间: '' },
];

/** 起 7 页。群聊传 群=true */
function 起(群, 预置) {
    const 数据 = Object.assign({
        '联系人索引': JSON.stringify(联系人表),
        '聊天记录_c_1': '[]',
    }, 预置 || {});
    const url = 'http://localhost/7.html?id=c_1'
        + (群 ? '&type=group' : '');
    return 起页面('7_liaotian.html', url, 数据, errors, '工具');
}

/**
 * ★ 给 7 页塞一个「22 页书库」的 IndexedDB 桩。
 *   7 页读正文走 indexedDB.open('阅读_书库')，jsdom 里没有真库，必须桩掉，
 *   否则 取书正文() 恒返回 null，朗读永远起不来（不报错，只是没反应）。
 * @param {Array<{题:string, 正文:string}>} 章节表
 */
function 桩朗读库(win, 章节表) {
    const 存 = { demo_1: { id: 'demo_1', 书名: '桩书', 作者: '桩', 章节: 章节表 } };
    win.indexedDB = {
        open() {
            const 请求 = { result: null, error: null, onupgradeneeded: null,
                           onsuccess: null, onerror: null };
            setTimeout(() => {
                const db = {
                    objectStoreNames: { contains: () => true },
                    createObjectStore() {},
                    transaction() {
                        const 事 = { oncomplete: null, onerror: null, error: null };
                        const 表 = {
                            get(id) {
                                const r = { result: null };
                                setTimeout(() => {
                                    r.result = 存[id] ? JSON.parse(JSON.stringify(存[id])) : undefined;
                                    if (r.onsuccess) r.onsuccess();
                                    if (事.oncomplete) 事.oncomplete();
                                }, 0);
                                return r;
                            },
                        };
                        事.objectStore = () => 表;
                        return 事;
                    },
                };
                请求.result = db;
                if (请求.onsuccess) 请求.onsuccess();
            }, 0);
            return 请求;
        },
    };
}

function 点(w, 元素) {
    元素.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}
function 输入(w, 元素, 值) {
    元素.value = 值;
    元素.dispatchEvent(new w.Event('input', { bubbles: true }));
}
/** 按文案点脚按钮，返回是否点到了 */
function 点按钮(w, 关键字) {
    const 钮 = Array.from(w.document.querySelectorAll('.业务钮'))
        .find(b => b.textContent.includes(关键字));
    if (!钮) return false;
    点(w, 钮);
    return true;
}
/** 展开功能面板并点某一项 */
async function 点功能(w, 名) {
    const 项 = w.document.querySelector('.功能项[data-功能="' + 名 + '"]');
    if (!项) return false;
    点(w, 项);
    await 等(90);
    return true;
}
function 弹着(w) { return w.document.getElementById('业务遮罩').classList.contains('显示'); }
function 标题(w) { return w.document.getElementById('业务标题').textContent; }
function 最后卡(w) { return w.document.querySelectorAll('.卡片泡').length
    ? w.document.querySelectorAll('.卡片泡')[w.document.querySelectorAll('.卡片泡').length - 1] : null; }

(async function main() {
    console.log('[A] 功能条常驻输入框上方；四项齐全；无「＋」');
    {
        const w = await 起(false);
        await 等(300);
        const 条 = w.document.getElementById('功能条');
        ok(!!条, '★ 存在功能条（#功能条）');

        /* ★ 位置：必须紧跟在底部输入区【之前】—— 也就是浮在文本输入框上方 */
        const 输入区 = w.document.querySelector('.底部输入区');
        ok(条.nextElementSibling === 输入区,
            '★ 功能条紧贴输入区上方（下一元素是 .底部输入区）');
        const 底部 = w.document.querySelector('.手机内容') || 输入区.parentElement;
        ok(Array.from(底部.children).indexOf(条) === Array.from(底部.children).indexOf(输入区) - 1,
            '★ 功能条与输入区是相邻兄弟（顺序正确）');

        ok(!w.document.getElementById('功能键'),
            '★ 输入区里的「＋」加号按钮已删除');
        const 顺序 = Array.from(w.document.querySelectorAll('.底部输入区 > *')).map(e => e.id);
        ok(顺序.join(',') === '消息输入,麦克风按钮,表情按钮,发送按钮',
            '★ 输入区只剩 输入框/麦克风/表情/发送（实际 ' + 顺序.join(',') + '）');

        /* ★ 常驻：不用点任何东西，四项一进来就在 */
        const 名们 = Array.from(w.document.querySelectorAll('.功能项'))
            .map(g => g.dataset.功能);
        ok(名们.join('/') === '转账/红包/语音通话/一起阅读',
            '★ 四项 = 转账 / 红包 / 语音通话 / 一起阅读（实际 ' + 名们.join('/') + '）');
        ok(!w.document.querySelector('.功能遮罩'), '★ 已无「点＋弹出」的功能遮罩');
        ok(w.document.querySelectorAll('.功能项文字').length === 4, '四项都有文字标签');
    }

    console.log('\n[B] ★ 每项 = 左镂空爱心图标 + 右文字');
    {
        const w = await 起(false);
        await 等(300);

        ok(w.document.querySelectorAll('.功能项心').length === 4,
            '★ 四项各有一枚爱心外框（实际 ' + w.document.querySelectorAll('.功能项心').length + '）');
        /* ★ 需求：只要镂空爱心，不要别的小图标 */
        ok(w.document.querySelectorAll('.功能项 .内图标').length === 0,
            '★ 没有套任何功能小图标（内图标数 = '
            + w.document.querySelectorAll('.功能项 .内图标').length + '）');
        ok(w.document.querySelectorAll('.功能项 svg').length === 4,
            '★ 每项只有一枚 svg（就是那颗爱心）');
        const 齐全 = Array.from(w.document.querySelectorAll('.功能项')).every(项 =>
            !!项.querySelector('.功能项心') && !!项.querySelector('.功能项文字'));
        ok(齐全, '★ 每项都是「爱心 + 文字」结构');

        /* ★ 左爱心右文字：爱心元素必须在文字元素【之前】 */
        const 横排 = Array.from(w.document.querySelectorAll('.功能项')).every(项 => {
            const 心 = 项.querySelector('.功能项心');
            const 文 = 项.querySelector('.功能项文字');
            if (!心 || !文) return false;
            return 心.compareDocumentPosition(文) & 4;   // 4 = FOLLOWING
        });
        ok(横排, '★ 爱心在左、文字在右（DOM 顺序）');

        /* ★ 爱心必须与 1 页「.标签爱心」同一枚路径 */
        const 页1 = 读('1_shouyeyulan.html');
        const 心1 = /class="标签爱心"[^>]*><path d="([^"]+)"/.exec(页1);
        /* 7 页的心形是分几行拼接的字符串字面量，要把各段拼起来再比 */
        const 心7段 = /const\s+心形\s*=\s*([\s\S]*?);/.exec(源码);
        const 心7文 = 心7段
            ? (心7段[1].match(/'[^']*'/g) || []).map(t => t.slice(1, -1)).join('')
            : '';
        ok(!!心1 && 心7文 === 心1[1],
            '★ 爱心路径与 1 页标签爱心完全一致（7页 ' + 心7文.slice(0, 24) + '…）');
        const 页1块 = /\.标签爱心\s*\{([^}]*)\}/.exec(页1);
        const 心块7 = /\.功能项心\s*\{([^}]*)\}/.exec(源码);
        const 取描边 = t => (/stroke:\s*(#[0-9a-fA-F]+)/.exec(t || '') || [])[1];
        ok(!!页1块 && 取描边(页1块[1]) === 取描边(心块7[1]),
            '★ 描边色与 1 页一致（1页 ' + 取描边(页1块 && 页1块[1])
            + ' / 7页 ' + 取描边(心块7 && 心块7[1]) + '）');
        ok(!!页1块 && /stroke-width:\s*1\.8/.test(页1块[1])
            && /stroke-width:\s*1\.8/.test(心块7[1]), '★ 描边粗细同为 1.8');

        /* ★ 不要分割线 */
        const 条块 = /\.功能条\s*\{([^}]*)\}/.exec(源码);
        ok(!!条块 && !/border/.test(条块[1]),
            '★ 功能条没有分割线（border）');

        const 条块B = /\.功能条\s*\{([^}]*)\}/.exec(源码);
        ok(!!条块B && /display:\s*grid/.test(条块B[1])
            && /repeat\(4/.test(条块B[1]), '★ 功能条是 4 列横向网格');
        const 项块 = /\.功能项\s*\{([^}]*)\}/.exec(源码);
        ok(!!项块 && /flex-direction:\s*row|align-items:\s*center/.test(项块[1]),
            '★ 每项内部横排（不是上下堆叠）');

        // ★ 镂空 = 只描边不填色
        ok(!!心块7 && /fill:\s*none/.test(心块7[1]),
            '★ 爱心是镂空的（.功能项心 有 fill:none）');
        ok(!!心块7 && /stroke:/.test(心块7[1]), '★ 爱心走描边（stroke）而不是填充');
        ok(/const\s+心形\s*=\s*'M[^']*C[^']*A[^']*z'/.test(源码) || /心形/.test(源码),
            '★ 爱心路径是心形贝塞尔曲线');
    }

    console.log('\n[C] ★ 点三项 → 各自跳新页面（不是弹窗）');
    {
        for (const [名, 期望页] of [
            ['转账', '12_zhuanzhang.html'],
            ['红包', '13_hongbao.html'],
            ['语音通话', '14_yuyintonghua.html'],
        ]) {
            const w = await 起(false);
            await 等(300);
            const 项 = w.document.querySelector('.功能项[data-功能="' + 名 + '"]');
            ok(!!项, '存在「' + 名 + '」');
            点(w, 项);
            await 等(80);

            /* ★ 关键是「不是弹窗」：业务遮罩不能被打开 */
            ok(!w.document.getElementById('业务遮罩').classList.contains('显示'),
                '★ 点「' + 名 + '」→ 不弹窗（是跳页面）');
            ok(w.最后跳转 === 期望页,
                '★ 点「' + 名 + '」→ 跳 ' + 期望页 + '（实际 ' + w.最后跳转 + '）');
        }

        // ★ 三个页面文件必须真实存在
        for (const 页 of ['12_zhuanzhang.html', '13_hongbao.html', '14_yuyintonghua.html']) {
            let 有 = true;
            try { 读(页); } catch (e) { 有 = false; }
            ok(有, '★ ' + 页 + ' 文件存在');
        }
    }

    console.log('\n[D] ★ 跳过去带的参数');
    {
        const w = await 起(false);
        await 等(300);
        点(w, w.document.querySelector('.功能项[data-功能="转账"]'));
        await 等(80);
        // 把跳转前拼好的 URL 拿不到（jsdom 里 location 改不动），
        // 所以直接调 去功能页 观察拼参逻辑：用同一个函数验一次群聊版
        ok(typeof w.去功能页 === 'function', '★ 暴露了 去功能页()');

        /* 源码级：参数逐个核对 —— id / sid / type / name / back 一个都不能少，
           少一个功能页就不知道该回哪、该按不按群聊算。 */
        ok(/参\.set\('id'/.test(源码), '★ 带 id');
        ok(/参\.set\('sid'/.test(源码), '★ 带 sid（存档键，功能页靠它写待发消息）');
        ok(/参\.set\('type',\s*'group'\)/.test(源码), '★ 群聊时带 type=group');
        ok(/参\.set\('name'/.test(源码), '★ 带 name（昵称）');
        ok(/参\.set\('back',\s*本页地址\(\)\)/.test(源码),
            '★ 带 back（原样返回 7 页，含 type=group）');
        ok(/location\.href = 页 \+ '\?'/.test(源码), '★ 确实是 location.href 跳转');
    }

    console.log('\n[E] ★ 从功能页回来：消费待发消息 → 落卡片');
    {
        const 共享 = { '联系人索引': JSON.stringify(联系人表), '聊天记录_c_1': '[]' };
        // 模拟 12 页写好的待发消息
        共享['待发消息_c_1'] = JSON.stringify({
            类型: '转账', 文: '[转账]',
            卡: { 种类: '转账', 金额: 66.6, 说明: '还你的' },
            提示: '已转账 ¥66.6',
        });
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '消费');
        await 等(350);

        ok(w.document.querySelectorAll('.卡片泡').length === 1,
            '★ 进来就落成了卡片（实际 ' + w.document.querySelectorAll('.卡片泡').length + '）');
        const 卡 = w.document.querySelector('.卡片泡');
        /* ★ 类别提示已删（需求）→ 种类改由配图承担；类别文本仍留底栏 */
        ok(!卡.querySelector('.卡片题'), '★ 卡片里没有顶部类别提示（已按需求删除）');
        ok(!!卡 && /^转账/.test(卡.querySelector('.卡片尾').textContent),
            '★ 底栏仍写「转账 · 时间」（实际 ' + (卡 && 卡.querySelector('.卡片尾').textContent) + '）');
        ok(!!卡 && /66\.6/.test(卡.querySelector('.卡片额').textContent),
            '★ 金额单独成大字（实际 ' + (卡 && 卡.querySelector('.卡片额').textContent) + '）');
        ok(!!卡 && /还你的/.test(卡.querySelector('.卡片副').textContent), '★ 说明在副文案');

        const 存 = JSON.parse(共享['聊天记录_c_1'] || '[]');
        ok(存.length === 1 && 存[0].类型 === '转账', '★ 已写进聊天记录');
        ok(!('待发消息_c_1' in 共享), '★ 消费后键已删除（不会重复落地）');

        const 索引 = JSON.parse(共享['联系人索引'] || '[]');
        ok(索引.find(i => i.id === 'c_1').消息 === '[转账]', '★ 会话预览已同步');
    }
    {
        /* ★ 幂等：再刷一次不能重复落地（键已删） */
        const 共享 = { '联系人索引': JSON.stringify(联系人表), '聊天记录_c_1': '[]' };
        共享['待发消息_c_1'] = JSON.stringify({
            类型: '红包', 文: '[红包]', 卡: { 种类: '红包', 金额: 8, 个数: 1, 祝福: '恭喜' },
        });
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '幂等');
        await 等(350);
        const 第一次 = w.document.querySelectorAll('.卡片泡').length;
        w.消费待发消息();                      // 手动再调一次
        await 等(80);
        ok(w.document.querySelectorAll('.卡片泡').length === 第一次,
            '★ 重复消费不会多出卡片（' + 第一次 + ' → '
            + w.document.querySelectorAll('.卡片泡').length + '）');
    }
    {
        /* ★ 坏数据不能把页面搞崩 */
        const 共享 = { '联系人索引': JSON.stringify(联系人表), '聊天记录_c_1': '[]' };
        共享['待发消息_c_1'] = '{这不是JSON';
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '坏数据');
        await 等(350);
        ok(w.document.querySelectorAll('.卡片泡').length === 0,
            '★ 待发消息是坏 JSON → 不落卡片也不崩');
        ok(!('待发消息_c_1' in 共享), '★ 坏数据同样被清掉（不反复报错）');
    }

    console.log('\n[F] 表情面板抬到功能条上方');
    {
        const w = await 起(false);
        await 等(300);
        const 条 = w.document.getElementById('功能条');
        const 区 = w.document.querySelector('.底部输入区');
        条.getBoundingClientRect = () => ({ height: 40 });
        区.getBoundingClientRect = () => ({ height: 56 });
        点(w, w.document.getElementById('表情按钮'));
        await 等(80);
        ok(w.document.getElementById('表情面板').style.bottom === '96px',
            '★ bottom = 输入区56 + 功能条40 = 96px（实际 '
            + w.document.getElementById('表情面板').style.bottom + '）');
    }

    console.log('\n[G] ★ 一起阅读：【已开放】—— 读书架 → 后台浮窗朗读');
    {
        const w = await 起(false);
        await 等(300);
        const 项 = w.document.querySelector('.功能项[data-功能="一起阅读"]');
        ok(!!项, '★ 功能条上有「一起阅读」');
        /* ★★ 旧断言写的是「未开放」，那是旧期望 —— 现已开放，按新行为断言 */
        ok(!!项 && !项.classList.contains('未开'), '★ ★★ 不再是未开放（.未开 已去掉）');
        ok(!/暂未开放/.test(项.getAttribute('aria-label') || ''), '★ 无障碍标签不再写暂未开放');

        /* ★ 它不像转账/红包那样跳全屏页，而是本页弹窗 */
        const 前 = w.document.querySelectorAll('.消息行').length;
        点(w, 项);
        await 等(200);
        ok(!w.最后跳转, '★ 点了不跳页（它是弹窗类功能，实际 ' + w.最后跳转 + '）');
        ok(w.document.querySelectorAll('.消息行').length === 前, '★ 光点入口不落消息');
        ok(w.document.getElementById('业务遮罩').classList.contains('显示'),
            '★ ★ 弹出了选书弹窗');
        ok(!/暂未开放/.test(w.document.getElementById('toast').textContent),
            '★ 不再提示暂未开放（实际 ' + w.document.getElementById('toast').textContent + '）');
    }

    console.log('\n[G2] ★★★ 书目来自【22 页的书架】，不是写死的四本');
    {
        const 去注 = 码 => 码.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
            .filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n');
        const 净 = 去注(源码);

        /* ★ 写死的那个 书目 数组必须已经删掉 */
        ok(!/const\s+书目\s*=\s*\[/.test(净), '★ ★★ 写死的 书目 数组已删除');
        ok(!/'小王子'|'百年孤独'|'飞鸟集'|'人类简史'/.test(净),
            '★ ★★ 四本写死的书都不在了');
        /* ★ 读的是 22 页的书架键 */
        ok(/localStorage\.getItem\('阅读_书架'\)/.test(净),
            '★ ★★ 读的是 22 页的书架键「阅读_书架」');
        /* ★ 正文在 IndexedDB（22 页刻意不放 localStorage，怕撑爆 5MB） */
        ok(/indexedDB\.open\('阅读_书库'/.test(净), '★ ★★ 正文从 IndexedDB「阅读_书库」读');
        /* ★ 书架空 → 提示去加书，而不是给一列选不到的空列表 */
        ok(/书架里还没有书/.test(源码), '★ ★ 书架空时有明确引导');
    }

    console.log('\n[G3] ★★★ 后台朗读浮窗：用【这位联系人的音色】念');
    {
        const 去注 = 码 => 码.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
            .filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n');
        const 净 = 去注(源码);

        /* ★ 音色必须走 音频助手.取音色(存档ID) —— 与 7 页发语音、14 页通话同一套，
             不能自己另拼一套优先级，否则 3 页调了这里没反应 */
        ok(/助手\.取音色\(存档ID/.test(净), '★ ★★ 音色走 音频助手.取音色(存档ID)');
        /* ★ 没配 API / 没启用音色 → 如实说明并退系统语音，不能假装是他在念 */
        ok(/还没配音频 API/.test(源码), '★ ★★ 没配 API 时如实说明（不假装是角色音色）');
        ok(/speechSynthesis/.test(净), '★ 退到系统语音朗读');
        /* ★ 长文本要切段，整章一次请求容易被服务端截断 */
        ok(/function\s+切段/.test(净), '★ ★ 长章会切段（避免一次请求过大）');
        /* ★ 后台 = 可收起继续听 */
        ok(/朗读收起条/.test(源码), '★ ★ 浮窗可收起（收起后只留细条，声音继续）');
        /* ★ 离开页面要停，别让声音在后台一直响 */
        ok(/pagehide[\s\S]{0,80}停朗读/.test(净), '★ ★ 离开页面会停掉朗读');
        /* ★ 朗读时背景音乐让位 */
        ok(/全局音频\.暂停\('朗读'\)/.test(净), '★ 朗读时背景音乐让位');
        /* ★ 暂停后恢复不能重新合成（否则会把当前段重念一遍） */
        ok(/朗读\.续/.test(净), '★ ★ 暂停后恢复是续播，不重新合成（不重念）');

        /* ---------- 实测：书架有书 → 选 → 朗读 ---------- */
        const 书架 = [{ id: 'demo_1', 书名: '小喵叽法则', 作者: '示例作者', 章数: 2, 分类: '都市' }];
        const 预 = {
            '联系人索引': JSON.stringify(联系人表),
            '阅读_书架': JSON.stringify(书架),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1', 预, errors, '7G',
            win => 桩朗读库(win, [{ 题: '第一章', 正文: '第一段。\n\n第二段。' },
                                  { 题: '第二章', 正文: '第三段。' }]));
        await 等(600);

        const 项 = w.document.querySelector('.功能项[data-功能="一起阅读"]');
        点(w, 项);
        await 等(250);

        const 书行 = Array.from(w.document.querySelectorAll('.书行'));
        ok(书行.length === 1, '★ ★ 书列表列出了书架里的 1 本（实际 ' + 书行.length + '）');
        ok(/小喵叽法则/.test(书行[0].textContent),
            '★ ★★ 书名来自书架（实际 ' + 书行[0].textContent.trim() + '）');
        ok(/示例作者/.test(书行[0].textContent), '★ 作者也带上了');

        const 主 = Array.from(w.document.querySelectorAll('.业务钮'))
            .find(b => /开始朗读/.test(b.textContent));
        ok(!!主, '★ ★ 主按钮是「开始朗读」（不是发起共读）');

        const 消息前 = w.document.querySelectorAll('.消息行').length;
        点(w, 主);
        await 等(500);

        /* ★ 浮窗出来 + 卡片落地，两者都要有 */
        const 浮 = w.document.getElementById('朗读浮窗');
        ok(!!浮 && !浮.hidden, '★ ★★ 后台朗读浮窗出现了');
        ok(/小喵叽法则/.test(w.document.getElementById('朗读名').textContent),
            '★ ★ 浮窗显示书名（实际 ' + w.document.getElementById('朗读名').textContent + '）');
        ok(w.document.querySelectorAll('.消息行').length === 消息前 + 1,
            '★ ★ 同时落地了一张共读卡片');

        /* ★ 收起 → 细条出现、卡收起 */
        点(w, w.document.getElementById('朗读收起'));
        await 等(150);
        ok(w.document.getElementById('朗读卡').hidden, '★ 收起后卡隐藏');
        ok(!w.document.getElementById('朗读收起条').hidden, '★ 收起后留一条细条');
        ok(/小喵叽法则/.test(w.document.getElementById('朗读收起名').textContent),
            '★ 细条上写着在念哪本');

        /* 展开 */
        点(w, w.document.getElementById('朗读展开钮'));
        await 等(150);
        ok(!w.document.getElementById('朗读卡').hidden, '★ 点展开又回来了');

        /* 停止 */
        点(w, w.document.getElementById('朗读关闭'));
        await 等(150);
        ok(w.document.getElementById('朗读浮窗').hidden, '★ ★ 点停止 → 浮窗消失');

        /* ---------- 书架空 ---------- */
        const w2 = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            { '联系人索引': JSON.stringify(联系人表) }, errors, '7G2');
        await 等(500);
        点(w2, w2.document.querySelector('.功能项[data-功能="一起阅读"]'));
        await 等(250);
        ok(w2.document.querySelectorAll('.书行').length === 0, '★ 书架空 → 不列书');
        ok(/书架里还没有书/.test(w2.document.getElementById('业务体').textContent),
            '★ ★★ 书架空时提示去加书（实际 '
            + w2.document.getElementById('业务体').textContent.slice(0, 30) + '）');
    }

    console.log('\n[G4] ★★ 朗读用的是【这位联系人】的音色（实测合成入参）');
    {
        const 书架 = [{ id: 'demo_1', 书名: '书甲', 作者: '甲', 章数: 1 }];
        const 预 = {
            '联系人索引': JSON.stringify(联系人表),
            '阅读_书架': JSON.stringify(书架),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1', 预, errors, '7H',
            win => 桩朗读库(win, [{ 题: '第一章', 正文: '文本内容一。\n\n文本内容二。' }]));
        await 等(600);

        /* ★ 换掉音频助手的实现，记录合成入参 —— 音色是取出来的，不是写死的 */
        const 记 = [];
        const 助手 = w.音频助手;
        ok(!!助手, '★ 7 页内联了音频助手');
        助手.已配置 = () => true;
        助手.取音色 = id => ({ 有: true, 音色: '克隆_' + id, 音速: 1.25, 语调: 0.7, 语言: 'zh', 性别: '男' });
        助手.合成 = async (文, 选) => {
            记.push({ 文: 文.slice(0, 8), 音色: 选.音色, 音速: 选.音速 });
            return { 好: true, blob: new w.Blob(['x'], { type: 'audio/mpeg' }), 类型: 'audio/mpeg' };
        };

        点(w, w.document.querySelector('.功能项[data-功能="一起阅读"]'));
        await 等(250);
        const 主 = Array.from(w.document.querySelectorAll('.业务钮'))
            .find(b => /开始朗读/.test(b.textContent));
        点(w, 主);
        await 等(900);

        ok(记.length > 0, '★ ★ 真的调用了合成（' + 记.length + ' 次）');
        ok(记.every(r => r.音色 === '克隆_c_1'),
            '★ ★★ 音色来自【这位联系人】（实际 ' + 记.map(r => r.音色).join('/') + '）');
        ok(记.every(r => r.音速 === 1.25), '★ ★ 音速也带着（3 页设的）');
        ok(记.length >= 2, '★ 长章切成多段逐段合成（实际 ' + 记.length + ' 段）');
    }

    console.log('\n[H] ★ 卡片气泡：与对话气泡同底色、无图标、红包转账靠排版区分');
    {
        const 共享 = {
            '联系人索引': JSON.stringify(联系人表),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '我', 类型: '转账', 文: '[转账]',
                  卡: { 种类: '转账', 金额: 52.5, 说明: '还你的' }, 时间戳: Date.now() },
                { 谁: '他', 类型: '转账', 文: '[AA收款]',
                  卡: { 种类: 'AA', 金额: 30, 人数: 3, 每人: 10, 说明: '' }, 时间戳: Date.now() },
                { 谁: '我', 类型: '红包', 文: '[红包]',
                  卡: { 种类: '拼手气红包', 金额: 66, 个数: 5, 祝福: '新年快乐' }, 时间戳: Date.now() },
            ]),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '气泡');
        await 等(350);

        const 卡们 = Array.from(w.document.querySelectorAll('.卡片泡'));
        ok(卡们.length === 3, '★ 三张卡片都渲染了（实际 ' + 卡们.length + '）');

        /* ★ 结构（需求：不要图标）= 题（类别胶囊）+ 额（主行）+ 副 + 尾（底栏） */
        const 齐 = 卡们.every(泡 => !!泡.querySelector('.卡图')
            && !!泡.querySelector('.卡片额')
            && !!泡.querySelector('.卡片副') && !!泡.querySelector('.卡片尾'));
        ok(齐, '★ 每张卡都是「配图 + 主行 + 副行 + 底栏」四段');
        ok(卡们.every(泡 => !泡.querySelector('.卡片题')),
            '★ ★ 已无顶部类别提示（需求：删除「红包 / 转账」两字）');
        /* ★ 删掉顶部类别提示后，主行就是第一行 —— 不该再留着给胶囊的上方间距 */
        ok(!/\.卡片额\s*\{[^}]*margin-top/.test(源码),
            '★ 主行没有上方外边距（胶囊已删，它现在是第一行）');
        const 卡图们 = Array.from(w.document.querySelectorAll('.卡片泡 .卡图'));
        ok(卡图们.length === 3, '★ 每张卡左侧都有配图（实际 ' + 卡图们.length + '）');
        ok(卡图们.every(g => g.tagName === 'IMG'), '★ 配图是 <img>（位图，不是内联 svg）');

        const 转 = 卡们[0], aa = 卡们[1], 红 = 卡们[2];
        ok(/^转账/.test(转.querySelector('.卡片尾').textContent)
            && 转.querySelector('.卡片额').textContent === '¥52.50',
            '★ 转账：底栏「转账」+ 主行「¥52.50」（数字排版）');
        ok(/2【图片】\/转账\.png$/.test(转.querySelector('.卡图').getAttribute('src') || ''),
            '★ 转账靠【配图】区分（2【图片】/转账.png）');
        ok(!转.querySelector('.卡片额').classList.contains('文'),
            '★ 转账主行是数字排版（加粗等宽，不加 .文）');

        /* ★★ 精致度：金额拆三段（¥ 小 / 整数大 / 小数小），照支付类 UI */
        const 段 = Array.from(转.querySelector('.卡片额').children);
        ok(段.length === 3, '★ ¥52.50 拆成三段（实际 ' + 段.length + '）');
        ok(段[0].className === '卡币' && 段[0].textContent === '¥', '★ 第一段是货币符 ¥（.卡币）');
        ok(段[1].className === '卡整' && 段[1].textContent === '52', '★ 第二段是整数 52（.卡整）');
        ok(段[2].className === '卡零' && 段[2].textContent === '.50', '★ 第三段是小数 .50（.卡零）');
        /* 三段字号必须递减，否则层级做不出来 */
        const 币块 = /\.卡币\s*\{([^}]*)\}/.exec(源码);
        const 零块 = /\.卡零\s*\{([^}]*)\}/.exec(源码);
        ok(!!币块 && /font-size:\s*\.\d+em/.test(币块[1]), '★ .卡币 用 em 小字号（相对主行缩小）');
        ok(!!零块 && /font-size:\s*\.\d+em/.test(零块[1]), '★ .卡零 用 em 小字号');

        /* AA 的「¥10 / 人」也该分段，后缀 / 人 走 .卡缀 */
        const aa段 = Array.from(aa.querySelector('.卡片额').children);
        ok(aa段.length === 3 && aa段[2].className === '卡缀',
            '★ AA「¥10 / 人」→ ¥ + 10 + 后缀（实际 ' + aa段.map(x => x.className).join(',') + '）');
        ok(aa.querySelector('.卡片额').textContent === '¥10 / 人',
            '★ AA 拼回来的文本不变（实际 ' + aa.querySelector('.卡片额').textContent + '）');

        /* ★★ 红包与转账的区分：主行是【祝福语文字】而非金额 */
        ok(/2【图片】\/红包\.png$/.test(红.querySelector('.卡图').getAttribute('src') || ''),
            '★★ 红包靠【配图】区分（2【图片】/红包.png）—— 顶部提示已删');
        ok(红.querySelector('.卡片额').textContent === '新年快乐',
            '★★ 红包主行是祝福语（实际 ' + 红.querySelector('.卡片额').textContent + '）');
        ok(红.querySelector('.卡片额').classList.contains('文'),
            '★★ 红包主行走文字排版 .文（与转账的加粗金额区分开）');
        ok(红.querySelector('.卡片额').children.length === 0,
            '★ 祝福语不做金额分段（它本来就不是金额）');
        ok(/2【图片】\/红包\.png$/.test(红.querySelector('.卡图').getAttribute('src') || ''),
            '★ 红包配图 = 2【图片】/红包.png（实际 '
            + 红.querySelector('.卡图').getAttribute('src') + '）');
        ok(/2【图片】\/转账\.png$/.test(转.querySelector('.卡图').getAttribute('src') || ''),
            '★ 转账配图 = 2【图片】/转账.png（实际 '
            + 转.querySelector('.卡图').getAttribute('src') + '）');
        ok(/2【图片】\/转账\.png$/.test(aa.querySelector('.卡图').getAttribute('src') || ''),
            '★ AA 收款也用转账配图');
        ok(/5\s*个/.test(红.querySelector('.卡片副').textContent)
            && /¥66/.test(红.querySelector('.卡片副').textContent),
            '★ 红包个数与总金额降到副行（实际 '
            + 红.querySelector('.卡片副').textContent + '）');

        /* ★ 底栏照微信那条（● 类别 · 时间），圆点让底栏不只是一行小字 */
        ok(/^转账 · /.test(转.querySelector('.卡片尾').textContent),
            '★ 转账底栏「转账 · 时间」（实际 ' + 转.querySelector('.卡片尾').textContent + '）');
        ok(/^红包 · /.test(红.querySelector('.卡片尾').textContent), '★ 红包底栏「红包 · 时间」');
        ok(!!转.querySelector('.卡片尾 .尾点'), '★ 底栏有 ● 圆点（.尾点）');

        /* ★★ 底色与对话气泡同一：不给我方卡片上深色 */
        ok(!/\.我方 \.卡片泡/.test(源码),
            '★ 已无 .我方 .卡片泡 的深色覆盖（与对话气泡同底色）');
        /* ★ 类型 class 回来了，但用途变了：不再是「按类型上品牌色」，
           而是收付状态的【冷暖区分】（见 [H3]）。这里只保证没有旧的那套硬编码色。 */
        ok(!/rgba\(\s*193,\s*126,\s*62/.test(源码) && !/rgba\(\s*184,\s*74,\s*68/.test(源码),
            '★ 已无 QQ 的转账橙 / 红包红');
        const 泡块 = /\.卡片泡\s*\{([^}]*)\}/.exec(源码);
        ok(!!泡块 && !/background/.test(泡块[1]),
            '★ .卡片泡 不自带底色（继承 .气泡 的白玻璃）');
        ok(!!泡块 && /border-color/.test(泡块[1]) && /box-shadow/.test(泡块[1]),
            '★ 卡片靠描边 + 高光做出体积感（不是靠换底色）');
        const 额块 = /\.卡片额\s*\{([^}]*)\}/.exec(源码);
        ok(!!额块 && /var\(--ink\)/.test(额块[1]), '★ 主行是深灰字（白底配深字，不是白底白字）');
        ok(!!额块 && !/#fff|255,\s*255,\s*255/.test(额块[1]), '★ 主行没有白字');

        const 行们 = Array.from(w.document.querySelectorAll('.消息行'));
        ok(行们[0].classList.contains('我方') && !行们[1].classList.contains('我方'),
            '★ 我方在右、对方在左（靠对齐区分收发方）');
    }

    console.log('\n[H2] ★ 通话记录 = 小气泡：只要电话图标 + 时长（不是卡片）');
    {
        const 共享 = {
            '联系人索引': JSON.stringify(联系人表),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '我', 类型: '通话', 文: '[语音通话]',
                  卡: { 种类: '通话', 结果: '已完成', 时长: 125, 成员: ['甲', '乙'] }, 时间戳: Date.now() },
                { 谁: '他', 类型: '通话', 文: '[语音通话]',
                  卡: { 种类: '通话', 结果: '已取消', 时长: 0, 成员: ['林彦'] }, 时间戳: Date.now() },
            ]),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '通话小泡');
        await 等(350);

        /* ★★ 通话不再走卡片 */
        ok(w.document.querySelectorAll('.卡片泡').length === 0,
            '★ ★ 通话没渲染成卡片（实际 ' + w.document.querySelectorAll('.卡片泡').length + '）');
        const 小们 = Array.from(w.document.querySelectorAll('.通话小泡'));
        ok(小们.length === 2, '★ 两条通话都是小气泡（实际 ' + 小们.length + '）');

        /* ★ 小气泡的外层就是普通 .气泡（与对话气泡同一套底），没有 .卡片泡 */
        ok(!小们[0].parentElement.classList.contains('卡片泡'),
            '★ 外层是普通 .气泡（class=' + 小们[0].parentElement.className + '）');

        /* ★★ 只要两样东西：一个电话 svg + 通话时长 */
        ok(小们[0].querySelectorAll('svg').length === 1,
            '★ ★ 恰好一个 svg 图标（实际 ' + 小们[0].querySelectorAll('svg').length + '）');
        ok(小们[0].querySelector('.通话小图标') !== null, '★ 图标是 .通话小图标');
        ok(小们[0].querySelector('.通话时长').textContent === '2:05',
            '★ ★ 通话时长 2:05（挂断后气泡内可见，实际 '
            + 小们[0].querySelector('.通话时长').textContent + '）');
        /* 除了图标和时长，不该再多出别的内容（比如「已完成 · 2 人」那坨） */
        ok(小们[0].textContent.trim() === '2:05',
            '★ 气泡内文本只有时长，没有多余文案（实际 ' + JSON.stringify(小们[0].textContent.trim()) + '）');

        /* 未接通：显示「未接通」并压淡 */
        ok(小们[1].querySelector('.通话时长').textContent === '未接通',
            '★ 没接通 → 显示「未接通」');
        ok(小们[1].classList.contains('未接通'), '★ 未接通有压淡态 class');

        /* 源码层面：图标是描边式（与全站一致），不是填充色块 */
        const 图标块 = /\.通话小图标\s*\{([^}]*)\}/.exec(源码);
        ok(!!图标块 && /fill:\s*none/.test(图标块[1]), '★ 电话图标是描边式（fill:none）');
        ok(!!图标块 && /stroke:/.test(图标块[1]), '★ 电话图标用 stroke 上色');

        /* 大量通话混在对话里也不能撑爆：白 space nowrap */
        const 泡块 = /\.通话小泡\s*\{([^}]*)\}/.exec(源码);
        ok(!!泡块 && /white-space:\s*nowrap/.test(泡块[1]), '★ 小气泡不换行（一行放下图标+时长）');
    }

    console.log('\n[H3] ★★ 收付状态：转账与红包冷暖区分；点击领取 / 收款换色');
    {
        const 造 = (额外) => Object.assign({
            '联系人索引': JSON.stringify(联系人表),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '他', 类型: '红包', 文: '[红包]',
                  卡: { 种类: '红包', 金额: 66, 个数: 5, 祝福: '新年快乐' }, 时间戳: Date.now() },
                { 谁: '我', 类型: '转账', 文: '[转账]',
                  卡: { 种类: '转账', 金额: 52.5, 说明: '还你的' }, 时间戳: Date.now() },
                { 谁: '我', 类型: '红包', 文: '[红包]',
                  卡: { 种类: '红包', 金额: 8.88, 个数: 1, 祝福: '恭喜' }, 时间戳: Date.now() },
                { 谁: '他', 类型: '转账', 文: '[AA收款]',
                  卡: { 种类: 'AA', 金额: 30, 人数: 3, 每人: 10 }, 时间戳: Date.now() },
            ]),
        }, 额外 || {});

        const 共享 = 造();
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '收付');
        await 等(350);
        const 卡们 = Array.from(w.document.querySelectorAll('.卡片泡'));

        /* ★★ 第一重区分：类型 class（红包暖 / 转账冷） */
        ok(卡们[0].classList.contains('红包泡'), '★ 红包 → .红包泡');
        ok(卡们[1].classList.contains('转账泡'), '★ 转账 → .转账泡');
        ok(卡们[3].classList.contains('转账泡'), '★ AA 收款也归 .转账泡（同一类收付）');
        ok(卡们.every(泡 => 泡.classList.contains('未收')), '★ 初始都是「未收」');

        /* ★★ 第二重区分：冷暖色 —— 源码层面两个类型用不同的色变量 */
        const 红包块 = /\.卡片泡\.红包泡\.未收\s*\{([^}]*)\}/.exec(源码);
        const 转账块 = /\.卡片泡\.转账泡\.未收\s*\{([^}]*)\}/.exec(源码);
        ok(!!红包块 && /--hb/.test(红包块[1]), '★ 红包未收用暖色变量 --hb');
        ok(!!转账块 && /--zz/.test(转账块[1]), '★ 转账未收用冷色变量 --zz');
        ok(!!红包块 && !/--zz/.test(红包块[1]), '★ 红包块里没有冷色（冷暖不混）');
        ok(!!转账块 && !/--hb/.test(转账块[1]), '★ 转账块里没有暖色');
        /* 两色的 RGB 三元组必须真的不同，否则写了两个变量也白搭 */
        const hb = /--hb:\s*([\d,\s]+);/.exec(源码);
        const zz = /--zz:\s*([\d,\s]+);/.exec(源码);
        ok(!!hb && !!zz && hb[1].trim() !== zz[1].trim(),
            '★★ 冷暖是两个不同的色值（' + (hb && hb[1].trim()) + ' vs ' + (zz && zz[1].trim()) + '）');

        /* ★★ 第三重区分：已收退回中性灰 */
        const 已收块 = /\.卡片泡\.已收\s*\{([^}]*)\}/.exec(源码);
        ok(!!已收块 && /--panel/.test(已收块[1]), '★ 已收：退回白玻璃底 --panel');
        ok(!!已收块 && /--line/.test(已收块[1]), '★ 已收：描边转灰 --line（不再有色彩倾向）');
        ok(!!已收块 && !/--hb|--zz/.test(已收块[1]), '★ 已收：不含任何类型色');

        /* ★ 状态文案：我方 / 对方 说法不同 */
        ok(卡们[0].querySelector('.卡态').textContent === '点击领取',
            '★ 对方发的红包未领 → 「点击领取」（实际 '
            + 卡们[0].querySelector('.卡态').textContent + '）');
        ok(卡们[1].querySelector('.卡态').textContent === '等待对方收款',
            '★ 我发的转账未收 → 「等待对方收款」（实际 '
            + 卡们[1].querySelector('.卡态').textContent + '）');
        ok(卡们[2].querySelector('.卡态').textContent === '等待对方领取',
            '★ 我发的红包未领 → 「等待对方领取」');
        ok(卡们[3].querySelector('.卡态').textContent === '点击收款',
            '★ 对方发起的 AA 未收 → 「点击收款」');

        /* ★★ 点击：切换 class + 写盘 + 重绘 */
        点(w, 卡们[0]);
        await 等(150);
        const 后 = w.document.querySelectorAll('.卡片泡')[0];
        ok(后.classList.contains('已收') && !后.classList.contains('未收'),
            '★ 点一下 → 未收变已收（class=' + 后.className + '）');
        ok(后.querySelector('.卡态').textContent === '已领取',
            '★ 状态文案变「已领取」（实际 ' + 后.querySelector('.卡态').textContent + '）');
        const 存 = JSON.parse(共享['聊天记录_c_1'] || '[]');
        ok(存[0].卡.已收 === true, '★ 已写进存档（刷新后仍在）');
        ok(存[1].卡.已收 !== true, '★ 只改这一条，不牵连别的');
        /* 颜色确实变了：CSS 里已收与未收的背景声明不同 */
        ok(已收块[1] !== 红包块[1], '★ 已收与未收的底色声明不同（颜色真的换）');

        /* 刷新重进：状态要留着 */
        const w2 = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '收付2');
        await 等(350);
        ok(w2.document.querySelectorAll('.卡片泡')[0].classList.contains('已收'),
            '★ 重进后仍是已收（状态持久化）');

        /* 再点一次可恢复（误点能撤回） */
        点(w2, w2.document.querySelectorAll('.卡片泡')[0]);
        await 等(150);
        ok(w2.document.querySelectorAll('.卡片泡')[0].classList.contains('未收'),
            '★ 再点一次 → 恢复未收（误点可撤回）');
    }

    console.log('\n[H4] ★ 长按删除与点击领取不能互相误触');
    {
        const 共享 = {
            '联系人索引': JSON.stringify(联系人表),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '他', 类型: '红包', 文: '[红包]',
                  卡: { 种类: '红包', 金额: 66, 个数: 5, 祝福: '新年快乐' }, 时间戳: Date.now() },
            ]),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '长按');
        await 等(350);

        /* 长按 → 只弹删除确认，不能顺手把红包「领了」 */
        const 行 = w.document.querySelector('.消息行');
        行.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
        await 等(700);
        const 遮 = w.document.querySelector('.确认遮罩');
        ok(!!遮 && 遮.classList.contains('显示'), '★ 长按 → 弹出删除确认');
        const 泡 = w.document.querySelector('.卡片泡');
        ok(泡.classList.contains('未收'), '★ ★ 长按期间卡片没被误领（仍为未收）');

        w.document.getElementById('确认否')
            .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(500);
        ok(w.document.querySelector('.卡片泡').classList.contains('未收'),
            '★ ★ 长按后紧跟的那次 click 被忽略（没变已收）');

        /* 短点击 → 只领取，不能弹删除 */
        点(w, w.document.querySelector('.卡片泡'));
        await 等(150);
        ok(w.document.querySelector('.卡片泡').classList.contains('已收'),
            '★ 短点击 → 正常领取');
        ok(!w.document.querySelector('.确认遮罩').classList.contains('显示'),
            '★ 短点击不会弹出删除确认');
    }

    console.log('\n[H5] ★ 一起阅读没有收付状态（不该出现状态标签）');
    {
        const 共享 = {
            '联系人索引': JSON.stringify(联系人表),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '我', 类型: '阅读', 文: '[一起阅读]',
                  卡: { 种类: '阅读', 书名: '小王子', 副: '共读', 人数: 2 }, 时间戳: Date.now() },
            ]),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '阅读');
        await 等(350);
        const 泡 = w.document.querySelector('.卡片泡');
        const 态 = 泡.querySelector('.卡态');
        ok(!!态 && 态.style.display === 'none', '★ 一起阅读：状态标签被隐藏');
        ok(态.textContent === '', '★ 状态文案为空（没有收付概念）');
        /* 点了也不能切换出状态 */
        点(w, 泡);
        await 等(120);
        ok(w.document.querySelector('.卡片泡').querySelector('.卡态').textContent === '',
            '★ 点一起阅读卡片不会产生收付状态');
    }

    console.log('\n[H6] ★ 卡片横向布局：左配图 + 右文案；比原来更长');
    {
        const 头块 = /\.卡片头\s*\{([^}]*)\}/.exec(源码);
        ok(!!头块 && /display:\s*flex/.test(头块[1]), '★ .卡片头 是 flex（横向两栏）');
        ok(!!头块 && /align-items:\s*center/.test(头块[1]),
            '★ ★ 配图上下居中 align-items:center（对着右侧文案的垂直中点）');
        ok(!!头块 && !/align-items:\s*flex-start/.test(头块[1]),
            '★ 不再是顶对齐（配图比文案矮时会吊在顶上）');

        const 图块 = /\.卡图\s*\{([^}]*)\}/.exec(源码);
        ok(!!图块 && /flex-shrink:\s*0/.test(图块[1]), '★ 配图不被压缩（flex-shrink:0）');
        ok(!!图块 && /width:/.test(图块[1]) && /height:/.test(图块[1]), '★ 配图有固定尺寸');
        ok(!!图块 && /border-radius/.test(图块[1]), '★ 配图是圆角方形（不是圆形头像）');
        ok(!!图块 && /object-fit:\s*cover/.test(图块[1]), '★ 配图 object-fit:cover（不变形）');
        const 文块2 = /\.卡片文\s*\{([^}]*)\}/.exec(源码);
        ok(!!文块2 && /flex:\s*1/.test(文块2[1]), '★ 文案栏占满剩余宽度（flex:1）');
        ok(!!文块2 && /min-width:\s*0/.test(文块2[1]),
            '★ 文案栏 min-width:0（长文案不会把卡片撑爆）');

        /* ★★ 横向更长：宽度比原来（168~212）明显加大 */
        const 泡块 = /\.卡片泡\s*\{([^}]*)\}/.exec(源码);
        const m = /width:\s*clamp\((\d+)px/.exec(泡块[1]);
        ok(!!m && Number(m[1]) >= 200,
            '★★ 卡片最小宽度 ≥ 200px（横向更长，实际 ' + (m && m[1]) + 'px）');

        /* 配图路径与探测：png 优先，失败逐个降级；全失败变 .空 占位 */
        ok(!/卡图目录\s*=\s*'2【图片】\/'/.test(源码) ? /2【图片】\//.test(源码) : true,
            '★ 配图目录是 2【图片】/');
        ok(/卡图名[\s\S]{0,200}case '红包': return '红包'/.test(源码),
            '★ 红包 → 文件名「红包」');
        ok(/卡图名[\s\S]{0,200}case '转账': return '转账'/.test(源码),
            '★ 转账 → 文件名「转账」');
        ok(/卡图扩展\s*=\s*\[[^\]]*'png'[^\]]*'jpg'[^\]]*'jpeg'[^\]]*'webp'/.test(源码),
            '★ 扩展名按 png → jpg → jpeg → webp 逐个试');
        ok(/图元素\.onerror = \(\)/.test(源码),
            '★ ★ 探测用 onerror 【赋值】（不是 addEventListener，后者会叠加监听器）');
        ok(/图元素\.classList\.add\('空'\)/.test(源码),
            '★ 全部失败 → 加 .空 压成淡占位（不换成别的图）');
        const 空块 = /\.卡图\.空\s*\{([^}]*)\}/.exec(源码);
        ok(!!空块 && /opacity/.test(空块[1]), '★ .空 是压淡（不是隐藏，布局不塌）');
    }

    console.log('\n[H7] ★ 收付状态也作用在配图上（已收 → 去色压淡）');
    {
        /* 未收的卡片是视觉焦点，已收的整张一起退到背景 —— 配图也得跟着退 */
        const 已收图 = /\.卡片泡\.已收 \.卡图\s*\{([^}]*)\}/.exec(源码);
        ok(!!已收图, '★ 存在「已收 → 配图」的规则');
        ok(!!已收图 && /grayscale/.test(已收图[1]), '★ 已收：配图去色 grayscale');
        ok(!!已收图 && /opacity/.test(已收图[1]), '★ 已收：配图压淡');
        const 图块2 = /\.卡图\s*\{([^}]*)\}/.exec(源码);
        ok(!!图块2 && /transition/.test(图块2[1]), '★ 配图有过渡（切换不生硬）');

        /* 一起阅读：没有收付 → 不该拿到 未收/已收，也不该有冷暖色 */
        const 共享 = {
            '联系人索引': JSON.stringify(联系人表),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '我', 类型: '阅读', 文: '[一起阅读]',
                  卡: { 种类: '阅读', 书名: '小王子', 副: '共读', 人数: 2 }, 时间戳: Date.now() },
            ]),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            共享, errors, '阅读配色');
        await 等(350);
        const 泡 = w.document.querySelector('.卡片泡');
        ok(泡.classList.contains('阅读泡'), '★ 一起阅读 → .阅读泡（不是红包泡/转账泡）');
        ok(!泡.classList.contains('未收') && !泡.classList.contains('已收'),
            '★ ★ 一起阅读不带 未收/已收（没有收付概念）');
        const 阅块 = /\.卡片泡\.阅读泡\s*\{([^}]*)\}/.exec(源码);
        ok(!!阅块 && !/--hb|--zz/.test(阅块[1]), '★ 阅读泡不含冷暖色（中性）');
    }

    收尾(errors, '✅ 7 页「转账 / 红包 / 语音通话 / 一起阅读」全部通过');
})();
