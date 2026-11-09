import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { post, api } from '../api';
import { useAuth } from '../auth';
import { useGet } from '../hooks';
import { setPicker } from '../picker';
import { C, F, R } from '../theme';
import { Bar, Btn, Card, Chip, Empty, ErrorView, Field, H, Header, Loading, Row, Screen, SectionHeader, Steps, T, Tabs, Tag, Wrap } from '../ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MyPrograms() {
  const nav = useNavigation<any>(); const qc = useQueryClient(); const { me } = useAuth();
  const [tab, setTab] = useState('Active');
  const active = useGet<any[]>('/enrollments/active'); const mine = useGet<any[]>('/programs/mine');
  const [finishing, setFinishing] = useState<string | null>(null); const [rating, setRating] = useState(5); const [err, setErr] = useState('');
  const complete = async (id: string) => { try { await post(`/enrollments/${id}/complete`, { rating }); setFinishing(null); qc.invalidateQueries(); } catch (e: any) { setErr(e.message); } };
  return (
    <Screen footer={<Btn title="Build my own program" onPress={() => nav.navigate('Builder')} />}>
      <H size={40}>My programs</H>
      <Tabs items={['Active', 'Built by me']} value={tab} onChange={setTab} />
      {tab === 'Active' ? (active.isLoading ? <Loading /> : active.error ? <ErrorView error={active.error} onRetry={active.refetch} /> : !active.data?.length ? <Empty title="Nothing running" body="Browse coach programs in Explore, or build your own." action="Browse programs" onAction={() => nav.navigate('Explore')} /> : active.data.map((e) => (
        <Card key={e.id} hot style={{ padding: 16, gap: 8 }} onPress={() => nav.navigate('ProgramDetail', { id: e.programId })}>
          <H size={26}>{e.title}</H>
          <Row style={{ justifyContent: 'space-between' }}><T v="label">Week {e.currentWeek} of {e.durationWeeks}</T><T v="label" color={C.text}>{e.workoutsDone} / {e.workoutsTotal} workouts</T></Row>
          <Bar value={e.progress} />
          {e.next ? <T v="strong" style={{ fontSize: 13 }}>Next: {e.next.name}</T> : <T color={C.gold}>All sessions done</T>}
          {finishing === e.id ? (
            <View style={{ gap: 8 }}><T v="label">Rate this program</T><Row>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={`${n}`} on={rating === n} onPress={() => setRating(n)} />)}</Row><Btn title="Finish program" small onPress={() => complete(e.id)} /></View>
          ) : <Btn title="Mark complete" kind="secondary" small onPress={() => setFinishing(e.id)} />}
        </Card>
      ))) : mine.isLoading ? <Loading /> : mine.error ? <ErrorView error={mine.error} onRetry={mine.refetch} /> : !mine.data?.length ? <Empty title="No programs yet" body="Build a plan around your own schedule and weak spots." /> : mine.data.map((p) => (
        <Card key={p.id} style={{ padding: 16, gap: 8 }} onPress={() => nav.navigate('ProgramDetail', { id: p.id })}>
          <Row><Tag kind="dark">{p.status === 'DRAFT' ? 'Draft' : p.visibility === 'PUBLIC' ? 'Published' : 'Private'}</Tag></Row>
          <H size={26}>{p.title}</H><T v="small">{p.durationWeeks} weeks · {p.daysPerWeek} days a week{me?.role === 'COACH' ? ` · ${p.enrolledCount} enrolled` : ''}</T>
        </Card>
      ))}
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}

