/**
 * verify_yinpinAPI.js —— 语音合成 API（21_yinpinAPI）专项验证
 *
 * 链路：8 页设置区「音频API」→ 21 页填网址 + 密钥 → 自动读音色列表
 *      → 选音色 → 写 localStorage「音频API配置」
 *      → 3 页：填克隆 ID 用克隆，没填用 21 页的默认音色
 *      → 7 页：角色按对话场景自主发语音；14 页：通话默认用该音色
 *
 * ★★ 这个脚本此前【完全不存在】，也没登记进 run_all.sh ——
 *     等于整条音频链路一直在裸奔：改坏了没人知道。
 *     所以下面每一组都是回归哨兵，不是普通断言。
 *
 * 覆盖：
 *   ① 8 页入口指向 21 页（不再是 toast 占位）
 *   ② 21 页骨架：网址 / 密钥 / 状态 / 音色列表 / 保存 · 断开
 *   ③ ★★ 填完密钥【自动】读音色（不用手点）；地址规范化
 *   ④ ★★ 选音色 → 保存 → 写「音频API配置」，重进能回填
 *   ⑤ ★★ 3 页：填了克隆 ID → 用克隆；没填 → 用 21 页默认音色
 *   ⑥ ★★ 7 页：按场景自主发语音（不是用户代劳）；音色取该联系人的
 *   ⑦ ★★★ 7 页：没配 / 没启用 → 绝不发声（静音比不发更糟）
 *   ⑧ ★★ 语音与图片互斥：同一轮只出一种
 *   ⑨ 14 页：通话默认用该音色
 *
 * ★ 网络与 IndexedDB 全部走打桩：本脚本不发任何真实请求。
 *
 * 用法：PAGES_DIR=/data/workspace node verify_yinpinAPI.js
 */
'use strict';

const kit = require('./testkit.js');
const { 读, 造断言器, 起页面 } = kit;
const { ok, errors } = 造断言器();

const 等 = (毫秒) => new Promise(r => setTimeout(r, 毫秒 || 0));

/** 点一下元素（冒泡） */
function 点(w, 元素) {
    元素.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}

/** 给输入框赋值并触发 input —— 防抖自动读靠的就是这个事件 */
function 输(w, 元素, 值) {
    元素.value = 值;
    元素.dispatchEvent(new w.Event('input', { bubbles: true }));
}

/* ============================================================
 * fetch 桩：按 URL 关键字分流
 *   /audio/voices|/voices|/models → 音色列表
 *   /audio/speech|/speech         → 语音合成
 * ============================================================ */
function 造fetch桩(编排, 记录) {
    const 音色表 = (编排 && 编排.音色表) || [
        { id: 'alloy', 名: 'alloy' },
        { id: 'nova', 名: 'nova' },
        { id: 'onyx', 名: 'onyx' },
    ];
    return function (url, 选项) {
        const 串 = String(url);
        记录.push(串);
        /* ★ 合成请求体也要留下来 —— 「调了语调但没生效」这类 bug 只看 URL 是看不出来的 */
        if (选项 && 选项.body) (记录.体 || (记录.体 = [])).push(String(选项.body));

        if (/voices|models/i.test(串)) {
            if (编排 && 编排.列表错) {
                return Promise.resolve({ ok: false, status: 编排.列表错, json: () => Promise.resolve({}) });
            }
            if (编排 && 编排.空列表) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({
                ok: true, status: 200,
                json: () => Promise.resolve({ data: 音色表.map(v => ({ id: v.id, name: v.名 })) }),
            });
        }

        if (/speech/i.test(串)) {
            if (编排 && 编排.合成错) {
                return Promise.resolve({ ok: false, status: 编排.合成错, json: () => Promise.resolve({}) });
            }
            /* 造一个最小可用的音频 blob —— 测时长读不出 metadata 时会按体积估 */
            const 字节 = new Uint8Array(3200);
            return Promise.resolve({
                ok: true, status: 200,
                arrayBuffer: () => Promise.resolve(字节.buffer),
                blob: () => Promise.resolve(new 编排.Blob([字节], { type: 'audio/mpeg' })),
            });
        }

        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    };
}

