'use client';

import { NotifyOptInToggle } from '@/components/push/NotifyOptInToggle';
import { DropletIcon } from '@/components/icons';

/**
 * 세차 지수 알림 토글.
 * 실제 동작은 NotifyOptInToggle 공용 컴포넌트가 담당한다(켤 때 푸시 구독까지 함께 확보).
 */
export function CarwashNotifyToggle({ initialOptIn }: { initialOptIn: boolean }) {
  return (
    <NotifyOptInToggle
      initialOptIn={initialOptIn}
      field="carwashNotifyOptIn"
      namespace="carwash.notify"
      icon={<DropletIcon className="h-4 w-4" />}
    />
  );
}
