#!/usr/bin/env bash
# iOS launch smoke（#1476）：archive 之後、上傳之前，確認殼在最新 iOS runtime 上真的開得起來。
#
# 為什麼存在：2026-09-29 的 1.5.18 (5) 用 Xcode 27 / iOS 27 SDK 建，archive、export、upload 全綠，
# 但在 iOS 27 上一開就閃退（"UIScene life cycle is required for apps built with this SDK."）。
# 流程裡沒有任何一步會真的啟動 app。
#
# 做的事：Release + iphonesimulator + 最新 SDK 建同一份原始碼 → 在「最新已安裝 iOS runtime」的專用模擬器
# 安裝並啟動 → 等 >=10 秒確認 process 還活著 → 查 log → 輪詢截圖直到 WebView 畫出非純色內容（全新模擬器約 60 秒）。
# 任何一項失敗 exit 1 並印出原因；上傳不得進行。
#
# 用法（repo root，已跑過 `npx cap sync ios`）：
#   scripts/native/ios-launch-smoke.sh
# 環境變數：SMOKE_OUT（輸出目錄，預設 mktemp）、SMOKE_WAIT（存活等待秒數，預設 12，下限 10）、SMOKE_RENDER_TIMEOUT（等畫面渲染，預設 90）
#
# 只動名為 "futari-launch-smoke-<runtime>" 的專用模擬器（每次刪除重建、結束時關機並刪除）；不碰其他模擬器。
set -u

BUNDLE_ID="dev.southernlight.futari"
PROCESS_NAME="App"
WAIT="${SMOKE_WAIT:-12}"
[ "$WAIT" -ge 10 ] || WAIT=10
OUT="${SMOKE_OUT:-$(mktemp -d -t futari-launch-smoke)}"
mkdir -p "$OUT"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UDID=""

fail() { echo "SMOKE FAIL: $*" >&2; echo "  artifacts: $OUT" >&2; exit 1; }
cleanup() {
  if [ -n "$UDID" ]; then
    xcrun simctl shutdown "$UDID" >/dev/null 2>&1
    xcrun simctl delete "$UDID" >/dev/null 2>&1
  fi
}
trap cleanup EXIT

[ -d "$ROOT/ios/App/App/public" ] || fail "ios/App/App/public 不存在——先跑 \`npx cap sync ios\`（否則 build 會失敗於 'The file \"public\" couldn't be opened'）"

