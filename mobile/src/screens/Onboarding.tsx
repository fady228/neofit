import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { api, get, post } from '../api';
import { useAuth } from '../auth';
import { Btn, Chip, Field, H, Header, Loading, Row, Screen, Steps, T, Wrap } from '../ui';
import { C } from '../theme';

const SPORTS: [string, string][] = [['BOXING', 'Boxing'], ['KICKBOXING', 'Kickboxing'], ['MUAY_THAI', 'Muay Thai'], ['KARATE', 'Karate'], ['TAEKWONDO', 'Taekwondo'], ['OTHER_STRIKING', 'Other striking']];
const CLASSES = ['Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight', 'Light welterweight', 'Welterweight', 'Light middleweight', 'Middleweight', 'Light heavyweight', 'Heavyweight'];

export function CreateProfile() {
  const nav = useNavigation<any>(); const { me } = useAuth();
  const [username, setUsername] = useState(me?.athlete?.username ?? ''); const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const valid = /^[a-z0-9_]{3,20}$/.test(username);
  const next = async () => { setBusy(true); setErr(''); try { await api('PATCH', '/athletes/me', { username, bio: bio || undefined, onboardingStep: 1 }); nav.navigate('AthleteDetails'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Screen footer={<Btn title="Next" onPress={next} loading={busy} disabled={!valid} />}>
      <Header title="Create profile" sub="Step 1 of 3" />
      <Steps step={1} />
      <Field label="Username" value={username} onChangeText={(v) => setUsername(v.toLowerCase())} autoCapitalize="none" error={username && !valid ? 'Use 3 to 20 letters, numbers or underscores' : undefined} />
      <Field label={`Bio (${bio.length} / 150)`} value={bio} onChangeText={setBio} multiline maxLength={150} placeholder="Tell the community about yourself" />
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}

export function AthleteDetails() {
  const nav = useNavigation<any>();
  const [sport, setSport] = useState('BOXING'); const [level, setLevel] = useState('AMATEUR'); const [sex, setSex] = useState<'MALE' | 'FEMALE'>('MALE');
  const [birth, setBirth] = useState(''); const [wc, setWc] = useState(''); const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(birth) && !isNaN(Date.parse(birth)) && new Date(birth) < new Date();
  const next = async () => { setBusy(true); setErr(''); try { await api('PATCH', '/athletes/me', { sport, level, sex, birthDate: birth, weightClass: wc || undefined, researchConsent: consent, onboardingStep: 2 }); nav.navigate('BaselineTests'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Screen footer={<Btn title="Next" onPress={next} loading={busy} disabled={!dateOk} />}>
      <Header title="Athlete details" sub="Step 2 of 3" onBack={() => nav.goBack()} />
      <Steps step={2} />
      <H size={30}>Define your cohort</H>
      <T>We compare you with similar athletes on the leaderboards.</T>
      <T v="label">Primary sport</T><Wrap>{SPORTS.map(([k, n]) => <Chip key={k} label={n} on={sport === k} onPress={() => setSport(k)} />)}</Wrap>
      <T v="label">Competitive level</T><Row>{['NOVICE', 'AMATEUR', 'PRO'].map((l) => <Chip key={l} label={l[0] + l.slice(1).toLowerCase()} on={level === l} onPress={() => setLevel(l)} />)}</Row>
      <T v="label">Sex (used to pick the right norms)</T><Row><Chip label="Male" on={sex === 'MALE'} onPress={() => setSex('MALE')} /><Chip label="Female" on={sex === 'FEMALE'} onPress={() => setSex('FEMALE')} /></Row>
      <Field label="Date of birth" value={birth} onChangeText={setBirth} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" error={birth.length >= 10 && !dateOk ? 'Enter a valid past date, like 2001-04-23' : undefined} />
      <T v="label">Weight class (optional)</T><Wrap>{CLASSES.map((c) => <Chip key={c} label={c} on={wc === c} onPress={() => setWc(wc === c ? '' : c)} />)}</Wrap>
      <Row><Chip label={consent ? 'Yes, use my anonymised results' : 'Use my anonymised results to improve norms?'} on={consent} onPress={() => setConsent(!consent)} /></Row>
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}

export function BaselineTests() {
  const nav = useNavigation<any>(); const { refresh } = useAuth();
  const q = useQuery({ queryKey: ['pillars-onboarding'], queryFn: () => get<any[]>('/scoring/pillars') });
  const [bw, setBw] = useState(''); const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const finish = async (skip: boolean) => {
    setBusy(true); setErr('');
    try {
      if (bw) await post('/body/weight', { kg: parseFloat(bw) });
      if (!skip) for (const p of q.data ?? []) { const t = p.options.find((o: any) => o.testId === p.chosenTestId); const v = parseFloat((vals[p.key] ?? '').replace(',', '.')); if (t && Number.isFinite(v)) await post('/scoring/results', { testId: t.testId, value: v, phase: 'ONBOARDING' }); }
      await api('PATCH', '/athletes/me', { onboardingStep: 3 }); await refresh();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Screen footer={<><Btn title="Calculate my scores" onPress={() => finish(false)} loading={busy} disabled={!(parseFloat(bw) > 30)} /><Btn title="Skip for now" kind="secondary" small onPress={() => finish(true)} disabled={busy} /></>}>
      <Header title="Baseline tests" sub="Step 3 of 3" onBack={() => nav.goBack()} />
      <Steps step={3} />
      <H size={30}>Build your radar</H>
      <T>Enter results you already know. Skip any you have not tested. Lifts: your best estimated one-rep max.</T>
      <Field label="Bodyweight (kg)" value={bw} onChangeText={setBw} keyboardType="decimal-pad" placeholder="e.g. 77" />
      {q.isLoading ? <Loading /> : (q.data ?? []).map((p) => { const t = p.options.find((o: any) => o.testId === p.chosenTestId); return t ? <Field key={p.key} label={`${t.name} (${t.unit})`} value={vals[p.key] ?? ''} onChangeText={(v) => setVals({ ...vals, [p.key]: v })} keyboardType="decimal-pad" placeholder="Optional" /> : null; })}
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}
