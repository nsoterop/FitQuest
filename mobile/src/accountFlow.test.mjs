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
globalThis.__fitquestSecure = new Map();
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
    if (specifier === 'expo-secure-store') return { url: 'fitquest-test:secure', shortCircuit: true };
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
    if (url === 'fitquest-test:secure') return { format: 'module', source: `export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1;
      export async function getItemAsync(k){return globalThis.__fitquestSecure.get(k)??null}
      export async function setItemAsync(k,v){if(globalThis.__fitquestSecureFailure)throw Error('synthetic storage failure');globalThis.__fitquestSecure.set(k,v)}
      export async function deleteItemAsync(k){globalThis.__fitquestSecure.delete(k)}`, shortCircuit:true };
    if (url === 'fitquest-test:safe') return { format: 'module', source: "export const SafeAreaProvider='SafeAreaProvider', SafeAreaView='SafeAreaView'; export const useSafeAreaInsets=()=>({top:62,bottom:34,left:0,right:0});", shortCircuit: true };
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
const { OnboardingScreen } = await import('./OnboardingScreen.tsx');
const { privateDrafts } = await import('./onboardingDraftStorage.ts');
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

test('profile loading hides the form; failed save keeps fields and confirmed save opens the greeting', async () => {
  let deliver; globalThis.fetch = async () => new Promise(resolve => { deliver = resolve; });
  let screen;
  await act(async () => { screen = TestRenderer.create(React.createElement(ProfileIntakeForm, { accessToken: async () => 'alice-token' })); await flush(); });
  assert.ok(text(screen).includes('Loading your profile'));
  assert.equal(text(screen).includes('First name'), false);
  await act(async () => { deliver({ status: 200, json: async () => ({ profile: null }) }); await flush(); });
  await act(async () => { input(screen, 'First name').props.onChangeText(' Renée '); });
  for (const [label, value] of [['Last name', 'Example'], ['Height (feet)', '5'], ['Height (inches)', '8'], ['Age (years)', '29'], ['Weight (lb)', '155.5'], ['Gender', 'Prefer not to say']]) {
    await act(async () => { input(screen, label).props.onChangeText(value); });
  }
  globalThis.fetch = async () => ({ status: 503, json: async () => ({}) });
  await act(async () => { input(screen, 'Submit profile').props.onPress(); await flush(); });
  assert.equal(input(screen, 'First name').props.value, ' Renée '); assert.equal(text(screen).includes('Hi '), false);
  let finishSave;
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).firstName, 'Renée');
    return new Promise(resolve => { finishSave = resolve; });
  };
  await act(async () => { press(screen, 'Submit profile'); await flush(); });
  assert.equal(text(screen).includes('Hi '), false);
  await act(async () => { finishSave({ status: 200, json: async () => ({ message: 'User Data Saved' }) }); await flush(); });
  assert.equal(screen.root.findByProps({ accessibilityRole: 'header' }).children.join(''), 'Hi Renée');
  assert.equal(text(screen).includes('First name'), false);
  await act(async () => screen.unmount());
});

