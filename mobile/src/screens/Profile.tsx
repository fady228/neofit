import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { api, post } from '../api';
import { useAuth } from '../auth';
import { LineChart, Radar } from '../charts';
import { useGet } from '../hooks';
import { C } from '../theme';
import { Avatar, Btn, Card, Chip, Empty, ErrorView, Field, H, Header, Loading, Row, Screen, SectionHeader, Stat, T, Tag, Wrap } from '../ui';

export const ZONE_LABEL: Record<string, string> = { BELOW: 'Below', BUILDING: 'Building', IN_ZONE: 'In zone', ABOVE: 'Maintain' };
const cap = (s?: string) => (s ? s[0] + s.slice(1).toLowerCase().replace('_', ' ') : '');

export function Profile() {
  const nav = useNavigation<any>(); const { me, signOut } = useAuth();
  const sc = useGet<any>(me?.role === 'ATHLETE' ? '/scoring/profile' : null);
  const a = me?.athlete; const p = sc.data;
  const goal = p?.goals?.[0]; const provisional = p?.pillars?.some((x: any) => x.provisional);
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar name={a?.username ?? me?.email ?? '?'} size={84} />
        <H size={36}>{a?.username ?? 'Coach'}</H>
        <Row>{a ? <><Tag>{cap(a.level)}</Tag>{a.weightClass ? <Tag kind="dark">{a.weightClass}</Tag> : null}</> : <Tag>Coach</Tag>}</Row>
        {a?.bio ? <T style={{ textAlign: 'center' }}>{a.bio}</T> : null}
      </View>
      {me?.role === 'ATHLETE' ? (
        <>
          <SectionHeader title="Athletic profile" action="Update" onAction={() => nav.navigate('Tests')} />
          {sc.isLoading ? <Loading /> : sc.error ? <ErrorView error={sc.error} onRetry={sc.refetch} /> : (
            <>
              {p.missing?.length ? <Card hot style={{ padding: 12 }}><T>Add your {p.missing.join(' and ')} in settings to get scored.</T></Card> : null}
              <Card style={{ padding: 12, alignItems: 'center' }}><Radar items={p.pillars.filter((x: any) => x.onRadar).map((x: any) => ({ key: x.key, name: x.name, percentile: x.score }))} /></Card>
              <T v="small" style={{ textAlign: 'center' }}>Strength axes show progress to your target zone. The other axes compare you with athletes like you.</T>
              {p.pillars.some((x: any) => x.zone) ? (
                <>
                  <SectionHeader title="Strength zones" action="Edit" onAction={() => nav.navigate('Tests')} />
                  {p.pillars.filter((x: any) => x.zone).map((x: any) => (
                    <Card key={x.key} style={{ padding: 12, gap: 6 }}>
                      <Row><View style={{ flex: 1 }}><T v="strong" style={{ fontSize: 14 }}>{x.name}</T><T v="small">{x.scoredValue ? `${x.scoredValue.toFixed(2)}x bodyweight` : '-'} · zone {x.zone.low} to {x.zone.high}x{x.zone.isCustom ? ' (yours)' : ''}</T></View><Tag kind={x.zone.status === 'IN_ZONE' ? 'gold' : x.zone.status === 'ABOVE' ? 'dark' : 'red'}>{ZONE_LABEL[x.zone.status]}</Tag></Row>
                      {x.zone.status === 'ABOVE' ? <T v="small">You are past the zone. Keep this strength and put your time into power and speed.</T> : null}
                    </Card>
                  ))}
                </>
              ) : null}
              {provisional ? <Card style={{ padding: 12 }}><Row><Tag kind="dark">Provisional</Tag><T v="small" style={{ flex: 1 }}>Compared against estimated norms. Scores sharpen as real data comes in.</T></Row></Card> : null}
              {goal ? <Card gold onPress={() => nav.navigate('GoalDetail', { key: goal.key })} style={{ padding: 16 }}><T v="label">Goal / {goal.name}</T><Row style={{ alignItems: 'baseline' }}><H size={44}>{goal.score ?? '-'}</H><T color={C.redText} v="strong" style={{ marginLeft: 'auto', fontSize: 12 }}>DETAILS</T></Row></Card> : null}
              {p.balance?.some((b: any) => b.status !== 'NO_DATA') ? (
                <>
                  <SectionHeader title="Strength balance" />
                  {p.balance.filter((b: any) => b.status !== 'NO_DATA').map((b: any) => (
                    <Card key={b.key} style={{ padding: 12 }}><Row><View style={{ flex: 1 }}><T v="strong" style={{ fontSize: 14 }}>{b.target} vs {b.reference}</T><T v="small">{Math.round(b.ratio * 100)}% · guide {Math.round(b.targetRatio * 100)}%</T></View><Tag kind={b.status === 'BALANCED' ? 'dark' : 'red'}>{b.status === 'BALANCED' ? 'Balanced' : b.status === 'LOW' ? 'Low' : 'High'}</Tag></Row></Card>
                  ))}
                  <T v="small">Ratios come from coaching practice, not population data.</T>
                </>
              ) : null}
            </>
          )}
          <Row><Btn title="Body stats" kind="secondary" small style={{ flex: 1 }} onPress={() => nav.navigate('BodyStats')} /><Btn title="Tests" kind="secondary" small style={{ flex: 1 }} onPress={() => nav.navigate('Tests')} /></Row>
        </>
      ) : <Btn title="Build a program" onPress={() => nav.navigate('Builder')} />}
      <Btn title="Log out" kind="secondary" small onPress={signOut} />
    </Screen>
  );
}

