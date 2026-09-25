/**
 * verify_global_music.js —— 全局音乐（跨页续播）验证
 *
 * 背景：4_tongxun 的播放器一离开本页就断（HTML 真跳转，JS 上下文被销毁）。
 *       全局音乐.js 在每个页面挂一个无界面续播器，读存档接着播。
 *
 * 覆盖：
 *   ① 4 页（有 #音乐播放器）→ 全局脚本【完全让位】，不建第二个 audio（防双响）
 *   ② 其它页 + 存档「播放中」→ 建 audio、src 正确、跳回原秒数、调 play()
 *   ③ 存档「没在播」/ 无存档 → 什么都不建（不占资源、不出声）
 *   ④ 上传曲目 → 走 IndexedDB 拿 blob；库读不到时兜底到按文件名找
 *   ⑤ 离开页面 → 把最新进度写回存档，下一页才能接上
 *   ⑥ 播完 → 状态改成「没在播」，不会在下个页面又从头播一遍
 *   ⑦ 自动播放被拦 → 不抛错，改为等第一次手势补播
 *   ⑧ 所有页面都引了这个脚本
 *
 * 用法：PAGES_DIR=/data/workspace node verify_global_music.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 收尾 } = kit;
const { ok, errors } = 造断言器();
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const vm = require('vm');

/* ★ 脚本已【内联】进每个 html（页面运行时不依赖外部文件）。
   测试仍然要拿一份源码手动注入，所以从 html 里按 <script id="全局音乐"> 抽出来，
   这样测的就是页面真正跑的那段代码，不会出现「测的和跑的不是同一份」。 */
function 抽内联(页) {
    const 源 = 读(页);
    const 起 = 源.indexOf('<script id="全局音乐">');
    if (起 < 0) return null;
    const 正文起 = 起 + '<script id="全局音乐">'.length;
    const 止 = 源.indexOf('</script>', 正文起);
    return 止 < 0 ? null : 源.slice(正文起, 止);
}
const 脚本源 = 抽内联('7_liaotian.html');
ok(!!脚本源, '★ 能从 html 里抽出内联的全局音乐脚本');

const 页面们 = [
    '1_shouyeyulan.html', '2_haoyouxinxi.html', '3_YINSEAPI.html',
    '4_tongxun.html', '5_dongtai.html', '6_fabudongtai.html',
    '7_liaotian.html', '8_wode.html', '9_zhutishezhi.html',
    '10_lunbotu.html', '11_woderenshe.html',
    '12_zhuanzhang.html', '13_hongbao.html', '14_yuyintonghua.html',
];

/** 起一个页面（不自动跑全局音乐.js —— 由调用方决定何时注入） */
function 起页面(档, 数据) {
    let 源 = 读(档)
        .replace(/<script src="全局音乐\.js"><\/script>/g, '')   // 兼容外链写法
        .replace(/<script id="全局音乐">[\s\S]*?<\/script>/g, ''); // 剥掉内联副本
    源 = 源.replace(/src="2【图片】\/[^"]*"/g, 'src=""')
           .replace(/src="1【音乐】\/[^"]*"/g, 'src=""');
    const dom = new JSDOM(源, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'http://localhost/' + 档,
        beforeParse(w) {
            Object.defineProperty(w, 'localStorage', {
                value: {
                    getItem: k => (k in 数据 ? 数据[k] : null),
                    setItem: (k, v) => { 数据[k] = String(v); },
                    removeItem: k => { delete 数据[k]; },
                    clear() {}, key: () => null, get length() { return 0; },
                }, configurable: true,
            });
        },
    });
    return dom.window;
}

