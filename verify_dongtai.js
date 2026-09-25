/**
 * verify_dongtai.js —— 5_dongtai（动态页）结构验证
 *
 * 覆盖：
 *   ① 页面能起来且无运行时报错（jsdom 无 fetch / geolocation，降级链必须静默）
 *   ② 顶部状态栏：左侧时间 / 中间「动态」★ 绝对居中 / 右侧温度 + 湿度
 *   ③ 轮播：16:9、8 张卡片（4×2 组用于无缝）、从右到左连续滚动、左右渐变
 *   ④ 3D 立体：轨道有 perspective，卡片有 rotateY / translateZ（运行时实测）
 *   ⑤ 底部导航默认选中「动态」，且选中态不放大（★ 需求点）
 *   ⑥ 1 / 4 页的「动态」已接入跳转
 *
 * 用法：node verify_dongtai.js
 */
const kit = require('./testkit.js');
const { 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

/** 点一下元素（冒泡）—— 与 7 / 11 页的测试脚本同款 */
function 点(w, 元素) {
    元素.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}

/**
 * jsdom 没有布局引擎，clientWidth / offsetWidth 恒为 0，
 * 轮播的几何计算会全部退化成 1px 世界 —— 断言「角度有几种」这类就失去意义。
 * 这里按 430 容器 − 32 边距 = 398 ≈ 400 的真实尺寸打桩：
 *   视窗宽 400，卡片宽 = 400 × 68% = 272。
 * 和 verify_crop_preview 用的是同一套思路。
 */
const 视窗宽 = 400;
const 卡宽 = Math.round(视窗宽 * 0.68);   // 272

function 打桩尺寸(w) {
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get() { return 视窗宽; },
    });
    Object.defineProperty(w.HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get() { return this.classList && this.classList.contains('轮播页') ? 卡宽 : 视窗宽; },
    });
}

