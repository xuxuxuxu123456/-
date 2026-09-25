/**
 * verify_beifen.js —— 备份 / 恢复引擎回归
 *
 * 覆盖 备份.js 的四条命脉，任一条断了都会导致「恢复后资料缺失」：
 *   A. CRC32 与 ZIP 往返        —— 打进去再解出来必须逐字节相同
 *   B. 二进制抽取 / 还原        —— File / Blob 存进去要能原样拿出来（音乐、语音）
 *   C. localStorage 全量往返    —— 覆盖模式清空重写、合并模式不动新数据
 *   D. IndexedDB 四库往返       —— 含 Blob 的库恢复后 URL.createObjectURL 仍可用
 *   E. 失败必须如实上报         —— 超额 / 坏包不能静默成功
 *
 * 跑法：node verify_beifen.js   （依赖 jsdom + fake-indexeddb）
 */
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '_build', 'node_modules', 'jsdom'));
/* ★ 必须是 /auto 入口：fake-indexeddb v6 起，裸 require('fake-indexeddb') 只导出
     IDBFactory 等构造函数，【不会】注册 global.indexedDB，
     后面 w.indexedDB.open 就是 undefined。 */
require(path.join(__dirname, '_build', 'node_modules', 'fake-indexeddb', 'auto'));
const { IDBFactory } = require(path.join(__dirname, '_build', 'node_modules', 'fake-indexeddb'));

const { 造断言器, 造存储, 收尾 } = require('./testkit.js');
const { ok, errors } = 造断言器();

/* 在 jsdom 环境里加载 备份.js —— 它依赖 Blob / TextEncoder / btoa / indexedDB */
const 源码 = fs.readFileSync(path.join(__dirname, '备份.js'), 'utf8');

/** 定时等待（页面脚本里有 setTimeout 收尾） */
const 等 = ms => new Promise(r => setTimeout(r, ms));

/**
 * 轮询等到条件成立，超时即停。
 * ★ 不用固定 sleep：机器慢的时候断言会在数据还没渲染完时读到占位符，
 *   表现为「本地能过、CI 上偶发失败」，很难查。
 */
async function 等到(w, 条件, 上限毫秒) {
    const 起 = Date.now();
    const 限 = 上限毫秒 || 2000;
    while (Date.now() - 起 < 限) {
        let 成 = false;
        try { 成 = !!条件(); } catch (e) { 成 = false; }
        if (成) return true;
        await 等(20);
    }
    return false;
}

function 造环境(本地数据) {
    const 数据 = Object.assign({}, 本地数据 || {});
    /* ★★ 每个环境用【独立的】 IDBFactory。
       共用 global.indexedDB 的话，「恢复到干净环境」其实是在已经写过数据的库上跑的 ——
       D 段那些断言就会假通过：读到的是上一个环境留下的记录，不是备份还原出来的。 */
    const 库 = new IDBFactory();
    /* ★ 必须在 beforeParse 里注入：jsdom 的 window.indexedDB / localStorage 是
       原型上的访问器，窗口建好之后再 defineProperty 会静默失败（不抛错，但也没生效），
       表现为后面读库时 w.indexedDB 是 undefined。 */
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        runScripts: 'dangerously',
        url: 'http://localhost/备份.html',
        beforeParse(w) {
            Object.defineProperty(w, 'localStorage', {
                value: {
                    getItem: k => (Object.prototype.hasOwnProperty.call(数据, k) ? 数据[k] : null),
                    setItem: (k, v) => { 数据[k] = String(v); },
                    removeItem: k => { delete 数据[k]; },
                    clear: () => { for (const k in 数据) delete 数据[k]; },
                    key: i => Object.keys(数据)[i] || null,
                    get length() { return Object.keys(数据).length; },
                },
                configurable: true,
                writable: true,
            });
            Object.defineProperty(w, 'indexedDB', { value: 库, configurable: true, writable: true });
            Object.defineProperty(w, 'IDBKeyRange', { value: global.IDBKeyRange, configurable: true, writable: true });
            /* ★★ Blob / File 强制用 Node realm 的那一份（覆盖 jsdom 自带的）。
               fake-indexeddb 的 structured clone 认不出跨 realm 的 Blob：
               存 jsdom 的 File 进去，取出来会退化成普通 Object（size/type/arrayBuffer 全没了），
               于是 D 段「二进制恢复为 Blob」永远失败 —— 但那是测试假象，
               真实浏览器里同 realm 存取不存在这个问题。统一 realm 才能真验到这条链。
               顺带也验证了引擎用的是 duck typing（是Blob）而不是 instanceof。 */
            Object.defineProperty(w, 'Blob', { value: global.Blob, configurable: true, writable: true });
            Object.defineProperty(w, 'File', { value: global.File, configurable: true, writable: true });
            if (!w.TextEncoder) w.TextEncoder = global.TextEncoder;
            if (!w.TextDecoder) w.TextDecoder = global.TextDecoder;
            /* jsdom 不实现 createObjectURL / revokeObjectURL，但「还原后能建 Blob URL」
               正是音乐和语音恢复后能不能播的关键，必须打桩验到。 */
            if (!w.URL.createObjectURL) {
                let 序 = 0;
                const 在册 = new Map();
                w.URL.createObjectURL = function (b) {
                    if (!b || typeof b.arrayBuffer !== 'function') {
                        throw new TypeError('createObjectURL 需要一个 Blob');
                    }
                    const 链 = 'blob:http://localhost/' + (++序);
                    在册.set(链, b);
                    return 链;
                };
                w.URL.revokeObjectURL = function (链) { 在册.delete(链); };
                w.__在册URL = 在册;
            }
        },
    });
    const w = dom.window;
    w.eval(源码);
    return { w, 工具: w.备份工具, 数据 };
}

