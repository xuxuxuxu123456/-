/* =============================================================================
 * 软键盘适配.js —— 让输入框在手机输入法弹出时始终可见
 *
 * 【要解决什么】
 *   全站每个页面都是「100dvh 的固定容器 + 中间滚动区 + 底部固定区」的结构：
 *       .手机主题背景容器 { height: 100dvh; overflow: hidden; display:flex; column }
 *         ├── .顶部固定区      (flex-shrink: 0)
 *         ├── .手机界面内容    (flex: 1; overflow-y: auto)  ← 唯一滚动区
 *         └── .底部输入区      (flex-shrink: 0)
 *   容器高度被 100dvh 硬锁死，所以输入法一弹出：
 *     · iOS Safari：layout viewport 不变，visual viewport 被键盘吃掉一块，
 *       容器高度纹丝不动 → 底部输入区整个被键盘盖住。
 *     · Android Chrome（resize 模式）：innerHeight 会变小，dvh 跟着变，
 *       容器自动变矮 → 但只在部分浏览器成立，换一家就打回原形。
 *   同一套代码在两家表现不一样，正是这次要抹平的东西。
 *
 * 【核心思路：只信 visualViewport】
 *   键盘高度 = 基准布局高 − visualViewport.height − visualViewport.offsetTop
 *   然后把容器高度直接设成 visualViewport.height，并整体平移 offsetTop。
 *   —— 不猜机型、不猜浏览器，只认「当前真正能看见的这块矩形」，
 *      所以 iOS / Android / 各家输入法走的都是同一条代码路径。
 *
 *   ★ 基准布局高不是实时的 window.innerHeight —— 这是最容易写错的一处。
 *     Android 键盘弹出时 innerHeight 本身就会变小，拿实时 innerHeight 去减
 *     visualViewport.height 会得到 0，等于永远检测不到键盘（典型的「安卓没效果」）。
 *     基准只在「确认键盘收起」时更新，弹出期间冻结。
 *
 * 【两件事一起做，缺一个都会漏】
 *   ① 容器自适应：解决「底部常驻输入区被盖」（7 页的 .底部输入区）
 *   ② 焦点滚入可视：解决「滚动区里的输入框被盖」（2 / 11 / 19~22 页的表单）
 *
 * 【四条硬约束（需求点，改动时别破）】
 *   ① 不抖动：高度变化 ≤ 2px 不写样式；所有写入合并进一帧 rAF；
 *              键盘判定阈值 80px，避开地址栏收起、工具栏隐藏这类假信号。
 *   ② 不丢焦点：全程不 blur、不重建 DOM、不动 tabindex、不改 DOM 顺序。
 *   ③ 不整页滚：绝不用 window.scrollTo 做补偿 —— 那会让 iOS 整个 layout
 *      viewport 上移，顶部被切掉且松手后弹不回来。只改容器高度与
 *      「最近的可滚动祖先」的 scrollTop。
 *   ④ 不硬编码机型：没有 User-Agent 判断，没有 iOS / Android 分支。
 *
 * 【降级】
 *   没有 visualViewport（老浏览器）→ 退回 window.resize + innerHeight 比对。
 *   再不行 → 什么都不做，恢复成页面原本的样子（不会更糟）。
 *
 * 【对外 API（业务与测试用）】
 *   window.软键盘.是否弹出()   → bool
 *   window.软键盘.键盘高度()   → 像素
 *   window.软键盘.校准()       → 立刻重算一次（比如弹窗关闭后）
 *   window.软键盘.让位(px)     → 声明额外的底部占用（如自定义输入条），
 *                                容器会再让出这么多高度
 *   window.软键盘._喂(...)     → 测试用：直接喂一个可视区矩形
 *
 * ★★ 本文件是唯一源。改完跑：python3 同步软键盘.py
 *     （与 全局音乐.js / 音频助手.js 同一套内联同步机制）
 * ========================================================================== */
