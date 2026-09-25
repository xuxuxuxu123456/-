/* =============================================================================
 * 相机.js —— 「拍摄」按钮的真正唤起（页内实时相机 + 权限处理）
 *
 * 【原来是什么样】
 *   各页「拍摄」只是点一个带 capture="environment" 的 file input：
 *       <input type="file" accept="image/*" capture="environment">
 *   它在手机浏览器里多数能唤起系统相机，但有三个绕不过去的坑：
 *     ① 【APP 壳 / WebView 里常常完全不生效】—— capture 属性在部分
 *        WebView 被直接忽略，点了只弹文件选择器，甚至什么都不弹。
 *     ② 【没有权限概念】—— 拿不到「用户拒绝了 / 没有摄像头 / 被别的应用占用」
 *        任何一种状态，失败了就是静默无反应，用户以为是软件坏了。
 *     ③ 【非 HTTPS 直接失效】—— getUserMedia 在非安全上下文被禁，
 *        而 capture 在部分环境也依赖安全上下文，同样静默。
 *
 * 【现在怎么做：三条路线依次降级】
 *     ① APP 原生相机（window.小喵叽原生.拍照）—— 壳内最原生，权限由系统管
 *     ② 页内实时相机（getUserMedia）—— 有取景器、能切前后摄，权限状态可读
 *     ③ 退回 input capture —— 老路，保底不失灵
 *   ★ 任何一条失败都自动降到下一条，用户只会看到「更原始但可用」的相机，
 *     而不是点了没反应。
 *
 * ★★ 权限状态是本模块的重点：NotAllowedError（被拒）/ NotFoundError（无设备）
 *     / NotReadableError（被占用）/ 非安全上下文，分别给不同且可执行的提示，
 *     绝不用一句「拍摄失败」糊过去。
 *
 * 【契约（改这里前务必看）】
 *   ① 页面接入方式：把 `拍照输入.click()` 换成 `window.全局相机.拍摄(拍照输入)`。
 *      成功时本模块会把 File【塞回这个 input】并派发 change ——
 *      页面原有的 change 处理逻辑一行都不用改。
 *   ② 没有 input 的场景（如 6 页动态，input 是运行时新建的）走 回调 形式：
 *      window.全局相机.拍摄(null, { 回调: f => ... })
 *   ③ 不做裁剪、不碰 localStorage —— 那些是各页自己的事。
 *   ④ 录视频【不】走本模块（capture 对视频是录像，行为本来就对），
 *      调用方只在类型是图片时才调进来。
 *
 * 【自动播放 / 安全上下文】
 *   getUserMedia 只在安全上下文可用（https / localhost / file 部分浏览器）。
 *   检测到非安全上下文时【直接跳到降级路线】，不弹取景器、不报无意义的错。
 * ========================================================================== */
