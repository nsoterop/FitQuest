import assert from 'node:assert/strict';
import test,{beforeEach} from 'node:test';
beforeEach(t=>t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-04T12:00:00Z')}));
import { registerHooks } from 'node:module';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
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
globalThis.__fitquestAppStateListeners = new Set();
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
  export const StyleSheet={create:x=>x}; export const Keyboard={dismiss(){},addListener(){return {remove(){}}}};
  export const AppState={currentState:'active',addEventListener:(_event,callback)=>{globalThis.__fitquestAppStateListeners.add(callback);return {remove(){globalThis.__fitquestAppStateListeners.delete(callback)}}}};
  export const Linking={addEventListener:(_name,callback)=>{globalThis.__fitquestLinkListener=callback;return {remove(){}}},getInitialURL:async()=>null};`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react-native') return { url: 'fitquest-test:native', shortCircuit: true };
    if (specifier === 'expo-status-bar') return { url: 'fitquest-test:status', shortCircuit: true };
    if (specifier === 'expo-secure-store') return { url: 'fitquest-test:secure', shortCircuit: true };
    if (specifier === 'react-native-safe-area-context') return { url: 'fitquest-test:safe', shortCircuit: true };
    if (specifier === './supabase' && context.parentURL?.endsWith('/AccountPanel.tsx')) return { url: 'fitquest-test:auth', shortCircuit: true };
    if(specifier.endsWith('.js')&&specifier.startsWith('.')&&context.parentURL?.includes('/backend/src/')){const url=new URL(specifier.replace(/\.js$/,'.ts'),context.parentURL);if(existsSync(fileURLToPath(url)))return next(url.href,context);}
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
    if (url.endsWith('.tsx')||url.includes('/backend/src/')&&url.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      fileName:fileURLToPath(url),
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { ProfileIntakeForm } = await import('./ProfileIntakeForm.tsx');
const { AccountPanel } = await import('./AccountPanel.tsx');
const { default: App } = await import('../App.tsx');
const { OnboardingScreen } = await import('./OnboardingScreen.tsx');
const { TrainingScreen } = await import('./TrainingScreen.tsx');
const { parsePlainOutline } = await import('../../backend/src/plainOutline.ts');
const { privateDrafts } = await import('./onboardingDraftStorage.ts');
const payload = { firstName: 'Alex', lastName: 'Example', height: { value: 68, unit: 'in' }, age: 29,
  weight: { value: 155.5, unit: 'lb' }, gender: 'Prefer not to say',
  ageCapturedAt: '2026-10-02T12:00:00Z', updatedAt: '2026-10-02T12:00:00Z' };
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
function input(screen, label) { return screen.root.findAllByProps({accessibilityLabel:label}).filter(n=>typeof n.type==='string').at(-1)??screen.root.findByProps({accessibilityLabel:label}); }
function text(screen) { return JSON.stringify(screen.toJSON()); }
const press = (screen, label) => input(screen, label).props.onPress();
async function signOutThroughAccount(screen){await act(async()=>press(screen,'Account'));await act(async()=>press(screen,'Sign out'));assert.ok(input(screen,'Stay signed in'));await act(async()=>{press(screen,'Confirm sign out');await flush()});}
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
  await signOutThroughAccount(screen);
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

test('app opens at sign in, offers a signup switch, with a single padded page shell and no developer connection label', async () => {
  resetAuth();
  globalThis.fetch = async () => ({status:200,json:async()=>({service:'fitquest-api',status:'ok'})});
  const screen = await mount(App);
  assert.ok(input(screen,'Sign in')); assert.ok(input(screen,'Switch to create account'));
  assert.equal(text(screen).includes('First name'),false);
  const words=screen.root.findAllByType('Text').map(x=>x.children.join('')).join('|');
  assert.equal(words.includes('Backend:'),false);assert.equal(screen.root.findAllByType('ScrollView').length,1);assert.equal(screen.root.findAllByType('KeyboardAvoidingView').length,1);
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
  assert.ok(text(screen).includes('Check your inbox')); assert.equal(screen.root.findAllByType('TextInput').length,0);
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
  globalThis.fetch=async url=>{if(url.endsWith('/training'))return {status:200,json:async()=>({summary:null,plans:[]})};reads++; return {status:200,json:async()=>({profile:payload})}};
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
  globalThis.fetch=async url=>{if(url.endsWith('/training'))return {status:200,json:async()=>({summary:null,plans:[]})};reads++;return {status:200,json:async()=>({profile:payload})}};
  const screen=await mount();
  await act(async()=>{session={...alice,access_token:'refreshed-token'};authListener('TOKEN_REFRESHED',session);await flush()});
  assert.equal(screen.root.findByProps({ accessibilityRole: 'header' }).children.join(''), 'Hi Alex'); assert.equal(reads,1);
  await signOutThroughAccount(screen);
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
  await signOutThroughAccount(screen);
  await act(async()=>{authListener('SIGNED_IN',alice); await flush()});
  assert.equal(text(screen).includes('First name'),false); assert.equal(screen.root.findAllByProps({accessibilityLabel:'Sign in'}).length,0);
  const retry=screen.root.findAllByType('Pressable').find(x=>x.findByType('Text').children.join('')==='Retry sign out');
  logoutError=null;await act(async()=>{retry.props.onPress();await flush()});
  assert.equal(input(screen,'Sign in').props.disabled,false);assert.equal(session,null);
  await act(async()=>screen.unmount());
});

const onboardingFixture = () => ({ id:'aaaaaaaa-1111-4111-8111-111111111111',revision:0,state:'collecting',confirmedRevision:null,
  context:{items:[{id:'i1',topic:'Goal',value:'Coordination',origin:'user_report',review:'unreviewed',source:'m1',quote:'Coordination',supersedes:null,recordedAt:'2026-10-02T12:00:00Z'}],skipped:[],readiness:'needs_clarification',limitations:['Current activity unknown']},
  turns:[],profileChanged:false,generationEnabled:false,opening:'What would you like to improve?',disclosure:'Provisional retention details.',disclosureVersion:'onboarding-planning-v2'});
async function mountOnboarding(props={}) {
  let screen;await act(async()=>{screen=TestRenderer.create(React.createElement(OnboardingScreen,{userId:'alice',accessToken:async()=> 'alice-token',onClose(){},...props}));await flush()});
  await act(async()=>{press(screen,'Continue to onboarding');await flush()});return screen;
}
test('disclosure precedes a minimal conversation; structured context is never silently confirmed',async()=>{
  resetAuth(alice);let saved={...onboardingFixture(),generationEnabled:true};let commands=[];
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/training'))return{status:200,json:async()=>({summary:null,plans:[]})};
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};
    if(url.endsWith('/commands'))commands.push(JSON.parse(options.body));
    return{status:200,json:async()=>saved};
  };
  const screen=await mount();await act(async()=>{press(screen,'Start onboarding')});
  assert.ok(text(screen).includes('adults 18+'));assert.ok(text(screen).includes('shared with OpenAI'));assert.ok(text(screen).includes('Provider retention'));
  assert.equal(screen.root.findAllByProps({accessibilityLabel:'Onboarding message'}).length,0);
  await act(async()=>{press(screen,'Continue to onboarding');await flush()});
  assert.ok(text(screen).includes(saved.opening));
  for(const extra of ['Review understanding','Your understanding','Current activity unknown','Athlete report','Provisional retention','Refresh conversation','Skip this topic','Delete conversation','Draft saved','Confirm this understanding'])assert.equal(text(screen).includes(extra),false,extra);
  assert.deepEqual(screen.root.findAllByType('Pressable').map(x=>x.props.accessibilityLabel).filter(x=>x!=='Sign out'),['Back to greeting','Account','Conversation options','Send']);
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
    if(url.endsWith('/training'))return{status:200,json:async()=>({summary:null,plans:[]})};
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:options.headers.Authorization==='Bearer alice-token'?payload:null})};
    if(url.endsWith('/commands'))return new Promise(resolve=>{complete=resolve});return{status:200,json:async()=>saved};
  };
  const screen=await mount();await act(async()=>{press(screen,'Start onboarding')});await act(async()=>{press(screen,'Continue to onboarding');await flush()});
  await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Private Alice goal');await flush()});
  await act(async()=>{press(screen,'Send');await flush()});assert.ok(await privateDrafts.read('alice'));
  await signOutThroughAccount(screen);assert.equal(await privateDrafts.read('alice'),null);assert.equal(text(screen).includes('Private Alice'),false);
  await credentials(screen);await act(async()=>{press(screen,'Sign in');await flush()});
  await act(async()=>{complete({status:200,json:async()=>({...saved,turns:[{id:'t',sequence:1,message:'Private Alice goal',reply:'Private reply',questionTopic:null,state:'completed',error:null}]})});await flush()});
  assert.equal(text(screen).includes('Private Alice'),false);assert.equal(text(screen).includes('Private reply'),false);assert.equal(input(screen,'First name').props.value,'');
  await act(async()=>screen.unmount());
});
test('onboarding session rejection returns to sign in; explicit deletion removes local draft and leaves profile flow',async()=>{
  resetAuth(alice);globalThis.fetch=async url=>url.endsWith('/profile')?{status:200,json:async()=>({profile:payload})}:url.endsWith('/training')?{status:200,json:async()=>({summary:null,plans:[]})}:{status:401,json:async()=>({})};
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

const deletionReceipt=id=>({id,deleted:true,message:'Onboarding finished. This conversation and its understanding have been deleted. Your profile is unchanged.'});
test('completion waits for the server, clears draft/transcript, returns to greeting and next start is fresh',async()=>{
  resetAuth(alice);globalThis.__fitquestSecure.clear();let saved={...onboardingFixture(),generationEnabled:true,turns:[{id:'t',sequence:1,message:'Private tennis report',reply:'Recap: tennis first. Reply Looks good to finish.',questionTopic:'Onboarding recap',state:'completed',error:null}]};
  let complete;let commands=0;
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/training'))return{status:200,json:async()=>({summary:null,plans:[]})};
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};
    if(url.endsWith('/commands')){commands++;return new Promise(resolve=>{complete=resolve})}
    return{status:200,json:async()=>saved};
  };
  const screen=await mount();await act(async()=>{press(screen,'Start onboarding')});await act(async()=>{press(screen,'Continue to onboarding');await flush()});
  const oldInput=input(screen,'Onboarding message').props.onChangeText;
  await act(async()=>{oldInput('Looks good');await flush()});await act(async()=>{press(screen,'Send');await flush()});
  assert.equal(text(screen).includes('Onboarding finished'),false);assert.ok(await privateDrafts.read('alice'));
  await act(async()=>{complete({status:200,json:async()=>deletionReceipt(saved.id)});await flush()});
  assert.ok(text(screen).includes('Hi '));assert.ok(text(screen).includes('Onboarding finished'));assert.equal(text(screen).includes('Private tennis report'),false);assert.equal(await privateDrafts.read('alice'),null);
  await act(async()=>{oldInput('late private draft');await flush()});assert.equal(await privateDrafts.read('alice'),null);
  saved={...onboardingFixture(),id:'bbbbbbbb-1111-4111-8111-111111111111'};
  await act(async()=>{press(screen,'Start onboarding')});await act(async()=>{press(screen,'Continue to onboarding');await flush()});
  assert.equal(input(screen,'Onboarding message').props.value,'');assert.equal(text(screen).includes('Private tennis report'),false);assert.equal(commands,1);
  await act(async()=>screen.unmount());
});
test('failed device cleanup hides deleted content and retries only local cleanup before closing',async()=>{
  globalThis.__fitquestSecure.clear();const saved=onboardingFixture();let closed=0,commands=0,fail=true;
  const drafts={...privateDrafts,clear:async(...args)=>{if(fail)throw Error('synthetic secure deletion failure');return privateDrafts.clear(...args)}};
  globalThis.fetch=async(url)=>{if(url.endsWith('/commands')){commands++;return{status:200,json:async()=>deletionReceipt(saved.id)}}return{status:200,json:async()=>saved}};
  const screen=await mountOnboarding({drafts,onClose(){closed++}});const late=input(screen,'Onboarding message').props.onChangeText;
  await act(async()=>{late('Looks good');await flush()});await act(async()=>{press(screen,'Send');await flush()});
  assert.equal(closed,0);assert.ok(input(screen,'Finish cleanup'));assert.equal(screen.root.findAllByProps({accessibilityLabel:'Onboarding message'}).length,0);
  await act(async()=>{late('Do not resurrect deleted draft');await flush()});assert.equal((await privateDrafts.read('alice')).text,'Looks good');
  fail=false;await act(async()=>{press(screen,'Finish cleanup');await flush()});assert.equal(closed,1);assert.equal(commands,1);assert.equal(await privateDrafts.read('alice'),null);
  await act(async()=>screen.unmount());
});
test('failed server deletion retains the pending operation; retry uses the same ID and a lost committed response recovers from not_found',async()=>{
  globalThis.__fitquestSecure.clear();const saved=onboardingFixture();const sent=[];let closed='';let step=0;
  globalThis.fetch=async(url,options)=>{
    if(!url.endsWith('/commands'))return{status:200,json:async()=>saved};
    sent.push(JSON.parse(options.body));step++;
    if(step===1)return{status:503,json:async()=>({code:'unavailable'})};
    if(step===2)throw Error('deletion committed, response lost');
    return{status:404,json:async()=>({code:'not_found'})};
  };
  const screen=await mountOnboarding({onClose(message){closed=message}});
  await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Looks good');await flush()});await act(async()=>{press(screen,'Send');await flush()});
  assert.equal(closed,'');assert.ok(input(screen,'Try again'));
  await act(async()=>{press(screen,'Try again');await flush()});assert.equal(closed,'');
  await act(async()=>{press(screen,'Try again');await flush()});assert.equal(closed,'This conversation is no longer stored.');assert.equal(await privateDrafts.read('alice'),null);
  assert.ok(sent.every(x=>x.operationId===sent[0].operationId&&x.kind==='message'));
  await act(async()=>screen.unmount());
});
test('reopen after completion cleanup discards an old pending draft and does not replay it against a fresh conversation',async()=>{
  globalThis.__fitquestSecure.clear();const old=onboardingFixture();const next={...old,id:'bbbbbbbb-1111-4111-8111-111111111111'};
  await privateDrafts.write('alice',{conversationId:old.id,text:'Looks good',pending:{operationId:'old',expectedRevision:4,kind:'message',text:'Looks good'},savedAt:Date.now()});
  let commands=0;globalThis.fetch=async(url)=>{if(url.endsWith('/commands'))commands++;return{status:200,json:async()=>next}};
  const screen=await mountOnboarding();assert.equal(input(screen,'Onboarding message').props.value,'');assert.equal(text(screen).includes('Try again'),false);assert.equal(await privateDrafts.read('alice'),null);assert.equal(commands,0);
  await act(async()=>screen.unmount());
});
test('a completion receipt arriving after account switch cannot close or populate the next account',async()=>{
  resetAuth(alice);globalThis.__fitquestSecure.clear();const saved=onboardingFixture();let complete;
  globalThis.fetch=async(url)=>{if(url.endsWith('/training'))return{status:200,json:async()=>({summary:null,plans:[]})};
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};if(url.endsWith('/commands'))return new Promise(resolve=>{complete=resolve});return{status:200,json:async()=>saved}};
  const screen=await mount();await act(async()=>{press(screen,'Start onboarding')});await act(async()=>{press(screen,'Continue to onboarding');await flush()});
  await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Looks good');await flush()});await act(async()=>{press(screen,'Send');await flush()});
  await signOutThroughAccount(screen);await credentials(screen);await act(async()=>{press(screen,'Sign in');await flush()});
  await act(async()=>{complete({status:200,json:async()=>deletionReceipt(saved.id)});await flush()});assert.equal(text(screen).includes('Onboarding finished'),false);assert.equal(await privateDrafts.read('alice'),null);
  await act(async()=>screen.unmount());
});

const trainingState=()=>({summary:{revision:1,timeZone:'America/New_York',document:['goals','availability','equipment','experience','limitations'].map(category=>({category,text:`Synthetic ${category}`,origin:category==='limitations'?'unknown':'user_report'}))},plans:[{id:'cccccccc-1111-4111-8111-111111111111',summaryRevision:1,timeZone:'America/New_York',dates:Array.from({length:7},(_,i)=>`2026-10-${String(4+i).padStart(2,'0')}`),catalogVersion:'fitquest-2026-10-03-v1',outline:null,days:[],jobs:[]}]});
function trainingServer(initial=trainingState()) {
  let saved=initial;const requests=[];
  globalThis.fetch=async(url,options)=>{
    requests.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});
    if(url.endsWith('/training/summary')){const b=JSON.parse(options.body);saved={...saved,summary:{revision:saved.summary.revision+1,timeZone:b.timeZone,document:b.document}}}
    if(url.endsWith('/training/generate')){const b=JSON.parse(options.body);const p=saved.plans[0];
      if(b.target==='week'){p.outline??={days:p.dates.map(date=>({date,sessions:[]})),coverage:[]};p.jobs=[{target:'week',status:'completed',error:null,attemptId:'week-attempt'}];for(const date of p.dates)if(!p.days.some(d=>d.date===date))p.days.push({date,detail:{date,coverage:[],sessions:[],activities:{},catalogVersion:p.catalogVersion}})}
      else p.days.push({date:b.target,detail:{date:b.target,coverage:[],sessions:[],activities:{},catalogVersion:p.catalogVersion}});
    }
    return {status:200,json:async()=>structuredClone(saved)};
  };
  return {requests,get saved(){return saved}};
}
async function mountTraining(extra={}){let screen;await act(async()=>{screen=TestRenderer.create(React.createElement(TrainingScreen,{initialTab:'week',userId:'alice',accessToken:async()=>'alice-token',onClose(){},...extra}));await flush()});return screen}

async function choosePlan(screen,twice=false){await act(async()=>{press(screen,'Use this plan');if(twice)press(screen,'Use this plan');await flush()});if(screen.root.findAllByProps({accessibilityLabel:'Week'}).length)await act(async()=>press(screen,'Week'));}
const hasTrainingAccess=screen=>screen.root.findAllByType('Pressable').some(n=>n.props.accessibilityRole==='tab'&&n.props.accessibilityLabel==='Nutrition');
function renderedTrainingText(screen){const visit=node=>typeof node==='string'?node:Array.isArray(node)?node.map(visit).join(''):node?(node.children??[]).map(visit).join('')+(node.type==='Text'?'\n':''):'';return visit(screen.toJSON())}
function overviewUiState(){
  const s=reviewUiState(),p=s.plans[0];p.outlineFirst=true;p.confirmedOutlineRevision=null;
  p.outline.days[0].sessions[0]={focus:'Easy walking',activityIds:[],timing:'morning',estimatedMinutes:12};p.days=[];p.jobs=[{target:'outline',status:'completed',error:null,attemptId:'outline-attempt'}];return s;
}
test('outline-first renders no exercises until explicit confirmation; two generation calls and free completed reopen',async()=>{
 const saved=overviewUiState(),p=saved.plans[0],ready=structuredClone(p.outline),requests=[];p.outline=null;p.planRevision=0;p.jobs=[];
 globalThis.fetch=async(url,options)=>{
  const body=options.body?JSON.parse(options.body):null;requests.push({url,body});
  if(url.endsWith('/generate')){
   if(body.target==='outline'){p.outline=ready;p.planRevision=1;p.jobs=[{target:'outline',status:'completed',error:null,attemptId:'outline-attempt'}]}
   else {assert.equal(body.target,'week');assert.equal(body.confirmOutline,true);assert.equal(body.planRevision,1);p.days=reviewUiState().plans[0].days;p.reviewState='accepted';p.confirmedOutlineRevision=1;p.jobs.push({target:'details:1',status:'completed',error:null,attemptId:'detail-attempt'})}
  }
  return{status:200,json:async()=>structuredClone(saved)};
 };
 let screen=await mountTraining({generateOnOpen:true});assert.equal(requests.filter(r=>r.url.endsWith('/generate')).length,1);
 assert.match(renderedTrainingText(screen),/Your training/);assert.match(renderedTrainingText(screen),/Easy walking[\s\S]*Morning[\s\S]*About 12 min/);assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking —|Complete weekly plan/);
 const rendered={overview:screen.toJSON(),overviewText:renderedTrainingText(screen)};
 await act(async()=>{press(screen,'Create workouts from this older outline');press(screen,'Create workouts from this older outline');await flush()});if(hasTrainingAccess(screen))await act(async()=>press(screen,'Week'));
 assert.equal(requests.filter(r=>r.url.endsWith('/generate')).length,2);assert.match(renderedTrainingText(screen),/Outdoor walking — 10 min/);assert.doesNotMatch(renderedTrainingText(screen),/Use this plan/);
 rendered.details=screen.toJSON();rendered.detailsText=renderedTrainingText(screen);if(process.env.FITQUEST_RENDER_CAPTURE)writeFileSync(process.env.FITQUEST_RENDER_CAPTURE,JSON.stringify(rendered,null,2));
 await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(requests.filter(r=>r.url.endsWith('/generate')).length,2);assert.match(renderedTrainingText(screen),/Outdoor walking — 10 min/);await act(async()=>screen.unmount());
});
test('outline feedback is reviewed before confirmation and cannot silently create workout details',async()=>{
 const saved=overviewUiState(),p=saved.plans[0],requests=[];
 globalThis.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):null;requests.push({url,body});if(url.endsWith('/review')){p.planRevision=2;p.outline.days[0].sessions[0].estimatedMinutes=10;p.reviewNote='The first session is shorter.'}return{status:200,json:async()=>structuredClone(saved)}};
 const screen=await mountTraining();await act(async()=>input(screen,'Plan feedback').props.onChangeText('Make the first day shorter.'));
 assert.equal(input(screen,'Create workouts from this older outline').props.disabled,true);await act(async()=>{press(screen,'Update this week');await flush()});
 assert.match(renderedTrainingText(screen),/About 10 min/);assert.equal(input(screen,'Create workouts from this older outline').props.disabled,false);assert.equal(requests.filter(r=>r.url.endsWith('/generate')).length,0);assert.equal(p.days.length,0);await act(async()=>screen.unmount());
});
test('failed or pending workout creation resumes the outline, with explicit retry and no automatic dispatch',async()=>{
 for(const status of ['failed','pending']){
  const saved=overviewUiState(),p=saved.plans[0];p.confirmedOutlineRevision=1;p.jobs.push({target:'details:1',status,error:status==='failed'?'outline_conflict':null,attemptId:'detail-failed'});p.reviewNote='The catalog cannot support this equipment requirement.';
  const server=trainingServer(saved),screen=await mountTraining({generateOnOpen:true});assert.equal(server.requests.length,1);assert.match(renderedTrainingText(screen),/About 12 min/);assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking —/);
  if(status==='failed'){assert.match(renderedTrainingText(screen),/equipment requirement/);await act(async()=>{press(screen,'Retry creating workouts');await flush()});if(hasTrainingAccess(screen))await act(async()=>press(screen,'Week'));const sent=server.requests.find(r=>r.url.endsWith('/generate'));assert.equal(sent.body.retryAttempt,'detail-failed');assert.equal(sent.body.confirmOutline,true)}
  else assert.equal(input(screen,'Create workouts from this older outline').props.disabled,true);
  await act(async()=>screen.unmount());
 }
});
function reviewUiState(){
  const s=trainingState(),p=s.plans[0];p.reviewState='draft';p.planRevision=1;p.reviewNote=null;p.reviewQuestion=null;
  p.outline={days:p.dates.map((date,i)=>({date,sessions:i===0?[{focus:'Easy walking',activityIds:['FQ-ACT-00148']}]:[]})),coverage:[]};
  p.days=p.dates.map((date,i)=>({date,detail:{date,coverage:[],catalogVersion:p.catalogVersion,activities:i===0?{'FQ-ACT-00148':{name:'Outdoor walking',instructions:'Synthetic hidden instructions'}}:{},sessions:i===0?[{timing:'morning',estimatedMinutes:12,intervals:[],activities:[{id:'FQ-ACT-00148',phase:'main',sets:1,measure:'seconds',amount:600,effort:'easy',restSeconds:0,load:'none',loadKg:null,side:'both'}]}]:[]}}));
  p.jobs=[{target:'week',status:'completed',error:null,attemptId:'initial-week'}];return s;
}
test('draft overview renders actual saved dates, timing, focus and approximate minutes with one feedback box; acceptance reveals minimal details',async()=>{
  const saved=reviewUiState(),requests=[];
  globalThis.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):null;requests.push({url,body,method:options.method});if(url.endsWith('/accept'))saved.plans[0].reviewState='accepted';return{status:200,json:async()=>structuredClone(saved)}};
  let screen=await mountTraining();let visible=text(screen);assert.match(visible,/Your training/);assert.match(visible,/Morning/);assert.match(visible,/Easy walking/);assert.match(visible,/About /);assert.match(visible,/12/);assert.doesNotMatch(visible,/Outdoor walking —|Synthetic hidden instructions/);
  for(const date of saved.plans[0].dates)assert.ok(visible.includes(date));
  assert.equal(screen.root.findAllByType('TextInput').length,1);assert.equal(typeof input(screen,'Plan feedback').props.onFocus,'function');assert.equal(input(screen,'Use this plan').props.disabled,false);
  await choosePlan(screen);assert.match(text(screen),/Your training/);assert.match(text(screen),/Outdoor walking — 10 min \(easy\)/);assert.doesNotMatch(text(screen),/hidden instructions/);
  assert.deepEqual(requests.find(r=>r.url.endsWith('/accept')).body,{planId:saved.plans[0].id,summaryRevision:1,planRevision:1});
  await act(async()=>screen.unmount());screen=await mountTraining();assert.match(text(screen),/Your training/);assert.equal(requests.filter(r=>r.url.endsWith('/review')||r.url.endsWith('/generate')).length,0);assert.equal(requests.filter(r=>r.method==='POST').length,1);await act(async()=>screen.unmount());
});
test('yes-but feedback cannot accept a plan and updated overview uses the returned saved session changes',async()=>{
  const saved=reviewUiState(),p=saved.plans[0],requests=[];
  globalThis.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):null;requests.push({url,body});if(url.endsWith('/review')){
    p.days[0].detail.sessions[0].activities[0].amount=300;p.days[0].detail.sessions[0].estimatedMinutes=7;
    p.days[0].detail.sessions.push({...structuredClone(p.days[0].detail.sessions[0]),timing:'evening',estimatedMinutes:8});p.outline.days[0].sessions.push({focus:'Easy walking',activityIds:['FQ-ACT-00148']});p.planRevision=2;p.reviewNote='The first day now has two shorter walking sessions.';
  }return{status:200,json:async()=>structuredClone(saved)}};
  const screen=await mountTraining();await act(async()=>input(screen,'Plan feedback').props.onChangeText('Yes, but split the first day into shorter sessions.'));
  assert.equal(input(screen,'Use this plan').props.disabled,true);await act(async()=>{press(screen,'Update this week');await flush()});
  assert.equal(requests.filter(r=>r.url.endsWith('/accept')).length,0);assert.equal(requests.find(r=>r.url.endsWith('/review')).body.feedback,'Yes, but split the first day into shorter sessions.');
  assert.equal(input(screen,'Plan feedback').props.value,'');assert.match(text(screen),/Evening/);assert.match(text(screen),/two shorter walking/);assert.equal(input(screen,'Use this plan').props.disabled,false);await act(async()=>screen.unmount());
});
test('failed and pending review resume from the server, preserve the old draft and require explicit retry',async()=>{
  for(const status of ['failed','pending']){
    const saved=reviewUiState(),p=saved.plans[0],feedback='Keep the first day; adjust the second.';p.jobs.push({target:'review:1',status,error:status==='failed'?'provider_error':null,attemptId:'review-attempt',feedback});
    const server=trainingServer(saved),screen=await mountTraining();assert.equal(server.requests.length,1);assert.equal(input(screen,'Plan feedback').props.value,feedback);assert.match(text(screen),/Your training/);assert.equal(input(screen,'Use this plan').props.disabled,true);
    if(status==='failed'){await act(async()=>{press(screen,'Retry changes');await flush()});const request=server.requests.find(r=>r.url.endsWith('/review'));assert.equal(request.body.retryAttempt,'review-attempt');assert.equal(request.body.planRevision,1)}
    else{assert.equal(input(screen,'Plan feedback').props.editable,false);assert.equal(input(screen,'Update this week').props.disabled,true);assert.match(text(screen),/Generation in progress/)}
    assert.equal(server.requests.filter(r=>r.url.endsWith('/generate')).length,0);await act(async()=>screen.unmount());
  }
});
test('conflict question appears once beside feedback without discarding saved overview or enabling stale acceptance',async()=>{
  const saved=reviewUiState(),p=saved.plans[0];p.planRevision=2;p.reviewQuestion='Should the first day stay unchanged or may it change?';p.reviewNote='Your earlier draft is unchanged.';trainingServer(saved);
  const screen=await mountTraining();assert.equal(text(screen).split(p.reviewQuestion).length-1,1);assert.match(text(screen),/Easy walking/);assert.equal(input(screen,'Use this plan').props.disabled,true);assert.equal(input(screen,'Plan feedback').props.value,'');await act(async()=>screen.unmount());
});
test('review reply cannot cross an account switch, and a session-ended response calls the existing session handler',async()=>{
  const saved=reviewUiState();let deliver,signal,ended=0;
  globalThis.fetch=async(url,options)=>{if(url.endsWith('/review')){signal=options.signal;return new Promise(resolve=>deliver=resolve)}return{status:200,json:async()=>options.headers.Authorization==='Bearer bob-token'?{summary:null,plans:[]}:saved}};
  const screen=await mountTraining();await act(async()=>input(screen,'Plan feedback').props.onChangeText('Two shorter sessions please.'));await act(async()=>{press(screen,'Update this week');await flush()});
  await act(async()=>{screen.update(React.createElement(TrainingScreen,{initialTab:'week',userId:'bob',accessToken:async()=>'bob-token',onClose(){}}));await flush()});assert.equal(signal.aborted,true);assert.doesNotMatch(text(screen),/Easy walking/);
  await act(async()=>{deliver({status:200,json:async()=>saved});await flush()});assert.doesNotMatch(text(screen),/Easy walking|Two shorter/);await act(async()=>screen.unmount());
  globalThis.fetch=async(url)=>url.endsWith('/review')?{status:401,json:async()=>({})}:{status:200,json:async()=>saved};
  const signedOut=await mountTraining({onSessionEnded(){ended++}});await act(async()=>input(signedOut,'Plan feedback').props.onChangeText('Shorter sessions please.'));await act(async()=>{press(signedOut,'Update this week');await flush()});assert.equal(ended,1);await act(async()=>signedOut.unmount());
});
test('old plans remain readable without acceptance claims, forced regeneration or review controls',async()=>{
  const saved=reviewUiState();saved.plans[0].reviewState='legacy';saved.plans[0].planRevision=0;const server=trainingServer(saved),screen=await mountTraining();
  assert.match(text(screen),/acceptance was not recorded/);assert.match(text(screen),/Outdoor walking —/);assert.equal(screen.root.findAllByProps({accessibilityLabel:'Use this plan'}).length,0);assert.equal(server.requests.length,1);await act(async()=>screen.unmount());
});
test('reload after a lost review response clears only the submitted feedback and does not charge for another revision',async()=>{
  const saved=reviewUiState(),p=saved.plans[0],requests=[];let lost=true;
  globalThis.fetch=async(url,options)=>{requests.push({url,method:options.method});if(url.endsWith('/review')&&lost){lost=false;p.planRevision=2;p.reviewNote='The requested change is saved.';throw Error('Synthetic lost response after commit')}return{status:200,json:async()=>structuredClone(saved)}};
  const screen=await mountTraining();await act(async()=>input(screen,'Plan feedback').props.onChangeText('Make the walk shorter.'));await act(async()=>{press(screen,'Update this week');await flush()});
  assert.equal(input(screen,'Plan feedback').props.value,'Make the walk shorter.');await act(async()=>{press(screen,screen.root.findAllByProps({accessibilityLabel:'Check status'}).length?'Check status':'Reload saved training');await flush()});
  assert.equal(input(screen,'Plan feedback').props.value,'');assert.equal(input(screen,'Use this plan').props.disabled,false);assert.equal(requests.filter(r=>r.method==='POST').length,1);await act(async()=>screen.unmount());
});
test('greeting hides training during the authoritative check, after failure and for an unfinished account',async()=>{
  resetAuth(alice);let deliver;const requests=[];
  globalThis.fetch=async(url,options)=>{requests.push({url,method:options.method??'GET'});if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};return new Promise(resolve=>{deliver=resolve})};
  const screen=await mount();assert.equal(screen.root.findAllByProps({accessibilityLabel:'Start onboarding'}).length,0);assert.equal(hasTrainingAccess(screen),false);
  await act(async()=>{deliver({status:503,json:async()=>({})});await flush()});assert.equal(hasTrainingAccess(screen),false);
  await act(async()=>{press(screen,'Retry loading saved progress');await flush()});assert.equal(hasTrainingAccess(screen),false);
  await act(async()=>{deliver({status:200,json:async()=>({summary:null,plans:[]})});await flush()});assert.equal(hasTrainingAccess(screen),false);
  assert.ok(requests.every(r=>r.method==='GET'));assert.equal(requests.filter(r=>r.url.endsWith('/training')).length,2);
  await act(async()=>screen.unmount());
});
test('a newly saved profile and an unconfirmed recap do not grant training access',async()=>{
  resetAuth(alice);let profile=null;const chat=onboardingFixture();chat.context.readiness='ready';chat.turns=[{id:'recap',sequence:1,message:'Here are my goals and context.',reply:'Your recap. Does that capture what matters?',questionTopic:'Onboarding recap',state:'completed',error:null}];let reads=0;
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/profile-intake')){profile=payload;return{status:200,json:async()=>({message:'User Data Saved'})}}
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile})};
    if(url.endsWith('/training')){reads++;return{status:200,json:async()=>({summary:null,plans:[]})}}
    return{status:200,json:async()=>chat};
  };
  const screen=await mount();
  for(const [label,value] of [['First name','Alex'],['Last name','Example'],['Height (feet)','5'],['Height (inches)','8'],['Age (years)','29'],['Weight (lb)','155'],['Gender','Prefer not to say']])await act(async()=>input(screen,label).props.onChangeText(value));
  await act(async()=>{press(screen,'Submit profile');await flush()});assert.equal(hasTrainingAccess(screen),false);assert.equal(reads,1);
  await act(async()=>press(screen,'Start onboarding'));await act(async()=>{press(screen,'Continue to onboarding');await flush()});
  assert.equal(hasTrainingAccess(screen),false);await act(async()=>press(screen,'Conversation options'));await act(async()=>{press(screen,'Back to greeting');await flush()});
  assert.equal(hasTrainingAccess(screen),false);assert.equal(reads,2);await act(async()=>screen.unmount());
});



test('completion status 401 ends the session without exposing training',async()=>{
  resetAuth(alice);globalThis.fetch=async url=>({status:url.endsWith('/profile')?200:401,json:async()=>({profile:payload})});
  const screen=await mount();assert.equal(hasTrainingAccess(screen),false);assert.ok(input(screen,'Sign in'));await act(async()=>screen.unmount());
});

test('completion opens planning only after committed summary receipt and local draft cleanup, then requests the entire week once',async()=>{
  resetAuth(alice);globalThis.__fitquestSecure.clear();const mock=trainingServer();const trainingFetch=globalThis.fetch;
  const saved={...onboardingFixture(),generationEnabled:true};let completed=false;
  globalThis.fetch=async(url,options)=>{
    if(url.includes('/training')){if(!completed)return{status:200,json:async()=>({summary:null,plans:[]})};assert.equal(await privateDrafts.read('alice'),null);return trainingFetch(url,options)}
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};
    if(url.endsWith('/commands')){completed=true;return{status:200,json:async()=>({...deletionReceipt(saved.id),summarySaved:true})}};
    return{status:200,json:async()=>saved};
  };
  const screen=await mount();await act(async()=>press(screen,'Start onboarding'));await act(async()=>{press(screen,'Continue to onboarding');await flush()});
  await act(async()=>input(screen,'Onboarding message').props.onChangeText('Looks good'));
  await act(async()=>{press(screen,'Send');await flush()});
  assert.ok(text(screen).includes('Your training'));assert.equal(text(screen).includes('Private tennis report'),false);
  assert.deepEqual(mock.requests.filter(r=>r.url.endsWith('/generate')).map(r=>r.body.target),['week']);
  assert.equal(mock.saved.plans[0].days.length,7);assert.equal(screen.root.findAllByType('Text').filter(n=>n.children.join('')==='Rest — no prescribed session.').length,7);assert.doesNotMatch(text(screen),/Generate 2026|Details not generated|Week incomplete/);await act(async()=>screen.unmount());
});

test('training reopen only reads saved records, one explicit action completes a partial week and edits preserve it',async()=>{
  const initial=trainingState(),p=initial.plans[0];p.outline={days:p.dates.map(date=>({date,sessions:[]})),coverage:[]};
  const server=trainingServer(initial),screen=await mountTraining();assert.equal(server.requests.length,1);assert.equal(server.requests[0].method,'GET');assert.match(text(screen),/Your training/);assert.doesNotMatch(text(screen),/Generate 2026/);
  await act(async()=>{press(screen,'Complete weekly plan');await flush()});assert.equal(server.requests.filter(r=>r.method==='POST').length,1);
  assert.equal(screen.root.findAllByProps({accessibilityLabel:'Training summary'}).length,0);assert.equal(server.saved.plans[0].days.length,7);assert.equal(server.requests.filter(r=>r.url.endsWith('/generate')).length,1);
  await act(async()=>screen.unmount());const reopened=await mountTraining();assert.ok(text(reopened).includes('2026-10-05'));assert.equal(server.requests.filter(r=>r.url.endsWith('/generate')).length,1);await act(async()=>reopened.unmount());
});

test('failed training generation has explicit retry and summary remains; an unmounted late response cannot revive private state',async()=>{
  const initial=trainingState();initial.plans[0].jobs=[{target:'week',status:'failed',error:'provider_error',attemptId:'failed-attempt'}];
  const server=trainingServer(initial),screen=await mountTraining();assert.equal(server.requests.length,1);assert.ok(text(screen).includes('Synthetic')===false);
  await act(async()=>{press(screen,'Retry weekly plan');await flush()});assert.equal(server.requests.find(r=>r.url.endsWith('/generate')).body.retryAttempt,'failed-attempt');
  await act(async()=>screen.unmount());
  let deliver,closed=0;globalThis.fetch=async()=>new Promise(resolve=>deliver=resolve);
  const late=await mountTraining({onClose(){closed++}});await act(async()=>late.unmount());await act(async()=>{deliver({status:200,json:async()=>initial});await flush()});assert.equal(closed,0);
});

test('saved training reopen clears a completed conversation draft but preserves a newer unfinished draft',async()=>{
  globalThis.__fitquestSecure.clear();const initial=trainingState();initial.summary.sourceConversation='completed-old';
  await privateDrafts.write('alice',{conversationId:'completed-old',text:'old private draft',pending:null,savedAt:Date.now()});
  trainingServer(initial);const screen=await mountTraining();assert.equal(await privateDrafts.read('alice'),null);await act(async()=>screen.unmount());
  await privateDrafts.write('alice',{conversationId:'new-unfinished',text:'keep this draft',pending:null,savedAt:Date.now()});
  trainingServer(initial);const again=await mountTraining();assert.equal((await privateDrafts.read('alice')).text,'keep this draft');await act(async()=>again.unmount());
});

test('legacy exercise rows retain exact quantities and rest without inferring intervals',async()=>{
  const saved=trainingState(),p=saved.plans[0];
  const labels=['Upper body','Lower body','Mobility','Easy cardio','Tennis practice'];
  p.outline={coverage:[],days:p.dates.map((date,i)=>({date,sessions:i<5?[{focus:labels[i],activityIds:i===0?['FQ-ACT-00008','FQ-ACT-00148','FQ-ACT-00112','FQ-ACT-00084']:['FQ-ACT-00148']}]:[]}))};
  const catalog=JSON.parse(readFileSync(new URL('../../backend/catalog/fitquest-v1.json',import.meta.url),'utf8'));
  const activities=Object.fromEntries(['FQ-ACT-00008','FQ-ACT-00148','FQ-ACT-00112','FQ-ACT-00084'].map(id=>{const a=catalog.activities.find(a=>a['Activity ID']===id);return [id,{name:a['Exercise name'],instructions:a['Instructions'],loadConvention:a['Load convention'],setup:a['Setup to record']}]}));
  const prescription={phase:'main',sets:3,measure:'repetitions',amount:8,effort:'moderate',restSeconds:60,load:'kg',loadKg:9.0718474,side:'each'};
  p.days=[{date:p.dates[0],detail:{date:p.dates[0],catalogVersion:p.catalogVersion,coverage:[],activities,sessions:[{activities:[{...prescription,id:'FQ-ACT-00008'},{...prescription,id:'FQ-ACT-00148',sets:1,measure:'meters',amount:1609,load:'none',loadKg:null,side:'both'},{...prescription,id:'FQ-ACT-00112',sets:2,measure:'seconds',amount:30,load:'none',loadKg:null,side:'both'},{...prescription,id:'FQ-ACT-00148',sets:1,measure:'seconds',amount:1200,load:'none',loadKg:null,side:'both'},{...prescription,id:'FQ-ACT-00084',sets:1,measure:'count',amount:12,load:'none',loadKg:null,side:'each'}]}]}}];
  const mock=trainingServer(saved),screen=await mountTraining();
  const visible=screen.root.findAllByType('Text').map(n=>n.children.join('')).join('\n');
  const rows=screen.root.findAllByType('Text').map(n=>n.children.join('')).filter(x=>x.includes(' — ')&&!x.startsWith('Rest'));
  assert.deepEqual(rows,[`${activities['FQ-ACT-00008'].name} — 3 × 8 per side (moderate); 60 sec rest between sets`,`${activities['FQ-ACT-00148'].name} — 1609 m (moderate)`,`${activities['FQ-ACT-00112'].name} — 2 × 30 sec (moderate); 60 sec rest between sets`,`${activities['FQ-ACT-00148'].name} — 20 min (moderate)`,`${activities['FQ-ACT-00084'].name} — 12 counts per side (moderate)`]);
  for(const entry of Object.values(activities)){assert.equal(visible.includes(entry.instructions),false);assert.equal(visible.includes(entry.setup),false);assert.equal(visible.includes(entry.loadConvention),false)}
  assert.doesNotMatch(rows.join('\n'),/main|warmup|cooldown|effort|Setup|review|reference|20 lb/);
  assert.doesNotMatch(visible,/1609 meters|9\.0718474 kg/);
  for(const [i,weekday] of ['Sunday','Monday','Tuesday','Wednesday','Thursday'].entries()){assert.ok(visible.includes(`${weekday}, ${p.dates[i]}`));assert.ok(visible.includes(labels[i]));}
  assert.ok(visible.includes('Friday, 2026-10-09'));assert.ok(visible.includes('Rest — no planned session.'));assert.equal(mock.requests.length,1);
  await act(async()=>screen.unmount());
});

test('oversized unpublished outline shows accurate recovery and retries only on an explicit press',async()=>{
  const saved=trainingState();saved.plans[0].jobs=[{target:'week',status:'failed',error:'planning_context_limit',attemptId:'oversized-attempt'}];
  const mock=trainingServer(saved),screen=await mountTraining();
  const visible=screen.root.findAllByType('Text').map(n=>n.children.join('')).join('\n');
  assert.match(visible,/request exceeds the generation limit/);assert.doesNotMatch(visible,/Shorten your training summary/);
  assert.equal(mock.requests.length,1);assert.ok(input(screen,'Retry weekly plan'));
  await act(async()=>{press(screen,'Retry weekly plan');await flush()});
  const requests=mock.requests.filter(r=>r.url.endsWith('/generate'));
  assert.equal(requests[0].body.retryAttempt,'oversized-attempt');assert.deepEqual(requests.map(r=>r.body.target),['week']);
  await act(async()=>screen.unmount());
});

test('new and legacy clarification blocks render one action, never seven coverage-limited workouts or automatic paid requests',async()=>{
  for(const legacy of [false,true]){
    const saved=trainingState(),p=saved.plans[0];p.outline={days:p.dates.map(date=>({date,sessions:[]})),coverage:legacy?['limitations_need_clarification']:[],...(legacy?{}:{clarification:{question:'Does the shoulder discomfort occur only when serving overhead?',reason:'This determines which movements to avoid.'}})};
    let selected;const server=trainingServer(saved),screen=await mountTraining({onClarify:request=>{selected=request}});
    assert.doesNotMatch(text(screen),/Coverage limited|Rest —|Correct the summary|7 days/);assert.ok(input(screen,'Continue clarification'));assert.equal(server.requests.length,1);
    if(!legacy)assert.match(text(screen),/Does the shoulder/);
    await act(async()=>press(screen,'Continue clarification'));assert.deepEqual(selected,{planId:p.id,summaryRevision:1,target:'outline'});assert.equal(server.requests.length,1);
    await act(async()=>screen.unmount());
  }
  const saved=trainingState(),p=saved.plans[0];p.outline={days:p.dates.map(date=>({date,sessions:[]})),coverage:['missing_catalog_coverage']};trainingServer(saved);const screen=await mountTraining({onClarify(){throw Error('Catalog gap is not an unanswered question')}});
  assert.match(text(screen),/catalog does not cover/);assert.doesNotMatch(text(screen),/Continue clarification|Coverage limited|Rest —/);await act(async()=>screen.unmount());
});

test('training clarification opens the existing minimal conversation, restores its draft and finishes with saved-summary cleanup',async()=>{
  resetAuth(alice);globalThis.__fitquestSecure.clear();const state=trainingState(),p=state.plans[0];
  p.outline={days:p.dates.map(date=>({date,sessions:[]})),coverage:['limitations_need_clarification']};
  const conversation={...onboardingFixture(),generationEnabled:true,turns:[{id:'recovery-turn',sequence:1,message:'Review my saved summary for the clarification needed to plan.',reply:'Does the shoulder discomfort occur only when serving overhead?',questionTopic:'Planning clarification',state:'completed',error:null}]};
  await privateDrafts.write('alice',{conversationId:conversation.id,text:'Only serving overhead.',pending:null,savedAt:Date.now()});
  const requests=[];
  globalThis.fetch=async(url,options)=>{
    requests.push({url,body:options.body?JSON.parse(options.body):null});
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};
    if(url.endsWith('/training/clarification'))return{status:200,json:async()=>conversation};
    if(url.endsWith('/commands'))return{status:200,json:async()=>({...deletionReceipt(conversation.id),summarySaved:true})};
    return{status:200,json:async()=>state};
  };
  const screen=await mount();await act(async()=>{press(screen,'Continue clarification');await flush()});
  assert.match(text(screen),/Does the shoulder/);assert.doesNotMatch(text(screen),/Before we begin|Continue to onboarding/);assert.equal(input(screen,'Onboarding message').props.value,'Only serving overhead.');
  const clarification=requests.filter(r=>r.url.endsWith('/training/clarification'));assert.equal(clarification.length,1);assert.deepEqual(clarification[0].body,{planId:p.id,summaryRevision:1,target:'outline'});
  await act(async()=>{press(screen,'Send');await flush()});assert.equal(requests.find(r=>r.url.endsWith('/commands')).body.text,'Only serving overhead.');assert.equal(await privateDrafts.read('alice'),null);assert.match(text(screen),/Your training/);
  await act(async()=>screen.unmount());
});

test('a clarification arriving after sign-out cannot populate the next account',async()=>{
  resetAuth(alice);globalThis.__fitquestSecure.clear();const saved=trainingState(),p=saved.plans[0];p.outline={days:p.dates.map(date=>({date,sessions:[]})),coverage:['limitations_need_clarification']};let deliver;
  globalThis.fetch=async(url)=>{if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};if(url.endsWith('/training/clarification'))return new Promise(resolve=>{deliver=resolve});return{status:200,json:async()=>saved}};
  const screen=await mount();await act(async()=>{press(screen,'Continue clarification');await flush()});
  await signOutThroughAccount(screen);await credentials(screen);await act(async()=>{press(screen,'Sign in');await flush()});
  await act(async()=>{deliver({status:200,json:async()=>onboardingFixture()});await flush()});assert.doesNotMatch(text(screen),/Private tennis report|Onboarding message/);assert.equal(await privateDrafts.read('alice'),null);await act(async()=>screen.unmount());
});

test('clarification entry accepts a completion receipt, retries lost cleanup response, and opens saved training after draft deletion',async()=>{
  resetAuth(alice);globalThis.__fitquestSecure.clear();const saved=trainingState(),p=saved.plans[0];
  p.outline={days:p.dates.map(date=>({date,sessions:[]})),coverage:['limitations_need_clarification']};
  const old=onboardingFixture();await privateDrafts.write('alice',{conversationId:old.id,text:'Looks good',pending:{operationId:'completed-operation',expectedRevision:4,kind:'message',text:'Looks good'},savedAt:Date.now()});
  const updated=structuredClone(saved);updated.summary.revision=2;updated.summary.sourceConversation=old.id;updated.plans.unshift({...structuredClone(p),id:'dddddddd-1111-4111-8111-111111111111',summaryRevision:2,outline:{coverage:[],days:p.dates.map(date=>({date,sessions:[]}))},days:[{date:p.dates[0],detail:{date:p.dates[0],coverage:[],sessions:[],activities:{},catalogVersion:p.catalogVersion}}]});
  let completed=false,entries=0;const requests=[];
  globalThis.fetch=async(url,options)=>{
    requests.push({url,body:options.body?JSON.parse(options.body):null});
    if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};
    if(url.endsWith('/training/clarification')){entries++;completed=true;if(entries===1)throw Error('Lost completion receipt');return{status:200,json:async()=>({...deletionReceipt(old.id),summarySaved:true})}}
    if(url.endsWith('/training')){if(completed)assert.equal(await privateDrafts.read('alice'),null);return{status:200,json:async()=>completed?updated:saved}}
    throw Error('Completion recovery must not send another answer or generate again');
  };
  const screen=await mount();await act(async()=>{press(screen,'Continue clarification');await flush()});
  assert.equal((await privateDrafts.read('alice')).text,'Looks good');assert.ok(input(screen,'Load clarification'));
  await act(async()=>{press(screen,'Load clarification');await flush()});
  assert.match(text(screen),/Your training/);assert.match(text(screen),/Rest — no prescribed session/);assert.equal(await privateDrafts.read('alice'),null);
  const entriesSent=requests.filter(r=>r.url.endsWith('/training/clarification'));assert.equal(entriesSent.length,2);assert.deepEqual(entriesSent[0].body,entriesSent[1].body);
  assert.equal(requests.some(r=>r.url.endsWith('/commands')||r.url.endsWith('/generate')),false);
  await act(async()=>screen.unmount());
});


test('replayed completion never automatically retries failed/pending work or backfills a saved partial week',async()=>{
  for(const kind of ['failed','pending','partial']){
    const saved=trainingState(),p=saved.plans[0];
    if(kind==='partial')p.outline={coverage:[],days:p.dates.map(date=>({date,sessions:[]}))};
    else p.jobs=[{target:'week',status:kind,error:kind==='failed'?'incomplete':null,attemptId:'existing-attempt'}];
    const mock=trainingServer(saved),screen=await mountTraining({generateOnOpen:true});
    assert.equal(mock.requests.length,1);assert.equal(mock.requests[0].method,'GET');assert.match(text(screen),/Your training/);assert.doesNotMatch(text(screen),/7 days|Generate 2026/);
    if(kind==='pending')assert.doesNotMatch(text(screen),/Retry weekly plan|Complete weekly plan|Generate weekly plan/);
    await act(async()=>screen.unmount());
  }
});

test('weekly request double press sends once; a completed backfill hides obsolete daily failure notices',async()=>{
  const saved=trainingState(),p=saved.plans[0];p.outline={coverage:[],days:p.dates.map(date=>({date,sessions:[]}))};p.jobs=[{target:p.dates[0],status:'failed',error:'provider_error',attemptId:'old-daily'}];
  const mock=trainingServer(saved),original=globalThis.fetch;let finish;
  globalThis.fetch=async(url,options)=>url.endsWith('/generate')?new Promise(resolve=>{finish=async()=>resolve(await original(url,options))}):original(url,options);
  const screen=await mountTraining();await act(async()=>{press(screen,'Complete weekly plan');press(screen,'Complete weekly plan');await flush()});
  await act(async()=>{await finish();await flush()});assert.equal(mock.requests.filter(r=>r.url.endsWith('/generate')).length,1);
  assert.match(text(screen),/Sunday/);assert.doesNotMatch(text(screen),/Generation did not finish|Details not generated|Week incomplete/);await act(async()=>screen.unmount());
});

test('rendered distributed sessions retain phases, exact distances, optional work and paired recovery counts',async()=>{
  const saved=trainingState(),p=saved.plans[0];
  const names={'FQ-ACT-00148':'Outdoor walking','FQ-ACT-00145':'Standing-start acceleration','FQ-ACT-00112':'Standing arm circles'};
  const activities=Object.fromEntries(Object.entries(names).map(([id,name])=>[id,{name,instructions:'Synthetic instructions hidden'}]));
  const base={id:'FQ-ACT-00148',phase:'main',sets:1,measure:'seconds',amount:60,effort:'easy',restSeconds:0,load:'none',loadKg:null,side:'both',distanceTarget:null};
  const session={timing:'morning',intervals:[{workIndex:1,recoveryIndex:2,recoveries:'between'}],activities:[{...base,phase:'warmup',amount:300},{...base,id:'FQ-ACT-00145',sets:4,measure:'meters',amount:20,effort:'moderate',distanceTarget:{unit:'m',value:20}},{...base,sets:3},{...base,phase:'cooldown',amount:180},{...base,phase:'optional',amount:3000,measure:'meters',distanceTarget:{unit:'km',value:3}}]};
  p.outline={qualityVersion:2,units:'imperial',goalDecisions:[{sourceIndex:0,goal:'Acceleration',status:'introductory',reason:'Controlled technique practice using an established skill.',evidence:[{date:p.dates[0],sessionIndex:0,activityIndex:1}]}],coverage:[],days:p.dates.map((date,i)=>({date,sessions:i===0?[{focus:'Acceleration technique',activityIds:Object.keys(names)},{focus:'Mobility',activityIds:['FQ-ACT-00112']}]:[]}))};
  p.days=[{date:p.dates[0],detail:{date:p.dates[0],catalogVersion:p.catalogVersion,coverage:[],activities,sessions:[session,{timing:'evening',intervals:[],activities:[{...base,id:'FQ-ACT-00112',amount:30}]}]}}];
  trainingServer(saved);const screen=await mountTraining();
  const visible=screen.root.findAllByType('Text').map(n=>n.children.join('')).join('\n');
  assert.match(visible,/Acceleration technique\nMorning/);assert.match(visible,/Mobility\nEvening/);
  assert.match(visible,/Warm-up\nOutdoor walking — 5 min \(easy\)\nMain\n4 rounds: Standing-start acceleration — 20 m \(moderate\) → Outdoor walking — 1 min easy recovery \(3 recoveries; none after last round\)\nCool-down\nOutdoor walking — 3 min \(easy\)\nOptional\nOutdoor walking — 3 km/);
  assert.doesNotMatch(visible,/2 miles|0\.01|Synthetic instructions/);
  assert.equal((visible.match(/4 rounds:/g)??[]).length,1);
  console.log('Synthetic rendered plan:\n'+visible.slice(0,3000));
  await act(async()=>screen.unmount());
  const {sessionRows,quantity,validSessionMeaning}=await import('./trainingPresentation.ts');
  assert.equal(quantity({...base,measure:'meters',amount:3218.688,distanceTarget:{unit:'mi',value:2}}),'2 miles');
  assert.equal(quantity({...base,measure:'meters',amount:3000}),'3000 m');
  assert.equal(quantity({...base,amount:30,side:'each'}),'30 sec per side');
  assert.equal(quantity({...base,measure:'meters',amount:18.288,distanceTarget:{unit:'yd',value:20}}),'20 yd');
  const after=structuredClone(session);after.intervals[0].recoveries='after_each';after.activities[2].sets=4;
  assert.ok(validSessionMeaning(after));assert.match(sessionRows(after,activities)[1].text,/4 recoveries; after every round/);
  after.activities[2].sets=3;assert.equal(validSessionMeaning(after),false);
  const legacy=structuredClone(session);delete legacy.intervals;delete legacy.timing;
  assert.equal(sessionRows(legacy,activities).length,5);assert.doesNotMatch(sessionRows(legacy,activities).map(x=>x.text).join('\n'),/rounds:|→|recoveries/);
});

test('recorded synthetic live week renders all seven days, exact miles and goal exceptions without dispatch on reopen',async()=>{
  const fixture=JSON.parse(readFileSync(new URL('../../backend/src/planningQualityLiveFixture.json',import.meta.url),'utf8'));
  const catalog=JSON.parse(readFileSync(new URL('../../backend/catalog/fitquest-v1.json',import.meta.url),'utf8'));
  const saved=trainingState(),p=saved.plans[0],w=fixture.week;p.dates=fixture.planningInput.dates;
  saved.summary.document=fixture.planningInput.summary;
  p.outline={qualityVersion:2,units:w.units,goalDecisions:w.goalDecisions,coverage:[],days:w.days.map(d=>({date:d.date,sessions:d.sessions.map(s=>({focus:s.focus,activityIds:[...new Set(s.activities.map(a=>a.id))]}))}))};
  p.days=w.days.map(d=>({date:d.date,detail:{date:d.date,clarification:null,coverage:[],catalogVersion:p.catalogVersion,sessions:d.sessions.map(({focus,...s})=>s),activities:Object.fromEntries(d.sessions.flatMap(s=>s.activities).map(a=>{const c=catalog.activities.find(c=>c['Activity ID']===a.id);return [a.id,{name:c['Exercise name'],instructions:c['Instructions']}]}))}}));
  const server=trainingServer(saved),screen=await mountTraining();
  const visible=screen.root.findAllByType('Text').map(n=>n.children.join('')).join('\n');
  assert.match(visible,/Sunday/);assert.equal((visible.match(/Outdoor walking — 1 mile/g)??[]).length,3);assert.equal((visible.match(/Rest — no prescribed session/g)??[]).length,4);
  assert.equal((visible.match(/\nMorning\n/g)??[]).length,3);assert.equal((visible.match(/Shoulder mobility\nEvening/g)??[]).length,3);
  assert.match(visible,/Learning acceleration technique:.*run-out/);assert.doesNotMatch(visible,/Details not generated|0\.99|1\.01|Standing-start acceleration —/);
  assert.equal(server.requests.length,1);console.log('Recorded synthetic live rendering:\n'+visible);
  await act(async()=>screen.unmount());
});

test('standalone and active-recovery speed rows preserve the prescribed effort rather than the session label',async()=>{
  const {sessionRows}=await import('./trainingPresentation.ts');
  const names={'FQ-ACT-00145':{name:'Standing-start acceleration'},'FQ-ACT-00148':{name:'Outdoor walking'}};
  const base={id:'FQ-ACT-00145',phase:'main',sets:4,measure:'meters',amount:20,effort:'moderate',restSeconds:120,load:'none',loadKg:null,side:'both',distanceTarget:{unit:'m',value:20}};
  for(const effort of ['moderate','challenging']){
    const work={...base,effort};
    const plain=sessionRows({activities:[work]},names)[0].text;
    assert.equal(plain,`Standing-start acceleration — 4 × 20 m (${effort}); 120 sec rest between sets`);
    const paired=sessionRows({intervals:[{workIndex:0,recoveryIndex:1,recoveries:'between'}],activities:[{...work,restSeconds:0},{...base,id:'FQ-ACT-00148',sets:3,measure:'seconds',amount:60,effort:'easy',restSeconds:0,distanceTarget:null}]},names)[0].text;
    assert.ok(paired.includes(`20 m (${effort}) →`));assert.ok(paired.includes('1 min easy recovery (3 recoveries; none after last round)'));
    console.log('Corrected standalone speed row: '+plain);
  }
  assert.match(sessionRows({activities:[{...base,measure:'count',amount:6,distanceTarget:null}]},names)[0].text,/6 counts \(moderate\)/);
  const legacy={...base};delete legacy.effort;
  assert.doesNotMatch(sessionRows({activities:[legacy]},names)[0].text,/moderate|challenging|undefined/);
});

test('actual synthetic revised week renders compact overview then exact rep ranges, RIR and distances on acceptance',async()=>{
  const record=JSON.parse(readFileSync(new URL('../../backend/fixtures/coaching-v1.json',import.meta.url),'utf8')).results.find(r=>r.stage==='review-repair');
  const catalog=JSON.parse(readFileSync(new URL('../../backend/catalog/fitquest-v1.json',import.meta.url),'utf8'));
  const saved=reviewUiState(),p=saved.plans[0],w=record.raw.week; saved.summary.document=record.input.summary;saved.summary.preferences=[];
  p.dates=w.days.map(d=>d.date);p.planRevision=2;p.catalogVersion=catalog.version;p.reviewNote=record.raw.reply;
  p.outline={qualityVersion:2,units:w.units,goalDecisions:w.goalDecisions,arrangementNote:w.arrangementNote,clarification:null,coverage:[],days:w.days.map(d=>({date:d.date,sessions:d.sessions.map(s=>({focus:s.focus,activityIds:[...new Set(s.activities.map(a=>a.id))]}))}))};
  p.days=w.days.map(d=>({date:d.date,detail:{date:d.date,coverage:[],clarification:null,catalogVersion:catalog.version,sessions:d.sessions.map(({focus,...s})=>s),activities:Object.fromEntries(d.sessions.flatMap(s=>s.activities).map(a=>{const source=catalog.activities.find(x=>x['Activity ID']===a.id);return[a.id,{name:source['Exercise name'],instructions:source.Instructions}]}))}}));
  const requests=[];globalThis.fetch=async(url,options)=>{requests.push(url);if(url.endsWith('/accept'))p.reviewState='accepted';return{status:200,json:async()=>structuredClone(saved)}};
  let screen=await mountTraining();assert.match(text(screen),/Your training/);assert.match(text(screen),/Morning/);assert.match(text(screen),/Evening/);assert.doesNotMatch(text(screen),/2 × 8–10/);
  await choosePlan(screen);let visible=text(screen);
  assert.match(visible,/Kneeling push-up — 2 × 8–10 · 3 RIR/);assert.match(visible,/Outdoor walking — 0.7 miles \(easy\)/);assert.match(visible,/Standing-start acceleration — 4 × 20 yd \(moderate\)/);assert.doesNotMatch(visible,/Hands-elevated push-up —|Place your hands|Support yourself/);
  await act(async()=>screen.unmount());screen=await mountTraining();assert.match(text(screen),/Your training/);assert.equal(requests.filter(url=>url.endsWith('/review')||url.endsWith('/generate')).length,0);await act(async()=>screen.unmount());
});

function readyRecapFixture(revision=2){
 const base=onboardingFixture();return {...base,revision,confirmableRevision:revision,generationEnabled:true,context:{...base.context,readiness:'ready_with_limits'},turns:[{id:'recap',sequence:1,message:'Synthetic goals and schedule.',reply:'Recap: two flexible sessions. Send changes, or choose Continue.',questionTopic:'Onboarding recap',state:'completed',error:null}]};
}
test('ready recap Continue sits below clarification input, preserves unsent corrections and confirms the updated revision once',async()=>{
 globalThis.__fitquestSecure.clear();let saved=readyRecapFixture(),resolveConfirm;const commands=[];let closed=0;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/commands')){const c=JSON.parse(options.body);commands.push(c);if(c.kind==='confirm')return new Promise(resolve=>{resolveConfirm=resolve});saved={...readyRecapFixture(4),turns:[...saved.turns,{...saved.turns[0],id:'updated',sequence:2,message:c.text,reply:'Updated recap: one flexible session. Choose Continue.'}]}}
  return{status:200,json:async()=>saved};
 };
 const screen=await mountOnboarding({onClose(_message,summarySaved){assert.equal(summarySaved,true);closed++}});
 const view=screen.root.findAllByType('View').find(v=>v.children.some(c=>typeof c==='object'&&c.props.accessibilityLabel==='Continue'));
 const continueIndex=view.children.findIndex(c=>typeof c==='object'&&c.props.accessibilityLabel==='Continue');
 const inputIndex=view.children.findIndex(c=>typeof c==='object'&&c.findAllByProps({accessibilityLabel:'Onboarding message'}).length);
 assert.ok(inputIndex>=0&&continueIndex>inputIndex);assert.equal(input(screen,'Continue').props.disabled,false);
 if(process.env.FITQUEST_CONTINUE_RENDER_CAPTURE)writeFileSync(process.env.FITQUEST_CONTINUE_RENDER_CAPTURE,JSON.stringify(screen.toJSON(),null,2));
 const oldContinue=input(screen,'Continue').props.onPress;
 await act(async()=>{input(screen,'Onboarding message').props.onChangeText('Only one session.');oldContinue();await flush()});
 assert.equal(commands.length,0);assert.equal(input(screen,'Continue').props.disabled,true);
 await act(async()=>{press(screen,'Send');await flush()});assert.equal(commands[0].kind,'message');assert.match(text(screen),/Updated recap/);assert.equal(input(screen,'Onboarding message').props.value,'');
 await act(async()=>{oldContinue();await flush()});assert.equal(commands.length,1);
 await act(async()=>{press(screen,'Continue');press(screen,'Continue');await flush()});assert.equal(commands.length,2);assert.equal(input(screen,'Continue').props.disabled,true);
 assert.equal(commands[1].kind,'confirm');assert.equal(commands[1].expectedRevision,4);assert.equal(commands[1].reviewedRevision,4);assert.equal('text' in commands[1],false);assert.equal(closed,0);
 await act(async()=>{resolveConfirm({status:200,json:async()=>({...deletionReceipt(saved.id),summarySaved:true})});await flush()});
 assert.equal(closed,1);assert.equal(await privateDrafts.read('alice'),null);assert.doesNotMatch(text(screen),/Synthetic goals|Updated recap/);await act(async()=>screen.unmount());
});
test('Continue fails closed for old-server responses, ordinary questions, essential clarification, stale readiness, profile change and failed or pending work',async()=>{
 for(const patch of [{confirmableRevision:undefined},{confirmableRevision:null},{context:{...readyRecapFixture().context,readiness:'needs_clarification'}},{profileChanged:true},{turns:[]},...['pending','failed'].map(state=>({turns:[{...readyRecapFixture().turns[0],state}]})),{turns:[{...readyRecapFixture().turns[0],questionTopic:'Equipment'}]},{turns:[{...readyRecapFixture().turns[0],reply:null}]}]){
  globalThis.__fitquestSecure.clear();const saved={...readyRecapFixture(),...patch};globalThis.fetch=async()=>({status:200,json:async()=>saved});
  const screen=await mountOnboarding();assert.equal(screen.root.findAllByProps({accessibilityLabel:'Continue'}).length,0);await act(async()=>screen.unmount());
 }
});
test('Continue lost response reuses its operation, reopens through a read receipt, and waits for device cleanup before closing',async()=>{
 globalThis.__fitquestSecure.clear();const saved=readyRecapFixture(),sent=[];let committed=false,closed=0,failCleanup=false;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/commands')){sent.push(JSON.parse(options.body));committed=true;throw Error('lost committed reply')}
  if(options.method==='GET'&&committed)return{status:200,json:async()=>({...deletionReceipt(saved.id),summarySaved:true})};
  return{status:200,json:async()=>saved};
 };
 const drafts={...privateDrafts,clear:async(...args)=>{if(failCleanup)throw Error('local cleanup failed');return privateDrafts.clear(...args)}};
 const props={drafts,onClose(_message,saved){assert.equal(saved,true);closed++}};
 let screen=await mountOnboarding(props);await act(async()=>{press(screen,'Continue');await flush()});assert.equal(closed,0);assert.equal(input(screen,'Continue').props.disabled,true);
 await act(async()=>{press(screen,'Try again');await flush()});assert.deepEqual(sent[0],sent[1]);assert.equal((await privateDrafts.read('alice')).pending.kind,'confirm');await act(async()=>screen.unmount());
 failCleanup=true;screen=await mountOnboarding(props);assert.equal(sent.length,2);assert.equal(closed,0);assert.ok(input(screen,'Finish cleanup'));assert.doesNotMatch(text(screen),/Synthetic goals/);
 failCleanup=false;await act(async()=>{press(screen,'Finish cleanup');await flush()});assert.equal(closed,1);assert.equal(await privateDrafts.read('alice'),null);await act(async()=>screen.unmount());
});
test('rejected Continue reloads the current recap before a new confirmation and account changes abort late completion',async()=>{
 globalThis.__fitquestSecure.clear();let saved=readyRecapFixture(),reject=true,deliver;const sent=[];let closed=0;
 globalThis.fetch=async(url,options)=>{
  if(options.method==='GET')saved=readyRecapFixture(4);
  if(url.endsWith('/commands')){sent.push(JSON.parse(options.body));if(reject)return{status:409,json:async()=>({code:'review_changed'})};return new Promise(resolve=>{deliver=resolve})}
  return{status:200,json:async()=>saved};
 };
 const props={userId:'alice',accessToken:async()=>'alice-token',onClose(){closed++}};
 const screen=await mountOnboarding(props);await act(async()=>{press(screen,'Continue');await flush()});assert.equal((await privateDrafts.read('alice')).pending,null);assert.equal(input(screen,'Continue').props.disabled,true);
 await act(async()=>{press(screen,'Check for reply');await flush()});assert.equal(input(screen,'Continue').props.disabled,false);reject=false;
 await act(async()=>{press(screen,'Continue');await flush()});assert.equal(sent[1].reviewedRevision,4);assert.notEqual(sent[0].operationId,sent[1].operationId);
 await act(async()=>{screen.update(React.createElement(OnboardingScreen,{...props,userId:'bob',accessToken:async()=>'bob-token'}));await flush()});assert.ok(input(screen,'Continue to onboarding'));assert.doesNotMatch(text(screen),/Synthetic goals/);
 await act(async()=>{deliver({status:200,json:async()=>({...deletionReceipt(saved.id),summarySaved:true})});await flush()});assert.equal(closed,0);assert.equal(await privateDrafts.read('bob'),null);await act(async()=>screen.unmount());
});
test('Continue completion opens existing outline generation once after saved-summary cleanup, with free training reopen',async()=>{
 resetAuth(alice);globalThis.__fitquestSecure.clear();const saved=readyRecapFixture(),training=overviewUiState();const outline=training.plans[0].outline;
 training.summary.sourceConversation=saved.id;Object.assign(training.plans[0],{outline:null,jobs:[],days:[],planRevision:0});let completed=false,confirmations=0,generations=0;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/profile'))return{status:200,json:async()=>({profile:payload})};
  if(url.endsWith('/commands')){assert.equal(JSON.parse(options.body).kind,'confirm');confirmations++;completed=true;return{status:200,json:async()=>({...deletionReceipt(saved.id),summarySaved:true})}}
  if(url.includes('/training')){
   if(url.endsWith('/generate')){assert.equal(await privateDrafts.read('alice'),null);assert.equal(JSON.parse(options.body).target,'outline');generations++;Object.assign(training.plans[0],{outline,planRevision:1,jobs:[{target:'outline',status:'completed',attemptId:'synthetic',error:null}]})}
   return{status:200,json:async()=>completed?training:{summary:null,plans:[]}};
  }
  return{status:200,json:async()=>saved};
 };
 const screen=await mount();await act(async()=>{press(screen,'Start onboarding');await flush()});await act(async()=>{press(screen,'Continue to onboarding');await flush()});
 await act(async()=>{press(screen,'Continue');press(screen,'Continue');await flush();await flush()});assert.equal(confirmations,1);assert.equal(generations,1);assert.ok(input(screen,'Create workouts from this older outline'));
 await act(async()=>screen.unmount());const reopened=await mount();assert.equal(generations,1);await act(async()=>reopened.unmount());await act(async()=>screen.unmount());
});
test('ready clarification recovery offers the same Continue control; outline confirmation stays blocked after an uncertain request until reload',async()=>{
 globalThis.__fitquestSecure.clear();const ready=readyRecapFixture();globalThis.fetch=async()=>({status:200,json:async()=>ready});let screen;
 await act(async()=>{screen=TestRenderer.create(React.createElement(OnboardingScreen,{userId:'alice',accessToken:async()=>'alice-token',onClose(){},recovery:{summaryRevision:1,planId:'synthetic',target:'outline'}}));await flush()});assert.equal(input(screen,'Continue').props.disabled,false);await act(async()=>screen.unmount());
 const saved=overviewUiState();let attempts=0;globalThis.fetch=async(url)=>{if(url.endsWith('/generate')){attempts++;throw Error('lost response')}return{status:200,json:async()=>saved}};
 screen=await mountTraining();await act(async()=>{press(screen,'Create workouts from this older outline');await flush()});if(hasTrainingAccess(screen))await act(async()=>press(screen,'Week'));assert.equal(attempts,1);assert.equal(input(screen,'Create workouts from this older outline').props.disabled,true);
 await act(async()=>{press(screen,screen.root.findAllByProps({accessibilityLabel:'Check status'}).length?'Check status':'Reload saved training');await flush()});assert.equal(input(screen,'Create workouts from this older outline').props.disabled,false);await act(async()=>screen.unmount());
});
test('legacy Sunday ranges retain training and saved nutrition data without exposing nutrition UI',async()=>{
 for(const count of [1,3,7])for(const status of ['estimate','deferred']){
  const saved=overviewUiState(),p=saved.plans[0];p.dates=Array.from({length:count},(_,i)=>`2026-10-${String(12-count+i).padStart(2,'0')}`);p.outline.days=p.dates.map((date,i)=>({date,sessions:i===0?[{focus:'Easy walking',activityIds:[],timing:'morning',estimatedMinutes:12}]:[]}));
  p.outline.nutrition={status,calories:status==='estimate'?2400:null,proteinGrams:status==='estimate'?120:null,carbohydrateGrams:status==='estimate'?318:null,fatGrams:status==='estimate'?72:null,basis:status==='estimate'?'mifflin-st-jeor-v1':null,rationale:'Supports mixed goals without prescribing meals.',assumptions:'Starting estimate with reported inputs.',reason:status==='deferred'?'Nutrition inputs remain unknown.':null};
  const server=trainingServer(saved);let screen=await mountTraining();let visible=renderedTrainingText(screen);assert.match(visible,/Your training/);assert.match(visible,/Easy walking[\s\S]*Morning[\s\S]*About 12 min/);assert(visible.includes(p.dates.at(-1)));
  assert.doesNotMatch(visible,/2400 kcal|Protein 120 g|Nutrition targets/);assert.equal(server.saved.plans[0].outline.nutrition.status,status);
  assert.equal(input(screen,'Create workouts from this older outline').props.disabled,false);
  await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(server.requests.filter(r=>r.method==='POST').length,0);assert(renderedTrainingText(screen).includes(p.dates.at(-1)));await act(async()=>screen.unmount());
 }
});

const fixedQuestions=['What would you like to achieve with your training?','What does your current activity or training look like?','What equipment and training facilities do you have access to?',"What would you like your training schedule to look like—days available, time per session, and whether you're open to multiple sessions per day? You can leave the arrangement up to the coach.",'Are there any injuries, pain, medical restrictions or other limitations your plan should account for? “None” is fine.'];
const fixedFixture=()=>({...onboardingFixture(),intakeQuestions:fixedQuestions,context:{...onboardingFixture().context,items:[],intake:{version:1,answers:[]}}});
test('fixed intake reveals exactly five questions progressively, edits/resumes verbatim, and only final Generate plan completes',async()=>{
 resetAuth(alice);let saved=fixedFixture(),commands=[],creates=[],closed=[];
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/commands')){const c=JSON.parse(options.body);commands.push(c);if(c.kind==='confirm')return {status:200,json:async()=>({id:saved.id,deleted:true,summarySaved:true,message:'Answers saved.'})};assert.equal(c.kind,'edit');saved=structuredClone(saved);saved.context.intake.answers[Number(c.topic.split(':')[1])]=c.value;saved.revision++;}
  else if(options.method==='POST')creates.push(JSON.parse(options.body));
  return {status:200,json:async()=>saved};
 };
 let screen=await mountOnboarding({onClose:(...args)=>closed.push(args)});assert.equal(creates[0].intakeVersion,1);assert.equal(commands.length,0);
 const answers=['Strong and mobile. '+ 'Exact details '.repeat(35),'Walk twice weekly.','Floor and route.','No preference','None'];
 for(let i=0;i<5;i++){
  for(let j=0;j<5;j++)assert.equal(text(screen).includes(fixedQuestions[j]),j===i);
  assert.equal(screen.root.findAllByProps({accessibilityLabel:'Generate plan'}).length,0);
  const field=input(screen,`Answer ${i+1}`);assert(field.props.onFocus);assert(field.props.onContentSizeChange);assert.equal(field.props.multiline,true);assert.equal(Object.assign({},...field.props.style).maxHeight,180);
  await act(async()=>field.props.onChangeText(answers[i]));await act(async()=>{press(screen,'Send');await flush()});
 }
 assert.equal(commands.length,5);assert(commands.every(c=>c.kind==='edit'));assert(!text(screen).includes('Onboarding recap'));assert(!text(screen).includes('Nutrition'));
 assert.equal(input(screen,'Generate plan').props.disabled,false);
 await act(async()=>{press(screen,'Edit answer 2')});await act(async()=>input(screen,'Answer 2').props.onChangeText('Changed activity, still unsent.'));assert.equal(input(screen,'Generate plan').props.disabled,true);await flush();
 await act(async()=>screen.unmount());screen=await mountOnboarding({onClose:(...args)=>closed.push(args)});assert.equal(input(screen,'Answer 2').props.value,'Changed activity, still unsent.');assert.equal(commands.length,5);
 await act(async()=>{press(screen,'Save answer');await flush()});assert.equal(saved.context.intake.answers[1],'Changed activity, still unsent.');assert.equal(saved.context.intake.answers[0],answers[0]);
 await act(async()=>{press(screen,'Generate plan');await flush()});assert.equal(commands.filter(c=>c.kind==='confirm').length,1);assert.equal(closed[0][1],true);assert.equal(await privateDrafts.read('alice'),null);await act(async()=>screen.unmount());
});
test('fixed intake pending answer retries the same operation, and account switch cannot show prior answers',async()=>{
 resetAuth(alice);let saved=fixedFixture(),sent=[],fail=true;
 globalThis.fetch=async(url,options)=>{if(url.endsWith('/commands')){const c=JSON.parse(options.body);sent.push(c);if(fail)throw Error('connection lost');saved={...saved,revision:1,context:{...saved.context,intake:{version:1,answers:[c.value]}}};}return {status:200,json:async()=>saved}};
 let screen=await mountOnboarding();await act(async()=>input(screen,'Answer 1').props.onChangeText('Synthetic goals'));await act(async()=>{press(screen,'Send');await flush()});fail=false;await act(async()=>{press(screen,'Try again');await flush()});assert.equal(sent[0].operationId,sent[1].operationId);assert.equal(saved.context.intake.answers[0],'Synthetic goals');
 await act(async()=>{screen.update(React.createElement(OnboardingScreen,{userId:'bob',accessToken:async()=>'bob-token',onClose(){}}));await flush()});assert.doesNotMatch(text(screen),/Synthetic goals/);await act(async()=>screen.unmount());
});
test('plain outlines render separate cards and failed-response recovery stays explicit, retain four sessions/ranges and never generate on reopen',async()=>{
 const saved=overviewUiState(),p=saved.plans[0];p.dates=['2026-10-11'];const raw='Sunday\nFour optional practice sessions, each about 15–25 minutes.';
 p.outline={sourceFormat:'plain-v1',originalResponse:raw,coverage:[],clarification:null,days:[{date:p.dates[0],sessions:Array.from({length:4},(_,i)=>({focus:`Session ${i+1}`,activityIds:[],timing:null,plain:{sourceText:`Optional session ${i+1} · 15–25 minutes`,goal:`Goal ${i+1}`,durationText:'15–25 minutes',durationRange:{min:15,max:25},timingText:null,optional:true}}))}]};
 saved.summary.document=saved.summary.document.slice(0,5).map((f,i)=>({...f,intakeIndex:i,text:i===0?'Faithful answer '.repeat(40):f.text,goals:undefined}));
 const server=trainingServer(saved);let screen=await mountTraining();assert(!renderedTrainingText(screen).includes(raw));assert.match(renderedTrainingText(screen),/Goal 1/);assert.match(renderedTrainingText(screen),/About 15–25 minutes/);assert.equal(screen.root.findAll(n=>n.props.accessibilityLabel?.startsWith('Session ')&&n.type==='View').length,4);assert(!renderedTrainingText(screen).includes('About undefined'));assert.equal(input(screen,'Create workouts from this older outline').props.disabled,false);await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(server.requests.filter(r=>r.method==='POST').length,0);await act(async()=>screen.unmount());
 p.outline=null;p.planRevision=0;p.jobs=[{target:'outline',status:'failed',error:'outline_conversion',attemptId:'synthetic-failure',rawResponse:'Synthetic unparseable response'}];trainingServer(saved);screen=await mountTraining();assert.match(renderedTrainingText(screen),/Response saved for recovery — not a usable plan/);assert.doesNotMatch(renderedTrainingText(screen),/Synthetic unparseable response/);assert.equal(screen.root.findAllByProps({accessibilityLabel:'Create workouts from this older outline'}).length,0);await act(async()=>screen.unmount());
});

const calendarDates=Array.from({length:7},(_,i)=>`2026-10-${String(5+i).padStart(2,'0')}`);
const calendarResponse=calendarDates.map((date,i)=>`### ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]}, ${date}\n${[2,5].includes(i)?'Rest day\nGoal: Recovery':`- Session 1: ${i===6?'Optional ':''}Practice ${i+1}\n  Goal: Build steady capacity\n  Time: 20–30 minutes${i<2?'\n- Session 2: Easy walking\n  Goal: Gentle conditioning\n  Timing: Evening\n  Time: 15–20 min':''}`}`).join('\n\n');
function calendarState(){const saved=overviewUiState(),p=saved.plans[0];p.dates=[...calendarDates];p.outline=parsePlainOutline(calendarResponse,p.dates);return saved}
function calendarDetails(plan){
 const example=reviewUiState().plans[0].days[0].detail;
 plan.days=plan.outline.days.map(d=>({date:d.date,detail:{...structuredClone(example),date:d.date,sessions:d.sessions.map(s=>({...structuredClone(example.sessions[0]),timing:s.timing,estimatedMinutes:s.plain.durationRange.min}))}}));
 plan.reviewState='accepted';plan.confirmedOutlineRevision=plan.planRevision;plan.jobs.push({target:`details:${plan.planRevision}`,status:'completed',attemptId:'calendar-details',error:null});
}
test('legacy outlines and workouts retain every saved date before, during and after the range',async t=>{
 for(const count of [1,3,7])for(const accepted of [false,true])for(const now of ['2026-10-01T12:00:00Z','2026-10-07T12:00:00Z','2027-01-04T12:00:00Z']){
  t.mock.timers.setTime(new Date(now).getTime());
  const saved=calendarState(),p=saved.plans[0];p.dates=p.dates.slice(-count);p.outline.days=p.outline.days.slice(-count);
  if(accepted)calendarDetails(p);
  const original=structuredClone(p),server=trainingServer(saved);let screen=await mountTraining();
  for(const reopening of [false,true]){
   if(reopening){await act(async()=>screen.unmount());screen=await mountTraining()}
   const labels=screen.root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel?.startsWith('Training day ')).map(n=>n.props.accessibilityLabel.slice(13));assert.deepEqual(labels,p.dates);
   const visible=renderedTrainingText(screen);assert(!visible.includes(calendarResponse));assert.match(visible,/About 20–30 minutes/);assert.match(visible,/Build steady capacity/);assert.match(visible,/Optional session/);assert.doesNotMatch(visible,/No remaining days/);
   if(count>1)assert.match(visible,/Rest day/);
   if(accepted){assert.doesNotMatch(visible,/days? · America/);assert.match(visible,/Outdoor walking/)}
   else {assert.doesNotMatch(visible,/Outdoor walking/);assert.equal(input(screen,'Create workouts from this older outline').props.disabled,false);assert.equal(screen.root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel?.startsWith('Session ')).length,p.outline.days.reduce((n,d)=>n+d.sessions.length,0))}
   assert.equal(server.requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(saved.plans[0],original);
  }
  await act(async()=>screen.unmount());
 }
});
test('five answers to actual parsed cards, Use this plan creates all seven saved days once, then exercises and free reopen',async t=>{
 t.mock.timers.setTime(new Date('2026-10-06T12:00:00Z').getTime());resetAuth(alice);let intake=fixedFixture(),completed=false,answers=0,outlines=0,details=0;const saved=calendarState(),plan=saved.plans[0];plan.outline=null;plan.planRevision=0;plan.jobs=[];
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/profile'))return {status:200,json:async()=>({profile:payload})};
  if(url.includes('/onboarding')){
   if(url.endsWith('/commands')){const c=JSON.parse(options.body);if(c.kind==='confirm'){completed=true;return{status:200,json:async()=>({...deletionReceipt(intake.id),summarySaved:true})}};assert.equal(c.kind,'edit');answers++;intake=structuredClone(intake);intake.context.intake.answers[Number(c.topic.split(':')[1])]=c.value;intake.revision++;assert.equal(outlines+details,0);}
   return {status:200,json:async()=>structuredClone(intake)};
  }
  if(url.endsWith('/generate')){const b=JSON.parse(options.body);if(b.target==='outline'){outlines++;plan.outline=parsePlainOutline(calendarResponse,calendarDates);plan.planRevision=1;plan.jobs=[{target:'outline',status:'completed',attemptId:'calendar-outline',error:null}];}else{assert.equal(b.target,'week');assert.equal(b.confirmOutline,true);assert.equal(b.planRevision,1);assert.equal(plan.outline.days.length,7);details++;calendarDetails(plan);}}
  return {status:200,json:async()=>completed?structuredClone(saved):{summary:null,plans:[]}};
 };
 let screen=await mount();await act(async()=>{press(screen,'Start onboarding');await flush()});await act(async()=>{press(screen,'Continue to onboarding');await flush()});
 for(const [i,answer]of ['Stronger','Walk weekly','Floor and route','Five days; coach chooses','None'].entries()){await act(async()=>input(screen,`Answer ${i+1}`).props.onChangeText(answer));await act(async()=>{press(screen,'Send');await flush()});}
 assert.equal(answers,5);assert.equal(outlines,0);await act(async()=>{press(screen,'Generate plan');await flush();await flush()});assert.equal(outlines,1);assert.equal(details,0);assert.equal(input(screen,'Create workouts from this older outline').props.disabled,false);assert.match(renderedTrainingText(screen),/Tuesday/);assert.match(renderedTrainingText(screen),/Monday/);
 await act(async()=>{press(screen,'Create workouts from this older outline');press(screen,'Create workouts from this older outline');await flush()});if(hasTrainingAccess(screen))await act(async()=>press(screen,'Week'));assert.equal(details,1);assert.equal(plan.days.length,7);assert.match(renderedTrainingText(screen),/Outdoor walking — 10 min/);assert.match(renderedTrainingText(screen),/Monday/);
 await act(async()=>screen.unmount());const reopened=await mount();await act(async()=>press(reopened,'Week'));assert.equal(outlines,1);assert.equal(details,1);assert.match(renderedTrainingText(reopened),/Outdoor walking/);await act(async()=>reopened.unmount());await act(async()=>screen.unmount());
});

