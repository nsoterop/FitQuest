import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.EXPO_PUBLIC_API_URL='https://fitquest-api.example';
let authListener;
const alice = { user: { id: 'alice', email: 'alice@example.test', email_confirmed_at: '2026-10-02T12:00:00Z' }, access_token: 'alice-token' };
const bob = { user: { id: 'bob', email: 'bob@example.test', email_confirmed_at: '2026-10-02T12:00:00Z' }, access_token: 'bob-token' };
let session = alice;
let restore = async () => ({ data: { session }, error: null });
let verify = async () => ({ data: { user: session?.user ?? null }, error: null });
let loginError = null;
let logoutError = null;
let signupCalls = 0;
globalThis.__fitquestTestClient = { auth: {
  onAuthStateChange: callback => { authListener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  getSession: () => restore(),
  getUser: token => verify(token),
  startAutoRefresh() {}, stopAutoRefresh() {},
  signOut: async () => { if (logoutError) return { error: logoutError }; session = null; authListener('SIGNED_OUT', null); return { error: null }; },
  signInWithPassword: async () => { if (loginError) return { data: { session: null }, error: loginError }; session = bob; authListener('SIGNED_IN', bob); return { data: { session: bob }, error: null }; },
  signUp: async () => { signupCalls++; return { data: { session: null }, error: null }; },
  setSession: async () => { session = alice; authListener('SIGNED_IN', alice); return { data: { session: alice }, error: null }; },
} };
const native = `export const View='View', Text='Text', TextInput='TextInput', Pressable='Pressable', ScrollView='ScrollView', KeyboardAvoidingView='KeyboardAvoidingView';
  export const Platform={OS:'ios'};
  export const StyleSheet={create:x=>x}; export const Keyboard={dismiss(){}};
  export const AppState={currentState:'active',addEventListener:()=>({remove(){}})};
  export const Linking={addEventListener:(_name,callback)=>{globalThis.__fitquestLinkListener=callback;return {remove(){}}},getInitialURL:async()=>null};`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react-native') return { url: 'fitquest-test:native', shortCircuit: true };
    if (specifier === 'expo-status-bar') return { url: 'fitquest-test:status', shortCircuit: true };
    if (specifier === 'react-native-safe-area-context') return { url: 'fitquest-test:safe', shortCircuit: true };
    if (specifier === './supabase' && context.parentURL?.endsWith('/AccountPanel.tsx')) return { url: 'fitquest-test:auth', shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const base = new URL(specifier, context.parentURL);
      for (const extension of ['.ts', '.tsx']) {
        const url = `${base.href}${extension}`;
        if (existsSync(fileURLToPath(url))) return next(url, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'fitquest-test:native') return { format: 'module', source: native, shortCircuit: true };
    if (url === 'fitquest-test:status') return { format: 'module', source: "export const StatusBar='StatusBar';", shortCircuit: true };
    if (url === 'fitquest-test:safe') return { format: 'module', source: "export const SafeAreaProvider='SafeAreaProvider', SafeAreaView='SafeAreaView';", shortCircuit: true };
    if (url === 'fitquest-test:auth') return { format: 'module', source: 'export const supabase=globalThis.__fitquestTestClient;', shortCircuit: true };
    if (url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { ProfileIntakeForm } = await import('./ProfileIntakeForm.tsx');
const { AccountPanel } = await import('./AccountPanel.tsx');
const { default: App } = await import('../App.tsx');
const payload = { firstName: 'Alex', lastName: 'Example', height: { value: 68, unit: 'in' }, age: 29,
  weight: { value: 155.5, unit: 'lb' }, gender: 'Prefer not to say',
  ageCapturedAt: '2026-10-02T12:00:00Z', updatedAt: '2026-10-02T12:00:00Z' };
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
function input(screen, label) { return screen.root.findByProps({ accessibilityLabel: label }); }
function text(screen) { return JSON.stringify(screen.toJSON()); }
const press = (screen, label) => input(screen, label).props.onPress();
function resetAuth(next = null) {
  session = next; loginError = logoutError = null; signupCalls = 0;
  restore = async () => ({ data: { session }, error: null });
  verify = async () => ({ data: { user: session?.user ?? null }, error: null });
}
async function mount(Component = AccountPanel) {
  let screen;
  await act(async () => { screen = TestRenderer.create(React.createElement(Component)); await flush(); });
  return screen;
}
async function credentials(screen) {
  await act(async () => { input(screen, 'Email').props.onChangeText('bob@example.test'); input(screen, 'Password').props.onChangeText('synthetic-password'); });
}

test('actual profile screen does not overwrite edits with a delayed load; failed save keeps fields', async () => {
  let deliver; globalThis.fetch = async () => new Promise(resolve => { deliver = resolve; });
  let screen;
  await act(async () => { screen = TestRenderer.create(React.createElement(ProfileIntakeForm, { accessToken: async () => 'alice-token' })); await flush(); });
  await act(async () => { input(screen, 'First name').props.onChangeText('Unsaved Alex'); });
  await act(async () => { deliver({ status: 200, json: async () => ({ profile: payload }) }); await flush(); });
  assert.equal(input(screen, 'First name').props.value, 'Unsaved Alex');
  for (const [label, value] of [['Last name', 'Example'], ['Height (feet)', '5'], ['Height (inches)', '8'], ['Age (years)', '29'], ['Weight (lb)', '155.5'], ['Gender', 'Prefer not to say']]) {
    await act(async () => { input(screen, label).props.onChangeText(value); });
  }
  globalThis.fetch = async () => ({ status: 503, json: async () => ({}) });
  await act(async () => { input(screen, 'Submit profile').props.onPress(); await flush(); });
  assert.equal(input(screen, 'First name').props.value, 'Unsaved Alex'); assert.equal(text(screen).includes('User Data Saved'), false);
  await act(async () => screen.unmount());
});

test('actual account screen clears profile on logout and rejects old response after Bob signs in', async () => {
  resetAuth(alice); const requests = [];
  globalThis.fetch = async (_url, options) => new Promise(resolve => requests.push({ resolve, token: options.headers.Authorization }));
  let screen;
  await act(async () => { screen = TestRenderer.create(React.createElement(AccountPanel)); await flush(); });
  assert.equal(requests[0].token, 'Bearer alice-token');
  await act(async () => { input(screen, 'First name').props.onChangeText('Private Alice Draft'); });
  const signOut = screen.root.findAllByType('Pressable').find(x => x.findByType('Text').children.join('') === 'Sign out');
  await act(async () => { signOut.props.onPress(); await flush(); });
  assert.equal(text(screen).includes('Private Alice Draft'), false); assert.equal(text(screen).includes('First name'), false);
  await act(async () => { input(screen, 'Email').props.onChangeText('bob@example.test'); input(screen, 'Password').props.onChangeText('synthetic-password'); });
  const signIn = screen.root.findAllByType('Pressable').find(x => x.findByType('Text').children.join('') === 'Sign in');
  await act(async () => { signIn.props.onPress(); await flush(); });
  assert.equal(requests[1].token, 'Bearer bob-token');
  await act(async () => { requests[1].resolve({ status: 200, json: async () => ({ profile: null }) });
    requests[0].resolve({ status: 200, json: async () => ({ profile: payload }) }); await flush(); });
  assert.equal(input(screen, 'First name').props.value, ''); assert.equal(text(screen).includes('Alex'), false);
  await act(async () => screen.unmount());
});

test('app opens at sign in, offers a signup switch, and keeps connection status after authentication content', async () => {
  resetAuth();
  globalThis.fetch = async () => ({status:200,json:async()=>({service:'fitquest-api',status:'ok'})});
  const screen = await mount(App);
  assert.ok(input(screen,'Sign in')); assert.ok(input(screen,'Switch to create account'));
  assert.equal(text(screen).includes('First name'),false);
  const words=screen.root.findAllByType('Text').map(x=>x.children.join('')).join('|');
  assert.ok(words.indexOf('Sign in') < words.indexOf('Backend: Connected'));
  assert.equal(words.includes('Welcome to FitQuest.'),false);
  await act(async()=>{press(screen,'Switch to create account')});
  assert.ok(input(screen,'Create account')); assert.ok(input(screen,'Switch to sign in'));
  assert.equal(input(screen,'Password').props.textContentType,'newPassword');
  await act(async()=>screen.unmount());
});

test('signup waits for confirmation; an authenticated confirmation link opens the empty profile form', async () => {
  resetAuth(); let reads=0;
  globalThis.fetch=async()=>{reads++; return {status:200,json:async()=>({profile:null})}};
  const screen=await mount();
  await act(async()=>{press(screen,'Switch to create account')}); await credentials(screen);
  await act(async()=>{press(screen,'Create account'); await flush()});
  assert.equal(signupCalls,1); assert.equal(reads,0); assert.equal(text(screen).includes('First name'),false);
  assert.ok(text(screen).includes('Check your email')); assert.equal(input(screen,'Password').props.value,'');
  await act(async()=>{globalThis.__fitquestLinkListener({url:'fitquest-dev://auth#access_token=alice-token&refresh_token=synthetic-refresh'}); await flush()});
  assert.equal(input(screen,'First name').props.value,''); assert.equal(reads,1);
  await act(async()=>screen.unmount());
});

test('incorrect credentials and unconfirmed email keep the profile hidden with clear feedback', async () => {
  for (const [code,feedback] of [['invalid_credentials','Check your email and password'],['email_not_confirmed','Confirm your email']]) {
    resetAuth(); loginError={code}; let reads=0;
    globalThis.fetch=async()=>{reads++; throw Error('Unexpected profile read')};
    const screen=await mount(); await credentials(screen);
    await act(async()=>{press(screen,'Sign in'); await flush()});
    assert.ok(text(screen).includes(feedback)); assert.equal(text(screen).includes('First name'),false); assert.equal(reads,0);
    await act(async()=>screen.unmount());
  }
});

test('reopen verifies the stored session before displaying and restoring only its saved profile', async () => {
  resetAuth(alice); let finishVerification; let reads=0;
  verify=async()=>new Promise(resolve=>{finishVerification=resolve});
  globalThis.fetch=async()=>{reads++; return {status:200,json:async()=>({profile:payload})}};
  const screen=await mount();
  assert.ok(text(screen).includes('Restoring your session')); assert.equal(reads,0); assert.equal(text(screen).includes('First name'),false);
  await act(async()=>{finishVerification({data:{user:alice.user},error:null}); await flush()});
  assert.equal(input(screen,'First name').props.value,'Alex');
  assert.equal(input(screen,'Height (feet)').props.value,'5'); assert.equal(input(screen,'Height (inches)').props.value,'8');
  assert.equal(reads,1); assert.equal(text(screen).includes('Switch to create account'),false);
  await act(async()=>screen.unmount());
});

test('a rejected, mismatched or unconfirmed restored session never displays private inputs', async () => {
  for (const result of [{data:{user:null},error:{code:'invalid_token'}},
    {data:{user:bob.user},error:null}, {data:{user:{...alice.user,email_confirmed_at:null}},error:null}]) {
    resetAuth(alice); verify=async()=>result; let reads=0;
    globalThis.fetch=async()=>{reads++; throw Error('Unexpected profile read')};
    const screen=await mount(); assert.ok(input(screen,'Sign in'));
    assert.equal(text(screen).includes('First name'),false); assert.equal(reads,0);
    await act(async()=>screen.unmount());
  }
});

test('late initial session restoration cannot replace a newer signed-in account', async () => {
  resetAuth(); let finishRestore; let restoreCalls=0;
  restore=async()=>++restoreCalls===1 ? new Promise(resolve=>{finishRestore=resolve}) : {data:{session},error:null};
  const tokens=[]; globalThis.fetch=async(_url,options)=>{tokens.push(options.headers.Authorization);return {status:200,json:async()=>({profile:null})}};
  const screen=await mount();
  await act(async()=>{session=bob; authListener('SIGNED_IN',bob); await flush()});
  await act(async()=>{finishRestore({data:{session:alice},error:null}); await flush()});
  assert.deepEqual(tokens,['Bearer bob-token']); assert.equal(text(screen).includes('alice@example.test'),false);
  await act(async()=>screen.unmount());
});

test('session refresh keeps the current profile draft and does not remount or reload it', async () => {
  resetAuth(alice); let reads=0;
  globalThis.fetch=async()=>{reads++;return {status:200,json:async()=>({profile:payload})}};
  const screen=await mount();
  await act(async()=>{input(screen,'First name').props.onChangeText('Unsaved Alice');session={...alice,access_token:'refreshed-token'};authListener('TOKEN_REFRESHED',session);await flush()});
  assert.equal(input(screen,'First name').props.value,'Unsaved Alice');assert.equal(reads,1);
  await act(async()=>screen.unmount());
});

test('backend session rejection clears the form and returns to sign in', async () => {
  resetAuth(alice); globalThis.fetch=async()=>({status:401,json:async()=>({})});
  const screen=await mount();assert.ok(input(screen,'Sign in'));assert.equal(text(screen).includes('First name'),false);
  assert.ok(text(screen).includes('Your session ended'));assert.equal(session,null);
  await act(async()=>screen.unmount());
});

test('failed sign out cannot revive private state from later auth notifications', async () => {
  resetAuth(alice); globalThis.fetch=async()=>({status:200,json:async()=>({profile:payload})});
  const screen=await mount(); logoutError={code:'network'};
  await act(async()=>{press(screen,'Sign out'); await flush()});
  await act(async()=>{authListener('SIGNED_IN',alice); await flush()});
  assert.equal(text(screen).includes('First name'),false); assert.ok(input(screen,'Sign in').props.disabled);
  const retry=screen.root.findAllByType('Pressable').find(x=>x.findByType('Text').children.join('')==='Retry sign out');
  logoutError=null;await act(async()=>{retry.props.onPress();await flush()});
  assert.equal(input(screen,'Sign in').props.disabled,false);assert.equal(session,null);
  await act(async()=>screen.unmount());
});
