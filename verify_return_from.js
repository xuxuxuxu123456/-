/**
 * verify_return_from.js —— ★「从哪进来，返回就回哪去」专项
 *
 * 背景：各设置页原本把返回目标写死（2 页一律回 4 页、10 页一律回 5 页），
 *       从 8 页「我的」点进去，返回却落在通讯录 / 动态页。
 *
 * 规则（四处一致）：
 *   ① 入口跳转带 ?from=<页号>
 *   ② 目标页按 ?from= 决定返回页
 *   ③ from 缺失 → document.referrer 兜底（同站内 N_xxx.html）
 *   ④ 都没有 → 该页默认页（2 页→4、9 页→1、10 页→5）
 *
 * 覆盖：
 *   [A] 8 页三个入口都带 from=8
 *   [B] 2 页：返回 / 保存后 都回来源页
 *   [C] 3 页：来源透传（2 页 → 3 页 → 回 2 页，from 不丢）
 *   [D] 9 页：from=1/4/8 → 对应页；无 from → referrer 兜底；都没有 → 1 页
 *   [E] 10 页：from=8 → 8 页；无 from 但有 referrer → referrer；都没有 → 5 页
 *
 * ★ jsdom 不实现导航：location.href 赋值只抛 Not implemented、跳不动。
 *   这里把 href 换成可记录的 setter（在 beforeParse 里做，页面取 URL 前生效），
 *   既能测到真实跳转目标，又不会污染报错统计。
 *   ★ 注意：URLSearchParams 读的是 location.search，所以桩必须装在
 *     页面脚本执行【之前】—— 这正是 beforeParse 钩子的用途。
 *
 * 用法：PAGES_DIR=/data/workspace node verify_return_from.js
 */
