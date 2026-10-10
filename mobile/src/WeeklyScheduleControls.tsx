import { Text } from 'react-native';
import type { WeeklySchedule } from '../../backend/src/shared/weeklyScheduleContract';
import { Action, Notice, ui } from './Design';

// Presentation only: NextWeek owns permission, revision and request handling.
export function WeeklyScheduleControls({
  schedule,
  disabled,
  onToggle,
}: {
  schedule: WeeklySchedule | null | undefined;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <>
      <Text style={ui.section}>Automatic weekly plans</Text>
      <Text style={ui.copy}>
        {schedule?.enabled
          ? `On · Sunday 9 PM · ${schedule.timeZone}`
          : 'Off. Enable to have OpenAI prepare one upcoming week each Sunday at 9 PM in your saved timezone, even when the app is closed. This uses your permitted workout/weight history and existing AI allowance. Review and accept each saved plan; uncertain requests are never automatically retried.'}
      </Text>
      {schedule?.error && (
        <Notice>
          Automatic planning needs attention. Your current plan is unchanged. Open the saved week or
          use Generate next week to review the issue.
        </Notice>
      )}
      <Action
        label={schedule?.enabled ? 'Pause automatic weekly plans' : 'Enable Sunday 9 PM planning'}
        secondary
        disabled={disabled}
        onPress={() => onToggle(!schedule?.enabled)}
      />
      <Text style={ui.copy}>
        Pausing stops future requests; a request already sent may finish. Accepted weeks apply on
        their dates. Logs saved later do not buy another plan.
      </Text>
    </>
  );
}
