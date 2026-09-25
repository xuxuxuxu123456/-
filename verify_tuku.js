/**
 * verify_tuku.js —— 图库扭蛋机（15_tuku）专项验证
 *
 * 覆盖：
 *   ① 四个分类配置正确（目录名 / 数量 / 每扭张数），尤其「显示名≠目录名」
 *   ② 单张类（男头/女头）：一格一张图；成対类（双女/情头）：一格一对图
 *   ③ 成对编号规则 (2k-1, 2k)
 *   ④ 扭蛋扣 0.5 币；余额不足 → 提示 + 自动开充值
 *   ⑤ 充值：可自行输入任意金额；快捷档；金额清洗
 *   ⑥ 已解锁 → 清晰 + 有下载角；未解锁 → 模糊 + 水印条
 *   ⑦ 已获清单写进 localStorage 并持久化
 *   ⑧ 扭到的结果展示（一张 / 一张对）+ 保存按钮
 *   ⑨ 返回页：?from=1 → 1 页
 *   ⑩ 图片扩展名探测用 onerror 赋值
 *
 * 用法：PAGES_DIR=/data/workspace node verify_tuku.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));
const 源码 = 读('15_tuku.html');

/** 起一个页面，可带初始存档 */
function 起页面(数据, url) {
    return kit.起页面('15_tuku.html',
        url || 'http://localhost/15.html?from=1', 数据 || {}, errors, '图库');
}

