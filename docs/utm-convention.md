# 跨產品外連 UTM Convention

> 落地實作：`lib/utm.ts`（issue #954）。改動 convention 時兩邊同步。

Southern Light 旗下產品（Futari / Wildcard / blog）共用 GA（`G-YHXFBMRQ3S`）
做 Ko-fi 收益與跨產品流量的來源歸因。所有連往自家其他屬性的 outbound link
一律經 `withUtm()` 蓋章，不手寫 query string。

## 參數表

| 參數 | 值 | 意義 |
|---|---|---|
| `utm_source` | `futari_app` | 從 Futari 登入後的 app 內發出 |
| | `futari_landing` | 從 Futari 公開頁（landing / sign-in）發出 |
| | `wildcard` | 從 Wildcard 發出（wildcard repo 實作） |
| | `blog` | 從 southern-light.dev blog 發出（blog 端實作） |
| `utm_medium` | `kofi_widget` | Ko-fi 贊助 widget |
| | `footer_link` | 頁尾連結 |
| | `setting_link` | 設定頁連結 |
| | `blog_section` | sign-in 頁 dev-log 區塊 |
| `utm_campaign` | （留空） | 只在特定活動才帶 |

## 與 GA event 的分工

- **UTM = 跨站流量歸因**：只有「離開本站、落到另一個自家 GA 屬性」的連結需要。
- **GA event = 站內互動歸因**：無法掛 UTM 的互動走 event，
  如 `components/KofiWidget.tsx` 的 `kofi_widget_click`（Ko-fi overlay 的
  URL 由其 script 內部組裝，我們碰不到）。
- 兩者不互相取代：Ko-fi 點擊看 GA event；blog 回流看 UTM。

## 目前落地面

| Surface | source / medium | 檔案 |
|---|---|---|
| sign-in 頁 blog 卡片 → southern-light.dev | `futari_landing` / `blog_section` | `app/[locale]/sign-in/BlogSection.tsx` |

新增 outbound 面（footer、設定頁「支持我們」等）時：從 `lib/utm.ts` 的
`UTM_MEDIUMS` 挑或新增 medium，並回填上表。

## 不掛 UTM 的外連

- GitHub issue 連結（terms / privacy 頁）：GitHub 不是自家 GA 屬性，掛了也看不到。
- 認證供應商（Google / Apple）、PostHog proxy：功能性連線，非流量歸因對象。
