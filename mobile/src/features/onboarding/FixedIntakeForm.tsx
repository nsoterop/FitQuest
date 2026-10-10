import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useConversationScroll } from '../../components/ConversationScrollView';
import { Action, colors, ui } from '../../components/Design';
export type FixedIntakeFormProps = {
  questions: readonly string[];
  answers: string[];
  text: string;
  editIndex: number | null;
  disabled: boolean;
  canContinue: boolean;
  onText: (text: string) => void;
  onEdit: (index: number) => void;
  onCancel: () => void;
  onSave: (index: number) => void;
  onContinue: () => void;
};
const titles = [
  'Your goals.',
  'Your starting point.',
  'Your equipment.',
  'Your schedule.',
  'Your limitations.',
];
const categories = ['GOALS', 'CURRENT ACTIVITY', 'EQUIPMENT', 'PREFERENCES', 'LIMITATIONS'];
export function FixedIntakeForm(p: FixedIntakeFormProps) {
  const composer = useRef<View>(null),
    question = useRef<View>(null),
    scroll = useConversationScroll(),
    [history, setHistory] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(Keyboard.isVisible?.() ?? false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true)),
      hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const index = p.editIndex ?? p.answers.length,
    complete = p.answers.length === 5;
  const reveal = (focus = false) => scroll.reveal({ composer, question }, focus);
  const previous = (
    <View style={{ gap: 16 }}>
      {p.answers.map((answer, i) =>
        i === index ? null : (
          <View
            key={i}
            style={{ gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}
          >
            <Text style={ui.eyebrow}>{categories[i]}</Text>
            <Text style={ui.copy}>{answer}</Text>
            <Action
              label={`Edit answer ${i + 1}`}
              onPress={() => p.onEdit(i)}
              disabled={p.disabled}
              secondary
            />
          </View>
        ),
      )}
    </View>
  );
  return (
    <View style={{ flexGrow: 1, gap: 20 }}>
      <Text style={ui.eyebrow}>
        {index < 5 ? `QUESTION ${index + 1} OF 5 · ${categories[index]}` : 'READY WHEN YOU ARE'}
      </Text>
      <View
        accessibilityLabel={`${Math.min(index + 1, 5)} of 5 questions`}
        style={{ flexDirection: 'row', gap: 6 }}
      >
        {titles.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 3,
              backgroundColor: i <= index ? colors.action : colors.line,
            }}
          />
        ))}
      </View>
      <Text accessibilityRole="header" style={ui.title}>
        {index < 5 ? titles[index] : 'Your starting point, saved.'}
      </Text>
      {index < 5 ? (
        <>
          {p.answers.length > 0 && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={history ? 'Hide earlier answers' : 'Earlier answers'}
                accessibilityState={{ expanded: history }}
                disabled={p.disabled}
                onPress={() => setHistory(!history)}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={[ui.label, { color: colors.action }]}>
                  {history ? 'Hide earlier answers' : 'Earlier answers'} {history ? '−' : '+'}
                </Text>
              </Pressable>
              {history && previous}
            </>
          )}
          <View ref={question} collapsable={false}>
            <Text style={[ui.section, { lineHeight: 30 }]}>{p.questions[index]}</Text>
          </View>
          <View
            ref={composer}
            collapsable={false}
            onLayout={() => reveal()}
            style={{ marginTop: 'auto', paddingTop: 16, gap: 10 }}
          >
            <TextInput
              accessibilityLabel={`Answer ${index + 1}`}
              placeholder="Tell me in your own words…"
              value={p.text}
              onChangeText={p.onText}
              multiline
              editable={!p.disabled}
              maxLength={4000}
              onFocus={() => reveal(true)}
              onContentSizeChange={() => reveal()}
              style={[
                ui.input,
                { minHeight: 108, maxHeight: keyboardOpen ? 108 : 180, textAlignVertical: 'top' },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={p.editIndex === null ? 'Send' : 'Save answer'}
              disabled={p.disabled || !p.text.trim()}
              onPress={() => p.onSave(index)}
              style={[ui.button, (p.disabled || !p.text.trim()) && ui.disabled]}
            >
              <Text style={ui.buttonText}>{p.editIndex === null ? 'Continue' : 'Save answer'}</Text>
            </Pressable>
            {p.editIndex !== null && (
              <Action label="Cancel edit" onPress={p.onCancel} disabled={p.disabled} secondary />
            )}
          </View>
        </>
      ) : (
        <>
          <Text style={ui.copy}>
            Review your answers. Your week will be built from what you’ve shared.
          </Text>
          {previous}
        </>
      )}
      {complete && (
        <>
          <Text style={ui.copy}>
            Next, choose whether to share your profile and answers with OpenAI. With permission,
            your complete week is generated once. Review the plan before choosing it.
          </Text>
          <Action
            label="Continue to sharing"
            onPress={p.onContinue}
            disabled={!p.canContinue || p.disabled || p.editIndex !== null || !!p.text.trim()}
          />
        </>
      )}
    </View>
  );
}
