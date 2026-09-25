/* =============================================================================
 * 备份.js —— 全站数据导出 / 读取恢复（★ 唯一源，改完跑 `node 同步备份.js`）
 *
 * 【备份范围】（漏一个恢复后就会缺资料，改动前先对一遍）
 *   ① localStorage 全量键 —— 联系人索引 / 好友信息_* / 好友头像_* / 音色配置_* /
 *      聊天记录_* / 我的动态 / 主题背景 / 轮播图_* / 寄语_* / 阅读_* / 已授权_* …
 *   ② IndexedDB 四个库：
 *      · 音乐库/音频      —— `数据` 字段是 File（用户上传的曲目）
 *      · 图片库/图片      —— 纯 JSON（base64 在 `数据` 字段里，不是 Blob）
 *      · 聊天语音库/语音  —— `blob` 字段是 Blob（录音 + TTS 语音条）
 *      · 阅读_书库/书     —— 纯 JSON（小说正文在 `章节[].正文`）
 *
 * 【为什么打成 ZIP 而不是 JSON】
 *   音乐 / 语音是二进制。塞进 JSON 必须 base64，体积直接涨 33%，
 *   几十兆的录音能撑爆字符串。所以走 ZIP 的 store 模式（只归档不压缩）：
 *   二进制原样存，文本条目单独存，manifest 里用 {"__二进制__":"路径"} 指过去。
 *   不压缩是刻意的 —— 音频图片本来就是压缩过的格式，再压白费 CPU，
 *   而且 store 模式解析简单，出错面小。
 *
 * 【零依赖】手写 ZIP（CRC32 + local header + central directory + EOCD），
 *   不引 JSZip —— 全站是离线单文件 H5，不能挂外链。
 *
 * 【文件夹自选】三条路，按可用性依次降级：
 *   ① APP 壳内：window.小喵叽原生 桥（系统文件选择器，真·任意目录）
 *   ② 支持的浏览器：File System Access API（showDirectoryPicker / showSaveFilePicker）
 *   ③ 兜底：a[download] 落到浏览器默认下载目录（iOS Safari / Firefox 走这条）
 *   读取同理：① 桥 ② showOpenFilePicker ③ input[type=file]
 *
 * ★ 任何一步失败都必须把原因抛给调用方显示出来，绝不静默成功。
 *   （历史坑：localStorage 超 5MB 时 setItem 抛 QuotaExceededError，
 *     吞掉异常会让用户以为恢复好了，实际资料缺了一半。）
 * ========================================================================== */
