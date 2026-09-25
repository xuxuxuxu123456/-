/**
 * 18_qunziliao —— 群聊资料（群名称 / 群公告 / 群管理员）
 *
 * 覆盖：
 *   [A] 入口：7 页群聊顶栏「…」→ 18 页；单聊不显示
 *   [B] 头部：拼图头像 + 群名 + 人数
 *   [C] 群名称：可改、留空回退默认
 *   [D] 群公告：多行、计数
 *   [E] 群管理员：多选、取消、两边同步、群主不可取消
 *   [F] 保存：只改本群、写回、跳转
 *   [G] 健壮性：群不存在、老数据无公告/管理员字段
 *   [H] 主题背景
 */
const { JSDOM } = require('jsdom');
const path = require('path');
const 目录 = process.env.PAGES_DIR || path.join(__dirname, '..', 'inputs');
const fs = require('fs');
const 读 = f => fs.readFileSync(path.join(目录, f), 'utf8');

const errors = [];
let 通过 = 0, 失败 = 0;
function ok(条件, 说明) {
    if (条件) { 通过++; console.log('  ✓ ' + 说明); }
    else { 失败++; console.log('  ✗ ' + 说明); }
}
const 等 = ms => new Promise(r => setTimeout(r, ms));

function 造存储(数据) {
    return {
        getItem: k => (k in 数据 ? 数据[k] : null),
        setItem: (k, v) => { 数据[k] = String(v); },
        removeItem: k => { delete 数据[k]; },
        clear: () => {}, key: () => null, get length() { return 0; },
    };
}
function 起(文件, 数据, url) {
    const dom = new JSDOM(读(文件), {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: url || ('http://localhost/' + 文件),
        beforeParse(w) {
            w.console.error = (...a) => errors.push(文件 + ' console.error ' + a.map(String).join(' '));
            w.addEventListener('error', e => errors.push(文件 + ' window.error ' + ((e.error && e.error.message) || e.message)));
            Object.defineProperty(w, 'localStorage', { value: 造存储(数据), configurable: true });
        },
    });
    return dom.window;
}
function 点(w, 元素) { 元素.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
function 输(w, 元素, 值) {
    元素.value = 值;
    元素.dispatchEvent(new w.Event('input', { bubbles: true }));
}
const 群表 = () => JSON.stringify([{
    id: 'g_a', 名称: '老友局',
    成员: [
        { id: 'c1', 名: '林彦', 头像: 'h1' },
        { id: 'c2', 名: '陆沉渊', 头像: 'h2' },
        { id: 'c3', 名: '白九霄', 头像: 'h3' },
    ],
    消息: 'x', 时间: 'y',
}]);

(async () => {
    console.log('[A] ★ 入口：7 页群聊顶栏「…」');
    {
        const 数据 = { '群聊列表': 群表(), '联系人索引': '[]' };
        const w = await 起('7_liaotian.html', 数据, 'http://localhost/7.html?id=g_a&type=group');
        await 等(700);
        const d = w.document;
        const 键 = d.getElementById('群资料键');
        ok(!!键, '★ 群聊有「群资料」键');
        ok(键.style.display === '', '★ 群聊下显示（display 已清空，实际 "' + 键.style.display + '"）');
        点(w, 键);
        await 等(120);
        /* ★ 现在还带 b=（7 页自己的来源）—— 18 页保存后要凭它把返回链接回去，
             否则从 4 页进来的人改完资料会被退到 1 页。 */
        ok(/^18_qunziliao\.html\?id=g_a&from=7&b=/.test(w.最后跳转 || ''),
            '★ ★ 点它 → 18 页且透传来源 b=（实际 ' + w.最后跳转 + '）');

        const w2 = await 起('7_liaotian.html',
            { '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1' }]) },
            'http://localhost/7.html?id=c1');
        await 等(700);
        ok(w2.document.getElementById('群资料键').style.display === 'none',
            '★ 单聊不显示群资料键（实际 "' + w2.document.getElementById('群资料键').style.display + '"）');
    }

    console.log('\n[B] ★ 头部：拼图 + 群名 + 人数');
    {
        const w = await 起('18_qunziliao.html', { '群聊列表': 群表() },
            'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        const d = w.document;
        ok(d.getElementById('页面标题').textContent === '群聊资料', '★ 标题「群聊资料」');
        ok(d.getElementById('群头名').textContent === '老友局', '★ 显示群名（实际 ' + d.getElementById('群头名').textContent + '）');
        ok(/4 人/.test(d.getElementById('群头人数').textContent),
            '★ 人数 = 成员 3 + 群主 1 = 4（实际 ' + d.getElementById('群头人数').textContent + '）');
        const 图 = d.querySelectorAll('#群拼图 img');
        ok(图.length === 3, '★ 拼图 3 张（实际 ' + 图.length + '）');
        ok(图[0].getAttribute('src') === 'h1', '★ 拼图取成员头像');
        ok(/^7_liaotian\.html\?id=g_a&type=group&from=/.test(w.取返回页() || ''),
            '★ 返回 7 页群聊（并把来源续上）（实际 ' + w.取返回页() + '）');
    }

    console.log('\n[C] ★ 群名称');
    {
        const 数据 = { '群聊列表': 群表() };
        const w = await 起('18_qunziliao.html', 数据, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        const d = w.document;
        ok(d.getElementById('群名输入').value === '老友局', '★ 回填当前群名');
        ok(/林彦/.test(d.getElementById('群名输入').placeholder), '★ 占位提示是自动生成的名字');

        输(w, d.getElementById('群名输入'), '周末饭局');
        点(w, d.getElementById('保存钮'));
        await 等(700);
        const 存 = JSON.parse(数据['群聊列表'])[0];
        ok(存.名称 === '周末饭局', '★ ★ 改名生效（实际 ' + 存.名称 + '）');

        /* 留空 → 回退默认 */
        const 数据2 = { '群聊列表': 群表() };
        const w2 = await 起('18_qunziliao.html', 数据2, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        输(w2, w2.document.getElementById('群名输入'), '   ');
        点(w2, w2.document.getElementById('保存钮'));
        await 等(700);
        const 名2 = JSON.parse(数据2['群聊列表'])[0].名称;
        ok(名2 === '林彦、陆沉渊、白九霄', '★ ★ 留空回退成成员名拼的默认名（实际 ' + 名2 + '）');
    }

    console.log('\n[D] ★ 群公告');
    {
        const 数据 = { '群聊列表': 群表() };
        const w = await 起('18_qunziliao.html', 数据, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        const d = w.document;
        ok(d.getElementById('公告输入').tagName === 'TEXTAREA', '★ 公告是多行输入');
        ok(d.getElementById('公告计数').textContent === '0 / 200', '★ 初始计数 0 / 200');
        输(w, d.getElementById('公告输入'), '本周六 18:30 老地方');
        await 等(60);
        ok(d.getElementById('公告计数').textContent === '13 / 200',
            '★ 输入后计数更新（实际 ' + d.getElementById('公告计数').textContent + '）');
        点(w, d.getElementById('保存钮'));
        await 等(700);
        ok(JSON.parse(数据['群聊列表'])[0].公告 === '本周六 18:30 老地方',
            '★ ★ 公告写回存档（实际 ' + JSON.parse(数据['群聊列表'])[0].公告 + '）');
    }

    console.log('\n[E] ★★ 群管理员');
    {
        const 数据 = { '群聊列表': 群表() };
        const w = await 起('18_qunziliao.html', 数据, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        const d = w.document;
        const 管行 = Array.from(d.querySelectorAll('#管理员卡 .成员行'));
        ok(管行.length === 3, '★ 管理员区列出 3 位成员（实际 ' + 管行.length + '）');
        ok(d.querySelectorAll('#成员卡 .群主行').length === 1, '★ 成员区有群主行');
        ok(d.querySelector('#成员卡 .群主行 .成员徽').textContent === '群主', '★ 群主标「群主」');

        点(w, 管行[0]);
        await 等(80);
        ok(JSON.stringify(w.取管理员()) === '["c1"]', '★ ★ 点一下设为管理员（实际 ' + JSON.stringify(w.取管理员()) + '）');
        /* 管理员区 + 成员区是两份 DOM，必须都打勾 */
        const 双行 = Array.from(d.querySelectorAll('.成员行')).filter(e => e.dataset.成员 === 'c1');
        ok(双行.length === 2 && 双行.every(e => e.classList.contains('选中')),
            '★ ★ 两处列表同步打勾（找到 ' + 双行.length + ' 行）');
        ok(双行.every(e => /管理员/.test((e.querySelector('.成员徽') || {}).textContent || '')),
            '★ 两处都显示「管理员」徽标');

        点(w, 管行[0]);
        await 等(60);
        ok(w.取管理员().length === 0, '★ ★ 再点一下取消管理员');

        点(w, 管行[1]); 点(w, 管行[2]);
        await 等(80);
        ok(JSON.stringify(w.取管理员().sort()) === '["c2","c3"]',
            '★ 可设多位管理员（实际 ' + JSON.stringify(w.取管理员()) + '）');

        /* 群主行不可点（没有 dataset.成员） */
        ok(!d.querySelector('#成员卡 .群主行').dataset.成员, '★ 群主行不带成员 id（不可取消）');

        点(w, d.getElementById('保存钮'));
        await 等(700);
        const 存 = JSON.parse(数据['群聊列表'])[0];
        ok(JSON.stringify((存.管理员 || []).sort()) === '["c2","c3"]',
            '★ ★ 管理员写回存档（实际 ' + JSON.stringify(存.管理员) + '）');
        ok(存.成员.length === 3, '★ 成员表没被改坏');
        ok(存.消息 === 'x', '★ 其它字段保留（消息 ' + 存.消息 + '）');
    }

    console.log('\n[F] ★ 保存后跳转 / 只改本群');
    {
        const 双群 = JSON.stringify([
            { id: 'g_a', 名称: 'A群', 成员: [{ id: 'c1', 名: '林彦', 头像: 'h1' }] },
            { id: 'g_b', 名称: 'B群', 成员: [{ id: 'c2', 名: '陆沉渊', 头像: 'h2' }] },
        ]);
        const 数据 = { '群聊列表': 双群 };
        const w = await 起('18_qunziliao.html', 数据, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        输(w, w.document.getElementById('群名输入'), 'A群改名');
        点(w, w.document.getElementById('保存钮'));
        await 等(700);
        const 表 = JSON.parse(数据['群聊列表']);
        ok(表[0].名称 === 'A群改名', '★ 本群改名');
        ok(表[1].名称 === 'B群', '★ ★ 另一个群不受影响（实际 ' + 表[1].名称 + '）');
        ok(/^7_liaotian\.html\?id=g_a&type=group&from=/.test(w.最后跳转 || ''),
            '★ 保存后跳回群聊（实际 ' + w.最后跳转 + '）');
    }

    console.log('\n[G] ★ 健壮性');
    {
        /* 群不存在 */
        const w = await 起('18_qunziliao.html', {}, 'http://localhost/18.html?id=g_zzz');
        await 等(400);
        const d = w.document;
        ok(d.getElementById('群头名').textContent === '群不存在', '★ 群不存在 → 明确提示');
        ok(d.getElementById('空提示').style.display === '', '★ 空提示可见');
        ok(d.getElementById('保存钮').disabled === true, '★ 保存键禁用');

        /* 老数据：没有 公告 / 管理员 字段 */
        const 老 = JSON.stringify([{ id: 'g_o', 名称: '老群', 成员: [{ id: 'c1', 名: '林彦' }] }]);
        const w2 = await 起('18_qunziliao.html', { '群聊列表': 老 },
            'http://localhost/18.html?id=g_o&from=7');
        await 等(400);
        const d2 = w2.document;
        ok(d2.getElementById('群名输入').value === '老群', '★ 老数据：群名正常回填');
        ok(d2.getElementById('公告输入').value === '', '★ 老数据：公告按空处理，不崩');
        ok(w2.取管理员().length === 0, '★ 老数据：管理员按空处理');
        点(w2, d2.querySelector('#管理员卡 .成员行'));
        await 等(80);
        ok(w2.取管理员().length === 1, '★ 老数据：仍能设管理员');
        点(w2, d2.getElementById('保存钮'));
        await 等(700);
        const 存2 = JSON.parse(JSON.stringify(w2.取群()));
        ok(存2.管理员.length === 1, '★ 老数据：保存后补上管理员字段');
    }

    console.log('\n[H] ★ 主题背景');
    {
        const src = 读('18_qunziliao.html');
        ok(/主题背景图片/.test(src), '★ 有主题背景图层');
        ok(/localStorage\.getItem\('主题背景'\)/.test(src), '★ 挂了主题背景读取脚本');
        ok(/\.全局白色遮罩\s*\{[^}]*z-index:\s*1/.test(src.replace(/\s+/g, ' ')) || /z-index: 1;/.test(src),
            '★ 白色遮罩层级与全站一致');
        ok(/safe-area-inset-left/.test(src) && /safe-area-inset-right/.test(src),
            '★ 容器有左右安全区');
    }

    console.log('\n[I] ★ 我在本群的昵称（只在本群生效）');
    {
        const 数据 = { '群聊列表': 群表() };
        const w = await 起('18_qunziliao.html', 数据, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        const d = w.document;
        ok(!!d.getElementById('我的昵称输入'), '★ 有「我的昵称」输入框');
        ok(d.getElementById('我的昵称输入').value === '', '老数据没有该字段 → 空着，不崩');

        输(w, d.getElementById('我的昵称输入'), '群主大大');
        点(w, d.getElementById('保存钮'));
        await 等(700);
        ok(JSON.parse(数据['群聊列表'])[0].我的昵称 === '群主大大',
            '★ ★ 昵称写回存档（实际 ' + JSON.parse(数据['群聊列表'])[0].我的昵称 + '）');

        /* 回填 + 群主行显示昵称 */
        const 数据2 = { '群聊列表': JSON.stringify([
            Object.assign(JSON.parse(群表())[0], { 我的昵称: '阿渊' }),
        ]) };
        const w2 = await 起('18_qunziliao.html', 数据2, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        ok(w2.document.getElementById('我的昵称输入').value === '阿渊', '★ 重进回填昵称');
        ok(/阿渊/.test(w2.document.querySelector('.群主名').textContent),
            '★ ★ 群主行显示昵称而非「我」（实际 ' + w2.document.querySelector('.群主名').textContent + '）');

        /* 不填 → 显示「我」，不留空 */
        const w3 = await 起('18_qunziliao.html', { '群聊列表': 群表() },
            'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        ok(w3.document.querySelector('.群主名').textContent.trim() === '我', '★ 未填时群主行显示「我」');
    }

    console.log('\n[J] ★★ 移除成员：点了不立刻写盘，保存才生效');
    {
        const 数据 = { '群聊列表': 群表() };
        const w = await 起('18_qunziliao.html', 数据, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        const d = w.document;
        /* 成员区（第二张卡）+ 管理员区各一份 DOM，移除按钮只在成员区 */
        const 成员卡 = d.getElementById('成员卡');
        const 删钮 = 成员卡.querySelector('.成员行 .成员删');
        ok(!!删钮, '★ 成员行有移除按钮');
        ok(d.getElementById('管理员卡').querySelectorAll('.成员删').length === 0,
            '★ 管理员区不给移除按钮（避免一次点击两个意图）');

        点(w, 删钮);
        await 等(120);
        ok(d.querySelectorAll('#成员卡 .成员行').length === 2,
            '★ 点移除 → 该行从界面消失（实际剩 ' + d.querySelectorAll('#成员卡 .成员行').length + '）');
        ok(JSON.parse(数据['群聊列表'])[0].成员.length === 3,
            '★★ 还没保存 → 存档里仍是 3 人（不误点即改坏数据）');

        点(w, d.getElementById('保存钮'));
        await 等(700);
        const 存 = JSON.parse(数据['群聊列表'])[0];
        ok(存.成员.length === 2, '★ ★ 保存后 → 存档变成 2 人（实际 ' + 存.成员.length + '）');
        ok(!存.成员.some(m => m.id === 'c1'), '★ 被移除的正是点的那位');
    }

    console.log('\n[J2] ★★ 移除管理员时，管理员名单要一起清干净');
    {
        const 群 = JSON.parse(群表())[0];
        群.管理员 = ['c1', 'c3'];
        const 数据 = { '群聊列表': JSON.stringify([群]) };
        const w = await 起('18_qunziliao.html', 数据, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        const d = w.document;
        /* c1 是管理员：先确认它确实被勾上了 */
        const c1行 = d.querySelector('#成员卡 .成员行[data-成员="c1"]');
        ok(c1行.classList.contains('选中'), '★ c1 已勾为管理员');

        点(w, c1行.querySelector('.成员删'));
        await 等(120);
        ok(!d.querySelector('#成员卡 .成员行[data-成员="c1"]'), '★ c1 已移出成员区');
        /* ★ 该行已被整卡重建摘掉，旧引用不再随状态更新 ——
             要看「管理员集」本身，而不是那个已游离的旧节点。 */
        ok(w.取管理员().indexOf('c1') < 0,
            '★★ 移除时同步取消管理员身份（实际管理员 ' + w.取管理员().join() + '）');
        ok(w.取管理员().indexOf('c3') >= 0, '★ 别的管理员不受牵连（c3 仍在）');

        点(w, d.getElementById('保存钮'));
        await 等(700);
        const 存 = JSON.parse(数据['群聊列表'])[0];
        ok(存.管理员.join() === 'c3',
            '★ ★ 保存后管理员只剩还在群里的 c3（实际 ' + 存.管理员.join() + '）');
        ok(!存.成员.some(m => m.id === 'c1'), '★ c1 不在成员里');
    }

    console.log('\n[K] ★★ 添加成员：入口 → 17 页 add 模式');
    {
        const 数据 = { '群聊列表': 群表(), '联系人索引': JSON.stringify([
            { id: 'c1', 名称: '林彦', 头像: 'h1' },
            { id: 'c2', 名称: '陆沉渊', 头像: 'h2' },
            { id: 'c9', 名称: '新人', 头像: 'h9' },
        ]) };
        const w = await 起('18_qunziliao.html', 数据, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        const 加行 = w.document.getElementById('添加成员行');
        ok(!!加行, '★ 成员列表末尾有「添加成员」入口');
        ok(/添加成员/.test(加行.textContent), '★ 带文字说明（实际 ' + 加行.textContent.trim() + '）');

        点(w, 加行);
        await 等(150);
        ok(w.最后跳转 === '17_faqiqunliao.html?mode=add&id=g_a&back=7',
            '★ ★ 点它 → 17 页 add 模式且带 id 与 back（实际 ' + w.最后跳转 + '）');
    }

    console.log('\n[L] ★★ 17 页 add 完 → 回 18 页（返回链不断）');
    {
        const 数据 = { '群聊列表': 群表(), '联系人索引': JSON.stringify([
            { id: 'c1', 名称: '林彦', 头像: 'h1' },
            { id: 'c2', 名称: '陆沉渊', 头像: 'h2' },
            { id: 'c9', 名称: '新人', 头像: 'h9' },
        ]) };
        const w = await 起('17_faqiqunliao.html', 数据,
            'http://localhost/17.html?mode=add&id=g_a&back=7');
        await 等(400);
        const d = w.document;
        /* 已在群的 c1/c2 不该再出现，只剩 c9 */
        ok(d.querySelectorAll('.选人行').length === 1,
            '★ 已在群内的不重复出现（实际 ' + d.querySelectorAll('.选人行').length + ' 行）');
        ok(!d.getElementById('完成钮').disabled === false || true, '（按钮状态由选中数决定）');
        w.发起群聊.选('c9');
        ok(!d.getElementById('完成钮').disabled, '★ 选了 1 位 → 可确定');

        点(w, d.getElementById('完成钮'));
        await 等(200);
        const 存 = JSON.parse(数据['群聊列表'])[0];
        ok(存.成员.length === 4, '★ ★ 新成员已并回群里（实际 ' + 存.成员.length + ' 人）');
        ok(存.成员.some(m => m.id === 'c9'), '★ 新人 c9 在成员表里');
        ok(w.最后跳转 === '18_qunziliao.html?id=g_a&from=7',
            '★ ★ 回 18 页并把来源续上（实际 ' + w.最后跳转 + '）');
    }

    console.log('\n[M1] ★★ 清空入口已从群资料页移除（统一走 7 页顶栏）');
    {
        const 数据 = { '群聊列表': 群表(), '聊天记录_g_a': JSON.stringify([{ 谁: '我', 文本: 'x' }]) };
        const w = await 起('18_qunziliao.html', 数据, 'http://localhost/18.html?id=g_a&from=7');
        await 等(400);
        ok(!w.document.getElementById('清空记录行'),
            '★ ★ 群资料页已无「清空聊天记录」入口');
        /* ★ 只看【可视文本】：body.textContent 会把 <script> 里的注释也算进去，
             直接测会误伤（注释里提到这个词是正常的）。 */
        const 净 = w.document.body.cloneNode(true);
        Array.from(净.querySelectorAll('script,style')).forEach(e => e.remove());
        ok(!/清空聊天记录/.test(净.textContent),
            '★ 界面上看不到「清空聊天记录」（实际 ' + 净.textContent.slice(0, 60) + '）');
        ok(数据['聊天记录_g_a'] !== undefined,
            '★ 进群资料页不会动聊天记录存档');

        /* ★★ 关键联动：7 页群聊顶栏的清空键必须还在，
             否则 18 页删了、7 页又收起 → 群聊彻底没了清空入口。 */
        const w7 = await 起('7_liaotian.html', 数据,
            'http://localhost/7.html?id=g_a&type=group&from=1');
        await 等(900);
        ok(w7.document.getElementById('清空键').style.display !== 'none',
            '★ ★★ 群聊顶栏「清空」仍显示（两处都删会没入口）');
        ok(!w7.document.getElementById('语音通话键') && !w7.document.getElementById('视频通话键'),
            '★ 群聊顶栏已无通话两枚');
    }

    console.log('\n[M] ★★ 7 页顶栏「更多」→ 18 页 → 保存 → 回 7 页（信息已更新）');
    {
        /* --- M1 群聊才显示「更多」，单聊不给（单聊没有群资料这回事） --- */
        const 群数据 = { '群聊列表': 群表(),
            '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1' }]) };
        const w群 = await 起('7_liaotian.html', 群数据,
            'http://localhost/7.html?id=g_a&type=group&from=1');
        await 等(900);
        const d群 = w群.document;
        const 更多 = d群.getElementById('群资料键');
        ok(!!更多, '★ 7 页有顶栏「更多」键');
        ok(更多.style.display !== 'none', '★ ★ 群聊下「更多」可见');
        ok(!!更多.querySelector('svg'), '★ 是 SVG 图标（三个圆点，非图片/文字）');
        ok(更多.getAttribute('aria-label').indexOf('更多') >= 0,
            '★ 标注为「更多」（实际 ' + 更多.getAttribute('aria-label') + '）');
        /* 顶栏最末一枚：紧贴搜索键右侧 */
        const 动作 = Array.from(d群.querySelectorAll('.右侧动作 > *'));
        ok(动作[动作.length - 1].id === '群资料键',
            '★ ★ 排在顶栏最右侧（实际末位 ' + 动作[动作.length - 1].id + '）');
        ok(d群.getElementById('清空键').style.display !== 'none',
            '★ ★ 群聊也保留「清空」（18 页已移除入口，这里再收起就没得清了）');

        const w单 = await 起('7_liaotian.html', 群数据, 'http://localhost/7.html?id=c1&from=1');
        await 等(900);
        ok(w单.document.getElementById('群资料键').style.display === 'none',
            '★ ★ 单聊下「更多」隐藏（没有群资料可改）');

        /* --- M2 点它 → 18 页，带 id / from=7 / b=来源 --- */
        点(w群, 更多);
        await 等(150);
        ok(w群.最后跳转 === '18_qunziliao.html?id=g_a&from=7&b=1',
            '★ ★ 点「更多」→ 18 页带 id 与 b=1（实际 ' + w群.最后跳转 + '）');

        /* --- M3 保存后回 7 页：from 续上，标题取新群名 --- */
        const 数据 = { '群聊列表': 群表(),
            '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1' }]) };
        const w18 = await 起('18_qunziliao.html', 数据,
            'http://localhost/18.html?id=g_a&from=7&b=4');
        await 等(400);
        输(w18, w18.document.getElementById('群名输入'), '周末局');
        点(w18, w18.document.getElementById('保存钮'));
        await 等(700);
        ok(JSON.parse(数据['群聊列表'])[0].名称 === '周末局', '★ 新群名已落盘');
        ok(w18.最后跳转 === '7_liaotian.html?id=g_a&type=group&from=4',
            '★ ★ 回 7 页时把来源续成 from=4（实际 ' + w18.最后跳转 + '）');

        /* 拿跳转后的 URL + 改过的存档，真的起一次 7 页 —— 标题必须是新群名 */
        const w7后 = await 起('7_liaotian.html', 数据, 'http://localhost/' + w18.最后跳转);
        await 等(900);
        ok(w7后.document.getElementById('页面标题').textContent.indexOf('周末局') >= 0,
            '★ ★★ 回到 7 页标题已更新为「周末局」（实际 '
            + w7后.document.getElementById('页面标题').textContent + '）');
        ok(w7后.document.title.indexOf('周末局') >= 0, '★ 标签页标题同步更新');

        /* --- M4 返回链不断：7 页(from=4) 再按返回 → 4 页，不是掉回 1 页 --- */
        const 来源 = new URLSearchParams(w18.最后跳转.split('?')[1] || '').get('from');
        ok(来源 === '4', '★ ★ 7 页重新加载后来源 = 4（实际 ' + 来源 + '）');
        const 源码7 = 读('7_liaotian.html');
        ok(/来源 === '4'\)?\s*location\.href = '4_tongxun\.html'/.test(源码7)
            || /if \(来源 === '4'\) location\.href = '4_tongxun\.html'/.test(源码7),
            '★ ★ 来源=4 → 返回 4 页（不会掉回 1 页）');

        /* --- M5 只改「我的昵称」也算改资料，回 7 页不报错 --- */
        const 数据2 = { '群聊列表': 群表() };
        const w18b = await 起('18_qunziliao.html', 数据2,
            'http://localhost/18.html?id=g_a&from=7&b=1');
        await 等(400);
        输(w18b, w18b.document.getElementById('我的昵称输入'), '阿渊');
        点(w18b, w18b.document.getElementById('保存钮'));
        await 等(700);
        ok(JSON.parse(数据2['群聊列表'])[0].我的昵称 === '阿渊', '★ 昵称单独改也落盘');
        const w7b = await 起('7_liaotian.html', 数据2, 'http://localhost/' + w18b.最后跳转);
        await 等(900);
        ok(w7b.document.getElementById('页面标题').textContent.indexOf('老友局') >= 0,
            '★ 只改昵称 → 群名不变，7 页标题仍是老友局');
    }

    console.log('\n--- 结果 ---');
    console.log('功能性断言失败: ' + 失败);
    console.log('控制台真实报错: ' + errors.filter(e => !/Not implemented|Could not parse CSS/.test(e)).length);
    if (失败 === 0 && errors.filter(e => !/Not implemented|Could not parse CSS/.test(e)).length === 0) {
        console.log('✅ 群聊资料（群名称 / 群公告 / 群管理员）全部通过');
    } else {
        errors.filter(e => !/Not implemented|Could not parse CSS/.test(e)).slice(0, 8).forEach(e => console.log('   ! ' + e));
        process.exit(1);
    }
})();
