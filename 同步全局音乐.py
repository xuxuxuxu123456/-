#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步全局音乐.py —— 把 全局音乐.js 的内容重新内联进所有 html

【为什么需要它】
  全局音乐（跨页续播）已经内联进 14 个 html，页面运行时【不依赖任何外部文件】，
  拷贝单个 html 也能正常工作。但代价是代码被复制了 14 份 ——
  直接改某个页面里的那段，其余 13 个就会不同步。

  所以约定：
    ★ 唯一源 = 全局音乐.js
    ★ 改完跑一次：`python3 同步全局音乐.py`
    ★ 它按 <script id="全局音乐"> 这个锚点整段替换，不会碰到页面其它代码

【用法】
  python3 同步全局音乐.py            # 同步
  python3 同步全局音乐.py --check    # 只检查是否一致（不同步，退出码非 0 表示有漂移）
"""
import glob
import os
import sys

目录 = os.path.dirname(os.path.abspath(__file__))
源路径 = os.path.join(目录, '全局音乐.js')

开始标记 = '    <script id="全局音乐">\n'
结束标记 = '    </script>\n'

只检查 = '--check' in sys.argv

# ★ 演示套件：另一套「微信绿」风格的原型页，用 .手机 / .页面 容器，
#   依赖外部 css/app.css 与 js/store.js，不参与主套件的内联体系。
#   不加这张表的话 --check 会对它们恒报「缺少内联块」，
#   退出码永远非 0，真漂移反而被这堆噪音盖住。
排除 = {'1_xiaoxi.html', '7_qunliao.html'}


def 读(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def 主():
    源 = 读(源路径)
    if '</script' in 源.lower():
        print('× 全局音乐.js 里出现了 </script，内联会截断脚本，先改掉再同步')
        return 2

    漂移 = []
    for f in sorted(glob.glob(os.path.join(目录, '*.html'))):
        名 = os.path.basename(f)
        if 名 in 排除:
            continue
        s = 读(f)
        起 = s.find(开始标记)
        if 起 < 0:
            漂移.append((os.path.basename(f), '缺少内联块'))
            continue
        正文起 = 起 + len(开始标记)
        止 = s.find(结束标记, 正文起)
        if 止 < 0:
            漂移.append((os.path.basename(f), '内联块没有收尾 </script>'))
            continue

        当前 = s[正文起:止]
        if 当前 == 源 + '\n' or 当前 == 源:
            continue                       # 已同步

        if 只检查:
            漂移.append((os.path.basename(f), '内容与源文件不一致'))
            continue

        s = s[:正文起] + 源 + s[止:]
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(s)
        print('✓ 已同步:', os.path.basename(f))

    if 漂移:
        for 名, 因 in 漂移:
            print('×', 名, '——', 因)
        return 1

    if 只检查:
        print('✓ 全部 14 个页面的内联副本都与 全局音乐.js 一致')
    else:
        print('✓ 同步完成')
    return 0


if __name__ == '__main__':
    sys.exit(主())
