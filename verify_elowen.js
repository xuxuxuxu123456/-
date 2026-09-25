/**
 * 默认角色「埃洛温·影蚀」档案验证
 *  ① 通讯录/首页昵称由「恋痛症」改为「埃洛温·影蚀」
 *  ② 编辑该联系人（id=c_default_1）时，表单载入完整默认设定
 *     （昵称/生日/身高/性别/世界观/人物信息/性格标签/人物属性）
 *  ③ 新建模式（加号添加好友）仍保持空白，不被默认档案污染
 *
 * 用法：node verify_elowen.js
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const 清理 = h => h
  .replace(/src="2【图片】\/[^"]*"/g, 'src=""')
  .replace(/src="1【音乐】\/[^"]*"/g, 'src=""');

let errors = [];
const ok = (c, m) => { if (c) { console.log('  ✓ ' + m); return true; } errors.push(m); console.log('  ✗ ' + m); return false; };

// 用带「恋痛症」旧名的索引，验证 4 页的一次性改名迁移
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

async function 跑4页(初始索引) {
  const html = 清理(fs.readFileSync('4_tongxun.html', 'utf8'));
  const 数据 = {};
  if (初始索引) 数据['联系人索引'] = JSON.stringify(初始索引);
  const storage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(数据, k) ? 数据[k] : null),
    setItem: (k, v) => { 数据[k] = String(v); },
    removeItem: k => { delete 数据[k]; },
    clear: () => { for (const k in 数据) delete 数据[k]; },
    key: i => Object.keys(数据)[i] || null,
    get length() { return Object.keys(数据).length; },
  };
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/4.html',
    beforeParse(w) {
      w.console.error = (...a) => errors.push('4 console.error ' + a.map(String).join(' '));
      w.addEventListener('error', e => errors.push('4 window.error ' + e.message));
      Object.defineProperty(w, 'localStorage', { value: storage, configurable: true });
    },
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  await new Promise(r => setTimeout(r, 60));
  return { w: dom.window, 数据 };
}

// 以 edit 模式跑 2 页，返回表单字段
async function 跑2页(id, 预置) {
  const html = 清理(fs.readFileSync('2_haoyouxinxi.html', 'utf8'));
  // 默认索引项的 id 跟随传入 id（保证 查找索引项 能命中，不会退化成新建）
  const 数据 = Object.assign({
    '联系人索引': JSON.stringify([{ id: id || 'c_default_1', 名称: '埃洛温·影蚀', 备注: '', 头像: '2【图片】/圆形头像2.png', 消息: '', 时间: '' }]),
  }, 预置 || {});
  const storage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(数据, k) ? 数据[k] : null),
    setItem: (k, v) => { 数据[k] = String(v); },
    removeItem: k => { delete 数据[k]; },
    clear: () => { for (const k in 数据) delete 数据[k]; },
    key: i => Object.keys(数据)[i] || null,
    get length() { return Object.keys(数据).length; },
  };
  const url = 'http://localhost/2.html' + (id ? '?id=' + id + '&mode=edit' : '?mode=new');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url,
    beforeParse(w) {
      w.console.error = (...a) => errors.push('2 console.error ' + a.map(String).join(' '));
      w.addEventListener('error', e => errors.push('2 window.error ' + e.message));
      Object.defineProperty(w, 'localStorage', { value: storage, configurable: true });
    },
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  await new Promise(r => setTimeout(r, 80));
  const d = dom.window.document;
  const 取 = id => (d.getElementById(id) || {}).value;
  return {
    昵称: 取('昵称输入'), 生日: 取('生日显示框'), 身高: 取('身高输入'),
    身份: 取('身份输入'), 世界观: 取('世界观输入'), 人物信息: 取('人物信息输入'),
    性别: (d.querySelector('input[name="性别"]:checked') || {}).value || '',
    性格标签: Array.from(d.querySelectorAll('#标签输入区 .标签')).map(e => e.textContent.replace(/×|✕/g, '').trim()),
    人物属性选中: Array.from(d.querySelectorAll('#属性标签组 .属性标签.选中')).map(e => e.textContent.trim()),
    标题: (d.getElementById('页面标题') || {}).textContent,
  };
}

(async function main() {
  console.log('[A] 昵称改名：恋痛症 → 埃洛温·影蚀');
  {
    const 源码4 = fs.readFileSync('4_tongxun.html', 'utf8');
    ok(!/名称:\s*'恋痛症'/.test(源码4), '4页默认联系人已无「恋痛症」');
    ok(/名称:\s*'埃洛温·影蚀'/.test(源码4), '4页默认联系人已改为「埃洛温·影蚀」');
    const 源码1 = fs.readFileSync('1_shouyeyulan.html', 'utf8');
    ok(!/>恋痛症</.test(源码1), '1页会话列表已无「恋痛症」');
    ok(/>埃洛温·影蚀</.test(源码1), '1页会话列表已显示「埃洛温·影蚀」');
  }

  console.log('\n[B] 旧数据一次性改名迁移（索引里残留「恋痛症」→ 自动改为新名）');
  {
    const 旧索引 = [{ id: 'c_default_1', 名称: '恋痛症', 备注: '', 头像: '', 消息: '', 时间: '' }];
    const r = await 跑4页(旧索引);
    const 新索引 = JSON.parse(r.数据['联系人索引'] || '[]');
    ok(新索引[0] && 新索引[0].名称 === '埃洛温·影蚀', '旧索引中的「恋痛症」已自动改名为「埃洛温·影蚀」');
    ok(新索引.length === 1, '未产生重复条目（实际 ' + 新索引.length + ' 条）');
  }

  console.log('\n[C] 编辑联系人（id=c_default_1）→ 载入完整默认设定');
  {
    const f = await 跑2页('c_default_1');
    ok(f.标题 === '编辑联系人', '页面标题为「编辑联系人」');
    ok(f.昵称 === '埃洛温·影蚀', '昵称 = 埃洛温·影蚀（实际 "' + f.昵称 + '"）');
    ok(f.生日 === '2033-08-30', '生日 = 2033-08-30（实际 "' + f.生日 + '"）');
    ok(f.身高 === '184', '身高 = 184（实际 "' + f.身高 + '"）');
    ok(f.性别 === '男', '性别 = 男（实际 "' + f.性别 + '"）');
    ok(/艾诺拉/.test(f.世界观) && /提瑞亚/.test(f.世界观) && /烬土荒原/.test(f.世界观),
      '世界观已载入（含 艾诺拉 / 提瑞亚 / 烬土荒原）');
    ok(/埃洛温曾是提瑞亚星辉骑士团/.test(f.人物信息), '人物信息已载入（含骑士团背景）');
    ok(/暗影拟态/.test(f.人物信息) && /银质怀表/.test(f.人物信息), '人物信息含 暗影拟态 / 银质怀表');
    ok(/无趣/.test(f.人物信息), '人物信息含口头禅「无趣」');
    ['克制而疏离', '内心温柔', '偏执守护', '矛盾综合体'].forEach(签 => {
      ok(f.性格标签.some(t => t.includes(签)), '性格标签包含「' + 签 + '」');
    });
    ok(f.人物属性选中.includes('人类'), '人物属性 = 人类（实际 ' + JSON.stringify(f.人物属性选中) + '）');
  }

  console.log('\n[C2] 各种真实 id 下都能填入（1页导出 c_home_N / 旧数据 c_legacy_N / 随机 id）');
  {
    for (const id of ['c_home_0', 'c_legacy_0', 'cx1a2b3c']) {
      const 索引 = [{ id, 名称: '埃洛温·影蚀', 备注: '', 头像: '', 消息: '', 时间: '' }];
      const html = 清理(fs.readFileSync('2_haoyouxinxi.html', 'utf8'));
      const 数据 = { '联系人索引': JSON.stringify(索引) };
      const storage = {
        getItem: k => (Object.prototype.hasOwnProperty.call(数据, k) ? 数据[k] : null),
        setItem: (k, v) => { 数据[k] = String(v); }, removeItem: k => { delete 数据[k]; }, clear: () => {},
        key: i => Object.keys(数据)[i] || null, get length() { return Object.keys(数据).length; },
      };
      const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'http://localhost/2.html?id=' + encodeURIComponent(id) + '&mode=edit',
        beforeParse(w) {
          w.console.error = (...a) => errors.push('2 console.error ' + a.map(String).join(' '));
          w.addEventListener('error', e => errors.push('2 window.error ' + e.message));
          Object.defineProperty(w, 'localStorage', { value: storage, configurable: true });
        },
      });
      await new Promise(r => dom.window.addEventListener('load', r));
      await new Promise(r => setTimeout(r, 60));
      const d = dom.window.document;
      const 取 = i => (d.getElementById(i) || {}).value;
      ok(取('昵称输入') === '埃洛温·影蚀' && 取('世界观输入').length > 100,
        'id=' + id + ' → 昵称+世界观已填入（按昵称匹配档案）');
    }
  }

  console.log('\n[C3] 误存空壳后仍能接管（只有昵称、其余全空）');
  {
    const 空壳 = JSON.stringify({ 昵称: '埃洛温·影蚀', 世界观: '', 人物信息: '', 性格标签: [], 人物属性: [] });
    const f = await 跑2页('c_home_0', { '好友信息_c_home_0': 空壳 });
    ok(f.世界观.length > 100, '空壳详情被内置档案接管（世界观已填入）');
    ok(f.人物信息.length > 100, '空壳详情被内置档案接管（人物信息已填入）');
  }

  console.log('\n[D] 新建模式（加号添加好友）仍为空白，不被默认档案污染');
  {
    const f = await 跑2页(null);
    ok(f.标题 === '添加好友', '页面标题为「添加好友」');
    ok(f.昵称 === '', '昵称空白');
    ok(f.世界观 === '', '世界观空白');
    ok(f.人物信息 === '', '人物信息空白');
    ok(f.性格标签.length === 0, '性格标签为空');
  }

  console.log('\n[E] 用户保存后以分桶为准（改动优先于内置档案）');
  {
    const 自定义 = JSON.stringify({ 昵称: '改过的名字', 世界观: '自定义世界观', 人物信息: '自定义信息', 性格标签: ['A'], 人物属性: [] });
    const f = await 跑2页('c_default_1', { '好友信息_c_default_1': 自定义 });
    ok(f.昵称 === '改过的名字', '分桶数据优先：昵称 = 改过的名字');
    ok(f.世界观 === '自定义世界观', '分桶数据优先：世界观为用户自定义');
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
