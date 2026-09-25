/* =============================================================================
 * 全局音乐.js —— 跨页续播（4 页开始播，切到任何界面都不中断）
 *
 * 【为什么需要它】
 *   4_tongxun 有自己的完整 UI 播放器，但 HTML 页面之间是真跳转：
 *   一离开 4 页，整个 JS 上下文连同 <audio> 一起被销毁，音乐就断了。
 *   本脚本在每个页面挂一个「无界面的续播器」：进来先读存档，
 *   如果上次是在播，就重建 audio、跳回原秒数、接着播。
 *
 * 【它不是什么】
 *   不做 UI、不做播放列表 —— 那些是 4 页播放器的职责。
 *   这里只负责「让声音不断」，回到 4 页时完整播放器会自然接手。
 *
 * 【契约（改这里前务必看）】
 *   ① 存档键 '音乐播放状态'，格式必须与 4 页 保存状态() 完全一致：
 *        { id, 名, 类型:'默认'|'上传', 时间:秒, 播放中:bool }
 *      —— 两边都写、都读同一个键，才能无缝交接。
 *   ② ★ 让位规则：页面里若存在 #音乐播放器（4 页的），本脚本【完全不启动】。
 *      否则两个 audio 会同时出声。这是唯一的冲突防线，别删。
 *   ③ 上传曲目在 IndexedDB：库名 '音乐库' / 表名 '音频'（与 4 页同名同结构）。
 *
 * 【让位 API（其它页面调用）】
 *   window.全局音频.暂停('语音消息') / .恢复('语音消息')
 *   window.全局音频.暂停('语音通话') / .恢复('语音通话')
 *   7 页播语音条、14 页通话时分别调用，避免两路声音叠在一起。
 *   ★ 用【原因集合】而非布尔：语音与通话可能重叠，布尔会在语音播完时
 *     把仍在通话中的音乐放出来。全部原因解除才恢复。
 *   ★ 会记住「占用前是否在播」，本来没放音乐就不会凭空启动。
 *
 * 【自动播放限制】
 *   浏览器会拦「没有用户手势的自动播放」。被拦时不报错、不打断，
 *   改为监听页面上第一次 pointerdown / touchstart 补播一次
 *   —— 与 4 页 尝试续播() 同一个套路。
 * ========================================================================== */
