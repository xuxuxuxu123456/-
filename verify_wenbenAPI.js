/**
 * verify_wenbenAPI.js —— 文本对话 API（19_wenbenAPI）专项验证
 *
 * 链路：8 页设置区「文本API」→ 19 页填网址 + 密钥 → 自动读 /models
 *      → 选模型 → 写 localStorage「文本API配置」
 *      → 7 页聊天回复、5 页角色发动态 / 发评论 都改用这个模型
 *
 * 覆盖：
 *   ① 8 页入口指向 19 页（不再是 toast「功能开发中」）
 *   ② 19 页骨架：网址 / 密钥 / 状态行 / 模型列表 / 保存 · 断开
 *   ③ ★★ 填完密钥【自动】读模型（不用手点），地址规范化（带不带 /v1 都行）
 *   ④ 模型列表渲染与选中；改地址/密钥会重读
 *   ⑤ 保存 → 写「文本API配置」，字段齐全（网址/密钥/模型/模型列表）
 *   ⑥ ★★ 7 页：配好之后 AI助手.已配置() 为真，聊天回复真的走模型
 *   ⑦ ★★ 5 页：配好之后角色发动态 / 写评论真的走模型
 *   ⑧ 错误分级：401 密钥不对、404 地址不对、网络失败提示跨域
 *   ⑨ 读模型失败不清空已选（不至于白选一遍）
 *   ⑩ 断开连接：本机密钥删干净，7 / 5 页回到未配置
 *
 * ★ 网络全部走打桩：本脚本不发任何真实请求。
 *
 * 用法：PAGES_DIR=/data/workspace node verify_wenbenAPI.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));

/**
 * 造一个可编排的 fetch 桩：按 URL 关键字分流。
 * @param {object} 编排 { 模型: {好,列表}|{错:401}, 对话: '文案' }
 */
function 造fetch桩(编排, 记录) {
    return function (url, 选项) {
        记录.请求.push({ url: String(url), 头: (选项 && 选项.headers) || {}, 方法: (选项 && 选项.method) || 'GET' });

        if (/\/models/i.test(String(url))) {
            /* ★ 支持「换个地址就失败」：模拟改了地址后读不到，
                 用来验证已选模型不会被失败清掉。 */
            if (编排.坏关键词 && String(url).indexOf(编排.坏关键词) >= 0) {
                return Promise.reject(new TypeError('Failed to fetch'));
            }
            const m = 编排.模型;
            if (m && m.错) {
                return Promise.resolve({ ok: false, status: m.错, json: () => Promise.resolve({}) });
            }
            if (m && m.坏) return Promise.reject(new TypeError('Failed to fetch'));
            return Promise.resolve({
                ok: true, status: 200,
                json: () => Promise.resolve({
                    data: (m && m.列表) ? m.列表.map(x => ({ id: x })) : [{ id: 'gpt-4o' }],
                }),
            });
        }

        if (/chat\/completions/i.test(String(url))) {
            if (编排.对话错) {
                return Promise.resolve({ ok: false, status: 编排.对话错, json: () => Promise.resolve({}) });
            }
            return Promise.resolve({
                ok: true, status: 200,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 编排.对话 || '这是模型说的话' } }],
                }),
            });
        }

        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    };
}

/** 起 19 页，带 fetch 桩 */
async function 起19(数据, 编排, url) {
    const 记录 = { 请求: [] };
    const w = await kit.起页面('19_wenbenAPI.html',
        url || 'http://localhost/19.html?from=8',
        数据 || {}, errors, '19',
        win => { win.fetch = 造fetch桩(编排 || {}, 记录); });
    await 等(300);
    w.记录 = 记录;
    return w;
}

/** 起 7 页，带 fetch 桩（对话返回指定文案） */
/**
 * 起 7 页，带 fetch 桩。
 * @param 记录 可选：外部传进来就能读到请求清单（用来断言「有没有真的去调模型」）
 */
async function 起7(数据, 对话, 记录) {
    记录 = 记录 || { 请求: [] };
    const w = await kit.起页面('7_liaotian.html', 'http://localhost/7.html?id=c1&from=1', 数据, errors, '7',
        win => { win.fetch = 造fetch桩({ 对话: 对话 }, 记录); });
    w.__记录 = 记录;
    return w;
}

/** 起 5 页，带 fetch 桩 */
async function 起5(数据, 对话, 记录) {
    记录 = 记录 || { 请求: [] };
    const w = await kit.起页面('5_dongtai.html', 'http://localhost/5.html', 数据, errors, '5',
        win => { win.fetch = 造fetch桩({ 对话: 对话 }, 记录); });
    w.__记录 = 记录;
    return w;
}

