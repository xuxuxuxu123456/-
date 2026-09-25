#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「拍摄」按钮接到 相机.js 上（7 个页面）

改动极小，每页只动一行：
   拍照输入.click()              →  window.全局相机.拍摄(拍照输入)
   挑(拍照输入)                  →  window.全局相机.拍摄(拍照输入)
   6 页走回调形式（它的 input 是运行时新建的）

★ 为什么能这么省事：相机.js 成功后会把 File 塞回这个 input 并派发 change，
  页面原有的 change 处理逻辑一行都不用改。
"""
import os
import re
import sys

目录 = os.path.dirname(os.path.abspath(__file__))
源 = open(os.path.join(目录, '相机.js'), encoding='utf-8').read().rstrip('\n')

页面 = ['1_shouyeyulan.html', '2_haoyouxinxi.html', '6_fabudongtai.html',
       '8_wode.html', '9_zhutishezhi.html', '10_lunbotu.html', '11_woderenshe.html']

替换表 = {
    # 1 / 2 页：关面板 → 清空 → 点输入
    '_a': ("关闭来源(); 拍照输入.value = ''; 拍照输入.click();",
           "关闭来源(); window.全局相机.拍摄(拍照输入);"),
    # 8 / 9 / 10 / 11 页：统一走 挑()
    '_b': ("关来源(); 挑(拍照输入);",
           "关来源(); window.全局相机.拍摄(拍照输入);"),
}


def 插块(s, 名):
    """在 全局音乐 块之前插入 <script id="相机">"""
    锚 = re.search(r'^([ \t]*)<script id="全局音乐">', s, re.M)
    if not 锚:
        raise SystemExit('× %s 找不到 全局音乐 锚点' % 名)
    缩进 = 锚.group(1)
    块 = 缩进 + '<script id="相机">\n' + 源 + '\n' + 缩进 + '</script>\n\n'
    return s[:锚.start()] + 块 + s[锚.start():]


def 改(名):
    p = os.path.join(目录, 名)
    s = open(p, encoding='utf-8').read()
    原 = s

    # ---- 1) 插入内联块 ----
    if '<script id="相机">' not in s:
        s = 插块(s, 名)

    # ---- 2) 接上拍摄按钮 ----
    if 名 in ('1_shouyeyulan.html', '2_haoyouxinxi.html'):
        旧, 新 = 替换表['_a']
        if 旧 in s:
            s = s.replace(旧, 新, 1)
        elif 新 not in s:
            print('  ⚠ %s：没找到 1/2 页那行拍摄调用，跳过接线' % 名)

    elif 名 in ('8_wode.html', '9_zhutishezhi.html', '10_lunbotu.html', '11_woderenshe.html'):
        旧, 新 = 替换表['_b']
        if 旧 in s:
            s = s.replace(旧, 新, 1)
        elif 新 not in s:
            print('  ⚠ %s：没找到 8/9/10/11 页那行拍摄调用，跳过接线' % 名)

    elif 名 == '6_fabudongtai.html':
        旧 = "setTimeout(() => 选文件(类型, 动作 === '拍摄'), 220);"
        新 = ("/* ★ 图片走 相机.js（页内实时相机 + 权限处理）；\n"
              "                          视频仍走 capture input —— capture 对视频本就是「录像」，\n"
              "                          行为本来就对，没必要换成取景器。 */\n"
              "                    if (动作 === '拍摄' && 类型 === '图片') {\n"
              "                        setTimeout(() => window.全局相机.拍摄(null, {\n"
              "                            回调: f => 加入媒体('图片', [f]),\n"
              "                        }), 220);\n"
              "                    } else {\n"
              "                        setTimeout(() => 选文件(类型, 动作 === '拍摄'), 220);\n"
              "                    }")
        if 旧 in s:
            s = s.replace(旧, 新, 1)
        elif 'window.全局相机.拍摄' not in s:
            print('  ⚠ 6 页：没找到拍摄分支，跳过接线')

    if s == 原:
        print('  · %s：无变化' % 名)
        return False
    open(p, 'w', encoding='utf-8').write(s)
    print('  ✓ %s：已接入' % 名)
    return True


def 主():
    if '--check' in sys.argv:
        坏 = []
        for 名 in 页面:
            s = open(os.path.join(目录, 名), encoding='utf-8').read()
            if '<script id="相机">' not in s:
                坏.append((名, '缺内联块'))
            elif not re.search(r"全局相机\.拍摄\(\s*拍照输入\s*\)", s) and '全局相机.拍摄(null' not in s:
                坏.append((名, '拍摄按钮未接线'))
        if 坏:
            for 名, 因 in 坏:
                print('×', 名, '——', 因)
            return 1
        print('✓ 7 个页面都已内联相机模块并接好拍摄按钮')
        return 0

    for 名 in 页面:
        改(名)
    return 0


if __name__ == '__main__':
    sys.exit(主())
