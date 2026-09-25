/**
 * verify_woderenshe.js —— 11_woderenshe（我的人设）专项
 *
 * ★ 界面形态：两个视图，同页切换，不做页面跳转
 *     列表视图：横版人设卡（头像 / 昵称 / 生日 / 性别 / 身份 / 身高），
 *               卡片之间只用 1px 分割线，点整行进编辑视图
 *     编辑视图：昵称 / 生日 / 身高 / 性别 / 身份 / 人物信息 / 性格标签 /
 *               绑定 / 默认 / 头像
 *
 * ★ 全页无底框：卡片与表单区一律无 background / border / box-shadow /
 *   border-radius；输入框收成下划线。
 *   仅有的两个弹窗：生日日历、删除确认。
 *
 * 覆盖：
 *   [A] 页面能起来：两个视图都在，默认显示列表
 *   [B] ★ 无底框：卡片与编辑体都没有背景/边框/圆角/阴影
 *   [C] ★ 字段齐全（含新增的性别）
 *   [D] ★ 人设卡：六项信息都在卡上
 *   [E] ★ 点卡片 → 进编辑视图
 *   [F] ★ 新建 → 创建模式，取消不落盘 / 保存落盘 / 昵称空被拦
 *   [G] ★ 保存 / 退出（编辑模式）：保存走右上角，退出走返回
 *   [H] ★ 性别：三选一，选了要保存才生效
 *   [I] ★ 生日日历：弹出 + 年月快捷选择 + 本地时区不差一天
 *   [J] ★ 绑定联系人：勾选后保存才生效；一个联系人只跟一套
 *   [K] ★ 默认人设：开关后保存才生效
 *   [L] ★ 删除：卡上删除图标 → 确认框 → 确定才真删
 *   [M] ★ 换头像：点头像 → 来源面板 → 全屏裁剪弹窗 → 保存后落盘
 *   [Q] ★ 无底部取消/保存键：保存只在右上角，退出走返回
 *   [N] ★ 取人设(联系人id)：优先绑定，其次默认
 *   [O] 返回：?from=8 → 8 页；referrer 兜底；都没有 → 1 页
 *   [P] 8 页入口已指向 11 页
 *
 * 用法：PAGES_DIR=/data/workspace node verify_woderenshe.js
 */
const kit = require('./testkit.js');
const { 读, 造断言器, 起页面, 收尾 } = kit;
const { ok, errors } = 造断言器();

const 等 = ms => new Promise(r => setTimeout(r, ms));
const 关键 = ['昵称', '生日', '身高', '性别', '身份', '人物信息', '性格标签'];

/** 起页面；可选预置数据；补 canvas 桩 + referrer 桩 */
function 起(搜索, 数据, 来源页) {
    return 起页面('11_woderenshe.html', 'http://localhost/11.html' + (搜索 || ''),
        数据 || {}, errors, '11', w => {
            /* ★ jsdom 未装 canvas 包：getContext 只会抛 "Not implemented" 并返回
               null，裁剪导出会静默失败。这里给一个只吞调用的假 2d + 固定产物。 */
            const 原ctx = w.HTMLCanvasElement.prototype.getContext;
            w.HTMLCanvasElement.prototype.getContext = function (型) {
                if (型 === '2d') {
                    return {
                        transform() {}, drawImage() {}, save() {}, restore() {},
                        beginPath() {}, arc() {}, closePath() {}, clip() {},
                        set imageSmoothingQuality(v) {},
                    };
                }
                return 原ctx ? 原ctx.call(this, 型) : null;
            };
            w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AVATAR';
            if (来源页) {
                try {
                    Object.defineProperty(w.document, 'referrer',
                        { get: () => 'http://localhost/' + 来源页, configurable: true });
                } catch (e) {}
            }
            w.Element.prototype.scrollIntoView = function () {};
        });
}

const 联系人 = [
    { id: 'c_1', 名称: '埃洛温·影蚀', 备注: '', 头像: '圆形头像2.png', 消息: '', 时间: '' },
    { id: 'c_2', 名称: '陆沉渊', 备注: '', 头像: '圆形头像4.png', 消息: '', 时间: '' },
    { id: 'c_3', 名称: '白九霄', 备注: '', 头像: '圆形头像5.png', 消息: '', 时间: '' },
];

/** 当前在哪个视图 */
function 在列表(w) { return w.document.getElementById('列表视图').classList.contains('当前'); }
function 在编辑(w) { return w.document.getElementById('编辑视图').classList.contains('当前'); }

/** 点第 N 张卡进编辑 */
async function 进第N张(w, n) {
    const 卡 = w.document.querySelectorAll('.人设卡')[n];
    卡.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(50);
    return 卡.dataset.id;
}

async function 点新建(w) {
    w.document.getElementById('新建钮').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(50);
}

async function 改并失焦(w, id, 值) {
    const 框 = w.document.getElementById(id);
    框.value = 值;
    框.dispatchEvent(new w.FocusEvent('blur', { bubbles: false }));
    await 等(40);
}

/** 点右上角「保存」（底部已无保存键） */
async function 点保存(w) {
    w.document.getElementById('保存钮').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(60);
}

/** 退出编辑视图 = 点左上角返回（第一次可能只提示，隔久点要连点两次） */
/** 直接回列表（测试用：从编辑视图的返回键连点退出；无改动时一次即可） */
async function 回列表用(w) {
    w.document.getElementById('返回按钮').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(60);
    if (在编辑(w)) {
        w.document.getElementById('返回按钮').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(60);
    }
}

async function 点返回退出(w) {
    w.document.getElementById('返回按钮').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(60);
    if (在编辑(w)) {
        // 第一次被「改动未保存」拦住 → 再点一次
        w.document.getElementById('返回按钮').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(60);
    }
}

/** 走 UI 加一个性格标签 */
async function 加标签UI(w, 文本) {
    const 加 = w.document.querySelector('.标签加');
    if (!加) return false;
    加.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(20);
    const 入 = w.document.querySelector('.标签输入');
    if (!入) return false;
    入.value = 文本;
    入.dispatchEvent(new w.FocusEvent('blur', { bubbles: false }));
    await 等(30);
    return true;
}

