import { Linking, Pressable, Text, View } from 'react-native';
import {
  hasPlanningConsent,
  hasRecurringPlanningConsent,
  recurringDisclosure,
  planningPolicyUrl,
  type PlanningConsent,
} from '../../../../backend/src/shared/planningConsent';
import {
  hasRecurringHistoryConsent,
  type HistoryConsent,
} from '../../../../backend/src/shared/progressConsent';
import { Action, ui } from '../../components/Design';
export function PlanningPermission({
  consent,
  historyConsent,
  timeZone,
  busy,
  onChange,
}: {
  consent: PlanningConsent | null | undefined;
  historyConsent?: HistoryConsent | null;
  timeZone?: string;
  busy: boolean;
  onChange: (granted: boolean) => void;
}) {
  const granted = hasPlanningConsent(consent);
  const recurring =
    hasRecurringPlanningConsent(consent) && hasRecurringHistoryConsent(historyConsent);
  return (
    <View style={{ gap: 12, paddingVertical: 12 }}>
      <Text style={ui.section}>OpenAI sharing permission</Text>
      {granted ? (
        <>
          <Text style={ui.copy}>
            {recurring
              ? `You allow profile, intake and actual workout/weight history sharing for plans, including Sunday 9 PM planning in ${timeZone ?? 'your saved timezone'}. Withdraw to stop future requests; saved plans and logs stay available.`
              : 'Your existing profile/intake permission does not include automatic weekly planning. Review the updated permission below. Saved plans remain available.'}
          </Text>
          <Action
            label="Withdraw profile sharing permission"
            secondary
            disabled={busy}
            onPress={() => onChange(false)}
          />
        </>
      ) : null}
      {!recurring && (
        <>
          <Text style={ui.copy}>{recurringDisclosure}</Text>
          {timeZone && <Text style={ui.copy}>Sunday 9 PM · {timeZone}</Text>}
          <Action
            label="Allow profile sharing with OpenAI"
            disabled={busy}
            onPress={() => onChange(true)}
          />
          <Action
            label="Decline profile sharing"
            secondary
            disabled={busy || consent?.granted === false}
            onPress={() => onChange(false)}
          />
          {consent?.granted === false && (
            <Text style={ui.copy}>Sharing declined. No new plan request will be sent.</Text>
          )}
        </>
      )}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="OpenAI data-use and retention information"
        onPress={() => void Linking.openURL(planningPolicyUrl)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={[ui.copy, { textDecorationLine: 'underline' }]}>
          OpenAI data-use and retention information
        </Text>
      </Pressable>
    </View>
  );
}
