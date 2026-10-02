import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { checkBackendHealth } from './src/backendHealth';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('Checking…');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setBackendStatus('Checking…');
    const timeout = setTimeout(() => {
      controller.abort();
      if (active) setBackendStatus('Unavailable');
    }, 75_000);

    void checkBackendHealth(process.env.EXPO_PUBLIC_API_URL, controller.signal).then((connected) => {
      clearTimeout(timeout);
      if (active) setBackendStatus(connected ? 'Connected' : 'Unavailable');
    });

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.page}>
            <View style={styles.brand}>
              <View style={styles.mark} accessibilityElementsHidden>
                <Text style={styles.markText}>FQ</Text>
              </View>
              <Text style={styles.wordmark}>FitQuest</Text>
            </View>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>YOUR NEXT CHAPTER</Text>
              <Text accessibilityRole="header" style={styles.title}>Welcome to FitQuest.</Text>
              <Text style={styles.subtitle}>Make room for progress.</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.accent} />
              <Text style={styles.cardTitle}>A fresh start.</Text>
              <Text style={styles.cardCopy}>Big goals. Small steps. Your own journey.</Text>
              <View style={styles.backend}>
                <Text accessibilityLiveRegion="polite" style={styles.backendStatus}>Backend: {backendStatus}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry backend connection"
                  disabled={backendStatus === 'Checking…'}
                  onPress={() => setAttempt((value) => value + 1)}
                  style={({ pressed }) => [styles.retry, (pressed || backendStatus === 'Checking…') && styles.retryDimmed]}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F7F2' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  page: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#176B5B', alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  wordmark: { color: '#193B34', fontSize: 22, fontWeight: '700' },
  hero: { marginTop: 56, marginBottom: 36, gap: 14 },
  eyebrow: { color: '#49675C', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#193B34', fontSize: 44, fontWeight: '700', letterSpacing: -1.5 },
  subtitle: { color: '#52655E', fontSize: 19, lineHeight: 28 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#DDE5DD', gap: 10 },
  accent: { width: 32, height: 4, borderRadius: 2, backgroundColor: '#176B5B', marginBottom: 8 },
  cardTitle: { color: '#193B34', fontSize: 22, fontWeight: '600' },
  cardCopy: { color: '#52655E', fontSize: 16, lineHeight: 25 },
  backend: { marginTop: 12, gap: 12 },
  backendStatus: { color: '#193B34', fontSize: 16, lineHeight: 25, fontWeight: '600' },
  retry: { alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 20, minHeight: 44, borderRadius: 12, backgroundColor: '#176B5B' },
  retryDimmed: { opacity: 0.5 },
  retryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
