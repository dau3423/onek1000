// 1000냥 주유소 - Mock 데이터
// 실서비스 전 개발/데모용. NEXT_PUBLIC_USE_MOCK=false 시 Opinet 실 API로 전환.

import type { StationBase, StationWithPrice, ProductCode, BrandCode, SidoCode } from '@/types/station';

interface SeedRow {
  id: string;
  name: string;
  brand: BrandCode;
  isSelf: boolean;
  sido: SidoCode;
  address: string;
  lat: number;
  lng: number;
  priceB027: number; // 휘발유
  priceD047: number; // 경유
  hasCarwash?: boolean;
  hasCvs?: boolean;
}

const SEED: SeedRow[] = [
  // ─── 서울 강남/서초/송파 ───
  { id: 'A0010001', name: 'GS 강남대로셀프', brand: 'GSC', isSelf: true,  sido: '01', address: '서울 강남구 강남대로 396', lat: 37.4989, lng: 127.0276, priceB027: 1592, priceD047: 1452, hasCarwash: true, hasCvs: true },
  { id: 'A0010002', name: 'SK 역삼셀프',     brand: 'SKE', isSelf: true,  sido: '01', address: '서울 강남구 역삼로 180',  lat: 37.5004, lng: 127.0367, priceB027: 1638, priceD047: 1498 },
  { id: 'A0010003', name: '알뜰 신논현셀프', brand: 'RTE', isSelf: true,  sido: '01', address: '서울 강남구 강남대로 462', lat: 37.5045, lng: 127.0252, priceB027: 1567, priceD047: 1428, hasCarwash: true },
  { id: 'A0010004', name: 'S-OIL 청담',      brand: 'SOL', isSelf: false, sido: '01', address: '서울 강남구 도산대로 449', lat: 37.5256, lng: 127.0455, priceB027: 1719, priceD047: 1579, hasCvs: true },
  { id: 'A0010005', name: '현대 삼성셀프',   brand: 'HDO', isSelf: true,  sido: '01', address: '서울 강남구 테헤란로 526', lat: 37.5074, lng: 127.0639, priceB027: 1645, priceD047: 1505 },
  { id: 'A0010006', name: 'GS 압구정',       brand: 'GSC', isSelf: false, sido: '01', address: '서울 강남구 압구정로 134', lat: 37.5274, lng: 127.0286, priceB027: 1768, priceD047: 1628, hasCarwash: true },
  { id: 'A0010007', name: 'SK 도곡셀프',     brand: 'SKE', isSelf: true,  sido: '01', address: '서울 강남구 남부순환로 2706', lat: 37.4854, lng: 127.0436, priceB027: 1612, priceD047: 1472 },
  { id: 'A0010008', name: '알뜰 일원',       brand: 'RTE', isSelf: true,  sido: '01', address: '서울 강남구 일원로 90',   lat: 37.4881, lng: 127.0825, priceB027: 1579, priceD047: 1439 },
  { id: 'A0010009', name: 'S-OIL 잠실',      brand: 'SOL', isSelf: true,  sido: '01', address: '서울 송파구 올림픽로 240', lat: 37.5117, lng: 127.0985, priceB027: 1655, priceD047: 1515, hasCvs: true },
  { id: 'A0010010', name: '현대 가락셀프',   brand: 'HDO', isSelf: true,  sido: '01', address: '서울 송파구 송파대로 234', lat: 37.4943, lng: 127.1185, priceB027: 1599, priceD047: 1459 },
  { id: 'A0010011', name: 'GS 문정',         brand: 'GSC', isSelf: false, sido: '01', address: '서울 송파구 충민로 10',   lat: 37.4848, lng: 127.1233, priceB027: 1685, priceD047: 1545 },
  { id: 'A0010012', name: 'SK 방배셀프',     brand: 'SKE', isSelf: true,  sido: '01', address: '서울 서초구 방배로 178',  lat: 37.4828, lng: 126.9962, priceB027: 1625, priceD047: 1485 },
  { id: 'A0010013', name: '알뜰 양재',       brand: 'RTE', isSelf: true,  sido: '01', address: '서울 서초구 매헌로 12',   lat: 37.4691, lng: 127.0388, priceB027: 1585, priceD047: 1445, hasCarwash: true },
  { id: 'A0010014', name: 'S-OIL 서초',      brand: 'SOL', isSelf: false, sido: '01', address: '서울 서초구 강남대로 233', lat: 37.4920, lng: 127.0301, priceB027: 1709, priceD047: 1569 },
  { id: 'A0010015', name: '현대 반포셀프',   brand: 'HDO', isSelf: true,  sido: '01', address: '서울 서초구 사평대로 365', lat: 37.5031, lng: 127.0067, priceB027: 1632, priceD047: 1492 },

  // ─── 서울 중구/종로/용산 ───
  { id: 'A0010016', name: 'GS 광화문',       brand: 'GSC', isSelf: false, sido: '01', address: '서울 중구 새문안로 88',   lat: 37.5712, lng: 126.9778, priceB027: 1748, priceD047: 1608, hasCvs: true },
  { id: 'A0010017', name: 'SK 시청셀프',     brand: 'SKE', isSelf: true,  sido: '01', address: '서울 중구 세종대로 110',  lat: 37.5663, lng: 126.9779, priceB027: 1665, priceD047: 1525 },
  { id: 'A0010018', name: '알뜰 종로5가',    brand: 'RTE', isSelf: true,  sido: '01', address: '서울 종로구 종로 277',    lat: 37.5709, lng: 127.0048, priceB027: 1598, priceD047: 1458 },
  { id: 'A0010019', name: 'S-OIL 한남',      brand: 'SOL', isSelf: false, sido: '01', address: '서울 용산구 한남대로 88', lat: 37.5358, lng: 127.0019, priceB027: 1729, priceD047: 1589, hasCarwash: true },
  { id: 'A0010020', name: '현대 이태원',     brand: 'HDO', isSelf: true,  sido: '01', address: '서울 용산구 이태원로 217', lat: 37.5346, lng: 126.9947, priceB027: 1639, priceD047: 1499 },

  // ─── 서울 마포/영등포/구로 ───
  { id: 'A0010021', name: 'GS 합정',         brand: 'GSC', isSelf: true,  sido: '01', address: '서울 마포구 양화로 50',   lat: 37.5494, lng: 126.9136, priceB027: 1618, priceD047: 1478 },
  { id: 'A0010022', name: 'SK 상암셀프',     brand: 'SKE', isSelf: true,  sido: '01', address: '서울 마포구 월드컵북로 396', lat: 37.5797, lng: 126.8898, priceB027: 1605, priceD047: 1465 },
  { id: 'A0010023', name: '알뜰 영등포',     brand: 'RTE', isSelf: true,  sido: '01', address: '서울 영등포구 영중로 15',   lat: 37.5152, lng: 126.9070, priceB027: 1572, priceD047: 1432, hasCarwash: true },
  { id: 'A0010024', name: 'S-OIL 여의도',    brand: 'SOL', isSelf: false, sido: '01', address: '서울 영등포구 의사당대로 1', lat: 37.5279, lng: 126.9252, priceB027: 1735, priceD047: 1595 },
  { id: 'A0010025', name: '현대 구로셀프',   brand: 'HDO', isSelf: true,  sido: '01', address: '서울 구로구 구로중앙로 152', lat: 37.4929, lng: 126.8848, priceB027: 1589, priceD047: 1449 },

  // ─── 서울 강북/노원/은평 ───
  { id: 'A0010026', name: 'GS 미아',         brand: 'GSC', isSelf: true,  sido: '01', address: '서울 강북구 도봉로 247',   lat: 37.6196, lng: 127.0252, priceB027: 1612, priceD047: 1472 },
  { id: 'A0010027', name: 'SK 노원셀프',     brand: 'SKE', isSelf: true,  sido: '01', address: '서울 노원구 동일로 1413', lat: 37.6541, lng: 127.0606, priceB027: 1598, priceD047: 1458 },
  { id: 'A0010028', name: '알뜰 은평',       brand: 'RTE', isSelf: true,  sido: '01', address: '서울 은평구 통일로 1019', lat: 37.6429, lng: 126.9269, priceB027: 1575, priceD047: 1435 },
  { id: 'A0010029', name: 'S-OIL 도봉',      brand: 'SOL', isSelf: false, sido: '01', address: '서울 도봉구 도봉로 705',  lat: 37.6747, lng: 127.0445, priceB027: 1685, priceD047: 1545 },
  { id: 'A0010030', name: '현대 수유셀프',   brand: 'HDO', isSelf: true,  sido: '01', address: '서울 강북구 노해로 25',    lat: 37.6398, lng: 127.0252, priceB027: 1602, priceD047: 1462 },

  // ─── 경기 분당/판교/수원 ───
  { id: 'A0020001', name: 'GS 판교셀프',     brand: 'GSC', isSelf: true,  sido: '02', address: '경기 성남시 분당구 판교역로 152', lat: 37.4012, lng: 127.1086, priceB027: 1572, priceD047: 1432, hasCarwash: true },
  { id: 'A0020002', name: 'SK 분당셀프',     brand: 'SKE', isSelf: true,  sido: '02', address: '경기 성남시 분당구 성남대로 343', lat: 37.3514, lng: 127.1167, priceB027: 1585, priceD047: 1445 },
  { id: 'A0020003', name: '알뜰 수원',       brand: 'RTE', isSelf: true,  sido: '02', address: '경기 수원시 권선구 권선로 234', lat: 37.2636, lng: 127.0286, priceB027: 1559, priceD047: 1419 },
  { id: 'A0020004', name: 'S-OIL 광교',      brand: 'SOL', isSelf: false, sido: '02', address: '경기 수원시 영통구 광교로 145', lat: 37.2882, lng: 127.0541, priceB027: 1672, priceD047: 1532 },
  { id: 'A0020005', name: '현대 용인셀프',   brand: 'HDO', isSelf: true,  sido: '02', address: '경기 용인시 처인구 중부대로 1199', lat: 37.2342, lng: 127.2010, priceB027: 1568, priceD047: 1428 },
  { id: 'A0020006', name: 'GS 안양',         brand: 'GSC', isSelf: true,  sido: '02', address: '경기 안양시 만안구 만안로 49',   lat: 37.3960, lng: 126.9229, priceB027: 1592, priceD047: 1452 },
  { id: 'A0020007', name: 'SK 일산셀프',     brand: 'SKE', isSelf: true,  sido: '02', address: '경기 고양시 일산서구 중앙로 1455', lat: 37.6786, lng: 126.7517, priceB027: 1605, priceD047: 1465 },
  { id: 'A0020008', name: '알뜰 안산',       brand: 'RTE', isSelf: true,  sido: '02', address: '경기 안산시 단원구 중앙대로 887', lat: 37.3155, lng: 126.8392, priceB027: 1549, priceD047: 1409, hasCarwash: true },

  // ─── 인천 ───
  { id: 'A0150001', name: 'GS 부평셀프',     brand: 'GSC', isSelf: true,  sido: '15', address: '인천 부평구 부평대로 200', lat: 37.5072, lng: 126.7222, priceB027: 1582, priceD047: 1442 },
  { id: 'A0150002', name: 'SK 송도셀프',     brand: 'SKE', isSelf: true,  sido: '15', address: '인천 연수구 송도과학로 32', lat: 37.3886, lng: 126.6537, priceB027: 1598, priceD047: 1458 },
  { id: 'A0150003', name: '알뜰 인천공항',   brand: 'RTE', isSelf: true,  sido: '15', address: '인천 중구 공항로 272',     lat: 37.4602, lng: 126.4407, priceB027: 1645, priceD047: 1505 },

  // ─── 부산 ───
  { id: 'A0100001', name: 'GS 해운대',       brand: 'GSC', isSelf: true,  sido: '10', address: '부산 해운대구 해운대로 814', lat: 35.1631, lng: 129.1635, priceB027: 1612, priceD047: 1472 },
  { id: 'A0100002', name: 'SK 서면셀프',     brand: 'SKE', isSelf: true,  sido: '10', address: '부산 부산진구 중앙대로 668', lat: 35.1577, lng: 129.0594, priceB027: 1625, priceD047: 1485 },
  { id: 'A0100003', name: '알뜰 사상',       brand: 'RTE', isSelf: true,  sido: '10', address: '부산 사상구 사상로 230',    lat: 35.1517, lng: 128.9911, priceB027: 1579, priceD047: 1439 },

  // ─── 대구 ───
  { id: 'A0140001', name: 'GS 동대구',       brand: 'GSC', isSelf: true,  sido: '14', address: '대구 동구 동대구로 550',   lat: 35.8794, lng: 128.6286, priceB027: 1602, priceD047: 1462 },
  { id: 'A0140002', name: 'SK 수성셀프',     brand: 'SKE', isSelf: true,  sido: '14', address: '대구 수성구 달구벌대로 2284', lat: 35.8576, lng: 128.6304, priceB027: 1618, priceD047: 1478 },

  // ─── 대전 ───
  { id: 'A0170001', name: 'GS 둔산',         brand: 'GSC', isSelf: true,  sido: '17', address: '대전 서구 둔산로 100',     lat: 36.3504, lng: 127.3845, priceB027: 1589, priceD047: 1449 },
  { id: 'A0170002', name: '알뜰 유성',       brand: 'RTE', isSelf: true,  sido: '17', address: '대전 유성구 대학로 99',    lat: 36.3622, lng: 127.3454, priceB027: 1559, priceD047: 1419 },

  // ─── 광주 ───
  { id: 'A0160001', name: 'GS 상무',         brand: 'GSC', isSelf: true,  sido: '16', address: '광주 서구 상무중앙로 80', lat: 35.1521, lng: 126.8479, priceB027: 1595, priceD047: 1455 },

  // ─── 울산 ───
  { id: 'A0180001', name: 'SK 남구셀프',     brand: 'SKE', isSelf: true,  sido: '18', address: '울산 남구 삼산로 282',    lat: 35.5380, lng: 129.3389, priceB027: 1605, priceD047: 1465 },

  // ─── 강원 ───
  { id: 'A0030001', name: 'GS 춘천',         brand: 'GSC', isSelf: false, sido: '03', address: '강원 춘천시 영서로 2470', lat: 37.8813, lng: 127.7298, priceB027: 1635, priceD047: 1495 },
  { id: 'A0030002', name: '알뜰 강릉',       brand: 'RTE', isSelf: true,  sido: '03', address: '강원 강릉시 경강로 2056', lat: 37.7519, lng: 128.8761, priceB027: 1612, priceD047: 1472 },

  // ─── 제주 ───
  { id: 'A0110001', name: 'GS 제주시',       brand: 'GSC', isSelf: false, sido: '11', address: '제주 제주시 연삼로 224',  lat: 33.4996, lng: 126.5312, priceB027: 1758, priceD047: 1618 },
  { id: 'A0110002', name: 'SK 서귀포',       brand: 'SKE', isSelf: false, sido: '11', address: '제주 서귀포시 일주동로 8688', lat: 33.2541, lng: 126.5601, priceB027: 1772, priceD047: 1632 },
];

