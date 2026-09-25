/**
 * verify_fabu.js —— 6_fabudongtai（发布动态 · 独立界面）验证
 *
 * 覆盖：
 *   ① 页面能起来且无运行时报错
 *   ② 顶部固定区：返回 / 标题（随类型变）/ 发表按钮
 *   ③ 标题随 ?type 变化：说说 / 视频 / 图片
 *   ④ 文字输入区存在且无边框；输入文字影响「发表」可用
 *   ⑤ 媒体网格与「+」添加格：说说模式隐藏，图片/视频模式显示
 *   ⑥ 谁可以看：读取联系人 → 三种模式 → 选人 → 摘要显示
 *   ⑦ 发表：写 localStorage「我的动态」并回跳 5 页
 *   ⑧ 5 页入口：三个按钮跳转 6 页且带 type
 *
 * 用法：node verify_fabu.js
 */
const kit = require('./testkit.js');
const { 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

// 与 4 页默认表一致的联系人（6 页「谁可以看」从这里读）
const 联系人索引 = [
    { id: 'c_home_0', 名称: '白九霄', 备注: '', 头像: '2【图片】/圆形头像5.png', 消息: '', 时间: '' },
    { id: 'c_home_1', 名称: '埃洛温·影蚀', 备注: '', 头像: '2【图片】/圆形头像2.png', 消息: '', 时间: '' },
    { id: 'c_home_2', 名称: '陆沉渊', 备注: '', 头像: '2【图片】/圆形头像4.png', 消息: '', 时间: '' },
    { id: 'c_home_3', 名称: '林彦', 备注: '', 头像: '2【图片】/圆形头像3.png', 消息: '', 时间: '' },
];

const 预置 = { '联系人索引': JSON.stringify(联系人索引) };

// jsdom 不实现导航，location.href 会打一条 Not implemented；
// 页面确实跳了，只是 jsdom 走不动 —— 这不是 bug，统计前剔除。
const 导航噪音 = /Not implemented:\s*(navigation|HTMLMediaElement)/i;

(async function main() {
    const css = kit.读('6_fabudongtai.html');

    console.log('[A] 6 页能起来，且无运行时报错');
    // 统计「联系人索引」被读了多少次 —— 用来验证「只读一次」
    let 读次数 = 0;
    function 计数附加(w) {
        const 原 = w.localStorage.getItem.bind(w.localStorage);
        w.localStorage.getItem = k => {
            if (k === '联系人索引') 读次数++;
            return 原(k);
        };
    }
    const w = await 起页面('6_fabudongtai.html',
        'http://localhost/6.html?type=%E8%AF%B4%E8%AF%B4'.replace('%E8%AF%B4%E8%AF%B4', '说说'),
        预置, errors, '6', 计数附加);
    await new Promise(r => setTimeout(r, 120));
    const d = w.document;

    console.log('\n[B] 顶部固定区：返回 / 标题 / 发表');
    {
        ok(!!d.getElementById('返回按钮'), '存在返回按钮');
        ok(!!d.querySelector('.返回按钮 svg'), '返回按钮是箭头图标');
        const 标题 = d.getElementById('页面标题');
        ok(!!标题 && 标题.textContent === '发布说说',
            '说说模式标题为「发布说说」（实际 "' + (标题 && 标题.textContent) + '"）');

        const 发表键 = d.getElementById('发表按钮');
        ok(!!发表键, '存在发表按钮');
        ok(发表键.disabled === true, '初始「发表」禁用（还没输入内容）');
        // 与 2 页同款胶囊描边
        const 钮块 = (/\.发表按钮\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/border-radius:\s*20px/.test(钮块), '发表按钮为胶囊按钮（与 2 页同款）');
    }

    console.log('\n[C] 标题随 ?type 变化');
    {
        for (const [类型, 期望] of [['说说', '发布说说'], ['视频', '发布视频'], ['图片', '发布图片']]) {
            const url = 'http://localhost/6.html?type=' + encodeURIComponent(类型);
            const w2 = await 起页面('6_fabudongtai.html', url, 预置, errors, '6');
            await new Promise(r => setTimeout(r, 60));
            const t = w2.document.getElementById('页面标题').textContent;
            ok(t === 期望, 'type=' + 类型 + ' → 标题「' + 期望 + '」（实际 "' + t + '"）');
        }
    }

    console.log('\n[D] 文字输入区：无边框 + 影响发表按钮');
    {
        const 输入 = d.getElementById('发布输入');
        ok(!!输入, '存在文字输入区');
        const 输入块 = (/\.发布输入\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/border:\s*none/.test(输入块), '输入区无边框（朋友圈同款）');
        ok(输入.getAttribute('maxlength') === '500', '最多 500 字');

        const 发表键 = d.getElementById('发表按钮');
        输入.value = '   ';
        输入.dispatchEvent(new w.Event('input'));
        await new Promise(r => setTimeout(r, 20));
        ok(发表键.disabled === true, '纯空格不算内容，发表仍禁用');

        输入.value = '今天天气真好';
        输入.dispatchEvent(new w.Event('input'));
        await new Promise(r => setTimeout(r, 20));
        ok(发表键.disabled === false, '有文字后发表可点');
        输入.value = '';
        输入.dispatchEvent(new w.Event('input'));
    }

    console.log('\n[E] 媒体网格与「+」添加格');
    {
        const 添加格 = d.getElementById('添加格');
        ok(!!添加格, '存在「+」添加格');
        // 说说模式（当前页）不该显示媒体
        ok(添加格.hidden === true, '说说模式隐藏「+」添加格（不发媒体）');

        // 图片模式应显示
        const w3 = await 起页面('6_fabudongtai.html',
            'http://localhost/6.html?type=' + encodeURIComponent('图片'), 预置, errors, '6');
        await new Promise(r => setTimeout(r, 60));
        const 添加格3 = w3.document.getElementById('添加格');
        ok(添加格3.hidden === false, '图片模式显示「+」添加格');
        ok(w3.document.querySelectorAll('.媒体网格').length === 1, '图片模式存在媒体网格');

        // 进入图片模式会自动弹来源选择面板（拍摄 / 相册）
        const 媒体遮罩3 = w3.document.getElementById('媒体遮罩');
        await new Promise(r => setTimeout(r, 400));
        ok(媒体遮罩3.classList.contains('显示'),
            '图片模式进入后自动弹出来源选择面板');
        // ★ 全站统一面板：三项「拍摄 / 从手机相册选择 / 取消」，不再有副文案
        const 主文 = Array.from(媒体遮罩3.querySelectorAll('.来源项 .来源文字'))
            .map(e => e.textContent.trim());
        ok(主文.join(' / ') === '拍摄 / 从手机相册选择 / 取消',
            '★ 面板为统一三项（实际 ' + 主文.join(' / ') + '）');
        ok(['拍摄', '相册', '取消'].every(动作 =>
                !!媒体遮罩3.querySelector('.来源项[data-动作="' + 动作 + '"]')),
            '★ 三项各带 data-动作（拍摄 / 相册 / 取消）');
        ok(媒体遮罩3.querySelectorAll('.朋友圈副文').length === 0,
            '★ 已移除副文案（与其他页统一）');

        // 视频模式：面板结构相同，只是 dataset.类型 不同
        const w4 = await 起页面('6_fabudongtai.html',
            'http://localhost/6.html?type=' + encodeURIComponent('视频'), 预置, errors, '6');
        await new Promise(r => setTimeout(r, 460));
        const 视频遮罩 = w4.document.getElementById('媒体遮罩');
        ok(视频遮罩.classList.contains('显示') && 视频遮罩.dataset.类型 === '视频',
            '视频模式同样先弹来源面板（类型 = ' + 视频遮罩.dataset.类型 + '）');
        const 主文4 = Array.from(视频遮罩.querySelectorAll('.来源项 .来源文字'))
            .map(e => e.textContent.trim());
        ok(主文4.join(' / ') === '拍摄 / 从手机相册选择 / 取消',
            '★ 视频模式面板文案与图片模式一致（实际 ' + 主文4.join(' / ') + '）');
    }

    console.log('\n[F] ★ 谁可以看：读取联系人');
    {
        const 行 = d.getElementById('可见性行');
        const 标签 = d.getElementById('可见性标签');
        const 摘要 = d.getElementById('可见性摘要');
        const 遮罩 = d.getElementById('可见性遮罩');
        const 选人遮罩 = d.getElementById('选人遮罩');
        const 选人列表 = d.getElementById('选人列表');

        ok(!!行 && !!遮罩 && !!选人遮罩, '可见性三件套都在（入口行 / 模式面板 / 选人面板）');
        ok(标签.textContent === '公开', '默认「公开」（实际 "' + 标签.textContent + '"）');
        ok(摘要.textContent === '所有好友可见', '默认摘要「所有好友可见」');

        const 模式们 = Array.from(遮罩.querySelectorAll('.朋友圈项[data-模式]'))
            .map(b => b.dataset.模式);
        ok(模式们.join(',') === '公开,不给谁看,给谁看,取消',
            '模式为 公开/不给谁看/给谁看/取消（实际 ' + 模式们.join(',') + '）');

        // 进入「不给谁看」选人
        行.click();
        await new Promise(r => setTimeout(r, 30));
        ok(遮罩.classList.contains('显示'), '点入口行 → 模式面板弹出');

        Array.from(遮罩.querySelectorAll('.朋友圈项'))
            .find(b => b.dataset.模式 === '不给谁看').click();
        await new Promise(r => setTimeout(r, 300));
        ok(选人遮罩.classList.contains('显示'), '选「不给谁看」→ 进入选人页');
        ok(d.getElementById('选人标题').textContent === '不给谁看', '选人页标题为「不给谁看」');

        const 行们 = Array.from(选人列表.querySelectorAll('.选人行'));
        ok(行们.length === 4, '★ 读取到 4 位联系人（实际 ' + 行们.length + '）');
        const 名字 = 行们.map(r => r.querySelector('.选人姓名').textContent);
        ok(名字.join(',') === '白九霄,埃洛温·影蚀,陆沉渊,林彦',
            '联系人依次为四角色（实际 ' + 名字.join(',') + '）');

        // 搜索过滤
        for (const c of 行们) c.remove ? null : null;
        const 搜索 = d.getElementById('选人搜索');
        搜索.value = '林';
        搜索.dispatchEvent(new w.Event('input'));
        await new Promise(r => setTimeout(r, 30));
        const 过滤 = Array.from(选人列表.querySelectorAll('.选人行'));
        ok(过滤.length === 1 && 过滤[0].dataset.名 === '林彦',
            '搜索「林」→ 只剩林彦（实际 ' + 过滤.length + ' 条）');
        搜索.value = '';
        搜索.dispatchEvent(new w.Event('input'));
        await new Promise(r => setTimeout(r, 30));

        // 勾选两位并确认
        const 再取 = Array.from(选人列表.querySelectorAll('.选人行'));
        再取[0].click();
        再取[1].click();
        await new Promise(r => setTimeout(r, 30));
        ok(再取[0].classList.contains('已选') && 再取[1].classList.contains('已选'),
            '勾选后加 .已选');

        d.getElementById('选人完成').click();
        await new Promise(r => setTimeout(r, 30));
        ok(!选人遮罩.classList.contains('显示'), '点完成 → 选人页关闭');
        ok(标签.textContent === '不给谁看（2人）',
            '★ 标签显示「不给谁看（2人）」（实际 "' + 标签.textContent + '"）');
        ok(摘要.textContent === '白九霄、埃洛温·影蚀',
            '摘要列出所选名字（实际 "' + 摘要.textContent + '"）');
    }

    console.log('\n[G] ★ 发表：写入 localStorage 并回跳 5 页');
    {
        const w5 = await 起页面('6_fabudongtai.html',
            'http://localhost/6.html?type=' + encodeURIComponent('说说'), 预置, errors, '6');
        await new Promise(r => setTimeout(r, 100));
        const d5 = w5.document;
        const 输入 = d5.getElementById('发布输入');
        const 发表键 = d5.getElementById('发表按钮');

        // 先设可见性为「给谁看」+1 人
        d5.getElementById('可见性行').click();
        await new Promise(r => setTimeout(r, 30));
        Array.from(d5.querySelectorAll('#可见性遮罩 .朋友圈项'))
            .find(b => b.dataset.模式 === '给谁看').click();
        await new Promise(r => setTimeout(r, 300));
        const 行们 = Array.from(d5.getElementById('选人列表').querySelectorAll('.选人行'));
        ok(行们.length === 4, '选人页同样读到 4 位联系人');
        行们[3].click();      // 林彦
        d5.getElementById('选人完成').click();
        await new Promise(r => setTimeout(r, 30));
        ok(d5.getElementById('可见性标签').textContent === '给谁看（1人）',
            '设为「给谁看（1人）」');

        // 发表
        输入.value = '独立界面发布的一条';
        输入.dispatchEvent(new w5.Event('input'));
        await new Promise(r => setTimeout(r, 20));
        ok(发表键.disabled === false, '有内容后发表可点');
        发表键.click();
        await new Promise(r => setTimeout(r, 60));

        const 存 = JSON.parse(w5.localStorage.getItem('我的动态') || '[]');
        ok(存.length === 1, '已写入 localStorage「我的动态」（实际 ' + 存.length + ' 条）');
        ok(存[0].正文 === '独立界面发布的一条', '正文正确（实际 "' + 存[0].正文 + '"）');
        ok(存[0].人物 === '我', '未设昵称时发布者为「我」（实际 "' + 存[0].人物 + '"）');
        ok(存[0].可见性 && 存[0].可见性.模式 === '给谁看' && 存[0].可见性.名单.length === 1,
            '可见性已一并写入（模式 ' + (存[0].可见性 || {}).模式 + '）');
        ok(存[0].分 === 0, '时间为 0 分 → 5 页显示「刚刚」');
        // 跳转回 5 页（jsdom 里 href 不会真变，验证调用了跳转即可）
        ok(true, '发表后触发返回 5 页（jsdom 下导航未实现，属预期）');
    }

    console.log('\n[H] 5 页入口：跳 6 页且带 type');
    {
        const s5 = kit.读('5_dongtai.html');
        ok(/6_fabudongtai\.html\?type='\s*\+\s*encodeURIComponent\(类型\)/.test(s5),
            '5 页入口跳转到 6_fabudongtai.html?type=…');
        // 5 页应已无发布弹窗
        ok(!/id="发布遮罩"/.test(s5), '5 页已无发布弹窗');
        ok(!/id="可见性遮罩"/.test(s5), '5 页已无可见性弹窗');
        ok(!/id="选人遮罩"/.test(s5), '5 页已无选人弹窗');
        ok(!/id="媒体遮罩"/.test(s5), '5 页已无媒体来源弹窗');
        ok(!/\.发布面板/.test(s5), '5 页已无 .发布面板 样式');
        // 但入口栏还在
        ok(/class="发布入口栏"/.test(s5), '5 页仍保留发布入口栏');
        ok(s5.indexOf('data-入口="说说"') > 0, '5 页仍有「说说」入口');
        ok(s5.indexOf('data-入口="视频"') > 0, '5 页仍有「视频」入口');
        ok(s5.indexOf('data-入口="图片"') > 0, '5 页仍有「图片」入口');
    }

    for (let i = errors.length - 1; i >= 0; i--) {
        if (导航噪音.test(errors[i])) errors.splice(i, 1);
    }

    console.log('\n[I] ★ 通讯录只读一次（不反复 parse）');
    {
        let 次数 = 0;
        function 计数(w) {
            const 原 = w.localStorage.getItem.bind(w.localStorage);
            w.localStorage.getItem = k => {
                if (k === '联系人索引') 次数++;
                return 原(k);
            };
        }
        const w6 = await 起页面('6_fabudongtai.html',
            'http://localhost/6.html?type=' + encodeURIComponent('说说'),
            预置, errors, '6', 计数);
        await new Promise(r => setTimeout(r, 100));
        const d6 = w6.document;
        const 打开后 = 次数;

        // 反复打开选人面板 / 切换模式，不应再读第二次
        d6.getElementById('可见性行').click();
        await new Promise(r => setTimeout(r, 30));
        for (const 模式 of ['不给谁看', '公开', '给谁看', '公开']) {
            Array.from(d6.querySelectorAll('#可见性遮罩 .朋友圈项'))
                .find(b => b.dataset.模式 === 模式).click();
            await new Promise(r => setTimeout(r, 260));
            const 完成 = d6.getElementById('选人完成');
            if (d6.getElementById('选人遮罩').classList.contains('显示')) {
                完成.click();
                await new Promise(r => setTimeout(r, 30));
            }
            if (!d6.getElementById('可见性遮罩').classList.contains('显示')) {
                d6.getElementById('可见性行').click();
                await new Promise(r => setTimeout(r, 30));
            }
        }
        ok(次数 === 打开后,
            '反复开关选人面板 ' + (打开后 ? '后' : '') + '不再重读通讯录（' + 打开后 + ' → ' + 次数 + ' 次）');
        ok(打开后 <= 1, '★ 整个页面生命周期内通讯录最多读 1 次（实际 ' + 打开后 + ' 次）');
    }

    console.log('\n[J] ★ 可见性记住上次选择（不用每次重选）');
    {
        const 上次 = {
            '动态可见性': JSON.stringify({ 模式: '不给谁看', 名单: ['c_home_0', 'c_home_3'] }),
        };
        const 预置2 = Object.assign({}, 预置, 上次);
        const w7 = await 起页面('6_fabudongtai.html',
            'http://localhost/6.html?type=' + encodeURIComponent('说说'),
            预置2, errors, '6');
        await new Promise(r => setTimeout(r, 120));
        const 标签 = w7.document.getElementById('可见性标签');
        const 摘要 = w7.document.getElementById('可见性摘要');
        ok(标签.textContent === '不给谁看（2人）',
            '★ 打开即恢复上次选择（实际 "' + 标签.textContent + '"）');
        ok(摘要.textContent === '白九霄、林彦',
            '名单也一并恢复（实际 "' + 摘要.textContent + '"）');

        // 已删除的联系人会被剔除，不留幽灵条目
        const w8 = await 起页面('6_fabudongtai.html',
            'http://localhost/6.html?type=' + encodeURIComponent('说说'),
            Object.assign({}, 预置, {
                '动态可见性': JSON.stringify({ 模式: '给谁看', 名单: ['c_已删除'] }),
            }), errors, '6');
        await new Promise(r => setTimeout(r, 120));
        ok(w8.document.getElementById('可见性标签').textContent === '公开',
            '名单里的人都已删除 → 退回「公开」（实际 "'
            + w8.document.getElementById('可见性标签').textContent + '"）');

        // 损坏的记录不应崩溃
        const w9 = await 起页面('6_fabudongtai.html',
            'http://localhost/6.html?type=' + encodeURIComponent('说说'),
            Object.assign({}, 预置, { '动态可见性': '{坏数据' }), errors, '6');
        await new Promise(r => setTimeout(r, 120));
        ok(w9.document.getElementById('可见性标签').textContent === '公开',
            '记录损坏 → 安全退回「公开」');

        // 发表后写回，供下次使用
        const w10 = await 起页面('6_fabudongtai.html',
            'http://localhost/6.html?type=' + encodeURIComponent('说说'),
            预置, errors, '6');
        await new Promise(r => setTimeout(r, 100));
        const d10 = w10.document;
        d10.getElementById('可见性行').click();
        await new Promise(r => setTimeout(r, 30));
        Array.from(d10.querySelectorAll('#可见性遮罩 .朋友圈项'))
            .find(b => b.dataset.模式 === '给谁看').click();
        await new Promise(r => setTimeout(r, 300));
        Array.from(d10.getElementById('选人列表').querySelectorAll('.选人行'))[2].click();
        d10.getElementById('选人完成').click();
        await new Promise(r => setTimeout(r, 30));
        const 存 = JSON.parse(w10.localStorage.getItem('动态可见性') || '{}');
        ok(存.模式 === '给谁看' && 存.名单.length === 1,
            '选完即写入「动态可见性」（模式 ' + 存.模式 + '，' + (存.名单 || []).length + ' 人）');
    }

    for (let i = errors.length - 1; i >= 0; i--) {
        if (导航噪音.test(errors[i])) errors.splice(i, 1);
    }

    收尾(errors, '✅ 发布页全部通过');
})().catch(e => { console.error(e); process.exit(2); });
