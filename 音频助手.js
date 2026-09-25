/**
 * 音频助手.js —— 语音合成（TTS）的统一调用层
 *
 * ★★ 与 AI助手.js / 图片助手.js 同一套思路：
 *     7 页（聊天里角色发语音）与 14 页（语音通话出声）都要调 TTS，
 *     两边各写一遍 fetch 会立刻漂移（地址规范化、超时、返回结构、错误分级）。
 *     这里只写一份，用 同步音频助手.py 内联进几个页面 ——
 *     页面运行时【不依赖】外部文件，单拷 html 也能跑。
 *
 * ★★ 配置从哪来
 *     读 localStorage「音频API配置」（21_yinpinAPI 写入）：
 *       { 网址, 密钥, 模型, 模型列表, 时间 }
 *     ★★ 21 页【只管凭据与模型】：网址 / 密钥 / 模型（tts-1 这类合成模型）。
 *        音色（voice）与音速 / 语调 / 语言 / 性别 全部归 3 页 per-contact 管 ——
 *        21 页不再存「音色 / 音色列表」两个字段。
 *     没配 / 没选模型 → 所有调用返回 { 好:false, 原因:'未配置' }，
 *     ★ 由调用方决定降级：7 页退成普通文字回复（语音没有「占位」这回事 ——
 *       一段静音只会让人以为手机坏了，比不发更糟）。
 *
 * ★★ 音色从哪来（三级，由 取音色() 统一算）
 *     ① 联系人在 3 页填了「自定义音色 ID」→ 用他的（克隆音色，优先级最高）
 *     ② 没填 → 用这位联系人在 3 页「默认音色」下拉里选的那个（存在分桶键里）
 *     ③ 都没有（压根没配过）→ 退回内置兜底 'alloy'
 *     ★ per-contact，不再是全站一个默认 —— 每个联系人可以有自己的声音。
 *
 * ★★ 地址规范化（各家 TTS 端点不一样，不能让用户自己猜后缀）
 *     https://api.openai.com      → /v1/audio/speech
 *     https://api.openai.com/v1   → /audio/speech
 *     https://x.com/v1/（多斜杠） → /audio/speech
 *     api.openai.com（缺协议）    → 补 https://
 *     主选 404 → 自动试另一种拼法，两次都失败才报错
 *
 * ★★ 音色列表端点各家不统一（有的根本没有）
 *     /v1/audio/voices → /v1/voices → /v1/models 里挑 tts
 *     全读不到 → 退化到内置常见音色名表，并在界面上说明来源
 *
 * ★★ 返回的是二进制，不是 JSON
 *     ✓ 200 且 content-type 像音频 → 转 blob
 *     ✓ 200 但给的是 JSON → 多半是报错体，取 error.message 说清楚
 *     ✗ 401/403 → 密钥不对；404 → 地址不对（已试过两种拼法）
 *     ✗ 429 → 额度或限流；fetch reject → 跨域被拦或网络不通
 *     超时 → 主动 abort
 *
 * ★ 安全：密钥只在本机 localStorage，只发给【用户自己填的那个地址】，
 *     本文件不做任何上传到第三方的事。
 */
