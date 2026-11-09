import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { get } from './api';

/** GET with caching. Refetches whenever the screen regains focus (e.g. after finishing a workout). */
export function useGet<T = any>(path: string | null) {
  const q = useQuery<T>({ queryKey: [path], queryFn: () => get<T>(path!), enabled: !!path });
  const first = useRef(true);
  const { refetch } = q;
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } if (path) refetch(); }, [refetch, path]));
  return q;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(i); }, [intervalMs]);
  return now;
}

export const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;
export const hms = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}` : mmss(sec));
export function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'Just now'; if (m < 60) return `${m} min ago`; if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  const d = Math.floor(m / 1440); return d < 7 ? `${d} d ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export const kg = (n: number | null | undefined) => (n === null || n === undefined ? '-' : `${Math.round(n * 10) / 10} kg`);