# --- 1. 最新已安裝 iOS runtime + 最新的 iPhone 機型 ---
PICK=$(xcrun simctl list runtimes -j | python3 -c '
import json,sys,re
rs=[r for r in json.load(sys.stdin)["runtimes"] if r.get("isAvailable") and r["identifier"].startswith("com.apple.CoreSimulator.SimRuntime.iOS-")]
if not rs: sys.exit(1)
r=max(rs,key=lambda r:[int(x) for x in r["version"].split(".")])
ds=[d for d in r["supportedDeviceTypes"] if re.fullmatch(r"iPhone \d+",d["name"])]
d=max(ds,key=lambda d:int(d["name"].split()[1]))
print(r["identifier"],r["version"],d["identifier"])
') || fail "找不到可用的 iOS runtime——新 runtime 要先 \`xcodebuild -downloadPlatform iOS\`（約 8 GB）"
read -r RUNTIME_ID RUNTIME_VER DEVTYPE <<< "$PICK"
echo "runtime: iOS $RUNTIME_VER ($RUNTIME_ID)  device type: $DEVTYPE"

NAME="futari-launch-smoke-$RUNTIME_VER"
OLD=$(xcrun simctl list devices -j | python3 -c '
import json,sys
n=sys.argv[1]
for ds in json.load(sys.stdin)["devices"].values():
  for d in ds:
    if d["name"]==n: print(d["udid"])' "$NAME")
for old in $OLD; do
  xcrun simctl shutdown "$old" >/dev/null 2>&1
  xcrun simctl delete "$old" >/dev/null 2>&1
done
UDID=$(xcrun simctl create "$NAME" "$DEVTYPE" "$RUNTIME_ID") || fail "建立模擬器失敗"

# --- 2. Release / iphonesimulator / 最新 SDK ---
echo "building (Release, iphonesimulator)…"
DD="$OUT/dd"
if ! xcodebuild -project "$ROOT/ios/App/App.xcodeproj" -scheme App -configuration Release \
  -sdk iphonesimulator -destination "id=$UDID" -derivedDataPath "$DD" \
  CODE_SIGNING_ALLOWED=NO build > "$OUT/xcodebuild.log" 2>&1; then
  grep -E 'error:' "$OUT/xcodebuild.log" | sort -u | head -10 >&2
  fail "xcodebuild 失敗（完整 log：$OUT/xcodebuild.log）"
fi
APP="$DD/Build/Products/Release-iphonesimulator/App.app"
[ -d "$APP" ] || fail "找不到 build 產物 $APP"

# --- 3. 安裝、啟動、等待 ---
xcrun simctl boot "$UDID" || fail "模擬器開機失敗"
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || fail "模擬器未完成開機"
xcrun simctl install "$UDID" "$APP" || fail "安裝失敗"
START="$(date '+%Y-%m-%d %H:%M:%S')"
LAUNCH_OUT=$(xcrun simctl launch "$UDID" "$BUNDLE_ID" 2>&1) || fail "launch 指令失敗：$LAUNCH_OUT"
echo "launched: $LAUNCH_OUT; waiting ${WAIT}s…"
sleep "$WAIT"

# --- 4. 檢查 ---
FAILED=0

# 4a. process 還活著（launchctl 的 PID 欄是數字；已死的是 "-"）
LIVE=$(xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | awk -v b="UIKitApplication:$BUNDLE_ID" 'index($0,b){print $1}' | grep -E '^[0-9]+$' | head -1)
if [ -n "$LIVE" ]; then
  echo "OK   process alive after ${WAIT}s (pid $LIVE)"
else
  echo "FAIL process $BUNDLE_ID 不在執行中（啟動後 ${WAIT}s 內已結束）" >&2
  FAILED=1
fi

# 4b. log。process 活著不代表沒問題，所以兩層：
#   - 致命訊息（任何 process；UIScene 那類由 UIKit/FrontBoard 發出）：failed to launch / UIScene life cycle is required → 失敗
#   - App process 自己的 error/fault：只列數量與前幾筆，不判失敗（模擬器上 UIKeyboard、CA Event、
#     "Could not resolve UID for user mobile" 之類是常態雜訊，把它們當失敗會讓 gate 永遠紅、很快被人關掉）
PRED="(process == \"$PROCESS_NAME\" AND (messageType == error OR messageType == fault)) OR eventMessage CONTAINS[c] \"failed to launch\" OR eventMessage CONTAINS[c] \"UIScene life cycle is required\""
xcrun simctl spawn "$UDID" log show --start "$START" --style compact --predicate "$PRED" > "$OUT/log-errors.txt" 2>&1
FATAL=$(grep -E 'failed to launch|UIScene life cycle is required' "$OUT/log-errors.txt" | grep -v ' log\[' | head -5)
NERR=$(grep -cE ' E  App\[' "$OUT/log-errors.txt")
NFAULT=$(grep -cE ' F  App\[' "$OUT/log-errors.txt")
if [ -n "$FATAL" ]; then
  echo "FAIL log 內有啟動失敗訊息（$OUT/log-errors.txt）：" >&2
  echo "$FATAL" | cut -c1-400 >&2
  FAILED=1
else
  echo "OK   log 沒有啟動失敗訊息（App process error=${NERR} fault=${NFAULT}，列在 ${OUT}/log-errors.txt，僅供參考）"
fi

# 4c. WebView 真的畫出東西：輪詢截圖直到「中段區域」不是純色（預設每 5 秒、最多 RENDER_TIMEOUT=90 秒）。
#     全新模擬器第一次啟動，WebView 要 ~60 秒才畫出 prod（12 秒時是黑的、30 秒時是灰的，build 本身沒問題），
#     所以不能只在 12 秒拍一張。只看畫面中段（略過狀態列時鐘）的不同顏色數；落地頁有插圖，遠超門檻，純色頁只有 1 色。
SHOT="$OUT/launch.png"
RENDER_TIMEOUT="${SMOKE_RENDER_TIMEOUT:-90}"
colors() {
  sips -s format bmp "$1" --out "$1.bmp" >/dev/null 2>&1 || { echo 0; return; }
  python3 - "$1.bmp" <<'PY'
import struct,sys
d=open(sys.argv[1],'rb').read()
off=struct.unpack_from('<I',d,10)[0]; w,h=struct.unpack_from('<ii',d,18); bpp=struct.unpack_from('<H',d,28)[0]
Bpp=bpp//8; row=(w*Bpp+3)//4*4; h=abs(h)
seen=set()
for y in range(int(h*.2),int(h*.8),6):
    base=off+y*row
    for x in range(0,w,6):
        seen.add(d[base+x*Bpp:base+x*Bpp+3])
print(len(seen))
PY
}
RENDERED=0; WAITED=0
while [ "$FAILED" -eq 0 ]; do
  xcrun simctl io "$UDID" screenshot "$SHOT" >/dev/null 2>&1
  N=$( [ -s "$SHOT" ] && colors "$SHOT" || echo 0 )
  rm -f "$SHOT.bmp"
  if [ "${N:-0}" -ge 50 ]; then RENDERED=1; break; fi
  [ "$WAITED" -ge "$RENDER_TIMEOUT" ] && break
  sleep 5; WAITED=$((WAITED+5))
done
if [ "$FAILED" -ne 0 ]; then
  xcrun simctl io "$UDID" screenshot "$SHOT" >/dev/null 2>&1
  echo "（前面已失敗，略過渲染檢查；失敗當下的畫面：${SHOT}）"
elif [ "$RENDERED" -eq 1 ]; then
  echo "OK   WebView 已畫出內容（中段 ${N} 色，啟動後約 $((WAIT+WAITED))s）"
  echo "screenshot: $SHOT  <- 仍請看一眼：要是 https://futari.southern-light.dev 的 Futari 頁面，不是系統錯誤頁／離線頁"
else
  echo "FAIL ${RENDER_TIMEOUT}s 內畫面仍是純色（中段 ${N:-0} 色）：WebView 沒載入內容（${SHOT}）" >&2
  FAILED=1
fi
# process 在輪詢期間也不能死
if [ "$FAILED" -eq 0 ] && ! xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | awk -v b="UIKitApplication:$BUNDLE_ID" 'index($0,b){print $1}' | grep -qE '^[0-9]+$'; then
  echo "FAIL process 在等待畫面期間結束" >&2; FAILED=1
fi

[ "$FAILED" -eq 0 ] || fail "launch smoke 未通過——不要上傳"
echo "SMOKE PASS (iOS $RUNTIME_VER)；還需看一眼截圖：$SHOT"
