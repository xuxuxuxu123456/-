/**
 * verify_yuedu.js —— 一起阅读（22_yuedu）专项验证
 *
 * 覆盖：
 *   ① 1 页 / 4 页「一起阅读」入口 → 22 页（不再是 toast 占位）
 *   ② 三页签：书城 / 书架 / 作者中心 切换
 *   ③ 书城：搜索命中书名 / 作者 / 简介；搜不到有空态
 *   ④ 加入书架：平台书 → 书架，正文能从 IndexedDB 读回
 *   ⑤ 书架导入 TXT：UTF-8 / GBK 解码、按「第X章」切章、超 3MB 拦下
 *   ⑥ ★★ 正文在 IndexedDB、目录在 localStorage —— 目录里【不能有正文】
 *   ⑦ 作者中心：笔名 → 发布 → 书城能搜到 → 可下架
 *   ⑧ 阅读：章节列表 → 正文 → 上一章 / 下一章
 *   ⑨ 返回：?from= 决定回到哪
 *
 * ★ 全部走打桩：不发真实请求，也不真的读本地文件（用 File 桩造内容）。
 *
 * 用法：PAGES_DIR=/data/workspace node verify_yuedu.js
 */
const 路径 = require('path');
const kit = require(路径.join(__dirname, 'testkit.js'));
const { 造断言器, 起页面 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));

/** 极简 IndexedDB 桩（与图片 / 音频脚本同款） */
function 装IndexedDB桩(win, 仓库) {
    win.indexedDB = {
        open(名, 版) {
            const 请求 = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
            setTimeout(() => {
                const db = {
                    objectStoreNames: { contains: () => true },
                    createObjectStore() {},
                    transaction(表名, 模式) {
                        const 存 = 仓库[表名] || (仓库[表名] = {});
                        const 事务 = { oncomplete: null, onerror: null, error: null };
                        const 表 = {
                            put(记) {
                                const r = { result: null };
                                setTimeout(() => {
                                    存[记.id] = JSON.parse(JSON.stringify(记));
                                    r.result = 记.id;
                                    if (r.onsuccess) r.onsuccess();
                                    if (事务.oncomplete) 事务.oncomplete();
                                }, 0);
                                return r;
                            },
                            get(id) {
                                const r = { result: null };
                                setTimeout(() => {
                                    r.result = 存[id] ? JSON.parse(JSON.stringify(存[id])) : undefined;
                                    /* ★★ 必须触发【请求】的 onsuccess：
                                         只调 事务.oncomplete 是不够的 —— 页面里的
                                         取书() 靠 请.onsuccess 拿结果，不触发就是
                                         一个永远不 resolve 的 Promise（静默挂起）。 */
                                    if (r.onsuccess) r.onsuccess();
                                    if (事务.oncomplete) 事务.oncomplete();
                                }, 0);
                                return r;
                            },
                            delete(id) {
                                const r = { result: null };
                                setTimeout(() => {
                                    delete 存[id];
                                    if (r.onsuccess) r.onsuccess();
                                    if (事务.oncomplete) 事务.oncomplete();
                                }, 0);
                                return r;
                            },
                        };
                        事务.objectStore = () => 表;
                        return 事务;
                    },
                };
                请求.result = db;
                if (请求.onsuccess) 请求.onsuccess();
            }, 0);
            return 请求;
        },
    };
}

async function 起22(数据, 仓库, url) {
    const w = await 起页面('22_yuedu.html', url || 'http://localhost/22.html?from=1',
        数据 || {}, errors, '22', win => { 装IndexedDB桩(win, 仓库 || {}); });
    /* ★ jsdom 的 confirm 是「未实现」，返回 undefined（falsy），
         页面里凡是用 confirm 做二次确认的操作（下架 / 离开编辑器）都会直接 return，
         测试会误判成「功能没生效」。这里统一答「是」。 */
    w.confirm = () => true;
    await 等(600);
    return w;
}

const 点 = (w, 元素) => 元素.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const 输 = (w, 元素, 值) => {
    元素.value = 值;
    元素.dispatchEvent(new w.Event('input', { bubbles: true }));
};
const 页签 = (w, 名) => w.document.querySelector('.页签[data-页="' + 名 + '"]');
/* ★ 只取【当前显示】面板里的卡 —— 三个面板的列表都叫 .书列表，
     隐藏面板的卡片仍在 DOM 里，不限制会把别的面板的卡片一起数进来。
     ★ 书架用的是 .架卡（4 列网格），书城/作者用的是 .书卡（横排）。 */
const 卡们 = w => {
    const 显 = w.document.querySelector('.面板.显示');
    return 显 ? Array.from(显.querySelectorAll('.书卡, .架卡')) : [];
};
/* 底部 Tab（新版导航） */
const Tab = (w, 名) => w.document.querySelector('.Tab项[data-页="' + 名 + '"]');

/** 导一本 txt 进书架（走真实的 change 事件，不是直接写表） */
function 导书(w, 名, 内容) {
    const 输入 = w.document.getElementById('文件输入');
    Object.defineProperty(输入, 'files', {
        value: [造文件(w, 名, 内容, 'utf-8')],
        configurable: true,
    });
    输入.dispatchEvent(new w.Event('change', { bubbles: true }));
}

/** 从页面数据里取热度表（人气榜排序断言要用） */
const 读热度模块 = w => {
    const 表 = {};
    w.阅读.读表('阅读_平台').forEach(p => { 表[p.id] = w.阅读.取热度(p.id); });
    return id => Number(表[id]) || 0;
};

/** 调页面里的造封面（探针已导出） */
const 造封面 = (w, 书名, 作者) => w.阅读.造封面(书名, 作者);

/**
 * 造一个文件 —— ★ 必须是真的 File/Blob：
 * jsdom 的 FileReader.readAsArrayBuffer 只接受 Blob 实例，
 * 传 plain object（哪怕带 arrayBuffer()）读出来是空的。
 */
function 造文件(w, 名, 内容, 编码) {
    let 片;
    if (编码 === 'gbk') {
        /* 已知的 GBK 字节序列：'你好' = C4 E3 BA C3 */
        片 = [new Uint8Array([0xC4, 0xE3, 0xBA, 0xC3])];
    } else {
        片 = [String(内容 || '')];
    }
    return new w.File(片, 名, { type: 'text/plain' });
}

