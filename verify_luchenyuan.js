/**
 * 默认角色「陆沉渊」档案验证（原昵称：喵喵又咪咪）
 *  ① 通讯录/首页昵称由「喵喵又咪咪」改为「陆沉渊」
 *  ② 编辑该联系人时，表单载入完整默认设定
 *  ③ 各真实 id（c_home_N / c_legacy_N / 随机 id）下都能命中档案
 *  ④ 埃洛温·影蚀 档案不受影响（两个角色互不干扰）
 *  ⑤ 新建模式仍保持空白
 *
 * 用法：node verify_luchenyuan.js
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const 清理 = h => h
  .replace(/src="2【图片】\/[^"]*"/g, 'src=""')
  .replace(/src="1【音乐】\/[^"]*"/g, 'src=""');

let errors = [];
const ok = (c, m) => { if (c) { console.log('  ✓ ' + m); return true; } errors.push(m); console.log('  ✗ ' + m); return false; };

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

// 以 edit 模式跑 2 页
// 跑 3 页（音色配置），返回 window
async function 跑3页(url, 数据) {
  const html = 清理(fs.readFileSync('3_YINSEAPI.html', 'utf8'));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url,
    beforeParse(w) {
      w.console.error = (...a) => errors.push('3 console.error ' + a.map(String).join(' '));
      w.addEventListener('error', e => errors.push('3 window.error ' + e.message));
      Object.defineProperty(w, 'localStorage', { value: 造存储(数据), configurable: true });
    },
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  await new Promise(r => setTimeout(r, 60));
  return dom.window;
}

async function 跑2页(id, 昵称, 预置) {
  const html = 清理(fs.readFileSync('2_haoyouxinxi.html', 'utf8'));
  const 数据 = Object.assign({
    '联系人索引': JSON.stringify([{ id: id, 名称: 昵称, 备注: '', 头像: '', 消息: '', 时间: '' }]),
  }, 预置 || {});
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost/2.html?id=' + encodeURIComponent(id) + '&mode=edit',
    beforeParse(w) {
      w.console.error = (...a) => errors.push('2 console.error ' + a.map(String).join(' '));
      w.addEventListener('error', e => errors.push('2 window.error ' + e.message));
      Object.defineProperty(w, 'localStorage', { value: 造存储(数据), configurable: true });
    },
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  await new Promise(r => setTimeout(r, 80));
  const d = dom.window.document;
  const 取 = i => (d.getElementById(i) || {}).value;
  return {
    标题: (d.getElementById('页面标题') || {}).textContent,
    昵称: 取('昵称输入'), 生日: 取('生日显示框'), 身高: 取('身高输入'),
    世界观: 取('世界观输入'), 人物信息: 取('人物信息输入'),
    性别: (d.querySelector('input[name="性别"]:checked') || {}).value || '',
    性格标签: Array.from(d.querySelectorAll('#标签输入区 .标签')).map(e => e.textContent.replace(/×|✕/g, '').trim()),
    人物属性选中: Array.from(d.querySelectorAll('#属性标签组 .属性标签.选中')).map(e => e.textContent.trim()),
  };
}

// 跑 4 页，返回迁移后的索引
async function 跑4页(初始索引) {
  const html = 清理(fs.readFileSync('4_tongxun.html', 'utf8'));
  const 数据 = { '联系人索引': JSON.stringify(初始索引) };
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/4.html',
    beforeParse(w) {
      w.console.error = (...a) => errors.push('4 console.error ' + a.map(String).join(' '));
      w.addEventListener('error', e => errors.push('4 window.error ' + e.message));
      Object.defineProperty(w, 'localStorage', { value: 造存储(数据), configurable: true });
    },
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  await new Promise(r => setTimeout(r, 60));
  return JSON.parse(数据['联系人索引'] || '[]');
}

(async function main() {
  console.log('[A] 昵称改名：喵喵又咪咪 → 陆沉渊');
  {
    const s4 = fs.readFileSync('4_tongxun.html', 'utf8');
    ok(!/名称:\s*'喵喵又咪咪'/.test(s4), '4页默认联系人已无「喵喵又咪咪」');
    ok(/名称:\s*'陆沉渊'/.test(s4), '4页默认联系人已改为「陆沉渊」');
    const s1 = fs.readFileSync('1_shouyeyulan.html', 'utf8');
    ok(!/>喵喵又咪咪</.test(s1), '1页会话列表已无「喵喵又咪咪」');
    ok(/>陆沉渊</.test(s1), '1页会话列表已显示「陆沉渊」');
  }

  console.log('\n[B] 旧数据一次性改名迁移');
  {
    const 新索引 = await 跑4页([
      { id: 'c_home_0', 名称: '喵喵又咪咪', 备注: '', 头像: '', 消息: '', 时间: '' },
      { id: 'c_home_1', 名称: '恋痛症', 备注: '', 头像: '', 消息: '', 时间: '' },
    ]);
    const 名 = 新索引.map(i => i.名称);
    ok(名.includes('陆沉渊'), '「喵喵又咪咪」已自动改名为「陆沉渊」');
    ok(名.includes('埃洛温·影蚀'), '「恋痛症」仍正常改名为「埃洛温·影蚀」（两个映射共存）');
    ok(!名.includes('喵喵又咪咪') && !名.includes('恋痛症'), '旧名已全部清除');
    ok(新索引.length === 2, '未产生重复条目（实际 ' + 新索引.length + ' 条）');
  }

  console.log('\n[C] 编辑陆沉渊 → 载入完整默认设定');
  {
    const f = await 跑2页('c_home_0', '陆沉渊');
    ok(f.标题 === '编辑联系人', '页面标题为「编辑联系人」');
    ok(f.昵称 === '陆沉渊', '昵称 = 陆沉渊（实际 "' + f.昵称 + '"）');
    ok(f.生日 === '1998-11-11', '生日 = 1998-11-11（实际 "' + f.生日 + '"）');
    ok(f.身高 === '187', '身高 = 187（实际 "' + f.身高 + '"）');
    ok(f.性别 === '男', '性别 = 男（实际 "' + f.性别 + '"）');
    ok(/北都·京华/.test(f.世界观) && /南都·沪上/.test(f.世界观), '世界观含 北都·京华 / 南都·沪上');
    ok(/陆家，是横跨双城/.test(f.世界观), '世界观含陆家设定');
    ok(/陆沉渊是陆家这一代最锋利的一把刀/.test(f.人物信息), '人物信息已载入');
    ['三岁时', '七岁时', '十二岁时', '十四岁时', '十六岁时', '十八岁时'].forEach(t => {
      ok(f.人物信息.includes(t), '人物信息含时间线「' + t + '」');
    });
    ok(/别用那种表情看我/.test(f.人物信息), '口头禅1 已载入');
    ok(/你现在是陆家人/.test(f.人物信息), '口头禅2 已载入');
    ok(/我会处理/.test(f.人物信息), '口头禅3 已载入');
    ok(/下不为例/.test(f.人物信息), '口头禅4 已载入');
    ['高冷禁欲', '极强的控制欲', '外冷内灼', '极度克制下的极度偏执'].forEach(签 => {
      ok(f.性格标签.some(t => t.includes(签)), '性格标签包含「' + 签 + '」');
    });
    ok(f.人物属性选中.includes('人类'), '人物属性 = 人类（实际 ' + JSON.stringify(f.人物属性选中) + '）');
  }

  console.log('\n[D] 各种真实 id 下都能命中档案');
  {
    for (const id of ['c_home_0', 'c_legacy_0', 'c_default_3', 'cx9z9z9']) {
      const f = await 跑2页(id, '陆沉渊');
      ok(f.昵称 === '陆沉渊' && f.世界观.length > 100, 'id=' + id + ' → 昵称+世界观已填入');
    }
  }

  console.log('\n[E] 旧名索引（未迁移）也能命中档案');
  {
    const f = await 跑2页('c_home_0', '喵喵又咪咪');
    ok(f.昵称 === '陆沉渊', '旧名「喵喵又咪咪」→ 载入陆沉渊档案');
    ok(f.世界观.length > 100, '旧名场景下世界观已填入');
  }

  console.log('\n[F] 埃洛温·影蚀 档案不受影响（两角色互不干扰）');
  {
    const f = await 跑2页('c_home_1', '埃洛温·影蚀');
    ok(f.昵称 === '埃洛温·影蚀', '埃洛温昵称正确');
    ok(f.生日 === '2033-08-30', '埃洛温生日仍为 2033-08-30');
    ok(/艾诺拉/.test(f.世界观), '埃洛温世界观仍为艾诺拉（未被陆沉渊覆盖）');
    ok(f.性格标签.some(t => t.includes('克制而疏离')), '埃洛温性格标签正确');
  }

  console.log('\n[G] 新建模式仍为空白');
  {
    const html = 清理(fs.readFileSync('2_haoyouxinxi.html', 'utf8'));
    const 数据 = {};
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/2.html?mode=new',
      beforeParse(w) {
        w.console.error = (...a) => errors.push('2 console.error ' + a.map(String).join(' '));
        w.addEventListener('error', e => errors.push('2 window.error ' + e.message));
        Object.defineProperty(w, 'localStorage', { value: 造存储(数据), configurable: true });
      },
    });
    await new Promise(r => dom.window.addEventListener('load', r));
    await new Promise(r => setTimeout(r, 60));
    const d = dom.window.document;
    ok((d.getElementById('页面标题') || {}).textContent === '添加好友', '标题为「添加好友」');
    ok((d.getElementById('昵称输入') || {}).value === '', '昵称空白');
    ok((d.getElementById('世界观输入') || {}).value === '', '世界观空白');
  }


  console.log('\n[H] 音色配置隔离：新建联系人不得继承上一位联系人的音色');
  {
    // 模拟上一位联系人 c_A 已配置并启用音色（含旧全局键遗留）
    const A配置 = JSON.stringify({ 音色: 'A的专属音色', 自定义ID: 'A的专属音色', 音速: 1, 语调: 1, 语言: 'zh', 性别: '女', 已启用: true });
    const 数据 = { '音色配置_c_A': A配置, '音色配置': A配置 };

    // 1) 编辑 c_A：应正常载入自己的音色
    let w = await 跑3页('http://localhost/3.html?id=c_A', 数据);
    ok(w.document.getElementById('自定义ID输入').value === 'A的专属音色', 'H1 编辑 c_A → 载入 A 自己的音色');
    ok(w.document.getElementById('顶部开关文字').textContent === '已启用', 'H1 编辑 c_A → 开关 = 已启用');

    // 2) 新建联系人：绝不能继承 A 的配置
    //    （旧实现会在此处顶着 A 的音色且显示「已启用」，用户点开关反而把它关掉）
    w = await 跑3页('http://localhost/3.html?mode=new', 数据);
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

  console.log('\n--- 结果 ---');
  const real = errors.filter(e => /console\.error|window\.error|TypeError|ReferenceError/.test(e));
  console.log('功能性断言失败:', errors.length);
  console.log('控制台真实报错:', real.length);
  if (real.length) real.forEach(e => console.log('  ! ' + e));
  process.exit(errors.length || real.length ? 1 : 0);
})();
