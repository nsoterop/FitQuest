import { Text } from 'react-native';
import { Page, Tabs, ui, type MainTab } from '../../components/Design';
import { BodyWeight } from '../weight/BodyWeight';

type Props = {
  userId: string;
  accessToken: () => Promise<string>;
  onSessionEnded?: () => void;
  onAccount?: () => void;
  onTab: (tab: MainTab) => void;
};

export function ProgressScreen({ userId, accessToken, onSessionEnded, onAccount, onTab }: Props) {
  return (
    <Page onAccount={onAccount} footer={<Tabs nutrition value="progress" onChange={onTab} />}>
      <Text accessibilityRole="header" style={ui.title}>
        Progress.
      </Text>
      <BodyWeight userId={userId} accessToken={accessToken} onSessionEnded={onSessionEnded} />
    </Page>
  );
}
