/**
 * 图片助手.js —— 图片 API 的统一调用层（7 页聊天生图 / 5 页角色发图片动态共用）
 *
 * ★★ 与 AI助手.js 同一套思路：
 *     7 页（聊天里发图）与 5 页（角色发图片朋友圈）都要调生图接口，
 *     两边各写一遍 fetch 会立刻漂移（地址规范化、超时、返回结构、错误分级）。
 *     这里只写一份，用 同步图片助手.py 内联进几个页面 ——
 *     页面运行时【不依赖】外部文件，单拷 html 也能跑。
 *
 * ★★ 配置从哪来
 *     读 localStorage「图片API配置」（20_tupianAPI 写入）：
 *       { 网址, 密钥, 模型, 模型列表, 尺寸, 时间 }
 *     没配 / 没选模型 → 所有调用返回 { 好:false, 原因:'未配置' }，
 *     由调用方决定降级（7 页提示去配置，5 页退回纯文字动态）。
 *
 * ★★ 地址规范化（各家生图端点不一样，不能让用户自己猜后缀）
 *     https://api.openai.com      → /v1/images/generations
 *     https://api.openai.com/v1   → /images/generations
 *     https://x.com/v1/（多斜杠） → /images/generations
 *     api.openai.com（缺协议）    → 补 https://
 *     主选 404 → 自动试另一种拼法，两次都失败才报错
 *
 * ★★ 模型列表端点
 *     与文本同款：GET /models。但生图服务常常把「聊天模型」也一起列出来
 *     （几十上百个，全是文本模型），全列给用户选等于没法选 ——
 *     所以这里做一次过滤：命中常见生图关键词的优先，命中纯文本关键词的排除。
 *     过滤完如果为空（说明这家命名不按套路），就原样返回，让用户自己挑。
 *
 * ★★ 返回结构各家不一样（OpenAI / 兼容层 / 有的直接给 url）
 *     { data: [{ url }] }                    → 直接是图片链接
 *     { data: [{ b64_json }] }               → base64，自己拼 dataURL
 *     { data: [{ base64 }] } / { images:[..] }
 *     { url } / { image } / { output: [...] }
 *
 * ★★ 错误要说清是哪一步（不能只说「失败」）
 *     401/403 → 密钥不对；404 → 地址不对（已试过两种拼法）
 *     429 → 额度或限流；fetch reject → 多半跨域被拦或网络不通
 *     超时 → 主动 abort
 *
 * ★ 安全：密钥只在本机 localStorage，只发给【用户自己填的那个地址】，
 *     本文件不做任何上传到第三方的事。
 */
