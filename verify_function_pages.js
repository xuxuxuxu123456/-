/**
 * verify_function_pages.js —— ★ 12 / 13 / 14 三个功能页专项
 *
 * 需求：7 页功能条点「转账 / 红包 / 语音通话」→ 进入【独立全屏界面】（不是弹窗）；
 *       照 QQ：群聊（?type=group）与单聊各自匹配不同界面。
 *       结果由功能页写「待发消息_<sid>」，回 7 页后由 7 页统一落地。
 *
 * 覆盖：
 *   [A] 三个页面都是独立 HTML（不是 7 页里的 div 弹窗）
 *   [B] 12 转账（单聊）：大金额输入 + 说明 + 确认（★ 不限制可用金额、无安全提示）
 *   [C] ★ 12 群聊 → 选一位收款人（微信同款，★ 不是 AA 收款）
 *   [D] 13 红包（单聊）：金额 + 祝福语，无玩法/个数
 *   [E] ★ 13 群聊 → 多「拼手气/普通」两档 + 个数步进
 *   [F] 14 语音通话（单聊）：进来即呼叫 → 2 秒后通话中 + 计时 → 挂断
 *   [G] ★ 14 群聊 → 先进「选择通话成员」（上限 9）→ 多人通话
 *   [H] ★ 确认后写「待发消息_<sid>」，格式对得上 7 页
 *   [I] ★ 返回：回 back 指定的 7 页地址，且不落消息
 *   [J] ★ 金额校验：空 / 超限 / 每人不足 0.01 都被拦下
 *
 * 用法：PAGES_DIR=/data/workspace node verify_function_pages.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));

const 联系人表 = [
    { id: 'c_1', 名称: '林彦', 备注: '林彦', 头像: '', 消息: '', 时间: '' },
    { id: 'c_2', 名称: '陆沉渊', 备注: '', 头像: '', 消息: '', 时间: '' },
    { id: 'c_3', 名称: '白九霄', 备注: '', 头像: '', 消息: '', 时间: '' },
];
const 索引串 = JSON.stringify(联系人表);

const 回 = '7_liaotian.html?id=c_1';

/** 起一个功能页。群聊传 群=true */
/**
 * 起一个功能页。
 * ★ 数据对象【原地复用】：页面写进去的东西必须能被外面的 待发(数据) 读到，
 *   所以这里不能 Object.assign 出新对象（那样写进副本，外面永远读不到）。
 */
function 起(文件, 群, 数据) {
    const 存 = 数据 || {};
    if (!('联系人索引' in 存)) 存['联系人索引'] = 索引串;
    const 参 = new URLSearchParams();
    参.set('id', 'c_1');
    参.set('sid', 'c_1');
    参.set('name', '林彦');
    参.set('back', 回);
    if (群) 参.set('type', 'group');
    const url = 'http://localhost/' + 文件 + '?' + 参.toString();
    return 起页面(文件, url, 存, errors, 文件);
}
function 点(w, 元素) { 元素.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }

/** 起页面并【自定义完整 URL】（单聊/群聊区分测试要自己拼 id/type） */
function 起自(文件, 数据, url) {
    const 存 = 数据 || {};
    return 起页面(文件, url, 存, errors, 文件);
}
function 输入(w, 元素, 值) {
    元素.value = 值;
    元素.dispatchEvent(new w.Event('input', { bubbles: true }));
}
function 待发(数据) {
    const 原 = 数据['待发消息_c_1'];
    if (!原) return null;
    try { return JSON.parse(原); } catch (e) { return null; }
}

