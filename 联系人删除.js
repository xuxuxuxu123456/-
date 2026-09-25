/**
 * 联系人删除.js —— 删除联系人 / 群聊、以及随之清理的全部存档
 *
 * ★★ 为什么抽成一份
 *   1 页（长按会话框）与 4 页（长按联系人）都要做同一件事：
 *     「删掉这个联系人，并且把他的会话、聊天记录、档案、头像、音色一起清掉」。
 *   两页各写一遍，只要有一处漏清一个键，就会出现
 *     「联系人没了，但聊天记录还在 / 会话框还挂着那一行」这种鬼影。
 *   这里只写一份，用 同步联系人删除.py 内联进 1 / 4 页 ——
 *   页面运行时【不依赖】外部文件，单拷 html 也能跑。
 *
 * ★★ 删一个联系人要清哪些键（漏一个就留垃圾）
 *   联系人索引      —— 列表本体（1 / 4 / 5 / 6 / 7 页都在读）
 *   聊天记录_<id>   —— 聊天存档（7 页）
 *   好友信息_<id>   —— 角色档案（7 页读它抽口头禅）
 *   好友头像_<id>   —— 头像 dataURL（2 页）
 *   音色配置_<id>   —— 3 页 per-contact 的音色 / 音速 / 语调
 *   当前联系人      —— 跳转前暂存；若正指向他就一起清，否则下次进来会跳到一个不存在的人
 *   会话列表        —— 旧键（兼容未升级的读取方），也要移除对应项
 *   人设列表        —— 若这条人设绑的是这个联系人，一起删
 *
 * ★★ 删一个群要清哪些键
 *   群聊列表        —— 群本体（★ 群不进「联系人索引」）
 *   聊天记录_g_xxx  —— 群的聊天存档（键名同样是「聊天记录_」前缀）
 *
 * ★★ 为什么还要记「已删会话」
 *   1 页的会话列表是 HTML 里【写死】的（4 个默认角色），不是从「联系人索引」渲染的。
 *   所以只清索引 + 清聊天记录是不够的：
 *     删完刷新 → 写死的那一行又回来了 → 6.5 导出还会把它重新写进索引。
 *   用户看到的就是「删了又复活」。
 *   这里记一份「已删会话」名单，1 页加载时先把这些行抹掉，删除才算真的生效。
 *   ★ 名单里存的是【名字】，因为 1 页写死的行只有名字、没有 id。
 *
 * ★★ 关于「扫键」
 *   不能用 Object.keys(localStorage) —— Storage 是代理对象，
 *   在部分实现（含 jsdom）下枚举不到任何键，会静默什么都删不掉。
 *   length + key(i) 是规范里唯一保证可用的遍历方式。
 */
