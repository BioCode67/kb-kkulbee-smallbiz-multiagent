'use client';

/**
 * 내 찜 서랍 — 담아 둔 공고를 마감 가까운 순으로.
 *
 * D-day가 이 서랍의 존재 이유입니다. 여기에 RPA가 붙습니다: 색인은
 * 수집 시점의 스냅샷이고 공고는 살아 움직이므로, '모두 재확인' 한 번에
 * 기계가 원문을 전부 돌며 마감·서식·문의처를 오늘 기준으로 다시 읽어
 * 옵니다. 담아 둘 때와 달라졌으면 달라졌다고 짚어 줍니다.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { dday, loadSaved, onSavedChange, removeSaved, setNote, type SavedProgram } from '@/lib/saved';
import { downloadIcs } from '@/lib/ics';

/** 원문 재확인 결과 — 백엔드 RPA가 기업마당 원문을 방금 열어 읽은 사실 */
interface LiveCheck {
  ok: boolean; reason?: string; checked_at?: string; period_text?: string | null;
  status?: string; days_left?: number | null; deadline?: string | null;
  attachments?: { name: string; url: string }[]; apply_link?: string | null;
  overview?: string | null; apply_method?: string | null; contact?: string | null;
}

function statusLabel(r: LiveCheck): [string, string] {
  return r.status === 'open' ? [`접수 중 · ${r.days_left}일 남음`, 'text-emerald-700']
    : r.status === 'closed' ? ['마감됨', 'text-rose-700']
    : r.status === 'upcoming' ? ['접수 예정', 'text-sky-700']
    : [r.period_text || '기간 표기 없음', 'text-kb-ink/78'];
}

