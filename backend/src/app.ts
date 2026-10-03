import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Account, VerifyAccount } from './auth.js';
import type { ProfileInput, ProfileStore } from './profileStore.js';
import { commandSchema, idSchema, type OnboardingService } from './onboarding.js';
import { OnboardingError, type Command } from './onboardingDomain.js';

export function buildApp(logger: FastifyServerOptions['logger'] = false,
  options: { store?: ProfileStore; verifyAccount?: VerifyAccount; onboarding?: OnboardingService } = {}) {
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  const accounts = new WeakMap<object, Account>();

  const requireAccount: import('fastify').onRequestAsyncHookHandler = async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    let account: Account | null = null;
    try {
      if (match && options.verifyAccount) account = await options.verifyAccount(match[1]!);
      if (account && options.store && !await options.store.sessionActive(account)) account = null;
    } catch {
      return reply.code(503).send({ message: 'Unable to verify your session. Please try again.' });
    }
    if (!account) {
      return reply.code(401).send({ message: 'Sign in to access your profile.' });
    }
    accounts.set(request, account);
  };

  app.get('/health', async () => ({ service: 'fitquest-api', status: 'ok' }));

  const textField = { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' };
  app.post<{ Body: ProfileInput }>('/profile-intake', {
    logLevel: 'silent',
    bodyLimit: 4096,
    onRequest: requireAccount,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['firstName', 'lastName', 'height', 'age', 'weight', 'gender'],
        properties: {
          firstName: textField,
          lastName: textField,
          gender: textField,
          age: { type: 'integer', minimum: 1, maximum: 130 },
          height: {
            type: 'object', additionalProperties: false, required: ['value', 'unit'],
            properties: {
              value: { type: 'integer', minimum: 1, maximum: 120 },
              unit: { type: 'string', const: 'in' },
            },
          },
          weight: {
            type: 'object', additionalProperties: false, required: ['value', 'unit'],
            properties: {
              value: { type: 'number', exclusiveMinimum: 0, maximum: 1500 },
              unit: { type: 'string', const: 'lb' },
            },
          },
        },
      },
    },
    // Never echo parser errors or submitted values into responses or logs.
    errorHandler(error, _request, reply) {
      const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode : 500;
      return reply.code(status).send({ message: status < 500
        ? 'Check all six fields and use inches and pounds.'
        : 'Unable to submit right now. Please try again.' });
    },
  }, async (request, reply) => {
    try {
      if (!options.store) throw new Error('Profile storage unavailable.');
      await options.store.save(accounts.get(request)!, request.body);
      return { message: 'User Data Saved' };
    } catch {
      return reply.code(503).send({ message: 'Unable to save your profile. Please try again.' });
    }
  });

  app.get('/profile', { logLevel: 'silent', onRequest: requireAccount,
    errorHandler(_error, _request, reply) {
      return reply.code(503).send({ message: 'Unable to load your profile. Please try again.' });
    },
  }, async (request, reply) => {
    try {
      if (!options.store) throw new Error('Profile storage unavailable.');
      return { profile: await options.store.read(accounts.get(request)!) };
    } catch {
      return reply.code(503).send({ message: 'Unable to load your profile. Please try again.' });
    }
  });

  // Bound malformed/unauthenticated traffic too; bounded memory, no stored IP history.
  const onboardingRates=new Map<string,{until:number;count:number}>();
  const onboardingAccount:import('fastify').onRequestAsyncHookHandler=async(request,reply)=>{
    reply.header('Cache-Control','no-store');const now=Date.now();
    for(const [key,value] of onboardingRates)if(value.until<=now)onboardingRates.delete(key);
    let rate=onboardingRates.get(request.ip);
    if(!rate&&onboardingRates.size<1000){rate={until:now+60000,count:0};onboardingRates.set(request.ip,rate)}
    if(!rate||++rate.count>120)return reply.code(429).send({code:'rate_limit',message:'Please try again later.'});
    await requireAccount.call(app,request,reply);
  };
  const privateRoute = {logLevel:'silent' as const,onRequest:onboardingAccount,bodyLimit:8192,
    errorHandler(error:import('fastify').FastifyError,_request:import('fastify').FastifyRequest,reply:import('fastify').FastifyReply) {
      const status=error instanceof OnboardingError?error.status:error.statusCode && error.statusCode>=400 && error.statusCode<500?error.statusCode:503;
      return reply.code(status).send({code:error instanceof OnboardingError?error.code:status<500?'invalid_request':'unavailable',message:'Unable to complete onboarding. Please retry.'});
    }};
  const onboarding=()=>{if(!options.onboarding) throw new OnboardingError(503,'unavailable'); return options.onboarding};
  app.post('/onboarding',{...privateRoute,schema:{body:{type:'object',additionalProperties:false,required:['disclosureVersion'],properties:{disclosureVersion:{const:'onboarding-adults-v1'}}}}},async request=>onboarding().create(accounts.get(request)!));
  app.get<{Params:{id:string}}>('/onboarding/:id',{...privateRoute,schema:{params:idSchema}},async request=>onboarding().read(accounts.get(request)!,request.params.id));
  app.post<{Params:{id:string};Body:Command}>('/onboarding/:id/commands',{...privateRoute,schema:{params:idSchema,body:commandSchema}},async request=>{
    const account=accounts.get(request)!;
    return onboarding().command(account,request.params.id,request.body,async()=>{
      try {
        const next=await options.verifyAccount!(request.headers.authorization!.slice(7));
        return next?.userId===account.userId && next.sessionId===account.sessionId;
      }catch{return false}
    });
  });
  app.delete<{Params:{id:string}}>('/onboarding/:id',{...privateRoute,schema:{params:idSchema}},async(request,reply)=>{
    await onboarding().remove(accounts.get(request)!,request.params.id); return reply.code(204).send();
  });
  return app;
}
