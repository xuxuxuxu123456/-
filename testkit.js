/**
 * testkit.js —— 验证脚本公共模块
 *
 * 7 份 verify_*.js 原先各自重复实现了 清理 / 造存储 / 跑N页 / 断言器，
 * 改一处要同步 7 份。这里统一收口：
 *   • 清理()     —— 屏蔽图片 / 音乐资源（jsdom 不加载，留着只产生噪音）
 *   • 造存储()   —— localStorage 桩，多页共享同一实例即天然模拟跨页同步
 *   • 造断言器() —— ok() + errors 收集
 *   • 起页面()   —— 起一个 JSDOM 页面并把报错接进 errors
 *   • 跑2页 / 跑3页 / 跑4页 —— 各页的标准启动姿势
 *
 * HTML 默认从 /data/inputs 读取（原件），可用环境变量 PAGES_DIR 覆盖。
 */
const fs = require('fs');
const path = require('path');

// jsdom 的落点随安装方式变：本地 node_modules / 全局 / npm 前缀被改过的自定义目录。
// 写死一个绝对路径会在换环境时炸（且报错信息只是 "Cannot find module"，很难定位），
// 这里按「本地 → 已知全局 → npm root -g 动态问」三级兜底。
let JSDOM;
(function 解析jsdom() {
    const 候选 = [
        'jsdom',
        path.join(__dirname, 'node_modules', 'jsdom'),
        '/usr/local/lib/node_modules/jsdom',
    ];
    // 第三级：问 npm 自己要全局根目录（npm prefix 被改过时才走得通）
    try {
        const 根 = require('child_process')
            .execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
            .trim();
        if (根) 候选.push(path.join(根, 'jsdom'));
    } catch (e) { /* 拿不到就跳过，还有前两级 */ }

    for (const p of 候选) {
        try { ({ JSDOM } = require(p)); return; } catch (e) { /* 换下一个 */ }
    }
    throw new Error(
        '找不到 jsdom。请先安装：npm install jsdom（或 npm install -g jsdom）\n' +
        '试过的路径：\n  ' + 候选.join('\n  '));
})();

const 页面目录 = process.env.PAGES_DIR || '/data/inputs';

/** 读取页面源码（默认取 /data/inputs 下的原件） */
function 读(文件名) {
    return fs.readFileSync(path.join(页面目录, 文件名), 'utf8');
}

/**
 * 屏蔽图片 / 音乐资源引用。
 * 原先 verify_elowen / verify_crop_preview 只清了「默认主题背景.png」，
 * 一旦开启 resources:'usable' 就会比别人先炸 —— 这里统一成严格清理。
 */
function 清理(html) {
    return html
        .replace(/src="2【图片】\/[^"]*"/g, 'src=""')
        .replace(/src="1【音乐】\/[^"]*"/g, 'src=""');
}

/** 最小可用的 localStorage 桩 */
function 造存储(数据) {
    return {
        getItem: k => (Object.prototype.hasOwnProperty.call(数据, k) ? 数据[k] : null),
        setItem: (k, v) => { 数据[k] = String(v); },
        removeItem: k => { delete 数据[k]; },
        clear: () => { for (const k in 数据) delete 数据[k]; },
        key: i => Object.keys(数据)[i] || null,
        get length() { return Object.keys(数据).length; },
    };
}

/** 断言器：ok() 打印 ✓/✗ 并收集失败项 */
function 造断言器() {
    const errors = [];
    const ok = (条件, 说明) => {
        if (条件) { console.log('  ✓ ' + 说明); return true; }
        errors.push(说明);
        console.log('  ✗ ' + 说明);
        return false;
    };
    return { ok, errors };
}

/**
 * 起一个页面，把 console.error 与 window.error 接进 errors。
 * 附加(w) 可选，用于额外打桩（如 crop_preview 的 FileReader / naturalWidth）。
 */
async function 起页面(文件名, url, 数据, errors, 标签 = '', 附加 = null) {
    const dom = new JSDOM(清理(读(文件名)), {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        url,
        beforeParse(w) {
            w.console.error = (...a) => errors.push(标签 + ' console.error ' + a.map(String).join(' '));
            w.addEventListener('error', e =>
                errors.push(标签 + ' window.error ' + ((e.error && e.error.message) || e.message)));
            Object.defineProperty(w, 'localStorage', { value: 造存储(数据), configurable: true });
            if (附加) 附加(w);
        },
    });
    await new Promise(r => dom.window.addEventListener('load', r));
    return dom.window;
}

/**
 * 跑 2_haoyouxinxi（好友信息表单），返回表单字段快照。
 * id 传 null 即 ?mode=new 新建模式。
 */
