/**
 * verify_keyboard.js —— 软键盘适配（输入框不被输入法遮挡）专项验证
 *
 * 背景：全站 23 个页面都是「100dvh 固定容器 + 中间滚动区 + 底部固定区」，
 *       容器高度被 dvh 锁死，输入法弹出时 iOS 上容器纹丝不动 → 输入区被整个盖住。
 *       软键盘适配.js 用 visualViewport 把容器压进「真正看得见」的那块矩形。
 *
 * 覆盖：
 *   [A] 23 个页面都内联了模块，window.软键盘 可用（演示套件 2 页不在内）
 *   [B] ★★ iOS 场景：innerHeight 不变，仅 visualViewport.height 变小 → 容器跟着收缩
 *   [C] ★★ Android 场景：innerHeight 自己也会变小 → 靠「基准冻结」照样算得出键盘
 *       （这是最容易写错的一处：拿实时 innerHeight 去减会得 0，安卓就永远没效果）
 *   [D] ★ 收起：完整还原（height / minHeight / transform 清空 + class 摘掉）
 *   [E] ★ 假信号：地址栏收起那种 60px 波动不判为键盘，容器不动
 *   [F] ★ 焦点滚入可视：滚动区里的输入框被顶进可视区
 *   [G] ★ 不丢焦点：全过程 activeElement 不变
 *   [H] ★ 不整页滚：绝不用 window.scrollTo 补偿（那是抖动的根源）
 *   [I] ★ 底部常驻输入区：flex-shrink:0，容器收缩后必然留在底部（紧贴键盘上沿）
 *   [J] 防抖：同一高度连喂多次不重复生效；微小变化不写样式
 *   [K] 降级：没有 visualViewport 的老浏览器靠 window.innerHeight 也能工作
 *   [L] 让位 API：业务声明额外底部占用后，容器再让出对应高度
 *   [M] 幂等：反复弹出 / 收起不残留状态
 *
 * 用法：PAGES_DIR=/data/workspace/输入适配 node verify_keyboard.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));

/* 一台 iPhone 14 的尺寸：布局高 844，键盘约 320 → 可视区剩 524 */
const 布局高 = 844;
const 键盘高 = 320;
const 可视高 = 布局高 - 键盘高;      // 524

/** 有 .手机主题背景容器 的页面（演示套件 1_xiaoxi / 7_qunliao 排除） */
const 有容器的页 = [
    '10_lunbotu.html', '11_woderenshe.html', '12_zhuanzhang.html', '13_hongbao.html',
    '14_yuyintonghua.html', '15_tuku.html', '16_beibao.html', '17_faqiqunliao.html',
    '18_qunziliao.html', '19_wenbenAPI.html', '1_shouyeyulan.html', '20_tupianAPI.html',
    '21_yinpinAPI.html', '22_yuedu.html', '23_beifen.html', '2_haoyouxinxi.html',
    '3_YINSEAPI.html', '4_tongxun.html', '5_dongtai.html', '6_fabudongtai.html',
    '7_liaotian.html', '8_wode.html', '9_zhutishezhi.html',
];

/**
 * 在 beforeParse 里装好 visualViewport 桩。
 * ★ 必须早于页面脚本：模块加载时就把 window.visualViewport 抓进闭包了，
 *   页面跑完之后再补是补不上的。
 */
function 装vv桩(高, 偏) {
    return function (w) {
        const vv = {
            height: 高, offsetTop: 偏 || 0, width: 390, scale: 1,
            addEventListener() {}, removeEventListener() {},
        };
        Object.defineProperty(w, 'visualViewport', { value: vv, configurable: true, writable: true });
        try { Object.defineProperty(w, 'innerHeight', { value: 布局高, configurable: true, writable: true }); }
        catch (e) { w.innerHeight = 布局高; }
        /* 记录 window.scrollTo 是否被用过 —— 需求明确禁止整页滚动补偿 */
        w.__滚过 = 0;
        const 原 = w.scrollTo;
        w.scrollTo = function (...a) { w.__滚过++; return 原 ? 原.apply(w, a) : undefined; };
    };
}

/** 起一个带 vv 桩的页面 */
async function 起(文件, 高, 偏, 数据) {
    const w = await 起页面(文件, 'http://localhost/' + 文件, 数据 || {}, errors, '键盘', 装vv桩(高 == null ? 布局高 : 高, 偏 || 0));
    await 等(120);
    return w;
}

