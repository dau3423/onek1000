'use client';

import { NotifyOptInToggle } from '@/components/push/NotifyOptInToggle';
import { TrendUpIcon } from '@/components/icons';

/**
 * 주유 타이밍(가격 인상) 예측 알림 토글.
 * 실제 동작은 NotifyOptInToggle 공용 컴포넌트가 담당한다 — 세차 지수 토글과 나란히 놓이는
 * 같은 형태라, 각자 구현을 갖고 있으면 한쪽만 고쳐지는 사고가 난다.
 * (그 공용 컴포넌트가 켤 때 푸시 구독까지 함께 확보한다.)
 */
export function ForecastNotifyToggle({ initialOptIn }: { initialOptIn: boolean }) {
  return (
    <NotifyOptInToggle
      initialOptIn={initialOptIn}
      field="forecastNotifyOptIn"
      namespace="forecast.notify"
      icon={<TrendUpIcon className="h-4 w-4" />}
    />
  );
}