async function 跑2页(id, 昵称, 预置, errors, 等待 = 80) {
    const 数据 = Object.assign({
        '联系人索引': JSON.stringify([{
            id: id || 'c_default_1', 名称: 昵称 || '', 备注: '', 头像: '', 消息: '', 时间: '',
        }]),
    }, 预置 || {});

    const url = id
        ? 'http://localhost/2.html?id=' + encodeURIComponent(id) + '&mode=edit'
        : 'http://localhost/2.html?mode=new';

    const w = await 起页面('2_haoyouxinxi.html', url, 数据, errors, '2');
    await new Promise(r => setTimeout(r, 等待));

    const d = w.document;
    const 取 = i => (d.getElementById(i) || {}).value;
    return {
        标题: (d.getElementById('页面标题') || {}).textContent,
        昵称: 取('昵称输入'),
        生日: 取('生日显示框'),
        身高: 取('身高输入'),
        身份: 取('身份输入'),
        世界观: 取('世界观输入'),
        人物信息: 取('人物信息输入'),
        性别: (d.querySelector('input[name="性别"]:checked') || {}).value || '',
        性格标签: Array.from(d.querySelectorAll('#标签输入区 .标签'))
            .map(e => e.textContent.replace(/×|✕/g, '').trim()),
        人物属性选中: Array.from(d.querySelectorAll('#属性标签组 .属性标签.选中'))
            .map(e => e.textContent.trim()),
    };
}

/** 跑 3_YINSEAPI（音色配置），返回 window */
async function 跑3页(url, 数据, errors, 等待 = 60) {
    const w = await 起页面('3_YINSEAPI.html', url, 数据, errors, '3');
    await new Promise(r => setTimeout(r, 等待));
    return w;
}

/** 跑 4_tongxun（通讯录），返回迁移后的索引数组 */
async function 跑4页(初始索引, errors, 等待 = 60) {
    const 数据 = { '联系人索引': JSON.stringify(初始索引 || []) };
    await 起页面('4_tongxun.html', 'http://localhost/4.html', 数据, errors, '4');
    await new Promise(r => setTimeout(r, 等待));
    return JSON.parse(数据['联系人索引'] || '[]');
}

/**
 * 音色隔离回归哨兵（各角色脚本的 H 组共用）。
 * 上一版实现会让新建联系人顶着上一位的音色且显示「已启用」，
 * 用户点开关反而把它关掉 —— 这四条断言就是钉死这个回归。
 */
async function 音色隔离(errors, ok, 跑3页) {
    const A配置 = JSON.stringify({
        音色: 'A的专属音色', 自定义ID: 'A的专属音色', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: true,
    });
    const 数据 = { '音色配置_c_A': A配置, '音色配置': A配置 };

    // 1) 编辑 c_A：应正常载入自己的音色
    let w = await 跑3页('http://localhost/3.html?id=c_A', 数据, errors);
    ok(w.document.getElementById('自定义ID输入').value === 'A的专属音色', 'H1 编辑 c_A → 载入 A 自己的音色');
    ok(w.document.getElementById('顶部开关文字').textContent === '已启用', 'H1 编辑 c_A → 开关 = 已启用');

    // 2) 新建联系人：绝不能继承 A 的配置
    w = await 跑3页('http://localhost/3.html?mode=new', 数据, errors);
    const 初始开关 = w.document.getElementById('顶部开关文字').textContent;
    const 初始ID = w.document.getElementById('自定义ID输入').value;
    ok(初始开关 === '未启用', 'H2 新建 → 开关 = 未启用（不继承 A）实际=' + 初始开关);
    ok(初始ID === '', 'H2 新建 → 自定义ID 为空（不继承 A）实际="' + 初始ID + '"');

    // 3) 新建时点开关：语义必须是「开启」
    w.切换启用();
    await new Promise(r => setTimeout(r, 30));
    const 临时 = JSON.parse(数据['音色配置_临时'] || 'null');
    ok(临时 !== null && 临时.已启用 === true, 'H3 新建点开关 → 已启用 = true 实际=' + (临时 && 临时.已启用));
    ok(临时 !== null && 临时.自定义ID !== 'A的专属音色', 'H3 新建的临时键不含 A 的音色');

    // 4) 上一位联系人的配置不能被新建操作污染
    const A之后 = JSON.parse(数据['音色配置_c_A']);
    ok(A之后.已启用 === true && A之后.自定义ID === 'A的专属音色', 'H4 c_A 的音色配置未被新建操作污染');
}

/**
 * 收尾：分开统计「断言失败」与「页面真实报错」，有任一即 exit 1。
 */
function 收尾(errors, 成功标语) {
    console.log('\n--- 结果 ---');
    const real = errors.filter(e => /console\.error|window\.error|TypeError|ReferenceError|SyntaxError/i.test(e));
    console.log('功能性断言失败:', errors.length);
    console.log('控制台真实报错:', real.length);
    if (real.length) real.forEach(e => console.log('  ! ' + e));
    if (errors.length || real.length) {
        errors.forEach(e => console.log('  ✗ ' + e));
        process.exit(1);
    }
    if (成功标语) console.log(成功标语);
    process.exit(0);
}

module.exports = { 读, 清理, 造存储, 造断言器, 起页面, 跑2页, 跑3页, 跑4页, 音色隔离, 收尾, 页面目录 };