function 开库(w, 名, 表名) {
    return new Promise((完成, 失败) => {
        const 请 = w.indexedDB.open(名, 1);
        请.onupgradeneeded = () => {
            const db = 请.result;
            if (!db.objectStoreNames.contains(表名)) db.createObjectStore(表名, { keyPath: 'id' });
        };
        请.onsuccess = () => 完成(请.result);
        请.onerror = () => 失败(请.error);
    });
}
function 写条(w, 名, 表名, 记录) {
    return 开库(w, 名, 表名).then(db => new Promise((完成, 失败) => {
        const 事 = db.transaction(表名, 'readwrite');
        事.objectStore(表名).put(记录);
        事.oncomplete = () => { db.close(); 完成(true); };
        事.onerror = () => 失败(事.error);
    }));
}
function 全取(w, 名, 表名) {
    return 开库(w, 名, 表名).then(db => new Promise((完成, 失败) => {
        const 事 = db.transaction(表名, 'readonly');
        const 请 = 事.objectStore(表名).getAll();
        事.oncomplete = () => { db.close(); 完成(请.result || []); };
        事.onerror = () => 失败(事.error);
    }));
}
const 字节 = (arr) => new Uint8Array(arr);
const 同字节 = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

(async () => {
    /* ================= A. CRC32 与 ZIP 往返 ================= */
    console.log('\n[A] CRC32 与 ZIP 往返');
    {
        const { 工具 } = 造环境();
        const { 算CRC, 打包ZIP, 解析ZIP, 文本转字节 } = 工具._内部;

        /* CRC32 标准测试向量：空串 = 0，"123456789" = 0xCBF43926 */
        ok(算CRC(new Uint8Array(0)) === 0, 'A1 CRC32(空) = 0');
        ok(算CRC(文本转字节('123456789')) === 0xCBF43926,
            'A2 CRC32("123456789") = 0xCBF43926 实际=0x' + 算CRC(文本转字节('123456789')).toString(16));

        /* 文本条目往返 */
        const 条目 = [
            { 路径: 'manifest.json', 数据: JSON.stringify({ a: 1, 中文: '测试' }) },
            { 路径: 'idb/音乐库.json', 数据: '{"表":{"音频":{"记录数":0,"记录":[]}}}' },
            { 路径: 'data/blob.bin', 数据: 字节([0, 1, 2, 253, 254, 255]) },
        ];
        const zip = await 打包ZIP(条目);
        ok(zip instanceof Blob || zip.constructor.name === 'Blob', 'A3 打包产物是 Blob');

        const 包 = await 解析ZIP(zip);
        ok(包.条目数 === 3, 'A4 解出 3 个条目 实际=' + 包.条目数);
        ok(包.有('manifest.json') && 包.有('data/blob.bin'), 'A5 中文与多级路径都在');

        const 元 = await 包.取JSON('manifest.json');
        ok(元 && 元.中文 === '测试', 'A6 UTF-8 中文内容无损往返');

        const 二 = await 包.取字节('data/blob.bin');
        ok(同字节(二, 字节([0, 1, 2, 253, 254, 255])), 'A7 二进制逐字节相同');
        ok((await 包.取JSON('不存在.json')) === null, 'A8 取不存在的条目返回 null 而不抛');

        /* 二进制大条目：模拟一段几 MB 的录音 */
        const 大 = new Uint8Array(3 * 1024 * 1024);
        for (let i = 0; i < 大.length; i++) 大[i] = i & 0xFF;
        const 大包 = await 打包ZIP([{ 路径: 'big.bin', 数据: 大 }]);
        const 解大 = await (await 解析ZIP(大包)).取字节('big.bin');
        ok(解大.length === 大.length && 解大[大.length - 1] === 大[大.length - 1] && 算CRC(解大) === 算CRC(大),
            'A9 3MB 二进制往返无损（长度 + CRC 双验）');
    }

    /* ================= B. 二进制抽取 / 还原 ================= */
    console.log('\n[B] 二进制抽取与还原');
    {
        const { w, 工具 } = 造环境();
        const { 抽二进制, 还二进制, 打包ZIP, 解析ZIP } = 工具._内部;

        /* 音乐库原样：{ id, 名, 数据: File } */
        const 文件 = new w.File([字节([1, 2, 3, 4, 5])], '草莓奶油.mp3', { type: 'audio/mpeg' });
        const 桶 = [];
        const 净 = 抽二进制({ id: 'u1', 名: '草莓奶油.mp3', 数据: 文件 }, 'idb/音乐库/音频/0', 桶);
        /* ★ 中文字段名会被 encodeURIComponent 编码（避开 / 冲突），
             断言必须按编码后的路径比对；同时验证它能无损解码回原字段名。 */
        const 期望路径 = 'idb/音乐库/音频/0/' + encodeURIComponent('数据') + '.bin';
        ok(桶.length === 1 && 桶[0].路径 === 期望路径,
            'B1 File 被抽出为独立条目 实际=' + JSON.stringify(桶.map(b => b.路径)));
        ok(decodeURIComponent(桶[0].路径.split('/').pop().replace(/\.bin$/, '')) === '数据',
            'B1b 编码路径可无损解码回原字段名「数据」');
        ok(净.数据 && 净.数据.__二进制__ === 期望路径, 'B2 原位换成引用');
        ok(净.名 === '草莓奶油.mp3' && 净.id === 'u1', 'B3 非二进制字段原样保留');
        ok(净.数据 && 净.数据.__名__ === '草莓奶油.mp3',
            'B4 原文件名挂在叶子引用上（恢复时才能还原成 File）实际=' + JSON.stringify(净.数据));

        /* 语音库原样：{ id, blob: Blob } */
        const 语 = new w.Blob([字节([9, 8, 7])], { type: 'audio/webm' });
        const 桶2 = [];
        const 净2 = 抽二进制({ id: '存档:1', blob: 语 }, 'idb/聊天语音库/语音/0', 桶2);
        ok(桶2.length === 1 && 净2.blob.__二进制__.endsWith('/blob.bin'), 'B5 Blob 同样抽出');
        ok(净2.blob.__类型__ === 'audio/webm',
            'B6 MIME 挂在叶子引用上（恢复后语音条要靠它出声）实际=' + JSON.stringify(净2.blob));

        /* 走一遍真 ZIP 再还原 */
        const 原桶 = [];
        const 记录净 = 抽二进制({ id: 'u1', 名: 'a.mp3', 数据: 文件 }, 't/0', 原桶);
        const 条目 = [{ 路径: 't.json', 数据: JSON.stringify(记录净) }];
        原桶.forEach(b => 条目.push({ 路径: b.路径, 数据: 文件 }));
        const 包 = await 解析ZIP(await 打包ZIP(条目));
        const 还原 = await 还二进制(JSON.parse(await 包.取文本('t.json')), 包);
        ok(还原.数据 instanceof w.Blob, 'B7 还原出来是 Blob（可喂给 createObjectURL）');
        const 还原字节 = new Uint8Array(await 还原.数据.arrayBuffer());
        ok(同字节(还原字节, 字节([1, 2, 3, 4, 5])), 'B8 还原后的字节与原始一致');
        ok(还原.数据.type === 'audio/mpeg', 'B9 MIME 类型保留');
        const 链 = w.URL.createObjectURL(还原.数据);
        ok(typeof 链 === 'string' && 链.indexOf('blob:') === 0, 'B10 还原后可直接建 Blob URL（音乐能播）');
        w.URL.revokeObjectURL(链);

        /* 图片库 / 书库是纯 JSON，不能被误抽 */
        const 桶3 = [];
        const 净3 = 抽二进制({ id: 'b1', 书名: '测试', 章节: [{ 题: '第一章', 正文: '正文内容' }] }, 't/0', 桶3);
        ok(桶3.length === 0 && 净3.章节[0].正文 === '正文内容', 'B11 纯 JSON 记录不产生二进制条目');
    }

    /* ================= C. localStorage 全量往返 ================= */
    console.log('\n[C] localStorage 往返');
    {
        const 原数据 = {
            '联系人索引': JSON.stringify([{ id: 'c_1', 名称: '白九霄', 备注: '', 头像: '', 消息: 'hi', 时间: '昨天' }]),
            '好友信息_c_1': JSON.stringify({ 昵称: '白九霄', 生日: '1050-05-31', 身高: 172, 性别: '男' }),
            '好友头像_c_1': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
            '音色配置_c_1': JSON.stringify({ 音色: '专属', 已启用: true }),
            '聊天记录_c_1': JSON.stringify([{ 文: '你好', 我: false }]),
            '主题背景': JSON.stringify({ 源: '默认', 索引: 3 }),
            '寄语_1_中': '第一句<br>第二句',
            '用户昵称': '小喵叽',
        };
        const { w, 工具, 数据 } = 造环境(原数据);
        const 扫到 = 工具.扫全部键();
        ok(Array.isArray(扫到) && 扫到.length === 8,
            'C1 扫全部键() 返回数组且枚举出 8 个键（走 length+key(i)，不靠 Object.keys）实际=' + 扫到.length);
        ok(扫到.includes('好友头像_c_1') && 扫到.includes('寄语_1_中'),
            'C1b 中文键与带下划线的分桶键都能枚举到');

        const 果 = await 工具.导出备份();
        ok(果.blob && 果.概览.本地存储键数 === 8, 'C2 导出报告 8 个键 实际=' + 果.概览.本地存储键数);

        /* 恢复到全新环境 */
        const 环2 = 造环境({});
        const 果2 = await 环2.工具.恢复备份(果.blob);
        ok(果2.本地写入 === 8, 'C3 覆盖模式写入 8 条 实际=' + 果2.本地写入);
        ok(果2.失败.length === 0, 'C4 无失败项 实际=' + JSON.stringify(果2.失败));
        ok(JSON.parse(环2.数据['联系人索引'])[0].名称 === '白九霄', 'C5 联系人索引完整恢复');
        ok(JSON.parse(环2.数据['好友信息_c_1']).身高 === 172, 'C6 好友档案字段完整');
        ok(环2.数据['好友头像_c_1'] === 原数据['好友头像_c_1'], 'C7 头像 dataURL 逐字符相同');
        ok(环2.数据['寄语_1_中'] === '第一句<br>第二句', 'C8 含 HTML 的寄语不被转义破坏');
        ok(JSON.parse(环2.数据['主题背景']).索引 === 3, 'C9 主题设置恢复（全站背景生效）');

        /* 覆盖语义：目标环境里多余的新键必须被清掉 */
        const 环3 = 造环境({ '多余的键': '不该留下', '用户昵称': '旧名' });
        await 环3.工具.恢复备份(果.blob, { 模式: '覆盖' });
        ok(!('多余的键' in 环3.数据), 'C10 覆盖模式清掉了备份里没有的键（真正回到备份那一刻）');
        ok(环3.数据['用户昵称'] === '小喵叽', 'C11 覆盖模式同名键被备份值替换');

        /* 合并语义：目标环境的新数据要保住 */
        const 环4 = 造环境({ '我新加的': '要保住', '用户昵称': '本地新名' });
        await 环4.工具.恢复备份(果.blob, { 模式: '合并' });
        ok(环4.数据['我新加的'] === '要保住', 'C12 合并模式保住备份里没有的新数据');
        ok(环4.数据['联系人索引'] != null, 'C13 合并模式仍写入了备份的数据');
    }

    /* ================= D. IndexedDB 四库往返 ================= */
    console.log('\n[D] IndexedDB 往返');
    {
        const { w, 工具 } = 造环境({ '任意键': '1' });

        /* 铺入与线上结构一致的四库数据 */
        await 写条(w, '音乐库', '音频', { id: 'u_song1', 名: '草莓奶油.mp3', 数据: new w.File([字节([10, 20, 30])], '草莓奶油.mp3', { type: 'audio/mpeg' }) });
        await 写条(w, '图片库', '图片', { id: 'img_1', 数据: 'data:image/png;base64,AAAB', 网址: '', 描述: '一张图', 时间: 1 });
        await 写条(w, '聊天语音库', '语音', { id: 'c_1:m1', blob: new w.Blob([字节([7, 7, 7, 7])], { type: 'audio/webm' }) });
        await 写条(w, '阅读_书库', '书', { id: 'b_1', 书名: '长夜将明', 作者: '白九霄', 章节: [{ 题: '第一章', 正文: '正文'.repeat(100) }] });

        const 果 = await 工具.导出备份();
        ok(果.blob && 果.blob.size > 0, 'D1 含四库数据导出成功 体积=' + 工具.字节数文案(果.blob.size));
        const 概 = 果.概览.数据库;
        ok(概['音乐库'] && 概['音乐库']['音频'] === 1, 'D2 音乐库/音频 报告 1 条 实际=' + JSON.stringify(概['音乐库']));
        ok(概['聊天语音库'] && 概['聊天语音库']['语音'] === 1, 'D3 聊天语音库/语音 报告 1 条');
        ok(概['阅读_书库'] && 概['阅读_书库']['书'] === 1, 'D4 阅读_书库/书 报告 1 条');
        ok(概['图片库'] && 概['图片库']['图片'] === 1, 'D5 图片库/图片 报告 1 条');

        /* 恢复进干净环境（库都不存在，要靠 upgradeneeded 建出来） */
        const 环2 = 造环境({});
        const 果2 = await 环2.工具.恢复备份(果.blob);
        ok(果2.失败.length === 0, 'D6 无失败项 实际=' + JSON.stringify(果2.失败));
        ok(果2.库写入['音乐库'] && 果2.库写入['音乐库']['音频'] === 1, 'D7 音乐库写回 1 条');
        ok(果2.库写入['聊天语音库'] && 果2.库写入['聊天语音库']['语音'] === 1, 'D8 语音库写回 1 条');
        ok(果2.库写入['阅读_书库'] && 果2.库写入['阅读_书库']['书'] === 1, 'D9 书库写回 1 条');

        const 音 = (await 全取(环2.w, '音乐库', '音频'))[0];
        ok(音 && 音.名 === '草莓奶油.mp3', 'D10 曲目名恢复');
        ok(音 && 音.数据 instanceof 环2.w.Blob, 'D11 曲目二进制恢复为 Blob');
        const 音字节 = new Uint8Array(await 音.数据.arrayBuffer());
        ok(同字节(音字节, 字节([10, 20, 30])), 'D12 曲目字节一致');
        ok(音 && 音.数据.type === 'audio/mpeg', 'D13 曲目 MIME 一致（否则播放器可能不出声）');

        const 语 = (await 全取(环2.w, '聊天语音库', '语音'))[0];
        ok(语 && 语.id === 'c_1:m1', 'D14 语音记录 id 恢复');
        ok(语 && 语.blob instanceof 环2.w.Blob, 'D15 语音恢复为 Blob');
        ok(同字节(new Uint8Array(await 语.blob.arrayBuffer()), 字节([7, 7, 7, 7])), 'D16 语音字节一致');
        const 语链 = 环2.w.URL.createObjectURL(语.blob);
        ok(语链.indexOf('blob:') === 0, 'D17 恢复后的语音可直接建 URL（语音条能播）');
        环2.w.URL.revokeObjectURL(语链);

        const 书 = (await 全取(环2.w, '阅读_书库', '书'))[0];
        ok(书 && 书.书名 === '长夜将明' && 书.章节[0].正文.length === 200, 'D18 小说正文完整恢复（含长文本）');

        const 图 = (await 全取(环2.w, '图片库', '图片'))[0];
        ok(图 && 图.数据 === 'data:image/png;base64,AAAB' && 图.描述 === '一张图', 'D19 图片库 JSON 字段原样恢复');

        /* 覆盖模式：恢复前要清空，不能把旧记录和新记录叠在一起 */
        await 写条(环2.w, '音乐库', '音频', { id: 'u_不该留', 名: '旧歌.mp3', 数据: new 环2.w.File([字节([1])], '旧歌.mp3', { type: 'audio/mpeg' }) });
        await 环2.工具.恢复备份(果.blob, { 模式: '覆盖' });
        const 音表 = await 全取(环2.w, '音乐库', '音频');
        ok(音表.length === 1 && 音表[0].id === 'u_song1',
            'D20 覆盖模式清掉了备份里没有的旧曲目 实际=' + JSON.stringify(音表.map(x => x.id)));
    }

    /* ================= E. 失败必须如实上报 ================= */
    console.log('\n[E] 失败如实上报');
    {
        const { w, 工具 } = 造环境({ 'a': '1' });

        /* 坏包 */
        let 抛了 = false;
        try { await 工具.检查备份(new w.Blob([字节([1, 2, 3, 4])], { type: 'application/zip' })); }
        catch (e) { 抛了 = true; ok(/太小|结尾标记|损坏/.test(e.message), 'E1 坏包给出可读原因：' + e.message); }
        ok(抛了, 'E2 坏包必须抛错，不能静默通过');

        /* 不是本应用的包 */
        const 假包 = await 工具._内部.打包ZIP([{ 路径: 'manifest.json', 数据: JSON.stringify({ 格式版本: 1, 应用: '别的应用' }) }]);
        let 抛2 = false;
        try { await 工具.检查备份(假包); } catch (e) { 抛2 = true; ok(/不是/.test(e.message), 'E3 异应用备份被拒：' + e.message); }
        ok(抛2, 'E4 异应用备份必须抛错');

        /* 版本过新 */
        const 新包 = await 工具._内部.打包ZIP([
            { 路径: 'manifest.json', 数据: JSON.stringify({ 格式版本: 99, 应用: '小喵叽' }) },
            { 路径: 'localStorage.json', 数据: '{}' },
        ]);
        let 抛3 = false;
        try { await 工具.检查备份(新包); } catch (e) { 抛3 = true; ok(/升级/.test(e.message), 'E5 未来版本备份提示升级：' + e.message); }
        ok(抛3, 'E6 未来版本备份必须拒绝（否则恢复出的数据结构无法解释）');

        /* localStorage 超额必须报失败项，不能装作写成功 */
        const 环超 = 造环境({});
        const 超大 = 'x'.repeat(3000);
        const 原写 = 环超.w.localStorage.setItem;
        let 拒了几次 = 0;
        环超.w.localStorage.setItem = function (k, v) {
            if (拒了几次 < 2) {
                拒了几次++;
                const e = new Error('超出配额'); e.name = 'QuotaExceededError'; throw e;
            }
            return 原写.call(this, k, v);
        };
        const 包超 = await 工具._内部.打包ZIP([
            { 路径: 'manifest.json', 数据: JSON.stringify({ 格式版本: 1, 应用: '小喵叽', 本地存储键数: 4 }) },
            { 路径: 'localStorage.json', 数据: JSON.stringify({ k1: 超大, k2: 超大, k3: 超大, k4: 超大 }) },
        ]);
        const 果超 = await 环超.工具.恢复备份(包超);
        ok(果超.失败.length === 2, 'E7 超额写入如实报 2 条失败 实际=' + 果超.失败.length);
        ok(果超.失败.every(f => /已满|配额/.test(f.原因)), 'E8 失败原因说明是空间不足 实际=' + JSON.stringify(果超.失败[0]));
        ok(果超.本地写入 === 2, 'E9 成功的 2 条照写不误 实际=' + 果超.本地写入);
    }

    /* ================= F. 文件名与降级 ================= */
    console.log('\n[F] 文件名与落地方式');
    {
        const { w, 工具 } = 造环境({});
        const 名 = 工具.默认文件名();
        ok(/^小喵叽备份_\d{4}-\d{2}-\d{2}_\d{4}\.zip$/.test(名), 'F1 默认文件名带时间戳：' + 名);
        ok(工具.支持目录选择() === false, 'F2 jsdom 无 FSA API → 报告不支持（会走 download 兜底）');
        ok(工具.有原生桥() === false, 'F3 无原生桥时如实报告');

        /* 原生桥存在时应优先走桥（分块传输）。
           ★ 桥只声明【实际会被调用的】开始写/写块/结束写 ——
             引擎靠这三个方法探测能力，多写一个用不上的标志位反而会掩盖探测不一致的问题。 */
        const 环桥 = 造环境({});
        const 写块表 = [];
        let 会话号 = 's1', 结束调用 = 0;
        环桥.w.小喵叽原生 = {
            开始写: (名, 长) => { 会话号 = '会话_' + 名 + '_' + 长; return 会话号; },
            写块: (会, b64) => { 写块表.push({ 会, b64 }); },
            结束写: (会) => { 结束调用++; return { 路径: '/sdcard/Download/' + 会 }; },
        };
        const blob = await 环桥.工具._内部.打包ZIP([{ 路径: 'a.txt', 数据: 'hello' }]);
        const 果桥 = await 环桥.工具.保存备份(blob, '测试.zip');
        ok(果桥 && 果桥.方式 === '原生', 'F4 有原生桥时优先走桥 实际=' + (果桥 && 果桥.方式));
        ok(结束调用 === 1, 'F5 结束写只调一次');
        ok(写块表.length >= 1 && 写块表.every(b => b.会 === 会话号), 'F6 所有块都归属同一会话');
        /* base64 拼回来必须与原字节一致（桥是 APP 内唯一的传输通道，错了就全丢） */
        const 拼回 = 写块表.reduce((acc, b) => {
            const 段 = 环桥.工具._内部.base64转字节(b.b64);
            const 出 = new Uint8Array(acc.length + 段.length);
            出.set(acc, 0); 出.set(段, acc.length);
            return 出;
        }, new Uint8Array(0));
        const 原字节 = new Uint8Array(await blob.arrayBuffer());
        ok(同字节(拼回, 原字节), 'F6b 分块 base64 拼回后与原始 zip 字节一致（长度 ' + 拼回.length + '）');
        ok(/\/sdcard\/Download\//.test(果桥.位置), 'F7 回传原生写入路径：' + 果桥.位置);

        /* 用户取消 → 返回 null，不抛错 */
        const 环取 = 造环境({});
        环取.w.小喵叽原生 = { 选文件读: () => ({ 取消: true }) };
        ok((await 环取.工具.选取备份文件()) === null, 'F8 原生读取取消时返回 null（不是报错）');
    }

    /* ================= G. 23 页集成：页面把引擎接对了吗 =================
       引擎单测全过 ≠ 页面接对了。这一段验的是「用户点按钮真的能走完流程」，
       以及两条安全铁律：覆盖恢复必须二次确认、恢复完必须提示刷新。 */
    console.log('\n[G] 23_beifen.html 页面集成');
    {
        const 页面源码 = fs.readFileSync(path.join(__dirname, '23_beifen.html'), 'utf8')
            .replace(/src="2【图片】\/[^"]*"/g, 'src=""');   // jsdom 不加载资源，清了免噪音

        const 数据 = {
            '联系人索引': JSON.stringify([{ id: 'c_1', 名称: '白九霄' }, { id: 'c_2', 名称: '林彦' }]),
            '聊天记录_c_1': JSON.stringify([{ 文: 'hi', 我: false }]),
            '我的动态': JSON.stringify([{ id: 'd1', 文: '今天' }]),
            '用户昵称': '小喵叽',
        };
        const 库 = new IDBFactory();
        const 写块表 = [];
        let 结束返回 = null;

        /* ★ jsdom 的 window.location 是 unforgeable 对象，给它赋值打桩会【静默失败】，
             所以「点刷新有没有真调 reload」没法靠计数桩验。
             改抓 jsdom 对未实现导航抛出的 jsdomError —— 收到它就证明 reload 真被调用了。 */
        let 导航信号 = 0;
        const 虚控 = new VirtualConsole();
        虚控.on('jsdomError', e => {
            if (/Not implemented: navigation|Not implemented/i.test(String(e && e.message || e))) 导航信号++;
        });
        虚控.on('error', () => {});     // 页面里的 console.error 不进 errors，避免噪音

        const dom = new JSDOM(页面源码, {
            runScripts: 'dangerously',
            pretendToBeVisual: true,
            url: 'http://localhost/23_beifen.html?from=8',
            virtualConsole: 虚控,
            beforeParse(w) {
                Object.defineProperty(w, 'localStorage', {
                    value: 造存储(数据), configurable: true, writable: true,
                });
                Object.defineProperty(w, 'indexedDB', { value: 库, configurable: true, writable: true });
                Object.defineProperty(w, 'IDBKeyRange', { value: global.IDBKeyRange, configurable: true, writable: true });
                Object.defineProperty(w, 'Blob', { value: global.Blob, configurable: true, writable: true });
                Object.defineProperty(w, 'File', { value: global.File, configurable: true, writable: true });
                if (!w.TextEncoder) w.TextEncoder = global.TextEncoder;
                if (!w.TextDecoder) w.TextDecoder = global.TextDecoder;
                if (!w.URL.createObjectURL) {
                    let 序 = 0;
                    w.URL.createObjectURL = () => 'blob:http://localhost/' + (++序);
                    w.URL.revokeObjectURL = () => {};
                }
                /* 模拟 APP 壳：导出走系统文件选择器（真机里就是这条路） */
                w.小喵叽原生 = {
                    开始写: (名) => '会话_' + 名,
                    写块: (会, b64) => { 写块表.push({ 会, b64 }); },
                    结束写: () => { 结束返回 = { 路径: '/sdcard/Download/小喵叽备份.zip' }; return 结束返回; },
                };
            },
        });
        const w = dom.window;
        await new Promise(r => w.addEventListener('load', r));
        await 等到(w, () => w.__备份页 && !w.__备份页.导出中() &&
            w.document.getElementById('数联系人').textContent !== '–', 3000);

        const $ = id => w.document.getElementById(id);
        const 页 = w.__备份页;

        ok(!!w.备份工具, 'G1 页面内联了备份引擎（window.备份工具 存在）');
        ok(!!页 && typeof 页.做导出 === 'function', 'G2 页面脚本执行完毕（探针就位）');
        ok($('数联系人').textContent === '2', 'G3 概况显示 2 个联系人 实际=' + $('数联系人').textContent);
        ok($('数聊天').textContent === '1', 'G4 概况显示 1 个有聊天记录的联系人 实际=' + $('数聊天').textContent);
        ok($('数动态').textContent === '1', 'G5 概况显示 1 条动态 实际=' + $('数动态').textContent);
        ok($('数键').textContent === '4', 'G6 概况显示 4 项本地设置 实际=' + $('数键').textContent);
        ok(/APP 内/.test($('导出方式文').textContent),
            'G7 有原生桥时如实说明走系统文件选择器 实际=' + $('导出方式文').textContent);
        ok($('恢复钮').disabled === true, 'G8 未选文件时「恢复」按钮是禁用的');

        /* --- 导出：点按钮 → 引擎采集 → 桥写盘 --- */
        $('导出钮').click();
        await 等到(w, () => !页.导出中(), 5000);
        ok(结束返回 !== null, 'G9 点导出后备份真的写到了原生层');
        ok(/已导出/.test($('导出状态文').textContent) && $('导出状态行').classList.contains('成功'),
            'G10 导出状态行显示成功 实际=' + $('导出状态文').textContent);
        ok(写块表.length >= 1, 'G11 数据经分块传给原生（' + 写块表.length + ' 块）');

        /* 把桥收到的字节拼回 zip，验证它是个能解析的真备份 */
        const 拼回 = 写块表.reduce((acc, b) => {
            const 段 = w.备份工具._内部.base64转字节(b.b64);
            const 出 = new Uint8Array(acc.length + 段.length);
            出.set(acc, 0); 出.set(段, acc.length);
            return 出;
        }, new Uint8Array(0));
        const 导出包 = new global.Blob([拼回], { type: 'application/zip' });
        const 检 = await w.备份工具.检查备份(导出包);
        ok(检 && 检.本地存储键数 === 4, 'G12 导出的 zip 可解析且含 4 项本地设置 实际=' + (检 && 检.本地存储键数));

        /* --- 没选包就点恢复：必须拦下，不能默默执行 --- */
        const 恢复钮 = $('恢复钮');
        恢复钮.disabled = false;                 // 绕过 UI 禁用，验逻辑本身的防线
        恢复钮.click();
        await 等(60);
        ok($('确认层').classList.contains('显示') === false, 'G13 没有备份包时点恢复不会弹确认层（直接拦下）');
        ok(/请先选择备份文件/.test($('toast').textContent), 'G14 明确提示「请先选择备份文件」实际=' + $('toast').textContent);

        /* --- 覆盖恢复：必须先二次确认，且文案说清会清空 --- */
        页.设当前包({ blob: 导出包, 名: '小喵叽备份.zip', 检 });
        页.设模式('覆盖');
        恢复钮.click();
        await 等(80);
        ok($('确认层').classList.contains('显示'), 'G15 ★ 覆盖恢复前弹出了确认层（破坏性操作必须二次确认）');
        ok(/清空/.test($('确认文').textContent),
            'G16 ★ 确认文案写明「会被清空」实际=' + $('确认文').textContent);
        ok($('确认文').classList.contains('警告'), 'G17 覆盖模式的确认文案是警告色');
        ok($('确认题').textContent.indexOf('覆盖') >= 0, 'G18 标题写明是「覆盖恢复」实际=' + $('确认题').textContent);

        /* 取消 → 一个字节都不能写 */
        $('确认取消').click();
        await 等(60);
        ok($('确认层').classList.contains('显示') === false, 'G19 点取消关闭确认层');
        ok(数据['用户昵称'] === '小喵叽' && $('恢复状态行').classList.contains('成功') === false,
            'G20 取消后没有执行恢复');

        /* --- 合并模式：文案不能吓人说清空 --- */
        页.设模式('合并');
        恢复钮.click();
        await 等(80);
        ok($('确认层').classList.contains('显示'), 'G21 合并模式同样要确认');
        ok(!/清空/.test($('确认文').textContent),
            'G22 ★ 合并模式的文案不含「清空」（否则会误导用户以为数据会丢）实际=' + $('确认文').textContent);
        ok(/保留/.test($('确认文').textContent), 'G23 合并模式说明本机新数据会保留');
        ok($('确认题').textContent.indexOf('合并') >= 0, 'G24 标题写明是「合并恢复」');

        /* --- 真执行：恢复完成后必须提示刷新 --- */
        $('确认执行').click();
        await 等到(w, () => !页.恢复中() && $('确认层').classList.contains('显示'), 6000);
        ok(/恢复完成/.test($('恢复状态文').textContent),
            'G25 恢复状态行显示完成 实际=' + $('恢复状态文').textContent);
        ok($('结果区').classList.contains('显示'), 'G26 显示了结果清单');
        ok($('确认层').classList.contains('显示') && /刷新/.test($('确认文').textContent),
            'G27 ★ 恢复完弹出「需要刷新」提示（各页 DOM 是进入时渲染的，不刷新看不到新数据）');
        ok($('确认执行').textContent.indexOf('刷新') >= 0, 'G28 确认按钮给的是「立即刷新」实际=' + $('确认执行').textContent);
        /* ★ 不打桩 location.reload（jsdom 的 Location 不可写，桩会静默失效）。
             点「立即刷新」→ 页面调 reload → jsdom 抛「未实现导航」→ 虚控计数 +1。
             收到这个信号就证明 reload 真被调用了，比一个恒为 0 的计数桩可靠。 */
        const 导航前 = 导航信号;
        $('确认执行').click();
        await 等到(w, () => 导航信号 > 导航前, 1500);
        ok(导航信号 > 导航前, 'G29 点「立即刷新」真的调用了 location.reload（收到 jsdom 导航信号 ' + (导航信号 - 导航前) + ' 次）');

        /* --- 恢复后概况要跟着变（否则会一直显示旧数字骗人） --- */
        await 等到(w, () => $('数联系人').textContent === '2', 2000);
        ok($('数联系人').textContent === '2', 'G30 恢复后概况刷新为备份里的数量 实际=' + $('数联系人').textContent);
        w.close();
    }

    /* ================= H. 唯一源内联一致性 =================
       守住 同步备份.js 的约定：改了 备份.js 忘了跑同步，页面就还在跑旧引擎，
       而且这种漂移没有任何报错，只能靠这条断言拦。 */
    console.log('\n[H] 内联一致性（唯一源约定）');
    {
        const html = fs.readFileSync(path.join(__dirname, '23_beifen.html'), 'utf8');
        const 收 = '    </script>\n';
        const 查 = (锚, 源文件, 编号) => {
            const 源 = fs.readFileSync(path.join(__dirname, 源文件), 'utf8');
            const 起 = html.indexOf(锚);
            if (起 < 0) { ok(false, 编号 + ' 页面缺少锚点 ' + 锚.trim()); return; }
            const 正文起 = 起 + 锚.length;
            const 止 = html.indexOf(收, 正文起);
            if (止 < 0) { ok(false, 编号 + ' 内联块没有收尾 </script>'); return; }
            const 内联 = html.slice(正文起, 止);
            ok(内联 === 源 + '\n' || 内联 === 源,
                编号 + ' 页面内联的 ' + 源文件 + ' 与源文件完全一致（不一致就跑 node 同步备份.js）');
        };
        查('    <script id="备份引擎">\n', '备份.js', 'H1');
        查('    <script id="全局音乐">\n', '全局音乐.js', 'H2');
        /* 源里出现 </script 会把内联块提前截断，后果是页面后半段代码全跑到 HTML 里 */
        const 源 = fs.readFileSync(path.join(__dirname, '备份.js'), 'utf8');
        ok(!源.toLowerCase().includes('</script'), 'H3 备份.js 不含 </script（否则内联会被截断）');
    }

    收尾(errors, '\n✓ verify_beifen 全部通过');
})().catch(e => {
    console.error('\n!! 脚本崩溃：', e);
    process.exit(1);
});
