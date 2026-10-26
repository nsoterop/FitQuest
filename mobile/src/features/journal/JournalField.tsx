import { useRef } from 'react';
import { Text, TextInput, View } from 'react-native';
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
  hideLabel = false,
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
  hideLabel?: boolean;
}) {
  const view = useRef<View | null>(null),
    focused = useRef(false),
    scroll = useConversationScroll();
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
      {!hideLabel && <Text style={ui.label}>{visibleLabel ?? label}</Text>}
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
          scroll.reveal({ composer: view, question: view }, true);
        }}
        onBlur={() => {
          focused.current = false;
        }}
        onContentSizeChange={() => {
          if (focused.current) reveal();
        }}
      />
    </View>
  );
}
