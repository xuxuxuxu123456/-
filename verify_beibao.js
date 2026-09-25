/**
 * verify_beibao.js —— 我的背包（16_beibao）专项验证
 *
 * 背景：背包从 15 页内嵌区块改成【独立页面】，顶栏小图标进入。
 *       这里只放【已扭到的】，可保存；15 页预览区只给人看、不能点。
 *
 * 覆盖：
 *   ① 只展示已扭到的（数据源 = localStorage「图库已获」，与 15 页共用）
 *   ② 分类栏：全部 + 四个分类；「全部」模式带分类前缀
 *   ③ 一行两列；成対类一格两张
 *   ④ 空态：全部为空 / 单分类为空，文案不同
 *   ⑤ 保存到本地（<a download>）
 *   ⑥ 返回：?from=15 → 15 页
 *   ⑦ 15 页顶栏有背包小图标且指向本页
 *   ⑧ 分类配置与 15 页一致（含「情侣」显示名 vs 4【情头】目录）
 *
 * 用法：PAGES_DIR=/data/workspace node verify_beibao.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));
const 源码 = 读('16_beibao.html');
const 源码15 = 读('15_tuku.html');

function 起页面(数据, url) {
    return kit.起页面('16_beibao.html',
        url || 'http://localhost/16.html?from=15', 数据 || {}, errors, '背包');
}
const 点 = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async function main() {

    console.log('[A] ★ 空背包：显示空态，不报错');
    {
        const w = await 起页面();
        await 等(300);
        ok(!!w.document.querySelector('.背包空'), '★ 没扭过时显示空态');
        ok(w.document.querySelectorAll('.背包格').length === 0, '★ 空态下没有格子');
        ok(/扭蛋机/.test(w.document.querySelector('.背包空').textContent),
            '★ 空态引导回扭蛋机（实际 ' + w.document.querySelector('.背包空').textContent + '）');
    }

    console.log('\n[B] ★★ 只展示已扭到的（与 15 页共用「图库已获」）');
    {
        const 数据 = { '图库已获': JSON.stringify({ 男头: [2, 5], 双女: [3] }) };
        const w = await 起页面(数据);
        await 等(350);
        /* 全部：男头 2 + 双女 1 = 3 件 */
        ok(w.document.querySelectorAll('.背包格').length === 3,
            '★ ★ 只列出已获的 3 件（实际 ' + w.document.querySelectorAll('.背包格').length + '）');

        const 名 = Array.from(w.document.querySelectorAll('.背包名')).map(e => e.textContent);
        ok(名.join('|') === '男头 No.2|男头 No.5|双女 第 3 对',
            '★ ★ 「全部」模式名字带分类前缀（实际 ' + 名.join('|') + '）');

        /* 成対类一格两张，且编号是 (2k-1, 2k) */
        const 双格 = w.document.querySelector('.背包格[data-分类="双女"]');
        const 号组 = Array.from(双格.querySelectorAll('.背包图')).map(i => i.dataset.号);
        ok(号组.join() === '5,6',
            '★ ★ 双女第 3 对 = 5、6（实际 ' + 号组.join('、') + '）');
        ok(/4【双女】\/5/.test(双格.querySelector('.背包图').getAttribute('src') || ''),
            '★ 路径对（实际 ' + 双格.querySelector('.背包图').getAttribute('src') + '）');
    }

    console.log('\n[C] ★ 分类切换：全部 + 男头 / 女头 / 双女 / 情侣');
    {
        const 数据 = { '图库已获': JSON.stringify({ 男头: [1, 2, 3], 女头: [7], 情头: [2] }) };
        const w = await 起页面(数据);
        await 等(350);
        const 钮 = Array.from(w.document.querySelectorAll('.分类钮')).map(b => b.textContent);
        ok(钮.join('/') === '全部/男头/女头/双女/情侣',
            '★ 分类栏 = 全部 + 四个分类（实际 ' + 钮.join('/') + '）');

        ok(w.document.querySelectorAll('.背包格').length === 5, '★ 全部 = 5 件');

        w.背包.切分类('男头');
        await 等(150);
        ok(w.背包.条目数() === 3, '★ 男头 3 件（实际 ' + w.背包.条目数() + '）');
        /* 单分类下【不带】前缀（已经知道是哪类了） */
        const 名单 = Array.from(w.document.querySelectorAll('.背包名')).map(e => e.textContent);
        ok(名单.every(n => !/男头/.test(n)),
            '★ 单分类下名字不带分类前缀（实际 ' + 名单.join('|') + '）');

        w.背包.切分类('双女');
        await 等(150);
        ok(!!w.document.querySelector('.背包空'), '★ 双女没收藏 → 空态');
        ok(/这个分类/.test(w.document.querySelector('.背包空').textContent),
            '★ 单分类空态文案不同（实际 ' + w.document.querySelector('.背包空').textContent + '）');

        /* ★★ 显示「情侣」但目录是 4【情头】，别写反 */
        w.背包.切分类('情头');
        await 等(150);
        const 格 = w.document.querySelector('.背包格');
        ok(!!格, '★ 情头有收藏');
        ok(/4【情头】\//.test(格.querySelector('.背包图').getAttribute('src') || ''),
            '★ ★ 显示「情侣」但读的是 4【情头】/（实际 '
            + 格.querySelector('.背包图').getAttribute('src') + '）');
        ok(格.querySelectorAll('.背包图').length === 2, '★ 情头一格 2 张（一对）');
    }

    console.log('\n[D] ★ 一行两列 · 可保存');
    {
        const 块 = /\.背包网格\s*\{([^}]*)\}/.exec(源码);
        ok(!!块 && /grid-template-columns:\s*repeat\(2/.test(块[1]),
            '★ ★ 背包是一行两列（实际 ' + (块 && /grid-template-columns:[^;]+/.exec(块[1])) + '）');

        const 数据 = { '图库已获': JSON.stringify({ 女头: [1] }) };
        const w = await 起页面(数据);
        await 等(350);
        const 存 = w.document.querySelector('.背包存');
        ok(!!存, '★ 每格有保存入口');
        ok(!!存.querySelector('svg'), '★ 保存是图标 + 文字');
        ok(/a\.download = /.test(源码), '★ 下载走 <a download>');
        ok(/document\.body\.appendChild\(a\)/.test(源码), '★ 下载链接挂到 DOM 再点');
    }

    console.log('\n[E] ★ 返回 & 15 页入口 & 配置一致性');
    {
        const w = await 起页面();
        await 等(300);
        ok(w.取返回页() === '15_tuku.html',
            '★ from=15 → 回 15 页（实际 ' + w.取返回页() + '）');

        ok(/背包钮[\s\S]{0,200}16_beibao\.html/.test(源码15),
            '★ ★ 15 页顶栏背包图标指向本页');
        ok(/id="背包钮"/.test(源码15), '★ 15 页有背包图标');
        ok(!/id="背包网格"/.test(源码15), '★ 15 页已不再内嵌背包网格');

        /* ★★ 两份分类配置必须一致（改一边忘另一边就串了） */
        const 抓 = t => {
            const m = [];
            const re = /\{\s*键:\s*'([^']+)',\s*名:\s*'([^']+)',\s*目录:\s*'([^']+)',\s*数量:\s*(\d+),\s*每扭:\s*(\d+)\s*\}/g;
            let x; while ((x = re.exec(t))) m.push(x[1] + '|' + x[2] + '|' + x[3] + '|' + x[4] + '|' + x[5]);
            return m;
        };
        const a = 抓(源码15), b = 抓(源码);
        ok(a.length === 4 && b.length === 4,
            '★ 两边都解析出 4 个分类（15 页 ' + a.length + ' / 背包页 ' + b.length + '）');
        ok(a.length === b.length && a.every((v, i) => v === b[i]),
            '★ ★ 两边分类配置逐项一致（目录/数量/每扭）');
    }

    console.log('\n[F] ★ 图片探测与统计');
    {
        ok(/img\.onerror = \(\)/.test(源码),
            '★ 图片探测用 onerror 赋值（addEventListener 会叠加）');
        ok(/\['png', 'jpg', 'jpeg', 'webp'\]/.test(源码), '★ 按 png→jpg→jpeg→webp 试');

        const 数据 = { '图库已获': JSON.stringify({ 男头: [1, 2], 女头: [9] }) };
        const w = await 起页面(数据);
        await 等(350);
        ok(/共收藏/.test(w.document.getElementById('统计条').textContent),
            '★ 有收藏统计（实际 ' + w.document.getElementById('统计条').textContent + '）');
        ok(/3/.test(w.document.getElementById('统计条').textContent),
            '★ 统计数字对（实际 ' + w.document.getElementById('统计条').textContent + '）');
    }

    console.log('\n[C2] ★★★ 成対类：背包里也要显示一整对（两张并排，不能被裁）');
    {
        /* ★★ 同 15 页那个坑：min-width:0 必须有 */
        const 对块 = /\.背包对\s*\{([^}]*)\}/.exec(源码);
        const 图块 = /\.背包对 \.背包图\s*\{([^}]*)\}/.exec(源码);
        ok(!!对块 && /display:\s*flex/.test(对块[1]), '★ 成対容器是 flex 并排');
        ok(!!图块 && /min-width:\s*0/.test(图块[1]),
            '★ ★★ 有 min-width: 0（否则大图撑开、第二张被裁）');
        ok(!!图块 && /flex:\s*1 1 0/.test(图块[1]), '★ ★★ 有 flex: 1 1 0（两张各占一半）');
        ok(!!图块 && /width:\s*auto/.test(图块[1]), '★ width: auto');

        const 数据 = { '图库已获': JSON.stringify({ 双女: [1, 3], 情头: [2] }) };
        const w = await 起页面(数据);
        await 等(350);

        const 双格 = w.document.querySelector('.背包格[data-分类="双女"]');
        ok(双格.querySelectorAll('.背包图').length === 2,
            '★ ★ 双女一格 2 张（实际 ' + 双格.querySelectorAll('.背包图').length + '）');
        const 号组 = Array.from(双格.querySelectorAll('.背包图')).map(i => i.dataset.号);
        ok(号组.join() === '1,2', '★ 第 1 对 = 1、2（实际 ' + 号组.join('、') + '）');
        const src组 = Array.from(双格.querySelectorAll('.背包图')).map(i => i.getAttribute('src'));
        ok(src组[0] !== src组[1], '★ ★ 两张 src 不同（实际 ' + src组.join(' vs ') + '）');

        const 情格 = w.document.querySelector('.背包格[data-分类="情头"]');
        ok(情格.querySelectorAll('.背包图').length === 2, '★ 情头一格 2 张');
        const 情号 = Array.from(情格.querySelectorAll('.背包图')).map(i => i.dataset.号);
        ok(情号.join() === '3,4', '★ 情头第 2 对 = 3、4（实际 ' + 情号.join('、') + '）');
        ok(/4【情头】\/3/.test(情格.querySelector('.背包图').getAttribute('src') || ''),
            '★ 情头路径对（实际 ' + 情格.querySelector('.背包图').getAttribute('src') + '）');

        /* ★★ 一对占满整行：左一张 右一张 */
        ok(/\.背包格\.成対\s*\{[^}]*grid-column:\s*1 \/ -1/.test(源码),
            '★ ★★ 成対格子 grid-column: 1 / -1（占满整行）');
        ok(双格.classList.contains('成対'), '★ 双女格带 .成対');
        ok(情格.classList.contains('成対'), '★ 情头格带 .成対');

        /* 单张类不带 */
        const 数据2 = { '图库已获': JSON.stringify({ 男头: [1], 双女: [1] }) };
        const w3 = await 起页面(数据2);
        await 等(350);
        ok(!w3.document.querySelector('.背包格[data-分类="男头"]').classList.contains('成対'),
            '★ 男头（单张）不带 .成対');
        ok(w3.document.querySelectorAll('.背包格.成対').length === 1,
            '★ 只有成対的格子带 .成対（实际 '
            + w3.document.querySelectorAll('.背包格.成対').length + '）');

        const 块 = /\.背包对\s*\{([^}]*)\}/.exec(源码);
        ok(/flex-direction:\s*row/.test(块[1]), '★ 显式 row（左右并排）');
        ok(/flex-wrap:\s*nowrap/.test(块[1]), '★ nowrap（不换行）');
    }

    console.log('\n[G] ★★ 主题背景：背包页也要有');
    {
        const w = await 起页面({ '主题背景': JSON.stringify({ 源: '默认', 索引: 4 }) });
        await 等(400);
        const 图 = w.document.querySelector('.主题背景图片');
        ok(!!图, '★ 页面里有主题背景图元素');
        ok(!!图 && /2【图片】\/背景4\.png/.test(图.getAttribute('src') || ''),
            '★ ★ 内置索引 4 → 背景4.png（实际 ' + (图 && 图.getAttribute('src')) + '）');

        const w2 = await 起页面({ '主题背景': JSON.stringify({ 源: '自定义', 数据: 'data:image/png;base64,BBBB' }) });
        await 等(400);
        ok(/data:image\/png;base64,BBBB/.test(
               w2.document.querySelector('.主题背景图片').getAttribute('src') || ''),
            '★ 自定义主题（dataURL）直接生效');

        const w3 = await 起页面({});
        await 等(400);
        ok(!!w3.document.querySelector('.主题背景图片'), '★ 没设置时元素仍在');
        ok(/<img class="主题背景图片"[^>]*src="2【图片】\/默认主题背景\.png"/.test(源码),
            '★ 没设置时用默认主题背景（HTML 里写死）');

        /* 层级与全站一致 */
        ok(/\.主题背景图片\s*\{[^}]*z-index:\s*0/.test(源码), '★ 背景图 z-index 0');
        const 遮块 = /\.全局白色遮罩\s*\{([^}]*)\}/.exec(源码);
        ok(!!遮块 && /z-index:\s*1\b/.test(遮块[1]), '★ ★ 白色遮罩 z-index 1（与全站一致）');
    }

    收尾(errors, '✅ 我的背包（16_beibao）全部通过');
})().catch(e => { console.error(e); process.exit(2); });