/** Mock 데이터를 StationWithPrice 배열로 변환 (지정 유종) */
export function getMockStations(product: ProductCode): StationWithPrice[] {
  const today = new Date().toISOString().slice(0, 10);
  return SEED.map((r) => {
    const price =
      product === 'B027' ? r.priceB027 :
      product === 'D047' ? r.priceD047 :
      product === 'B034' ? r.priceB027 + 250 :
      product === 'K015' ? r.priceD047 - 80 :
      r.priceD047 - 350;          // LPG는 대략적으로
    return {
      id: r.id,
      name: r.name,
      brand: r.brand,
      isSelf: r.isSelf,
      sido: r.sido,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      hasCarwash: r.hasCarwash,
      hasCvs: r.hasCvs,
      product,
      price,
      tradeDate: today,
    };
  });
}

/** ID로 mock 상세 정보 */
export function getMockStationDetail(id: string) {
  const r = SEED.find((s) => s.id === id);
  if (!r) return null;
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    isSelf: r.isSelf,
    sido: r.sido,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    hasCarwash: r.hasCarwash,
    hasCvs: r.hasCvs,
    prices: {
      B027: { price: r.priceB027, tradeDate: today },
      B034: { price: r.priceB027 + 250, tradeDate: today },
      D047: { price: r.priceD047, tradeDate: today },
      K015: { price: r.priceD047 - 80, tradeDate: today },
      C004: { price: r.priceD047 - 350, tradeDate: today },
    },
  };
}
