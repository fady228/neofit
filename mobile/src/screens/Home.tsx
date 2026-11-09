import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { get, post } from '../api';
import { useAuth } from '../auth';
import { useGet, kg, timeAgo } from '../hooks';
import { Icon } from '../icons';
import { C, F } from '../theme';
import { useWorkout } from '../workout';
import { Avatar, Btn, Card, Empty, ErrorView, H, Loading, Row, Screen, SectionHeader, Stat, T, Tag } from '../ui';

export function PostCard({ p }: { p: any }) {
  const [liked, setLiked] = useState<boolean>(p.liked); const [likes, setLikes] = useState<number>(p.likeCount); const [saved, setSaved] = useState<boolean>(p.bookmarked);
  const like = async () => { setLiked(!liked); setLikes(likes + (liked ? -1 : 1)); try { const r = await post(`/posts/${p.id}/like`); setLiked(r.liked); setLikes(r.likeCount); } catch { setLiked(liked); setLikes(likes); } };
  const save = async () => { setSaved(!saved); try { setSaved((await post(`/posts/${p.id}/bookmark`)).bookmarked); } catch { setSaved(saved); } };
  const quote = p.kind === 'QUOTE';
  return (
    <Card style={{ padding: 14, gap: 8 }}>
      <Row><Avatar name={p.author.username} size={36} /><View style={{ flex: 1 }}><Row style={{ gap: 6 }}><T v="strong" style={{ fontSize: 14 }}>{p.author.username}</T>{p.author.isCoach ? <Tag>Coach</Tag> : null}</Row><T v="small">{timeAgo(p.createdAt)}</T></View></Row>
      <T style={quote ? { fontFamily: F.bold, color: C.text, fontSize: 16, lineHeight: 24 } : { color: '#E8E8EC' }}>{p.body}</T>
      <Row style={{ justifyContent: 'space-between', marginTop: -4 }}>
        <Row style={{ gap: 0 }}>
          <Pressable onPress={like} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} style={{ minHeight: 44, minWidth: 56, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="heart" size={18} color={liked ? C.redText : C.body} fill={liked} /><T v="small" color={C.body}>{likes}</T></Pressable>
          <View style={{ minHeight: 44, minWidth: 56, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="comment" size={18} color={C.body} /><T v="small" color={C.body}>{p.commentCount}</T></View>
        </Row>
        <Pressable onPress={save} accessibilityRole="button" accessibilityLabel={saved ? 'Remove bookmark' : 'Bookmark'} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="bookmark" size={18} color={saved ? C.gold : C.body} fill={saved} /></Pressable>
      </Row>
    </Card>
  );
}

export function Home() {
  const nav = useNavigation<any>(); const { me } = useAuth(); const w = useWorkout(); const qc = useQueryClient();
  const today = useGet<any>('/home/today'); const week = useGet<any>('/stats/week'); const feed = useGet<any>('/feed');
  const [starting, setStarting] = useState(false); const [err, setErr] = useState('');
  const name = me?.athlete?.username ?? 'coach';
  const start = async () => {
    setStarting(true); setErr('');
    try { const plan = await get(`/program-sessions/${today.data.next.id}/plan`); w.start(plan, { enrollmentId: today.data.enrollment.id }); nav.navigate('ActiveSession'); } catch (e: any) { setErr(e.message); } finally { setStarting(false); }
  };
  const n = today.data?.next, wk = week.data;
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><T v="label">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</T><H size={40}>Ready, {name}</H></View>
        {wk ? <View style={{ alignItems: 'center' }}><H size={30} color={C.gold}>{wk.streakDays}</H><T v="label" style={{ fontSize: 9 }}>Day streak</T></View> : null}
      </Row>

      {w.draft ? (
        <Card hot style={{ padding: 14, gap: 10 }}><T v="label">Workout in progress</T><H size={24}>{w.draft.title}</H><Btn title="Resume workout" onPress={() => nav.navigate('ActiveSession')} /></Card>
      ) : today.isLoading ? <Loading /> : today.error ? <ErrorView error={today.error} onRetry={today.refetch} /> : n ? (
        <Card hot style={{ padding: 14, borderRadius: 20 }}>
          <Row><Tag>Today</Tag><Tag kind="dark">Week {n.week} · {today.data.enrollment.title}</Tag></Row>
          <H size={32} style={{ marginTop: 10 }}>{n.name}</H>
          <T v="small" style={{ marginVertical: 8, fontSize: 13 }}>{n.exerciseCount} exercises · ~{n.estMinutes} min · {n.setCount} sets</T>
          <Btn title="Start workout" onPress={start} loading={starting} style={{ height: 46 }} />
          {err ? <T color={C.redText} style={{ marginTop: 8 }}>{err}</T> : null}
        </Card>
      ) : (
        <Empty title="No workout planned" body={today.data?.enrollment ? 'You finished every session in this program.' : 'Pick a program, build your own, or just start logging.'} action="Start an empty workout" onAction={() => { w.startEmpty(); nav.navigate('ActiveSession'); }} />
      )}

      {wk ? (
        <Card style={{ flexDirection: 'row' }}>
          <Stat label="Sessions" value={`${wk.sessionsDone}${wk.sessionsPlanned ? ` of ${wk.sessionsPlanned}` : ''}`} style={{ borderWidth: 0, backgroundColor: 'transparent' }} />
          <Stat label="Volume" value={`${(wk.volumeKg / 1000).toFixed(1)}k kg`} style={{ borderWidth: 0, backgroundColor: 'transparent' }} />
          <Stat label="Latest PR" value={wk.latestPr ? `+${Math.round((wk.latestPr.value - (wk.latestPr.previousValue ?? wk.latestPr.value)) * 10) / 10} kg` : '-'} color={C.gold} style={{ borderWidth: 0, backgroundColor: 'transparent' }} />
        </Card>
      ) : null}
      <Row style={{ justifyContent: 'space-between' }}><Btn title="Logbook" kind="secondary" small style={{ flex: 1 }} onPress={() => nav.navigate('Logbook')} /><Btn title="Empty workout" kind="secondary" small style={{ flex: 1 }} onPress={() => { if (!w.draft) w.startEmpty(); nav.navigate('ActiveSession'); }} /></Row>
      {w.pending > 0 ? <Card style={{ padding: 12 }}><Row><T style={{ flex: 1 }}>{w.pending} workout{w.pending > 1 ? 's' : ''} waiting to sync</T><Btn title="Sync now" small kind="secondary" style={{ width: 110 }} onPress={async () => { await w.sync(); qc.invalidateQueries(); }} /></Row></Card> : null}

      <SectionHeader title="Following" />
      {feed.isLoading ? <Loading /> : feed.error ? <ErrorView error={feed.error} onRetry={feed.refetch} /> : (feed.data?.items ?? []).length ? feed.data.items.map((p: any) => <PostCard key={p.id} p={p} />) : <Empty title="Your feed is quiet" body="Follow athletes and coaches in Explore to see their posts here." action="Find people" onAction={() => nav.navigate('Explore')} />}
    </Screen>
  );
}
