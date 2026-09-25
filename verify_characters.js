/**
 * verify_characters.js —— 四个默认角色档案的统一验证
 *
 * 取代原先 4 份结构雷同的脚本：
 *   verify_baijiuxiao.js / verify_elowen.js / verify_luchenyuan.js / verify_linyan.js
 * 那份写法下，档案改一处要同步 4 份，且「跨角色互不干扰」只在白九霄那份里
 * 验得最全（其余只抽查 1–2 个邻居）。这里改成数据驱动，四角色同等待遇。
 *
 * 覆盖：
 *   A 源码级改名（4 页默认表 + 1 页会话列表都已换成新名）
 *   B 四条迁移映射一次性共存（旧名 → 新名，且不产生重复条目）
 *   C 编辑联系人 → 档案字段逐项载入
 *   D 各种真实 id 下都能命中（按昵称匹配，不依赖 id 形态）
 *   E 索引里仍是旧名（未迁移）时也能命中
 *   F 四角色互不干扰（一次把四份档案全查一遍，而非抽查邻居）
 *   G 空壳详情（只有昵称）仍被内置档案接管
 *   H 新建模式保持空白
 *   I 用户保存后以分桶为准（改动优先于内置档案）
 *   J 音色隔离回归哨兵
 *
 * 用法：node verify_characters.js
 */
const kit = require('./testkit.js');
const 角色表 = require('./角色档案.js');

const { 读, 造存储, 造断言器, 起页面, 跑2页, 跑3页, 跑4页, 音色隔离, 收尾 } = kit;
const { ok, errors } = 造断言器();

// 覆盖 1 页导出 / 旧数据迁移 / 内置默认 / 随机新建 四类 id 形态
const 各类id = ['c_home_0', 'c_legacy_0', 'c_default_2', 'cx_ab12cd'];