export function GoalDetail() {
  const nav = useNavigation<any>(); const { params } = useRoute<any>(); const sc = useGet<any>('/scoring/profile');
  const g = sc.data?.goals.find((x: any) => x.key === params.key);
  const scored = g?.components.filter((c: any) => c.score !== null) ?? [];
  const weakest = scored.length > 1 ? scored.reduce((a: any, b: any) => (b.score < a.score ? b : a)) : null;
  return (
    <Screen footer={<Btn title="Update related tests" onPress={() => nav.navigate('Tests')} />}>
      <Header title={g?.name ?? 'Goal'} sub="Goal detail" onBack={() => nav.goBack()} />
      {sc.isLoading ? <Loading /> : !g ? <Empty title="Goal not found" body="Go back and try again." /> : (
        <>
          <View style={{ alignItems: 'center' }}><H size={84}>{g.score ?? '-'}</H><T v="label">Score</T></View>
          <T v="label">Component breakdown</T>
          {g.components.map((c: any) => (
            <Card key={c.key} hot={weakest?.key === c.key} style={{ padding: 14, gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}><T v="strong" style={{ fontSize: 14 }}>{c.name} · {Math.round(c.weight * 100)}% weight</T><T v="label" color={weakest?.key === c.key ? C.redText : C.text}>{c.score === null ? 'Not tested' : `${Math.round(c.score)} of 100${weakest?.key === c.key ? ' · weakest' : ''}`}</T></Row>
              <T>{c.explanation}</T>
            </Card>
          ))}
          {g.components.some((c: any) => c.score === null) ? <T v="small">The goal score uses the components you have tested and re-weights the rest.</T> : null}
        </>
      )}
    </Screen>
  );
}

function ZoneEditor({ z, onChanged }: { z: any; onChanged: () => Promise<unknown> }) {
  const [edit, setEdit] = useState(false); const [low, setLow] = useState(String(z.effective.low)); const [high, setHigh] = useState(String(z.effective.high));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const lo = parseFloat(low.replace(',', '.')), hi = parseFloat(high.replace(',', '.')); const valid = lo > 0 && hi > lo;
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await fn(); await onChanged(); setEdit(false); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
      <Row style={{ justifyContent: 'space-between' }}><T v="label">Target zone</T><Tag kind={z.custom ? 'dark' : 'red'}>{z.custom ? 'Your zone' : 'Suggested by NeoFit'}</Tag></Row>
      <T v="strong" style={{ fontSize: 15 }}>{z.effective.low} to {z.effective.high} x bodyweight{z.current ? `  ·  ${ZONE_LABEL[z.current.status]}` : ''}</T>
      <T v="small">{z.basis}. Past the zone you keep the strength and train power and speed instead.</T>
      {edit ? (
        <>
          <Row><View style={{ flex: 1 }}><Field label="Zone from" value={low} onChangeText={setLow} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><Field label="Zone to" value={high} onChangeText={setHigh} keyboardType="decimal-pad" /></View></Row>
          <T v="small">Suggested: {z.suggested.low} to {z.suggested.high}. {z.suggested.rationale}</T>
          {err ? <T color={C.redText}>{err}</T> : null}
          <Row><Btn title="Save zone" small style={{ flex: 1 }} loading={busy} disabled={!valid} onPress={() => run(() => api('PUT', `/scoring/zones/${z.testId}`, { low: lo, high: hi }))} />{z.custom ? <Btn title="Reset" kind="secondary" small style={{ width: 100 }} loading={busy} onPress={() => run(() => api('DELETE', `/scoring/zones/${z.testId}`))} /> : <Btn title="Cancel" kind="secondary" small style={{ width: 100 }} onPress={() => setEdit(false)} />}</Row>
        </>
      ) : <Btn title="Edit zone" kind="secondary" small onPress={() => setEdit(true)} />}
    </View>
  );
}

