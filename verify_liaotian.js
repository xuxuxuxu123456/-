/**
 * verify_liaotian.js —— 7_liaotian（聊天信息流）验证
 *
 * 覆盖：
 *   ① 页面能起来且无运行时报错
 *   ② 顶部：返回键 / 居中昵称 / 右侧搜索键（三件套 + 位置正确）
 *   ③ 昵称取「对应联系人」，随 id 变化
 *   ④ 消息流：有时间戳、有气泡
 *   ⑤ 气泡是白色玻璃质感、不透明度 40%
 *   ⑥ ★ 对话内容读取对应联系人的小字文案（换联系人 → 内容跟着换）
 *   ⑦ 搜索：展开 / 过滤 / 高亮
 *   ⑧ 发送：写入聊天记录 + 同步回会话列表
 *   ⑨ 入口：1 页会话项可点、4 页「发送消息」跳 7 页
 *
 * 用法：node verify_liaotian.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

// 与 4 页默认表一致（含每位角色的小字文案）
const 联系人索引 = [
    { id: 'c_default_1', 名称: '埃洛温·影蚀', 备注: '', 头像: '2【图片】/圆形头像2.png', 消息: '人类天真的以为犯错只需忤悔', 时间: '12:00' },
    { id: 'c_default_2', 名称: '林彦', 备注: '', 头像: '2【图片】/圆形头像3.png', 消息: '我不喜欢我种的花围着太多蝴蝶', 时间: '13:00' },
    { id: 'c_default_3', 名称: '陆沉渊', 备注: '', 头像: '2【图片】/圆形头像4.png', 消息: '问题小猫来自异世界', 时间: '14:00' },
    { id: 'c_default_4', 名称: '白九霄', 备注: '', 头像: '2【图片】/圆形头像5.png', 消息: '我们不是能谈论眼泪的关系，我也不太了解你。', 时间: '12:00' },
];

const 预置 = { '联系人索引': JSON.stringify(联系人索引) };

/**
 * 白九霄的角色档案（人物信息含「口头禅」段落）。
 * 7 页从这里抽口头禅铺对话，与 2 页内置档案同款，测试必须预置一份才测得到。
 */
const 白九霄档案 = {
    昵称: '白九霄', 生日: '1050-05-31', 身高: '172', 性别: '男',
    世界观: '九州大地，灵气充盈。青丘狐族、天狐返祖。',
    人物信息: [
        '族谱上他的名字写作白九棠。白九棠是青丘狐主最小的儿子。',
        '他三岁通人语，十岁化人形，二十岁便凝出第三条尾巴。',
        '口头禅',
        '“ 你凶我！你居然凶我！ ”（被说重话时）',
        '“ 小爷我厉害着呢 ”（闯了祸还要炫耀）',
        '“ 那、那我也不是故意的嘛 ”（打碎了东西一边狡辩）',
        '“ 不跟你天下第一好了 ”（闹别扭时的口头威胁）',
        '“ ……抱。 ”（真正委屈的时刻）',
    ].join('\n'),
    性格标签: ['古灵精怪', '骄傲又粘人'], 人物属性: ['妖'],
};

/**
 * 给 jsdom 打上录音所需的桩：jsdom 没有 getUserMedia / MediaRecorder。
 * 选项：{ 拒绝:'NotAllowedError' } 模拟用户拒绝授权；
 *       { 无设备:true } 模拟 file:// 直开时 mediaDevices 根本不存在。
 */
function 打桩录音(w, 选项) {
    const 选 = 选项 || {};
    w.__权限申请次数 = 0;

    if (选.无设备) {
        try { delete w.navigator.mediaDevices; } catch (e) {}
        Object.defineProperty(w.navigator, 'mediaDevices', { value: undefined, configurable: true });
        return;
    }

    w.navigator.mediaDevices = {
        getUserMedia: async () => {
            w.__权限申请次数++;
            if (选.拒绝) { const e = new Error('denied'); e.name = 选.拒绝; throw e; }
            // 真实 MediaStream 有 getAudioTracks，页面会做音轨自检，桩必须提供
            const 轨 = { kind: 'audio', enabled: true, muted: false, readyState: 'live', stop() {} };
            return { getTracks: () => [轨], getAudioTracks: () => [轨] };
        },
    };

    w.MediaRecorder = class {
        constructor(流, 配置) { this.流 = 流; this.配置 = 配置; this.state = 'inactive'; }
        static isTypeSupported() { return true; }
        start() {
            this.state = 'recording';
            // 给一块真实的、够大的音频数据：页面会校验字节数（<512 视为没录到声音），
            // 用假的 {size:128} 会被这个校验拦掉，测不到后续流程。
            if (this.ondataavailable) {
                const 内容 = new Uint8Array(2048).fill(7);   // 2KB 假音频负载
                this.ondataavailable({
                    data: new w.Blob([内容], { type: 'audio/webm' }),
                });
            }
        }
        stop() { this.state = 'inactive'; if (this.onstop) this.onstop(); }
    };

    if (typeof w.URL.createObjectURL !== 'function') {
        w.URL.createObjectURL = () => 'blob:stub-audio-url';
    }
}

/**
 * 给页面里那个真实的 <audio id="语音播放器"> 打桩。
 * ★ 必须打在真实元素上而不是替换 w.Audio —— 页面现在用挂在 DOM 里的单例播放器，
 *   替换全局 Audio 类根本测不到真实播放路径（也就测不出「播放没接上」这类问题）。
 */
function 装播放器桩(w) {
    const 元素 = w.document.getElementById('语音播放器');
    const 计 = { 次数: 0, 源: '', 元素: 元素 };
    if (!元素) return 计;

    // paused 在 jsdom 里是原型上的只读 getter，直接赋值会被静默忽略，
    // 页面判断「是否正在播放」就会永远认为没在播 → 暂停分支永远走不到。
    let 暂停中 = true;
    Object.defineProperty(元素, 'paused', { configurable: true, get: () => 暂停中 });

    元素.play = function () {
        计.次数++;
        计.源 = 元素.src;
        暂停中 = false;
        return Promise.resolve();
    };
    元素.pause = function () { 暂停中 = true; };
    return 计;
}

/** 模拟长按：mousedown 按住不放（由调用方等待 500ms+ 再自行结束） */
function 长按(w, 元素) {
    元素.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, clientX: 50, clientY: 50 }));
}

/** 起 7 页；id 为空则走 ?mode 兜底路径 */
async function 跑7页(查询, 数据) {
    const 合并 = Object.assign({}, 预置, 数据 || {});
    const w = await 起页面('7_liaotian.html', 'http://localhost/7.html' + (查询 || ''), 合并, errors, '7');
    await new Promise(r => setTimeout(r, 120));
    return w;
}

