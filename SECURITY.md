# Security Policy

Futari（codebase: Oikos）是給兩個人一起記帳的服務。如果你發現安全問題，請私下告訴我們，不要公開。

Futari (codebase: Oikos) is a shared ledger for two people. If you find a security issue, please report it privately rather than in public.

## 回報方式 / How to report

請使用 GitHub 的私密漏洞回報：到這個 repo 的 **Security** 分頁，點 **Report a vulnerability**。只有維護者看得到回報內容。

Use GitHub private vulnerability reporting: open this repository's **Security** tab and choose **Report a vulnerability**. Only the maintainers can see the report.

請不要：

- 開公開 issue、PR 或討論串描述漏洞；
- 公開 PoC 或 exploit；
- 讀取、修改或刪除不屬於你的資料。只用你自己建立的帳號與帳本測試。

Please do not open a public issue, pull request or discussion about the vulnerability, publish a proof of concept, or access, modify or delete data that isn't yours. Test only with accounts and ledgers you created yourself.

回報時請盡量附上：影響範圍、重現步驟、受影響的網址或檔案，以及你觀察到的結果。

Helpful details: impact, steps to reproduce, affected URLs or files, and what you observed.

這是一個小團隊維護的專案，沒有漏洞獎金計畫。我們會盡快回覆並告知處理進度。

This project is maintained by a small team and has no bug bounty programme. We will reply as soon as we can and keep you updated on the fix.

## 範圍 / Scope

- 網站：`https://futari.southern-light.dev`
- iOS / Android App：它們是載入上述網站的 WebView 殼，網站的問題即是 App 的問題。
- 這個 repo 的程式碼。

The website at `https://futari.southern-light.dev`, the iOS / Android apps (WebView shells that load that website), and the code in this repository.

第三方服務（Supabase、Vercel、Google、Apple、Sentry、PostHog 等）本身的漏洞，請回報給該服務。

Vulnerabilities in third-party services (Supabase, Vercel, Google, Apple, Sentry, PostHog and others) should be reported to those services.

## 資料如何被保護 / How data is protected

以下是目前實際的做法，不是承諾更多：

- **傳輸**：連線以 HTTPS 加密。
- **儲存**：少數機敏欄位在寫入資料庫前，由伺服器以 AES-256-GCM 加密（`lib/crypto.ts`）：孩子的本名、身分證字號、健保卡號、車牌號碼、房屋地址，以及電子發票載具的驗證碼。金鑰由伺服器持有。
- **不是端對端加密。** 交易說明、金額、分類、備註等其餘記帳內容以明文儲存；伺服器可以解密上述加密欄位。

What is true today, and nothing more:

- **In transit**: connections are encrypted with HTTPS.
- **At rest**: a small set of sensitive fields is encrypted with AES-256-GCM by the server before being written to the database (`lib/crypto.ts`): a child's legal name, national ID number and health-insurance card number, a car's licence plate, a home address, and an e-invoice carrier verification code. The server holds the key.
- **This is not end-to-end encryption.** The rest of the ledger (descriptions, amounts, categories, notes) is stored as plain text, and the server can decrypt the encrypted fields.