function LiveCheckRow({ s, r, busy, onRun }: {
  s: SavedProgram; r: LiveCheck | null; busy: boolean; onRun: () => void;
}) {
  const [more, setMore] = useState(false);
  if (!s.url.includes('bizinfo.go.kr')) return null;

  // 담아 둘 때 알던 마감과 오늘 원문이 다르면 — 그게 이 기능의 존재 이유
  const changed = r?.ok && r.deadline && s.deadline && r.deadline !== s.deadline;

  return (
    <div className="mt-2 border-t border-kb-ink/[.06] pt-2">
      {!r && (
        <button onClick={onRun} disabled={busy}
          className="text-[13px] font-semibold text-kb-ink/72 transition
                     hover:text-kb-amber disabled:opacity-50">
          {busy ? '원문을 여는 중…' : '🔄 원문 재확인 — 마감·서식이 바뀌었는지'}
        </button>
      )}
      {r && !r.ok && <p className="text-[12.5px] text-rose-700">{r.reason}</p>}
      {r?.ok && (
        <div className="space-y-1 text-[12.5px] leading-relaxed text-kb-ink/82">
          <p>
            <b className={statusLabel(r)[1]}>{statusLabel(r)[0]}</b>
            {' '}· 원문 기준 {r.checked_at?.slice(11, 16)} 확인
          </p>
          {changed && (
            <p className="rounded-md bg-amber-400/[.14] px-2 py-1 font-semibold
                          text-amber-800">
              ⚠ 담아 둘 때({s.deadline})와 마감이 달라졌어요 → 원문은 {r.deadline}
            </p>
          )}
          {(r.attachments ?? []).slice(0, 3).map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noreferrer"
               className="block truncate text-kb-amber underline-offset-2 hover:underline">
              📎 {a.name}
            </a>
          ))}
          <div className="flex flex-wrap gap-x-3">
            {r.apply_link && (
              <a href={r.apply_link} target="_blank" rel="noreferrer"
                 className="font-semibold text-kb-amber hover:underline">
                신청 사이트 바로가기 →
              </a>
            )}
            {(r.overview || r.apply_method || r.contact) && (
              <button onClick={() => setMore((v) => !v)}
                      className="text-kb-ink/62 hover:text-kb-ink">
                {more ? '접기 ▴' : '원문 요약 더 보기 ▾'}
              </button>
            )}
          </div>
          {more && (
            <div className="space-y-1 rounded-lg bg-kb-ink/[.04] px-2.5 py-2">
              {r.overview && <p><b className="text-kb-ink/78">개요</b> {r.overview}</p>}
              {r.apply_method && <p><b className="text-kb-ink/78">신청</b> {r.apply_method}</p>}
              {r.contact && <p><b className="text-kb-ink/78">문의</b> {r.contact}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SavedDrawer({ open, onClose }: {
  open: boolean; onClose: () => void;
}) {
  const [items, setItems] = useState<SavedProgram[]>([]);
  const [checks, setChecks] = useState<Record<string, LiveCheck>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [sweeping, setSweeping] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  useEffect(() => {
    const load = () => setItems(loadSaved());
    load();
    return onSavedChange(load);
  }, [open]);

  const runOne = async (s: SavedProgram) => {
    setBusy((b) => ({ ...b, [s.id]: true }));
    try {
      const res = await fetch('/api/v1/rpa/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: s.url }),
      });
      const r = await res.json();
      setChecks((c) => ({ ...c, [s.id]: r }));
    } catch {
      setChecks((c) => ({ ...c, [s.id]: { ok: false, reason: '서버에 닿지 못했어요' } }));
    } finally {
      setBusy((b) => ({ ...b, [s.id]: false }));
    }
  };

  // RPA 순찰 — 찜 전부의 원문을 한 번에. 결과는 각 항목 밑으로 흩어집니다.
  const bizItems = items.filter((s) => s.url.includes('bizinfo.go.kr'));
  const runAll = async () => {
    if (sweeping || !bizItems.length) return;
    setSweeping(true);
    try {
      const res = await fetch('/api/v1/rpa/check-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: bizItems.map((s) => s.url) }),
      });
      const { results } = await res.json();
      setChecks((c) => {
        const next = { ...c };
        bizItems.forEach((s, i) => { if (results[i]) next[s.id] = results[i]; });
        return next;
      });
    } catch {/* 개별 버튼이 남아 있습니다 */} finally { setSweeping(false); }
  };

  // 마감 임박 순 — 날짜 없는 것(상시)은 뒤로, 지난 것은 맨 뒤로.
  const sorted = [...items].sort((a, b) => {
    const da = dday(a.deadline), db = dday(b.deadline);
    const ka = da == null ? 9000 : da < 0 ? 99000 + -da : da;
    const kb = db == null ? 9000 : db < 0 ? 99000 + -db : db;
    return ka - kb;
  });

  // 순찰 요약 — 확인된 것들의 오늘 상태를 머리에 한 줄로
  const done = bizItems.filter((s) => checks[s.id]?.ok);
  const nOpen = done.filter((s) => checks[s.id].status === 'open').length;
  const nClosed = done.filter((s) => checks[s.id].status === 'closed').length;

  if (!host) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} onClick={onClose}
            className="fixed inset-0 z-[80] bg-kb-ink/30 backdrop-blur-[2px]" />
          <motion.aside
            initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-[90] flex h-full w-full max-w-[400px]
                       flex-col bg-kb-cream shadow-2xl ring-1 ring-kb-ink/[.12]"
          >
            <header className="border-b border-kb-ink/[.1] px-4 py-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[17px] font-bold text-kb-ink">
                  ⭐ 찜한 지원사업 <span className="text-kb-ink/55">{items.length}</span>
                </p>
                <button onClick={onClose}
                  className="grid h-9 w-9 place-items-center rounded-lg text-kb-ink/68
                             hover:bg-kb-ink/[.06]">✕</button>
              </div>
              {bizItems.length >= 2 && (
                <button onClick={runAll} disabled={sweeping}
                  className="mt-2 w-full rounded-lg bg-kb-yellow/[.9] py-2 text-[14px]
                             font-bold text-kb-ink transition hover:brightness-105
                             disabled:opacity-50">
                  {sweeping ? `원문 ${bizItems.length}건 순찰 중…`
                    : `🤖 모두 재확인 — ${bizItems.length}건 원문 순찰`}
                </button>
              )}
              {done.length > 0 && (
                <p className="mt-1.5 text-center text-[12.5px] text-kb-ink/72">
                  오늘 원문 기준: 접수 중 {nOpen}건
                  {nClosed > 0 && <> · <b className="text-rose-700">마감 {nClosed}건</b></>}
                </p>
              )}
            </header>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5">
              {sorted.length === 0 && (
                <p className="py-10 text-center text-[15px] leading-relaxed text-kb-ink/62">
                  아직 담은 공고가 없어요.
                  <br />지원사업 카드의 ⭐를 눌러 담아 두세요 —
                  <br />마감 가까운 순으로 여기 모입니다.
                </p>
              )}
              {sorted.map((s) => {
                const d = dday(s.deadline);
                return (
                  <div key={s.id} className="surface-1 bg-white p-3.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-snug text-kb-ink">
                          {s.name}
                        </p>
                        <p className="mt-0.5 text-[13px] text-kb-ink/62">
                          {s.provider} · {s.funding_type}
                        </p>
                      </div>
                      <button onClick={() => removeSaved(s.id)}
                        title="찜 해제"
                        className="shrink-0 text-[15px] text-kb-ink/30
                                   hover:text-rose-600">✕</button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`rounded-full px-2 py-0.5 text-[12.5px]
                                        font-bold ${
                        d == null ? 'bg-sky-500/[.12] text-sky-700'
                        : d < 0 ? 'bg-kb-ink/[.06] text-kb-ink/55 line-through'
                        : d <= 7 ? 'bg-rose-500/[.12] text-rose-700'
                        : 'bg-emerald-500/[.12] text-emerald-700'}`}>
                        {d == null ? s.apply_period || '상시'
                          : d < 0 ? '마감됨'
                          : d === 0 ? '오늘 마감!'
                          : `마감 D-${d}`}
                      </span>
                      <a href={s.url} target="_blank" rel="noreferrer"
                        className="text-[13.5px] font-semibold text-kb-amber
                                   hover:underline">
                        공고 원문 →
                      </a>
                    </div>
                    {/* 한 줄 메모 — "8/5 담당자 통화, 서류 곧 보냄" 같은 것.
                        공고 관리의 절반은 이런 흔적이라, 서랍이 수첩이 됩니다. */}
                    <input
                      defaultValue={s.note ?? ''}
                      placeholder="✏️ 메모 — 통화 내용, 준비 상황…"
                      onBlur={(e) => setNote(s.id, e.target.value)}
                      className="mt-2 w-full rounded-lg bg-kb-ink/[.04] px-2.5 py-1.5
                                 text-[12.5px] text-kb-ink/85 ring-1 ring-kb-ink/[.08]
                                 placeholder:text-kb-ink/35 focus:outline-none
                                 focus:ring-kb-yellow/50"
                    />
                    <LiveCheckRow s={s} r={checks[s.id] ?? null}
                                  busy={!!busy[s.id] || sweeping}
                                  onRun={() => runOne(s)} />
                  </div>
                );
              })}
            </div>

            <footer className="border-t border-kb-ink/[.1] p-3">
              {items.some((s) => s.deadline) && (
                <button
                  onClick={() => downloadIcs(items)}
                  className="mb-2 w-full rounded-lg bg-kb-ink/[.05] py-2 text-[14px]
                             font-semibold text-kb-ink/85 transition
                             hover:bg-kb-ink/[.09] hover:text-kb-ink"
                  title="구글·애플·네이버 캘린더에 넣을 수 있는 표준 파일"
                >
                  📅 마감을 내 캘린더로 — .ics 내려받기
                </button>
              )}
              <p className="text-center text-[12.5px] text-kb-ink/55">
                이 브라우저에만 저장됩니다 · 최대 50건
              </p>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    host,
  );
}
