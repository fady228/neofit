import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Android emulators reach the host machine at 10.0.2.2. Set EXPO_PUBLIC_API_URL for a device or staging.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');
const KEY = 'neofit.token';
let token: string | null = null;
let onUnauthorized: () => void = () => {};

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };
export async function loadToken() { token = await SecureStore.getItemAsync(KEY); return token; }
export async function saveToken(t: string | null) { token = t; if (t) await SecureStore.setItemAsync(KEY, t); else await SecureStore.deleteItemAsync(KEY); }

export async function api<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('No connection. Your workouts are saved on this phone and will sync when you are back online', 0);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const m = Array.isArray(json?.message) ? json.message[0] : json?.message;
    throw new ApiError(m ?? 'Something went wrong', res.status);
  }
  return json as T;
}
export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
