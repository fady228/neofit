import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth';
import { Btn, Field, H, Header, Row, Screen, T, Chip } from '../ui';
import { C } from '../theme';

export function Login() {
  const nav = useNavigation<any>(); const { signIn } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => { setBusy(true); setErr(''); try { await signIn(email.trim(), password); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Screen footer={<Row style={{ justifyContent: 'center' }}><T>New here?</T><Btn title="Sign up" kind="secondary" small style={{ width: 120 }} onPress={() => nav.navigate('SignUp')} /></Row>}>
      <View style={{ height: 70 }} />
      <H size={76}>NeoFit</H>
      <T style={{ fontSize: 16, marginBottom: 18 }}>Know your power.{'\n'}Find your edge.</T>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="name@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="Password" />
      {err ? <T color={C.redText}>{err}</T> : null}
      <Btn title="Log in" onPress={go} loading={busy} disabled={!email || !password} />
    </Screen>
  );
}

export function SignUp() {
  const nav = useNavigation<any>(); const { signUp } = useAuth();
  const [role, setRole] = useState<'ATHLETE' | 'COACH'>('ATHLETE');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const mismatch = confirm.length > 0 && confirm !== password;
  const go = async () => { setBusy(true); setErr(''); try { await signUp({ email: email.trim(), password, role }); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Screen footer={<><Btn title="Create account" onPress={go} loading={busy} disabled={!email || password.length < 8 || password !== confirm} /><Row style={{ justifyContent: 'center' }}><T>Already have an account?</T><Chip label="Log in" onPress={() => nav.goBack()} /></Row></>}>
      <Header title="Join NeoFit" onBack={() => nav.goBack()} />
      <T>Track your lifts, rank against your cohort and train with a plan.</T>
      <T v="label">I am joining as</T>
      <Row><Chip label="Athlete" on={role === 'ATHLETE'} onPress={() => setRole('ATHLETE')} /><Chip label="Coach" on={role === 'COACH'} onPress={() => setRole('COACH')} /></Row>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" error={password.length > 0 && password.length < 8 ? 'Use at least 8 characters' : undefined} />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Repeat password" error={mismatch ? 'Passwords do not match' : undefined} />
      {err ? <T color={C.redText}>{err}</T> : null}
    </Screen>
  );
}
