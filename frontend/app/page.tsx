'use client';

/**
 * 꿀비 — 소상공인 사장님 곁의 AI 비서
 *
 * 화면이 두 국면으로 움직입니다.
 *
 *   ① 처음 — 꿀비가 화면 한가운데 크게 서서 말을 겁니다. 무엇을 물어도 되는지
 *            이 아이가 직접 알려 줍니다. 대시보드를 먼저 보여 주면 사장님은
 *            어디부터 봐야 할지 모릅니다.
 *   ② 답한 뒤 — 꿀비가 왼쪽으로 물러나 작아지고, 결과가 자리를 넓게 씁니다.
 *            사라지지는 않습니다. 스크롤을 내려도 따라오며 계속 말을 겁니다.
 *
 * 두 국면 사이를 레이아웃 애니메이션으로 잇습니다. 화면이 갈아 끼워지는 게
 * 아니라 꿀비가 걸어서 옮겨 가는 것처럼 보여야 합니다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import BentoGrid from '@/components/BentoGrid';
import BeeStage from '@/components/BeeStage';
import TopBar from '@/components/TopBar';
import MyShop, { type ShopProfile } from '@/components/MyShop';
import BreakEven from '@/components/BreakEven';
import BeeChatbot from '@/components/BeeChatbot';
import SiteFooter from '@/components/SiteFooter';
import type { CharacterMotion, ChatResponse } from '@/lib/types';

/**
 * 다섯 가지 도움 — 첫 화면의 선택 배너.
 *
 * 빈 입력창 하나만 두면 "무엇을 물어도 되는지"를 사용자가 알아내야 합니다.
 * 할 수 있는 일을 다섯 갈래로 펼쳐 두고, 하나를 고르면 그 갈래의 예시
 * 질문이 바뀝니다. 고르는 행위 자체가 서비스의 범위를 가르쳐 줍니다.
 */
const MODES = [
  {
    key: 'location', icon: 'pin', label: '입지 진단',
    desc: '이 자리, 괜찮을까',
    placeholder: '동네와 업종을 말씀해 주세요 — 예) 연남동 카페',
    samples: [
      '연남동에서 카페 열려는데 상권 어때?',
      '성수동 술집 자리 괜찮아?',
      '부전동에서 미용실 하려는데 경쟁 심해?',
    ],
  },
  {
    key: 'gap', icon: 'compass', label: '기회 업종',
    desc: '여기엔 뭐가 부족할까',
    placeholder: '동네를 말씀해 주세요 — 무엇이 비어 있는지 찾아봅니다',
    samples: [
      '연남동에 어떤 업종이 부족해?',
      '역삼동 상권에 빈 자리가 있을까?',
      '우리 동네에서 뭘 하면 좋을까? 제주시 연동이야',
    ],
  },
  {
    key: 'policy', icon: 'coin', label: '자금 찾기',
    desc: '정책자금·지원사업',
    placeholder: '상황을 그대로 말씀하세요 — 제도 이름은 몰라도 됩니다',
    samples: [
      '장사가 안돼서 운영자금이 급해요',
      '창업자금 5천만원 대출 알아보고 있어요',
      '가게 인테리어 고치는 데 지원되는 게 있나요?',
    ],
  },
  {
    key: 'protection', icon: 'shield', label: '권리 지키기',
    desc: '분쟁·부당한 일',
    placeholder: '겪으신 일을 말씀해 주세요 — 절차와 근거 규정을 찾아 드립니다',
    samples: [
      '대출 설명을 제대로 못 들었는데 이의제기 되나요?',
      '미리 갚는데 왜 수수료를 떼나요?',
      '연체됐는데 독촉 전화가 너무 심해요',
    ],
  },
  {
    key: 'all', icon: 'bee', label: '한 번에',
    desc: '자리도 돈도 같이',
    placeholder: '여러 가지를 한 문장에 물어보셔도 됩니다',
    samples: [
      '성수동 자리도 보고 자금도 같이 알아봐줘',
      '연남동에서 빵집 열 건데 상권이랑 지원사업 다 알려줘',
      '홍대에서 치킨집, 자리 경쟁이랑 창업자금 어때?',
    ],
  },
];

