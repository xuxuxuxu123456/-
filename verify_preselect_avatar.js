/**
 * verify_preselect_avatar.js —— ★ 11 页「预选头像」专项
 *
 * 需求：创建 / 编辑人设时，点头像 → 来源面板多一项「预选头像」；
 *       点它进入预选界面，18 张内置素材宫格排列，点一张即用作头像。
 *       素材目录：3【人设预选头像】/预选1 ~ 预选18（与 2【图片】 同级）。
 *
 * 覆盖：
 *   [A] 来源面板四项，多出的必须是「预选头像」，且夹在相册与取消之间
 *   [B] ★ 点「预选头像」→ 进入预选界面（来源面板收起，预选遮罩显示）
 *   [C] ★ 18 个格子，路径逐个为 3【人设预选头像】/预选N（N = 1..18）
 *   [D] ★ 点第 N 格 → 草稿头像落为该路径，大头像/提示文案同步更新
 *   [E] ★ 点中即用，不进裁剪（裁剪遮罩没被打开）
 *   [F] 保存后落盘；刷新重进仍是这张（选中态打勾）
 *   [G] 返回 / Esc 关闭预选界面，且不改动头像
 *   [H] ★ 系统返回键：面板开着时先关面板，不退出界面
 *   [I] 扩展名探测：png → jpg → jpeg → webp，且用 onerror 赋值（不叠加监听）
 *   [J] 列表卡片同样能显示预选头像（走同一套探测）
 *
 * 用法：PAGES_DIR=/data/workspace node verify_preselect_avatar.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));
const 目录 = '3【人设预选头像】/';
const 全部序 = Array.from({ length: 18 }, (_, i) => i + 1);

function 起(搜索, 数据) {
    return 起页面('11_woderenshe.html',
        'http://localhost/11_woderenshe.html' + (搜索 || ''),
        数据 || {}, errors, '预选头像');
}

function 点(w, 元素) {
    元素.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}

/** 进编辑视图：新建 或 点第 N 张卡 */
async function 新建(w) {
    点(w, w.document.getElementById('新建钮'));
    await 等(80);
}
async function 进第N张(w, n) {
    const 卡 = w.document.querySelectorAll('.人设卡')[n];
    if (卡) 点(w, 卡);
    await 等(80);
}
async function 回列表(w) {
    点(w, w.document.getElementById('取消键'));
    await 等(80);
}

/** 点头像 → 展开来源面板 */
async function 开来源面板(w) {
    点(w, w.document.getElementById('头像大钮'));
    await 等(60);
}

