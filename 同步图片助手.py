#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步图片助手.py —— 把 图片助手.js 的内容重新内联进需要它的 html

【为什么需要它】
  图片助手（生图调用层）要被 7 页（聊天里角色自主发图）与 20 页（配置页本身）
  同时使用。页面运行时【不依赖外部文件】，拷贝单个 html 也能跑，
  所以只能内联 —— 代价是同一份代码出现多份。
  直接改某个页面里的那段，其余页面就会漂。

  所以约定：
    ★ 唯一源 = 图片助手.js
    ★ 改完跑一次：`python3 同步图片助手.py`
    ★ 它按 <script id="图片助手"> 这个锚点整段替换，不会碰到页面其它代码

  ★ 哪些页面需要它，看下面的 目标页 —— 新增页面请加进去，
    忘了加 = 那个页面拿不到 window.图片助手，生图会静默降级成占位图。

【用法】
  python3 同步图片助手.py            # 同步
  python3 同步图片助手.py --check    # 只检查是否一致（不同步，退出码非 0 表示有漂移）
"""
import glob
import os
import sys

目录 = os.path.dirname(os.path.abspath(__file__))
源路径 = os.path.join(目录, '图片助手.js')

# ★ 只有真正调生图的页面才需要。1_xiaoxi / 7_qunliao 是演示原型，本就不在内。
目标页 = ['7_liaotian.html', '20_tupianAPI.html']

开始标记 = '    <script id="图片助手">\n'
结束标记 = '    </script>\n'

只检查 = '--check' in sys.argv


def 读(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def 主():
    源 = 读(源路径)
    if '</script' in 源.lower():
        print('× 图片助手.js 里出现了 </script，内联会截断脚本，先改掉再同步')
        return 2

    漂移 = []
    for 名 in 目标页:
        f = os.path.join(目录, 名)
        if not os.path.exists(f):
            漂移.append((名, '文件不存在'))
            continue
        s = 读(f)
        起 = s.find(开始标记)
        if 起 < 0:
            漂移.append((名, '缺少内联块'))
            continue
        正文起 = 起 + len(开始标记)
        止 = s.find(结束标记, 正文起)
        if 止 < 0:
            漂移.append((名, '内联块没有收尾 </script>'))
            continue

        当前 = s[正文起:止]
        if 当前 == 源 + '\n' or 当前 == 源:
            continue                       # 已同步

        if 只检查:
            漂移.append((名, '内容与源文件不一致'))
            continue

        s = s[:正文起] + 源 + s[止:]
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(s)
        print('✓ 已同步:', 名)

    # 反向检查：有内联块但不在目标页里的（多半是漏登记，或页面已不再需要）
    for f in sorted(glob.glob(os.path.join(目录, '*.html'))):
        名 = os.path.basename(f)
        if 名 in 目标页:
            continue
        if 开始标记 in 读(f):
            漂移.append((名, '有内联块但不在 目标页 清单里（漏登记？）'))

    if 漂移:
        for 名, 因 in 漂移:
            print('×', 名, '——', 因)
        return 1

    print('✓ 全部 %d 个页面的内联副本都与 图片助手.js 一致' % len(目标页)
          if 只检查 else '✓ 同步完成')
    return 0


if __name__ == '__main__':
    sys.exit(主())
