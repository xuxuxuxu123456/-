/**
 * verify_shanchu.js —— 长按删除会话 / 联系人
 *
 * 覆盖：
 *   ① 公共层：联系人删除.js 提供了 清联系人 / 清群 / 确认 / 绑长按
 *   ② 1 页：长按会话框 → 确认 → 删除（连带清聊天记录等）
 *   ③ 1 页：长按群会话 → 清群聊列表 + 群聊天记录
 *   ④ 4 页：长按联系人 → 删除（连带清会话与聊天记录），且重绘不留空分组
 *   ⑤ 边界：取消不删、移动取消不误触、长按后不误触发点击
 *   ⑥ 同步：两页内联副本与 联系人删除.js 一致
 *
 * 用法：node verify_shanchu.js
 */
const kit = require('./testkit.js');
const fs = require('fs');
const path = require('path');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));

/** 起一页（1 / 4 页），带预置存档 */
async function 起(文件, 数据, 标签) {
    return await 起页面(文件, 'http://localhost/' + 文件, 数据, errors, 标签);
}

/** 造一套有联系人、有群、有存档的数据 */
function 造数据() {
    const 索引 = [
        { id: 'c1', 名称: '埃洛温·影蚀', 备注: '', 头像: '', 消息: '人类天真的以为犯错只需忤悔', 时间: '12:00' },
        { id: 'c2', 名称: '林彦', 备注: '', 头像: '', 消息: '我不喜欢我种的花围着太多蝴蝶', 时间: '13:00' },
    ];
    return {
        索引: 索引,
        数据: {
            '联系人索引': JSON.stringify(索引),
            '聊天记录_c1': JSON.stringify([{ 谁: '对方', 文: 'aaa', 时间戳: Date.now() }]),
            '聊天记录_c2': JSON.stringify([{ 谁: '对方', 文: 'bbb', 时间戳: Date.now() }]),
            '好友信息_c1': JSON.stringify({ 昵称: '埃洛温·影蚀' }),
            '好友头像_c1': 'data:image/png;base64,AA',
            '音色配置_c1': JSON.stringify({ 音色: 'nova', 已启用: true }),
            '当前联系人': JSON.stringify(索引[0]),
            '群聊列表': JSON.stringify([{ id: 'g_1', 名称: '周末局', 成员: [{ id: 'c1', 名: '埃洛温·影蚀' }], 消息: 'x', 时间: '10:00' }]),
            '聊天记录_g_1': JSON.stringify([{ 谁: '对方', 文: '群消息', 时间戳: Date.now() }]),
        },
    };
}

/** 模拟长按：mousedown 后等过阈值 */
function 长按(w, 元素, 毫秒 = 700) {
    元素.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    return 等(毫秒);
}

