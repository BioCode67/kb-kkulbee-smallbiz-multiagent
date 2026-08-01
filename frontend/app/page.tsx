'use client';

/**
 * 꿀비 대시보드
 *
 * 화면의 순서를 사장님이 실제로 겪는 순서에 맞췄습니다. 먼저 무엇을 물을 수
 * 있는지 보이고, 물으면 꿀비가 반응하고, 답과 근거가 카드로 펼쳐집니다.
 *
 * 왼쪽은 3D 꿀비가 고정으로 있습니다. 스크롤을 내려도 따라오게 두었는데,
 * 대화가 길어져도 "누가 답하고 있는지"가 사라지지 않아야 하기 때문입니다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import BentoGrid from '@/components/BentoGrid';
import SplineCanvas from '@/components/SplineCanvas';
import type { CharacterMotion, ChatResponse } from '@/lib/types';

const SAMPLES = [
  '연남동에서 카페 열려는데 상권 어때?',
  '창업자금 5천만원 대출 알아보고 있어요',
  '대출 설명을 제대로 못 들었는데 이의제기 되나요?',
  '성수동 자리도 보고 자금도 같이 알아봐줘',
];

const AGENT_LABEL: Record<string, string> = {
  router: '길잡이',
  location: '상권 분석',
  policy: '자금 매칭',
  protection: '소비자 보호',
  guardrail: '금소법 검사',
};

export default function Page() {
  const [input, setInput] = useState('');
  const [res, setRes] = useState<ChatResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [motion_, setMotion] = useState<CharacterMotion>('fly_happy');
  const resultRef = useRef<HTMLDivElement>(null);

  const ask = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError('');
    setMotion('thinking');
    try {
      const r = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, session_id: res?.session_id ?? null }),
      });
      if (!r.ok) throw new Error(`서버가 ${r.status}로 응답했습니다`);
      const data: ChatResponse = await r.json();
      setRes(data);
      setMotion(data.character_motion);
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결하지 못했습니다');
      setMotion('explaining');
    } finally {
      setLoading(false);
    }
  }, [loading, res?.session_id]);

  // 답이 오면 결과 쪽으로 부드럽게 내려갑니다
  useEffect(() => {
    if (res && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [res]);

  return (
    <main className="mx-auto max-w-[1240px] px-5 pb-24 pt-8 lg:px-8">
      <Header />

      <div className="mt-8 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── 왼쪽: 꿀비 ── */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="glass overflow-hidden">
            <SplineCanvas motion={motion_} className="h-[280px] w-full" />
            <div className="border-t border-white/[.07] px-5 py-4">
              <p className="text-[13px] font-bold text-white">꿀비</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/[.45]">
                꿀정보 모아주는 AI 비서. 상권·자금·권리를 한자리에서 살펴 드립니다.
              </p>
            </div>
          </div>

          {res && <AgentTrace res={res} />}
        </aside>

        {/* ── 오른쪽: 대화와 결과 ── */}
        <section className="min-w-0">
          <AskBox
            value={input}
            onChange={setInput}
            onSubmit={() => { ask(input); setInput(''); }}
            loading={loading}
          />

          {!res && !loading && <Samples onPick={(q) => ask(q)} />}

          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                key="err"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-[12.5px]
                           text-rose-200 ring-1 ring-rose-400/25"
              >
                {error}
                <span className="mt-1 block text-[11.5px] text-rose-200/60">
                  백엔드를 먼저 실행하세요 — <code className="font-mono">uvicorn app.main:app --port 8000</code>
                </span>
              </motion.p>
            )}
          </AnimatePresence>

          {loading && <Thinking />}

          <div ref={resultRef}>
            {res && !loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 space-y-5"
              >
                <Answer text={res.answer} elapsed={res.elapsed_ms} />
                <BentoGrid cards={res.cards} />
              </motion.div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

/* ── 머리 ──────────────────────────────────────────────────────────────── */
function Header() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-kb-yellow">
          KB AI Challenge 2026
        </p>
        <h1 className="mt-2 text-[30px] font-extrabold leading-[1.15] tracking-tight
                       text-white sm:text-[38px]">
          사장님, 어디에 열지<br className="sm:hidden" />
          <span className="text-kb-yellow"> 저랑 같이 보실래요?</span>
        </h1>
        <p className="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-white/50">
          상권 점수만 던지지 않습니다. 무엇이 그 점수를 만들었는지, 어떤 자금을
          쓸 수 있는지, 억울한 일이 생기면 어떻게 하는지까지 함께 봅니다.
        </p>
      </div>

      <div className="flex gap-2">
        {['최적 입지', '정책자금', '소비자 보호'].map((t, i) => (
          <span
            key={t}
            className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5
                       text-[11.5px] text-white/[.55]"
          >
            Pick {i + 2} · {t}
          </span>
        ))}
      </div>
    </header>
  );
}

