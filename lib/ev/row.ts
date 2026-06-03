// ev_chargers 테이블 1행 매핑 — sync(전국 배치)와 상세 라이브 갱신이 공유한다.
// getChargerInfo item → ev_chargers 행. 매핑 규칙을 한 곳에 모아 두 경로의 일관성을 보장한다.
import { evNorm, evYn, evDateToIso, type EvChargerInfoItem } from './client';

export interface EvRow {
  stat_id: string;
  chger_id: string;
  stat_nm: string;
  addr: string | null;
  addr_detail: string | null;
  lat: number;
  lng: number;
  geom: string;
  chger_type: string | null;
  output_kw: number | null;
  use_time: string | null;
  method: string | null;
  busi_id: string | null;
  busi_nm: string | null;
  busi_call: string | null;
  stat: string | null;
  stat_upd_dt: string | null;
  kind: string | null;
  kind_detail: string | null;
  zcode: string | null;
  zscode: string | null;
  parking_free: boolean | null;
  limit_yn: boolean | null;
  del_yn: boolean;
  output_raw: string | null;
  synced_at: string;
}

/** getChargerInfo item → ev_chargers 행. 좌표/필수값 누락이면 null(skip). */
export function toRow(it: EvChargerInfoItem, now: string): EvRow | null {
  const statId = evNorm(it.statId);
  const chgerId = evNorm(it.chgerId);
  if (!statId || !chgerId) return null;

  const lat = Number(evNorm(it.lat));
  const lng = Number(evNorm(it.lng));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;

  const outRaw = evNorm(it.output);
  const outNum = outRaw != null ? Number(outRaw) : NaN;

  return {
    stat_id: statId,
    chger_id: chgerId,
    stat_nm: evNorm(it.statNm) ?? statId,
    addr: evNorm(it.addr),
    addr_detail: evNorm(it.addrDetail),
    lat,
    lng,
    geom: `SRID=4326;POINT(${lng} ${lat})`,
    chger_type: evNorm(it.chgerType),
    output_kw: Number.isFinite(outNum) ? Math.round(outNum) : null,
    use_time: evNorm(it.useTime),
    method: evNorm(it.method),
    busi_id: evNorm(it.busiId),
    busi_nm: evNorm(it.busiNm),
    busi_call: evNorm(it.busiCall),
    stat: evNorm(it.stat),
    stat_upd_dt: evDateToIso(it.statUpdDt),
    kind: evNorm(it.kind),
    kind_detail: evNorm(it.kindDetail),
    zcode: evNorm(it.zcode),
    zscode: evNorm(it.zscode),
    parking_free: evYn(it.parkingFree),
    limit_yn: evYn(it.limitYn),
    del_yn: evYn(it.delYn) ?? false,
    output_raw: outRaw,
    synced_at: now,
  };
}