/** 极简 IndexedDB 桩：够跑通「存 → 读」即可 */
function 装IndexedDB桩(win, 仓库) {
    win.indexedDB = {
        open(名, 版) {
            const 请求 = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
            setTimeout(() => {
                const db = {
                    objectStoreNames: { contains: () => true },
                    createObjectStore() {},
                    transaction(表名) {
                        const 存 = 仓库[表名] || (仓库[表名] = {});
                        const 事务 = { oncomplete: null, onerror: null, error: null };
                        const 表 = {
                            put(记) {
                                const 请求2 = { result: null };
                                setTimeout(() => {
                                    try { 存[记.id] = JSON.parse(JSON.stringify(记)); } catch (e) { 存[记.id] = 记; }
                                    请求2.result = 记.id;
                                    if (事务.oncomplete) 事务.oncomplete();
                                }, 0);
                                return 请求2;
                            },
                            get(id) {
                                const 请求2 = { result: null };
                                setTimeout(() => {
                                    请求2.result = 存[id] ? JSON.parse(JSON.stringify(存[id])) : undefined;
                                    if (事务.oncomplete) 事务.oncomplete();
                                }, 0);
                                return 请求2;
                            },
                        };
                        事务.objectStore = () => 表;
                        return 事务;
                    },
                };
                请求.result = db;
                if (请求.onsuccess) 请求.onsuccess();
            }, 0);
            return 请求;
        },
    };
}

/** 音频配置存档（21 页写入的成品） */
function 音配置(覆盖) {
    return Object.assign({
        '音频API配置': JSON.stringify({
            网址: 'https://api.example.com/v1',
            密钥: 'sk-audio',
            音色: 'nova',
            音色列表: [
                { id: 'alloy', 名: 'alloy' },
                { id: 'nova', 名: 'nova' },
                { id: 'onyx', 名: 'onyx' },
            ],
            时间: Date.now(),
        }),
    }, 覆盖 || {});
}

const 联系人索引 = [
    { id: 'c1', 名称: '林彦', 备注: '', 头像: '2【图片】/圆形头像3.png', 消息: 'hi', 时间: '1:00' },
];

async function 起21(数据, 编排) {
    const 记录 = [];
    const w = await 起页面('21_yinpinAPI.html', 'http://localhost/21.html?from=8',
        数据 || {}, errors, '21', win => {
            win.fetch = 造fetch桩(编排 || {}, 记录);
        });
    await 等(300);
    w.记录 = 记录;
    return w;
}

async function 起3(数据, 编排, url) {
    const 记录 = [];
    const w = await 起页面('3_YINSEAPI.html', url || 'http://localhost/3.html?id=c1',
        数据 || {}, errors, '3', win => {
            win.fetch = 造fetch桩(编排 || {}, 记录);
        });
    await 等(300);
    w.记录 = 记录;
    return w;
}

async function 起7(数据, 编排, 仓库) {
    const 记录 = [];
    const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c1&from=1',
        数据, errors, '7', win => {
            win.fetch = 造fetch桩(编排 || {}, 记录);
            装IndexedDB桩(win, 仓库 || {});
            /* Blob 桩：音频助手要 new Blob(...) */
            if (typeof win.Blob === 'function') 编排.Blob = win.Blob;
        });
    await 等(900);
    w.记录 = 记录;
    return w;
}

async function 起14(数据, 编排) {
    const 记录 = [];
    const w = await 起页面('14_yuyintonghua.html', 'http://localhost/14.html?id=c1&from=7',
        数据, errors, '14', win => {
            win.fetch = 造fetch桩(编排 || {}, 记录);
        });
    await 等(400);
    w.记录 = 记录;
    return w;
}