test('plain outline workouts fail recoverably, retry the same dated week explicitly, and stale revision needs reload',async t=>{
 t.mock.timers.setTime(new Date('2026-10-06T12:00:00Z').getTime());const saved=calendarState(),p=saved.plans[0],original=structuredClone(p.outline);let calls=0,stale=false;const requests=[];
 globalThis.fetch=async(url,options)=>{if(url.endsWith('/generate')){const body=JSON.parse(options.body);requests.push(body);calls++;if(stale)return{status:409,json:async()=>({code:'plan_changed'})};if(calls===1){p.jobs.push({target:'details:1',status:'failed',error:'incomplete',attemptId:'failed-detail'});p.confirmedOutlineRevision=1;}else {assert.equal(body.retryAttempt,'failed-detail');p.jobs=p.jobs.filter(j=>j.target!=='details:1');calendarDetails(p);}}return{status:200,json:async()=>structuredClone(saved)}};
 let screen=await mountTraining();await act(async()=>{press(screen,'Create workouts from this older outline');await flush()});if(hasTrainingAccess(screen))await act(async()=>press(screen,'Week'));assert.equal(calls,1);assert.deepEqual(p.outline,original);assert.equal(p.days.length,0);assert.equal(input(screen,'Retry creating workouts').props.disabled,false);assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking —/);
 await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(calls,1);await act(async()=>{press(screen,'Retry creating workouts');press(screen,'Retry creating workouts');await flush()});if(hasTrainingAccess(screen))await act(async()=>press(screen,'Week'));assert.equal(calls,2);assert.equal(p.days.length,7);assert.deepEqual(p.outline,original);assert.match(renderedTrainingText(screen),/Outdoor walking —/);assert.equal(requests[1].planId,requests[0].planId);assert.equal(requests[1].planRevision,requests[0].planRevision);await act(async()=>screen.unmount());
 p.days=[];p.reviewState='draft';p.confirmedOutlineRevision=null;p.jobs=p.jobs.filter(j=>j.target==='outline');stale=true;screen=await mountTraining();await act(async()=>{press(screen,'Create workouts from this older outline');await flush()});if(hasTrainingAccess(screen))await act(async()=>press(screen,'Week'));assert.equal(input(screen,'Create workouts from this older outline').props.disabled,true);assert.match(renderedTrainingText(screen),/This plan changed/);assert.deepEqual(p.outline,original);await act(async()=>screen.unmount());
});

