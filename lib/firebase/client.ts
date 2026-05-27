// Firebase Web SDK 클라이언트 — Analytics / FCM 등 클라이언트 전용 기능에 사용
// 서버 사이드에서는 호출 금지 (window 의존).

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** 싱글톤 Firebase App 가져오기. SSR에서도 안전 — initializeApp만 호출하고 SDK 자체는 사용 측에서 가드 */
export function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfig.apiKey) {
    throw new Error('Firebase config missing — NEXT_PUBLIC_FIREBASE_API_KEY');
  }
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

/** 브라우저에서만 Analytics 초기화 (SSR 안전) */
export async function getFirebaseAnalytics() {
  if (typeof window === 'undefined') return null;
  if (!firebaseConfig.measurementId) return null;
  const { isSupported, getAnalytics } = await import('firebase/analytics');
  const supported = await isSupported();
  if (!supported) return null;
  return getAnalytics(getFirebaseApp());
}
