import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGet } from '../hooks';
import { C } from '../theme';
import { Avatar, Btn, Card, Chip, Empty, ErrorView, H, Loading, Row, Screen, T, Wrap } from '../ui';

function Entry({ e }: { e: any }) {
  const podium = e.rank <= 3;
  return (
    <Card style={[{ padding: 12 }, e.isMe ? { borderColor: C.red, backgroundColor: '#2a0f11' } : podium ? { borderColor: C.gold + '80' } : null]}>
      <Row><H size={28} color={e.isMe ? C.redText : podium ? C.gold : C.muted} style={{ width: 36, textAlign: 'center' }}>{e.rank}</H><Avatar name={e.username ?? '?'} size={40} ring={podium ? C.gold : C.red} /><View style={{ flex: 1 }}><T v="strong" style={{ fontSize: 14 }}>@{e.username}</T><T v="small">{e.delta30d == null ? 'No change data yet' : `${e.delta30d > 0 ? '+' : ''}${e.delta30d} pts this month`}</T></View><H size={32}>{Math.round(e.percentile)}</H></Row>
    </Card>
  );
}

export function Rank() {
  const nav = useNavigation<any>(); const [metric, setMetric] = useState('GOAL:PUNCH_POWER');
  const sc = useGet<any>('/scoring/profile'); const lb = useGet<any>(`/leaderboard?metric=${encodeURIComponent(metric)}`);
  const d = lb.data; const showMe = d?.me && !d.top.some((t: any) => t.isMe);
  return (
    <Screen>
      <H size={40}>Leaderboard</H>
      <Wrap><Chip label="Punch power" on={metric === 'GOAL:PUNCH_POWER'} onPress={() => setMetric('GOAL:PUNCH_POWER')} />{(sc.data?.pillars ?? []).filter((p: any) => p.scoreKind === 'PERCENTILE').map((p: any) => <Chip key={p.key} label={p.name} on={metric === `PILLAR:${p.key}`} onPress={() => setMetric(`PILLAR:${p.key}`)} />)}</Wrap>
      {lb.isLoading ? <Loading /> : lb.error ? <ErrorView error={lb.error} onRetry={lb.refetch} /> : !d.total ? (
        <Empty title="No one is ranked here yet" body="Rankings compare you with athletes of your level, sex, weight class and age. Add test results to get ranked." action="Add test results" onAction={() => nav.navigate('Tests')} />
      ) : (
        <>
          <Row style={{ justifyContent: 'space-between' }}><T v="label">{d.cohortKey.split('|').map((x: string) => x.toLowerCase()).join(' · ')}</T><T v="label">{d.total} athlete{d.total > 1 ? 's' : ''}</T></Row>
          {d.top.map((e: any) => <Entry key={e.athleteId} e={e} />)}
          {showMe ? <><T style={{ textAlign: 'center' }} color={C.muted}>· · ·</T><Entry e={d.me} /></> : null}
          {!d.me ? <Btn title="Add results to join the ranking" kind="secondary" small onPress={() => nav.navigate('Tests')} /> : null}
        </>
      )}
    </Screen>
  );
}