test('actual detail wire and validators feed mobile exercises; safe validation failure preserves cards until explicit retry',async t=>{
 t.mock.timers.setTime(new Date('2026-10-06T12:00:00Z').getTime());
 const {prepareWeek,checkWeek}=await import('../../backend/src/weeklyPlanning.ts');
 const {plainDetailReply,checkSyntheticWire}=await import('../../backend/src/plainDetailFixture.ts');
 const {savedDetail}=await import('../../backend/src/planningDomain.ts');
 const {intakeSummary}=await import('../../backend/src/fixedIntake.ts');
 const {validationFailureCode}=await import('../../backend/src/planningValidation.ts');
 const {trainingError}=await import('./trainingApi.ts');
 const saved=calendarState(),p=saved.plans[0],original=structuredClone(p.outline);let calls=0;
 saved.summary.document=intakeSummary({version:1,answers:['Strength and walking','Walking weekly','Clear floor, firm raised support and a route','Coach chooses; several sessions can fit','None']});
 const provider={model:'synthetic',cost:()=>10};
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/generate')){
   calls++;const request=JSON.parse(options.body);assert.equal(request.confirmOutline,true);assert.equal(request.planRevision,1);
   const i={kind:'week',outlineFirst:true,draftReview:true,qualityVersion:2,dates:p.dates,outline:p.outline,summary:saved.summary.document,profile:{age:30,heightInches:68,weightLb:155}};
   const body=prepareWeek(provider,i).body,raw=plainDetailReply(JSON.parse(JSON.parse(body).input));checkSyntheticWire(body,raw);
   if(calls===1)raw.days[0].sessions[0].activities[2].rir=3;
   else assert.equal(request.retryAttempt,'detail-validation-1');
   try{const checked=checkWeek(raw,i);p.outline=checked.outline;p.days=checked.details.map(d=>({date:d.date,detail:savedDetail(d)}));p.reviewState='accepted';p.jobs=[{target:'details:1',status:'completed',error:null,attemptId:'detail-validation-2'}]}
   catch(error){p.jobs=[{target:'details:1',status:'failed',error:validationFailureCode(error),attemptId:'detail-validation-1'}]}
   p.confirmedOutlineRevision=1;
  }
  return{status:200,json:async()=>structuredClone(saved)};
 };
 let screen=await mountTraining();await act(async()=>{press(screen,'Create workouts from this older outline');press(screen,'Create workouts from this older outline');await flush()});if(hasTrainingAccess(screen))await act(async()=>press(screen,'Week'));
 assert.equal(calls,1);assert.equal(p.jobs[0].error,'invalid_plan:rir:0:0:2');assert.deepEqual(p.outline,original);assert.equal(p.days.length,0);
 assert.match(renderedTrainingText(screen),/repetitions-in-reserve target check/);assert.doesNotMatch(renderedTrainingText(screen),/invalid_plan|:0:0:2/);
 await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(calls,1);
 await act(async()=>{press(screen,'Retry creating workouts');press(screen,'Retry creating workouts');await flush()});if(hasTrainingAccess(screen))await act(async()=>press(screen,'Week'));assert.equal(calls,2);assert.equal(p.days.length,7);assert.equal(p.reviewState,'accepted');
 assert.deepEqual(p.outline.days,original.days);assert.match(renderedTrainingText(screen),/Standing arm circles/);assert.match(renderedTrainingText(screen),/3 RIR/);assert.match(renderedTrainingText(screen),/Optional/);assert.match(renderedTrainingText(screen),/Monday/);
 await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(calls,2);assert.match(renderedTrainingText(screen),/Standing arm circles/);await act(async()=>screen.unmount());
 assert(!trainingError('invalid_plan:private_health_text:0').includes('private_health_text'));
});

