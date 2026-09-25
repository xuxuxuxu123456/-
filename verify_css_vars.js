/**
 * verify_css_vars.js —— ★ CSS 变量用法体检（全站）
 *
 * 为什么单开一个脚本：
 *   把 hex 变量塞进 rgba() 是【无效 CSS】，浏览器会**静默丢弃整条声明**——
 *   不报错、不告警、控制台干净，但样式就是没了。
 *
 *   真实事故：7 页写了
 *       .我方 .卡片泡 { background: rgba(var(--accent), 0.92); }
 *   而 --accent 是 #4a4a50（hex），展开后是 rgba(#4a4a50, 0.92) → 无效，
 *   背景声明被丢掉，卡片退回白色；但 .卡片额 的 color:#fff 是合法的 →
 *   **白底白字**，红包 / 转账 / 通话三类气泡（都是我方发出）全都看不见字。
 *
 * 规则（本脚本守的两条）：
 *   ① hex 变量（#xxxxxx）只能进 rgb()/hsl()/直接赋值，**不能**进 rgba(var(...), a)
 *      要带透明度 → 用数值形式的伴生变量：rgba(var(--accent-rgb), 0.92)
 *   ② 凡是被 rgba() 引用的变量，页面里必须真的定义了它（不能引用不存在的名字）
 *
 * 用法：PAGES_DIR=/data/workspace node verify_css_vars.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 页面们 = [
    '1_shouyeyulan.html', '2_haoyouxinxi.html', '3_YINSEAPI.html',
    '4_tongxun.html', '5_dongtai.html', '6_fabudongtai.html',
    '7_liaotian.html', '8_wode.html', '9_zhutishezhi.html',
    '10_lunbotu.html', '11_woderenshe.html',
    '12_zhuanzhang.html', '13_hongbao.html', '14_yuyintonghua.html',
];

/**
 * 剥掉 CSS 注释。
 * ★ 必须剥：注释里会写「错误：rgba(var(--accent), 0.92)」当反例，
 *   不剥的话体检脚本会把教学用的反例判成真违规（假阳性）。
 */
function 去注释(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

/** 取出 CSS 里所有变量定义 → { 名: 值 } */
function 取变量(css) {
    const 表 = {};
    for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
        表[m[1]] = m[2].trim();
    }
    return 表;
}
const 是hex = v => /^#[0-9a-fA-F]{3,8}$/.test(v || '');

