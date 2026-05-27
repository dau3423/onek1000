'use client';

import { SessionProvider as NASessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export function SessionProvider({ children }: { children: ReactNode }) {
  return <NASessionProvider refetchOnWindowFocus={false}>{children}</NASessionProvider>;
}
