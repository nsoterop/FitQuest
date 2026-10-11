import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';

export function WorkoutCompletionBadge() {
  return (
    <View style={styles.badge}>
      <Icon name="square-check" color="#166534" />
      <Text style={styles.label}>Completed</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: '#DCFCE7',
  },
  label: { color: '#166534', fontSize: 13, lineHeight: 19, fontWeight: '700', flexShrink: 1 },
});