(async function main() {
    console.log('[A] ★ hex 变量不得进 rgba()（会被整条丢弃）');
    {
        let 总违规 = 0;
        for (const 页 of 页面们) {
            let 原文;
            try { 原文 = 读(页); } catch (e) { continue; }
            const 变量 = 取变量(去注释(原文));
            const 坏 = [];
            for (const m of 去注释(原文).matchAll(/rgba\(\s*var\((--[\w-]+)\)\s*,/g)) {
                const 名 = m[1];
                if (是hex(变量[名])) {
                    坏.push(名 + '（' + 页 + '）');
                }
            }
            ok(坏.length === 0,
                '★ ' + 页 + ' 没有「hex 变量进 rgba」的写法'
                + (坏.length ? ' —— 违规：' + 坏.join('、') : ''));
            总违规 += 坏.length;
        }
        ok(总违规 === 0, '★ 全站 0 处违规（实际 ' + 总违规 + '）');
    }

    console.log('\n[B] ★ rgba() 引用的变量必须真实存在');
    {
        for (const 页 of 页面们) {
            let 原文;
            try { 原文 = 读(页); } catch (e) { continue; }
            const 净 = 去注释(原文);
            const 变量 = 取变量(净);
            const 缺 = new Set();
            for (const m of 净.matchAll(/rgba\(\s*var\((--[\w-]+)\)/g)) {
                if (!(m[1] in 变量)) 缺.add(m[1]);
            }
            ok(缺.size === 0,
                '★ ' + 页 + '：rgba() 引用的变量都有定义'
                + (缺.size ? ' —— 缺：' + Array.from(缺).join('、') : ''));
        }
    }

    console.log('\n[C] ★ 需要带透明度的强调色要有 rgb 伴生变量');
    {
        for (const 页 of 页面们) {
            let 原文;
            try { 原文 = 读(页); } catch (e) { continue; }
            const 变量 = 取变量(去注释(原文));
            if (!('--accent' in 变量)) continue;         // 这页没用统一色板就跳过
            ok(!!变量['--accent-rgb'],
                '★ ' + 页 + ' 定义了 --accent-rgb（' + (变量['--accent-rgb'] || '缺失') + '）');
            // 伴生变量必须是「数值三元组」，否则同样塞不进 rgba()
            ok(/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(变量['--accent-rgb'] || ''),
                '★ ' + 页 + ' 的 --accent-rgb 是数值三元组（不是 hex）');
        }
    }

    console.log('\n[D] ★ 卡片气泡：与对话气泡同底色 + 深色字（防白底白字）');
    {
        const 源 = 读('7_liaotian.html');

        /* ★ 需求：转账 / 红包 / 通话气泡【不要深色底】，与对话气泡风格同一。
           所以不该再存在「给我方卡片上深色」的规则。 */
        ok(!/\.我方 \.卡片泡/.test(源),
            '★ 已无 .我方 .卡片泡 的深色覆盖（卡片与对话气泡同底色）');

        const 泡块 = /\.卡片泡\s*\{([^}]*)\}/.exec(源);
        ok(!!泡块 && !/background/.test(泡块[1]),
            '★ .卡片泡 不自己设底色（继承 .气泡 的白玻璃）');
        ok(!!泡块 && /width:\s*clamp/.test(泡块[1]),
            '★ .卡片泡 有确定宽度（不只靠 min-width，防嵌套 flex 被算成 0 宽）');

        /* ★ 字色必须是深灰系 —— 底是白玻璃，白字就会看不见 */
        const 额 = /\.卡片额\s*\{([^}]*)\}/.exec(源);
        ok(!!额 && /var\(--ink\)/.test(额[1]),
            '★ 主行是深灰字 var(--ink)，不是白字');
        ok(!!额 && !/#fff|255,\s*255,\s*255/.test(额[1]),
            '★ 主行没有白字（白底白字就是这么来的）');
        /* ★ 顶部类别提示已删 → 改验配图不能带底框 */
        const 图块2 = /\.卡图\s*\{([^}]*)\}/.exec(源);
        ok(!!图块2 && /background:\s*transparent/.test(图块2[1]),
            '★ 配图无底框（background:transparent）');
        ok(!!图块2 && /box-shadow:\s*none/.test(图块2[1]), '★ 配图无阴影（不要底框）');
        const 头块2 = /\.卡片头\s*\{([\s\S]*?)\}/.exec(源);
        ok(!!头块2 && /align-items:\s*center/.test(头块2[1]),
            '★ ★ 配图上下居中（align-items:center）');

        const 文块 = /\.卡片文\s*\{([^}]*)\}/.exec(源);
        ok(!!文块 && /display:\s*block/.test(文块[1]),
            '★ .卡片文 显式 display:block（不依赖 flex blockify）');
    }

    console.log('\n[E] ★ 卡片无图标；红包与转账靠文案/排版区分');
    {
        const 源 = 读('7_liaotian.html');
        ok(!/\.卡片图标/.test(源), '★ 已无 .卡片图标（需求：不要图标）');
        ok(!/卡片图标/.test(源), '★ 建卡片里也不再插入 .卡片图标 节点');
        /* 图标表里不该再有转账/红包/阅读（卡片不要图标）；
           「通话」要留着 —— 通话记录小气泡明确要求一个电话图标。 */
        const 图标块 = /const 图标们 = \{([\s\S]*?)\};/.exec(源);
        ok(!!图标块 && !/转账:|红包:|阅读:/.test(图标块[1]),
            '★ 图标表已删掉卡片用的转账/红包/阅读');
        ok(!!图标块 && /通话:/.test(图标块[1]),
            '★ 保留「通话」图标（小气泡要用）');

        /* ★ 区分手段：主行性质不同 —— 金额/时长是数字排版（加粗等宽），
           红包祝福语是文字排版（常规字重），CSS 上用 .文 分开 */
        const 文块 = /\.卡片额\.文\s*\{([^}]*)\}/.exec(源);
        ok(!!文块 && /font-weight:\s*400/.test(文块[1]),
            '★ 文字类主行（红包祝福语）不加粗（与金额的加粗数字区分）');
        ok(/是文:\s*true/.test(源), '★ 红包等卡片标注了 是文:true');
        /* 底栏照微信：类别 + 时间 */
        ok(/卡片尾巴\(条\.类型\) \+ \(时刻/.test(源),
            '★ 底栏是「类别 · 时间」（照微信那条来源栏）');

        /* ★ 通话是【小气泡】，不是卡片 —— 与上面「卡片无图标」不冲突 */
        ok(/条\.类型 === '通话'\)[\s\S]{0,120}建通话小泡/.test(源),
            '★ 通话走 建通话小泡（独立于卡片分支）');
        const 小泡块 = /\.通话小泡\s*\{([^}]*)\}/.exec(源);
        ok(!!小泡块 && /display:\s*inline-flex/.test(小泡块[1]),
            '★ .通话小泡 是 inline-flex（一行放下图标 + 时长）');
        ok(!/\.通话小泡[\s\S]{0,200}background/.test(
            /\.通话小泡\s*\{([^}]*)\}/.exec(源)[1]),
            '★ 通话小泡不自带底色（与对话气泡同一套白玻璃）');
    }

    收尾(errors, '✅ CSS 变量用法体检全部通过');
})().catch(e => { console.error(e); process.exit(2); });
