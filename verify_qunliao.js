/**
 * verify_qunliao.js —— 发起群聊（17_faqiqunliao）+ 群聊落位（1 / 4 / 7 页）专项验证
 *
 * 链路：1 页加号菜单「一起聊天」→ 17 页选人建群 → 写「群聊列表」
 *      → 1 页会话框 & 4 页「群聊」分区都出现该群 → 点进去是 7 页群聊
 *
 * 覆盖：
 *   ① 1 页菜单「一起聊天」指向 17 页（不再是「功能开发中」）
 *   ② 17 页：读联系人、多选、移除、搜索、人数上限、按钮禁用/启用、默认群名
 *   ③ 建群写「群聊列表」，字段齐全，新建的排最前
 *   ④ 1 页：群会话渲染在最前、群头像是成员拼图、点击 → 7 页 type=group
 *   ⑤ ★★ 群【不进】「联系人索引」（否则会混进 4 页 A–Z 分组）
 *   ⑥ 4 页：「群聊」分区在 A–Z 之前、显示人数、点击 → 7 页、搜索可过滤
 *   ⑦ 7 页：群聊标题 = 群名，成员表用群的真实成员
 *
 * 用法：PAGES_DIR=/data/workspace node verify_qunliao.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));
const 源码17 = 读('17_faqiqunliao.html');
const 源码1 = 读('1_shouyeyulan.html');
const 源码4 = 读('4_tongxun.html');
const 源码7 = 读('7_liaotian.html');

function 起页面(档, 数据, url) {
    return kit.起页面(档, url || 'http://localhost/' + 档, 数据 || {}, errors, 档);
}
const 点 = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

const 联系人表 = [
    { id: 'c_home_1', 名称: '林彦', 头像: '2【图片】/圆形头像3.png', 消息: '种花', 时间: '13:00' },
    { id: 'c_home_2', 名称: '陆沉渊', 头像: '2【图片】/圆形头像4.png', 消息: '小猫', 时间: '14:00' },
    { id: 'c_home_3', 名称: '白九霄', 头像: '2【图片】/圆形头像5.png', 消息: '眼泪', 时间: '12:00' },
];
const 索引数据 = () => ({ '联系人索引': JSON.stringify(联系人表) });

(async function main() {

    console.log('[A] ★ 1 页加号菜单「一起聊天」→ 17_faqiqunliao');
    {
        ok(/一起聊天:\s*'17_faqiqunliao\.html\?from=1'/.test(源码1),
            '★ 菜单映射指向 17_faqiqunliao.html?from=1');
        ok(/case '一起聊天'/.test(源码1), '★ switch 已接入「一起聊天」');
        /* ★ 原来它和「一起阅读」共用一句「功能开发中」，必须拆开 */
        const 段 = /case '一起聊天':[\s\S]{0,320}?break;/.exec(源码1);
        ok(!!段 && !/功能开发中/.test(段[0]),
            '★ ★ 「一起聊天」不再提示「功能开发中」');
        /* ★ 原为反向断言「一起阅读仍是未开放」—— 22_yuedu 上线后它就恒失败了
              （这条在改动前就是红的，属陈年问题）。改成正向：已接入且指向 22 页。 */
        ok(/一起阅读:\s*'22_yuedu\.html\?from=1'/.test(源码1),
            '★ 「一起阅读」已接入，指向 22_yuedu.html?from=1');
        const 段读 = /case '一起阅读':[\s\S]{0,320}?break;/.exec(源码1);
        ok(!!段读 && !/功能开发中/.test(段读[0]),
            '★ 「一起阅读」也不再提示「功能开发中」');
    }

    console.log('\n[B] ★★ 17 页：选人建群（照 QQ / 微信）');
    {
        const w = await 起页面('17_faqiqunliao.html', 索引数据(), 'http://localhost/17.html?from=1');
        await 等(350);
        const d = w.document;

        ok(d.querySelectorAll('.选人行').length === 3,
            '★ 读出 3 位联系人（实际 ' + d.querySelectorAll('.选人行').length + '）');
        ok(d.getElementById('完成钮').disabled, '★ 一个人没选时按钮禁用');
        ok(/至少选择 2/.test(d.getElementById('群名提示').textContent),
            '★ 提示至少选 2 位（实际 ' + d.getElementById('群名提示').textContent + '）');

        /* 选 1 个仍禁用 */
        w.发起群聊.选('c_home_1');
        ok(d.getElementById('完成钮').disabled, '★ 只选 1 位仍禁用');
        ok(d.querySelectorAll('.已选头像').length === 1, '★ 已选区显示 1 个头像');

        /* 选 2 个 → 可建 */
        w.发起群聊.选('c_home_2');
        ok(!d.getElementById('完成钮').disabled, '★ ★ 选够 2 位 → 按钮可用');
        ok(d.querySelectorAll('.已选头像').length === 2, '★ 已选区 2 个头像');
        ok(/3 人/.test(d.getElementById('完成钮').textContent),
            '★ 按钮写明含自己共 3 人（实际 ' + d.getElementById('完成钮').textContent + '）');

        /* 默认群名 = 成员名拼接 */
        ok(d.getElementById('群名输入').value === '林彦、陆沉渊',
            '★ 默认群名自动拼成员名（实际 ' + d.getElementById('群名输入').value + '）');

        /* 移除一个 → 又禁用 */
        点(w, d.querySelector('.已选移除'));
        await 等(80);
        ok(w.发起群聊.已选().length === 1, '★ 点头像 × 可移除');
        ok(d.getElementById('完成钮').disabled, '★ 移除后不足 2 位 → 重新禁用');

        /* 搜索过滤 */
        d.getElementById('搜索输入框').value = '陆';
        d.getElementById('搜索输入框').dispatchEvent(new w.Event('input', { bubbles: true }));
        await 等(80);
        ok(d.querySelectorAll('.选人行').length === 1,
            '★ 搜索「陆」→ 只剩 1 行（实际 ' + d.querySelectorAll('.选人行').length + '）');
        d.getElementById('搜索输入框').value = '';
        d.getElementById('搜索输入框').dispatchEvent(new w.Event('input', { bubbles: true }));
        await 等(80);
        ok(d.querySelectorAll('.选人行').length === 3, '★ 清空搜索 → 恢复 3 行');
    }

    console.log('\n[C] ★★ 建群 → 写「群聊列表」→ 进 7 页群聊');
    {
        const 数据 = 索引数据();
        const w = await 起页面('17_faqiqunliao.html', 数据, 'http://localhost/17.html?from=1');
        await 等(350);
        const d = w.document;
        w.发起群聊.选('c_home_1');
        w.发起群聊.选('c_home_2');
        w.发起群聊.选('c_home_3');
        点(w, d.getElementById('完成钮'));
        await 等(200);

        const 表 = JSON.parse(数据['群聊列表'] || '[]');
        ok(表.length === 1, '★ 写入「群聊列表」（实际 ' + 表.length + ' 条）');
        const 群 = 表[0];
        ok(!!群 && /^g_/.test(群.id), '★ ★ 群 id 以 g_ 开头（实际 ' + (群 && 群.id) + '）');
        ok(!!群 && 群.名称 === '林彦、陆沉渊、白九霄',
            '★ 群名 = 成员名拼接（实际 ' + (群 && 群.名称) + '）');
        ok(!!群 && Array.isArray(群.成员) && 群.成员.length === 3,
            '★ 成员 3 位（实际 ' + (群 && 群.成员.length) + '）');
        ok(!!群 && !!群.时间 && /^\d{2}:\d{2}$/.test(群.时间), '★ 有时间 HH:MM');
        ok(!!群 && typeof 群.建群时间 === 'number', '★ 有建群时间戳');

        /* jsdom 里 location.href 不可写 → 用源码断言跳转目标 */
        ok(/location\.href = '7_liaotian\.html\?id='[\s\S]{0,120}type=group/.test(源码17),
            '★ ★ 建完直接进 7 页群聊（带 type=group）');

        /* 自定义群名 */
        const 数据2 = 索引数据();
        const w2 = await 起页面('17_faqiqunliao.html', 数据2, 'http://localhost/17.html?from=1');
        await 等(350);
        w2.发起群聊.选('c_home_1'); w2.发起群聊.选('c_home_2');
        const 名框 = w2.document.getElementById('群名输入');
        名框.value = '周末局';
        名框.dispatchEvent(new w2.Event('input', { bubbles: true }));
        点(w2, w2.document.getElementById('完成钮'));
        await 等(200);
        const 表2 = JSON.parse(数据2['群聊列表'] || '[]');
        ok(表2[0].名称 === '周末局', '★ ★ 手改群名优先（实际 ' + 表2[0].名称 + '）');
    }

    console.log('\n[D] ★★ 1 页：群聊出现在会话框最前');
    {
        const 数据 = 索引数据();
        数据['群聊列表'] = JSON.stringify([
            { id: 'g_new', 名称: '新群', 成员: [{ 名: '林彦', 头像: '2【图片】/圆形头像3.png' }], 消息: '刚建', 时间: '15:20' },
            { id: 'g_old', 名称: '旧群', 成员: [{ 名: '陆沉渊', 头像: '2【图片】/圆形头像4.png' }, { 名: '白九霄', 头像: '2【图片】/圆形头像5.png' }], 消息: '早建', 时间: '15:10' },
        ]);
        const w = await 起页面('1_shouyeyulan.html', 数据);
        await 等(600);
        const d = w.document;
        const 群项 = Array.from(d.querySelectorAll('.会话项[data-群]'));
        ok(群项.length === 2, '★ 会话框出现 2 个群（实际 ' + 群项.length + '）');

        /* ★ 顺序：新建的在前 */
        ok(群项[0].dataset.群 === 'g_new' && 群项[1].dataset.群 === 'g_old',
            '★ ★ 新建的群排最前（实际 ' + 群项.map(e => e.dataset.群).join(' → ') + '）');
        const 首 = d.querySelector('.会话列表区').firstElementChild;
        ok(首 && 首.dataset.群 === 'g_new', '★ 确实是会话列表第一个');

        /* 群头像：成员拼图 */
        const 头 = 群项[1].querySelector('.群头像');
        ok(!!头, '★ 有群头像（不是普通圆形头像）');
        ok(头.querySelectorAll('img').length === 2,
            '★ 群头像=成员头像拼图（实际 ' + 头.querySelectorAll('img').length + ' 格）');
        ok(/grid-template-columns:\s*1fr 1fr/.test(源码1), '★ 是 2×2 网格拼图');

        /* 名称带人数（含自己） */
        ok(/新群（2）/.test(群项[0].querySelector('.会话名称').textContent),
            '★ 群名带人数（实际 ' + 群项[0].querySelector('.会话名称').textContent + '）');

        /* 点击 → 7 页群聊 */
        点(w, 群项[0]);
        await 等(150);
        ok(/id=g_new/.test(w.最后跳转 || '') && /type=group/.test(w.最后跳转 || ''),
            '★ ★ 点群 → 7 页群聊（实际 ' + w.最后跳转 + '）');

        /* ★★ 群不进联系人索引 */
        const 索引 = JSON.parse(数据['联系人索引'] || '[]');
        ok(!索引.some(i => i && /^g_/.test(String(i.id))),
            '★ ★★ 群没有被写进「联系人索引」');
        ok(!索引.some(i => i && (i.名称 === '新群' || i.名称 === '旧群')),
            '★ ★★ 索引里没有群名（否则 4 页 A–Z 会混进群）');
    }

    console.log('\n[E] ★★ 4 页：群聊分区');
    {
        const 数据 = 索引数据();
        数据['群聊列表'] = JSON.stringify([
            { id: 'g_a', 名称: '老友局', 成员: [
                { id: 'c_home_1', 名: '林彦', 头像: '2【图片】/圆形头像3.png' },
                { id: 'c_home_2', 名: '陆沉渊', 头像: '2【图片】/圆形头像4.png' },
                { id: 'c_home_3', 名: '白九霄', 头像: '2【图片】/圆形头像5.png' }] },
        ]);
        const w = await 起页面('4_tongxun.html', 数据);
        await 等(600);
        const d = w.document;

        const 块 = d.querySelector('.群聊分组');
        ok(!!块, '★ 有「群聊」分区');
        ok(块.querySelector('.分组字母').textContent === '群聊',
            '★ 分区标题是「群聊」（实际 ' + 块.querySelector('.分组字母').textContent + '）');

        /* ★ 在 A–Z 分组之前 */
        const 首 = d.getElementById('联系人列表区').firstElementChild;
        ok(首 && 首.classList.contains('群聊分组'),
            '★ ★ 群聊分区排在所有分组最前（实际 ' + (首 && 首.className) + '）');

        const 行 = d.querySelector('.群聊项');
        ok(!!行, '★ 有群聊行');
        ok(行.querySelector('.群聊名').textContent === '老友局',
            '★ 显示群名（实际 ' + 行.querySelector('.群聊名').textContent + '）');
        ok(/4 人/.test(行.querySelector('.群聊人数').textContent),
            '★ 显示人数含自己 = 4（实际 ' + 行.querySelector('.群聊人数').textContent + '）');
        ok(行.querySelectorAll('.群头像 img').length === 3, '★ 群头像 3 格拼图');

        /* 点击 → 7 页群聊 */
        点(w, 行);
        await 等(150);
        ok(/id=g_a/.test(w.最后跳转 || '') && /type=group/.test(w.最后跳转 || '')
            && /from=4/.test(w.最后跳转 || ''),
            '★ ★ 点群 → 7 页群聊（实际 ' + w.最后跳转 + '）');

        /* 搜索：群名可命中，且搜不到时群也隐藏 */
        const 框 = d.getElementById('搜索输入框');
        框.value = '老友';
        框.dispatchEvent(new w.Event('input', { bubbles: true }));
        await 等(150);
        ok([...d.querySelectorAll('.群聊项')].filter(e => !e.classList.contains('隐藏')).length === 1,
            '★ 搜群名能命中');
        框.value = 'zzzz';
        框.dispatchEvent(new w.Event('input', { bubbles: true }));
        await 等(150);
        ok([...d.querySelectorAll('.群聊项')].filter(e => !e.classList.contains('隐藏')).length === 0,
            '★ ★ 搜不到时群也隐藏（不会一直杵在那儿）');
        ok(d.getElementById('搜索无结果').classList.contains('显示'), '★ 走「无结果」提示');

        /* A–Z 索引条不含「群聊」 */
        const 字母 = Array.from(d.querySelectorAll('.索引字母')).map(e => e.textContent);
        ok(!字母.includes('群聊'), '★ ★ 右侧字母索引条不含「群聊」（实际 ' + 字母.join('') + '）');
    }

    console.log('\n[F] ★ 7 页：群聊标题与成员表');
    {
        const 数据 = 索引数据();
        数据['群聊列表'] = JSON.stringify([
            { id: 'g_a', 名称: '老友局', 成员: [
                { id: 'c_home_1', 名: '林彦', 头像: '2【图片】/圆形头像3.png' },
                { id: 'c_home_2', 名: '陆沉渊', 头像: '2【图片】/圆形头像4.png' }],
               消息: '群建好了', 时间: '15:00' },
        ]);
        const w = await 起页面('7_liaotian.html', 数据,
            'http://localhost/7.html?id=g_a&type=group&from=1');
        await 等(900);
        const d = w.document;
        /* ★ 微信同款：群聊标题带人数「老友局(3)」—— 成员 2 + 群主 1 */
        ok(d.getElementById('页面标题').textContent === '老友局(3)',
            '★ ★ 群聊标题 = 群名(人数)（实际 ' + d.getElementById('页面标题').textContent + '）');
        ok(d.title === '老友局(3)', '★ 标签页标题同步（实际 ' + d.title + '）');

        /* ★ 顶栏已移除语音 / 视频通话两枚；清空键群聊【也要留着】
             —— 18 页那个清空入口已一并移除，群聊收起就会彻底没了清空入口。 */
        ok(!d.getElementById('语音通话键'), '★ 顶栏已无语音通话键');
        ok(!d.getElementById('视频通话键'), '★ 顶栏已无视频通话键');
        ok(d.getElementById('清空键').style.display !== 'none',
            '★ ★ 群聊顶栏保留「清空」（18 页已移除，此处不能也收起）');
        /* 通话功能没丢：功能条那颗「语音通话」仍进 14 页 */
        const 条文本 = Array.from(d.querySelectorAll('#功能条 > *')).map(e => e.textContent.trim());
        ok(条文本.some(t => /语音通话/.test(t)),
            '★ ★ 通话功能未丢：功能条仍有「语音通话」（实际 ' + 条文本.join('/') + '）');

        /* 成员表改用群的真实成员（而不是索引里除自己外的所有人） */
        ok(/联系人\.是群[\s\S]{0,200}联系人\.成员/.test(源码7),
            '★ ★ 群聊成员池用群的真实成员');

        /* 功能条仍在（群聊有 AA / 拼手气等差异） */
        const 条 = Array.from(d.querySelectorAll('#功能条 > *')).map(e => e.textContent.trim());
        ok(条.length === 4, '★ 群聊也有四项功能条（实际 ' + 条.join('/') + '）');
    }

    console.log('\n[G] ★ 17 页主题背景 & 返回');
    {
        const w = await 起页面('17_faqiqunliao.html', 索引数据(), 'http://localhost/17.html?from=1');
        await 等(350);
        ok(w.取返回页() === '1_shouyeyulan.html',
            '★ from=1 → 返回 1 页（实际 ' + w.取返回页() + '）');
        ok(/<img class="主题背景图片"/.test(源码17), '★ 有主题背景图层');
        ok(/localStorage\.getItem\('主题背景'\)/.test(源码17), '★ 挂了主题背景读取脚本');
    }

    console.log('\n[M] ★★ 顶栏：通话两枚已移除，清空 / 搜索 / 更多仍在');
    {
        const 数据 = { '群聊列表': JSON.stringify([
            { id: 'g_a', 名称: '老友局', 成员: [{ id: 'c1', 名: '林彦', 头像: 'h1' }] },
        ]) };
        const w = await 起页面('7_liaotian.html', 数据,
            'http://localhost/7.html?id=g_a&type=group&from=1');
        await 等(900);
        const d = w.document;

        /* 顶栏只剩三枚，且没有语音 / 视频的残留节点 */
        const 亮 = Array.from(d.querySelectorAll('.右侧动作 > *'))
            .filter(e => e.style.display !== 'none').map(e => e.id);
        ok(亮.join() === '清空键,搜索键,群资料键',
            '★ ★ 群聊顶栏只剩 清空/搜索/更多（实际 ' + 亮.join() + '）');
        ok(!d.getElementById('语音通话键') && !d.getElementById('视频通话键'),
            '★ ★ 语音 / 视频通话键已从 DOM 移除（不是仅隐藏）');

        /* ★★ 通话仍然可达 —— 走功能条那颗，且带群上下文 */
        const 通话项 = Array.from(d.querySelectorAll('#功能条 > *'))
            .find(e => /语音通话/.test(e.textContent));
        ok(!!通话项, '★ ★ 功能条有「语音通话」入口（顶栏删了不等于功能没了）');
        点(w, 通话项);
        await 等(150);
        const 通话URL = w.最后跳转URL || '';
        ok(/14_yuyintonghua\.html/.test(通话URL),
            '★ ★ 点它 → 14 页通话界面（实际 ' + 通话URL + '）');
        ok(/type=group/.test(通话URL) && /id=g_a/.test(通话URL),
            '★ 带着群上下文（type=group + id=g_a）');

        /* 单聊：清空 · 搜索两枚 */
        const w2 = await 起页面('7_liaotian.html',
            { '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1' }]) },
            'http://localhost/7.html?id=c1');
        await 等(800);
        const 亮2 = Array.from(w2.document.querySelectorAll('.右侧动作 > *'))
            .filter(e => e.style.display !== 'none').map(e => e.id);
        ok(亮2.join() === '清空键,搜索键',
            '★ ★ 单聊顶栏只剩 清空/搜索（实际 ' + 亮2.join() + '）');
        ok(/^林彦$/.test(w2.document.getElementById('页面标题').textContent),
            '★ ★ 单聊标题不带人数（实际 ' + w2.document.getElementById('页面标题').textContent + '）');
    }

    console.log('\n[N] ★★★ 18 页改资料 → 保存 → 7 页信息同步更新');
    {
        const 群数据 = () => ({
            '群聊列表': JSON.stringify([{
                id: 'g_a', 名称: '老友局',
                成员: [
                    { id: 'c1', 名: '林彦', 头像: 'h1' },
                    { id: 'c2', 名: '陆沉渊', 头像: 'h2' },
                    { id: 'c3', 名: '白九霄', 头像: 'h3' },
                ],
            }]),
        });

        /* ① 改群名 → 保存 → 用回跳地址重进 7 页，标题必须变成新名字 */
        const 数据 = 群数据();
        const w = await 起页面('18_qunziliao.html', 数据,
            'http://localhost/18.html?id=g_a&from=7&b=1');
        await 等(400);
        const 名框 = w.document.getElementById('群名输入');
        名框.value = '周末局';
        名框.dispatchEvent(new w.Event('input', { bubbles: true }));
        点(w, w.document.getElementById('保存钮'));
        await 等(700);

        const 回跳 = w.最后跳转 || '';
        ok(/type=group/.test(回跳) && /from=1/.test(回跳),
            '★ 回跳地址把原始来源续上（实际 ' + 回跳 + '）');

        const w2 = await 起页面('7_liaotian.html', 数据, 'http://localhost/' + 回跳);
        await 等(900);
        ok(w2.document.getElementById('页面标题').textContent === '周末局(4)',
            '★ ★★ 改完群名 → 7 页标题同步（实际 '
            + w2.document.getElementById('页面标题').textContent + '）');
        ok(w2.document.title === '周末局(4)', '★ 标签页标题也同步');

        /* ② 移除成员 → 保存 → 7 页标题的人数跟着减 */
        const 数据2 = 群数据();
        const w3 = await 起页面('18_qunziliao.html', 数据2,
            'http://localhost/18.html?id=g_a&from=7&b=1');
        await 等(400);
        点(w3, w3.document.querySelector('#成员卡 .成员行 .成员删'));
        await 等(120);
        点(w3, w3.document.getElementById('保存钮'));
        await 等(700);

        const w4 = await 起页面('7_liaotian.html', 数据2,
            'http://localhost/' + (w3.最后跳转 || ''));
        await 等(900);
        ok(w4.document.getElementById('页面标题').textContent === '老友局(3)',
            '★ ★★ 移除成员 → 7 页人数同步减少（实际 '
            + w4.document.getElementById('页面标题').textContent + '）');

        /* ③ 我的昵称：写进存档，7 页能读到（老数据缺该字段也不能崩） */
        const 数据3 = 群数据();
        const w5 = await 起页面('18_qunziliao.html', 数据3,
            'http://localhost/18.html?id=g_a&from=7&b=1');
        await 等(400);
        const 昵框 = w5.document.getElementById('我的昵称输入');
        昵框.value = '阿渊';
        昵框.dispatchEvent(new w5.Event('input', { bubbles: true }));
        点(w5, w5.document.getElementById('保存钮'));
        await 等(700);
        ok(JSON.parse(数据3['群聊列表'])[0].我的昵称 === '阿渊', '★ 昵称已写回存档');

        const w6 = await 起页面('7_liaotian.html', 数据3,
            'http://localhost/' + (w5.最后跳转 || ''));
        await 等(900);
        ok(w6.取联系人 && w6.取联系人().我的昵称 === '阿渊',
            '★ ★ 7 页读到了「我在本群的昵称」（实际 '
            + (w6.取联系人 && w6.取联系人().我的昵称) + '）');
    }

    收尾(errors, '✅ 发起群聊 + 群聊落位 全部通过');
})().catch(e => { console.error(e); process.exit(2); });
