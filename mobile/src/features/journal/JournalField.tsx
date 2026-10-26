import { useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { colors, ui } from '../../components/Design';
import { useConversationScroll } from '../../components/ConversationScrollView';
export function JournalField({
  label,
  visibleLabel,
  value,
  onChange,
  numeric = false,
  integer = false,
  multiline = false,
  disabled = false,
  suggested = false,
  maxLength,
}: {
  label: string;
  visibleLabel?: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  integer?: boolean;
  multiline?: boolean;
  disabled?: boolean;
  suggested?: boolean;
  maxLength?: number;
}) {
  const view = useRef<View | null>(null),
    focused = useRef(false),
    scroll = useConversationScroll();
  const [showDone, setShowDone] = useState(false);
  const reveal = () => scroll.reveal({ composer: view, question: view });
  return (
    <View
      ref={view}
      collapsable={false}
      onLayout={() => {
        if (focused.current) reveal();
      }}
      style={{ gap: 5, flexGrow: 1, minWidth: 80 }}
    >
      <Text style={ui.label}>{visibleLabel ?? label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        selectTextOnFocus={suggested}
        onChangeText={onChange}
        editable={!disabled}
        keyboardType={numeric ? (integer ? 'number-pad' : 'decimal-pad') : 'default'}
        multiline={multiline}
        maxLength={maxLength ?? (multiline ? 4000 : 160)}
        style={[
          ui.input,
          suggested && { color: colors.action },
          multiline && { minHeight: 100, maxHeight: 145, textAlignVertical: 'top' },
        ]}
        onFocus={() => {
          focused.current = true;
          setShowDone(true);
          scroll.reveal({ composer: view, question: view }, true);
        }}
        onBlur={() => {
          focused.current = false;
          setShowDone(false);
        }}
        onContentSizeChange={() => {
          if (focused.current) reveal();
        }}
      />
      {showDone && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done editing"
          onPress={() => {
            Keyboard.dismiss();
            setShowDone(false);
          }}
          style={{
            minHeight: 44,
            paddingHorizontal: 14,
            alignSelf: 'flex-start',
            borderWidth: 1,
            borderColor: '#B6C4F5',
            borderRadius: 8,
            backgroundColor: colors.actionWash,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.action }}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}