(function () {
    'use strict';

    /* ------------------------------------------------------------------
     * 常量
     * ---------------------------------------------------------------- */
    const 容器类名 = '手机主题背景容器';
    const 弹出阈值 = 80;      // 键盘高度超过它才认定「键盘弹出了」
    const 变化阈值 = 2;       // 高度变化不超过它就不写样式，省掉无意义的重排
    const 底部余量 = 14;      // 焦点元素与可视区底部之间留的呼吸位
    const 顶部余量 = 8;
    const 类名键已弹 = '软键盘已弹出';
    const 样式id = '软键盘适配样式';

    const vv = (typeof window.visualViewport === 'object' && window.visualViewport)
        ? window.visualViewport : null;

    /* ------------------------------------------------------------------
     * 状态
     * ---------------------------------------------------------------- */
    let 容器 = null;
    let 基准高 = 0;           // 「键盘收起时」的布局高度，弹出期间冻结
    let 已弹出 = false;
    let 上次可视高 = 0;
    let 上次偏移 = 0;
    let 帧 = 0;               // rAF 句柄，用于合并
    let 额外让位 = 0;         // window.软键盘.让位() 设进来的额外高度
    let 焦点 = null;          // 最近一次聚焦的输入元素

    /* ------------------------------------------------------------------
     * 小工具
     * ---------------------------------------------------------------- */
    function 是输入框(el) {
        if (!el || !el.tagName) return false;
        const 标签 = el.tagName.toLowerCase();
        return 标签 === 'input' || 标签 === 'textarea'
            || (标签 === 'div' && el.isContentEditable === true);
    }

    /** 找容器：优先类名（全站统一），退化到 body 的唯一直接子元素 */
    function 找容器() {
        if (容器 && 容器.isConnected) return 容器;
        容器 = document.querySelector('.' + 容器类名) || null;
        return 容器;
    }

    function 可视顶() { return vv ? (vv.offsetTop || 0) : (window.scrollY || 0); }
    function 可视底() {
        if (vv) return (vv.offsetTop || 0) + vv.height;
        return (window.scrollY || 0) + window.innerHeight;
    }
    function 当前可视高() { return vv ? vv.height : window.innerHeight; }
    function 当前偏移() { return vv ? (vv.offsetTop || 0) : (window.scrollY || 0); }

    /* ------------------------------------------------------------------
     * 注入样式：只在键盘弹出时生效，收起即移除，不留残余
     * ---------------------------------------------------------------- */
    function 装样式() {
        if (document.getElementById(样式id)) return;
        const 样式 = document.createElement('style');
        样式.id = 样式id;
        /* ★ 用 class 而不是内联 style：收起时摘掉 class 就能还原，
             不用逐个记住页面原本的 align-items / padding 是多少。 */
        样式.textContent =
            'html.' + 类名键已弹 + ' body{align-items:flex-start !important;}\n' +
            'html.' + 类名键已弹 + ' .' + 容器类名 + '{padding-bottom:0 !important;}\n';
        (document.head || document.documentElement).appendChild(样式);
    }

    /* ------------------------------------------------------------------
     * 核心：把容器压到「真正看得见」的那块矩形里
     * ---------------------------------------------------------------- */
    function 应用() {
        const 盒 = 找容器();
        if (!盒) return;

        const 可视高 = 当前可视高();
        const 偏移 = 当前偏移();

        if (!基准高) 基准高 = window.innerHeight || 可视高;

        /* ★★ 键盘高度：基准 − 可视高 − 偏移。
              基准在弹出期间冻结，所以 Android 那种「innerHeight 自己也会缩」
              的情况同样算得出来。 */
        let 键盘 = 基准高 - 可视高 - 偏移;
        if (键盘 < 0) 键盘 = 0;

        const 弹出 = 键盘 > 弹出阈值;

        /* 状态没变、且可视高几乎没动 → 什么都不做（防抖动的第①道闸） */
        if (弹出 === 已弹出
            && Math.abs(可视高 - 上次可视高) <= 变化阈值
            && Math.abs(偏移 - 上次偏移) <= 变化阈值) {
            if (弹出) 校准焦点();
            return;
        }

        上次可视高 = 可视高;
        上次偏移 = 偏移;
        已弹出 = 弹出;

        const 根 = document.documentElement;
        const 体 = document.body;

        if (弹出) {
            装样式();
            if (!根.classList.contains(类名键已弹)) 根.classList.add(类名键已弹);

            /* 容器高度 = 真正看得见的高度（再减去业务声明的额外让位） */
            const 目标高 = Math.max(120, 可视高 - 额外让位);
            盒.style.height = 目标高 + 'px';
            盒.style.minHeight = 目标高 + 'px';
            /* 跟着 visualViewport 的偏移走（iOS 页面被上推时靠它归位） */
            盒.style.transform = (偏移 ? 'translateY(' + 偏移 + 'px)' : '');

            /* ③ 不整页滚：只在系统确实把 layout viewport 推走时温和拉回原点。
                 阈值 4px 是为了不跟正常的 1~2px 抖动打架。 */
            if (!vv && (window.pageYOffset || 0) > 4 && 体) {
                const 体溢出 = window.getComputedStyle(体).overflow;
                if (体溢出 === 'hidden' || 体溢出 === 'clip') window.scrollTo(0, 0);
            }
        } else {
            /* 收起：摘 class、清掉所有内联改动，回到页面原本的样子 */
            if (根.classList.contains(类名键已弹)) 根.classList.remove(类名键已弹);
            盒.style.height = '';
            盒.style.minHeight = '';
            盒.style.transform = '';
            /* 收起时基准可以放心更新 —— 此刻量到的就是「无键盘」的真实高度 */
            基准高 = window.innerHeight || 可视高;
        }

        /* 容器变矮之后滚动区也变矮，焦点元素可能又落到可视区外 → 再校准一次 */
        校准焦点();
    }

    /** 合并到下一帧，避免 resize 连发时反复读写布局 */
    function 排一帧() {
        if (帧) return;
        const 跑 = window.requestAnimationFrame
            || function (f) { return setTimeout(f, 16); };
        帧 = 跑(function () { 帧 = 0; 应用(); });
    }

    /* ------------------------------------------------------------------
     * ② 焦点滚入可视
     * ---------------------------------------------------------------- */
    /** 向上找最近一个「真的能滚」的祖先 */
    function 找滚动祖先(el) {
        let n = el ? el.parentElement : null;
        while (n && n !== document.body && n !== document.documentElement) {
            const 样式 = window.getComputedStyle(n);
            const 可滚 = /(auto|scroll|overlay)/.test(样式.overflowY || '');
            if (可滚 && n.scrollHeight > n.clientHeight + 1) return n;
            n = n.parentElement;
        }
        return null;
    }

    /**
     * 把焦点元素挪进可视区。
     * ★ 只动「最近滚动祖先」的 scrollTop —— 不动 window，避免整页位移。
     * ★ 元素本来就在可视区里时什么都不做，不会没事乱滚。
     */
    function 校准焦点() {
        const el = 焦点 || document.activeElement;
        if (!是输入框(el)) return;
        if (!找容器()) return;

        const 矩形 = el.getBoundingClientRect();
        if (!矩形.height && !矩形.top) return;      // 还没布局完，跳过

        const 下界 = 可视底() - 底部余量;
        const 上界 = 可视顶() + 顶部余量;

        let 差 = 0;
        if (矩形.bottom > 下界) 差 = 矩形.bottom - 下界;
        else if (矩形.top < 上界) 差 = 矩形.top - 上界;

        if (Math.abs(差) <= 1) return;

        const 滚动父 = 找滚动祖先(el);
        /* 不在任何滚动区里（比如底部常驻输入区）：容器已经跟着可视区收缩了，
           理论上不该再超出。真超了也不碰 window —— 那才是抖动的根源。 */
        if (滚动父) 滚动父.scrollTop += 差;
    }

    /* ------------------------------------------------------------------
     * 事件
     * ---------------------------------------------------------------- */
    function 起监听() {
        /* ① visualViewport：键盘弹出 / 收起 / 页面被上推 都走这里，逐帧跟随 */
        if (vv) {
            vv.addEventListener('resize', 排一帧);
            vv.addEventListener('scroll', function () {
                /* iOS 键盘弹出时若系统把 layout viewport 推走，offsetTop 会变，
                   这里同步一下容器位置，避免顶部被切掉。 */
                if (已弹出) 排一帧();
            });
        }

        /* ② 降级：没有 visualViewport 的老浏览器，靠 window.resize */
        window.addEventListener('resize', 排一帧);

        /* ③ 方向变化：横竖屏切换后基准要重测 */
        window.addEventListener('orientationchange', function () {
            基准高 = 0;
            setTimeout(排一帧, 120);
        });

        /* ④ 聚焦：记下元素并立刻校准一次。
             键盘弹出是异步动画（iOS 约 250ms），所以这里先做一次「预防性」校准，
             随后 visualViewport.resize 每帧触发时会继续跟着校准到最终位置。 */
        document.addEventListener('focusin', function (e) {
            if (!是输入框(e.target)) return;
            焦点 = e.target;
            /* 先测一次基准：此刻键盘还没弹，量到的正是无键盘高度 */
            if (!已弹出) 基准高 = window.innerHeight || 当前可视高();
            setTimeout(排一帧, 30);
        }, true);

        /* ⑤ 失焦：键盘收起由 resize 兜底，这里只清记录、不主动改布局
              —— 切到下一个输入框时 focusin 会立刻接手，不会闪。 */
        document.addEventListener('focusout', function (e) {
            if (焦点 === e.target) 焦点 = null;
        }, true);

        /* ⑥ 切后台回来：尺寸可能已经变了 */
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) { 基准高 = 0; 排一帧(); }
        });
    }

    /* ------------------------------------------------------------------
     * 启动
     * ---------------------------------------------------------------- */
    function 启动() {
        找容器();
        基准高 = window.innerHeight || 当前可视高();
        上次可视高 = 当前可视高();
        上次偏移 = 当前偏移();
        起监听();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', 启动);
    } else {
        启动();
    }

    /* ------------------------------------------------------------------
     * 对外 API
     * ---------------------------------------------------------------- */
    window.软键盘 = {
        是否弹出: function () { return 已弹出; },
        键盘高度: function () {
            return Math.max(0, 基准高 - 当前可视高() - 当前偏移());
        },
        校准: 排一帧,
        /** 业务声明额外的底部占用（例如自定义输入条），容器再让出这么多 */
        让位: function (px) {
            额外让位 = Math.max(0, Number(px) || 0);
            排一帧();
        },
        /**
         * 测试用：直接喂一个「可视区矩形」，跳过真实环境探测。
         *   _喂(可视高, 偏移, 布局高)
         * · 有 visualViewport：改它的 height / offsetTop
         * · 没有（降级路径）：改 window.innerHeight
         * 两种都是测试替身走的同一条代码路径，所以断言对真机同样成立。
         */
        _喂: function (可视高, 偏移, 布局高) {
            if (typeof 布局高 === 'number' && 布局高 > 0) 基准高 = 布局高;
            上次可视高 = -999;                 // 强制通过变化阈值，保证一定重算
            if (vv) {
                try {
                    vv.height = 可视高;
                    vv.offsetTop = 偏移 || 0;
                } catch (e) {
                    Object.defineProperty(vv, 'height', { value: 可视高, configurable: true });
                    Object.defineProperty(vv, 'offsetTop', { value: 偏移 || 0, configurable: true });
                }
            } else {
                try { window.innerHeight = 可视高; } catch (e) {
                    Object.defineProperty(window, 'innerHeight',
                        { value: 可视高, configurable: true, writable: true });
                }
            }
            应用();
            return true;
        },
        /** 测试用：当前容器被压到的高度（内联样式里的值，未设置则空串） */
        _容器高: function () {
            const 盒 = 找容器();
            return 盒 ? (盒.style.height || '') : null;
        },
    };
})();