(function () {
    'use strict';

    const 全局 = typeof window !== 'undefined' ? window : this;

    /* ---------------------------------------------------------------
     * 小工具
     * ------------------------------------------------------------- */
    const 安全上下文 = () => !!(全局.isSecureContext
        || (全局.location && /^(https:|file:)$/.test(全局.location.protocol))
        || (全局.location && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(全局.location.hostname)));

    const 有取像 = () => !!(全局.navigator && 全局.navigator.mediaDevices
        && typeof 全局.navigator.mediaDevices.getUserMedia === 'function');

    /** 把 File 塞回 input 并派发 change —— 让页面原有处理逻辑原样生效 */
    function 回填(输入, 文件) {
        if (!输入) return false;
        try {
            if (typeof DataTransfer === 'function' || (全局.DataTransfer)) {
                const dt = new 全局.DataTransfer();
                dt.items.add(文件);
                输入.files = dt.files;
                输入.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        } catch (e) {}
        return false;
    }

    function 提示(文) {
        /* 各页 toast 实现不统一（window.showToast / 提示 / 自己造的），
           这里统一探测一轮；都没有就退回 alert，绝不静默。 */
        try {
            if (typeof 全局.showToast === 'function') { 全局.showToast(文); return; }
            if (typeof 全局.提示 === 'function') { 全局.提示(文); return; }
            const 条 = document.getElementById('toast');
            if (条) {
                条.textContent = 文;
                条.classList.add('显示');
                setTimeout(() => 条.classList.remove('显示'), 2600);
                return;
            }
        } catch (e) {}
        try { alert(文); } catch (e) {}
    }

    /* ---------------------------------------------------------------
     * 路线①：APP 原生相机
     * ------------------------------------------------------------- */
    const 桥 = () => (全局.小喵叽原生 || null);
    const 有原生相机 = () => {
        const b = 桥();
        return !!(b && typeof b.拍照 === 'function');
    };

    /**
     * ★ 桥返回值归一化（与 备份.js 的 解桥返回 同一套道理）：
     *   Android 的 @JavascriptInterface 只能把返回值序列化成字符串，
     *   所以原生侧返回 base64 字符串或 JSON；这里统一成 File 或 null。
     */
    function 解桥(值) {
        if (!值) return null;
        let 元 = 值;
        if (typeof 元 === 'string') {
            const s = 元.trim();
            if (!s) return null;
            if (s.charAt(0) === '{') {
                try { 元 = JSON.parse(s); } catch (e) { return { 失败: true, 原因: '相机返回无法解析' }; }
            } else {
                元 = { 数据: s };                      // 纯 base64
            }
        }
        if (元.取消) return null;
        if (元.失败) return { 失败: true, 原因: 元.原因 || '原生相机失败' };
        if (!元.数据) return null;
        return 元;
    }

    function base64转File(数据, 名) {
        const 逗号 = String(数据).indexOf(',');
        const 纯 = 逗号 >= 0 ? String(数据).slice(逗号 + 1) : String(数据);
        const 类型 = (逗号 >= 0 && /data:([^;]+);/.test(String(数据).slice(0, 逗号)))
            ? /data:([^;]+);/.exec(String(数据).slice(0, 逗号))[1] : 'image/jpeg';
        const 二 = atob(纯);
        const 节 = new Uint8Array(二.length);
        for (let i = 0; i < 二.length; i++) 节[i] = 二.charCodeAt(i);
        return new File([节], 名 || ('拍摄_' + Date.now() + '.jpg'), { type: 类型 });
    }

    function 原生拍照() {
        return new Promise((完成, 失败) => {
            let 出;
            try { 出 = 桥().拍照(); } catch (e) { return 失败(e); }
            Promise.resolve(出).then(值 => {
                const 元 = 解桥(值);
                if (!元) return 完成(null);                       // 用户取消
                if (元.失败) return 失败(new Error(元.原因));
                try { 完成(base64转File(元.数据, 元.名)); }
                catch (e) { 失败(e); }
            }).catch(失败);
        });
    }

    /* ---------------------------------------------------------------
     * 路线②：页内实时相机（getUserMedia）
     * ------------------------------------------------------------- */

    /** 取景器：全屏 video + 切换前后摄 + 快门 + 取消。样式全内联，不依赖各页 CSS。 */
    function 开取景器() {
        return new Promise((完成, 失败) => {
            const 文档 = document;
            let 流 = null;
            let 前摄 = false;            // false = 后置（environment）
            let 已关 = false;
            let 视频 = null;
            let 层 = null;

            function 关() {
                if (已关) return;
                已关 = true;
                try { if (流) 流.getTracks().forEach(t => t.stop()); } catch (e) {}
                if (层 && 层.parentNode) 层.parentNode.removeChild(层);
                文档.removeEventListener('keydown', 键, true);
            }

            function 键(e) { if (e.key === 'Escape') { 关(); 完成(null); } }

            async function 接流() {
                if (流) { try { 流.getTracks().forEach(t => t.stop()); } catch (e) {} }
                const 约 = {
                    video: {
                        facingMode: 前摄 ? 'user' : 'environment',
                        width: { ideal: 1280 }, height: { ideal: 1280 },
                    },
                    audio: false,
                };
                try {
                    流 = await 全局.navigator.mediaDevices.getUserMedia(约);
                } catch (e) {
                    /* ★ 后置摄像头在部分桌面机 / 老设备上没有 —— 自动退到前置，
                         别一上来就报「没有摄像头」。 */
                    if (!前摄) {
                        前摄 = true;
                        try {
                            流 = await 全局.navigator.mediaDevices.getUserMedia(
                                { video: { facingMode: 'user' }, audio: false });
                        } catch (e2) { 关(); return 失败(e2); }
                    } else { 关(); return 失败(e); }
                }
                视频.srcObject = 流;
                try { await 视频.play(); } catch (e) {}
            }

            /* ---- 建 DOM ---- */
            层 = 文档.createElement('div');
            层.id = '全局相机取景器';
            层.setAttribute('style', [
                'position:fixed', 'inset:0', 'z-index:2147483000',
                'background:#000', 'display:flex', 'flex-direction:column',
                'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
            ].join('!important;') + '!important');

            视频 = 文档.createElement('video');
            视频.setAttribute('style', [
                'flex:1', 'width:100%', 'object-fit:cover', 'background:#000',
            ].join('!important;') + '!important');
            视频.playsInline = true;
            视频.muted = true;
            视频.autoplay = true;
            层.appendChild(视频);

            const 底 = 文档.createElement('div');
            底.setAttribute('style', [
                'flex-shrink:0', 'display:flex', 'align-items:center', 'justify-content:space-around',
                'padding:18px 24px', 'padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))',
            ].join('!important;') + '!important');

            const 钮 = (文, 主) => {
                const b = 文档.createElement('button');
                b.type = 'button';
                b.textContent = 文;
                b.setAttribute('style', [
                    'border:none', 'cursor:pointer', 'font-family:inherit',
                    'color:#fff', 'font-size:15px', 'padding:11px 18px', 'border-radius:999px',
                    'background:' + (主 ? '#3a7afe' : 'rgba(255,255,255,0.18)'),
                ].join('!important;') + '!important');
                底.appendChild(b);
                return b;
            };

            const 取消钮 = 钮('取消', false);
            const 快门 = 钮('拍摄', true);
            const 切换钮 = 钮('切换', false);

            层.appendChild(底);
            文档.body.appendChild(层);
            文档.addEventListener('keydown', 键, true);

            取消钮.addEventListener('click', () => { 关(); 完成(null); });
            切换钮.addEventListener('click', () => { 前摄 = !前摄; 接流().catch(() => {}); });
            快门.addEventListener('click', () => {
                try {
                    const w = 视频.videoWidth || 720;
                    const h = 视频.videoHeight || 1280;
                    const 布 = 文档.createElement('canvas');
                    布.width = w; 布.height = h;
                    布.getContext('2d').drawImage(视频, 0, 0, w, h);
                    /* ★ 前置摄像头拍出来是镜像的，翻回来才符合自拍预期 */
                    if (前摄) {
                        const 布2 = 文档.createElement('canvas');
                        布2.width = w; 布2.height = h;
                        const 笔 = 布2.getContext('2d');
                        笔.translate(w, 0); 笔.scale(-1, 1);
                        笔.drawImage(布, 0, 0);
                        布2.toBlob(落, 'image/jpeg', 0.92);
                    } else {
                        布.toBlob(落, 'image/jpeg', 0.92);
                    }
                } catch (e) { 关(); 失败(e); }
            });

            function 落(blob) {
                if (!blob) { 提示('拍照失败，请重试'); return; }
                const 文件 = new File([blob], '拍摄_' + Date.now() + '.jpg', { type: 'image/jpeg' });
                关();
                完成(文件);
            }

            接流().catch(e => { if (!已关) { 关(); 失败(e); } });
        });
    }

    /* ---------------------------------------------------------------
     * 路线③：退回 input capture（保底）
     * ------------------------------------------------------------- */
    function input拍照(输入) {
        return new Promise((完成) => {
            /* ★ 没有现成 input（6 页那种运行时才建的）→ 自己造一个。
                 少了这一步，6 页在「页内相机不可用」时会彻底失去拍照能力，
                 而不是退回原来的 capture 路径 —— 那就成了功能倒退。 */
            let 临时的 = null;
            if (!输入) {
                try {
                    临时的 = document.createElement('input');
                    临时的.type = 'file';
                    临时的.accept = 'image/*';
                    临时的.setAttribute('capture', 'environment');
                    临时的.className = '视觉隐藏文件输入';
                    document.body.appendChild(临时的);
                    输入 = 临时的;
                } catch (e) { return 完成(null); }
            }
            let 已 = false;
            const 收 = () => {
                if (已) return;
                const f = 输入.files && 输入.files[0];
                已 = true;
                输入.removeEventListener('change', 收);
                if (临时的) setTimeout(() => { try { 临时的.remove(); } catch (e) {} }, 0);
                完成(f || null);
            };
            输入.addEventListener('change', 收);
            try { 输入.value = ''; 输入.click(); } catch (e) { 完成(null); }
            /* ★ 兜底：部分 WebView 用户取消时不派发 change，
                 8 分钟太久、3 秒太短，这里给 60 秒自动收手，避免 Promise 悬挂。 */
            setTimeout(() => {
                if (!已) {
                    已 = true;
                    输入.removeEventListener('change', 收);
                    if (临时的) { try { 临时的.remove(); } catch (e) {} }
                    完成(null);
                }
            }, 60000);
        });
    }

    /* ---------------------------------------------------------------
     * 权限错误 → 人话
     * ------------------------------------------------------------- */
    function 错误说明(e) {
        const 名 = (e && (e.name || e.code)) || '';
        switch (名) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
            case 'SecurityError':
                return '相机权限被拒绝。请到系统设置里允许本应用使用相机后再试。';
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                return '没有检测到可用的摄像头。';
            case 'NotReadableError':
            case 'TrackStartError':
                return '摄像头被其它应用占用，请先关闭那些应用。';
            case 'OverconstrainedError':
                return '摄像头不支持所需的拍摄参数。';
            case 'AbortError':
                return '摄像头启动被中断，请重试。';
            default:
                return '相机打开失败：' + (名 || '未知原因');
        }
    }

    /* ---------------------------------------------------------------
     * 对外 API
     * ------------------------------------------------------------- */
    /**
     * 拍摄一张照片。
     * @param 输入   页面里那个带 capture 的 file input（成功后回填并派发 change）
     * @param 选项   { 回调 } —— 没有 input 时用它接 File
     * @returns Promise<File|null>  用户取消 / 全部路线失败 → null
     */
    async function 拍摄(输入, 选项) {
        选项 = 选项 || {};

        const 交 = (文件) => {
            if (!文件) return null;
            if (输入 && 回填(输入, 文件)) return 文件;
            if (typeof 选项.回调 === 'function') { try { 选项.回调(文件); } catch (e) {} return 文件; }
            /* ★ 两个出口都走不通（极老的 WebView 没有 DataTransfer，且调用方没给回调）
                 —— 必须说出来，否则用户拍了照却什么都没发生，最像「软件坏了」。 */
            提示('照片已拍好，但当前环境无法自动填入，请改用「从手机相册选择」。');
            return 文件;
        };

        /* ① APP 原生相机 */
        if (有原生相机()) {
            try { const f = await 原生拍照(); if (f) return 交(f); return null; }
            catch (e) { /* 桥出错不打扰用户，静默降级 */ }
        }

        /* ② 页内实时相机 —— ★ 非安全上下文直接跳到降级，别弹无意义的取景器 */
        if (有取像() && 安全上下文()) {
            try {
                const f = await 开取景器();
                if (f) return 交(f);
                return null;                       // 用户取消
            } catch (e) {
                /* ★ 用户主动拒绝：明确告知，不再继续降级
                     （继续降级会弹出系统相机，等于绕过用户的拒绝，属于越权） */
                const 名 = (e && e.name) || '';
                if (名 === 'NotAllowedError' || 名 === 'PermissionDeniedError' || 名 === 'SecurityError') {
                    提示(错误说明(e));
                    return null;
                }
                /* 其余（无设备 / 被占用）→ 降级到 input capture，并提示一句 */
                提示(错误说明(e) + '已改用系统相机。');
            }
        }

        /* ③ 保底：input capture */
        const f = await input拍照(输入);
        if (f) 交(f);
        return f || null;
    }

    const 全局相机 = {
        拍摄: 拍摄,
        /** 当前环境能不能用上页内相机（供调用方决定要不要显示「拍摄」） */
        可用页内: () => 有取像() && 安全上下文(),
        /** 有没有 APP 原生相机桥 */
        有原生: 有原生相机,
        /** 一句话说明当前走哪条路线（调试 / 排查用，不谎报） */
        路线说明() {
            if (有原生相机()) return 'APP 原生相机';
            if (有取像() && 安全上下文()) return '页内实时相机（getUserMedia）';
            if (!安全上下文()) return '系统相机（当前非 HTTPS，页内相机不可用）';
            return '系统相机（当前环境不支持 getUserMedia）';
        },
    };

    全局.全局相机 = 全局相机;
    /* ★ 只挂对象，不在这里自动做任何事 —— 拍照必须由用户点击触发，
         否则会被浏览器的用户手势限制拦下。 */
})();
