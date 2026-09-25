/**
 * verify_music_resume.js —— 音乐跨页续播「不从头播放」专项回归
 *
 * 用户诉求：切换页面后播放进度和播放状态保持连续，不要从头开始。
 *
 * ★★ 根因（探针实测复现，不是猜的）
 *   目录候选是逐个试的：['1【音乐】/', '../1【音乐】/']。
 *   第一个找不到会触发 error → 换下一个 → 音频.load()。
 *   而 load() 会把 currentTime 归零，并【再次】触发 loadedmetadata。
 *   原来的恢复逻辑是一次性的：
 *     · 全局音乐.js：`if (已定位) return;`          ← 第二次被挡掉
 *     · 4 页播放器：`待恢复 = null;`（用一次就丢）   ← 第二次没了
 *   于是进度停在 0 → 听感正是「切个页面回来从头播了」。
 *
 *   ★ 这个坑最阴的地方：只在「html 与素材目录不在同一层」时才必然触发，
 *     开发时把 html 放在根目录试，一辈子也碰不到。
 *
 * 修法：把恢复逻辑改成【幂等】—— 只要「还没播起来」或「进度被 load() 清零
 * （< 1 秒）」就重新定位到目标秒；正常播放到一半绝不干扰。
 *
 * 覆盖
 *   [A] 全局音乐：换目录重 load 后，进度仍回到存档秒数（核心）
 *   [B] 全局音乐：正常播放中不误 seek（不会把进度抢回去）
 *   [C] 全局音乐：首次定位 + 调 play
 *   [D] 4 页：换目录后进度保持
 *   [E] 4 页：换歌 → 恢复目标作废（不会把新歌拖到旧进度）
 *   [F] 4 页：曲目 id 稳定（跨会话可定位，不再每次随机）
 *   [G] 4 页：seek 完成后进度继续推进 → 存档跟着走（不是写死值）
 *   [H] 幂等本身：重复 loadedmetadata 不会来回跳
 *
 * ★ 全部打桩：jsdom 没有真实媒体栈，play / paused / IndexedDB 都是桩。
 *
 * 用法：PAGES_DIR=/data/workspace/输入适配 node verify_music_resume.js
 */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, 'testkit.js'));
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();
const 等 = ms => new Promise(r => setTimeout(r, ms));

const 脚本源 = fs.readFileSync(path.join(__dirname, '全局音乐.js'), 'utf8');

/** 给 jsdom 打 audio 桩；拒=true 模拟自动播放被拦 */
function 打桩音频(w, 拒) {
    w.__播放次数 = 0;
    w.__定位序列 = [];
    w.HTMLMediaElement.prototype.play = function () {
        w.__播放次数++;
        w.__定位序列.push(Math.round((this.currentTime || 0) * 10) / 10);
        if (拒) return Promise.reject(new Error('NotAllowedError'));
        this.paused = false;
        this.dispatchEvent(new w.Event('play'));
        return Promise.resolve();
    };
    w.HTMLMediaElement.prototype.pause = function () { this.paused = true; this.dispatchEvent(new w.Event('pause')); };
    Object.defineProperty(w.HTMLMediaElement.prototype, 'paused', {
        configurable: true, get() { return this.__停 !== false; }, set(v) { this.__停 = !!v; },
    });
}

/** IndexedDB 桩 —— ★ 必须触发 事务.oncomplete，否则 读上传() 的 promise 永不 resolve */
function 装库(w) {
    w.indexedDB = {
        open() {
            const 请 = { result: null, onsuccess: null, onupgradeneeded: null, onerror: null };
            setTimeout(() => {
                请.result = {
                    objectStoreNames: { contains: () => true }, createObjectStore() {},
                    transaction() {
                        const 事 = { oncomplete: null, onerror: null, error: null };
                        事.objectStore = () => ({
                            getAll() { const r = { result: [] }; setTimeout(() => { if (事.oncomplete) 事.oncomplete(); }, 0); return r; },
                            get(id) { const r = { result: null }; setTimeout(() => { if (事.oncomplete) 事.oncomplete(); }, 0); return r; },
                            put(x) { const r = { result: x }; setTimeout(() => { if (事.oncomplete) 事.oncomplete(); }, 0); return r; },
                        });
                        setTimeout(() => { if (事.oncomplete) 事.oncomplete(); }, 0);
                        return 事;
                    },
                };
                if (请.onsuccess) 请.onsuccess();
            }, 0);
            return 请;
        },
    };
}