(function (global) {
    'use strict';

    const 配置键 = '音频API配置';
    const 默认超时 = 45000;   // ★ TTS 比聊天慢，但一般比生图快，取 45 秒

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
        return !!(c && c.网址 && c.密钥);
    }

    /* ---------- 地址规范化 ---------- */
    /** 补协议、去尾部斜杠 */
    function 规范化(原) {
        let s = String(原 || '').trim();
        if (!s) return '';
        if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
        return s.replace(/\/+$/, '');
    }

    function 已带版本(基) { return /\/v\d+[a-z]*$/i.test(基); }

    /** 拼出 TTS 端点的候选地址 */
    function 候选合成地址(基) {
        const b = 规范化(基);
        if (!b) return [];
        return 已带版本(b)
            ? [b + '/audio/speech']
            : [b + '/v1/audio/speech', b + '/audio/speech'];
    }

    /** 拼出音色列表端点的候选地址（多家不统一，全都试一遍） */
    function 候选音色地址(基) {
        const b = 规范化(基);
        if (!b) return [];
        const 后缀 = 已带版本(b) ? [''] : ['/v1', ''];
        const 表 = [];
        后缀.forEach(p => {
            表.push(b + p + '/audio/voices');
            表.push(b + p + '/voices');
        });
        return 表;
    }

    /** 拼出模型列表端点（作为音色列表的最后兜底） */
    function 候选模型地址(基) {
        const b = 规范化(基);
        if (!b) return [];
        return 已带版本(b) ? [b + '/models'] : [b + '/v1/models', b + '/models'];
    }

    /* ---------- 音色名过滤 ---------- */
    const 语音关键词 = ['tts', 'speech', 'voice', 'audio', 'kokoro', 'eleven', 'fish', 'azure', 'cosy'];
    const 非语音关键词 = ['embedding', 'rerank', 'moderation', 'whisper', 'transcribe', 'dall', 'image', 'vision'];

    function 挑语音模型(表) {
        const 入 = Array.isArray(表) ? 表 : [];
        const 留 = 入.filter(m => {
            const 名 = String((m && (m.id || m.名)) || '').toLowerCase();
            if (!名) return false;
            if (非语音关键词.some(k => 名.indexOf(k) >= 0)) return false;
            return 语音关键词.some(k => 名.indexOf(k) >= 0);
        });
        return 留.length ? 留 : [];
    }

    /** 内置兜底音色：读不到列表时用（OpenAI 官方那几个 + 几家常见的） */
    function 兜底音色() {
        return [
            { id: 'alloy', 名: 'alloy（中性 · 清晰）' },
            { id: 'echo', 名: 'echo（男声 · 沉稳）' },
            { id: 'fable', 名: 'fable（女声 · 轻柔）' },
            { id: 'onyx', 名: 'onyx（男声 · 低沉）' },
            { id: 'nova', 名: 'nova（女声 · 明亮）' },
            { id: 'shimmer', 名: 'shimmer（女声 · 温和）' },
        ];
    }

    /**
     * ★ 全站最后兜底音色：某位联系人【没配过任何音色】时用。
     *   21 页不再存默认音色（那会让所有联系人共用一个声音），
     *   所以这里需要一个"最后还有话说"的值 —— 取内置表第一个 alloy。
     *   ★ 各家服务不一定真有这个名字，但总比不传 voice 直接报错好。
     */
    function 兜底音色名() { return 兜底音色()[0].id; }

    /** 内置兜底模型：读不到 /models 时用（OpenAI / 兼容层常见的 TTS 模型） */
    function 兜底模型() {
        return [
            { id: 'tts-1', 名: 'tts-1（标准 · 快）' },
            { id: 'tts-1-hd', 名: 'tts-1-hd（高清 · 慢一点）' },
            { id: 'gpt-4o-mini-tts', 名: 'gpt-4o-mini-tts（可指令语气）' },
        ];
    }

    /**
     * 拉一次可用【模型】列表（tts-1 这类合成模型）。
     * ★ 与 拉音色() 是两件事：模型决定"用哪个引擎合成"，音色决定"用谁的声音"。
     *   21 页只选模型，3 页只选音色 —— 别混。
     *
     * @returns {Promise<{好:boolean, 列表:Array<{id,名}>, 原因:string, 来源:string}>}
     *          来源 = '接口' | '内置'
     */
    async function 拉模型(网址, 密钥, 选项) {
        const 选 = 选项 || {};
        if (!String(网址 || '').trim()) return { 好: false, 列表: [], 原因: '请先填接口地址', 来源: '' };
        if (!String(密钥 || '').trim()) return { 好: false, 列表: [], 原因: '请先填密钥', 来源: '' };

        const 超时 = 选.超时 || 默认超时;
        const 记录 = 选.记录;
        const 头 = { 'Authorization': 'Bearer ' + 密钥 };

        for (const url of 候选模型地址(网址)) {
            try {
                const r = await 带超时(url, 头, null, 超时, 记录);
                if (!r || !r.ok) continue;
                const j = await r.json().catch(() => null);
                const 原始 = (j && j.data) || (Array.isArray(j) ? j : null);
                if (!Array.isArray(原始) || !原始.length) continue;
                /* ★ 先挑像语音的（tts/speech/audio…），挑不出来就原样全列 ——
                     有的服务命名不按套路，全滤光了反而没法选。 */
                const 像 = 挑语音模型(原始);
                const 用 = 像.length ? 像 : 原始;
                const 列 = 用.map(m => ({
                    id: String((m && (m.id || m.名)) || '').trim(),
                    名: String((m && (m.id || m.名)) || '').trim(),
                })).filter(v => v.id);
                if (列.length) return { 好: true, 列表: 列, 原因: '', 来源: '接口' };
            } catch (e) { /* 换下一种拼法 */ }
        }

        return { 好: true, 列表: 兜底模型(), 原因: '没读到模型列表，下面是常见的语音合成模型', 来源: '内置' };
    }

    /* ---------- 请求小工具 ---------- */
    function 带超时(url, 头, 体, 超时, 记录) {
        const 控制器 = new (global.AbortController || function () {})();
        const 计时 = setTimeout(() => { if (控制器.abort) 控制器.abort(); }, 超时);
        if (记录 && 记录.push) 记录.push(String(url));
        return global.fetch(url, {
            method: 体 ? 'POST' : 'GET',
            headers: 头,
            body: 体 || undefined,
            signal: 控制器.signal,
        }).then(r => { clearTimeout(计时); return r; },
            e => { clearTimeout(计时); throw e; });
    }

    function 说错误(状态, 文本) {
        if (状态 === 401 || 状态 === 403) return '密钥不对或没有权限（' + 状态 + '）';
        if (状态 === 404) return '接口地址不对（已试过两种拼法，都 404）';
        if (状态 === 429) return '额度用完了或触发限流（429）';
        if (状态 === 400) return '请求被拒（400）：' + String(文本 || '').slice(0, 80);
        if (状态 >= 500) return '服务端出错（' + 状态 + '）';
        return '请求失败（' + 状态 + '）';
    }

    function 取错文(json) {
        try {
            const e = json && (json.error || json.message || json.detail);
            if (!e) return '';
            return typeof e === 'string' ? e : (e.message || String(e));
        } catch (err) { return ''; }
    }

    /**
     * 拉一次可用音色列表。
     * ★ 与 合成() 分开传网址与密钥 —— 填配置那一步还没存盘，
     *   不能读存档，否则「改了地址但没保存」时会拿旧地址去试。
     *
     * @returns {Promise<{好:boolean, 列表:Array<{id,名}>, 原因:string, 来源:string}>}
     *          来源 = '接口' | '内置' —— 界面上要如实说明，别让人以为主播真的有这些音色
     */
    async function 拉音色(网址, 密钥, 选项) {
        const 选 = 选项 || {};
        if (!String(网址 || '').trim()) return { 好: false, 列表: [], 原因: '请先填接口地址', 来源: '' };
        if (!String(密钥 || '').trim()) return { 好: false, 列表: [], 原因: '请先填密钥', 来源: '' };

        const 超时 = 选.超时 || 默认超时;
        const 记录 = 选.记录;
        const 头 = { 'Authorization': 'Bearer ' + 密钥 };

        /* ① 先试各家音色端点 */
        for (const url of 候选音色地址(网址)) {
            try {
                const r = await 带超时(url, 头, null, 超时, 记录);
                if (!r || !r.ok) continue;
                const j = await r.json().catch(() => null);
                const 原始 = (j && (j.voices || j.data || j.models)) || (Array.isArray(j) ? j : null);
                if (!Array.isArray(原始) || !原始.length) continue;
                const 列 = 原始.map(v => ({
                    id: String((v && (v.voice_id || v.id || v.name || v)) || '').trim(),
                    名: String((v && (v.name || v.显示名 || v.id || v)) || '').trim(),
                })).filter(v => v.id);
                if (列.length) return { 好: true, 列表: 列, 原因: '', 来源: '接口' };
            } catch (e) { /* 换下一个端点 */ }
        }

        /* ② 再试 /models，把像语音的挑出来 */
        for (const url of 候选模型地址(网址)) {
            try {
                const r = await 带超时(url, 头, null, 超时, 记录);
                if (!r || !r.ok) continue;
                const j = await r.json().catch(() => null);
                const 原始 = (j && j.data) || (Array.isArray(j) ? j : null);
                if (!Array.isArray(原始)) continue;
                const 列 = 挑语音模型(原始).map(m => ({
                    id: String(m.id || m.名 || ''),
                    名: String(m.id || m.名 || ''),
                })).filter(v => v.id);
                if (列.length) return { 好: true, 列表: 列, 原因: '', 来源: '接口' };
            } catch (e) { /* 换下一个 */ }
        }

        /* ③ 全读不到 → 内置表兜底（至少还能选，不至于卡死） */
        return { 好: true, 列表: 兜底音色(), 原因: '没读到音色列表，下面是常见音色名', 来源: '内置' };
    }

    /**
     * 合成一段语音。
     * @param {string} 文 要念的话
     * @param {object} 选项 { 音色, 网址, 密钥, 音速, 超时, 记录 }
     * @returns {Promise<{好:boolean, blob:Blob|null, 类型:string, 原因:string}>}
     */
    async function 合成(文, 选项) {
        const 选 = 选项 || {};
        const 配置 = 读配置();
        const 网址 = 选.网址 || (配置 && 配置.网址) || '';
        const 密钥 = 选.密钥 || (配置 && 配置.密钥) || '';
        const 音色 = 选.音色 || (配置 && 配置.音色) || 兜底音色名();

        if (!网址 || !密钥) return { 好: false, blob: null, 类型: '', 原因: '未配置' };
        const 内容 = String(文 || '').trim();
        if (!内容) return { 好: false, blob: null, 类型: '', 原因: '没有要念的内容' };
        if (!音色) return { 好: false, blob: null, 类型: '', 原因: '还没选音色' };

        const 地址表 = 候选合成地址(网址);
        if (!地址表.length) return { 好: false, blob: null, 类型: '', 原因: '接口地址为空' };

        const 超时 = 选.超时 || 默认超时;
        const 记录 = 选.记录;
        const 头 = {
            'Authorization': 'Bearer ' + 密钥,
            'Content-Type': 'application/json',
        };

        /* ★★ 3 页的语音参数全部作用到这里（原先只有音速生效，调语调/语言/性别没反应）
             各家字段名不统一，所以同一个语义按常见写法都传一份：
               · 语调 pitch / tone / intonation
               · 语言 language / lang
               · 性别 gender / voice_gender
             ★ 只传【用户真的改过的】（不等于默认值才传）——
               全字段硬塞上去，遇到校验严的服务会直接 400，
               默认参数的服务端本来就有，不传更安全。 */
        const 音速 = (typeof 选.音速 === 'number' && 选.音速 !== 1) ? 选.音速 : 0;
        const 语调 = (typeof 选.语调 === 'number' && 选.语调 !== 1) ? 选.语调 : 0;
        const 语言 = String(选.语言 || '').trim();
        const 性别 = String(选.性别 || '').trim();

        const 体 = JSON.stringify({
            model: 选.模型 || (配置 && 配置.模型) || 'tts-1',
            input: 内容,
            voice: 音色,
            ...(音速 ? { speed: 音速 } : {}),
            ...(语调 ? { pitch: 语调, tone: 语调, intonation: 语调 } : {}),
            ...(语言 ? { language: 语言, lang: 语言 } : {}),
            ...(性别 ? { gender: 性别, voice_gender: 性别 } : {}),
            response_format: 'mp3',
        });

        let 最后原因 = '请求失败';
        for (const url of 地址表) {
            try {
                const r = await 带超时(url, 头, 体, 超时, 记录);
                if (!r) { 最后原因 = '请求发不出去'; continue; }

                if (!r.ok) {
                    const t = await r.text().catch(() => '');
                    let j = null;
                    try { j = JSON.parse(t); } catch (e) {}
                    最后原因 = 说错误(r.status, 取错文(j) || t);
                    continue;                       // 404 的话换下一种拼法再试
                }

                const 型 = String((r.headers && r.headers.get && r.headers.get('content-type')) || '');
                if (/json/i.test(型)) {
                    /* 200 但给了 JSON —— 多半是报错体 */
                    const j = await r.json().catch(() => null);
                    return { 好: false, blob: null, 类型: '', 原因: 取错文(j) || '接口返回的不是音频' };
                }

                const blob = await r.blob().catch(() => null);
                if (!blob || !blob.size) { 最后原因 = '接口返回了空音频'; continue; }
                return {
                    好: true,
                    blob: blob,
                    类型: /wav/i.test(型) ? 'audio/wav' : 'audio/mpeg',
                    原因: '',
                };
            } catch (e) {
                最后原因 = (e && e.name === 'AbortError') ? '合成超时（' + Math.round(超时 / 1000) + ' 秒）'
                    : '请求发不出去，多半是跨域被拦或网络不通';
            }
        }
        return { 好: false, blob: null, 类型: '', 原因: 最后原因 };
    }

    /**
     * 取某位联系人的音色配置（3 页写的分桶键）。
     * ★ 音色优先级是业务规则，放在这里统一算，7 页与 14 页才不会各写一套：
     *     ① 联系人填了「自定义音色 ID」（克隆音色）→ 用他的
     *     ② 没填 → 用这位联系人在 3 页默认音色下拉里选的那个
     *     ③ 都没配过 → 内置兜底 alloy（21 页不再存全站默认音色）
     *   ★ 语音参数（音速 / 语调 / 语言 / 性别）也从分桶里带出来 ——
     *     这些是 3 页 per-contact 调的，7 / 14 页不该自己再拼一份。
     */
    function 取音色(联系人ID, 选项) {
        const 选 = 选项 || {};
        let 分桶 = null;
        try {
            const v = JSON.parse(global.localStorage.getItem('音色配置_' + 联系人ID) || 'null');
            if (v && typeof v === 'object') 分桶 = v;
        } catch (e) {}

        const 自定 = String((分桶 && 分桶.自定义ID) || '').trim();
        const 配置 = 读配置();

        /* 联系人没启用自己的音色配置 → 退回内置兜底，不用他的克隆音色 */
        const 用分桶 = !!(分桶 && 分桶.已启用 && (自定 || 分桶.音色));
        const 音色 = 用分桶 ? (自定 || String(分桶.音色 || '').trim()) : 兜底音色名();

        /* ★ 来源要说准：只有【填了克隆 ID】才算克隆；
             分桶里的「音色」是这位联系人在 3 页从默认列表里选的，
             标成「克隆」会误导（看着像用了一个不存在的克隆音色）。
             ★ 这个字段只用于展示与排查，7 / 14 页只认 有 与 音色。 */
        const 来源 = (用分桶 && 自定) ? '克隆' : (用分桶 ? '联系人' : '默认');

        return {
            有: !!音色,
            音色: 音色,
            来源: 来源,
            音速: (分桶 && typeof 分桶.音速 === 'number') ? 分桶.音速 : 1,
            /* ★★ 下面三个原先【存了但没用】—— 用户在 3 页调了语调 / 语言 / 性别，
                 合成时压根没传，等于白调。现在一并返回给调用方。 */
            语调: (分桶 && typeof 分桶.语调 === 'number') ? 分桶.语调 : 1,
            语言: String((分桶 && 分桶.语言) || '').trim(),
            性别: String((分桶 && 分桶.性别) || '').trim(),
            已启用: (分桶 && typeof 分桶.已启用 === 'boolean') ? 分桶.已启用 : false,
            配置: 配置,
        };
    }

    /* ---------- 对外 ---------- */
    global.音频助手 = {
        读配置: 读配置,
        已配置: 已配置,
        规范化: 规范化,
        候选合成地址: 候选合成地址,
        候选音色地址: 候选音色地址,
        候选模型地址: 候选模型地址,
        挑语音模型: 挑语音模型,
        兜底音色: 兜底音色,
        兜底音色名: 兜底音色名,
        兜底模型: 兜底模型,
        拉音色: 拉音色,
        拉模型: 拉模型,
        合成: 合成,
        取音色: 取音色,
    };
})(typeof window !== 'undefined' ? window : this);
