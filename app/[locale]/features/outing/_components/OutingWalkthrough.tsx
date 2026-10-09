'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { f } from './feature-outing-css'

const SCENE_COUNT = 4
const ADVANCE_MS = 4000
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const reducedSnapshot = () => window.matchMedia(REDUCED_QUERY).matches
const reducedServerSnapshot = () => false

export interface WalkthroughCopy {
  steps: readonly { title: string; body: string }[]
  stepsLabel: string
  pause: string
  play: string
  /** Texts inside the aria-hidden phone. */
  mock: {
    nameFieldLabel: string
    createLabel: string
    chatMessage: string
    linkChip: string
    whoAreYou: string
    claimed: string
    expensesTitle: string
    splitEvenly: string
    settleTitle: string
  }
}

export interface WalkthroughData {
  outingName: string
  /** The four participants in display order; `member` = the two ledger members. */
  people: readonly { id: string; name: string; member: boolean }[]
  expenses: readonly { id: string; label: string; paidBy: string; amount: string }[]
  transfers: readonly { id: string; from: string; to: string; amount: string }[]
}

const delay = (n: number) => `fo-d${n}`

/**
 * The /features/outing walkthrough (#1633): a phone-frame illustration beside
 * the four steps. Server HTML (and a visit without JS) is scene 1's final frame
 * plus the complete step list, so the page reads without this island.
 *
 * Once hydrated: auto-advance every 4 s, but only while at least half of the
 * phone is on screen, never under prefers-reduced-motion, and never while the
 * visitor has paused it (WCAG 2.2.2: the pause control is visible). The step
 * buttons jump to their scene and restart the timer. Failure looks like
 * nothing breaking: the loop just keeps running off-screen, or keeps running
 * for someone who asked for no motion. Motion is CSS (feature-outing-css.ts),
 * gated on `data-live`, which this component sets only after the phone has
 * been seen and motion is allowed.
 */
export function OutingWalkthrough({ copy, data }: { copy: WalkthroughCopy; data: WalkthroughData }) {
  const [scene, setScene] = useState(0)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(false)
  const [seen, setSeen] = useState(false)
  const reduced = useSyncExternalStore(subscribeReduced, reducedSnapshot, reducedServerSnapshot)
  const phoneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = phoneRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting)
        if (entry.isIntersecting) setSeen(true)
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const running = seen && !reduced
  useEffect(() => {
    if (!running || !visible || paused) return
    const id = setTimeout(() => setScene((s) => (s + 1) % SCENE_COUNT), ADVANCE_MS)
    return () => clearTimeout(id)
  }, [running, visible, paused, scene])

  const { mock } = copy
  const nameChars = Array.from(data.outingName).map((c) => (c === ' ' ? ' ' : c))
  const cls = (i: number) => `${f.scene}${scene === i ? ' is-active' : ''}`

  return (
    <div className={`fo ${f.walk}`} data-live={running ? '' : undefined}>
      <div className={f.phoneWrap}>
        <div ref={phoneRef} className={f.phone} aria-hidden="true">
          {/* 1. Typing the outing name */}
          <div className={cls(0)}>
            <p className={`${f.label} text-xs`}>{mock.nameFieldLabel}</p>
            <div className={`${f.field} text-base`}>
              {nameChars.map((c, i) => (
                <span key={i} className={f.ch} style={{ animationDelay: `${300 + i * 90}ms` }}>
                  {c}
                </span>
              ))}
            </div>
            <div
              className={`${f.btn} text-sm font-medium`}
              style={{ animationDelay: `${500 + nameChars.length * 90}ms` }}
            >
              {mock.createLabel}
            </div>
          </div>

          {/* 2. The link moves into the group chat */}
          <div className={cls(1)}>
            <div className={f.card}>
              <p className="m-0 mb-2 text-sm font-medium text-ink">{data.outingName}</p>
              <span className={`${f.chip} text-xs`}>{mock.linkChip}</span>
            </div>
            <div className={f.chat}>
              <div className={f.bubble}>
                <p className="m-0 text-sm">{mock.chatMessage}</p>
                <span className={`${f.chip} ${f.flying} text-xs`}>{mock.linkChip}</span>
              </div>
            </div>
          </div>

          {/* 3. Names are claimed one by one */}
          <div className={cls(2)}>
            <p className="m-0 text-sm font-medium text-ink">{mock.whoAreYou}</p>
            <ul className={f.rows}>
              {data.people.map((p, i) => {
                const friendIndex = i - data.people.filter((q) => q.member).length
                return (
                  <li key={p.id} className={f.row}>
                    {p.member ? (
                      <span className={`${f.dot} ${f.dotOn}`} />
                    ) : (
                      <span className={f.dot}>
                        <span className={`${f.fill} ${delay(friendIndex === 0 ? 4 : 5)}`} />
                      </span>
                    )}
                    <span className={`${f.name} text-sm`}>{p.name}</span>
                    {!p.member && (
                      <span className={`${f.tag} ${f.a} ${delay(friendIndex === 0 ? 4 : 5)} text-xs`}>
                        {mock.claimed}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {/* 4. Expenses, then who pays whom */}
          <div className={cls(3)}>
            <p className={`${f.label} ${f.a} ${delay(0)} text-xs`}>
              {mock.expensesTitle} · {mock.splitEvenly}
            </p>
            <div>
              {data.expenses.map((e, i) => (
                <div key={e.id} className={`${f.e} ${f.a} ${delay(i + 1)}`}>
                  <div>
                    <p className="text-sm">{e.label}</p>
                    <p className="text-xs text-ink-3">{e.paidBy}</p>
                  </div>
                  <span className={`${f.amt} text-sm`}>{e.amount}</span>
                </div>
              ))}
            </div>
            <p className={`${f.label} ${f.a} ${delay(6)} text-xs`}>{mock.settleTitle}</p>
            <ul className={f.rows}>
              {data.transfers.map((t, i) => (
                <li key={t.id} className={`${f.row} ${f.a} ${delay(7 + i)}`}>
                  <span className={`${f.name} text-sm`}>
                    {t.from} → {t.to}
                  </span>
                  <span className={`${f.amt} text-sm`}>{t.amount}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <button
          type="button"
          className={`${f.ctl} text-sm outline-none focus-visible:oik-focus-ring`}
          onClick={() => setPaused((p) => !p)}
        >
          <svg className={f.ctlIcon} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            {paused ? <path d="M2 1l9 5-9 5z" /> : <path d="M2 1h3v10H2zM7 1h3v10H7z" />}
          </svg>
          {paused ? copy.play : copy.pause}
        </button>
      </div>

      <ol className={f.steps} aria-label={copy.stepsLabel}>
        {copy.steps.map((step, i) => (
          <li key={step.title} id={`step-${i + 1}`}>
            <button
              type="button"
              className={`${f.step} outline-none focus-visible:oik-focus-ring`}
              aria-current={scene === i ? 'step' : undefined}
              onClick={() => setScene(i)}
            >
              <span className={`${f.stepNum} bi-num text-base`} aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <span className={`${f.stepTitle} text-base font-medium`}>{step.title}</span>
                <span className={`${f.stepBody} text-sm`}>{step.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
