/**
 * verify_permissions.js —— 权限记忆（首次申请，后续默认放行）
 *
 * 诉求：麦克风 / 相册 / 位置这三类权限，只在第一次真正申请；
 *       之后默认「已授权」，不再重复读取、不再重复打扰。
 *
 * 覆盖：
 *   [A] 统一约定：1 / 2 / 5 / 7 页用的是同一套键名前缀
 *   [B] ★ 位置（5 页）：首次定位 → 记标记 + 缓存坐标；刷新后直接用缓存，
 *                        不再调用 getCurrentPosition
 *   [C] ★ 位置：标记被清（用户在系统里关掉又重开）→ 会重新申请一次
 *   [D] ★ 麦克风（7 页）：首次成功后记标记
 *   [E] ★ 麦克风：已授权却仍失败 → 清标记 + 提示「已被关闭」（不假装成功）
 *   [F]   麦克风：未授权时失败 → 提示「被拒绝」，不写标记
 *   [G] ★ 相册 / 相机（1、2 页）：成功取到文件后才记标记；没取到不记
 *
 * 用法：node verify_permissions.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 前缀 = '已授权_';

/** 定位桩：统计 getCurrentPosition 的调用次数，可控成功 / 失败 */
function 打桩定位(w, 选项) {
    const 选 = 选项 || {};
    w.__定位次数 = 0;
    w.navigator.geolocation = {
        getCurrentPosition(完成, 失败) {
            w.__定位次数++;
            if (选.拒绝) {
                const e = new Error('denied');
                e.name = 'NotAllowedError';
                e.code = 1;
                失败(e);
                return;
            }
            完成({ coords: { latitude: 31.2304, longitude: 121.4737 } });
        },
    };
}

/** 麦克风桩：可控成功 / 失败 */
function 打桩麦克风(w, 选项) {
    const 选 = 选项 || {};
    w.__麦克风次数 = 0;
    const 轨 = { kind: 'audio', enabled: true, muted: false, readyState: 'live', stop() {} };
    w.navigator.mediaDevices = {
        getUserMedia: async () => {
            w.__麦克风次数++;
            if (选.拒绝) {
                const e = new Error('denied');
                e.name = 'NotAllowedError';
                throw e;
            }
            return { getTracks: () => [轨], getAudioTracks: () => [轨] };
        },
    };
    w.MediaRecorder = class {
        constructor() { this.mimeType = 'audio/webm'; }
        static isTypeSupported() { return true; }
        start() {
            if (this.ondataavailable) {
                this.ondataavailable({ data: new w.Blob([new Uint8Array(2048).fill(7)], { type: 'audio/webm' }) });
            }
        }
        stop() { if (this.onstop) this.onstop(); }
    };
    w.URL.createObjectURL = w.URL.createObjectURL || (() => 'blob:stub');
}