/** 배너 아이콘 — 이모지는 기기 글꼴에 따라 네모로 나오므로 SVG로 그립니다. */
function ModeIcon({ name, on }: { name: string; on: boolean }) {
  const c = on ? '#FFBC00' : 'rgba(255,255,255,.55)';
  const p = { fill: 'none', stroke: c, strokeWidth: 1.8,
              strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      {name === 'pin' && (<>
        <path {...p} d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 1 1 13 0c0 4.6-6.5 10-6.5 10Z" />
        <circle {...p} cx="12" cy="10.5" r="2.4" />
      </>)}
      {name === 'compass' && (<>
        <circle {...p} cx="12" cy="12" r="8.5" />
        <path fill={c} d="m14.8 9.2-1.9 4.4-4.4 1.9 1.9-4.4z" />
      </>)}
      {name === 'coin' && (<>
        <circle {...p} cx="12" cy="12" r="8.5" />
        <path {...p} d="M12 7.5v9M9.2 9.8c.6-.9 1.6-1.4 2.8-1.4 1.7 0 2.9.8 2.9 2s-1 1.7-2.9 2.1c-1.9.4-2.9 1-2.9 2.1s1.2 2 2.9 2c1.2 0 2.2-.5 2.8-1.4" />
      </>)}
      {name === 'shield' && (<>
        <path {...p} d="M12 3.5 5 6v5.2c0 4.3 2.9 7.6 7 9.3 4.1-1.7 7-5 7-9.3V6Z" />
        <path {...p} d="m8.8 12 2.2 2.2 4.2-4.4" />
      </>)}
      {name === 'bee' && (<>
        <ellipse {...p} cx="12" cy="13.5" rx="5.2" ry="6" />
        <path {...p} d="M8.6 11.4h6.8M8.4 14h7.2M9 16.5h6M9.5 8.2 8 5.6M14.5 8.2 16 5.6" />
        <path {...p} d="M6.8 12.5C4.6 12 3.4 10.6 3.8 9.3c.4-1.2 2.2-1.4 3.9-.3M17.2 12.5c2.2-.5 3.4-1.9 3-3.2-.4-1.2-2.2-1.4-3.9-.3" />
      </>)}
    </svg>
  );
}

const AGENT_LABEL: Record<string, string> = {
  router: '질문 알아듣기', location: '동네 분석', policy: '지원금 찾기',
  protection: '권리 확인', guardrail: '표현 안전 검사(금소법)',
};

const GREETING = '안녕하세요 사장님! 무엇이 궁금하세요?';