test('complete canonical draft renders only overview through reload; one generation, free acceptance reveals exact saved revision',async t=>{
 t.mock.timers.setTime(new Date('2026-10-06T16:00:00Z').getTime());
 const {completeFixture,completeOutlineFixture,syntheticAnswers}=await import('../../backend/src/completePlanFixture.ts');
 const {checkComplete,prepareComplete,completeActivities}=await import('../../backend/src/completePlanning.ts');
 const {encodeCompleteWire}=await import('../../backend/src/completePlanWire.ts');
 const {planOverview}=await import('../../backend/src/completePlanContract.ts');
 const {intakeSummary}=await import('../../backend/src/fixedIntake.ts');
 const {planDates}=await import('../../backend/src/trainingSummary.ts');
 const dates=planDates('America/New_York',new Date()),saved=trainingState(),p=saved.plans[0];
 saved.summary.document=intakeSummary({version:1,answers:syntheticAnswers});
 Object.assign(p,{dates,schemaVersion:'complete-week-v1',outlineFirst:false,reviewState:'draft',planRevision:0,completeReady:false,completePlan:null,overview:null,activityNames:{},acceptedAt:null});
 let canonical,dispatches=0,accepts=0,revisionRequests=0;
 const requests=[];
 globalThis.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):null;requests.push({url,body,method:options.method});
  if(url.endsWith('/generate')){
   assert.equal(body.target,'week');assert.equal(body.confirmOutline,undefined);dispatches++;
   const planning={kind:'week',schemaVersion:p.schemaVersion,summary:saved.summary.document,dates,profile:{age:30,heightInches:68,weightLb:155}};
   const request=JSON.parse(prepareComplete({model:'mock',cost:()=>10},{...planning,completeOutlineText:completeOutlineFixture(completeFixture(dates))}).body);assert.equal(request.text.format.name,'complete_week_units_v2');
   const result=checkComplete(encodeCompleteWire({result:{kind:'plan',plan:completeFixture(dates)}}),planning);canonical=result.result.plan;
   p.overview=planOverview(canonical);p.completeReady=true;p.planRevision=1;p.jobs=[{target:'week',status:'completed',attemptId:'complete-attempt',error:null}];
  }
  if(url.endsWith('/accept')){accepts++;assert.equal(body.planRevision,p.planRevision);p.reviewState='accepted';p.completePlan=structuredClone(canonical);p.activityNames=completeActivities(canonical);p.acceptedAt='2026-10-06T16:00:00Z';}
  if(url.endsWith('/review')){revisionRequests++;canonical.days[1].sessions[0].durationMinutes={min:10,max:15};p.planRevision++;p.overview=planOverview(canonical);p.reviewState='draft';p.completePlan=null;p.activityNames={};p.acceptedAt=null;}
  return {status:200,json:async()=>structuredClone(saved)};
 };
 let screen=await mountTraining({generateOnOpen:true});assert.equal(dispatches,1);assert.equal(accepts,0);assert.match(renderedTrainingText(screen),/Steady practice/);assert.match(renderedTrainingText(screen),/About 20–30 min/);assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking|targets per round|recoveries/);
 assert.equal(input(screen,'Use this plan').props.disabled,false);
 await act(async()=>{input(screen,'Plan feedback').props.onChangeText('Unsent correction');await flush()});assert.equal(input(screen,'Use this plan').props.disabled,true);
 await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(dispatches,1);assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking|targets per round/);
 await choosePlan(screen,true);assert.equal(accepts,1);assert.equal(dispatches,1);assert.match(renderedTrainingText(screen),/Outdoor walking · 60–90 sec/);assert.match(renderedTrainingText(screen),/Between rounds \(2 recoveries\): Rest 30–45 sec/);assert.match(renderedTrainingText(screen),/Monday/);assert.deepEqual(p.completePlan,canonical);
 await act(async()=>screen.unmount());screen=await mountTraining();assert.match(renderedTrainingText(screen),/Outdoor walking/);assert.equal(dispatches,1);assert.equal(accepts,1);
 await act(async()=>input(screen,'Plan feedback').props.onChangeText('Shorten Tuesday; keep the other days unchanged.'));await act(async()=>{press(screen,'Update this week');await flush()});assert.equal(revisionRequests,1);assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking|targets per round/);assert.match(renderedTrainingText(screen),/About 10–15 min/);assert.equal(input(screen,'Use this plan').props.disabled,false);
 await act(async()=>screen.unmount());screen=await mountTraining();assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking/);await choosePlan(screen);assert.equal(dispatches,1);assert.equal(accepts,2);assert.equal(revisionRequests,1);assert.match(renderedTrainingText(screen),/Outdoor walking/);
 assert.equal(requests.filter(r=>r.url.endsWith('/generate')).length,1);assert(!requests.some(r=>r.body?.target==='outline'||r.body?.confirmOutline));
 await act(async()=>screen.unmount());
 // A malformed draft response carrying exercises is rejected, never rendered.
 p.reviewState='draft';p.acceptedAt=null;screen=await mountTraining();assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking|Steady practice/);await act(async()=>screen.unmount());
});

