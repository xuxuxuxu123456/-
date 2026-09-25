#!/usr/bin/env bash
# 一键回归：跑全部验证脚本，任一失败即退出非零
#
# 用法：
#   ./run_all.sh              # 测本目录（脚本所在目录）下的页面
#   cd /data/workspace && ./run_all.sh
#
# 说明：verify_characters.js 已取代 4 份角色脚本（白九霄/埃洛温/陆沉渊/林彦），
#       但旧脚本仍保留并可跑，作为改动时的交叉验证。
# ★ 新增脚本务必加进下面的清单 —— 没进清单等于没进回归，永远不会被跑。

cd "$(dirname "$0")" || exit 1

# 默认测本目录里的页面（改动都在这里）；
# 旧脚本用相对路径读 HTML，靠 cd 保证与本目录一致；
# verify_characters / verify_dongtai 走 testkit，用 PAGES_DIR 指定。
export PAGES_DIR="${PAGES_DIR:-$(pwd)}"

total=0
failed=0
for f in verify_characters.js verify_dongtai.js verify_wode.js verify_permissions.js verify_liaotian.js verify_fabu.js verify.js verify_album_upload.js verify_crop_preview.js \
         verify_zhuti.js verify_upload_panel.js verify_return_from.js verify_wode_settings.js verify_woderenshe.js verify_preselect_avatar.js \
         verify_qunliao.js verify_qunziliao.js verify_function_pages.js verify_liaotian_tools.js verify_tuku.js verify_beibao.js \
         verify_css_vars.js verify_global_music.js verify_keyboard.js probe_crop_bug.js verify_wenbenAPI.js verify_tupianAPI.js verify_yinpinAPI.js verify_shanchu.js verify_beifen.js verify_yuedu.js \
         verify_baijiuxiao.js verify_elowen.js verify_luchenyuan.js verify_linyan.js; do
  [ -f "$f" ] || continue
  if out=$(node "$f" 2>&1); then
    n=$(printf '%s' "$out" | grep -c '✓')
    printf 'OK   %-28s %3s passed\n' "$f" "$n"
    total=$((total + n))
  else
    printf 'FAIL %-28s\n' "$f"
    printf '%s\n' "$out" | grep -E '✗|!' | head -5 | sed 's/^/       /'
    failed=$((failed + 1))
  fi
done

echo "--------------------------------------------"
echo "total assertions passed: $total"
if [ "$failed" -eq 0 ]; then
  echo "ALL GREEN"
  exit 0
fi
echo "$failed script(s) failed"
exit 1