/** 由页面内容判断：4 页有 #音乐播放器（完整播放器），7 页没有（走全局续播器） */
const 存档 = (时间, 播放中, 名, id) => JSON.stringify({
    id: id || '默认_春日约会.mp3', 名: 名 || '春日约会.mp3', 类型: '默认', 时间: 时间, 播放中: 播放中 !== false,
});

(async function main() {

    console.log('[A] ★★ 全局音乐：换目录重 load 后，进度仍回到存档秒数（核心）');
    {
        const 数据 = { '音乐播放状态': 存档(42, true) };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html', 数据, errors, '音乐A',
            win => { 打桩音频(win, false); 装库(win); });
        await 等(500);
        const 音 = w.document.getElementById('全局音乐播放器');
        ok(!!音, '★ 建起了全局续播器');

        /* 第一次：正常加载 */
        Object.defineProperty(音, 'duration', { value: 180, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(150);
        ok(Math.abs((音.currentTime || 0) - 42) < 1, '★ 首次定位到 42 秒（实际 ' + 音.currentTime + '）');

        /* ★★ 换目录重试：error → load() → currentTime 归零 → 再次 loadedmetadata */
        音.currentTime = 0;                        // load() 的副作用，手动模拟
        音.dispatchEvent(new w.Event('error'));
        await 等(100);
        音.currentTime = 0;
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(150);

        ok(Math.abs((音.currentTime || 0) - 42) < 1,
            '★ ★ 换目录重 load 后仍回到 42 秒（实际 ' + (音.currentTime || 0) + '）'
            + ' —— 若这里是 0，就是「切页面从头播」');
    }

    console.log('\n[B] ★ 全局音乐：正常播放中不误 seek（不抢进度）');
    {
        const 数据 = { '音乐播放状态': 存档(42, true) };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html', 数据, errors, '音乐B',
            win => { 打桩音频(win, false); 装库(win); });
        await 等(500);
        const 音 = w.document.getElementById('全局音乐播放器');
        Object.defineProperty(音, 'duration', { value: 180, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(150);

        /* 播起来了：timeupdate 把 已起播 置位，并推进到 75 秒 */
        音.currentTime = 75;
        音.dispatchEvent(new w.Event('timeupdate'));
        await 等(80);
        /* 此时再来一次 durationchange（真实环境很常见） */
        音.dispatchEvent(new w.Event('durationchange'));
        await 等(120);
        ok(Math.abs((音.currentTime || 0) - 75) < 1,
            '★ ★ 播到 75 秒时不会被拉回 42（实际 ' + (音.currentTime || 0) + '）');
    }

    console.log('\n[C] ★ 全局音乐：首次定位 + 确实调了 play');
    {
        const 数据 = { '音乐播放状态': 存档(30, true) };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html', 数据, errors, '音乐C',
            win => { 打桩音频(win, false); 装库(win); });
        await 等(500);
        const 音 = w.document.getElementById('全局音乐播放器');
        Object.defineProperty(音, 'duration', { value: 200, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(200);
        ok(Math.abs((音.currentTime || 0) - 30) < 1, '★ 定位到 30 秒（实际 ' + 音.currentTime + '）');
        ok(w.__播放次数 >= 1, '★ 调了 play()（实际 ' + w.__播放次数 + ' 次）');
        ok(w.__定位序列.length && Math.abs(w.__定位序列[0] - 30) < 1,
            '★ ★ play 时已在 30 秒处，不是从头（实际序列 ' + JSON.stringify(w.__定位序列) + '）');
    }

    console.log('\n[D] ★★ 4 页：换目录后进度保持');
    {
        const 数据 = { '音乐播放状态': 存档(42, true) };
        const w = await 起页面('4_tongxun.html', 'http://localhost/4.html', 数据, errors, '音乐D',
            win => { 打桩音频(win, false); 装库(win); });
        await 等(700);
        const 音 = w.document.getElementById('音乐播放器');
        ok(!!音, '★ 找到 4 页播放器');
        ok(!!音.src, '★ 已载入曲目（src 非空）');

        Object.defineProperty(音, 'duration', { value: 180, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(150);
        ok(Math.abs((音.currentTime || 0) - 42) < 1, '★ 首次恢复 42 秒（实际 ' + 音.currentTime + '）');

        /* 换目录重试 */
        音.currentTime = 0;
        音.dispatchEvent(new w.Event('error'));
        await 等(100);
        音.currentTime = 0;
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(150);
        ok(Math.abs((音.currentTime || 0) - 42) < 1,
            '★ ★ 换目录后仍回到 42 秒（实际 ' + (音.currentTime || 0) + '）');
    }

    console.log('\n[E] ★ 4 页：换歌 → 恢复目标作废（不把新歌拖到旧进度）');
    {
        const 数据 = { '音乐播放状态': 存档(42, true) };
        const w = await 起页面('4_tongxun.html', 'http://localhost/4.html', 数据, errors, '音乐E',
            win => { 打桩音频(win, false); 装库(win); });
        await 等(700);
        const 音 = w.document.getElementById('音乐播放器');
        Object.defineProperty(音, 'duration', { value: 180, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(150);

        /* 点列表里的另一首（第 3 首）→ 应当从头，而不是跳到 42 */
        const 项 = w.document.querySelectorAll('.歌曲项');
        ok(项.length >= 3, '★ 列表渲染出 ' + 项.length + " 首");
        if (项.length >= 3) {
            项[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
            await 等(200);
            音.currentTime = 0;
            音.dispatchEvent(new w.Event('loadedmetadata'));
            await 等(150);
            ok((音.currentTime || 0) < 1,
                '★ ★ 切到第 3 首后是 0 秒，没被旧进度 42 拖走（实际 ' + (音.currentTime || 0) + '）');
        }
    }

    console.log('\n[F] ★ 4 页：曲目 id 稳定（跨会话可定位）');
    {
        const 源码 = 读('4_tongxun.html');
        /* 「音乐列表」追加项原来是 生成id() —— 每次刷新都是新随机值 */
        /* ★ 用全文匹配而不是「截取 320 字符」—— 那段前面有一段很长的原因注释，
             写死长度会在注释里就截断，抓不到真正的 push 那一行。 */
        const 段 = /if \(Array\.isArray\(存的\)\)\s*\{[\s\S]*?存的\.forEach\(项 => \{[\s\S]*?\}\);/.exec(源码);
        /* ★★ 必须剥注释：注释里会写「原来用 生成id()」当说明，
             不剥的话会把教学用的文字判成真调用（假阳性）。 */
        const 文 = 段 ? 段[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') : '';
        ok(!/生成id\(\)/.test(文), '★★ 列表曲目不再用随机的 生成id()（那会导致存档 id 永远匹配不上）');
        ok(/'列表_' \+ 名/.test(文), '★ 改用按名稳定的 id');
        /* 默认曲目与上传曲目的 id 本来就稳定，断言没被误改 */
        ok(/id: '默认_' \+ 名/.test(源码), '★ 默认曲目 id 仍按名稳定');
        ok(/id: 项\.id/.test(源码), '★ 上传曲目仍用 IndexedDB 里的原始 id');
    }

    console.log('\n[G] ★ 4 页：播起来后进度推进 → 存档跟着走');
    {
        const 数据 = { '音乐播放状态': 存档(42, true) };
        const w = await 起页面('4_tongxun.html', 'http://localhost/4.html', 数据, errors, '音乐G',
            win => { 打桩音频(win, false); 装库(win); });
        await 等(700);
        const 音 = w.document.getElementById('音乐播放器');
        Object.defineProperty(音, 'duration', { value: 180, configurable: true });
        音.dispatchEvent(new w.Event('loadedmetadata'));
        await 等(150);
        ok(w.__播放次数 >= 1, '★ 恢复时调了 play');

        /* 模拟播到 90 秒 */
        音.currentTime = 90;
        音.dispatchEvent(new w.Event('timeupdate'));
        await 等(1200);       // 等每秒的保存状态跑一次
        const 存 = JSON.parse(数据['音乐播放状态']);
        ok(Math.abs(存.时间 - 90) < 2, '★ 存档跟到 90 秒（实际 ' + 存.时间 + '）');
        ok(存.播放中 === true, '★ 播放中 仍为 true');
    }

    console.log('\n[H] ★ 幂等：重复 loadedmetadata 不会来回跳');
    {
        const 数据 = { '音乐播放状态': 存档(42, true) };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html', 数据, errors, '音乐H',
            win => { 打桩音频(win, false); 装库(win); });
        await 等(500);
        const 音 = w.document.getElementById('全局音乐播放器');
        Object.defineProperty(音, 'duration', { value: 180, configurable: true });
        for (let i = 0; i < 4; i++) {
            音.dispatchEvent(new w.Event('loadedmetadata'));
            await 等(60);
        }
        ok(Math.abs((音.currentTime || 0) - 42) < 1,
            '★ 连发 4 次仍稳定在 42 秒（实际 ' + (音.currentTime || 0) + '）');
    }

    收尾(errors, '✅ 音乐跨页续播（不从头播放）全部通过');
})().catch(e => { console.error('脚本异常:', e.message); console.error(e.stack); process.exit(2); });
