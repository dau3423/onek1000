// Kakao Maps SDK - 사용하는 부분만 최소 타입 선언
// 공식 타입 패키지가 없어 직접 정의. 글로벌 ambient로 노출.

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    function load(callback: () => void): void;

    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      constructor(sw?: LatLng, ne?: LatLng);
      extend(latlng: LatLng): void;
      getSouthWest(): LatLng;
      getNorthEast(): LatLng;
    }

    // 화면(컨테이너) 픽셀 좌표. projection 변환에 사용.
    class Point {
      constructor(x: number, y: number);
      x: number;
      y: number;
    }

    // 지도 좌표 ↔ 화면 픽셀 좌표 변환기. map.getProjection()으로 얻는다.
    interface MapProjection {
      containerPointFromCoords(latlng: LatLng): Point;
      coordsFromContainerPoint(point: Point): LatLng;
    }

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      getCenter(): LatLng;
      setLevel(level: number): void;
      getLevel(): number;
      getBounds(): LatLngBounds;
      getProjection(): MapProjection;
      panTo(latlng: LatLng): void;
      relayout(): void;
      setBounds(bounds: LatLngBounds): void;
    }

    interface MapOptions {
      center: LatLng;
      level: number;
      draggable?: boolean;
      scrollwheel?: boolean;
    }

    class Marker {
      constructor(options: { position: LatLng; map?: Map; image?: any; title?: string; clickable?: boolean });
      setMap(map: Map | null): void;
      getPosition(): LatLng;
    }

    class CustomOverlay {
      constructor(options: {
        position: LatLng;
        content: string | HTMLElement;
        map?: Map;
        yAnchor?: number;
        xAnchor?: number;
        clickable?: boolean;
        zIndex?: number;
      });
      setMap(map: Map | null): void;
      setPosition(latlng: LatLng): void;
      setZIndex(zIndex: number): void;
    }

    class Polyline {
      constructor(options: {
        path: LatLng[];
        map?: Map;
        strokeWeight?: number;
        strokeColor?: string;
        strokeOpacity?: number;
        strokeStyle?: string;
      });
      setMap(map: Map | null): void;
      setPath(path: LatLng[]): void;
    }

    class Circle {
      constructor(options: {
        center: LatLng;
        radius: number;
        strokeWeight?: number;
        strokeColor?: string;
        strokeOpacity?: number;
        strokeStyle?: string;
        fillColor?: string;
        fillOpacity?: number;
      });
      setMap(map: Map | null): void;
    }

    namespace event {
      function addListener(target: any, type: string, handler: (...args: any[]) => void): void;
      function removeListener(target: any, type: string, handler: (...args: any[]) => void): void;
    }

    namespace services {
      // 검색 결과 상태값
      enum Status {
        OK = 'OK',
        ZERO_RESULT = 'ZERO_RESULT',
        ERROR = 'ERROR',
      }

      // 키워드 검색 결과 항목 (사용하는 필드만)
      interface PlacesSearchResultItem {
        place_name: string;
        address_name: string;
        road_address_name: string;
        x: string; // 경도(lng)
        y: string; // 위도(lat)
        id: string;
      }

      class Places {
        constructor(map?: Map);
        keywordSearch(
          keyword: string,
          callback: (
            result: PlacesSearchResultItem[],
            status: Status,
            pagination: unknown,
          ) => void,
          options?: { size?: number; page?: number },
        ): void;
      }
    }
  }
}

export {};
