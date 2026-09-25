#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步软键盘.py —— 把 软键盘适配.js 的内容重新内联进所有 html

【为什么需要它】
  与 全局音乐.js 完全同一个道理：全站是离线单文件 H5，页面运行时不依赖
  任何外部 js，拷走单个 html 也能跑。所以软键盘适配只能内联 ——
  代价是同一份代码出现 N 份，直接改某个页面里的那段，其余页面就会漂。

  约定：
    ★ 唯一源 = 软键盘适配.js
    ★ 改完跑一次：`python3 同步软键盘.py`
    ★ 按 <script id="软键盘适配"> 锚点整段替换；页面还没有这个块时，
      自动插到 </body> 之前（紧跟在 全局音乐 之后，保证脚本顺序稳定）

【覆盖范围】
  所有带 .手机主题背景容器 的页面。
  ★ 1_xiaoxi.html / 7_qunliao.html 是另一套「演示套件」（微信绿风格、
    用外部 css/app.css 与 js/store.js），没有这个容器，本脚本会自动跳过
    —— 不像 同步全局音乐.py 那样对它们报「缺少内联块」的假警。

【用法】
  python3 同步软键盘.py            # 同步
  python3 同步软键盘.py --check    # 只检查是否一致（不同步，退出码非 0 表示有漂移）
"""
import glob
import os
import re
import sys

目录 = os.path.dirname(os.path.abspath(__file__))
源路径 = os.path.join(目录, '软键盘适配.js')

块id = '软键盘适配'
# 按 id 定位，缩进从匹配到的那行里取（各页缩进不一致，不能写死）
开始正则 = re.compile(r'^([ \t]*)<script id="%s">\n' % 块id, re.M)
收尾正则 = re.compile(r'^([ \t]*)</script>\n', re.M)

# 演示套件：没有 .手机主题背景容器，不在覆盖范围
排除 = {'1_xiaoxi.html', '7_qunliao.html'}

只检查 = '--check' in sys.argv


def 读(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def 有容器(s):
    return '手机主题背景容器' in s


def 找块(s):
    """返回 (起始下标, 正文起始, 收尾起始, 缩进) —— 找不到返回 None

    ★ 用字符串 find 而不是「正则拼缩进」：Python 3.7+ 的 re.escape 会把空格
      转义成 '\\ '，拼进正则后语义虽然相同，但缩进一旦是 tab 或混合空白就
      极难排查。find 是所见即所得。
    """
    m = 开始正则.search(s)
    if not m:
        return None
    缩进 = m.group(1)
    正文起 = m.end()
    # 从正文起之后找第一个「换行 + 同缩进 + </script>」
    收尾 = '\n' + 缩进 + '</script>'
    正文止 = s.find(收尾, 正文起)
    if 正文止 < 0:
        return None
    return (m.start(), 正文起, 正文止, 缩进)


def 主():
    if not os.path.exists(源路径):
        print('× 找不到源文件：软键盘适配.js')
        return 2

    源 = 读(源路径)
    if '</script' in 源.lower():
        print('× 软键盘适配.js 里出现了 </script，内联会截断脚本，先改掉再同步')
        return 2

    漂移 = []
    已同步 = 0
    新插入 = 0
    覆盖 = 0

    for f in sorted(glob.glob(os.path.join(目录, '*.html'))):
        名 = os.path.basename(f)
        if 名 in 排除:
            continue
        s = 读(f)
        if not 有容器(s):
            continue          # 不带容器的页面（演示套件等）跳过，不算漂移
        覆盖 += 1

        块 = 找块(s)
        if not 块:
            # 还没有这个块 —— 插到 </body> 之前
            收 = s.rfind('</body>')
            if 收 < 0:
                漂移.append((名, '找不到 </body>，无法插入'))
                continue
            缩进 = '    '
            片段 = ('%s<script id="%s">\n' % (缩进, 块id)) + 源.rstrip('\n') + \
                   ('\n%s</script>\n' % 缩进)
            if 只检查:
                漂移.append((名, '尚未内联软键盘适配'))
                continue
            s = s[:收] + 片段 + s[收:]
            with open(f, 'w', encoding='utf-8') as fp:
                fp.write(s)
            print('+ 已插入:', 名)
            新插入 += 1
            continue

        起, 正文起, 正文止, 缩进 = 块
        当前 = s[正文起:正文止]
        if 当前.rstrip('\n') == 源.rstrip('\n'):
            continue                       # 已同步

        if 只检查:
            漂移.append((名, '内容与源文件不一致'))
            continue

        # ★ 收尾位置指向的是「\n + 缩进 + </script>」的换行处，
        #   所以正文必须自己带一个换行结尾，否则会拼出 "})();    </script>"
        #   这种粘在一起的结果（第二、三次同步才会暴露，第一次是插入、看不出来）。
        s = s[:正文起] + 源.rstrip('\n') + '\n' + s[正文止:]
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(s)
        print('✓ 已同步:', 名)
        已同步 += 1

    # 反向检查：有块但页面本不该有（容器被删了 / 页面合并了）
    for f in sorted(glob.glob(os.path.join(目录, '*.html'))):
        名 = os.path.basename(f)
        if 名 in 排除:
            continue
        s = 读(f)
        if 块id in s and not 有容器(s):
            漂移.append((名, '有内联块但没有 .手机主题背景容器（容器被删了？）'))

    if 漂移:
        for 名, 因 in 漂移:
            print('×', 名, '——', 因)
        return 1

    if 只检查:
        print('✓ %d 个页面的内联副本都与 软键盘适配.js 一致' % 覆盖)
    else:
        print('✓ 同步完成（新插入 %d 个，更新 %d 个，共覆盖 %d 个页面）'
              % (新插入, 已同步, 覆盖))
    return 0


if __name__ == '__main__':
    sys.exit(主())