(async function main() {
    console.log('\n[A] ★★★ 公共层：联系人删除.js');
    {
        const 源 = 读('联系人删除.js');
        const 码 = 源;

        ok(/全局\.联系人删除 = 接口/.test(码), '★ 挂上了 window.联系人删除');
        ok(/function\s+清联系人/.test(码), '★ 有 清联系人()');
        ok(/function\s+清群/.test(码), '★ 有 清群()');
        ok(/function\s+绑长按/.test(码), '★ 有 绑长按()');
        ok(/function\s+确认/.test(码), '★ 有 确认()');

        /* ---------- 删联系人要清的键，一个都不能少 ---------- */
        ok(/\['聊天记录_', '好友信息_', '好友头像_', '音色配置_'\]/.test(码),
            '★ ★★ 清 聊天记录 / 好友信息 / 好友头像 / 音色配置 四个分桶');
        ok(/'联系人索引'/.test(码), '★ ★ 清 联系人索引（本体）');
        ok(/'当前联系人'/.test(码), '★ ★ 清 当前联系人（指向他就是脏数据）');
        ok(/'会话列表'/.test(码), '★ ★ 清旧键 会话列表（兼容未升级的读取方）');
        ok(/'人设列表'/.test(码), '★ 清绑在他身上的人设');

        /* ★★ 群不进联系人索引 —— 删群必须只动 群聊列表 */
        ok(/'群聊列表'/.test(码), '★ ★ 删群清 群聊列表');
        ok(!/清群[\s\S]{0,400}联系人索引/.test(码),
            '★ ★★ 删群【不碰】联系人索引（群本就不在那里）');

        /* ★★ 扫键不能用 Object.keys —— Storage 是代理对象，枚举不到键 */
        ok(/for \(let i = 0; i < 库\.length; i\+\+\)/.test(码)
            && !/Object\.keys\(\s*全局\.localStorage/.test(码),
            '★ ★★ 扫键用 length + key(i)（不是 Object.keys）');

        /* ★★ id 与名都要匹配 —— 老数据两种都可能存在 */
        ok(/const 同id[\s\S]{0,120}const 同名/.test(码),
            '★ ★ 删联系人【id 与名都匹配】（漏一个会留鬼影）');

        /* ---------- 长按手势 ---------- */
        ok(/长按阈值 = 480/.test(码), '★ 长按阈值 480ms');
        ok(/Math\.abs\(t\.clientX - 起x\) > 12/.test(码),
            '★ ★ 手指移动超过 12px 取消（滑动不误触）');
        ok(/元素\.addEventListener\('click'[\s\S]{0,160}触发/.test(码),
            '★ ★ 长按触发后吞掉那次 click（松手不该还进聊天）');

        /* ---------- 不引入新颜色 ---------- */
        ok(!/rgba?\(\s*#/.test(码), '★ ★ 没有 hex 直接进 rgba()');
        ok(/rgba\(var\(--shade\)/.test(码) && /rgba\(var\(--panel\)/.test(码),
            '★ ★ 弹窗用全站色板，没引入新颜色');

        /* ---------- 同步：两页内联副本一致 ---------- */
        const 目标页 = ['1_shouyeyulan.html', '4_tongxun.html'];
        for (const 名 of 目标页) {
            const s = 读(名);
            const 起 = s.indexOf('<script id="联系人删除">');
            ok(起 >= 0, '★ ' + 名 + ' 有内联块');
            if (起 < 0) continue;
            const 正文起 = s.indexOf('\n', 起) + 1;
            const 止 = s.indexOf('</script>', 正文起);
            ok(s.slice(正文起, 止).trim() === 源.trim(),
                '★ ★ ' + 名 + ' 的内联副本与 联系人删除.js 一致');

            /* ★★ 脚本必须在主脚本【之前】—— 否则主脚本跑的时候 window.联系人删除 还不存在 */
            const 主 = s.indexOf('<script>');
            ok(起 < 主, '★ ★★ ' + 名 + ' 内联块在主脚本之前（否则长按静默失效）');
        }
    }

    console.log('\n[B] ★★★ 4 页：长按联系人删除');
    {
        const { 数据 } = 造数据();
        const w = await 起('4_tongxun.html', 数据, '4B');
        await 等(1200);
        const d = w.document;

        ok(!!w.联系人删除, '★ 4 页拿得到 window.联系人删除');
        const 行 = Array.from(d.querySelectorAll('.联系人项'));
        ok(行.length === 2, '★ 有 2 个联系人（实际 ' + 行.length + '）');
        /* ★ 必须有 data-id，否则定位不到分桶键 */
        ok(行.every(e => !!e.dataset.id), '★ ★★ 每个联系人项都带 data-id（'
            + 行.map(e => e.dataset.id).join('/') + '）');

        /* 长按 → 弹确认 */
        await 长按(w, 行[0]);
        const 遮 = d.getElementById('删人遮罩');
        ok(!!遮 && 遮.classList.contains('显示'), '★ ★ 长按弹出确认框');
        ok(/删除联系人/.test(d.getElementById('删人标题').textContent),
            '★ 标题是「删除联系人」（实际 ' + d.getElementById('删人标题').textContent + '）');
        ok(/埃洛温·影蚀/.test(d.getElementById('删人说明').textContent),
            '★ ★ 说明里点名了要删谁');

        /* 取消 → 什么都不删 */
        d.getElementById('删人取消').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(500);
        ok(!遮.classList.contains('显示'), '★ 点取消后弹窗关闭');
        ok(JSON.parse(w.localStorage.getItem('联系人索引')).length === 2,
            '★ ★★ 取消 = 什么都不删（索引仍有 2 条）');
        ok(w.localStorage.getItem('聊天记录_c1') !== null, '★ 取消后聊天记录还在');

        /* 再长按 → 确认删除 */
        await 长按(w, d.querySelectorAll('.联系人项')[0]);
        d.getElementById('删人确定').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(800);

        const 索引后 = JSON.parse(w.localStorage.getItem('联系人索引') || '[]');
        ok(索引后.length === 1, '★ ★★ 索引只剩 1 条（实际 ' + 索引后.length + '）');
        ok(!索引后.some(i => i.id === 'c1'), '★ ★★ 被删的是 c1');
        ok(w.localStorage.getItem('聊天记录_c1') === null, '★ ★★ 聊天记录_c1 已清');
        ok(w.localStorage.getItem('好友信息_c1') === null, '★ ★ 好友信息_c1 已清');
        ok(w.localStorage.getItem('好友头像_c1') === null, '★ ★ 好友头像_c1 已清');
        ok(w.localStorage.getItem('音色配置_c1') === null, '★ ★★ 音色配置_c1 已清');
        ok(w.localStorage.getItem('当前联系人') === null, '★ ★ 当前联系人已清（正指向他）');
        /* ★ 没被删的那个不能受牵连 */
        ok(w.localStorage.getItem('聊天记录_c2') !== null, '★ ★★ c2 的聊天记录没被误删');
        /* ★ 重绘：不留空分组 */
        ok(d.querySelectorAll('.联系人项').length === 1,
            '★ ★ 界面只剩 1 行（已重绘，实际 ' + d.querySelectorAll('.联系人项').length + '）');
    }

    console.log('\n[C] ★★★ 1 页：长按会话框删除');
    {
        const { 数据 } = 造数据();
        const w = await 起('1_shouyeyulan.html', 数据, '1C');
        await 等(1200);
        const d = w.document;
        ok(!!w.联系人删除, '★ 1 页拿得到 window.联系人删除');

        const 全 = Array.from(d.querySelectorAll('.会话项'));
        ok(全.length >= 4, '★ 有会话项（实际 ' + 全.length + '）');

        /* ---- 普通联系人会话 ---- */
        const i = 全.findIndex(e => {
            const n = e.querySelector('.会话名称');
            return n && String(n.textContent || '').indexOf('埃洛温') >= 0;
        });
        ok(i >= 0, '★ 找到「埃洛温·影蚀」这一行');
        if (i >= 0) {
            await 长按(w, 全[i]);
            const 遮 = d.getElementById('删人遮罩');
            ok(遮.classList.contains('显示'), '★ ★ 长按会话框弹出确认');
            ok(/删除会话/.test(d.getElementById('删人标题').textContent),
                '★ 标题是「删除会话」（实际 ' + d.getElementById('删人标题').textContent + '）');

            d.getElementById('删人确定').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
            await 等(800);

            /* ★★★ 删会话 与 删联系人 是两个功能：
                 这里【只删会话】，所以联系人 / 档案 / 音色都必须【保留】。
                 旧断言写的是「连人一起删」，那是旧期望，已按新行为更新。 */
            const 索引后 = JSON.parse(w.localStorage.getItem('联系人索引') || '[]');
            ok(索引后.some(x => String(x.名称 || '').indexOf('埃洛温') >= 0),
                '★ ★★ 只删会话 → 联系人【还在】索引里（实际 '
                + 索引后.map(x => x.名称).join('/') + '）');
            ok(w.localStorage.getItem('聊天记录_c1') === null, '★ ★★ 聊天记录_c1 已清');
            ok(w.localStorage.getItem('好友信息_c1') !== null, '★ ★★ 角色档案【保留】');
            ok(w.localStorage.getItem('音色配置_c1') !== null, '★ ★★ 音色配置【保留】');
            ok(w.localStorage.getItem('聊天记录_c2') !== null, '★ ★ 别人的记录没被误删');
            /* ★ 旧键「会话列表」也要跟着删 */
            const 会话 = JSON.parse(w.localStorage.getItem('会话列表') || '[]');
            ok(!会话.some(x => String(x.名称 || '').indexOf('埃洛温') >= 0),
                '★ ★ 旧键 会话列表 也移除了这一条');
        }

        /* ---- 群会话 ---- */
        const w2 = await 起('1_shouyeyulan.html', 造数据().数据, '1C2');
        await 等(1200);
        const d2 = w2.document;
        const 群项 = Array.from(d2.querySelectorAll('.会话项'))
            .find(e => String(e.dataset.群 || '') === 'g_1');
        ok(!!群项, '★ 找到群会话（data-群=g_1）');
        if (群项) {
            await 长按(w2, 群项);
            ok(d2.getElementById('删人遮罩').classList.contains('显示'), '★ 长按群会话弹出确认');
            ok(/删除群聊会话/.test(d2.getElementById('删人标题').textContent),
                '★ ★ 标题是「删除群聊会话」（实际 '
                + d2.getElementById('删人标题').textContent + '）');
            d2.getElementById('删人确定').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
            await 等(800);
            ok(JSON.parse(w2.localStorage.getItem('群聊列表') || '[]').length === 0,
                '★ ★★ 群聊列表已清空');
            ok(w2.localStorage.getItem('聊天记录_g_1') === null, '★ ★★ 群的聊天记录已清');
            /* ★ 删群不能误删联系人 */
            const 索引 = JSON.parse(w2.localStorage.getItem('联系人索引') || '[]');
            ok(索引.length >= 1, '★ ★ 删群没误删联系人（索引仍有 ' + 索引.length + ' 条）');
        }
    }

    console.log('\n[D] ★★★ 边界：误触与取消');
    {
        const { 数据 } = 造数据();
        const w = await 起('4_tongxun.html', 数据, '4D');
        await 等(1200);
        const d = w.document;
        const 行 = d.querySelectorAll('.联系人项')[0];

        /* ① 短按（不到阈值）不弹窗 */
        行.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0 }));
        await 等(120);
        行.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, button: 0 }));
        await 等(400);
        ok(!d.getElementById('删人遮罩').classList.contains('显示'),
            '★ ★ 短按不弹确认（不会误删）');

        /* ② 长按后移动手指 → 取消
             ★ 只发 touch 序列：真机上滑动就是纯 touch，
               若同时发了 mousedown，那是【两条独立的长按计时】，
               清掉 touch 那条、鼠标那条仍会触发 —— 会误判成"没取消"。 */
        /* ★ MouseEvent 构造函数【不认】touches 参数，硬传会被丢掉，
             e.touches 仍是 undefined —— 那样测出来是假失败。
             所以造普通 Event 再手工挂 touches（监听器只看 e.touches）。 */
        const 触 = (型, x, y) => {
            const e = new w.Event(型, { bubbles: true });
            e.touches = [{ clientX: x, clientY: y }];
            行.dispatchEvent(e);
        };
        触('touchstart', 0, 0);
        await 等(60);
        触('touchmove', 60, 0);
        await 等(700);
        ok(!d.getElementById('删人遮罩').classList.contains('显示'),
            '★ ★ 移动超过 12px 取消长按（滑动列表不误触）');

        /* ③ 点遮罩空白处 = 取消 */
        await 长按(w, d.querySelectorAll('.联系人项')[0]);
        const 遮 = d.getElementById('删人遮罩');
        ok(遮.classList.contains('显示'), '★ 弹窗已开');
        遮.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(400);
        ok(!遮.classList.contains('显示'), '★ ★ 点空白处 = 取消');
        ok(JSON.parse(w.localStorage.getItem('联系人索引')).length === 2,
            '★ ★ 取消后索引没变（仍 2 条）');
    }

    console.log('\n[H] ★★★ 删完【刷新不复活】——1 页会话列表写死在 HTML 里');
    {
        /* ★★ 这是最容易漏的一点：
             1 页的会话列表是 HTML 里【写死】的（4 个默认角色），不是从索引渲染的。
             所以只清「联系人索引」+「聊天记录」根本不够：
               删完刷新 → 写死的那一行又回来了
                       → 6.5 导出还会把它重新写进「联系人索引」
             用户看到的就是「删了又复活」。
             修法是记一份「已删会话」名单，1 页加载时先把这些行抹掉。 */
        const 源码 = 读('1_shouyeyulan.html');
        const 去注释 = 源 => 源.split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
        const 一页码 = 去注释(源码);
        const 助手码 = 去注释(读('联系人删除.js'));

        ok(/const\s+已删键\s*=\s*'已删会话'/.test(助手码), '★ ★★ 有「已删会话」名单');
        ok(/function\s+是已删/.test(助手码), '★ 有 是已删()');
        ok(/function\s+抹掉已删会话/.test(一页码), '★ ★★ 1 页有抹掉已删行的逻辑');
        ok(/清联系人[\s\S]{0,3000}?记已删\(\[称呼\]\)/.test(助手码),
            '★ ★★ 清联系人会记进名单');
        ok(/清群[\s\S]{0,1200}?记已删\(\[称呼\]\)/.test(助手码), '★ ★ 清群也记');
        /* ★ 名单只留最近 200 条 */
        ok(/slice\(-200\)/.test(助手码), '★ 名单有上限（不会无限增长）');

        /* ★★ 顺序硬性要求：必须在 6.5 导出索引【之前】，
             否则导出时又把写死的行写回索引，等于没抹 */
        const 抹位置 = 一页码.indexOf('function 抹掉已删会话');
        const 导位置 = 一页码.indexOf('6.5 导出会话列表') >= 0
            ? 一页码.indexOf('6.5 导出会话列表')
            : 一页码.indexOf("localStorage.setItem('会话列表'");
        ok(抹位置 > 0 && 导位置 > 0 && 抹位置 < 导位置,
            '★ ★★ 抹掉已删行排在导出索引之前（抹 ' + 抹位置 + ' / 导 ' + 导位置 + '）');

        /* ---------- 实测：删完刷新 ---------- */
        const 存 = { '联系人索引': '[]', '已删会话': JSON.stringify(['白九霄']) };
        const w = await 起('1_shouyeyulan.html', 存, '1h');
        await 等(1400);
        const 名们 = Array.from(w.document.querySelectorAll('.会话名称'))
            .map(e => e.textContent.trim());
        ok(名们.indexOf('白九霄') < 0,
            '★ ★★ 刷新后「白九霄」不复活（实际 ' + 名们.join('/') + '）');
        const 索引 = JSON.parse(w.localStorage.getItem('联系人索引') || '[]');
        ok(!索引.some(x => x.名称 === '白九霄'),
            '★ ★★ 也没被导出回索引（实际 ' + 索引.map(x => x.名称).join('/') + '）');
        ok(名们.indexOf('陆沉渊') >= 0, '★ 没删的会话仍在');

        /* ★ 群名带「（N）」人数后缀也要能匹配上 */
        const 助手 = w.联系人删除;
        if (助手 && typeof 助手.是已删 === 'function') {
            ok(助手.是已删('周末局（2）') === false, '★ 没删过的群不算已删');
            助手.记已删(['周末局']);
            ok(助手.是已删('周末局（2）') === true,
                '★ ★★ 群名带人数后缀也能匹配（「周末局」≡「周末局（2）」）');
        }

        /* ★ 跨页：4 页删的人，1 页也不该再显示 */
        const w2 = await 起('1_shouyeyulan.html', {
            '联系人索引': JSON.stringify([
                { id: 'c2', 名称: '白九霄', 备注: '', 头像: 'h2', 消息: 'm', 时间: '13:00' }]),
            '已删会话': JSON.stringify(['阿七']),
        }, '1h2');
        await 等(1400);
        const 名2 = Array.from(w2.document.querySelectorAll('.会话名称'))
            .map(e => e.textContent.trim());
        ok(名2.indexOf('阿七') < 0,
            '★ ★★ 4 页删掉的人，1 页会话框也不再显示（实际 ' + 名2.join('/') + '）');
        ok(名2.indexOf('白九霄') >= 0, '★ 没删的还在');
    }

    console.log('\n[I] ★★★ 删会话 与 删联系人 是【两个功能】');
    {
        const 助手码 = 读('联系人删除.js').split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
        const 一页码 = 读('1_shouyeyulan.html').split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
        const 七页码 = 读('7_liaotian.html').split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');

        /* ① 两个函数都存在且分工不同 */
        ok(/function\s+清会话\(/.test(助手码), '★ ★★ 有独立的 清会话()');
        ok(/function\s+清联系人\(/.test(助手码), '★ ★★ 有独立的 清联系人()');
        /* ★ 只删会话【不能】动 联系人索引 / 档案 / 头像 / 音色 / 人设 */
        const 清会话体 = 助手码.slice(助手码.indexOf('function 清会话('));
        const 身 = 清会话体.slice(0, 清会话体.indexOf('\n    function 清联系人('));
        ok(!/写\('联系人索引'/.test(身), '★ ★★ 清会话【不动】联系人索引');
        ok(!/'好友信息_'/.test(身), '★ ★★ 清会话【不动】角色档案');
        ok(!/'好友头像_'/.test(身), '★ ★★ 清会话【不动】头像');
        ok(!/'音色配置_'/.test(身), '★ ★★ 清会话【不动】音色配置');
        ok(!/'人设列表'/.test(身), '★ ★★ 清会话【不动】人设');
        /* ★ 但聊天记录和会话框要清 */
        ok(/'聊天记录_'/.test(身), '★ ★★ 清会话会清聊天记录');
        ok(/记已删\(\[称呼\]\)/.test(身), '★ ★★ 清会话会记进已删名单（会话行才消失）');

        /* ② 1 页长按会话框走 清会话，不是清联系人 */
        ok(/助手\.清会话\(身\.id, 身\.名\)/.test(一页码),
            '★ ★★ 1 页长按会话框走 清会话()');
        ok(!/助手\.清联系人\(身\.id, 身\.名\)/.test(一页码),
            '★ ★★ 1 页长按会话框【不再】删联系人');
        /* ★ 文案要如实说明「联系人保留」 */
        ok(/通讯录里的这位联系人会保留/.test(读('1_shouyeyulan.html')),
            '★ ★ 文案写明联系人会保留');

        /* ③ 4 页长按联系人走 清联系人（连带清会话） */
        const 四页码 = 读('4_tongxun.html').split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
        ok(/助手\.清联系人\(/.test(四页码), '★ ★★ 4 页长按走 清联系人()');
        ok(/会话框/.test(读('4_tongxun.html')),
            '★ ★ 4 页文案写明会连带删掉会话框');

        /* ④ 会话「复活」：只删会话后联系人还在，重新聊天要能再出现 */
        ok(/function\s+复活会话\(/.test(助手码), '★ ★ 有 复活会话()');
        /* ★★ 7 页没有内联 联系人删除.js（只有 1/4 页内联），
             所以不能直接调 window.联系人删除，必须自己读写「已删会话」键 ——
             否则复活逻辑在 7 页永远不生效，人还在却永远聊不了。 */
        /* ★ 必须【彻底】剥掉 /* *\/ 块注释再断言：
             注释正文里写着「所以这里不能依赖 window.联系人删除」，
             只按行首 * // 过滤是滤不掉的，会把注释文字误判成代码。 */
        /* ★ 顺序很关键：必须【先】在完整源码上剥掉 /* *\/ 块，
             再删行注释。反过来的话（先按行首删 * 和 /*），
             块注释的起止行会被先删掉，块内正文反而残留。 */
        const 剥块 = 码 => 码.replace(/\/\*[\s\S]*?\*\//g, '');
        const 七净 = 剥块(读('7_liaotian.html')).split('\n')
            .filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n');
        const 同步体净 = 七净.slice(七净.indexOf('function 同步会话'));
        ok(!/window\.联系人删除/.test(同步体净),
            '★ ★★ 7 页不依赖 window.联系人删除（它没有内联那份）');
        const 同步体 = 七页码.slice(七页码.indexOf('function 同步会话'));
        ok(/localStorage\.getItem\('已删会话'\)/.test(同步体.slice(0, 2000)),
            '★ ★★ 7 页落地消息时会自己改「已删会话」');

        /* ---------- 实测：只删会话，联系人还在 ---------- */
        const 名 = '白九霄';
        const 预 = {
            '联系人索引': JSON.stringify([
                { id: 'c2', 名称: 名, 备注: '', 头像: 'h2', 消息: 'm', 时间: '13:00' }]),
            '聊天记录_c2': JSON.stringify([{ 谁: '对方', 文: '聊天内容', 时间戳: Date.now() }]),
            '好友信息_c2': JSON.stringify({ 昵称: 名 }),
            '好友头像_c2': 'data:img',
            '音色配置_c2': JSON.stringify({ 已启用: true, 音色: 'nova' }),
        };
        const w = await 起('1_shouyeyulan.html', 预, '1i');
        await 等(1400);
        const d = w.document;
        const 项 = Array.from(d.querySelectorAll('.会话项')).find(e => {
            const n = e.querySelector('.会话名称');
            return n && n.textContent.trim() === 名;
        });
        ok(!!项, '★ 找到「' + 名 + '」的会话行');

        项.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0 }));
        await 等(700);
        ok(/删除会话/.test(d.querySelector('.删人标题').textContent),
            '★ 标题是「删除会话」（不是删除联系人）');
        const 钮 = Array.from(d.querySelectorAll('.删人钮')).find(b => /删除/.test(b.textContent));
        钮.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(500);

        /* ★★ 关键断言：会话没了，但人还在 */
        const 索引 = JSON.parse(w.localStorage.getItem('联系人索引') || '[]');
        ok(索引.some(x => x.名称 === 名),
            '★ ★★ 只删会话 → 通讯录里的联系人【还在】（实际 '
            + 索引.map(x => x.名称).join('/') + '）');
        ok(w.localStorage.getItem('好友信息_c2') !== null, '★ ★★ 角色档案保留');
        ok(w.localStorage.getItem('好友头像_c2') !== null, '★ ★★ 头像保留');
        ok(w.localStorage.getItem('音色配置_c2') !== null, '★ ★★ 音色配置保留');
        ok(w.localStorage.getItem('聊天记录_c2') === null, '★ ★★ 聊天记录已清');
        const 名们 = Array.from(d.querySelectorAll('.会话名称')).map(e => e.textContent.trim());
        ok(名们.indexOf(名) < 0, '★ ★★ 会话框那一行没了（实际 ' + 名们.join('/') + '）');

        /* ---------- 实测：4 页删联系人 → 人没了，会话也没了 ---------- */
        const w4 = await 起('4_tongxun.html', 预, '4i');
        await 等(1400);
        const d4 = w4.document;
        const 行 = Array.from(d4.querySelectorAll('.联系人项'))
            .find(e => e.dataset.名称 === 名);
        ok(!!行, '★ 4 页找到「' + 名 + '」');
        行.dispatchEvent(new w4.MouseEvent('mousedown', { bubbles: true, button: 0 }));
        await 等(700);
        ok(/删除联系人/.test(d4.querySelector('.删人标题').textContent),
            '★ 4 页标题是「删除联系人」');
        const 钮4 = Array.from(d4.querySelectorAll('.删人钮')).find(b => /删除/.test(b.textContent));
        钮4.dispatchEvent(new w4.MouseEvent('click', { bubbles: true }));
        await 等(600);

        const 索引4 = JSON.parse(w4.localStorage.getItem('联系人索引') || '[]');
        ok(!索引4.some(x => x.名称 === 名),
            '★ ★★ 删联系人 → 人真的没了（实际 ' + 索引4.map(x => x.名称).join('/') + '）');
        ok(w4.localStorage.getItem('聊天记录_c2') === null, '★ ★★ 连带清掉聊天记录');
        ok(w4.localStorage.getItem('好友信息_c2') === null, '★ ★★ 连带清掉档案');
        ok(w4.localStorage.getItem('音色配置_c2') === null, '★ ★★ 连带清掉音色');

        /* ---------- 实测：只删会话后重新聊天 → 会话复活 ---------- */
        const 已删 = JSON.parse(w.localStorage.getItem('已删会话') || '[]');
        ok(已删.indexOf(名) >= 0, '★ 删会话后名字进了已删名单');

        /* ★ 自包含地构造：不用前面步骤导出的索引（1 页导出会改写 id，
             导致 7 页按 id 找不到人，复活逻辑测不出来） */
        const w7 = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c2&from=4', {
            '联系人索引': JSON.stringify([
                { id: 'c2', 名称: 名, 备注: '', 头像: 'h2', 消息: 'm', 时间: '13:00' }]),
            '已删会话': JSON.stringify([名]),
        }, errors, '7i');
        await 等(1400);
        const 入 = w7.document.getElementById('消息输入');
        入.value = '又来找你了';
        入.dispatchEvent(new w7.Event('input', { bubbles: true }));
        w7.document.getElementById('发送按钮')
            .dispatchEvent(new w7.MouseEvent('click', { bubbles: true }));
        await 等(2000);

        const 名单 = JSON.parse(w7.localStorage.getItem('已删会话') || '[]');
        ok(名单.indexOf(名) < 0,
            '★ ★★ 7 页重新发消息 → 会话从已删名单移除（实际 ' + 名单.join('/') + '）');
        const 存7 = w7.localStorage.getItem('聊天记录_c2');
        const w1b = await 起('1_shouyeyulan.html', {
            '联系人索引': JSON.stringify([
                { id: 'c2', 名称: 名, 备注: '', 头像: 'h2', 消息: '又来找你了', 时间: '13:00' }]),
            '已删会话': w7.localStorage.getItem('已删会话'),
            '聊天记录_c2': 存7,
        }, '1i2');
        await 等(1400);
        const 名2 = Array.from(w1b.document.querySelectorAll('.会话名称'))
            .map(e => e.textContent.trim());
        ok(名2.indexOf(名) >= 0,
            '★ ★★ 会话框重新出现（实际 ' + 名2.join('/') + '）');
    }

    收尾(errors, '✅ 长按删除会话 / 联系人 全部通过');
})().catch(e => { console.error(e); process.exit(2); });
