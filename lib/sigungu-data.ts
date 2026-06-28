// 시군구 코드(opinet AREA_CD 4자리) ↔ 시도/한글이름 정적 매핑.
// 운영 stations.sigungu_code + address에서 1회 생성(코드 앞 2자리=시도, 주소 첫 행정토큰=이름).
// opinet은 기초자치단체 단위라 시 산하 일반구(예: 수원시 팔달구)는 시(수원시)로 묶인다.
// 행정구역/데이터 변경 시 재생성. (세종은 시군구가 없어 시도 페이지가 커버 → 제외)
import type { SidoCode } from '@/types/station';

export interface Sigungu {
  code: string;   // opinet AREA_CD 4자리 (stations.sigungu_code)
  sido: SidoCode; // 코드 앞 2자리
  name: string;   // 한글 기초자치단체명 (예: 종로구, 수원시 — 시 산하 일반구는 시로 묶임)
}

export const SIGUNGU: Sigungu[] = [
  {
    "code": "0101",
    "sido": "01",
    "name": "종로구"
  },
  {
    "code": "0102",
    "sido": "01",
    "name": "중구"
  },
  {
    "code": "0103",
    "sido": "01",
    "name": "동대문구"
  },
  {
    "code": "0104",
    "sido": "01",
    "name": "성동구"
  },
  {
    "code": "0105",
    "sido": "01",
    "name": "성북구"
  },
  {
    "code": "0106",
    "sido": "01",
    "name": "도봉구"
  },
  {
    "code": "0107",
    "sido": "01",
    "name": "서대문구"
  },
  {
    "code": "0108",
    "sido": "01",
    "name": "은평구"
  },
  {
    "code": "0109",
    "sido": "01",
    "name": "마포구"
  },
  {
    "code": "0110",
    "sido": "01",
    "name": "용산구"
  },
  {
    "code": "0111",
    "sido": "01",
    "name": "영등포구"
  },
  {
    "code": "0112",
    "sido": "01",
    "name": "동작구"
  },
  {
    "code": "0113",
    "sido": "01",
    "name": "강남구"
  },
  {
    "code": "0114",
    "sido": "01",
    "name": "강동구"
  },
  {
    "code": "0115",
    "sido": "01",
    "name": "강서구"
  },
  {
    "code": "0116",
    "sido": "01",
    "name": "구로구"
  },
  {
    "code": "0117",
    "sido": "01",
    "name": "관악구"
  },
  {
    "code": "0118",
    "sido": "01",
    "name": "노원구"
  },
  {
    "code": "0119",
    "sido": "01",
    "name": "양천구"
  },
  {
    "code": "0120",
    "sido": "01",
    "name": "중랑구"
  },
  {
    "code": "0121",
    "sido": "01",
    "name": "서초구"
  },
  {
    "code": "0122",
    "sido": "01",
    "name": "송파구"
  },
  {
    "code": "0123",
    "sido": "01",
    "name": "광진구"
  },
  {
    "code": "0124",
    "sido": "01",
    "name": "강북구"
  },
  {
    "code": "0125",
    "sido": "01",
    "name": "금천구"
  },
  {
    "code": "0201",
    "sido": "02",
    "name": "수원시"
  },
  {
    "code": "0202",
    "sido": "02",
    "name": "성남시"
  },
  {
    "code": "0203",
    "sido": "02",
    "name": "의정부시"
  },
  {
    "code": "0204",
    "sido": "02",
    "name": "안양시"
  },
  {
    "code": "0205",
    "sido": "02",
    "name": "부천시"
  },
  {
    "code": "0206",
    "sido": "02",
    "name": "동두천시"
  },
  {
    "code": "0207",
    "sido": "02",
    "name": "광명시"
  },
  {
    "code": "0208",
    "sido": "02",
    "name": "이천시"
  },
  {
    "code": "0209",
    "sido": "02",
    "name": "평택시"
  },
  {
    "code": "0210",
    "sido": "02",
    "name": "구리시"
  },
  {
    "code": "0211",
    "sido": "02",
    "name": "과천시"
  },
  {
    "code": "0212",
    "sido": "02",
    "name": "안산시"
  },
  {
    "code": "0213",
    "sido": "02",
    "name": "오산시"
  },
  {
    "code": "0214",
    "sido": "02",
    "name": "의왕시"
  },
  {
    "code": "0215",
    "sido": "02",
    "name": "군포시"
  },
  {
    "code": "0216",
    "sido": "02",
    "name": "시흥시"
  },
  {
    "code": "0217",
    "sido": "02",
    "name": "남양주시"
  },
  {
    "code": "0218",
    "sido": "02",
    "name": "하남시"
  },
  {
    "code": "0219",
    "sido": "02",
    "name": "고양시"
  },
  {
    "code": "0220",
    "sido": "02",
    "name": "용인시"
  },
  {
    "code": "0221",
    "sido": "02",
    "name": "양주시"
  },
  {
    "code": "0222",
    "sido": "02",
    "name": "여주시"
  },
  {
    "code": "0224",
    "sido": "02",
    "name": "화성시"
  },
  {
    "code": "0226",
    "sido": "02",
    "name": "파주시"
  },
  {
    "code": "0228",
    "sido": "02",
    "name": "광주시"
  },
  {
    "code": "0229",
    "sido": "02",
    "name": "연천군"
  },
  {
    "code": "0230",
    "sido": "02",
    "name": "포천시"
  },
  {
    "code": "0231",
    "sido": "02",
    "name": "가평군"
  },
  {
    "code": "0232",
    "sido": "02",
    "name": "양평군"
  },
  {
    "code": "0235",
    "sido": "02",
    "name": "안성시"
  },
  {
    "code": "0236",
    "sido": "02",
    "name": "김포시"
  },
  {
    "code": "0301",
    "sido": "03",
    "name": "춘천시"
  },
  {
    "code": "0302",
    "sido": "03",
    "name": "원주시"
  },
  {
    "code": "0303",
    "sido": "03",
    "name": "강릉시"
  },
  {
    "code": "0304",
    "sido": "03",
    "name": "속초시"
  },
  {
    "code": "0305",
    "sido": "03",
    "name": "동해시"
  },
  {
    "code": "0306",
    "sido": "03",
    "name": "태백시"
  },
  {
    "code": "0307",
    "sido": "03",
    "name": "삼척시"
  },
  {
    "code": "0322",
    "sido": "03",
    "name": "홍천군"
  },
  {
    "code": "0323",
    "sido": "03",
    "name": "횡성군"
  },
  {
    "code": "0325",
    "sido": "03",
    "name": "영월군"
  },
  {
    "code": "0326",
    "sido": "03",
    "name": "평창군"
  },
  {
    "code": "0327",
    "sido": "03",
    "name": "정선군"
  },
  {
    "code": "0328",
    "sido": "03",
    "name": "철원군"
  },
  {
    "code": "0329",
    "sido": "03",
    "name": "화천군"
  },
  {
    "code": "0330",
    "sido": "03",
    "name": "양구군"
  },
  {
    "code": "0331",
    "sido": "03",
    "name": "인제군"
  },
  {
    "code": "0332",
    "sido": "03",
    "name": "고성군"
  },
  {
    "code": "0333",
    "sido": "03",
    "name": "양양군"
  },
  {
    "code": "0401",
    "sido": "04",
    "name": "청주시"
  },
  {
    "code": "0402",
    "sido": "04",
    "name": "충주시"
  },
  {
    "code": "0403",
    "sido": "04",
    "name": "제천시"
  },
  {
    "code": "0425",
    "sido": "04",
    "name": "진천군"
  },
  {
    "code": "0426",
    "sido": "04",
    "name": "괴산군"
  },
  {
    "code": "0427",
    "sido": "04",
    "name": "음성군"
  },
  {
    "code": "0430",
    "sido": "04",
    "name": "단양군"
  },
  {
    "code": "0431",
    "sido": "04",
    "name": "증평군"
  },
  {
    "code": "0502",
    "sido": "05",
    "name": "천안시"
  },
  {
    "code": "0504",
    "sido": "05",
    "name": "아산시"
  },
  {
    "code": "0506",
    "sido": "05",
    "name": "서산시"
  },
  {
    "code": "0521",
    "sido": "05",
    "name": "금산군"
  },
  {
    "code": "0527",
    "sido": "05",
    "name": "서천군"
  },
  {
    "code": "0531",
    "sido": "05",
    "name": "예산군"
  },
  {
    "code": "0533",
    "sido": "05",
    "name": "당진시"
  },
  {
    "code": "0537",
    "sido": "05",
    "name": "태안군"
  },
  {
    "code": "0601",
    "sido": "06",
    "name": "전주시"
  },
  {
    "code": "0602",
    "sido": "06",
    "name": "군산시"
  },
  {
    "code": "0603",
    "sido": "06",
    "name": "익산시"
  },
  {
    "code": "0604",
    "sido": "06",
    "name": "남원시"
  },
  {
    "code": "0605",
    "sido": "06",
    "name": "정읍시"
  },
  {
    "code": "0606",
    "sido": "06",
    "name": "김제시"
  },
  {
    "code": "0621",
    "sido": "06",
    "name": "완주군"
  },
  {
    "code": "0622",
    "sido": "06",
    "name": "진안군"
  },
  {
    "code": "0623",
    "sido": "06",
    "name": "무주군"
  },
  {
    "code": "0624",
    "sido": "06",
    "name": "장수군"
  },
  {
    "code": "0625",
    "sido": "06",
    "name": "임실군"
  },
  {
    "code": "0627",
    "sido": "06",
    "name": "순창군"
  },
  {
    "code": "0629",
    "sido": "06",
    "name": "고창군"
  },
  {
    "code": "0630",
    "sido": "06",
    "name": "부안군"
  },
  {
    "code": "0702",
    "sido": "07",
    "name": "목포시"
  },
  {
    "code": "0703",
    "sido": "07",
    "name": "여수시"
  },
  {
    "code": "0704",
    "sido": "07",
    "name": "순천시"
  },
  {
    "code": "0705",
    "sido": "07",
    "name": "나주시"
  },
  {
    "code": "0707",
    "sido": "07",
    "name": "광양시"
  },
  {
    "code": "0722",
    "sido": "07",
    "name": "담양군"
  },
  {
    "code": "0723",
    "sido": "07",
    "name": "곡성군"
  },
  {
    "code": "0724",
    "sido": "07",
    "name": "구례군"
  },
  {
    "code": "0728",
    "sido": "07",
    "name": "고흥군"
  },
  {
    "code": "0729",
    "sido": "07",
    "name": "보성군"
  },
  {
    "code": "0730",
    "sido": "07",
    "name": "화순군"
  },
  {
    "code": "0731",
    "sido": "07",
    "name": "장흥군"
  },
  {
    "code": "0732",
    "sido": "07",
    "name": "강진군"
  },
  {
    "code": "0733",
    "sido": "07",
    "name": "해남군"
  },
  {
    "code": "0734",
    "sido": "07",
    "name": "영암군"
  },
  {
    "code": "0735",
    "sido": "07",
    "name": "무안군"
  },
  {
    "code": "0737",
    "sido": "07",
    "name": "함평군"
  },
  {
    "code": "0738",
    "sido": "07",
    "name": "영광군"
  },
  {
    "code": "0739",
    "sido": "07",
    "name": "장성군"
  },
  {
    "code": "0740",
    "sido": "07",
    "name": "완도군"
  },
  {
    "code": "0741",
    "sido": "07",
    "name": "진도군"
  },
  {
    "code": "0742",
    "sido": "07",
    "name": "신안군"
  },
  {
    "code": "0801",
    "sido": "08",
    "name": "포항시"
  },
  {
    "code": "0802",
    "sido": "08",
    "name": "경주시"
  },
  {
    "code": "0803",
    "sido": "08",
    "name": "김천시"
  },
  {
    "code": "0804",
    "sido": "08",
    "name": "영주시"
  },
  {
    "code": "0805",
    "sido": "08",
    "name": "영천시"
  },
  {
    "code": "0806",
    "sido": "08",
    "name": "안동시"
  },
  {
    "code": "0808",
    "sido": "08",
    "name": "문경시"
  },
  {
    "code": "0809",
    "sido": "08",
    "name": "상주시"
  },
  {
    "code": "0810",
    "sido": "08",
    "name": "경산시"
  },
  {
    "code": "0823",
    "sido": "08",
    "name": "의성군"
  },
  {
    "code": "0825",
    "sido": "08",
    "name": "청송군"
  },
  {
    "code": "0826",
    "sido": "08",
    "name": "영양군"
  },
  {
    "code": "0832",
    "sido": "08",
    "name": "청도군"
  },
  {
    "code": "0833",
    "sido": "08",
    "name": "고령군"
  },
  {
    "code": "0834",
    "sido": "08",
    "name": "성주군"
  },
  {
    "code": "0835",
    "sido": "08",
    "name": "칠곡군"
  },
  {
    "code": "0840",
    "sido": "08",
    "name": "예천군"
  },
  {
    "code": "0842",
    "sido": "08",
    "name": "봉화군"
  },
  {
    "code": "0843",
    "sido": "08",
    "name": "울진군"
  },
  {
    "code": "0844",
    "sido": "08",
    "name": "울릉군"
  },
  {
    "code": "0902",
    "sido": "09",
    "name": "창원시"
  },
  {
    "code": "0904",
    "sido": "09",
    "name": "진주시"
  },
  {
    "code": "0906",
    "sido": "09",
    "name": "통영시"
  },
  {
    "code": "0907",
    "sido": "09",
    "name": "사천시"
  },
  {
    "code": "0908",
    "sido": "09",
    "name": "김해시"
  },
  {
    "code": "0909",
    "sido": "09",
    "name": "밀양시"
  },
  {
    "code": "0910",
    "sido": "09",
    "name": "거제시"
  },
  {
    "code": "0911",
    "sido": "09",
    "name": "양산시"
  },
  {
    "code": "0922",
    "sido": "09",
    "name": "의령군"
  },
  {
    "code": "0923",
    "sido": "09",
    "name": "함안군"
  },
  {
    "code": "0924",
    "sido": "09",
    "name": "창녕군"
  },
  {
    "code": "0932",
    "sido": "09",
    "name": "고성군"
  },
  {
    "code": "0934",
    "sido": "09",
    "name": "남해군"
  },
  {
    "code": "0935",
    "sido": "09",
    "name": "하동군"
  },
  {
    "code": "0936",
    "sido": "09",
    "name": "산청군"
  },
  {
    "code": "0937",
    "sido": "09",
    "name": "함양군"
  },
  {
    "code": "0938",
    "sido": "09",
    "name": "거창군"
  },
  {
    "code": "0939",
    "sido": "09",
    "name": "합천군"
  },
  {
    "code": "1001",
    "sido": "10",
    "name": "중구"
  },
  {
    "code": "1002",
    "sido": "10",
    "name": "서구"
  },
  {
    "code": "1003",
    "sido": "10",
    "name": "동구"
  },
  {
    "code": "1004",
    "sido": "10",
    "name": "영도구"
  },
  {
    "code": "1005",
    "sido": "10",
    "name": "부산진구"
  },
  {
    "code": "1006",
    "sido": "10",
    "name": "동래구"
  },
  {
    "code": "1007",
    "sido": "10",
    "name": "남구"
  },
  {
    "code": "1008",
    "sido": "10",
    "name": "북구"
  },
  {
    "code": "1009",
    "sido": "10",
    "name": "해운대구"
  },
  {
    "code": "1010",
    "sido": "10",
    "name": "사하구"
  },
  {
    "code": "1011",
    "sido": "10",
    "name": "강서구"
  },
  {
    "code": "1012",
    "sido": "10",
    "name": "금정구"
  },
  {
    "code": "1013",
    "sido": "10",
    "name": "연제구"
  },
  {
    "code": "1014",
    "sido": "10",
    "name": "수영구"
  },
  {
    "code": "1015",
    "sido": "10",
    "name": "사상구"
  },
  {
    "code": "1031",
    "sido": "10",
    "name": "기장군"
  },
  {
    "code": "1101",
    "sido": "11",
    "name": "제주시"
  },
  {
    "code": "1102",
    "sido": "11",
    "name": "서귀포시"
  },
  {
    "code": "1401",
    "sido": "14",
    "name": "중구"
  },
  {
    "code": "1402",
    "sido": "14",
    "name": "동구"
  },
  {
    "code": "1403",
    "sido": "14",
    "name": "서구"
  },
  {
    "code": "1404",
    "sido": "14",
    "name": "남구"
  },
  {
    "code": "1405",
    "sido": "14",
    "name": "북구"
  },
  {
    "code": "1406",
    "sido": "14",
    "name": "수성구"
  },
  {
    "code": "1407",
    "sido": "14",
    "name": "달서구"
  },
  {
    "code": "1431",
    "sido": "14",
    "name": "달성군"
  },
  {
    "code": "1501",
    "sido": "15",
    "name": "중구"
  },
  {
    "code": "1502",
    "sido": "15",
    "name": "동구"
  },
  {
    "code": "1503",
    "sido": "15",
    "name": "미추홀구"
  },
  {
    "code": "1504",
    "sido": "15",
    "name": "부평구"
  },
  {
    "code": "1505",
    "sido": "15",
    "name": "서구"
  },
  {
    "code": "1506",
    "sido": "15",
    "name": "남동구"
  },
  {
    "code": "1507",
    "sido": "15",
    "name": "연수구"
  },
  {
    "code": "1508",
    "sido": "15",
    "name": "계양구"
  },
  {
    "code": "1531",
    "sido": "15",
    "name": "강화군"
  },
  {
    "code": "1532",
    "sido": "15",
    "name": "옹진군"
  },
  {
    "code": "1601",
    "sido": "16",
    "name": "동구"
  },
  {
    "code": "1602",
    "sido": "16",
    "name": "서구"
  },
  {
    "code": "1603",
    "sido": "16",
    "name": "북구"
  },
  {
    "code": "1604",
    "sido": "16",
    "name": "광산구"
  },
  {
    "code": "1605",
    "sido": "16",
    "name": "남구"
  },
  {
    "code": "1701",
    "sido": "17",
    "name": "동구"
  },
  {
    "code": "1801",
    "sido": "18",
    "name": "중구"
  },
  {
    "code": "1802",
    "sido": "18",
    "name": "남구"
  },
  {
    "code": "1803",
    "sido": "18",
    "name": "동구"
  },
  {
    "code": "1804",
    "sido": "18",
    "name": "북구"
  },
  {
    "code": "1831",
    "sido": "18",
    "name": "울주군"
  }
];