test('actual account screen clears profile on logout and rejects old response after Bob signs in', async () => {
  resetAuth(alice); const requests = [];
  globalThis.fetch = async (_url, options) => new Promise(resolve => requests.push({ resolve, token: options.headers.Authorization }));
  let screen;
  await act(async () => { screen = TestRenderer.create(React.createElement(AccountPanel)); await flush(); });
  assert.equal(requests[0].token, 'Bearer alice-token');
  assert.ok(text(screen).includes('Loading your profile'));
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
  assert.equal(screen.root.findByProps({ accessibilityRole: 'header' }).children.join(''), 'Hi Alex');
  assert.equal(text(screen).includes('First name'), false);
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

test('session refresh keeps the greeting; signing out clears it before another account opens its form', async () => {
  resetAuth(alice); let reads=0;
  globalThis.fetch=async()=>{reads++;return {status:200,json:async()=>({profile:payload})}};
  const screen=await mount();
  await act(async()=>{session={...alice,access_token:'refreshed-token'};authListener('TOKEN_REFRESHED',session);await flush()});
  assert.equal(screen.root.findByProps({ accessibilityRole: 'header' }).children.join(''), 'Hi Alex'); assert.equal(reads,1);
  await act(async()=>{press(screen,'Sign out');await flush()});
  assert.equal(text(screen).includes('Hi Alex'),false);
  globalThis.fetch=async()=>({status:200,json:async()=>({profile:null})});
  await credentials(screen);
  await act(async()=>{press(screen,'Sign in');await flush()});
  assert.equal(input(screen,'First name').props.value,'');
  assert.equal(text(screen).includes('Hi Alex'),false);
  await act(async()=>screen.unmount());
});

test('backend session rejection clears the form and returns to sign in', async () => {
  resetAuth(alice); globalThis.fetch=async()=>({status:401,json:async()=>({})});
  const screen=await mount();assert.ok(input(screen,'Sign in'));assert.equal(text(screen).includes('First name'),false);
  assert.ok(text(screen).includes('Your session ended'));assert.equal(session,null);
  await act(async()=>screen.unmount());
});

test('failed profile read cannot open the greeting or empty form; retry opens the saved greeting', async () => {
  resetAuth(alice); globalThis.fetch=async()=>({status:503,json:async()=>({})});
  const screen=await mount();
  assert.equal(text(screen).includes('Hi '),false); assert.equal(text(screen).includes('First name'),false);
  globalThis.fetch=async()=>({status:200,json:async()=>({profile:payload})});
  await act(async()=>{press(screen,'Retry profile loading');await flush()});
  assert.equal(screen.root.findByProps({ accessibilityRole: 'header' }).children.join(''), 'Hi Alex');
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

const onboardingFixture = () => ({ id:'aaaaaaaa-1111-4111-8111-111111111111',revision:0,state:'collecting',confirmedRevision:null,
  context:{items:[{id:'i1',topic:'Goal',value:'Coordination',origin:'user_report',review:'unreviewed',source:'m1',quote:'Coordination',supersedes:null,recordedAt:'2026-10-02T12:00:00Z'}],skipped:[],readiness:'needs_clarification',limitations:['Current activity unknown']},
  turns:[],profileChanged:false,generationEnabled:false,opening:'What would you like to improve?',disclosure:'Provisional retention details.',disclosureVersion:'onboarding-adults-v1'});
async function mountOnboarding(props={}) {
  let screen;await act(async()=>{screen=TestRenderer.create(React.createElement(OnboardingScreen,{userId:'alice',accessToken:async()=> 'alice-token',onClose(){},...props}));await flush()});
  await act(async()=>{press(screen,'Continue to onboarding');await flush()});return screen;
}
test('disclosure precedes a minimal conversation; structured context is never silently confirmed',async()=>{
  resetAuth(alice);let saved={...onboardingFixture(),generationEnabled:true};let commands=[];
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};
    if(url.endsWith('/commands'))commands.push(JSON.parse(options.body));
    return{status:200,json:async()=>saved};
  };
  const screen=await mount();await act(async()=>{press(screen,'Start onboarding')});
  assert.ok(text(screen).includes('adults 18+'));assert.ok(text(screen).includes('shared with OpenAI'));assert.ok(text(screen).includes('provider retention'));
  assert.equal(screen.root.findAllByProps({accessibilityLabel:'Onboarding message'}).length,0);
  await act(async()=>{press(screen,'Continue to onboarding');await flush()});
  assert.ok(text(screen).includes(saved.opening));
  for(const extra of ['Review understanding','Your understanding','Current activity unknown','Athlete report','Provisional retention','Refresh conversation','Skip this topic','Delete conversation','Back to greeting','Draft saved','Confirm this understanding'])assert.equal(text(screen).includes(extra),false,extra);
  assert.deepEqual(screen.root.findAllByType('Pressable').map(x=>x.props.accessibilityLabel).filter(x=>x!=='Sign out'),['Conversation options','Send']);
  assert.equal(commands.length,0);assert.equal(saved.state,'collecting');
  await act(async()=>screen.unmount());
});
test('lost response retains an encrypted operation; reopen replays the same ID rather than sending a new message',async()=>{
  globalThis.__fitquestSecure.clear();let saved=onboardingFixture();let sent=[];
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/commands')){const command=JSON.parse(options.body);sent.push(command);throw Error('synthetic lost response')}
    return{status:200,json:async()=>saved};
  };
  let screen=await mountOnboarding();await act(async()=>{input(screen,'Onboarding message').props.onChangeText('My schedule varies');await flush()});
  await act(async()=>{press(screen,'Send');press(screen,'Send');await flush()});assert.equal(sent.length,1);assert.ok(text(screen).includes('Try again'));
  assert.equal((await privateDrafts.read('alice')).pending.operationId,sent[0].operationId);assert.equal(await privateDrafts.read('bob'),null);
  await act(async()=>screen.unmount());
  screen=await mountOnboarding();assert.equal(input(screen,'Onboarding message').props.value,'My schedule varies');assert.equal(text(screen).includes('Recovered your secure device draft'),false);
  globalThis.fetch=async(_url,options)=>{const command=JSON.parse(options.body);sent.push(command);return{status:200,json:async()=>({...saved,revision:1,turns:[{id:'turn',sequence:1,message:command.text,reply:null,questionTopic:null,state:'failed',error:'ai_disabled'}]})}};
  await act(async()=>{press(screen,'Try again');await flush()});assert.equal(sent[1].operationId,sent[0].operationId);assert.equal(sent.length,2);assert.equal(await privateDrafts.read('alice'),null);assert.ok(text(screen).includes('AI replies are unavailable'));
  await act(async()=>screen.unmount());
});
test('corrections are ordinary messages; secure write failure prevents dispatch',async()=>{
  globalThis.__fitquestSecure.clear();let saved={...onboardingFixture(),generationEnabled:true};const commands=[];
  globalThis.fetch=async(url,options)=>{if(url.endsWith('/commands')){const c=JSON.parse(options.body);commands.push(c);saved={...saved,revision:saved.revision+1,turns:[{id:'t',sequence:1,message:c.text,reply:'What matters most?',questionTopic:'Goals',state:'completed',error:null}]}}return{status:200,json:async()=>saved}};
  const screen=await mountOnboarding();
  await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Actually, balance and coordination matter equally.');await flush()});
  await act(async()=>{press(screen,'Send');await flush()});
  assert.equal(commands[0].kind,'message');assert.equal(commands[0].text,'Actually, balance and coordination matter equally.');
  assert.ok(text(screen).includes('What matters most?'));assert.equal(text(screen).includes('Draft saved'),false);
  await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Private unsent draft');await flush()});
  globalThis.__fitquestSecureFailure=true;await act(async()=>{press(screen,'Send');await flush()});
  assert.equal(commands.length,1);assert.ok(text(screen).includes('Could not save your answer on this device'));assert.ok(input(screen,'Try again'));
  globalThis.__fitquestSecureFailure=false;await act(async()=>{press(screen,'Try again');await flush()});assert.equal(commands.length,2);assert.equal(commands[1].text,'Private unsent draft');
  await act(async()=>screen.unmount());
});
test('persisted replies and an unsent draft reopen quietly; navigation stays in the secondary menu',async()=>{
  globalThis.__fitquestSecure.clear();let closed=0;
  const saved={...onboardingFixture(),generationEnabled:true,turns:[{id:'t',sequence:1,message:'I enjoy tennis',reply:'What would you like to improve in tennis?',questionTopic:'Goals',state:'completed',error:null}]};
  const requests=[];globalThis.fetch=async(_url,options)=>{requests.push(options);return{status:200,json:async()=>saved}};
  let screen=await mountOnboarding();await act(async()=>{input(screen,'Onboarding message').props.onChangeText('My serve');await flush()});await act(async()=>screen.unmount());
  screen=await mountOnboarding({onClose(){closed++}});assert.ok(text(screen).includes(saved.turns[0].reply));assert.equal(input(screen,'Onboarding message').props.value,'My serve');
  assert.equal(text(screen).includes('Draft saved'),false);assert.equal(text(screen).includes('Try again'),false);assert.ok(requests.every(r=>!JSON.parse(r.body).kind));
  await act(async()=>{press(screen,'Conversation options')});assert.ok(input(screen,'Delete conversation'));await act(async()=>{press(screen,'Back to greeting')});assert.equal(closed,1);
  await act(async()=>screen.unmount());
});
test('failed and pending replies have only the needed recovery action and never retry automatically',async()=>{
  globalThis.__fitquestSecure.clear();let commands=[];let saved={...onboardingFixture(),generationEnabled:true,turns:[{id:'t',sequence:1,message:'Tennis',reply:null,questionTopic:null,state:'pending',error:null}]};
  globalThis.fetch=async(url,options)=>{
    if(options.method==='GET')saved={...saved,turns:[{...saved.turns[0],state:'failed',error:'provider_error'}]};
    if(url.endsWith('/commands')){commands.push(JSON.parse(options.body));saved={...saved,turns:[{...saved.turns[0],state:'completed',error:null,reply:'What would you like to improve?'}]}};
    return{status:200,json:async()=>saved};
  };
  const screen=await mountOnboarding();assert.ok(text(screen).includes('Thinking'));assert.ok(input(screen,'Check for reply'));assert.equal(input(screen,'Onboarding message').props.editable,false);
  assert.equal(commands.length,0);await act(async()=>{press(screen,'Check for reply');await flush()});assert.equal(commands.length,0);assert.ok(input(screen,'Retry reply'));assert.ok(text(screen).includes('Your answer is saved'));
  await act(async()=>{press(screen,'Retry reply');await flush()});assert.equal(commands.length,1);assert.equal(commands[0].kind,'retry');assert.equal(commands[0].turnId,'t');
  assert.equal(text(screen).includes('Retry reply'),false);assert.equal(text(screen).includes('Check for reply'),false);assert.equal(input(screen,'Onboarding message').props.editable,true);
  await act(async()=>screen.unmount());
});
test('sign out clears onboarding UI and encrypted draft; late response cannot populate the next account',async()=>{
  resetAuth(alice);globalThis.__fitquestSecure.clear();let complete;let saved=onboardingFixture();
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:options.headers.Authorization==='Bearer alice-token'?payload:null})};
    if(url.endsWith('/commands'))return new Promise(resolve=>{complete=resolve});return{status:200,json:async()=>saved};
  };
  const screen=await mount();await act(async()=>{press(screen,'Start onboarding')});await act(async()=>{press(screen,'Continue to onboarding');await flush()});
  await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Private Alice goal');await flush()});
  await act(async()=>{press(screen,'Send');await flush()});assert.ok(await privateDrafts.read('alice'));
  await act(async()=>{press(screen,'Sign out');await flush()});assert.equal(await privateDrafts.read('alice'),null);assert.equal(text(screen).includes('Private Alice'),false);
  await credentials(screen);await act(async()=>{press(screen,'Sign in');await flush()});
  await act(async()=>{complete({status:200,json:async()=>({...saved,turns:[{id:'t',sequence:1,message:'Private Alice goal',reply:'Private reply',questionTopic:null,state:'completed',error:null}]})});await flush()});
  assert.equal(text(screen).includes('Private Alice'),false);assert.equal(text(screen).includes('Private reply'),false);assert.equal(input(screen,'First name').props.value,'');
  await act(async()=>screen.unmount());
});
test('onboarding session rejection returns to sign in; explicit deletion removes local draft and leaves profile flow',async()=>{
  resetAuth(alice);globalThis.fetch=async url=>url.endsWith('/profile')?{status:200,json:async()=>({profile:payload})}:{status:401,json:async()=>({})};
  let screen=await mount();await act(async()=>{press(screen,'Start onboarding')});await act(async()=>{press(screen,'Continue to onboarding');await flush()});assert.ok(input(screen,'Sign in'));await act(async()=>screen.unmount());
  globalThis.__fitquestSecure.clear();let closed=0;let saved=onboardingFixture();let late;
  globalThis.fetch=async(url,options)=>url.endsWith('/commands')?new Promise(resolve=>{late=resolve}):({status:options.method==='DELETE'?204:200,json:async()=>saved});
  screen=await mountOnboarding({onClose(){closed++}});
  await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Unsent goal');await flush()});
  await act(async()=>{press(screen,'Send');await flush()});
  await act(async()=>{press(screen,'Conversation options')});
  await act(async()=>{press(screen,'Delete conversation')});
  assert.ok(text(screen).includes('Your profile and account remain'));
  await act(async()=>{press(screen,'Delete conversation permanently');await flush()});assert.equal(closed,1);assert.equal(await privateDrafts.read('alice'),null);
  await act(async()=>{late({status:200,json:async()=>saved});await flush()});assert.equal(text(screen).includes('Unsent goal'),false);
  await act(async()=>screen.unmount());
});