/** 点某个性别 */
async function 点性别(w, 值) {
    const 项 = Array.from(w.document.querySelectorAll('.性别项')).find(b => b.dataset.值 === 值);
    if (!项) return false;
    项.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await 等(30);
    return true;
}

/**
 * 取某条 CSS 属性在规则块里的值（取不到返回 null）。
 * ★ 注意不能写 /background\s*:\s*(?!transparent)/ 这种：
 *   \s* 可以回溯到匹配 0 个空格，负向前瞻就失效了，
 *   `background: transparent` 会被误判成「有背景」。
 */
function 属性值(块, 属性) {
    const re = new RegExp('(?:^|[;{\\s])' + 属性 + '\\s*:\\s*([^;}]+)');
    const m = re.exec(块);
    return m ? m[1].trim() : null;
}

/** 「无底框」判定：这些属性的值只能是 transparent / none / 0 */
function 有底框(块) {
    const 判 = (名, 允许) => {
        const 值 = 属性值(块, 名);
        if (值 === null) return false;           // 没写 = 没有
        return !允许.some(a => 值 === a);
    };
    return 判('background', ['transparent', 'none'])
        || 判('background-color', ['transparent', 'none'])
        || 判('box-shadow', ['none'])
        || 判('border-radius', ['0', '0px'])
        || 判('backdrop-filter', ['none']);
}

