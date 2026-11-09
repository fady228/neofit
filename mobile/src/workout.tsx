import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { ApiError, api } from './api';

export interface PrevSet { setNumber: number; weightKg: number | null; reps: number | null }
export interface DraftSet { id: string; setNumber: number; weightKg: string; reps: string; done: boolean; completedAt?: string }
export interface DraftExercise { exerciseId: string; sessionExerciseId?: string; name: string; restSec: number; target?: string; bestKg?: number | null; previous: PrevSet[]; sets: DraftSet[] }
export interface Draft { id: string; title: string; startedAt: string; enrollmentId?: string; programSessionId?: string; exercises: DraftExercise[] }
export interface FinishResult { payload: any; response: any | null; durationSec: number; volumeKg: number; setCount: number }

const DRAFT_KEY = 'neofit.draft', QUEUE_KEY = 'neofit.queue', DEAD_KEY = 'neofit.deadletter';
const uuid = () => (globalThis.crypto as any)?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
const numOrUndef = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : undefined; };
const newSet = (n: number, prev?: PrevSet): DraftSet => ({ id: uuid(), setNumber: n, weightKg: prev?.weightKg != null ? String(prev.weightKg) : '', reps: prev?.reps != null ? String(prev.reps) : '', done: false });

interface Ctx {
  draft: Draft | null; restEndsAt: number | null; pending: number;
  start(plan: any, link?: { enrollmentId?: string }): void; startEmpty(): void;
  addExercise(e: { id: string; name: string; restSec?: number; bestKg?: number | null }): void;
  setValue(ei: number, si: number, field: 'weightKg' | 'reps', v: string): void;
  logSet(ei: number, si: number): void; addSet(ei: number): void; skipRest(): void; addRest(sec: number): void;
  finish(): Promise<FinishResult>; discard(): void; sync(): Promise<any | null>; resend(payload: any): Promise<any | null>;
}
const WorkoutCtx = createContext<Ctx>(null as any);
export const useWorkout = () => useContext(WorkoutCtx);

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [restEndsAt, setRest] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const loaded = useRef(false);

  useEffect(() => { (async () => {
    const d = await AsyncStorage.getItem(DRAFT_KEY); if (d) setDraft(JSON.parse(d));
    const q = await AsyncStorage.getItem(QUEUE_KEY); setPending(q ? JSON.parse(q).length : 0);
    loaded.current = true;
  })(); }, []);
  useEffect(() => { if (!loaded.current) return; if (draft) AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); else AsyncStorage.removeItem(DRAFT_KEY); }, [draft]);

  const mutate = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));

  const sync = useCallback(async () => {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: any[] = raw ? JSON.parse(raw) : [];
    if (!queue.length) return null;
    try {
      const res = await api('POST', '/sync/push', { sessions: queue.slice(0, 20) });
      const rest = queue.slice(20);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(rest)); setPending(rest.length);
      return res;
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
        // The server rejected this batch. Park it so it cannot block every later sync.
        const dead = JSON.parse((await AsyncStorage.getItem(DEAD_KEY)) ?? '[]');
        await AsyncStorage.setItem(DEAD_KEY, JSON.stringify([...dead, ...queue.slice(0, 20)]));
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(20))); setPending(Math.max(0, queue.length - 20));
      }
      return null;
    }
  }, []);

  const enqueue = async (payload: any) => {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const q = (raw ? JSON.parse(raw) : []).filter((x: any) => x.id !== payload.id);
    q.push(payload); await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)); setPending(q.length);
  };

  const value: Ctx = {
    draft, restEndsAt, pending, sync,
    start: (plan, link) => {
      if (draft) return;
      setDraft({
        id: uuid(), title: plan.name, startedAt: new Date().toISOString(), enrollmentId: link?.enrollmentId, programSessionId: plan.id,
        exercises: plan.exercises.map((e: any): DraftExercise => ({
          exerciseId: e.exerciseId, sessionExerciseId: e.sessionExerciseId, name: e.name, restSec: e.restSec ?? 90, bestKg: e.bestKg, previous: e.previous ?? [],
          target: e.targetSets ? `${e.targetSets} x ${e.targetReps ?? '?'}${e.percent1RM ? ` @ ${e.percent1RM}%` : ''}` : undefined,
          sets: Array.from({ length: e.targetSets ?? 3 }, (_, i) => newSet(i + 1, (e.previous ?? [])[i])),
        })),
      });
    },
    startEmpty: () => { if (!draft) setDraft({ id: uuid(), title: 'Workout', startedAt: new Date().toISOString(), exercises: [] }); },
    addExercise: (e) => mutate((d) => ({ ...d, exercises: [...d.exercises, { exerciseId: e.id, name: e.name, restSec: e.restSec ?? 90, bestKg: e.bestKg, previous: [], sets: [newSet(1)] }] })),
    setValue: (ei, si, f, v) => mutate((d) => ({ ...d, exercises: d.exercises.map((x, i) => (i !== ei ? x : { ...x, sets: x.sets.map((s, j) => (j === si ? { ...s, [f]: v } : s)) })) })),
    logSet: (ei, si) => {
      const ex = draft?.exercises[ei]; if (!ex) return;
      const now = Date.now(), wasDone = ex.sets[si].done;
      mutate((d) => ({ ...d, exercises: d.exercises.map((x, i) => (i !== ei ? x : { ...x, sets: x.sets.map((s, j) => (j === si ? { ...s, done: !s.done, completedAt: s.done ? undefined : new Date(now).toISOString() } : s)) })) }));
      if (!wasDone) { setRest(now + ex.restSec * 1000); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); } else setRest(null);
    },
    addSet: (ei) => mutate((d) => ({ ...d, exercises: d.exercises.map((x, i) => (i !== ei ? x : { ...x, sets: [...x.sets, newSet(x.sets.length + 1, { setNumber: 0, weightKg: numOrUndef(x.sets[x.sets.length - 1]?.weightKg ?? '') ?? null, reps: numOrUndef(x.sets[x.sets.length - 1]?.reps ?? '') ?? null })] })) })),
    skipRest: () => setRest(null),
    addRest: (sec) => setRest((r) => (r ?? Date.now()) + sec * 1000),
    discard: () => { setDraft(null); setRest(null); },
    finish: async () => {
      if (!draft) throw new Error('No workout in progress');
      const sets = draft.exercises.flatMap((ex) => ex.sets.filter((s) => s.done).map((s) => ({ id: s.id, exerciseId: ex.exerciseId, sessionExerciseId: ex.sessionExerciseId, setNumber: s.setNumber, weightKg: numOrUndef(s.weightKg), reps: numOrUndef(s.reps) !== undefined ? Math.round(numOrUndef(s.reps)!) : undefined, completedAt: s.completedAt ?? new Date().toISOString() })));
      const endedAt = new Date().toISOString();
      const payload = { id: draft.id, title: draft.title, startedAt: draft.startedAt, endedAt, enrollmentId: draft.enrollmentId, programSessionId: draft.programSessionId, sets };
      await enqueue(payload);
      setDraft(null); setRest(null);
      const response = await sync();
      return { payload, response, durationSec: Math.round((Date.parse(endedAt) - Date.parse(draft.startedAt)) / 1000), setCount: sets.length, volumeKg: Math.round(sets.reduce((a, s) => a + (s.weightKg ?? 0) * (s.reps ?? 0), 0)) };
    },
    resend: async (payload) => { await enqueue(payload); return sync(); },
  };
  return <WorkoutCtx.Provider value={value}>{children}</WorkoutCtx.Provider>;
}