(async function main() {
    console.log('[A] 源码级改名：旧昵称已下线');
    {
        const s4 = 读('4_tongxun.html');
        const s1 = 读('1_shouyeyulan.html');
        角色表.forEach(r => {
            ok(!new RegExp("名称:\\s*'" + r.旧名 + "'").test(s4), `4页默认表已无「${r.旧名}」`);
            ok(new RegExp("名称:\\s*'" + r.名 + "'").test(s4), `4页默认表已改为「${r.名}」`);
            ok(!new RegExp('>' + r.旧名 + '<').test(s1), `1页会话列表已无「${r.旧名}」`);
            ok(new RegExp('>' + r.名 + '<').test(s1), `1页会话列表已显示「${r.名}」`);
        });
    }

    console.log('\n[B] 四条迁移映射一次性共存（旧名 → 新名，不产生重复条目）');
    {
        const 旧索引 = 角色表.map((r, i) => ({
            id: 'c_home_' + i, 名称: r.旧名, 备注: '', 头像: '', 消息: '', 时间: '',
        }));
        const 新索引 = await 跑4页(旧索引, errors);
        const 名 = 新索引.map(i => i.名称);
        角色表.forEach(r => ok(名.includes(r.名), `「${r.旧名}」→「${r.名}」`));
        ok(角色表.every(r => !名.includes(r.旧名)), '旧名已全部清除');
        ok(新索引.length === 角色表.length, `未产生重复条目（实际 ${新索引.length} 条）`);
    }

    console.log('\n[C] 编辑联系人 → 载入完整默认设定');
    for (const r of 角色表) {
        console.log(`  —— ${r.名} ——`);
        const f = await 跑2页('c_home_0', r.名, null, errors);
        ok(f.标题 === '编辑联系人', `${r.名}：标题为「编辑联系人」`);
        ok(f.昵称 === r.名, `${r.名}：昵称（实际 "${f.昵称}"）`);
        ok(f.生日 === r.生日, `${r.名}：生日 = ${r.生日}（实际 "${f.生日}"）`);
        ok(f.身高 === r.身高, `${r.名}：身高 = ${r.身高}（实际 "${f.身高}"）`);
        ok(f.性别 === r.性别, `${r.名}：性别 = ${r.性别}（实际 "${f.性别}"）`);
        ok(r.世界观词.every(w => f.世界观.includes(w)),
            `${r.名}：世界观含 ${r.世界观词.length} 个关键词`);
        ok(r.信息词.every(w => f.人物信息.includes(w)),
            `${r.名}：人物信息含 ${r.信息词.length} 个关键词（时间线 / 口头禅）`);
        ok(r.标签.every(t => f.性格标签.some(x => x.includes(t))),
            `${r.名}：性格标签 ${r.标签.length} 项齐全`);
        ok(f.人物属性选中.includes(r.属性),
            `${r.名}：★ 人物属性 = ${r.属性}（实际 ${JSON.stringify(f.人物属性选中)}）`);
        ok(f.人物属性选中.length === 1, `${r.名}：仅选中「${r.属性}」一项（未误选）`);
    }

    console.log('\n[D] 各种真实 id 下都能命中（按昵称匹配档案，不依赖 id 形态）');
    for (const r of 角色表) {
        for (const id of 各类id) {
            const f = await 跑2页(id, r.名, null, errors);
            // 用标志词而非 length > 100 —— 后者在档案精简到百字内时会假失败
            ok(f.昵称 === r.名 && f.世界观.includes(r.标志词),
                `${r.名} @ id=${id} → 昵称 + 世界观标志词「${r.标志词}」`);
        }
    }

    console.log('\n[E] 旧名索引（未迁移）也能命中档案');
    for (const r of 角色表) {
        const f = await 跑2页('c_home_0', r.旧名, null, errors);
        ok(f.昵称 === r.名, `旧名「${r.旧名}」→ 载入 ${r.名} 档案`);
        ok(f.世界观.includes(r.标志词) && f.人物属性选中.includes(r.属性),
            `旧名场景下 ${r.名} 世界观 + ${r.属性} 属性已填入`);
    }

    console.log('\n[F] 四角色互不干扰（一次全查，而非抽查邻居）');
    {
        const 快照 = {};
        for (const r of 角色表) {
            快照[r.名] = await 跑2页('c_home_0', r.名, null, errors);
        }
        角色表.forEach(r => {
            const f = 快照[r.名];
            const 别人 = 角色表.filter(o => o.名 !== r.名);
            ok(别人.every(o => !f.世界观.includes(o.标志词)),
                `${r.名}：世界观未被其他角色污染`);
            ok(f.生日 === r.生日 && f.身高 === r.身高, `${r.名}：生日 / 身高 未被污染`);
        });
    }

    console.log('\n[G] 空壳详情（只有昵称）仍被内置档案接管');
    for (const r of 角色表) {
        const 空壳 = JSON.stringify({
            昵称: r.名, 世界观: '', 人物信息: '', 性格标签: [], 人物属性: [],
        });
        const f = await 跑2页('c_home_0', r.名, { ['好友信息_c_home_0']: 空壳 }, errors);
        ok(f.世界观.includes(r.标志词) && f.人物信息.length > 0,
            `${r.名}：空壳详情被内置档案接管`);
    }

    console.log('\n[H] 新建模式仍为空白，不被默认档案污染');
    {
        const f = await 跑2页(null, null, null, errors);
        ok(f.标题 === '添加好友', '标题为「添加好友」');
        ok(f.昵称 === '', '昵称空白');
        ok(f.世界观 === '', '世界观空白');
        ok(f.人物信息 === '', '人物信息空白');
        ok(f.性格标签.length === 0, '性格标签为空');
    }

    console.log('\n[I] 用户保存后以分桶为准（改动优先于内置档案）');
    for (const r of 角色表) {
        const 自定义 = JSON.stringify({
            昵称: '改过的名字', 世界观: '自定义世界观', 人物信息: '自定义信息',
            性格标签: ['A'], 人物属性: [],
        });
        const f = await 跑2页('c_default_1', r.名, { '好友信息_c_default_1': 自定义 }, errors);
        ok(f.昵称 === '改过的名字' && f.世界观 === '自定义世界观',
            `${r.名}：分桶数据优先于内置档案`);
    }

    console.log('\n[K] 改名不被档案吞：id 兜底命中时，保留用户在通讯录改过的昵称');
    {
        // c_default_2 的内置档案是林彦。昵称改成自定义名后：人设沿用林彦、昵称保留自定义名。
        const f = await 跑2页('c_default_2', '张三', null, errors);
        ok(f.昵称 === '张三', `自定义昵称不被档案吞回「林彦」（实际 "${f.昵称}"）`);
        ok(f.世界观.includes('蛮荒之境'), '仍补上该 id 对应角色的人设（只补人设、不改昵称）');
        // 旧名则相反：昵称要对上角色并迁移成新名，不能原样保留
        const g = await 跑2页('c_default_2', '水色', null, errors);
        ok(g.昵称 === '林彦', `旧名「水色」仍正常迁移为「林彦」（实际 "${g.昵称}"）`);
    }

    console.log('\n[J] 音色配置隔离：新建联系人不得继承上一位联系人的音色');
    await 音色隔离(errors, ok, 跑3页);

    收尾(errors, '✅ 四个默认角色档案全部通过');
})().catch(e => { console.error(e); process.exit(2); });
