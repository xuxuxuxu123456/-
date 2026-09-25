/**
 * verify_upload_panel.js —— ★「所有上传图片的界面，点入口先弹来源面板」专项
 *
 * 需求：任何一处要上传图片的地方，点击后必须先弹出统一面板
 *       「拍摄 / 从手机相册选择 / 取消」，不允许直接唤起系统文件框。
 *
 * 覆盖七个上传点（1 / 2 / 6 / 8 / 9 / 10 / 11 页）：
 *   [A] 每个上传点：面板存在 + 三项文案一致 + 前两项带图标
 *   [B] ★ 点入口 → 只弹面板，file input 一次都没被点（没有绕过面板）
 *   [C] ★ 点「从手机相册选择」→ 只点相册输入（不带 capture）
 *   [D] ★ 点「拍摄」→ 只点拍照输入（带 capture="environment"）
 *   [E] ★ 点「取消」→ 面板收起，且不唤起任何输入
 *   [F] 文件输入：.视觉隐藏（非 display:none，移动端 click 才有效）
 *   [G] 源码级：1 / 2 页已无「桌面端直开文件框」的 是移动端 分支
 *   [H] 六个页面的面板文案逐字一致（改一页忘了同步会在这里炸）
 *
 * 用法：PAGES_DIR=/data/workspace node verify_upload_panel.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));
const 三项文案 = ['拍摄', '从手机相册选择', '取消'];

/**
 * 统计 file 输入的 click 次数，并记下最后被点的那个输入。
 * ★ 这是「先弹面板」的判据：点完入口若次数 > 0，说明面板被绕过了。
 *   6 页的输入是运行时 createElement 出来的，所以必须打在原型上。
 */
function 打桩计数(w) {
    w.__次数 = 0;
    w.__最后 = null;
    w.HTMLInputElement.prototype.click = function () {
        if (this.type === 'file') { w.__次数++; w.__最后 = this; }
    };
}

/** 起页面（带计数桩） */
function 起(文件, 搜索, 数据) {
    return 起页面(文件, 'http://localhost/' + 文件 + (搜索 || ''),
        数据 || {}, errors, '上传面板', 打桩计数);
}

/** 点一下元素（冒泡） */
function 点(w, 元素) {
    元素.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}

/** 面板当前是否弹出 */
function 弹着(w, id) {
    const m = w.document.getElementById(id);
    return !!m && m.classList.contains('显示');
}

/** 面板三项文案 */
function 文案(w, id) {
    return Array.from(w.document.querySelectorAll('#' + id + ' .来源项 .来源文字'))
        .map(e => e.textContent.trim());
}

/**
 * 七个上传点。入口(w) 返回要点的元素；返回 null 表示「进入即自动弹出」（6 页）。
 * 11 页的上传入口在编辑视图里，需先进编辑。
 */
const 上传点 = [
    {
        名: '1 页 · 三宫格配图', 文件: '1_shouyeyulan.html', 遮罩: '来源遮罩',
        入口: w => w.document.querySelector('.极简配图框'),
    },
    {
        名: '1 页 · 个人信息卡头像', 文件: '1_shouyeyulan.html', 遮罩: '来源遮罩',
        入口: w => w.document.querySelector('.个人信息区 .圆形头像'),
    },
    {
        名: '2 页 · 好友头像', 文件: '2_haoyouxinxi.html', 遮罩: '来源遮罩',
        入口: w => w.document.getElementById('头像上传框'),
    },
    {
        名: '6 页 · 发布图片（进入即弹）', 文件: '6_fabudongtai.html', 遮罩: '媒体遮罩',
        搜索: '?type=' + encodeURIComponent('图片'), 入口: null, 等待: 450, 选后等待: 420,
    },
    {
        名: '8 页 · 方形照片', 文件: '8_wode.html', 遮罩: '来源遮罩',
        入口: w => w.document.getElementById('图1').parentElement,
    },
    {
        名: '9 页 · 主题背景', 文件: '9_zhutishezhi.html', 遮罩: '来源遮罩',
        入口: w => w.document.getElementById('上传行'),
    },
    {
        名: '10 页 · 轮播图', 文件: '10_lunbotu.html', 遮罩: '来源遮罩',
        入口: w => w.document.getElementById('上传行'),
    },
    {
        名: '11 页 · 人设头像', 文件: '11_woderenshe.html', 遮罩: '来源遮罩', 额外项: true,
        入口: async w => {
            w.document.getElementById('新建钮')
                .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
            await 等(60);
            return w.document.getElementById('头像大钮');
        },
    },
];

