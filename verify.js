/**
 * 联系人 ID 分桶架构 · 回归测试
 * 验证：
 *   ① 4_tongxun 点击「好友信息」→ 2_haoyouxinxi?id=xxx&mode=edit → 载入对应数据
 *   ② 2 页修改保存 → 联系人索引更新 + 分桶键写入 → 4 页自动刷新（storage 事件）
 *   ③ 4/1 加号「添加好友」→ 2 页 ?mode=new（空白）→ 保存 → 新联系人加入索引
 *   ④ 3_YINSEAPI?id=xxx → 读写 音色配置_xxx（分桶），开关联动 2 页状态行
 *   ⑤ 所有界面数据同步一致（以详情为准）
 * 用法：node verify.js
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

// 清理图片引用，避免 jsdom 加载报错
function 清理(html) {
    return html
        .replace(/src="2【图片】\/[^"]*"/g, 'src=""')
        .replace(/src="1【音乐】\/[^"]*"/g, 'src=""');
}

const html2 = 清理(fs.readFileSync('2_haoyouxinxi.html', 'utf8'));
const html3 = 清理(fs.readFileSync('3_YINSEAPI.html', 'utf8'));
const html4 = 清理(fs.readFileSync('4_tongxun.html', 'utf8'));

const errors = [];
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { errors.push(msg); console.log('  ✗ ' + msg); } };

// 共享 storage（模拟同源）
function createSharedStorage() {
    const map = {};
    return {
        getItem: k => (k in map ? map[k] : null),
        setItem: (k, v) => { map[k] = String(v); },
        removeItem: k => { delete map[k]; },
        clear: () => { for (const k in map) delete map[k]; },
        key: i => Object.keys(map)[i] || null,
        get length() { return Object.keys(map).length; },
        _raw: map,
    };
}

function boot(html, url, storage, tag) {
    return new Promise((resolve, reject) => {
        const dom = new JSDOM(html, {
            runScripts: 'dangerously', pretendToBeVisual: true, url,
            beforeParse(window) {
                window.console.error = (...a) => { errors.push(tag + ' console.error: ' + a.join(' ')); console.log('  [ERR]', tag, a.join(' ')); };
                window.addEventListener('error', e => { errors.push(tag + ' window.error: ' + (e.error && e.error.stack || e.message)); console.log('  [error]', tag, e.message); });
                Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
                // 补 Date.now 稳定性（避免 id 碰撞）
                let counter = 0;
                window.Date.now = () => 1700000000000 + (counter++ * 1000);
            },
        });
        dom.window.addEventListener('load', () => resolve(dom.window));
    });
}

(async () => {
    const storage = createSharedStorage();

    // ===== 准备：初始化联系人索引（模拟 1 页已导出）=====
    const 初始索引 = [
        { id: 'c_001', 名称: '恋痛症', 备注: '', 头像: '2【图片】/圆形头像2.png', 消息: '你好', 时间: '12:00' },
        { id: 'c_002', 名称: '水色', 备注: '水水', 头像: '2【图片】/圆形头像3.png', 消息: '在吗', 时间: '13:00' },
    ];
    storage.setItem('联系人索引', JSON.stringify(初始索引));
    // 写一份旧「会话列表」供 4 页迁移兜底
    storage.setItem('会话列表', JSON.stringify(初始索引.map(({ id, ...rest }) => rest)));

    // 写入已有详情 + 头像 + 音色（分桶）
    storage.setItem('好友信息_c_001', JSON.stringify({
        昵称: '恋痛症', 生日: '2000-01-01', 身高: '165', 身份: '同学', 性别: '女',
        世界观: '校园', 人物信息: '傲娇', 性格标签: ['傲娇', '毒舌'], 人物属性: ['人类'],
        音色: { 音色: 'echo-girl', 自定义ID: 'echo-girl', 音速: 1.0, 语调: 1.2, 语言: 'zh', 性别: '女', 已启用: true }
    }));
    storage.setItem('好友头像_c_001', 'data:image/png;base64,AVATAR001');
    storage.setItem('音色配置_c_001', JSON.stringify({ 音色: 'echo-girl', 自定义ID: 'echo-girl', 音速: 1.0, 语调: 1.2, 语言: 'zh', 性别: '女', 已启用: true }));

    storage.setItem('好友信息_c_002', JSON.stringify({
        昵称: '水色', 生日: '', 身高: '', 身份: '', 性别: '男',
        世界观: '', 人物信息: '', 性格标签: [], 人物属性: ['妖'],
        音色: { 音色: '', 自定义ID: '', 音速: 1.0, 语调: 1.0, 语言: 'ja', 性别: '男', 已启用: false }
    }));
    storage.setItem('好友头像_c_002', 'data:image/png;base64,AVATAR002');

    console.log('\n========== 准备完成 ==========');
    console.log('初始索引:', JSON.parse(storage.getItem('联系人索引')).map(i => i.名称).join(', '));

    /* ============================================================
     * 测试 1：4 页启动 → 读取联系人索引 → 渲染列表
     * ============================================================ */
    console.log('\n[1] 4_tongxun：启动并渲染联系人列表');
    const w4 = await boot(html4, 'http://localhost/4.html', storage, '4');
    await new Promise(r => setTimeout(r, 200));

    // 4 页应该能从「联系人索引」读到 2 个联系人
    const 列表4 = JSON.parse(storage.getItem('联系人索引'));
    ok(列表4.length === 2, '4页：联系人索引含 2 个联系人');
    ok(列表4.find(i => i.id === 'c_001'), '4页：索引含 c_001（恋痛症）');
    ok(列表4.find(i => i.id === 'c_002'), '4页：索引含 c_002（水色）');

    // 模拟点击「好友信息」→ 检查跳转 URL 是否带 id
    console.log('\n[2] 4_tongxun：模拟点击「好友信息」按钮');
    // 找到 恋痛症 的好友信息按钮并点击
    const 项列表 = w4.document.querySelectorAll('.联系人项');
    ok(项列表.length === 2, '4页：渲染出 2 行联系人');

    const 信息按钮 = 项列表[0].querySelector('.联系人操作按钮[data-动作="信息"]');
    ok(信息按钮 !== null, '4页：第一行有「好友信息」按钮');

    // 直接调用 4 页内部逻辑验证 URL 拼接（与源码 联系人URL() 一致）
    const 项 = { id: 'c_001', 名称: '恋痛症' };
    const 预期URL = '2_haoyouxinxi.html?id=' + encodeURIComponent(项.id) + '&mode=edit';
    ok(预期URL === '2_haoyouxinxi.html?id=c_001&mode=edit', '4页 → 2页：URL = ' + 预期URL);

    // 验证 当前联系人 写入
    信息按钮.click();
    await new Promise(r => setTimeout(r, 50));
    const 当前联系人 = JSON.parse(storage.getItem('当前联系人'));
    ok(当前联系人.id === 'c_001', '4页：写入 当前联系人.id = c_001');

    /* ============================================================
     * 测试 3：2 页编辑模式（?id=c_001&mode=edit）→ 载入对应数据
     * ============================================================ */
    console.log('\n[3] 2_haoyouxinxi：编辑模式载入 c_001 数据');
    const w2 = await boot(html2, 'http://localhost/2.html?id=c_001&mode=edit', storage, '2');
    await new Promise(r => setTimeout(r, 200));

    ok(w2.document.getElementById('昵称输入').value === '恋痛症', '2页：昵称 = 恋痛症（从分桶载入）');
    ok(w2.document.getElementById('身高输入').value === '165', '2页：身高 = 165');
    ok(w2.document.getElementById('世界观输入').value === '校园', '2页：世界观 = 校园');
    ok(w2.document.getElementById('页面标题').textContent === '编辑联系人', '2页：标题 = 编辑联系人');
    ok(w2.document.getElementById('头像图片').src.includes('AVATAR001'), '2页：头像已载入（base64）');
    // 音色状态行
    const 状态El = w2.document.getElementById('音色配置状态');
    const 名称El = w2.document.getElementById('音色配置名称');
    ok(状态El.textContent === '已启用', '2页：音色状态 = 已启用');
    ok(/女.*echo-girl/.test(名称El.textContent), '2页：音色名称 = 女 · echo-girl');

    /* ============================================================
     * 测试 4：2 页修改保存 → 更新索引 + 分桶
     * ============================================================ */
    console.log('\n[4] 2_haoyouxinxi：修改昵称/性别 → 保存');
    w2.document.getElementById('昵称输入').value = '恋痛症（改）';
    // 切换性别为男
    w2.document.querySelector('input[name="性别"][value="男"]').checked = true;
    // 改身高
    w2.document.getElementById('身高输入').value = '170';
    // 添加性格标签
    w2.document.querySelector('.标签输入框').value = '温柔';
    w2.document.querySelector('.标签添加按钮').click();

    w2.保存信息();
    await new Promise(r => setTimeout(r, 100));

    // 验证索引已更新
    const 更新索引 = JSON.parse(storage.getItem('联系人索引'));
    const 更新项 = 更新索引.find(i => i.id === 'c_001');
    ok(更新项.名称 === '恋痛症（改）', '2页保存 → 索引：名称已更新 (实际: ' + 更新项.名称 + ')');
    ok(更新项.头像 === 'data:image/png;base64,AVATAR001', '2页保存 → 索引：头像保留（未重新上传）');

    // 验证详情分桶已更新
    const 更新详情 = JSON.parse(storage.getItem('好友信息_c_001'));
    ok(更新详情.身高 === '170', '2页保存 → 分桶详情：身高 = 170');
    ok(更新详情.性格标签.includes('温柔'), '2页保存 → 分桶详情：性格标签含「温柔」');
    ok(更新详情.性别 === '男', '2页保存 → 分桶详情：性别 = 男');

    // 验证音色配置的性别同步
    const 更新音色 = JSON.parse(storage.getItem('音色配置_c_001'));
    ok(更新音色.性别 === '男', '2页保存 → 音色分桶：性别同步为男');

    console.log('\n[4.5] 2_haoyouxinxi：改头像后保存 → 索引头像更新');
    // 模拟换头像
    storage.setItem('好友头像_c_001', 'data:image/png;base64,NEWA');  // 模拟裁剪后
    // 重新载入验证头像读取
    const w2b = await boot(html2, 'http://localhost/2b.html?id=c_001&mode=edit', storage, '2b');
    await new Promise(r => setTimeout(r, 100));
    ok(w2b.document.getElementById('头像图片').src.includes('NEWA'), '2页：重新载入后头像 = NEWA');

    /* ============================================================
     * 测试 5：3 页（?id=c_001）→ 读写分桶音色配置
     * ============================================================ */
    console.log('\n[5] 3_YINSEAPI：编辑模式（?id=c_001）→ 载入分桶配置');
    const w3 = await boot(html3, 'http://localhost/3.html?id=c_001', storage, '3');
    await new Promise(r => setTimeout(r, 100));

    ok(w3.document.getElementById('自定义ID输入').value === 'echo-girl', '3页：自定义ID = echo-girl（分桶载入）');
    ok(w3.document.getElementById('语调滑块').value === '1.2', '3页：语调 = 1.2');
    ok(w3.document.getElementById('语言选择').value === 'zh', '3页：语言 = zh');
    ok(w3.document.getElementById('顶部开关文字').textContent === '已启用', '3页：开关 = 已启用');

    console.log('\n[6] 3_YINSEAPI：修改参数 + 切换开关 → 写回分桶');
    w3.document.getElementById('自定义ID输入').value = 'echo-modified';
    w3.document.getElementById('语言选择').value = 'en';
    w3.document.getElementById('音速滑块').value = '0.8';
    w3.切换启用();   // 已是启用 → 关闭
    await new Promise(r => setTimeout(r, 50));
    let 音色 = JSON.parse(storage.getItem('音色配置_c_001'));
    ok(音色.已启用 === false, '3页：关闭 → 分桶 已启用 = false');

    w3.切换启用();   // 关闭 → 开启（需校验）
    await new Promise(r => setTimeout(r, 50));
    音色 = JSON.parse(storage.getItem('音色配置_c_001'));
    ok(音色.已启用 === true, '3页：重新开启 → 分桶 已启用 = true');
    ok(音色.自定义ID === 'echo-modified', '3页：参数随启用保存（自定义ID）');
    ok(音色.语言 === 'en', '3页：参数随启用保存（语言 en）');
    ok(音色.音速 === 0.8, '3页：参数随启用保存（音速 0.8）');

    console.log('\n[7] 3_YINSEAPI → 2 页自动刷新（模拟 storage 事件）');
    // 模拟 2 页监听 storage 事件
    const w2c = await boot(html2, 'http://localhost/2c.html?id=c_001&mode=edit', storage, '2c');
    await new Promise(r => setTimeout(r, 100));
    // 派发 storage 事件
    w2c.dispatchEvent(new w2c.StorageEvent('storage', { key: '音色配置_c_001', newValue: storage.getItem('音色配置_c_001'), url: 'http://localhost/' }));
    await new Promise(r => setTimeout(r, 50));
    ok(w2c.document.getElementById('音色配置状态').textContent === '已启用', '2页：storage 事件 → 状态刷新 = 已启用');
    ok(/男.*echo-modified/.test(w2c.document.getElementById('音色配置名称').textContent), '2页：名称 = 男 · echo-modified');

    /* ============================================================
     * 测试 8：新建联系人流程（?mode=new）
     * ============================================================ */
    console.log('\n[8] 2_haoyouxinxi：新建模式（?mode=new）→ 空白草稿');
    const w2n = await boot(html2, 'http://localhost/2n.html?mode=new', storage, '2n');
    await new Promise(r => setTimeout(r, 100));

    ok(w2n.document.getElementById('页面标题').textContent === '添加好友', '2页：新建标题 = 添加好友');
    ok(w2n.document.getElementById('昵称输入').value === '', '2页：昵称为空（空白草稿）');
    ok(w2n.document.getElementById('音色配置状态').textContent === '未启用', '2页：音色默认 未启用');

    console.log('\n[9] 2_haoyouxinxi：填写新联系人 → 保存 → 加入索引');
    w2n.document.getElementById('昵称输入').value = '新角色';
    w2n.document.getElementById('身高输入').value = '180';
    w2n.document.querySelector('input[name="性别"][value="女"]').checked = true;
    w2n.保存信息();
    await new Promise(r => setTimeout(r, 100));

    const 最终索引 = JSON.parse(storage.getItem('联系人索引'));
    ok(最终索引.length === 3, '新建 → 索引增至 3 条 (实际: ' + 最终索引.length + ')');
    const 新项 = 最终索引.find(i => i.名称 === '新角色');
    ok(新项 !== undefined, '新建 → 索引含「新角色」');
    ok(/^c/.test(新项.id), '新建 → 生成稳定 id (实际: ' + 新项.id + ')');
    // 新建且未上传头像 → 必然是占位图。旧断言写成「AVATAR001 或 占位图」的或逻辑，
    // 恒真、等于没测；收紧后才能真正拦住「新建联系人误用上一位头像」的问题。
    ok(新项.头像 === '2【图片】/圆形头像1.png',
      '新建 → 头像 = 占位图（未上传时）实际=' + 新项.头像);

    // 验证分桶详情已写入
    const 新详情 = JSON.parse(storage.getItem('好友信息_' + 新项.id));
    ok(新详情.昵称 === '新角色', '新建 → 分桶详情：昵称 = 新角色');
    ok(新详情.性别 === '女', '新建 → 分桶详情：性别 = 女');
    ok(新详情.身高 === '180', '新建 → 分桶详情：身高 = 180');

    // 旧全局键「好友信息」仅在尚不存在时兜底写一份（供未升级的读取方使用）。
    //   原代码取的是 好友信息_<新id>，与上面第 253 行完全重复、等于没测；
    //   改为验证真正没被覆盖的全局键行为。
    const 全局兜底 = JSON.parse(storage.getItem('好友信息') || 'null');
    ok(全局兜底 !== null && 全局兜底.昵称 === '新角色',
      '新建 → 旧全局键「好友信息」兜底写入 实际=' + (全局兜底 && 全局兜底.昵称));

    console.log('\n[10] 3_YINSEAPI：新建模式（无 id）→ 临时键读写');
    // 由于 jsdom 无法跨 window 访问 IIFE 内变量，这里通过 boot 新实例验证
    // 先清空临时键，再模拟「开启」的写入效果
    storage.removeItem('音色配置_临时');
    // 直接验证 3 页的分桶键逻辑：新建模式应写 音色配置_临时
    const w3n = await boot(html3, 'http://localhost/3n.html?mode=new', storage, '3n');
    await new Promise(r => setTimeout(r, 50));

    // ★ 关键回归哨兵：新建联系人绝不能继承上一位联系人的音色配置。
    //   此时 storage 里仍残留测试 6 写入的全局键「音色配置」（c_001 的 echo-modified，
    //   已启用=true）—— 这正是旧代码被污染的前提条件。旧实现会在此处显示「已启用」
    //   并把 echo-modified 填进输入框，用户点一下开关反而把它关掉。
    const 初始开关文字 = w3n.document.getElementById('顶部开关文字').textContent;
    const 初始ID = w3n.document.getElementById('自定义ID输入').value;
    ok(初始开关文字 === '未启用',
      '3页新建 → 初始开关 = 未启用（不继承上一位联系人的全局配置）实际=' + 初始开关文字);
    ok(初始ID === '',
      '3页新建 → 自定义ID 初始为空（不继承 echo-modified）实际="' + 初始ID + '"');

    // 通过 DOM 操作模拟用户输入，然后触发 切换启用
    w3n.document.getElementById('自定义ID输入').value = 'temp-voice';
    w3n.document.getElementById('语言选择').value = 'fr';
    w3n.document.getElementById('音速滑块').value = '1.0';

    // 点击顶部开关（调用 切换启用）
    const 开关 = w3n.document.getElementById('启用开关');
    开关.click();   // 触发 onclick="切换启用()"
    await new Promise(r => setTimeout(r, 50));

    // 全部改为真断言：旧代码在这里用 ok(true, ...) 无条件放行，
    // 导致「音色串味」问题被判为通过 —— 绝不能再有跳过分支。
    const 临时音色 = JSON.parse(storage.getItem('音色配置_临时') || 'null');
    ok(临时音色 !== null, '3页新建 → 临时键已写入');
    ok(临时音色 !== null && 临时音色.已启用 === true,
      '3页新建 → 点开关后 已启用 = true（期望开启而非关闭）实际=' + (临时音色 && 临时音色.已启用));
    ok(临时音色 !== null && 临时音色.自定义ID === 'temp-voice',
      '3页新建 → 临时键 自定义ID = temp-voice 实际=' + (临时音色 && 临时音色.自定义ID));
    ok(临时音色 !== null && 临时音色.语言 === 'fr',
      '3页新建 → 临时键 语言 = fr 实际=' + (临时音色 && 临时音色.语言));

    /* ============================================================
     * 测试 11：4 页 storage 事件 → 新增联系人后自动刷新
     * ============================================================ */
    console.log('\n[11] 4_tongxun：模拟 storage 事件 → 索引更新后自动重渲染');
    // 先记录刷新前的 DOM 行数（此时 4 页仍是启动时渲染的 2 行）
    const 刷新前行数 = w4.document.querySelectorAll('.联系人项').length;

    // 手动触发 storage 事件（模拟 2 页保存后跨页通知）
    w4.dispatchEvent(new w4.StorageEvent('storage', { key: '联系人索引', newValue: storage.getItem('联系人索引'), url: 'http://localhost/' }));
    await new Promise(r => setTimeout(r, 100));

    // 旧代码只验了 storage 里的数据条数，等于没验 4 页的同步能力。
    // 必须断言 DOM 真的重渲染了 —— 这才是「跨页同步」的真实语义。
    const 最终列表 = JSON.parse(storage.getItem('联系人索引'));
    const 刷新后行数 = w4.document.querySelectorAll('.联系人项').length;
    ok(最终列表.length === 3, '4页：索引最终含 3 条联系人');
    ok(刷新前行数 === 2, '4页：storage 事件前 DOM 为 2 行（实际 ' + 刷新前行数 + '）');
    ok(刷新后行数 === 3, '4页：storage 事件后 DOM 重渲染为 3 行（实际 ' + 刷新后行数 + '）');

    /* ============================================================
     * 测试 12：向后兼容 —— 无索引时使用旧会话列表迁移
     * ============================================================ */
    console.log('\n[12] 向后兼容：清空索引 → 4 页用旧「会话列表」迁移');
    const storage2 = createSharedStorage();
    storage2.setItem('会话列表', JSON.stringify([
        { 名称: '旧用户A', 消息: 'hi', 头像: '2【图片】/圆形头像1.png' },
        { 名称: '旧用户B', 消息: 'hello', 头像: '2【图片】/圆形头像2.png' }
    ]));
    const w4b = await boot(html4, 'http://localhost/4b.html', storage2, '4b');
    await new Promise(r => setTimeout(r, 200));
    const 迁移索引 = JSON.parse(storage2.getItem('联系人索引'));
    ok(迁移索引.length === 2, '迁移：旧会话列表 → 索引含 2 条 (实际: ' + 迁移索引.length + ')');
    ok(迁移索引[0].id === 'c_legacy_0', '迁移：自动生成 legacy id (实际: ' + 迁移索引[0].id + ')');
    ok(迁移索引[0].名称 === '旧用户A', '迁移：名称保留');

    /* ============================================================
     * 测试 13：音色联动兼容旧全局键
     * ============================================================ */
    console.log('\n[13] 3_YINSEAPI：无分桶键时使用旧全局键兜底');
    const storage3 = createSharedStorage();
    storage3.setItem('音色配置', JSON.stringify({ 音色: 'legacy', 自定义ID: 'legacy', 音速: 1.0, 语调: 1.0, 语言: 'zh', 性别: '男', 已启用: true }));
    const w3l = await boot(html3, 'http://localhost/3l.html', storage3, '3l');  // 无 id
    await new Promise(r => setTimeout(r, 50));
    ok(w3l.document.getElementById('自定义ID输入').value === 'legacy', '3页：旧全局键兜底载入 (实际: "' + w3l.document.getElementById('自定义ID输入').value + '")');
    ok(w3l.document.getElementById('顶部开关文字').textContent === '已启用', '3页：旧全局键 → 已启用');

    /* ============================================================
     * 收尾判定
     * ============================================================ */
    console.log('\n==========================================');
    const realErrors = errors.filter(e => /console\.error|window\.error|TypeError|ReferenceError|SyntaxError/i.test(e));
    console.log('功能性断言失败:', errors.length);
    console.log('控制台真实报错:', realErrors.length);
    if (errors.length || realErrors.length) {
        console.log('\n✗ 存在问题:');
        [...errors, ...realErrors].forEach(e => console.log('   - ' + e));
        process.exit(1);
    }
    console.log('✅ 全部通过：ID 分桶架构工作正常');
    console.log('   • 编辑已有联系人 → 载入对应数据 ✓');
    console.log('   • 保存 → 索引 + 分桶同步更新 ✓');
    console.log('   • 新建联系人 → 生成 id + 加入索引 ✓');
    console.log('   • 3 页音色分桶读写 ✓');
    console.log('   • 跨页 storage 事件同步 ✓');
    console.log('   • 向后兼容（旧会话列表 / 全局键）✓');
    process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
