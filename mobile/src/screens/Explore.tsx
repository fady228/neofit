import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { api, post } from '../api';
import { useGet } from '../hooks';
import { Icon } from '../icons';
import { C } from '../theme';
import { Avatar, Btn, Card, Empty, ErrorView, Field, H, Header, Loading, Row, Screen, SectionHeader, T, Tabs, Tag } from '../ui';
import { PostCard } from './Home';

function ProgramCard({ p }: { p: any }) {
  const nav = useNavigation<any>();
  return (
    <Card onPress={() => nav.navigate('ProgramDetail', { id: p.id })} style={{ padding: 16, gap: 8 }}>
      <Row>{p.goal ? <Tag>{p.goal}</Tag> : null}<Tag kind="dark">{p.durationWeeks} weeks</Tag></Row>
      <H size={26}>{p.title}</H>
      <Row style={{ justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line }}><Row><Avatar name={p.coach.name} size={28} /><T style={{ fontSize: 13 }}>{p.coach.name}</T></Row><T v="strong" color={C.gold} style={{ fontSize: 14 }}>{p.ratingAvg ? `${p.ratingAvg} (${p.ratingCount})` : 'New'}</T></Row>
    </Card>
  );
}

function PersonRow({ u }: { u: any }) {
  const [on, setOn] = useState<boolean>(u.isFollowing); const [busy, setBusy] = useState(false);
  const toggle = async () => { setBusy(true); const next = !on; setOn(next); try { await api(next ? 'POST' : 'DELETE', `/users/${u.userId}/follow`, next ? {} : undefined); } catch { setOn(!next); } finally { setBusy(false); } };
  return (
    <Card style={{ padding: 12 }}>
      <Row><Avatar name={u.username} size={48} /><View style={{ flex: 1 }}><T v="strong">{u.username}</T><T v="small">{u.role === 'COACH' ? 'Coach' : u.headline}</T></View><Btn title={on ? 'Following' : 'Follow'} small kind={on ? 'danger' : 'secondary'} style={{ width: 110 }} loading={busy} onPress={toggle} /></Row>
    </Card>
  );
}

export function Explore() {
  const nav = useNavigation<any>(); const [tab, setTab] = useState('Top'); const [q, setQ] = useState('');
  const top = useGet<any>(tab === 'Top' ? '/explore/top' : null); const people = useGet<any[]>(tab === 'People' || tab === 'Top' ? `/people?q=${encodeURIComponent(q)}` : null);
  const progs = useGet<any[]>(tab === 'Programs' ? '/programs/explore' : null); const posts = useGet<any[]>(tab === 'Posts' ? '/explore/posts' : null);
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <H size={40}>Explore</H>
        {tab === 'People' ? <Field label="Search athletes" value={q} onChangeText={setQ} autoCapitalize="none" placeholder="Search by username" /> : null}
        <Tabs items={['Top', 'People', 'Programs', 'Posts']} value={tab} onChange={setTab} />
        {tab === 'Top' ? (
          top.isLoading ? <Loading /> : top.error ? <ErrorView error={top.error} onRetry={top.refetch} /> : (
            <>
              <SectionHeader title="Popular programs" action="See all" onAction={() => setTab('Programs')} />
              {top.data.programs.length ? top.data.programs.slice(0, 3).map((p: any) => <ProgramCard key={p.id} p={p} />) : <Empty title="No programs yet" body="Coaches publish programs here." />}
              <SectionHeader title="Suggested athletes" action="See all" onAction={() => setTab('People')} />
              {(people.data ?? []).slice(0, 3).map((u) => <PersonRow key={u.userId} u={u} />)}
              <SectionHeader title="Trending posts" />
              {top.data.trendingPosts.map((p: any) => <PostCard key={p.id} p={p} />)}
            </>
          )
        ) : tab === 'People' ? (people.isLoading ? <Loading /> : !people.data?.length ? <Empty title="Nobody found" body="Try another name." /> : <><SectionHeader title="People to follow" />{people.data.map((u) => <PersonRow key={u.userId} u={u} />)}</>)
        : tab === 'Programs' ? (progs.isLoading ? <Loading /> : !progs.data?.length ? <Empty title="No programs yet" body="Coaches publish programs here." /> : <><SectionHeader title="Featured programs" />{progs.data.map((p) => <ProgramCard key={p.id} p={p} />)}</>)
        : posts.isLoading ? <Loading /> : !posts.data?.length ? <Empty title="No posts yet" body="Be the first to post." /> : posts.data.map((p) => <PostCard key={p.id} p={p} />)}
      </Screen>
      {tab === 'Posts' ? <Pressable accessibilityRole="button" accessibilityLabel="New post" onPress={() => nav.navigate('Compose')} style={{ position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: C.red, shadowOpacity: 0.6, shadowRadius: 14 }}><Icon name="plus" /></Pressable> : null}
    </View>
  );
}

export function Compose() {
  const nav = useNavigation<any>(); const qc = useQueryClient(); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const send = async () => { setBusy(true); setErr(''); try { await post('/posts', { body: body.trim() }); qc.invalidateQueries(); nav.goBack(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Screen footer={<Btn title="Post" onPress={send} loading={busy} disabled={!body.trim()} />}>
      <Header title="New post" onBack={() => nav.goBack()} icon="close" />
      <Field label="What are you training?" value={body} onChangeText={setBody} multiline maxLength={2000} placeholder="Share a session, a lesson or a win" />
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}
