import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '../api';
import { LineChart } from '../charts';
import { hms, kg, useGet } from '../hooks';
import { Icon } from '../icons';
import { hasPicker, pick, setPicker } from '../picker';
import { C, F, R } from '../theme';
import { Card, Chip, Empty, ErrorView, H, Header, Loading, Row, Screen, Stat, T, Tabs, Tag, Wrap, Btn } from '../ui';

const KINDS = ['All', 'Strength', 'Power', 'Core', 'Conditioning', 'Mobility'];

export function ExerciseRows({ onOpen }: { onOpen: (e: any) => void }) {
  const [q, setQ] = useState(''); const [kind, setKind] = useState('All'); const qc = useQueryClient();
  const list = useGet<any[]>(`/exercises?q=${encodeURIComponent(q)}${kind !== 'All' ? `&kind=${kind.toUpperCase()}` : ''}`);
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const create = async () => { setBusy(true); setErr(''); try { const e = await post('/exercises', { name: name.trim(), kind: kind === 'All' ? 'STRENGTH' : kind.toUpperCase() }); setName(''); qc.invalidateQueries(); onOpen({ id: e.id, name: e.name, bestKg: null }); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <>
      <Row style={{ height: 46, borderRadius: R.control, backgroundColor: C.input, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14 }}><Icon name="search" size={18} color={C.muted} /><TextInput accessibilityLabel="Search exercises" value={q} onChangeText={setQ} placeholder="Search exercises" placeholderTextColor={C.muted} style={{ flex: 1, color: C.text, fontFamily: F.medium, fontSize: 15 }} /></Row>
      <Wrap>{KINDS.map((k) => <Chip key={k} label={k} on={kind === k} onPress={() => setKind(k)} />)}</Wrap>
      {list.isLoading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.refetch} /> : (list.data ?? []).map((e) => (
        <Card key={e.id} onPress={() => onOpen(e)} style={{ padding: 12 }}>
          <Row><View style={{ flex: 1 }}><T v="strong" style={{ fontSize: 14 }}>{e.name}</T><T v="small">{e.kind[0] + e.kind.slice(1).toLowerCase()} · {(e.primaryMuscles ?? []).slice(0, 2).join(', ') || 'Full body'}</T></View>{e.bestKg ? <Tag kind="gold">{e.bestKg} kg</Tag> : <T v="small">{e.logged ? 'Logged' : 'Not logged'}</T>}</Row>
        </Card>
      ))}
      {list.data && !list.data.length && q ? (
        <Card style={{ padding: 14, gap: 10 }}><T>No match for "{q}". Create it as a custom exercise.</T><Btn title={`Create "${q}"`} small loading={busy} onPress={() => { setName(q); setTimeout(create, 0); }} /></Card>
      ) : null}
      {err ? <T color={C.redText}>{err}</T> : null}
    </>
  );
}

export function ExerciseLibrary() {
  const nav = useNavigation<any>(); const { params } = useRoute<any>(); const picking = !!params?.pick && hasPicker();
  const open = (e: any) => { if (picking) { pick({ id: e.id, name: e.name, bestKg: e.bestKg }); setPicker(null); nav.goBack(); } else nav.navigate('ExerciseHistory', { id: e.id, name: e.name }); };
  return <Screen><Header title="Exercises" sub={picking ? 'Choose one to add' : 'Library'} onBack={() => { setPicker(null); nav.goBack(); }} /><ExerciseRows onOpen={open} /></Screen>;
}

export function ExerciseHistory() {
  const nav = useNavigation<any>(); const { params } = useRoute<any>(); const [range, setRange] = useState('3M');
  const h = useGet<any>(`/exercises/${params.id}/history?range=${range}`);
  const d = h.data;
  return (
    <Screen>
      <Header title={params.name} sub="Exercise history" onBack={() => nav.goBack()} />
      {h.isLoading ? <Loading /> : h.error ? <ErrorView error={h.error} onRetry={h.refetch} /> : d.best.sessions === 0 ? <Empty title="No history yet" body="Log this exercise in a workout and your progress shows up here." /> : (
        <>
          <Row><Stat label="Heaviest" value={kg(d.best.heaviestKg)} color={C.gold} /><Stat label="Est. 1RM" value={kg(d.best.bestE1rmKg)} /><Stat label="Sessions" value={String(d.best.sessions)} /></Row>
          <Card style={{ padding: 14, gap: 10 }}>
            <Row>{['1M', '3M', '6M', 'ALL'].map((r) => <Chip key={r} label={r === 'ALL' ? 'All' : r} on={range === r} onPress={() => setRange(r)} />)}</Row>
            {d.series.length > 1 ? <LineChart points={d.series.map((s: any) => s.e1rmKg)} /> : <T>Log this exercise in two sessions to see a trend.</T>}
          </Card>
          <T v="label">Recent sessions</T>
          {d.sessions.map((s: any) => (
            <Card key={s.sessionId} style={{ padding: 12 }}>
              <Row style={{ justifyContent: 'space-between' }}><T v="strong" style={{ fontSize: 14, flex: 1 }}>{new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {s.title}</T>{s.isPr ? <Tag kind="gold">PR</Tag> : null}</Row>
              <T v="small" style={{ marginTop: 6, fontSize: 13 }}>{s.sets.map((x: any) => `${x.weightKg ?? '-'} x ${x.reps ?? '-'}`).join('  ·  ')}</T>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

export function Logbook() {
  const nav = useNavigation<any>(); const [tab, setTab] = useState('Sessions');
  const list = useGet<any>('/workouts'); const week = useGet<any>('/stats/week');
  const dayFmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <Screen>
      <Header title="Logbook" onBack={() => nav.goBack()} />
      {week.data ? <Row><Stat label="This week" value={`${week.data.sessionsDone}${week.data.sessionsPlanned ? ` of ${week.data.sessionsPlanned}` : ''}`} /><Stat label="Volume" value={`${(week.data.volumeKg / 1000).toFixed(1)}k kg`} /></Row> : null}
      <Tabs items={['Sessions', 'Exercises']} value={tab} onChange={setTab} />
      {tab === 'Exercises' ? <ExerciseRows onOpen={(e) => nav.navigate('ExerciseHistory', { id: e.id, name: e.name })} /> : list.isLoading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.refetch} /> : !list.data?.items.length ? <Empty title="No workouts yet" body="Finish a workout and it lands here with volume and PRs." /> : list.data.items.map((s: any) => (
        <Card key={s.id} style={{ padding: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><T v="label" style={{ fontSize: 10 }}>{dayFmt(s.startedAt)}</T><H size={22}>{s.title}</H></View>{s.prCount ? <Tag kind="gold">{s.prCount} PR{s.prCount > 1 ? 's' : ''}</Tag> : null}</Row>
          <Row style={{ gap: 18, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}><T v="strong" style={{ fontSize: 13 }}>{s.durationSec ? hms(s.durationSec) : '-'}</T><T v="strong" style={{ fontSize: 13 }}>{(s.totalVolumeKg ?? 0).toLocaleString()} kg</T><T v="strong" style={{ fontSize: 13 }}>{s.setCount} sets</T></Row>
        </Card>
      ))}
    </Screen>
  );
}