export function Tests() {
  const nav = useNavigation<any>(); const qc = useQueryClient();
  const pl = useGet<any[]>('/scoring/pillars'); const sc = useGet<any>('/scoring/profile'); const zs = useGet<any[]>('/scoring/zones');
  const refreshAll = () => Promise.all([pl.refetch(), sc.refetch(), zs.refetch()]);
  const [vals, setVals] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const run = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setErr(''); try { await fn(); await refreshAll(); qc.invalidateQueries(); setVals((v) => ({ ...v, [key]: '' })); } catch (e: any) { setErr(e.message); } finally { setBusy(''); } };
  return (
    <Screen>
      <Header title="Tests" sub="Pick one test per pillar" onBack={() => nav.goBack()} />
      <T>Lifts update on their own when you log them in a workout. Enter a result here for everything else.</T>
      {pl.isLoading || sc.isLoading ? <Loading /> : pl.error ? <ErrorView error={pl.error} onRetry={pl.refetch} /> : pl.data!.map((p) => {
        const s = sc.data?.pillars.find((x: any) => x.key === p.key); const t = p.options.find((o: any) => o.testId === p.chosenTestId);
        return (
          <Card key={p.key} style={{ padding: 14, gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}><H size={22}>{p.name}</H>{p.isOptional ? <Tag kind="dark">Optional</Tag> : null}</Row>
            <Wrap>{p.options.map((o: any) => <Chip key={o.testId} label={o.name} on={o.testId === p.chosenTestId} onPress={() => o.testId !== p.chosenTestId && run(p.key, () => api('PUT', '/scoring/choice', { pillarId: p.id, testId: o.testId }))} />)}</Wrap>
            {t?.protocol ? <T v="small">{t.protocol}</T> : null}
            <Row style={{ justifyContent: 'space-between' }}><T v="strong" style={{ fontSize: 14 }}>{s?.score != null ? (s.scoreKind === 'ZONE' ? `${s.rawValue} ${t?.unit} · ${Math.round(s.score)}% of target zone` : `${s.rawValue} ${t?.unit} · ${Math.round(s.score)}th percentile`) : 'No result yet'}</T>{s?.provisional ? <Tag kind="dark">Provisional</Tag> : null}</Row>
            {s?.scoreKind === 'ZONE' && s.percentile != null ? <T v="small">For context only: {Math.round(s.percentile)}th percentile among lifters ({s.normSource?.name ?? 'estimated norms'}). More is not the goal.</T> : s?.normSource ? <T v="small">Compared against: {s.normSource.name}</T> : null}
            {zs.data?.find((z) => z.testId === p.chosenTestId) ? <ZoneEditor key={`${p.chosenTestId}-${JSON.stringify(zs.data.find((z) => z.testId === p.chosenTestId)?.effective)}`} z={zs.data.find((z) => z.testId === p.chosenTestId)} onChanged={async () => { await refreshAll(); qc.invalidateQueries(); }} /> : null}
            <Row><View style={{ flex: 1 }}><Field label={`New result (${t?.unit ?? ''})`} value={vals[p.key] ?? ''} onChangeText={(v) => setVals({ ...vals, [p.key]: v })} keyboardType="decimal-pad" /></View><Btn title="Save" small style={{ width: 90, marginTop: 20 }} loading={busy === p.key} disabled={!(parseFloat(vals[p.key] ?? '') > 0)} onPress={() => run(p.key, () => post('/scoring/results', { testId: p.chosenTestId, value: parseFloat((vals[p.key] ?? '').replace(',', '.')) }))} /></Row>
          </Card>
        );
      })}
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}

export function BodyStats() {
  const nav = useNavigation<any>(); const qc = useQueryClient(); const q = useGet<any>('/body/summary');
  const [kgv, setKg] = useState(''); const [site, setSite] = useState('WAIST'); const [cm, setCm] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const d = q.data;
  const go = async (fn: () => Promise<unknown>, reset: () => void) => { setBusy(true); setErr(''); try { await fn(); reset(); await q.refetch(); qc.invalidateQueries(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Screen>
      <Header title="Body stats" onBack={() => nav.goBack()} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={q.refetch} /> : (
        <>
          <Card style={{ padding: 16, gap: 8 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}><View><T v="label">Current{d.weightClass ? ` · ${d.weightClass}` : ''}</T><H size={52}>{d.weightKg ?? '-'} <T>kg</T></H></View>{d.toLimitKg != null ? <Tag kind={d.toLimitKg > 0 ? 'gold' : 'dark'}>{d.toLimitKg > 0 ? `${d.toLimitKg} kg to class` : 'Within class'}</Tag> : null}</Row>
            {d.series.length > 1 ? <LineChart points={d.series.map((s: any) => s.kg)} height={100} /> : <T v="small">Log your weight on a few days to see the trend.</T>}
          </Card>
          <Row><Stat label="Change, 6 wks" value={d.changeKg != null ? `${d.changeKg > 0 ? '+' : ''}${d.changeKg} kg` : '-'} /><Stat label="Body fat" value={d.bodyFatPct != null ? `${d.bodyFatPct}%` : '-'} /></Row>
          <Row><View style={{ flex: 1 }}><Field label="Log weight (kg)" value={kgv} onChangeText={setKg} keyboardType="decimal-pad" /></View><Btn title="Log" small style={{ width: 90, marginTop: 20 }} loading={busy} disabled={!(parseFloat(kgv) > 30)} onPress={() => go(() => post('/body/weight', { kg: parseFloat(kgv.replace(',', '.')) }), () => setKg(''))} /></Row>
          <SectionHeader title="Measurements" />
          {Object.entries(d.measures).map(([k, m]: any) => <Card key={k} style={{ padding: 12 }}><Row style={{ justifyContent: 'space-between' }}><T v="strong" style={{ fontSize: 14 }}>{cap(k)}</T><T v="strong" style={{ fontSize: 14 }}>{m.cm} cm{m.change != null ? `  (${m.change > 0 ? '+' : ''}${m.change})` : ''}</T></Row></Card>)}
          <Wrap>{['CHEST', 'WAIST', 'HIPS', 'THIGH', 'UPPER_ARM', 'NECK'].map((s) => <Chip key={s} label={cap(s)} on={site === s} onPress={() => setSite(s)} />)}</Wrap>
          <Row><View style={{ flex: 1 }}><Field label={`${cap(site)} (cm)`} value={cm} onChangeText={setCm} keyboardType="decimal-pad" /></View><Btn title="Add" small style={{ width: 90, marginTop: 20 }} loading={busy} disabled={!(parseFloat(cm) > 10)} onPress={() => go(() => post('/body/measurements', { site, cm: parseFloat(cm.replace(',', '.')) }), () => setCm(''))} /></Row>
        </>
      )}
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}
