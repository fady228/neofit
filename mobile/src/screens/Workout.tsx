import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '../api';
import { hms, mmss, useNow } from '../hooks';
import { Icon } from '../icons';
import { setPicker } from '../picker';
import { C, F, R } from '../theme';
import { useWorkout } from '../workout';
import { Bar, Btn, Card, H, Header, Row, Screen, Stat, T, Tag } from '../ui';

const cell = { height: 44, borderRadius: 12, backgroundColor: C.input, color: C.text, textAlign: 'center' as const, fontFamily: F.display, fontSize: 22 };

export function ActiveSession() {
  const nav = useNavigation<any>(); const w = useWorkout(); const now = useNow();
  const d = w.draft;
  useEffect(() => { if (!d) nav.goBack(); }, [d, nav]);
  if (!d) return null;
  const all = d.exercises.flatMap((e) => e.sets); const done = all.filter((s) => s.done).length;
  const next = (() => { for (let i = 0; i < d.exercises.length; i++) { const j = d.exercises[i].sets.findIndex((s) => !s.done); if (j >= 0) return [i, j] as const; } return null; })();
  const rest = w.restEndsAt && w.restEndsAt > now ? Math.ceil((w.restEndsAt - now) / 1000) : 0;

  const finish = () => {
    if (!done) return Alert.alert('No sets logged', 'Discard this workout?', [{ text: 'Keep going', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { w.discard(); nav.goBack(); } }]);
    w.finish().then((result) => nav.replace('SessionComplete', { result, title: d.title })).catch((e) => Alert.alert('Could not save', e.message));
  };
  const addExercise = () => { setPicker((e) => w.addExercise({ id: e.id, name: e.name, bestKg: e.bestKg })); nav.navigate('ExerciseLibrary', { pick: true }); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ padding: 20, paddingBottom: 10, gap: 12 }}>
        <Header title={d.title} sub={`${done} of ${all.length} sets`} onBack={() => nav.goBack()} icon="down" right={<H size={26} color={C.redText}>{hms(Math.floor((now - Date.parse(d.startedAt)) / 1000))}</H>} />
        <Bar value={all.length ? done / all.length : 0} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 12, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        {rest > 0 ? (
          <Card hot style={{ padding: 10, paddingHorizontal: 14 }}>
            <Row><View style={{ flex: 1 }}><T v="label" style={{ fontSize: 10 }}>Rest</T><H size={30}>{mmss(rest)}</H></View><Btn title="+15s" kind="secondary" small style={{ width: 70 }} onPress={() => w.addRest(15)} /><Btn title="Skip" small style={{ width: 80 }} onPress={w.skipRest} /></Row>
          </Card>
        ) : null}
        {d.exercises.map((ex, ei) => (
          <Card key={ex.exerciseId + ei} style={{ padding: 14, gap: 8 }} hot={next?.[0] === ei}>
            <Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><H size={24}>{ex.name}</H>{ex.target ? <T v="label" style={{ fontSize: 10, marginTop: 4 }}>Target {ex.target}</T> : null}</View>{ex.bestKg ? <Tag kind="gold">PR {ex.bestKg} kg</Tag> : null}</Row>
            <Row style={{ gap: 8 }}><T v="label" style={{ width: 30, textAlign: 'center' }}>Set</T><T v="label" style={{ flex: 1 }}>Previous</T><T v="label" style={{ width: 78, textAlign: 'center' }}>Kg</T><T v="label" style={{ width: 66, textAlign: 'center' }}>Reps</T><View style={{ width: 44 }} /></Row>
            {ex.sets.map((s, si) => {
              const prev = ex.previous.find((p) => p.setNumber === s.setNumber);
              const active = next?.[0] === ei && next?.[1] === si;
              return (
                <Row key={s.id} style={{ gap: 8 }}>
                  <H size={20} color={C.muted} style={{ width: 30, textAlign: 'center' }}>{s.setNumber}</H>
                  <T v="small" style={{ flex: 1, fontSize: 12 }}>{prev ? `${prev.weightKg ?? '-'} x ${prev.reps ?? '-'}` : '-'}</T>
                  <TextInput accessibilityLabel={`Set ${s.setNumber} kilograms`} value={s.weightKg} onChangeText={(v) => w.setValue(ei, si, 'weightKg', v)} keyboardType="decimal-pad" selectTextOnFocus style={[cell, { width: 78, borderWidth: 1, borderColor: active ? C.red : C.line }]} />
                  <TextInput accessibilityLabel={`Set ${s.setNumber} reps`} value={s.reps} onChangeText={(v) => w.setValue(ei, si, 'reps', v)} keyboardType="number-pad" selectTextOnFocus style={[cell, { width: 66, borderWidth: 1, borderColor: active ? C.red : C.line }]} />
                  <Pressable accessibilityRole="button" accessibilityLabel={s.done ? `Unlog set ${s.setNumber}` : `Log set ${s.setNumber}`} onPress={() => w.logSet(ei, si)} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: s.done ? C.red : C.raised, borderWidth: s.done ? 0 : 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" color={s.done ? '#fff' : C.muted} /></Pressable>
                </Row>
              );
            })}
            <Btn title="+ Add set" kind="secondary" small onPress={() => w.addSet(ei)} />
          </Card>
        ))}
        <Btn title="+ Add exercise" kind="secondary" onPress={addExercise} />
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', gap: 10 }}>
        <Btn title="Finish" kind="secondary" style={{ width: 120 }} onPress={finish} />
        {next ? <Btn title={`Log set ${d.exercises[next[0]].sets[next[1]].setNumber}`} style={{ flex: 1 }} onPress={() => w.logSet(next[0], next[1])} /> : <Btn title="Finish workout" style={{ flex: 1 }} onPress={finish} />}
      </View>
    </SafeAreaView>
  );
}

