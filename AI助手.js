/**
 * AI助手.js —— 文本 API 的统一调用层
 *
 * ★★ 现状澄清（2026-09 核对，别再按旧注释理解）
 *     本模块目前【只有 19 页自己在用】：19 页内联了它，并调用 拉模型() 读模型列表。
 *     7 页聊天与 5 页动态【并没有】接入 —— 实测两页去注释后 0 次引用 AI助手，
 *     它们的回复走的是本地逻辑：7 页读「联系人小字文案 + 角色档案口头禅」，
 *     5 页用内置文案。这是有意的设计（离线可用、行为可测），不是漏接。
 *
 *   ★ 旧注释写着「7 页聊天 / 5 页动态共用」「用 同步AI助手.py 内联进两个页面」，
 *     那是规划期的设想，从未落地 —— 连 同步AI助手.py 这个文件都不存在。
 *     ★★ 所以：配了「文本API配置」之后，7 页聊天【不会】改用模型回复。
 *        若要真接入，是功能变更，需要改 7 页的回复链路，不是改注释就能生效。
 *
 * ★★ 为什么要单独抽一个文件
 *     调用层只有一份，避免多处各写一遍 fetch 后立刻漂移
 *     （地址规范化、超时、返回结构、错误分级）。
 *     这里只写一份，内联进需要的页面 —— 与「全局音乐.js」同一套做法：
 *     页面运行时【不依赖】外部文件，单拷 html 也能跑。
 *
 * ★★ 配置从哪来
 *     读 localStorage「文本API配置」（19_wenbenAPI 写入）：
 *       { 网址, 密钥, 模型, 模型列表 }
 *     没配 / 没选模型 → 所有调用返回 { 好:false, 原因:'未配置' }。
 *
 * ★★ 地址规范化（各家域名不一样，不能让用户自己猜后缀）
 *     https://api.openai.com      → /v1/chat/completions
 *     https://api.openai.com/v1   → /chat/completions
 *     https://x.com/v1/（多斜杠） → /chat/completions
 *     api.openai.com（缺协议）    → 补 https://
 *     主选 404 → 自动试另一种拼法，两次都失败才报错
 *
 * ★★ 错误要说清是哪一步（不能只说「失败」）
 *     401/403 → 密钥不对；404 → 地址不对（已试过两种拼法）
 *     fetch reject → 多半跨域被拦或网络不通（浏览器里最常见）
 *     超时 → 主动 abort
 *
 * ★ 安全：密钥只在本机 localStorage，只发给【用户自己填的那个地址】，
 *     本文件不做任何上传到第三方的事。
 */