test('complete exercise rows preserve per-side ranges, loads and effort without verbose catalog descriptions',async()=>{
 const {exerciseText}=await import('./CompleteWeekView.tsx');
 const e={activityId:'FQ-ACT-00046',target:{kind:'repetitions',reps:{min:8,max:12}},perSide:true,load:{value:10,unit:'lb'},loadInstruction:null,effort:{rpe:null,rir:{min:2,max:3},cue:null}};
 assert.equal(exerciseText(e,{'FQ-ACT-00046':{name:'Standing dumbbell biceps curl',loadConvention:'Load per dumbbell (lb or kg)'}}),'Standing dumbbell biceps curl · 8–12 reps · each side · 10 lb per dumbbell · 2–3 RIR');
 e.target={kind:'distance',distance:{min:.1,max:.25},unit:'mi'};e.effort=null;e.load=null;e.perSide=false;assert.match(exerciseText(e,{}),/0.1–0.25 mi/);
});

test('explicit wire minutes and event-count aliases render canonical doses after acceptance and free reopen',async t=>{
 t.mock.timers.setTime(new Date('2026-10-05T16:00:00Z').getTime());
 const {unitWireFixture,completeOutlineFixture,syntheticAnswers}=await import('../../backend/src/completePlanFixture.ts');
 const {checkComplete,prepareComplete,completeActivities}=await import('../../backend/src/completePlanning.ts');
 const {planOverview}=await import('../../backend/src/completePlanContract.ts');
 const {intakeSummary}=await import('../../backend/src/fixedIntake.ts');
 const dates=Array.from({length:7},(_,i)=>`2026-10-${String(i+5).padStart(2,'0')}`),saved=trainingState(),p=saved.plans[0];
 saved.summary.document=intakeSummary({version:1,answers:syntheticAnswers});
 Object.assign(p,{dates,schemaVersion:'complete-week-v1',outlineFirst:false,reviewState:'draft',planRevision:0,completeReady:false,completePlan:null,overview:null,activityNames:{},acceptedAt:null});
 let dispatches=0,accepts=0,canonical;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/generate')){dispatches++;const context={kind:'week',summary:saved.summary.document,dates,profile:{age:30,heightInches:68,weightLb:155}};
   assert.equal(JSON.parse(prepareComplete({model:'mock',cost:()=>10},{...context,completeOutlineText:completeOutlineFixture(unitWireFixture(dates).expected)}).body).text.format.name,'complete_week_units_v2');
   const fixture=unitWireFixture(dates);canonical=checkComplete(fixture.wire,context).result.plan;assert.deepEqual(canonical,fixture.expected);
   p.overview=planOverview(canonical);p.completeReady=true;p.planRevision=1;p.jobs=[{target:'week',status:'completed',attemptId:'unit-attempt',error:null}];}
  if(url.endsWith('/accept')){accepts++;p.reviewState='accepted';p.completePlan=structuredClone(canonical);p.activityNames=completeActivities(canonical);p.acceptedAt='2026-10-05T16:00:00Z';}
  return{status:200,json:async()=>structuredClone(saved)};
 };
 let screen=await mountTraining({generateOnOpen:true});assert.equal(dispatches,1);assert.doesNotMatch(renderedTrainingText(screen),/120–180 sec|5–8 count|Medicine-ball/);
 await choosePlan(screen);let rendered=renderedTrainingText(screen);
 assert.match(rendered,/Outdoor walking · 120–180 sec/);assert.match(rendered,/Between rounds \(2 recoveries\): Outdoor walking · 30–60 sec/);assert.match(rendered,/Rest 30–45 sec/);assert.match(rendered,/5–8 count · each side · 4 kg/);assert.match(rendered,/Optional session/);assert.match(rendered,/Evening/);assert.match(rendered,/Rest — no planned session/);assert.deepEqual(p.completePlan,canonical);
 await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(dispatches,1);assert.equal(accepts,1);assert.match(renderedTrainingText(screen),/120–180 sec/);await act(async()=>screen.unmount());
 // A saved pre-change 2-second target remains 2 seconds; no value-based guessing.
 p.completePlan.days[1].sessions[0].blocks[0].exercises[0].target.seconds={min:2,max:2};screen=await mountTraining();assert.match(renderedTrainingText(screen),/Outdoor walking · 2 sec/);assert.equal(dispatches,1);await act(async()=>screen.unmount());
});


