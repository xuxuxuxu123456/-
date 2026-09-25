/**
 * verify_wode.js —— 8_wode（我的）验证
 *
 * 覆盖：
 *   [A] 页面能起来，且无运行时报错
 *   [B] 顶部状态栏三件套：左侧系统时间 / 中间「我的」★ 绝对居中 / 右侧时段 SVG
 *   [C] ★ 时段图标由当前时间生成：24 小时逐点验算昼夜与天体位置
 *   [D] ★ 位置连续：随分钟推进而移动，不是整点跳变
 *   [E] ★ 时间文本与系统时间一致（HH:MM）
 *   [F] 资料卡：昵称 / 签名读取 localStorage，空态占位正确
 *   [G] 数据条：好友数来自「联系人索引」、动态数来自「我的动态」
 *   [H] 底部导航：默认选中「我的」，其余三项跳 1 / 4 / 5
 *   [I] 1 / 4 / 5 页的「我的」已接入 8 页
 *
 * 用法：node verify_wode.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

/**
 * 把页面里的 new Date() 钉死在指定时刻。
 * 时段图标完全由系统时间推导，不打桩就只能验到「跑起来的那一刻」。
 */
function 钉时间(小时, 分钟) {
    return function (w) {
        const 真 = w.Date;
        class 假 extends 真 {
            constructor(...参数) {
                if (参数.length === 0) super(2026, 0, 1, 小时, 分钟, 0);
                else super(...参数);
            }
            static now() { return new 真(2026, 0, 1, 小时, 分钟, 0).getTime(); }
        }
        w.Date = 假;
    };
}

/** 起 8 页（可指定钉住的时分） */
async function 跑8页(小时, 分钟, 数据) {
    const 附加 = (小时 === undefined) ? null : 钉时间(小时, 分钟);
    const w = await 起页面('8_wode.html', 'http://localhost/8.html',
        Object.assign({}, 数据 || {}), errors, '8', 附加);
    await new Promise(r => setTimeout(r, 80));
    return w;
}

