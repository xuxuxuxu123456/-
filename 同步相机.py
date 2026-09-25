#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步相机.py —— 把 相机.js 的内容内联进所有带「拍摄」按钮的页面

【为什么需要它】
  与 同步全局音乐.py / 同步AI助手.py 同一套机制：页面运行时不依赖外部 js，
  单拷 html 也能跑，所以只能内联 —— 代价是同一份代码出现多份，
  直接改某个页面里的那段，其余页面就会漂。

  约定：
    ★ 唯一源 = 相机.js
    ★ 改完跑一次：`python3 同步相机.py`
    ★ 按 <script id="相机"> 锚点整段替换，不碰页面其它代码

【★ 只同步真正有「拍摄」入口的页面】
  目前 7 个：1 / 2 / 6 / 8 / 9 / 10 / 11 页。
  新页面要接入拍摄：先把 相机.js 的逻辑接上，再把文件名加进 目标页。

【用法】
  python3 同步相机.py            # 同步
  python3 同步相机.py --check    # 只检查（退出码非 0 = 有漂移）
"""
import glob
import os
import re
import sys

目录 = os.path.dirname(os.path.abspath(__file__))
源路径 = os.path.join(目录, '相机.js')

目标页 = [
    '1_shouyeyulan.html',
    '2_haoyouxinxi.html',
    '6_fabudongtai.html',
    '8_wode.html',
    '9_zhutishezhi.html',
    '10_lunbotu.html',
    '11_woderenshe.html',
]

块id = '相机'
开始正则 = re.compile(r'^([ \t]*)<script id="%s">[ \t]*\n' % 块id, re.M)

只检查 = '--check' in sys.argv


def 读(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def 找块(s):
    """返回 (正文起始, 收尾起始)；找不到返回 None。

    ★ 用正则抓缩进 + find 找收尾，不用「拼字符串再 find」：
      后者在 tab 缩进或混合空白时极难排查，且拿到的是所见即所得以外的结果。
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
        print('× 找不到源文件：相机.js')
        return 2

    源 = 读(源路径)
    if '</script' in 源.lower():
        print('× 相机.js 里出现了 </script，内联会截断脚本，先改掉再同步')
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
            漂移.append((名, '缺少内联块 <script id="相机">'))
            continue
        正文起, 正文止 = 块
        当前 = s[正文起:正文止]
        if 当前.rstrip('\n') == 源.rstrip('\n'):
            continue
        if 只检查:
            漂移.append((名, '内容与源文件不一致'))
            continue
        s = s[:正文起] + 源.rstrip('\n') + '\n' + s[正文止:]
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(s)
        print('✓ 已同步:', 名)
        已同步 += 1

    # 反向检查：有内联块却不在目标页里（漏登记 / 页面已不需要）
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
        print('✓ %d 个页面的内联副本都与 相机.js 一致' % len(目标页))
    else:
        print('✓ 同步完成（共 %d 个页面，本次更新 %d 个）' % (len(目标页), 已同步))
    return 0


if __name__ == '__main__':
    sys.exit(主())