(async function main() {
    console.log('[A] 三个页面都是独立 HTML（不是 7 页里的弹窗）');
    {
        const 页7 = 读('7_liaotian.html');
        ok(/12_zhuanzhang\.html/.test(页7), '★ 7 页跳转目标含 12_zhuanzhang.html');
        ok(/13_hongbao\.html/.test(页7), '★ 7 页跳转目标含 13_hongbao.html');
        ok(/14_yuyintonghua\.html/.test(页7), '★ 7 页跳转目标含 14_yuyintonghua.html');

        for (const [文件, 标题] of [
            ['12_zhuanzhang.html', '转账'], ['13_hongbao.html', '发红包'],
            ['14_yuyintonghua.html', '语音通话'],
        ]) {
            const 源码 = 读(文件);
            ok(/^<!DOCTYPE html>/i.test(源码.trim()), '★ ' + 文件 + ' 是完整 HTML 页面');
            ok(/<title>/.test(源码), '★ ' + 文件 + ' 有自己的 title');
            // ★ 是全屏界面：有手机容器 + 顶栏，而不是一个居中弹窗框
            ok(/手机主题背景容器/.test(源码), '★ ' + 文件 + ' 有全屏手机容器');
            ok(/顶部固定区/.test(源码) && /返回按钮/.test(源码), '★ ' + 文件 + ' 有顶栏返回');
            ok(/主题背景图片/.test(源码), '★ ' + 文件 + ' 接了全站主题背景');
        }
    }

    console.log('\n[B] 12 转账（单聊）：大金额 + 说明 + 确认（★ 不限制可用金额）');
    {
        const 数据 = {};
        const w = await 起('12_zhuanzhang.html', false, 数据);
        await 等(300);
        const d = w.document;
        ok(d.getElementById('页面标题').textContent === '转账',
            '★ 标题「转账」（实际 ' + d.getElementById('页面标题').textContent + '）');
        ok(/林彦/.test(d.getElementById('对象名').textContent),
            '★ 写明转给谁（实际 ' + d.getElementById('对象名').textContent + '）');
        ok(!!d.getElementById('金额输入'), '★ 有大金额输入框');
        ok(!!d.getElementById('说明输入'), '★ 有说明输入框');
        ok(d.getElementById('收款人列表').style.display === 'none',
            '★ 单聊不显示收款人列表');
        ok(d.getElementById('确认键').disabled, '★ 没填金额时确认键禁用');

        输入(w, d.getElementById('金额输入'), '52.5');
        ok(!d.getElementById('确认键').disabled, '★ 填了金额 → 确认键可点');

        /* ★★ 转账【不限制可用金额】：不再有余额显示，也不做余额校验 */
        ok(!d.getElementById('余额'), '★ ★ 已无「可用余额」显示（不限制可用金额）');
        ok(d.querySelectorAll('.提示文').length === 0, '★ 已无安全提示文案');
        ok(!/可用余额/.test(读('12_zhuanzhang.html')), '★ 源码里不再出现「可用余额」');
        ok(!/余额额度/.test(读('12_zhuanzhang.html')), '★ 源码里不再有余额额度常量');

        /* ★ 输 15000（超过原来的余额额度 10000）必须能正常提交 */
        输入(w, d.getElementById('金额输入'), '15000');
        ok(!d.getElementById('确认键').disabled, '★ ★ 15000 元不被余额拦下');
        点(w, d.getElementById('确认键'));
        await 等(120);
        const 包 = 待发(数据);
        ok(!!包 && 包.卡.金额 === 15000,
            '★ ★ 15000 元成功发出（实际 ' + (包 && 包.卡.金额) + '）');

        /* 单笔上限仍保留（防误输入，不是可用金额） */
        const 数据2 = {};
        const w2 = await 起('12_zhuanzhang.html', false, 数据2);
        await 等(300);
        输入(w2, w2.document.getElementById('金额输入'), '99999');
        点(w2, w2.document.getElementById('确认键'));
        await 等(120);
        ok(!待发(数据2), '★ 超单笔上限 ¥20000 仍拦下');
    }

    console.log('\n[B2] ★★ 按钮上移：主按钮紧跟【备注说明框】下方（不再固定屏幕底）');
    {
        const 数据 = {};
        const w = await 起('12_zhuanzhang.html', false, 数据);
        await 等(300);
        const d = w.document;
        const 钮 = d.getElementById('确认键');
        const 区 = 钮.closest('.底部操作区');
        const 内容 = d.querySelector('.手机界面内容');

        ok(!!区, '★ 有按钮容器 .底部操作区');
        ok(内容.contains(区),
            '★ ★ 按钮已【移进内容流】（不再在 .手机界面内容 外面固定）');
        ok(d.getElementById('说明卡').nextElementSibling === 区,
            '★ ★ 按钮紧跟在「添加转账说明」框下方（相邻后兄弟）');
        ok(!/env\(safe-area-inset-bottom/.test(
                (读('12_zhuanzhang.html').match(/\.底部操作区\s*\{[^}]*\}/) || [''])[0]),
            '★ 不再有贴屏幕底的安全区 padding');

        /* 群聊下也一样（说明卡仍显示） */
        const w2 = await 起('12_zhuanzhang.html', true, {});
        await 等(300);
        const d2 = w2.document;
        ok(d2.getElementById('说明卡').nextElementSibling
            === d2.getElementById('确认键').closest('.底部操作区'),
            '★ 群聊下按钮也在说明框下方');

        /* 13 红包：按钮紧跟祝福语 */
        const 数据3 = {};
        const w3 = await 起('13_hongbao.html', false, 数据3);
        await 等(300);
        const d3 = w3.document;
        const 区3 = d3.getElementById('确认键').closest('.底部操作区');
        ok(d3.querySelector('.手机界面内容').contains(区3), '★ 13 按钮也在内容流里');
        ok(d3.getElementById('祝福输入').closest('.卡片').nextElementSibling === 区3,
            '★ ★ 13 按钮紧跟「祝福语」框下方');
        ok(d3.getElementById('确认键').textContent === '塞钱进红包',
            '★ 13 按钮文案「塞钱进红包」');

        /* ★ 位置改了，功能不能坏：仍能正常提交 */
        输入(w3, d3.getElementById('金额输入'), '66');
        点(w3, d3.getElementById('确认键'));
        await 等(180);
        const 包3 = 待发(数据3);
        ok(!!包3 && 包3.卡.金额 === 66,
            '★ ★ 13 按钮上移后仍能正常提交（实际 ' + JSON.stringify(包3 && 包3.卡) + '）');

        /* 12 也验一次真提交 */
        const 数据4 = {};
        const w4 = await 起('12_zhuanzhang.html', false, 数据4);
        await 等(300);
        输入(w4, w4.document.getElementById('金额输入'), '88');
        点(w4, w4.document.getElementById('确认键'));
        await 等(180);
        const 包4 = 待发(数据4);
        ok(!!包4 && 包4.卡.金额 === 88,
            '★ ★ 12 按钮上移后仍能正常提交（实际 ' + JSON.stringify(包4 && 包4.卡) + '）');
    }

    console.log('\n[C] ★★ 12 群聊 → 选收款人（微信同款，不是 AA 收款）');
    {
        const 数据 = {};
        const w = await 起('12_zhuanzhang.html', true, 数据);
        await 等(300);
        const d = w.document;

        /* ★★ 群聊标题仍是「转账」—— 不再是「AA 收款」 */
        ok(d.getElementById('页面标题').textContent === '转账',
            '★ ★ 群聊标题仍是「转账」（实际 ' + d.getElementById('页面标题').textContent + '）');
        ok(d.getElementById('单聊卡').style.display !== 'none', '★ 群聊也用同一张转账卡');
        ok(d.getElementById('确认键').textContent === '确认转账',
            '★ 按钮「确认转账」（实际 ' + d.getElementById('确认键').textContent + '）');

        /* ★★ 收款人列表：列出群成员，默认选第一个 */
        const 行们 = Array.from(d.querySelectorAll('.收款人行'));
        ok(行们.length >= 2, '★ 列出群成员供选择（实际 ' + 行们.length + ' 位）');
        ok(d.querySelectorAll('.收款人行.选中').length === 1, '★ 默认选中一位');
        ok(d.getElementById('对象名').textContent === 行们[0].dataset.收款人,
            '★ 对象名 = 选中的成员（实际 ' + d.getElementById('对象名').textContent + '）');

        /* 切换收款人 */
        点(w, 行们[1]);
        await 等(60);
        ok(d.querySelector('.收款人行.选中').dataset.收款人 === 行们[1].dataset.收款人,
            '★ ★ 可切换收款人');
        ok(d.getElementById('对象名').textContent === 行们[1].dataset.收款人,
            '★ 对象名跟着变（实际 ' + d.getElementById('对象名').textContent + '）');

        /* 金额用的是单聊那个输入框 */
        输入(w, d.getElementById('金额输入'), '52.5');
        ok(!d.getElementById('确认键').disabled, '★ 填金额后可提交');
    }

    console.log('\n[D] 13 红包（单聊）');
    {
        const w = await 起('13_hongbao.html', false, {});
        await 等(300);
        const d = w.document;
        ok(d.getElementById('玩法卡').style.display === 'none', '★ 单聊没有玩法切换');
        ok(d.getElementById('个数卡').style.display === 'none', '★ 单聊没有个数');
        ok(!!d.getElementById('金额输入'), '★ 有金额输入');
        ok(!!d.getElementById('祝福输入'), '★ 有祝福语输入');
        ok(d.getElementById('祝福输入').placeholder === '恭喜发财，大吉大利',
            '★ 祝福语默认占位');
        输入(w, d.getElementById('金额输入'), '8.8');
        ok(!d.getElementById('确认键').disabled, '★ 填了金额可点');
    }

    console.log('\n[E] ★ 13 群聊 → 玩法两档 + 个数');
    {
        const w = await 起('13_hongbao.html', true, {});
        await 等(300);
        const d = w.document;
        ok(d.getElementById('玩法卡').style.display !== 'none', '★ 群聊显示玩法切换');
        ok(d.getElementById('个数卡').style.display !== 'none', '★ 群聊显示个数');

        const 钮们 = d.querySelectorAll('.分段钮');
        ok(钮们.length === 2, '★ 两档（实际 ' + 钮们.length + '）');
        ok(钮们[0].classList.contains('选中') && /拼手气/.test(钮们[0].textContent),
            '★ 默认拼手气（QQ 习惯）');

        // 个数默认 = 群人数 3
        ok(d.getElementById('个数值').textContent === '3',
            '★ 个数默认 = 群人数 3（实际 ' + d.getElementById('个数值').textContent + '）');
        ok(d.getElementById('群人数').textContent === '3', '★ 显示群人数 3');

        输入(w, d.getElementById('金额输入'), '100');
        // 普通红包：每人 33.33
        点(w, d.getElementById('玩法普'));
        await 等(40);
        ok(钮们[1].classList.contains('选中') && !钮们[0].classList.contains('选中'),
            '★ 可切到普通红包');
        ok(/¥33\.33/.test(d.getElementById('分摊右').textContent),
            '★ 普通 100 ÷ 3 = ¥33.33（实际 ' + d.getElementById('分摊右').textContent + '）');
        // 拼手气：显示平均，文案不同
        点(w, d.getElementById('玩法拼'));
        await 等(40);
        ok(/平均/.test(d.getElementById('分摊左').textContent),
            '★ 拼手气文案是「每个平均」（实际 ' + d.getElementById('分摊左').textContent + '）');

        点(w, d.getElementById('减个'));
        await 等(40);
        ok(d.getElementById('个数值').textContent === '2', '★ 个数可步进');
        ok(/¥50\.00/.test(d.getElementById('分摊右').textContent),
            '★ 重算 ¥50.00（实际 ' + d.getElementById('分摊右').textContent + '）');
    }

    console.log('\n[F] 14 语音通话（单聊）');
    {
        const w = await 起('14_yuyintonghua.html', false, {});
        await 等(300);
        const d = w.document;
        ok(d.getElementById('通话视图').classList.contains('当前'),
            '★ 单聊 → 直接进通话视图（不先选人）');
        ok(!d.getElementById('选人视图').classList.contains('当前'), '★ 选人视图不显示');
        ok(d.getElementById('通话名').textContent === '林彦',
            '★ 显示对方昵称（实际 ' + d.getElementById('通话名').textContent + '）');
        ok(/正在呼叫/.test(d.getElementById('通话状态').textContent),
            '★ 状态「正在呼叫…」（实际 ' + d.getElementById('通话状态').textContent + '）');
        ok(d.getElementById('通话头像').classList.contains('呼叫中'), '★ 头像有呼叫动画');
        ok(d.getElementById('成员名单').style.display === 'none', '★ 单聊不显示成员名单');

        await 等(2200);
        ok(/通话中/.test(d.getElementById('通话状态').textContent),
            '★ 2 秒后接通（实际 ' + d.getElementById('通话状态').textContent + '）');
        ok(!d.getElementById('通话头像').classList.contains('呼叫中'), '★ 接通后停动画');
        await 等(1100);
        ok(/0:0[12]/.test(d.getElementById('通话计时').textContent),
            '★ 开始计时（实际 ' + d.getElementById('通话计时').textContent + '）');
    }

    console.log('\n[G] ★ 14 群聊 → 先选成员（上限 9）');
    {
        const w = await 起('14_yuyintonghua.html', true, {});
        await 等(300);
        const d = w.document;
        ok(d.getElementById('选人视图').classList.contains('当前'),
            '★ 群聊 → 先进选人视图');
        ok(d.getElementById('页面标题').textContent === '选择通话成员',
            '★ 标题「选择通话成员」（实际 ' + d.getElementById('页面标题').textContent + '）');
        const 行们 = d.querySelectorAll('.成员行');
        ok(行们.length === 2, '★ 成员池 = 除自己外的 2 人（实际 ' + 行们.length + '）');
        ok(/0\s*\/\s*9/.test(d.getElementById('选人说明').textContent),
            '★ 上限 9 人（实际 ' + d.getElementById('选人说明').textContent + '）');
        ok(d.getElementById('发起键').disabled, '★ 没选人时发起键禁用');

        点(w, 行们[0]);
        点(w, 行们[1]);
        await 等(40);
        ok(/2\s*\/\s*9/.test(d.getElementById('选人说明').textContent), '★ 选 2 人');
        ok(!d.getElementById('发起键').disabled, '★ 选了人 → 可发起');

        点(w, d.getElementById('发起键'));
        await 等(80);
        ok(d.getElementById('通话视图').classList.contains('当前'), '★ 进入通话视图');
        ok(/正在呼叫\s*2\s*人/.test(d.getElementById('通话状态').textContent),
            '★ 显示呼叫 2 人（实际 ' + d.getElementById('通话状态').textContent + '）');
        ok(d.getElementById('成员名单').style.display !== 'none', '★ 显示成员名单');
        ok(/陆沉渊/.test(d.getElementById('成员名单').textContent),
            '★ 名单内容对（实际 ' + d.getElementById('成员名单').textContent + '）');
        ok(/陆沉渊/.test(d.getElementById('通话名').textContent), '★ 通话名列出成员');
    }

    console.log('\n[H] ★ 写「待发消息_<sid>」');
    {
        // 12 单聊转账
        let 数据 = {};
        let w = await 起('12_zhuanzhang.html', false, 数据);
        await 等(300);
        输入(w, w.document.getElementById('金额输入'), '66.6');
        输入(w, w.document.getElementById('说明输入'), '还你的');
        点(w, w.document.getElementById('确认键'));
        await 等(80);
        let 包 = 待发(数据);
        ok(!!包 && 包.类型 === '转账', '★ 12：类型 = 转账');
        ok(!!包 && 包.文 === '[转账]', '★ 12：会话文案 [转账]');
        ok(!!包 && 包.卡.种类 === '转账' && 包.卡.金额 === 66.6 && 包.卡.说明 === '还你的',
            '★ 12：卡片数据完整（' + JSON.stringify(包 && 包.卡) + '）');
        ok(w.最后跳转 === 回, '★ 12：提交后回 7 页（实际 ' + w.最后跳转 + '）');

        // 12 群聊：转给某位成员（不是 AA）
        数据 = {};
        w = await 起('12_zhuanzhang.html', true, 数据);
        await 等(300);
        /* 选第二位成员，再填金额 */
        const 群行们 = Array.from(w.document.querySelectorAll('.收款人行'));
        点(w, 群行们[1]);
        await 等(60);
        输入(w, w.document.getElementById('金额输入'), '30');
        点(w, w.document.getElementById('确认键'));
        await 等(80);
        包 = 待发(数据);
        ok(!!包 && 包.卡.种类 === '转账' && 包.卡.金额 === 30,
            '★ ★ 12 群：仍是「转账」卡片，不是 AA（' + JSON.stringify(包 && 包.卡) + '）');
        ok(!!包 && !!包.卡.对象 && 包.卡.对象 === 群行们[1].dataset.收款人,
            '★ ★ 12 群：卡片带收款人（实际 ' + (包 && 包.卡.对象) + '）');
        ok(!!包 && 包.卡.每人 === undefined && 包.卡.人数 === undefined,
            '★ ★ 12 群：不再有人数 / 每人均摊字段');
        ok(!!包 && 包.文 === '[转账]', '★ 12 群：会话文案 [转账]（不是 [AA收款]）');

        // 13 群聊红包
        数据 = {};
        w = await 起('13_hongbao.html', true, 数据);
        await 等(300);
        点(w, w.document.getElementById('玩法普'));
        输入(w, w.document.getElementById('金额输入'), '100');
        输入(w, w.document.getElementById('祝福输入'), '新年快乐');
        点(w, w.document.getElementById('确认键'));
        await 等(80);
        包 = 待发(数据);
        ok(!!包 && 包.卡.种类 === '普通红包' && 包.卡.个数 === 3 && 包.卡.祝福 === '新年快乐',
            '★ 13 群：普通红包卡片（' + JSON.stringify(包 && 包.卡) + '）');

        // 13 单聊红包
        数据 = {};
        w = await 起('13_hongbao.html', false, 数据);
        await 等(300);
        输入(w, w.document.getElementById('金额输入'), '8.8');
        点(w, w.document.getElementById('确认键'));
        await 等(80);
        包 = 待发(数据);
        ok(!!包 && 包.卡.种类 === '红包' && 包.卡.个数 === 1,
            '★ 13 单：红包卡片 1 个（' + JSON.stringify(包 && 包.卡) + '）');
        ok(!!包 && /恭喜发财/.test(包.卡.祝福), '★ 13：祝福语有默认值');

        // 14 挂断 → 通话卡片
        数据 = {};
        w = await 起('14_yuyintonghua.html', false, 数据);
        await 等(300);
        点(w, w.document.getElementById('挂断键'));
        await 等(80);
        包 = 待发(数据);
        ok(!!包 && 包.类型 === '通话' && 包.文 === '[语音通话]',
            '★ 14：类型 = 通话');
        ok(!!包 && 包.卡.结果 === '已取消' && Array.isArray(包.卡.成员),
            '★ 14：未接通 → 结果「已取消」（' + JSON.stringify(包 && 包.卡) + '）');

        // 14 群聊：成员名单进卡片
        数据 = {};
        w = await 起('14_yuyintonghua.html', true, 数据);
        await 等(300);
        点(w, w.document.querySelectorAll('.成员行')[0]);
        await 等(40);
        点(w, w.document.getElementById('发起键'));
        await 等(2330);                 // 等接通
        点(w, w.document.getElementById('挂断键'));
        await 等(80);
        包 = 待发(数据);
        ok(!!包 && 包.卡.结果 === '已完成',
            '★ 14 群：接通后挂断 → 结果「已完成」（实际 ' + (包 && 包.卡.结果) + '）');
        ok(!!包 && 包.卡.成员.length === 1, '★ 14 群：成员名单进卡片');
    }

    console.log('\n[H2] ★ 14 页通话界面：照 QQ 语音通话');
    {
        const 源 = 读('14_yuyintonghua.html');

        /* ★ 背景：QQ 是把对方头像放大模糊铺满整屏 */
        ok(/\.通话背景\s*\{/.test(源), '★ 有模糊头像背景层（.通话背景）');
        const 背景块 = /\.通话背景\s*\{([^}]*)\}/.exec(源);
        ok(!!背景块 && /blur\(/.test(背景块[1]), '★ 背景是模糊的（filter: blur）');
        ok(!!背景块 && /scale\(/.test(背景块[1]), '★ 背景放大过（避免模糊后露白边）');
        ok(/通话背景\.style\.backgroundImage/.test(源), '★ 背景图用对方头像动态设置');

        /* ★ 底部一排圆钮：静音 / 免提 / 邀请成员 / 挂断（QQ 的控制栏） */
        for (const [id, 名] of [
            ['静音键', '静音'], ['免提键', '免提'],
            ['邀请键', '邀请成员'], ['挂断键', '挂断'],
        ]) {
            ok(!!源.includes('id="' + id + '"'), '★ 有「' + 名 + '」圆钮（#' + id + '）');
        }
        ok(/\.通话钮组\s*\{/.test(源), '★ 控制钮是圆钮（.通话钮组）');
        ok(/已静音/.test(源) && /免提中/.test(源), '★ 静音 / 免提有开关态文案');

        /* ★★ 色调统一：挂断不抄 QQ 的红色 */
        ok(!/#d9564f/i.test(源) && !/#c04a44/i.test(源),
            '★ 挂断没有用 QQ 的红（#d9564f）');
        const 挂断块 = /\.通话钮组\.挂断 \.通话圆钮\s*\{([^}]*)\}/.exec(源);
        ok(!!挂断块 && /var\(--accent\)/.test(挂断块[1]),
            '★ 挂断统一用 --accent 深灰强调色');
        ok(!!挂断块 && /width:/.test(挂断块[1]), '★ 挂断比其它钮大一号（更醒目）');

        /* 静音 / 免提真的能切 */
        const w = await 起('14_yuyintonghua.html', false, {});
        await 等(300);
        const d = w.document;
        ok(!d.getElementById('静音键').classList.contains('开'), '初始未静音');
        点(w, d.getElementById('静音键'));
        await 等(40);
        ok(d.getElementById('静音键').classList.contains('开')
            && d.getElementById('静音文字').textContent === '已静音',
            '★ 点静音 → 开 + 文案「已静音」');
        点(w, d.getElementById('静音键'));
        await 等(40);
        ok(!d.getElementById('静音键').classList.contains('开')
            && d.getElementById('静音文字').textContent === '静音', '★ 再点 → 关');
        点(w, d.getElementById('免提键'));
        await 等(40);
        ok(d.getElementById('免提键').classList.contains('开')
            && d.getElementById('免提文字').textContent === '免提中', '★ 免提可切');

        // 未接通时挂断叫「取消」，接通后才叫「挂断」（QQ 也这样）
        ok(d.getElementById('挂断文字').textContent === '取消',
            '★ 未接通时按钮叫「取消」（实际 ' + d.getElementById('挂断文字').textContent + '）');
        await 等(2200);
        ok(d.getElementById('挂断文字').textContent === '挂断', '★ 接通后改成「挂断」');

        // 单聊不显示「邀请成员」
        ok(d.getElementById('邀请键').style.display === 'none', '★ 单聊隐藏「邀请成员」');
    }
    {
        /* ★ 群聊通话中「邀请成员」：回到选人页补人，通话不中断 */
        const w = await 起('14_yuyintonghua.html', true, {});
        await 等(300);
        const d = w.document;
        点(w, d.querySelectorAll('.成员行')[0]);
        await 等(40);
        点(w, d.getElementById('发起键'));
        await 等(2330);
        ok(d.getElementById('邀请键').style.display !== 'none', '★ 群聊显示「邀请成员」');

        点(w, d.getElementById('邀请键'));
        await 等(80);
        ok(d.getElementById('选人视图').classList.contains('当前'),
            '★ 点邀请 → 回到选人页');
        ok(d.getElementById('发起键').textContent === '完成',
            '★ 按钮文案变「完成」（不是「发起通话」）');
        ok(d.querySelectorAll('.成员行.选中').length === 1, '★ 已在通话的人预先勾着');

        点(w, d.querySelectorAll('.成员行')[1]);      // 再补一人
        await 等(40);
        点(w, d.getElementById('发起键'));
        await 等(80);
        ok(d.getElementById('通话视图').classList.contains('当前'), '★ 完成 → 回通话');
        ok(/2\s*人/.test(d.getElementById('通话状态').textContent),
            '★ 人数更新为 2（实际 ' + d.getElementById('通话状态').textContent + '）');
        ok(/陆沉渊/.test(d.getElementById('成员名单').textContent)
            && /白九霄/.test(d.getElementById('成员名单').textContent),
            '★ 新成员进名单（实际 ' + d.getElementById('成员名单').textContent + '）');
    }

    console.log('\n[I] ★ 返回：回 7 页；12/13 不落消息，14 已通话的要落');
    {
        /* 12 / 13：没确认就返回 = 放弃，不该留东西 */
        for (const 文件 of ['12_zhuanzhang.html', '13_hongbao.html']) {
            const 数据 = {};
            const w = await 起(文件, false, 数据);
            await 等(300);
            点(w, w.document.getElementById('返回按钮'));
            await 等(80);
            ok(w.最后跳转 === 回,
                '★ ' + 文件 + '：返回 → ' + 回 + '（实际 ' + w.最后跳转 + '）');
            ok(!待发(数据), '★ ' + 文件 + '：未确认就返回 → 不写待发消息');
        }
        // Esc 同返回
        let 数据 = {};
        let w = await 起('12_zhuanzhang.html', false, 数据);
        await 等(300);
        w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await 等(80);
        ok(w.最后跳转 === 回, '★ Esc → 同样回 7 页');

        /* ★ 14 群聊【选人页】返回：还没发起通话，不该落记录 */
        数据 = {};
        w = await 起('14_yuyintonghua.html', true, 数据);
        await 等(300);
        点(w, w.document.getElementById('返回按钮'));
        await 等(80);
        ok(w.最后跳转 === 回, '★ 14：选人页返回 → 回 7 页');
        ok(!待发(数据), '★ 14：还没发起通话 → 返回不落记录');

        /* ★★ 14 通话中返回：通话已经打过了，记录不能凭空消失
           （这是个 bug：原来只有点挂断才写，按返回退出就查无此记录了） */
        数据 = {};
        w = await 起('14_yuyintonghua.html', false, 数据);
        await 等(2330);                        // 等接通
        点(w, w.document.getElementById('返回按钮'));
        await 等(80);
        ok(w.最后跳转 === 回, '★ 14：通话中返回 → 回 7 页');
        const 包 = 待发(数据);
        ok(!!包 && 包.类型 === '通话', '★★ 通话中按返回 → 仍然落通话卡片（不能丢记录）');
        ok(!!包 && 包.卡.结果 === '已完成', '★ 已接通 → 结果「已完成」');

        // 未接通时返回：落一条「已取消」
        数据 = {};
        w = await 起('14_yuyintonghua.html', false, 数据);
        await 等(300);
        点(w, w.document.getElementById('返回按钮'));
        await 等(80);
        const 包2 = 待发(数据);
        ok(!!包2 && 包2.卡.结果 === '已取消', '★ 未接通就返回 → 落「已取消」');
    }

    console.log('\n[I2] ★ 接通瞬间就要有 0:00（原来要等 1 秒，中间是空的）');
    {
        const w = await 起('14_yuyintonghua.html', false, {});
        await 等(300);
        ok(w.document.getElementById('通话计时').textContent === '',
            '呼叫中：计时位留空（还没接通）');
        await 等(2100);
        ok(w.document.getElementById('通话计时').textContent === '0:00',
            '★★ 接通瞬间即显示 0:00（实际 '
            + w.document.getElementById('通话计时').textContent + '）');
        await 等(1100);
        ok(w.document.getElementById('通话计时').textContent === '0:01', '一秒后走 0:01');
    }

    console.log('\n[J] ★ 金额校验');
    {
        // 12 单聊：空 / 超限
        let 数据 = {};
        let w = await 起('12_zhuanzhang.html', false, 数据);
        await 等(300);
        ok(w.document.getElementById('确认键').disabled, '★ 空金额 → 按钮禁用点不了');
        // 直接调提交也要被拦（模拟绕过 UI）
        w.document.getElementById('金额输入').value = '';
        w.document.getElementById('确认键').disabled = false;
        点(w, w.document.getElementById('确认键'));
        await 等(60);
        ok(!待发(数据), '★ 空金额 → 不写待发消息');

        数据 = {};
        w = await 起('12_zhuanzhang.html', false, 数据);
        await 等(300);
        输入(w, w.document.getElementById('金额输入'), '30000');
        w.document.getElementById('确认键').disabled = false;
        点(w, w.document.getElementById('确认键'));
        await 等(60);
        ok(!待发(数据), '★ 超 ¥20000 → 拦下');
        ok(/20,000/.test(w.document.getElementById('toast').textContent),
            '★ 提示写明上限（实际 ' + w.document.getElementById('toast').textContent + '）');

        // 12 群聊：没填金额 → 提交被拦在按钮禁用上，不该写出待发消息
        数据 = {};
        w = await 起('12_zhuanzhang.html', true, 数据);
        await 等(300);
        ok(w.document.getElementById('确认键').disabled,
            '★ 群聊没填金额 → 确认键禁用');
        点(w, w.document.getElementById('确认键'));
        await 等(60);
        /* 待发() 固定读 c_1 键；这里 sid 是群 id，直接按群键查 */
        let 群包 = null;
        try { 群包 = JSON.parse(数据['待发消息_g_a'] || 'null'); } catch (e) {}
        ok(!群包, '★ 群聊没填金额 → 不写待发消息');

        // 非法字符
        数据 = {};
        w = await 起('12_zhuanzhang.html', false, 数据);
        await 等(300);
        输入(w, w.document.getElementById('金额输入'), '1a2.3.4b5');
        ok(w.document.getElementById('金额输入').value === '12.34',
            '★ 非数字与多余小数点被洗掉（实际 '
            + w.document.getElementById('金额输入').value + '）');

        // 13：超限
        数据 = {};
        w = await 起('13_hongbao.html', false, 数据);
        await 等(300);
        输入(w, w.document.getElementById('金额输入'), '99999');
        w.document.getElementById('确认键').disabled = false;
        点(w, w.document.getElementById('确认键'));
        await 等(60);
        ok(!待发(数据), '★ 13 超限 → 拦下');
    }

    console.log('\n[AA] ★★★ 转账：单聊 vs 群聊（群聊 = 选人转账，微信同款）');
    {
        const 索引 = JSON.stringify([
            { id: 'c1', 名称: '林彦', 头像: 'h1' },
            { id: 'c2', 名称: '陆沉渊', 头像: 'h2' },
            { id: 'c3', 名称: '白九霄', 头像: 'h3' },
            { id: 'c4', 名称: '埃洛温', 头像: 'h4' }
        ]);
        const 群 = JSON.stringify([{
            id: 'g_a', 名称: '老友局',
            成员: [{ id: 'c1', 名: '林彦', 头像: 'h1' }, { id: 'c2', 名: '陆沉渊', 头像: 'h2' }]
        }]);

        console.log('  — 单聊 —');
        let w = await 起自('12_zhuanzhang.html', { '联系人索引': 索引 },
            'http://localhost/12.html?id=c1&sid=c1&name=林彦');
        await 等(400);
        let d = w.document;
        ok(d.getElementById('页面标题').textContent === '转账', '★ 单聊标题「转账」');
        ok(d.getElementById('单聊卡').style.display !== 'none', '★ 单聊显示转账卡');
        ok(d.getElementById('收款人列表').style.display === 'none',
            '★ 单聊不显示收款人列表');
        ok(d.getElementById('对象名').textContent === '林彦', '★ 显示转账对象名');
        ok(!!d.getElementById('对象头像'), '★ 显示对方头像（微信同款）');
        ok(d.getElementById('确认键').textContent === '确认转账', '★ 按钮「确认转账」');

        console.log('  — 群聊 —');
        const 数据2 = { '联系人索引': 索引, '群聊列表': 群 };
        w = await 起自('12_zhuanzhang.html', 数据2,
            'http://localhost/12.html?id=g_a&sid=g_a&type=group&name=老友局');
        await 等(400);
        d = w.document;
        ok(d.getElementById('页面标题').textContent === '转账',
            '★ ★ 群聊标题仍是「转账」（不是 AA 收款）');
        ok(d.getElementById('单聊卡').style.display !== 'none', '★ 群聊也显示同一张转账卡');
        ok(d.getElementById('确认键').textContent === '确认转账', '★ 按钮「确认转账」');

        /* ★★ 收款人 = 群里的真实成员（不是联系人索引里的所有人） */
        const 成员行 = Array.from(d.querySelectorAll('.收款人行'));
        ok(成员行.length === 2,
            '★ ★★ 收款人 = 真实群成员 2 位（实际 ' + 成员行.length + ' 位，'
            + '旧算法会从联系人索引算成 4）');
        const 名字集 = 成员行.map(e => e.dataset.收款人).sort().join(',');
        ok(名字集 === '林彦,陆沉渊', '★ 成员名对（实际 ' + 名字集 + '）');

        ok(d.querySelectorAll('.收款人行.选中').length === 1, '★ 默认选中一位');
        ok(d.getElementById('对象名').textContent === '林彦',
            '★ 默认收款人是第一个成员（实际 ' + d.getElementById('对象名').textContent + '）');

        /* 切到第二位 → 对象名与头像都跟着换 */
        点(w, 成员行[1]);
        await 等(60);
        ok(d.getElementById('对象名').textContent === '陆沉渊',
            '★ ★ 切换收款人 → 对象名跟着变（实际 '
            + d.getElementById('对象名').textContent + '）');

        /* 提交 → 卡里带对象 */
        d.getElementById('金额输入').value = '90';
        d.getElementById('金额输入').dispatchEvent(new w.Event('input', { bubbles: true }));
        await 等(80);
        点(w, d.getElementById('确认键'));
        await 等(120);
        let 包 = null;
        try { 包 = JSON.parse(数据2['待发消息_g_a'] || 'null'); } catch (e) {}
        ok(!!包 && 包.卡.种类 === '转账' && 包.卡.金额 === 90 && 包.卡.对象 === '陆沉渊',
            '★ ★ 群转账卡片 = 转账 + 收款人（' + JSON.stringify(包 && 包.卡) + '）');
        ok(!!包 && 包.卡.人数 === undefined, '★ ★ 不再有「人数 / 均摊」字段（不是 AA）');
    }

    console.log('\n[HB] ★★★ 红包：单聊 vs 群聊');
    {
        const 索引 = JSON.stringify([
            { id: 'c1', 名称: '林彦', 头像: 'h1' },
            { id: 'c2', 名称: '陆沉渊', 头像: 'h2' },
            { id: 'c3', 名称: '白九霄', 头像: 'h3' },
            { id: 'c4', 名称: '埃洛温', 头像: 'h4' }
        ]);
        const 群 = JSON.stringify([{
            id: 'g_a', 名称: '老友局',
            成员: [{ id: 'c1', 名: '林彦', 头像: 'h1' }, { id: 'c2', 名: '陆沉渊', 头像: 'h2' }]
        }]);

        console.log('  — 群聊 —');
        let w = await 起自('13_hongbao.html', { '联系人索引': 索引, '群聊列表': 群 },
            'http://localhost/13.html?id=g_a&sid=g_a&type=group&name=老友局');
        await 等(400);
        let d = w.document;
        ok(d.getElementById('玩法卡').style.display !== 'none', '★ 群聊有玩法档（拼手气/普通）');
        ok(d.getElementById('个数卡').style.display !== 'none', '★ 群聊有个数');
        ok(d.getElementById('群人数').textContent === '3',
            '★ ★★ 群人数 = 2 + 我 = 3（实际 ' + d.getElementById('群人数').textContent + '）');
        ok(/老友局/.test(d.getElementById('群名注').textContent), '★ 标出群名');
        ok(d.getElementById('个数值').textContent === '3', '★ 默认个数 = 群人数');

        点(w, d.getElementById('加个'));
        await 等(60);
        ok(d.getElementById('个数值').textContent === '3',
            '★ ★ 个数不能超过群人数（实际 ' + d.getElementById('个数值').textContent + '）');
        ok(/最多 3 个/.test(d.getElementById('toast').textContent), '★ 超限提示');

        console.log('  — 单聊 —');
        w = await 起自('13_hongbao.html', { '联系人索引': 索引 },
            'http://localhost/13.html?id=c1&sid=c1&name=林彦');
        await 等(400);
        d = w.document;
        ok(d.getElementById('玩法卡').style.display === 'none', '★ 单聊无玩法档');
        ok(d.getElementById('个数卡').style.display === 'none', '★ 单聊无个数');
        ok(d.getElementById('金额标题').textContent === '红包金额', '★ 单聊是「红包金额」不是「总金额」');
    }

    console.log('\n[QL] ★★ 4 页加号菜单「一起聊天」→ 17 页（与 1 页同一个入口）');
    {
        const w = await 起自('4_tongxun.html',
            { '联系人索引': JSON.stringify([{ id: 'c1', 名称: '林彦', 头像: 'h1' }]) },
            'http://localhost/4.html');
        await 等(700);
        const d = w.document;
        const 菜单 = Array.from(d.querySelectorAll('.添加菜单项'))
            .map(e => e.querySelector('.添加菜单文字').textContent);
        ok(菜单.includes('一起聊天'),
            '★ ★ 菜单有「一起聊天」（与 1 页同名）（实际 ' + 菜单.join('/') + '）');

        const 项 = Array.from(d.querySelectorAll('.添加菜单项'))
            .find(e => e.dataset.动作 === '一起聊天');
        ok(!!项, '★ 菜单项存在且可定位');
        点(w, 项);
        await 等(120);
        ok(w.最后跳转 === '17_faqiqunliao.html?from=4',
            '★ ★ 点它 → 17_faqiqunliao.html?from=4（实际 ' + w.最后跳转 + '）');

        /* ★ 旧动作名「发起群聊」也留着映射，改回来不会 404 */
        const 源码4 = 读('4_tongxun.html');
        ok(/发起群聊:\s*'17_faqiqunliao\.html\?from=4'/.test(源码4),
            '★ 旧动作名「发起群聊」也保留了映射');

        const w2 = await 起自('17_faqiqunliao.html', {}, 'http://localhost/17.html?from=4');
        await 等(400);
        ok(w2.取返回页() === '4_tongxun.html',
            '★ from=4 → 返回 4 页（实际 ' + w2.取返回页() + '）');
        ok(/from=' \+ encodeURIComponent\(来源/.test(读('17_faqiqunliao.html')),
            '★ 建群后进群聊，from 沿用来源（返回链不断）');
    }

    收尾(errors, '✅ 12 / 13 / 14 三个功能页全部通过');
})();
