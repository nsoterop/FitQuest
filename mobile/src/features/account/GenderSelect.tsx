import { Icon } from '../../components/Icon';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ui } from '../../components/Design';
import { profileGenders } from '../../../../backend/src/shared/profileBirthday.ts';

export function GenderSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = profileGenders.some((option) => option === value);
  return (
    <View style={{ gap: 8 }}>
      <Text style={ui.section}>Gender</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Select gender"
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={[
          ui.row,
          { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#9399A4', borderRadius: 7 },
        ]}
      >
        <Text style={[ui.copy, { flexShrink: 1 }]}>{selected ? value : 'Select gender'}</Text>
        <Icon name="chevron-down" />
      </Pressable>
      {open &&
        profileGenders.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={option}
            accessibilityState={{ checked: value === option, disabled }}
            disabled={disabled}
            onPress={() => {
              onChange(option);
              setOpen(false);
            }}
            style={{ minHeight: 48, padding: 12 }}
          >
            <Text style={ui.copy}>{option}</Text>
          </Pressable>
        ))}
    </View>
  );
}