const 点 = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async function main() {

    console.log('[A] ★ 四个分类：显示名 / 目录 / 数量 / 每扭张数');
    {
        const w = await 起页面();
        await 等(300);
        const 表 = w.图库.分类表;
        ok(表.length === 4, '★ 共 4 个分类（实际 ' + 表.length + '）');

        const 期望 = [
            { 键: '男头', 名: '男头', 目录: '4【男头】/', 数量: 6,  每扭: 1 },
            { 键: '女头', 名: '女头', 目录: '4【女头】/', 数量: 50, 每扭: 1 },
            { 键: '双女', 名: '双女', 目录: '4【双女】/', 数量: 42, 每扭: 2 },
            { 键: '情头', 名: '情侣', 目录: '4【情头】/', 数量: 34, 每扭: 2 },
        ];
        期望.forEach(e => {
            const 实 = 表.find(c => c.键 === e.键);
            ok(!!实, '★ 存在分类 ' + e.键);
            if (!实) return;
            ok(实.目录 === e.目录, '★ ' + e.键 + ' 目录 = ' + e.目录 + '（实际 ' + 实.目录 + '）');
            ok(实.数量 === e.数量, '★ ' + e.键 + ' 数量 = ' + e.数量 + '（实际 ' + 实.数量 + '）');
            ok(实.每扭 === e.每扭, '★ ' + e.键 + ' 每扭 ' + e.每扭 + ' 张（实际 ' + 实.每扭 + '）');
        });
        /* ★★ 最容易写反的一处：显示叫「情侣」，目录却是 4【情头】 */
        const 情 = 表.find(c => c.键 === '情头');
        ok(情.名 === '情侣', '★ ★ 显示名「情侣」但目录是 4【情头】（实际名 ' + 情.名 + '）');

        /* 界面上四个 tab 的文字顺序 */
        const 钮 = Array.from(w.document.querySelectorAll('.分类钮')).map(b => b.textContent);
        ok(钮.join('') === '男头女头双女情侣',
            '★ 界面 tab 为 男头/女头/双女/情侣（实际 ' + 钮.join('/') + '）');
    }

    console.log('\n[B] ★★ 单张类扭 1 张、成対类扭一对；编号规则 (2k-1, 2k)');
    {
        const w = await 起页面();
        await 等(300);
        const 表 = w.图库.分类表;

        const 男 = 表.find(c => c.键 === '男头');
        ok(w.图库.单元数(男) === 6, '★ 男头 6 个单元（每张一个）');
        ok(w.图库.单元图片号(男, 1).join() === '1', '★ 男头第 1 单元 = [1]');

        const 女 = 表.find(c => c.键 === '女头');
        ok(w.图库.单元数(女) === 50, '★ 女头 50 个单元');

        const 双 = 表.find(c => c.键 === '双女');
        ok(w.图库.单元数(双) === 21, '★ ★ 双女 42 张 → 21 对（实际 ' + w.图库.单元数(双) + '）');
        ok(w.图库.单元图片号(双, 1).join() === '1,2', '★ 双女第 1 对 = 1、2');
        ok(w.图库.单元图片号(双, 2).join() === '3,4', '★ 双女第 2 对 = 3、4');
        ok(w.图库.单元图片号(双, 21).join() === '41,42', '★ 双女第 21 对 = 41、42');

        const 情 = 表.find(c => c.键 === '情头');
        ok(w.图库.单元数(情) === 17, '★ ★ 情头 34 张 → 17 对（实际 ' + w.图库.单元数(情) + '）');
        ok(w.图库.单元图片号(情, 17).join() === '33,34', '★ 情头第 17 对 = 33、34');
    }

    console.log('\n[C] ★ 图鉴：单张一格一张，成対一格两张');
    {
        const w = await 起页面();
        await 等(300);
        let 格 = w.document.querySelectorAll('.图鉴格');
        ok(格.length === 6, '★ 男头 6 格（实际 ' + 格.length + '）');
        ok(格[0].querySelectorAll('.图鉴图').length === 1, '★ 男头每格 1 张图');

        w.图库.切分类('双女');
        await 等(150);
        格 = w.document.querySelectorAll('.图鉴格');
        ok(格.length === 21, '★ 双女 21 格（实际 ' + 格.length + '）');
        ok(格[0].querySelectorAll('.图鉴图').length === 2, '★ ★ 双女每格 2 张（一对）');

        const 对 = 格[2].querySelectorAll('.图鉴图');
        ok(Array.from(对).map(i => i.dataset.号).join() === '5,6',
            '★ 第 3 格是 5、6（实际 ' + Array.from(对).map(i => i.dataset.号).join() + '）');

        w.图库.切分类('情头');
        await 等(150);
        ok(w.document.querySelectorAll('.图鉴格').length === 17, '★ 情头 17 格');
        ok(w.document.querySelectorAll('.图鉴格')[0].querySelectorAll('.图鉴图').length === 2,
            '★ 情头每格 2 张');
    }

    console.log('\n[C2] ★★ 预览区：一行两列 · 清晰 · 无水印 · 不可点放大');
    {
        const w = await 起页面();
        await 等(300);

        /* ★★ 一行两列 */
        const 块 = /\.图鉴网格\s*\{([^}]*)\}/.exec(源码);
        ok(!!块 && /grid-template-columns:\s*repeat\(2/.test(块[1]),
            '★ ★ 预览是一行两列（实际 ' + (块 && /grid-template-columns:[^;]+/.exec(块[1])) + '）');

        /* ★★ 没有水印条了 */
        ok(w.document.querySelectorAll('.水印条').length === 0,
            '★ ★ 预览区已删除水印条');
        ok(!/\.水印条\s*\{/.test(源码), '★ 源码里 .水印条 样式已删除');

        /* ★★ 看得清：不模糊 */
        const 图块 = /\.图鉴图\s*\{([^}]*)\}/.exec(源码);
        ok(!!图块 && !/blur/.test(图块[1]), '★ ★ 预览图不模糊（看得清）');
        ok(!/\.图鉴格\.未解锁/.test(源码), '★ 不再有「未解锁」模糊规则');

        /* ★★ 不能点击放大：没有任何下载/放大入口，也没绑 click */
        ok(w.document.querySelectorAll('.下载角').length === 0,
            '★ ★ 预览区没有下载角（实际 ' + w.document.querySelectorAll('.下载角').length + '）');
        ok(!/\.下载角\s*\{/.test(源码), '★ 源码里 .下载角 样式已删除');
        ok(!/图鉴网格[\s\S]{0,400}addEventListener\('click'/.test(源码),
            '★ ★ 预览网格没有绑点击（不能放大）');
        /* ★ 先剥掉注释再查：注释里会提到这些词，不剥会假失败 */
        const 净码 = 源码.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        ok(!/lightbox|放大预览|大图遮罩|预览遮罩/.test(净码),
            '★ 没有全屏预览 / 放大相关的实现');

        /* 状态改用底部小标签，不压在图上 */
        const 标 = w.document.querySelector('.图鉴标');
        ok(!!标, '★ 有底部状态标签（不遮挡画面）');
        ok(/未获得/.test(标.textContent), '★ 未扭到的标「未获得」（实际 ' + 标.textContent + '）');

        w.图库.充值(5);
        点(w, w.document.getElementById('扭一次钮'));
        await 等(900);
        /* 扭到的是随机单元，所以查「是否存在已获得标签」而不是查第 1 格 */
        ok(Array.from(w.document.querySelectorAll('.图鉴标'))
              .some(e => /已获得/.test(e.textContent)),
            '★ 扭到后对应格子标签变「已获得」');
    }

    console.log('\n[C2b] ★★ 背包改成顶栏小图标 → 进 16_beibao');
    {
        const w = await 起页面();
        await 等(300);
        ok(!w.document.getElementById('背包网格'),
            '★ ★ 本页不再内嵌背包网格（已移到独立页）');
        const 钮 = w.document.getElementById('背包钮');
        ok(!!钮, '★ 顶栏有背包小图标');
        ok(!!钮.querySelector('svg'), '★ 背包是小图标（svg，不是文字块）');
        ok(钮.getAttribute('aria-label') === '我的背包', '★ 图标有无障碍标签');
        /* 点它 → 去 16 页 */
        ok(/背包钮[\s\S]{0,200}16_beibao\.html/.test(源码),
            '★ ★ 点背包图标 → 跳转 16_beibao.html');
    }

    console.log('\n[D] ★ 预览格子数与单元数一致（单张 1 格、成対 1 格 2 图）');
    {
        const w = await 起页面();
        await 等(300);
        ok(w.document.querySelectorAll('.图鉴格').length === 6, '★ 男头 6 格');

        w.图库.切分类('双女');
        await 等(150);
        const 格 = w.document.querySelectorAll('.图鉴格');
        ok(格.length === 21, '★ 双女 21 格');
        ok(格[0].querySelectorAll('.图鉴图').length === 2, '★ 每格 2 张（一对）');
    }

    console.log('\n[E] ★★ 虚拟货币：0.5 一次；不足时提示并自动开充值');
    {
        const w = await 起页面();
        await 等(300);
        ok(w.图库.取余额() === 0, '★ 初始余额 0');
        ok(w.document.getElementById('货币数').textContent === '0', '★ 界面显示 0');
        ok(/0\.5/.test(w.document.getElementById('扭一次钮').textContent),
            '★ 按钮写明「0.5」（实际 ' + w.document.getElementById('扭一次钮').textContent + '）');

        /* 余额 0 → 点扭 → 扣不了，弹充值 */
        点(w, w.document.getElementById('扭一次钮'));
        await 等(150);
        ok(w.document.getElementById('充值遮罩').classList.contains('显示'),
            '★ ★ 余额不足 → 自动打开充值弹窗');
        ok(/余额不足/.test(w.document.getElementById('toast').textContent),
            '★ 给了提示（实际 ' + w.document.getElementById('toast').textContent + '）');
        ok(w.图库.取余额() === 0, '★ 没扣成负数');

        /* 充值 3 币 → 扭 6 次应正好花光 */
        w.图库.充值(3);
        ok(w.图库.取余额() === 3, '★ 充值后余额 3');
        for (let i = 0; i < 4; i++) { 点(w, w.document.getElementById('扭一次钮')); await 等(750); }
        ok(Math.abs(w.图库.取余额() - 1) < 1e-6,
            '★ ★ 扭 4 次扣 2.0（3 → 1，实际 ' + w.图库.取余额() + '）');
    }

    console.log('\n[F] ★ 充值弹窗：可自行输入金额 + 快捷档 + 金额清洗');
    {
        const w = await 起页面();
        await 等(300);
        点(w, w.document.getElementById('货币胶囊'));
        await 等(120);
        ok(w.document.getElementById('充值遮罩').classList.contains('显示'),
            '★ 点右上角货币胶囊 → 打开充值');

        const 入 = w.document.getElementById('金额输入');
        ok(!!入, '★ 有金额输入框（可自行输入）');

        /* 自由输入任意金额 */
        入.value = '12.34';
        点(w, w.document.getElementById('充值确认'));
        await 等(120);
        ok(Math.abs(w.图库.取余额() - 12.34) < 1e-6,
            '★ ★ 自行输入 12.34 → 余额 12.34（实际 ' + w.图库.取余额() + '）');
        ok(!w.document.getElementById('充值遮罩').classList.contains('显示'),
            '★ 确认后弹窗关闭');

        /* 快捷档 */
        点(w, w.document.getElementById('货币胶囊'));
        await 等(100);
        const 档 = Array.from(w.document.querySelectorAll('.档钮'));
        ok(档.length === 4, '★ 有 4 个快捷档（实际 ' + 档.length + '）');
        点(w, 档[2]);
        ok(入.value === '10', '★ 点第 3 档 → 输入框填 10（实际 ' + 入.value + '）');
        点(w, w.document.getElementById('充值确认'));
        await 等(120);
        ok(Math.abs(w.图库.取余额() - 22.34) < 1e-6,
            '★ 快捷档充值生效（实际 ' + w.图库.取余额() + '）');

        /* 金额清洗：非法字符要被洗掉 */
        点(w, w.document.getElementById('货币胶囊'));
        await 等(100);
        入.value = '1a2.3.4b5';
        入.dispatchEvent(new w.Event('input', { bubbles: true }));
        ok(入.value === '12.34', '★ 金额清洗：1a2.3.4b5 → 12.34（实际 ' + 入.value + '）');

        /* 空金额不给充 */
        入.value = '';
        点(w, w.document.getElementById('充值确认'));
        await 等(120);
        ok(w.document.getElementById('充值遮罩').classList.contains('显示'),
            '★ 空金额 → 弹窗不关（拦下了）');
        ok(/请输入/.test(w.document.getElementById('toast').textContent),
            '★ 提示输入金额（实际 ' + w.document.getElementById('toast').textContent + '）');
    }

    console.log('\n[G] ★ 扭蛋结果展示：单张 1 张、成対 2 张；重复要标明');
    {
        const w = await 起页面();
        await 等(300);
        w.图库.充值(10);

        点(w, w.document.getElementById('扭一次钮'));
        await 等(900);
        ok(w.document.getElementById('结果区').classList.contains('显示'), '★ 结果区显示');
        ok(w.document.querySelectorAll('.结果图').length === 1,
            '★ 男头 → 结果 1 张（实际 ' + w.document.querySelectorAll('.结果图').length + '）');
        ok(/^4【男头】\//.test(w.document.querySelector('.结果图').getAttribute('src') || ''),
            '★ 结果图路径对（实际 ' + w.document.querySelector('.结果图').getAttribute('src') + '）');

        w.图库.切分类('双女');
        await 等(150);
        点(w, w.document.getElementById('扭一次钮'));
        await 等(900);
        ok(w.document.querySelectorAll('.结果图').length === 2,
            '★ ★ 双女 → 结果 2 张（一对，实际 ' + w.document.querySelectorAll('.结果图').length + '）');
        const 号组 = Array.from(w.document.querySelectorAll('.结果图')).map(i => i.dataset.号);
        const a = Number(号组[0]), b = Number(号组[1]);
        ok(b === a + 1 && a % 2 === 1,
            '★ ★ 两张是连续的一对且奇前偶后（实际 ' + 号组.join('、') + '）');
        ok(/对/.test(w.document.getElementById('结果名').textContent),
            '★ 结果名写明是第几对（实际 ' + w.document.getElementById('结果名').textContent + '）');
    }

    console.log('\n[H] ★ 已获清单持久化（刷新后仍在）');
    {
        const 数据 = {};
        const w = await 起页面(数据);
        await 等(300);
        w.图库.充值(5);
        for (let i = 0; i < 3; i++) { 点(w, w.document.getElementById('扭一次钮')); await 等(750); }
        const 存 = JSON.parse(数据['图库已获'] || '{}');
        ok(Array.isArray(存.男头) && 存.男头.length >= 1,
            '★ 已获写进 localStorage（实际 ' + JSON.stringify(存) + '）');
        ok(存.男头.every(n => n >= 1 && n <= 6), '★ 编号都在 1~6 内');

        /* 重进页面 → 解锁状态还在 */
        const w2 = await 起页面(数据);
        await 等(350);
        ok(w2.document.querySelectorAll('.图鉴标.已获得').length === 存.男头.length,
            '★ ★ 重进后「已获得」状态保留（实际 '
            + w2.document.querySelectorAll('.图鉴标.已获得').length + '）');
        ok(/已收集/.test(w2.document.getElementById('扭蛋说明').textContent),
            '★ 进度文案显示已收集数');
    }

    console.log('\n[I] ★ 保存 / 下载：结果区可存，图鉴不可存');
    {
        const w = await 起页面();
        await 等(300);
        ok(!!w.document.getElementById('保存钮'), '★ 结果区有保存按钮');
        ok(/保存/.test(w.document.getElementById('保存钮').textContent),
            '★ 保存按钮文案（实际 ' + w.document.getElementById('保存钮').textContent.trim() + '）');

        w.图库.充值(2);
        点(w, w.document.getElementById('扭一次钮'));
        await 等(900);
        /* ★ 图鉴（预览）里【没有】下载角 —— 要保存得去背包页 */
        ok(w.document.querySelectorAll('.下载角').length === 0,
            '★ ★ 预览区没有下载角（保存只在背包页）');

        /* 下载用 <a download> */
        ok(/a\.download = /.test(源码), '★ 下载走 <a download>（保存到本地）');
        ok(/document\.body\.appendChild\(a\)/.test(源码),
            '★ 下载链接挂到 DOM 再点（游离元素在部分浏览器不触发）');
    }

    console.log('\n[J] ★ 返回 & 图片探测 & 1 页入口');
    {
        const w = await 起页面();
        await 等(300);
        ok(w.取返回页() === '1_shouyeyulan.html',
            '★ from=1 → 回 1 页（实际 ' + w.取返回页() + '）');

        ok(/img\.onerror = \(\)/.test(源码),
            '★ ★ 图片探测用 onerror 【赋值】（addEventListener 会叠加监听器）');
        ok(/\['png', 'jpg', 'jpeg', 'webp'\]/.test(源码),
            '★ 按 png → jpg → jpeg → webp 逐个试');

        const 首页 = 读('1_shouyeyulan.html');
        ok(/扭蛋机:\s*'15_tuku\.html\?from=1'/.test(首页),
            '★ 1 页加号菜单「扭蛋机」指向 15_tuku.html?from=1');
        ok(/data-动作="扭蛋机"/.test(首页), '★ 菜单项 data-动作 = 扭蛋机');
        ok(/<span class="添加菜单文字">扭蛋机<\/span>/.test(首页),
            '★ ★ 菜单显示文字是「扭蛋机」（不是只改了属性）');
        ok(!/添加菜单文字">图库</.test(首页), '★ 界面上已没有「图库」文字');
        ok(!/扭蛋机:\s*'9_zhutishezhi/.test(首页), '★ 不再指向 9 页主题设置');

        /* 页面自身标题 */
        ok(/<title>扭蛋机<\/title>/.test(源码), '★ 页面 title 是「扭蛋机」');
        ok(/id="页面标题">扭蛋机</.test(源码), '★ 顶栏标题是「扭蛋机」');
    }

    console.log('\n[K] ★★ 主题背景：扭蛋页也要有（与 1~10 页同款）');
    {
        /* ① 内置主题：索引 3 → 背景3.png */
        const w = await 起页面({ '主题背景': JSON.stringify({ 源: '默认', 索引: 3 }) });
        await 等(400);
        const 图 = w.document.querySelector('.主题背景图片');
        ok(!!图, '★ 页面里有主题背景图元素');
        ok(!!图 && /2【图片】\/背景3\.png/.test(图.getAttribute('src') || ''),
            '★ ★ 内置索引 3 → 背景3.png（实际 ' + (图 && 图.getAttribute('src')) + '）');

        /* ② 自定义（dataURL）直接生效 */
        const w2 = await 起页面({ '主题背景': JSON.stringify({ 源: '自定义', 数据: 'data:image/png;base64,AAAA' }) });
        await 等(400);
        ok(/data:image\/png;base64,AAAA/.test(
               w2.document.querySelector('.主题背景图片').getAttribute('src') || ''),
            '★ ★ 自定义主题（dataURL）直接生效');

        /* ③ 没设置 → 保持页面写死的默认图，不能空白。
              ★ 用源码级断言：testkit 会剥掉 2【图片】/ 的 src（沙盒无素材），
                运行时读到的必然是空，只能查 HTML 里写死的值。 */
        ok(/<img class="主题背景图片"[^>]*src="2【图片】\/默认主题背景\.png"/.test(源码),
            '★ 没设置时用默认主题背景（HTML 里写死）');
        const w3 = await 起页面({});
        await 等(400);
        ok(!!w3.document.querySelector('.主题背景图片'), '★ 没设置时元素仍在（不会空白到没有图层）');

        /* ④ 层级：背景图在最底、白色遮罩压在其上、内容在最上 */
        ok(/\.主题背景图片\s*\{[^}]*z-index:\s*0/.test(源码), '★ 背景图 z-index 0（最底）');
        const 遮块 = /\.全局白色遮罩\s*\{([^}]*)\}/.exec(源码);
        ok(!!遮块 && /z-index:\s*1\b/.test(遮块[1]),
            '★ ★ 白色遮罩 z-index 1（与 1~10 页一致，压在背景图上）');
        ok(/rgba\(var\(--panel\), 0\.45\)/.test(遮块[1]), '★ 遮罩是 0.45 白（与全站一致）');
    }

    console.log('\n[K2] ★★★ 成対类：一对的两张都要并排显示出来（不能被裁）');
    {
        /* ★★ 这是真出过 bug 的地方：
             flex item 的 min-width 默认 auto，对 <img> 解析成【原始宽度】，
             大图无法收缩 → 第二张被挤到容器外，而格子有 overflow:hidden，
             直接裁掉 —— 表现就是「一对只看到一张」。
             必须 flex:1 1 0 + min-width:0。 */
        const 对块 = /\.图鉴对\s*\{([^}]*)\}/.exec(源码);
        const 图块 = /\.图鉴对 \.图鉴图\s*\{([^}]*)\}/.exec(源码);
        ok(!!对块 && /display:\s*flex/.test(对块[1]), '★ 成対容器是 flex 并排');
        ok(!!图块 && /min-width:\s*0/.test(图块[1]),
            '★ ★★ 有 min-width: 0（否则大图撑开、第二张被裁）');
        ok(!!图块 && /flex:\s*1 1 0/.test(图块[1]),
            '★ ★★ 有 flex: 1 1 0（两张各占一半）');
        ok(!!图块 && /width:\s*auto/.test(图块[1]),
            '★ width: auto（不再写死 100% 撑爆容器）');

        /* 运行时：一格确实是两张，且编号连续 */
        const w = await 起页面();
        await 等(300);
        w.图库.切分类('双女');
        await 等(150);
        const 格 = w.document.querySelectorAll('.图鉴格');
        ok(格.length === 21, '★ 双女 21 格（实际 ' + 格.length + '）');
        ok(格[0].querySelectorAll('.图鉴图').length === 2,
            '★ ★ 双女每格渲染 2 张（实际 ' + 格[0].querySelectorAll('.图鉴图').length + '）');
        const 号组 = Array.from(格[2].querySelectorAll('.图鉴图')).map(i => i.dataset.号);
        ok(号组.join() === '5,6', '★ 第 3 格是 5、6（实际 ' + 号组.join('、') + '）');

        /* 两张的 src 必须不同（不能渲染成同一张） */
        const src组 = Array.from(格[0].querySelectorAll('.图鉴图')).map(i => i.getAttribute('src'));
        ok(src组[0] !== src组[1], '★ ★ 两张 src 不同（实际 ' + src组.join(' vs ') + '）');

        w.图库.切分类('情头');
        await 等(150);
        const 情格 = w.document.querySelectorAll('.图鉴格');
        ok(情格[0].querySelectorAll('.图鉴图').length === 2, '★ 情头每格也 2 张');
        ok(/4【情头】\//.test(情格[0].querySelector('.图鉴图').getAttribute('src') || ''),
            '★ 情头路径指向 4【情头】/');
    }

    console.log('\n[K3] ★★★ 成対类：一对占满整行（左一张 右一张）');
    {
        /* ★★ 一对如果只占半行，两张就各只有 1/4 屏宽 —— 既看不清，
             也看不出这两张是一对。必须 grid-column: 1 / -1 撑满整行。 */
        ok(/\.图鉴格\.成対\s*\{[^}]*grid-column:\s*1 \/ -1/.test(源码),
            '★ ★★ 成対格子 grid-column: 1 / -1（占满整行）');

        const w = await 起页面();
        await 等(300);

        /* 单张类：不加 .成対，一行两列各一张 */
        ok(w.document.querySelectorAll('.图鉴格.成対').length === 0,
            '★ 男头（单张）没有 .成対（一行两列各一张）');

        w.图库.切分类('双女');
        await 等(150);
        const 双格 = w.document.querySelectorAll('.图鉴格');
        ok(双格.length === 21, '★ 双女 21 格');
        ok(w.document.querySelectorAll('.图鉴格.成対').length === 21,
            '★ ★★ 双女每一格都带 .成対（实际 '
            + w.document.querySelectorAll('.图鉴格.成対').length + '）');
        ok(双格[0].classList.contains('成対'), '★ 双女第 1 格 class 含「成対」');

        w.图库.切分类('情头');
        await 等(150);
        ok(w.document.querySelectorAll('.图鉴格.成対').length === 17,
            '★ ★★ 情头 17 格全部 .成対（实际 '
            + w.document.querySelectorAll('.图鉴格.成対').length + '）');

        /* 容器内两张是横向并排 */
        const 块 = /\.图鉴对\s*\{([^}]*)\}/.exec(源码);
        ok(/flex-direction:\s*row/.test(块[1]), '★ 显式 row（左右并排，不是上下）');
        ok(/flex-wrap:\s*nowrap/.test(块[1]), '★ nowrap（不会被挤到换行）');
        ok(/gap:\s*clamp\(4px/.test(块[1]), '★ 两张之间有间距（看得出是两张）');
    }

    console.log('\n[L] ★★ 图片命名范围：每个分类从 1 连续到 N');
    {
        const w = await 起页面();
        await 等(300);
        const 表 = w.图库.分类表;
        const 期望 = { 男头: 6, 女头: 50, 双女: 42, 情头: 34 };

        Object.keys(期望).forEach(键 => {
            const 类 = 表.find(c => c.键 === 键);
            const N = 期望[键];
            ok(类.数量 === N, '★ ' + 键 + ' 共 ' + N + ' 张（实际 ' + 类.数量 + '）');

            /* ★ 逐个访问，确认编号就是 1..N（没有 0 起步、也没有跳号） */
            const 全 = [];
            const 总单元 = w.图库.单元数(类);
            for (let k = 1; k <= 总单元; k++) 全.push(...w.图库.单元图片号(类, k));
            ok(全.length === N, '★ ' + 键 + ' 覆盖到 ' + N + ' 张（实际 ' + 全.length + '）');
            ok(全[0] === 1, '★ ' + 键 + ' 从 1 开始（实际 ' + 全[0] + '）');
            ok(全[全.length - 1] === N, '★ ' + 键 + ' 到 ' + N + ' 为止（实际 ' + 全[全.length - 1] + '）');
            const 连续 = 全.every((v, i) => v === i + 1);
            ok(连续, '★ ★ ' + 键 + ' 编号 1~' + N + ' 连续无跳号');
        });
    }

    console.log('\n[M] ★★ 可下滑，但看不见侧边滚动条');
    {
        const src = 读('15_tuku.html');
        /* 取 .手机界面内容 的规则块（只取第一条声明块，别把 ::-webkit 那条混进来） */
        const 块 = /\.手机界面内容\s*\{([^}]*)\}/.exec(src);
        ok(!!块, '★ 有 .手机界面内容 滚动容器');

        const 声明 = 块 ? 块[1] : '';
        /* ★★ 关键：滚动能力必须在 —— 这就是「下滑」本身 */
        ok(/overflow-y:\s*auto/.test(声明),
            '★ ★★ 保留 overflow-y:auto（下滑功能仍在）');
        ok(!/overflow-y:\s*hidden/.test(声明),
            '★ ★★ 没有被改成 hidden（改了就滑不动了）');
        ok(/-webkit-overflow-scrolling:\s*touch/.test(声明),
            '★ 保留惯性滚动 touch（手机上跟手）');

        /* 滚动条三条隐藏规则：三端各管一个 */
        ok(/scrollbar-width:\s*none/.test(声明), '★ 隐藏滚动条：scrollbar-width（Firefox）');
        ok(/-ms-overflow-style:\s*none/.test(声明), '★ 隐藏滚动条：-ms-overflow-style（旧 Edge）');
        ok(/\.手机界面内容::-webkit-scrollbar\s*\{[^}]*display:\s*none/.test(src),
            '★ ★ 隐藏滚动条：::-webkit-scrollbar（Chrome / Safari）');

        /* 横向滚动条也要收掉（分类栏那类），且分类栏本身已隐藏 */
        ok(/\.分类栏::-webkit-scrollbar\s*\{[^}]*display:\s*none/.test(src),
            '★ 分类栏横滚条已隐藏（与内容区同款）');
    }

    收尾(errors, '✅ 图库扭蛋机（15_tuku）全部通过');
})().catch(e => { console.error(e); process.exit(2); });