export function SessionComplete() {
  const nav = useNavigation<any>(); const { params } = useRoute<any>(); const w = useWorkout(); const qc = useQueryClient();
  const r = params.result; const [resp, setResp] = useState<any>(r.response); const [feel, setFeel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [shared, setShared] = useState(false); const [err, setErr] = useState('');
  const s0 = resp?.sessions?.find((x: any) => x.id === r.payload.id); const prs: any[] = s0?.prs ?? []; const synced = !!s0;
  const close = () => { qc.invalidateQueries(); nav.reset({ index: 0, routes: [{ name: 'Tabs' }] }); };
  const retry = async () => { setBusy(true); const x = await w.sync(); setResp(x); setBusy(false); if (!x) setErr('Still offline. Your workout is safe on this phone'); };
  const pickFeel = async (f: string) => { setFeel(f); const x = await w.resend({ ...r.payload, feel: f.toUpperCase() }); if (x) setResp(x); };
  const share = async () => { setBusy(true); try { await post('/posts', { kind: 'WORKOUT_SHARE', workoutSessionId: r.payload.id, body: `Finished ${params.title}: ${r.setCount} sets, ${r.volumeKg.toLocaleString()} kg total.` }); setShared(true); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Screen footer={<>{synced ? <Btn title={shared ? 'Shared' : 'Share to feed'} onPress={share} loading={busy} disabled={shared} /> : <Btn title="Sync workout" onPress={retry} loading={busy} />}<Btn title="Save and close" kind="secondary" onPress={close} /></>}>
      <Card hot style={{ padding: 20, gap: 10 }}><T v="label" color={C.redText}>{params.title}</T><H size={48}>Session complete</H>{prs.length ? <Tag kind="gold">{prs.length} new personal record{prs.length > 1 ? 's' : ''}</Tag> : null}</Card>
      {!synced ? <Card style={{ padding: 12 }}><T>Saved on this phone. It will sync when you are online.</T></Card> : null}
      <Row><Stat label="Duration" value={hms(r.durationSec)} /><Stat label="Volume" value={`${(s0?.totalVolumeKg ?? r.volumeKg).toLocaleString()} kg`} /></Row>
      <Row><Stat label="Sets" value={String(r.setCount)} /><Stat label="PRs" value={String(prs.length)} color={prs.length ? C.gold : undefined} /></Row>
      {prs.length ? <><H size={20}>New records</H>{prs.map((p, i) => <Card key={i} gold style={{ padding: 12 }}><Row><View style={{ flex: 1 }}><T v="strong" style={{ fontSize: 14 }}>{p.exercise}</T><T v="small">{p.kind === 'BEST_E1RM' ? 'Estimated 1RM' : 'Heaviest set'} · {p.value} kg</T></View><H size={24} color={C.gold}>+{Math.round((p.value - p.previousValue) * 10) / 10} kg</H></Row></Card>)}</> : null}
      <T v="label">How did it feel?</T>
      <Row>{['Easy', 'Solid', 'Hard', 'Max'].map((f) => <Pressable key={f} onPress={() => pickFeel(f)} accessibilityRole="button" accessibilityState={{ selected: feel === f }} style={{ flex: 1, height: 44, borderRadius: R.control, alignItems: 'center', justifyContent: 'center', backgroundColor: feel === f ? C.red : C.raised, borderWidth: 1, borderColor: feel === f ? C.red : C.line }}><T v="strong" style={{ fontSize: 13 }}>{f}</T></Pressable>)}</Row>
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}