(async function main() {
    // 预置通讯录索引：5 页的「谁可以看」与头像映射都从这里读，
    // 与 4 页默认表保持一致（白九霄→5、埃洛温→2、陆沉渊→4、林彦→3）
    const 联系人索引 = [
        { id: 'c_home_0', 名称: '白九霄', 备注: '', 头像: '2【图片】/圆形头像5.png', 消息: '', 时间: '' },
        { id: 'c_home_1', 名称: '埃洛温·影蚀', 备注: '', 头像: '2【图片】/圆形头像2.png', 消息: '', 时间: '' },
        { id: 'c_home_2', 名称: '陆沉渊', 备注: '', 头像: '2【图片】/圆形头像4.png', 消息: '', 时间: '' },
        { id: 'c_home_3', 名称: '林彦', 备注: '', 头像: '2【图片】/圆形头像3.png', 消息: '', 时间: '' },
    ];

    console.log('[A] 5 页能起来，且无运行时报错');
    const w = await 起页面('5_dongtai.html', 'http://localhost/5.html',
        { '联系人索引': JSON.stringify(联系人索引) }, errors, '5', 打桩尺寸);
    await new Promise(r => setTimeout(r, 200));
    const d = w.document;
    const css = kit.读('5_dongtai.html');

    console.log('\n[B] 顶部状态栏：时间 / ★动态居中 / 天气');
    {
        const 时间 = d.getElementById('系统时间');
        ok(!!时间 && /^\d{2}:\d{2}$/.test(时间.textContent),
            '左侧系统时间已实时填充（实际 "' + (时间 && 时间.textContent) + '"）');

        const 标题 = Array.from(d.querySelectorAll('.中间标题')).map(e => e.textContent.trim());
        ok(标题.length === 1 && 标题[0] === '动态', '中间标题为「动态」且唯一');

        // ★ 真居中：必须脱离 flex 流，否则会被左右不等宽的两侧带偏
        ok(/\.中间标题\s*\{[^}]*position:\s*absolute/.test(css),
            'CSS：.中间标题 用绝对定位脱离 flex 流（不随两侧宽度偏移）');
        ok(/\.中间标题\s*\{[^}]*(left:\s*0|left:\s*50%)/.test(css),
            'CSS：.中间标题 左边界归零/居中');
        ok(/\.中间标题\s*\{[^}]*text-align:\s*center|transform:\s*translateX\(-50%\)/.test(css),
            'CSS：.中间标题 水平居中（text-align 或 translateX）');
        ok(/\.顶部导航栏\s*\{[^}]*position:\s*relative/.test(css),
            'CSS：.顶部导航栏 是定位参照');

        ok(!!d.getElementById('天气温度'), '右侧存在温度位');
        ok(!!d.getElementById('天气湿度'), '右侧存在湿度位');
        ok(/^(-?\d+°|--°)$/.test(d.getElementById('天气温度').textContent), '温度格式正确');
        ok(/^(\d+%|--%)$/.test(d.getElementById('天气湿度').textContent), '湿度格式正确');
    }

    console.log('\n[C] 轮播：16:9 + 无缝滚动结构');
    {
        const 页 = d.querySelectorAll('.轮播轨道 .轮播页');
        ok(页.length === 8, '轨道含 8 张（4 张 × 2 组，第二组用于无缝衔接）实际 ' + 页.length);

        ok(/\.轮播页\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/.test(css), 'CSS：卡片本身是 16:9（图片比例）');
        // 视窗不再是 16:9 —— 否则图片上下会各空出一大片，间隔怎么调都压不下来
        const 视窗块C = (/\.轮播视窗\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(!/aspect-ratio:\s*16\s*\/\s*9/.test(视窗块C), 'CSS：视窗已不是 16:9（避免图片上下留白）');
        ok(/aspect-ratio:\s*calc\(16\s*\/\s*\(9\s*\*\s*var\(--卡宽比\)\)\)/.test(视窗块C),
            'CSS：视窗高度按卡片高度反推（贴合图片）');
        ok(/--卡宽比:\s*0\.68/.test(css), 'CSS：定义了 --卡宽比（卡片宽度与视窗高度同源）');

        const 名 = Array.from(d.querySelectorAll('.轮播图')).map(i => i.dataset.名);
        ok(名.slice(0, 4).join(',') === '3D图1,3D图2,3D图3,3D图4', '第一组依次 3D图1~4');
        ok(名.slice(4).join(',') === '3D图1,3D图2,3D图3,3D图4', '第二组是同一序列的复制（保证无缝）');

        const 首src = d.querySelector('.轮播图').getAttribute('src');
        ok(/^2【图片】\/3D图1\.(png|jpg|jpeg|webp)$/.test(首src || ''),
            '图片路径指向 2【图片】/3D图1.*（实际 "' + 首src + '"）');
    }

    console.log('\n[D] ★ 从右到左连续滚动（跑两帧实测位移在减小）');
    {
        // 视窗外的卡片会被跳过写入，所以取「第一张有 transform 的」而不是固定索引
        const 取左 = () => {
            const 有变换 = Array.from(d.querySelectorAll('.轮播页'))
                .filter(e => e.style.transform);
            if (!有变换.length) return null;
            const m = /translate3d\((-?[\d.]+)px/.exec(有变换[0].style.transform);
            return m ? parseFloat(m[1]) : null;
        };
        const 甲 = 取左();
        await new Promise(r => setTimeout(r, 260));
        const 乙 = 取左();
        ok(甲 !== null && 乙 !== null, '卡片位置由 translate3d 驱动（实际 "' + 甲 + '" → "' + 乙 + '"）');
        ok(甲 !== null && 乙 !== null && 乙 < 甲,
            '位移随时间递减 → 画面从右向左移动（' + 甲 + ' → ' + 乙 + '）');
    }

    console.log('\n[E] ★ 3D 立体感（perspective + rotateY + translateZ）');
    {
        ok(/\.轮播轨道\s*\{[^}]*perspective:\s*\d+px/.test(css), 'CSS：轨道设了 perspective（3D 舞台）');
        const 变换 = Array.from(d.querySelectorAll('.轮播页'))
            .map(e => e.style.transform)
            .filter(Boolean);
        ok(变换.length > 0, '运行时已写入 transform（实际 ' + 变换.length + ' 张）');
        ok(变换.some(t => /rotateY\(-?[\d.]+deg\)/.test(t)), '卡片含 rotateY（两侧向后转）');
        ok(变换.some(t => /translate3d\([^)]*,\s*0px,\s*-?[\d.]+px\)/.test(t)),
            '卡片含 translateZ（离中心越远越靠后）且垂直贴顶（Y=0）');
        // 中心卡片角度应接近 0，两侧不为 0 —— 说明是随位置变化而非固定值
        const 角集 = new Set(变换.map(t => (/rotateY\((-?[\d.]+)deg\)/.exec(t) || [])[1]).filter(Boolean));
        ok(角集.size >= 3, '不同位置的卡片角度不同（实际 ' + 角集.size + ' 种）→ 立体而非平面平移');
    }

    console.log('\n[F] ★ 轮播完全无底框 + 两侧淡出到透明');
    {
        // 取声明块（多行安全）
        const 取块 = 选择器 => {
            const m = new RegExp('\\' + 选择器 + '\\s*\\{([\\s\\S]*?)\\}').exec(css);
            return m ? m[1] : '';
        };
        const 视窗块 = 取块('.轮播视窗');
        const 卡片块 = 取块('.轮播页');

        // ---- ① 底框相关：一律不得出现 ----
        ok(视窗块.length > 0, '取到 .轮播视窗 声明块');
        ok(!/(^|;|\s)background(-color)?\s*:/.test(视窗块), '视窗无 background（不铺底）');
        ok(!/(^|;|\s)border(-top|-bottom|-left|-right)?\s*:/.test(视窗块), '视窗无 border（不描边）');
        ok(!/(^|;|\s)box-shadow\s*:/.test(视窗块), '视窗无 box-shadow（不投影）');
        ok(!/backdrop-filter\s*:/.test(视窗块), '视窗无 backdrop-filter（不做毛玻璃底）');
        ok(!/border-radius\s*:/.test(视窗块), '视窗无 border-radius（不留圆角轮廓）');

        // ---- ② 白底渐变已彻底移除 ----
        ok(d.querySelectorAll('.边缘渐隐').length === 0, 'DOM 中已无 .边缘渐隐 覆盖层');
        ok(!/\.边缘渐隐/.test(css), 'CSS 中已无 .边缘渐隐 规则');
        ok(!/rgba\(255,\s*255,\s*255,\s*[\d.]+\)\s*0%/.test(css), 'CSS 中已无白色渐变（白底渐隐）');

        // ---- ③ 改用 mask：淡出终点是透明，而非白色 ----
        ok(/mask-image:\s*linear-gradient/.test(视窗块), '视窗用 mask-image 做边缘淡出');
        ok(/-webkit-mask-image/.test(视窗块), 'mask 带 -webkit- 前缀（iOS Safari 兼容）');
        const m = /mask-image:\s*linear-gradient\(([\s\S]*?)\);/.exec(视窗块);
        const 渐变体 = m ? m[1] : '';
        ok(/transparent\s+0%/.test(渐变体), '渐变起点 transparent（左侧淡出到透明）');
        ok(/transparent\s+100%/.test(渐变体), '渐变终点 transparent（右侧淡出到透明）');
        ok(!/255,\s*255,\s*255/.test(渐变体), 'mask 渐变内不含白色（不是白底）');

        // ---- ④ 功能必需的保留项 ----
        ok(/overflow:\s*hidden/.test(视窗块), '视窗保留 overflow:hidden（裁掉滑出的卡片）');
        // 卡片自身的投影是「悬浮」立体感的来源，不能跟着一起删
        ok(/box-shadow\s*:/.test(卡片块), '卡片保留 box-shadow（立体悬浮感）');

        // ---- ⑤ 与状态栏的间隔 = 8.5px ----
        const 容器块 = 取块('.轮播容器');
        const 上边距 = /margin:\s*([^;]+);/.exec(容器块);
        ok(!!上边距, '取到 .轮播容器 的 margin（实际 "' + (上边距 && 上边距[1].trim()) + '"）');
        ok(/margin:\s*8\.5px\s/.test(容器块), '上边距固定 8.5px（与状态栏的间隔）');
        ok(/margin:\s*8\.5px\s+clamp\(12px/.test(容器块), '左右边距未受影响（仅调上下）');

        // 光看 margin 不够：卡片若没贴视窗顶，图片还会被视窗内部留白推下去。
        // 这几条一起锁住「图片顶边 = 视窗顶边」，间隔才真的是 8.5px。
        ok(/top:\s*0;/.test(卡片块), '卡片 top:0 贴视窗顶（图片不再被内部留白推远）');
        ok(/width:\s*calc\(var\(--卡宽比\)\s*\*\s*100%\)/.test(卡片块),
            '卡片宽度取自 --卡宽比（与视窗高度同源）');
        ok(!/translate3d\([^)]*,\s*-50%/.test(css), '卡片不再做 -50% 垂直居中偏移');

        // JS 会补底部余量给投影，但绝不能动顶部
        ok(/视窗\.style\.height\s*=\s*Math\.round\(卡高\s*\+\s*阴影余量\)/.test(css),
            'JS：视窗高度 = 卡片高度 + 阴影余量（只往下加，顶部间隔不受影响）');
    }

    console.log('\n[G] ★ 动态流：无底框 + 分割线隔离 + 纯文字');
    {
        const 卡 = Array.from(d.querySelectorAll('.动态卡片'));
        ok(卡.length === 4, '渲染出 4 条动态（实际 ' + 卡.length + '）');

        // ---------- ① 无底框：卡片不得有可见框样式 ----------
        const 卡块 = (/\.动态卡片\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(卡块.length > 0, '取到 .动态卡片 声明块');
        ok(!/(^|;|\s)background(-color)?\s*:/.test(卡块), '卡片无 background（不铺白底）');
        ok(!/(^|;|\s)box-shadow\s*:/.test(卡块), '卡片无 box-shadow（不投影）');
        ok(!/backdrop-filter\s*:/.test(卡块), '卡片无 backdrop-filter（不做毛玻璃面板）');
        ok(!/(^|;|\s)border(-radius)?\s*:\s*[^;]*;/.test(卡块.replace(/border-top:[^;]*;?/g, '')),
            '卡片无 border-radius / 整圈描边');

        // ---------- ② 分割线：靠 border-top 隔离 ----------
        ok(/border-top:\s*1px\s+solid/.test(卡块), '卡片用 border-top 细线隔离');
        ok(/\.动态卡片\s*\+\s*\.动态卡片\s*\{[\s\S]*?margin-top/.test(css),
            '相邻卡片之间有间距（分割线不贴脸）');

        // ---------- ③ 纯文字：不得再有配图 ----------
        ok(d.querySelectorAll('.动态配图').length === 0, 'DOM 中已无 .动态配图');
        ok(d.querySelectorAll('.配图格').length === 0, 'DOM 中已无 .配图格');
        ok(!/\.动态配图/.test(css), 'CSS 中已无 .动态配图 规则');
        ok(!/\.配图格/.test(css), 'CSS 中已无 .配图格 规则');
        // 动态流的九宫格配图规则应已删除（data-数 是它的专用钩子）
        // 注意：不能简单查 grid-template-columns —— 发布面板的媒体网格也用 grid，那不是配图九宫格
        ok(!/data-数/.test(css), 'CSS 中已无配图九宫格规则（data-数）');
        // 卡片里除头像外不应再有 img
        const 图数 = 卡.reduce((n, c) => n + c.querySelectorAll('img').length, 0);
        ok(图数 === 卡.length, '每条动态只剩 1 张头像图（实际共 ' + 图数 + ' 张 / ' + 卡.length + ' 条）');

        // ---------- ④ 单卡结构仍完整 ----------
        const 首 = 卡[0];
        ok(!!首.querySelector('.动态头像'), '卡片含头像');
        const 昵称 = 首.querySelector('.动态昵称');
        ok(!!昵称 && 昵称.textContent.trim() === '白九霄', '卡片含昵称（实际 "' + (昵称 && 昵称.textContent) + '"）');
        const 元 = 首.querySelector('.动态元信息');
        ok(!!元 && /前|刚刚|昨天/.test(元.textContent) && 元.textContent.includes('来自'),
            '卡片含「时间 · 来源」（实际 "' + (元 && 元.textContent) + '"）');
        ok(!!首.querySelector('.动态正文'), '卡片含正文');
        const 互动 = 首.querySelectorAll('.动态互动 .互动项');
        ok(互动.length === 3, '互动栏 3 项（赞 / 评论 / 转发）实际 ' + 互动.length);

        // ---------- ⑤ 头像映射必须与 4 页默认联系人表一致 ----------
        //    ★ 回归哨兵：圆形头像1 是「我」的头像，不能分给任何角色。
        //      之前白九霄误用圆形头像1，就显示成了用户自己的头像。
        const 四页表 = {
            '埃洛温·影蚀': '圆形头像2', '林彦': '圆形头像3',
            '陆沉渊': '圆形头像4', '白九霄': '圆形头像5',
        };
        const 头像src = 卡.map(c => c.querySelector('.动态头像').getAttribute('src') || '');
        卡.forEach((c, i) => {
            const 名 = c.querySelector('.动态昵称').textContent.trim();
            const 期望 = 四页表[名];
            ok(!!期望 && 头像src[i].includes(期望),
                '第 ' + (i + 1) + ' 条「' + 名 + '」头像 = ' + 期望 + '（实际 "' + 头像src[i] + '"）');
        });
        ok(!头像src.some(x => /圆形头像1\./.test(x)), '★ 没有角色占用「我」的头像 圆形头像1');
        // 与 4 页默认表逐条对齐（读源码比对，防止以后改了一边忘了另一边）
        const s4 = kit.读('4_tongxun.html');
        Object.keys(四页表).forEach(名 => {
            const m = new RegExp("名称:\\s*'" + 名 + "'[^\\n]*头像:\\s*'2【图片】/" + 四页表[名] + "\\.png'").exec(s4);
            ok(!!m, '与 4 页默认表一致：' + 名 + ' → ' + 四页表[名]);
        });

        // ---------- ⑥ 相对时间换算 ----------
        const 全部元 = 卡.map(c => c.querySelector('.动态元信息').textContent);
        ok(全部元[0].startsWith('18分钟前'), '18 分钟 → "18分钟前"（实际 "' + 全部元[0] + '"）');
        ok(全部元[1].startsWith('2小时前'), '126 分钟 → "2小时前"（实际 "' + 全部元[1] + '"）');
        ok(全部元[2].startsWith('10小时前'), '620 分钟 → "10小时前"（实际 "' + 全部元[2] + '"）');
        ok(全部元[3].startsWith('2天前'), '2900 分钟 → "2天前"（实际 "' + 全部元[3] + '"）');
    }

    console.log('\n[G2] ★ 点赞：+1 / 变红 / 持久化到 localStorage');
    {
        const 赞按钮 = d.querySelector('.动态卡片 .互动项.赞按钮')
            || d.querySelector('.动态卡片 .互动项');
        const 数字 = () => parseInt(赞按钮.querySelector('span').textContent, 10);
        const 前 = 数字();
        ok(!赞按钮.classList.contains('已赞'), '初始未点赞');

        赞按钮.click();
        await new Promise(r => setTimeout(r, 30));
        ok(数字() === 前 + 1, '点击后数字 +1（' + 前 + ' → ' + 数字() + '）');
        ok(赞按钮.classList.contains('已赞'), '点击后加上 .已赞（变红）');

        const 存 = JSON.parse(w.localStorage.getItem('动态点赞') || '{}');
        ok(存['d1'] === true, '点赞状态已写入 localStorage「动态点赞」');

        // 再点一次取消
        赞按钮.click();
        await new Promise(r => setTimeout(r, 30));
        ok(数字() === 前, '再点一次取消赞，数字复原（' + 数字() + '）');
        ok(!赞按钮.classList.contains('已赞'), '取消后移除 .已赞');
        ok(JSON.parse(w.localStorage.getItem('动态点赞') || '{}')['d1'] === false, '取消状态也已持久化');
    }

    console.log('\n[G3] ★ 发布入口：说说 / 视频 / 图片（轮播下方 7px）');
    {
        const 入口 = Array.from(d.querySelectorAll('.发布入口'));
        ok(入口.length === 3, '共 3 个入口（实际 ' + 入口.length + '）');
        const 名 = 入口.map(b => b.querySelector('.发布入口文字').textContent.trim());
        ok(名.join(',') === '说说,视频,图片', '依次为 说说 / 视频 / 图片（实际 ' + 名.join(',') + '）');

        // ★ 距轮播 7px
        const 栏块 = (/\.发布入口栏\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/margin:\s*7px\s/.test(栏块), '入口栏上边距 = 7px（距轮播 7px）');
        ok(/justify-content:\s*center/.test(栏块), '★ 入口栏整体居中（justify-content: center）');

        // ★ 无边框
        const 钮块 = (/\.发布入口\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/border:\s*none/.test(钮块), '按钮无边框（border: none）');
        ok(!/border-radius:\s*999px/.test(钮块), '按钮无胶囊边框轮廓');

        // ★ 尺寸比之前小：字号 ≤ 12px、图标 ≤ 14.5px、纵向 padding ≤ 4px
        const 取数 = (块, 属性) => {
            const m = new RegExp(属性 + ':\\s*clamp\\((\\d+(?:\\.\\d+)?)px').exec(块 || '');
            return m ? parseFloat(m[1]) : null;
        };
        const 字号 = 取数(钮块, 'font-size');
        const 纵padding = 取数(钮块, 'padding');
        const 图标块 = (/\.发布入口图标\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        const 图标尺寸 = 取数(图标块, 'width');
        ok(字号 !== null && 字号 <= 12, '字号已缩小（' + 字号 + 'px ≤ 12px）');
        ok(纵padding !== null && 纵padding <= 4, '纵向 padding 已收窄（' + 纵padding + 'px ≤ 4px）');
        ok(图标尺寸 !== null && 图标尺寸 <= 14.5, '图标已缩小（' + 图标尺寸 + 'px ≤ 14.5px）');

        // 图标 + 文字
        ok(入口.every(b => !!b.querySelector('.发布入口图标')), '每个入口都含图标（svg）');
        ok(入口.every(b => b.querySelector('.发布入口文字').textContent.trim().length > 0),
            '每个入口都含文字（不是纯图标）');

        // 旧的「发动态」按钮已彻底移除
        ok(!/发动态按钮|发动态图标|发动态文字/.test(css), 'CSS 中已无「发动态」相关类');
        ok(d.querySelectorAll('.发动态按钮').length === 0, 'DOM 中已无 .发动态按钮');
        ok(!/发动态/.test(d.body.innerHTML), '页面文案中已无「发动态」');


        // 点入口 → 跳转 6 页（jsdom 导航未实现属预期，这里只确认不报错）
        const 前错误数 = errors.length;
        入口[0].click();
        await new Promise(r => setTimeout(r, 30));
        ok(errors.length === 前错误数, '点「说说」不产生脚本错误（触发跳转 6 页）');

        // ★ 发布已独立成 6 页：视频 / 图片这里是跳转，不再弹窗
        ok(!d.getElementById('媒体遮罩'), '5 页已无媒体来源弹窗（已移到 6 页）');
        ok(!d.getElementById('可见性遮罩'), '5 页已无可见性弹窗（已移到 6 页）');
        ok(!d.getElementById('选人遮罩'), '5 页已无选人弹窗（已移到 6 页）');
        ok(/6_fabudongtai\.html\?type='\s*\+\s*encodeURIComponent\(类型\)/.test(css),
            '三个入口都跳转到 6_fabudongtai.html?type=…');
    }

    console.log('\n[G8] ★ 通讯录只读一次（不按条反复 parse）');
    {
        let 次数 = 0;
        function 计数(w) {
            const 原 = w.localStorage.getItem.bind(w.localStorage);
            w.localStorage.getItem = k => {
                if (k === '联系人索引') 次数++;
                return 原(k);
            };
        }
        const 数据 = { '联系人索引': JSON.stringify(联系人索引) };
        const w2 = await kit.起页面('5_dongtai.html', 'http://localhost/5b.html',
            数据, errors, '5b', 计数);
        await new Promise(r => setTimeout(r, 120));

        const 卡 = Array.from(w2.document.querySelectorAll('.动态卡片'));
        ok(卡.length === 4, '渲染出 4 条动态（实际 ' + 卡.length + '）');
        // ★ 4 条动态都要取头像，但通讯录只能读一次
        ok(次数 <= 1, '★ 4 条动态共读通讯录 ' + 次数 + ' 次（应 ≤ 1）');
        // 缓存后头像仍然正确（不能因为只读一次就取错）
        const src = 卡.map(c => c.querySelector('.动态头像').getAttribute('src') || '');
        ok(/圆形头像5\./.test(src[0]), '白九霄头像仍正确（实际 "' + src[0] + '"）');
        ok(/圆形头像2\./.test(src[1]), '埃洛温头像仍正确（实际 "' + src[1] + '"）');
        ok(/圆形头像4\./.test(src[2]), '陆沉渊头像仍正确（实际 "' + src[2] + '"）');
        ok(/圆形头像3\./.test(src[3]), '林彦头像仍正确（实际 "' + src[3] + '"）');
    }

    console.log('\n[H] 底部导航：默认选中「动态」，★ 且不放大');
    {
        const 项 = Array.from(d.querySelectorAll('.底部导航栏 .导航项'));
        ok(项.length === 4, '底部导航 4 项');
        const 选中 = 项.filter(i => i.classList.contains('选中'));
        ok(选中.length === 1, '有且仅有一个选中项');
        ok(选中[0] && 选中[0].querySelector('.导航文字').textContent.trim() === '动态', '默认选中「动态」');

        ok(/\.导航项\.选中\s+\.导航图标\s*\{\s*transform:\s*none;?\s*\}/.test(css),
            'CSS：.导航项.选中 .导航图标 显式 transform: none');
        ok(!/\.导航项\.选中\s+\.导航图标[^}]*scale\(/.test(css), 'CSS：选中态未使用 scale() 放大');
    }

    console.log('\n[I] 1 / 4 页的「动态」已接入跳转');
    {
        const s1 = kit.读('1_shouyeyulan.html');
        const s4 = kit.读('4_tongxun.html');
        ok(/动态:\s*'5_dongtai\.html'/.test(s1), '1 页：动态 → 5_dongtai.html');
        ok(/动态:\s*'5_dongtai\.html'/.test(s4), '4 页：动态 → 5_dongtai.html');
        const i1 = s1.indexOf("location.href = 跳转页面[文字]");
        const c1 = s1.indexOf("项.classList.add('选中')");
        ok(i1 > 0 && c1 > 0 && i1 < c1, '1 页：跳转先于选中态切换（不会闪一下放大）');
        ok(/聊天:\s*'1_shouyeyulan\.html'/.test(css), '5 页：聊天 → 1_shouyeyulan.html');
        ok(/通讯录:\s*'4_tongxun\.html'/.test(css), '5 页：通讯录 → 4_tongxun.html');
    }

    console.log('\n[J] ★★ 评论：点「评论」展开 → 输入 → 发送 → 落地');
    {
        const 数据 = { '联系人索引': JSON.stringify(联系人索引) };
        const w = await 起页面('5_dongtai.html', 'http://localhost/5.html', 数据, errors, '5', 打桩尺寸);
        await new Promise(r => setTimeout(r, 300));
        const d = w.document;

        const 卡 = d.querySelectorAll('.动态卡片')[0];
        ok(!!卡, '有动态卡片');
        const 互动 = 卡.querySelectorAll('.互动项');
        ok(互动.length === 3, '★ 互动栏三项：赞 / 评论 / 转发（实际 ' + 互动.length + '）');

        const 评论钮 = 互动[1];
        点(w, 评论钮);
        await new Promise(r => setTimeout(r, 120));

        const 区 = 卡.querySelector('.评论区');
        ok(!!区 && 区.style.display !== 'none', '★ 点「评论」→ 评论区展开');
        const 输入 = 区.querySelector('.评论输入');
        const 发送 = 区.querySelector('.评论发送');
        ok(!!输入 && !!发送, '评论区有输入框与发送键');
        ok(发送.disabled === true, '空内容时发送禁用');

        输入.value = '   ';
        输入.dispatchEvent(new w.Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 50));
        ok(发送.disabled === true, '★ 纯空格不算内容，发送仍禁用');

        输入.value = '写得真好';
        输入.dispatchEvent(new w.Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 50));
        ok(发送.disabled === false, '有字后发送可点');

        点(w, 发送);
        await new Promise(r => setTimeout(r, 200));

        const 评条 = 区.querySelectorAll('.评论条');
        ok(评条.length === 1, '★ ★ 评论已落地（实际 ' + 评条.length + ' 条）');
        ok(/写得真好/.test(评条[0] ? 评条[0].textContent : ''), '★ 评论内容正确');
        ok(输入.value === '', '★ 发完清空输入框');
        ok(发送.disabled === true, '发完发送键回到禁用');
        /* 评论存「动态评论_<id>」，刷新重进还在 */
        ok(/动态评论_/.test(JSON.stringify(数据) + Object.keys(数据).join()),
            '★ 评论进了「动态评论_<id>」存档');
    }

    console.log('\n[K] ★★ 转发：面板可选【联系人】也可选【群聊】');
    {
        const 群 = [{
            id: 'g_a', 名称: '老友局',
            成员: [
                { id: 'c_home_0', 名: '白九霄', 头像: '2【图片】/圆形头像5.png' },
                { id: 'c_home_1', 名: '埃洛温·影蚀', 头像: '2【图片】/圆形头像2.png' },
            ],
            消息: 'x', 时间: '3:00', 建群时间: Date.now(),
        }];
        const 数据 = {
            '联系人索引': JSON.stringify(联系人索引),
            '群聊列表': JSON.stringify(群),
        };
        const w = await 起页面('5_dongtai.html', 'http://localhost/5.html', 数据, errors, '5', 打桩尺寸);
        await new Promise(r => setTimeout(r, 300));
        const d = w.document;

        const 卡 = d.querySelectorAll('.动态卡片')[0];
        点(w, 卡.querySelectorAll('.互动项')[2]);
        await new Promise(r => setTimeout(r, 150));

        const 遮罩 = d.getElementById('转发遮罩');
        ok(遮罩.classList.contains('显示'), '★ 点「转发」→ 面板弹出');

        /* ★★ 两个分区：联系人 + 群聊（原来只有联系人，建了群也转发不了） */
        const 标题 = Array.from(遮罩.querySelectorAll('.转发分区标题')).map(e => e.textContent);
        ok(标题.join('/') === '联系人/群聊',
            '★ ★ 面板分「联系人 / 群聊」两段（实际 ' + 标题.join('/') + '）');

        const 项们 = Array.from(遮罩.querySelectorAll('.转发人'));
        ok(项们.length === 联系人索引.length + 群.length,
            '★ 全部对象都列出来了（实际 ' + 项们.length + '）');
        ok(遮罩.querySelectorAll('.转发群像').length === 群.length,
            '★ 群用拼图头像（一眼看出是群不是人）');

        const 群钮 = 项们[项们.length - 1];
        ok(/老友局/.test(群钮.textContent), '★ 群名显示（实际 ' + 群钮.textContent.trim() + '）');
        ok(/3 人/.test(群钮.textContent),
            '★ 群人数 = 成员 2 + 我 1 = 3（实际 ' + 群钮.textContent.trim() + '）');

        /* ★★ 转发给【群】→ 必须写「群聊列表」，不能写「联系人索引」 */
        点(w, 群钮);
        await new Promise(r => setTimeout(r, 300));

        ok(!遮罩.classList.contains('显示'), '转发后面板关闭');
        const 群表 = JSON.parse(数据['群聊列表'] || '[]');
        ok(群表[0] && String(群表[0].消息 || '').indexOf('[转发的动态]') === 0,
            '★ ★ 群聊列表已更新（实际 ' + (群表[0] && 群表[0].消息) + '）');
        const 索引 = JSON.parse(数据['联系人索引'] || '[]');
        ok(!索引.some(i => String(i.消息 || '').indexOf('[转发的动态]') === 0),
            '★ ★ 联系人索引【没被误写】（群不在这张表里）');
        const 群记录 = JSON.parse(数据['聊天记录_g_a'] || '[]');
        ok(群记录.length === 1 && 群记录[0].谁 === '我',
            '★ 消息落进群的聊天记录（7 页群聊能看到）');
    }

    console.log('\n[L] ★★★ 转发后评论区状态不丢（改前的 bug）');
    {
        const 数据 = { '联系人索引': JSON.stringify(联系人索引) };
        const w = await 起页面('5_dongtai.html', 'http://localhost/5.html', 数据, errors, '5', 打桩尺寸);
        await new Promise(r => setTimeout(r, 300));
        const d = w.document;

        const 卡 = d.querySelectorAll('.动态卡片')[0];
        const 互动 = 卡.querySelectorAll('.互动项');

        /* 展开评论区 + 发一条 + 再留一句没发出去的 */
        点(w, 互动[1]);
        await new Promise(r => setTimeout(r, 120));
        let 区 = 卡.querySelector('.评论区');
        const 输入 = 区.querySelector('.评论输入');
        输入.value = '第一句';
        输入.dispatchEvent(new w.Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 50));
        点(w, 区.querySelector('.评论发送'));
        await new Promise(r => setTimeout(r, 200));

        const 输入2 = 卡.querySelector('.评论输入');
        输入2.value = '还没发出去的字';
        输入2.dispatchEvent(new w.Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 50));

        /* 转发一下 */
        点(w, 卡.querySelectorAll('.互动项')[2]);
        await new Promise(r => setTimeout(r, 150));
        点(w, d.querySelectorAll('#转发遮罩 .转发人')[0]);
        await new Promise(r => setTimeout(r, 300));

        const 区2 = d.querySelectorAll('.动态卡片')[0].querySelector('.评论区');
        ok(!!区2 && 区2.style.display !== 'none',
            '★ ★★ 评论区仍然展开（转发不该把人正在看的评论收起来）');
        ok(!!区2 && 区2.querySelector('.评论输入').value === '还没发出去的字',
            '★ ★★ 输入框里没发出去的字还在（实际 "'
            + (区2 && 区2.querySelector('.评论输入').value) + '"）');
        ok(!!区2 && 区2.querySelectorAll('.评论条').length === 1, '★ 已发出的评论也还在');

        /* 转数就地 +1，不用整页重绘 */
        const 转数 = d.querySelectorAll('.动态卡片')[0].querySelectorAll('.互动项')[2]
            .querySelector('span');
        ok(/^\d+$/.test(转数.textContent || '') && Number(转数.textContent) > 0,
            '★ 转数已就地刷新（实际 ' + 转数.textContent + '）');
    }

    收尾(errors, '✅ 动态页全部通过');
})().catch(e => { console.error(e); process.exit(2); });
