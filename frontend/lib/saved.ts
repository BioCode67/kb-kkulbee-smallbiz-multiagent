/**
 * 지원사업 찜 — 브라우저에만 저장합니다.
 *
 * 공고는 흘러가고 마감은 다가옵니다. 오늘 본 공고를 다음 주에 다시
 * 찾으려면 같은 질문을 다시 해야 했습니다. 별을 눌러 담아 두면
 * 마감 가까운 순으로 모아 볼 수 있습니다. 계정 없이, 이 브라우저에만.
 */

export interface SavedProgram {
  id: string; name: string; provider: string; funding_type: string;
  deadline: string | null; apply_period: string; url: string; savedAt: number;
}

const KEY = 'kkulbee:saved';
const EVT = 'kkulbee:saved-changed';

export function loadSaved(): SavedProgram[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

function write(list: SavedProgram[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function isSaved(id: string): boolean {
  return loadSaved().some((s) => s.id === id);
}

export function toggleSaved(p: Omit<SavedProgram, 'savedAt'>): boolean {
  const list = loadSaved();
  const i = list.findIndex((s) => s.id === p.id);
  if (i >= 0) { list.splice(i, 1); write(list); return false; }
  write([{ ...p, savedAt: Date.now() }, ...list]);
  return true;
}

export function removeSaved(id: string) {
  write(loadSaved().filter((s) => s.id !== id));
}

export function onSavedChange(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
}

/** 마감까지 며칠. null이면 날짜 없는 공고(상시 등). */
export function dday(deadline: string | null): number | null {
  if (!deadline) return null;
  const end = new Date(deadline + 'T23:59:59').getTime();
  return Math.ceil((end - Date.now()) / 86_400_000);
}