export function ProgramDetail() {
  const nav = useNavigation<any>(); const { params } = useRoute<any>(); const { me } = useAuth(); const qc = useQueryClient();
  const q = useGet<any>(`/programs/${params.id}`); const running = useGet<any[]>('/enrollments/active');
  const [sheet, setSheet] = useState(!!params.enroll); const [days, setDays] = useState<number[]>([1, 3, 5]); const [time, setTime] = useState('08:00');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const p = q.data; const isRunning = !!running.data?.find((e) => e.programId === params.id); const owner = p?.ownerId === me?.id;
  const enroll = async () => {
    setBusy(true); setErr('');
    try { if (p.status === 'DRAFT') await post(`/programs/${p.id}/publish`); await post(`/programs/${p.id}/enroll`, { trainingDays: days, reminderTime: time, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); qc.invalidateQueries(); nav.navigate('Tabs', { screen: 'Home' }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Screen footer={p && !isRunning ? <Btn title={sheet ? 'Confirm enrollment' : p.status === 'DRAFT' ? 'Save and start' : 'Enroll in program'} loading={busy} disabled={sheet && !days.length} onPress={sheet ? enroll : () => setSheet(true)} /> : undefined}>
      <Header title="Program" onBack={() => nav.goBack()} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={q.refetch} /> : (
        <>
          <Card hot style={{ padding: 16, gap: 10 }}><Row><Tag>{p.level[0] + p.level.slice(1).toLowerCase()}</Tag><Tag kind="dark">{p.durationWeeks} weeks</Tag><Tag kind="dark">{p.daysPerWeek} days a week</Tag></Row><H size={34}>{p.title}</H>{p.description ? <T>{p.description}</T> : null}{isRunning ? <Tag kind="gold">Running now</Tag> : null}</Card>
          {sheet ? (
            <Card style={{ padding: 16, gap: 10 }}><H size={22}>Training days</H><Wrap>{DAYS.map((d, i) => <Chip key={d} label={d} on={days.includes(i + 1)} onPress={() => setDays(days.includes(i + 1) ? days.filter((x) => x !== i + 1) : [...days, i + 1].sort())} />)}</Wrap><Field label="Reminder time" value={time} onChangeText={setTime} placeholder="08:00" /></Card>
          ) : null}
          <SectionHeader title="Curriculum" />
          {p.blocks.map((b: any, i: number) => (
            <Card key={b.id} style={{ padding: 14, gap: 8 }}>
              <Row><View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}><H size={16} color={C.redText}>{String(i + 1).padStart(2, '0')}</H></View><View style={{ flex: 1 }}><T v="strong" style={{ fontSize: 14 }}>{b.name}</T><T v="label" style={{ fontSize: 10 }}>Weeks {b.startWeek} to {b.endWeek}</T></View></Row>
              {b.sessions.map((s: any) => <View key={s.id} style={{ paddingLeft: 48 }}><T v="strong" style={{ fontSize: 13 }}>{s.name}</T><T v="small">{s.exercises.map((e: any) => e.exercise.name).join(', ')}</T></View>)}
            </Card>
          ))}
          {err ? <T color={C.redText}>{err}</T> : null}
        </>
      )}
    </Screen>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const b = (txt: string, d: number) => <Pressable accessibilityRole="button" accessibilityLabel={`${d > 0 ? 'Increase' : 'Decrease'} ${label}`} onPress={() => onChange(Math.max(min, Math.min(max, value + d)))} style={{ width: 44, height: 44, borderRadius: R.control, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}><H size={22}>{txt}</H></Pressable>;
  return <View style={{ flex: 1, gap: 6 }}><T v="label">{label}</T><Row style={{ justifyContent: 'space-between' }}>{b('-', -1)}<H size={30}>{value}</H>{b('+', 1)}</Row></View>;
}
const NumBox = ({ label, v, set }: { label: string; v: number | undefined; set: (n: number | undefined) => void }) => {
  const [txt, setTxt] = useState(v === undefined ? '' : String(v));
  return <View style={{ flex: 1 }}><T v="label" style={{ fontSize: 9 }}>{label}</T><Field label={label} value={txt} keyboardType="number-pad" onChangeText={(x) => { setTxt(x); const n = parseInt(x, 10); set(Number.isFinite(n) ? n : undefined); }} /></View>;
};

interface BEx { exerciseId: string; name: string; targetSets?: number; targetReps?: number; restSec?: number }
interface BSes { name: string; exercises: BEx[] }
interface BBlock { name: string; startWeek: number; endWeek: number; sessions: BSes[] }

export function Builder() {
  const nav = useNavigation<any>(); const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState(''); const [goal, setGoal] = useState(''); const [weeks, setWeeks] = useState(6); const [days, setDays] = useState(3); const [level, setLevel] = useState('AMATEUR');
  const [blocks, setBlocks] = useState<BBlock[]>([]); const [bi, setBi] = useState(0);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const toBlocks = () => { if (!blocks.length) setBlocks([{ name: 'Base', startWeek: 1, endWeek: weeks, sessions: [{ name: 'Day 1', exercises: [] }] }]); else setBlocks(blocks.map((b) => ({ ...b, endWeek: Math.min(b.endWeek, weeks), startWeek: Math.min(b.startWeek, weeks) }))); setStep(2); };
  const upBlock = (i: number, patch: Partial<BBlock>) => setBlocks(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const upSession = (si: number, patch: Partial<BSes>) => upBlock(bi, { sessions: blocks[bi].sessions.map((s, j) => (j === si ? { ...s, ...patch } : s)) });
  const overlap = [...blocks].sort((a, b) => a.startWeek - b.startWeek).some((b, i, a) => i > 0 && b.startWeek <= a[i - 1].endWeek) || blocks.some((b) => b.endWeek < b.startWeek);
  const ready = blocks.length > 0 && blocks.every((b) => b.sessions.length > 0 && b.sessions.every((s) => s.exercises.length > 0));

  const addEx = (si: number) => { setPicker((e) => setBlocks((cur) => cur.map((b, j) => (j !== bi ? b : { ...b, sessions: b.sessions.map((s, k) => (k !== si ? s : { ...s, exercises: [...s.exercises, { exerciseId: e.id, name: e.name, targetSets: 3, targetReps: 5, restSec: 90 }] })) })))); nav.navigate('ExerciseLibrary', { pick: true }); };

  const save = async (start: boolean) => {
    setBusy(true); setErr('');
    try {
      const body = { title, level, goalKey: goal || undefined, durationWeeks: weeks, daysPerWeek: days, blocks: blocks.map((b) => ({ name: b.name, startWeek: b.startWeek, endWeek: b.endWeek, sessions: b.sessions.map((s) => ({ name: s.name, exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, targetReps: e.targetReps, restSec: e.restSec })) })) })) };
      const p = await post('/programs', body); qc.invalidateQueries();
      if (start) { await post(`/programs/${p.id}/publish`); nav.replace('ProgramDetail', { id: p.id, enroll: true }); } else nav.goBack();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const footer = step === 1 ? <Btn title="Next: Blocks" disabled={title.trim().length < 2} onPress={toBlocks} />
    : step === 2 ? <Btn title="Next: Sessions" disabled={overlap || !blocks.length} onPress={() => { setBi(0); setStep(3); }} />
    : <><Btn title="Save and start" loading={busy} disabled={!ready} onPress={() => save(true)} /><Btn title="Save as draft" kind="secondary" small loading={busy} onPress={() => save(false)} /></>;
  const cur = blocks[bi];

  return (
    <Screen footer={footer}>
      <Header title="Build program" sub={`Step ${step} of 3`} onBack={() => (step === 1 ? nav.goBack() : setStep(step - 1))} />
      <Steps step={step} />
      {step === 1 ? (
        <>
          <H size={32}>Essentials</H>
          <Field label="Program name" value={title} onChangeText={setTitle} placeholder="e.g. Camp conditioning" />
          <T v="label">Main goal</T><Row><Chip label="None" on={!goal} onPress={() => setGoal('')} /><Chip label="Punch power" on={goal === 'PUNCH_POWER'} onPress={() => setGoal('PUNCH_POWER')} /></Row>
          <T v="label">Level</T><Row>{['NOVICE', 'AMATEUR', 'PRO'].map((l) => <Chip key={l} label={l[0] + l.slice(1).toLowerCase()} on={level === l} onPress={() => setLevel(l)} />)}</Row>
          <Row style={{ gap: 20 }}><Stepper label="Weeks" value={weeks} min={1} max={52} onChange={setWeeks} /><Stepper label="Days a week" value={days} min={1} max={7} onChange={setDays} /></Row>
        </>
      ) : step === 2 ? (
        <>
          <H size={32}>Program blocks</H><T>Split your {weeks} weeks into phases. Each block holds its own sessions.</T>
          {blocks.map((b, i) => (
            <Card key={i} style={{ padding: 14, gap: 10 }}>
              <Field label={`Block ${i + 1} name`} value={b.name} onChangeText={(v) => upBlock(i, { name: v })} />
              <Row style={{ gap: 20 }}><Stepper label="From week" value={b.startWeek} min={1} max={weeks} onChange={(n) => upBlock(i, { startWeek: n })} /><Stepper label="To week" value={b.endWeek} min={1} max={weeks} onChange={(n) => upBlock(i, { endWeek: n })} /></Row>
              {blocks.length > 1 ? <Btn title="Remove block" kind="secondary" small onPress={() => setBlocks(blocks.filter((_, j) => j !== i))} /> : null}
            </Card>
          ))}
          {overlap ? <T color={C.redText}>Blocks cannot overlap, and each must end on or after its start week.</T> : null}
          <Btn title="+ Add block" kind="secondary" disabled={(blocks[blocks.length - 1]?.endWeek ?? 0) >= weeks} onPress={() => { const s = (blocks[blocks.length - 1]?.endWeek ?? 0) + 1; setBlocks([...blocks, { name: `Block ${blocks.length + 1}`, startWeek: s, endWeek: weeks, sessions: [{ name: 'Day 1', exercises: [] }] }]); }} />
        </>
      ) : (
        <>
          <H size={32}>Sessions</H>
          <Wrap>{blocks.map((b, i) => <Chip key={i} label={b.name} on={bi === i} onPress={() => setBi(i)} />)}</Wrap>
          {cur?.sessions.map((s, si) => (
            <Card key={si} style={{ padding: 14, gap: 10 }}>
              <Field label={`Session ${si + 1}`} value={s.name} onChangeText={(v) => upSession(si, { name: v })} />
              {s.exercises.map((e, ei) => (
                <View key={ei} style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Row style={{ justifyContent: 'space-between' }}><T v="strong" style={{ fontSize: 14, flex: 1 }}>{e.name}</T><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${e.name}`} onPress={() => upSession(si, { exercises: s.exercises.filter((_, k) => k !== ei) })} style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}><T color={C.redText} v="small">Remove</T></Pressable></Row>
                  <Row><NumBox label="Sets" v={e.targetSets} set={(n) => upSession(si, { exercises: s.exercises.map((x, k) => (k === ei ? { ...x, targetSets: n } : x)) })} /><NumBox label="Reps" v={e.targetReps} set={(n) => upSession(si, { exercises: s.exercises.map((x, k) => (k === ei ? { ...x, targetReps: n } : x)) })} /><NumBox label="Rest s" v={e.restSec} set={(n) => upSession(si, { exercises: s.exercises.map((x, k) => (k === ei ? { ...x, restSec: n } : x)) })} /></Row>
                </View>
              ))}
              <Btn title="+ Add exercise" kind="secondary" small onPress={() => addEx(si)} />
            </Card>
          ))}
          <Btn title="+ Add session" kind="secondary" disabled={(cur?.sessions.length ?? 0) >= 7} onPress={() => upBlock(bi, { sessions: [...cur.sessions, { name: `Day ${cur.sessions.length + 1}`, exercises: [] }] })} />
          {!ready ? <T v="small">Every session needs at least one exercise to start. You can still save a draft.</T> : null}
        </>
      )}
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}
