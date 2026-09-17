import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'

// #1275: proxy 對任何 `/<locale>/...` 略過 getUser()（見 proxy.ts 與
// lib/i18n/path.ts › isLocalePrefixedPath）。這只在「app/[locale] 底下只有
// public 頁」時成立。這份測試把那個假設變成紅燈。
//
// 失效的樣子：有人在 app/[locale] 放了需要登入的頁或 route handler——build 過、
// 頁面看起來也正常，但 proxy 不再替它 refresh session、未登入也不導轉；
// 錯誤只會在 session 過期的那一刻以「莫名被登出」或空資料出現。
// 真的需要把 auth 頁放進 [locale]，要先改 proxy 的 auth-skip，不是改這份測試。

const ROOT = join(process.cwd(), 'app', '[locale]')

function walk(dir: string): { files: string[]; dirs: string[] } {
  const files: string[] = []
  const dirs: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      dirs.push(full)
      const sub = walk(full)
      files.push(...sub.files)
      dirs.push(...sub.dirs)
    } else {
      files.push(full)
    }
  }
  return { files, dirs }
}

const { files, dirs } = walk(ROOT)
const rel = (p: string) => relative(process.cwd(), p)

// 只看 import / require / dynamic import，註解裡提到名字不算。
const AUTH_IMPORT =
  /(?:^|\n)\s*import\s[^;]*?(?:\bgetCurrentUser\b[^;]*?from|from)\s*['"]@\/lib\/supabase\/server['"]|import\s*\{[^}]*\bgetCurrentUser\b[^}]*\}\s*from|(?:require|import)\(\s*['"]@\/lib\/supabase\/server['"]\s*\)/

describe('app/[locale] is public-only (#1275)', () => {
  it('walks a non-empty tree', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('has no route handlers', () => {
    const offenders = files.filter((f) => /^route\.(?:ts|tsx|js|jsx)$/.test(f.split(/[\\/]/).pop()!))
    expect(offenders.map(rel)).toEqual([])
  })

  it('has no catch-all segments', () => {
    const offenders = dirs.filter((d) => {
      const name = d.split(/[\\/]/).pop()!
      return name.startsWith('[...') || name.startsWith('[[...')
    })
    expect(offenders.map(rel)).toEqual([])
  })

  it('never imports server-side auth (getCurrentUser / @/lib/supabase/server)', () => {
    const offenders = files
      .filter((f) => /\.(?:ts|tsx|js|jsx)$/.test(f))
      .filter((f) => AUTH_IMPORT.test(readFileSync(f, 'utf8')))
    expect(offenders.map(rel)).toEqual([])
  })

  it('the import matcher actually catches the patterns it guards', () => {
    expect(AUTH_IMPORT.test(`import { getCurrentUser } from '@/lib/supabase/server'`)).toBe(true)
    expect(AUTH_IMPORT.test(`import { createClient } from '@/lib/supabase/server'`)).toBe(true)
    expect(AUTH_IMPORT.test(`import {\n  getCurrentUser,\n} from '@/lib/somewhere-else'`)).toBe(true)
    expect(AUTH_IMPORT.test(`const m = await import('@/lib/supabase/server')`)).toBe(true)
    expect(AUTH_IMPORT.test(`// Dropping the server getCurrentUser() here`)).toBe(false)
    expect(AUTH_IMPORT.test(`import { createClient } from '@/lib/supabase/client'`)).toBe(false)
  })
})
