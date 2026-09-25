#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步AI助手.py —— 把 AI助手.js 的内容重新内联进需要的页面

【为什么需要它】
  与 同步全局音乐.py / 同步图片助手.py 同一套机制：页面运行时不依赖外部 js，
  单拷 html 也能跑，所以调用层只能内联 —— 代价是同一份代码出现多份，
  直接改某个页面里的那段，其余页面就会漂。

  约定：
    ★ 唯一源 = AI助手.js
    ★ 改完跑一次：`python3 同步AI助手.py`
    ★ 按 <script id="AI助手"> 锚点整段替换，不碰页面其它代码

【★ 现状：目前只有 19 页在用】
  7 页聊天与 5 页动态【没有】接入 AI 助手（实测两页去注释后 0 次引用），
  它们的回复走本地逻辑：7 页读「联系人小字文案 + 角色档案口头禅」，5 页用内置文案。
  这是有意设计（离线可用、行为可测），不是漏接。

  ★★ 反过来说：只在这里加文件名【不会】让 7 页聊天改用模型回复 ——
     那需要改 7 页的回复链路，属于功能变更，不是同步脚本能解决的。
     真要接入时：改完 7 页逻辑后，把 '7_liaotian.html' 加进 目标页 即可。

【用法】
  python3 同步AI助手.py            # 同步
  python3 同步AI助手.py --check    # 只检查（不同步，退出码非 0 表示有漂移）
"""
import glob
import os
import re
import sys

目录 = os.path.dirname(os.path.abspath(__file__))
源路径 = os.path.join(目录, 'AI助手.js')

# ★ 只有真正调模型的页面才需要。
目标页 = ['19_wenbenAPI.html']

块id = 'AI助手'
开始正则 = re.compile(r'^([ \t]*)<script id="%s">\n' % 块id, re.M)

只检查 = '--check' in sys.argv


def 读(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def 找块(s):
    """返回 (正文起始, 收尾起始) —— 找不到返回 None

    ★ 用 find 而不是「正则拼缩进」：Python 3.7+ 的 re.escape 会把空格转义成
      '\\ '，缩进一旦是 tab 或混合空白就极难排查。find 所见即所得。
    """
    m = 开始正则.search(s)
    if not m:
        return None
    缩进 = m.group(1)
    正文起 = m.end()
    正文止 = s.find('\n' + 缩进 + '</script>', 正文起)
    if 正文止 < 0:
        return None
    return (正文起, 正文止)


def 主():
    if not os.path.exists(源路径):
        print('× 找不到源文件：AI助手.js')
        return 2

    源 = 读(源路径)
    if '</script' in 源.lower():
        print('× AI助手.js 里出现了 </script，内联会截断脚本，先改掉再同步')
        return 2

    漂移 = []
    已同步 = 0

    for 名 in 目标页:
        f = os.path.join(目录, 名)
        if not os.path.exists(f):
            漂移.append((名, '文件不存在'))
            continue
        s = 读(f)
        块 = 找块(s)
        if not 块:
            漂移.append((名, '缺少内联块 <script id="AI助手">'))
            continue
        正文起, 正文止 = 块
        当前 = s[正文起:正文止]
        if 当前.rstrip('\n') == 源.rstrip('\n'):
            continue                       # 已同步
        if 只检查:
            漂移.append((名, '内容与源文件不一致'))
            continue
        s = s[:正文起] + 源.rstrip('\n') + '\n' + s[正文止:]
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(s)
        print('✓ 已同步:', 名)
        已同步 += 1

    # 反向检查：有内联块但不在目标页里（多半是漏登记，或页面已不再需要）
    for f in sorted(glob.glob(os.path.join(目录, '*.html'))):
        名 = os.path.basename(f)
        if 名 in 目标页:
            continue
        if 开始正则.search(读(f)):
            漂移.append((名, '有内联块但不在 目标页 清单里（漏登记？）'))

    if 漂移:
        for 名, 因 in 漂移:
            print('×', 名, '——', 因)
        return 1

    if 只检查:
        print('✓ %d 个页面的内联副本都与 AI助手.js 一致' % len(目标页))
    else:
        print('✓ 同步完成（共 %d 个页面，本次更新 %d 个）' % (len(目标页), 已同步))
    return 0


if __name__ == '__main__':
    sys.exit(主())
