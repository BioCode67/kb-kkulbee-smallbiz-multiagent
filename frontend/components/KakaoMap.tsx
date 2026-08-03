'use client';

/**
 * 카카오 지도 판 — 같은 데이터, 국내 상세 타일.
 *
 * Leaflet+CARTO 판과 기능이 같습니다(도착 비행·점포 점·비교 상권·투어).
 * 다른 것은 타일뿐입니다 — 건물 이름과 지번이 보이는 국내 지도라, 사장님이
 * "아 저기 스타벅스 옆"을 바로 알아봅니다.
 *
 * NEXT_PUBLIC_KAKAO_MAP_KEY가 있을 때만 이 판이 쓰이고, 없으면 Leaflet
 * 판이 그대로 돕니다. SDK가 못 뜨면(도메인 미등록·차단) Leaflet으로
 * 되돌아갑니다 — 지도가 비는 일은 없어야 합니다.
 *
 * 카카오 SDK는 전역 스크립트라 한 번만 심습니다. autoload=false로 받아
 * kakao.maps.load 콜백에서 시작합니다.
 */

import { useEffect, useRef, useState } from 'react';
import type { MapPin } from '@/lib/types';

const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? '';

interface Props {
  pins: MapPin[];
  dongCode?: string | null;
  industryCode?: string | null;
  industry?: string | null;
  onFallback?: () => void;
}

/* 카카오 SDK 타입 최소 선언 — 전체 타입 패키지는 과합니다 */
type KLatLng = object;
type KMap = { panTo: (c: KLatLng) => void; setLevel: (l: number, o?: object) => void;
              setCenter: (c: KLatLng) => void;
              setBounds: (b: object, ...pad: number[]) => void };
interface KakaoNS {
  maps: {
    load: (cb: () => void) => void;
    event: { addListener: (t: object, type: string,
             cb: (e: { latLng: { getLat: () => number;
                                 getLng: () => number } }) => void) => void };
    LatLng: new (lat: number, lng: number) => KLatLng;
    Map: new (el: HTMLElement, opts: object) => KMap;
    Circle: new (opts: object) => { setMap: (m: KMap | null) => void;
                                    setOptions: (o: object) => void };
    LatLngBounds: new () => { extend: (p: KLatLng) => void };
    CustomOverlay: new (opts: object) => { setMap: (m: KMap | null) => void };
  };
}