test('complete pending and accepted views show the whole saved week across dates and free reopen',async t=>{
 const {completeFixture}=await import('../../backend/src/completePlanFixture.ts');
 const {completeActivities}=await import('../../backend/src/completePlanning.ts');
 const {planOverview}=await import('../../backend/src/completePlanContract.ts');
 const ranges=[calendarDates,['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-08'],['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']];
 for(const dates of ranges)for(const timeZone of ['America/New_York','Pacific/Kiritimati'])for(const offset of [-7,0,3,6,14])for(const accepted of [false,true]){
  t.mock.timers.setTime(new Date(dates[0]+'T12:00:00Z').getTime()+offset*86400000);
  const saved=trainingState(),p=saved.plans[0],canonical=completeFixture(dates);
  Object.assign(p,{dates,timeZone,schemaVersion:'complete-week-v1',outlineFirst:false,reviewState:accepted?'accepted':'draft',planRevision:1,completeReady:true,completePlan:accepted?canonical:null,overview:planOverview(canonical),activityNames:accepted?completeActivities(canonical):{},acceptedAt:accepted?'2026-03-01T12:00:00Z':null,jobs:[{target:'week',status:'completed',attemptId:'saved',error:null}]});
  const original=structuredClone(p),server=trainingServer(saved);let screen=await mountTraining({generateOnOpen:true});
  for(const reopening of [false,true]){
   if(reopening){await act(async()=>screen.unmount());screen=await mountTraining()}
   const labels=screen.root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel?.startsWith('Training day ')).map(n=>n.props.accessibilityLabel.slice(13));assert.deepEqual(labels,dates);
   assert.equal(screen.root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel?.startsWith('Session ')).length,canonical.days.reduce((n,d)=>n+d.sessions.length,0));
   const visible=renderedTrainingText(screen);assert.match(visible,/Sunday/);assert.match(visible,/Optional session/);assert.match(visible,/About 20–30 min/);assert.match(visible,/Rest — no planned session/);assert.doesNotMatch(visible,/No remaining days/);
   if(accepted)assert.match(visible,/Outdoor walking/);else{assert.doesNotMatch(visible,/Outdoor walking|targets per round|recoveries/);assert.equal(input(screen,'Use this plan').props.disabled,false)}
   assert.equal(server.requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(p,original);
  }
  await act(async()=>screen.unmount());
 }
});