test('explicit context rejection preserves editable draft and permits a shorter conversational answer',async()=>{
  globalThis.__fitquestSecure.clear();let saved=onboardingFixture();let reject=true;const sent=[];
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/commands')){
      const command=JSON.parse(options.body);sent.push(command);
      if(reject)return{status:422,json:async()=>({code:'context_limit'})};
      saved={...saved,revision:saved.revision+1,...(command.kind==='confirm'?{state:'confirmed',confirmedRevision:command.reviewedRevision}:{})};
    }
    return{status:200,json:async()=>saved};
  };
  const screen=await mountOnboarding();
  await act(async()=>{input(screen,'Onboarding message').props.onChangeText('A detailed answer I may need to shorten');await flush()});
  await act(async()=>{press(screen,'Send');await flush()});
  assert.ok(text(screen).includes('This answer was not saved'));
  assert.equal(input(screen,'Onboarding message').props.value,'A detailed answer I may need to shorten');
  assert.equal(input(screen,'Onboarding message').props.editable,true);
  assert.equal((await privateDrafts.read('alice')).pending,null);
  assert.equal(text(screen).includes('Try again'),false);
  reject=false;
  await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Keep both goals.');await flush()});
  await act(async()=>{press(screen,'Send');await flush()});
  assert.notEqual(sent[0].operationId,sent[1].operationId);assert.equal(sent[1].expectedRevision,0);
  assert.ok(sent.every(c=>c.kind==='message'));assert.equal(saved.state,'collecting');
  await act(async()=>screen.unmount());
});

test('revision conflict reloads saved replies before resending the preserved answer',async()=>{
  globalThis.__fitquestSecure.clear();let saved={...onboardingFixture(),generationEnabled:true};const sent=[];let reject=true;
  globalThis.fetch=async(url,options)=>{
    if(options.method==='GET')saved={...saved,revision:2};
    if(url.endsWith('/commands')){sent.push(JSON.parse(options.body));if(reject)return{status:409,json:async()=>({code:'revision_conflict'})};saved={...saved,revision:3}}
    return{status:200,json:async()=>saved};
  };
  const screen=await mountOnboarding();await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Keep tennis first');await flush()});
  await act(async()=>{press(screen,'Send');await flush()});assert.equal((await privateDrafts.read('alice')).pending,null);assert.equal(input(screen,'Send').props.disabled,true);assert.ok(input(screen,'Check for reply'));
  await act(async()=>{press(screen,'Check for reply');await flush()});assert.equal(sent.length,1);assert.equal(input(screen,'Onboarding message').props.value,'Keep tennis first');
  reject=false;await act(async()=>{press(screen,'Send');await flush()});assert.equal(sent[1].expectedRevision,2);assert.notEqual(sent[0].operationId,sent[1].operationId);
  await act(async()=>screen.unmount());
});
