-- v0.15.2 #163 — PartnerQuiz: 雙人異步問答儀式，第一次月度回顧入口觸發。
-- 6 題池抽 3，兩人各自獨立作答，6 列 answers 齊全時 revealed_at 寫入。
--
-- Design notes:
--   * UNIQUE (group_id) — MVP 一組只跑一次 quiz。未來放寬只需移除這個 constraint。
--   * `question_keys` 持久化抽中的 3 題 key，重進作答頁不會抽到不同題目。
--   * Keys (question_key / choice_key) 是 i18n dictionary key — append-only、不 rename；
--     文案改進透過 i18n locale 改寫，全 group 同步生效。

-- ─── PartnerQuizSessions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PartnerQuizSessions" (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL UNIQUE REFERENCES "OikosGroups"(id),
  question_keys   text[] NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  revealed_at     timestamptz
);

-- ─── PartnerQuizAnswers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PartnerQuizAnswers" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES "PartnerQuizSessions"(id),
  member_id     uuid NOT NULL REFERENCES "Profiles"(id),
  question_key  text NOT NULL,
  choice_key    text NOT NULL,
  answered_at   timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_quiz_answer_unique UNIQUE (session_id, member_id, question_key)
);

CREATE INDEX IF NOT EXISTS "partner_quiz_answer_session_idx"
  ON "PartnerQuizAnswers" (session_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE "PartnerQuizSessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_quiz_session_member_select" ON "PartnerQuizSessions";
CREATE POLICY "partner_quiz_session_member_select" ON "PartnerQuizSessions" FOR SELECT
  USING (group_id IN (
    SELECT id FROM "OikosGroups" WHERE member_a = auth.uid() OR member_b = auth.uid()
  ));

ALTER TABLE "PartnerQuizAnswers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_quiz_answer_member_select" ON "PartnerQuizAnswers";
CREATE POLICY "partner_quiz_answer_member_select" ON "PartnerQuizAnswers" FOR SELECT
  USING (session_id IN (
    SELECT s.id FROM "PartnerQuizSessions" s
    JOIN "OikosGroups" g ON g.id = s.group_id
    WHERE g.member_a = auth.uid() OR g.member_b = auth.uid()
  ));