(function (全局) {
    'use strict';

    /* ============================================================
     * 1. 存储工具
     * ============================================================ */
    function 读(键, 兜底) {
        try {
            const v = 全局.localStorage.getItem(键);
            return v === null || v === undefined ? 兜底 : v;
        } catch (e) { return 兜底; }
    }
    function 读表(键) {
        try {
            const v = JSON.parse(读(键, '[]'));
            return Array.isArray(v) ? v : [];
        } catch (e) { return []; }
    }
    function 写(键, 值) {
        try { 全局.localStorage.setItem(键, 值); return true; } catch (e) { return false; }
    }
    function 删键(键) {
        try { 全局.localStorage.removeItem(键); } catch (e) {}
    }
    /* ============================================================
     * 1.5 「已删会话」名单
     *   1 页会话列表写死在 HTML 里，删完刷新会复活，所以必须记一份名单。
     *   ★ 存名字不存 id：写死的会话行只有名字。
     * ============================================================ */
    const 已删键 = '已删会话';

    function 读已删() {
        const 表 = 读表(已删键);
        return 表.filter(x => typeof x === 'string' && x.trim())
            .map(x => String(x).trim());
    }

    /** ★ 传入名字（可多个）；返回名单长度 */
    function 记已删(名们) {
        const 加 = (Array.isArray(名们) ? 名们 : [名们])
            .map(x => String(x == null ? '' : x).trim()).filter(Boolean);
        if (!加.length) return 读已删().length;
        const 表 = 读已删();
        加.forEach(n => { if (表.indexOf(n) < 0) 表.push(n); });
        /* ★ 只留最近 200 条：名单会一直涨，没必要无限存 */
        写(已删键, JSON.stringify(表.slice(-200)));
        return 表.length;
    }

    /** 名字（或群名，含「（N）」后缀）是否在已删名单里 */
    function 是已删(名) {
        const 净 = String(名 == null ? '' : 名).trim();
        if (!净) return false;
        /* ★ 群名带人数后缀，两边都要去掉再比 */
        const 裸 = 净.replace(/（\d+）\s*$/, '').trim();
        return 读已删().some(x => x === 净 || x === 裸);
    }

    function 扫键(前缀) {
        const 出 = [];
        try {
            const 库 = 全局.localStorage;
            for (let i = 0; i < 库.length; i++) {
                const k = 库.key(i);
                if (k && k.indexOf(前缀) === 0) 出.push(k);
            }
        } catch (e) {}
        return 出;
    }

    /* ============================================================
     * 2. 删联系人：连带全部存档
     *
     *   ★ id 与名都要传：老数据里存在「有 id 没名字」「有名字没 id」两种，
     *     只按一个匹配会漏删，留下鬼影。
     * ============================================================ */
    /* ============================================================
     * 2.5 ★★ 只删会话（不动联系人）
     *
     *   ★★ 与「删联系人」是【两个功能】，别混：
     *     删会话   —— 会话框那一行没了 + 聊天记录清掉；
     *                但【通讯录里的联系人还在】，档案 / 头像 / 音色都保留。
     *                之后从通讯录再发起聊天，会话会重新出现。
     *     删联系人 —— 联系人本身没了，并【连带】清掉他的会话与聊天记录
     *                （4 页长按就是这个，所以它会调 清会话 + 清档案…）。
     *
     *   只删会话要清哪些键：
     *     聊天记录_<id>   —— 聊天存档
     *     当前联系人      —— 若正指向他就一起清（否则会跳到一个已删会话的人）
     *     会话列表        —— 旧键（兼容未升级的读取方）
     *     已删会话        —— 记名字（1 页会话行写死在 HTML 里，靠这份名单抹掉）
     *   ★ 【不清】联系人索引 / 好友信息 / 好友头像 / 音色配置 / 人设
     *     —— 那是删联系人才该动的东西。
     * ============================================================ */
    function 清会话(id, 名) {
        const 编号 = String(id == null ? '' : id).trim();
        const 称呼 = String(名 == null ? '' : 名).trim();
        const 清了 = [];

        /* ① 聊天记录 */
        if (编号) {
            const 键 = '聊天记录_' + 编号;
            if (读(键, null) !== null) { 删键(键); 清了.push(键); }
        }

        /* ② 当前联系人指向他就是脏数据 */
        try {
            const 原 = 读('当前联系人', '');
            if (原) {
                const 项 = JSON.parse(原);
                const 同id = 编号 && 项 && String(项.id || '').trim() === 编号;
                const 同名 = 称呼 && 项 && (String(项.名称 || '').trim() === 称呼
                    || String(项.备注 || '').trim() === 称呼);
                if (同id || 同名) { 删键('当前联系人'); 清了.push('当前联系人'); }
            }
        } catch (e) {}

        /* ③ 旧键「会话列表」 */
        if (称呼) {
            const 会话 = 读表('会话列表');
            const 剩 = 会话.filter(项 =>
                !(项 && String(项.名称 || '').trim() === 称呼));
            if (剩.length !== 会话.length) {
                写('会话列表', JSON.stringify(剩));
                清了.push('会话列表');
            }
        }

        /* ④ 记进「已删会话」：1 页写死的会话行靠这份名单抹掉 */
        if (称呼) 记已删([称呼]);

        return 清了;
    }

    /* ============================================================
     * 2.6 ★ 会话「复活」
     *   只删会话后，联系人还在通讯录里。用户再从通讯录发起聊天时，
     *   会话应该【重新出现】—— 否则「人还在，却永远聊不了」就成死局了。
     *   所以 7 页落地新消息时要把名字从已删名单里移除。
     * ============================================================ */
    function 复活会话(名) {
        const 称呼 = String(名 == null ? '' : 名).trim();
        if (!称呼) return 读已删().length;
        const 裸 = 称呼.replace(/（\d+）\s*$/, '').trim();
        const 剩 = 读已删().filter(x => x !== 称呼 && x !== 裸);
        写(已删键, JSON.stringify(剩));
        return 剩.length;
    }

    function 清联系人(id, 名) {
        const 编号 = String(id == null ? '' : id).trim();
        const 称呼 = String(名 == null ? '' : 名).trim();
        const 清了 = [];

        /* ① 联系人索引（本体） */
        const 索引 = 读表('联系人索引');
        const 剩 = 索引.filter(项 => {
            if (!项 || typeof 项 !== 'object') return true;
            const 同id = 编号 && String(项.id || '').trim() === 编号;
            const 同名 = 称呼 && (String(项.名称 || '').trim() === 称呼
                || String(项.备注 || '').trim() === 称呼);
            return !(同id || 同名);
        });
        if (剩.length !== 索引.length) {
            写('联系人索引', JSON.stringify(剩));
            清了.push('联系人索引');
        }

        /* ② 按 id 的四个分桶键 */
        if (编号) {
            ['聊天记录_', '好友信息_', '好友头像_', '音色配置_'].forEach(前缀 => {
                const 键 = 前缀 + 编号;
                if (读(键, null) !== null) { 删键(键); 清了.push(键); }
            });
        }

        /* ③ 当前联系人（跳转前暂存）指向他就是脏数据 */
        try {
            const 原 = 读('当前联系人', '');
            if (原) {
                const 项 = JSON.parse(原);
                const 同id = 编号 && 项 && String(项.id || '').trim() === 编号;
                const 同名 = 称呼 && 项 && (String(项.名称 || '').trim() === 称呼
                    || String(项.备注 || '').trim() === 称呼);
                if (同id || 同名) { 删键('当前联系人'); 清了.push('当前联系人'); }
            }
        } catch (e) {}

        /* ④ 旧键「会话列表」（兼容未升级的读取方） */
        const 会话 = 读表('会话列表');
        const 会话剩 = 会话.filter(项 =>
            !(项 && 称呼 && String(项.名称 || '').trim() === 称呼));
        if (会话剩.length !== 会话.length) {
            写('会话列表', JSON.stringify(会话剩));
            清了.push('会话列表');
        }

        /* ★ 记进「已删会话」：1 页写死的行就靠这份名单抹掉，否则刷新会复活 */
        if (称呼) 记已删([称呼]);

        /* ⑤ 人设：绑在这个联系人身上的一起删 */
        try {
            const 人设 = 读表('人设列表');
            const 人设剩 = 人设.filter(p =>
                !(p && 编号 && String(p.id || '').trim() === 编号));
            if (人设剩.length !== 人设.length) {
                写('人设列表', JSON.stringify(人设剩));
                清了.push('人设列表');
            }
        } catch (e) {}

        return 清了;
    }

    /* ============================================================
     * 3. 删群聊
     *   ★ 群只存在「群聊列表」，绝不进「联系人索引」——
     *     否则会混进 4 页 A–Z 分组，也会被 1 页导出当成普通联系人。
     * ============================================================ */
    /** ★ 第二参数 名：群名（1 页写死的行只有名字，删群也要能抹掉那一行） */
    function 清群(id, 名) {
        const 编号 = String(id == null ? '' : id).trim();
        if (!编号) return [];
        const 称呼 = String(名 == null ? '' : 名).trim();
        const 清了 = [];
        const 群表 = 读表('群聊列表');
        const 剩 = 群表.filter(g => !(g && String(g.id || '').trim() === 编号));
        if (剩.length !== 群表.length) {
            写('群聊列表', JSON.stringify(剩));
            清了.push('群聊列表');
        }
        /* 群的聊天存档同样是「聊天记录_」前缀 */
        const 键 = '聊天记录_' + 编号;
        if (读(键, null) !== null) { 删键(键); 清了.push(键); }
        /* ★ 群名也记进已删名单（1 页群会话行写死时靠它抹掉） */
        if (称呼) 记已删([称呼]);
        return 清了;
    }

    /* ============================================================
     * 4. 确认弹窗
     *   ★ 用 fixed 覆盖全屏，不受各页容器（.手机界面内容 / .手机主题背景容器）
     *     position / z-index 差异的影响 —— 这两页的容器结构并不一样。
     *   ★ 不引入任何新颜色：全部走全站色板。
     * ============================================================ */
    let 弹窗 = null;

    function 建弹窗() {
        if (弹窗) return 弹窗;
        const 遮 = 全局.document.createElement('div');
        遮.id = '删人遮罩';
        遮.className = '删人遮罩';

        const 卡 = 全局.document.createElement('div');
        卡.className = '删人卡';

        const 标 = 全局.document.createElement('div');
        标.className = '删人标题';
        标.id = '删人标题';
        卡.appendChild(标);

        const 说 = 全局.document.createElement('div');
        说.className = '删人说明';
        说.id = '删人说明';
        卡.appendChild(说);

        const 底 = 全局.document.createElement('div');
        底.className = '删人底';
        const 取消 = 全局.document.createElement('button');
        取消.className = '删人钮'; 取消.type = 'button';
        取消.textContent = '取消';
        取消.id = '删人取消';
        const 确定 = 全局.document.createElement('button');
        确定.className = '删人钮 危'; 确定.type = 'button';
        确定.id = '删人确定';
        底.appendChild(取消); 底.appendChild(确定);
        卡.appendChild(底);

        遮.appendChild(卡);
        /* ★ 点遮罩空白处 = 取消（不误删） */
        遮.addEventListener('click', e => { if (e.target === 遮) 收(弹窗, false); });
        全局.document.body.appendChild(遮);
        弹窗 = { 遮: 遮, 标: 标, 说: 说, 确定: 确定, 取消: 取消 };
        return 弹窗;
    }

    function 收(盒, 结果) {
        盒.遮.classList.remove('显示');
        if (盒.待) { const f = 盒.待; 盒.待 = null; f(结果); }
    }

    /**
     * 确认框：返回 Promise<boolean>（点了「删除」才为真）
     * ★ 不用原生 confirm —— 移动端样式不可控，且部分环境被拦。
     */
    function 确认(标题, 说明, 确认文案) {
        return new Promise(完成 => {
            const 盒 = 建弹窗();
            盒.标.textContent = 标题 || '确认删除';
            盒.说.textContent = 说明 || '';
            盒.确定.textContent = 确认文案 || '删除';
            盒.遮.classList.add('显示');
            盒.待 = 完成;
        });
    }

    /* 按钮只绑一次（建弹窗时元素是新造的，这里在建完立刻绑） */
    function 初始化() {
        const 盒 = 建弹窗();
        盒.确定.addEventListener('click', () => 收(盒, true));
        盒.取消.addEventListener('click', () => 收(盒, false));
    }

    /* ============================================================
     * 5. 长按手势
     *   ★ 移动超过 12px 取消 —— 否则滑动列表会误触
     *   ★ 触发后吞掉那次 click —— 松手不该还进聊天
     *   ★ 桌面端右键也当长按，方便鼠标操作与调试
     * ============================================================ */
    const 长按阈值 = 480;

    function 绑长按(元素, 回调) {
        if (!元素) return;
        let 计时 = null, 起x = 0, 起y = 0, 触发 = false;
        const 清 = () => { if (计时) { 全局.clearTimeout(计时); 计时 = null; } };

        元素.addEventListener('touchstart', e => {
            触发 = false;
            const t = e.touches && e.touches[0];
            起x = t ? t.clientX : 0; 起y = t ? t.clientY : 0;
            计时 = 全局.setTimeout(() => { 触发 = true; 回调(); }, 长按阈值);
        }, { passive: true });

        元素.addEventListener('touchmove', e => {
            const t = e.touches && e.touches[0];
            if (!t) return;
            if (Math.abs(t.clientX - 起x) > 12 || Math.abs(t.clientY - 起y) > 12) 清();
        }, { passive: true });

        元素.addEventListener('touchend', 清);
        元素.addEventListener('touchcancel', 清);

        /* 鼠标长按（桌面端 / 调试） */
        元素.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            触发 = false;
            计时 = 全局.setTimeout(() => { 触发 = true; 回调(); }, 长按阈值);
        });
        元素.addEventListener('mouseup', 清);
        元素.addEventListener('mouseleave', 清);

        元素.addEventListener('contextmenu', e => { e.preventDefault(); 回调(); });
        /* ★ 长按触发后，这次抬手不要再当点击 */
        元素.addEventListener('click', e => {
            if (触发) { 触发 = false; e.stopPropagation(); e.preventDefault(); }
        }, true);
    }

    /* ============================================================
     * 6. 样式（注入一次；不引入新颜色）
     * ============================================================ */
    function 注入样式() {
        if (全局.document.getElementById('删人样式')) return;
        const 样 = 全局.document.createElement('style');
        样.id = '删人样式';
        样.textContent = [
            '.删人遮罩{position:fixed;inset:0;z-index:9000;display:none;',
            'align-items:center;justify-content:center;background:rgba(var(--shade),.32);}',
            '.删人遮罩.显示{display:flex;}',
            '.删人卡{width:min(78vw,300px);padding:clamp(16px,4.6vw,20px);',
            'border-radius:clamp(14px,4vw,17px);background:rgba(var(--panel),.98);',
            '-webkit-backdrop-filter:blur(var(--blur)) saturate(150%);',
            'backdrop-filter:blur(var(--blur)) saturate(150%);',
            'box-shadow:0 8px 30px rgba(var(--shade),.26);animation:删人弹 .18s ease-out;}',
            '@keyframes 删人弹{from{opacity:0;transform:scale(.94);}to{opacity:1;transform:scale(1);}}',
            '.删人标题{font-size:clamp(14px,4vw,16px);font-weight:600;color:var(--ink);}',
            '.删人说明{margin-top:clamp(5px,1.5vw,7px);font-size:clamp(11.5px,3.3vw,13px);',
            'line-height:1.65;color:var(--ink-3);}',
            '.删人底{display:flex;gap:clamp(7px,2vw,10px);margin-top:clamp(13px,3.7vw,17px);}',
            '.删人钮{flex:1;padding:clamp(8px,2.3vw,11px) 0;border-radius:999px;',
            'border:1px solid rgba(var(--line),.3);background:transparent;',
            'font-family:inherit;font-size:clamp(12px,3.4vw,13.5px);color:var(--ink-2);',
            'cursor:pointer;-webkit-tap-highlight-color:transparent;',
            'transition:transform .16s ease-out,background-color .18s ease-out;}',
            '.删人钮:active{transform:scale(.96);}',
            '.删人钮.危{border-color:rgba(var(--accent-rgb),.5);',
            'background:rgba(var(--accent-rgb),.14);color:var(--accent-ink);font-weight:600;}',
        ].join('');
        全局.document.head.appendChild(样);
    }

    /* ============================================================
     * 7. 对外：挂 window + 自举
     * ============================================================ */
    const 接口 = {
        扫键: 扫键,
        /* ★ 删会话 与 删联系人 是两个功能 */
        清会话: 清会话,
        复活会话: 复活会话,
        /* 「已删会话」名单：1 页靠它抹掉写死的会话行 */
        已删键: 已删键,
        读已删: 读已删,
        记已删: 记已删,
        是已删: 是已删,
        清联系人: 清联系人,
        清群: 清群,
        确认: 确认,
        绑长按: 绑长按,
        长按阈值: 长按阈值,
        读表: 读表,
        写: 写,
        删键: 删键,
    };
    全局.联系人删除 = 接口;

    function 起() {
        注入样式();
        初始化();
    }
    if (全局.document.readyState === 'loading') {
        全局.document.addEventListener('DOMContentLoaded', 起);
    } else {
        起();
    }
})(typeof window !== 'undefined' ? window : this);