(function (全局) {
    'use strict';

    /* 备份文件格式版本：以后改结构就 +1，读取时按版本兼容 */
    const 格式版本 = 1;

    /* IndexedDB 已知库名。
       浏览器支持 indexedDB.databases() 时会与之取并集（用户可能有别的库），
       不支持的（Safari / Firefox）就只认这张表 —— 所以新增库必须登记在这里。 */
    const 已知库名 = ['音乐库', '图片库', '聊天语音库', '阅读_书库'];

    /* ZIP 单文件与总量的硬上限（32 位字段限制）。
       超了要提前报清楚，不能产出一个解压就报错的坏包。 */
    const 单文件上限 = 0xFFFFFFFF;      // 4GB - 1
    const 条目数上限 = 0xFFFF;          // 65535

    /* ======================================================================
     * 0. 小工具
     * ==================================================================== */

    const 编码器 = new TextEncoder();
    const 解码器 = new TextDecoder('utf-8');

    function 文本转字节(文) {
        return 编码器.encode(String(文 == null ? '' : 文));
    }

    /**
     * 是不是 Blob / File。
     * ★ 不用 instanceof：跨 realm（iframe、worker、测试里 Node 与 jsdom 两个全局）
     *   会判错。漏判的后果是二进制没被抽出来 → 恢复后音乐、语音全丢。
     */
    function 是Blob(值) {
        if (!值 || typeof 值 !== 'object') return false;
        if (typeof Blob !== 'undefined' && 值 instanceof Blob) return true;
        return typeof 值.arrayBuffer === 'function' && typeof 值.size === 'number'
            && typeof 值.type === 'string' && typeof 值.slice === 'function';
    }

    /** 是不是 File（Blob 且带文件名）。同样避开跨 realm 的 instanceof。 */
    function 是File(值) {
        return 是Blob(值) && typeof 值.name === 'string' && 值.name !== '';
    }

    /** Blob / File / ArrayBuffer / TypedArray / 字符串 统一成 Uint8Array
     *  ★ TypedArray 用 duck typing 判，不用 instanceof：跨 realm 时会失效。 */
    async function 转字节(值) {
        if (值 == null) throw new Error('数据为空，无法打包');
        if (typeof 值 === 'string') return 文本转字节(值);
        if (ArrayBuffer.isView(值)) {                    // Uint8Array 及其它 TypedArray / DataView
            const 视 = (值 instanceof DataView) ? new Uint8Array(值.buffer, 值.byteOffset, 值.byteLength) : 值;
            return new Uint8Array(视.buffer, 视.byteOffset, 视.byteLength);
        }
        if (值 instanceof ArrayBuffer || (值.constructor && 值.constructor.name === 'ArrayBuffer')) {
            return new Uint8Array(值);
        }
        if (是Blob(值)) return new Uint8Array(await 值.arrayBuffer());
        throw new Error('无法转成字节：' + Object.prototype.toString.call(值));
    }

    /* CRC32：ZIP 必需。用标准多项式 0xEDB88320 预生成 256 项查表，
       比逐位算快一个数量级 —— 几十兆录音也要逐字节过一遍。 */
    const CRC表 = (function () {
        const 表 = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            表[i] = c >>> 0;
        }
        return 表;
    })();

    function 算CRC(字节) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < 字节.length; i++) c = CRC表[(c ^ 字节[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    /* DOS 时间/日期：ZIP 头里的时间字段是这个古怪格式，
       位运算写错了某些解压工具会显示 1980 年，不影响数据但很难看。 */
    function dos时间(d) {
        return ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1F);
    }
    function dos日期(d) {
        return (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
    }

    function 读U16(视图, 位) { return 视图.getUint16(位, true); }
    function 读U32(视图, 位) { return 视图.getUint32(位, true); }
    function 写U16(视图, 位, 值) { 视图.setUint16(位, 值 & 0xFFFF, true); }
    function 写U32(视图, 位, 值) { 视图.setUint32(位, 值 >>> 0, true); }

    function 字节转Base64(字节) {
        /* 分块拼接：一次 String.fromCharCode(...大数组) 会爆调用栈 */
        let 串 = '';
        const 块 = 0x8000;
        for (let i = 0; i < 字节.length; i += 块) {
            串 += String.fromCharCode.apply(null, 字节.subarray(i, i + 块));
        }
        return btoa(串);
    }
    function base64转字节(串) {
        const 二 = atob(String(串 || ''));
        const 出 = new Uint8Array(二.length);
        for (let i = 0; i < 二.length; i++) 出[i] = 二.charCodeAt(i);
        return 出;
    }

    function 字节数文案(n) {
        const v = Number(n) || 0;
        if (v < 1024) return v + ' B';
        if (v < 1048576) return (v / 1024).toFixed(1) + ' KB';
        if (v < 1073741824) return (v / 1048576).toFixed(1) + ' MB';
        return (v / 1073741824).toFixed(2) + ' GB';
    }

    /* ======================================================================
     * 1. ZIP 打包（store 模式，不压缩）
     * ====================================================================
     * 条目：[{ 路径:'a/b.bin', 数据: Uint8Array|string|Blob }]
     * 用 Blob 数组拼接而不是先算总长开一个大 buffer —— 数据可能上百兆，
     * 一次性分配连续内存容易崩，Blob 是惰性拼接的。
     * ==================================================================== */

    async function 打包ZIP(条目表, 进度) {
        if (!Array.isArray(条目表) || !条目表.length) throw new Error('没有可打包的内容');
        if (条目表.length > 条目数上限) {
            throw new Error('条目数 ' + 条目表.length + ' 超过 ZIP 上限 ' + 条目数上限 + '，请分开备份');
        }

        const 部分 = [];                 // 最终 Blob 的各段
        const 中央项 = [];               // central directory 记录
        let 偏移 = 0;                    // 当前 local header 的绝对偏移
        let 已写字节 = 0;
        const 现在 = new Date();
        const 时 = dos时间(现在), 日 = dos日期(现在);
        const 报进度 = typeof 进度 === 'function' ? 进度 : function () {};

        for (let i = 0; i < 条目表.length; i++) {
            const 项 = 条目表[i];
            const 字节 = await 转字节(项.数据);
            if (字节.length > 单文件上限) {
                throw new Error('单个文件「' + 项.路径 + '」有 ' + 字节数文案(字节.length) +
                    '，超过 ZIP 4GB 上限，无法打包');
            }

            const 名字节 = 文本转字节(项.路径);
            const crc = 算CRC(字节);

            /* local file header：30 字节固定 + 文件名 */
            const 头 = new Uint8Array(30 + 名字节.length);
            const 头视 = new DataView(头.buffer);
            写U32(头视, 0, 0x04034b50);
            写U16(头视, 4, 20);            // version needed
            写U16(头视, 6, 0x0800);        // flags：bit11 = 文件名 UTF-8（中文路径必需）
            写U16(头视, 8, 0);             // compression：0 = store
            写U16(头视, 10, 时);
            写U16(头视, 12, 日);
            写U32(头视, 14, crc);
            写U32(头视, 18, 字节.length);  // compressed size（store 下等于原长）
            写U32(头视, 22, 字节.length);  // uncompressed size
            写U16(头视, 26, 名字节.length);
            写U16(头视, 28, 0);            // extra length
            头.set(名字节, 30);

            部分.push(头, 字节);
            中央项.push({ 名字节, crc, 长度: 字节.length, 偏移 });

            偏移 += 头.length + 字节.length;
            已写字节 += 字节.length;
            报进度(i + 1, 条目表.length, 已写字节);
        }

        /* central directory */
        let 中央长度 = 0;
        for (const c of 中央项) {
            const 块 = new Uint8Array(46 + c.名字节.length);
            const 视 = new DataView(块.buffer);
            写U32(视, 0, 0x02014b50);
            写U16(视, 4, 20);              // version made by
            写U16(视, 6, 20);              // version needed
            写U16(视, 8, 0x0800);          // flags：UTF-8
            写U16(视, 10, 0);              // compression
            写U16(视, 12, 时);
            写U16(视, 14, 日);
            写U32(视, 16, c.crc);
            写U32(视, 20, c.长度);
            写U32(视, 24, c.长度);
            写U16(视, 28, c.名字节.length);
            写U16(视, 30, 0);              // extra
            写U16(视, 32, 0);              // comment
            写U16(视, 34, 0);              // disk number start
            写U16(视, 36, 0);              // internal attrs
            写U32(视, 38, 0);              // external attrs
            写U32(视, 42, c.偏移);         // ★ local header 偏移
            块.set(c.名字节, 46);
            部分.push(块);
            中央长度 += 块.length;
        }

        /* end of central directory */
        const 尾 = new Uint8Array(22);
        const 尾视 = new DataView(尾.buffer);
        写U32(尾视, 0, 0x06054b50);
        写U16(尾视, 4, 0);
        写U16(尾视, 6, 0);
        写U16(尾视, 8, 中央项.length);
        写U16(尾视, 10, 中央项.length);
        写U32(尾视, 12, 中央长度);
        写U32(尾视, 16, 偏移);             // central directory 起始偏移
        写U16(尾视, 20, 0);                // comment length
        部分.push(尾);

        return new Blob(部分, { type: 'application/zip' });
    }

    /* ======================================================================
     * 2. ZIP 解析
     * ====================================================================
     * 从尾部往前找 EOCD 签名（后面可能跟注释，长度未知），
     * 再按 central directory 逐个定位。不扫 local header —— 那样遇到
     * 文件名里恰好出现签名会错位。
     * ==================================================================== */

    async function 解析ZIP(blob) {
        const 总长 = blob.size;
        if (总长 < 22) throw new Error('文件太小，不是有效的备份包');

        /* EOCD 最小 22 字节，注释最长 65535 → 最多回看 22+65535 */
        const 回看 = Math.min(总长, 22 + 0xFFFF);
        const 尾块 = new Uint8Array(await blob.slice(总长 - 回看, 总长).arrayBuffer());
        const 尾视 = new DataView(尾块.buffer);
        let 尾位 = -1;
        for (let i = 尾块.length - 22; i >= 0; i--) {
            if (读U32(尾视, i) === 0x06054b50) { 尾位 = i; break; }
        }
        if (尾位 < 0) throw new Error('找不到 ZIP 结尾标记，文件可能已损坏或不是备份包');

        const 条目数 = 读U16(尾视, 尾位 + 10);
        const 中央偏移 = 读U32(尾视, 尾位 + 16);

        /* EOCD 在文件里的绝对位置：尾块是从 (总长 - 回看) 处截出来的 */
        const 尾绝对位 = 总长 - 回看 + 尾位;
        if (中央偏移 + 46 > 总长) throw new Error('ZIP 目录偏移越界，文件可能已损坏');
        /* 中央目录从 中央偏移 一直到 EOCD 之前 */
        const 中央块 = new Uint8Array(await blob.slice(中央偏移, 尾绝对位).arrayBuffer());
        const 中央视 = new DataView(中央块.buffer);

        const 出 = new Map();
        let 位 = 0;
        for (let n = 0; n < 条目数; n++) {
            if (位 + 46 > 中央块.length) break;
            if (读U32(中央视, 位) !== 0x02014b50) break;   // 签名不对就停，别硬解
            const 压缩法 = 读U16(中央视, 位 + 10);
            const 原长 = 读U32(中央视, 位 + 24);
            const 名长 = 读U16(中央视, 位 + 28);
            const 附长 = 读U16(中央视, 位 + 30);
            const 注长 = 读U16(中央视, 位 + 32);
            const 本地位 = 读U32(中央视, 位 + 42);
            const 名 = 解码器.decode(中央块.subarray(位 + 46, 位 + 46 + 名长));
            出.set(名, { 压缩法, 原长, 本地位 });
            位 += 46 + 名长 + 附长 + 注长;
        }

        return {
            条目数: 出.size,
            有(路径) { return 出.has(路径); },
            路径表() { return Array.from(出.keys()); },
            /** 取一条的原始字节 */
            async 取字节(路径) {
                const 项 = 出.get(路径);
                if (!项) return null;
                if (项.压缩法 !== 0) {
                    throw new Error('备份包里的「' + 路径 + '」是压缩存储的，本工具只支持不压缩的备份包');
                }
                /* local header 的名字长/附加长要现读 —— 不能拿 central 里的值，
                   两者理论上可以不一致（附加字段常被改写）。 */
                const 头块 = new Uint8Array(await blob.slice(项.本地位, 项.本地位 + 30).arrayBuffer());
                const 头视 = new DataView(头块.buffer);
                if (读U32(头视, 0) !== 0x04034b50) throw new Error('「' + 路径 + '」的本地头损坏');
                const 名长 = 读U16(头视, 26);
                const 附长 = 读U16(头视, 28);
                const 起 = 项.本地位 + 30 + 名长 + 附长;
                return new Uint8Array(await blob.slice(起, 起 + 项.原长).arrayBuffer());
            },
            async 取文本(路径) {
                const b = await this.取字节(路径);
                return b == null ? null : 解码器.decode(b);
            },
            async 取JSON(路径) {
                const t = await this.取文本(路径);
                return t == null ? null : JSON.parse(t);
            },
            async 取Blob(路径, 类型) {
                const b = await this.取字节(路径);
                return b == null ? null : new Blob([b], { type: 类型 || 'application/octet-stream' });
            }
        };
    }

    /* ======================================================================
     * 3. 采集：localStorage + IndexedDB → ZIP 条目
     * ==================================================================== */

    /** localStorage 全量键。
     *  ★ 不能用 Object.keys(localStorage) —— Storage 是代理对象，
     *    某些 WebView 里枚举不出来，必须走 length + key(i)。（与 22 页 扫键() 同结论） */
    function 扫全部键() {
        const 出 = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k !== null) 出.push(k);
            }
        } catch (e) { /* 隐私模式下 localStorage 可能直接抛 */ }
        return 出;
    }

    function 读本地存储全量() {
        const 出 = {};
        for (const k of 扫全部键()) {
            try { 出[k] = localStorage.getItem(k); } catch (e) { 出[k] = null; }
        }
        return 出;
    }

    /** 实际存在的 IndexedDB 库名：已知清单 ∪ 浏览器枚举结果 */
    async function 列库名() {
        const 集 = new Set(已知库名);
        try {
            if (全局.indexedDB && typeof 全局.indexedDB.databases === 'function') {
                const 表 = await 全局.indexedDB.databases();
                if (Array.isArray(表)) 表.forEach(d => { if (d && d.name) 集.add(d.name); });
            }
        } catch (e) { /* 不支持就只用已知清单 */ }
        return Array.from(集);
    }

    function 开库(名) {
        return new Promise((完成, 失败) => {
            if (typeof indexedDB === 'undefined') return 失败(new Error('本环境无 IndexedDB'));
            let 请;
            try { 请 = indexedDB.open(名); } catch (e) { return 失败(e); }
            /* ★ 不传版本号：传了会比现有库高，触发 onupgradeneeded 改写用户的库结构。
                 备份是只读操作，绝不能动原库。 */
            请.onsuccess = () => 完成(请.result);
            请.onerror = () => 失败(请.error || new Error('打开库失败：' + 名));
            请.onblocked = () => 失败(new Error('库被占用：' + 名));
        });
    }

    function 表全取(db, 表名) {
        return new Promise((完成, 失败) => {
            let 事;
            try { 事 = db.transaction(表名, 'readonly'); } catch (e) { return 失败(e); }
            const 仓 = 事.objectStore(表名);
            const 请键 = 仓.getAllKeys();
            const 请值 = 仓.getAll();
            事.oncomplete = () => 完成({ 键: 请键.result || [], 值: 请值.result || [] });
            事.onerror = () => 失败(事.error || new Error('读表失败：' + 表名));
        });
    }

    /**
     * 深度遍历一条记录，把 Blob / File 抽出来单独存，原位换成引用。
     * 路径用 encodeURIComponent 编码每段 —— 记录字段名是中文，
     * 直接拼进 ZIP 路径虽然 UTF-8 flag 能扛，但编码后更保险，也避开 / 冲突。
     *
     * ★ MIME 类型与文件名【挂在叶子引用上】而不是挂在父记录上：
     *   还原是递归的，走到叶子时已经脱离了父对象的作用域，
     *   元信息挂在父级会导致还原时取不到 → Blob 的 type 变成空串 →
     *   语音条建出来的 URL 浏览器不认，点了没声音。
     */
    function 抽二进制(值, 路径, 桶) {
        if (是Blob(值)) {
            const 类型 = 值.type || '';
            const 名 = 是File(值) ? (值.name || '') : '';
            桶.push({ 路径: 路径 + '.bin', 类型, 名 });
            const 引用 = { __二进制__: 路径 + '.bin' };
            if (类型) 引用.__类型__ = 类型;
            if (名) 引用.__名__ = 名;
            return 引用;
        }
        if (Array.isArray(值)) return 值.map((v, i) => 抽二进制(v, 路径 + '/' + i, 桶));
        /* Date 用 toString 判而不是 instanceof —— 同样是跨 realm 会失效。
           误判成普通对象的话，Object.keys(Date) 是空数组，日期会被静默存成 {}。 */
        if (值 && typeof 值 === 'object' && Object.prototype.toString.call(值) !== '[object Date]') {
            const 出 = {};
            for (const k of Object.keys(值)) 出[k] = 抽二进制(值[k], 路径 + '/' + encodeURIComponent(k), 桶);
            return 出;
        }
        return 值;
    }

    /** 把抽走的引用换回真 Blob（还原后与原对象在字节、MIME、文件名上都一致） */
    async function 还二进制(值, 包) {
        if (Array.isArray(值)) {
            const 出 = [];
            for (const v of 值) 出.push(await 还二进制(v, 包));
            return 出;
        }
        if (值 && typeof 值 === 'object') {
            if (typeof 值.__二进制__ === 'string') {
                const 类型 = 值.__类型__ || '';
                const 名 = 值.__名__ || '';
                const b = await 包.取Blob(值.__二进制__, 类型);
                if (!b) return null;                       // 包缺了这个条目，如实给 null
                /* File 比 Blob 多个文件名。音乐库原本存的就是 File，
                   还原成 File 更贴近原状（无 File 构造函数的老 WebView 退成 Blob）。 */
                if (名 && typeof File === 'function') {
                    try { return new File([b], 名, { type: 类型 || b.type }); } catch (e) {}
                }
                return b;
            }
            const 出 = {};
            for (const k of Object.keys(值)) 出[k] = await 还二进制(值[k], 包);
            return 出;
        }
        return 值;
    }

    /**
     * 采集全部数据，返回 ZIP 的 Blob。
     * @param {function(阶段:string, 已:number, 总:number)} 进度
     */
    async function 导出备份(进度) {
        const 报 = typeof 进度 === 'function' ? 进度 : function () {};
        const 条目 = [];
        const 失败表 = [];            // 采集过程中取不到 / 读不了的，如实带出去
        const 起始 = Date.now();

        /* ---- ① localStorage ---- */
        报('正在读取本地设置', 0, 1);
        const 本地 = 读本地存储全量();
        const 本地键数 = Object.keys(本地).length;
        条目.push({
            路径: 'manifest.json',
            数据: JSON.stringify({
                格式版本,
                应用: '小喵叽',
                导出时间: new Date().toISOString(),
                导出时间戳: 起始,
                来源页面: (全局.location && 全局.location.pathname) || '',
                本地存储键数: 本地键数,
                用户代理: navigator.userAgent || ''
            }, null, 2)
        });
        条目.push({ 路径: 'localStorage.json', 数据: JSON.stringify(本地) });
        报('正在读取本地设置', 1, 1);

        /* ---- ② IndexedDB ---- */
        const 库名表 = await 列库名();
        const 库摘要 = {};
        let 已库 = 0;

        for (const 库名 of 库名表) {
            let db;
            try {
                db = await 开库(库名);
            } catch (e) {
                /* 库不存在时 open 也会成功并建一个空库，所以这里失败多半是环境问题。
                   记下来一并报给用户，不能装作没事。 */
                库摘要[库名] = { 错误: String(e && e.message || e) };
                continue;
            }

            const 表名集 = Array.from(db.objectStoreNames || []);
            const 库出 = { 表: {} };
            const 目录 = 库名.replace(/[\\/:*?"<>|]/g, '_');

            for (const 表名 of 表名集) {
                let 全;
                try {
                    全 = await 表全取(db, 表名);
                } catch (e) {
                    库出.表[表名] = { 错误: String(e && e.message || e) };
                    continue;
                }

                const 记录 = [];
                const 二进制元 = {};
                const 表目录 = 目录 + '/' + 表名.replace(/[\\/:*?"<>|]/g, '_');

                for (let i = 0; i < 全.值.length; i++) {
                    const 桶 = [];
                    const 前缀 = 表目录 + '/' + i;
                    /* 抽二进制会把 Blob 换成 { __二进制__:路径, __类型__, __名__ }，
                       MIME 与文件名跟着叶子走，恢复时才能还原出可播放的对象。 */
                    const 净 = 抽二进制(全.值[i], 前缀, 桶);
                    记录.push({ 键: 全.键[i], 值: 净 });

                    /* 抽出来的二进制另存条目。
                       ★ 按路径反查原 Blob，而不是重新编码 —— 音乐库那条是 File，
                         走 arrayBuffer() 再包 Blob 会丢掉文件名。 */
                    for (const b of 桶) {
                        const 原 = 取原值(全.值[i], b.路径, 前缀);
                        if (原 == null) {
                            失败表.push({ 位置: 库名 + '/' + 表名 + '/' + 全.键[i], 原因: '二进制字段「' + b.路径 + '」取不到，该条恢复后可能无法播放' });
                        }
                        条目.push({ 路径: b.路径, 数据: 原 != null ? 原 : new Uint8Array(0) });
                    }
                }
                库出.表[表名] = { 记录数: 记录.length, 记录 };
            }

            try { db.close(); } catch (e) {}
            条目.push({ 路径: 'idb/' + 目录 + '.json', 数据: JSON.stringify(库出) });
            库摘要[库名] = 库出;
            报('正在读取数据库：' + 库名, ++已库, 库名表.length);
        }

        /* 摘要单独存一份，方便用户不解压也能看清备份里有什么 */
        const 概览 = {};
        for (const k of Object.keys(库摘要)) {
            const 库 = 库摘要[k];
            概览[k] = 库.错误 ? { 错误: 库.错误 } : Object.keys(库.表 || {}).reduce((o, t) => {
                o[t] = 库.表[t].记录数 != null ? 库.表[t].记录数 : 库.表[t];
                return o;
            }, {});
        }

        /* manifest 补上摘要（重写第一条） */
        条目[0] = {
            路径: 'manifest.json',
            数据: JSON.stringify({
                格式版本,
                应用: '小喵叽',
                导出时间: new Date(起始).toISOString(),
                导出时间戳: 起始,
                来源页面: (全局.location && 全局.location.pathname) || '',
                本地存储键数: 本地键数,
                数据库概览: 概览,
                用户代理: navigator.userAgent || ''
            }, null, 2)
        };

        const zip = await 打包ZIP(条目, (已, 总, 字节) => 报('正在打包 ' + 已 + '/' + 总, 已, 总));
        return {
            blob: zip,
            概览: { 本地存储键数: 本地键数, 数据库: 概览 },
            条目数: 条目.length,
            失败: 失败表,          // ★ 采集期就没读到的，界面必须提示，不能装作备份完整
        };
    }

    /** 按抽取时记下的路径反查原始 Blob（避免再遍历一次整棵树） */
    function 取原值(根, 目标路径, 前缀) {
        const 相 = 目标路径.slice(0, 目标路径.length - 4);      // 去掉 .bin
        const 段 = 相.slice(前缀.length).split('/').filter(s => s !== '');
        let 当 = 根;
        for (let i = 0; i < 段.length; i++) {
            if (当 == null) return null;
            let 键 = 段[i];
            if (Array.isArray(当)) {
                当 = 当[Number(键)];
            } else {
                const 解 = decodeURIComponent(键);
                当 = (解 in 当) ? 当[解] : 当[键];
            }
        }
        return 是Blob(当) ? 当 : null;
    }

    /* ======================================================================
     * 4. 恢复
     * ==================================================================== */

    /** 校验备份包，返回概览（不含实际写入） */
    async function 检查备份(blob) {
        const 包 = await 解析ZIP(blob);
        const 元 = await 包.取JSON('manifest.json');
        if (!元 || typeof 元 !== 'object') throw new Error('备份包里找不到 manifest.json，不是本应用导出的备份');
        if (元.应用 !== '小喵叽') throw new Error('这个备份不是「小喵叽」导出的（标记：' + (元.应用 || '无') + '）');
        if (Number(元.格式版本) > 格式版本) {
            throw new Error('备份格式版本 ' + 元.格式版本 + ' 比当前程序支持的 ' + 格式版本 + ' 新，请先升级应用');
        }
        if (!包.有('localStorage.json')) throw new Error('备份包缺少 localStorage.json，文件可能不完整');

        let 库列表 = [];
        try {
            const 本地 = await 包.取JSON('localStorage.json');
            库列表 = Object.keys(本地 || {});
        } catch (e) { throw new Error('localStorage.json 解析失败：' + (e.message || e)); }

        return {
            元,
            本地存储键数: 库列表.length,
            数据库概览: 元.数据库概览 || {},
            导出时间: 元.导出时间 || '未知',
            包
        };
    }

    function 开库可写(名, 表名表) {
        return new Promise((完成, 失败) => {
            let 请;
            try { 请 = indexedDB.open(名); } catch (e) { return 失败(e); }
            请.onupgradeneeded = () => {
                const db = 请.result;
                (表名表 || []).forEach(t => {
                    if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
                });
            };
            请.onsuccess = () => 完成(请.result);
            请.onerror = () => 失败(请.error || new Error('打开库失败：' + 名));
        });
    }

    /**
     * 应用备份。
     * @param {Blob} blob 备份文件
     * @param {object} 选项 { 模式:'覆盖'|'合并', 进度:function }
     *   覆盖 = 先清空同名范围再写（真正「恢复到备份时的状态」）
     *   合并 = 只写入，已有的键保留（备份里没有的本地新数据不丢）
     * @returns {Promise<{失败: Array, 本地写入: number, 库写入: object}>}
     */
    async function 恢复备份(blob, 选项) {
        const 配 = 选项 || {};
        const 模式 = 配.模式 === '合并' ? '合并' : '覆盖';
        const 报 = typeof 配.进度 === 'function' ? 配.进度 : function () {};
        const 失败表 = [];

        const 检 = await 检查备份(blob);
        const 包 = 检.包;

        /* ---- ① localStorage ---- */
        报('正在恢复本地设置', 0, 1);
        const 本地 = await 包.取JSON('localStorage.json') || {};
        const 键表 = Object.keys(本地);

        if (模式 === '覆盖') {
            /* 只清「备份里也有的键」之外的现存键？不 —— 覆盖的语义是回到备份那一刻，
               所以要清掉当前所有键，再把备份的写回去。
               ★ 但绝不能连备份自己的暂存键一起清，这里没有暂存键，安全。 */
            try {
                const 现存 = 扫全部键();
                现存.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
            } catch (e) { 失败表.push({ 位置: 'localStorage', 原因: '清空失败：' + (e.message || e) }); }
        }

        let 本地写入 = 0;
        for (let i = 0; i < 键表.length; i++) {
            const k = 键表[i];
            try {
                localStorage.setItem(k, 本地[k]);
                本地写入++;
            } catch (e) {
                /* ★ QuotaExceededError 必须如实上报。静默吞掉的话用户会以为恢复全好了，
                     实际头像 / 聊天记录缺了一大片 —— 这比报错严重得多。 */
                失败表.push({ 位置: 'localStorage:' + k, 原因: String(e && e.name === 'QuotaExceededError' ? '本地存储空间已满（5MB 上限），该条未写入' : (e && e.message || e)) });
            }
            if (i % 20 === 0) 报('正在恢复本地设置 ' + (i + 1) + '/' + 键表.length, i + 1, 键表.length);
        }
        报('正在恢复本地设置', 1, 1);

        /* ---- ② IndexedDB ---- */
        const 库写入 = {};
        const 库路径 = 包.路径表().filter(p => p.indexOf('idb/') === 0 && /\.json$/.test(p));
        let 已库 = 0;

        for (const 路 of 库路径) {
            const 库名 = decodeURIComponent(路.slice(4, 路.length - 5));
            let 库数据;
            try {
                库数据 = await 包.取JSON(路);
            } catch (e) {
                失败表.push({ 位置: '库:' + 库名, 原因: '解析失败：' + (e.message || e) });
                continue;
            }
            if (!库数据 || !库数据.表) continue;

            const 表名表 = Object.keys(库数据.表).filter(t => !库数据.表[t].错误);
            报('正在恢复数据库：' + 库名, 已库, 库路径.length);

            let db;
            try {
                db = await 开库可写(库名, 表名表);
            } catch (e) {
                失败表.push({ 位置: '库:' + 库名, 原因: '打开失败：' + (e.message || e) });
                已库++;
                continue;
            }

            const 本库 = {};
            for (const 表名 of 表名表) {
                const 表数据 = 库数据.表[表名];
                const 记录 = 表数据.记录 || [];
                if (!db.objectStoreNames.contains(表名)) {
                    失败表.push({ 位置: 库名 + '/' + 表名, 原因: '表不存在，已跳过 ' + 记录.length + ' 条' });
                    continue;
                }

                try {
                    /* ★★ 必须先在事务【外】把二进制全部还原好，再开事务同步写入。
                       IndexedDB 事务在微任务队列耗尽时自动提交，而还原 Blob 要 await
                       blob.arrayBuffer()。若在事务内 await 再 put，第二次 put 就会抛
                       TransactionInactiveError —— 结果是语音、音乐一条都存不进去，
                       而且异常发生在 oncomplete 之后，看起来还像成功了。 */
                    const 待写 = [];
                    for (let i = 0; i < 记录.length; i++) {
                        const 条 = 记录[i];
                        if (!条 || 条.值 === undefined) continue;
                        待写.push(await 还二进制(条.值, 包));
                        if (i % 50 === 0) 报('正在解开 ' + 库名 + '/' + 表名 + ' ' + (i + 1) + '/' + 记录.length, i + 1, 记录.length);
                    }

                    const 写 = await new Promise((完成, 失败) => {
                        let 事;
                        try { 事 = db.transaction(表名, 'readwrite'); } catch (e) { return 失败(e); }
                        const 仓 = 事.objectStore(表名);
                        事.oncomplete = () => 完成(true);
                        事.onerror = () => 失败(事.error || new Error('事务失败'));
                        事.onabort = () => 失败(事.error || new Error('事务被中止'));
                        if (模式 === '覆盖') 仓.clear();
                        /* 纯同步循环：整个事务期间不 await，保证它不会提前自动提交 */
                        for (const 值 of 待写) { try { 仓.put(值); } catch (e) { 失败(e); return; } }
                    });
                    本库[表名] = 写 ? 待写.length : 0;
                    报('正在恢复 ' + 库名 + '/' + 表名, 1, 1);
                } catch (e) {
                    失败表.push({ 位置: 库名 + '/' + 表名, 原因: String(e && e.message || e) });
                    本库[表名] = 0;
                }
            }

            try { db.close(); } catch (e) {}
            库写入[库名] = 本库;
            已库++;
        }

        报('恢复完成', 1, 1);
        return { 失败: 失败表, 本地写入, 库写入, 模式, 元: 检.元 };
    }

    /* ======================================================================
     * 5. 落地：文件夹自选（桥 → FSA API → download 三级降级）
     * ==================================================================== */

    const 原生桥 = () => 全局.小喵叽原生 || null;

    /**
     * 归一化桥返回。
     * ★ Android 的 @JavascriptInterface 方法只能把返回值序列化成【字符串/基本类型】，
     *   无法直接返回 JS 对象。所以原生侧的 结束写()/选文件读() 返回 JSON 字符串，
     *   这里 parse 回对象。已经是对象的（浏览器测试用的 mock 桥）直接透传，两种都兼容。
     */
    function 解桥返回(值) {
        if (值 == null) return null;
        if (typeof 值 === 'object') return 值;
        if (typeof 值 !== 'string') return null;
        const s = 值.trim();
        if (!s) return null;
        try { return JSON.parse(s); }
        catch (e) { return { 失败: true, 原因: '桥返回内容无法解析：' + s }; }
    }

    function 支持目录选择() { return typeof 全局.showDirectoryPicker === 'function'; }
    function 支持保存选择() { return typeof 全局.showSaveFilePicker === 'function'; }
    function 支持打开选择() { return typeof 全局.showOpenFilePicker === 'function'; }

    /** 默认备份文件名：小喵叽备份_2026-09-19_2330.zip */
    function 默认文件名() {
        const d = new Date();
        const 补 = n => String(n).padStart(2, '0');
        return '小喵叽备份_' + d.getFullYear() + '-' + 补(d.getMonth() + 1) + '-' + 补(d.getDate()) +
            '_' + 补(d.getHours()) + 补(d.getMinutes()) + '.zip';
    }

    /* ★ 探测桥是否具备「分块写文件」这一组方法。
       必须探测【实际会调用的】开始写 / 写块 / 结束写，不能探测一个用不上的标志位 ——
       探测的字段和调用的字段对不上，桥就永远不会被触发，静默掉进 download 兜底。 */
    function 桥可写文件(桥) {
        return !!桥 && typeof 桥.开始写 === 'function'
            && typeof 桥.写块 === 'function' && typeof 桥.结束写 === 'function';
    }
    function 桥可读文件(桥) {
        return !!桥 && typeof 桥.选文件读 === 'function';
    }

    /**
     * 保存备份。返回 { 方式, 位置 }；用户取消返回 null。
     * 方式：'原生' | '目录' | '另存为' | '下载'
     */
    async function 保存备份(blob, 文件名) {
        const 名 = 文件名 || 默认文件名();
        const 桥 = 原生桥();

        /* ① APP 壳：系统文件选择器，能选到任意目录（含外置存储 / 网盘挂载） */
        if (桥可写文件(桥)) {
            const 字节 = new Uint8Array(await blob.arrayBuffer());
            const 块大小 = 512 * 1024;      // 分块传：JS 桥单次传大字符串会被截断
            let 会话 = 桥.开始写(名, 字节.length);
            /* ★ 安卓侧 开始写 成功返回会话 id 字符串；用户取消返回 '取消'；
                 失败（如没有输出流）返回 JSON 字符串 {"失败":true,"原因":...}。
                 若不把失败 JSON 拆出来，它会被当成会话 id 继续写，产出一个
                 不完整甚至空的备份还谎报成功 —— 必须在这里就拦住。 */
            if (typeof 会话 === 'string' && 会话.trim().charAt(0) === '{') 会话 = 解桥返回(会话);
            if (会话 === false || 会话 == null || 会话 === '取消') return null;
            if (typeof 会话 === 'object') {
                throw new Error((会话 && 会话.原因) || '原生写入失败：无法创建备份文件');
            }
            for (let i = 0; i < 字节.length; i += 块大小) {
                桥.写块(会话, 字节转Base64(字节.subarray(i, i + 块大小)));
            }
            const 果 = 解桥返回(桥.结束写(会话));
            if (!果 || 果.失败) throw new Error((果 && 果.原因) || '原生写入失败');
            return { 方式: '原生', 位置: 果.路径 || 名 };
        }

        /* ② File System Access API：真·自选文件夹 */
        if (支持目录选择()) {
            try {
                const 目录柄 = await 全局.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
                const 文件柄 = await 目录柄.getFileHandle(名, { create: true });
                const 写 = await 文件柄.createWritable();
                await 写.write(blob);
                await 写.close();
                return { 方式: '目录', 位置: 目录柄.name + '/' + 名 };
            } catch (e) {
                if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return null;  // 用户取消
                /* 选目录失败（比如权限被拒）不直接放弃，继续往下降级 */
            }
        }

        if (支持保存选择()) {
            try {
                const 文件柄 = await 全局.showSaveFilePicker({
                    suggestedName: 名,
                    types: [{ description: '小喵叽备份', accept: { 'application/zip': ['.zip'] } }]
                });
                const 写 = await 文件柄.createWritable();
                await 写.write(blob);
                await 写.close();
                return { 方式: '另存为', 位置: 文件柄.name };
            } catch (e) {
                if (e && e.name === 'AbortError') return null;
            }
        }

        /* ③ 兜底：a[download]。iOS Safari / Firefox 只能走这条，落到默认下载目录 */
        const 链 = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = 链;
        a.download = 名;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        /* ★ 延迟 revoke：立刻撤会让部分浏览器的下载直接失败 */
        setTimeout(() => { try { URL.revokeObjectURL(链); } catch (e) {} }, 30000);
        setTimeout(() => { try { a.remove(); } catch (e) {} }, 1000);
        return { 方式: '下载', 位置: '浏览器默认下载目录/' + 名 };
    }

    /**
     * 选一个备份文件读进来。返回 { 名, blob }；取消返回 null。
     */
    async function 选取备份文件() {
        const 桥 = 原生桥();

        if (桥可读文件(桥)) {
            const 元 = 解桥返回(桥.选文件读());
            if (!元 || 元.取消) return null;
            if (元.失败) throw new Error(元.原因 || '原生读取失败');
            const 总 = Number(元.长度) || 0;
            const 块大小 = 512 * 1024;
            const 段 = [];
            let 已读 = 0;
            for (let 位 = 0; 位 < 总; 位 += 块大小) {
                const 块 = 桥.读块(元.会话, 位, Math.min(块大小, 总 - 位));
                const 字节段 = base64转字节(块);
                已读 += 字节段.length;
                段.push(字节段);
            }
            /* ★ 校验实读字节数 == 声明长度。读块失败会返回空串，
                 不校验就会静默拼出一个【缺尾】的损坏 zip，到解析时才报
                 「找不到结尾标记」，让人误以为文件坏了、其实是没读全。 */
            if (已读 !== 总) {
                throw new Error('读取不完整：应有 ' + 总 + ' 字节，实读 ' + 已读 + ' 字节');
            }
            return { 名: 元.名 || '备份.zip', blob: new Blob(段, { type: 'application/zip' }) };
        }

        if (支持打开选择()) {
            try {
                const 柄表 = await 全局.showOpenFilePicker({
                    multiple: false,
                    types: [{ description: '小喵叽备份', accept: { 'application/zip': ['.zip'] } }]
                });
                if (!柄表 || !柄表.length) return null;
                const 文件 = await 柄表[0].getFile();
                return { 名: 文件.name, blob: 文件 };
            } catch (e) {
                if (e && e.name === 'AbortError') return null;
            }
        }

        /* 兜底 input[type=file] */
        return await new Promise((完成) => {
            const 入 = document.createElement('input');
            入.type = 'file';
            入.accept = '.zip,application/zip';
            入.style.display = 'none';
            document.body.appendChild(入);
            let 定 = false;
            const 收 = (v) => { if (!定) { 定 = true; try { 入.remove(); } catch (e) {} 完成(v); } };
            入.addEventListener('change', () => {
                const f = 入.files && 入.files[0];
                收(f ? { 名: f.name, blob: f } : null);
            });
            /* 用户点了取消不会触发 change，靠 window focus 兜一下 */
            全局.addEventListener('focus', () => setTimeout(() => { if (!入.files || !入.files.length) 收(null); }, 800));
            入.click();
        });
    }

    /* ======================================================================
     * 6. 对外
     * ==================================================================== */

    const 备份工具 = {
        格式版本,
        已知库名,
        默认文件名,
        字节数文案,
        导出备份,
        恢复备份,
        检查备份,
        保存备份,
        选取备份文件,
        扫全部键,
        列库名,
        支持目录选择,
        支持保存选择,
        支持打开选择,
        /* ★ 桥能力按「写入 / 读取」分开报，别只报一个笼统的「有桥」——
             壳只实现了写、没实现读时，读取按钮要提前禁用，而不是点了才报错。 */
        桥可写文件: () => 桥可写文件(原生桥()),
        桥可读文件: () => 桥可读文件(原生桥()),
        有原生桥: () => !!原生桥(),
        /** 一句话说明当前环境会把备份落到哪，给用户看（绝不谎报「可自选文件夹」） */
        落地方式说明() {
            if (桥可写文件(原生桥())) return 'APP 内：调起系统文件选择器，可存到任意文件夹';
            if (支持目录选择()) return '浏览器：可自选保存文件夹';
            if (支持保存选择()) return '浏览器：调起「另存为」，可选保存位置';
            return '浏览器：落到默认下载目录（当前浏览器不支持自选文件夹）';
        },
        读取方式说明() {
            if (桥可读文件(原生桥())) return 'APP 内：调起系统文件选择器';
            if (支持打开选择()) return '浏览器：调起文件选择器';
            return '浏览器：调起文件选择器（取消时可能不回调，需再点一次）';
        },
        /* 底层件也暴露出去，方便 verify 脚本直接验 CRC / ZIP 往返 */
        _内部: { 打包ZIP, 解析ZIP, 算CRC, 抽二进制, 还二进制, 是Blob, 是File, 文本转字节, 字节转Base64, base64转字节 }
    };

    全局.备份工具 = 备份工具;

    /* CommonJS 导出：让 jsdom 验证脚本能 require 进来单测 */
    if (typeof module !== 'undefined' && module.exports) module.exports = 备份工具;

})(typeof window !== 'undefined' ? window : globalThis);