(async function main() {
    const 源码 = 读('11_woderenshe.html');

    console.log('[A] 来源面板四项（比标准多「预选头像」）');
    {
        const w = await 起();
        await 等(150);
        await 新建(w);
        await 开来源面板(w);

        const d = w.document;
        ok(!!d.getElementById('来源预选'), '★ 存在「预选头像」入口');
        const 文 = Array.from(d.querySelectorAll('#来源遮罩 .来源项 .来源文字'))
            .map(e => e.textContent.trim());
        ok(文.join(' / ') === '拍摄 / 从手机相册选择 / 预选头像 / 取消',
            '★ 四项顺序正确（实际 ' + 文.join(' / ') + '）');
        // 「预选头像」在来源组内（与拍摄/相册同组），取消在组外
        const 组内 = Array.from(d.querySelectorAll('#来源遮罩 .来源组 .来源项'))
            .map(e => (e.querySelector('.来源文字') || {}).textContent);
        ok(组内.join('/') === '拍摄/从手机相册选择/预选头像',
            '★ 预选头像与拍摄/相册同组（实际 ' + 组内.join('/') + '）');
    }

    console.log('\n[B] ★ 点预选头像 → 进入预选界面');
    {
        const w = await 起();
        await 等(150);
        await 新建(w);
        await 开来源面板(w);
        点(w, w.document.getElementById('来源预选'));
        await 等(120);

        ok(w.document.getElementById('预选遮罩').classList.contains('显示'),
            '★ 预选界面已展开');
        ok(!w.document.getElementById('来源遮罩').classList.contains('显示'),
            '★ 来源面板同时收起（不叠在下面）');
        ok(!!w.document.getElementById('预选返回'), '★ 有返回按钮');
        ok(!!w.document.getElementById('预选网格'), '★ 有头像网格');
        ok(/预选头像|选择/.test(w.document.querySelector('.预选标题').textContent),
            '★ 顶栏标题（实际 ' + w.document.querySelector('.预选标题').textContent + '）');
    }

    console.log('\n[C] ★ 18 个格子，路径逐个正确');
    {
        const w = await 起();
        await 等(150);
        await 新建(w);
        await 开来源面板(w);
        点(w, w.document.getElementById('来源预选'));
        await 等(120);

        const 格们 = w.document.querySelectorAll('.预选格');
        ok(格们.length === 18, '★ 共 18 格（实际 ' + 格们.length + '）');
        ok(格们.length === w.document.querySelectorAll('.预选图').length,
            '每格一张图');
        const 序表 = Array.from(格们).map(g => +g.dataset.序);
        ok(序表.join(',') === 全部序.join(','), '★ 序号 1~18 齐全（实际 ' + 序表.join(',') + '）');

        const 路径们 = Array.from(w.document.querySelectorAll('.预选图'))
            .map(i => (i.getAttribute('src') || ''));
        const 期望 = 全部序.map(n => 目录 + '预选' + n + '.png');
        ok(路径们.join('|') === 期望.join('|'),
            '★ 首试路径为 ' + 目录 + '预选N.png（实际首格 ' + 路径们[0] + '）');
        ok(路径们.every(p => p.indexOf(目录) === 0),
            '★ 全部指向 3【人设预选头像】/ 目录');
    }

    console.log('\n[D][E] ★ 点第 N 格 → 直接用，不进裁剪');
    {
        const w = await 起();
        await 等(150);
        await 新建(w);
        await 开来源面板(w);
        点(w, w.document.getElementById('来源预选'));
        await 等(120);

        const 第三 = w.document.querySelectorAll('.预选格')[2];       // 预选3
        点(w, 第三);
        await 等(120);

        ok(!w.document.getElementById('预选遮罩').classList.contains('显示'),
            '★ 选完自动关闭预选界面');
        ok(!w.document.getElementById('裁剪遮罩').classList.contains('显示'),
            '★★ 预选头像不进裁剪（点中即用）');
        ok(w.document.getElementById('头像大').getAttribute('src') === 目录 + '预选3.png',
            '★ 大头像已换成 预选3（实际 '
            + w.document.getElementById('头像大').getAttribute('src') + '）');
        ok(!w.document.getElementById('头像大').classList.contains('空')
            && !w.document.getElementById('头像空态').classList.contains('显示'),
            '★ 空态收起（不再是虚线圆）');
        ok(/更换/.test(w.document.getElementById('头像提示').textContent),
            '★ 提示改为「点击头像可更换」（实际 '
            + w.document.getElementById('头像提示').textContent + '）');
        ok(第三.classList.contains('选中'), '★ 被选中的那格打勾');
    }

    console.log('\n[F] 保存后落盘 + 重进仍是这张');
    {
        const 共享 = { '联系人索引': '[]', '人设列表': '[]' };
        const w = await 起('', 共享);
        await 等(150);
        await 新建(w);
        await 开来源面板(w);
        点(w, w.document.getElementById('来源预选'));
        await 等(120);
        点(w, w.document.querySelectorAll('.预选格')[4]);           // 预选5
        await 等(100);

        ok(!JSON.parse(共享['人设列表'] || '[]').length, '★ 未保存 → 磁盘还是空的');
        w.document.getElementById('昵称输入').value = '乙';   // 保存要求昵称非空
        w.document.getElementById('昵称输入').dispatchEvent(new w.Event('input', { bubbles: true }));
        点(w, w.document.getElementById('保存钮'));
        await 等(150);
        const 落盘 = JSON.parse(共享['人设列表'] || '[]');
        ok(落盘.length === 1 && 落盘[0].头像 === 目录 + '预选5.png',
            '★ 保存后落盘为 ' + 目录 + '预选5.png（实际 '
            + (落盘[0] && 落盘[0].头像) + '）');

        // 重进：卡片显示预选头像，进编辑后该格仍打勾
        await 进第N张(w, 0);
        await 等(80);
        await 开来源面板(w);
        点(w, w.document.getElementById('来源预选'));
        await 等(120);
        const 选中们 = Array.from(w.document.querySelectorAll('.预选格.选中'));
        ok(选中们.length === 1 && 选中们[0].dataset.序 === '5',
            '★ 重进后第 5 格仍为选中态（实际 ' + 选中们.map(g => g.dataset.序).join(',') + '）');
    }

    console.log('\n[G] 返回 / Esc 关闭，且不改动头像');
    {
        const w = await 起();
        await 等(150);
        await 新建(w);
        await 开来源面板(w);
        点(w, w.document.getElementById('来源预选'));
        await 等(120);
        点(w, w.document.querySelectorAll('.预选格')[0]);      // 先选一个
        await 等(100);
        const 选后 = w.document.getElementById('头像大').getAttribute('src');

        // 再打开 → 点返回
        await 开来源面板(w);
        点(w, w.document.getElementById('来源预选'));
        await 等(120);
        点(w, w.document.getElementById('预选返回'));
        await 等(100);
        ok(!w.document.getElementById('预选遮罩').classList.contains('显示'),
            '★ 点返回 → 预选界面收起');
        ok(w.document.getElementById('头像大').getAttribute('src') === 选后,
            '★ 只是关面板，头像没被改动');

        // Esc
        await 开来源面板(w);
        点(w, w.document.getElementById('来源预选'));
        await 等(120);
        w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await 等(100);
        ok(!w.document.getElementById('预选遮罩').classList.contains('显示'),
            '★ Esc → 预选界面收起');
    }

    console.log('\n[H] ★ 系统返回键：面板开着时先关面板');
    {
        const w = await 起();
        await 等(150);
        await 新建(w);
        await 开来源面板(w);
        点(w, w.document.getElementById('来源预选'));
        await 等(120);

        w.点返回();
        await 等(100);
        ok(!w.document.getElementById('预选遮罩').classList.contains('显示'),
            '★ 预选界面开着时点返回 → 只关面板');
        ok(w.document.getElementById('编辑视图').classList.contains('当前'),
            '★ 仍停在编辑视图（没有直接退出）');
    }

    console.log('\n[I] ★ 扩展名探测（素材不一定都是 png）');
    {
        // 源码级：探测链存在，且用 onerror 赋值而非 addEventListener
        ok(/预选扩展\s*=\s*\[[^\]]*'png'[^\]]*'jpg'[^\]]*'jpeg'[^\]]*'webp'/.test(源码),
            '★ 探测顺序 png → jpg → jpeg → webp');
        ok(/图(元素)?\.onerror\s*=/.test(源码), '★ 用 onerror 赋值（addEventListener 会叠加监听）');

        // 运行时：手动触发 error，应逐个往下试
        const w = await 起();
        await 等(150);
        await 新建(w);
        const 图 = w.document.createElement('img');
        w.document.body.appendChild(图);
        w.填头像(图, null, 目录 + '预选7.png');
        ok((图.getAttribute('src') || '') === 目录 + '预选7.png', '首试 png');
        // 第一次失败 → 试 jpg
        图.onerror();
        ok((图.getAttribute('src') || '') === 目录 + '预选7.jpg',
            '★ png 失败 → 试 jpg（实际 ' + 图.getAttribute('src') + '）');
        图.onerror();
        ok((图.getAttribute('src') || '') === 目录 + '预选7.jpeg', '★ 再失败 → 试 jpeg');
        图.onerror();
        ok((图.getAttribute('src') || '') === 目录 + '预选7.webp', '★ 再失败 → 试 webp');
        // 全失败 → 不留破图
        const 空态 = w.document.createElement('span');
        w.填头像(图, 空态, 目录 + '预选7.png');
        图.onerror(); 图.onerror(); 图.onerror(); 图.onerror();
        ok(!图.getAttribute('src') && 图.classList.contains('空')
            && 空态.classList.contains('显示'),
            '★★ 四种扩展名全失败 → 退回空态占位（不留破图）');
    }

    console.log('\n[J] 列表卡片同样显示预选头像');
    {
        const 共享 = {
            '联系人索引': '[]',
            '人设列表': JSON.stringify([
                { id: 'p_1', 昵称: '甲', 性别: '', 性格标签: [], 头像: 目录 + '预选9.png' },
            ]),
        };
        const w = await 起('', 共享);
        await 等(180);
        const 卡 = w.document.querySelector('.人设卡');
        ok(!!卡, '渲染出卡片');
        const 图 = 卡.querySelector('.卡头像');
        ok((图.getAttribute('src') || '') === 目录 + '预选9.png',
            '★ 卡片显示预选头像（实际 ' + 图.getAttribute('src') + '）');
        ok(!图.classList.contains('空') && !卡.querySelector('.卡空头像').classList.contains('显示'),
            '★ 卡片不走空态');
    }

    收尾(errors, '✅ 11 页「预选头像」全部通过');
})();