(async function main() {
    const 源码 = 读('11_woderenshe.html');

    console.log('[A] 页面能起来：两个视图');
    const w = await 起('', {});
    await 等(150);
    const d = w.document;
    ok(!!d.getElementById('列表视图'), '存在列表视图');
    ok(!!d.getElementById('编辑视图'), '存在编辑视图');
    ok(在列表(w), '★ 默认停在列表视图');
    ok(!在编辑(w), '编辑视图未显示');
    ok(d.getElementById('空态').style.display !== 'none', '没有数据时显示空态');
    ok(d.querySelectorAll('.人设卡').length === 0, '没有卡片');

    console.log('\n[B] ★ 全页无底框');
    {
        // 卡片：一行 flex，只能有下边框（分割线），不能有背景/圆角/阴影
        const 卡块 = /\.人设卡\s*\{([^}]*)\}/.exec(源码);
        ok(!!卡块, '找到 .人设卡 样式');
        if (卡块) {
            const 体 = 卡块[1];
            ok(属性值(体, 'background') === 'transparent',
                '★ 人设卡 background 是 transparent（实际 ' + 属性值(体, 'background') + '）');
            ok(属性值(体, 'box-shadow') === null, '★ 人设卡无 box-shadow');
            ok(属性值(体, 'border-radius') === null, '★ 人设卡无 border-radius');
            ok(属性值(体, 'backdrop-filter') === null, '★ 人设卡无 backdrop-filter');
            ok(/border-bottom\s*:\s*1px/.test(体), '★ 人设卡有 1px 分割线（border-bottom）');
        }
        // 编辑体：不带任何装饰
        const 编块 = /\.编辑体\s*\{([^}]*)\}/.exec(源码);
        ok(!!编块, '找到 .编辑体 样式');
        if (编块) {
            ok(!有底框(编块[1]), '★ 编辑体无底框（实际 ' + 编块[1].trim().replace(/\s+/g, ' ') + '）');
        }
        // 输入框应为下划线风格：只有 border-bottom
        const 输块 = /\.下划线输入\s*\{([^}]*)\}/.exec(源码);
        ok(!!输块, '找到 .下划线输入 样式');
        if (输块) {
            const 体 = 输块[1];
            ok(属性值(体, 'border') === 'none', '★ 输入框无完整边框（实际 ' + 属性值(体, 'border') + '）');
            ok(/border-bottom\s*:\s*1px/.test(体), '★ 输入框只有下划线');
            ok(属性值(体, 'border-radius') === '0', '★ 输入框无圆角');
            ok(属性值(体, 'background') === 'transparent', '★ 输入框无背景');
        }

        // 绑定行、默认行：同样只能有分割线
        ['\.绑定行', '\.默认行'].forEach(名 => {
            const 块 = new RegExp(名 + '\\s*\\{([^}]*)\\}').exec(源码);
            if (块) {
                ok(!有底框(块[1]), '★ ' + 名 + ' 无底框（实际 ' + 块[1].trim().replace(/\s+/g, ' ') + '）');
            }
        });
    }

    console.log('\n[C] ★ 字段齐全（含新增的性别）');
    {
        const id表 = {
            '昵称': '昵称输入', '生日': '生日输入', '身高': '身高输入',
            '身份': '身份输入', '人物信息': '人物信息输入', '性别': '性别组',
            '性格标签': '标签区',
        };
        关键.forEach(名 => {
            ok(!!d.getElementById(id表[名]), '★ 存在「' + 名 + '」字段');
        });
        ok(/性别/.test(源码), '★ 数据里有性别字段');
    }

    console.log('\n[D] ★ 人设卡：六项信息都在卡上');
    let 甲ID = '', 乙ID = '';
    {
        const 共享 = { '联系人索引': JSON.stringify(联系人) };
        const w2 = await 起('', 共享);
        await 等(150);

        // 建第一套
        await 点新建(w2);
        ok(在编辑(w2), '★ 点「＋」进入编辑视图（创建模式）');
        await 改并失焦(w2, '昵称输入', '夜莺');
        await 改并失焦(w2, '身高输入', '168');
        await 改并失焦(w2, '身份输入', '同学');
        await 点性别(w2, '女');
        // 生日用日历
        w2.document.getElementById('生日输入').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
        await 等(40);
        const 十五 = Array.from(w2.document.querySelectorAll('.日历日:not(.空格)'))
            .find(b => b.dataset.日 === '15');
        十五.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
        await 等(30);
        w2.document.getElementById('日历确定').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
        await 等(40);
        await 点保存(w2);

        ok(在列表(w2), '★ 保存后自动回到列表视图');
        ok(w2.document.querySelectorAll('.人设卡').length === 1, '列表出现 1 张卡');

        const 卡 = w2.document.querySelectorAll('.人设卡')[0];
        甲ID = 卡.dataset.id;
        const 文 = 卡.textContent;
        ok(!!卡.querySelector('.卡头像'), '★ 卡上有头像位');
        /* ★ 没上传头像 → 不填默认素材：img 带 .空 且占位块显示 */
        ok(卡.querySelector('.卡头像').classList.contains('空')
            && 卡.querySelector('.卡空头像').classList.contains('显示'),
            '★ 未上传头像 → 卡片显示虚线圆占位（不填默认素材）');
        ok(!(卡.querySelector('.卡头像').getAttribute('src') || ''),
            '★ 占位时 img 无 src（实际 "' + (卡.querySelector('.卡头像').getAttribute('src') || '') + '"）');
        ok(/夜莺/.test(文), '★ 卡上有昵称（实际 ' + 文 + '）');
        ok(/\d{4}-\d{2}-15/.test(文), '★ 卡上有生日');
        ok(/女/.test(文), '★ 卡上有性别');
        ok(/同学/.test(文), '★ 卡上有身份');
        ok(/168/.test(文), '★ 卡上有身高');
        ok(/身高 168/.test(w2.document.querySelector('.卡元信息').textContent),
            '★ 元信息用「·」连成一行（实际 ' + w2.document.querySelector('.卡元信息').textContent + '）');
        ok(!!卡.querySelector('.卡删除'), '★ 卡上有删除图标');
        ok(/默认/.test(文), '第一套带「默认」徽标');
    }

    console.log('\n[E] ★ 点卡片 → 进编辑视图');
    {
        const w3 = await 起('', { '联系人索引': JSON.stringify(联系人),
            '人设列表': JSON.stringify([{ id: 'p_a', 昵称: '夜莺', 生日: '2001-08-15',
                性别: '女', 身高: '168', 身份: '同学', 人物信息: '话不多', 性格标签: [] }]) });
        await 等(150);
        ok(在列表(w3), '起点在列表');
        await 进第N张(w3, 0);
        ok(在编辑(w3), '★ 点卡片 → 进编辑视图');
        ok(!在列表(w3), '列表视图已隐藏');
        ok(w3.document.getElementById('昵称输入').value === '夜莺', '★ 表单带出该人设的昵称');
        ok(w3.document.getElementById('生日输入').value === '2001-08-15', '带出生日');
        ok(w3.document.getElementById('身高输入').value === '168', '带出身高');
        ok(w3.document.getElementById('身份输入').value === '同学', '带出身份');
        const 选中性别 = w3.document.querySelector('.性别项.选中');
        ok(!!选中性别 && 选中性别.dataset.值 === '女', '★ 性别回填为「女」');
    }

    console.log('\n[F] ★ 创建模式：取消不落盘 / 保存落盘 / 昵称空被拦');
    {
        const 共享F = { '联系人索引': '[]' };
        const wf = await 起('', 共享F);
        await 等(150);

        await 点新建(wf);
        ok(在编辑(wf), '进入创建模式');
        ok(wf.document.getElementById('昵称输入').value === '', '表单是空的');
        ok(/创建人设/.test(wf.document.getElementById('编辑标题').textContent),
            '★ 标题是「创建人设」（实际 ' + wf.document.getElementById('编辑标题').textContent + '）');

        // 昵称空 → 保存被拦
        await 点保存(wf);
        ok(!共享F['人设列表'], '★ 昵称空点保存 → 没落盘');
        ok(/请先填写昵称/.test(wf.document.getElementById('toast').textContent),
            '★ 提示「请先填写昵称」');

        // 填了再取消 → 不落盘，回列表
        await 改并失焦(wf, '昵称输入', '半途而废');
        await 改并失焦(wf, '身高输入', '180');
        await 点返回退出(wf);
        ok(!共享F['人设列表'], '★ 创建模式点返回退出 → 没有留下任何数据');
        ok(在列表(wf), '★ 取消后回到列表视图（退出创建界面）');

        // 再建一次，填好保存
        await 点新建(wf);
        await 改并失焦(wf, '昵称输入', '认真填的');
        await 点保存(wf);
        const 表 = JSON.parse(共享F['人设列表'] || '[]');
        ok(表.length === 1 && 表[0].昵称 === '认真填的', '★ 填好点保存 → 落盘（实际 ' + 表.length + ' 条）');
        ok(在列表(wf), '保存后回到列表');
        ok(wf.document.querySelectorAll('.人设卡').length === 1, '列表出现 1 张卡');
    }

    console.log('\n[G] ★ 保存 / 取消（编辑模式）');
    {
        const 共享G = { '联系人索引': '[]',
            '人设列表': JSON.stringify([{ id: 'p_g', 昵称: '原名', 生日: '', 性别: '',
                身高: '', 身份: '', 人物信息: '', 性格标签: [] }]) };
        const wg = await 起('', 共享G);
        await 等(150);
        await 进第N张(wg, 0);

        ok(!wg.document.getElementById('取消钮'), '★ 已删除底部「取消」键');
        const 保存键 = wg.document.getElementById('保存钮');
        ok(!!保存键, '★ 右上角有「保存」键');
        ok(!保存键.classList.contains('脏'), '刚进来没改动 → 保存键不是高亮态');

        await 改并失焦(wg, '昵称输入', '乱改的名字');
        ok(保存键.classList.contains('脏'), '★ 有改动 → 保存键亮起（红点 + 强调色）');
        await 改并失焦(wg, '身高输入', '999');
        ok(JSON.parse(共享G['人设列表'])[0].昵称 === '原名', '★ 改了没保存 → 磁盘不变');

        await 点返回退出(wg);
        ok(在列表(wg), '★ 点返回 → 退出编辑界面回列表');
        ok(JSON.parse(共享G['人设列表'])[0].昵称 === '原名', '★ 退出后磁盘仍是原名（改动已丢弃）');

        // 再进去改并保存
        await 进第N张(wg, 0);
        ok(wg.document.getElementById('昵称输入').value === '原名', '★ 再进去是原值（改动确实被丢弃了）');
        await 改并失焦(wg, '昵称输入', '改好了');
        await 改并失焦(wg, '身份输入', '同事');
        await 点保存(wg);
        const 表 = JSON.parse(共享G['人设列表']);
        ok(表[0].昵称 === '改好了' && 表[0].身份 === '同事', '★ 保存后落盘');
        ok(/改好了/.test(wg.document.querySelectorAll('.人设卡')[0].textContent),
            '★ 列表卡片已更新');
    }

    console.log('\n[H] ★ 性别：三选一，要保存才生效');
    {
        const 共享H = { '联系人索引': '[]',
            '人设列表': JSON.stringify([{ id: 'p_h', 昵称: '甲', 性别: '', 性格标签: [] }]) };
        const wh = await 起('', 共享H);
        await 等(150);
        await 进第N张(wh, 0);

        const 项们 = wh.document.querySelectorAll('.性别项');
        ok(项们.length === 3, '★ 三个性别选项（实际 ' + 项们.length + '）');
        ok(!wh.document.querySelector('.性别项.选中'), '初始没选');

        ok(await 点性别(wh, '男'), '点到「男」');
        ok(wh.document.querySelector('.性别项.选中').dataset.值 === '男', '★ 「男」变为选中');
        ok(wh.document.querySelectorAll('.性别项.选中').length === 1, '只有一个选中');
        ok(JSON.parse(共享H['人设列表'])[0].性别 !== '男', '★ 只选不保存 → 磁盘未变');

        await 点保存(wh);
        ok(JSON.parse(共享H['人设列表'])[0].性别 === '男', '★ 保存后性别落盘');
        ok(/男/.test(wh.document.querySelectorAll('.人设卡')[0].textContent), '★ 卡上显示性别「男」');

        // 改成其他
        await 进第N张(wh, 0);
        ok(wh.document.querySelector('.性别项.选中').dataset.值 === '男', '★ 再进去性别已回填');
        await 点性别(wh, '其他');
        await 点保存(wh);
        ok(JSON.parse(共享H['人设列表'])[0].性别 === '其他', '改为「其他」后落盘');
    }

    console.log('\n[I] ★ 生日日历：弹出 + 年月快捷选择 + 本地时区');
    {
        const wi = await 起('', { '联系人索引': '[]' });
        await 等(150);
        await 点新建(wi);

        wi.document.getElementById('生日输入').dispatchEvent(new wi.MouseEvent('click', { bubbles: true }));
        await 等(40);
        ok(wi.document.getElementById('日历遮罩').classList.contains('显示'), '★ 点生日 → 日历弹出');
        ok(wi.document.querySelectorAll('.日历日:not(.空格)').length >= 28, '渲染出当月日期');
        ok(!!wi.document.querySelector('.日历日.今天'), '今天有标记');

        // 点标题 → 年月选择
        const 原年月 = wi.document.getElementById('日历年月').textContent;
        wi.document.getElementById('日历年月').dispatchEvent(new wi.MouseEvent('click', { bubbles: true }));
        await 等(40);
        ok(wi.document.querySelector('.日历框').classList.contains('选模式'), '★ 点标题 → 进入年月选择');
        ok(wi.document.querySelectorAll('.日历年').length > 50, '★ 年份条可选（' + wi.document.querySelectorAll('.日历年').length + ' 个）');

        const 目标年 = Array.from(wi.document.querySelectorAll('.日历年')).find(b => b.dataset.年 === '2001');
        ok(!!目标年, '★ 能直接选 2001（不用点 300 次翻月）');
        目标年.dispatchEvent(new wi.MouseEvent('click', { bubbles: true }));
        await 等(30);
        const 八月 = Array.from(wi.document.querySelectorAll('.日历月')).find(b => b.dataset.月 === '7');
        八月.dispatchEvent(new wi.MouseEvent('click', { bubbles: true }));
        await 等(40);
        ok(wi.document.getElementById('日历年月').textContent === '2001 年 8 月',
            '★ 直接跳到 2001 年 8 月（实际 ' + wi.document.getElementById('日历年月').textContent + '）');

        const 十五 = Array.from(wi.document.querySelectorAll('.日历日:not(.空格)')).find(b => b.dataset.日 === '15');
        十五.dispatchEvent(new wi.MouseEvent('click', { bubbles: true }));
        await 等(30);
        const 选中 = wi.document.querySelector('.日历日.选中');
        ok(!!选中 && 选中.dataset.日 === '15', '★ 15 号选中');
        wi.document.getElementById('日历确定').dispatchEvent(new wi.MouseEvent('click', { bubbles: true }));
        await 等(40);
        ok(wi.document.getElementById('生日输入').value === '2001-08-15',
            '★ 生日 = 2001-08-15，本地时区不差一天（实际 ' + wi.document.getElementById('生日输入').value + '）');

        // 清除
        wi.document.getElementById('日历键').dispatchEvent(new wi.MouseEvent('click', { bubbles: true }));
        await 等(40);
        ok(wi.document.querySelector('.日历日.选中').dataset.日 === '15', '★ 再次打开预选了 15 号');
        wi.document.getElementById('日历清除').dispatchEvent(new wi.MouseEvent('click', { bubbles: true }));
        await 等(40);
        ok(wi.document.getElementById('生日输入').value === '', '★ 点清除 → 生日清空');
    }

    console.log('\n[J] ★ 绑定联系人：勾选后保存才生效');
    {
        const 共享J = { '联系人索引': JSON.stringify(联系人),
            '人设列表': JSON.stringify([
                { id: 'p_j1', 昵称: '甲', 性别: '', 性格标签: [] },
                { id: 'p_j2', 昵称: '乙', 性别: '', 性格标签: [] }]) };
        const wj = await 起('', 共享J);
        await 等(150);
        await 进第N张(wj, 0);

        const 行 = Array.from(wj.document.querySelectorAll('.绑定行'));
        ok(行.length === 3, '绑定区列出 3 位联系人（实际 ' + 行.length + '）');
        行[0].dispatchEvent(new wj.MouseEvent('click', { bubbles: true }));
        await 等(30);
        行[2].dispatchEvent(new wj.MouseEvent('click', { bubbles: true }));
        await 等(30);
        ok(行[0].classList.contains('选中'), '两行显示选中态');
        ok(!(共享J['人设绑定'] && JSON.parse(共享J['人设绑定'])['c_1']), '★ 只勾不保存 → 磁盘没绑定');

        await 点保存(wj);
        let 绑定 = JSON.parse(共享J['人设绑定'] || '{}');
        ok(绑定['c_1'] === 'p_j1' && 绑定['c_3'] === 'p_j1', '★ 保存后 c_1/c_3 都绑到甲');

        // 改绑到乙 → 甲身上的要摘掉
        await 进第N张(wj, 1);
        const 行2 = Array.from(wj.document.querySelectorAll('.绑定行'));
        const c1 = 行2.find(r => r.dataset.id === 'c_1');
        c1.dispatchEvent(new wj.MouseEvent('click', { bubbles: true }));
        await 等(30);
        await 点保存(wj);
        绑定 = JSON.parse(共享J['人设绑定']);
        ok(绑定['c_1'] === 'p_j2', '★ c_1 改绑到乙（实际 ' + 绑定['c_1'] + '）');
        const 甲还有 = Object.keys(绑定).filter(cid => 绑定[cid] === 'p_j1');
        ok(甲还有.join(',') === 'c_3', '★ 甲身上的 c_1 已摘掉，只剩 c_3（实际 ' + 甲还有.join(',') + '）');
        ok(/绑定 1/.test(wj.document.querySelectorAll('.人设卡')[0].textContent),
            '★ 甲卡上显示「绑定 1」');
    }

    console.log('\n[K] ★ 默认人设：开关后保存才生效');
    {
        const 共享K = { '联系人索引': '[]',
            '人设列表': JSON.stringify([
                { id: 'p_k1', 昵称: '甲', 性别: '', 性格标签: [] },
                { id: 'p_k2', 昵称: '乙', 性别: '', 性格标签: [] }]) };
        const wk = await 起('', 共享K);
        await 等(150);
        await 进第N张(wk, 1);
        const 开关 = wk.document.getElementById('默认开关');
        ok(!开关.classList.contains('开启'), '乙当前不是默认');
        开关.dispatchEvent(new wk.MouseEvent('click', { bubbles: true }));
        await 等(30);
        ok(开关.classList.contains('开启'), '开关视觉打开');
        ok(共享K['当前人设'] !== 'p_k2', '★ 只拨开关不保存 → 磁盘未变');

        await 点保存(wk);
        ok(共享K['当前人设'] === 'p_k2', '★ 保存后 → 默认 = 乙');
        ok(/默认/.test(wk.document.querySelectorAll('.人设卡')[1].textContent), '★ 乙卡带「默认」徽标');
        ok(!/默认/.test(wk.document.querySelectorAll('.人设卡')[0].textContent), '甲卡没有徽标');
    }

    console.log('\n[L] ★ 删除：卡上图标 → 确认框 → 确定才真删');
    {
        const 共享L = { '联系人索引': JSON.stringify(联系人),
            '人设列表': JSON.stringify([
                { id: 'p_l1', 昵称: '甲', 性别: '', 性格标签: [] },
                { id: 'p_l2', 昵称: '乙', 性别: '', 性格标签: [] }]),
            '当前人设': 'p_l2',
            '人设绑定': JSON.stringify({ 'c_1': 'p_l2' }) };
        const wl = await 起('', 共享L);
        await 等(150);

        const 卡2 = wl.document.querySelectorAll('.人设卡')[1];
        const 删 = 卡2.querySelector('.卡删除');
        ok(!!删, '★ 卡上有删除图标');

        删.dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
        await 等(60);
        const 遮 = wl.document.getElementById('询问遮罩');
        ok(遮.classList.contains('显示'), '★ 点删除图标 → 弹出确认框');
        ok(在列表(wl), '★ 点删除没有误触「进编辑」（stopPropagation 生效）');
        ok(/删除/.test(wl.document.getElementById('询问标题').textContent),
            '★ 标题是「删除「乙」？」（实际 ' + wl.document.getElementById('询问标题').textContent + '）');
        ok(/1 位联系人/.test(wl.document.getElementById('询问说明').textContent),
            '★ 说明里提示会解除 1 位绑定（实际 ' + wl.document.getElementById('询问说明').textContent + '）');
        ok(JSON.parse(共享L['人设列表']).length === 2, '★ 只弹框还没删（仍 2 套）');

        wl.document.getElementById('询问取消').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
        await 等(50);
        ok(!遮.classList.contains('显示'), '点取消 → 收起');
        ok(JSON.parse(共享L['人设列表']).length === 2, '★ 取消没有删除（仍 2 套）');

        wl.document.querySelectorAll('.人设卡')[1].querySelector('.卡删除')
            .dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
        await 等(60);
        wl.document.getElementById('询问确定').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
        await 等(80);
        const 表 = JSON.parse(共享L['人设列表']);
        ok(表.length === 1 && 表[0].id === 'p_l1', '★ 点确定才真删（剩 ' + 表.length + ' 套）');
        ok(!JSON.parse(共享L['人设绑定'])['c_1'], '★ 乙绑的 c_1 已解除');
        ok(!共享L['当前人设'], '★ 默认人设被删 → 已清空');
        ok(wl.document.querySelectorAll('.人设卡').length === 1, '列表只剩 1 张卡');
    }

    console.log('\n[M] 换头像：★ 全屏裁剪弹窗（与 1/2/8/9/10 页同款）+ 圆形导出 + 保存落盘');
    {
        const 共享M = { '联系人索引': '[]',
            '人设列表': JSON.stringify([{ id: 'p_m', 昵称: '甲', 性别: '', 性格标签: [] }]) };
        const wm = await 起('', 共享M);
        await 等(150);
        await 进第N张(wm, 0);

        ok(!wm.document.getElementById('选相册') && !wm.document.getElementById('去拍照'),
            '★ 已删除「从相册选择 / 拍照」两个常驻按钮');
        ok(!!wm.document.getElementById('头像大钮'), '★ 头像是可点的按钮');
        ok(!!wm.document.getElementById('来源遮罩'), '★ 存在来源面板');

        // 点头像 → 弹来源面板
        wm.document.getElementById('头像大钮').dispatchEvent(new wm.MouseEvent('click', { bubbles: true }));
        await 等(50);
        ok(wm.document.getElementById('来源遮罩').classList.contains('显示'),
            '★ 点头像 → 弹出来源面板');
        /* 本页比标准面板多一项「预选头像」（18 张内置素材），共四项 */
        ok(wm.document.querySelectorAll('.来源项').length === 4,
            '面板四项：拍摄 / 从手机相册选择 / 预选头像 / 取消');
        ok(!!wm.document.getElementById('来源预选'), '★ 存在「预选头像」入口');

        ok(wm.document.getElementById('相册输入').className.includes('视觉隐藏'),
            '相册输入用 .视觉隐藏（移动端 click 才有效）');
        ok(wm.document.getElementById('拍照输入').getAttribute('capture') === 'environment',
            '拍照输入带 capture="environment"');
        ok(wm.document.getElementById('拍照输入') !== wm.document.getElementById('相册输入'),
            '★ 拍照与相册是两个独立输入（capture 只加在拍照上）');

        // 点取消 → 收起
        wm.document.getElementById('来源取消').dispatchEvent(new wm.MouseEvent('click', { bubbles: true }));
        await 等(50);
        ok(!wm.document.getElementById('来源遮罩').classList.contains('显示'), '点取消 → 面板收起');
        ok(/\.裁剪视口\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/.test(源码), '裁剪取景框 1:1');
        ok(/\.裁剪视口\s*\{[^}]*border-radius:\s*50%/.test(源码), '★ 取景框是圆形（头像用）');
        ok(/笔\.arc\(/.test(源码) && /笔\.clip\(\)/.test(源码), '圆形路径裁剪导出');
        ok(/裁剪遮罩\.classList\.add\('显示'\)[\s\S]{0,200}?量视口/.test(源码),
            '★ 先显示再量尺寸（避免量到 0 → 图片缩成小点）');
        ok(/指针数/.test(源码), '有指针计数（避免平移与缩放打架）');

        /* ★ 弹窗形态与其他页一致：全屏遮罩 + 标题 + 圆形取景框 + 提示 + 按钮行。
           原先是内联在表单里的 .裁剪区，现已改为容器层的 .裁剪遮罩。 */
        ok(!/id="裁剪区"/.test(源码), '★ 已无内联 .裁剪区（改为全屏弹窗）');
        ok(!!wm.document.getElementById('裁剪遮罩'), '★ 存在全屏裁剪遮罩（#裁剪遮罩）');
        const 裁剪块 = /\.裁剪遮罩\s*\{([^}]*)\}/.exec(源码);
        ok(!!裁剪块 && /position:\s*absolute/.test(裁剪块[1]) && /inset:\s*0/.test(裁剪块[1]),
            '★ 裁剪遮罩全屏覆盖（position:absolute + inset:0）');
        ok(!!裁剪块 && /rgba\(20,\s*20,\s*24/.test(裁剪块[1]),
            '★ 遮罩底色与 1 / 2 / 8 / 9 / 10 页一致（rgba(20,20,24,...)）');
        ok(!!wm.document.querySelector('#裁剪遮罩 .裁剪标题'), '★ 有标题（拖动调整位置，双指缩放）');
        ok(!!wm.document.querySelector('#裁剪遮罩 .裁剪提示'), '★ 有底部说明文案');
        ok(!!wm.document.getElementById('裁剪取消') && !!wm.document.getElementById('裁剪确定'),
            '★ 有取消 / 使用 两个按钮');
        // 弹窗挂在容器层，不随编辑表单滚动
        const 遮罩父 = wm.document.getElementById('裁剪遮罩').parentElement;
        const 编辑父 = wm.document.getElementById('编辑视图').parentElement;
        ok(遮罩父 === 编辑父,
            '★ 弹窗挂在容器层（与两个视图同级，不随表单滚动）');

        wm.开裁剪('data:image/png;base64,XX', 1200, 1600);
        await 等(50);
        ok(wm.document.getElementById('裁剪遮罩').classList.contains('显示'), '★ 裁剪弹窗已展开');
        const t = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/
            .exec(wm.document.getElementById('裁剪图片').style.transform);
        ok(!!t, '已应用初始变换');
        if (t) {
            const 显宽 = 1200 * parseFloat(t[3]), 显高 = 1600 * parseFloat(t[3]);
            ok(显宽 > 200, '★ 图片未被缩成小点（宽 ' + 显宽.toFixed(1) + '）');
            ok(parseFloat(t[1]) <= 0 && parseFloat(t[1]) + 显宽 >= 240
                && parseFloat(t[2]) <= 0 && parseFloat(t[2]) + 显高 >= 240,
                '★ 渲染区完整覆盖 240×240 取景框');
        }
        wm.document.getElementById('裁剪确定').dispatchEvent(new wm.MouseEvent('click', { bubbles: true }));
        await 等(50);
        ok(!JSON.parse(共享M['人设列表'])[0].头像, '★ 裁好但未保存 → 磁盘头像为空');
        await 点保存(wm);
        ok(JSON.parse(共享M['人设列表'])[0].头像 === 'data:image/png;base64,AVATAR',
            '★ 保存后头像落盘');
    }

    console.log('\n[M2] ★ 人设头像不填默认素材（需用户自行上传）');
    {
        const 源码2 = 读('11_woderenshe.html');
        /* 只禁「代码里还在用」，注释里说明这件事是允许的（且是应该写的） */
        ok(!/const\s+默认头像/.test(源码2), '★ 已删除「默认头像」常量');
        ok(!/默认头像\s*;/.test(源码2) && !/\|\|\s*默认头像/.test(源码2),
            '★ 已无「头像 || 默认头像」这类兜底写法');
        // 主题背景脚本引用 2【图片】 是正常的（全站共用），禁的是头像类素材
        ok(!/圆形头像/.test(源码2.replace(/^[\s\S]*?<\/style>/, '') === ''
            ? 源码2 : 源码2.replace(/\/\*[^]*?\*\//g, '')),
            '★ 代码（除注释）已不再引用圆形头像素材');

        // 列表：两套人设，一套有头像一套没有
        const 共享2 = {
            '联系人索引': '[]',
            '人设列表': JSON.stringify([
                { id: 'p_有', 昵称: '有头像', 性别: '', 性格标签: [], 头像: 'data:image/png;base64,AAA' },
                { id: 'p_无', 昵称: '没头像', 性别: '', 性格标签: [], 头像: '' },
            ]),
        };
        const w2 = await 起('', 共享2);
        await 等(150);
        const 卡们 = w2.document.querySelectorAll('.人设卡');
        ok(卡们.length === 2, '渲染出 2 张卡');

        const 有 = 卡们[0], 无 = 卡们[1];
        ok(!有.querySelector('.卡头像').classList.contains('空')
            && !有.querySelector('.卡空头像').classList.contains('显示'),
            '★ 有头像 → 显示图片，占位收起');
        ok(无.querySelector('.卡头像').classList.contains('空')
            && 无.querySelector('.卡空头像').classList.contains('显示'),
            '★ 没头像 → 显示占位，img 收起');

        // 编辑视图：新建 + 已存的两套，逐一验证
        await 点新建(w2);
        await 等(60);
        ok(w2.document.getElementById('头像大').classList.contains('空')
            && w2.document.getElementById('头像空态').classList.contains('显示'),
            '★ 新建人设 → 头像是空态（不预填素材）');
        ok(/上传/.test(w2.document.getElementById('头像提示').textContent),
            '★ 提示文案为「点击上传头像」（实际 '
            + w2.document.getElementById('头像提示').textContent + '）');

        await 回列表用(w2);
        await 进第N张(w2, 1);                       // 第 2 套 = 没头像
        await 等(60);
        ok(w2.document.getElementById('头像空态').classList.contains('显示'),
            '★ 编辑「没头像」那套 → 仍是空态');
        ok(/上传/.test(w2.document.getElementById('头像提示').textContent),
            '★ 提示仍是「点击上传头像」');

        await 回列表用(w2);
        await 进第N张(w2, 0);                       // 第 1 套 = 有头像
        await 等(60);
        ok(!w2.document.getElementById('头像大').classList.contains('空')
            && !w2.document.getElementById('头像空态').classList.contains('显示'),
            '★ 编辑「有头像」那套 → 显示图片，空态收起');
        ok(/更换/.test(w2.document.getElementById('头像提示').textContent),
            '★ 有头像时提示改为「点击头像可更换」（实际 '
            + w2.document.getElementById('头像提示').textContent + '）');

        // ★ 换到上一套有头像的，再切到没头像的 —— 不能残留上一张
        await 回列表用(w2);
        await 进第N张(w2, 1);
        await 等(60);
        ok(!w2.document.getElementById('头像大').getAttribute('src'),
            '★★ 从有头像那套切到没头像那套 → img 的 src 已清空（不残留上一张脸）');
    }

    console.log('\n[M3] ★ 列表视图返回键：退出本页回 8_wode');
    {
        // 从 8 页进来（?from=8）
        const w = await 起('?from=8', { '联系人索引': '[]', '人设列表': '[]' });
        await 等(180);

        ok(w.document.getElementById('列表视图').classList.contains('当前'),
            '当前在列表视图');
        const 返回键 = w.document.getElementById('列表返回按钮');
        ok(!!返回键, '★ 列表视图顶栏有返回键（#列表返回按钮）');
        ok(!!返回键.querySelector('svg polyline'),
            '★ 返回键带左箭头图标');
        // 与加号键同排，且排在最左
        const 栏 = 返回键.parentElement;
        const 子们 = Array.from(栏.children).map(e => e.id || e.className);
        ok(子们[0] === '列表返回按钮',
            '★ 返回键排在最左（实际顺序 ' + 子们.join(' | ') + '）');
        ok(!!w.document.getElementById('新建钮'),
            '★ 加号键仍在（没有被返回键顶掉）');

        ok(w.取返回页() === '8_wode.html',
            '★ from=8 → 返回目标是 8_wode.html（实际 ' + w.取返回页() + '）');

        // 点它 → 触发退出（jsdom 测不到真跳转，看 window.最后跳转）
        返回键.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await 等(60);
        ok(w.最后跳转 === '8_wode.html',
            '★★ 点列表返回键 → 退出本页去 8_wode.html（实际 ' + w.最后跳转 + '）');
        ok(w.document.getElementById('列表视图').classList.contains('当前'),
            '★ 仍在列表视图（不是误触成「回列表」）');
    }
    {
        // 兜底：无 from 无 referrer 也回 8 页（本页唯一入口就是 8 页）
        const w0 = await 起('', { '联系人索引': '[]', '人设列表': '[]' });
        await 等(180);
        ok(w0.取返回页() === '8_wode.html',
            '★ 无 from 无 referrer → 兜底回 8_wode.html（实际 ' + w0.取返回页() + '）');
    }
    {
        // ★ 编辑视图里点返回仍然是「回列表」，不能一杆子退出本页
        const w2 = await 起('?from=8', {
            '联系人索引': '[]',
            '人设列表': JSON.stringify([{ id: 'p_x', 昵称: '甲', 性别: '', 性格标签: [] }]),
        });
        await 等(180);
        await 进第N张(w2, 0);
        await 等(60);
        ok(w2.document.getElementById('编辑视图').classList.contains('当前'), '已进入编辑视图');
        w2.点返回();
        await 等(80);
        ok(w2.document.getElementById('列表视图').classList.contains('当前'),
            '★ 编辑视图点返回 → 回列表（不直接退出本页）');
        ok(!w2.最后跳转, '★ 这一步没有跳页（最后跳转 = ' + w2.最后跳转 + '）');
    }

    console.log('\n[N] ★ 取人设(联系人id)：优先绑定，其次默认');
    {
        const 共享N = { '联系人索引': JSON.stringify(联系人),
            '人设列表': JSON.stringify([
                { id: 'p_n1', 昵称: '甲', 性别: '', 性格标签: [] },
                { id: 'p_n2', 昵称: '乙', 性别: '', 性格标签: [] }]),
            '人设绑定': JSON.stringify({ 'c_3': 'p_n1' }) };
        const wn = await 起('', 共享N);
        await 等(150);
        ok(wn.取人设('c_3').id === 'p_n1', '★ c_3 有绑定 → 取到甲');
        ok(wn.取人设('c_2') === null, 'c_2 没绑且无默认 → null');

        const 共享N2 = Object.assign({}, 共享N, { '当前人设': 'p_n2' });
        const wn2 = await 起('', 共享N2);
        await 等(150);
        ok(wn2.取人设('c_2').id === 'p_n2', '★ c_2 没绑 → 回落到默认');
        ok(wn2.取人设('c_3').id === 'p_n1', '★ c_3 有绑定 → 绑定优先于默认');
    }

    console.log('\n[O] 返回：?from=8 → 8 页；referrer 兜底；都没有 → 1 页');
    {
        const w8 = await 起('?from=8', {});
        await 等(150);
        ok(w8.取返回页() === '8_wode.html', '★ from=8 → 回 8_wode.html（实际 ' + w8.取返回页() + '）');

        const w5 = await 起('', {}, '8_wode.html');
        await 等(150);
        ok(w5.取返回页() === '8_wode.html', '★ referrer 兜底（实际 ' + w5.取返回页() + '）');

        const w0 = await 起('', {});
        await 等(150);
        /* ★ 兜底已从 1 页改为 8 页：本页唯一入口就是 8 页「我的人设」，
           直接打开（无 from、无 referrer）时回 1 页说不通。 */
        ok(w0.取返回页() === '8_wode.html', '★ 兜底 → 回 8_wode.html（实际 ' + w0.取返回页() + '）');

        // 编辑视图里点返回 = 回列表（而不是直接跳走）
        const 共享O = { '联系人索引': '[]',
            '人设列表': JSON.stringify([{ id: 'p_o', 昵称: '甲', 性别: '', 性格标签: [] }]) };
        const wo = await 起('', 共享O);
        await 等(150);
        await 进第N张(wo, 0);
        let 导航 = 0;
        try {
            Object.defineProperty(wo.location, 'href',
                { set() { 导航++; }, get() { return 'http://localhost/11.html'; }, configurable: true });
        } catch (e) {}
        wo.document.getElementById('返回按钮').dispatchEvent(new wo.MouseEvent('click', { bubbles: true }));
        await 等(50);
        ok(在列表(wo), '★ 编辑视图点返回 → 回到列表（不是跳走）');
        ok(导航 === 0, '★ 没有触发页面跳转（导航 ' + 导航 + ' 次）');
    }

    console.log('\n[Q] ★ 无底部取消/保存键；保存只在右上角');
    {
        const 共享Q = { '联系人索引': '[]',
            '人设列表': JSON.stringify([{ id: 'p_q', 昵称: '甲', 性别: '', 性格标签: [] }]) };
        const wq = await 起('', 共享Q);
        await 等(150);
        await 进第N张(wq, 0);

        ok(!wq.document.getElementById('取消钮'), '★ 没有底部「取消」键');
        ok(!wq.document.querySelector('.操作行'), '★ 没有底部操作行');
        ok(!/class="操作行"/.test(源码), '源码里没有 .操作行');
        ok(!/id="取消钮"/.test(源码), '源码里没有 取消钮');

        const 保存键 = wq.document.getElementById('保存钮');
        ok(!!保存键, '★ 右上角有保存键');
        // 保存键在顶栏里（不是表单底部）
        ok(保存键.closest('.顶部固定区') !== null, '★ 保存键位于顶部固定区');
        ok(保存键.closest('.编辑体') === null, '★ 保存键不在表单区里');

        // 创建模式下文案提示「保存新建」
        回列表用(wq);
        await 点新建(wq);
        ok(/保存新建/.test(wq.document.getElementById('保存钮').textContent),
            '★ 创建模式下保存键显示「保存新建」（实际 ' + wq.document.getElementById('保存钮').textContent + '）');
    }

    console.log('\n[R] ★ 删除确认弹窗：色调与其他界面一致');
    {
        const 遮块 = /\.询问遮罩\s*\{([^}]*)\}/.exec(源码);
        ok(!!遮块, '找到 .询问遮罩 样式');
        if (遮块) {
            const 遮值 = 属性值(遮块[1], 'background');
            /* 参考 2 页来源遮罩 rgba(16,16,24,0.45) / 日历遮罩 rgba(16,16,24,0.5)：
               用带蓝调的深灰而非纯黑，透明度 0.45~0.5 */
            ok(/^rgba\(16,\s*16,\s*24/.test(遮值 || ''),
                '★ 遮罩底色与 2 页一致（rgba(16,16,24,...)）（实际 ' + 遮值 + '）');
            const 透 = /rgba\(16,\s*16,\s*24,\s*([\d.]+)\)/.exec(遮值 || '');
            ok(!!透 && +透[1] >= 0.45 && +透[1] <= 0.55,
                '★ 遮罩透明度在 0.45~0.55（实际 ' + (透 ? 透[1] : '?') + '）');
        }
        const 框块 = /\.询问框\s*\{([^}]*)\}/.exec(源码);
        ok(!!框块, '找到 .询问框 样式');
        if (框块) {
            const 体 = 框块[1];
            const 底色 = 属性值(体, 'background');
            ok(/rgba\(252,\s*252,\s*254/.test(底色 || ''),
                '★ 面板底色与 2 页来源面板一致（rgba(252,252,254,...)）（实际 ' + 底色 + '）');
            ok(/border-radius/.test(体), '有圆角');
            ok(/rgba\(var\(--shade\)/.test(体), '★ 阴影用 --shade 变量（与其他页同）');
            ok(/inset/.test(体), '★ 带 inset 高光描边（与 2 页同款）');
            ok(/border\s*:\s*1px solid rgba\(var\(--panel\)/.test(体), '★ 描边用 --panel 变量');
        }
        // 入场动画：与 2 页一样是 transform 过渡
        ok(/\.询问遮罩\.显示\s+\.询问框\s*\{[^}]*transform/.test(源码),
            '★ 有 scale 入场动画（与 2 页日历弹窗同款）');
    }

    console.log('\n[P] 8 页入口已指向 11 页');
    {
        const 源码8 = 读('8_wode.html');
        ok(/'我的人设'\s*:\s*'11_woderenshe\.html\?from=8'/.test(源码8),
            '★ 8 页「我的人设」→ 11_woderenshe.html?from=8');
        ok(!/'我的人设'\s*:\s*'2_haoyouxinxi\.html/.test(源码8), '不再指向 2 页');
    }

    收尾(errors, '✅ 11 页「我的人设」（人设卡 · 无底框 · 顶栏保存 · 来源面板）全部通过');
})().catch(e => { console.error(e); process.exit(2); });
