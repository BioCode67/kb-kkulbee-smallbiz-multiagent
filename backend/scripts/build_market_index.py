"""전국 점포 실측 자료를 행정동별 상권 지표로 — 지어낸 숫자를 걷어냅니다.

상권 점수가 통째로 가짜였습니다. 동네 다섯 개는 손으로 적은 값이었고, 나머지
동네는 **이름을 해시해서 만든 난수**였습니다. 위경도까지 한반도 한가운데
무작위였습니다. 화면에는 "유동인구 24.6천명/일"처럼 소수점 한 자리까지
찍혀 나갔습니다. 심사에서 출처를 물으면 무너지는 자리였습니다.

이제 실제 자료로 셉니다.

  출처: 공공데이터포털 「소상공인시장진흥공단_상가(상권)정보」 2026-03-31
        전국 점포 약 290만 개. 업소마다 업종 3단계·행정동·좌표가 붙어 있습니다.

**이 자료로 잴 수 있는 것과 없는 것을 나눕니다.** 점포는 실측이지만 유동인구·
매출·폐업률은 이 자료에 없습니다. 없는 것을 추정해 채우면 다시 지어내는
것이므로, 없는 채로 두고 화면에도 없다고 적습니다.

  잴 수 있는 것 — 상권 규모, 동종업종 경쟁, 업종 집적, 생활밀착도, 밀집도
  없는 것     — 유동인구, 매출, 폐업률, 임대료

실행:
    python -m scripts.build_market_index                 # 캐시된 zip 사용
    python -m scripts.build_market_index --download      # 새로 받기
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import ssl
import sys
import urllib.request
import zipfile
import struct
from collections import defaultdict
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache", "market")
ZIP_PATH = os.path.join(CACHE, "sbiz_store.zip")
OUT_DIR = os.path.join(ROOT, "app", "data", "market_index")

# 공공데이터포털 파일데이터. 분기마다 새 판이 올라오며 그때 atchFileId가 바뀝니다.
DATASET_PAGE = "https://www.data.go.kr/data/15083033/fileData.do"
DOWNLOAD = ("https://www.data.go.kr/cmm/cmm/fileDownload.do"
            "?atchFileId=FILE_000000003676619&fileDetailSn=1")
SOURCE_NAME = "공공데이터포털 「소상공인시장진흥공단_상가(상권)정보」 2026-03-31"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# 한 동에 이만큼도 없으면 상권이라 부르기 어렵고, 백분위도 뜻을 잃습니다.
MIN_STORES = 30


def download() -> None:
    os.makedirs(CACHE, exist_ok=True)
    print(f"내려받는 중 — {SOURCE_NAME}")
    req = urllib.request.Request(DOWNLOAD, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": DATASET_PAGE,
    })
    with urllib.request.urlopen(req, timeout=300, context=CTX) as r, \
            open(ZIP_PATH, "wb") as f:
        got = 0
        while chunk := r.read(1 << 20):
            f.write(chunk)
            got += len(chunk)
            print(f"\r  {got/1e6:.0f} MB", end="")
    print()


def _median(xs: list[float]) -> float:
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def _spread_km2(lons: list[float], lats: list[float]) -> float:
    """점포가 퍼져 있는 넓이를 대략 잽니다.

    행정동 경계 면적이 아니라 **점포가 실제로 있는 범위**입니다. 같은 동이라도
    산이나 논이 절반이면 경계 면적으로 나눈 밀도는 실제 체감과 어긋납니다.

    양 끝 5%를 잘라 낸 뒤의 폭을 씁니다. 동 끝에 홀로 떨어진 점포 하나가
    넓이를 몇 배로 부풀리는 것을 막습니다.
    """
    if len(lons) < 5:
        return 0.0
    lo_s, la_s = sorted(lons), sorted(lats)
    i, j = int(len(lo_s) * 0.05), int(len(lo_s) * 0.95) - 1
    dlon = max(lo_s[j] - lo_s[i], 1e-4)
    dlat = max(la_s[j] - la_s[i], 1e-4)
    mid = _median(lats)
    # 위도 1도 ≈ 111km, 경도 1도 ≈ 111km × cos(위도)
    return (dlat * 111.0) * (dlon * 111.0 * math.cos(math.radians(mid)))


def _entropy(counts: list[int]) -> float:
    """업종이 얼마나 고르게 섞여 있는가. 0이면 한 업종뿐입니다.

    한 업종만 늘어선 거리(예: 유흥가)와 여러 업종이 섞인 거리(생활 상권)는
    성격이 다릅니다. 어느 쪽이 낫다는 것이 아니라 성격이 다르므로, 사장님이
    자기 업종에 맞는 자리인지 판단할 재료로 냅니다.
    """
    total = sum(counts)
    if total <= 0:
        return 0.0
    h = -sum((c / total) * math.log(c / total) for c in counts if c > 0)
    return round(h, 3)


def aggregate() -> dict:
    """시도별 CSV 17개를 훑어 행정동 단위로 접습니다."""
    z = zipfile.ZipFile(ZIP_PATH)
    csvs = [n for n in z.namelist() if n.lower().endswith(".csv")]

    dong: dict[str, dict] = {}
    nation_small: dict[str, int] = defaultdict(int)   # 소분류 전국 점포수
    small_name: dict[str, str] = {}
    large_name: dict[str, str] = {}
    total_rows = 0

    for n, name in enumerate(sorted(csvs), 1):
        label = name.encode("cp437").decode("cp949", "replace")
        with z.open(name) as f:
            rd = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig",
                                                 errors="replace"))
            for row in rd:
                code = (row.get("행정동코드") or "").strip()
                if not code:
                    continue
                sm = (row.get("상권업종소분류코드") or "").strip()
                lg = (row.get("상권업종대분류코드") or "").strip()
                if not sm:
                    continue

                d = dong.get(code)
                if d is None:
                    d = dong[code] = {
                        "sido": (row.get("시도명") or "").strip(),
                        "sgg": (row.get("시군구명") or "").strip(),
                        "dong": (row.get("행정동명") or "").strip(),
                        "n": 0, "small": defaultdict(int), "large": defaultdict(int),
                        "lons": [], "lats": [], "pts": [],
                    }
                d["n"] += 1
                d["small"][sm] += 1
                d["large"][lg] += 1
                nation_small[sm] += 1
                small_name.setdefault(sm, (row.get("상권업종소분류명") or "").strip())
                large_name.setdefault(lg, (row.get("상권업종대분류명") or "").strip())

                try:
                    lo, la = float(row["경도"]), float(row["위도"])
                    if 124 < lo < 132 and 33 < la < 39:
                        d["lons"].append(lo)
                        d["lats"].append(la)
                        # 지도에 실제 점포를 찍기 위해 좌표를 업종과 함께
                        # 남깁니다. 집계값만으로는 "카페 204개"라고 말할 수는
                        # 있어도 그 204개가 어디에 있는지는 못 보여 줍니다.
                        d["pts"].append((sm, la, lo))
                except (KeyError, ValueError, TypeError):
                    pass
                total_rows += 1

        print(f"  [{n:2d}/{len(csvs)}] {label[-16:-4]:>10}  누적 {total_rows:,}개 "
              f"· 행정동 {len(dong):,}")

    return {"dong": dong, "nation_small": dict(nation_small),
            "small_name": small_name, "large_name": large_name,
            "rows": total_rows}


def finalize(agg: dict) -> tuple[dict, dict]:
    """행정동별 지표를 굳히고, 전국 분포를 함께 만듭니다.

    백분위를 내려면 전국 분포가 있어야 합니다. "카페 87개"는 그 자체로는
    많은지 적은지 알 수 없고, 전국 행정동 중 몇 %에 드는지를 알아야
    뜻이 생깁니다.
    """
    out: dict[str, dict] = {}
    for code, d in agg["dong"].items():
        if d["n"] < MIN_STORES:
            continue
        area = _spread_km2(d["lons"], d["lats"])
        out[code] = {
            "sido": d["sido"], "sgg": d["sgg"], "dong": d["dong"],
            "stores": d["n"],
            "lat": round(_median(d["lats"]), 5) if d["lats"] else None,
            "lon": round(_median(d["lons"]), 5) if d["lons"] else None,
            "area_km2": round(area, 3),
            "density": round(d["n"] / area, 1) if area > 0.01 else None,
            "diversity": _entropy(list(d["small"].values())),
            "small": dict(d["small"]),
            "large": dict(d["large"]),
        }

    # 전국 분포 — 백분위를 내는 자
    stores = sorted(v["stores"] for v in out.values())
    dens = sorted(v["density"] for v in out.values() if v["density"])
    divs = sorted(v["diversity"] for v in out.values())

    # 업종별 '한 동에 몇 개나 있는가'의 분포. 경쟁 강도를 재는 자입니다.
    per_small: dict[str, list[int]] = defaultdict(list)
    for v in out.values():
        for sm, c in v["small"].items():
            per_small[sm].append(c)

    nation = {
        "dongs": len(out),
        "stores_dist": stores,
        "density_dist": dens,
        "diversity_dist": divs,
        "small_name": agg["small_name"],
        "large_name": agg["large_name"],
        "small_national": agg["nation_small"],
        # 업종별 분포는 상위 업종만 남깁니다. 전부 담으면 파일이 커지고,
        # 점포가 몇 개뿐인 업종은 백분위 자체가 뜻이 없습니다.
        "small_dist": {sm: sorted(v) for sm, v in per_small.items()
                       if agg["nation_small"].get(sm, 0) >= 300},
    }
    return out, nation


def write_points(agg: dict, kept: dict) -> dict:
    """점포 좌표를 이진 파일 하나로 내보냅니다.

    272만 개를 JSON으로 두면 60MB가 넘고, 서버가 그걸 통째로 메모리에 올리면
    무료 등급 512MB가 그 자리에서 끝납니다. 그래서 두 벌로 나눕니다.

      points.bin    한 점포가 10바이트 — 업종번호(2) + 위도(4) + 경도(4)
      points_index  행정동코드 → [시작 위치, 개수]. 3,450줄이라 가볍습니다.

    서버는 색인에서 그 동네의 자리만 찾아 8KB쯤을 읽습니다. 전체를 올릴
    이유가 없습니다. 메모리는 요청 수와 무관하게 평평합니다.
    """
    os.makedirs(OUT_DIR, exist_ok=True)
    ids = {code: i for i, code in enumerate(sorted(agg["nation_small"]))}

    index: dict[str, list[int]] = {}
    offset = 0
    with open(os.path.join(OUT_DIR, "points.bin"), "wb") as f:
        for code in kept:
            pts = agg["dong"][code]["pts"]
            if not pts:
                continue
            buf = bytearray()
            for sm, la, lo in pts:
                buf += struct.pack("<Hff", ids.get(sm, 0xFFFF), la, lo)
            f.write(buf)
            index[code] = [offset, len(pts)]
            offset += len(pts)

    with open(os.path.join(OUT_DIR, "points_index.json"), "w", encoding="utf-8") as f:
        json.dump({"stride": 10, "industry_ids": ids, "dong": index},
                  f, ensure_ascii=False, separators=(",", ":"))
    return {"points": offset, "bytes": offset * 10}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    a = ap.parse_args()

    if a.download or not os.path.exists(ZIP_PATH):
        download()
    print(f"자료 — {ZIP_PATH} ({os.path.getsize(ZIP_PATH)/1e6:.0f} MB)")

    agg = aggregate()
    dong, nation = finalize(agg)
    pts = write_points(agg, dong)
    print(f"  점포 좌표 {pts['points']:,}개 → points.bin ({pts['bytes']/1e6:.1f} MB)")

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "dong.json"), "w", encoding="utf-8") as f:
        json.dump(dong, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "nation.json"), "w", encoding="utf-8") as f:
        json.dump(nation, f, ensure_ascii=False, separators=(",", ":"))

    meta = {
        "built_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "built_for_date": date.today().isoformat(),
        "source": SOURCE_NAME,
        "source_url": DATASET_PAGE,
        "stores": agg["rows"],
        "dongs_total": len(agg["dong"]),
        "dongs_kept": len(dong),
        "min_stores": MIN_STORES,
        "industries": len(agg["nation_small"]),
        "store_points": pts["points"],
        "measured": ["상권 규모", "동종업종 경쟁", "업종 집적", "업종 다양성", "점포 밀집도"],
        "not_measured": ["유동인구", "매출", "폐업률", "임대료"],
        "note": ("점포는 실측입니다. 유동인구·매출·폐업률은 이 자료에 없어 "
                 "점수에 넣지 않았습니다. 추정해 채우지 않습니다."),
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)

    size = sum(os.path.getsize(os.path.join(OUT_DIR, n)) for n in os.listdir(OUT_DIR))
    print(f"\n[saved] {OUT_DIR}  ({size/1e6:.1f} MB)")
    print(f"  점포 {agg['rows']:,}개 · 행정동 {len(agg['dong']):,} "
          f"→ {len(dong):,} (점포 {MIN_STORES}개 미만 제외)")
    print(f"  업종 소분류 {len(agg['nation_small'])}종")
    return 0


if __name__ == "__main__":
    sys.exit(main())