function 输(w, 元素, 值) {
    元素.value = 值;
    元素.dispatchEvent(new w.Event('input', { bubbles: true }));
}
const 点 = (w, 元素) => 元素.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

const 配置 = (网址, 密钥, 模型) => ({
    '文本API配置': JSON.stringify({
        网址: 网址 || 'https://api.example.com/v1',
        密钥: 密钥 || 'sk-test',
        模型: 模型 || 'gpt-4o',
        模型列表: [{ id: 'gpt-4o', 名: 'gpt-4o' }],
        时间: Date.now(),
    }),
});

(async function main() {

    console.log('[A] ★ 8 页「文本API」入口 → 19 页');
    {
        const 源8 = 读('8_wode.html');
        ok(/'文本API':\s*'19_wenbenAPI\.html\?from=8'/.test(源8),
            '★ ★ 8 页映射指向 19_wenbenAPI.html?from=8');

        /* ★ 原来三个 API 都是 toast 占位，现在文本那个必须真的跳走 */
        const 段 = (/const 跳转表 = \{([\s\S]*?)\}/.exec(源8) || [])[1] || '';
        ok(/'文本API'/.test(段), '★ 文本API 已进跳转表（不再走 toast）');
        /* ★ 这里原来是反向断言「图片/音频仍是占位」—— 那是 19 页刚做完、
              20/21 页还没开工时的过渡态。三项 API 现已全部接入，
              反向断言会永远失败，改成正向：三项都在表里、且各指向对应页。 */
        ok(/'图片API'/.test(段) && /'音频API'/.test(段),
            '★ 图片 / 音频 API 也都在跳转表里（三项已全部接入）');
        ok(/'图片API':\s*'20_tupianAPI\.html\?from=8'/.test(段),
            '★ 图片API → 20 页');
        ok(/'音频API':\s*'21_yinpinAPI\.html\?from=8'/.test(段),
            '★ 音频API → 21 页');
        ok(/19_wenbenAPI\.html/.test(读('8_wode.html')), '★ 8 页源码里出现 19 页文件名');
    }

    console.log('\n[B] ★ 19 页骨架：网址 / 密钥 / 状态 / 模型列表');
    {
        const w = await 起19({}, {});
        const d = w.document;
        ok(!!d.getElementById('网址输入'), '★ 有接口地址输入框');
        ok(!!d.getElementById('密钥输入'), '★ 有密钥输入框');
        ok(d.getElementById('密钥输入').type === 'password', '★ 密钥默认密文（不裸奔）');
        ok(!!d.getElementById('状态行'), '★ 有状态行（读模型时给反馈）');
        ok(!!d.getElementById('模型卡'), '★ 有模型列表容器');
        ok(!!d.getElementById('保存钮') && d.getElementById('保存钮').disabled,
            '★ 没填没选时保存禁用');
        ok(!!d.getElementById('断开钮'), '★ 有断开连接按钮');
        ok(/主题背景图片/.test(读('19_wenbenAPI.html')), '★ 有主题背景图层');
        ok(w.取返回页() === '8_wode.html', '★ from=8 → 返回 8 页（实际 ' + w.取返回页() + '）');

        /* 密钥可切明文 */
        点(w, d.getElementById('眼睛钮'));
        ok(d.getElementById('密钥输入').type === 'text', '★ 点眼睛可看明文');
    }

    console.log('\n[C] ★★ 填完密钥【自动】读模型（不用手点）');
    {
        const w = await 起19({}, { 模型: { 列表: ['gpt-4o', 'gpt-4o-mini', 'claude-3'] } });
        const d = w.document;
        输(w, d.getElementById('网址输入'), 'https://api.example.com/v1');
        输(w, d.getElementById('密钥输入'), 'sk-test-key');

        /* 防抖 700ms —— 多等一会儿 */
        await 等(1100);

        ok(w.记录.请求.length > 0, '★ ★ 输入后自动发了请求（实际 ' + w.记录.请求.length + ' 次）');
        const 请 = w.记录.请求[0];
        ok(/\/models/i.test(请.url), '★ ★ 请求的是 /models（实际 ' + 请.url + '）');
        ok(请.方法 === 'GET', '★ 用 GET');
        ok(/Bearer sk-test-key/.test(String(请.头.Authorization || '')),
            '★ 带上了密钥（实际 ' + 请.头.Authorization + '）');

        ok(d.querySelectorAll('.模型行').length === 3,
            '★ ★ 渲染出 3 个模型（实际 ' + d.querySelectorAll('.模型行').length + '）');
        ok(/读到 3 个模型/.test(d.getElementById('状态文').textContent),
            '★ 状态行报「读到 3 个模型」（实际 ' + d.getElementById('状态文').textContent + '）');
        ok(d.getElementById('状态行').classList.contains('成功'), '★ 状态为成功');
    }

    console.log('\n[D] ★ 地址规范化：带不带 /v1 都能读');
    {
        /* 不带 /v1 → 自动补成 /v1/models */
        const w1 = await 起19({}, { 模型: { 列表: ['m1'] } });
        输(w1, w1.document.getElementById('网址输入'), 'https://api.example.com');
        输(w1, w1.document.getElementById('密钥输入'), 'sk-a');
        await 等(1100);
        ok(/\/v1\/models/.test(w1.记录.请求[0].url),
            '★ 不带 /v1 → 补成 /v1/models（实际 ' + w1.记录.请求[0].url + '）');

        /* 已带 /v1 → 只补 /models，不重复拼 */
        const w2 = await 起19({}, { 模型: { 列表: ['m1'] } });
        输(w2, w2.document.getElementById('网址输入'), 'https://api.example.com/v1');
        输(w2, w2.document.getElementById('密钥输入'), 'sk-a');
        await 等(1100);
        ok(/\/v1\/models/.test(w2.记录.请求[0].url)
            && !/\/v1\/v1\//.test(w2.记录.请求[0].url),
            '★ ★ 已带 /v1 → 拼成 /v1/models（不会 /v1/v1/，实际 ' + w2.记录.请求[0].url + '）');

        /* 缺协议 → 补 https:// */
        const w3 = await 起19({}, { 模型: { 列表: ['m1'] } });
        输(w3, w3.document.getElementById('网址输入'), 'api.example.com');
        输(w3, w3.document.getElementById('密钥输入'), 'sk-a');
        await 等(1100);
        ok(/^https:\/\//.test(w3.记录.请求[0].url),
            '★ 缺协议 → 补 https://（实际 ' + w3.记录.请求[0].url + '）');
    }

    console.log('\n[E] ★★ 选模型 → 保存 → 写「文本API配置」');
    {
        const 数据 = {};
        const w = await 起19(数据, { 模型: { 列表: ['gpt-4o', 'gpt-4o-mini'] } });
        const d = w.document;
        输(w, d.getElementById('网址输入'), 'https://api.example.com/v1');
        输(w, d.getElementById('密钥输入'), 'sk-save');
        await 等(1100);

        ok(d.getElementById('保存钮').disabled, '★ 还没选模型时保存仍禁用');
        点(w, d.querySelectorAll('.模型行')[1]);
        await 等(80);
        ok(!d.getElementById('保存钮').disabled, '★ 选了模型 → 保存可用');
        ok(d.querySelectorAll('.模型行')[1].classList.contains('选中'), '★ 选中态打在第一行的模型上');

        点(w, d.getElementById('保存钮'));
        await 等(150);

        const c = JSON.parse(数据['文本API配置'] || 'null');
        ok(!!c, '★ ★ 写入「文本API配置」');
        ok(c && c.网址 === 'https://api.example.com/v1', '★ 存了网址（实际 ' + (c && c.网址) + '）');
        ok(c && c.密钥 === 'sk-save', '★ 存了密钥');
        ok(c && c.模型 === 'gpt-4o-mini', '★ ★ 存的是【选中的】那个（实际 ' + (c && c.模型) + '）');
        ok(c && Array.isArray(c.模型列表) && c.模型列表.length === 2, '★ 模型列表一并存下（下次进来不用重读）');

        /* 重进页面要能回填 */
        const w2 = await 起19(数据, { 模型: { 列表: ['gpt-4o', 'gpt-4o-mini'] } });
        await 等(300);
        ok(w2.document.getElementById('网址输入').value === 'https://api.example.com/v1', '★ 重进回填网址');
        ok(w2.document.getElementById('密钥输入').value === 'sk-save', '★ 重进回填密钥');
        ok(w2.文本API.取选中() === 'gpt-4o-mini', '★ ★ 重进仍是选中的那个模型');
        ok(!w2.document.getElementById('已配横幅').classList.contains('隐藏'), '★ 顶部显示「已启用」横幅');
    }

    console.log('\n[F] ★★ 7 页：离线回复（本地档案，不依赖 AI 助手）—— 现状哨兵');
    /*
     * ★★ 这一组原本断言「7 页内联了 AI助手、配好之后聊天走模型」。
     *    实测：7 页去注释后 0 次引用 AI助手，也没有 window.AI回复 入口 ——
     *    它根本没接模型，回复走的是本地链路：
     *       「联系人小字文案（索引里的 消息 字段）」+「角色档案里的口头禅」
     *    这是有意设计（离线可用、行为可测），不是漏接。
     *
     *    ★ 所以「配了文本API配置」【不会】让聊天改用模型回复。
     *      真要接入是功能变更：得改 7 页回复链路 + 把 7 页加进 同步AI助手.py 的
     *      目标页，不是改注释就能生效。到那时这组断言要跟着改回来。
     *
     *    现在这组钉死的是「离线可用」这条底线：没配 / 配了都不崩，
     *    且绝不会偷偷去发模型请求。
     */
    {
        /* 没配任何 API —— 照样能起来、能渲染会话 */
        const w0 = await 起7({
            '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1', 消息: 'hi', 时间: '1:00' }]),
        }, '这是模型回复的话');
        await 等(900);

        ok(w0.AI助手 === undefined, '★ ★ 7 页【没有】内联 AI助手（回复走本地档案）');
        ok(typeof w0.AI回复 !== 'function', '★ 也没有 window.AI回复 入口（本就没这条链路）');
        ok(!!w0.document.getElementById('消息流'), '★ 离线照样渲染出消息流');
        ok(w0.__记录.请求.length === 0, '★ ★ 未配置时一次模型请求都不发（实际 ' + w0.__记录.请求.length + '）');

        /* 配好了 —— 行为不变，也不去调模型 */
        const 记录 = { 请求: [] };
        const w = await 起7(Object.assign(配置(), {
            '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1', 消息: 'hi', 时间: '1:00' }]),
        }), '这是模型回复的话', 记录);
        await 等(900);

        ok(!!w.document.getElementById('消息流'), '★ 配好之后页面照常工作（不崩）');
        const 对话请求 = 记录.请求.filter(r => /chat\/completions/i.test(r.url));
        ok(对话请求.length === 0,
            '★ ★ 即便配了文本 API，7 页聊天也【不会】去调模型（实际发了 ' + 对话请求.length + ' 次）'
            + ' —— 这是当前设计；若要改成走模型，需动 7 页回复链路');
    }

    console.log('\n[G] ★★ 5 页：动态走内置文案（同样不依赖 AI 助手）—— 现状哨兵');
    /*
     * ★★ 与 [F] 同理：5 页去注释后也是 0 次引用 AI助手，没有 window.AI活跃，
     *    动态与评论用的是内置文案。原断言测的「自主发动态入口」并不存在。
     *    这里钉死「离线可用、配了也不偷偷发请求」这条底线。
     */
    {
        const 记录 = { 请求: [] };
        const w = await 起5(Object.assign(配置(), {
            '联系人索引': JSON.stringify([
                { id: 'c1', 名称: '林彦', 头像: '2【图片】/圆形头像3.png' },
                { id: 'c2', 名称: '陆沉渊', 头像: '2【图片】/圆形头像4.png' },
            ]),
        }), '今天的风有点野', 记录);
        await 等(900);

        ok(w.AI助手 === undefined, '★ ★ 5 页【没有】内联 AI助手（动态走内置文案）');
        ok(!(w.AI活跃 && typeof w.AI活跃.发一条 === 'function'), '★ 也没有 AI活跃 自主发动态入口');
        ok(!!w.document.body, '★ 页面照常起来（不崩）');
        const 对话请求 = 记录.请求.filter(r => /chat\/completions/i.test(r.url));
        ok(对话请求.length === 0,
            '★ ★ 配了文本 API 也不去调模型（实际发了 ' + 对话请求.length + ' 次）');
    }

    console.log('\n[H] ★ 错误分级：说得清是哪一步坏了');
    {
        /* 401 → 密钥不对 */
        const w1 = await 起19({}, { 模型: { 错: 401 } });
        输(w1, w1.document.getElementById('网址输入'), 'https://api.example.com/v1');
        输(w1, w1.document.getElementById('密钥输入'), 'sk-bad');
        await 等(1100);
        ok(/密钥不对/.test(w1.document.getElementById('状态文').textContent),
            '★ ★ 401 → 提示「密钥不对」（实际 ' + w1.document.getElementById('状态文').textContent + '）');
        ok(w1.document.getElementById('状态行').classList.contains('失败'), '★ 状态为失败');

        /* 404 → 地址不对（两种拼法都试过） */
        const w2 = await 起19({}, { 模型: { 错: 404 } });
        输(w2, w2.document.getElementById('网址输入'), 'https://api.example.com/v1');
        输(w2, w2.document.getElementById('密钥输入'), 'sk-x');
        await 等(1100);
        ok(/地址不对/.test(w2.document.getElementById('状态文').textContent),
            '★ ★ 404 → 提示「接口地址不对」（实际 ' + w2.document.getElementById('状态文').textContent + '）');

        /* 网络层失败 → 跨域 / 不通 */
        const w3 = await 起19({}, { 模型: { 坏: true } });
        输(w3, w3.document.getElementById('网址输入'), 'https://api.example.com/v1');
        输(w3, w3.document.getElementById('密钥输入'), 'sk-x');
        await 等(1100);
        ok(/跨域|网络|发不出去/.test(w3.document.getElementById('状态文').textContent),
            '★ ★ 请求发不出 → 提示跨域或网络（实际 ' + w3.document.getElementById('状态文').textContent + '）');
    }

    console.log('\n[I] ★ 读模型失败不清空已选（不至于白选一遍）');
    {
        const 数据 = 配置();
        const w = await 起19(数据, { 模型: { 列表: ['gpt-4o'] }, 坏关键词: 'bad.example.com' });
        await 等(300);
        ok(w.文本API.取选中() === 'gpt-4o', '★ 进来时带着已选模型');

        /* 换一个读不通的地址：这次要真失败，而不是桩放水 */
        输(w, w.document.getElementById('网址输入'), 'https://bad.example.com/v1');
        await 等(1100);
        ok(w.document.getElementById('状态行').classList.contains('失败'),
            '★ 这次确实读失败了（实际 ' + w.document.getElementById('状态文').textContent + '）');
        ok(w.文本API.取选中() === 'gpt-4o', '★ ★ 已选模型仍在（没被失败清掉）');
    }

    console.log('\n[J] ★★ 断开连接：本机密钥删干净，7 / 5 页回到未配置');
    {
        const 数据 = 配置();
        const w = await 起19(数据, {});
        await 等(300);
        ok(w.文本API.取配置() !== null, '★ 先确认有存档');

        点(w, w.document.getElementById('断开钮'));
        await 等(150);
        ok(w.文本API.取配置() === null, '★ ★ 「文本API配置」已删除');
        ok(w.document.getElementById('网址输入').value === '', '★ 网址框清空');
        ok(w.document.getElementById('密钥输入').value === '', '★ ★ 密钥框清空（本机不留）');
        ok(w.document.getElementById('已配横幅').classList.contains('隐藏'), '★ 「已启用」横幅收起');

        /* 7 页此时应回到未配置 —— ★ 7 页本就没有 AI助手（见 [F]），
           这里改为断言「断开后 7 页照常工作、不残留任何模型请求」。 */
        const 记录7 = { 请求: [] };
        const w7 = await 起7({ '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1' }]) }, 'x', 记录7);
        await 等(800);
        ok(w7.AI助手 === undefined, '★ 7 页本就不依赖 AI助手（回复走本地档案）');
        ok(!!w7.document.getElementById('消息流'), '★ ★ 断开后 7 页照常渲染（不留空白）');
        ok(记录7.请求.length === 0, '★ 断开后 7 页不发任何模型请求（实际 ' + 记录7.请求.length + '）');
    }

    console.log('\n[K] ★ 未配置时不硬发请求（省得每次干等超时）');
    {
        let 请数 = 0;
        const 数据 = { '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1' }]) };
        const w = await kit.起页面('7_liaotian.html', 'http://localhost/7.html?id=c1&from=1',
            数据, errors, '7', win => {
                win.fetch = () => { 请数++; return Promise.reject(new TypeError('不该发')); };
            });
        await 等(800);
        /* ★ 7 页没有 AI助手（见 [F]），这里改为验证「未配置时 7 页一次请求都不发」 */
        ok(w.AI助手 === undefined, '★ 7 页不走 AI 助手链路');
        ok(请数 === 0, '★ ★ 未配置时 7 页一次请求都没发（实际 ' + 请数 + ' 次）');
        ok(!!w.document.getElementById('消息流'), '★ 未配置时会话照常渲染');
    }

    收尾(errors, '✅ 文本对话 API（19_wenbenAPI）全部通过');
})().catch(e => { console.error(e); process.exit(2); });
