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

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      getCenter(): LatLng;
      setLevel(level: number): void;
      getLevel(): number;
      getBounds(): LatLngBounds;
      panTo(latlng: LatLng): void;
      relayout(): void;
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
  }
}

export {};