(function () {
    'use strict';

    const 状态键 = '音乐播放状态';
    const 目录候选 = ['1【音乐】/', '../1【音乐】/'];   // 与 4 页一致：html 挪进子文件夹时自动回退
    const 库名 = '音乐库';
    const 表名 = '音频';

    /* ---------------------------------------------------------------
     * IndexedDB：只为拿上传曲目的 blob，读不到就 null（调用方兜底）
     * ------------------------------------------------------------- */
    function 打开库() {
        return new Promise((完成, 失败) => {
            if (typeof indexedDB === 'undefined') return 失败(new Error('无 IndexedDB'));
            let 请求;
            try { 请求 = indexedDB.open(库名, 1); } catch (e) { return 失败(e); }
            请求.onupgradeneeded = () => {
                const db = 请求.result;
                if (!db.objectStoreNames.contains(表名)) db.createObjectStore(表名, { keyPath: 'id' });
            };
            请求.onsuccess = () => 完成(请求.result);
            请求.onerror = () => 失败(请求.error || new Error('打开失败'));
        });
    }

    function 读一条(id) {
        return 打开库().then(db => new Promise((完成, 失败) => {
            const 事务 = db.transaction(表名, 'readonly');
            const 请求 = 事务.objectStore(表名).get(id);
            请求.onsuccess = () => 完成(请求.result || null);
            请求.onerror = () => 失败(请求.error);
        })).catch(() => null);
    }

    /* ---------------------------------------------------------------
     * 存档读写
     * ------------------------------------------------------------- */
    function 读状态() {
        try { return JSON.parse(localStorage.getItem(状态键) || 'null'); } catch (e) { return null; }
    }

    function 写状态(存) {
        try { localStorage.setItem(状态键, JSON.stringify(存)); } catch (e) {}
    }

    /* ---------------------------------------------------------------
     * 主体
     * ------------------------------------------------------------- */
    const 元素id = '全局音乐播放器';

    /* =========================================================================
     * ★ 占用管理：语音消息 / 语音通话 出声时，背景音乐让位
     *
     *   为什么用 Set 而不是布尔：两种占用可能重叠（比如播着语音条的同时来电话）。
     *   布尔会在「语音播完恢复」时把仍在通话中的音乐也放出来。
     *   记成「原因集合」，全部解除才恢复 —— 这是这类让位逻辑的正确写法。
     *
     *   另外要记住【占用前是否在播】：如果本来就没放音乐，
     *   语音播完不该把音乐凭空启动。
     * ======================================================================= */
    const 占用 = new Set();
    let 占用前在播 = false;
    /* ★ 声明在 IIFE 顶层而不是 启动() 内：页尾探针 __全局音乐.补播中() 要访问它，
         放在 启动() 里的话外层作用域取不到（TDZ / 未定义）。 */
    let 补播中 = false;

    /** 4 页让位时，操作目标是它自己的 #音乐播放器；否则是本脚本建的那个 */
    function 取音频() {
        return document.getElementById('音乐播放器') || document.getElementById(元素id);
    }

    const 全局音频 = {
        /** 暂停背景音乐（可重入；同一原因重复调用无害） */
        暂停(原因) {
            const 键 = 原因 || '未命名';
            if (占用.size === 0) {
                const a = 取音频();
                占用前在播 = !!a && !a.paused;
            }
            占用.add(键);
            const a = 取音频();
            if (a && !a.paused) { try { a.pause(); } catch (e) {} }
        },

        /** 解除某个占用；全部解除且占用前在播 → 恢复播放 */
        恢复(原因) {
            const 键 = 原因 || '未命名';
            if (!占用.has(键)) return;
            占用.delete(键);
            if (占用.size > 0) return;              // 还有别的占用（比如仍在通话）
            if (!占用前在播) return;                 // 本来就没在播 → 不凭空启动
            const a = 取音频();
            if (a && a.paused) {
                const 试 = a.play();
                if (试 && typeof 试.catch === 'function') 试.catch(() => {});
            }
        },

        /** 强制清掉所有占用（异常路径兜底用） */
        清除() { 占用.clear(); },

        占用中() { return 占用.size > 0; },
        占用表() { return Array.from(占用); },
        是否在播() { const a = 取音频(); return !!a && !a.paused; },
    };
    /* ★ 无论让不让位都挂上：让位时它操作的是 4 页自己的播放器，
       调用方（语音条 / 通话）不必关心自己在哪个页面。 */
    window.全局音频 = 全局音频;

    function 启动() {
        /* ★★ 让位：4 页有完整播放器（#音乐播放器），这里绝不能再建第二个 audio。
              注意 7 页那个是 #语音播放器（点语音消息用的），与本脚本无关，
              各播各的，所以【只】认 #音乐播放器 这一个 id。 */
        if (document.getElementById('音乐播放器')) return;
        /* 防重：脚本万一被引了两次，也只建一个 audio */
        if (document.getElementById(元素id)) return;

        const 存 = 读状态();
        // 没在播（或压根没播过）→ 安静退出，不建元素、不占资源
        if (!存 || !存.播放中 || !存.名) return;

        const 音频 = document.createElement('audio');
        音频.id = 元素id;
        音频.dataset.全局音乐 = '1';        // 便于排查 / 测试定位
        音频.preload = 'metadata';
        document.body.appendChild(音频);

        const 目标秒 = Math.max(0, Number(存.时间) || 0);
        let 目录序 = 0;
        let 上传链接 = '';
        /* ★ 是否已经真的播起来了 —— 由 timeupdate 置位。
             没它就无法区分「刚 load 完、进度还是 0」和「正常播到一半」。 */
        let 已起播 = false;
        音频.addEventListener('timeupdate', () => { 已起播 = true; });

        /* ★★ 定位到上次秒数再播。★ 先 seek 后 play：
             否则会从 0 开始，听感上像换了一首。
           ★★ 这里必须【幂等】—— 不能像原来那样用 `已定位` 只处理一次：
             目录候选是逐个试的（1【音乐】/ 找不到就换 ../1【音乐】/），
             每次换目录都会 音频.load()，而 load() 会把 currentTime 归零
             并【再次】触发 loadedmetadata。
             原来 `if (已定位) return` 会把第二次挡掉 → 进度停在 0 →
             听感正是「切个页面回来从头播了」。
             改成：只要「还没播起来」或「进度被 load() 清零（< 1 秒）」就重新定位，
             正常播放中（currentTime 已推进）绝不干扰。 */
        function 定位并续播() {
            const 长 = isFinite(音频.duration) && 音频.duration > 0 ? 音频.duration : 0;
            const 目标 = 长 > 0 ? Math.min(目标秒, Math.max(0, 长 - 0.3)) : 目标秒;
            const 现 = 音频.currentTime || 0;
            const 需要 = !已起播 || 现 < 1;          // 刚载入 / 被 load() 清零
            if (需要 && 目标 > 0 && Math.abs(现 - 目标) > 0.5) {
                try { 音频.currentTime = 目标; } catch (e) {}
            }
            if (!已起播) 续播();
        }

        音频.addEventListener('loadedmetadata', 定位并续播);
        /* duration 有时要等 durationchange 才拿得到，补一道（同样幂等） */
        音频.addEventListener('durationchange', 定位并续播);

        /* 目录逐个试：与 4 页 载入当前目录() 同款（文件缺失 / 解码失败都能兜住） */
        音频.addEventListener('error', () => {
            if (目录序 < 目录候选.length) {
                音频.src = encodeURI(目录候选[目录序++] + 存.名);
            }
        });

        /* 播完了：不自动切歌（这里没有播放列表），停住并把状态改成「没在播」，
           免得下一次进任意页面又从头播一遍。 */
        音频.addEventListener('ended', () => {
            写状态({ id: 存.id, 名: 存.名, 类型: 存.类型, 时间: 0, 播放中: false });
        });

        /* ---- 进度回写：下一页（或回到 4 页）要靠它续上 ---- */
        function 存一次(播放中) {
            写状态({
                id: 存.id, 名: 存.名, 类型: 存.类型,
                时间: 音频.currentTime || 0,
                /* ★ 同 4 页那个坑：只认真正的布尔。pagehide / beforeunload
                     的监听器会把 Event 对象当第一个参数传进来，
                     `播放中 === undefined` 拦不住它 → `!!Event` = true。 */
                播放中: typeof 播放中 !== 'boolean' ? !音频.paused : 播放中,
            });
        }
        // 播着的时候每秒存一次，中途崩溃 / 强杀也不会丢太多
        setInterval(() => { if (!音频.paused) 存一次(true); }, 1000);
        // 离开页面再存一次：跳转、切后台、关闭三种情况都覆盖
        const 存一次同步 = () => 存一次();
        window.addEventListener('pagehide', 存一次同步);
        window.addEventListener('beforeunload', 存一次同步);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') 存一次同步();
        });

        /* ------------------------------------------------------------
         * 补播：浏览器会拦「没有用户手势」的自动播放，这是硬限制，绕不过去。
         *   策略：
         *     ① 直接播；
         *     ② 被拒 → 【持续】监听用户交互，直到真的播起来才撤监听；
         *     ③ 期间挂一个可见小条，告诉用户「点一下继续」。
         *   ★★ 关键：不能用 once:true。那一次点击可能仍被拒（或音频还没
         *      ready），失败后就再也没机会了 —— 表现正是「切过去没声音」。
         *      必须【成功才停】，这是这段里最要紧的一句。
         * ---------------------------------------------------------- */
        const 事件名 = ['pointerdown', 'touchstart', 'click', 'keydown'];

        function 撤补播() {
            if (!补播中) return;
            补播中 = false;
            事件名.forEach(n => document.removeEventListener(n, 试补播, true));
            document.removeEventListener('visibilitychange', 见可见);
            收提示();
        }

        function 见可见() {
            if (document.visibilityState === 'visible') 试补播();
        }

        function 试补播() {
            let 试;
            try { 试 = 音频.play(); } catch (e) { return; }
            if (试 && typeof 试.then === 'function') 试.then(撤补播).catch(展提示);
            else 撤补播();                     // 老浏览器无 Promise：当成功处理
        }

        /** 被拦 → 挂持续监听 + 显示提示条 */
        function 展提示() {
            if (!补播中) {
                补播中 = true;
                /* ★ 捕获阶段：冒泡阶段可能被页面自己的 stopPropagation 吃掉 */
                事件名.forEach(n => document.addEventListener(n, 试补播, true));
                document.addEventListener('visibilitychange', 见可见);
            }
            亮提示();
        }

        /* ---- 提示条：自建，不依赖各页自己的 toast 实现（各页不统一）---- */
        let 提示元素 = null;
        function 亮提示() {
            if (提示元素) return;
            const 条 = document.createElement('div');
            条.id = '全局音乐提示';
            条.textContent = '♪ 音乐已就绪，点一下继续播放';
            // 样式全内联 + !important：各页 CSS 互不统一，不这样会被盖掉 / 变形
            条.setAttribute('style', [
                'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)',
                'z-index:99999', 'padding:8px 14px', 'border-radius:999px',
                'background:rgba(28,28,32,0.86)', 'color:#fff', 'font-size:12px',
                'letter-spacing:.3px', 'pointer-events:none',
                'box-shadow:0 4px 16px rgba(0,0,0,.2)',
                'transition:opacity .25s', 'opacity:0',
                'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
            ].join('!important;') + '!important');
            document.body.appendChild(条);
            提示元素 = 条;
            setTimeout(() => { if (提示元素) 提示元素.style.opacity = '1'; }, 20);
            setTimeout(收提示, 8000);           // 8 秒后自动收，别一直杵着
        }
        function 收提示() {
            if (!提示元素) return;
            const 条 = 提示元素;
            提示元素 = null;
            条.style.opacity = '0';
            setTimeout(() => { if (条.parentNode) 条.parentNode.removeChild(条); }, 300);
        }

        function 续播() {
            let 试;
            try { 试 = 音频.play(); } catch (e) { 展提示(); return; }
            if (试 && typeof 试.then === 'function') 试.then(撤补播).catch(展提示);
            else 撤补播();
        }

        // 播起来了就收掉提示（例如用户从别处触发了播放）
        音频.addEventListener('play', 撤补播);

        /* ---- 载入：上传曲目走 blob URL，其余按目录拼路径 ---- */
        function 载入默认() {
            目录序 = 0;
            音频.src = encodeURI(目录候选[目录序++] + 存.名);
        }

        if (存.类型 === '上传' && 存.id) {
            读一条(存.id).then(记录 => {
                if (记录 && 记录.数据) {
                    try {
                        上传链接 = URL.createObjectURL(记录.数据);
                        音频.src = 上传链接;
                        return;
                    } catch (e) {}
                }
                载入默认();          // 读不到（库被清了）→ 退回按名字找文件
            });
        } else {
            载入默认();
        }
    }

    /* DOM 就绪再跑：4 页的 #音乐播放器 也在 body 里，早了会误判成「没有」
       → 两个 audio 同时出声。 */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', 启动);
    } else {
        启动();
    }

    // 测试 / 调试用：暴露一个只读探针，验证脚本确实起来了
    window.__全局音乐 = {
        键: 状态键,
        元素id: 元素id,
        让位条件: () => !!document.getElementById('音乐播放器'),
        占用: 全局音频.占用表,
        补播中: () => 补播中,
    };
})();