let sdkPromise: Promise<KakaoNS> | null = null;
function loadSdk(): Promise<KakaoNS> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { kakao?: KakaoNS };
    if (w.kakao?.maps) { w.kakao.maps.load(() => resolve(w.kakao!)); return; }
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false`;
    s.onerror = () => reject(new Error('kakao sdk load fail'));
    s.onload = () => {
      const k = (window as unknown as { kakao?: KakaoNS }).kakao;
      if (!k) { reject(new Error('kakao missing')); return; }
      k.maps.load(() => resolve(k));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

interface NearPlace { name: string; category: string; dist: number | null;
                      url: string; road: string; }
interface Near { loading: boolean; query?: string; places?: NearPlace[]; }

const TONE = (score: number) =>
  score >= 72 ? '#FFBC00' : score >= 58 ? '#FFD35C'
  : score >= 45 ? '#B9A88F' : '#8A7866';

export default function KakaoMap({
  pins, dongCode, industryCode, industry, onFallback,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KMap | null>(null);
  const kakaoRef = useRef<KakaoNS | null>(null);
  const [shops, setShops] = useState<{ total: number; shown: number } | null>(null);
  const [tourStep, setTourStep] = useState<string | null>(null);
  // 점 ↔ 열지도 — Leaflet 판과 같은 토글. 카카오엔 히트맵이 없어
  // 반투명 큰 원을 겹쳐 밀집을 보입니다(값을 지어내지 않는 시각화).
  const [heat, setHeat] = useState(false);
  const circlesRef = useRef<{ setOptions: (o: object) => void }[]>([]);
  const [touring, setTouring] = useState(false);
  // 지도를 누른 자리 주변의 실제 가게 — 카카오 로컬 실시간 검색
  const [near, setNear] = useState<Near | null>(null);
  const clickDotRef = useRef<{ setMap: (m: KMap | null) => void } | null>(null);

  useEffect(() => {
    if (!boxRef.current || !pins?.length || !KEY) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      let kakao: KakaoNS;
      try { kakao = await loadSdk(); }
      catch { onFallback?.(); return; }
      if (disposed || !boxRef.current) return;
      kakaoRef.current = kakao;

      const target = pins.find((p) => p.is_target) ?? pins[0];
      // 전국 뷰(레벨 13)에서 시작해 동네로 들어갑니다.
      const map = new kakao.maps.Map(boxRef.current, {
        center: new kakao.maps.LatLng(36.4, 127.8), level: 13,
      });
      mapRef.current = map;

      // 점포 점 — Circle은 수백 개도 가볍습니다.
      if (dongCode) {
        try {
          const q = new URLSearchParams({ dong: dongCode });
          if (industryCode) q.set('industry', industryCode);
          const r = await fetch(`/api/v1/stores?${q}`);
          if (r.ok && !disposed) {
            const data = await r.json();
            setShops({ total: data.total, shown: data.shown });
            circlesRef.current = [];
            (data.points as [number, number][]).forEach(([la, lo]) => {
              // 반지름은 미터 단위 — 7m는 화려한 카카오 타일 위에서
              // 보이지 않았습니다(사용자 신고). 12m + 흰 테두리로.
              const c = new kakao.maps.Circle({
                center: new kakao.maps.LatLng(la, lo),
                radius: 12, strokeWeight: 1.5, strokeColor: '#ffffff',
                strokeOpacity: 0.9, fillColor: '#FF3B1F', fillOpacity: 0.9,
                zIndex: 5,
              });
              c.setMap(map);
              circlesRef.current.push(c);
              cleanups.push(() => c.setMap(null));
            });
          }
        } catch { /* 점포 없이도 지도는 산다 */ }
      }

      // 비교 상권 — 점수 칩 오버레이
      pins.forEach((p) => {
        const el = document.createElement('div');
        el.style.cssText =
          `padding:4px 8px;border-radius:9999px;font-size:11px;font-weight:700;` +
          `background:${p.is_target ? '#FFBC00' : 'rgba(255,255,255,.95)'};` +
          `color:#38322A;border:1.5px solid ${p.is_target ? '#fff' : TONE(p.score)};` +
          `box-shadow:0 2px 8px rgba(56,50,42,.25);white-space:nowrap`;
        el.textContent = `${p.name.split(' ').pop()} ${p.score.toFixed(0)}`;
        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(p.latitude, p.longitude),
          content: el, yAnchor: 1.2,
        });
        ov.setMap(map);
        cleanups.push(() => ov.setMap(null));
      });

      // 지도를 누르면 그 자리 주변 실제 가게를 찾아 옵니다. 점(좌표)에는
      // 상호명이 없어서, 이 클릭이 "저 점이 무슨 가게냐"의 답입니다.
      kakao.maps.event.addListener(map, 'click', async (e) => {
        const la = e.latLng.getLat(), lo = e.latLng.getLng();
        clickDotRef.current?.setMap(null);
        const dot = new kakao.maps.Circle({
          center: new kakao.maps.LatLng(la, lo), radius: 16,
          strokeWeight: 2, strokeColor: '#38322A', strokeOpacity: 0.85,
          fillColor: '#FFBC00', fillOpacity: 0.35, zIndex: 6,
        });
        dot.setMap(map);
        clickDotRef.current = dot;
        setNear({ loading: true });
        try {
          const q = new URLSearchParams({ lat: String(la), lng: String(lo) });
          if (industry) q.set('q', industry);
          const r = await fetch(`/api/v1/nearby?${q}`);
          const d = await r.json();
          if (d.ok) setNear({ loading: false, query: d.query, places: d.places });
          else setNear(null);
        } catch { setNear(null); }
      });
      cleanups.push(() => clickDotRef.current?.setMap(null));

      // 도착 비행 — 카카오는 flyTo가 없어 panTo + 단계 줌으로 만듭니다.
      const to = new kakao.maps.LatLng(target.latitude, target.longitude);
      setTimeout(() => { map.setCenter(to); map.setLevel(8, { animate: true }); }, 350);
      setTimeout(() => { map.panTo(to); map.setLevel(5, { animate: true }); }, 1200);
      setTimeout(() => { map.panTo(to); map.setLevel(3, { animate: true }); }, 2000);
    })();

    return () => { disposed = true; cleanups.forEach((f) => f()); };
  }, [pins, dongCode, industryCode, onFallback]);

  // 열지도 토글 — 원들의 옵션만 바꿉니다(다시 그리지 않음)
  const applyHeat = (on: boolean) => {
    setHeat(on);
    circlesRef.current.forEach((c) => c.setOptions(on
      ? { radius: 45, strokeWeight: 0, fillColor: '#FF3B1F', fillOpacity: 0.09 }
      : { radius: 12, strokeWeight: 1.5, strokeColor: '#ffffff',
          strokeOpacity: 0.9, fillColor: '#FF3B1F', fillOpacity: 0.9 }));
  };


  const runTour = async () => {
    const kakao = kakaoRef.current; const map = mapRef.current;
    const target = pins.find((p) => p.is_target) ?? pins[0];
    if (!kakao || !map || !target || touring) return;
    setTouring(true);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = (t: string) => setTourStep(t);
    // 작은 꿀비가 투어에 합류 — 지도 위 비율 좌표로 날아가 해설합니다
    const beeTo = (fx: number, fy: number) => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      window.dispatchEvent(new CustomEvent('kkulbee:flyto', {
        detail: { x: r.left + r.width * fx, y: r.top + r.height * fy } }));
    };
    const beeHome = () => window.dispatchEvent(new CustomEvent('kkulbee:flyhome'));
    const center = new kakao.maps.LatLng(target.latitude, target.longitude);
    try {
      step(`${target.name}입니다`);
      beeTo(0.84, 0.2);
      map.panTo(center); map.setLevel(4, { animate: true }); await wait(2400);
      if (shops && shops.total > 0) {
        step(`빨간 점 하나가 실제 ${industry ?? '동종업종'} 한 곳 — 모두 ${shops.total}곳입니다`);
        beeTo(0.16, 0.28);
        map.panTo(center); map.setLevel(2, { animate: true }); await wait(3000);
        step('열지도로 보면 경쟁이 몰린 골목이 드러납니다');
        beeTo(0.5, 0.16);
        applyHeat(true); await wait(2800);
        applyHeat(false);
      }
      if (pins.length > 1) {
        step('옆 동네와 나란히 놓고 봐야 이 점수의 높낮이가 읽힙니다');
        beeTo(0.84, 0.72);
        const b = new kakao.maps.LatLngBounds();
        pins.forEach((p) => b.extend(new kakao.maps.LatLng(p.latitude, p.longitude)));
        map.setBounds(b, 40); await wait(3200);
        map.panTo(center); map.setLevel(3, { animate: true });
      }
      step('구석구석은 직접 움직여 보세요 — 건물 이름까지 보입니다');
      await wait(2200);
    } finally { beeHome(); setTourStep(null); setTouring(false); }
  };

  return (
    <div className="relative">
      <div className="relative">
        <div ref={boxRef}
             className="h-[380px] w-full overflow-hidden rounded-xl ring-1 ring-kb-ink/[.14]" />
        {tourStep && (
          <div className="absolute bottom-3 left-1/2 z-[600] w-[88%] max-w-[420px]
                          -translate-x-1/2 rounded-xl bg-kb-ink/85 px-4 py-2.5
                          text-center text-[14.5px] font-medium text-white
                          shadow-lg backdrop-blur">
            {tourStep}
          </div>
        )}
        <div className="absolute left-2.5 top-2.5 z-[500] flex gap-1.5">
          <button onClick={runTour} disabled={touring}
            className="rounded-lg bg-kb-yellow px-3 py-1.5 text-[13.5px] font-bold
                       text-kb-ink shadow transition hover:brightness-105
                       disabled:opacity-60">
            {touring ? '투어 중…' : '▶ 지도 투어'}
          </button>
          <button onClick={() => applyHeat(!heat)}
            className={`rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold shadow
                        transition ${heat ? 'bg-kb-ink text-white'
                                          : 'bg-white text-kb-ink/78'}`}>
            {heat ? '점으로' : '열지도'}
          </button>
        </div>
      </div>
      {near && (
        <div className="mt-3 rounded-xl border border-kb-ink/[.12] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-bold text-kb-ink">
              누른 자리 주변 {near.query ?? '가게'}
              <span className="ml-1.5 font-medium text-kb-ink/55">
                — 카카오 실시간 검색 · 반경 350m · 가까운 순
              </span>
            </p>
            <button onClick={() => { setNear(null);
                                     clickDotRef.current?.setMap(null); }}
              className="shrink-0 rounded-md px-2 py-0.5 text-[13px]
                         text-kb-ink/55 transition hover:bg-kb-ink/[.05]">
              닫기
            </button>
          </div>
          {near.loading ? (
            <p className="mt-2 text-[13.5px] text-kb-ink/55">찾는 중입니다…</p>
          ) : (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {(near.places ?? []).map((p) => (
                <li key={p.url + p.name}>
                  <a href={p.url} target="_blank" rel="noreferrer"
                     className="group flex items-baseline gap-2 rounded-lg px-2
                                py-1 transition hover:bg-kb-yellow/[.1]">
                    <span className="min-w-0 flex-1 truncate text-[13.5px]
                                     font-semibold text-kb-ink/85
                                     group-hover:text-kb-ink">
                      {p.name}
                      <span className="ml-1.5 font-normal text-kb-ink/52">
                        {p.category}
                      </span>
                    </span>
                    {p.dist != null && (
                      <span className="shrink-0 text-[12.5px] text-kb-amber
                                       [font-variant-numeric:tabular-nums]">
                        {p.dist}m
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-2 text-[12.5px] text-kb-ink/55">
        카카오 지도 · 빨간 점은 실제 {industry ?? '동종업종'} 점포
        {shops ? ` ${shops.total.toLocaleString()}곳` : ''} · 점수 칩은 비교 상권
        · 지도를 누르면 그 자리 주변 가게 이름이 뜹니다
      </p>
    </div>
  );
}