test('two-stage failures reopen without dispatch and offer only the explicit stage retry with its saved attempt',async()=>{
 const {completeFixture,syntheticAnswers}=await import('../../backend/src/completePlanFixture.ts');
 const {planOverview}=await import('../../backend/src/completePlanContract.ts');
 const {intakeSummary}=await import('../../backend/src/fixedIntake.ts');
 for(const stage of ['outline','workouts']){
  const saved=trainingState(),p=saved.plans[0],requests=[];
  saved.summary.document=intakeSummary({version:1,answers:syntheticAnswers});
  Object.assign(p,{schemaVersion:'complete-week-v1',outlineFirst:false,reviewState:'draft',planRevision:0,completeReady:false,completePlan:null,overview:null,activityNames:{},acceptedAt:null,jobs:[{target:'week',stage,status:'failed',error:stage==='outline'?'outline_conversion':'outlined_schedule_changed',attemptId:`${stage}-failed`}]});
  globalThis.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):null;requests.push({url,body});return{status:200,json:async()=>structuredClone(saved)}};
  let screen=await mountTraining();assert.equal(requests.filter(r=>r.body).length,0);assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking|targets per round/);
  assert.match(renderedTrainingText(screen),stage==='outline'?/No workouts were requested/:/Your outline is saved/);
  await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(requests.filter(r=>r.body).length,0);
  await act(async()=>{press(screen,stage==='outline'?'Retry plan outline':'Retry workouts');await flush()});assert.deepEqual(requests.filter(r=>r.body).map(r=>r.body.retryAttempt),[`${stage}-failed`]);
  await act(async()=>screen.unmount());
  // Failed revisions preserve the saved overview and never reveal an unaccepted draft's exercises.
  p.planRevision=1;p.completeReady=true;p.overview=planOverview(completeFixture(p.dates));p.jobs=[{target:'review:1',stage,status:'failed',error:'provider_error',attemptId:`${stage}-revision`,feedback:'Keep the saved week and change only timing.'}];requests.length=0;
  screen=await mountTraining();assert.match(renderedTrainingText(screen),/Steady practice/);assert.doesNotMatch(renderedTrainingText(screen),/Outdoor walking|targets per round/);assert.equal(requests.filter(r=>r.body).length,0);
  await act(async()=>{press(screen,'Retry changes');await flush()});assert.equal(requests.find(r=>r.body)?.body.retryAttempt,`${stage}-revision`);await act(async()=>screen.unmount());
 }
});

test('document weeks render all metadata before acceptance, reveal safe Markdown only after free acceptance, and protect revisions/reload',async()=>{
 const {documentFixture}=await import('../../backend/src/documentPlanFixture.ts');const {documentOverview}=await import('../../backend/src/documentPlanContract.ts');const {syntheticAnswers}=await import('../../backend/src/completePlanFixture.ts');const {intakeSummary}=await import('../../backend/src/fixedIntake.ts');
 const saved=trainingState(),p=saved.plans[0];p.dates=Array.from({length:7},(_,i)=>`2026-10-${String(i+5).padStart(2,'0')}`);const canonical=documentFixture(p.dates),requests=[];saved.summary.document=intakeSummary({version:1,answers:syntheticAnswers});
 Object.assign(p,{schemaVersion:'document-week-v1',outlineFirst:false,reviewState:'draft',planRevision:0,completeReady:false,completePlan:null,documentPlan:null,documentOverview:null,acceptedAt:null});
 let generates=0,accepts=0,reviews=0,failReview=true;
 globalThis.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):null;requests.push({url,body});
  if(url.endsWith('/generate')){generates++;p.completeReady=true;p.planRevision=1;p.documentOverview=documentOverview(canonical);p.jobs=[{target:'week',stage:null,status:'completed',error:null,attemptId:'doc-initial'}]}
  if(url.endsWith('/accept')){accepts++;assert.equal(body.planRevision,p.planRevision);p.reviewState='accepted';p.documentPlan=structuredClone(canonical);p.acceptedAt='2026-10-09T18:00:00Z';}
  if(url.endsWith('/review')){reviews++;assert.equal(body.planRevision,1);if(failReview)p.jobs.push({target:'review:1',stage:null,status:'failed',error:'invalid_document',attemptId:'doc-failed',feedback:body.feedback});else{assert.equal(body.retryAttempt,'doc-failed');canonical.days[1].sessions[0].workoutMarkdown='## Revised\n- Gentle floor flow for **10 minutes**.';p.planRevision=2;p.reviewState='draft';p.documentPlan=null;p.acceptedAt=null;p.documentOverview=documentOverview(canonical);p.jobs=p.jobs.filter(j=>j.target!=='review:1');}}
  return {status:200,json:async()=>structuredClone(saved)};
 };
 let screen=await mountTraining({generateOnOpen:true});assert.equal(generates,1);assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Skill and strength/);assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Later easy practice/);assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Evening/);assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/About 10–15 min/);assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Optional session/);assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Rest — no planned session/);assert.doesNotMatch(renderedTrainingText(screen).replace(/\s+/g,' '),/Crab reach|Cushion balance|catalog activities|two requests/i);
 await act(async()=>input(screen,'Plan feedback').props.onChangeText('Unsent change'));assert.equal(input(screen,'Use this plan').props.disabled,true);await act(async()=>screen.unmount());screen=await mountTraining();assert.equal(generates,1);assert.doesNotMatch(renderedTrainingText(screen).replace(/\s+/g,' '),/Crab reach/);
 await choosePlan(screen,true);assert.equal(accepts,1);assert.equal(generates,1);assert.doesNotMatch(renderedTrainingText(screen),/Crab reach/);await act(async()=>press(screen,'Session 1 on 2026-10-05'));assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Crab reach: 3 sets of 5–8 per side/);assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Rest 45–60 seconds between sets/);
 await act(async()=>screen.unmount());screen=await mountTraining();await act(async()=>press(screen,'Week'));await act(async()=>press(screen,'Session 1 on 2026-10-05'));assert.equal(generates,1);assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Cushion balance/);
 await act(async()=>press(screen,'Back to week'));await act(async()=>input(screen,'Plan feedback').props.onChangeText('Change Tuesday only.'));await act(async()=>{press(screen,'Update this week');await flush()});assert.equal(reviews,1);await act(async()=>press(screen,'Session 1 on 2026-10-05'));assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Cushion balance/);await act(async()=>press(screen,'Back to week'));await act(async()=>screen.unmount());screen=await mountTraining();await act(async()=>press(screen,'Week'));assert.equal(reviews,1);await act(async()=>press(screen,'Session 1 on 2026-10-05'));assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Cushion balance/);await act(async()=>press(screen,'Back to week'));failReview=false;
 await act(async()=>{press(screen,'Retry changes');await flush()});assert.equal(reviews,2);assert.doesNotMatch(renderedTrainingText(screen).replace(/\s+/g,' '),/Crab reach|Gentle floor flow/);await act(async()=>screen.unmount());screen=await mountTraining();assert.doesNotMatch(renderedTrainingText(screen).replace(/\s+/g,' '),/Crab reach|Gentle floor flow/);await choosePlan(screen);assert.equal(accepts,2);assert.equal(generates,1);assert.equal(reviews,2);await act(async()=>press(screen,'Session 1 on 2026-10-06'));assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Gentle floor flow for 10 minutes/);await act(async()=>screen.unmount());
 // Even a malformed server response cannot leak a draft's Markdown through either API field.
 p.reviewState='draft';p.acceptedAt=null;screen=await mountTraining();assert.doesNotMatch(renderedTrainingText(screen).replace(/\s+/g,' '),/Gentle floor flow|Crab reach|Skill and strength/);await act(async()=>screen.unmount());p.documentPlan=null;p.documentOverview.days[0].sessions[0].workoutMarkdown='Secret draft prose';screen=await mountTraining();assert.doesNotMatch(renderedTrainingText(screen).replace(/\s+/g,' '),/Secret draft prose|Skill and strength/);await act(async()=>screen.unmount());
});

test('workout Markdown is readable text only; HTML, links, images and code cannot execute or request remote content',async()=>{
 const {WorkoutMarkdown}=await import('./WorkoutMarkdown.tsx');const requests=[];globalThis.fetch=async(...args)=>{requests.push(args);throw Error('No network expected')};
 const source='## Warm-up\n- **Easy walk** for 3 minutes.\n1. Reach *gently* for `30 seconds`.\n![tracking](https://example.invalid/pixel)\n[Open](javascript:alert(1))\n<img src="https://example.invalid/image" onerror="alert(1)">\n<script>alert(1)</script>\n```html\n<iframe src="https://example.invalid"></iframe>\n```';
 let screen;await act(async()=>{screen=TestRenderer.create(React.createElement(WorkoutMarkdown,{source}))});const rendered=renderedTrainingText(screen).replace(/\s+/g,' ');assert.match(rendered,/Warm-up/);assert.match(rendered,/Easy walk for 3 minutes/);assert.match(rendered,/Reach gently for 30 seconds/);assert.doesNotMatch(rendered,/\*\*Easy|\[tracking\]/);assert.equal(requests.length,0);
 for(const node of screen.root.findAll(()=>true)){assert(!['Image','WebView','iframe','script'].includes(node.type));assert.equal(node.props.onPress,undefined);assert.equal(node.props.dangerouslySetInnerHTML,undefined);}
 await act(async()=>screen.unmount());
});

test('Today follows saved session order, retains date on workout back, resets focus on date change and distinguishes rest/outside',async t=>{
 t.mock.timers.setTime(new Date('2026-10-05T16:00:00Z').getTime());
 const {documentFixture}=await import('../../backend/src/documentPlanFixture.ts'),{documentOverview}=await import('../../backend/src/documentPlanContract.ts');
 const saved=trainingState(),p=saved.plans[0];p.dates=Array.from({length:7},(_,i)=>`2026-10-${String(i+5).padStart(2,'0')}`);const canonical=documentFixture(p.dates);
 Object.assign(p,{schemaVersion:'document-week-v1',outlineFirst:false,reviewState:'accepted',planRevision:1,completeReady:true,documentPlan:canonical,documentOverview:documentOverview(canonical),acceptedAt:'2026-10-05T15:00:00Z'});
 const server=trainingServer(saved),screen=await mountTraining({initialTab:'today'});assert.match(renderedTrainingText(screen),/Today\./);assert.ok(input(screen,'View workout: Skill and strength'));
 await act(async()=>press(screen,'Open session 2: Later easy practice'));assert.match(renderedTrainingText(screen).replace(/\s+/g,' '),/Easy dance practice/);
 await act(async()=>press(screen,'Back to day'));assert.ok(input(screen,'View workout: Later easy practice'));
 await act(async()=>press(screen,'Select 2026-10-06'));assert.ok(input(screen,'View workout: Skill and strength'));assert.match(renderedTrainingText(screen),/Tue, Oct 6\./);assert.doesNotMatch(renderedTrainingText(screen),/Today\./);
 await act(async()=>press(screen,'Select 2026-10-07'));assert.match(renderedTrainingText(screen),/A rest day/);
 await act(async()=>press(screen,'Week'));assert.equal(screen.root.findAllByType('Pressable').filter(x=>x.props.accessibilityRole==='tab').length,3);assert.equal(screen.root.findAllByType('ScrollView').length,1);assert.doesNotMatch(renderedTrainingText(screen),/Crab reach/);
 await act(async()=>screen.unmount());t.mock.timers.setTime(new Date('2026-10-15T16:00:00Z').getTime());const later=await mountTraining({initialTab:'today'});assert.match(renderedTrainingText(later),/Outside your saved week/);assert.doesNotMatch(renderedTrainingText(later),/A rest day/);assert.equal(server.requests.filter(r=>r.method==='POST').length,0);await act(async()=>later.unmount());
});

test('unknown acceptance and stale changes block mutations until status read, preserve feedback, and never reveal draft prose',async()=>{
 const {documentFixture}=await import('../../backend/src/documentPlanFixture.ts'),{documentOverview}=await import('../../backend/src/documentPlanContract.ts');
 const saved=trainingState(),p=saved.plans[0];p.dates=Array.from({length:7},(_,i)=>`2026-10-${String(i+5).padStart(2,'0')}`);const canonical=documentFixture(p.dates);Object.assign(p,{schemaVersion:'document-week-v1',outlineFirst:false,reviewState:'draft',planRevision:1,completeReady:true,documentPlan:null,documentOverview:documentOverview(canonical),acceptedAt:null});
 let posts=0;globalThis.fetch=async(url,options)=>{if(options.method==='POST'){posts++;if(url.endsWith('/accept'))throw Error('Lost result');return{status:409,json:async()=>({code:'plan_changed'})}}return{status:200,json:async()=>structuredClone(saved)}};
 const screen=await mountTraining();await act(async()=>{press(screen,'Use this plan');await flush()});assert.equal(posts,1);assert.ok(input(screen,'Check status'));assert.equal(input(screen,'Use this plan').props.disabled,true);assert.doesNotMatch(renderedTrainingText(screen),/Crab reach/);
 await act(async()=>{press(screen,'Check status');await flush()});await act(async()=>input(screen,'Plan feedback').props.onChangeText('Keep my exact draft.'));await act(async()=>{press(screen,'Update this week');await flush()});assert.equal(posts,2);assert.equal(input(screen,'Update this week').props.disabled,true);
 await act(async()=>{press(screen,'Check status');await flush()});assert.equal(input(screen,'Plan feedback').props.value,'Keep my exact draft.');assert.equal(input(screen,'Use this plan').props.disabled,true);
 assert.equal(hasTrainingAccess(screen),false);assert.equal(screen.root.findAllByProps({accessibilityLabel:'Back to greeting'}).length,0);assert.equal(input(screen,'Plan feedback').props.value,'Keep my exact draft.');assert.equal(posts,2);await act(async()=>screen.unmount());
});

test('account navigation preserves intake text, saved profile is read-only, and sign-out cancellation preserves the session',async()=>{
 resetAuth(alice);globalThis.__fitquestSecure.clear();const saved=fixedFixture();globalThis.fetch=async(url)=>({status:200,json:async()=>url.endsWith('/profile')?{profile:payload}:url.includes('/onboarding')?saved:{summary:null,plans:[]}});
 const screen=await mount();await act(async()=>press(screen,'Start onboarding'));await act(async()=>{press(screen,'Continue to onboarding');await flush()});await act(async()=>{input(screen,'Answer 1').props.onChangeText('Exact unsent goals.');await flush()});
 await act(async()=>press(screen,'Account'));await act(async()=>{press(screen,'Saved profile');await flush()});assert.match(renderedTrainingText(screen),/Age as recorded|AGE AS RECORDED/);assert.equal(screen.root.findAllByType('TextInput').filter(x=>x.props.accessibilityLabel==='Age (years)').length,0);
 await act(async()=>press(screen,'Account'));await act(async()=>press(screen,'Sign out'));await act(async()=>press(screen,'Stay signed in'));assert.equal(session.user.id,'alice');await act(async()=>press(screen,'Back'));assert.equal(input(screen,'Answer 1').props.value,'Exact unsent goals.');assert.equal((await privateDrafts.read('alice')).text,'Exact unsent goals.');await act(async()=>screen.unmount());
});