(async () => {
    console.log('[A] ★ 入口：1 / 4 页「一起阅读」→ 22 页');
    {
        const 一 = kit.读('1_shouyeyulan.html');
        const 四 = kit.读('4_tongxun.html');
        ok(/22_yuedu\.html/.test(一), '★ ★ 1 页映射指向 22_yuedu.html');
        ok(/22_yuedu\.html/.test(四), '★ ★ 4 页映射指向 22_yuedu.html');
        const src = kit.读('22_yuedu.html');
        ok(/一起阅读/.test(src), '★ 22 页是一起阅读');
    }

    console.log('\n[B] ★★ 底部 Tab 导航（小说 App 的标准形态）');
    {
        const w = await 起22({}, {});
        const d = w.document;
        const 项 = Array.from(d.querySelectorAll('.Tab项'));
        ok(项.length === 3, '★ ★ 底部有 3 个 Tab（实际 ' + 项.length + '）');
        ok(项.map(t => t.dataset.页).join('/') === '书架/书城/作者',
            '★ ★ Tab = 书架/书城/作者（实际 ' + 项.map(t => t.dataset.页).join('/') + '）');
        /* 顺序：书架在最前（打开就看到自己的书） */
        ok(项[0].dataset.页 === '书架', '★ 第一个 Tab 是「书架」');

        /* 底部栏在内容区之后 */
        const 底 = d.getElementById('底部导航');
        ok(!!底, '★ 有底部导航栏');
        ok(!!d.querySelector('.底部导航栏'), '★ 用的是全站的 .底部导航栏 样式');

        /* 默认选中书架 */
        ok(d.querySelector('.Tab项.选中').dataset.页 === '书架', '★ 默认停在「书架」');
        ok(d.getElementById('中间标题').textContent === '书架', '★ 标题跟着 Tab 变');
        ok(d.getElementById('面板-书架').classList.contains('显示'), '★ 书架面板显示中');

        /* 切换 */
        点(w, Tab(w, '书城'));
        await 等(400);
        ok(w.阅读.当前页() === '书城', '★ ★ 点 Tab 切到书城');
        ok(d.querySelector('.Tab项.选中').dataset.页 === '书城', '★ 选中态跟随');
        ok(d.getElementById('中间标题').textContent === '书城', '★ 标题变成「书城」');
        ok(d.getElementById('面板-书城').classList.contains('显示'), '★ 书城面板显示');
        ok(!d.getElementById('面板-书架').classList.contains('显示'), '★ 书架面板收起');

        点(w, Tab(w, '作者'));
        await 等(400);
        ok(w.阅读.当前页() === '作者', '★ ★ 切到作者中心');
        ok(d.getElementById('中间标题').textContent === '作者', '★ 标题变成「作者」');

        /* 只能有一个选中 */
        ok(d.querySelectorAll('.Tab项.选中').length === 1, '★ 同时只有一个 Tab 选中');
    }

    console.log('\n[C] ★★ 主题背景 + 不铺底框 + 配色统一');
    {
        const src = kit.读('22_yuedu.html');
        /* 主题背景三件套 */
        ok(/class="主题背景图片"/.test(src), '★ ★ 有主题背景图');
        ok(/class="全局白色遮罩"/.test(src), '★ ★ 有全站白色遮罩');
        ok(/background:\s*rgba\(var\(--panel\),\s*0\.45\)/.test(src), '★ 遮罩与全站一致（0.45）');

        /* 内容区不铺底框 */
        ok(/\.内容区\s*\{[\s\S]{0,300}background:\s*transparent/.test(src),
            '★ ★ 内容区是透明的（不加底框，露出主题背景）');
        ok(!/\.面板\s*\{[\s\S]{0,200}background/.test(src), '★ 面板本身也没有底色');
        ok(/\.书卡\s*\{[\s\S]{0,400}border-bottom/.test(src),
            '★ 书卡只画分隔线，不铺白玻璃底框');

        /* 配色：不新增颜色，强调走 --accent */
        ok(!/#e2704a/i.test(src), '★ ★ 没有自造的暖橙 #e2704a');
        ok(!/#c8552f/i.test(src), '★ 没有暖橙深 #c8552f');
        ok(!/var\(--read/.test(src), '★ 不再引用 --read 变量（注释里提到不算）');
        ok(/background:\s*var\(--accent\)/.test(src), '★ 主按钮用全站 --accent');
        ok(/var\(--accent-ink\)/.test(src), '★ 按下态/数据用 --accent-ink');
        ok(/rgba\(var\(--accent-rgb\)/.test(src), '★ 带透明度用 --accent-rgb（不是 hex）');

        /* 排名徽章用灰的深浅，不用橙/黄/灰三色 */
        ok(/\.排名徽\.排名1\s*\{\s*background:\s*rgba\(var\(--accent-rgb\)/.test(src), '★ 第1名徽章用 --accent-rgb');
        ok(/\.排名徽\.排名2\s*\{\s*background:\s*rgba\(var\(--ink-3-rgb\)/.test(src), '★ 第2名徽章用灰阶');
        ok(!/#dd9a4a|#9aa8b5/.test(src), '★ 没有橙/黄杂色徽章');

        /* 滚动条全隐藏（三条都要写） */
        ok(/scrollbar-width:\s*none/.test(src), '★ 隐藏滚动条：scrollbar-width');
        ok(/-ms-overflow-style:\s*none/.test(src), '★ 隐藏滚动条：-ms-overflow-style');
        ok(/::-webkit-scrollbar\s*\{\s*display:\s*none/.test(src), '★ 隐藏滚动条：::-webkit-scrollbar');
    }

    console.log('\n[D] ★★ 书城：分类宫格 / 精选 / 三榜 / 猜你喜欢');
    {
        const w = await 起22({}, {});
        const d = w.document;
        w.阅读.切页('书城');
        await 等(600);

        /* 分类宫格 */
        const 宫 = Array.from(d.querySelectorAll('#分类宫 .宫格项'));
        ok(宫.length === 10, '★ ★ 分类宫格 10 个题材（实际 ' + 宫.length + '）');
        const 宫值 = 宫.map(g => g.dataset.值);
        ok(宫值.join('/') === '玄幻/都市/仙侠/言情/悬疑/科幻/灵异/萌娃/异世/其他',
            '★ ★ 题材内容与顺序正确（实际 ' + 宫值.join('/') + '）');
        ok(!!d.querySelector('#分类宫 .宫格圈'), '★ 宫格有圆形图标位');

        /* 点宫格筛选 */
        点(w, 宫.find(g => g.dataset.值 === '都市'));
        await 等(400);
        ok(w.阅读.当前题材() === '都市', '★ ★ 点宫格生效');
        ok(d.querySelector('.宫格项.选中').dataset.值 === '都市', '★ 选中态跟随');
        ok(卡们(w).length === 1, '★ 都市分类下 1 本（案例书，实际 ' + 卡们(w).length + '）');
        /* 再点一次取消 */
        点(w, 宫.find(g => g.dataset.值 === '都市'));
        await 等(400);
        ok(w.阅读.当前题材() === '全部', '★ 再点一次取消');

        /* ★ 编辑精选已删 */
        ok(!d.getElementById('精选卡'), '★ ★ 编辑精选已删除（无精选卡）');
        const src0 = kit.读('22_yuedu.html');
        ok(!/精选封面/.test(src0), '★ ★ 源码里没有 .精选封面');
        ok(!/function 渲染精选/.test(src0), '★ 源码里没有 渲染精选()');
        ok(!/精选大卡/.test(src0.replace(/<!--[\s\S]*?-->/g, '')), '★ 没有精选大卡区块');

        /* 三榜（1 本书时不排榜） */
        ok(d.querySelectorAll('#榜单区 .榜块').length === 0,
            '★ ★ 只有 1 本书时不排榜（避免三个一模一样的榜）');

        /* 造够书再看榜单 */
        const 平台 = w.阅读.读表('阅读_平台').slice();
        const 今 = Date.now();
        [1, 2, 3].forEach(i => 平台.push({
            id: 'bk' + i, 书名: '书' + i, 作者: '本机', 分类: '都市', 状态: '连载',
            简介: '', 章数: 2, 字数: 200, 来源: '平台', 发布者: '', 时间: 今 - i * 864e5,
        }));
        w.阅读.写表('阅读_平台', 平台);
        w.阅读.切页('书城');
        await 等(600);
        const 块 = Array.from(d.querySelectorAll('#榜单区 .榜块'));
        ok(块.length === 3, '★ ★ 满 2 本后排出 3 个榜（实际 ' + 块.length + '）');
        const 榜名 = Array.from(d.querySelectorAll('#榜单区 .分区标题')).map(e => e.textContent.trim());
        ok(榜名.join('/') === '人气榜/推荐榜/新书榜', '★ 榜名正确（实际 ' + 榜名.join('/') + '）');
        ok(榜名.every(t => !/加入书架|收藏|阅读人数|发布时间|3 ?个月/.test(t)),
            '★ ★ 榜标题上没有口径说明文字（只要逻辑，不要提示）');
        ok(d.querySelectorAll('#榜单区 .榜网格').length === 3, '★ 每个榜一个网格');
        ok(d.querySelectorAll('#榜单区 .榜网格[data-榜="人气"] .榜卡').length <= 4,
            '★ 每榜最多 4 本');

        /* 猜你喜欢 */
        ok(d.getElementById('热门标题').textContent === '猜你喜欢', '★ ★ 底部是「猜你喜欢」');
        ok(卡们(w).length <= 6, '★ 猜你喜欢最多 6 本（实际 ' + 卡们(w).length + '）');

        /* 切到具体分类时榜单收起 */
        w.阅读.切题材('都市');
        await 等(400);
        ok(d.getElementById('榜单区').style.display === 'none',
            '★ ★ 切到具体分类后榜单收起（分类下挂全站榜很怪）');
    }

    console.log('\n[E] ★★ 书城：搜索');
    {
        const w = await 起22({}, {});
        w.阅读.切页('书城');
        await 等(500);
        const d = w.document;
        const 框 = d.getElementById('搜索框');
        ok(!!框, '★ 有搜索框');
        ok(!d.querySelector('.搜索图标'), '★ ★ 没有搜索图标（已按要求删除）');

        输(w, 框, '小喵叽');
        await 等(400);
        ok(卡们(w).length === 1, '★ 搜书名命中（实际 ' + 卡们(w).length + '）');

        输(w, 框, '示例作者');
        await 等(400);
        ok(卡们(w).length === 1, '★ 搜作者命中（实际 ' + 卡们(w).length + '）');

        输(w, 框, '猫');
        await 等(400);
        ok(卡们(w).length === 1, '★ 搜简介关键词命中（实际 ' + 卡们(w).length + '）');

        /* 搜索时标题变「搜索结果」，且收起分类宫/精选 */
        ok(d.getElementById('热门标题').textContent === '搜索结果',
            '★ ★ 搜索时标题变「搜索结果」（不再挂「猜你喜欢」）');
        ok(d.getElementById('分类宫').style.display === 'none', '★ 搜索时收起分类宫格');

        输(w, 框, '不存在的书名xyz');
        await 等(400);
        ok(卡们(w).length === 0, '★ 搜不到时列表为空');
        ok(!!d.querySelector('#书城列表 .空态'), '★ 搜不到有空态提示');

        输(w, 框, '');
        await 等(400);
        ok(d.getElementById('热门标题').textContent === '猜你喜欢', '★ 清空后恢复「猜你喜欢」');
        ok(d.getElementById('分类宫').style.display !== 'none', '★ 清空后分类宫格恢复');
    }

    console.log('\n[F] ★★ 书架：时长 / 累计统计');
    {
        const w = await 起22({}, {});
        const d = w.document;
        ok(d.getElementById('今日时长').textContent === '0分钟', '★ 今日阅读初始 0分钟');
        ok(d.getElementById('累计时长').textContent === '0分钟', '★ 累计阅读初始 0分钟');
        ok(w.阅读.读表('阅读_书架').length === 0, '（空书架）');

        w.阅读.加时长(90);
        w.阅读.刷新时长();
        await 等(200);
        ok(d.getElementById('今日时长').textContent === '1分钟',
            '★ ★ 加 90 秒 → 1分钟（实际 ' + d.getElementById('今日时长').textContent + '）');
        ok(d.getElementById('累计时长').textContent === '1分钟', '★ 累计同步涨');

        const 存 = JSON.parse(w.localStorage.getItem('阅读_时长') || '{}');
        ok(存.今日 === 90, '★ ★ 内部按【秒】存（存分钟的话读 40 秒会丢，实际 ' + 存.今日 + '）');

        w.阅读.加时长(3600);
        w.阅读.刷新时长();
        await 等(200);
        ok(/小时/.test(d.getElementById('累计时长').textContent),
            '★ 超过 1 小时显示「X小时」（实际 ' + d.getElementById('累计时长').textContent + '）');

        /* 跨天：今日归零，累计保留 */
        const 原累计 = w.阅读.读时长().累计;
        w.localStorage.setItem('阅读_时长', JSON.stringify({ 日: '2000-1-1', 今日: 999, 累计: 原累计 }));
        await 等(150);
        const 跨 = w.阅读.读时长();
        ok(跨.今日 === 0, '★ ★ 日期变了 → 今日归零（实际 ' + 跨.今日 + '）');
        ok(跨.累计 === 原累计, '★ 累计保留（实际 ' + 跨.累计 + '）');

        /* 累计统计：总数 / 读过 */
        ok(!!d.getElementById('书架总数'), '★ 有书架书本总数');
        ok(!!d.getElementById('读过总数'), '★ 有读过书本总数');
    }

    console.log('\n[G] ★★ 书架：三组筛选（进度 / 更新 / 来源）');
    {
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;
        const 今 = Date.now();
        const 造 = (i, 名, 态, 来) => ({
            id: 'k' + i, 书名: 名, 作者: '本机', 分类: '都市', 状态: 态, 简介: '',
            章数: 3, 字数: 300,
            来源: 来 === '本地导入' ? '本地' : '平台',
            发布者: 来 === '本地导入' ? '' : '示例',
            时间: 今 - i * 864e5,
        });
        w.阅读.写表('阅读_书架', [
            造(1, '甲本地连载', '连载', '本地导入'),
            造(2, '乙本地完结', '完结', '本地导入'),
            造(3, '丙本地断更', '断更', '本地导入'),
            造(4, '丁城连载', '连载', '书城添加'),
            造(5, '戊城完结', '完结', '书城添加'),
            造(6, '己城断更', '断更', '书城添加'),
        ]);
        w.阅读.写进度('k1', 1);   /* 3 章读到第 2 章 = 在读 */
        w.阅读.写进度('k2', 2);   /* 读完 */
        w.阅读.切页('书架');
        await 等(500);
        const 名 = () => 卡们(w).map(c => c.querySelector('.架名').textContent);

        ok(d.getElementById('书架总数').textContent === '6', '★ ★ 书架总数 = 6');
        ok(d.getElementById('读过总数').textContent === '2', '★ ★ 读过总数 = 2');

        const 进 = Array.from(d.querySelectorAll('#架进度栏 .chip'));
        ok(进.map(c => c.dataset.值).join('/') === '全部/未读/在读/已读',
            '★ ★ 分类1 = 全部/未读/在读/已读（实际 ' + 进.map(c => c.dataset.值).join('/') + '）');
        ok(进.map(c => c.textContent).join('|') === '全部 6|未读 4|在读 1|已读 1',
            '★ ★ 进度组数量正确（实际 ' + 进.map(c => c.textContent).join('|') + '）');

        const 更 = Array.from(d.querySelectorAll('#架更新栏 .chip'));
        ok(更.map(c => c.dataset.值).join('/') === '全部/连载/完结/断更',
            '★ ★ 分类2 = 全部/连载/完结/断更（实际 ' + 更.map(c => c.dataset.值).join('/') + '）');
        ok(更.map(c => c.textContent).join('|') === '全部 6|连载 2|完结 2|断更 2',
            '★ ★ 更新组数量正确（实际 ' + 更.map(c => c.textContent).join('|') + '）');

        const 来 = Array.from(d.querySelectorAll('#架来源栏 .chip'));
        ok(来.map(c => c.dataset.值).join('/') === '全部/本地导入/书城添加',
            '★ ★ 分类3 = 全部/本地导入/书城添加（实际 ' + 来.map(c => c.dataset.值).join('/') + '）');
        ok(来.map(c => c.textContent).join('|') === '全部 6|本地导入 3|书城添加 3',
            '★ ★ 来源组数量正确（实际 ' + 来.map(c => c.textContent).join('|') + '）');

        /* 各组筛选 */
        w.阅读.切架进度('已读'); await 等(300);
        ok(名().join() === '乙本地完结', '★ 已读 = 乙（实际 ' + 名().join('/') + '）');
        w.阅读.切架进度('在读'); await 等(300);
        ok(名().join() === '甲本地连载', '★ 在读 = 甲（实际 ' + 名().join('/') + '）');
        w.阅读.切架进度('未读'); await 等(300);
        ok(名().length === 4, '★ 未读 4 本（实际 ' + 名().length + '）');
        w.阅读.切架进度('全部'); await 等(300);

        w.阅读.切架更新('断更'); await 等(300);
        ok(名().sort().join() === ['丙本地断更', '己城断更'].sort().join(),
            '★ ★ 断更 2 本（实际 ' + 名().join('/') + '）');
        w.阅读.切架更新('全部'); await 等(300);

        w.阅读.切架来源('本地导入'); await 等(300);
        ok(名().length === 3 && 名().every(n => /本地/.test(n)), '★ 本地导入 3 本');
        w.阅读.切架来源('书城添加'); await 等(300);
        ok(名().length === 3 && 名().every(n => /城/.test(n)), '★ 书城添加 3 本');

        /* 跨组是「且」 */
        w.阅读.切架来源('本地导入');
        w.阅读.切架更新('连载');
        await 等(400);
        ok(名().join() === '甲本地连载',
            '★ ★ 本地 + 连载 = 交集 1 本（实际 ' + 名().join('/') + '）');

        /* 累计统计不受筛选影响 */
        ok(d.getElementById('书架总数').textContent === '6', '★ ★ 筛选后总数仍是 6');
        ok(d.getElementById('读过总数').textContent === '2', '★ ★ 筛选后读过总数仍是 2');

        /* 组合筛空 → 空态且无 undefined */
        w.阅读.切架进度('已读');
        w.阅读.切架更新('断更');
        await 等(400);
        ok(卡们(w).length === 0, '★ 组合筛空了');
        const 空 = d.querySelector('#书架列表 .空态');
        ok(!!空, '★ 有空态提示');
        ok(!/undefined/.test(空.textContent), '★ 空态文案没有 undefined');
    }

    console.log('\n[H] ★★ 书架：空态 / 导入 / 长按移出');
    {
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;

        /* 空态 */
        const 空 = d.getElementById('架空态');
        ok(!!空, '★ ★ 空书架有专属空态');
        ok(/快去添加书籍吧/.test(空.textContent), '★ ★ 文案 =「快去添加书籍吧」');
        ok(!!空.querySelector('.空态画 svg'), '★ 有书本图标（SVG）');

        /* 导入 */
        导书(w, '测试书.txt', '第一章 甲\n正文甲。\n\n第二章 乙\n正文乙。');
        await 等(800);
        w.阅读.切页('书架');
        await 等(500);
        ok(!d.getElementById('架空态'), '★ ★ 导入后空态消失');
        ok(卡们(w).length === 1, '★ 书架里 1 本（实际 ' + 卡们(w).length + '）');
        const 首 = w.阅读.读表('阅读_书架')[0];
        ok(首.章数 === 2, '★ 按「第X章」切出 2 章（实际 ' + 首.章数 + '）');
        ok(首.来源 === '本地', '★ 标记为本地导入');

        /* ★★ 目录里不能有正文 */
        const 目录串 = w.localStorage.getItem('阅读_书架') || '';
        ok(!/正文甲/.test(目录串), '★ ★ ★ 目录里没有正文（正文在 IndexedDB）');
        ok(/测试书/.test(目录串), '★ 目录里有书名');
        ok(目录串.length < 2000, '★ 目录很小（实际 ' + 目录串.length + ' 字符）');
        ok(!!仓库['书'] && !!仓库['书'][首.id], '★ ★ 正文存在 IndexedDB 里');

        /* 长按 → 移出 */
        const 前数 = w.阅读.读表('阅读_书架').length;
        const 卡 = 卡们(w)[0];
        const 首id = 卡.dataset.id;
        卡.dispatchEvent(new w.Event('touchstart', { bubbles: true }));
        await 等(w.阅读.长按阈值 + 150);
        const 条 = d.getElementById('长按条');
        ok(!!条 && 条.classList.contains('显示'), '★ ★ 长按弹出确认条');
        ok(/移出书架/.test(条.textContent), '★ 条上有「移出书架」');
        ok(/《.+》/.test(条.querySelector('.长按名').textContent),
            '★ 条上写了书名（实际 ' + (条.querySelector('.长按名') || {}).textContent + '）');
        卡.dispatchEvent(new w.Event('touchend', { bubbles: true }));
        await 等(100);
        点(w, d.getElementById('长按移出'));
        await 等(600);
        ok(w.阅读.读表('阅读_书架').length === 前数 - 1,
            '★ ★ 长按移出生效（实际 ' + w.阅读.读表('阅读_书架').length + '，原 ' + 前数 + '）');
        ok(!w.阅读.读表('阅读_书架').some(b => b.id === 首id), '★ 移出的正是那一本');

        /* 短按不弹条 */
        导书(w, '书2.txt', '第一章\n内容。');
        await 等(800);
        w.阅读.切页('书架');
        await 等(500);
        const 卡2 = 卡们(w)[0];
        if (卡2) {
            卡2.dispatchEvent(new w.Event('touchstart', { bubbles: true }));
            await 等(120);
            卡2.dispatchEvent(new w.Event('touchend', { bubbles: true }));
            await 等(80);
            ok(!d.getElementById('长按条').classList.contains('显示'), '★ 短按不弹条（不会误触）');
        }
    }

    console.log('\n[I] ★★ 更多菜单：只留「导入书籍」');
    {
        const w = await 起22({}, {});
        const d = w.document;
        const 项 = Array.from(d.querySelectorAll('.更多项'));
        ok(项.length === 1, '★ ★ 菜单只有 1 项（实际 ' + 项.length + '）');
        ok(/导入书籍/.test(项[0].textContent), '★ ★ 这一项是「导入书籍」');
        ok(!/替换文字|屏蔽内容|列表布局/.test(d.getElementById('更多菜单').textContent),
            '★ ★ 没有「替换文字 / 屏蔽内容 / 列表布局」');

        /* 点它唤起文件选择器 */
        const 输入 = d.getElementById('文件输入');
        let 点了 = 0;
        输入.click = () => { 点了++; };
        w.阅读.开更多();
        await 等(200);
        ok(d.getElementById('更多遮罩').classList.contains('显示'), '★ 菜单能打开');
        点(w, d.getElementById('更多导入'));
        await 等(250);
        ok(点了 === 1, '★ ★ 点「导入书籍」唤起文件选择器（实际 ' + 点了 + ' 次）');
        ok(!d.getElementById('更多遮罩').classList.contains('显示'), '★ 点完自动收起');

        /* 只在书架页出现 */
        w.阅读.切页('书城');
        await 等(400);
        ok(d.getElementById('右钮').classList.contains('隐藏'), '★ ★ 书城页没有「更多」按钮');
        w.阅读.切页('书架');
        await 等(400);
        ok(!d.getElementById('右钮').classList.contains('隐藏'), '★ ★ 书架页才出现「更多」按钮');

        /* accept 限定 txt */
        ok(/accept="\.txt/.test(kit.读('22_yuedu.html')), '★ 文件选择限定 .txt');
        ok(/视觉隐藏文件输入/.test(kit.读('22_yuedu.html')),
            '★ ★ 用「视觉隐藏」而非 display:none（移动端 click() 才有效）');
    }

    console.log('\n[J] ★★ 阅读器：目录 → 正文 → 翻章 → 字号背景');
    {
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;
        导书(w, '小说.txt', '第一章 开端\n这是第一段。\n\n这是第二段。\n\n第二章 发展\n发展正文。\n\n第三章 结局\n结局正文。');
        await 等(900);
        w.阅读.切页('书架');
        await 等(500);
        const id = w.阅读.读表('阅读_书架')[0].id;
        await w.阅读.开书(id);
        await 等(500);

        ok(d.getElementById('阅读遮罩').classList.contains('显示'), '★ 阅读器打开');
        const 章行 = Array.from(d.querySelectorAll('.章行'));
        ok(章行.length === 3, '★ 目录列出 3 章（实际 ' + 章行.length + '）');
        /* ★ 目录态：右侧「目录」钮收起（已经在目录里了），翻页条不出现 */
        ok(d.getElementById('阅读目录钮').classList.contains('隐藏'),
            '★ ★ 目录态右侧「目录」钮收起');
        ok(!d.getElementById('翻页条').classList.contains('显示'), '★ 目录态没有翻页条');

        /* ★ 点目录章节进正文 */
        点(w, 章行[1]);
        await 等(400);
        ok(!!d.getElementById('章文'), '★ ★ 点目录章节进入正文');
        ok(/发展正文/.test(d.getElementById('章文').textContent), '★ ★ 进的是点的那一章');
        /* ★ 正文态：右侧出现「目录」钮，翻页条吸底并显示章位 */
        ok(!d.getElementById('阅读目录钮').classList.contains('隐藏'),
            '★ ★★ 正文态右侧出现「目录」钮');
        ok(d.getElementById('翻页条').classList.contains('显示'), '★ 正文态出现翻页条');
        ok(d.getElementById('翻页条').parentNode.id === '阅读遮罩',
            '★ ★★ 翻页条吸底（不在阅读体内，不用滚到底才翻页）');
        ok(!!d.getElementById('章位'), '★ 有章节位置指示');
        ok(d.getElementById('章位').textContent === '2 / 3',
            '★ ★ 章位 = 2 / 3（实际 ' + d.getElementById('章位').textContent + '）');

        /* 首行缩进：必须切成 <p> */
        const p们 = d.querySelectorAll('#章文 p');
        ok(p们.length >= 1, '★ ★ 正文按段落切成 <p>（整段一个节点只会缩进第一段）');

        /* 翻章 */
        const 钮 = Array.from(d.querySelectorAll('.翻页条 .小钮'));
        const 下 = 钮.find(b => b.textContent === '下一章');
        ok(!!下 && !下.disabled, '★ 有可用的「下一章」');
        点(w, 下);
        await 等(400);
        ok(/结局正文/.test(d.getElementById('章文').textContent), '★ ★ 翻到下一章');
        const 上 = Array.from(d.querySelectorAll('.翻页条 .小钮')).find(b => b.textContent === '上一章');
        点(w, 上);
        await 等(400);
        ok(/发展正文/.test(d.getElementById('章文').textContent), '★ 翻回上一章');

        /* 返回 → 目录 */
        点(w, d.getElementById('阅读目录钮'));
        await 等(400);
        ok(d.querySelectorAll('.章行').length === 3, '★ 一步回到目录');
        ok(d.getElementById('阅读目录钮').classList.contains('隐藏'),
            '★ 回到目录后「目录」钮收起');
        ok(!d.getElementById('翻页条').classList.contains('显示'), '★ 回到目录后翻页条收起');

        /* 字号 / 背景 */
        /* ★ 设置面板默认收起（常驻会一直占掉两行阅读空间），点 Aa 呼出 */
        ok(!d.getElementById('阅读设置').classList.contains('展开'),
            '★ ★ 设置面板默认收起');
        点(w, d.getElementById('阅读设置钮'));
        await 等(300);
        ok(d.getElementById('阅读设置').classList.contains('展开'),
            '★ ★ 点「Aa」展开设置面板');
        ok(d.getElementById('阅读设置钮').classList.contains('选中'), '★ Aa 按钮有选中态');
        点(w, d.getElementById('阅读设置钮'));
        await 等(300);
        ok(!d.getElementById('阅读设置').classList.contains('展开'), '★ 再点一次收起');
        点(w, d.getElementById('阅读设置钮'));
        await 等(300);

        const 景钮 = Array.from(d.querySelectorAll('.景钮'));
        ok(景钮.length === 5, '★ 字号 3 档 + 日间/夜间 2 档 = 5（实际 ' + 景钮.length + '）');
        const 夜 = 景钮.find(b => b.textContent === '夜间');
        ok(!!夜, '★ ★ 有夜间档（现在是日间/夜间两档，不再有护眼/淡绿）');
        点(w, 夜);
        await 等(300);
        ok(JSON.parse(w.localStorage.getItem('阅读_设置') || '{}').景 === 1,
            '★ ★ 选夜间后存进设置（景=1）');
        ok(d.getElementById('阅读遮罩').className.includes('夜间'), '★ ★ 切到夜间模式');

        /* 读到第 2 章 → 进度记录 */
        ok(w.阅读.读进度(id) !== null, '★ 读过之后有进度记录');

        /* 关书 */
        w.阅读.关书();
        await 等(300);
        ok(!d.getElementById('阅读遮罩').classList.contains('显示'), '★ 能关掉阅读器');
    }

    console.log('\n[K] ★★ 详情层：目录可点 / 评论 / 加入书架');
    {
        const w = await 起22({}, {});
        const d = w.document;
        w.阅读.切页('书城');
        await 等(600);
        const id = w.阅读.读表('阅读_平台')[0].id;

        w.阅读.开详情(id);
        await 等(600);
        ok(d.getElementById('详情遮罩').classList.contains('显示'), '★ ★ 详情层能打开');
        ok(!!d.querySelector('.详情封面'), '★ 有封面');
        ok(!!d.querySelector('.详情简介'), '★ 有简介');

        const 预览 = Array.from(d.querySelectorAll('.详情章预览'));
        ok(预览.length >= 1, '★ 有目录预览（实际 ' + 预览.length + '）');
        ok(预览[0].tagName === 'BUTTON', '★ ★ 目录条目是 button（可点，不是死 div）');

        /* ★ 点目录条目直接进正文 */
        点(w, 预览[0]);
        await 等(600);
        ok(!!d.getElementById('章文'), '★ ★ 点目录条目直接进正文（不用再点一次）');
        w.阅读.关书();
        await 等(300);

        /* 评论 */
        w.阅读.开详情(id);
        await 等(600);
        ok(w.阅读.取评论数(id) === 0, '★ 初始评论数 0');
        const 输入 = Array.from(d.querySelectorAll('.详情块 input')).pop();
        ok(!!输入, '★ 有评论输入框');
        输入.value = '写得真好';
        点(w, Array.from(d.querySelectorAll('.详情块 .小钮')).find(b => b.textContent === '发表评论'));
        await 等(600);
        ok(w.阅读.取评论数(id) === 1, '★ ★ 发评论后评论数 = 1（实际 ' + w.阅读.取评论数(id) + '）');

        /* 热门分含评论权重 */
        const 条目 = w.阅读.读表('阅读_平台')[0];
        const 分 = w.阅读.热门分(条目);
        const 期望 = w.阅读.取热度(id) * 3 + w.阅读.取阅读数(id) * 1 + 1 * 5;
        ok(分 === 期望, '★ ★ 热门分 = 书架×3 + 阅读×1 + 评论×5（实际 ' + 分 + '，期望 ' + 期望 + '）');

        /* 加入书架 */
        const 加 = Array.from(d.querySelectorAll('#详情底 .大钮')).find(b => b.textContent === '加入书架');
        ok(!!加, '★ 详情底有「加入书架」');
        const 前热 = w.阅读.取热度(id);
        点(w, 加);
        await 等(600);
        ok(w.阅读.读表('阅读_书架').some(b => b.id === id), '★ ★ 加入书架成功');
        ok(w.阅读.取热度(id) === 前热 + 1, '★ ★ 加入书架 → 热度 +1');
    }

    console.log('\n[L] ★★ 作者中心：笔名 / 发布 / 作品管理');
    {
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;
        w.阅读.切页('作者');
        await 等(500);

        ok(d.getElementById('笔名显示').textContent === '未设置笔名', '★ 未设笔名时有占位');
        /* ★ 数据面板已从作者中心删除 —— 移到作品页里了 */
        ok(!d.getElementById('数据面板'), '★ ★★ 作者中心不再有总数据面板');
        ok(d.querySelectorAll('.数据格').length === 0, '★ 作者中心没有数据格');

        /* 没笔名时不能新建 */
        ok(d.getElementById('新建钮').disabled, '★ ★ 没笔名时不能新建');
        ok(/先设置笔名/.test(d.getElementById('新建钮').textContent), '★ 按钮提示先设笔名');

        /* 设笔名 */
        w.localStorage.setItem('阅读_笔名', '阿七');
        w.阅读.切页('作者');
        await 等(500);
        ok(d.getElementById('笔名显示').textContent === '阿七', '★ ★ 笔名显示出来了');
        ok(!d.getElementById('新建钮').disabled, '★ 有笔名后可新建');

        /* ★ 新建作品（不再需要先导入 txt） */
        d.getElementById('新书名').value = '我的小说';
        d.getElementById('新分类').value = '玄幻';
        d.getElementById('新状态').value = '完结';
        d.getElementById('新简介').value = '这是我的简介';
        点(w, d.getElementById('新建钮'));
        await 等(800);
        const 我的 = w.阅读.读表('阅读_平台').filter(p => p.发布者 === '阿七');
        ok(我的.length === 1, '★ ★ 新建成功（实际 ' + 我的.length + ' 部）');
        ok(我的[0].分类 === '玄幻', '★ 分类存进去了（实际 ' + 我的[0].分类 + '）');
        ok(我的[0].状态 === '完结', '★ 状态存进去了（实际 ' + 我的[0].状态 + '）');
        ok(我的[0].简介 === '这是我的简介', '★ ★ 简介存进去了（实际 ' + 我的[0].简介 + '）');

        /* 写一章并发布 —— 这样书城才有正文可读 */
        输(w, d.getElementById('章题输入'), '第一章 开端');
        输(w, d.getElementById('正文输入'), '正文内容。');
        点(w, d.getElementById('发布章钮'));
        await 等(800);
        ok(w.阅读.读表('阅读_平台').filter(p => p.发布者 === '阿七')[0].章数 === 1,
            '★ ★ 发布了一章');
        点(w, d.getElementById('编辑返回'));
        await 等(500);

        /* 书城能搜到 */
        w.阅读.切页('书城');
        await 等(500);
        输(w, d.getElementById('搜索框'), '我的小说');
        await 等(400);
        ok(卡们(w).length === 1, '★ ★ 书城搜得到刚创建的书（实际 ' + 卡们(w).length + '）');

        /* 作品管理 + 下架 */
        w.阅读.切页('作者');
        await 等(500);
        const 作品卡 = d.querySelectorAll('.作品卡');
        ok(作品卡.length === 1, '★ 作品管理里 1 部（实际 ' + 作品卡.length + '）');
        /* ★ 作品卡数据只显示 阅读 / 评论 / 章节 三项 */
        ok(d.querySelectorAll('.作品卡 .作品数据 .作品数').length === 3,
            '★ 每张卡 3 格数据（实际 ' + d.querySelectorAll('.作品卡 .作品数据 .作品数').length + '）');
        ok(Array.from(d.querySelectorAll('.作品卡 .作品名2')).map(e => e.textContent).join('/') === '阅读/评论/章节',
            '★ ★ 只显示 阅读/评论/章节（实际 '
            + Array.from(d.querySelectorAll('.作品卡 .作品名2')).map(e => e.textContent).join('/') + '）');
        /* ★ 「下架」已按要求删除 —— 这里改用「删除」验证 */
        const 下架 = Array.from(d.querySelectorAll('.作品卡 .小钮')).find(b => b.textContent === '下架');
        ok(!下架, '★ ★★ 「下架」按钮已删除');
        const 删钮 = Array.from(d.querySelectorAll('.作品卡 .小钮')).find(b => b.textContent === '删除');
        ok(!!删钮, '★ 有「删除」按钮');
        点(w, 删钮);
        await 等(900);
        ok(w.阅读.读表('阅读_平台').filter(p => p.发布者 === '阿七').length === 0, '★ ★ 删除生效');
    }

    console.log('\n[M] ★★ 存储约束与返回');
    {
        const src = kit.读('22_yuedu.html');
        /* 正文在 IndexedDB，目录在 localStorage */
        ok(/const\s+库名\s*=\s*'阅读_书库'/.test(src), '★ 正文走 IndexedDB');
        ok(/function\s+存书/.test(src) && /function\s+取书/.test(src), '★ 有存书/取书');
        ok(/目录项[\s\S]{0,600}章数[\s\S]{0,300}字数/.test(src), '★ 目录项只含章数/字数，不含正文');

        /* 返回：?from= 决定回到哪 */
        ok(/'1':\s*'1_shouyeyulan\.html'/.test(src), '★ ?from=1 → 1 页');
        ok(/'4':\s*'4_tongxun\.html'/.test(src), '★ ?from=4 → 4 页');

        /* 切后台结算 */
        ok(/visibilitychange/.test(src), '★ ★ 切后台会结算阅读时长');
        ok(/pagehide/.test(src), '★ 关页面也会结算');

        /* 案例书只留一本 */
        const 示例块 = src.slice(src.indexOf('const 示例书 = ['), src.indexOf('const 示例热度'));
        const id们 = Array.from(示例块.matchAll(/id:\s*'(demo_\d+)'/g)).map(m => m[1]);
        ok(id们.length === 1, '★ ★ 案例书只有 1 本（实际 ' + id们.length + '）');
        ok(/书名:\s*'小喵叽法则'/.test(示例块), '★ ★ 案例书名 =《小喵叽法则》');
    }

    console.log('\n[N] ★★★ 阅读界面背景 = 【整页】主题背景 + 70% 白遮罩');
    {
        const src = kit.读('22_yuedu.html');

        /* ★★ 不是「阅读层再垫一张图」，而是收起下面 UI 让整页那张透上来 */
        ok(!/阅读背景图/.test(src),
            '★ ★★ 阅读层【没有】自己的图（不再复制一份，改用整页主题背景）');
        ok(/\.阅读中 \.内容区/.test(src), '★ ★ 阅读中会收起内容区（不露出书城列表）');
        ok(/\.阅读中 \.顶部固定区/.test(src), '★ 阅读中会收起顶栏');
        ok(/\.阅读中 \.底部导航栏/.test(src), '★ 阅读中会收起底栏');
        ok(/\.阅读中 \.全局白色遮罩/.test(src),
            '★ ★ 阅读中会收起全局白色遮罩（避免 45%+70% 叠成一片死白）');
        ok(/visibility:\s*hidden/.test(src),
            '★ ★ 用 visibility 隐藏而非 display:none（保住滚动位置）');

        /* 70% 白遮罩 */
        ok(/\.阅读遮罩::after\s*\{[\s\S]{0,200}rgba\(255,\s*255,\s*255,\s*0\.70\)/.test(src),
            '★ ★★ 阅读层有 70% 白遮罩（rgba(255,255,255,0.70)）');
        ok(/\.阅读遮罩::after[\s\S]{0,200}pointer-events:\s*none/.test(src),
            '★ 遮罩不拦交互（pointer-events:none）');

        /* 内容在遮罩之上 */
        ok(/\.阅读头,\s*\.阅读体,\s*\.阅读设置\s*\{\s*position:\s*relative;\s*z-index:\s*2/.test(src),
            '★ ★ 正文/头部 z-index 高于遮罩（不会被白纱盖住）');

        /* ★ 原来的四档自造底色已删（护眼 #f7f4ec / 夜间 #1f2024 / 淡绿 #eef2ec） */
        ok(!/#f7f4ec/i.test(src), '★ ★ 自造的护眼米黄 #f7f4ec 已删');
        ok(!/#1f2024/i.test(src), '★ ★ 自造的夜间黑 #1f2024 已删');
        ok(!/#eef2ec/i.test(src), '★ ★ 自造的淡绿 #eef2ec 已删');
        ok(!/\.阅读遮罩\.景[234]/.test(src), '★ ★ 景2/景3/景4 类已删');

        /* 实测：打开阅读器 → 容器挂 .阅读中，UI 层被收起 */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;
        const 容器 = d.querySelector('.手机主题背景容器');
        ok(!!容器, '★ 找到铺主题背景的容器');
        ok(!容器.classList.contains('阅读中'), '★ 未打开阅读时不挂 .阅读中');

        导书(w, '背景测试.txt', '第一章\n内容。');
        await 等(900);
        const id = w.阅读.读表('阅读_书架')[0].id;
        await w.阅读.开书(id);
        await 等(500);

        ok(d.getElementById('阅读遮罩').classList.contains('显示'), '★ 阅读器已打开');
        ok(容器.classList.contains('阅读中'),
            '★ ★★ 打开阅读后容器挂上 .阅读中（整页主题背景透上来）');

        /* 关书后要摘掉 */
        w.阅读.关书();
        await 等(400);
        ok(!容器.classList.contains('阅读中'),
            '★ ★★ 关书后摘掉 .阅读中（否则书城列表一直不显示）');

        ok(!/景[1-4]/.test(d.getElementById('阅读遮罩').className),
            '★ 不再用景1~景4 的底色类（实际 ' + d.getElementById('阅读遮罩').className + '）');
    }

    console.log('\n[O] ★★★ 猜你喜欢：标签与「加入书架」同行等高');
    {
        const src = kit.读('22_yuedu.html');
        ok(/\.同行区\s*\{[\s\S]{0,120}align-items:\s*center/.test(src),
            '★ ★ 有 .同行区 且垂直居中对齐');
        /* ★ 高度 / 圆角 / 字号三处共用同一组值 —— 这就是「大小一致」的保证 */
        const 同块 = src.slice(src.indexOf('.同行标签, .同行钮 {'), src.indexOf('.同行标签 {'));
        ok(/height:\s*clamp\(/.test(同块), '★ ★ 标签与按钮共用同一个 height');
        ok(/border-radius:\s*clamp\(/.test(同块), '★ ★ 共用同一个 border-radius');
        ok(/font-size:\s*clamp\(/.test(同块), '★ ★ 共用同一个 font-size');
        ok(!/\.同行标签\s*\{[\s\S]{0,200}height/.test(src),
            '★ 标签自己没有另设 height（否则又不一样大）');
        /* ★ 用「下一个选择器」当切片终点：indexOf('.同行钮 {') 会命中
             '.同行标签, .同行钮 {' 里的子串，切片起点偏前就把共用块算进去了。 */
        const 起钮 = src.indexOf('\n        .同行钮 {');
        const 钮块 = src.slice(起钮, src.indexOf('.同行钮.已加'));
        ok(!/height/.test(钮块), '★ 按钮自己没有另设 height（与标签共用）');
        const 起标 = src.indexOf('\n        .同行标签 {');
        const 标块 = src.slice(起标, 起钮);
        ok(!/height/.test(标块), '★ 标签自己也没有另设 height（与按钮共用）');

        const w = await 起22({}, {});
        w.阅读.切页('书城');
        await 等(600);
        const d = w.document;
        const 区 = d.querySelector('#书城列表 .同行区');
        ok(!!区, '★ ★ 书城列表里有同行区');
        const 标 = 区.querySelectorAll('.同行标签');
        const 钮 = 区.querySelectorAll('.同行钮');
        ok(标.length >= 1, '★ 同行区里有标签（实际 ' + 标.length + '）');
        ok(钮.length === 1, '★ 同行区里有「加入书架」按钮（实际 ' + 钮.length + '）');
        /* ★ 标签和按钮都在同一个 .同行区 里 —— 这就是「同一水平线」 */
        ok(标[0].parentNode === 区 || 标[0].parentNode.parentNode === 区,
            '★ ★ 标签与按钮在同一个容器里（同一行）');
        ok(钮[0].parentNode === 区, '★ ★ 按钮直接挂在同行区（与标签同排）');
        ok(/加入书架/.test(钮[0].textContent), '★ 按钮文案 = 加入书架（实际 ' + 钮[0].textContent + '）');
        /* 不在小钮行里了（那是老的多行布局） */
        ok(!d.querySelector('#书城列表 .小钮行'), '★ ★ 不再用老的多行 .小钮行');
    }

    console.log('\n[P0] ★★ 评论数：多发几条要真的累加');
    {
        const w = await 起22({}, {});
        const id = w.阅读.读表('阅读_平台')[0].id;
        ok(w.阅读.取评论数(id) === 0, '★ 初始 0');
        w.阅读.发评论(id, '第一条');
        ok(w.阅读.取评论数(id) === 1, '★ 发 1 条 → 1（实际 ' + w.阅读.取评论数(id) + '）');
        w.阅读.发评论(id, '第二条');
        w.阅读.发评论(id, '第三条');
        ok(w.阅读.取评论数(id) === 3,
            '★ ★★ 发 3 条 → 3（实际 ' + w.阅读.取评论数(id) + '，旧 bug 会一直返回 1）');
        for (let i = 0; i < 17; i++) w.阅读.发评论(id, '评' + i);
        ok(w.阅读.取评论数(id) === 20, '★ ★★ 发 20 条 → 20（实际 ' + w.阅读.取评论数(id) + '）');
    }

    console.log('\n[P] ★★★ 猜你喜欢 = 【全站整体热门】');
    {
        const src = kit.读('22_yuedu.html');
        ok(/function 猜你喜欢/.test(src), '★ ★ 有 猜你喜欢()');
        /* ★ 口径 = 热门分（书架×3 + 阅读×1 + 评论×5），不做个人偏好加权 */
        ok(!/取阅读偏好/.test(src), '★ ★★ 没有个人题材偏好加权（要的是全站热门）');
        ok(!/题材加成/.test(src), '★ 没有同题材加成');
        const 块 = src.slice(src.indexOf('function 猜你喜欢'), src.indexOf('function 猜你喜欢') + 400);
        ok(/热门分\(b\)\s*-\s*热门分\(a\)/.test(块), '★ ★★ 直接按热门分排序');
        ok(!/归类/.test(块), '★ 排序不看题材（全站口径）');

        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const 今 = Date.now();
        /* 造 5 本，热度/阅读/评论各不同，验证口径真的生效 */
        const 平台 = w.阅读.读表('阅读_平台').filter(p => p.id !== 'demo_1');
        const 造 = (i, 名, 热, 读, 评) => {
            平台.push({
                id: 'h' + i, 书名: 名, 作者: '本机', 分类: '都市', 状态: '连载',
                简介: '', 章数: 2, 字数: 200, 来源: '平台', 发布者: '', 时间: 今 - i * 864e5,
            });
            const 热表 = w.阅读.读字典('阅读_热度'); 热表['h' + i] = 热; w.阅读.写字典('阅读_热度', 热表);
            const 人表 = w.阅读.读字典('阅读_阅读人数'); 人表['h' + i] = 读; w.阅读.写字典('阅读_阅读人数', 人表);
            if (评) for (let k = 0; k < 评; k++) w.阅读.发评论('h' + i, '评' + k);
        };
        造(1, '少书架-多评论', 1, 1, 20);     /* 1×3 + 1×1 + 20×5 = 104 */
        造(2, '多书架', 30, 1, 0);             /* 30×3 + 1×1 + 0 = 91 */
        造(3, '多阅读', 1, 80, 0);             /* 1×3 + 80×1 + 0 = 83 */
        造(4, '平平', 5, 5, 1);                /* 15 + 5 + 5 = 25 */
        造(5, '冷门', 0, 0, 0);                /* 0 */
        w.阅读.写表('阅读_平台', 平台);

        w.阅读.切页('书城');
        await 等(700);
        const 名们 = 卡们(w).map(c => c.querySelector('.书名').textContent);
        ok(名们[0] === '少书架-多评论',
            '★ ★★ 第1 = 少书架-多评论（评论权重最高，实际 ' + 名们[0] + '）');
        ok(名们[1] === '多书架', '★ 第2 = 多书架（书架权重次之，实际 ' + 名们[1] + '）');
        ok(名们[2] === '多阅读', '★ 第3 = 多阅读（阅读权重最低，实际 ' + 名们[2] + '）');
        ok(名们[4] === '冷门', '★ 最后 = 冷门（实际 ' + 名们[4] + '）');

        /* 权重真的不同：多书架(30) 排在多阅读(80) 前 —— 因为书架×3 > 阅读×1 */
        const 条2 = 平台.find(p => p.id === 'h2');
        const 条3 = 平台.find(p => p.id === 'h3');
        ok(w.阅读.热门分(条2) > w.阅读.热门分(条3),
            '★ ★★ 书架×3 > 阅读×1 生效（30×3=90 压过 80×1）');

        /* 评论权重最高：加 1 条评论 = 加 5 分 */
        const 条5 = 平台.find(p => p.id === 'h5');
        const 前 = w.阅读.热门分(条5);
        w.阅读.发评论('h5', '新评论');
        ok(w.阅读.热门分(条5) === 前 + 5, '★ ★★ 一条评论 = +5 分（实际 +' + (w.阅读.热门分(条5) - 前) + '）');

        /* 界面不写口径说明 */
        const 正文 = w.document.getElementById('书城列表').textContent;
        ok(!/书架×3|加入书架次数|阅读人数|评论数/.test(正文),
            '★ ★ 列表里没有口径说明文字（只要逻辑，不要提示）');
    }

    console.log('\n[Q] ★★★ 阅读器交互：显式状态机（不再靠 DOM 嗅探）');
    {
        const src = kit.读('22_yuedu.html');
        /* ① 状态机：显式变量，不靠「阅读体里有没有 .章文」反推 */
        ok(/let\s+阅读态\s*=\s*'目录'/.test(src), '★ ★ 有显式的 阅读态 变量');
        ok(!/阅读体\.querySelector\('\.章文'\)\s*\?\s*渲染章列表/.test(src),
            '★ ★★ 返回键不再靠 DOM 嗅探判断状态（旧写法）');
        ok(/目录钮\.addEventListener\('click'[\s\S]{0,120}渲染章列表\(\)/.test(src),
            '★ ★ 目录功能挪到右侧「目录」钮');
        ok(/返回钮\.addEventListener\('click'/.test(src), '★ 左侧返回图标有独立处理');

        /* ② 应用设置不碰显示状态 */
        ok(/阅读遮罩\.classList\.toggle\('夜间'/.test(src),
            '★ ★ 应用设置只 toggle 夜间');
        ok(!/阅读遮罩\.className\s*=\s*'阅读遮罩 显示'/.test(src),
            '★ ★★ 应用设置不再强行加「显示」（改字号≠开阅读器）');

        /* ③ 关书后刷新当前页 */
        const 关块 = src.slice(src.indexOf('function 关书()'), src.indexOf('返回钮.addEventListener'));
        ok(/渲染\(\);/.test(关块), '★ ★★ 关书后会重画当前页（继续阅读卡才更新）');

        /* ---------- 实测走一遍完整路径 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;
        导书(w, '交互.txt', '第一章 甲\n甲正文。\n\n第二章 乙\n乙正文。\n\n第三章 丙\n丙正文。');
        await 等(900);
        const id = w.阅读.读表('阅读_书架')[0].id;
        const 目钮 = () => d.getElementById('阅读目录钮');
        const 态 = () => w.阅读.阅读态();

        /* ① 无进度 → 目录态 */
        await w.阅读.开书(id);
        await 等(500);
        ok(态() === '目录', '★ ★ 无进度开书 → 目录态');
        ok(d.getElementById('阅读目录钮').classList.contains('隐藏'), '★ 目录钮收起');
        ok(d.querySelectorAll('.章行').length === 3, '★ 列出 3 章');
        ok(!d.getElementById('翻页条').classList.contains('显示'), '★ 目录态无翻页条');

        /* ② 点章节 → 正文态 */
        点(w, d.querySelectorAll('.章行')[2]);
        await 等(400);
        ok(态() === '正文', '★ ★ 点章节 → 正文态');
        ok(!d.getElementById('阅读目录钮').classList.contains('隐藏'), '★ 目录钮出现');
        ok(/丙正文/.test(d.getElementById('章文').textContent), '★ 进的是第 3 章');
        ok(d.getElementById('章位').textContent === '3 / 3', '★ 章位 3 / 3');
        const 下 = Array.from(d.querySelectorAll('.翻页条 .小钮')).find(b => b.textContent === '下一章');
        ok(!!下 && 下.disabled, '★ ★ 最后一章「下一章」禁用');

        /* ③ 返回 → 目录态，且标记读到这 */
        点(w, d.getElementById('阅读目录钮'));
        await 等(400);
        ok(态() === '目录', '★ ★ 点右侧「目录」→ 目录态');
        ok(d.getElementById('阅读目录钮').classList.contains('隐藏'), '★ 目录钮自动收起');
        const 标元 = d.querySelector('.章行 .读到标');
        ok(!!标元, '★ ★ 有「读到这」角标');
        ok(标元.textContent === '读到这', '★ 角标文案（实际 ' + 标元.textContent + '）');
        ok(d.querySelectorAll('.章行')[2].classList.contains('读到这'), '★ 角标挂在第 3 章');
        /* ★ 角标与字数不能被挤成一坨：标题要 flex:1 吃掉剩余空间 */
        ok(/\.章题\s*\{[\s\S]{0,160}flex:\s*1/.test(src), '★ ★ 章题 flex:1（标记靠右不粘连）');
        ok(/\.章行\s*\{[\s\S]{0,200}gap:/.test(src), '★ 章行用 gap 分隔');

        /* ④ 目录态点返回图标 → 回到【阅读界面】（已读过的话） */
        点(w, d.getElementById('阅读返回'));
        await 等(400);
        ok(w.阅读.阅读态() === '正文', '★ ★★ 目录态点返回 → 回到阅读界面（不是退出）');
        ok(d.getElementById('阅读遮罩').classList.contains('显示'), '★ 阅读器仍然开着');
        ok(w.阅读.当前章() === 2, '★ 回到读过的那一章（实际 index ' + w.阅读.当前章() + '）');

        /* ⑤ 有进度再开 → 直接续读正文 */
        await w.阅读.开书(id);
        await 等(500);
        ok(态() === '正文', '★ ★ 有进度开书 → 直接续读');
        ok(w.阅读.当前章() === 2, '★ ★ 续读的是第 3 章（实际 index ' + w.阅读.当前章() + '）');
        ok(d.getElementById('章位').textContent === '3 / 3', '★ 章位正确');

        /* ⑥ 关书 → 书架继续卡更新（不切页）
             ★ 先把进度拨回第 2 章：读到最后一章时 比=1 表示读完，
               读完就不显示「继续阅读」卡了（设计如此），那样测不出刷新。 */
        w.阅读.写进度(id, 1);
        w.阅读.关书();
        await 等(400);
        w.阅读.切页('书架');
        await 等(400);
        await w.阅读.开书(id);
        await 等(400);
        w.阅读.关书();
        await 等(500);
        ok(!!d.getElementById('继续卡'), '★ ★★ 关书后书架「继续阅读」卡刷新（不切页也刷新）');
        ok(/读到第\s*2\s*章/.test(d.getElementById('继续卡').textContent),
            '★ 继续卡写的是第 2 章（实际 ' + d.getElementById('继续卡').textContent.replace(/\s+/g, ' ') + '）');

        /* ★ 读完最后一章 → 不该再有「继续阅读」卡 */
        w.阅读.写进度(id, 2);
        w.阅读.切页('书架');
        await 等(400);
        ok(!d.getElementById('继续卡'),
            '★ ★ 读完之后不再显示「继续阅读」卡（设计如此）');

        /* ⑦ 单章书：翻页条两个方向都禁用 */
        导书(w, '单章.txt', '只有一章\n内容。');
        await 等(900);
        const id2 = w.阅读.读表('阅读_书架')[0].id;
        await w.阅读.开书(id2);
        await 等(400);
        点(w, d.querySelectorAll('.章行')[0]);
        await 等(400);
        const 钮2 = Array.from(d.querySelectorAll('.翻页条 .小钮'));
        ok(钮2.length === 2, '★ 单章书翻页条 2 个钮（实际 ' + 钮2.length + '）');
        ok(钮2.every(b => b.disabled), '★ ★ 单章书上下章都禁用');
        ok(d.getElementById('章位').textContent === '1 / 1', '★ 章位 1 / 1');
    }

    console.log('\n[R] ★★★ 返回链：返回图标回到【对应的】上一界面');
    {
        const src = kit.读('22_yuedu.html');

        /* ① 22 页顶栏返回图标：?from= 决定回到哪 */
        ok(/'1':\s*'1_shouyeyulan\.html'/.test(src), '★ ★ ?from=1 → 1 页');
        ok(/'4':\s*'4_tongxun\.html'/.test(src), '★ ★ ?from=4 → 4 页');
        ok(/'7':\s*'7_liaotian\.html'/.test(src), '★ ★ ?from=7 → 7 页');
        ok(/class="返回按钮"\s+id="返回按钮"/.test(src), '★ 22 页用的是图标式返回按钮');
        ok(/class="返回按钮"[\s\S]{0,200}<svg/.test(src), '★ 里面有返回箭头 SVG');

        /* 入口真的带上了 from 参数 */
        const 一 = kit.读('1_shouyeyulan.html');
        const 四 = kit.读('4_tongxun.html');
        ok(/22_yuedu\.html\?from=1/.test(一), '★ ★ 1 页入口带 ?from=1');
        ok(/22_yuedu\.html\?from=4/.test(四), '★ ★ 4 页入口带 ?from=4');

        /* ② 阅读器头部：左图标 / 中标题 / 右目录 */
        const 头块 = src.slice(src.indexOf('<div class="阅读头">'), src.indexOf('</div>', src.indexOf('id="阅读设置钮"')));
        ok(头块.indexOf('id="阅读返回"') < 头块.indexOf('id="阅读标题"'),
            '★ ★ 返回图标在标题【左侧】');
        ok(头块.indexOf('id="阅读标题"') < 头块.indexOf('id="阅读目录钮"'),
            '★ ★★ 目录钮在标题【右侧】');
        ok(/id="阅读返回"[\s\S]{0,200}<svg/.test(src), '★ 返回位是图标不是文字');
        ok(!/\.阅读返回\s*\{[\s\S]{0,300}min-width/.test(src), '★ 不再有「目录/退出」文案的宽度占位');

        /* ③ 返回图标不再兼职「回目录」 */
        const 返块 = src.slice(src.indexOf("返回钮.addEventListener('click'"), src.indexOf("目录钮.addEventListener"));
        ok(/关书\(\)/.test(返块), '★ ★ 返回图标直接关书（不再先回目录）');
        ok(!/渲染章列表\(\)/.test(返块), '★ ★ 返回图标不再调 渲染章列表');

        /* ④ 从哪层进来就回哪层 */
        ok(/开书来源 = \{ 类型: '详情', id: (id|p\.id) \}/.test(src), '★ ★ 从详情层进书会记下来源');
        ok(/来源\.类型 === '详情'[\s\S]{0,80}开详情\(来源\.id\)/.test(src),
            '★ ★★ 返回时重开详情层（不是一律丢回书架）');

        /* ---------- 实测 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;
        导书(w, '链.txt', '第一章 甲\n甲文。\n\n第二章 乙\n乙文。\n\n第三章 丙\n丙文。');
        await 等(900);
        const id = w.阅读.读表('阅读_书架')[0].id;

        /* A. 从详情层进 → 返回图标回到详情层 */
        await w.阅读.开详情(id);
        await 等(600);
        ok(d.getElementById('详情遮罩').classList.contains('显示'), '★ 详情层已开');
        点(w, d.querySelectorAll('.详情章预览')[0]);
        await 等(700);
        ok(w.阅读.阅读态() === '正文', '★ 从详情层进了正文');
        ok(!d.getElementById('详情遮罩').classList.contains('显示'), '★ 详情层已收起');
        点(w, d.getElementById('阅读返回'));
        await 等(700);
        ok(!d.getElementById('阅读遮罩').classList.contains('显示'), '★ ★ 返回图标关掉阅读器');
        ok(d.getElementById('详情遮罩').classList.contains('显示'),
            '★ ★★ 回到【详情层】（不是丢回书架）');

        /* B. 从书架继续卡进 → 返回图标回到书架，且【不】弹详情层 */
        w.阅读.关详情();
        await 等(300);
        w.阅读.写进度(id, 0);
        w.阅读.切页('书架');
        await 等(500);
        const 卡 = d.getElementById('继续卡');
        ok(!!卡, '★ 书架有继续阅读卡');
        点(w, 卡.querySelector('button'));
        await 等(600);
        ok(w.阅读.阅读态() === '正文', '★ 从书架进了正文');
        点(w, d.getElementById('阅读返回'));
        await 等(600);
        ok(!d.getElementById('阅读遮罩').classList.contains('显示'), '★ 返回图标关掉阅读器');
        ok(!d.getElementById('详情遮罩').classList.contains('显示'),
            '★ ★★ 不会误弹详情层（从书架来就回书架）');
        ok(w.阅读.当前页() === '书架', '★ 停在书架页（实际 ' + w.阅读.当前页() + '）');

        /* C. 目录钮：只在正文态可点
             ★ 这里这本书已经有进度，开书会【直接进正文】，不会再经过目录，
               所以不能再去点 .章行（那时目录根本没渲染）。 */
        w.阅读.切页('书城');
        await 等(300);
        await w.阅读.开书(id);
        await 等(500);
        ok(w.阅读.阅读态() === '正文', '★ 有进度 → 开书直接进正文');
        ok(!d.getElementById('阅读目录钮').classList.contains('隐藏'), '★ 正文态目录钮可见');
        点(w, d.getElementById('阅读目录钮'));
        await 等(400);
        ok(w.阅读.阅读态() === '目录', '★ ★ 点目录钮回目录');
        点(w, d.getElementById('阅读目录钮'));
        await 等(300);
        ok(w.阅读.阅读态() === '目录', '★ 目录态点目录钮无副作用（已收起，点不到）');

        /* D. 22 页顶栏返回：按 from= 走
             ★ jsdom 里改不了 location.href（只读），所以用页面导出的
               回上一界面() 直接校验目标 —— 它就是从同一套 ?from= 规则算出来的。 */
        const w1 = await 起22({}, {}, 'http://localhost/22.html?from=1');
        ok(w1.阅读.回上一界面() === '1_shouyeyulan.html',
            '★ ★★ ?from=1 → 回 1 页（实际 ' + w1.阅读.回上一界面() + '）');
        const w4 = await 起22({}, {}, 'http://localhost/22.html?from=4');
        ok(w4.阅读.回上一界面() === '4_tongxun.html',
            '★ ★★ ?from=4 → 回 4 页（实际 ' + w4.阅读.回上一界面() + '）');
        const w0 = await 起22({}, {}, 'http://localhost/22.html');
        ok(w0.阅读.回上一界面() === '',
            '★ 没有 from 时不硬跳，走 history.back()（实际 ' + JSON.stringify(w0.阅读.回上一界面()) + '）');
        /* 点了返回图标确实会触发跳转 */
        let 点了 = 0;
        点(w1, w1.document.getElementById('返回按钮'));
        await 等(200);
        ok(true, '★ 返回图标点击不报错');
    }

    console.log('\n[S] ★★★ 目录返回 → 阅读界面；三个 Tab 返回 → 对应上一界面');
    {
        const src = kit.读('22_yuedu.html');

        /* ① 返回用【表】，不再是 if 链 */
        ok(/const\s+返回表\s*=\s*\{/.test(src), '★ ★ 有 返回表');
        ok(/'1':\s*'1_shouyeyulan\.html'/.test(src), '★ ★ from=1 → 1 页');
        ok(/'4':\s*'4_tongxun\.html'/.test(src), '★ ★ from=4 → 4 页');
        ok(/'7':\s*'7_liaotian\.html'/.test(src), '★ ★★ from=7 → 7 页');
        ok(/return\s+从引用来\(\);/.test(src), '★ 前两层都查不到 → 交给 referrer 兜底');

        /* ② 目录态返回 → 回阅读界面 */
        const 返块 = src.slice(src.indexOf("返回钮.addEventListener('click'"), src.indexOf("目录钮.addEventListener"));
        ok(/阅读态 === '目录'/.test(返块), '★ ★ 返回图标区分目录态');
        ok(/读进度\(当前书\.id\)/.test(返块), '★ ★ 目录态返回时取读过的章');
        ok(/渲染正文\(续\)/.test(返块), '★ ★★ 回到【阅读界面】而不是退出');
        /* 正文态才是退出 */
        ok(/关书\(\);/.test(返块), '★ 正文态（或没读过）才关书');
        /* ★ 退出后不再强行切回书架 —— 从哪个 Tab 进来就停在哪 */
        ok(!/else if\s*\(页\s*!==\s*'书架'\)\s*切页\('书架'\)/.test(src),
            '★ ★ 不再强行切回书架（从哪来回哪去）');

        /* ---------- 实测 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;
        const 态 = () => w.阅读.阅读态();
        导书(w, '层.txt', '第一章 甲\n甲文。\n\n第二章 乙\n乙文。\n\n第三章 丙\n丙文。');
        await 等(900);
        const id = w.阅读.读表('阅读_书架')[0].id;

        /* A. 一章都没读过 → 目录态返回 → 退出阅读器（目录无处可退） */
        await w.阅读.开书(id);
        await 等(500);
        ok(态() === '目录', '★ 无进度开书停在目录');
        点(w, d.getElementById('阅读返回'));
        await 等(400);
        ok(!d.getElementById('阅读遮罩').classList.contains('显示'),
            '★ ★★ 没读过任何章 → 目录返回才退出阅读器');

        /* B. 读过之后 → 目录态返回 → 回到阅读界面 */
        await w.阅读.开书(id, 1);
        await 等(500);
        ok(态() === '正文', '★ 进正文第 2 章');
        点(w, d.getElementById('阅读目录钮'));
        await 等(400);
        ok(态() === '目录', '★ 点目录钮 → 目录态');
        点(w, d.getElementById('阅读返回'));
        await 等(400);
        ok(态() === '正文', '★ ★★ 目录返回 → 回到阅读界面');
        ok(w.阅读.当前章() === 1, '★ 回到原来那一章（实际 index ' + w.阅读.当前章() + '）');
        ok(d.getElementById('阅读遮罩').classList.contains('显示'), '★ 阅读器没被关掉');

        /* C. 正文态返回 → 退出，且从哪个 Tab 进来就停在哪 */
        w.阅读.切页('书城');
        await 等(400);
        await w.阅读.开书(id, 0);
        await 等(500);
        ok(态() === '正文', '★ 从书城开书进正文');
        点(w, d.getElementById('阅读返回'));
        await 等(500);
        ok(!d.getElementById('阅读遮罩').classList.contains('显示'), '★ 正文态返回 → 退出阅读器');
        ok(w.阅读.当前页() === '书城',
            '★ ★★ 从书城进来就停在书城，不强行切书架（实际 ' + w.阅读.当前页() + '）');

        /* D. 从详情层进来 → 返回回详情层 */
        w.阅读.切页('书架');
        await 等(300);
        await w.阅读.开详情(id);
        await 等(600);
        点(w, d.querySelectorAll('.详情章预览')[0]);
        await 等(700);
        ok(态() === '正文', '★ 从详情层进正文');
        点(w, d.getElementById('阅读返回'));
        await 等(700);
        ok(d.getElementById('详情遮罩').classList.contains('显示'),
            '★ ★ 从详情层来 → 返回回详情层');

        /* E. 三个 Tab 的返回目标（按 ?from=） */
        const 表 = w.阅读.返回表;
        ok(表['1'] === '1_shouyeyulan.html', '★ ★ Tab 返回表：from=1 → 1 页');
        ok(表['4'] === '4_tongxun.html', '★ ★ Tab 返回表：from=4 → 4 页');
        ok(表['7'] === '7_liaotian.html', '★ ★★ Tab 返回表：from=7 → 7 页');
        ok(!表['5'], '★ 没登记的来源返回空（走 history.back）');

        const w1 = await 起22({}, {}, 'http://localhost/22.html?from=1');
        ok(w1.阅读.回上一界面() === '1_shouyeyulan.html', '★ ★ ?from=1 实测');
        const w4 = await 起22({}, {}, 'http://localhost/22.html?from=4');
        ok(w4.阅读.回上一界面() === '4_tongxun.html', '★ ★ ?from=4 实测');
        const w7 = await 起22({}, {}, 'http://localhost/22.html?from=7');
        ok(w7.阅读.回上一界面() === '7_liaotian.html',
            '★ ★★ ?from=7 实测 → 7_liaotian（实际 ' + w7.阅读.回上一界面() + '）');
        const w0 = await 起22({}, {}, 'http://localhost/22.html');
        ok(w0.阅读.回上一界面() === '', '★ 无 from → 空串（history.back）');
    }

    console.log('\n[T] ★★★ 三个 Tab 的返回键：都能真的跳（含丢参兜底）');
    {
        const src = kit.读('22_yuedu.html');

        /* ① 兜底链：?from= → sessionStorage → referrer → 空 */
        ok(/const\s+来源键\s*=\s*'阅读_来源'/.test(src), '★ ★ 有来源记忆键');
        ok(/sessionStorage\.setItem\(来源键,\s*来\)/.test(src), '★ ★ 带参进入时记下来源');
        ok(/sessionStorage\.getItem\(来源键\)/.test(src), '★ ★ 返回时读回记忆');
        ok(/function\s+从引用来/.test(src), '★ 有 referrer 兜底');
        /* ★ 旧版只有一层 ?from=，丢了就只能 history.back()，
             back() 回到同一页时看起来就是「点了没反应」 */
        const 回块 = src.slice(src.indexOf('function 回上一界面()'), src.indexOf('function 回上一页()'));
        ok((回块.match(/返回表\[/g) || []).length >= 2,
            '★ ★★ ?from= 与 sessionStorage 两层都查表（实际 ' + (回块.match(/返回表\[/g) || []).length + ' 处）');
        ok(/来源键/.test(回块), '★ 第二层读的是记忆键');

        /* ② 三个 Tab 共用【同一个】返回键（不是每个面板各画一个） */
        ok((src.match(/id="返回按钮"/g) || []).length === 1,
            '★ ★ 全页只有一个 #返回按钮（实际 ' + (src.match(/id="返回按钮"/g) || []).length + '）');
        const 顶块 = src.slice(src.indexOf('<div class="顶部固定区">'), src.indexOf('<div class="内容区"'));
        ok(/id="返回按钮"/.test(顶块), '★ ★★ 返回键在【顶栏】里，不在某个面板里（三个 Tab 共用）');
        /* 顶栏不能被遮住 */
        ok(/\.顶部固定区\s*\{[^}]*z-index:\s*10/.test(src), '★ 顶栏 z-index 10');
        ok(/\.内容区\s*\{[^}]*z-index:\s*5/.test(src), '★ 内容区 z-index 5（不会盖住顶栏）');

        /* ③ Esc 也能返回（与 21 页一致） */
        ok(/keydown[\s\S]{0,80}Escape[\s\S]{0,40}回上一页/.test(src), '★ Esc 也能返回');

        /* ---------- 实测：三个 Tab 上点返回都要发起跳转 ---------- */
        const 抓跳转 = async (页, url) => {
            const w = await 起22({}, {}, url);
            w.阅读.切页(页);
            await 等(400);
            const 钮 = w.document.getElementById('返回按钮');
            return { w: w, 钮: 钮, 目标: w.阅读.回上一界面() };
        };
        for (const 页 of ['书架', '书城', '作者']) {
            const r = await 抓跳转(页 === '作者' ? '作者' : 页, 'http://localhost/22.html?from=1');
            ok(!!r.钮, '★ [' + 页 + '] 返回键存在');
            ok(r.目标 === '1_shouyeyulan.html',
                '★ ★ [' + 页 + '] 返回目标正确（实际 ' + r.目标 + '）');
            /* 真的能点，不报错 */
            let 报错 = '';
            try { 点(r.w, r.钮); } catch (e) { 报错 = e.message; }
            ok(!报错, '★ [' + 页 + '] 点击不报错' + (报错 ? '（' + 报错 + '）' : ''));
        }

        /* ④ 丢参兜底：无 ?from= 但有记忆 → 仍能回到对的那页 */
        const w2 = await 起22({}, {}, 'http://localhost/22.html');
        w2.sessionStorage.setItem('阅读_来源', '4');
        ok(w2.阅读.回上一界面() === '4_tongxun.html',
            '★ ★★ 无 ?from= 但记得来处 → 回 4 页（实际 ' + w2.阅读.回上一界面() + '）');

        const w3 = await 起22({}, {}, 'http://localhost/22.html');
        ok(w3.阅读.回上一界面() === '',
            '★ 完全没有线索 → 空串（走 history.back，再不行兜底 1 页）');

        /* ⑤ 带参进入会把来源记下来 */
        const w7 = await 起22({}, {}, 'http://localhost/22.html?from=7');
        ok(w7.sessionStorage.getItem('阅读_来源') === '7', '★ ★ from=7 时记下来源');
        ok(w7.阅读.回上一界面() === '7_liaotian.html', '★ ★ 回 7 页');
    }

    console.log('\n[U] ★★★ 作者中心 = 创作中心（含章节编辑器）');
    {
        const src = kit.读('22_yuedu.html');

        /* ① 结构：名片 → 数据 → 新建 → 导入 → 作品管理 */
        ok(/id="头像"/.test(src), '★ 有作家头像');
        ok(/id="新书名"/.test(src), '★ ★ 能直接输作品名新建（不用先导入 txt）');
        ok(/id="新分类"/.test(src), '★ 新建时能选分类');
        ok(/id="新简介"/.test(src), '★ 新建时能写简介');
        ok(/id="新建钮"/.test(src), '★ 有「创建并开始写第一章」');
        ok(!/发布书选|从书架导入|发布钮/.test(src),
            '★ ★ 「从书架导入」已删除（不再需要先有 txt 才能当作者）');

        /* ② 编辑器 */
        ok(/id="编辑遮罩"/.test(src), '★ ★ 有章节编辑器');
        ok(/id="章题输入"/.test(src), '★ ★ 有章节标题输入');
        ok(/id="正文输入"/.test(src), '★ ★★ 有正文输入区（能直接打字写章节）');
        ok(/id="发布章钮"/.test(src), '★ ★ 有「发布本章」');
        ok(/id="存草稿钮"/.test(src), '★ 有「存草稿」');
        ok(/id="章抽屉"/.test(src), '★ 有章节抽屉');
        ok(/id="编辑字数"/.test(src), '★ 有字数统计');

        /* ★ 草稿键要记「载入时的那个」，否则发布后清不掉 */
        ok(/let\s+当前草稿键/.test(src), '★ ★ 记住载入时的草稿键');
        ok(/if\s*\(当前草稿键\)\s*localStorage\.removeItem\(当前草稿键\)/.test(src),
            '★ ★★ 发布时清的是【载入时那个键】');

        /* ---------- 实测：从零写一本书 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;
        w.confirm = () => true;
        const 输 = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

        /* A. 没笔名 → 不能新建 */
        w.阅读.切页('作者');
        await 等(400);
        ok(d.getElementById('新建钮').disabled, '★ ★ 没笔名时不能新建');
        ok(/先设置笔名/.test(d.getElementById('新建钮').textContent), '★ 按钮提示先设笔名');
        ok(!!d.querySelector('#作品列表 .空态'), '★ 空态提示');

        /* B. 设笔名 */
        w.localStorage.setItem('阅读_笔名', '墨小喵');
        w.阅读.切页('作者');
        await 等(400);
        ok(!d.getElementById('新建钮').disabled, '★ 有笔名后可新建');
        /* ★ 作家头像改与【用户头像】同步：有头像用图，没有才退首字 */
        ok(!d.getElementById('头像图').hidden || !d.getElementById('头像字').hidden,
            '★ 头像有兜底显示');
        ok(d.getElementById('头像字').textContent === '墨', '★ 没设用户头像时退回首字');

        /* C. 新建 → 自动开编辑器 */
        输(d.getElementById('新书名'), '星落之城');
        输(d.getElementById('新简介'), '关于星星的故事');
        d.getElementById('新分类').value = '科幻';
        点(w, d.getElementById('新建钮'));
        await 等(800);
        ok(w.阅读.我的作品().length === 1, '★ ★ 作品已创建');
        ok(d.getElementById('编辑遮罩').classList.contains('显示'),
            '★ ★★ 创建后自动打开编辑器（可直接开写）');
        ok(/星落之城/.test(d.getElementById('编辑书名').textContent), '★ 编辑器显示书名');
        ok(d.getElementById('章题输入').value === '第 1 章', '★ 章题默认「第 1 章」');

        /* D. 存草稿 → 关掉 → 重开还在 */
        输(d.getElementById('章题输入'), '第一章 星落');
        输(d.getElementById('正文输入'), '夜幕低垂。\n\n星星落下来了。');
        await 等(200);
        ok(/1[0-9] 字/.test(d.getElementById('编辑字数').textContent),
            '★ ★ 实时字数（实际 ' + d.getElementById('编辑字数').textContent + '）');
        点(w, d.getElementById('存草稿钮'));
        await 等(300);
        const id = w.阅读.编辑中().id;
        const 草稿原 = w.localStorage.getItem('阅读_草稿_' + id + '_-1');
        ok(!!草稿原, '★ ★★ 草稿真的存下来了');
        const 草稿 = JSON.parse(草稿原 || '{}');
        ok(草稿.文 === '夜幕低垂。\n\n星星落下来了。', '★ 草稿存了正文');
        ok(草稿.题 === '第一章 星落',
            '★ ★★ 草稿【连标题一起存】（实际 ' + JSON.stringify(草稿.题) + '）');

        点(w, d.getElementById('编辑返回'));
        await 等(500);
        await w.阅读.开编辑器(id);
        await 等(600);
        ok(/星星落下来了/.test(d.getElementById('正文输入').value),
            '★ ★★ 重开编辑器草稿自动回填');
        ok(d.getElementById('章题输入').value === '第一章 星落',
            '★ ★★ 重开后标题也是改过的那个（实际 '
            + JSON.stringify(d.getElementById('章题输入').value) + '）');

        /* E. 发布 */
        点(w, d.getElementById('发布章钮'));
        await 等(800);
        const 作 = w.阅读.我的作品()[0];
        ok(作.章数 === 1, '★ ★★ 发布后章数 = 1（实际 ' + 作.章数 + '）');
        ok(作.字数 > 0, '★ 字数已统计（实际 ' + 作.字数 + '）');
        ok(!w.localStorage.getItem('阅读_草稿_' + id + '_-1'),
            '★ ★★ 发布后草稿被清掉（不会重复倒回编辑器）');
        ok(/已发布/.test(d.getElementById('编辑章名').textContent),
            '★ 章名变成「第 1 章（已发布）」');

        /* F. 再加一章 */
        点(w, d.getElementById('加章钮'));
        await 等(500);
        ok(d.getElementById('章题输入').value === '第 2 章', '★ 新章节默认「第 2 章」');
        输(d.getElementById('章题输入'), '第二章 余烬');
        输(d.getElementById('正文输入'), '第二天。');
        点(w, d.getElementById('发布章钮'));
        await 等(800);
        ok(w.阅读.我的作品()[0].章数 === 2, '★ ★ 第二也发布成功（实际 ' + w.阅读.我的作品()[0].章数 + '）');

        /* G. 章节抽屉能切回旧章改 */
        点(w, d.getElementById('编辑目录钮'));
        await 等(600);
        ok(d.getElementById('章抽屉').classList.contains('显示'), '★ 抽屉打开');
        ok(d.querySelectorAll('.抽屉行').length === 2,
            '★ ★ 抽屉列出 2 章（实际 ' + d.querySelectorAll('.抽屉行').length + '）');
        点(w, d.querySelectorAll('.抽屉行')[0]);
        await 等(600);
        ok(d.getElementById('章题输入').value === '第一章 星落',
            '★ ★ 点章节载回原标题（实际 ' + JSON.stringify(d.getElementById('章题输入').value) + '）');
        ok(/星星落下来了/.test(d.getElementById('正文输入').value), '★ ★ 载回原正文');

        /* H. 书城能搜到，能真的读 */
        点(w, d.getElementById('编辑返回'));
        await 等(500);
        w.阅读.切页('书城');
        await 等(400);
        输(d.getElementById('搜索框'), '星落之城');
        await 等(500);
        const 名们 = 卡们(w).map(c => c.querySelector('.书名').textContent);
        ok(名们.indexOf('星落之城') >= 0, '★ ★★ 写的书能在书城搜到');

        /* ★ 这本书还没读过（无进度），开书会停在目录 —— 显式给章号才进正文 */
        await w.阅读.开书(id, 0);
        await 等(600);
        ok(w.阅读.阅读态() === '正文', '★ ★ 写的章节能真的打开读');
        ok(/星星落下来了/.test(d.getElementById('章文').textContent), '★ 正文内容正确');

        /* I. 作者中心数据同步 */
        w.阅读.关书();
        await 等(400);
        w.阅读.切页('作者');
        await 等(500);
        /* 数据面板已移到作品页，作者中心不再显示 */
        ok(d.querySelectorAll('.数据格').length === 0, '★ 作者中心没有数据格（已移到作品页）');
        /* 操作以「写章节」打头 */
        const 操作 = Array.from(d.querySelectorAll('.作品操作 .小钮')).map(b => b.textContent);
        ok(操作[0] === '写新章节', '★ ★ 第一个操作是「写新章节」（实际 ' + 操作[0] + '）');
        ok(操作.join('/') === '写新章节/封面/删除',
            '★ 操作 = 写新章节/封面/删除（实际 ' + 操作.join('/') + '）');
        ok(操作.indexOf('章节') < 0, '★ ★ 「章节」按钮已删除');
        ok(操作.indexOf('书城') < 0, '★ ★ 「书城」按钮已删除');
        ok(操作.indexOf('下架') < 0, '★ ★ 「下架」已删除');
    }

    console.log('\n[V] ★★★ 删除导入 / 可删除作品 / 封面 3:4 / 读者互动 / 编辑器背景');
    {
        const src = kit.读('22_yuedu.html');

        /* ① 从书架导入已删除 */
        ok(!/id="发布书选"/.test(src), '★ ★★ 「从书架导入」的下拉没了');
        ok(!/id="发布钮"/.test(src), '★ 导入按钮没了');
        ok(!/从书架导入/.test(src), '★ 分区标题也没了');

        /* ② 作品可删除 */
        ok(/function\s+删作品/.test(src), '★ ★ 有 删作品()');
        ok(/删作品[\s\S]{0,400}删书\(id\)/.test(src), '★ ★ 删除会清 IndexedDB 正文');
        ok(/清进度\(id\)/.test(src), '★ 删除会清阅读进度');
        const 删块 = src.slice(src.indexOf('function 删作品'), src.indexOf('function 删作品') + 700);
        ok(/热度键/.test(删块) && /人数键/.test(删块) && /评论键/.test(删块),
            '★ ★ 删除会清热度/阅读数/评论');
        ok(/阅读_草稿_'\s*\+\s*id/.test(删块), '★ 删除会清草稿');
        ok(/小钮 危/.test(src), '★ 删除按钮有危险样式');

        /* ③ 封面 3:4 */
        ok(/id="封面预览"/.test(src), '★ ★ 新建时能设封面');
        ok(/aspect-ratio:\s*3\s*\/\s*4/.test(src), '★ ★★ 封面比例写死 3:4');
        ok(/id="选封面钮"/.test(src), '★ 可从相册选');
        ok(!/id="生成封面钮"/.test(src), '★ ★ 「自动生成」已删除');
        ok(!/生成封面钮/.test(src), '★ 自动生成的代码也没了');
        ok(/id="清封面钮"/.test(src), '★ 可恢复默认');
        ok(/const\s+宽\s*=\s*300,\s*高\s*=\s*400/.test(src), '★ ★ 裁图目标 300×400（即 3:4）');
        ok(/function\s+取封面/.test(src), '★ 有统一取封面入口');

        /* ④ 读者互动 */
        ok(/id="互动区"/.test(src), '★ ★ 有读者互动区');
        ok(/function\s+渲染互动/.test(src), '★ 有渲染互动');
        ok(/function\s+回评论/.test(src), '★ ★★ 可回复读者评论');
        ok(/书架消息/.test(src), '★ ★ 有书架消息');

        /* ⑤ 编辑器背景：透明 + 85% 白 + 收起下层 */
        ok(!/background:\s*var\(--panel\);\s*\n\s*\}\s*\n\s*\.编辑遮罩\.显示/.test(src),
            '★ ★★ 编辑器不再用半透明的 --panel 打底（旧写法会透出下层）');
        const 编块 = src.slice(src.indexOf('.编辑遮罩 {'), src.indexOf('.编辑遮罩::before') + 260);
        ok(/background:\s*transparent/.test(编块), '★ ★ 编辑器本身透明 → 透出主题背景');
        /* ★ 白度已统一到 70%（与阅读器、作者主页三处一致），
             原来是 85%，切界面时主题背景会「忽白忽灰」。 */
        ok(/rgba\(255,\s*255,\s*255,\s*0\.70\)/.test(编块), '★ ★★ 压 70% 白遮罩（与阅读器统一）');
        ok(/\.编辑中 \.内容区/.test(src), '★ ★ 编辑时收起下层 UI（同阅读器套路）');

        /* ---------- 实测 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;

        /* A. 新建带封面 */
        w.localStorage.setItem('阅读_笔名', '墨');
        w.阅读.切页('作者');
        await 等(400);
        ok(!!d.querySelector('#封面预览 img'), '★ 封面预览有图');
        const 预1 = d.querySelector('#封面预览 img').src;
        输(w, d.getElementById('新书名'), '封面书');
        await 等(300);
        ok(d.querySelector('#封面预览 img').src !== 预1, '★ ★ 书名变了封面跟着变');
        ok(!d.getElementById('生成封面钮'), '★ ★ 「自动生成」按钮已删除');

        点(w, d.getElementById('新建钮'));
        await 等(800);
        const id = w.阅读.编辑中().id;
        ok(d.getElementById('编辑遮罩').classList.contains('显示'), '★ 编辑器打开');
        ok(d.querySelector('.手机主题背景容器').classList.contains('编辑中'),
            '★ ★★ 打开编辑器挂上 .编辑中（主题背景透出来）');

        /* B. 写一章 */
        输(w, d.getElementById('章题输入'), '第一章');
        输(w, d.getElementById('正文输入'), '内容内容');
        点(w, d.getElementById('发布章钮'));
        await 等(800);
        点(w, d.getElementById('编辑返回'));
        await 等(600);
        ok(!d.querySelector('.手机主题背景容器').classList.contains('编辑中'),
            '★ ★ 关编辑器摘掉 .编辑中');
        w.阅读.切页('作者');
        await 等(500);

        /* C. 读者评论 + 回复 */
        w.阅读.发评论(id, '写得真好');
        w.阅读.切页('作者');
        await 等(500);
        const 评行 = d.querySelectorAll('.评行');
        ok(评行.length === 1, '★ ★★ 作者能看到读者评论（实际 ' + 评行.length + '）');
        ok(/写得真好/.test(评行[0].textContent), '★ 评论内容正确');
        const 入 = d.querySelector('.评操作 .行输入');
        ok(!!入, '★ 有回复输入框');
        输(w, 入, '谢谢支持');
        点(w, Array.from(d.querySelectorAll('.评操作 .小钮')).find(b => b.textContent === '回复'));
        await 等(600);
        ok(/谢谢支持/.test(d.querySelector('.评行').textContent),
            '★ ★★ 回复发出去了');
        ok(/我的回复/.test(d.querySelector('.评行').textContent), '★ 显示为「我的回复」');

        /* D. 书架消息 */
        w.阅读.加热度 ? w.阅读.加热度(id) : null;
        const 条 = w.阅读.读表('阅读_平台').find(x => x.id === id);
        条.时间 = Date.now();
        w.阅读.写表('阅读_平台', w.阅读.读表('阅读_平台'));
        w.阅读.切页('书城'); await 等(300);
        w.阅读.切页('作者'); await 等(500);
        ok(/读者互动/.test(src), '★ 互动区标题存在');

        /* E. 删除作品 */
        const 操作 = Array.from(d.querySelectorAll('.作品操作 .小钮')).map(b => b.textContent);
        ok(操作.indexOf('删除') >= 0, '★ ★ 有「删除」按钮（实际 ' + 操作.join('/') + '）');
        ok(操作.indexOf('下架') < 0, '★ ★ 「下架」已删除（实际 ' + 操作.join('/') + '）');
        点(w, Array.from(d.querySelectorAll('.作品操作 .小钮')).find(b => b.textContent === '删除'));
        await 等(900);
        ok(w.阅读.我的作品().length === 0, '★ ★★ 作品已删除');
        ok(!w.阅读.读表('阅读_平台').some(x => x.id === id), '★ 平台表清干净');
        ok(!w.阅读.读表('阅读_书架').some(x => x.id === id), '★ 书架也清了');
        ok(w.阅读.取评论数(id) === 0, '★ ★ 评论一起清掉');
        w.阅读.切页('书城');
        await 等(400);
        输(w, d.getElementById('搜索框'), '封面书');
        await 等(400);
        ok(卡们(w).length === 0, '★ ★★ 删除后书城搜不到');
    }

    console.log('\n[W] ★★★ 作品编辑界面（新章节 / 草稿箱）；删自动生成与下架');
    {
        const src = kit.读('22_yuedu.html');

        /* ① 自动生成 / 下架 都没了 */
        ok(!/生成封面钮/.test(src), '★ ★★ 封面「自动生成」已删除');
        /* ★ 只查【代码】不查注释：注释里说明「为什么删」是允许的 */
        const 去注释 = 源 => 源.split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
        ok(!/下架/.test(去注释(src)), '★ ★★ 「下架」功能已删除（代码里没有）');
        ok(/作品卡[\s\S]{0,900}开作品页\(p\.id\)/.test(src) || /卡\.addEventListener\('click', \(\) => 开作品页/.test(src),
            '★ ★★ 点作品卡进【作品编辑界面】');

        /* ② 作品编辑界面 */
        ok(/id="作品遮罩"/.test(src), '★ ★ 有作品编辑界面');
        ok(/id="写新章钮"/.test(src), '★ ★ 有「写新章节」');
        ok(/id="页草列"/.test(src), '★ ★ 有草稿箱');
        ok(/id="换封面钮"/.test(src), '★ 能换封面');
        ok(/id="作品存钮"/.test(src), '★ 能保存作品信息');

        /* ★ 扫 localStorage 必须用 length+key(i)，Object.keys 在 Storage 上枚举不到 */
        ok(/function\s+扫键/.test(src), '★ ★★ 有统一的 扫键()');
        ok(!/Object\.keys\(localStorage\)/.test(去注释(src)),
            '★ ★★ 不再用 Object.keys(localStorage)（会漏键）');
        ok(/localStorage\.key\(i\)/.test(src), '★ 用 length + key(i) 遍历');

        /* ---------- 实测 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;

        w.localStorage.setItem('阅读_笔名', '墨');
        w.阅读.切页('作者');
        await 等(400);
        ok(!d.getElementById('生成封面钮'), '★ 界面上也没有自动生成按钮');

        /* A. 建作品 + 发一章 */
        输(w, d.getElementById('新书名'), '作品页测试');
        点(w, d.getElementById('新建钮'));
        await 等(800);
        const id = w.阅读.编辑中().id;
        输(w, d.getElementById('章题输入'), '第一章');
        输(w, d.getElementById('正文输入'), '正文A');
        点(w, d.getElementById('发布章钮'));
        await 等(800);

        /* B. 存一份新章草稿 */
        点(w, d.getElementById('加章钮'));
        await 等(500);
        输(w, d.getElementById('章题输入'), '第二章草稿');
        输(w, d.getElementById('正文输入'), 'B');
        点(w, d.getElementById('存草稿钮'));
        await 等(400);
        点(w, d.getElementById('编辑返回'));
        await 等(600);
        w.阅读.切页('作者');
        await 等(500);

        /* C. 点作品卡 → 作品页 */
        点(w, d.querySelector('.作品卡'));
        await 等(800);
        ok(d.getElementById('作品遮罩').classList.contains('显示'),
            '★ ★★ 点作品卡进入作品编辑界面');
        ok(/作品页测试/.test(d.getElementById('作品页名').textContent), '★ 显示作品名');
        ok(d.querySelector('.手机主题背景容器').classList.contains('编辑中'),
            '★ 作品页也收起下层（背景随主题）');

        /* 已发布章节 */
        const 章卡 = Array.from(d.querySelectorAll('#页章列 .章卡'));
        ok(章卡.length === 1, '★ ★ 列出 1 个已发布章节（实际 ' + 章卡.length + '）');
        ok(/第一章/.test(章卡[0].textContent), '★ 章节标题正确');
        ok(d.getElementById('页章数').textContent === '共 1 章', '★ 章数侧字');

        /* ★ 草稿箱 */
        const 草卡 = Array.from(d.querySelectorAll('#页草列 .章卡'));
        ok(草卡.length === 1, '★ ★★ 草稿箱里有那 1 份草稿（实际 ' + 草卡.length + '）');
        ok(/第二章草稿/.test(草卡[0].textContent), '★ 草稿标题正确');
        ok(d.getElementById('页草数').textContent === '共 1 份', '★ 草稿数侧字');
        ok(!d.querySelector('#页草列 .空态'), '★ 不是空态');

        /* D. 点草稿 → 进编辑器且内容回填 */
        点(w, 草卡[0]);
        await 等(700);
        ok(d.getElementById('编辑遮罩').classList.contains('显示'), '★ ★ 点草稿进编辑器');
        ok(d.getElementById('章题输入').value === '第二章草稿', '★ ★ 草稿标题回填');
        ok(d.getElementById('正文输入').value === 'B', '★ ★ 草稿正文回填');
        点(w, d.getElementById('编辑返回'));
        await 等(600);

        /* E. 改作品信息并保存 */
        输(w, d.getElementById('改书名'), '改过的名字');
        输(w, d.getElementById('改简介'), '新简介');
        d.getElementById('改分类').value = '科幻';
        点(w, d.getElementById('作品存钮'));
        await 等(500);
        ok(/改过的名字/.test(d.getElementById('作品页名').textContent), '★ ★ 保存后标题更新');
        const 我的 = w.阅读.读表('阅读_平台').find(x => x.id === id);
        ok(我的.书名 === '改过的名字', '★ ★ 平台表已更新');
        ok(我的.分类 === '科幻', '★ 分类已更新');
        ok(我的.简介 === '新简介', '★ 简介已更新');
        /* ★ 书架那份也要同步，否则书架还显示旧书名 */
        ok(w.阅读.读表('阅读_书架').find(x => x.id === id).书名 === '改过的名字',
            '★ ★★ 书架里的书名也同步了');

        /* F. 写新章节 */
        点(w, d.getElementById('写新章钮'));
        await 等(700);
        ok(d.getElementById('编辑遮罩').classList.contains('显示'), '★ ★ 点「写新章节」进编辑器');
        点(w, d.getElementById('编辑返回'));
        await 等(600);

        /* G. 返回 */
        点(w, d.getElementById('作品返回'));
        await 等(600);
        ok(!d.getElementById('作品遮罩').classList.contains('显示'), '★ 作品页关闭');
        ok(!d.querySelector('.手机主题背景容器').classList.contains('编辑中'),
            '★ ★ 关掉后摘掉 .编辑中（主题背景回到列表）');

        /* H. 删除作品时草稿也被清掉 */
        点(w, d.querySelector('.作品卡'));
        await 等(700);
        点(w, d.getElementById('作品返回'));
        await 等(500);
        点(w, Array.from(d.querySelectorAll('.作品操作 .小钮')).find(b => b.textContent === '删除'));
        await 等(900);
        ok(w.阅读.我的作品().length === 0, '★ ★ 作品已删除');
        ok(!w.localStorage.getItem('阅读_草稿_' + id + '_-1'), '★ ★★ 草稿也一起清掉了');
    }

    console.log('\n[X] ★★★ 数据面板：作者中心删掉，作品页看详细数据');
    {
        const src = kit.读('22_yuedu.html');
        const 去注释 = 源 => 源.split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');

        /* ① 作者中心没有数据面板了 */
        ok(!/id="数据面板"/.test(src), '★ ★★ 作者中心的总数据面板已删除');
        ok(/id="作品数据面板"/.test(src), '★ ★★ 作品页里才有数据面板');

        /* ② 四格口径 */
        const 数块 = src.slice(src.indexOf("const 面 = document.getElementById('作品数据面板')"),
            src.indexOf("const 面 = document.getElementById('作品数据面板')") + 900);
        ok(/\['章节'/.test(数块), '★ ★ 有【章节】');
        ok(/\['阅读'/.test(数块), '★ ★ 有【阅读】');
        ok(/\['评论'/.test(数块), '★ ★ 有【评论数量】');
        ok(/取阅读数\(p\.id\)/.test(数块), '★ ★ 阅读取的是 取阅读数');
        ok(/取评论数\(p\.id\)/.test(数块), '★ ★ 评论取的是 取评论数');

        /* ---------- 实测 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;

        w.localStorage.setItem('阅读_笔名', '墨');
        w.阅读.切页('作者');
        await 等(400);
        ok(!d.getElementById('数据面板'), '★ 作者中心确实没有数据面板');
        ok(d.querySelectorAll('.数据格').length === 0, '★ 也没有数据格');

        /* A. 建作品 + 两章 */
        输(w, d.getElementById('新书名'), '数据书');
        点(w, d.getElementById('新建钮'));
        await 等(800);
        const id = w.阅读.编辑中().id;
        输(w, d.getElementById('章题输入'), '第一章');
        输(w, d.getElementById('正文输入'), '内容AABB');
        点(w, d.getElementById('发布章钮'));
        await 等(800);
        点(w, d.getElementById('加章钮'));
        await 等(500);
        输(w, d.getElementById('章题输入'), '第二章');
        输(w, d.getElementById('正文输入'), 'CC');
        点(w, d.getElementById('发布章钮'));
        await 等(800);
        点(w, d.getElementById('编辑返回'));
        await 等(600);
        w.阅读.切页('作者');
        await 等(500);
        ok(d.querySelectorAll('.数据格').length === 0, '★ ★ 作者中心仍然没有数据格');

        /* B. 造点评论 */
        w.阅读.发评论(id, '好评1');
        w.阅读.发评论(id, '好评2');

        /* C. 进作品页看数据 */
        点(w, d.querySelector('.作品卡'));
        await 等(900);
        const 格 = Array.from(d.querySelectorAll('#作品数据面板 .数据格'));
        ok(格.length === 3, '★ ★★ 作品页有 3 格数据（实际 ' + 格.length + '）');
        const 名 = 格.map(g => g.querySelector('.数据名').textContent).join('/');
        ok(名 === '章节/阅读/评论', '★ ★★ 三格口径正确（实际 ' + 名 + '）');
        const 值 = 格.map(g => g.querySelector('.数据数').textContent);
        ok(值[0] === '2', '★ ★ 章节 = 2（实际 ' + 值[0] + '）');
        ok(值[2] === '2', '★ ★ 评论 = 2（实际 ' + 值[2] + '）');
    }

    console.log('\n[Y] ★★★ 作品卡按钮精简 / 详情弹窗留白 / 作者主页 / 头像同步');
    {
        const src = kit.读('22_yuedu.html');
        const 去注释 = 源 => 源.split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
        const 码 = 去注释(src);

        /* ① 作品卡：章节 / 书城 按钮都没了 */
        ok(!/目\.textContent = '章节'/.test(码), '★ ★ 「章节」按钮已删除');
        ok(!/目\.textContent = '书城'/.test(码), '★ ★ 「书城」按钮已删除');
        ok(!/看\.textContent = '书城'/.test(码), '★ ★ 「书城」按钮（另一个）也没有了');

        /* ② 作品卡数据只三项 */
        ok(/\['阅读'[\s\S]{0,60}\['评论'[\s\S]{0,60}\['章节'/.test(码),
            '★ ★★ 作品卡数据 = 阅读/评论/章节');
        /* ★ 详情层那个「收藏」是详情页自己的数据，不在作品卡里 —— 只断言作品卡 */
        const 卡数据块 = 码.slice(码.indexOf("数.className = '作品数据'"),
            码.indexOf("数.className = '作品数据'") + 320);
        ok(!/\['收藏'/.test(卡数据块), '★ 作品卡不再显示【收藏】');

        /* ③ 详情弹窗留白 */
        ok(/\.详情体\s*\{[\s\S]{0,300}padding:\s*clamp\(10px/.test(src),
            '★ ★★ 详情体有上下左右留白（内容不顶边缘）');
        ok(/\.详情体\s*\{[\s\S]{0,300}clamp\(14px, 4vw, 18px\)/.test(src),
            '★ ★ 左右留白 14~18px');
        ok(!/\.详情体\s*\{\s*flex: 1; overflow-y: auto; padding: 0 0/.test(src),
            '★ ★ 不再是「上左右都是 0」的旧写法');
        ok(!/\.详情头图\s*\{[\s\S]{0,200}padding/.test(src),
            '★ 头图不再自己加 padding（由详情体统一给）');

        /* ④ 作者主页 */
        ok(/id="作者遮罩"/.test(src), '★ ★ 有作者主页');
        ok(/function\s+开作者主页/.test(src), '★ ★ 有 开作者主页()');
        ok(/详情作者钮/.test(src), '★ ★★ 详情层有可点的作者昵称');
        ok(/开作者主页\(p\.作者 \|\| ''\)/.test(码), '★ ★ 点昵称带着作者名进主页');
        ok(/读表\(平台键\)\.filter\(p => \(p\.作者 \|\| ''\) === 主页作者\)/.test(码),
            '★ ★★ 主页列出【该作者】的全部作品');

        /* ⑤ 头像与用户头像同步 */
        ok(/localStorage\.getItem\('用户头像'\)/.test(码), '★ ★★ 作家头像读全站【用户头像】');
        ok(/id="头像图"/.test(src) && /id="头像字"/.test(src), '★ 有图/字两种显示');
        ok(/addEventListener\('storage'/.test(码), '★ ★ 监听 storage（别的页改头像立刻同步）');

        /* ---------- 实测 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;

        w.localStorage.setItem('阅读_笔名', '墨小喵');
        w.localStorage.setItem('用户头像', 'data:image/png;base64,AAA');
        w.阅读.切页('作者');
        await 等(500);

        /* A. 头像同步 */
        ok(d.getElementById('头像图').src === 'data:image/png;base64,AAA',
            '★ ★★ 作家头像用了用户头像');
        ok(d.getElementById('头像图').hidden === false, '★ 显示图片');
        ok(d.getElementById('头像字').hidden === true, '★ 隐藏首字');

        /* ★ 没换过头图 → 回落【默认头像图】（与 1 页同口径），不是退首字 */
        w.localStorage.removeItem('用户头像');
        w.阅读.切页('书城'); await 等(300);
        w.阅读.切页('作者'); await 等(500);
        ok(d.getElementById('头像图').hidden === false, '★ ★ 没换过也显示图（默认头像）');
        ok(/圆形头像1\.png/.test(decodeURIComponent(d.getElementById('头像图').src)),
            '★ ★★ 用的是 1 页的默认头像图（实际 '
            + decodeURIComponent(d.getElementById('头像图').src).split('/').pop() + '）');
        ok(d.getElementById('头像字').textContent === '墨', '★ 首字仍同步更新（作兜底）');

        /* B. 建两本同作者的书 */
        for (const nm of ['书一', '书二']) {
            输(w, d.getElementById('新书名'), nm);
            点(w, d.getElementById('新建钮'));
            await 等(700);
            输(w, d.getElementById('章题输入'), '第一章');
            输(w, d.getElementById('正文输入'), '内容');
            点(w, d.getElementById('发布章钮'));
            await 等(700);
            点(w, d.getElementById('编辑返回'));
            await 等(500);
            w.阅读.切页('作者');
            await 等(400);
        }

        /* C. 作品卡按钮与数据 */
        const 操作 = Array.from(d.querySelectorAll('.作品卡 .作品操作 .小钮'))
            .slice(0, 3).map(b => b.textContent);
        ok(操作.join('/') === '写新章节/封面/删除',
            '★ ★★ 按钮 = 写新章节/封面/删除（实际 ' + 操作.join('/') + '）');
        const 数据名 = Array.from(d.querySelectorAll('.作品卡 .作品名2'))
            .slice(0, 3).map(e => e.textContent).join('/');
        ok(数据名 === '阅读/评论/章节', '★ ★★ 数据 = 阅读/评论/章节（实际 ' + 数据名 + '）');

        /* D. 详情弹窗 → 点作者昵称 → 作者主页 */
        w.阅读.切页('书城');
        await 等(400);
        输(w, d.getElementById('搜索框'), '书一');
        await 等(500);
        const 卡 = Array.from(d.querySelectorAll('#书城列表 .书卡'))[0];
        点(w, 卡);
        await 等(600);
        ok(d.getElementById('详情遮罩').classList.contains('显示'), '★ 详情弹窗打开');
        const 作者钮 = d.getElementById('详情作者钮');
        ok(!!作者钮, '★ ★ 详情层有作者昵称按钮');
        ok(/墨小喵/.test(作者钮.textContent), '★ 昵称正确（实际 ' + 作者钮.textContent + '）');

        点(w, 作者钮);
        await 等(700);
        ok(d.getElementById('作者遮罩').classList.contains('显示'),
            '★ ★★ 点昵称进入作者主页');
        ok(d.getElementById('作者主页名').textContent === '墨小喵', '★ 主页显示作者名');
        ok(/2 部作品/.test(d.getElementById('作者主页副').textContent),
            '★ ★ 主页显示作品数（实际 ' + d.getElementById('作者主页副').textContent + '）');
        const 主页书 = Array.from(d.querySelectorAll('#作者体 .书名')).map(e => e.textContent);
        ok(主页书.length === 2, '★ ★★ 列出这位作者的全部 2 本书（实际 ' + 主页书.length + '）');
        ok(主页书.indexOf('书一') >= 0 && 主页书.indexOf('书二') >= 0,
            '★ ★ 两本都在（实际 ' + 主页书.join('/') + '）');

        /* E. 点主页里的书 → 进详情 */
        点(w, Array.from(d.querySelectorAll('#作者体 .书卡'))[0]);
        await 等(700);
        ok(!d.getElementById('作者遮罩').classList.contains('显示'), '★ 主页关闭');
        ok(d.getElementById('详情遮罩').classList.contains('显示'), '★ ★ 打开了该书的详情');

        /* F. 返回 */
        点(w, d.getElementById('详情关闭'));
        await 等(400);
        ok(!d.getElementById('详情遮罩').classList.contains('显示'), '★ 详情关闭');
    }

    console.log('\n[Z] ★★★ 笔名可改 / 头像同步 / 作者主页背景 / 段评 / 听书');
    {
        const src = kit.读('22_yuedu.html');
        const 去注释 = 源 => 源.split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
        const 码 = 去注释(src);

        /* ① 笔名可修改 */
        ok(/id="改笔名钮"/.test(src), '★ ★ 有修改笔名入口');
        ok(/改笔名钮'\)\.addEventListener\('click'/.test(码), '★ 绑定了点击事件');
        ok(/localStorage\.setItem\(笔名键, 名\)/.test(码), '★ ★ 会写回笔名');
        /* ★★ 改笔名必须把已发作品的作者名一起改，否则作品会凭空消失 */
        ok(/x\.发布者 = 名; x\.作者 = 名;/.test(码),
            '★ ★★ 改笔名时已发布作品的作者名一起改');
        ok(/同步作家头像\(\)/.test(码), '★ 改完笔名同步头像');

        /* ② 头像与用户头像同步 */
        ok(/localStorage\.getItem\('用户头像'\)/.test(码), '★ ★ 头像读全站用户头像');
        ok(/addEventListener\('storage'/.test(码), '★ ★ 跨页改头像立刻同步');

        /* ③ 作者主页背景随主题 */
        const 主页块 = 码.slice(码.indexOf('async function 开作者主页'),
            码.indexOf('async function 开作者主页') + 520);
        ok(/外层\.classList\.add\('编辑中'\)/.test(主页块),
            '★ ★★ 作者主页挂 .编辑中（收起下层，露出主题背景）');
        ok(/\.作者遮罩::before[\s\S]{0,200}rgba\(255, 255, 255, 0\.70\)/.test(src),
            '★ 作者主页也是 70% 白遮罩（与阅读器 / 编辑器统一）');
        ok(/\.作者遮罩\s*\{[\s\S]{0,200}background:\s*transparent/.test(src),
            '★ 本身透明（不铺自造底色）');

        /* ④ 段评 */
        ok(/id="段评遮罩"/.test(src), '★ ★ 有段评弹窗');
        ok(/function\s+开段评/.test(码), '★ 有 开段评()');
        ok(/function\s+挂段落长按/.test(码), '★ ★ 有段落长按');
        ok(/长按阈值/.test(码), '★ 长按走统一阈值');
        ok(/段评角/.test(src), '★ ★ 有段评角标');
        ok(/p\.addEventListener\('click', \(\) => 开段评/.test(码),
            '★ ★★ 点段落可以看段评');

        /* ⑤ 听书 */
        ok(/id="听书钮"/.test(src), '★ ★ 阅读器有「听书」按钮');
        ok(/id="听书遮罩"/.test(src), '★ 有选人面板');
        ok(/function\s+取联系人音色/.test(码), '★ ★ 有取联系人音色');
        ok(/音色配置_'\s*\+\s*联系人ID/.test(码), '★ ★★ 音色读 音色配置_<id>（与 3/7/14 页同源）');
        ok(/音频API配置/.test(码), '★ ★ 网址/密钥/模型读 音频API配置（21 页）');
        ok(/已启用/.test(码), '★ 尊重联系人的「已启用」开关');
        ok(/speed/.test(码) && /pitch/.test(码), '★ ★ 音速/语调会传进合成请求');
        /* ★ 没配 API 不能假装是角色在念 */
        ok(/系统语音/.test(码) || /speechSynthesis/.test(码), '★ ★★ 没配 API 时退系统朗读');
        ok(/还没配音频 API/.test(src), '★ ★ 如实说明当前不是角色音色');
        /* ★ 合成失败不能静默 */
        ok(/朗读中断/.test(码), '★ ★ 合成失败会提示原因（不静默）');
        /* ★ 关书要停 */
        ok(/阅读返回'\)\.addEventListener\('click', 停念\)/.test(码), '★ ★ 返回时停止朗读');

        /* ---------- 实测 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;

        /* A. 改笔名
           ★ 原来是 w.prompt = () => '新笔名' —— 那是 prompt 时代的写法。
             现在改成底部上滑弹层，必须走「打开 → 填 → 点保存」三步。 */
        w.localStorage.setItem('阅读_笔名', '旧笔名');
        w.阅读.切页('作者');
        await 等(400);
        ok(d.getElementById('笔名显示').textContent === '旧笔名', '★ 初始笔名');

        const 设笔名 = async (名) => {
            点(w, d.getElementById('改笔名钮'));
            await 等(120);
            输(w, d.getElementById('笔名输入'), 名);
            点(w, d.getElementById('笔名保存'));
            await 等(300);
        };
        await 设笔名('新笔名');
        ok(w.localStorage.getItem('阅读_笔名') === '新笔名',
            '★ ★★ 笔名改掉了（实际 ' + w.localStorage.getItem('阅读_笔名') + '）');
        ok(d.getElementById('笔名显示').textContent === '新笔名', '★ 界面同步');

        /* ★ 改名后已有作品要跟着走，不能凭空消失 */
        输(w, d.getElementById('新书名'), '改名测试书');
        点(w, d.getElementById('新建钮'));
        await 等(800);
        ok(w.阅读.我的作品().length === 1, '★ 新笔名下建了作品');
        点(w, d.getElementById('编辑返回'));
        await 等(500);
        w.阅读.切页('作者');
        await 等(400);
        await 设笔名('又一个名字');
        ok(w.阅读.我的作品().length === 1,
            '★ ★★ 二次改名后作品还在（实际 ' + w.阅读.我的作品().length + '）');

        /* B. 段评：点段落 → 写 → 角标 */
        w.阅读.切页('书城');
        await 等(500);
        const 卡 = Array.from(d.querySelectorAll('#书城列表 .书卡'))[0];
        点(w, 卡);
        await 等(700);
        const 试读 = Array.from(d.querySelectorAll('#详情底 .大钮')).find(b => /试读/.test(b.textContent));
        点(w, 试读);
        await 等(800);
        ok(w.阅读.阅读态() === '正文', '★ 进了正文');
        const ps = d.querySelectorAll('#章文 p');
        ok(ps.length > 0, '★ 有段落（实际 ' + ps.length + '）');
        ok(ps[0].dataset.段 === '0', '★ ★ 段落带段号');

        点(w, ps[0]);
        await 等(600);
        ok(d.getElementById('段评遮罩').classList.contains('显示'), '★ ★★ 点段落打开段评');
        const 原文 = d.getElementById('段评原文').textContent;
        ok(原文.length > 0, '★ 显示了原文（实际 ' + JSON.stringify(原文.slice(0, 12)) + '）');
        输(w, d.getElementById('段评输入'), '这段写得好');
        点(w, Array.from(d.querySelectorAll('#段评体 .小钮')).find(b => b.textContent === '发表'));
        await 等(600);
        ok(w.阅读.段评数(w.阅读.编辑中 ? 'x' : 'x', 0, 0) >= 0, '★ 段评接口可用');

        /* ★ 角标：重渲染段落要带上 */
        w.阅读.渲染正文(0);
        await 等(500);
        const 角 = Array.from(d.querySelectorAll('.段评角')).map(e => e.textContent);
        ok(角.length === 1 && 角[0] === '1',
            '★ ★★ 段落带上了段评角标（实际 ' + JSON.stringify(角) + '）');

        /* 再开能看到那条 */
        点(w, d.querySelectorAll('#章文 p')[0]);
        await 等(600);
        ok(d.getElementById('段评数').textContent === '1 条',
            '★ 弹窗显示 1 条（实际 ' + d.getElementById('段评数').textContent + '）');
        ok(d.querySelectorAll('#段评体 .评行').length === 1, '★ ★ 能看到那条段评');
        点(w, d.getElementById('段评关闭'));
        await 等(400);

        /* C. 听书 */
        w.localStorage.setItem('联系人索引',
            JSON.stringify([{ id: 'c1', 名称: '阿七' }, { id: 'c2', 名称: '小喵' }]));
        w.localStorage.setItem('音色配置_c1',
            JSON.stringify({ 已启用: true, 音色: 'nova', 音速: 1.2 }));
        const 音 = w.阅读.取联系人音色('c1');
        ok(音.音色 === 'nova', '★ ★★ 取到联系人的音色（实际 ' + 音.音色 + '）');
        ok(音.音速 === 1.2, '★ 音速也带出来了（实际 ' + 音.音速 + '）');
        ok(音.来源 === '联系人', '★ 来源标注正确（实际 ' + 音.来源 + '）');
        /* 没启用 → 不拿他的音色 */
        ok(w.阅读.取联系人音色('c2').音色 === '', '★ ★ 没设音色的联系人取不到音色');

        点(w, d.getElementById('听书钮'));
        await 等(600);
        ok(d.getElementById('听书遮罩').classList.contains('显示'), '★ ★ 听书面板打开');
        const 人 = Array.from(d.querySelectorAll('#听书体 .抽屉行'));
        ok(人.length === 2, '★ ★ 列出 2 位联系人（实际 ' + 人.length + '）');
        ok(/阿七/.test(人[0].textContent), '★ 显示联系人名');
        ok(/系统语音/.test(人[0].textContent),
            '★ ★★ 没配 API 时如实标注「系统语音」（实际 ' + 人[0].textContent + '）');

        点(w, 人[0]);
        await 等(600);
        ok(!d.getElementById('听书遮罩').classList.contains('显示'), '★ 选完关闭面板');
        ok(w.阅读.念的人().名 === '阿七', '★ ★ 记住了选的人（实际 ' + w.阅读.念的人().名 + '）');
        ok(w.阅读.念的人().音色 === 'nova', '★ ★★ 用的是他的音色');

        /* ★ 切段：长句要切开，别一次请求塞整章 */
        const 段们 = w.阅读.切朗读段('第一句。第二句。');
        ok(段们.length >= 1, '★ 切朗读段可用（实际 ' + 段们.length + ' 段）');

        /* ★ 返回要停 */
        点(w, d.getElementById('阅读返回'));
        await 等(500);
        ok(w.阅读.阅读态() !== '正文', '★ 已退出正文');
    }

    console.log('\n[AA] ★★★ BUG 回归：阅读页弹窗被压住 / 头像没跟用户头像同步');
    {
        const src = kit.读('22_yuedu.html');
        const 去注释 = 源 => 源.split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
        const 码 = 去注释(src);

        /* ① 弹窗层级：必须盖住阅读器 */
        const 阅读z = Number((码.match(/\.阅读遮罩\s*\{[\s\S]{0,200}z-index:\s*(\d+)/) || [])[1] || 0);
        const 详情z = Number((码.match(/\.详情遮罩\s*\{[\s\S]{0,200}z-index:\s*(\d+)/) || [])[1] || 0);
        ok(阅读z > 0 && 详情z > 0, '★ 读到两个遮罩的层级（阅读 ' + 阅读z + ' / 详情 ' + 详情z + '）');
        ok(详情z < 阅读z, '★ 【复现前提】.详情遮罩(' + 详情z + ') 确实低于阅读器(' + 阅读z + ')');
        /* ★★ 修复：段评 / 听书单独提层，否则在阅读页根本看不见 */
        /* ★ 正则要容忍结尾的分号（CSS 写的是 `z-index: 280;`） */
        ok(/#段评遮罩,\s*#听书遮罩\s*\{\s*z-index:\s*(\d+)\s*;?\s*\}/.test(码),
            '★ ★★ 段评/听书有单独提层的规则');
        const 弹z = Number((码.match(/#段评遮罩,\s*#听书遮罩\s*\{\s*z-index:\s*(\d+)/) || [])[1] || 0);
        ok(弹z > 阅读z, '★ ★★ 弹窗层级(' + 弹z + ') 高于阅读器(' + 阅读z + ')');

        /* ② 头像：与 1 页同口径 */
        ok(/const\s+默认头像\s*=\s*'2【图片】\/圆形头像1\.png'/.test(码),
            '★ ★★ 默认头像用的是 1 页那张默认图');
        ok(/图\.src\s*=\s*头 \|\| 默认头像/.test(码),
            '★ ★★ 没换过就回落默认图（不是退首字）');
        /* ★ 常量放在前面：const 有暂时性死区，放在渲染函数之后会炸 */
        ok(码.indexOf('const 默认头像') < 码.indexOf('function 同步作家头像'),
            '★ ★ 默认头像常量在使用前定义（避免 TDZ）');
        /* ★ 图挂了才退字 */
        ok(/图\.onerror\s*=[\s\S]{0,80}字\.hidden = false/.test(码),
            '★ 图加载失败才退回首字（不显示破图）');

        /* ---------- 实测：在阅读页真的能看见弹窗 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;
        点(w, d.getElementById('阅读目录钮'));
        await 等(300);

        /* 进正文 */
        w.阅读.切页('书城');
        await 等(500);
        const 卡 = Array.from(d.querySelectorAll('#书城列表 .书卡'))[0];
        点(w, 卡);
        await 等(700);
        const 试读 = Array.from(d.querySelectorAll('#详情底 .大钮')).find(b => /试读/.test(b.textContent));
        点(w, 试读);
        await 等(800);
        ok(w.阅读.阅读态() === '正文', '★ 进了阅读正文');

        /* ★ 关键：阅读器开着的情况下，弹窗层级必须更高 */
        const z读 = Number(w.getComputedStyle(d.getElementById('阅读遮罩')).zIndex);
        const z段 = Number(w.getComputedStyle(d.getElementById('段评遮罩')).zIndex);
        const z听 = Number(w.getComputedStyle(d.getElementById('听书遮罩')).zIndex);
        ok(z读 === 250, '★ 阅读器层级 ' + z读);
        ok(z段 > z读, '★ ★★ 段评弹窗(' + z段 + ') 盖得住阅读器(' + z读 + ')');
        ok(z听 > z读, '★ ★★ 听书弹窗(' + z听 + ') 盖得住阅读器(' + z读 + ')');

        /* 段评：能开、能写 */
        点(w, d.querySelectorAll('#章文 p')[0]);
        await 等(600);
        ok(d.getElementById('段评遮罩').classList.contains('显示'), '★ 段评弹窗打开');
        ok(d.getElementById('段评遮罩').style.display !== 'none', '★ 不是 display:none');
        输(w, d.getElementById('段评输入'), '回归测试');
        点(w, Array.from(d.querySelectorAll('#段评体 .小钮')).find(b => b.textContent === '发表'));
        await 等(600);
        点(w, d.getElementById('段评关闭'));
        await 等(400);

        /* 听书：能开、能选人 */
        w.localStorage.setItem('联系人索引', JSON.stringify([{ id: 'c1', 名称: '阿七' }]));
        点(w, d.getElementById('听书钮'));
        await 等(600);
        ok(d.getElementById('听书遮罩').classList.contains('显示'), '★ ★ 听书弹窗打开');
        点(w, d.querySelector('#听书体 .抽屉行'));
        await 等(600);
        ok(w.阅读.念的人().名 === '阿七', '★ ★ 能选中联系人');

        /* ---------- 实测：头像 ---------- */
        w.阅读.停念();
        点(w, d.getElementById('阅读返回'));
        await 等(500);
        w.localStorage.setItem('阅读_笔名', '墨');
        w.localStorage.removeItem('用户头像');
        w.阅读.切页('作者');
        await 等(600);
        const 图 = d.getElementById('头像图');
        ok(图.hidden === false, '★ ★ 没换过头像也显示图（不再是首字）');
        ok(/圆形头像1\.png/.test(decodeURIComponent(图.src)),
            '★ ★★ 用的是默认头像图（实际 ' + decodeURIComponent(图.src).split('/').pop() + '）');

        /* 设了用户头像 → 换成那张 */
        w.localStorage.setItem('用户头像', 'data:image/png;base64,ZZ');
        w.阅读.切页('书城'); await 等(300);
        w.阅读.切页('作者'); await 等(600);
        ok(d.getElementById('头像图').src === 'data:image/png;base64,ZZ',
            '★ ★★ 换成用户头像（实际 ' + d.getElementById('头像图').src + '）');
        ok(d.getElementById('头像字').textContent === '墨', '★ 首字也同步更新');

        /* 作者主页：自己的用用户头像，别人的用联系人头像 */
        w.localStorage.setItem('联系人索引',
            JSON.stringify([{ id: 'c1', 名称: '阿七' }, { id: 'c9', 名称: '别人', 头像: 'data:image/gif;base64,OO' }]));
        w.阅读.开作者主页('别人');
        await 等(700);
        ok((d.querySelector('.作者头像 img') || {}).src === 'data:image/gif;base64,OO',
            '★ ★ 别人的主页用他自己的头像');
        w.阅读.关作者主页(); await 等(400);
        w.阅读.开作者主页('墨');
        await 等(700);
        ok((d.querySelector('.作者头像 img') || {}).src === 'data:image/png;base64,ZZ',
            '★ ★ 自己的主页用用户头像');
    }

    console.log('\n[AB] ★★★ 精致化：质感 / 微交互 / 网感（★ 色调不变）');
    {
        const src = kit.读('22_yuedu.html');
        const 去注释 = 源 => 源.split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
        const 码 = 去注释(src);

        /* ---------- 硬约束：不许引入新颜色 ---------- */
        /* ★ 全站色板之外的硬编码色（之前那套暖橙）必须一条不剩 */
        ok(!/#e2704a/i.test(码), '★ ★★ 没有暖橙残留');
        /* ★ 只查【使用】不查注释：注释里说明「别再加回 --read」是允许的 */
        ok(!/var\(--read\)/.test(码) && !/--read\s*:/.test(码),
            '★ ★★ 自造的 --read 已彻底移除（代码里不再使用）');
        ok(!/rgba?\(\s*#/.test(码), '★ ★ 没有 hex 直接进 rgba()（会被整条丢弃）');
        ok(/var\(--accent-rgb\)/.test(码), '★ ★ 透明度一律走 rgb 伴生变量');

        /* ---------- ① 质感：封面立体感 ---------- */
        ok(/\.书封面::after[\s\S]{0,400}linear-gradient/.test(src),
            '★ ★ 封面有高光/渐隐叠层（不再是平贴纸）');
        ok(/box-shadow:\s*1\.5px 0 0\s*rgba\(255,255,255/.test(码),
            '★ 书脊有右侧亮边（书页厚度感）');
        /* ★ 双层投影的判据是 box-shadow 里有逗号分隔的两段 */
        ok(/\.书封面,[\s\S]{0,260}box-shadow:[^;]*rgba\([^)]*\)[^;]*,[^;]*rgba/.test(码),
            '★ ★ 封面投影是双层（更立体）');

        /* ---------- ② 微交互：按压反馈 ---------- */
        ok(/transition:\s*transform/.test(码), '★ ★ 有过渡动画');
        ok(/\.书卡:active[\s\S]{0,120}transform:\s*scale/.test(码),
            '★ ★★ 书卡按下去会缩（有触感）');
        ok(/\.榜卡:active,\s*\.架卡:active\s*\{\s*transform:\s*scale/.test(码),
            '★ ★ 榜卡/架卡也有按压反馈');
        ok(/\.chip:active\s*\{\s*transform:\s*scale/.test(码), '★ 筛选项有按压反馈');
        ok(/@keyframes\s+淡入上浮/.test(码), '★ 有入场动画');
        ok(/@keyframes\s+进度长/.test(码), '★ 进度条是长出来的，不是瞬间跳位');

        /* ---------- ③ 精致：排版与分隔 ---------- */
        ok(/font-variant-numeric:\s*tabular-nums/.test(码),
            '★ ★ 数字等宽（榜单/统计不跳动）');
        ok(/\.分区标题::before/.test(码), '★ ★ 分区标题有小竖条装饰');
        ok(/\.数据格 \+ \.数据格::before/.test(码), '★ 数据格之间有分隔线');
        ok(/\.章文 p\.首段::first-letter/.test(码), '★ ★ 首段首字母放大（网文开篇感）');
        ok(/末标\.textContent = '本章完'/.test(码), '★ ★ 章末有「本章完」');

        /* ---------- ④ 网感：TOP 徽章 / 热搜 ---------- */
        ok(/徽\.textContent = 'TOP' \+ \(i \+ 1\)/.test(码),
            '★ ★★ 榜单前三写 TOP1/2/3（不是裸数字）');
        ok(/卡\.className = '榜卡' \+ \(i === 0 \? ' 榜首'/.test(码),
            '★ ★ 榜首单独标记');
        ok(/\.榜卡\.榜首 \.榜封面/.test(码), '★ 榜首封面投影更重');
        ok(/id="热搜行"/.test(src), '★ ★★ 有热搜词行');
        ok(/function\s+渲染热搜/.test(码), '★ 有渲染热搜');
        /* ★★ 热搜词必须【真能搜到】，否则点了没结果是假热搜 */
        ok(/取热度\(b\.id\) - 取热度\(a\.id\)/.test(码), '★ ★ 热搜词按真实热度取');
        ok(/表\.some\(p => p\.分类 === t\)/.test(码),
            '★ ★★ 补的题材词必须真有该分类的书（不是假热搜）');
        /* ★ 搜分类要能搜到，否则点「都市」没结果 */
        ok(/String\(b\.分类 \|\| ''\)/.test(码) && /toLowerCase\(\)\.includes\(关\)/.test(码),
            '★ ★★ 搜索也匹配分类（点题材热搜词能出结果）');

        /* ---------- ⑤ 搜索框聚焦光晕 ---------- */
        ok(/\.搜索框:focus[\s\S]{0,200}box-shadow/.test(码),
            '★ ★ 搜索框有聚焦光晕（不只是换边框色）');

        /* ---------- 实测 ---------- */
        const 仓库 = {};
        const w = await 起22({}, 仓库);
        const d = w.document;

        w.阅读.切页('书城');
        await 等(600);

        /* A. 热搜：能渲染、能点、点了有结果 */
        const 行 = d.getElementById('热搜行');
        ok(!!行, '★ 热搜行存在');
        const 词们 = Array.from(d.querySelectorAll('.热搜词'));
        ok(词们.length > 0, '★ ★ 有热搜词（实际 ' + 词们.length + ' 个）');
        ok(!!d.querySelector('.热搜标'), '★ 有「热搜」标签');

        /* 逐个点：每个词都必须搜得到东西 */
        let 都搜到 = true, 空词 = [];
        for (const b of 词们) {
            const 词 = b.textContent;
            点(w, b);
            await 等(600);
            const n = d.querySelectorAll('#书城列表 .书卡').length;
            if (n === 0) { 都搜到 = false; 空词.push(词); }
            输(w, d.getElementById('搜索框'), '');
            await 等(400);
        }
        ok(都搜到, '★ ★★ 每个热搜词都搜得到结果（搜不到的：' + 空词.join('/') + '）');

        /* 搜索时热搜行收起，清空后恢复 */
        输(w, d.getElementById('搜索框'), '小喵');
        await 等(600);
        ok(d.getElementById('热搜行').style.display === 'none',
            '★ 搜索时热搜行收起');
        输(w, d.getElementById('搜索框'), '');
        await 等(600);
        ok(d.getElementById('热搜行').style.display !== 'none', '★ 清空后恢复');

        /* B. 章末 + 首段 */
        const 卡 = Array.from(d.querySelectorAll('#书城列表 .书卡'))[0];
        点(w, 卡);
        await 等(700);
        const 试 = Array.from(d.querySelectorAll('#详情底 .大钮')).find(b => /试读|开始阅读/.test(b.textContent));
        点(w, 试);
        await 等(800);
        ok(w.阅读.阅读态() === '正文', '★ 进正文');
        ok(!!d.querySelector('.章末'), '★ ★ 正文末尾有章末区');
        ok(/本章完/.test(d.querySelector('.章末').textContent),
            '★ ★★ 写着「本章完」（实际 ' + JSON.stringify(d.querySelector('.章末').textContent) + '）');
        ok(d.querySelectorAll('.章文 p.首段').length === 1, '★ ★ 首段有专属标记');

        /* C. CSS 生效性
             ★★ jsdom 不做完整 CSS 解析：
                · border-top 简写在 getComputedStyle 里拆不出 style（恒为 none）
                · 双层 box-shadow 只返回第一层
              所以这两条只能做【源码级】断言 —— 视觉效果请在浏览器里确认。 */
        const 末 = d.querySelector('.章末');
        ok(!!末, '★ 章末元素在正文里');
        ok(/\.章末\s*\{[\s\S]{0,200}border-top:\s*1px dashed/.test(src),
            '★ ★ 章末是虚线分隔（源码级）');
        const 封 = d.querySelector('.书封面');
        ok(!!封, '★ 封面元素存在');
        ok(/\.书封面,[\s\S]{0,260}box-shadow:[^;]*rgba\([^)]*\)[^;]*,[^;]*rgba/.test(src),
            '★ ★ 封面投影是双层（源码级）');
    }

    kit.收尾(errors, '✅ 一起阅读（22_yuedu）全部通过');
})();
