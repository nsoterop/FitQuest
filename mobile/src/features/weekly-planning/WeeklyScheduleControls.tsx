import { Text } from 'react-native';
import type { WeeklySchedule } from '../../../../backend/src/shared/weeklyScheduleContract';
import { Notice, ui } from '../../components/Design';
export function WeeklyScheduleControls({
  schedule,
}: {
  schedule: WeeklySchedule | null | undefined;
}) {
  return (
    <>
      <Text style={ui.copy}>
        {schedule?.enabled
          ? 'Sunday planning · 9 PM · ' + schedule.timeZone
          : 'Automatic planning is off. Sharing permission is available in Account.'}
      </Text>
      {schedule?.error && (
        <Notice>
          Automatic planning needs attention. Your saved plan is unchanged. Review the saved week or
          sharing permission in Account.
        </Notice>
      )}
    </>
  );
}
