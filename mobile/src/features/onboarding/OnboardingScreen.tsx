import { Page, ui } from '../../components/Design';
import { FixedIntakeForm } from './FixedIntakeForm';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  isDeletedOnboarding,
  type DeletedOnboarding,
  type RecoveryRequest,
  OnboardingApiError,
  onboardingErrorText,
  onboardingRequest,
  operationId,
  type OnboardingCommand,
  type OnboardingConversation,
} from './onboardingApi';
import { useConversationScroll } from '../../components/ConversationScrollView';
import { privateDrafts } from './onboardingDraftStorage';
import type { OnboardingDraftStore } from './onboardingDraft';

type OnboardingProps = {
  onAccount?: () => void;
  notice?: string;
  recovery?: RecoveryRequest;
  userId: string;
  accessToken: () => Promise<string>;
  onSessionEnded?: () => void;
  onClose: (message?: string, summarySaved?: boolean) => void;
  drafts?: OnboardingDraftStore;
};
export function OnboardingScreen(props: OnboardingProps) {
  return (
    <Page
      onAccount={props.onAccount}
      onBack={() => props.onClose()}
      backLabel={props.recovery ? 'Back to training' : 'Back to onboarding'}
    >
      <AccountOnboardingScreen key={props.userId} {...props} />
    </Page>
  );
}
function AccountOnboardingScreen({
  userId,
  notice,
  accessToken,
  onSessionEnded,
  onClose,
  recovery,
  drafts = privateDrafts,
}: OnboardingProps) {
  const [accepted, setAccepted] = useState(!!recovery);
  const [conversation, setConversation] = useState<OnboardingConversation | null>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<OnboardingCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const editRef = useRef<number | null>(null);
  editRef.current = editIndex;
  const alive = useRef(true);
  const request = useRef<AbortController | null>(null);
  const tokenGetter = useRef(accessToken);
  tokenGetter.current = accessToken;
  const sending = useRef(false);
  const ending = useRef(false);
  const unsent = useRef('');
  const [cleanup, setCleanup] = useState<DeletedOnboarding | null>(null);
  const [cleanupError, setCleanupError] = useState(false);
  const composer = useRef<View>(null),
    question = useRef<View>(null);
  const { reveal } = useConversationScroll();
  const answerLayout = () => reveal({ composer, question });
  const ended = useRef(onSessionEnded);
  ended.current = onSessionEnded;
  const current = useRef<OnboardingConversation | null>(null);
  current.current = conversation;

  async function saveDraft(
    nextText: string,
    nextPending: OnboardingCommand | null,
    id = current.current?.id ?? null,
  ) {
    if (!alive.current || ending.current) return;
    try {
      await drafts.write(userId, {
        conversationId: id,
        text: nextText,
        pending: nextPending,
        answerIndex: editRef.current,
        savedAt: Date.now(),
      });
      if (alive.current) setDraftError('');
    } catch {
      if (alive.current)
        setDraftError('Could not save your draft. Keep this screen open and try again.');
    }
  }
  async function finishDeleted(result: DeletedOnboarding) {
    if (!alive.current) return;
    ending.current = true;
    setCleanup(result);
    setCleanupError(false);
    setConversation(null);
    current.current = null;
    setText('');
    setPending(null);
    setError('');
    setDraftError('');
    try {
      await drafts.clear(userId, result.id);
      if (alive.current) onClose(result.message, result.summarySaved === true);
    } catch {
      if (alive.current) setCleanupError(true);
    }
  }
  async function perform(
    action: (
      token: string,
      signal: AbortSignal,
    ) => Promise<OnboardingConversation | DeletedOnboarding | null>,
    after?: (result: OnboardingConversation | null) => Promise<void> | void,
  ) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setNeedsRefresh(false);
    const timeout = setTimeout(() => controller.abort(), 75000);
    try {
      const token = await tokenGetter.current();
      if (!alive.current || controller.signal.aborted) return;
      const result = await action(token, controller.signal);
      if (!alive.current || controller.signal.aborted || request.current !== controller) return;
      if (isDeletedOnboarding(result)) {
        await finishDeleted(result);
        return;
      }
      if (result === null && current.current) {
        await finishDeleted({
          id: current.current.id,
          deleted: true,
          message: 'Conversation deleted.',
        });
        return;
      }
      setConversation(result);
      current.current = result;
      await after?.(result);
    } catch (error) {
      if (request.current !== controller) return;
      if (alive.current && !controller.signal.aborted) {
        if (error instanceof OnboardingApiError && error.sessionEnded) {
          ended.current?.();
          return;
        }
        if (error instanceof OnboardingApiError && error.code === 'not_found' && current.current) {
          await finishDeleted({
            id: current.current.id,
            deleted: true,
            message: 'This conversation is no longer stored.',
          });
          return;
        }
        setError(
          error instanceof OnboardingApiError
            ? error.message
            : 'Could not load the conversation. Try again.',
        );
        setNeedsRefresh(
          !(
            error instanceof OnboardingApiError &&
            ['context_limit', 'storage_limit'].includes(error.code)
          ),
        );
      } else if (alive.current) {
        setError('This is taking longer than expected. Try again.');
        setNeedsRefresh(true);
      }
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (alive.current) setBusy(false);
      }
    }
  }
  async function start() {
    await perform(
      async (token, signal) => {
        const draft = await drafts.read(userId);
        if (draft?.conversationId && draft.pending?.kind === 'confirm') {
          // Recover a committed confirmation before create/resume can start a new
          // chat. This read cannot acknowledge unseen work or call the model.
          try {
            return await onboardingRequest('GET', draft.conversationId, null, token, signal);
          } catch (error) {
            if (!(error instanceof OnboardingApiError) || error.code !== 'not_found') throw error;
            await drafts.clear(userId, draft.conversationId);
          }
        }
        return onboardingRequest('POST', null, null, token, signal, fetch, recovery);
      },
      async (result) => {
        const draft = await drafts.read(userId);
        if (!alive.current) return;
        if (draft && draft.conversationId === result?.id) {
          setText(draft.text);
          unsent.current = draft.text;
          setPending(draft.pending);
          setEditIndex(draft.answerIndex ?? null);
        } else if (draft) await drafts.clear(userId, draft.conversationId ?? undefined);
        setAccepted(true);
      },
    );
  }
  useEffect(() => {
    alive.current = true;
    if (recovery) void start();
    return () => {
      alive.current = false;
      request.current?.abort();
      request.current = null;
    };
  }, []);
  async function refresh() {
    if (!conversation) return;
    await perform((token, signal) =>
      onboardingRequest('GET', conversation.id, null, token, signal),
    );
  }
  async function send(command: OnboardingCommand) {
    if (!conversation || request.current || sending.current || ending.current) return;
    command = {
      ...command,
      timeZone: command.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    sending.current = true;
    setBusy(true);
    setDraftError('');
    setPending(command);
    // Await durable operation ID before dispatch. A lost response replays this same command.
    try {
      await drafts.write(userId, {
        conversationId: conversation.id,
        text,
        pending: command,
        answerIndex: editRef.current,
        savedAt: Date.now(),
      });
    } catch {
      if (alive.current) {
        setError('Could not save your answer on this device. Try again.');
        setBusy(false);
      }
      sending.current = false;
      return;
    }
    if (!alive.current || request.current || ending.current) {
      sending.current = false;
      return;
    }
    await perform(
      async (token, signal) => {
        try {
          return await onboardingRequest('POST', conversation.id, command, token, signal);
        } catch (error) {
          // Explicit bound/revision rejections roll back. Unknown outcomes retain the same pending ID.
          if (
            error instanceof OnboardingApiError &&
            [
              'context_limit',
              'storage_limit',
              'revision_conflict',
              'review_changed',
              'profile_changed',
              'clarification_required',
              'summary_changed',
            ].includes(error.code) &&
            alive.current &&
            !signal.aborted
          ) {
            await drafts.write(userId, {
              conversationId: conversation.id,
              text,
              pending: null,
              savedAt: Date.now(),
            });
            if (alive.current && !signal.aborted) setPending(null);
          }
          throw error;
        }
      },
      async () => {
        setPending(null);
        setText('');
        unsent.current = '';
        setEditIndex(null);
        editRef.current = null;
        await drafts.clear(userId, conversation.id);
        if (alive.current) setDraftError('');
        // Failed responses remain visible; only an explicit retry can call AI again.
      },
    );
    sending.current = false;
  }
  function command(fields: { kind: 'message'; text: string } | { kind: 'retry'; turnId: string }) {
    if (conversation)
      void send({ ...fields, operationId: operationId(), expectedRevision: conversation.revision });
  }
  function button(label: string, onPress: () => void, disabled = busy, secondary = false) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}
      >
        <Text style={secondary ? styles.secondaryText : styles.buttonText}>{label}</Text>
      </Pressable>
    );
  }
  const activeTurn = conversation?.turns.find((t) => t.state === 'pending');
  const latest = conversation?.turns.at(-1);
  const readyRecap =
    conversation?.confirmableRevision === conversation?.revision &&
    conversation?.state === 'collecting' &&
    !conversation.profileChanged &&
    conversation.context.readiness !== 'needs_clarification' &&
    latest?.state === 'completed' &&
    latest.questionTopic === 'Onboarding recap' &&
    !!latest.reply;
  const cannotContinue =
    busy || !!pending || !!activeTurn || needsRefresh || !!draftError || !!text.trim();
  function continueFromRecap() {
    if (!readyRecap || cannotContinue || unsent.current.trim() || current.current !== conversation)
      return;
    void send({
      kind: 'confirm',
      operationId: operationId(),
      expectedRevision: conversation.revision,
      reviewedRevision: conversation.revision,
    });
  }
  const failure =
    latest?.state === 'failed' ? onboardingErrorText(latest.error ?? 'provider_error') : '';
  if (cleanup)
    return (
      <View style={styles.section}>
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {cleanup.message}
        </Text>
        {cleanupError && (
          <>
            <Text accessibilityRole="alert" style={styles.error}>
              Could not clear the device draft. Try again.
            </Text>
            {button('Finish cleanup', () => void finishDeleted(cleanup), false, true)}
          </>
        )}
      </View>
    );
  return (
    <View style={styles.section}>
      <View style={styles.optionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conversation options"
          accessibilityState={{ expanded: optionsOpen }}
          onPress={() => {
            setOptionsOpen(!optionsOpen);
            setDeleteRequested(false);
          }}
          style={styles.optionsButton}
        >
          <Text style={styles.optionsText}>···</Text>
        </Pressable>
      </View>
      {optionsOpen && (
        <View style={styles.menu}>
          {deleteRequested ? (
            <>
              <Text style={styles.copy}>
                Delete this conversation and device draft? Your profile and account remain. Provider
                retention, backups and usage records are separate.
              </Text>
              {button(
                'Delete conversation permanently',
                () => {
                  request.current?.abort();
                  request.current = null;
                  void perform((token, signal) =>
                    onboardingRequest('DELETE', conversation!.id, null, token, signal),
                  );
                },
                false,
              )}
              {button('Keep conversation', () => setDeleteRequested(false), busy, true)}
            </>
          ) : (
            <>
              {button('Close options', () => setOptionsOpen(false), false, true)}
              {conversation &&
                button('Delete conversation', () => setDeleteRequested(true), false, true)}
            </>
          )}
        </View>
      )}
      {recovery && !conversation && (
        <>
          <Text style={styles.copy}>
            {busy ? 'Loading clarification…' : error || 'Continue from your saved summary.'}
          </Text>
          {!busy && button('Load clarification', () => void start())}
        </>
      )}
      {!accepted ? (
        <>
          {!!notice && (
            <Text accessibilityLiveRegion="polite" style={styles.copy}>
              {notice}
            </Text>
          )}
          <Text accessibilityRole="header" style={styles.title}>
            Before we begin
          </Text>
          <Text style={styles.copy}>
            Planning is for adults 18+. These five answers are saved privately, exactly as
            submitted. No AI is used during intake. After these answers, explicit sharing permission
            is required before OpenAI receives your body profile and intake context to generate
            workouts and nutrition estimates in one request. You see the high-level plan first. Use
            this plan reveals its saved workouts without another AI request. Planning answers and
            plans stay saved; intake revisions and the device draft are removed after submission.
            Provider retention and backups are separate.
          </Text>
          {button('Continue to onboarding', () => void start())}
        </>
      ) : conversation?.context.intake ? (
        <>
          <FixedIntakeForm
            questions={conversation.intakeQuestions!}
            answers={conversation.context.intake.answers}
            text={text}
            editIndex={editIndex}
            disabled={busy || !!pending || needsRefresh}
            canContinue={!draftError && !needsRefresh}
            onText={(next) => {
              unsent.current = next;
              setText(next);
              void saveDraft(next, null);
            }}
            onEdit={(index) => {
              editRef.current = index;
              setEditIndex(index);
              const next = conversation.context.intake!.answers[index]!;
              unsent.current = next;
              setText(next);
              void saveDraft(next, null);
            }}
            onCancel={() => {
              editRef.current = null;
              setEditIndex(null);
              unsent.current = '';
              setText('');
              void saveDraft('', null);
            }}
            onSave={(index) =>
              void send({
                kind: 'edit',
                itemId: null,
                topic: `intake:${index}`,
                value: text,
                operationId: operationId(),
                expectedRevision: conversation.revision,
              })
            }
            onContinue={() => {
              if (
                unsent.current.trim() ||
                editRef.current !== null ||
                busy ||
                pending ||
                needsRefresh ||
                draftError
              )
                return;
              void send({
                kind: 'confirm',
                operationId: operationId(),
                expectedRevision: conversation.revision,
                reviewedRevision: conversation.revision,
              });
            }}
          />
          {busy && (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              Saving…
            </Text>
          )}
          {!!(error || draftError) && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error || draftError}
            </Text>
          )}
          {!busy &&
            (pending
              ? button('Try again', () => void send(pending), false, true)
              : needsRefresh && button('Reload answers', () => void refresh(), false, true))}
        </>
      ) : conversation ? (
        <>
          {conversation.turns.length === 0 && (
            <View ref={question} collapsable={false} onLayout={answerLayout}>
              <Text style={styles.copy}>{conversation.opening}</Text>
            </View>
          )}
          {conversation.turns.map((turn) => (
            <View key={turn.id} style={styles.turn}>
              <View style={styles.answer}>
                <Text style={styles.copy}>{turn.message}</Text>
              </View>
              {turn.reply && (
                <View
                  ref={turn.id === latest?.id ? question : undefined}
                  collapsable={false}
                  onLayout={turn.id === latest?.id ? answerLayout : undefined}
                >
                  <Text style={styles.copy}>{turn.reply}</Text>
                </View>
              )}
            </View>
          ))}
          {(busy || activeTurn) && (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              {pending?.kind === 'confirm'
                ? 'Saving…'
                : pending || activeTurn
                  ? 'Thinking…'
                  : 'Loading…'}
            </Text>
          )}
          <View
            ref={composer}
            collapsable={false}
            style={styles.composerGroup}
            onLayout={answerLayout}
          >
            <View style={styles.composer}>
              <TextInput
                accessibilityLabel="Onboarding message"
                placeholder="Your answer"
                onFocus={() => reveal({ composer, question }, true)}
                value={text}
                multiline
                maxLength={4000}
                editable={!busy && !pending && !activeTurn}
                onChangeText={(next) => {
                  unsent.current = next;
                  setText(next);
                  void saveDraft(next, null);
                }}
                style={styles.input}
              />
              {button(
                'Send',
                () => command({ kind: 'message', text: text.trim() }),
                busy || !text.trim() || !!pending || !!activeTurn || needsRefresh,
              )}
            </View>
            {readyRecap && button('Continue', continueFromRecap, cannotContinue)}
          </View>
          {!busy && (
            <>
              {!!(error || failure) && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error || failure}
                </Text>
              )}
              {pending
                ? button('Try again', () => void send(pending), false, true)
                : activeTurn || needsRefresh
                  ? button('Check for reply', () => void refresh(), false, true)
                  : latest?.state === 'failed' &&
                    conversation.generationEnabled &&
                    button(
                      'Retry reply',
                      () => command({ kind: 'retry', turnId: latest.id }),
                      false,
                      true,
                    )}
            </>
          )}
          {!!draftError && (
            <Text accessibilityRole="alert" style={styles.error}>
              {draftError}
            </Text>
          )}
        </>
      ) : null}
      {!!draftError &&
        !busy &&
        button('Retry saving draft', () => void saveDraft(text, pending), false, true)}
      {!accepted && !!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { flexGrow: 1, gap: 16 },
  title: ui.title,
  copy: { fontSize: 16, lineHeight: 25, color: '#191B20' },
  notice: { fontSize: 15, lineHeight: 23, color: '#626670' },
  turn: { gap: 14 },
  answer: {
    alignSelf: 'flex-end',
    maxWidth: '92%',
    backgroundColor: '#F2F3F5',
    borderRadius: 14,
    padding: 12,
  },
  composerGroup: { gap: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 180,
    borderWidth: 1,
    borderColor: '#9399A4',
    borderRadius: 12,
    padding: 12,
    color: '#191B20',
    fontSize: 17,
    backgroundColor: '#FFFFFF',
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#244DE5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondary: { backgroundColor: 'transparent', alignSelf: 'flex-start' },
  secondaryText: { color: '#244DE5', fontSize: 16 },
  optionsRow: { alignItems: 'flex-end' },
  optionsButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  optionsText: { fontSize: 24, color: '#626670' },
  menu: {
    borderWidth: 1,
    borderColor: '#DCDFE4',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  disabled: { opacity: 0.5 },
  error: { fontSize: 15, lineHeight: 23, color: '#9B302C' },
});
