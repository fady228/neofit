import React from 'react';
import { Text, View } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from './auth';
import { Icon } from './icons';
import { C, F } from './theme';
import { Loading } from './ui';
import { Login, SignUp } from './screens/Auth';
import { CreateProfile, AthleteDetails, BaselineTests } from './screens/Onboarding';
import { Home } from './screens/Home';
import { ActiveSession, SessionComplete } from './screens/Workout';
import { Logbook, ExerciseHistory, ExerciseLibrary } from './screens/Logbook';
import { MyPrograms, ProgramDetail, Builder } from './screens/Programs';
import { Profile, GoalDetail, Tests, BodyStats } from './screens/Profile';
import { Explore, Compose } from './screens/Explore';
import { Rank } from './screens/Rank';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, border: C.line, primary: C.red, text: C.text } };

const tabs: [string, React.ComponentType<any>, any][] = [['Home', Home, 'home'], ['Explore', Explore, 'explore'], ['Programs', MyPrograms, 'programs'], ['Rank', Rank, 'rank'], ['Profile', Profile, 'profile']];

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.line, height: 72, paddingTop: 6 }, tabBarActiveTintColor: C.redText, tabBarInactiveTintColor: C.muted }}>
      {tabs.map(([name, comp, icon]) => (
        <Tab.Screen key={name} name={name} component={comp}
          options={{ tabBarIcon: ({ color }) => <Icon name={icon} color={color} />, tabBarLabel: ({ color }) => <Text style={{ color, fontFamily: F.bold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>{name}</Text> }} />
      ))}
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { me, ready } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><Loading /></View>;
  const needsOnboarding = me?.role === 'ATHLETE' && (me.athlete?.onboardingStep ?? 0) < 3;
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        {!me ? (
          <>
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="SignUp" component={SignUp} />
          </>
        ) : needsOnboarding ? (
          <>
            <Stack.Screen name="CreateProfile" component={CreateProfile} />
            <Stack.Screen name="AthleteDetails" component={AthleteDetails} />
            <Stack.Screen name="BaselineTests" component={BaselineTests} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="ActiveSession" component={ActiveSession} options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
            <Stack.Screen name="SessionComplete" component={SessionComplete} options={{ gestureEnabled: false }} />
            <Stack.Screen name="Logbook" component={Logbook} />
            <Stack.Screen name="ExerciseHistory" component={ExerciseHistory} />
            <Stack.Screen name="ExerciseLibrary" component={ExerciseLibrary} />
            <Stack.Screen name="ProgramDetail" component={ProgramDetail} />
            <Stack.Screen name="Builder" component={Builder} />
            <Stack.Screen name="GoalDetail" component={GoalDetail} />
            <Stack.Screen name="Tests" component={Tests} />
            <Stack.Screen name="BodyStats" component={BodyStats} />
            <Stack.Screen name="Compose" component={Compose} options={{ presentation: 'modal' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