(async function main() {
    const css5 = 读('5_dongtai.html');
    const css7 = 读('7_liaotian.html');
    const css1 = 读('1_shouyeyulan.html');
    const css2 = 读('2_haoyouxinxi.html');

    console.log('[A] 统一约定：四处用同一套键名前缀');
    {
        ok(/权限前缀 = '已授权_'/.test(css5), '5 页用前缀「已授权_」');
        ok(/权限前缀 = '已授权_'/.test(css7), '7 页用前缀「已授权_」');
        ok(/权限前缀 = '已授权_'/.test(css1), '1 页用前缀「已授权_」');
        ok(/权限前缀 = '已授权_'/.test(css2), '2 页用前缀「已授权_」');
        ok(/改动请四处同步/.test(css5) && /改动请四处同步/.test(css7),
            '★ 注释标明「改动请四处同步」（避免各页跑偏）');
    }

    console.log('\n[B] ★ 位置：首次定位后记标记，刷新直接用缓存不再申请');
    let 首次数据 = null;
    {
        const 数据 = {};
        const w = await 起页面('5_dongtai.html', 'http://localhost/5.html', 数据, errors, '5', 打桩定位);
        await new Promise(r => setTimeout(r, 400));

        ok(w.__定位次数 === 1, '★ 首次进入 → 申请了 1 次定位（实际 ' + w.__定位次数 + ' 次）');
        ok(数据[前缀 + '位置'] === '1', '★ 首次成功后写入「已授权_位置」');

        const 位置 = JSON.parse(数据['已授权位置'] || 'null');
        ok(!!位置 && 位置.纬度 === 31.2304 && 位置.经度 === 121.4737,
            '★ 首次坐标已缓存（' + (位置 ? 位置.纬度 + ',' + 位置.经度 : '无') + '）');

        首次数据 = 数据;
    }
    {
        // 模拟刷新：带着上次的标记与坐标进来
        const 数据 = Object.assign({}, 首次数据);
        const w = await 起页面('5_dongtai.html', 'http://localhost/5.html', 数据, errors, '5', 打桩定位);
        await new Promise(r => setTimeout(r, 400));

        ok(w.__定位次数 === 0,
            '★★ 已授权过 → 一次都没再调用 getCurrentPosition（实际 ' + w.__定位次数 + ' 次）');
    }

    console.log('\n[C] ★ 位置：标记被清 → 会重新申请一次（不是永久假装成功）');
    {
        const 数据 = Object.assign({}, 首次数据);
        delete 数据[前缀 + '位置'];          // 用户在系统里关掉权限 / 清了数据
        const w = await 起页面('5_dongtai.html', 'http://localhost/5.html', 数据, errors, '5', 打桩定位);
        await new Promise(r => setTimeout(r, 400));

        ok(w.__定位次数 === 1, '★ 标记没了 → 重新申请 1 次（实际 ' + w.__定位次数 + ' 次）');
        ok(数据[前缀 + '位置'] === '1', '重新成功后又记上了');
    }

    console.log('\n[D] ★ 麦克风：首次成功后记标记');
    {
        const 数据 = { '联系人索引': JSON.stringify([{ id: 'c_x', 名称: '甲', 消息: '', 头像: '', 时间: '' }]) };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_x',
            数据, errors, '7', 打桩麦克风);
        await new Promise(r => setTimeout(r, 150));

        w.document.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 200));

        ok(w.__麦克风次数 === 1, '调用 getUserMedia 1 次（实际 ' + w.__麦克风次数 + '）');
        ok(数据[前缀 + '麦克风'] === '1', '★ 首次成功后写入「已授权_麦克风」');
        ok(w.是否录音中() === true, '已进入录音态');
    }

    console.log('\n[E] ★ 麦克风：已授权却仍失败 → 清标记 + 提示「已被关闭」');
    {
        const 数据 = {
            '联系人索引': JSON.stringify([{ id: 'c_x', 名称: '甲', 消息: '', 头像: '', 时间: '' }]),
        };
        数据[前缀 + '麦克风'] = '1';        // 之前授权过
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_x',
            数据, errors, '7', w2 => 打桩麦克风(w2, { 拒绝: true }));
        await new Promise(r => setTimeout(r, 150));

        w.document.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 200));

        ok(w.是否录音中() === false, '★ 失败 → 不进入录音态');
        ok(数据[前缀 + '麦克风'] === undefined,
            '★★ 已授权却失败 → 标记被清除（不把「假装成功」演下去）');
        const 提示文案 = w.document.getElementById('toast').textContent;
        ok(/已被关闭/.test(提示文案),
            '★ 提示区分「已被关闭」而非「被拒绝」（实际 "' + 提示文案 + '"）');
    }

    console.log('\n[F] 麦克风：首次就被拒 → 提示「被拒绝」，且不留标记');
    {
        const 数据 = { '联系人索引': JSON.stringify([{ id: 'c_x', 名称: '甲', 消息: '', 头像: '', 时间: '' }]) };
        const w = await 起页面('7_liaotian.html', 'http://localhost/7.html?id=c_x',
            数据, errors, '7', w2 => 打桩麦克风(w2, { 拒绝: true }));
        await new Promise(r => setTimeout(r, 150));

        w.document.getElementById('麦克风按钮').click();
        await new Promise(r => setTimeout(r, 200));

        ok(数据[前缀 + '麦克风'] === undefined, '★ 被拒 → 不写标记（失败不能记成成功）');
        const 提示文案 = w.document.getElementById('toast').textContent;
        ok(/被拒绝/.test(提示文案), '★ 提示是「被拒绝」（实际 "' + 提示文案 + '"）');
    }

    console.log('\n[G] ★ 相册 / 相机：成功取到文件才记标记');
    {
        // 1 页
        ok(/记住权限\(输入 === 拍照输入 \? '相机' : '相册'\)/.test(css1),
            '★ 1 页：区分记录「相册」与「相机」（拍照 vs 选图）');
        ok(/if \(文件\) 记住权限/.test(css1),
            '★ 1 页：只有真的取到文件才记（没取到不记）');

        // 2 页
        ok(/记住权限\(输入 === 拍照输入 \? '相机' : '相册'\)/.test(css2),
            '★ 2 页：区分记录「相册」与「相机」（拍照 vs 选图）');
        ok(/if \(file\) 记住权限/.test(css2),
            '★ 2 页：只有真的取到文件才记（没取到不记）');

        // 相册走系统选择器，Web 层没有授权 API —— 这点必须写在注释里，
        // 否则后人会以为这里有漏网的权限请求。
        ok(/Web 层\s*[\s\S]{0,60}没有可调用的\s*[\s\S]{0,20}授权 API/.test(css2) ||
            /没有可调用的/.test(css2),
            '★ 注释写明相册在 Web 层没有授权 API（不是漏做）');
    }

    收尾(errors, '✅ 权限记忆（首次申请，后续默认放行）全部通过');
})().catch(e => { console.error(e); process.exit(2); });