(async function main() {

    console.log('[A] ★ 23 个页面都内联了模块');
    {
        let 缺 = [];
        for (const 页 of 有容器的页) {
            const s = 读(页);
            if (!/<script id="软键盘适配">/.test(s)) 缺.push(页);
        }
        ok(缺.length === 0, '★ 全部页面都有内联块（缺：' + (缺.join('、') || '无') + '）');

        const w = await 起('7_liaotian.html');
        ok(!!w.软键盘, '★ window.软键盘 已挂上');
        ok(typeof w.软键盘.是否弹出 === 'function', '有 是否弹出()');
        ok(typeof w.软键盘.键盘高度 === 'function', '有 键盘高度()');
        ok(typeof w.软键盘.让位 === 'function', '有 让位()');
        ok(w.软键盘.是否弹出() === false, '初始状态：未弹出');

        /* 演示套件不受影响（脚本自动跳过，不报假警） */
        const s1 = 读('1_xiaoxi.html');
        ok(!/软键盘适配/.test(s1), '1_xiaoxi.html（演示套件）未被改动');
    }

    console.log('\n[B] ★★ iOS 场景：innerHeight 不变，只有 visualViewport 变小');
    {
        const w = await 起('7_liaotian.html');
        const 盒 = w.document.querySelector('.手机主题背景容器');
        ok(!!盒, '找到 .手机主题背景容器');
        ok(盒.style.height === '', '弹出前容器无内联高度（页面原本的样子）');

        /* iOS：布局高保持 844，可视区被键盘吃到 524 */
        w.软键盘._喂(可视高, 0, 布局高);

        ok(w.软键盘.是否弹出() === true, '★ 判定为键盘已弹出');
        ok(Math.round(w.软键盘.键盘高度()) === 键盘高,
            '★ 键盘高度算对 = ' + 键盘高 + '（实际 ' + Math.round(w.软键盘.键盘高度()) + '）');
        ok(盒.style.height === 可视高 + 'px',
            '★★ 容器被压到可视高度 ' + 可视高 + 'px（实际 ' + 盒.style.height + '）');
        ok(w.软键盘._容器高() === 可视高 + 'px', '_容器高() 与内联样式一致');
        ok(w.document.documentElement.classList.contains('软键盘已弹出'),
            '★ html 挂上「软键盘已弹出」');
        /* 底部输入区随之贴到键盘上沿 —— 这正是「不被遮挡」的落点 */
        const 底 = w.document.querySelector('.底部输入区');
        ok(!!底, '7 页有 .底部输入区');
    }

    console.log('\n[C] ★★ Android 场景：innerHeight 自己也变小（基准必须冻结）');
    {
        const w = await 起('7_liaotian.html');
        const 盒 = w.document.querySelector('.手机主题背景容器');

        /* Android resize：innerHeight 跟着缩到 524，此时基准须仍是冻结的 844 */
        try { Object.defineProperty(w, 'innerHeight', { value: 可视高, configurable: true, writable: true }); }
        catch (e) { w.innerHeight = 可视高; }
        w.软键盘._喂(可视高, 0, 布局高);

        ok(w.软键盘.是否弹出() === true,
            '★★ Android（innerHeight 也缩）同样判定为弹出');
        ok(Math.round(w.软键盘.键盘高度()) === 键盘高,
            '★★ 键盘高度仍是 ' + 键盘高 + '，没有因为 innerHeight 变小而算成 0'
            + '（实际 ' + Math.round(w.软键盘.键盘高度()) + '）');
        ok(盒.style.height === 可视高 + 'px',
            '★★ 容器同样压到 ' + 可视高 + 'px（实际 ' + 盒.style.height + '）');
    }

    console.log('\n[D] ★ 收起：完整还原，不留残余');
    {
        const w = await 起('7_liaotian.html');
        const 盒 = w.document.querySelector('.手机主题背景容器');
        w.软键盘._喂(可视高, 0, 布局高);
        ok(盒.style.height === 可视高 + 'px', '先弹出');

        w.软键盘._喂(布局高, 0);            // 键盘收起，可视区回到全高

        ok(w.软键盘.是否弹出() === false, '★ 状态回到未弹出');
        ok(盒.style.height === '', '★ height 已清空（实际 "' + 盒.style.height + '"）');
        ok(盒.style.minHeight === '', '★ minHeight 已清空');
        ok(!盒.style.transform, '★ transform 已清空');
        ok(!w.document.documentElement.classList.contains('软键盘已弹出'),
            '★ 「软键盘已弹出」class 已摘掉');
        /* 注入的样式块是幂等的：留着无害，收起时靠 class 失效 */
        ok(!!w.document.getElementById('软键盘适配样式'), '注入样式块存在（靠 class 控制生效）');
    }

    console.log('\n[E] ★ 假信号：地址栏收起那种小波动不判为键盘');
    {
        const w = await 起('7_liaotian.html');
        const 盒 = w.document.querySelector('.手机主题背景容器');
        /* 只缩了 60px（地址栏 / 工具栏那种），低于 80px 阈值 */
        w.软键盘._喂(布局高 - 60, 0, 布局高);
        ok(w.软键盘.是否弹出() === false, '★ 60px 波动不判为键盘（阈值 80）');
        ok(盒.style.height === '', '★ 容器没有被误压（实际 "' + 盒.style.height + '"）');
    }

    console.log('\n[F] ★ 焦点滚入可视：滚动区里的输入框被顶进可视区');
    {
        /* 2 页是表单页，输入框都在滚动区里 */
        const w = await 起('2_haoyouxinxi.html', 布局高, 0,
            { '联系人索引': JSON.stringify([{ id: 'c_1', 名称: '林彦', 备注: '', 头像: '', 消息: '', 时间: '' }]) });
        const 域 = w.document.getElementById('昵称输入');
        ok(!!域, '2 页有 #昵称输入');

        /* 打桩：滚动区真的能滚，输入框当前落在可视区下方 90px 处 */
        const 滚动区 = 域.closest('.手机界面内容') || w.document.querySelector('.手机界面内容');
        ok(!!滚动区, '找到滚动祖先');
        Object.defineProperty(滚动区, 'scrollHeight', { value: 1200, configurable: true });
        Object.defineProperty(滚动区, 'clientHeight', { value: 500, configurable: true });

        w.软键盘._喂(可视高, 0, 布局高);     // 键盘弹出
        域.focus();
        Object.defineProperty(域, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 560, bottom: 600, left: 0, right: 300, width: 300, height: 40 }),
        });
        w.软键盘._喂(可视高, 0, 布局高);     // 再算一次，触发校准

        /* 可视底 = 524，留 14px 余量 → 下界 510；元素 bottom 600 → 需上移 90 */
        ok(滚动区.scrollTop > 0,
            '★★ 滚动区被上移了（scrollTop = ' + 滚动区.scrollTop + '）');
        ok(Math.abs(滚动区.scrollTop - 90) <= 2,
            '★★ 上移量正确 = 90（实际 ' + 滚动区.scrollTop + '）');
        ok(w.__滚过 === 0, '★ 没有动过 window.scrollTo（不是整页补偿）');
    }

    console.log('\n[G] ★ 不丢焦点：全过程 activeElement 不变');
    {
        const w = await 起('2_haoyouxinxi.html', 布局高, 0,
            { '联系人索引': JSON.stringify([{ id: 'c_1', 名称: '林彦', 备注: '', 头像: '', 消息: '', 时间: '' }]) });
        const 域 = w.document.getElementById('昵称输入');
        域.focus();
        const 前 = w.document.activeElement;

        w.软键盘._喂(可视高, 0, 布局高);     // 弹
        w.软键盘._喂(布局高, 0);             // 收
        w.软键盘._喂(可视高, 0, 布局高);     // 再弹

        ok(w.document.activeElement === 前, '★ 焦点仍是同一个输入框');
        ok(w.document.activeElement === 域, '★ 焦点没有被挪走或清空');
    }

    console.log('\n[H] ★ 不整页滚：window.scrollTo 一次都没被调用');
    {
        const w = await 起('7_liaotian.html');
        w.软键盘._喂(可视高, 0, 布局高);
        w.软键盘._喂(布局高, 0);
        w.软键盘._喂(可视高, 60, 布局高);    // 还模拟一次页面被上推
        ok(w.__滚过 === 0, '★ window.scrollTo 调用次数 = 0（实际 ' + w.__滚过 + '）');

        /* iOS 上系统把 layout viewport 推走时，靠 transform 跟 offsetTop 归位 */
        const 盒 = w.document.querySelector('.手机主题背景容器');
        ok(/translateY\(60px\)/.test(盒.style.transform || ''),
            '★ 页面被上推 60px 时容器用 transform 跟随（实际 ' + 盒.style.transform + '）');
    }

    console.log('\n[I] ★ 底部常驻输入区：flex-shrink:0，容器收缩后留在底部');
    {
        const css = 读('7_liaotian.html');
        const 块 = (/\.底部输入区\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/flex-shrink:\s*0/.test(块), '★ .底部输入区 不参与压缩（容器变矮时它不会被挤没）');
        const 容器块 = (/\.手机主题背景容器\s*\{([\s\S]*?)\}/.exec(css) || [])[1] || '';
        ok(/flex-direction:\s*column/.test(容器块), '★ 容器是纵向 flex，输入区天然贴底');
    }

    console.log('\n[J] 防抖：同一高度连喂不重复生效');
    {
        const w = await 起('7_liaotian.html');
        const 盒 = w.document.querySelector('.手机主题背景容器');
        w.软键盘._喂(可视高, 0, 布局高);
        const 首 = 盒.style.height;
        /* 连续喂同一个高度：状态没变 + 变化 ≤ 2px → 直接返回，不重写样式 */
        w.软键盘._喂(可视高, 0, 布局高);
        w.软键盘._喂(可视高, 0, 布局高);
        ok(盒.style.height === 首, '★ 同一高度重复喂不产生变化');
        ok(w.软键盘.是否弹出() === true, '状态仍是弹出');
    }

    console.log('\n[K] 降级：没有 visualViewport 也能靠 innerHeight 工作');
    {
        /* beforeParse 只设 innerHeight，不设 visualViewport */
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html', {}, errors, '降级', win => {
            try { Object.defineProperty(win, 'innerHeight', { value: 布局高, configurable: true, writable: true }); }
            catch (e) { win.innerHeight = 布局高; }
            try { Object.defineProperty(win, 'visualViewport', { value: undefined, configurable: true, writable: true }); }
            catch (e) {}
        });
        await 等(120);
        ok(!!w.软键盘, '★ 无 visualViewport 时模块照常挂上');
        const 盒 = w.document.querySelector('.手机主题背景容器');

        /* 老安卓：键盘弹出 → innerHeight 变小 */
        w.软键盘._喂(可视高, 0, 布局高);
        ok(w.软键盘.是否弹出() === true, '★ ★ 降级路径同样判定为弹出');
        ok(盒.style.height === 可视高 + 'px',
            '★ 降级路径容器也压到 ' + 可视高 + 'px（实际 ' + 盒.style.height + '）');

        w.软键盘._喂(布局高, 0);
        ok(w.软键盘.是否弹出() === false, '★ 降级路径收起正常');
    }

    console.log('\n[L] 让位 API：业务声明额外底部占用');
    {
        const w = await 起('7_liaotian.html');
        const 盒 = w.document.querySelector('.手机主题背景容器');
        w.软键盘.让位(40);
        w.软键盘._喂(可视高, 0, 布局高);
        ok(盒.style.height === (可视高 - 40) + 'px',
            '★ 声明 40px 让位后容器再少 40（实际 ' + 盒.style.height + '）');
        w.软键盘.让位(0);
        w.软键盘._喂(可视高, 0, 布局高);
        ok(盒.style.height === 可视高 + 'px', '★ 让位归零后恢复');
    }

    console.log('\n[M] 幂等：反复弹出 / 收起不残留状态');
    {
        const w = await 起('7_liaotian.html');
        const 盒 = w.document.querySelector('.手机主题背景容器');
        for (let i = 0; i < 5; i++) {
            w.软键盘._喂(可视高, 0, 布局高);
            w.软键盘._喂(布局高, 0);
        }
        ok(盒.style.height === '', '★ 收起态收尾：height 为空（实际 "' + 盒.style.height + '"）');
        ok(!w.document.documentElement.classList.contains('软键盘已弹出'), '★ 收起态 class 已摘');
        ok(w.软键盘.是否弹出() === false, '★ 状态干净');

        w.软键盘._喂(可视高, 0, 布局高);
        ok(w.软键盘.是否弹出() === true, '★ 再弹仍正常');
        ok(Math.round(w.软键盘.键盘高度()) === 键盘高,
            '★ 反复弹收后键盘高度依然算对（基准没被污染）');
    }

    收尾(errors, '✓ 软键盘适配全部通过');
})();
