import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { checkBackendHealth } from './src/backendHealth';
import { ConversationScrollView } from './src/ConversationScrollView';
import { AccountPanel } from './src/AccountPanel';

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
        <ConversationScrollView contentContainerStyle={styles.content}>
            <View style={styles.page}>
              <View style={styles.brand}>
                <View style={styles.mark} accessibilityElementsHidden>
                  <Text style={styles.markText}>FQ</Text>
                </View>
                <Text style={styles.wordmark}>FitQuest</Text>
              </View>
              <AccountPanel />
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
          </ConversationScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F7F2' },
  content: { flexGrow: 1, padding: 24 },
  page: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#176B5B', alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  wordmark: { color: '#193B34', fontSize: 22, fontWeight: '700' },
  backend: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  backendStatus: { color: '#52655E', fontSize: 14, lineHeight: 21 },
  retry: { padding: 12, minHeight: 44 },
  retryDimmed: { opacity: 0.5 },
  retryText: { color: '#176B5B', fontSize: 14, fontWeight: '600' },
});