(async function main() {
    const css = 读('8_wode.html');

    console.log('[A] 8 页能起来，且无运行时报错');
    {
        const w = await 跑8页();
        ok(!!w.document.getElementById('系统时间'), '页面已渲染出状态栏');
        ok(!!w.document.getElementById('时段图标'), '页面已渲染出时段图标');
    }

    console.log('\n[B] 顶部状态栏：时间 / ★我的居中 / 时段图标');
    {
        const w = await 跑8页(9, 30);
        const d = w.document;

        const 时间 = d.getElementById('系统时间');
        ok(!!时间 && /^\d{2}:\d{2}$/.test(时间.textContent),
            '左侧系统时间已填充（实际 "' + (时间 && 时间.textContent) + '"）');

        const 标题 = Array.from(d.querySelectorAll('.中间标题')).map(e => e.textContent.trim());
        ok(标题.length === 1 && 标题[0] === '我的', '中间标题为「我的」且唯一');

        // ★ 真居中：与 5 页同款，必须脱离 flex 流
        ok(/\.中间标题\s*\{[^}]*position:\s*absolute/.test(css),
            'CSS：.中间标题 绝对定位（不随两侧宽度偏移）');
        ok(/\.中间标题\s*\{[^}]*left:\s*0/.test(css) && /\.中间标题\s*\{[^}]*right:\s*0/.test(css),
            'CSS：.中间标题 左右归零（整条导航栏中线）');
        ok(/\.中间标题\s*\{[^}]*text-align:\s*center/.test(css), 'CSS：.中间标题 文字居中');
        ok(/\.顶部导航栏\s*\{[^}]*position:\s*relative/.test(css), 'CSS：.顶部导航栏 是定位参照');

        // 右侧：SVG 本体（不是 img/png）
        const 图标 = d.getElementById('时段图标');
        ok(!!图标 && 图标.tagName.toLowerCase() === 'svg', '右侧是 SVG 图标（非 png）');
        ok(!!d.getElementById('天体'), 'SVG 内含可移动的天体组（#天体）');
        ok(!!d.querySelector('#时段图标 .太阳'), 'SVG 含太阳');
        ok(!!d.querySelector('#时段图标 .月亮'), 'SVG 含月亮');
        ok(!!d.querySelector('#时段图标 .地平线'), 'SVG 含地平线');
        ok(d.querySelectorAll('#时段图标 .星').length === 6, 'SVG 含 6 颗星（夜空）');
    }

    console.log('\n[C] ★ 时段图标由当前时间生成（24 小时逐点验算）');
    {
        // 期望：白天 6:00 起于左地平线 → 12:00 顶点 (12,7.1) → 18:00 落；
        //       ★ 端点已内收到 (6.2,15.8)/(17.8,15.8)：日出日落时太阳不被圆形裁掉。
        //         （顶点 y = 0.25*15.8 + 0.5*(-1.6) + 0.25*15.8 = 7.1，与 8 页 P0/P1/P2 一致）
        //       夜里 18:00 起 → 0:00 顶点 → 6:00 落（同一条弧，夜间换月亮走）
        const 用例 = [
            [6, 0, false, '清晨', 6.2, 15.8],
            [9, 0, false, '上午', 0, 0],
            [12, 0, false, '中午', 12, 7.1],
            [15, 0, false, '下午', 0, 0],
            [18, 0, true, '傍晚', 6.2, 15.8],
            [20, 0, true, '夜晚', 0, 0],
            [0, 0, true, '深夜', 12, 7.1],
            [3, 0, true, '深夜', 0, 0],
        ];

        for (const [时, 分, 应夜间, 应名, 应x, 应y] of 用例) {
            const w = await 跑8页(时, 分);
            const 段 = w.当前时段();
            const 前缀 = String(时).padStart(2, '0') + ':' + String(分).padStart(2, '0') + ' → ';

            ok(段.夜间 === 应夜间, 前缀 + '昼夜 = ' + (应夜间 ? '夜' : '昼') + '（实际 ' + (段.夜间 ? '夜' : '昼') + '）');
            ok(段.名 === 应名, 前缀 + '时段名 = ' + 应名 + '（实际 ' + 段.名 + '）');

            if (应x) {
                ok(Math.abs(段.x - 应x) < 0.05 && Math.abs(段.y - 应y) < 0.05,
                    前缀 + '天体落点 ≈ (' + 应x + ', ' + 应y + ')（实际 ' + 段.x.toFixed(2) + ', ' + 段.y.toFixed(2) + '）');
            }

            // 天体位置必须真的写进了 DOM
            const 天体 = w.document.getElementById('天体');
            const 变换 = 天体.getAttribute('transform') || '';
            ok(/^translate\(-?[\d.]+ -?[\d.]+\)$/.test(变换),
                前缀 + '位置已写入 transform（实际 "' + 变换 + '"）');

            const 图标 = w.document.getElementById('时段图标');
            ok(图标.classList.contains('夜间') === 应夜间,
                前缀 + 'SVG 昼夜样式同步（class.夜间 = ' + 图标.classList.contains('夜间') + '）');
            ok(w.document.getElementById('时段文字').textContent === 应名,
                前缀 + '右侧文案 = ' + 应名);
        }

        // 白天正午最高、清晨/傍晚会更低（y 越大越靠下 = 越接近地平线）
        const 正午 = (await 跑8页(12, 0)).当前时段();
        const 上午 = (await 跑8页(9, 0)).当前时段();
        ok(正午.y < 上午.y && 上午.y < 15.8,
            '★ 天体高度随时间变化：正午(' + 正午.y.toFixed(2) + ') < 上午(' + 上午.y.toFixed(2) + ') < 地平线(15.8)');
    }

    console.log('\n[D] ★ 位置连续：随分钟推进而移动，不是整点跳变');
    {
        const 甲 = (await 跑8页(9, 0)).当前时段();
        const 乙 = (await 跑8页(9, 30)).当前时段();
        const 丙 = (await 跑8页(10, 0)).当前时段();
        ok(甲.x !== 乙.x && 乙.x !== 丙.x,
            '9:00 → 9:30 → 10:00 横坐标持续变化（' + 甲.x.toFixed(2) + ' → ' + 乙.x.toFixed(2) + ' → ' + 丙.x.toFixed(2) + '）');
        ok(甲.x < 乙.x && 乙.x < 丙.x, '★ 白天天体自左向右移动（东 → 西）');

        const 夜甲 = (await 跑8页(20, 0)).当前时段();
        const 夜乙 = (await 跑8页(22, 0)).当前时段();
        ok(夜甲.x < 夜乙.x, '★ 夜里的月亮同样自左向右移动（20:00 → 22:00）');
    }

    console.log('\n[E] ★ 时间文本与手机系统时间一致');
    {
        const w = await 跑8页(23, 5);
        ok(w.document.getElementById('系统时间').textContent === '23:05',
            '打桩 23:05 → 显示 23:05（实际 "' + w.document.getElementById('系统时间').textContent + '"）');

        // 同一时刻，图标文案也要跟着变（不会出现「时间跳了、图标没跟上」）
        ok(w.document.getElementById('时段文字').textContent === '深夜',
            '同一时刻的时段文案同步为「深夜」（23 点已入深夜）');
        ok(w.document.getElementById('时段图标').classList.contains('夜间'),
            '同一时刻的图标同步为夜间样式');

        // 定时器 + 回前台刷新：真机切后台会把定时器挂起，必须能补刷
        ok(/setInterval\(window\.刷新状态栏/.test(css), '存在定时刷新');
        ok(/visibilitychange/.test(css), '★ 切回前台立即刷新（定时器被系统挂起时补刷）');
        ok(/pageshow/.test(css), '★ 兼容 iOS bfcache（前进/后退不触发 load 也能刷新）');
    }

    console.log('\n[F] 寄语：6 个键各自独立，空态退回占位语');
    {
        const w = await 跑8页(9, 0);
        const 中 = Array.from(w.document.querySelectorAll('.寄语中'));
        const 英 = Array.from(w.document.querySelectorAll('.寄语英'));
        ok(中.length === 3 && 英.length === 3, '★ 三行寄语 × 中英 = 6 条（实际 ' + 中.length + '+' + 英.length + '）');

        const 键 = 中.concat(英).map(e => e.dataset.键);
        ok(键.join(',') === '寄语_1_中,寄语_2_中,寄语_3_中,寄语_1_英,寄语_2_英,寄语_3_英',
            '★ 6 个存储键按行独立（实际 ' + 键.join(',') + '）');

        /* 默认有内容 → 不是空态；清空存档 → 才退回占位语 */
        ok(中.every(e => !e.classList.contains('空态')), '有内容时不是空态');
        ok(中[0].dataset.占位 === '写下中文寄语', '中文占位语正确');
        ok(英[0].dataset.占位 === 'Write in English', '英文占位语正确');
        ok(/\.寄语中\.空态::before[^{]*\{[^}]*content:\s*attr\(data-占位\)/.test(css),
            'CSS：空态用 ::before 顶出占位语');

        /* 存档优先：写了自己的寄语就不再显示内置那句 */
        const w2 = await 跑8页(9, 0, { '寄语_1_中': '自写的第一句' });
        const 首 = w2.document.querySelector('.寄语中');
        ok(首.textContent === '自写的第一句', '★ 存档优先于内置文案（实际 "' + 首.textContent + '"）');
        const 次 = w2.document.querySelectorAll('.寄语中')[1];
        ok(次.textContent.indexOf('褪色的月亮纸船') >= 0, '★ 只覆盖第 1 行，其余行仍是内置（互不串台）');

        /* 清空存档 → 退回占位语并挂上空态 class */
        const w3 = await 跑8页(9, 0, { '寄语_1_中': '' });
        ok(w3.document.querySelector('.寄语中').classList.contains('空态'),
            '★ 存档为空 → 退回空态（不显示空白）');
    }

    console.log('\n[G] 设置区：七个入口 + 跳转映射');
    {
        const w = await 跑8页(9, 0);
        const 项 = Array.from(w.document.querySelectorAll('#设置区 .设置项'));
        /* ★ 原为 6 个；23_beifen.html 上线后多了「备份与恢复」→ 7 个 */
        ok(项.length === 7, '★ 设置区 7 个入口（实际 ' + 项.length + '）');

        const 名 = 项.map(e => e.querySelector('.设置文字').textContent.trim());
        ok(名.join('/') === '我的人设/主题背景设置/动态轮播背景设置/文本API/图片API/音频API/备份与恢复',
            '★ 入口文案顺序（实际 ' + 名.join('/') + '）');

        /* 每项都是「图标 + 文字 + 箭头」三件套 */
        ok(项.every(e => e.querySelector('.设置图标') && e.querySelector('.设置箭头')),
            '★ 每项含 图标 + 箭头（镂空小圆点 + 右箭头）');

        /* 跳转映射集中在脚本里，改文件名只改一处 */
        const 映射块 = (/const 跳转表 = \{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/'我的人设':\s*'11_woderenshe\.html\?from=8'/.test(映射块), '「我的人设」→ 11 页（带 from=8）');
        ok(/'主题背景设置':\s*'9_zhutishezhi\.html\?from=8'/.test(映射块), '「主题背景设置」→ 9 页（带 from=8）');
        ok(/'动态轮播背景设置':\s*'10_lunbotu\.html\?from=8'/.test(映射块), '「动态轮播背景设置」→ 10 页（带 from=8）');

        /* ★ 三个 API 页（19/20/21）早已建好并接入映射表 —— 原断言「尚未接入」
             是过时基线（接入后没人回来改这里），现按现状改为【必须已接入】。
             反过来说：若哪天有人误删映射，入口会退化成 toast「功能开发中」，
             7 页就读不到配置，所以这条现在是有价值的回归哨兵。 */
        const API项 = 项.filter(e => /API$/.test(e.querySelector('.设置文字').textContent.trim()));
        ok(API项.length === 3, '★ 文本 / 图片 / 音频 三个 API 入口存在（实际 ' + API项.length + '）');
        ok(/'文本API':\s*'19_wenbenAPI\.html\?from=8'/.test(映射块), '★「文本API」→ 19 页（带 from=8）');
        ok(/'图片API':\s*'20_tupianAPI\.html\?from=8'/.test(映射块), '★「图片API」→ 20 页（带 from=8）');
        ok(/'音频API':\s*'21_yinpinAPI\.html\?from=8'/.test(映射块), '★「音频API」→ 21 页（带 from=8）');

        /* ★ 备份与恢复 → 23 页。这条钉死新入口不会变成点了没反应 */
        ok(/'备份与恢复':\s*'23_beifen\.html\?from=8'/.test(映射块), '★「备份与恢复」→ 23 页（带 from=8）');
    }

    console.log('\n[H] 底部导航：默认选中「我的」，其余跳 1 / 4 / 5');
    {
        const w = await 跑8页(9, 0);
        const 项们 = Array.from(w.document.querySelectorAll('.底部导航栏 .导航项'));
        ok(项们.length === 4, '底部 4 个导航项（实际 ' + 项们.length + '）');

        const 文字们 = 项们.map(e => e.querySelector('.导航文字').textContent.trim());
        ok(文字们.join(',') === '聊天,通讯录,动态,我的', '顺序为 聊天/通讯录/动态/我的');

        const 选中 = 项们.filter(e => e.classList.contains('选中'));
        ok(选中.length === 1 && 选中[0].querySelector('.导航文字').textContent.trim() === '我的',
            '★ 默认选中「我的」（实际选中 ' + 选中.length + ' 项）');

        // 跳转目标集中在映射表里，改文件名只改一处
        const 映射块 = (/const 跳转页面 = \{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/聊天:\s*'1_shouyeyulan\.html'/.test(映射块), '「聊天」→ 1 页');
        ok(/通讯录:\s*'4_tongxun\.html'/.test(映射块), '「通讯录」→ 4 页');
        ok(/动态:\s*'5_dongtai\.html'/.test(映射块), '「动态」→ 5 页');
        ok(映射块.indexOf('8_wode') === -1, '★ 映射里不含本页（点「我的」不自我跳转）');

        // 选中态不放大（与 4 / 5 页一致）
        ok(/\.导航项\.选中 \.导航图标 \{[^}]*transform:\s*none/.test(css), '★ 选中态图标不放大');
    }

    console.log('\n[I] 1 / 4 / 5 页的「我的」已接入 8 页');
    for (const [文件, 名] of [
        ['1_shouyeyulan.html', '1 页'],
        ['4_tongxun.html', '4 页'],
        ['5_dongtai.html', '5 页'],
    ]) {
        const 源码 = 读(文件);
        ok(/我的:\s*'8_wode\.html'/.test(源码), 名 + '：底部导航「我的」→ 8_wode.html');
    }

    收尾(errors, '✅ 8_wode（我的）全部通过');
})().catch(e => { console.error(e); process.exit(2); });
