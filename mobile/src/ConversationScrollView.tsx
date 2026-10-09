import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { visibleAnswerOffset } from './conversationViewport';

type Targets = { composer: RefObject<View | null>; question: RefObject<View | null> };
type ConversationScroll = { reveal: (targets: Targets, focus?: boolean) => void };
const ConversationScrollContext = createContext<ConversationScroll>({ reveal() {} });
export const useConversationScroll = () => useContext(ConversationScrollContext);

// One keyboard adjustment and one scroll container for the entire screen. Move only on
// focus, viewport/target layout changes, or new replies while following the conversation.
export function ConversationScrollView({ children, contentContainerStyle }: { children: ReactNode; contentContainerStyle?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null), content = useRef<View>(null);
  const viewport = useRef(0), offset = useRef(0), following = useRef(true);
  const targets = useRef<Targets | null>(null), frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const reveal = useCallback((next: Targets, focus = false) => {
    targets.current = next;
    if (focus) following.current = true;
    if (!following.current || frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const parent = content.current, composer = targets.current?.composer.current, question = targets.current?.question.current;
      if (!parent || !composer || !viewport.current || !following.current) return;
      composer.measureLayout(parent, (_x, y, _width, height) => {
        const move = (questionTop: number) => {
          if (!following.current) return;
          const nextOffset = visibleAnswerOffset(offset.current, viewport.current, y, height, questionTop);
          if (Math.abs(nextOffset - offset.current) > 1) scroll.current?.scrollTo({ y: nextOffset, animated: true });
        };
        if (question) question.measureLayout(parent, (_qx, qy) => move(qy), () => move(y));
        else move(y);
      }, () => {});
    });
  }, []);
  // iOS finishes updating native scroll bounds after the keyboard's layout event.
  // Re-measure then: a scroll issued during that layout can be clamped to old bounds.
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => { if (targets.current) reveal(targets.current); });
    const hidden = Keyboard.addListener('keyboardDidHide', () => { if (targets.current) reveal(targets.current); });
    return () => { shown.remove(); hidden.remove(); };
  }, [reveal]);
  return <ConversationScrollContext.Provider value={{ reveal }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{flexGrow:1}} automaticallyAdjustKeyboardInsets={false} contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" scrollEventThrottle={16}
        onScrollBeginDrag={() => { following.current = false; }}
        onScroll={event => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          offset.current = contentOffset.y;
          if (contentSize.height - layoutMeasurement.height - contentOffset.y < 48) following.current = true;
        }}
        onLayout={event => { viewport.current = event.nativeEvent.layout.height; if (targets.current) reveal(targets.current); }}
        onContentSizeChange={() => { if (targets.current) reveal(targets.current); }}>
        <View ref={content} collapsable={false} style={contentContainerStyle}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  </ConversationScrollContext.Provider>;
}