/** 给 jsdom 打上 audio 所需的桩：它没有真实媒体栈 */
function 打桩音频(w) {
    w.__播放次数 = 0;
    w.__播放被拒 = false;
    w.HTMLMediaElement.prototype.play = function () {
        w.__播放次数++;
        if (w.__播放被拒) return Promise.reject(new Error('NotAllowedError'));
        this.paused = false;
        // 手动派发 play / loadedmetadata，模拟浏览器行为
        this.dispatchEvent(new w.Event('play'));
        return Promise.resolve();
    };
    w.HTMLMediaElement.prototype.pause = function () {
        this.paused = true;
        this.dispatchEvent(new w.Event('pause'));
    };
    // jsdom 的 paused 是只读 getter，覆盖成可写属性
    Object.defineProperty(w.HTMLMediaElement.prototype, 'paused', {
        configurable: true, get() { return this.__停 !== false; }, set(v) { this.__停 = !!v; },
    });
}

/** 注入并执行全局音乐.js（模拟 <script src> 被加载） */
function 注入(w) {
    w.eval(脚本源);
}

const 等 = ms => new Promise(r => setTimeout(r, ms));

(async function main() {
    const 存 = (o) => ({ '音乐播放状态': JSON.stringify(o) });

    console.log('[A] ★ 所有页面都内联了全局音乐（且不依赖外部文件）');
    {
        for (const 页 of 页面们) {
            const 源 = 读(页);
            ok(/<script id="全局音乐">/.test(源), '★ ' + 页 + ' 内联了全局音乐脚本');
            ok(!/<script src="全局音乐\.js">/.test(源),
                '★ ' + 页 + ' 不再外链 全局音乐.js（单文件可独立运行）');
            /* ★★ 内联副本必须与源文件逐字一致 —— 14 份复制最容易出现的就是漂移 */
            ok(抽内联(页) === 脚本源,
                '★ ★ ' + 页 + ' 的内联副本与源文件一致（无漂移）');
        }
    }

    console.log('\n[B] ★★ 4 页让位：有 #音乐播放器 时绝不建第二个 audio');
    {
        const 数据 = 存({ id: '默认_草莓奶油.mp3', 名: '草莓奶油.mp3', 类型: '默认', 时间: 30, 播放中: true });
        const w = 起页面('4_tongxun.html', 数据);
        await 等(200);
        打桩音频(w);
        注入(w);
        await 等(200);
        ok(!!w.document.getElementById('音乐播放器'), '★ 4 页确实有自己的播放器');
        ok(w.全局音乐 === undefined || typeof w.__全局音乐 === 'object', '★ 全局脚本已加载');
        ok(w.__全局音乐.让位条件() === true, '★ 让位条件命中（检测到 #音乐播放器）');
        /* ★★ 关键：body 里不能多出 audio。两个 audio 同时出声是最难查的 bug */
        const 音们 = w.document.querySelectorAll('audio');
        ok(音们.length === 1, '★ ★ 4 页只有 1 个 audio（实际 ' + 音们.length + '）');
        ok(w.__播放次数 === 0, '★ 全局脚本没有调用 play（已让位，实际 ' + w.__播放次数 + '）');
    }

    console.log('\n[C] ★★ 其它页面：存档「播放中」→ 建 audio + 跳回原秒数 + 开播');
    {
        const 数据 = 存({ id: '默认_草莓奶油.mp3', 名: '草莓奶油.mp3', 类型: '默认', 时间: 42.5, 播放中: true });
        const w = 起页面('7_liaotian.html', 数据);
        await 等(200);
        打桩音频(w);
        注入(w);
        await 等(200);

        const 音 = w.document.getElementById(w.__全局音乐.元素id);
        ok(!!音, '★ 建了 audio（非 4 页该自己扛起来）');
        ok(!!音 && /1【音乐】\/草莓奶油\.mp3$/.test(decodeURI(音.getAttribute('src') || '')),
            '★ src 指向 1【音乐】/草莓奶油.mp3（实际 ' + (音 && 音.getAttribute('src')) + '）');

        // 手动触发 loadedmetadata，模拟元数据到位
        Object.defineProperty(音, 'duration', { value: 200, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(120);

        ok(Math.abs((音.currentTime || 0) - 42.5) < 0.5,
            '★ ★ 跳回了存档秒数 42.5（实际 ' + 音.currentTime + '）');
        ok(w.__播放次数 >= 1, '★ 调了 play()（实际 ' + w.__播放次数 + ' 次）');
    }

    console.log('\n[D] ★ 没在播 / 无存档 → 不建 audio、不出声');
    {
        // ① 存档存在但 播放中:false
        let 数据 = 存({ id: 'x', 名: '草莓奶油.mp3', 类型: '默认', 时间: 10, 播放中: false });
        let w = 起页面('5_dongtai.html', 数据);
        await 等(200); 打桩音频(w); 注入(w); await 等(200);
        ok(w.document.querySelectorAll('audio').length === 0, '★ 没在播 → 不建 audio');
        ok(w.__播放次数 === 0, '★ 没在播 → 不调用 play');

        // ② 压根没有存档
        w = 起页面('5_dongtai.html', {});
        await 等(200); 打桩音频(w); 注入(w); await 等(200);
        ok(w.document.querySelectorAll('audio').length === 0, '★ 无存档 → 不建 audio');

        // ③ 存档是坏 JSON（不能崩页面）
        w = 起页面('5_dongtai.html', { '音乐播放状态': '{坏了' });
        await 等(200); 打桩音频(w); 注入(w); await 等(200);
        ok(w.document.querySelectorAll('audio').length === 0, '★ 坏存档 → 不建 audio 也不崩');
    }

    console.log('\n[E] ★ 离开页面时把进度写回存档（下一页才能接上）');
    {
        const 数据 = 存({ id: '默认_春日约会.mp3', 名: '春日约会.mp3', 类型: '默认', 时间: 5, 播放中: true });
        const w = 起页面('8_wode.html', 数据);
        await 等(200); 打桩音频(w); 注入(w); await 等(200);
        const 音 = w.document.getElementById(w.__全局音乐.元素id);
        Object.defineProperty(音, 'duration', { value: 180, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(100);

        // 模拟播到 77 秒时切页面
        音.currentTime = 77;
        w.dispatchEvent(new w.Event('pagehide'));
        await 等(120);

        const 写回 = JSON.parse(数据['音乐播放状态'] || '{}');
        ok(Math.abs((写回.时间 || 0) - 77) < 0.5,
            '★ pagehide 时写入了最新进度 77（实际 ' + 写回.时间 + '）');
        ok(写回.播放中 === true, '★ 状态仍是「播放中」→ 下一页会接着播');
        ok(写回.名 === '春日约会.mp3', '★ 曲目信息一并带上（实际 ' + 写回.名 + '）');
    }

    console.log('\n[F] ★ 播完 → 改成「没在播」（不会在下个页面又从头来一遍）');
    {
        const 数据 = 存({ id: '默认_夏日气泡.mp3', 名: '夏日气泡.mp3', 类型: '默认', 时间: 100, 播放中: true });
        const w = 起页面('9_zhutishezhi.html', 数据);
        await 等(200); 打桩音频(w); 注入(w); await 等(200);
        const 音 = w.document.getElementById(w.__全局音乐.元素id);
        Object.defineProperty(音, 'duration', { value: 120, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(100);
        音.dispatchEvent(new w.Event('ended'));
        await 等(100);
        const 后 = JSON.parse(数据['音乐播放状态'] || '{}');
        ok(后.播放中 === false, '★ ended → 播放中 置为 false');
        ok(后.时间 === 0, '★ 时间归零（下次从开头开始，而不是接着尾巴）');
    }

    console.log('\n[G] ★★ 自动播放被拦：持续补播，直到成功才停（不能只试一次）');
    {
        const 数据 = 存({ id: 'x', 名: '草莓奶油.mp3', 类型: '默认', 时间: 8, 播放中: true });
        const w = 起页面('11_woderenshe.html', 数据);
        await 等(200);
        打桩音频(w);
        w.__播放被拒 = true;                 // 模拟浏览器拒绝自动播放
        注入(w);
        await 等(200);
        const 音 = w.document.getElementById(w.__全局音乐.元素id);
        Object.defineProperty(音, 'duration', { value: 100, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(150);
        ok(w.__播放次数 >= 1, '★ 被拒前确实尝试过 play');
        ok(w.__全局音乐.补播中() === true, '★ 进入补播态（监听已挂上）');

        /* ★★ 第一次手势【仍然被拒】→ 必须继续监听，不能放弃 */
        w.document.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
        await 等(120);
        ok(w.__全局音乐.补播中() === true,
            '★ ★ 第一次点击仍失败 → 仍在补播（once:true 会在这里永久哑掉）');

        /* 第二次手势成功 → 撤监听 */
        w.__播放被拒 = false;
        w.HTMLMediaElement.prototype.play = function () {
            w.__播放次数++;
            this.paused = false;
            this.dispatchEvent(new w.Event('play'));
            return Promise.resolve();
        };
        w.document.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
        await 等(150);
        ok(w.__全局音乐.补播中() === false, '★ ★ 补播成功 → 撤掉监听（不会一直挂着）');
        ok(w.__播放次数 >= 3, '★ 确实重试了多次（实际 ' + w.__播放次数 + ' 次）');
    }

    console.log('\n[G2] ★ 被拦时给用户可见提示（知道点一下就行）');
    {
        const 数据 = 存({ id: 'x', 名: '草莓奶油.mp3', 类型: '默认', 时间: 8, 播放中: true });
        const w = 起页面('5_dongtai.html', 数据);
        await 等(200);
        打桩音频(w);
        w.__播放被拒 = true;
        注入(w);
        await 等(200);
        const 音 = w.document.getElementById(w.__全局音乐.元素id);
        Object.defineProperty(音, 'duration', { value: 100, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(150);
        const 条 = w.document.getElementById('全局音乐提示');
        ok(!!条, '★ 显示了提示条');
        ok(!!条 && /继续播放/.test(条.textContent),
            '★ 提示文案说明要做什么（实际 ' + (条 && 条.textContent) + '）');
        /* ★ 用 style.xxx 语义化读取，不做字符串正则匹配：
             jsdom 会把 `position:fixed` 规范化成 `position: fixed`（多一个空格），
             按子串匹配会假失败。 */
        ok(!!条 && 条.style.position === 'fixed', '★ 提示是固定定位（不被页面滚动带走）');
        ok(!!条 && 条.style.zIndex === '99999', '★ 层级够高（不被页面元素盖住）');
        ok(!!条 && 条.style.pointerEvents === 'none',
            '★ 提示不拦点击（pointer-events:none，否则会挡住底下按钮）');

        // 播起来后提示要收掉
        w.__播放被拒 = false;
        w.HTMLMediaElement.prototype.play = function () {
            this.paused = false; this.dispatchEvent(new w.Event('play'));
            return Promise.resolve();
        };
        w.document.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(500);
        ok(!w.document.getElementById('全局音乐提示'), '★ 补播成功 → 提示自动收掉');
    }

    console.log('\n[H] ★ 上传曲目：走 IndexedDB；库不可用时兜底到按文件名找');
    {
        /* jsdom 没有 indexedDB → 读一条() 会返回 null → 应兜底到 1【音乐】/名 */
        const 数据 = 存({ id: 'q123', 名: '我的歌.mp3', 类型: '上传', 时间: 12, 播放中: true });
        const w = 起页面('5_dongtai.html', 数据);
        await 等(200); 打桩音频(w); 注入(w); await 等(250);
        const 音 = w.document.getElementById(w.__全局音乐.元素id);
        ok(!!音, '★ 上传曲目也建了 audio');
        const src = 音 ? decodeURI(音.getAttribute('src') || '') : '';
        ok(/1【音乐】\/我的歌\.mp3$/.test(src),
            '★ IndexedDB 不可用 → 兜底到 1【音乐】/我的歌.mp3（实际 ' + src + '）');
    }

    console.log('\n[I] ★ 目录回退：第一个候选失败 → 自动试 ../1【音乐】/');
    {
        const 数据 = 存({ id: 'x', 名: '草莓奶油.mp3', 类型: '默认', 时间: 3, 播放中: true });
        const w = 起页面('6_fabudongtai.html', 数据);
        await 等(200); 打桩音频(w); 注入(w); await 等(200);
        const 音 = w.document.getElementById(w.__全局音乐.元素id);
        const 首 = decodeURI(音.getAttribute('src') || '');
        ok(/^1【音乐】\//.test(首), '★ 先试 1【音乐】/（实际 ' + 首 + '）');
        音.dispatchEvent(new w.Event('error'));
        await 等(100);
        const 次 = decodeURI(音.getAttribute('src') || '');
        ok(/^\.\.\/1【音乐】\//.test(次), '★ 失败 → 回退 ../1【音乐】/（实际 ' + 次 + '）');
    }

    console.log('\n[J] ★★ 语音条 / 语音通话 出声时，背景音乐让位');
    {
        const 数据 = 存({ id: 'x', 名: '草莓奶油.mp3', 类型: '默认', 时间: 10, 播放中: true });
        const w = 起页面('7_liaotian.html', 数据);
        await 等(200);
        打桩音频(w);
        注入(w);
        await 等(200);
        const 音 = w.document.getElementById(w.__全局音乐.元素id);
        Object.defineProperty(音, 'duration', { value: 200, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(120);
        ok(音.paused === false, '★ 续播已开始（音乐在播）');

        /* ---- 语音条开始播 → 音乐暂停 ---- */
        w.全局音频.暂停('语音消息');
        await 等(60);
        ok(音.paused === true, '★ ★ 语音条出声 → 背景音乐暂停');
        ok(w.全局音频.占用中() === true, '★ 占用已登记');

        /* ---- 语音播完 → 音乐恢复 ---- */
        w.全局音频.恢复('语音消息');
        await 等(120);
        ok(音.paused === false, '★ ★ 语音播完 → 背景音乐恢复');
        ok(w.全局音频.占用中() === false, '★ 占用已清空');
    }

    console.log('\n[K] ★★ 重叠占用：语音播完但仍在通话 → 音乐不能放出来');
    {
        const 数据 = 存({ id: 'x', 名: '草莓奶油.mp3', 类型: '默认', 时间: 10, 播放中: true });
        const w = 起页面('5_dongtai.html', 数据);
        await 等(200);
        打桩音频(w);
        注入(w);
        await 等(200);
        const 音 = w.document.getElementById(w.__全局音乐.元素id);
        Object.defineProperty(音, 'duration', { value: 200, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(120);

        w.全局音频.暂停('语音通话');
        await 等(60);
        ok(音.paused === true, '★ 通话开始 → 音乐暂停');

        w.全局音频.暂停('语音消息');      // 通话中又播了条语音
        await 等(60);
        w.全局音频.恢复('语音消息');      // 语音先播完
        await 等(120);
        ok(音.paused === true,
            '★ ★ 语音已释放但通话还在 → 音乐【保持暂停】（布尔标记就会在这里放出来）');
        ok(w.全局音频.占用表().join() === '语音通话',
            '★ 剩余占用只有「语音通话」（实际 ' + w.全局音频.占用表().join() + '）');

        w.全局音频.恢复('语音通话');
        await 等(120);
        ok(音.paused === false, '★ 通话也结束 → 音乐才恢复');
    }

    console.log('\n[L] ★ 本来没在播 → 语音结束不该把音乐凭空启动');
    {
        const 数据 = {};                 // 无存档 → 不建 audio、不放音乐
        const w = 起页面('5_dongtai.html', 数据);
        await 等(200);
        打桩音频(w);
        注入(w);
        await 等(200);
        ok(w.document.querySelectorAll('audio').length === 0, '★ 本来就没在播');
        w.全局音频.暂停('语音消息');
        await 等(60);
        w.全局音频.恢复('语音消息');
        await 等(120);
        ok(w.document.querySelectorAll('audio').length === 0,
            '★ ★ 语音结束 → 没有凭空建 audio 放音乐');
        ok(w.全局音频.是否在播() === false, '★ 仍然没有声音在播');
    }

    console.log('\n[M] ★ 7 页语音条 & 14 页通话：源码里确实调了让位 API');
    {
        const 七页 = 读('7_liaotian.html');
        ok(/function 占音乐[\s\S]{0,200}全局音频\.暂停\('语音消息'\)/.test(七页),
            '★ 7 页有 占音乐() 调 全局音频.暂停(语音消息)');
        ok(/function 让音乐[\s\S]{0,200}全局音频\.恢复\('语音消息'\)/.test(七页),
            '★ 7 页有 让音乐() 调 全局音频.恢复(语音消息)');
        ok(/function 停播放\(\)[\s\S]{0,220}让音乐\(\)/.test(七页),
            '★ ★ 7 页 停播放()（播完/中止）里释放了占用');
        /* ★ 播放失败的路径也要放回来 —— 否则一次失败就把音乐永久停住 */
        ok(/p\.catch\(err =>[\s\S]{0,200}让音乐\(\)/.test(七页),
            '★ 7 页 play() 被拒时也释放占用（不会把音乐永久停住）');

        const 通话页 = 读('14_yuyintonghua.html');
        ok(/function 占音乐[\s\S]{0,200}全局音频\.暂停\('语音通话'\)/.test(通话页),
            '★ 14 页有 占音乐() 调 全局音频.暂停(语音通话)');
        ok(/function 让音乐[\s\S]{0,200}全局音频\.恢复\('语音通话'\)/.test(通话页),
            '★ 14 页有 让音乐() 调 全局音频.恢复(语音通话)');
        ok(/function 开通话[\s\S]{0,400}占音乐\(\)/.test(通话页),
            '★ ★ 14 页 开通话() 时占住音乐');
        ok(/function 收尾[\s\S]{0,300}让音乐\(\)/.test(通话页),
            '★ ★ 14 页 收尾()（挂断/返回退出）时释放');
        /* 异常退出兜底：系统返回手势直接杀页面也不能把音乐占死 */
        ok(/pagehide'?, 让音乐/.test(通话页), '★ 14 页 pagehide 兜底释放');
    }

    console.log('\n[N] ★ 4 页让位时 API 仍然可用（操作它自己的播放器）');
    {
        const 数据 = 存({ id: 'x', 名: '草莓奶油.mp3', 类型: '默认', 时间: 5, 播放中: true });
        const w = 起页面('4_tongxun.html', 数据);
        await 等(250);
        打桩音频(w);
        注入(w);
        await 等(200);
        ok(!!w.全局音频, '★ 4 页也让位后仍挂了 window.全局音频');
        const 四页音 = w.document.getElementById('音乐播放器');
        ok(!!四页音, '★ 能取到 4 页自己的播放器');
        w.全局音频.暂停('语音消息');
        await 等(60);
        ok(四页音.paused === true, '★ 让位时 API 操作的是 4 页播放器（暂停生效）');
        w.全局音频.恢复('语音消息');
        await 等(120);
        ok(w.全局音频.占用中() === false, '★ 占用已释放（不残留，免得永久停住）');
    }

    console.log('\n[O] ★★ 4 页 bug 回归：暂停后跳走，不能记成「播放中」');
    {
        const 四页 = 读('4_tongxun.html');
        /* ★★ 原来写的是 `播放中 === undefined` —— 但 pagehide 的监听器会把
             Event 对象当第一个参数传进来，`!!Event` = true：
             「暂停了音乐再跳走」也会记成播放中，下一个页面就自己响起来。 */
        /* 只匹配【代码】形态（带 ? 的三元），注释里那句带反引号的不算 */
        ok(!/播放中 === undefined \?/.test(四页),
            '★ ★ 代码里已不再用 `播放中 === undefined ?`（会被 Event 对象骗过）');
        ok(/typeof 播放中 !== 'boolean'/.test(四页),
            '★ 改为只认真正的布尔值 typeof 播放中 !== "boolean"');
        ok(/pagehide'?, 保存状态/.test(四页), '★ pagehide 仍挂着保存（跳转前落盘）');
    }

    收尾(errors, '✅ 全局音乐（跨页续播）全部通过');
})().catch(e => { console.error(e); process.exit(2); });
