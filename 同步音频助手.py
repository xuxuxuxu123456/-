#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步音频助手.py —— 把 音频助手.js 的内容重新内联进需要它的 html

【为什么需要它】
  音频助手（TTS 调用层）要被 21 页（配置页本身）、7 页（聊天里角色发语音）、
  14 页（语音通话出声）同时使用。页面运行时【不依赖外部文件】，
  拷贝单个 html 也能跑，所以只能内联 —— 代价是同一份代码出现多份。
  直接改某个页面里的那段，其余页面就会漂。

  所以约定：
    ★ 唯一源 = 音频助手.js
    ★ 改完跑一次：`python3 同步音频助手.py`
    ★ 它按 <script id="音频助手"> 这个锚点整段替换，不会碰到页面其它代码

  ★ 哪些页面需要它，看下面的 目标页 —— 新增页面请加进去，
    忘了加 = 那个页面拿不到 window.音频助手，语音会静默不发声。

【用法】
  python3 同步音频助手.py            # 同步
  python3 同步音频助手.py --check    # 只检查是否一致（不同步，退出码非 0 表示有漂移）
"""
import glob
import os
import sys

目录 = os.path.dirname(os.path.abspath(__file__))
源路径 = os.path.join(目录, '音频助手.js')

# ★ 只有真正调 TTS 的页面才需要。1_xiaoxi / 7_qunliao 是演示原型，本就不在内。
# ★ 3 页也要：它的「默认音色」下拉要调 助手.兜底音色() 兜底，
#   没内联的话没配 API 时一个音色都列不出来。
目标页 = ['3_YINSEAPI.html', '7_liaotian.html', '14_yuyintonghua.html', '21_yinpinAPI.html']

# ★ 各页面缩进不同（7/14/21 页是 4 空格，3 页是 2 空格），
#   所以不能写死缩进 —— 按 id 定位，缩进从匹配到的那行里取。
import re
开始正则 = re.compile(r'^([ \t]*)<script id="音频助手">\n', re.M)

只检查 = '--check' in sys.argv


def 读(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def 主():
    源 = 读(源路径)
    if '</script' in 源.lower():
        print('× 音频助手.js 里出现了 </script，内联会截断脚本，先改掉再同步')
        return 2

    漂移 = []
    for 名 in 目标页:
        f = os.path.join(目录, 名)
        if not os.path.exists(f):
            漂移.append((名, '文件不存在'))
            continue
        s = 读(f)
        # ★ 各页缩进不同（7/14/21 页 4 空格，3 页 2 空格）→ 按 id 定位，缩进从匹配行取
        匹配 = 开始正则.search(s)
        if not 匹配:
            漂移.append((名, '缺少内联块'))
            continue
        缩进 = 匹配.group(1)
        正文起 = 匹配.end()
        收尾 = '\n' + 缩进 + '</script>\n'
        止 = s.find(收尾, 正文起)
        if 止 < 0:
            漂移.append((名, '内联块没有收尾 </script>'))
            continue

        当前 = s[正文起:止]
        if 当前.rstrip('\n') == 源.rstrip('\n'):
            continue

        if 只检查:
            漂移.append((名, '内容与源文件不一致'))
            continue

        s = s[:正文起] + 源.rstrip('\n') + s[止:]
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(s)
        print('✓ 已同步:', 名)

    for f in sorted(glob.glob(os.path.join(目录, '*.html'))):
        名 = os.path.basename(f)
        if 名 in 目标页:
            continue
        if 'id="音频助手"' in 读(f):
            漂移.append((名, '有内联块但不在 目标页 清单里（漏登记？）'))

    if 漂移:
        for 名, 因 in 漂移:
            print('×', 名, '——', 因)
        return 1

    print('✓ 全部 %d 个页面的内联副本都与 音频助手.js 一致' % len(目标页)
          if 只检查 else '✓ 同步完成')
    return 0


if __name__ == '__main__':
    sys.exit(主())
