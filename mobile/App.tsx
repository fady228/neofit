import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { BarlowCondensed_800ExtraBold_Italic, BarlowCondensed_900Black_Italic } from '@expo-google-fonts/barlow-condensed';
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { AuthProvider } from './src/auth';
import { WorkoutProvider } from './src/workout';
import { RootNavigator } from './src/nav';
import { C } from './src/theme';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });

export default function App() {
  const [loaded] = useFonts({ BarlowCondensed_800ExtraBold_Italic, BarlowCondensed_900Black_Italic, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <WorkoutProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </WorkoutProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
