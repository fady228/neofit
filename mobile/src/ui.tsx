import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, R } from './theme';

export function Screen({ children, scroll = true, pad = 20, footer, style }: { children: React.ReactNode; scroll?: boolean; pad?: number; footer?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const body = scroll
    ? <ScrollView contentContainerStyle={{ padding: pad, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={[{ flex: 1, padding: pad, gap: 14 }, style]}>{children}</View>;
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {body}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** Heavy italic condensed display text. */
export function H({ children, size = 28, color = C.text, style }: { children: React.ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text accessibilityRole="header" style={[{ fontFamily: F.display, fontSize: size, lineHeight: size * 1.02, color, textTransform: 'uppercase', letterSpacing: 0.4 }, style]}>{children}</Text>;
}

export function T({ children, v = 'body', color, style, numberOfLines }: { children: React.ReactNode; v?: 'body' | 'strong' | 'label' | 'small'; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[t[v], color ? { color } : null, style]}>{children}</Text>;
}

export function Btn({ title, onPress, kind = 'primary', loading, disabled, style, small }: { title: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'danger'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off }} disabled={off} onPress={onPress}
      style={({ pressed }) => [s.btn, small && { height: 44 }, kind === 'secondary' && s.btnSecondary, kind === 'danger' && s.btnDanger, off && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }, style]}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnText, small && { fontSize: 16 }]}>{title}</Text>}
    </Pressable>
  );
}

export function Tag({ children, kind = 'red' }: { children: React.ReactNode; kind?: 'red' | 'dark' | 'gold' }) {
  const bg = kind === 'red' ? C.red : kind === 'gold' ? C.gold : C.raised;
  return <View style={[s.tag, { backgroundColor: bg }]}><Text style={[s.tagText, kind === 'gold' && { color: C.bg }]}>{children}</Text></View>;
}

export function Card({ children, style, hot, gold, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; hot?: boolean; gold?: boolean; onPress?: () => void }) {
  const st = [s.card, hot && { borderColor: C.red + '80' }, gold && { borderColor: C.gold + '66' }, style];
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={st}>{children}</Pressable> : <View style={st}>{children}</View>;
}

export function Field({ label, error, ...p }: TextInputProps & { label: string; error?: string }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      <TextInput {...p} placeholderTextColor={C.muted} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} accessibilityLabel={label}
        style={[s.input, focus && { borderColor: C.red }, error ? { borderColor: C.redText } : null, p.multiline && { height: 100, paddingTop: 12, textAlignVertical: 'top' }]} />
      {error ? <T v="small" color={C.redText}>{error}</T> : null}
    </View>
  );
}

export function Tabs({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {items.map((i) => (
        <Pressable key={i} onPress={() => onChange(i)} accessibilityRole="tab" accessibilityState={{ selected: i === value }} style={[s.tab, i === value && { borderBottomColor: C.red }]}>
          <Text style={[s.tabText, i === value && { color: C.text }]}>{i}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} style={[s.chip, on && { backgroundColor: C.red, borderColor: C.red }]}>
      <Text style={[s.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Bar({ value }: { value: number }) {
  return <View style={s.barBg}><View style={[s.barFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} /></View>;
}

export function Avatar({ name, size = 40, ring = C.red }: { name: string; size?: number; ring?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ring, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.display, color: C.text, fontSize: size / 2.6 }}>{(name || '?').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

export function Stat({ label, value, color, style }: { label: string; value: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return <Card style={[{ padding: 12, flex: 1 }, style]}><T v="label">{label}</T><H size={26} color={color} style={{ marginTop: 4 }}>{value}</H></Card>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
      <H size={22}>{title}</H>
      {action ? <Pressable onPress={onAction} hitSlop={12} accessibilityRole="link"><Text style={s.link}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function Loading() { return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={C.red} /></View>; }
export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <Card hot style={{ padding: 16, gap: 10 }}><T color={C.redText}>{(error as Error)?.message ?? 'Something went wrong'}</T>{onRetry ? <Btn title="Try again" kind="secondary" small onPress={onRetry} /> : null}</Card>;
}
export function Empty({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <Card style={{ padding: 20, gap: 8, alignItems: 'flex-start' }}><H size={22}>{title}</H><T>{body}</T>{action ? <Btn title={action} onPress={onAction} small style={{ alignSelf: 'stretch' }} /> : null}</Card>;
}

const t = StyleSheet.create({
  body: { fontFamily: F.regular, fontSize: 14, lineHeight: 21, color: C.body },
  strong: { fontFamily: F.bold, fontSize: 15, color: C.text },
  label: { fontFamily: F.bold, fontSize: 11, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' },
  small: { fontFamily: F.medium, fontSize: 12, color: C.muted },
});
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg, gap: 10 },
  btn: { height: 52, borderRadius: R.control, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, shadowColor: C.red, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  btnSecondary: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, shadowOpacity: 0, elevation: 0 },
  btnDanger: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.red, shadowOpacity: 0, elevation: 0 },
  btnText: { fontFamily: F.button, fontSize: 19, color: '#fff', letterSpacing: 1.4, textTransform: 'uppercase' },
  tag: { height: 24, paddingHorizontal: 10, borderRadius: R.tag, justifyContent: 'center', alignSelf: 'flex-start' },
  tagText: { fontFamily: F.extra, fontSize: 10, color: '#fff', letterSpacing: 0.8, textTransform: 'uppercase' },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.card },
  input: { height: 50, borderRadius: R.control, backgroundColor: C.input, borderWidth: 1, borderColor: C.line, color: C.text, paddingHorizontal: 14, fontFamily: F.medium, fontSize: 15 },
  tabs: { flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderBottomColor: C.line },
  tab: { paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: 'transparent', marginBottom: -1, minHeight: 44, justifyContent: 'center' },
  tabText: { fontFamily: F.extra, fontSize: 12, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: R.control, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, justifyContent: 'center' },
  chipText: { fontFamily: F.bold, fontSize: 13, color: C.body },
  barBg: { height: 8, borderRadius: 99, backgroundColor: C.line, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 99, backgroundColor: C.red },
  link: { fontFamily: F.extra, fontSize: 12, letterSpacing: 1, color: C.redText, textTransform: 'uppercase' },
});

import { Icon } from './icons';
export function Header({ title, sub, onBack, right, icon = 'back' }: { title: string; sub?: string; onBack?: () => void; right?: React.ReactNode; icon?: 'back' | 'close' | 'down' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack ? <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: R.control, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} /></Pressable> : null}
      <View style={{ flex: 1 }}>{sub ? <T v="label" style={{ fontSize: 10 }}>{sub}</T> : null}<H size={onBack ? 26 : 40}>{title}</H></View>
      {right}
    </View>
  );
}
export function Steps({ step, of = 3 }: { step: number; of?: number }) {
  return <View style={{ flexDirection: 'row', gap: 6 }}>{Array.from({ length: of }, (_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 99, backgroundColor: i < step ? C.red : C.line }} />)}</View>;
}
export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) { return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>; }
export function Wrap({ children }: { children: React.ReactNode }) { return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>; }