(function (global) {
    'use strict';

    const 配置键 = '图片API配置';
    const 默认超时 = 60000;   // ★ 生图比聊天慢得多，超时给到 60 秒

    /* ---------- 存档 ---------- */
    function 读配置() {
        try {
            const v = JSON.parse(global.localStorage.getItem(配置键) || 'null');
            return v && typeof v === 'object' ? v : null;
        } catch (e) { return null; }
    }

    /** 是否可用（没配就别发请求，省得每次都等超时） */
    function 已配置() {
        const c = 读配置();
        return !!(c && c.网址 && c.密钥 && c.模型);
    }

    /* ---------- 地址规范化 ---------- */
    /** 补协议、去尾部斜杠 */
    function 规范化(原) {
        let s = String(原 || '').trim();
        if (!s) return '';
        if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
        return s.replace(/\/+$/, '');
    }

    /** 生图端点的候选地址 */
    function 候选生图地址(基) {
        const b = 规范化(基);
        if (!b) return [];
        return /\/v\d+[a-z]*$/i.test(b)
            ? [b + '/images/generations']                                       // 已带版本
            : [b + '/v1/images/generations', b + '/images/generations'];        // 未带 → 两种都试
    }

    /** 模型列表端点（与 AI助手 同款） */
    function 候选模型地址(基) {
        const b = 规范化(基);
        if (!b) return [];
        return /\/v\d+[a-z]*$/i.test(b)
            ? [b + '/models']
            : [b + '/v1/models', b + '/models'];
    }

    /* ---------- 模型名过滤：把生图模型挑出来 ---------- */
    /* 命中这些的【优先】当生图模型（各家命名不同，只能按关键词） */
    const 生图关键词 = [
        'image', 'dall', 'flux', 'sdxl', 'stable', 'midjourney', 'mj',
        'draw', 'paint', 'art', 'picture', 'pic', 'poster', 'vision-gen',
        'seedream', 'kolors', 'wanx', 'hunyuan-image', 'cogview',
    ];
    /* 命中这些的【排除】—— 它们是纯文本模型，不会生图 */
    const 文本关键词 = [
        'gpt', 'chat', 'claude', 'llama', 'qwen', 'glm', 'deepseek',
        'text', 'instruct', 'embedding', 'rerank', 'whisper', 'tts', 'audio',
        'moderation', 'babbage', 'davinci', 'turbo',
    ];

    /**
     * 从模型表里挑出生图模型。
     * ★ 挑完为空就原样返回 —— 宁可让用户自己挑，也不能把列表清空变成「读不到」。
     */
    function 挑生图模型(表) {
        const 全 = Array.isArray(表) ? 表 : [];
        if (!全.length) return [];

        const 像 = 全.filter(m => {
            const 名 = String((m && (m.id || m.名)) || '').toLowerCase();
            if (!名) return false;
            /* ★★ 生图词优先：像 gpt-image-1 这种【既带 gpt 又带 image】的，
                 一次判断定生死 —— 命中生图词就直接留下，再走到「排文本词」那步
                 会把它误杀（gpt 前缀）。所以两个判断必须合并在一次遍历里。 */
            if (生图关键词.some(k => 名.indexOf(k) >= 0)) return true;
            /* 没命中生图词、但明确是纯文本的 → 排掉 */
            return !文本关键词.some(k => 名.indexOf(k) >= 0);
        });

        return 像.length ? 像 : 全;
    }

    /* ---------- 拉模型列表 ---------- */
    async function 拉模型(网址, 密钥, 选项) {
        const 选 = 选项 || {};
        if (!String(网址 || '').trim()) return { 好: false, 列表: [], 原因: '请先填接口地址' };
        if (!String(密钥 || '').trim()) return { 好: false, 列表: [], 原因: '请先填密钥' };

        const 地址表 = 候选模型地址(网址);
        const 超时 = 选.超时 || 15000;
        let 最后状态 = 0;

        for (const url of 地址表) {
            const 控制器 = new AbortController();
            const 计时 = setTimeout(() => 控制器.abort(), 超时);
            try {
                const 响应 = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + String(密钥 || '').trim(),
                        'Content-Type': 'application/json',
                    },
                    signal: 控制器.signal,
                });
                clearTimeout(计时);

                if (!响应.ok) {
                    最后状态 = 响应.status;
                    if (响应.status === 404) continue;
                    if (响应.status === 401 || 响应.status === 403) {
                        return { 好: false, 列表: [], 原因: '密钥不对或没有权限（' + 响应.status + '）' };
                    }
                    if (响应.status === 429) {
                        return { 好: false, 列表: [], 原因: '额度用完了或触发限流（429）' };
                    }
                    return { 好: false, 列表: [], 原因: '接口返回 ' + 响应.status };
                }

                const 数据 = await 响应.json();
                const 全 = 抽模型(数据);
                if (!全.length) return { 好: false, 列表: [], 原因: '接口没返回可用模型' };
                /* ★ 只把【像生图的】列在前面，全量放在 全部 里备查 */
                const 像 = 挑生图模型(全);
                return {
                    好: true,
                    列表: 像,
                    全部: 全,
                    过滤掉: 全.length - 像.length,
                    原因: '',
                };

            } catch (e) {
                clearTimeout(计时);
                if (e && e.name === 'AbortError') {
                    return { 好: false, 列表: [], 原因: '请求超时（' + Math.round(超时 / 1000) + ' 秒）' };
                }
                最后状态 = 最后状态 || -1;
            }
        }

        if (最后状态 === 404) {
            return { 好: false, 列表: [], 原因: '接口地址不对（已试过两种拼法，都 404）' };
        }
        return { 好: false, 列表: [], 原因: '请求发不出去，多半是跨域被拦或网络不通' };
    }

    /** 各家 /models 返回结构不一样，统一成 [{id,名}] */
    function 抽模型(数据) {
        const 出 = [];
        const 收 = v => {
            if (!v) return;
            if (typeof v === 'string') { if (v.trim()) 出.push({ id: v.trim(), 名: v.trim() }); return; }
            if (typeof v === 'object') {
                const id = String(v.id || v.name || v.model || '').trim();
                if (id) 出.push({ id: id, 名: String(v.名 || v.display_name || v.id || id).trim() });
            }
        };
        try {
            const 原 = Array.isArray(数据) ? 数据
                : Array.isArray(数据 && 数据.data) ? 数据.data
                : Array.isArray(数据 && 数据.models) ? 数据.models
                : [];
            原.forEach(收);
        } catch (e) {}
        const 见 = new Set();
        return 出.filter(m => (见.has(m.id) ? false : (见.add(m.id), true)));
    }

    /* ---------- 核心：生一张图 ---------- */
    /**
     * @param {string} 描述   画面描述（英文一般效果更好，但中文也能用）
     * @param {object} 选项   { 超时, 尺寸, 数量, 反向 }
     * @returns {Promise<{好:boolean, 网址:string, 数据:string, 原因:string}>}
     *          网址 = 接口直接返回的图片链接；数据 = base64（已拼好 dataURL 前缀）
     */
    async function 生图(描述, 选项) {
        const 选 = 选项 || {};
        const 配置 = 读配置();
        if (!配置 || !配置.网址 || !配置.密钥 || !配置.模型) {
            return { 好: false, 网址: '', 数据: '', 原因: '未配置' };
        }

        const 文 = String(描述 || '').trim();
        if (!文) return { 好: false, 网址: '', 数据: '', 原因: '还没写画面描述' };

        const 地址表 = 候选生图地址(配置.网址);
        if (!地址表.length) return { 好: false, 网址: '', 数据: '', 原因: '接口地址为空' };

        const 超时 = 选.超时 || 默认超时;
        let 最后状态 = 0;

        for (const url of 地址表) {
            const 控制器 = new AbortController();
            const 计时 = setTimeout(() => 控制器.abort(), 超时);
            try {
                const 体 = {
                    model: 配置.模型,
                    prompt: 文,
                    n: 选.数量 || 1,
                };
                /* 尺寸各家字段名不同：OpenAI 用 size，有的用 size / aspect_ratio */
                const 尺寸 = 选.尺寸 || 配置.尺寸 || '1024x1024';
                if (尺寸) 体.size = 尺寸;
                if (选.反向) 体.negative_prompt = 选.反向;

                /* 有的服务要 response_format 才给 base64，统一不传：
                   给了 url 就用 url，给了 base64 就用 base64，两种都能接。 */

                const 响应 = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + 配置.密钥,
                    },
                    body: JSON.stringify(体),
                    signal: 控制器.signal,
                });
                clearTimeout(计时);

                if (!响应.ok) {
                    最后状态 = 响应.status;
                    if (响应.status === 404) continue;
                    if (响应.status === 401 || 响应.status === 403) {
                        return { 好: false, 网址: '', 数据: '', 原因: '密钥不对或没有权限（' + 响应.status + '）' };
                    }
                    if (响应.status === 429) {
                        return { 好: false, 网址: '', 数据: '', 原因: '额度用完了或触发限流（429）' };
                    }
                    return { 好: false, 网址: '', 数据: '', 原因: '接口返回 ' + 响应.status };
                }

                const 数据 = await 响应.json();
                const 图 = 抽图(数据);
                if (!图.网址 && !图.数据) {
                    return { 好: false, 网址: '', 数据: '', 原因: '接口没返回图片' };
                }
                return { 好: true, 网址: 图.网址, 数据: 图.数据, 原因: '' };

            } catch (e) {
                clearTimeout(计时);
                if (e && e.name === 'AbortError') {
                    return { 好: false, 网址: '', 数据: '', 原因: '请求超时（' + Math.round(超时 / 1000) + ' 秒）' };
                }
                最后状态 = 最后状态 || -1;
            }
        }

        if (最后状态 === 404) {
            return { 好: false, 网址: '', 数据: '', 原因: '接口地址不对（已试过两种拼法，都 404）' };
        }
        return { 好: false, 网址: '', 数据: '', 原因: '请求发不出去，多半是跨域被拦或网络不通' };
    }

    /**
     * 各家返回结构不一样，统一抽成 { 网址, 数据 }
     *   数据 已拼好 dataURL 前缀（image/png），可直接塞进 img.src
     */
    function 抽图(数据) {
        const 空 = { 网址: '', 数据: '' };
        if (!数据) return 空;

        try {
            /* 候选：data 数组 → 第一个元素 */
            const 表 = Array.isArray(数据.data) ? 数据.data
                : Array.isArray(数据.images) ? 数据.images
                : Array.isArray(数据.output) ? 数据.output
                : Array.isArray(数据.results) ? 数据.results
                : null;

            let 项 = null;
            if (表 && 表.length) 项 = 表[0];
            if (!项) 项 = 数据;

            if (项 && typeof 项 === 'object') {
                const url = 项.url || 项.image_url || 项.image || 项.href
                    || (项.image && 项.image.url) || '';
                if (typeof url === 'string' && url.trim()) return { 网址: url.trim(), 数据: '' };

                const b64 = 项.b64_json || 项.base64 || 项.b64
                    || (项.data && typeof 项.data === 'string' ? 项.data : '');
                if (typeof b64 === 'string' && b64.trim()) {
                    return { 网址: '', 数据: 拼dataURL(b64.trim()) };
                }
            }

            /* 顶层直接给字符串的情况 */
            if (typeof 数据.url === 'string' && 数据.url.trim()) {
                return { 网址: 数据.url.trim(), 数据: '' };
            }
            if (typeof 数据.image === 'string' && 数据.image.trim()) {
                const s = 数据.image.trim();
                return /^https?:\/\//i.test(s) ? { 网址: s, 数据: '' } : { 网址: '', 数据: 拼dataURL(s) };
            }
            if (typeof 数据.b64_json === 'string' && 数据.b64_json.trim()) {
                return { 网址: '', 数据: 拼dataURL(数据.b64_json.trim()) };
            }
        } catch (e) {}
        return 空;
    }

    /** base64 → dataURL（没带前缀的补上，避免 img 显示成黑块） */
    function 拼dataURL(b64) {
        if (/^data:image\//i.test(b64)) return b64;
        return 'data:image/png;base64,' + b64;
    }

    /* ============================================================
     * 图片存档：IndexedDB
     *   ★★ 为什么不放 localStorage：它只有约 5MB，几张 base64 图就写满，
     *      写满之后【所有页面】的存档都会失败（连聊天记录都存不进去）——
     *      这是真会出事的。所以图片走 IndexedDB（与「音乐库」同款做法），
     *      聊天记录里只放一个图片 id 引用。
     *
     *   库名 '图片库' / 表名 '图片'，记录 { id, 数据, 网址, 描述, 时间 }
     * ============================================================ */
    const 库名 = '图片库';
    const 表名 = '图片';

    function 打开图片库() {
        return new Promise((完成, 失败) => {
            if (typeof global.indexedDB === 'undefined') return 失败(new Error('无 IndexedDB'));
            let 请求;
            try { 请求 = global.indexedDB.open(库名, 1); } catch (e) { return 失败(e); }
            请求.onupgradeneeded = () => {
                const db = 请求.result;
                if (!db.objectStoreNames.contains(表名)) db.createObjectStore(表名, { keyPath: 'id' });
            };
            请求.onsuccess = () => 完成(请求.result);
            请求.onerror = () => 失败(请求.error || new Error('打开失败'));
        });
    }

    function 跑图片事务(模式, 处理) {
        return 打开图片库().then(db => new Promise((完成, 失败) => {
            const 事务 = db.transaction(表名, 模式);
            const 结果 = 处理(事务.objectStore(表名));
            事务.oncomplete = () => 完成(结果 && 结果.result !== undefined ? 结果.result : null);
            事务.onerror = () => 失败(事务.error || new Error('事务失败'));
        }));
    }

    /**
     * 存一张图，返回它的 id。
     * ★ 只有 base64（数据）才需要存 —— 接口直接给链接的不用占库。
     * @returns {Promise<string>} '' 表示没存成（调用方退回直接用 网址）
     */
    function 存图(记录) {
        const id = (记录 && 记录.id) || ('img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
        return 跑图片事务('readwrite', 表 => 表.put(Object.assign({}, 记录, {
            id: id,
            时间: (记录 && 记录.时间) || Date.now(),
        }))).then(() => id).catch(() => '');
    }

    /** 按 id 读回一张图：{ id, 数据, 网址, 描述, 时间 } */
    function 读图(id) {
        if (!id) return Promise.resolve(null);
        return 跑图片事务('readonly', 表 => 表.get(id)).catch(() => null);
    }

    /** 一次读多张（聊天里可能连着好几张图） */
    function 读图组(id表) {
        const 表 = Array.isArray(id表) ? id表.filter(Boolean) : [];
        if (!表.length) return Promise.resolve([]);
        return Promise.all(表.map(读图)).then(r => r.filter(Boolean)).catch(() => []);
    }

    /* ---------- 对外 ---------- */
    global.图片助手 = {
        读配置: 读配置,
        已配置: 已配置,
        规范化: 规范化,
        候选生图地址: 候选生图地址,
        候选模型地址: 候选模型地址,
        挑生图模型: 挑生图模型,
        拉模型: 拉模型,
        生图: 生图,
        拼dataURL: 拼dataURL,
        /* 存档 */
        存图: 存图,
        读图: 读图,
        读图组: 读图组,
    };
})(typeof window !== 'undefined' ? window : this);