export default function Page() {
  const [input, setInput] = useState('');
  // 대화는 쌓입니다. 새 질문이 이전 답을 지우면 "그럼 자금은?"이라고
  // 물은 뒤 방금 본 상권 점수를 다시 볼 수 없습니다 — 상담이 아니라
  // 검색창입니다. 질문과 답의 쌍을 차례로 남깁니다.
  const [history, setHistory] = useState<{ q: string; res: ChatResponse }[]>([]);
  const res = history.length ? history[history.length - 1].res : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mood, setMood] = useState<CharacterMotion>('fly_happy');
  const [speech, setSpeech] = useState(GREETING);
  const [mode, setMode] = useState(0);
  // 내 가게 — 등록해 두면 모든 질문에 동네·업종이 자동으로 붙습니다.
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const hero = !res && !loading;

  // 딥링크 — ?q=연남동+카페 로 접속하면 그 질문이 바로 실행됩니다.
  // 심사위원께 "이 링크를 여세요" 한 줄로 시연 장면을 보낼 수 있고,
  // 사장님끼리 결과를 카톡으로 넘길 수 있습니다. 정적 내보내기라
  // 서버 라우팅 없이 주소만 읽습니다.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const q = new URLSearchParams(window.location.search).get('q');
    if (q?.trim()) ask(q.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError('');
    setMood('thinking');
    setSpeech('잠깐만요, 자료를 살펴볼게요…');
    // 무료 서버는 15분 놀면 잠들고 깨는 데 수십 초가 걸립니다. 이유를
    // 모른 채 기다리는 것과 알고 기다리는 것은 전혀 다른 경험입니다.
    const slowTimer = setTimeout(() => {
      setSpeech('무료 서버가 기지개를 켜는 중이에요. 처음 한 번만 이래요!');
    }, 3000);
    try {
      const r = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q, session_id: res?.session_id ?? null,
          // 내 가게가 등록돼 있으면 매 질문에 자동으로 붙습니다.
          region: shop?.region || null, industry: shop?.industry || null,
        }),
      });
      if (!r.ok) throw new Error(`서버가 ${r.status}로 응답했습니다`);
      const data: ChatResponse = await r.json();
      setHistory((h) => [...h.slice(-7), { q, res: data }]);
      // 좋은 소식은 몸으로도 알립니다. S·A등급이면 꿀색 종이가 잠깐 흩날립니다.
      // 장난 같지만, 점수를 "받았다"는 감각을 만드는 것은 이런 2초입니다.
      if (data.location && (data.location.grade === 'S' || data.location.grade === 'A')) {
        import('canvas-confetti').then(({ default: confetti }) => {
          confetti({ particleCount: 90, spread: 75, origin: { y: 0.3 },
                     colors: ['#FFBC00', '#FFD35C', '#FFF2C4', '#544438'],
                     disableForReducedMotion: true });
        }).catch(() => {/* 효과가 없어도 답은 그대로 */});
      }
      // 주소에 질문을 남깁니다. 지금 화면이 곧 공유 가능한 링크가 됩니다.
      window.history.replaceState(null, '', `?q=${encodeURIComponent(q)}`);
      setMood(data.character_motion);
      setSpeech(summarize(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결하지 못했습니다');
      setMood('explaining');
      setSpeech('앗, 서버에 닿질 않네요.');
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
    }
  }, [loading, res?.session_id, shop]);

  // 카드 안(닮은 동네 행 등)에서 흘려보낸 질문을 받습니다.
  useEffect(() => {
    const h = (e: Event) => ask((e as CustomEvent<string>).detail);
    window.addEventListener('kkulbee:ask', h);
    return () => window.removeEventListener('kkulbee:ask', h);
  }, [ask]);



  useEffect(() => {
    if (history.length && resultRef.current) {
      // 마지막 문답의 시작으로. 목록 맨 위로 올리면 방금 답이 안 보입니다.
      const last = resultRef.current.lastElementChild;
      (last ?? resultRef.current).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [history.length, loading]);

  return (
    <LayoutGroup>
      <TopBar />
      <main className="mx-auto min-h-screen max-w-[1240px] px-5 pb-24 lg:px-8">
        {/* ── ① 히어로 — 꿀비가 화면을 차지합니다 ── */}
        <AnimatePresence mode="wait">
          {hero && (
            <motion.section
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className="hero-glow flex min-h-[calc(100vh-3.5rem)] flex-col
                         items-center pt-14"
            >
              {/* v0 랜딩의 순서 그대로 — 배지, 헤드라인, 서브, CTA, 그 아래
                  제품. 다른 점 하나: 제품 스크린샷 자리에 **살아 있는 앱**을
                  프레임에 넣어 앉혔습니다. 목업이 아니라 그 자리에서 바로
                  물어볼 수 있습니다. */}
              <motion.span
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-1.5 rounded-full
                           border border-kb-ink/[.14] bg-white/70 px-3.5 py-1.5
                           text-[12px] text-kb-ink/70"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-kb-yellow" />
                전국 점포 272만 개 실측으로 답하는 소상공인 AI
              </motion.span>

              {/* 내 가게 — 한 번 등록하면 모든 질문에 동네·업종이 자동으로.
                  상담소에 갈 때마다 이름부터 다시 댈 이유가 없습니다. */}
              <div className="mt-3">
                <MyShop onChange={setShop} />
              </div>

              <motion.h1
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="font-display mt-5 text-center text-[40px] font-bold
                           leading-[1.16] text-kb-ink sm:text-[58px]"
              >
                사장님의 세 가지 고민,
                <br />
                <span className="bg-gradient-to-r from-[#E09A00] to-kb-yellow
                                 bg-clip-text text-transparent">
                  한 번에 물어보세요
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.16 }}
                className="mt-5 max-w-[54ch] text-center text-[15.5px] leading-[1.75]
                           text-kb-ink/60"
              >
                어디에 열지, 자금은 어떻게, 억울한 일이 생기면 어떻게.
                제도 이름을 몰라도 괜찮습니다 — 처한 상황을 그대로 말씀하시면
                실제 자료에서 찾아 근거까지 보여 드립니다.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 }}
                className="mt-7 flex items-center gap-3"
              >
                <button
                  onClick={() => document.querySelector<HTMLInputElement>('#ask input')?.focus()}
                  className="rounded-full bg-kb-yellow px-6 py-3 text-[14.5px] font-bold
                             text-kb-ink transition hover:brightness-105
                             active:translate-y-px"
                >
                  지금 물어보기
                </button>
                <a
                  href="https://github.com/BioCode67/kb-kkulbee-smallbiz-multiagent"
                  target="_blank" rel="noreferrer"
                  className="rounded-full border border-kb-ink/[.14] px-6 py-3
                             text-[14.5px] font-semibold text-kb-ink/80 transition
                             hover:border-kb-ink/[.3] hover:text-kb-ink"
                >
                  소스코드 보기
                </a>
              </motion.div>

              {/* 꿀비 — 프레임 위에 살짝 걸쳐 앉습니다 */}
              <motion.div layoutId="bee" transition={SPRING}
                          className="z-10 -mb-10 mt-8">
                <BeeStage motion={mood} size={210} speech={speech} />
              </motion.div>

              {/* ── 앱 프레임 — 목업 대신 진짜 ── */}
              <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="app-frame w-full max-w-[880px]"
              >
                <div className="flex items-center gap-2 border-b border-kb-ink/[.1]
                                px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                  <span className="mx-auto rounded-md bg-kb-ink/[.05] px-8 py-1
                                   text-[11px] text-kb-ink/50">
                    kkulbee — 사장님 곁의 AI 비서
                  </span>
                </div>

                <div className="p-5 sm:p-7">
                  <div className="grid grid-cols-5 gap-2">
                    {MODES.map((m, i) => {
                      const on = i === mode;
                      return (
                        <button
                          key={m.key}
                          onClick={() => {
                            setMode(i);
                            // 클릭했는데 화면이 그대로면 고장으로 읽힙니다.
                            // 입력창으로 데려가 포커스까지 줘야 "골랐다"가
                            // 몸으로 확인됩니다 — 특히 모바일에서.
                            document.querySelector<HTMLInputElement>('#ask input')
                              ?.focus({ preventScroll: false });
                            document.getElementById('ask')
                              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                          aria-pressed={on}
                          className={`group flex flex-col items-center gap-1 rounded-xl
                                      px-2 pb-2.5 pt-3 transition-all duration-200 ${
                            on
                              ? 'border border-kb-yellow/50 bg-kb-yellow/[.08]'
                              : 'border border-kb-ink/[.1] bg-transparent hover:border-kb-ink/[.14] hover:bg-white/70'}`}
                        >
                          <ModeIcon name={m.icon} on={on} />
                          <span className={`text-[12px] font-semibold ${
                            on ? 'text-kb-amber' : 'text-kb-ink/80'}`}>
                            {m.label}
                          </span>
                          <span className={`hidden text-[10px] sm:block ${
                            on ? 'text-kb-ink/60' : 'text-kb-ink/40'}`}>
                            {m.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <motion.div layoutId="askbox" transition={SPRING}
                              id="ask" className="mt-4">
                    <AskBox value={input} onChange={setInput}
                            placeholder={MODES[mode].placeholder}
                            onSubmit={() => { ask(input); setInput(''); }}
                            loading={loading} />
                  </motion.div>

                  <motion.div
                    key={MODES[mode].key}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className="mt-3 flex flex-col gap-1.5"
                  >
                    {MODES[mode].samples.map((q) => (
                      <button
                        key={q}
                        onClick={() => ask(q)}
                        className="group flex items-center gap-2.5 rounded-lg
                                   border border-transparent px-3 py-2 text-left
                                   transition hover:border-kb-ink/[.1]
                                   hover:bg-white/70"
                      >
                        <span className="text-[11px] text-kb-amber/60 transition
                                         group-hover:text-kb-amber">→</span>
                        <span className="text-[13px] text-kb-ink/60
                                         group-hover:text-kb-ink/90">{q}</span>
                      </button>
                    ))}
                  </motion.div>
                </div>
              </motion.div>

              {/* ── 신뢰 숫자 ── */}
              <div className="mt-14 grid w-full max-w-[880px] grid-cols-3
                              divide-x divide-kb-ink/[.1] border-y
                              border-kb-ink/[.1] py-6">
                {[
                  ['2,725,318', '전국 점포 실측 좌표'],
                  ['900', '정부 지원사업 공고'],
                  ['3,450', '행정동 백분위 비교'],
                ].map(([n, l]) => (
                  <div key={l} className="px-4 text-center">
                    <p className="text-[24px] font-extrabold tracking-tight text-kb-ink
                                  [font-variant-numeric:tabular-nums]">{n}</p>
                    <p className="mt-1 text-[11.5px] text-kb-ink/55">{l}</p>
                  </div>
                ))}
              </div>

              {/* ── 무엇이 다른가 ── */}
              <div className="mb-20 mt-14 grid w-full max-w-[880px] gap-3
                              sm:grid-cols-3">
                {[
                  ['지어내지 않습니다',
                   '없는 자료는 없다고 화면에 적습니다. 모르는 동네에는 점수를 주지 않고, 추천마다 공고 원문 링크가 붙습니다.'],
                  ['멀티에이전트가 정말 돕니다',
                   '한 질문에 입지·자금·권리 갈래가 동시에 켜지고, 어떤 에이전트가 돌았는지 화면에 그대로 남습니다.'],
                  ['금소법 가드레일이 마지막에',
                   'LLM이 쓴 문장까지 예외 없이 검사를 거칩니다. 상단의 검사기에서 아무 문장이나 직접 시험해 보세요.'],
                ].map(([t, d]) => (
                  <div key={t} className="surface-1 p-5">
                    <p className="text-[14px] font-bold text-kb-ink">{t}</p>
                    <p className="mt-2 text-[12.5px] leading-[1.7] text-kb-ink/60">{d}</p>
                  </div>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── ② 결과 — 꿀비가 옆으로 물러나 동행합니다 ── */}
        {!hero && (
          <div className="grid gap-6 pt-6 lg:grid-cols-[272px_minmax(0,1fr)]">
            <aside className="print:hidden lg:sticky lg:top-[4.5rem] lg:self-start">
              <div className="surface-2 flex flex-col items-center px-4 pb-5 pt-4">
                <motion.div layoutId="bee" transition={SPRING}>
                  <BeeStage motion={mood} size={132} speech={speech} />
                </motion.div>
                <button
                  onClick={() => { setHistory([]); setMood('fly_happy'); setSpeech(GREETING); }}
                  className="mt-4 w-full rounded-lg bg-kb-ink/[.05] py-2 text-[11.5px]
                             text-kb-ink/65 transition hover:bg-kb-ink/[.08] hover:text-kb-ink"
                >
                  처음으로
                </button>
              </div>

              {res && <AgentTrace res={res} />}
            </aside>

            <section className="min-w-0">
              <motion.div layoutId="askbox" transition={SPRING} className="print:hidden">
                <AskBox value={input} onChange={setInput}
                        onSubmit={() => { ask(input); setInput(''); }} loading={loading} />
              </motion.div>

              {/* 인쇄에만 나오는 머리말 — 은행·지원센터 창구에 들고 갈 수
                  있는 문서가 되도록 출처와 날짜를 박습니다. */}
              <div className="hidden print:block border-b border-kb-ink/20 pb-3">
                <p className="text-[16px] font-bold text-kb-ink">🐝 꿀비 상담 리포트</p>
                <p className="mt-1 text-[10px] text-kb-ink/60">
                  kb-kkulbee-smallbiz-multiagent.onrender.com ·
                  인쇄일 {new Date().toLocaleDateString('ko-KR')} ·
                  참고용 정보이며 대출 승인·한도·금리를 보장하지 않습니다
                </p>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 ring-1 ring-rose-400/25"
                  >
                    <p className="text-[12.5px] text-rose-700">{error}</p>
                    <p className="mt-1 text-[11.5px] text-rose-700">
                      백엔드를 먼저 실행하세요 —{' '}
                      <code className="font-mono">uvicorn app.main:app --port 8000</code>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={resultRef} className="space-y-10">
                {history.map(({ q, res: r }, i) => (
                  <motion.div
                    key={r.session_id + i}
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-6 space-y-5"
                  >
                    {/* 사장님이 물은 말. 오른쪽 정렬 말풍선 — 대화의 흐름이
                        위에서 아래로 읽힙니다. */}
                    <div className="flex justify-end">
                      <p className="max-w-[75%] rounded-2xl rounded-br-md
                                    bg-kb-yellow/[.14] px-4 py-2.5 text-[13.5px]
                                    leading-relaxed text-kb-amber ring-1
                                    ring-kb-yellow/[.25]">
                        {q}
                      </p>
                    </div>
                    <Answer res={r} />
                    <BentoGrid cards={r.cards} />
                    {/* 상권 답변엔 손익분기 계산기가 따라옵니다 — "그래서
                        하루 몇 명이면 버티나"가 사장님의 진짜 질문이라서. */}
                    {r.location && <BreakEven loc={r.location} />}

                    {/* 다음 걸음 — 마지막 답에만 답니다. 지나간 답의 칩은
                        지금 맥락과 어긋날 수 있습니다. */}
                    {i === history.length - 1 && !loading && r.suggestions.length > 0 && (
                      <div className="print:hidden flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11.5px] text-kb-ink/50">이어서 물어보기</span>
                        {r.suggestions.map((sq) => (
                          <button
                            key={sq}
                            onClick={() => ask(sq)}
                            className="rounded-full bg-kb-yellow/[.09] px-3.5 py-1.5
                                       text-[12.5px] text-kb-amber ring-1
                                       ring-kb-yellow/[.28] transition
                                       hover:bg-kb-yellow/[.18] hover:text-kb-amber"
                          >
                            {sq}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
                {loading && <Thinking />}
              </div>
            </section>
          </div>
        )}
        {/* 어디서든 대화 — 우하단 꿀비. 히어로에선 큰 꿀비가 있으니 숨깁니다. */}
        <BeeChatbot history={history} loading={loading} onAsk={ask} hidden={hero} />
      </main>
      <SiteFooter />
    </LayoutGroup>
  );
}

const SPRING = { type: 'spring' as const, stiffness: 220, damping: 26 };

/** 꿀비가 말풍선에 띄울 한 줄. 길면 말풍선이 화면을 잡아먹습니다. */
function summarize(d: ChatResponse): string {
  if (d.location) {
    const g = d.location.grade;
    return g === 'S' || g === 'A'
      ? `${d.location.total_score}점이면 좋은 자리예요!`
      : `${d.location.total_score}점이에요. 아래에서 이유를 볼까요?`;
  }
  if (d.policies.length) return `맞는 지원사업 ${d.policies.length}건을 찾았어요!`;
  if (d.protection) return '절차를 4단계로 정리해 뒀어요.';
  return '이렇게 도와드릴 수 있어요.';
}

/* ── 입력 ──────────────────────────────────────────────────────────────── */
/**
 * 음성 입력 — 브라우저에 이미 들어 있는 Web Speech API를 씁니다.
 *
 * 서버도, 키도, 모델 다운로드도 없습니다. 크롬·엣지·사파리가 한국어
 * 인식을 내장하고 있고, 우리는 마이크 버튼 하나만 답니다. 자판이 느린
 * 사장님, 매장에서 손을 못 쓰는 사장님이 말로 묻습니다 — 금융 앞의
 * 문턱을 낮추는 일은 역대 이 대회가 계속 상을 준 각도이기도 합니다.
 */
function useSpeechInput(onText: (t: string) => void) {
  const recRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [listening, setListening] = useState(false);
  // 서버 렌더에서는 window가 없어 false, 브라우저에서는 true — 이 차이가
  // React #418(hydration mismatch)을 만들었습니다. 마운트 뒤에만 판정합니다.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(!!((window as unknown as Record<string, unknown>)
      .webkitSpeechRecognition ||
      (window as unknown as Record<string, unknown>).SpeechRecognition));
  }, []);

  const toggle = () => {
    if (!supported) return;
    if (listening) { recRef.current?.stop(); return; }
    type RecCtor = new () => {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void; onerror: () => void; start: () => void; stop: () => void;
    };
    const W = window as unknown as Record<string, RecCtor>;
    const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
    const r = new Rec();
    r.lang = 'ko-KR';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const t = Array.from({ length: e.results.length },
        (_, i) => e.results[i][0].transcript).join('');
      onText(t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    setListening(true);
    r.start();
  };
  return { supported, listening, toggle };
}

function AskBox({ value, onChange, onSubmit, loading, placeholder }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  loading: boolean; placeholder?: string;
}) {
  const mic = useSpeechInput(onChange);
  return (
    <div className="surface-3 flex items-center gap-2 p-2 transition
                    focus-within:ring-kb-yellow/[.45]">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSubmit(); }}
        placeholder={placeholder ?? '꿀비에게 물어보세요'}
        disabled={loading}
        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[14.5px] text-kb-ink
                   placeholder:text-kb-ink/50 focus:outline-none disabled:opacity-50"
      />
      {mic.supported && (
        <button
          onClick={mic.toggle}
          aria-label="말로 물어보기"
          title="말로 물어보기"
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl
                      transition ${mic.listening
            ? 'animate-pulse bg-rose-500/90 text-kb-ink'
            : 'bg-kb-ink/[.05] text-kb-ink/65 hover:bg-kb-ink/[.08] hover:text-kb-ink'}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      )}
      <button
        onClick={onSubmit}
        disabled={loading || !value.trim()}
        className="shrink-0 rounded-xl bg-kb-yellow px-5 py-3 text-[13.5px] font-bold
                   text-kb-ink transition hover:brightness-105 active:translate-y-px
                   disabled:cursor-not-allowed disabled:opacity-[.35]"
      >
        {loading ? '생각 중…' : '물어보기'}
      </button>
    </div>
  );
}

/**
 * 기다리는 동안 무엇을 하고 있는지 보여 줍니다.
 *
 * 회색 상자를 깜빡이는 스켈레톤은 "곧 뭔가 나온다"는 것 말고는 아무것도
 * 말해 주지 않습니다. 이 서비스는 에이전트 넷이 실제로 순서대로 도는데,
 * 그 사실이 기다림의 이유가 됩니다. 2~3초가 '느리다'가 아니라 '자료를
 * 뒤지는 중'으로 읽힙니다.
 *
 * 진행 시각은 실제 소요 시간에 맞춰 두었습니다 — 규칙 라우팅 20ms,
 * 상권·자금 검색 수십 ms, 문장 생성이 대부분(1~3초)입니다.
 */
const STEPS = [
  { at: 0, label: '질문을 읽는 중', hint: '어느 갈래인지, 어느 동네·업종인지' },
  { at: 350, label: '실측 자료를 뒤지는 중', hint: '점포 272만 개 · 공고 900건' },
  { at: 1100, label: '근거를 정리하는 중', hint: '무엇이 그 결론을 만들었는지' },
  { at: 1900, label: '금소법 검사 중', hint: '나가는 문장은 예외 없이 거칩니다' },
];

function Thinking() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => setMs(performance.now() - t0), 120);
    return () => clearInterval(id);
  }, []);

  const done = STEPS.filter((s) => ms >= s.at).length;

  return (
    <div className="surface-1 mt-6 p-5">
      <ol className="space-y-3">
        {STEPS.map((s, i) => {
          const state = i < done - 1 ? 'done' : i === done - 1 ? 'now' : 'wait';
          return (
            <li key={s.label} className="flex items-start gap-3">
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center
                                rounded-full text-[10px] font-bold transition-colors ${
                state === 'done' ? 'bg-kb-yellow/20 text-kb-amber'
                : state === 'now' ? 'bg-kb-yellow text-kb-ink'
                : 'bg-kb-ink/[.05] text-kb-ink/40'}`}>
                {state === 'done' ? '✓' : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-[13px] font-medium transition-colors ${
                  state === 'wait' ? 'text-kb-ink/40' : 'text-kb-ink/90'}`}>
                  {s.label}
                  {state === 'now' && (
                    <span className="ml-1.5 inline-flex gap-0.5 align-middle">
                      {[0, 1, 2].map((d) => (
                        <i key={d}
                           className="h-1 w-1 animate-bounce rounded-full bg-kb-yellow"
                           style={{ animationDelay: `${d * 0.13}s` }} />
                      ))}
                    </span>
                  )}
                </p>
                <p className={`mt-0.5 text-[11px] transition-colors ${
                  state === 'wait' ? 'text-kb-ink/15' : 'text-kb-ink/55'}`}>
                  {s.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ── 답 ────────────────────────────────────────────────────────────────── */
const INTENT_KO: Record<string, string> = { location: '상권', policy: '자금', protection: '권리', general: '안내' };

function Answer({ res }: { res: ChatResponse }) {
  const { answer: text, elapsed_ms: elapsed, understood } = res;
  const [body, ...notes] = text.split('\n\n· ');
  const [copied, setCopied] = useState(false);
  const share = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <div className="surface-2 relative p-5 sm:p-6">
      {/* 이 화면을 그대로 여는 링크. 질문이 주소에 실려 있어 받은 사람도
          같은 답을 봅니다. */}
      <div className="print:hidden absolute right-4 top-4 flex gap-1.5">
        {/* 종이로 들고 가는 상담 — 은행·지원센터 창구에서는 화면보다
            출력물이 통합니다. 브라우저 인쇄로 PDF 저장도 됩니다. */}
        <button
          onClick={() => window.print()}
          title="이 상담을 인쇄하거나 PDF로 저장합니다"
          className="rounded-lg bg-kb-ink/[.05] px-2.5 py-1.5 text-[11px]
                     text-kb-ink/65 ring-1 ring-kb-ink/[.1] transition
                     hover:bg-kb-ink/[.08] hover:text-kb-ink"
        >
          📄 저장
        </button>
        {/* 꿀비가 읽어줍니다 — 브라우저 내장 합성음. 화면을 오래 못 보는
            상황(운전·조리 중)에서도 답을 들을 수 있습니다. */}
        <button
          onClick={() => {
            const u = new SpeechSynthesisUtterance(text.replace(/\n/g, ' '));
            u.lang = 'ko-KR'; u.rate = 1.05;
            speechSynthesis.cancel(); speechSynthesis.speak(u);
          }}
          title="꿀비가 읽어줍니다"
          className="rounded-lg bg-kb-ink/[.05] px-2.5 py-1.5 text-[11px]
                     text-kb-ink/65 ring-1 ring-kb-ink/[.1] transition
                     hover:bg-kb-ink/[.08] hover:text-kb-ink"
        >
          🔊 읽어줘
        </button>
        <button
          onClick={share}
          className="rounded-lg bg-kb-ink/[.05] px-2.5 py-1.5 text-[11px]
                     text-kb-ink/65 ring-1 ring-kb-ink/[.1] transition
                     hover:bg-kb-ink/[.08] hover:text-kb-ink"
        >
          {copied ? '복사됨 ✓' : '링크 복사'}
        </button>
      </div>
      {/* 서버가 어떻게 알아들었는지. 조용히 틀린 답을 주는 것이 가장 나쁩니다 —
          "성수2가3동 · 요리 주점"이라고 보여 주면 잘못 알아들었을 때 바로
          바로잡을 수 있습니다. */}
      {(understood?.region || understood?.industry) && (
        <div className="mb-3.5 flex flex-wrap items-center gap-1.5 border-b
                        border-kb-ink/[.1] pb-3">
          <span className="text-[10.5px] text-kb-ink/45">이렇게 이해했어요</span>
          {understood.region && (
            <span className="rounded-md bg-kb-ink/[.05] px-2 py-0.5 text-[11.5px]
                             font-medium text-kb-ink/80">📍 {understood.region}</span>
          )}
          {understood.industry && (
            <span className="rounded-md bg-kb-ink/[.05] px-2 py-0.5 text-[11.5px]
                             font-medium text-kb-ink/80">{understood.industry}</span>
          )}
          {(understood.intents ?? []).map((i) => (
            <span key={i} className="rounded-md bg-kb-yellow/[.12] px-2 py-0.5
                                     text-[11px] font-semibold text-kb-amber">
              {INTENT_KO[i] ?? i}
            </span>
          ))}
        </div>
      )}
      <div className="space-y-2.5">
        {body.split('\n').filter(Boolean).map((line, i) => (
          <p key={i} className="text-[14.5px] leading-[1.8] text-kb-ink">{line}</p>
        ))}
      </div>
      {notes.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-kb-ink/[.1] pt-3">
          {notes.map((n, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-kb-ink/50">· {n}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-right text-[10.5px] text-kb-ink/40">
        {elapsed}ms 만에 답했어요
      </p>
    </div>
  );
}

/* ── 어느 에이전트가 돌았는지 ──────────────────────────────────────────
 *
 * 멀티에이전트라고 적어 두는 것과, 어느 에이전트가 실제로 돌았는지 보여
 * 주는 것은 다릅니다. 질문마다 켜지는 갈래가 달라지므로 이 목록도 매번
 * 달라집니다 — 그 변화가 "정말 라우팅이 되는가"에 대한 답입니다.
 */
function AgentTrace({ res }: { res: ChatResponse }) {
  return (
    <div className="surface-1 mt-4 p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-kb-ink/60">
        꿀비가 한 일
      </p>

      <ol className="relative mt-3 space-y-0">
        {/* 세로줄 — 순서대로 흘렀다는 것이 선 하나로 읽힙니다 */}
        <span aria-hidden
              className="absolute left-[9px] top-2 bottom-4 w-px bg-kb-ink/[.08]" />
        {res.agent_trace.map((a, i) => (
          <li key={`${a}-${i}`} className="relative flex items-center gap-2.5 py-1.5">
            <span className={`z-10 grid h-[19px] w-[19px] shrink-0 place-items-center
                              rounded-full text-[9.5px] font-bold ring-2 ring-kb-ink ${
              a === 'guardrail'
                ? 'bg-rose-400/25 text-rose-700'
                : 'bg-kb-yellow/25 text-kb-amber'}`}>
              {i + 1}
            </span>
            <span className={`text-[12.5px] ${
              a === 'guardrail' ? 'text-rose-700' : 'text-kb-ink/85'}`}>
              {AGENT_LABEL[a] ?? a}
            </span>
          </li>
        ))}
      </ol>

      {res.guardrail && (
        <p className={`mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2
                       text-[11px] leading-snug ${
          res.guardrail.passed
            ? 'bg-emerald-400/10 text-emerald-700'
            : 'bg-rose-400/10 text-rose-700'}`}>
          <span className="mt-px">{res.guardrail.passed ? '✓' : '!'}</span>
          {res.guardrail.passed
            ? '금소법 위반 표현 없음'
            : `단정 표현 ${res.guardrail.violations.length}건을 고쳐 내보냈습니다`}
        </p>
      )}

      <p className="mt-2.5 text-right text-[10px] text-kb-ink/40">
        {res.elapsed_ms}ms
      </p>
    </div>
  );
}