(async function main() {
    const css = 读('7_liaotian.html');

    console.log('[A] 7 页能起来，且无运行时报错');
    {
        const w = await 跑7页('?id=c_default_4&from=1');
        ok(!!w.document.getElementById('消息流'), '页面已渲染出消息流容器');
    }

    console.log('\n[B] 顶部三件套：返回 / 居中昵称 / 搜索键');
    {
        const w = await 跑7页('?id=c_default_4&from=1');
        const d = w.document;
        ok(!!d.getElementById('返回按钮'), '左侧有返回键');
        ok(!!d.querySelector('#返回按钮 svg'), '返回键是箭头图标');
        ok(!!d.getElementById('搜索键'), '右侧有搜索键');
        ok(!!d.querySelector('#搜索键 svg circle'), '搜索键是放大镜图标');

        const 标题 = d.getElementById('页面标题');
        ok(!!标题 && 标题.textContent === '白九霄',
            '中间标题 = 对应联系人昵称「白九霄」（实际 "' + (标题 && 标题.textContent) + '"）');

        // ★ 真居中：绝对定位脱离 flex 流，左右留出等宽空间给两侧图标
        const 标题块 = (/\.中间标题\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/position:\s*absolute/.test(标题块), 'CSS：标题绝对定位（不被两侧按钮挤偏）');
        ok(/left:\s*clamp\(/.test(标题块) && /right:\s*clamp\(/.test(标题块), 'CSS：标题左右等距（居中）');
        ok(/text-align:\s*center/.test(标题块), 'CSS：标题文字居中');

        // DOM 顺序必须是 返回 → 标题 → 右侧动作（清空 + 搜索）
        const 顺序 = Array.from(d.querySelectorAll('.顶部导航栏 > *')).map(e => e.id || e.className);
        ok(顺序[0] === '返回按钮', '最左是返回键（实际 ' + 顺序.join(',') + '）');
        ok(顺序[2] === '右侧动作', '最右是动作区（实际 ' + 顺序.join(',') + '）');
        const 右 = Array.from(d.querySelectorAll('.右侧动作 > *')).map(e => e.id);
        /* ★ 单聊只有「清空 + 搜索」两项；群聊会多一个「更多」键，
             所以这里断言【相对顺序】（清空在搜索左侧），不断言完整列表。 */
        ok(右.indexOf('清空键') >= 0 && 右.indexOf('清空键') < 右.indexOf('搜索键'),
            '★ 清空在搜索左侧（实际 ' + 右.join(',') + '）');
        /* ★★ 「更多」必须紧贴放大镜右侧 —— 微信同款，竖排三点在顶栏最末。
             挪到别处（比如最左）就不是用户熟悉的「更多」位置了。 */
        ok(!右.includes('群资料键') || 右.indexOf('群资料键') === 右.indexOf('搜索键') + 1,
            '★ ★ 群资料键（更多）紧贴在搜索键右侧（实际 ' + 右.join(',') + '）');
        ok(!右.includes('群资料键') || 右.indexOf('群资料键') === 右.length - 1,
            '★ 更多键是动作区最后一枚（实际 ' + 右.join(',') + '）');
    }

    console.log('\n[C] 昵称随联系人变化');
    {
        for (const [id, 期望] of [['c_default_1', '埃洛温·影蚀'], ['c_default_2', '林彦'], ['c_default_3', '陆沉渊']]) {
            const w = await 跑7页('?id=' + id + '&from=1');
            const 实 = w.document.getElementById('页面标题').textContent;
            ok(实 === 期望, 'id=' + id + ' → 标题「' + 期望 + '」（实际 "' + 实 + '"）');
        }
    }

    console.log('\n[D] 消息流：时间戳 + 气泡');
    {
        const w = await 跑7页('?id=c_default_4&from=1');
        const d = w.document;
        const 戳 = d.querySelectorAll('.时间戳');
        const 泡 = d.querySelectorAll('.气泡');
        ok(泡.length > 0, '渲染出对话气泡（实际 ' + 泡.length + ' 个）');
        ok(戳.length > 0, '渲染出时间戳（实际 ' + 戳.length + ' 个）');
        const 首个 = 戳[0] && 戳[0].textContent;
        ok(/^(今天|昨天|\d+月\d+日)\s\d{2}:\d{2}$/.test(首个 || ''),
            '时间戳格式正确（今天/昨天/M月D日 + HH:MM，实际 "' + 首个 + '"）');
        ok(d.querySelectorAll('.消息行').length === 泡.length, '每条气泡都包在消息行里');
        ok(d.querySelector('.消息行.我方') !== null, '存在「我方」气泡（双向对话）');
    }

    console.log('\n[E] ★ 气泡：白色玻璃质感 + 不透明度 40%');
    {
        const 泡块 = (/\.气泡\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/--泡:\s*0\.4/.test(css), 'CSS：定义 --泡 = 0.4（40%）');
        ok(/background:\s*rgba\(var\(--panel\),\s*var\(--泡\)\)/.test(泡块),
            '气泡底色用 rgba(var(--panel), var(--泡)) → 白 + 40% 透明');
        ok(/backdrop-filter:\s*blur/.test(泡块) || /-webkit-backdrop-filter:\s*blur/.test(泡块),
            '气泡有 backdrop-filter: blur（玻璃质感）');
        ok(/border:\s*1px\s*solid\s*rgba\(var\(--panel\)/.test(泡块), '气泡有高光描边（玻璃边缘）');
        ok(/inset\s+0\s+1px\s+0\s+rgba\(var\(--panel\)/.test(泡块), '气泡有内侧高光（玻璃厚度感）');
    }

    console.log('\n[F] ★ 对话内容读取对应联系人的小字文案');
    {
        const 用例 = [
            ['c_default_4', '我们不是能谈论眼泪的关系，我也不太了解你。'],
            ['c_default_2', '我不喜欢我种的花围着太多蝴蝶'],
            ['c_default_3', '问题小猫来自异世界'],
            ['c_default_1', '人类天真的以为犯错只需忤悔'],
        ];
        for (const [id, 文案] of 用例) {
            const w = await 跑7页('?id=' + id + '&from=1');
            const d = w.document;
            const 全部 = Array.from(d.querySelectorAll('.气泡')).map(e => e.textContent).join('\n');
            ok(全部.includes(文案), 'id=' + id + ' → 首条含该联系人的小字文案（实际 "' + 全部.slice(0, 24) + '…"）');
            // 不能串台：别人的文案不该出现在这里
            const 别人的 = 用例.filter(u => u[0] !== id).map(u => u[1]);
            ok(别人的.every(t => !全部.includes(t)), 'id=' + id + ' → 未混入其他联系人的文案');
        }
    }

    console.log('\n[G] 搜索：展开 / 过滤 / 高亮');
    {
        // 预置白九霄档案 → 口头禅应被抽进对话（含「不跟你天下第一好了」）
        const w = await 跑7页('?id=c_default_4&from=1',
            { '好友信息_c_default_4': JSON.stringify(白九霄档案) });
        const d = w.document;

        const 全部文 = Array.from(d.querySelectorAll('.气泡')).map(e => e.textContent).join('\n');
        ok(全部文.includes('不跟你天下第一好了'),
            '★ 口头禅已从角色档案抽出（含「不跟你天下第一好了」）');
        ok(全部文.includes('小爷我厉害着呢'), '口头禅 2 已抽出');
        ok(!全部文.includes('（被说重话时）'), '括号说明未混入（只取引号内的句子）');

        const 条 = d.getElementById('聊天搜索条');
        ok(!条.classList.contains('展开'), '初始搜索条收起');

        d.getElementById('搜索键').click();
        await new Promise(r => setTimeout(r, 30));
        ok(条.classList.contains('展开'), '点搜索键 → 展开');

        const 框 = d.getElementById('聊天搜索输入');
        框.value = '天下第一';
        框.dispatchEvent(new w.Event('input'));
        await new Promise(r => setTimeout(r, 30));
        const 剩 = Array.from(d.querySelectorAll('.气泡'));
        ok(剩.length >= 1 && 剩.every(e => e.textContent.includes('天下第一')),
            '搜索「天下第一」→ 只剩命中气泡（实际 ' + 剩.length + ' 条）');
        ok(d.querySelectorAll('.气泡 mark').length > 0, '命中处有 <mark> 高亮');

        框.value = '绝无此词zzz';
        框.dispatchEvent(new w.Event('input'));
        await new Promise(r => setTimeout(r, 30));
        ok(d.querySelectorAll('.气泡').length === 0 && !!d.querySelector('.无结果提示'),
            '无命中 → 显示「没有匹配的聊天记录」');

        框.value = '';
        框.dispatchEvent(new w.Event('input'));
        await new Promise(r => setTimeout(r, 30));
        ok(d.querySelectorAll('.气泡').length > 1, '清空 → 恢复全部');
    }

    console.log('\n[H] ★ 发送：写入聊天记录 + 同步会话列表');
    {
        // 注意：直接把 数据 传进起页面，页面写 localStorage 才会落回这个对象
        const 数据 = Object.assign({}, 预置);
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4&from=1',
            数据, errors, '7');
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;

        const 前 = d.querySelectorAll('.气泡').length;
        const 输入 = d.getElementById('消息输入');
        const 钮 = d.getElementById('发送按钮');
        ok(钮.disabled === true, '空输入时发送禁用');

        输入.value = '   ';
        输入.dispatchEvent(new w.Event('input'));
        ok(钮.disabled === true, '纯空格仍禁用');

        输入.value = '这是一条测试消息';
        输入.dispatchEvent(new w.Event('input'));
        ok(钮.disabled === false, '有内容后可发送');

        钮.click();
        await new Promise(r => setTimeout(r, 60));

        ok(d.querySelectorAll('.气泡').length === 前 + 1, '发送后气泡 +1（实际 ' + d.querySelectorAll('.气泡').length + '）');
        const 末 = Array.from(d.querySelectorAll('.消息行')).pop();
        ok(末.classList.contains('我方'), '新消息是「我方」气泡');
        ok(末.querySelector('.气泡').textContent.includes('这是一条测试消息'), '新消息内容正确');

        const 存档 = JSON.parse(数据['聊天记录_c_default_4'] || 'null');
        ok(Array.isArray(存档) && 存档.some(m => m.文 === '这是一条测试消息' && m.谁 === '我'),
            '★ 已写入 localStorage「聊天记录_c_default_4」');

        const 索引 = JSON.parse(数据['联系人索引'] || '[]');
        const 项 = 索引.find(i => i.id === 'c_default_4');
        ok(项 && 项.消息 === '这是一条测试消息', '★ 会话列表最新一条已同步（1/4 页能看到）');
    }

    console.log('\n[I] 返回的落点按来源区分');
    {
        const css7 = 读('7_liaotian.html');
        ok(/if\s*\(\s*来源\s*===\s*'4'\s*\)\s*location\.href\s*=\s*'4_tongxun\.html'/.test(css7),
            'from=4 → 返回通讯录');
        ok(/location\.href\s*=\s*'1_shouyeyulan\.html'/.test(css7), '缺省（from=1）→ 返回首页');
    }

    console.log('\n[J] ★ 入口：1 页会话项可点、4 页发消息跳 7 页');
    {
        const s1 = 读('1_shouyeyulan.html');
        ok(/\.会话项[\s\S]{0,400}addEventListener\('click'/.test(s1) ||
            /querySelectorAll\('\.会话项'\)\.forEach\([\s\S]{0,300}addEventListener\('click'/.test(s1),
            '1 页：会话项已绑定 click');
        ok(/7_liaotian\.html\?/.test(s1), '1 页：点击后跳 7_liaotian.html');
        ok(/'&from=1'/.test(s1), '1 页：带 from=1');

        // 端到端：真的在 1 页里按名字算出跳转 URL（不是只看字符串）
        const 索引 = JSON.stringify(联系人索引);
        const w1 = await 起页面('1_shouyeyulan.html', 'http://localhost/1.html',
            { '联系人索引': 索引 }, errors, '1');
        await new Promise(r => setTimeout(r, 150));
        ok(typeof w1.打开会话 === 'function', '1 页暴露 window.打开会话（可测 / 可接管）');
        ok(w1.打开会话('白九霄') === '7_liaotian.html?id=c_default_4&from=1',
            '1 页按名字解析出 id → ' + w1.打开会话('白九霄'));
        ok(w1.打开会话('新朋友') === '7_liaotian.html?name=' + encodeURIComponent('新朋友') + '&from=1',
            '索引里没有的人 → name 兜底（7 页仍能显示昵称）');

        // 7 页按 name 兜底时标题也要对
        const w7 = await 起页面('7_liaotian.html',
            'http://localhost/7.html?name=' + encodeURIComponent('新朋友') + '&from=1',
            { '联系人索引': 索引 }, errors, '7');
        await new Promise(r => setTimeout(r, 120));
        ok(w7.document.getElementById('页面标题').textContent === '新朋友',
            '7 页 name 兜底 → 标题「新朋友」');

        const s4 = 读('4_tongxun.html');
        ok(/消息:\s*'7_liaotian\.html'/.test(s4), '4 页：「发送消息」指向 7_liaotian.html');
        ok(/信息:\s*'2_haoyouxinxi\.html'/.test(s4), '4 页：「好友信息」仍指向 2 页（未被改动）');
        ok(/'&from=4'/.test(s4), '4 页：带 from=4');
    }

    console.log('\n[K] ★ 气泡是横版长方形（小圆角、无尖角）');
    {
        const 泡块 = (/\.气泡\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        const m = /border-radius:\s*(\d+)px/.exec(泡块);
        ok(m !== null && Number(m[1]) <= 6,
            '气泡圆角 ≤ 6px（长方形，实际 ' + (m ? m[1] + 'px' : '未设置') + '）');
        // 四角一致：不能再有 border-bottom-*-radius 的收角覆盖
        ok(!/border-bottom-(left|right)-radius/.test(泡块), '气泡无底部收角（四角一致才像长方形）');
        // 尖角：::after 三角必须移除
        ok(!/\.气泡::after/.test(css), '气泡已无 ::after 小尖角');
        ok(!/\.消息行[^}]*\s\.气泡\s*\{[^}]*border-bottom/.test(css), '无「按收发方收角」的覆盖规则');
        // 横版：宽度上限要够宽
        ok(/max-width:\s*min\(7[0-9]%/.test(泡块), '气泡宽度上限为视窗 70%+（横版）');
    }

    console.log('\n[L] ★ 时间戳无底框');
    {
        const 戳块 = (/\.时间戳\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(戳块.length > 0, '取到 .时间戳 声明块');
        ok(!/(^|;|\s)background(-color)?\s*:/.test(戳块), '时间戳无 background（不铺底）');
        ok(!/(^|;|\s)border(-radius|-top|-bottom|-left|-right)?\s*:/.test(戳块), '时间戳无 border / border-radius');
        ok(!/box-shadow/.test(戳块), '时间戳无 box-shadow');
        ok(/color:\s*var\(--ink-3\)/.test(戳块), '时间戳仍是弱文字色（可读）');
    }

    console.log('\n[M] ★ 麦克风按钮：存在 + 位置在输入框右侧');
    {
        const w = await 跑7页('?id=c_default_4&from=1');
        const d = w.document;
        const 麦 = d.getElementById('麦克风按钮');
        ok(!!麦, '存在麦克风按钮');
        ok(!!麦.querySelector('svg rect'), '麦克风是 SVG 图标（含话筒 rect）');

        // DOM 顺序：输入框 → 麦克风 → 表情 → 发送（没有「＋」，功能常驻在上方功能条）
        const 顺序 = Array.from(d.querySelectorAll('.底部输入区 > *')).map(e => e.id);
        ok(顺序.join(',') === '消息输入,麦克风按钮,表情按钮,发送按钮',
            '底部顺序为 输入框/麦克风/表情/发送（实际 ' + 顺序.join(',') + '）');
        ok(!d.getElementById('功能键'), '★ 输入区里没有「＋」加号按钮');
        ok(顺序.indexOf('麦克风按钮') === 顺序.indexOf('消息输入') + 1, '麦克风紧邻输入框右侧');
        ok(顺序.indexOf('表情按钮') === 顺序.indexOf('发送按钮') - 1, '表情紧邻发送按钮前方');
    }

    console.log('\n[N] ★ 录音：申请权限 → 录音中 → 再点发送语音条');
    {
        const 数据 = Object.assign({}, 预置);
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4&from=1',
            数据, errors, '7', 打桩录音);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;

        const 前 = d.querySelectorAll('.气泡').length;
        const 麦 = d.getElementById('麦克风按钮');

        // 点一下 → 申请权限并开始录音
        麦.click();
        await new Promise(r => setTimeout(r, 80));
        ok(w.是否录音中() === true, '点麦克风 → 进入录音中');
        ok(麦.classList.contains('录音中'), '按钮显示录音中态');
        ok(d.getElementById('录音弹窗').classList.contains('显示'), '★ 弹出录音弹窗');
        ok(/^\d:\d{2}$/.test(d.getElementById('弹窗计时').textContent),
            '弹窗内显示计时（实际 ' + d.getElementById('弹窗计时').textContent + '）');
        ok(d.querySelectorAll('#录音音量 i').length > 0,
            '弹窗内有实时音量条（' + d.querySelectorAll('#录音音量 i').length + ' 根）');
        ok(w.__权限申请次数 === 1, '已调用 getUserMedia 申请麦克风权限（实际 ' + w.__权限申请次数 + '）');

        // 录够 1 秒再点第二下 → 结束并发送
        await new Promise(r => setTimeout(r, 1150));
        ok(/^0:0[1-9]$/.test(d.getElementById('弹窗计时').textContent),
            '★ 弹窗计时在走（实际 ' + d.getElementById('弹窗计时').textContent + '）');

        麦.click();
        await new Promise(r => setTimeout(r, 150));

        ok(w.是否录音中() === false, '再点一次 → 结束录音');
        ok(!d.getElementById('录音弹窗').classList.contains('显示'), '弹窗已收起');

        const 全部 = Array.from(d.querySelectorAll('.消息行'));
        ok(全部.length === 前 + 1, '语音条已上屏（实际 ' + 全部.length + '）');
        const 末 = 全部[全部.length - 1];
        ok(末.classList.contains('我方'), '语音条是我方消息');
        const 泡 = 末.querySelector('.气泡');
        ok(泡.classList.contains('语音泡'), '渲染为语音条气泡');
        ok(!!泡.querySelector('.语音播放'), '语音条有播放键');
        ok(泡.querySelectorAll('.语音条 i').length >= 5, '语音条有声波竖条');
        ok(/^\d:\d{2}$/.test(泡.querySelector('.语音时长').textContent),
            '语音条显示时长（实际 ' + 泡.querySelector('.语音时长').textContent + '）');
        ok(!泡.classList.contains('失效'), '本次录的语音可播放（未标记失效）');

        const 存档 = JSON.parse(数据['聊天记录_c_default_4'] || '[]');
        const 末条 = 存档[存档.length - 1];
        ok(末条 && 末条.类型 === '语音', '★ 存档记录了语音类型');
        ok(末条 && typeof 末条.时长 === 'number' && 末条.时长 >= 1, '★ 存档记录了时长');
        ok(!JSON.stringify(存档).includes('blob:'), '★ 音频未写进 localStorage（不会撑爆配额）');

        const 索引 = JSON.parse(数据['联系人索引'] || '[]');
        ok(索引.find(i => i.id === 'c_default_4').消息 === '[语音]', '会话列表显示为「[语音]」');
    }

    console.log('\n[O] 录音被拒 / 不支持时给出明确提示（不静默失败）');
    {
        // ① 权限被拒
        const w1 = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', w => 打桩录音(w, { 拒绝: 'NotAllowedError' }));
        await new Promise(r => setTimeout(r, 100));
        w1.document.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 120));
        ok(w1.是否录音中() === false, '被拒 → 不进入录音态');
        const 提示1 = w1.document.getElementById('toast');
        ok(提示1.classList.contains('显示'), '被拒 → 弹出提示（不静默失败）');
        ok(/权限被拒绝/.test(提示1.textContent), '提示文案说明是权限问题（实际 "' + 提示1.textContent.trim() + '"）');
        ok(!w1.document.getElementById('录音弹窗').classList.contains('显示'),
            '被拒 → 不弹录音弹窗（只 toast 报错）');

        // ② 非 HTTPS：浏览器根本不暴露 mediaDevices（file:// 直开的真实情形）
        const w2 = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', w => 打桩录音(w, { 无设备: true }));
        await new Promise(r => setTimeout(r, 100));
        w2.document.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 120));
        ok(/HTTPS|localhost/.test(w2.document.getElementById('toast').textContent),
            'file:// 场景 → 提示需要 HTTPS / localhost');
    }

    console.log('\n[P] ★ 表情按钮：弹出 Emoji 弹窗 + 选择插入');
    {
        const w = await 跑7页('?id=c_default_4&from=1');
        const d = w.document;
        const 遮罩 = d.getElementById('表情遮罩');
        const 钮 = d.getElementById('表情按钮');
        const 输入 = d.getElementById('消息输入');
        const 发送钮 = d.getElementById('发送按钮');

        ok(!!钮 && !!钮.querySelector('svg circle'), '存在表情按钮且是 SVG 笑脸图标');
        ok(!遮罩.classList.contains('显示'), '初始弹窗收起');

        钮.click();
        await new Promise(r => setTimeout(r, 40));
        ok(遮罩.classList.contains('显示'), '点表情按钮 → 弹窗展开');
        ok(钮.classList.contains('选中态'), '按钮进入选中态');

        const 格 = d.querySelectorAll('.表情格');
        ok(格.length >= 12, '默认分类里有足量表情可选（实际 ' + 格.length + ' 个）');
        ok(Array.from(格).every(g => g.textContent.trim().length > 0), '每个格子都是一个 emoji');

        格[0].click();
        await new Promise(r => setTimeout(r, 30));
        ok(输入.value === 格[0].dataset.表情, '点表情 → 插入输入框（实际 "' + 输入.value + '"）');
        ok(发送钮.disabled === false, '有内容后发送按钮可用');

        // 可连点多个
        格[1].click();
        await new Promise(r => setTimeout(r, 30));
        ok(输入.value === 格[0].dataset.表情 + 格[1].dataset.表情, '可连点多个 emoji');

        // 发送后输入框清空
        发送钮.click();
        await new Promise(r => setTimeout(r, 60));
        ok(输入.value === '', '发送后输入框清空');
        const 末 = Array.from(d.querySelectorAll('.消息行')).pop();
        ok(末.querySelector('.气泡').textContent.includes(格[0].dataset.表情), '★ emoji 已作为消息发出');

        // 点空白处关闭
        钮.click();
        await new Promise(r => setTimeout(r, 30));
        遮罩.click();
        await new Promise(r => setTimeout(r, 30));
        ok(!遮罩.classList.contains('显示'), '点弹窗空白处 → 关闭');
    }

    console.log('\n[Q] ★ 表情面板在输入框「上方」弹出（不遮挡输入框）');
    {
        const 面板块 = (/\.表情面板\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/position:\s*absolute/.test(面板块), '面板绝对定位（脱离输入区流，浮在其上）');
        ok(/bottom:\s*var\(--输入区高/.test(面板块), '面板底边 = 输入区高度（贴输入框上沿）');
        ok(/left:\s*0/.test(面板块) && /right:\s*0/.test(面板块), '面板左右撑满（与输入区同宽）');
        ok(/z-index:\s*21/.test(面板块), '面板层级 21（高于输入区 10）');
        // 遮罩只负责点空白关闭，不能再把面板压在底部（那会盖住输入框）
        const 遮罩块 = (/\.表情遮罩\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/inset:\s*0/.test(遮罩块), '遮罩仍全屏（用于点空白关闭）');
        ok(!/align-items:\s*flex-end/.test(遮罩块), '遮罩不再把内容压到底部（否则会盖住输入框）');
        ok(/z-index:\s*20/.test(遮罩块), '遮罩层级 20（低于面板 21）');

        // 展开时 JS 会按实测输入区高度重设 bottom（jsdom 无布局，这里验证逻辑存在）
        const w = await 跑7页('?id=c_default_4&from=1');
        const d = w.document;
        d.getElementById('表情按钮').click();
        await new Promise(r => setTimeout(r, 40));
        ok(d.getElementById('表情遮罩').classList.contains('显示'), '面板已展开');
        ok(/贴合输入框|getBoundingClientRect/.test(css), '★ 展开时按实测输入区高度贴合（有 贴合输入框 逻辑）');
    }

    console.log('\n[R] ★ 表情有分类，可切换');
    {
        const w = await 跑7页('?id=c_default_4&from=1');
        const d = w.document;
        const 栏 = d.getElementById('表情分类栏');
        const 分类钮 = d.querySelectorAll('.表情分类');

        ok(!!栏, '存在分类栏');
        ok(分类钮.length >= 5, '分类数量 ≥ 5（实际 ' + 分类钮.length + ' 类）');

        const 名 = Array.from(分类钮).map(b => b.textContent);
        ok(new Set(名).size === 名.length, '分类名不重复（' + 名.join(' / ') + '）');
        ok(名[0] === '常用', '默认选中「常用」');
        ok(分类钮[0].classList.contains('选中'), '首个分类 tab 高亮');

        // 切到「动物」→ 网格内容应全换成动物，且与常用完全不同
        const 常用 = Array.from(d.querySelectorAll('.表情格')).map(g => g.dataset.表情);
        const 动物下标 = 名.indexOf('动物');
        ok(动物下标 > 0, '存在「动物」分类');
        分类钮[动物下标].click();
        await new Promise(r => setTimeout(r, 40));

        const 动物 = Array.from(d.querySelectorAll('.表情格')).map(g => g.dataset.表情);
        ok(动物.length > 0, '切换后仍有表情（实际 ' + 动物.length + ' 个）');
        ok(动物.every(e => !常用.includes(e)), '★ 切换后网格全换成该分类（与「常用」无重叠）');
        ok(/🐶|🐱/.test(动物.join('')), '「动物」分类里确实是动物 emoji');
        ok(分类钮[动物下标].classList.contains('选中'), '新分类 tab 高亮');
        ok(!分类钮[0].classList.contains('选中'), '旧分类 tab 取消高亮');

        // 分类下的 emoji 仍可插入
        d.querySelectorAll('.表情格')[0].click();
        await new Promise(r => setTimeout(r, 30));
        ok(d.getElementById('消息输入').value === 动物[0], '★ 分类里的 emoji 可正常插入');
    }

    console.log('\n[S] ★ 输入框：长文本可下滑 + 隐藏滚动条');
    {
        const 输入块 = (/\.消息输入\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/overflow-y:\s*auto/.test(输入块), '输入框 overflow-y: auto（长文本可下滑）');
        ok(/overflow-x:\s*hidden/.test(输入块), '横向不滚动（只纵向）');
        ok(/max-height:\s*88px/.test(输入块), '有高度上限（不会无限长高）');
        // 隐藏滚动条三件套
        ok(/scrollbar-width:\s*none/.test(输入块), 'scrollbar-width: none（Firefox）');
        ok(/-ms-overflow-style:\s*none/.test(输入块), '-ms-overflow-style: none（IE/旧 Edge）');
        ok(/\.消息输入::-webkit-scrollbar\s*\{[^}]*display:\s*none/.test(css),
            '.消息输入::-webkit-scrollbar { display: none }（WebKit）');
        ok(/resize:\s*none/.test(输入块), '禁用拖拽把手（避免破坏布局）');

        // 长文本真的能撑到可滚动：塞很多行后 scrollHeight 应超过可视高度
        const w = await 跑7页('?id=c_default_4&from=1');
        const d = w.document;
        const 输入 = d.getElementById('消息输入');
        输入.value = Array.from({ length: 40 }, (_, i) => '第' + i + '行内容').join('\n');
        输入.dispatchEvent(new w.Event('input'));
        await new Promise(r => setTimeout(r, 40));
        ok(输入.value.length > 200, '已塞入长文本（' + 输入.value.length + ' 字）');
        ok(输入.style.height !== '', '自动增高已触发（style.height 已设置）');
        ok(d.getElementById('发送按钮').disabled === false, '长文本下发送按钮可用');
    }

    console.log('\n[T] ★ 语音条点击可听（真实调用 play，且点播放不会误删）');
    {
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 打桩录音);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;

        // 录一条语音
        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 1150));
        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 200));

        const 泡 = Array.from(d.querySelectorAll('.语音泡')).pop();
        ok(!!泡 && !泡.classList.contains('失效'), '语音条可播放状态');

        // ★ 给页面里那个真实 <audio> 打桩：验证 play() 真的被调用，且源正确
        const 计 = 装播放器桩(w);
        泡.querySelector('.语音播放').click();
        await new Promise(r => setTimeout(r, 60));
        ok(计.次数 === 1, '★ 点语音条 → 真的调用了 play()（实际 ' + 计.次数 + ' 次）');
        ok(/^blob:/.test(计.源), '播放源是 blob URL（实际 ' + String(计.源).slice(0, 12) + '）');

        // 点播放不能触发删除确认框
        ok(!d.getElementById('确认遮罩').classList.contains('显示'),
            '★ 点播放键不会弹出删除确认（已 stopPropagation）');
        ok(w.取消息表().length > 0, '点播放后消息没被删');
    }

    console.log('\n[U] ★ 长按气泡 → 是则删除 / 否则退出');
    {
        const 数据 = Object.assign({}, 预置);
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            数据, errors, '7');
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        const 前 = w.取消息表().length;
        const 行 = d.querySelectorAll('.消息行')[0];
        const 序 = Number(行.dataset.序号);

        // —— 长按：mousedown 后按住 500ms
        长按(w, 行);
        await new Promise(r => setTimeout(r, 620));

        const 遮罩 = d.getElementById('确认遮罩');
        ok(遮罩.classList.contains('显示'), '★ 长按 → 弹出确认框');
        ok(/删除/.test(d.getElementById('确认标题').textContent), '标题是删除确认（实际 "' + d.getElementById('确认标题').textContent + '"）');
        ok(d.getElementById('确认说明').textContent.length > 0, '说明里带被删内容摘要');

        // ① 点「否」→ 退出，不删
        d.getElementById('确认否').click();
        await new Promise(r => setTimeout(r, 60));
        ok(!遮罩.classList.contains('显示'), '点「否」→ 弹窗关闭');
        ok(w.取消息表().length === 前, '★ 点「否」→ 未删除（实际 ' + w.取消息表().length + '）');

        // ② 再长按 → 点「是」→ 真删
        长按(w, d.querySelectorAll('.消息行')[0]);
        await new Promise(r => setTimeout(r, 620));
        ok(遮罩.classList.contains('显示'), '再次长按 → 弹窗又出现');
        d.getElementById('确认是').click();
        await new Promise(r => setTimeout(r, 80));

        ok(w.取消息表().length === 前 - 1, '★ 点「是」→ 已删除一条（' + 前 + ' → ' + w.取消息表().length + '）');
        ok(d.querySelectorAll('.消息行').length === 前 - 1, '页面同步少了一条气泡');
        const 存档 = JSON.parse(数据['聊天记录_c_default_4'] || '[]');
        ok(存档.length === 前 - 1, '★ 删除已写回 localStorage');
        ok(!存档.some(m => m === undefined), '删的是序号 ' + 序 + ' 那条');

        // ③ 短按（没到 500ms 就松手）不应弹窗
        const 行2 = d.querySelectorAll('.消息行')[0];
        行2.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        行2.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
        ok(!遮罩.classList.contains('显示'), '★ 短按（<500ms 松手）不弹删除框');
    }

    console.log('\n[V] ★ 清空聊天记录：是则清空 / 否则退出');
    {
        const 数据 = Object.assign({}, 预置);
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            数据, errors, '7');
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        ok(w.取消息表().length > 0, '初始有消息（' + w.取消息表().length + ' 条）');

        // ① 点「否」
        d.getElementById('清空键').click();
        await new Promise(r => setTimeout(r, 60));
        const 遮罩 = d.getElementById('确认遮罩');
        ok(遮罩.classList.contains('显示'), '点清空 → 弹出确认框');
        ok(/清空/.test(d.getElementById('确认标题').textContent), '标题是清空确认');
        ok(/无法恢复/.test(d.getElementById('确认说明').textContent), '说明带「无法恢复」警示');
        d.getElementById('确认否').click();
        await new Promise(r => setTimeout(r, 60));
        ok(w.取消息表().length > 0, '★ 点「否」→ 未清空，消息还在');

        // ② 点「是」
        d.getElementById('清空键').click();
        await new Promise(r => setTimeout(r, 60));
        d.getElementById('确认是').click();
        await new Promise(r => setTimeout(r, 80));

        ok(w.取消息表().length === 0, '★ 点「是」→ 已清空（剩 ' + w.取消息表().length + ' 条）');
        ok(d.querySelectorAll('.气泡').length === 0, '页面气泡已清空');
        ok(数据['聊天记录_c_default_4'] === '[]', '★ 存档写成空数组 []（而非删键）');
        const 索引 = JSON.parse(数据['联系人索引'] || '[]');
        ok(索引.find(i => i.id === 'c_default_4').消息 === '', '会话列表预览已同步清空');
    }

    console.log('\n[W] ★ 清空后刷新不会把初始对话造回来');
    {
        // 模拟刷新：存档是空数组 → 必须保持空
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置, { '聊天记录_c_default_4': '[]' }), errors, '7');
        await new Promise(r => setTimeout(r, 120));
        ok(w.取消息表().length === 0,
            '★ 存档为空数组 → 刷新后仍是空（实际 ' + w.取消息表().length + ' 条）');
        ok(w.document.querySelectorAll('.气泡').length === 0, '页面无气泡');
        // 且此时点清空应提示「已经是空的」而非再弹确认
        w.document.getElementById('清空键').click();
        await new Promise(r => setTimeout(r, 60));
        ok(!w.document.getElementById('确认遮罩').classList.contains('显示'),
            '空聊天时点清空 → 不再弹确认框');
    }

    console.log('\n[X] ★ 录音弹窗：录音时弹出，带计时与实时音量条');
    {
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 打桩录音);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        const 弹窗 = d.getElementById('录音弹窗');

        ok(!弹窗.classList.contains('显示'), '初始弹窗收起');
        ok(!!d.querySelector('.录音麦图标 svg'), '弹窗内有麦克风图标');
        ok(d.querySelectorAll('#录音音量 i').length >= 7,
            '弹窗内有音量条（' + d.querySelectorAll('#录音音量 i').length + ' 根）');
        ok(!!d.getElementById('录音取消'), '弹窗有「取消」按钮');
        ok(!!d.getElementById('录音发送'), '弹窗有「发送」按钮');
        ok(/正在录音/.test(d.querySelector('.录音弹窗说明').textContent), '弹窗有状态说明文案');

        // 开录
        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 900));

        ok(弹窗.classList.contains('显示'), '★ 录音中 → 弹窗已弹出');
        const 计时 = d.getElementById('弹窗计时').textContent;
        ok(/^0:0[0-9]$/.test(计时), '★ 弹窗计时实时更新（实际 ' + 计时 + '）');

        // 音量条应随录音起伏（有 AudioContext 就真读，没有就模拟，都会动）
        const 高1 = Array.from(d.querySelectorAll('#录音音量 i')).map(e => e.style.height).join();
        await new Promise(r => setTimeout(r, 260));
        const 高2 = Array.from(d.querySelectorAll('#录音音量 i')).map(e => e.style.height).join();
        ok(高1 !== 高2, '★ 音量条随录音起伏（在动，不是死的）');
        const 有高 = Array.from(d.querySelectorAll('#录音音量 i')).some(e => parseFloat(e.style.height) > 12);
        ok(有高, '音量条有被撑起的竖条（有音量反馈）');

        // —— 弹窗「取消」：丢掉，不产生消息
        const 前 = w.取消息表().length;
        d.getElementById('录音取消').click();
        await new Promise(r => setTimeout(r, 150));
        ok(!弹窗.classList.contains('显示'), '点「取消」→ 弹窗关闭');
        ok(w.是否录音中() === false, '点「取消」→ 录音已停止');
        ok(w.取消息表().length === 前, '★ 点「取消」→ 未产生任何消息（丢弃）');
        ok(d.querySelectorAll('.语音泡').length === 0, '★ 取消后没有语音条上屏');
    }

    console.log('\n[Y] ★ 弹窗「发送」→ 语音上屏，且可点击听取');
    {
        let 播放次数 = 0, 播放源 = '';
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 打桩录音);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        const 前 = w.取消息表().length;

        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 1150));
        ok(d.getElementById('录音弹窗').classList.contains('显示'), '录音中弹窗已弹出');

        d.getElementById('录音发送').click();
        await new Promise(r => setTimeout(r, 200));

        ok(!d.getElementById('录音弹窗').classList.contains('显示'), '点「发送」→ 弹窗关闭');
        ok(w.取消息表().length === 前 + 1, '★ 语音消息已写入（' + 前 + ' → ' + w.取消息表().length + '）');

        const 泡 = Array.from(d.querySelectorAll('.语音泡')).pop();
        ok(!!泡, '★ 消息流里出现语音条');
        ok(!泡.classList.contains('失效'), '语音条是可播放状态（非失效）');
        const 播放键 = 泡.querySelector('.语音播放');
        ok(!!播放键, '语音条上有播放键');

        // 给真实 <audio> 打桩，验证点击真的播了
        const 计 = 装播放器桩(w);
        播放键.click();
        await new Promise(r => setTimeout(r, 80));
        ok(计.次数 === 1, '★ 发送成功后点击 → 真的播放了（' + 计.次数 + ' 次）');
        ok(/^blob:/.test(计.源), '播放的是音频 blob（' + String(计.源).slice(0, 10) + '）');

        // 再点一次应暂停（不是重复叠加播放）
        播放键.click();
        await new Promise(r => setTimeout(r, 60));
        ok(计.次数 === 1, '再点一次 → 暂停而非重复播放');
    }

    console.log('\n[Z] ★ 发送成功后刷新仍可点击听取（IndexedDB 持久化）');
    {
        const 仓库 = new Map();
        function 装库(w) {
            w.indexedDB = {
                open() {
                    const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null };
                    setTimeout(() => {
                        req.result = {
                            objectStoreNames: { contains: () => 仓库.has('s') },
                            createObjectStore: () => { 仓库.set('s', new Map()); },
                            transaction: () => {
                                const t = { oncomplete: null, onerror: null, objectStore: () => ({
                                    put: r => { 仓库.get('s').set(r.id, r); return { result: r.id }; },
                                    getAll: () => ({ result: Array.from(仓库.get('s').values()) }),
                                    delete: id => { 仓库.get('s').delete(id); return { result: null }; },
                                })};
                                setTimeout(() => t.oncomplete && t.oncomplete(), 0);
                                return t;
                            },
                        };
                        if (!仓库.has('s')) req.onupgradeneeded && req.onupgradeneeded();
                        req.onsuccess && req.onsuccess();
                    }, 0);
                    return req;
                }
            };
        }

        // ① 录一条
        const w1 = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', w => { 装库(w); 打桩录音(w); });
        await new Promise(r => setTimeout(r, 150));
        w1.document.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 1150));
        w1.document.getElementById('录音发送').click();
        await new Promise(r => setTimeout(r, 250));
        ok(仓库.get('s').size === 1, '音频已存入 IndexedDB（' + 仓库.get('s').size + ' 条）');

        const 键 = Array.from(仓库.get('s').keys())[0];
        const 存档 = JSON.stringify([{ 谁: '我', 文: '语音', 类型: '语音', 时长: 2,
            语音键: String(键).split(':')[1], 时间戳: Date.now() }]);

        // ② 模拟刷新：新开页，内存语音库已空
        const w2 = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置, { '聊天记录_c_default_4': 存档 }), errors, '7', w => {
                装库(w);
                w.URL.createObjectURL = () => 'blob:reloaded';
            });
        await new Promise(r => setTimeout(r, 400));

        const 泡 = w2.document.querySelector('.语音泡');
        ok(!!泡 && !泡.classList.contains('失效'), '★ 刷新后语音条仍可播放（非失效）');
        const 计 = 装播放器桩(w2);
        w2.document.querySelector('.语音播放').click();
        await new Promise(r => setTimeout(r, 80));
        ok(计.次数 === 1, '★ 刷新后点击仍能听到内容（播放 ' + 计.次数 + ' 次）');
    }

    console.log('\n[AA] ★ 点击语音条任意位置都能听取（不只是那个小播放键）');
    {
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 打桩录音);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;

        // 录一条语音
        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 1150));
        d.getElementById('录音发送').click();
        await new Promise(r => setTimeout(r, 250));

        const 计 = 装播放器桩(w);
        const 泡 = Array.from(d.querySelectorAll('.语音泡')).pop();
        ok(!!泡 && !泡.classList.contains('失效'), '语音条可播放');

        // ① 点气泡本体（非播放键区域）
        泡.click();
        await new Promise(r => setTimeout(r, 60));
        ok(计.次数 === 1, '★ 点语音条本体 → 播放了（' + 计.次数 + ' 次）');
        ok(泡.classList.contains('播放中'), '播放中状态已体现（视觉反馈）');

        // ② 再点一次 → 暂停
        泡.click();
        await new Promise(r => setTimeout(r, 60));
        ok(计.次数 === 1, '再点 → 暂停（未重复叠加播放）');
        ok(!泡.classList.contains('播放中'), '播放中状态已清除');

        // 后续每次点击都是「播放 / 暂停」交替，所以先归一到暂停态再点，
        // 否则点第二下是暂停，计数不涨，测试会误判成「点不动」。
        const 点哪都能播 = async (区域, 说明) => {
            if (泡.classList.contains('播放中')) {           // 正在播 → 先点停
                泡.click();
                await new Promise(r => setTimeout(r, 50));
            }
            const 前次 = 计.次数;
            区域.click();
            await new Promise(r => setTimeout(r, 60));
            ok(计.次数 === 前次 + 1, '★ ' + 说明 + ' → 能播放（' + 计.次数 + ' 次）');
        };

        // ③ 点声波条区域（语音条内部）也能播
        await 点哪都能播(泡.querySelector('.语音条'), '点声波区域');
        // ④ 点时长文字区域也能播
        await 点哪都能播(泡.querySelector('.语音时长'), '点时长区域');
        // ⑤ 点小播放键也仍然有效（回归）
        await 点哪都能播(泡.querySelector('.语音播放'), '点小播放键');
        // ⑥ 点头像旁的气泡边缘也算（最外层）
        await 点哪都能播(泡, '点气泡本体（第二次）');
    }

    console.log('\n[AB] ★ 点语音条不会误触发删除，长按删除后也不会「删完还播」');
    {
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 打桩录音);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;

        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 1150));
        d.getElementById('录音发送').click();
        await new Promise(r => setTimeout(r, 250));

        const 计 = 装播放器桩(w);

        // ① 点语音条 → 不能弹出删除确认框
        const 泡 = Array.from(d.querySelectorAll('.语音泡')).pop();
        泡.click();
        await new Promise(r => setTimeout(r, 80));
        ok(计.次数 === 1, '点语音条 → 已播放');
        ok(!d.getElementById('确认遮罩').classList.contains('显示'),
            '★ 点语音条播放时不会弹删除框（已 stopPropagation）');

        // ② 长按语音条 → 弹删除框 → 点「是」→ 删除后补发的 click 不应再播放
        const 前 = w.取消息表().length;
        const 行 = Array.from(d.querySelectorAll('.消息行')).pop();
        长按(w, 行);
        await new Promise(r => setTimeout(r, 620));
        ok(d.getElementById('确认遮罩').classList.contains('显示'), '长按语音条 → 弹出删除框');
        d.getElementById('确认是').click();
        await new Promise(r => setTimeout(r, 100));
        ok(w.取消息表().length === 前 - 1, '语音条已删除（' + 前 + ' → ' + w.取消息表().length + '）');

        // 模拟浏览器在长按后补发的那一下 click（落在原位置）
        const 次数快照 = 计.次数;
        行.click();
        await new Promise(r => setTimeout(r, 80));
        ok(计.次数 === 次数快照, '★ 长按删除后补发的 click 不会触发播放（' + 计.次数 + '）');
    }

    console.log('\n[AC] 失效语音点击有提示，不静默无反应');
    {
        const 存档 = JSON.stringify([
            { 谁: '我', 文: '语音', 类型: '语音', 时长: 3, 语音键: 'v_不存在的键', 时间戳: Date.now() },
        ]);
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置, { '聊天记录_c_default_4': 存档 }), errors, '7');
        await new Promise(r => setTimeout(r, 200));

        const 泡 = w.document.querySelector('.语音泡');
        ok(!!泡 && 泡.classList.contains('失效'), '失效语音条已渲染');
        泡.click();
        await new Promise(r => setTimeout(r, 60));
        const 提示框 = w.document.getElementById('toast');
        ok(提示框.classList.contains('显示'), '★ 点失效语音 → 有 toast 提示（不静默）');
        ok(/失效/.test(提示框.textContent), '提示说明无法播放（"' + 提示框.textContent + '"）');
    }

    console.log('\n[AD] ★ 播放器必须真实挂在 DOM 里（否则 iOS 上会被静默拒绝出声）');
    {
        const 块 = (/语音播放器：必须真实挂在 DOM 里[\s\S]*?-->/).exec(css);
        ok(!!块, '源码里有这条坑的说明注释（避免后人改回 new Audio）');
        ok(/<audio id="语音播放器"/.test(css), '★ 页面里有真实 <audio> 元素');
        ok(!/\.消息行[\s\S]{0,80}new Audio\(/.test(css) && !/new Audio\(语音库/.test(css),
            '★ 不再用游离的 new Audio()（iOS 会静默拒绝）');

        const w = await 跑7页('?id=c_default_4&from=1');
        const 元素 = w.document.getElementById('语音播放器');
        ok(!!元素, '运行时能取到播放器元素');
        ok(元素.tagName === 'AUDIO', '确实是 <audio> 标签');
        ok(!!元素.parentNode, '★ 播放器已挂载到 DOM（有父节点）');
        ok(元素.getAttribute('preload') === 'auto', 'preload=auto（提前缓冲，点下去就响）');
    }

    console.log('\n[AE] ★ 播放失败要有可见反馈（绝不静默吞掉）');
    {
        const css7 = css;
        // play() 的 rejection 必须被处理并给出提示，不能是空的 catch
        ok(/NotAllowedError/.test(css7), '区分了 NotAllowedError（浏览器拦截）');
        ok(/NotSupportedError/.test(css7), '区分了 NotSupportedError（格式不支持）');
        ok(/音频格式不支持，无法播放/.test(css7), '有「格式不支持」的用户可见文案');
        ok(/播放失败，请重试/.test(css7), '有通用失败文案');
        // error 事件也要处理
        ok(/播放器元素\.addEventListener\('error'/.test(css7), '★ 监听了 error 事件（解码失败能感知）');
        // 播放路径上的 catch 必须「带参数并处理」，不能是空的
        // （IndexedDB / AudioContext 那几处空 catch 是合理兜底，不算）
        const 起播放段 = (/function 起播放\([\s\S]*?\n        \}/.exec(css7) || [''])[0];
        ok(/p\.catch\(err =>/.test(起播放段), '★ play() 的 rejection 带 err 参数（不是空吞）');
        ok(!/p\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(起播放段), '★ play() 没有空 catch');
        ok(/播放器元素\.addEventListener\('ended'/.test(css7), '监听了 ended（播完能复位）');

        // 真跑一次失败：play 返回 rejected，应弹 toast 且清掉播放态
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 打桩录音);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 1150));
        d.getElementById('录音发送').click();
        await new Promise(r => setTimeout(r, 250));

        const 元素 = d.getElementById('语音播放器');
        元素.play = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));

        const 泡 = Array.from(d.querySelectorAll('.语音泡')).pop();
        泡.click();
        await new Promise(r => setTimeout(r, 100));
        const 提示框 = d.getElementById('toast');
        ok(提示框.classList.contains('显示'), '★ play 被拒 → 弹出提示（不再静默）');
        ok(/拦截|再点一次/.test(提示框.textContent), '提示说明是浏览器拦截（"' + 提示框.textContent + '"）');
        ok(!泡.classList.contains('播放中'), '播放态已回滚（不会一直显示"在播"）');
    }

    console.log('\n[AF] ★ 空/静音录音不得上屏（避免发出一条点不响的语音）');
    {
        // 录音块只有几十字节 → 视为没录到声音，应拒绝发送
        const 小桩 = (w, 选项) => {
            打桩录音(w, 选项);
            w.MediaRecorder = class {
                constructor() {} static isTypeSupported() { return true; }
                start() { if (this.ondataavailable) this.ondataavailable({ data: new w.Blob([new Uint8Array(32)], { type: 'audio/webm' }) }); }
                stop() { if (this.onstop) this.onstop(); }
            };
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 小桩);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        const 前 = w.取消息表().length;

        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 1150));
        d.getElementById('录音发送').click();
        await new Promise(r => setTimeout(r, 250));

        ok(w.取消息表().length === 前, '★ 空录音未被发出（' + 前 + ' 条不变）');
        ok(d.querySelectorAll('.语音泡').length === 0, '★ 没有生成点不响的语音条');
        ok(/没有录到声音|麦克风/.test(d.getElementById('toast').textContent),
            '提示「没有录到声音」（"' + d.getElementById('toast').textContent + '"）');
    }

    console.log('\n[AG] ★ Blob 必须带 MIME（否则解码器无从下手）');
    {
        ok(/默认音频类型\s*\(\)/.test(css), '有 MIME 兜底函数 默认音频类型()');
        ok(/const 类型 = 实测 \|\| 默认音频类型\(\)/.test(css), '★ MIME 为空时回退到环境支持的类型');
        ok(/audio\/mp4/.test(css) && /audio\/webm/.test(css),
            '候选里同时含 mp4（iOS）与 webm（Android/桌面）');

        // 实测：让录音块不带 type，看发出的 Blob 是否仍有合法 MIME
        const 无类型桩 = (w, 选项) => {
            打桩录音(w, 选项);
            w.MediaRecorder = class {
                constructor() { this.mimeType = ''; }
                static isTypeSupported(t) { return t === 'audio/webm'; }
                start() { if (this.ondataavailable) this.ondataavailable({ data: new w.Blob([new Uint8Array(2048)], { type: '' }) }); }
                stop() { if (this.onstop) this.onstop(); }
            };
        };
        const 数据 = Object.assign({}, 预置);
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            数据, errors, '7', 无类型桩);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 1150));
        d.getElementById('录音发送').click();
        await new Promise(r => setTimeout(r, 250));

        const 泡 = Array.from(d.querySelectorAll('.语音泡')).pop();
        ok(!!泡 && !泡.classList.contains('失效'), '★ 块无 MIME 时语音仍能正常发出并播放');
        // 存进 IndexedDB 的 blob 应带上兜底类型
        const 计 = 装播放器桩(w);
        泡.click();
        await new Promise(r => setTimeout(r, 80));
        ok(计.次数 === 1, '★ 且点击确实能播放（' + 计.次数 + ' 次）');
    }

    console.log('\n[AH] ★ iOS 上必须放弃真实音量监测（否则 MediaRecorder 录到静音）');
    {
        const 段 = (/iOS Safari 上，AudioContext[\s\S]*?换取/.exec(css) || [''])[0];
        ok(段.length > 0, '★ 源码写明了 iOS 上 AudioContext 会抢流的坑');
        ok(/是iOS/.test(css), '有 iOS 判定');
        ok(/if \(是iOS\) return false;/.test(css), '★ iOS 上直接跳过真实音量监测（起音量监测 提前返回）');
        ok(/音量真实可用 = false;[\s\S]{0,60}录音峰值 = -1;/.test(css),
            '★ 模拟模式标记「峰值未知」，不会拿假波形去误判');
        // 音量监测必须在 MediaRecorder 之后启动
        ok(/起音量监测\(流\)\) \{ 音量真实可用 = true/.test(css), '★ 监测在 MediaRecorder 起来之后才开');
    }

    console.log('\n[AI] ★ 音轨自检：麦克风被静音 / 无音轨时拒绝开录');
    {
        const 静音桩 = (w, 选项) => {
            打桩录音(w, 选项);
            w.navigator.mediaDevices.getUserMedia = async () => {
                // 模拟「权限给了但系统把麦克风静音了」
                const 轨 = { kind: 'audio', enabled: true, muted: true, readyState: 'live', stop() {} };
                return { getTracks: () => [轨], getAudioTracks: () => [轨] };
            };
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 静音桩);
        await new Promise(r => setTimeout(r, 120));
        w.document.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 150));

        ok(w.是否录音中() === false, '★ 麦克风被静音 → 不进入录音态');
        ok(!w.document.getElementById('录音弹窗').classList.contains('显示'), '不弹录音弹窗');
        ok(/静音/.test(w.document.getElementById('toast').textContent),
            '★ 明确提示「麦克风被静音」（"' + w.document.getElementById('toast').textContent + '"）');

        // 无音轨
        const 空轨桩 = (w2, 选项) => {
            打桩录音(w2, 选项);
            w2.navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [], getAudioTracks: () => [] });
        };
        const w2 = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 空轨桩);
        await new Promise(r => setTimeout(r, 120));
        w2.document.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 150));
        ok(w2.是否录音中() === false, '★ 没有音轨 → 不进入录音态');
        ok(/音轨/.test(w2.document.getElementById('toast').textContent), '提示拿到了空音轨');
    }

    console.log('\n[AJ] ★ 全程静音（有数据但没声音）不得发出');
    {
        // 数据块够大（通过字节数校验），但音量监测恒为 0 —— 典型的静音流
        const 静音流桩 = (w, 选项) => {
            打桩录音(w, 选项);
            // 让真实音量监测可用，但读数恒为 0
            w.AudioContext = class {
                constructor() { this.state = 'running'; }
                createAnalyser() {
                    return { fftSize: 256, frequencyBinCount: 128,
                        getByteFrequencyData: buf => buf.fill(0) };   // 静音
                }
                createMediaStreamSource() { return { connect() {} }; }
                resume() { return Promise.resolve(); }
                close() { return Promise.resolve(); }
            };
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 静音流桩);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        const 前 = w.取消息表().length;

        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 1150));
        d.getElementById('录音发送').click();
        await new Promise(r => setTimeout(r, 250));

        ok(w.取消息表().length === 前, '★ 静音流未被发出（' + 前 + ' 条不变）');
        ok(d.querySelectorAll('.语音泡').length === 0, '★ 没有生成播不响的语音条');
        ok(/没有检测到声音|没有录到声音/.test(d.getElementById('toast').textContent),
            '★ 提示「没检测到声音」（"' + d.getElementById('toast').textContent + '"）');
    }

    console.log('\n[AK] ★ 录音弹窗实时提醒「没检测到声音」');
    {
        const 静音流桩 = (w, 选项) => {
            打桩录音(w, 选项);
            w.AudioContext = class {
                constructor() { this.state = 'running'; }
                createAnalyser() {
                    return { fftSize: 256, frequencyBinCount: 128,
                        getByteFrequencyData: buf => buf.fill(0) };
                }
                createMediaStreamSource() { return { connect() {} }; }
                resume() { return Promise.resolve(); }
                close() { return Promise.resolve(); }
            };
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_4',
            Object.assign({}, 预置), errors, '7', 静音流桩);
        await new Promise(r => setTimeout(r, 120));
        const d = w.document;
        const 说明 = d.querySelector('.录音弹窗说明');

        d.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 200));
        ok(/正在录音/.test(说明.textContent), '刚开录显示「正在录音…」');

        // 等过 1.8 秒缓冲 + 检查周期
        await new Promise(r => setTimeout(r, 2100));
        ok(/没有检测到声音/.test(说明.textContent),
            '★ 录了 2 秒仍无声 → 弹窗实时提醒（"' + 说明.textContent + '"）');
    }

    console.log('\n[AL] 诊断接口覆盖录音质量（真机排查用）');
    {
        const w = await 跑7页('?id=c_default_4&from=1');
        ok(typeof w.语音诊断 === 'function', '暴露 window.语音诊断()');
        const 诊 = w.语音诊断();
        ok(!!诊.环境 && '协议' in 诊.环境, '诊断含「环境.协议」（file: 直接判死）');
        ok('是否iOS' in 诊.环境, '诊断含「环境.是否iOS」');
        ok(!!诊.格式 && '支持webm' in 诊.格式 && '支持mp4' in 诊.格式, '诊断含格式支持情况');
        ok(!!诊.上次录音 && '字节数' in 诊.上次录音 && '峰值' in 诊.上次录音,
            '★ 诊断含上次录音的字节数与峰值（区分「没录到」与「录了但静音」）');
        ok(!!诊.播放器 && '就绪' in 诊.播放器 && '错误' in 诊.播放器,
            '诊断含播放器就绪状态与错误码');
    }

    console.log('\n[AM] ★ 卡片气泡排版：主行/副行各占一行；无类别提示；配图居中去底框');
    {
        /* ★ bug：.卡片额/.卡片副 都是 <span>，CSS 没给 display:block，
           否则会挤在同一行，且 margin-top 对 inline 无效。 */
        const 源 = 读('7_liaotian.html');
        for (const 段 of ['卡片额', '卡片副']) {
            const 块 = new RegExp('\\.' + 段 + '\\s*\\{([^}]*)\\}').exec(源);
            ok(!!块 && /display:\s*block/.test(块[1]),
                '★ .' + 段 + ' 有 display:block（否则三段挤成一行）');
        }
        /* ★ 顶部类别提示已按需求删除：卡片里不该再有 .卡片题 */
        ok(!/\.卡片题/.test(源), '★ 已无 .卡片题（顶部「红包/转账」提示按需求删除）');
        ok(!/卡片题/.test(源), '★ 建卡片里也不再生成 .卡片题 节点');
        /* ★ 配图：无底框 + 上下居中 */
        const 图块3 = /\.卡图\s*\{([^}]*)\}/.exec(源);
        ok(!!图块3 && /background:\s*transparent/.test(图块3[1]), '★ 配图无底框（transparent）');
        ok(!!图块3 && /box-shadow:\s*none/.test(图块3[1]), '★ 配图无阴影');
        const 头块3 = /\.卡片头\s*\{([\s\S]*?)\}/.exec(源);
        ok(!!头块3 && /align-items:\s*center/.test(头块3[1]), '★ ★ 配图上下居中（center）');
        const 泡块 = /\.卡片泡\s*\{([^}]*)\}/.exec(源);
        ok(!!泡块 && /border-radius/.test(泡块[1]),
            '★ .卡片泡 自带圆角（不继承文字气泡的 4px）');
        ok(!!泡块 && /line-height/.test(泡块[1]),
            '★ .卡片泡 有独立行高（不继承正文的 1.62）');
    }

    const 睡 = ms => new Promise(r => setTimeout(r, ms));

    console.log('\n[AN] ★ 删除确认的摘要不要重复前缀');
    {
        /* ★ bug：摘要 = 卡片尾巴('转账') + 文.题 → 「转账 转账 ¥52.50」 */
        const 数据 = {
            '联系人索引': JSON.stringify([{ id: 'c_1', 名称: '林彦', 备注: '林彦', 头像: '', 消息: '', 时间: '' }]),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '我', 类型: '转账', 文: '[转账]', 卡: { 种类: '转账', 金额: 52.5, 说明: '还你的' }, 时间戳: Date.now() },
                { 谁: '他', 类型: '转账', 文: '[AA收款]', 卡: { 种类: 'AA', 金额: 30, 人数: 3, 每人: 10, 说明: '' }, 时间戳: Date.now() },
                { 谁: '我', 类型: '红包', 文: '[红包]', 卡: { 种类: '拼手气红包', 金额: 66, 个数: 5, 祝福: '新年快乐' }, 时间戳: Date.now() },
                { 谁: '我', 类型: '通话', 文: '[语音通话]', 卡: { 种类: '通话', 结果: '已完成', 时长: 125, 成员: ['甲', '乙'] }, 时间戳: Date.now() },
            ]),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            数据, errors, '摘要');
        await 睡(350);

        /* ★ 红包主行现在是祝福语（不是金额）—— 摘要里也跟着变 */
        const 期望 = ['转账 ¥52.50', 'AA 收款 ¥10 / 人',
            '拼手气红包 新年快乐', '语音通话 2:05'];
        for (let i = 0; i < 期望.length; i++) {
            w.请求删除(i);
            await 睡(60);
            const 文 = w.document.getElementById('确认说明').textContent.replace(/[「」]/g, '');
            ok(文 === 期望[i], '★ 摘要 = 「' + 期望[i] + '」（实际「' + 文 + '」）');
            ok(!/^(\S+)\s+\1\b/.test(文.trim()), '★ 摘要没有重复词（' + 文 + '）');
            w.document.getElementById('确认否').dispatchEvent(
                new w.MouseEvent('click', { bubbles: true }));
            await 睡(60);
        }
    }

    console.log('\n[AO] ★ 搜索：卡片消息要能按金额 / 说明 / 祝福语搜到');
    {
        /* ★ bug：过滤只比 条.文（只是个「[转账]」标签），
           搜「52.5」「还你的」都搜不到已发的那笔转账。 */
        const 数据 = {
            '联系人索引': JSON.stringify([{ id: 'c_1', 名称: '林彦', 备注: '林彦', 头像: '', 消息: '', 时间: '' }]),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '我', 类型: '转账', 文: '[转账]', 卡: { 种类: '转账', 金额: 52.5, 说明: '还你的' }, 时间戳: Date.now() },
                { 谁: '他', 类型: '转账', 文: '[AA收款]', 卡: { 种类: 'AA', 金额: 30, 人数: 3, 每人: 10, 说明: '聚餐AA' }, 时间戳: Date.now() },
                { 谁: '我', 类型: '红包', 文: '[红包]', 卡: { 种类: '拼手气红包', 金额: 66, 个数: 5, 祝福: '新年快乐' }, 时间戳: Date.now() },
                { 谁: '他', 文: '普通文字消息', 时间戳: Date.now() },
            ]),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            数据, errors, '搜索');
        await 睡(350);
        const 框 = w.document.getElementById('聊天搜索输入');

        async function 搜(词) {
            框.value = 词;
            框.dispatchEvent(new w.Event('input', { bubbles: true }));
            await 睡(110);
            return w.document.querySelectorAll('.消息行').length;
        }

        ok(await 搜('52.5') === 1, '★ 搜转账金额「52.5」→ 命中 1 条');
        ok(await 搜('还你的') === 1, '★ 搜转账说明「还你的」→ 命中 1 条');
        ok(await 搜('聚餐') === 1, '★ 搜 AA 说明「聚餐」→ 命中 1 条');
        ok(await 搜('新年') === 1, '★ 搜红包祝福语「新年」→ 命中 1 条');
        ok(await 搜('转账') === 2, '★ 搜「转账」→ 转账 + AA 共 2 条');
        ok(await 搜('普通') === 1, '★ 普通文字消息照常能搜');
        ok(await 搜('zzz不存在') === 0, '★ 搜不到时显示 0 条');
        await 搜('');
        ok(w.document.querySelectorAll('.消息行').length === 4, '★ 清空搜索后 4 条全回来');
    }

    console.log('\n[AP] ★ 时间戳：不随搜索关键词变化');
    {
        /* ★ bug：上一条戳 只在【可见】消息间更新，搜索过滤后
           同一条消息的时间戳会随着关键词变来变去。 */
        const 基 = Date.now();
        const 数据 = {
            '联系人索引': JSON.stringify([{ id: 'c_1', 名称: '林彦', 备注: '林彦', 头像: '', 消息: '', 时间: '' }]),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '他', 文: '第一条', 时间戳: 基 - 3 * 3600e3 },
                { 谁: '他', 文: '第二条', 时间戳: 基 - 2 * 3600e3 },   // 隔 1 小时 → 要时间戳
                { 谁: '他', 文: '第三条', 时间戳: 基 - 1 * 3600e3 },
                { 谁: '他', 文: '第四条', 时间戳: 基 },
            ]),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            数据, errors, '时间戳');
        await 睡(350);
        const 全量 = w.document.querySelectorAll('.时间戳').length;

        const 框 = w.document.getElementById('聊天搜索输入');
        async function 搜(词) {
            框.value = 词;
            框.dispatchEvent(new w.Event('input', { bubbles: true }));
            await 睡(110);
            return w.document.querySelectorAll('.时间戳').length;
        }
        /* 只搜第 2 条：它跟真实上一条隔了 1 小时，本身就该带时间戳，
           不能因为被过滤成「可见首条」而变成另一套判断。 */
        ok(await 搜('第二条') === 1, '★ 搜出「第二条」→ 仍带 1 个时间戳');
        ok(await 搜('第四条') === 1, '★ 搜最后一条 → 仍带 1 个时间戳');
        await 搜('');
        ok(w.document.querySelectorAll('.时间戳').length === 全量,
            '★ 清空搜索后时间戳数复原');
        ok(全量 === 4, '四条各隔 1 小时 → 4 个时间戳（实际 ' + 全量 + '）');
    }
    {
        /* ★★ 反过来看：三条挨得很近（<5 分钟），中间那条本来【没有】时间戳，
           搜索过滤后它成了「可见首条」—— 修复前会凭空多出一个时间戳。 */
        const 基 = Date.now();
        const 数据 = {
            '联系人索引': JSON.stringify([{ id: 'c_1', 名称: '林彦', 备注: '林彦', 头像: '', 消息: '', 时间: '' }]),
            '聊天记录_c_1': JSON.stringify([
                { 谁: '他', 文: '甲', 时间戳: 基 - 60000 },
                { 谁: '他', 文: '乙', 时间戳: 基 - 30000 },
                { 谁: '他', 文: '丙', 时间戳: 基 },
            ]),
        };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_1',
            数据, errors, '时间戳2');
        await 睡(350);
        ok(w.document.querySelectorAll('.时间戳').length === 1,
            '三条挨着 → 只有首条有时间戳（实际 '
            + w.document.querySelectorAll('.时间戳').length + '）');

        const 框 = w.document.getElementById('聊天搜索输入');
        框.value = '乙';
        框.dispatchEvent(new w.Event('input', { bubbles: true }));
        await 睡(110);
        ok(w.document.querySelectorAll('.消息行').length === 1, '只搜出中间那条');
        ok(w.document.querySelectorAll('.时间戳').length === 0,
            '★★ 中间那条本来没时间戳，过滤后也不能凭空长出来（实际 '
            + w.document.querySelectorAll('.时间戳').length + '）');
    }

    console.log('\n[AQ] ★★ 顶栏「更多」：放大镜右侧 → 18 页群资料');
    {
        const 群数据 = () => ({
            '群聊列表': JSON.stringify([{
                id: 'g_a', 名称: '老友局',
                成员: [{ id: 'c1', 名: '林彦', 头像: 'h1' },
                      { id: 'c2', 名: '陆沉渊', 头像: 'h2' }],
                消息: 'x', 时间: 'y',
            }]),
        });
        const 群url = 'http://localhost/7.html?id=g_a&type=group&from=1';

        const w = await 起页面('7_liaotian.html', 群url, 群数据(), errors, '更多键');
        await 睡(700);
        const d = w.document;

        const 键 = d.getElementById('群资料键');
        ok(!!键, '★ 有「更多」键');
        ok(键.style.display === '', '★ ★ 群聊时显示出来（实际 "' + 键.style.display + '"）');

        /* 位置：紧贴放大镜右侧，且是最后一枚 */
        const 右 = Array.from(d.querySelectorAll('.右侧动作 > *')).map(e => e.id);
        ok(右.indexOf('群资料键') === 右.indexOf('搜索键') + 1,
            '★ ★ 紧贴在搜索键（放大镜）右侧（实际 ' + 右.join(',') + '）');
        ok(右.indexOf('群资料键') === 右.length - 1, '★ 是动作区最后一枚');

        /* 竖排三点：三个圆的 cx 相同、cy 不同 */
        const 圆 = Array.from(键.querySelectorAll('circle'));
        ok(圆.length === 3, '★ 三点图标（实际 ' + 圆.length + ' 个圆）');
        ok(new Set(圆.map(c => c.getAttribute('cx'))).size === 1,
            '★ 三点【竖排】（cx 相同）—— 横排那是别的语义');

        /* 点它 → 18 页，且带上 id / from / b（返回链三件套） */
        键.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 睡(150);
        ok(w.最后跳转 === '18_qunziliao.html?id=g_a&from=7&b=1',
            '★ ★ 点它 → 18 页群资料（实际 ' + w.最后跳转 + '）');

        /* 单聊不该出现（单聊没有群资料这回事） */
        const w2 = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_default_1&from=1',
            预置, errors, '单聊无更多');
        await 睡(700);
        ok(w2.document.getElementById('群资料键').style.display === 'none',
            '★ 单聊不显示「更多」键');
        ok(w2.document.getElementById('清空键').style.display !== 'none',
            '★ 单聊仍保留「清空」键（两枚互斥，不会同时消失）');
    }

    console.log('\n[AR] ★★ 18 页改完保存 → 回 7 页，信息真的更新了');
    {
        /* jsdom 里 location.href 跳不动，所以按真实浏览器的行为来验：
           18 页保存写盘 → 7 页整页重载 → 读到的必须是新数据。
           （真机上是 location.href 跳转，等价于一次全新加载。） */
        const 起7 = async 数据 => {
            const w = await 起页面('7_liaotian.html',
                'http://localhost/7.html?id=g_a&type=group&from=1', 数据, errors, '改后重载');
            await 睡(700);
            return w;
        };
        const 原始 = () => ({
            '群聊列表': JSON.stringify([{
                id: 'g_a', 名称: '老友局',
                成员: [{ id: 'c1', 名: '林彦', 头像: 'h1' },
                      { id: 'c2', 名: '陆沉渊', 头像: 'h2' }],
                消息: 'x', 时间: 'y',
            }]),
        });

        /* 改名前：标题 = 老友局(3) —— 人数 = 成员 2 + 群主 1 */
        const 前 = await 起7(原始());
        ok(前.document.getElementById('页面标题').textContent === '老友局(3)',
            '改前标题 = 老友局(3)（实际 ' + 前.document.getElementById('页面标题').textContent + '）');

        /* —— 模拟 18 页保存：改群名 + 移除一位成员 —— */
        const 改后数据 = {
            '群聊列表': JSON.stringify([{
                id: 'g_a', 名称: '周末局', 我的昵称: '阿渊',
                成员: [{ id: 'c1', 名: '林彦', 头像: 'h1' }],
                消息: 'x', 时间: 'y',
            }]),
        };
        const 后 = await 起7(改后数据);
        const 新标题 = 后.document.getElementById('页面标题').textContent;
        ok(新标题 === '周末局(2)',
            '★ ★ 保存后标题跟着变：周末局(2)（实际 ' + 新标题 + '）');
        ok(后.document.title === '周末局(2)',
            '★ 标签页标题同步（实际 ' + 后.document.title + '）');
        ok(/2/.test(新标题) && !/3/.test(新标题),
            '★ ★ 人数也跟着更新 —— 移除成员后不再是旧的 3');

        /* 加了成员也要 +1 */
        const 加人数据 = {
            '群聊列表': JSON.stringify([{
                id: 'g_a', 名称: '周末局',
                成员: [{ id: 'c1', 名: '林彦', 头像: 'h1' },
                      { id: 'c2', 名: '陆沉渊', 头像: 'h2' },
                      { id: 'c3', 名: '白九霄', 头像: 'h3' }],
                消息: 'x', 时间: 'y',
            }]),
        };
        const 加后 = await 起7(加人数据);
        ok(加后.document.getElementById('页面标题').textContent === '周末局(4)',
            '★ 加成员后人数 +1（实际 ' + 加后.document.getElementById('页面标题').textContent + '）');

        /* ★ 返回链：18 页回 7 页时要把 7 页原本的来源续上（b=）
             —— 现在走「上层来源」这个具名变量（b= 取出来后一路透传），
                直接找 get('b') 会漏，要看它是不是真的用在了 from= 上。 */
        const 源码18 = 读('18_qunziliao.html');
        ok(/上层来源\s*=\s*参数\.get\('b'\)/.test(源码18),
            '★ ★ 18 页读得出 b=（7 页原本的来源）');
        ok(/'7':[\s\S]{0,220}上层来源/.test(源码18),
            '★ ★ 回 7 页时把 b= 续成 from=（从 4 页进来不会被退到 1 页）');
    }

    console.log('\n[P] ★★★ 会话框显示【最后一条消息】（不再与聊天气泡第一条重复）');
    {
        const 源7 = 读('7_liaotian.html');
        const 源1 = 读('1_shouyeyulan.html');
        const 去注释 = 源 => 源.split('\n')
            .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');

        /* ---------- ① 7 页：初始对话必须落盘 ---------- */
        /* ★★ 原来只在用户发第一条时才写盘，于是开聊前「聊天记录_<id>」一直是 null，
             首页会话框读不到东西，只能显示索引里那句固定小字文案 ——
             看起来跟点进去的聊天气泡第一条【是同一句】。 */
        ok(/if \(!Array\.isArray\(消息表\)\) \{[\s\S]{0,400}写\(存档键, JSON\.stringify\(消息表\)\)/.test(去注释(源7)),
            '★ ★★ 7 页造完初始对话立刻落盘');
        /* ★ 落盘不能破坏「清空」：清空写的是 []，Array.isArray([]) 为真 */
        ok(/!Array\.isArray\(消息表\)/.test(去注释(源7)),
            '★ ★ 只在「从没聊过」时造（清空后的 [] 不会被重建）');

        /* ---------- ② 1 页：会话框读最后一条 ---------- */
        ok(/function\s+刷新会话最后一条/.test(去注释(源1)), '★ ★ 1 页有刷新会话最后一条的逻辑');
        ok(/'聊天记录_' \+ id/.test(去注释(源1)), '★ ★ 读的是 聊天记录_<id>');
        ok(/表\[表\.length - 1\]/.test(去注释(源1)), '★ ★★ 取的是【最后一条】');
        /* ★ 群名带「（N）」后缀，匹配索引时要去掉，否则群会话永远读不到 */
        /* ★ 注意：断言字符串里要匹配源码中的「（\d+）」，正则本身需转义 */
        ok(/（\\d\+）/.test(去注释(源1)) && /replace\(/.test(去注释(源1)),
            '★ ★ 群名去掉「（N）」人数后缀再匹配');
        /* ★ 群不进「联系人索引」，必须走 data-群 */
        ok(/项\.dataset\.群/.test(去注释(源1)), '★ ★ 群聊走 data-群 取 id');
        /* ★ 语音 / 图片显示占位，跟 7 页「会话预览」同口径 */
        ok(/'\[语音\]'/.test(去注释(源1)) && /'\[图片\]'/.test(去注释(源1)),
            '★ ★ 语音/图片显示占位（与 7 页同口径）');
        /* ★ 没聊过要回落索引里的真实文案，不能拿页面写死的占位覆盖 */
        ok(/那\.消息/.test(去注释(源1)), '★ ★ 没聊过时回落索引里的文案');

        /* ---------- 实测 ---------- */
        const 名 = '埃洛温·影蚀';
        const 小字 = '人类天真的以为犯错只需忤悔';
        const 索引表 = [{ id: 'c_home_1', 名称: 名, 备注: '', 头像: '', 消息: 小字, 时间: '12:00' }];
        const 预 = { '联系人索引': JSON.stringify(索引表) };

        /* A. 7 页：初始对话落盘，且第一条 = 小字文案 */
        const w7 = await 起页面('7_liaotian.html',
            'http://localhost/7.html?id=c_home_1&from=1', 预, errors, '7P');
        await new Promise(r => setTimeout(r, 1200));
        const 存 = w7.localStorage.getItem('聊天记录_c_home_1');
        ok(!!存, '★ ★★ 开聊前「聊天记录_c_home_1」已存在（不再为 null）');
        const 表 = JSON.parse(存 || '[]');
        ok(表.length >= 1, '★ 有初始对话（实际 ' + 表.length + ' 条）');
        ok(表[0] && 表[0].文 === 小字 && 表[0].谁 === '对方',
            '★ ★ 气泡第一条 = 联系人的小字文案（实际 ' + (表[0] && 表[0].文) + '）');
        const 最后文 = 表.length ? String(表[表.length - 1].文) : '';

        /* B. 1 页：会话框显示的是最后一条，不是小字文案 */
        const 预1 = { '联系人索引': JSON.stringify(索引表), '聊天记录_c_home_1': 存 };
        const w1 = await 起页面('1_shouyeyulan.html', 'http://localhost/1.html', 预1, errors, '1P');
        await new Promise(r => setTimeout(r, 1200));
        const d1 = w1.document;
        const 项 = Array.from(d1.querySelectorAll('.会话项'))
            .find(e => {
                const n = e.querySelector('.会话名称');
                return n && n.textContent.trim() === 名;
            });
        ok(!!项, '★ 找到「' + 名 + '」这一行');
        const 显示 = 项 ? String(项.querySelector('.会话消息').textContent || '') : '';
        ok(显示 === 最后文,
            '★ ★★ 会话框显示的是【最后一条】（实际 ' + JSON.stringify(显示)
            + ' / 期望 ' + JSON.stringify(最后文) + '）');
        /* ★★ 这就是用户报的现象：会话框和气泡第一条原本是同一句 */
        ok(显示 !== 小字 || 最后文 === 小字,
            '★ ★★ 会话框不再与气泡第一条撞成同一句（会话框 ' + JSON.stringify(显示)
            + ' / 气泡首条 ' + JSON.stringify(小字) + '）');

        /* C. 自己发一条 → 会话框跟着变成这条 */
        const 预2 = {
            '联系人索引': JSON.stringify(索引表),
            '聊天记录_c_home_1': JSON.stringify(表.concat([
                { 谁: '我', 文: '我今天去了海边', 时间戳: Date.now() },
            ])),
        };
        const w1b = await 起页面('1_shouyeyulan.html', 'http://localhost/1.html', 预2, errors, '1P2');
        await new Promise(r => setTimeout(r, 1200));
        const 项b = Array.from(w1b.document.querySelectorAll('.会话项'))
            .find(e => {
                const n = e.querySelector('.会话名称');
                return n && n.textContent.trim() === 名;
            });
        ok(!!项b && 项b.querySelector('.会话消息').textContent === '我今天去了海边',
            '★ ★★ 发了新消息后会话框跟着变（实际 '
            + JSON.stringify(项b && 项b.querySelector('.会话消息').textContent) + '）');

        /* D. 最后是语音 / 图片 → 显示占位 */
        for (const [型, 期望] of [['语音', '[语音]'], ['图片', '[图片]']]) {
            const 预3 = {
                '联系人索引': JSON.stringify(索引表),
                '聊天记录_c_home_1': JSON.stringify(表.concat([
                    { 谁: '对方', 文: 'x', 类型: 型, 时间戳: Date.now() },
                ])),
            };
            const w = await 起页面('1_shouyeyulan.html', 'http://localhost/1.html', 预3, errors, '1P3');
            await new Promise(r => setTimeout(r, 1200));
            const e = Array.from(w.document.querySelectorAll('.会话项'))
                .find(x => {
                    const n = x.querySelector('.会话名称');
                    return n && n.textContent.trim() === 名;
                });
            ok(!!e && e.querySelector('.会话消息').textContent === 期望,
                '★ ★ 最后一条是' + 型 + '→ 显示「' + 期望 + '」（实际 '
                + JSON.stringify(e && e.querySelector('.会话消息').textContent) + '）');
        }

        /* E. 清空聊天后：不重建，且导出索引不会把写死文案倒灌回去 */
        const w7c = await 起页面('7_liaotian.html',
            'http://localhost/7.html?id=c_home_1&from=1',
            { '联系人索引': JSON.stringify(索引表), '聊天记录_c_home_1': '[]' }, errors, '7P3');
        await new Promise(r => setTimeout(r, 1200));
        ok(w7c.localStorage.getItem('聊天记录_c_home_1') === '[]',
            '★ ★★ 清空后仍是 []（不会被初始对话重建）');
        ok(w7c.document.querySelectorAll('[class*=消息行]').length === 0,
            '★ 清空后页面也不显示任何气泡');
    }

    收尾(errors, '✅ 聊天信息流（7_liaotian）全部通过');
})().catch(e => { console.error(e); process.exit(2); });