(function (global) {
    'use strict';

    const 配置键 = '文本API配置';
    const 默认超时 = 20000;

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

    /**
     * 拼出聊天接口的两个候选地址。
     * 已带 /v1 的就只补 /chat/completions；没带的先试 /v1/...
     */
    function 候选地址(基) {
        const b = 规范化(基);
        if (!b) return [];
        return /\/v\d+[a-z]*$/i.test(b)
            ? [b + '/chat/completions']                                  // 已带版本
            : [b + '/v1/chat/completions', b + '/chat/completions'];     // 未带 → 两种都试
    }

    /**
     * 拼出模型列表接口的两个候选地址（与 候选地址 同款，只是端点换成 /models）。
     * 已带 /v1 的就只补 /models；没带的先试 /v1/models，再试 /models。
     */
    function 候选模型地址(基) {
        const b = 规范化(基);
        if (!b) return [];
        return /\/v\d+[a-z]*$/i.test(b)
            ? [b + '/models']
            : [b + '/v1/models', b + '/models'];
    }

    /**
     * 拉一次可用模型列表（GET /models）。
     * ★ 与 对话() 分开传网址与密钥 —— 填配置的那一步还没存盘，
     *   不能读存档，否则「改了地址但没保存」时会拿旧地址去试。
     *
     * @param {string} 网址
     * @param {string} 密钥
     * @param {object} 选项 { 超时 }
     * @returns {Promise<{好:boolean, 列表:Array<{id:string,名:string}>, 原因:string}>}
     */
    async function 拉模型(网址, 密钥, 选项) {
        const 选 = 选项 || {};
        if (!String(网址 || '').trim()) return { 好: false, 列表: [], 原因: '请先填接口地址' };
        if (!String(密钥 || '').trim()) return { 好: false, 列表: [], 原因: '请先填密钥' };

        const 地址表 = 候选模型地址(网址);
        const 超时 = 选.超时 || 默认超时;
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
                    if (响应.status === 404) continue;              // 后缀可能拼错，试下一个
                    if (响应.status === 401 || 响应.status === 403) {
                        return { 好: false, 列表: [], 原因: '密钥不对或没有权限（' + 响应.status + '）' };
                    }
                    return { 好: false, 列表: [], 原因: '接口返回 ' + 响应.status };
                }

                const 数据 = await 响应.json();
                const 列表 = 抽模型(数据);
                if (!列表.length) return { 好: false, 列表: [], 原因: '接口没返回可用模型' };
                return { 好: true, 列表: 列表, 原因: '' };

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

    /**
     * 各家 /models 返回结构不一样，统一成 [{id,名}]
     *   OpenAI：{ data: [{ id, ... }] }
     *   有的兼容层：{ data: ['gpt-4o', ...] }（纯字符串数组）
     *   还有的：{ models: [...] } 或直接是数组
     */
    function 抽模型(数据) {
        const 出 = [];
        const 收 = (v) => {
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
        /* 去重：同一个 id 只留一个（有的服务会重复列） */
        const 见 = new Set();
        return 出.filter(m => (见.has(m.id) ? false : (见.add(m.id), true)));
    }

    /* ---------- 取角色人设（system prompt 用） ---------- */
    /**
     * 按昵称找人设：先查「联系人索引」换 id，再读「好友信息_<id>」的 人物信息。
     * 找不到就返回空串 —— 调用方用通用人设兜底。
     */
    function 取人设(名) {
        if (!名) return '';
        try {
            const 索引 = JSON.parse(global.localStorage.getItem('联系人索引') || '[]');
            const 表 = Array.isArray(索引) ? 索引 : [];
            const 命中 = 表.find(i => i && (i.名称 === 名 || i.备注 === 名));
            const id = 命中 && 命中.id;
            if (!id) return '';
            const 档 = JSON.parse(global.localStorage.getItem('好友信息_' + id) || 'null');
            return (档 && 档.人物信息) ? String(档.人物信息) : '';
        } catch (e) { return ''; }
    }

    /* ---------- 核心：发一次对话请求 ---------- */
    /**
     * @param {string} 系统   system prompt（角色人设 + 玩法约束）
     * @param {Array}  对话   [{ role:'user'|'assistant', content }]
     * @param {object} 选项   { 超时, 温度, 最大字数 }
     * @returns {Promise<{好:boolean, 文:string, 原因:string}>}
     */
    async function 对话(系统, 对话表, 选项) {
        const 选 = 选项 || {};
        const 配置 = 读配置();
        if (!配置 || !配置.网址 || !配置.密钥 || !配置.模型) {
            return { 好: false, 文: '', 原因: '未配置' };
        }

        const 地址表 = 候选地址(配置.网址);
        if (!地址表.length) return { 好: false, 文: '', 原因: '接口地址为空' };

        const 超时 = 选.超时 || 默认超时;
        let 最后状态 = 0;

        for (const url of 地址表) {
            const 控制器 = new AbortController();
            const 计时 = setTimeout(() => 控制器.abort(), 超时);
            try {
                const 响应 = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + 配置.密钥,
                    },
                    body: JSON.stringify({
                        model: 配置.模型,
                        messages: [{ role: 'system', content: 系统 }].concat(对话表 || []),
                        temperature: typeof 选.温度 === 'number' ? 选.温度 : 0.9,
                        max_tokens: 选.最大字数 || 300,
                    }),
                    signal: 控制器.signal,
                });
                clearTimeout(计时);

                if (!响应.ok) {
                    最后状态 = 响应.status;
                    /* 404 可能是后缀拼错 → 试下一个候选；其余直接定错 */
                    if (响应.status === 404) continue;
                    if (响应.status === 401 || 响应.status === 403) {
                        return { 好: false, 文: '', 原因: '密钥不对或没有权限（' + 响应.status + '）' };
                    }
                    return { 好: false, 文: '', 原因: '接口返回 ' + 响应.status };
                }

                const 数据 = await 响应.json();
                const 文 = 抽文本(数据);
                if (!文) return { 好: false, 文: '', 原因: '接口没返回内容' };
                return { 好: true, 文: 文, 原因: '' };

            } catch (e) {
                clearTimeout(计时);
                if (e && e.name === 'AbortError') {
                    return { 好: false, 文: '', 原因: '请求超时（' + Math.round(超时 / 1000) + ' 秒）' };
                }
                /* 网络层失败：换下一个候选还失败，就归因为跨域/不通 */
                最后状态 = 最后状态 || -1;
            }
        }

        if (最后状态 === 404) {
            return { 好: false, 文: '', 原因: '接口地址不对（已试过两种拼法，都 404）' };
        }
        return { 好: false, 文: '', 原因: '请求发不出去，多半是跨域被拦或网络不通' };
    }

    /** 各家返回结构不一样（OpenAI / 兼容层），统一抽文本 */
    function 抽文本(数据) {
        try {
            const 首 = 数据 && 数据.choices && 数据.choices[0];
            if (!首) return '';
            if (首.message && typeof 首.message.content === 'string') return 首.message.content.trim();
            if (typeof 首.text === 'string') return 首.text.trim();
            if (typeof 数据.content === 'string') return 数据.content.trim();
        } catch (e) {}
        return '';
    }

    /** 模型有时候会自带引号 / 前缀说明，去掉再落地 */
    function 洗净(文) {
        return String(文 || '')
            .replace(/^\s*(?:["“”「『]|回复[:：]|【[^】]*】)+\s*/, '')
            .replace(/\s+$/, '')
            .trim();
    }

    /* ---------- 对外 ---------- */
    global.AI助手 = {
        读配置: 读配置,
        已配置: 已配置,
        规范化: 规范化,
        候选地址: 候选地址,
        候选模型地址: 候选模型地址,
        拉模型: 拉模型,
        取人设: 取人设,
        对话: 对话,
        洗净: 洗净,
    };
})(typeof window !== 'undefined' ? window : this);
    