const kit = require('/data/inputs/testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));

/**
 * ★ jsdom 的 location.href 是 [Unforgeable]，defineProperty 重定义会抛
 *   "Cannot redefine property"，所以测不到真实跳转。
 *   改为测「返回目标是怎么算出来的」——四页都把结果挂在 window.取返回页()，
 *   既方便测试，也是给业务方的接管口（与 window.打开设置 同思路）。
 *   再用源码级断言确认返回按钮确实用的是同一个值，不会算归算、跳归跳。
 *
 * ★ 桩必须装在 beforeParse：URLSearchParams 读的是 location.search，
 *   页面脚本一执行就定下来了，晚一步 from 就取不到。
 */
function 打桩(w) {
    try { w.history.replaceState(null, '', w.location.href); } catch (e) {}
}

/** 起页面并指定 referrer（jsdom 的 document.referrer 由它决定） */
function 起(文件, 搜索, 来源页) {
    return 起页面(文件, 'http://localhost/' + 文件 + 搜索, {}, errors, 'x', w => {
        打桩(w);
        if (来源页) {
            try {
                Object.defineProperty(w.document, 'referrer',
                    { get: () => 'http://localhost/' + 来源页, configurable: true });
            } catch (e) {}
        }
    });
}

(async function main() {
    const 源码8 = 读('8_wode.html');

    console.log('[A] ★ 8 页三个入口都带 from=8');
    {
        for (const [名, 目标] of [
            // 人设已独立成 11 页，不再是 2 页的 mode=new
            ['我的人设', '11_woderenshe.html?from=8'],
            ['主题背景设置', '9_zhutishezhi.html?from=8'],
            ['动态轮播背景设置', '10_lunbotu.html?from=8'],
        ]) {
            ok(new RegExp("'" + 名 + "'\\s*:\\s*'" + 目标.replace(/[.?=&]/g, '\\$&') + "'").test(源码8),
                '「' + 名 + '」→ ' + 目标);
        }
    }

    console.log('\n[B] ★ 2 页：返回 / 保存后 都回来源页');
    {
        // --- from=8：从「我的」进来 ---
        const w = await 起('2_haoyouxinxi.html', '?mode=new&from=8', '8_wode.html');
        await 等(150);
        ok(w.取返回页() === '8_wode.html',
            '★ from=8 → 回 8_wode.html（实际 ' + w.取返回页() + '）');

        // --- from=1 ---
        const w1 = await 起('2_haoyouxinxi.html', '?mode=new&from=1', '1_shouyeyulan.html');
        await 等(150);
        ok(w1.取返回页() === '1_shouyeyulan.html',
            '★ from=1 → 回 1_shouyeyulan.html（实际 ' + w1.取返回页() + '）');

        // --- 无 from，只有 referrer（4 页）→ 兜底回 4 页 ---
        const w4 = await 起('2_haoyouxinxi.html', '?mode=new', '4_tongxun.html');
        await 等(150);
        ok(w4.取返回页() === '4_tongxun.html',
            '★ 无 from 但 referrer=4 页 → 回 4_tongxun.html（实际 ' + w4.取返回页() + '）');

        // --- 都没有 → 默认通讯录（保持既有行为） ---
        const w0 = await 起('2_haoyouxinxi.html', '?mode=new', null);
        await 等(150);
        ok(w0.取返回页() === '4_tongxun.html',
            '兜底：无 from 无 referrer → 回 4_tongxun.html（实际 ' + w0.取返回页() + '）');

        // --- 保存后跳转 / 返回 都走同一个「返回页」 ---
        const 源码2 = 读('2_haoyouxinxi.html');
        ok(/setTimeout\(\(\) => \{ location\.href = 返回页; \}, 700\)/.test(源码2),
            '★ 保存后跳转用「返回页」，不再写死 4_tongxun.html');
        ok(!/setTimeout\(\(\) => \{ location\.href = '4_tongxun\.html'/.test(源码2),
            '保存后跳转已不再写死通讯录');
        ok(/window\.返回上一页 = function \(\) \{[\s\S]{0,200}location\.href = 返回页;/.test(源码2),
            '返回按钮也用「返回页」');
    }

    console.log('\n[C] ★ 3 页：来源透传（2 → 3 → 回 2，from 不丢）');
    {
        const 源码3 = 读('3_YINSEAPI.html');
        ok(/参数\.get\('from'\)/.test(源码3), '3 页读 ?from=');
        ok(/目标返回页\s*=\s*基础返回/.test(源码3) && /&from=/.test(源码3),
            '★ 3 页把 from 拼回返回地址');

        const w = await 起('3_YINSEAPI.html', '?id=c_1&mode=edit&from=8', '2_haoyouxinxi.html');
        await 等(150);
        ok(/^2_haoyouxinxi\.html\?id=c_1&mode=edit&from=8$/.test(w.取返回页()),
            '★ 3 页返回 → 2 页且带 from=8（实际 ' + w.取返回页() + '）');

        // 新建模式同样要带上
        const w2 = await 起('3_YINSEAPI.html', '?mode=new&from=8', '2_haoyouxinxi.html');
        await 等(150);
        ok(w2.取返回页() === '2_haoyouxinxi.html?mode=new&from=8',
            '新建模式也带 from=8（实际 ' + w2.取返回页() + '）');

        // 2 页跳 3 页时确实透传了 from
        ok(/串\.set\('from', 来源参数\)/.test(读('2_haoyouxinxi.html')),
            '★ 2 页跳 3 页时把 from 透传过去');
    }

    console.log('\n[D] ★ 9 页：from=1/4/8 → 对应页 + 双重兜底');
    {
        for (const [来源, 期望] of [
            ['1', '1_shouyeyulan.html'],
            ['4', '4_tongxun.html'],
            ['8', '8_wode.html'],
        ]) {
            const w = await 起('9_zhutishezhi.html', '?from=' + 来源, null);
            await 等(150);
            ok(w.取返回页() === 期望,
                'from=' + 来源 + ' → ' + 期望 + '（实际 ' + w.取返回页() + '）');
        }

        const w = await 起('9_zhutishezhi.html', '', '8_wode.html');
        await 等(150);
        ok(w.取返回页() === '8_wode.html',
            '★ 无 from 但 referrer=8 页 → 回 8_wode.html（实际 ' + w.取返回页() + '）');

        const w0 = await 起('9_zhutishezhi.html', '', null);
        await 等(150);
        ok(w0.取返回页() === '1_shouyeyulan.html',
            '兜底：都没有 → 回 1 页（实际 ' + w0.取返回页() + '）');

        ok(/addEventListener\('click', \(\) => \{\s*location\.href = 返回页;/.test(读('9_zhutishezhi.html')),
            '返回按钮确实用的是「返回页」');
    }

    console.log('\n[E] ★ 10 页：from=8 → 8 页；referrer 兜底；都没有 → 5 页');
    {
        const w = await 起('10_lunbotu.html', '?序=2&from=8', null);
        await 等(150);
        ok(w.取返回页() === '8_wode.html',
            '★ 从 8 页进来 → 回 8_wode.html（实际 ' + w.取返回页() + '）');

        // 5 页轻点卡片进来（不带 from，靠 referrer）
        const w5 = await 起('10_lunbotu.html', '?序=2', '5_dongtai.html');
        await 等(150);
        ok(w5.取返回页() === '5_dongtai.html',
            '★ 5 页轻点进来（无 from，referrer=5 页）→ 回 5_dongtai.html（实际 ' + w5.取返回页() + '）');

        const w0 = await 起('10_lunbotu.html', '?序=2', null);
        await 等(150);
        ok(w0.取返回页() === '5_dongtai.html',
            '兜底：都没有 → 回 5 页（实际 ' + w0.取返回页() + '）');

        ok(/addEventListener\('click', \(\) => \{\s*location\.href = 返回页;/.test(读('10_lunbotu.html')),
            '返回按钮确实用的是「返回页」');
    }

    收尾(errors, '✅ 「从哪进来就回哪去」全部通过');
})().catch(e => { console.error(e); process.exit(2); });
