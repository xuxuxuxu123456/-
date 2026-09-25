#!/usr/bin/env node
/* =============================================================================
 * 同步备份.js —— 把 备份.js 的内容重新内联进 23_beifen.html
 *
 * 【为什么需要它】（与 同步全局音乐.py 同一个道理）
 *   全站是离线单文件 H5，页面运行时不依赖任何外部 js —— 拷走单个 html 也能跑。
 *   代价是 备份.js 的代码会被复制进 html。直接改 html 里那份，源文件就漂移了。
 *
 *   所以约定：
 *     ★ 唯一源 = 备份.js（引擎逻辑只在这里改）
 *     ★ 改完跑一次：node 同步备份.js
 *     ★ 它按 <script id="备份引擎"> 这个锚点整段替换，不碰页面其它代码
 *
 *   ★ 本机没有可用的 Python（只有应用商店存根），所以这份同步脚本用 Node 写，
 *     与项目已有的 30 多个 verify_*.js 同一套运行时，不额外引入依赖。
 *
 *   顺带把 全局音乐.js 也内联进 23 页 —— 新页面同样需要跨页续播，
 *   否则在 4 页开始放音乐、切到备份页就断了。
 *
 * 【用法】
 *   node 同步备份.js            # 同步
 *   node 同步备份.js --check    # 只检查是否一致（不同步，退出码非 0 表示有漂移）
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const 目录 = __dirname;
const 只检查 = process.argv.includes('--check');

/* 目标页 → 要内联的块。
   锚点必须与 html 里的 <script id="..."> 完全对应（含缩进）。 */
const 任务 = [
    { 页: '23_beifen.html', 源: '备份.js', 锚: '    <script id="备份引擎">\n', 收: '    </script>\n' },
    { 页: '23_beifen.html', 源: '全局音乐.js', 锚: '    <script id="全局音乐">\n', 收: '    </script>\n' },
];

function 读(p) {
    return fs.readFileSync(p, 'utf8');
}

function 主() {
    const 漂移 = [];
    let 已同步 = 0;

    for (const 任 of 任务) {
        const 页路径 = path.join(目录, 任.页);
        const 源路径 = path.join(目录, 任.源);

        if (!fs.existsSync(页路径)) { 漂移.push([任.页, '页面不存在']); continue; }
        if (!fs.existsSync(源路径)) { 漂移.push([任.页, '源文件不存在：' + 任.源]); continue; }

        const 源 = 读(源路径);

        /* ★ 源里不能出现 </script —— 内联会把脚本块提前截断，
             后面的代码全跑到 HTML 里去。（与 同步全局音乐.py 同一道防线） */
        if (源.toLowerCase().includes('</script')) {
            漂移.push([任.页, 任.源 + ' 里出现了 </script，内联会截断脚本，先改掉再同步']);
            continue;
        }

        let s = 读(页路径);
        const 起 = s.indexOf(任.锚);
        if (起 < 0) { 漂移.push([任.页, '缺少内联块锚点 ' + 任.锚.trim()]); continue; }

        const 正文起 = 起 + 任.锚.length;
        const 止 = s.indexOf(任.收, 正文起);
        if (止 < 0) { 漂移.push([任.页, '内联块没有收尾 </script>：' + 任.源]); continue; }

        const 当前 = s.slice(正文起, 止);
        if (当前 === 源 + '\n' || 当前 === 源) continue;     // 已同步

        if (只检查) { 漂移.push([任.页, 任.源 + ' 内容与源文件不一致']); continue; }

        s = s.slice(0, 正文起) + 源 + s.slice(止);
        fs.writeFileSync(页路径, s, 'utf8');
        console.log('✓ 已同步:', 任.源, '→', 任.页);
        已同步++;
    }

    if (漂移.length) {
        漂移.forEach(([页, 因]) => console.log('×', 页, '——', 因));
        return 1;
    }

    if (只检查) console.log('✓ 全部内联副本都与源文件一致');
    else console.log(已同步 ? '✓ 同步完成（' + 已同步 + ' 处）' : '✓ 无需同步，已一致');
    return 0;
}

process.exit(主());