(async function main() {
    console.log('[A][B][C][D][E] ★ 七个上传点：先弹面板，再按所选来源唤起输入');

    for (const 点配置 of 上传点) {
        console.log('\n  —— ' + 点配置.名 + ' ——');
        const 选后等 = 点配置.选后等待 || 150;
        const w = await 起(点配置.文件, 点配置.搜索, {
            '联系人索引': JSON.stringify([{ id: 'c_1', 名称: '甲', 备注: '', 头像: '', 消息: '', 时间: '' }]),
        });
        await 等(点配置.等待 || 180);
        const d = w.document;

        // --- A. 面板结构 ---
        ok(!!d.getElementById(点配置.遮罩), '存在来源面板（#' + 点配置.遮罩 + '）');
        const 文 = 文案(w, 点配置.遮罩);
        if (点配置.额外项) {
            /* 11 页额外多一项「预选头像」（18 张内置素材，点开是全屏预选界面）。
               标准三项必须在，且顺序不变；额外项夹在「从手机相册选择」之后。 */
            ok(文.join(' / ') === ['拍摄', '从手机相册选择', '预选头像', '取消'].join(' / '),
                '★ 四项文案 = 拍摄 / 从手机相册选择 / 预选头像 / 取消（实际 ' + 文.join(' / ') + '）');
            ok(d.querySelectorAll('#' + 点配置.遮罩 + ' .来源项').length === 4, '面板共四项（含预选头像）');
        } else {
            ok(文.join(' / ') === 三项文案.join(' / '),
                '★ 三项文案 = 拍摄 / 从手机相册选择 / 取消（实际 ' + 文.join(' / ') + '）');
            ok(d.querySelectorAll('#' + 点配置.遮罩 + ' .来源项').length === 3, '面板共三项');
        }
        ok(d.querySelectorAll('#' + 点配置.遮罩 + ' .来源组 .来源项 svg').length
            === (点配置.额外项 ? 3 : 2),
            '★ 来源组内每项各带一枚图标');
        ok(!!d.querySelector('#' + 点配置.遮罩 + ' .来源项.取消'),
            '★ 末项是独立的「取消」块');

        // --- B. 点入口：只弹面板，不得直接开文件框 ---
        if (点配置.入口) {
            const 元素 = await 点配置.入口(w);
            ok(!!元素, '找到上传入口');
            if (元素) {
                点(w, 元素);
                await 等(120);
                ok(弹着(w, 点配置.遮罩), '★ 点入口 → 弹出来源面板');
                ok(w.__次数 === 0,
                    '★★ 点入口时 file 输入一次都没被点（实际 ' + w.__次数 + ' 次）'
                    + ' —— 没有绕过面板直接开系统文件框');
            }
        } else {
            ok(弹着(w, 点配置.遮罩), '★ 进入即弹出来源面板');
        }

        // --- C. 选「从手机相册选择」→ 只点相册输入（不带 capture）---
        const 相册键 = d.getElementById('来源相册') || d.querySelector('#' + 点配置.遮罩 + ' [data-动作="相册"]');
        ok(!!相册键, '存在「从手机相册选择」项');
        if (相册键) {
            点(w, 相册键);
            await 等(选后等);
            ok(w.__次数 === 1, '★ 点相册 → 恰好唤起 1 次输入（实际 ' + w.__次数 + '）');
            ok(!!w.__最后 && !w.__最后.hasAttribute('capture'),
                '★ 唤起的是相册输入（不带 capture，否则会直接开相机）');
            ok(!弹着(w, 点配置.遮罩), '选完来源后面板收起');
        }

        // --- D. 选「拍摄」→ 只点拍照输入（带 capture）---
        w.__次数 = 0; w.__最后 = null;
        if (点配置.入口) 点(w, await 点配置.入口(w));
        else { await 等(0); d.getElementById(点配置.遮罩).classList.add('显示'); }
        await 等(点配置.入口 ? 120 : 60);
        const 拍照键 = d.getElementById('来源拍照') || d.querySelector('#' + 点配置.遮罩 + ' [data-动作="拍摄"]');
        ok(!!拍照键, '存在「拍摄」项');
        if (拍照键) {
            点(w, 拍照键);
            await 等(选后等);
            ok(w.__次数 === 1, '★ 点拍摄 → 恰好唤起 1 次输入（实际 ' + w.__次数 + '）');
            ok(!!w.__最后 && w.__最后.getAttribute('capture') === 'environment',
                '★ 唤起的是拍照输入（capture="environment"）');
        }

        // --- E. 取消：不唤起任何输入 ---
        w.__次数 = 0;
        if (点配置.入口) 点(w, await 点配置.入口(w));
        else d.getElementById(点配置.遮罩).classList.add('显示');
        await 等(120);
        const 取消键 = d.getElementById('来源取消') || d.querySelector('#' + 点配置.遮罩 + ' [data-动作="取消"]');
        if (取消键) {
            点(w, 取消键);
            await 等(选后等);
            ok(!弹着(w, 点配置.遮罩), '★ 点取消 → 面板收起');
            ok(w.__次数 === 0, '★ 点取消不唤起任何输入（实际 ' + w.__次数 + '）');
        }

        // --- F. 文件输入必须视觉隐藏（display:none 会让移动端 click 静默失效）---
        const 输入们 = Array.from(d.querySelectorAll('input[type="file"]'))
            .filter(i => /image|video/.test(i.getAttribute('accept') || ''));
        ok(输入们.length === 0 || 输入们.every(i => /视觉隐藏/.test(i.className)),
            '★ 文件输入用 .视觉隐藏（实际 ' + 输入们.map(i => i.className || '(无 class)').join(' | ') + '）');
    }

    console.log('\n[G] ★ 源码级：桌面端不再直开文件框');
    {
        for (const 文件 of ['1_shouyeyulan.html', '2_haoyouxinxi.html']) {
            const 源码 = 读(文件);
            ok(!/是移动端/.test(源码),
                '★ ' + 文件 + ' 已无 是移动端 分支（桌面端同样先弹面板）');
        }
    }

    console.log('\n[H] ★ 六页文案逐字一致');
    {
        const 各页 = ['1_shouyeyulan.html', '2_haoyouxinxi.html', '6_fabudongtai.html',
                      '8_wode.html', '9_zhutishezhi.html', '10_lunbotu.html',
                      '11_woderenshe.html'];
        const 指纹 = s => {
            const m = 三项文案.map(t =>
                (new RegExp('<span class="来源文字">' + t + '</span>').test(s) ? '1' : '0'));
            return m.join('');
        };
        各页.forEach(文件 => {
            ok(指纹(读(文件)) === '111',
                '★ ' + 文件 + ' 三项文案与标准一致（指纹 ' + 指纹(读(文件)) + '）');
        });
    }

    收尾(errors, '✅ 全站上传入口「先弹来源面板」全部通过');
})();
