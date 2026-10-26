import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Action, colors, ui } from './Design';
export function ExerciseInfo({
  name,
  prescription,
  description,
}: {
  name: string;
  prescription: string;
  description?: string | null;
}) {
  const [open, setOpen] = useState(false),
    trigger = useRef<View | null>(null),
    heading = useRef<Text | null>(null);
  const focus = (target: View | Text | null) => {
    if (target) {
      const id = findNodeHandle(target);
      if (id !== null) AccessibilityInfo.setAccessibilityFocus(id);
    }
  };
  const close = () => setOpen(false);
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`Information for ${name}`}
        accessibilityHint="Opens exercise prescription and guidance"
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text style={{ fontSize: 24, color: colors.action }}>ⓘ</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
        onShow={() => focus(heading.current)}
        onDismiss={() => focus(trigger.current)}
      >
        {open && (
          <View
            accessibilityViewIsModal
            style={{ flex: 1, backgroundColor: '#0008', padding: 20, justifyContent: 'center' }}
          >
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                maxHeight: '90%',
                padding: 20,
                gap: 12,
              }}
            >
              <Text ref={heading} accessible accessibilityRole="header" style={ui.section}>
                {name}
              </Text>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
              >
                <Text style={ui.label}>Prescription</Text>
                <Text selectable style={ui.copy}>
                  {prescription}
                </Text>
                {!!description && (
                  <>
                    <Text style={ui.label}>Guidance</Text>
                    <Text selectable style={ui.copy}>
                      {description}
                    </Text>
                  </>
                )}
              </ScrollView>
              <Action label={`Close information for ${name}`} secondary onPress={close} />
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}
