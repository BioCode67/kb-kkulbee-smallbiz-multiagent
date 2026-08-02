/**
 * 찜한 공고의 마감을 캘린더 파일(.ics)로.
 *
 * D-day는 우리 서랍 안에만 있으면 잊힙니다. 사장님의 진짜 알림판은
 * 폰 캘린더입니다. 표준 iCalendar라 구글·애플·네이버 어디든 들어가고,
 * 마감 하루 전 오전 9시에 알림이 울리게 심어 둡니다.
 */

import type { SavedProgram } from './saved';

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function buildIcs(items: SavedProgram[]): string | null {
  const dated = items.filter((s) => s.deadline);
  if (!dated.length) return null;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//kkulbee//saved-deadlines//KO', 'CALSCALE:GREGORIAN',
  ];
  for (const s of dated) {
    const d = s.deadline!.replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@kkulbee`,
      `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:${esc(`⏰ [마감] ${s.name}`)}`,
      `DESCRIPTION:${esc(`${s.provider} · ${s.funding_type}\n공고 원문: ${s.url}\n— 꿀비에서 찜한 지원사업`)}`,
      `URL:${s.url}`,
      // 마감 하루 전 오전 9시(마감일 0시 기준 -15시간)에 알림
      'BEGIN:VALARM', 'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`내일 마감: ${s.name}`)}`,
      'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(items: SavedProgram[]): boolean {
  const ics = buildIcs(items);
  if (!ics) return false;
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '꿀비_지원사업_마감.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