/* ── 입력 ──────────────────────────────────────────────────────────────── */
function AskBox({ value, onChange, onSubmit, loading }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="glass flex items-center gap-2 p-2 focus-within:ring-kb-yellow/[.35]">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSubmit(); }}
        placeholder="어디에 열지, 자금은 어떻게, 무엇이 궁금하세요?"
        disabled={loading}
        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[14px] text-white
                   placeholder:text-white/30 focus:outline-none disabled:opacity-50"
      />
      <button
        onClick={onSubmit}
        disabled={loading || !value.trim()}
        className="shrink-0 rounded-xl bg-kb-yellow px-5 py-3 text-[13.5px] font-bold
                   text-kb-ink transition hover:brightness-105 active:translate-y-px
                   disabled:cursor-not-allowed disabled:opacity-35"
      >
        {loading ? '생각 중…' : '물어보기'}
      </button>
    </div>
  );
}

function Samples({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mt-4">
      <p className="mb-2.5 text-[11.5px] text-white/[.35]">이렇게 물어보셔도 됩니다</p>
      <div className="flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <button key={s} onClick={() => onPick(s)} className="chip">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── 대기 ──────────────────────────────────────────────────────────────── */
function Thinking() {
  return (
    <div className="mt-6 space-y-3">
      <div className="glass h-[86px] animate-pulse" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="glass h-[180px] animate-pulse" />
        <div className="glass h-[180px] animate-pulse md:col-span-2" />
      </div>
    </div>
  );
}

/* ── 답 ────────────────────────────────────────────────────────────────── */
function Answer({ text, elapsed }: { text: string; elapsed: number }) {
  const [body, ...notes] = text.split('\n\n· ');
  return (
    <div className="glass p-5">
      <div className="space-y-2.5">
        {body.split('\n').filter(Boolean).map((line, i) => (
          <p key={i} className="text-[14px] leading-[1.75] text-white/[.85]">{line}</p>
        ))}
      </div>

      {/* 금소법 고지 — 본문과 섞이지 않게 눌러서 아래에 둡니다 */}
      {notes.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-white/[.07] pt-3">
          {notes.map((n, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-white/[.35]">· {n}</li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-right text-[10.5px] text-white/25">
        {elapsed}ms 만에 답했어요
      </p>
    </div>
  );
}

/* ── 어느 에이전트가 돌았는지 ──────────────────────────────────────────── */
function AgentTrace({ res }: { res: ChatResponse }) {
  return (
    <div className="glass mt-4 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
        거쳐 간 에이전트
      </p>
      <ol className="mt-2.5 space-y-1.5">
        {res.agent_trace.map((a, i) => (
          <li key={`${a}-${i}`} className="flex items-center gap-2 text-[12px]">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full
                             bg-kb-yellow/20 text-[9px] font-bold text-kb-yellow">
              {i + 1}
            </span>
            <span className={a === 'guardrail' ? 'text-rose-200/80' : 'text-white/[.65]'}>
              {AGENT_LABEL[a] ?? a}
            </span>
          </li>
        ))}
      </ol>

      {res.guardrail && (
        <p className={`mt-3 rounded-lg px-2.5 py-2 text-[11px] leading-snug ${
          res.guardrail.passed
            ? 'bg-emerald-400/10 text-emerald-200/75'
            : 'bg-rose-400/10 text-rose-200/80'}`}>
          {res.guardrail.passed
            ? '금소법 위반 표현 없음'
            : `단정 표현 ${res.guardrail.violations.length}건을 고쳐 내보냈습니다`}
        </p>
      )}
    </div>
  );
}