const {NutritionScreen,FoodTrends}=await import('./NutritionScreen.tsx');
const {privateFoodDrafts}=await import('./onboardingDraftStorage.ts');
const {foodWeek}=await import('../../backend/src/foodContract.ts');
const foodDay='2026-10-04';
function emptyFood(){return {dates:foodWeek(foodDay),today:foodDay,entries:[],days:[]}}
async function mountFood(){let screen;await act(async()=>{screen=TestRenderer.create(React.createElement(NutritionScreen,{userId:'alice',accessToken:async()=>'alice-token',onTab:()=>{}}));await flush();await flush()});return screen}
test('nutrition manual entry preserves unknowns, saves once without interpretation, shows confirmed totals and completed-day trends',async t=>{
 globalThis.__fitquestSecure.clear();const state=emptyFood(),ops=new Map();let interpretations=0,posts=0;
 globalThis.fetch=async(url,options)=>{url=String(url);if(options.method==='GET')return {status:200,json:async()=>structuredClone(url.includes('/operations/')?ops.get(url.split('/').at(-1)):state)};posts++;const cmd=JSON.parse(options.body);if(cmd.kind==='interpret')interpretations++;const op={id:cmd.operationId,status:'completed',error:null,candidate:null,entryId:'33333333-3333-4333-8333-333333333333'};if(cmd.kind==='save'){state.entries=[{id:op.entryId,revision:1,document:cmd.document,createdAt:'2026-10-04T12:00:00Z',updatedAt:'2026-10-04T12:00:00Z',deletedAt:null,undoUntil:null}];state.days=[{date:foodDay,revision:1,complete:false}]}if(cmd.kind==='complete')state.days=[{date:foodDay,revision:2,complete:true}];ops.set(op.id,op);return {status:200,json:async()=>op}};
 const screen=await mountFood();t.after(async()=>act(async()=>screen.unmount()));assert.match(text(screen),/No food logged/);await act(async()=>press(screen,'Add manually'));for(const [label,value]of [['Meal name','Synthetic lunch'],['Food 1','Test sandwich'],['Portion 1','1 sandwich'],['Calories 1 (kcal, optional)','420.25'],['Protein 1 (g, optional)','22']])await act(async()=>{input(screen,label).props.onChangeText(value);await flush()});assert.equal(input(screen,'Add to food diary').props.disabled,false);await act(async()=>{press(screen,'Add to food diary');await flush();await flush()});assert.equal(posts,1);assert.equal(interpretations,0);assert.equal(state.entries[0].document.items[0].nutrients.carbs.value,null);assert.match(text(screen),/420.3|420\.3/);assert.match(text(screen),/known subtotal/);await act(async()=>{press(screen,'Mark day complete');await flush()});await act(async()=>press(screen,'Weekly trends'));assert.match(text(screen),/1 qualifying completed|qualifying completed/);assert.match(text(screen),/No complete data/);
});
test('food lost save response checks existing operation and never reinterprets; a draft survives navigation and reopen',async t=>{
 globalThis.__fitquestSecure.clear();const state=emptyFood();let savedOp;let posts=0;globalThis.fetch=async(url,options)=>{url=String(url);if(options.method==='GET')return{status:200,json:async()=>url.includes('/operations/')?savedOp:state};posts++;const cmd=JSON.parse(options.body);savedOp={id:cmd.operationId,status:'completed',error:null,candidate:{intent:'unclear',question:'How much pasta did you eat?',document:null},entryId:null};throw Error('lost response')};
 let screen=await mountFood();await act(async()=>press(screen,'Tell AI what I ate'));await act(async()=>{input(screen,'What I ate').props.onChangeText('I had pasta.');await flush()});await act(async()=>press(screen,'Food diary'));assert.match(text(screen),/Resume food draft/);await act(async()=>screen.unmount());screen=await mountFood();t.after(async()=>act(async()=>screen.unmount()));await act(async()=>press(screen,'Resume food draft'));assert.equal(input(screen,'What I ate').props.value,'I had pasta.');await act(async()=>{press(screen,'Review with AI');await flush()});assert.equal(posts,1);assert.equal(input(screen,'Review with AI').props.disabled,true);await act(async()=>{press(screen,'Check food status');await flush()});assert.equal(posts,1);assert.match(text(screen),/How much pasta/);assert.equal((await privateFoodDrafts.read('alice')).pending,null);
});
test('food drafts are cleared with account cleanup and never read under a different account',async()=>{
 globalThis.__fitquestSecure.clear();const d={message:'Private food draft',date:foodDay,timeZone:'UTC',document:null,candidate:null,pending:null,editingId:null,editingRevision:null,savedAt:Date.now()};await privateFoodDrafts.write('alice',d);assert.equal(await privateFoodDrafts.read('bob'),null);await privateDrafts.clear('alice');assert.equal(await privateFoodDrafts.read('alice'),null);
});

const {FoodLibraryScreen}=await import('./FoodLibraryScreen.tsx');
const {libraryFromEntry}=await import('../../backend/src/foodContract.ts');
const {foodFixture}=await import('../../backend/src/foodFixture.ts');
const {privateLibraryDrafts}=await import('./onboardingDraftStorage.ts');
async function mountLibrary(extra={}){let screen;await act(async()=>{screen=TestRenderer.create(React.createElement(FoodLibraryScreen,{userId:'alice',accessToken:async()=>'alice-token',onTab:()=>{},onBack:()=>{},date:foodDay,sourceEntry:null,...extra}));await flush();await flush()});return screen}
test('library preserves editor draft, supplied/unknown nutrients, ingredient scaling, fractional logging and explicit receipts',async t=>{
 globalThis.__fitquestSecure.clear();const items=[];const posts=[];const id='66666666-6666-4666-8666-666666666666';
 globalThis.fetch=async(url,options)=>{if(options.method==='GET')return{status:200,json:async()=>({items:structuredClone(items)})};const c=JSON.parse(options.body);posts.push(c);if(c.kind==='save')items.splice(0,items.length,{id,revision:(items[0]?.revision??0)+1,document:c.document});return{status:200,json:async()=>({id:c.operationId,libraryId:id,entryId:c.kind==='log'?'77777777-7777-4777-8777-777777777777':null})}};
 let screen=await mountLibrary();await act(async()=>press(screen,'Create recipe'));for(const [key,value]of [['Recipe name','Test bowl'],['Ingredient 1','Oats'],['Base portion 1','100 g'],['calories 1 (kcal, optional)','480'],['Batch yield (servings)','2']])await act(async()=>{input(screen,key).props.onChangeText(value);await flush()});await act(async()=>screen.unmount());screen=await mountLibrary();t.after(async()=>act(async()=>screen.unmount()));await act(async()=>press(screen,'Resume library draft'));assert.equal(input(screen,'Recipe name').props.value,'Test bowl');assert.equal(input(screen,'Batch yield (servings)').props.value,'2');await act(async()=>{press(screen,'Save recipe');await flush()});assert.equal(posts.length,1);assert.equal(posts[0].document.ingredients[0].item.nutrients.protein.value,null);assert.match(text(screen),/Earlier diary entries are unchanged/);await act(async()=>press(screen,'Test bowl · v1'));await act(async()=>press(screen,'Log this meal'));await act(async()=>press(screen,'0.5 servings'));assert.match(text(screen),/120/);await act(async()=>{press(screen,'Confirm eaten — add to diary');await flush()});assert.equal(posts.at(-1).servings,.5);assert.equal(posts.at(-1).confirmConsumed,true);assert.match(text(screen),/Added to your food diary/);
});
test('unknown library result survives reopen and is recovered without duplicate save or AI; account cleanup clears it',async()=>{
 globalThis.__fitquestSecure.clear();const item={id:'66666666-6666-4666-8666-666666666666',revision:1,document:libraryFromEntry(foodFixture())};let posts=0,receipt;
 globalThis.fetch=async(url,options)=>{if(options.method==='GET')return{status:200,json:async()=>String(url).includes('/operations/')?receipt:{items:[item]}};posts++;const c=JSON.parse(options.body);receipt={id:c.operationId,libraryId:item.id,entryId:'77777777-7777-4777-8777-777777777777'};throw Error('lost acknowledgement')};
 let screen=await mountLibrary();await act(async()=>press(screen,`${item.document.name} · v1`));await act(async()=>press(screen,'Log this meal'));await act(async()=>{press(screen,'Confirm eaten — add to diary');await flush()});assert.equal(posts,1);assert.match(text(screen),/Check library status/);await act(async()=>screen.unmount());screen=await mountLibrary();await act(async()=>{press(screen,'Check library status');await flush()});assert.equal(posts,1);assert.match(text(screen),/Added to your food diary/);assert.equal((await privateLibraryDrafts.read('alice')).pending,null);assert.equal(await privateLibraryDrafts.read('bob'),null);await act(async()=>screen.unmount());await privateDrafts.clear('alice');assert.equal(await privateLibraryDrafts.read('alice'),null);
});

async function batchDocumentState(kind='draft'){
 const {documentFixture}=await import('../../backend/src/documentPlanFixture.ts'),{documentOverview}=await import('../../backend/src/documentPlanContract.ts');
 const saved=trainingState(),p=saved.plans[0];p.dates=Array.from({length:7},(_,i)=>`2026-10-${String(i+5).padStart(2,'0')}`);const document=documentFixture(p.dates);
 Object.assign(p,{schemaVersion:'document-week-v1',outlineFirst:false,reviewState:kind==='accepted'?'accepted':'draft',planRevision:kind==='history'?2:1,completeReady:true,documentPlan:kind==='accepted'?document:null,documentOverview:documentOverview(document),acceptedAt:kind==='accepted'?'2026-10-05T12:00:00Z':null});
 saved.onboarded=kind==='accepted'||kind==='history';if(kind==='history'){p.acceptedDocument={revision:1,acceptedAt:'2026-10-05T12:00:00Z',plan:structuredClone(document)};p.documentOverview.days[0].sessions[0].title='New draft session';}
 return {saved,document};
}
test('root routes new, summary-only, pending, failed, draft and accepted history from server evidence with no paid requests',async t=>{
 t.mock.timers.setTime(new Date('2026-10-20T16:00:00Z').getTime());
 for(const kind of ['new','summary-only','pending','failed','draft','accepted','history']){
  resetAuth(alice);const {saved}=await batchDocumentState(kind),requests=[];if(kind==='new'){saved.summary=null;saved.plans=[]}else if(kind==='summary-only')saved.plans=[];else if(['pending','failed'].includes(kind)){const p=saved.plans[0];p.documentOverview=null;p.completeReady=false;p.planRevision=0;p.jobs=[{target:'week',status:kind,error:kind==='failed'?'provider_error':null,attemptId:'synthetic'}]}
  globalThis.fetch=async(url,options)=>{requests.push(options.method??'GET');return{status:200,json:async()=>url.endsWith('/profile')?{profile:payload}:structuredClone(saved)}};
  let screen=await mount();assert.equal(hasTrainingAccess(screen),['accepted','history'].includes(kind),kind);assert.equal(screen.root.findAllByProps({accessibilityLabel:'Start onboarding'}).length>0,kind==='new',kind);assert.equal(screen.root.findAllByProps({accessibilityLabel:'Open nutrition'}).length,0);
  if(['accepted','history'].includes(kind))assert.match(renderedTrainingText(screen),/Outside your saved week/);if(kind==='failed')assert.ok(input(screen,'Retry weekly plan'));if(kind==='pending')assert.ok(input(screen,'Check status'));
  await act(async()=>screen.unmount());screen=await mount();assert.equal(hasTrainingAccess(screen),['accepted','history'].includes(kind));assert(requests.every(m=>m==='GET'));await act(async()=>screen.unmount());
 }
});
test('server-confirmed initial acceptance opens Today; every session tap opens its exact saved workout',async t=>{
 t.mock.timers.setTime(new Date('2026-10-05T16:00:00Z').getTime());resetAuth(alice);const {saved,document}=await batchDocumentState();let accepts=0;
 globalThis.fetch=async(url,options)=>{if(url.endsWith('/accept')){accepts++;Object.assign(saved.plans[0],{reviewState:'accepted',acceptedAt:'2026-10-05T15:00:00Z',documentPlan:document});saved.onboarded=true}else assert.equal(options.method??'GET','GET');return{status:200,json:async()=>url.endsWith('/profile')?{profile:payload}:structuredClone(saved)}};
 const screen=await mount();assert.equal(hasTrainingAccess(screen),false);const overview=renderedTrainingText(screen);for(const unwanted of ['Training summary','Prescribed work','America/New_York','Back to greeting','Reload saved training','Crab reach'])assert(!overview.includes(unwanted),unwanted);
 assert.equal(screen.root.findAllByProps({accessibilityLabel:'Training day 2026-10-05'}).length,1);assert.equal(screen.root.findAllByProps({accessibilityLabel:'Session 2 on 2026-10-05'}).length,1);
 await act(async()=>{press(screen,'Use this plan');await flush()});assert.equal(accepts,1);assert.equal(hasTrainingAccess(screen),true);assert.match(renderedTrainingText(screen),/Today\./);
 await act(async()=>press(screen,'Open session 2: Later easy practice'));assert.match(renderedTrainingText(screen),/Easy dance practice/);assert.doesNotMatch(renderedTrainingText(screen),/Crab reach/);await act(async()=>press(screen,'Back to day'));
 await act(async()=>press(screen,'Open session 1: Skill and strength'));assert.match(renderedTrainingText(screen),/Crab reach/);assert.equal(accepts,1);await act(async()=>screen.unmount());
});
test('accepted history survives a successful pending revision and relaunch without revealing draft workouts',async t=>{
 t.mock.timers.setTime(new Date('2026-10-05T16:00:00Z').getTime());resetAuth(alice);const {saved}=await batchDocumentState('history');const requests=[];
 globalThis.fetch=async(url,options)=>{requests.push(options.method??'GET');return{status:200,json:async()=>url.endsWith('/profile')?{profile:payload}:structuredClone(saved)}};
 const screen=await mount();assert.equal(hasTrainingAccess(screen),true);assert.match(renderedTrainingText(screen),/Skill and strength/);assert.doesNotMatch(renderedTrainingText(screen),/New draft session/);
 await act(async()=>press(screen,'Open session 2: Later easy practice'));assert.match(renderedTrainingText(screen),/Easy dance practice/);await act(async()=>press(screen,'Back to day'));await act(async()=>press(screen,'Week'));assert.match(renderedTrainingText(screen),/New draft session/);assert.doesNotMatch(renderedTrainingText(screen),/Crab reach|Easy dance practice/);assert.ok(input(screen,'Use this plan'));assert(requests.every(m=>m==='GET'));await act(async()=>screen.unmount());
});
test('root failures cannot masquerade as new onboarding and stale account reads cannot cross the account boundary',async()=>{
 const {saved}=await batchDocumentState('accepted');let waiting=[];globalThis.fetch=async(url,options)=>url.endsWith('/profile')?{status:200,json:async()=>({profile:payload})}:new Promise(resolve=>waiting.push({resolve,signal:options.signal}));
 let screen;const props=userId=>({userId,accessToken:async()=>userId});await act(async()=>{screen=TestRenderer.create(React.createElement(ProfileIntakeForm,props('alice')));await flush()});assert.equal(hasTrainingAccess(screen),false);assert.equal(screen.root.findAllByProps({accessibilityLabel:'Start onboarding'}).length,0);
 await act(async()=>{screen.update(React.createElement(ProfileIntakeForm,props('bob')));await flush()});assert(waiting[0].signal.aborted);
 await act(async()=>{waiting[0].resolve({status:200,json:async()=>saved});waiting[1].resolve({status:503,json:async()=>({})});await flush()});assert.equal(hasTrainingAccess(screen),false);assert.equal(screen.root.findAllByProps({accessibilityLabel:'Start onboarding'}).length,0);assert.ok(input(screen,'Retry loading saved progress'));
 globalThis.fetch=async()=>({status:200,json:async()=>saved});await act(async()=>{press(screen,'Retry loading saved progress');await flush()});assert.equal(hasTrainingAccess(screen),true);await act(async()=>screen.unmount());
});

test('new exercise rows stay private until acceptance, render exact ordered plain text without repeated goals, and reopen free',async t=>{
 t.mock.timers.setTime(new Date('2026-10-05T16:00:00Z').getTime());resetAuth(alice);
 const {rowDocumentFixture}=await import('../../backend/src/documentPlanFixture.ts'),{documentOverview}=await import('../../backend/src/documentPlanContract.ts');
 const {saved}=await batchDocumentState(),p=saved.plans[0],document=rowDocumentFixture(p.dates);p.schemaVersion='document-week-v2';p.documentOverview=documentOverview(document);let posts=0;
 document.days[1].sessions[0].exercises=[{exercise:'Literal <script> row',prescription:'<img src="https://example.test/x"> Hold 30 seconds; rest 45 seconds. [No remote link](https://example.test).'}];
 globalThis.fetch=async(url,options)=>{if(url.endsWith('/accept')){posts++;Object.assign(p,{reviewState:'accepted',acceptedAt:'2026-10-05T15:00:00Z',documentPlan:document});saved.onboarded=true}else assert.equal(options.method??'GET','GET');return{status:200,json:async()=>url.endsWith('/profile')?{profile:payload}:structuredClone(saved)}};
 let screen=await mount();t.after(async()=>act(async()=>screen.unmount()));assert.doesNotMatch(renderedTrainingText(screen),/Dumbbell squat|prescription|200 m|Crab reach/);assert.equal(input(screen,'Session 1 on 2026-10-05').props.disabled,true);
 await act(async()=>{press(screen,'Use this plan');await flush()});await act(async()=>press(screen,'Open session 1: Skill and strength'));
 const content=renderedTrainingText(screen);assert.doesNotMatch(content,/Build confident movement|Weekly approach|workoutMarkdown/);
 const texts=screen.root.findAllByType('Text').map(n=>n.props.children).filter(x=>typeof x==='string');
 for(const row of document.days[0].sessions[0].exercises){assert(texts.includes(row.exercise));assert(texts.includes(row.prescription));}
 assert(texts.indexOf('Dumbbell squat')<texts.indexOf('Run / walk intervals'));
 await act(async()=>press(screen,'Back to day'));await act(async()=>press(screen,'Open session 2: Later easy practice'));assert.match(renderedTrainingText(screen),/10–15 minutes; pause for 30 seconds/);assert.doesNotMatch(renderedTrainingText(screen),/Dumbbell squat/);
 await act(async()=>screen.unmount());screen=await mount();await act(async()=>press(screen,'Select 2026-10-06'));await act(async()=>press(screen,'Open session 1: Skill and strength'));assert.match(renderedTrainingText(screen),/Literal <script> row/);assert.equal(screen.root.findAll(n=>typeof n.type==='string'&&['WebView','Image','a'].includes(n.type)).length,0);assert.equal(posts,1);
});
test('new pending revision keeps legacy accepted Markdown accessible without confusing the saved versions',async t=>{
 t.mock.timers.setTime(new Date('2026-10-05T16:00:00Z').getTime());resetAuth(alice);const {saved}=await batchDocumentState('history');saved.plans[0].schemaVersion='document-week-v2';
 globalThis.fetch=async(url,options)=>{assert.equal(options.method??'GET','GET');return{status:200,json:async()=>url.endsWith('/profile')?{profile:payload}:structuredClone(saved)}};
 const screen=await mount();t.after(async()=>act(async()=>screen.unmount()));assert(hasTrainingAccess(screen));await act(async()=>press(screen,'Open session 1: Skill and strength'));assert.match(renderedTrainingText(screen),/Crab reach/);await act(async()=>press(screen,'Back to day'));await act(async()=>press(screen,'Week'));assert.doesNotMatch(renderedTrainingText(screen),/Crab reach/);assert.equal(input(screen,'Session 1 on 2026-10-05').props.disabled,true);
});