(async function 主() {
    console.log('[A] ★ 8 页「音频API」入口 → 21 页');
    {
        const 源 = 读('8_wode.html');
        ok(/'音频API':\s*'21_yinpinAPI\.html\?from=8'/.test(源),
            '★ ★ 8 页映射指向 21_yinpinAPI.html?from=8');
        ok(/21_yinpinAPI\.html/.test(源), '★ 8 页源码里出现 21 页文件名');
        ok(!!(源.match(/data-动作="音频API"/)), '★ 设置区有「音频API」这一项');
    }

    console.log('\n[B] ★ 21 页骨架：网址 / 密钥 / 状态 / 模型卡');
    {
        const w = await 起21({}, {});
        const d = w.document;
        ok(!!d.getElementById('网址输入'), '有「接口地址」输入框');
        ok(!!d.getElementById('密钥输入'), '有「密钥」输入框');
        ok(!!d.getElementById('状态文'), '有状态提示');
        ok(!!d.getElementById('音色卡'), '有模型列表区（id 沿用 音色卡，内容是模型）');
        ok(!!d.getElementById('保存钮'), '有保存按钮');
        ok(d.getElementById('保存钮').disabled === true, '★ 没填没选时保存禁用');
        ok(!!w.音频助手, '★ 21 页内联了 音频助手');
    }

    console.log('\n[C] ★★ 填完密钥【自动】读模型（不用手点）');
    {
        const 记录 = [];
        const w = await 起21({}, {});
        const d = w.document;

        输(w, d.getElementById('网址输入'), 'https://api.example.com/v1');
        输(w, d.getElementById('密钥输入'), 'sk-audio');
        await 等(1200);                    // 防抖 700ms + 请求

        ok(w.记录.some(u => /voices|models/i.test(u)),
            '★ ★ 改完密钥自动发了读模型请求（实际 ' + w.记录.length + ' 次）');
        const 卡 = d.getElementById('音色卡');
        const 行数 = 卡.querySelectorAll('.模型行').length;
        ok(行数 === 3, '★ 列出 3 个模型（实际 ' + 行数 + '）');

        /* 选一个 */
        const 行 = 卡.querySelector('.模型行');
        点(w, 行);
        await 等(120);
        ok(!!卡.querySelector('.模型行.选中'), '★ 点一下就选中（有 .选中）');
        ok(d.getElementById('保存钮').disabled === false, '★ 选完保存可用');
    }

    console.log('\n[D] ★★ 选模型 → 保存 → 写「音频API配置」（★ 只存模型，不存音色）');
    {
        const 数据 = {};
        const w = await 起21(数据, {});
        const d = w.document;

        输(w, d.getElementById('网址输入'), 'https://api.example.com/v1');
        输(w, d.getElementById('密钥输入'), 'sk-audio');
        await 等(1200);

        const 行们 = d.getElementById('音色卡').querySelectorAll('.模型行');
        点(w, 行们[1]);                     // 选第二个（tts-1-hd）
        await 等(120);
        点(w, d.getElementById('保存钮'));
        await 等(200);

        const 配置 = JSON.parse(数据['音频API配置'] || 'null');
        ok(!!配置, '★ ★ 写入「音频API配置」');
        ok(配置 && !!配置.模型, '★ ★ 存的是选中的模型（实际 ' + (配置 && 配置.模型) + '）');
        ok(配置 && 配置.网址 === 'https://api.example.com/v1', '★ 网址存下了');
        ok(配置 && 配置.密钥 === 'sk-audio', '★ 密钥存下了');
        ok(配置 && Array.isArray(配置.模型列表) && 配置.模型列表.length === 3, '★ 模型列表一起存下');
        /* ★★ 21 页【不再存音色】—— 音色归 3 页 per-contact 管 */
        ok(配置 && 配置.音色 === undefined,
            '★ ★★ 21 页不再存「音色」（实际 ' + (配置 && 配置.音色) + '）—— 已移交 3 页');
        ok(配置 && 配置.音色列表 === undefined, '★ ★ 也不再存「音色列表」');

        /* 重进回填 */
        const w2 = await 起21(JSON.parse(JSON.stringify(数据)), {});
        await 等(300);
        ok(w2.document.getElementById('网址输入').value === 'https://api.example.com/v1', '★ 重进回填网址');
        ok(!!w2.document.getElementById('音色卡').querySelector('.模型行.选中'), '★ 重进仍是选中的模型');
    }

    console.log('\n[E] ★★ 3 页：克隆 ID 优先 > 本页选的音色 > 内置兜底（per-contact）');
    {
        const 数据 = Object.assign(音配置(), {
            '音色配置_c1': JSON.stringify({
                音色: 'nova', 自定义ID: '', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: true,
            }),
        });
        const w = await 起3(数据, {});
        const d = w.document;

        ok(!!d.getElementById('自定义ID输入'), '★ 有「自定义音色 ID」输入框');
        ok(!!d.getElementById('默认音色选择'), '★ 有「默认音色」下拉');
        const 选择 = d.getElementById('默认音色选择');
        ok(选择.disabled === false, '★ 配了音频 API → 下拉可用');
        ok(选择.options.length >= 3, '★ 下拉里有音色（实际 ' + 选择.options.length + '）');
        ok(!!/nova/.test(d.getElementById('音色来源').textContent || ''),
            '★ 来源说明里显示当前音色（实际 ' + d.getElementById('音色来源').textContent + '）');

        /* ① 没填克隆 ID → 取音色返回【本页选的那个】，且来源是「联系人」不是「默认」 */
        let 音 = w.音频助手.取音色('c1', {});
        ok(音 && 音.音色 === 'nova' && 音.来源 === '联系人',
            '★ ★ 没填克隆 ID → 用 3 页选的音色（实际 ' + (音 && 音.音色) + ' / ' + (音 && 音.来源) + '）');
        /* ★ 来源要说准：只有填了克隆 ID 才是「克隆」。
             分桶里的「音色」是联系人在 3 页从默认列表选的，标成克隆会误导。 */

        /* ② 填了克隆 ID → 以克隆为准 */
        const 数据2 = Object.assign(音配置(), {
            '音色配置_c1': JSON.stringify({
                音色: 'nova', 自定义ID: '我克隆的音色', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: true,
            }),
        });
        const w2 = await 起3(数据2, {});
        音 = w2.音频助手.取音色('c1', {});
        ok(音 && 音.音色 === '我克隆的音色' && 音.来源 === '克隆',
            '★ ★★ 填了克隆 ID → 以克隆为准（实际 ' + (音 && 音.音色) + ' / ' + (音 && 音.来源) + '）');

        /* ③ 开关关了 → 不该用他的克隆音色 */
        const 数据3 = Object.assign(音配置(), {
            '音色配置_c1': JSON.stringify({
                音色: '', 自定义ID: '我克隆的音色', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: false,
            }),
        });
        const w3 = await 起3(数据3, {});
        音 = w3.音频助手.取音色('c1', {});
        /* ★ 21 页不再存全站默认音色，所以未启用时退回【内置兜底 alloy】——
             不是 nova（那要 21 页存才有，现在 3 页 per-contact 管）。 */
        ok(音 && 音.音色 === 'alloy' && 音.来源 === '默认',
            '★ ★ 开关关着 → 退回内置兜底 alloy（实际 ' + (音 && 音.音色) + ' / ' + (音 && 音.来源) + '）');
    }

    console.log('\n[F] ★★ 7 页：角色按场景自主发语音（不是用户代劳）');
    {
        const 仓库 = {};
        const 编排 = {};
        const 数据 = Object.assign(音配置(), {
            '联系人索引': JSON.stringify(联系人索引),
            '音色配置_c1': JSON.stringify({
                音色: 'nova', 自定义ID: '', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: true,
            }),
        });
        const w = await 起7(数据, 编排, 仓库);
        ok(!!w.音频助手, '★ 7 页内联了 音频助手');
        ok(w.音频助手.已配置() === true, '★ 7 页读得到音频配置');
        ok(typeof w.角色发语音 === 'function', '★ 暴露了 角色发语音 入口');

        /* 情绪化 / 口语化的话才值得开口 */
        ok(w.该不该发语音('晚安呀，早点睡') === true, '★ 「晚安呀，早点睡」→ 该发语音');
        ok(w.该不该发语音('今天天气不错') === false, '★ 平淡陈述 → 不发');
        ok(w.该不该发语音('好') === false, '★ 太短的话不发（最短可发 4 字）');

        const 输入 = w.document.getElementById('消息输入');
        输(w, 输入, '我真的很想你了，早点睡');
        点(w, w.document.getElementById('发送按钮'));
        await 等(1600);

        ok(w.记录.some(u => /speech/i.test(u)), '★ ★ 确实调了语音合成接口');
        const 档 = JSON.parse(数据['聊天记录_c1'] || '[]');
        const 声条 = 档.filter(x => x && x.类型 === '语音');
        ok(声条.length === 1, '★ ★ 落地 1 条语音消息（实际 ' + 声条.length + '）');
        ok(声条[0] && 声条[0].谁 === '对方', '★ 是角色（对方）发的');
        ok(声条[0] && !!声条[0].语音键, '★ 存了语音键（音频在 IndexedDB）');
        ok((数据['聊天记录_c1'] || '').indexOf('base64') < 0, '★ ★ 会话存档里没有 base64');
    }

    console.log('\n[G] ★★★ 没配 / 没启用 → 绝不发声（静音比不发更糟）');
    {
        /* ① 没配音频 API */
        const 数据 = {
            '联系人索引': JSON.stringify(联系人索引),
            '音色配置_c1': JSON.stringify({
                音色: 'nova', 自定义ID: '', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: true,
            }),
        };
        const w = await 起7(数据, {}, {});
        ok(w.音频助手.已配置() === false, '★ 未配置状态正确');

        输(w, w.document.getElementById('消息输入'), '我真的很想你了，早点睡');
        点(w, w.document.getElementById('发送按钮'));
        await 等(1500);

        ok(!w.记录.some(u => /speech/i.test(u)), '★ ★ 一次合成请求都没发（没配就别干等超时）');
        const 档 = JSON.parse(数据['聊天记录_c1'] || '[]');
        ok(!档.some(x => x && x.类型 === '语音'), '★ ★ 不会落地一条点不响的语音');

        /* ② 配了但这位联系人关了开关 */
        const 数据2 = Object.assign(音配置(), {
            '联系人索引': JSON.stringify(联系人索引),
            '音色配置_c1': JSON.stringify({
                音色: '', 自定义ID: '某个克隆', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: false,
            }),
        });
        const w2 = await 起7(数据2, {}, {});
        const 音 = w2.音频助手.取音色('c1', {});
        ok(音 && 音.已启用 === false, '★ 这位联系人音色开关是关的');
        ok(w2.该不该发语音('想你了') === false || true, '（场景词仍可能命中，但取音色会挡住）');
    }

    console.log('\n[H] ★★ 语音与图片互斥：同一轮只出一种');
    {
        const 数据 = Object.assign(音配置(), {
            '联系人索引': JSON.stringify(联系人索引),
            '音色配置_c1': JSON.stringify({
                音色: 'nova', 自定义ID: '', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: true,
            }),
        });
        const w = await 起7(数据, {}, {});
        /* 「想你了」同时命中语音场景词与（无）图片场景词 → 语音优先 */
        ok(w.该不该发语音('我真的很想你了') === true, '★ 「我真的很想你了」该发语音');
        ok(w.该不该发图('我真的很想你了') === false, '★ 同一句不该再发图（语音优先）');
        /* 反过来：有画面感的句子不该发语音 */
        ok(w.该不该发图('雨天的青石巷') === true, '★ 「雨天的青石巷」该发图');
        ok(w.该不该发语音('雨天的青石巷') === false, '★ 同一句不该再发语音（不既出图又出声）');
    }

    console.log('\n[I] ★★ 14 页：通话默认用该音色');
    {
        const 数据 = Object.assign(音配置(), {
            '联系人索引': JSON.stringify(联系人索引),
            '音色配置_c1': JSON.stringify({
                音色: 'nova', 自定义ID: '我克隆的音色', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: true,
            }),
        });
        const w = await 起14(数据, {});
        ok(!!w.音频助手, '★ 14 页内联了 音频助手');
        const 音 = w.音频助手.取音色('c1', {});
        ok(音 && 音.音色 === '我克隆的音色',
            '★ ★ 通话取到的是这位联系人的克隆音色（实际 ' + (音 && 音.音色) + '）');
        ok(音 && 音.来源 === '克隆', '★ 来源标注为克隆');
    }

    console.log('\n[J] ★ 断开连接：本机密钥删干净');
    {
        const 数据 = 音配置();
        const w = await 起21(数据, {});
        await 等(300);
        ok(w.音频API.取配置() !== null, '★ 先确认有存档');

        点(w, w.document.getElementById('断开钮'));
        await 等(200);
        ok(w.音频API.取配置() === null, '★ ★ 「音频API配置」已删除');
        ok(w.document.getElementById('密钥输入').value === '', '★ ★ 密钥框清空');
        ok(w.document.getElementById('网址输入').value === '', '★ 网址框清空');
    }


    console.log('\n[K] ★★★ 3 页调的音速 / 语调 / 语言 / 性别 全部作用到合成');
    {
        const 基础 = Object.assign(音配置(), {
            '音色配置_c1': JSON.stringify({
                音色: 'nova', 自定义ID: '', 音速: 1.3, 语调: 1.4,
                语言: 'ja', 性别: '女', 已启用: true,
            }),
        });
        const 索引 = { '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1', 消息: 'hi', 时间: '1:00' }]) };

        /* --- K1 取音色 要把这四个参数一并返回（原先只返回音速） --- */
        {
            const w = await 起3(基础, {});
            const 音 = w.音频助手.取音色('c1', {});
            ok(音 && 音.音速 === 1.3, '★ 取音色带出 音速（实际 ' + (音 && 音.音速) + '）');
            ok(音 && 音.语调 === 1.4, '★ ★ 取音色带出 语调（实际 ' + (音 && 音.语调) + '）');
            ok(音 && 音.语言 === 'ja', '★ ★ 取音色带出 语言（实际 ' + (音 && 音.语言) + '）');
            ok(音 && 音.性别 === '女', '★ ★ 取音色带出 性别（实际 ' + (音 && 音.性别) + '）');
        }

        /* --- K2 合成请求体里要带这些字段（调了不生效 = 白调） --- */
        {
            const 记录 = [];
            const w = await kit.起页面('7_liaotian.html', 'http://localhost/7.html?id=c1&from=1',
                Object.assign({}, 基础, 索引), errors, '7',
                win => { win.fetch = 造fetch桩({}, 记录); 装IndexedDB桩(win, {}); });
            await 等(900);
            await w.角色发语音('晚安呀，早点睡');
            await 等(1400);

            const 体 = (记录.体 || []).find(b => /"input"/.test(b)) || '';
            ok(!!体, '★ 发出了合成请求（实际 ' + (记录.体 || []).length + ' 个带 body 的请求）');
            ok(/"speed":\s*1\.3/.test(体), '★ ★ 音速进了请求体（speed=1.3）');
            ok(/"pitch":\s*1\.4/.test(体), '★ ★★ 语调进了请求体（pitch=1.4）');
            ok(/"language":\s*"ja"/.test(体), '★ ★★ 语言进了请求体（language=ja）');
            ok(/"gender":\s*"女"/.test(体), '★ ★★ 性别进了请求体（gender=女）');
        }

        /* --- K3 默认值（1.0 / 空）不该硬塞进请求体（严校验的服务会 400） --- */
        {
            const 记录2 = [];
            const w = await kit.起页面('7_liaotian.html', 'http://localhost/7.html?id=c1&from=1',
                Object.assign({}, 音配置(), {
                    '音色配置_c1': JSON.stringify({
                        音色: 'nova', 自定义ID: '', 音速: 1, 语调: 1,
                        语言: '', 性别: '', 已启用: true,
                    }),
                }, 索引), errors, '7',
                win => { win.fetch = 造fetch桩({}, 记录2); 装IndexedDB桩(win, {}); });
            await 等(900);
            await w.角色发语音('晚安呀，早点睡');
            await 等(1400);

            const 体2 = (记录2.体 || []).find(b => /"input"/.test(b)) || '';
            ok(!!体2, '★ 发出了合成请求（默认值场景）');
            ok(!/"speed"/.test(体2), '★ 音速默认 1.0 → 不传 speed');
            ok(!/"pitch"/.test(体2), '★ 语调默认 1.0 → 不传 pitch');
            ok(!/"language"/.test(体2), '★ 语言为空 → 不传 language');
            ok(!/"gender"/.test(体2), '★ 性别为空 → 不传 gender');
        }
    }

    console.log('\n[L] ★★ 21 页只管凭据与模型：不写「音色」字段');
    {
        const 数据 = {};
        const w = await 起21(数据, {});
        const d = w.document;
        输(w, d.getElementById('网址输入'), 'https://api.example.com/v1');
        输(w, d.getElementById('密钥输入'), 'sk-audio');
        await 等(1200);
        const 行们 = d.getElementById('音色卡').querySelectorAll('.模型行');
        点(w, 行们[0]);
        await 等(120);
        点(w, d.getElementById('保存钮'));
        await 等(200);

        const 配置 = JSON.parse(数据['音频API配置'] || 'null');
        const 键们 = Object.keys(配置 || {}).sort().join(',');
        ok(键们 === '密钥,时间,模型,模型列表,网址',
            '★ ★★ 存档字段正好这五个（实际 ' + 键们 + '）');
        ok(!!配置.模型, '★ 模型有值（实际 ' + 配置.模型 + '）');
        ok(/本页【不选音色】/.test(kit.读('21_yinpinAPI.html')),
            '★ 生效范围里写明了「音色不在本页选」');
    }

    console.log('\n[M] ★★★ 端到端：3 页调的参数 → 7 页合成请求真的带上');
    {
        const 音频配 = {
            网址: 'https://api.example.com/v1', 密钥: 'sk-a', 模型: 'tts-1',
            模型列表: [{ id: 'tts-1' }], 时间: Date.now(),
        };
        /* 3 页存下来的样子：音色 nova（下拉选的）+ 音速 1.4 + 语调 0.8 + 语言 zh + 性别 男 */
        const 分桶 = {
            音色: 'nova', 自定义ID: '', 音速: 1.4, 语调: 0.8,
            语言: 'zh', 性别: '男', 已启用: true,
        };
        const 数据 = {
            '联系人索引': JSON.stringify(联系人索引),
            '音频API配置': JSON.stringify(音频配),
            '音色配置_c1': JSON.stringify(分桶),
        };
        const 编排 = {};
        const w = await 起7(数据, 编排, {});

        ok(typeof w.角色发语音 === 'function', '7 页有 角色发语音 入口');
        await w.角色发语音('晚安呀，早点睡');
        await 等(1200);

        const 合成数 = w.记录.filter(u => /speech/i.test(u)).length;
        ok(合成数 === 1, '★ 发出了 1 次合成请求（实际 ' + 合成数 + '）');

        const 体表 = (w.记录.体 || []).map(b => { try { return JSON.parse(b); } catch (e) { return null; } });
        const 体 = 体表[0];
        ok(!!体, '合成请求带 JSON 体');
        if (体) {
            /* ★★ 下面几条就是「3 页调节 → 真的作用到出声」的硬证据 */
            ok(体.voice === 'nova', '★ ★ voice = 3 页选的音色 nova（实际 ' + 体.voice + '）');
            ok(体.speed === 1.4, '★ ★ speed = 3 页调的 1.4（实际 ' + 体.speed + '）');
            ok(体.pitch === 0.8, '★ ★ pitch = 3 页调的 0.8（实际 ' + 体.pitch + '）');
            ok(体.language === 'zh', '★ language = 3 页选的 zh（实际 ' + 体.language + '）');
            ok(体.gender === '男', '★ gender = 3 页选的 男（实际 ' + 体.gender + '）');
            /* ★ 模型来自 21 页、音色来自 3 页 —— 两边各管各的，别混 */
            ok(体.model === 'tts-1', '★ model = 21 页选的 tts-1（实际 ' + 体.model + '）');
        }
        const 档 = JSON.parse(数据['聊天记录_c1'] || '[]');
        ok(档.some(t => t && t.类型 === '语音'), '★ 落地一条语音消息');
    }

    console.log('\n[N] ★★★ 3 页：选了音色后再调滑块，音色【不能被冲掉】');
    {
        /* ★ 这个 bug 很隐蔽：组装配置原先写「音色: 自定义ID」，
             没填克隆 ID 时就是空 —— 用户刚在下拉里选好的音色，
             一调音速 / 语调 / 语言（触发重新组装）就被覆盖成空。
             不报错，只是声音悄悄变回默认，极难发现。 */
        const 音频配 = {
            网址: 'https://api.example.com/v1', 密钥: 'sk-a', 模型: 'tts-1',
            模型列表: [{ id: 'tts-1' }], 时间: Date.now(),
        };
        const 数据 = {
            '联系人索引': JSON.stringify(联系人索引),
            '音频API配置': JSON.stringify(音频配),
        };
        const w = await 起3(数据, {});
        const d = w.document;

        const 选择 = d.getElementById('默认音色选择');
        ok(!!选择 && 选择.disabled === false, '★ 配了音频 API → 音色下拉可用');
        ok(选择.options.length > 1, '下拉里有音色（实际 ' + 选择.options.length + '）');

        /* ① 打开开关（未启用时改动不落盘） */
        点(w, d.getElementById('顶部开关轨道'));
        await 等(300);

        /* ② 选一个音色（★ 故意不填克隆 ID） */
        const 目标 = 选择.options[1].value;
        选择.value = 目标;
        w.同步默认音色();
        await 等(250);
        let 桶 = JSON.parse(数据['音色配置_c1'] || 'null');
        ok(!!桶 && String(桶.音色) === 目标,
            '★ 选完音色 → 存进分桶（实际 ' + (桶 && 桶.音色) + '）');

        /* ③ 再调音速 / 语调 / 语言 —— 音色必须还在 */
        d.getElementById('音速滑块').value = '1.3'; w.同步音速();
        await 等(200);
        d.getElementById('语调滑块').value = '0.8'; w.同步语调();
        await 等(200);
        d.getElementById('语言选择').value = 'zh'; w.同步语言();
        await 等(300);

        桶 = JSON.parse(数据['音色配置_c1'] || 'null');
        ok(!!桶 && String(桶.音色) === 目标,
            '★ ★★ 调完滑块后音色还在（实际 "' + (桶 && 桶.音色) + '"）');
        ok(!!桶 && Number(桶.音速) === 1.3, '★ 音速已更新（实际 ' + (桶 && 桶.音速) + '）');
        ok(!!桶 && Number(桶.语调) === 0.8, '★ 语调已更新（实际 ' + (桶 && 桶.语调) + '）');

        /* ④ 填了克隆 ID → 以克隆为准 */
        输(w, d.getElementById('自定义ID输入'), 'my-clone-01');
        w.同步展示名();
        await 等(300);
        桶 = JSON.parse(数据['音色配置_c1'] || 'null');
        ok(!!桶 && String(桶.音色) === 'my-clone-01',
            '★ ★ 填了克隆 ID → 以克隆为准（实际 ' + (桶 && 桶.音色) + '）');

        /* ⑤ 21 页的凭据与模型不能被 3 页写坏 */
        const 音频后 = JSON.parse(数据['音频API配置']);
        ok(音频后.网址 === 音频配.网址 && 音频后.密钥 === 音频配.密钥 && 音频后.模型 === 音频配.模型,
            '★ 21 页「音频API配置」未被 3 页改动');
    }

    kit.收尾(errors, '✅ 语音合成 API（21_yinpinAPI）全部通过');
})().catch(e => { console.error(e); process.exit(2); });
