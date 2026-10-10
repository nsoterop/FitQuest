import { Text } from 'react-native';
import { Page, ui } from './Design';

export function LoadingProgress({ onAccount }: { onAccount?: () => void }) {
  return (
    <Page onAccount={onAccount}>
      <Text accessibilityLiveRegion="polite" style={ui.copy}>
        Loading your saved progress…
      </Text>
    </Page>
  );
}
