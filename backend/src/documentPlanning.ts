import {Ajv} from 'ajv';
import {documentPlanVersion,validDocument,type DocumentPlan} from './documentPlanContract.js';
import {intakeAnswers} from './fixedIntake.js';
import {OnboardingError} from './onboardingError.js';
import {CompleteValidationError} from './planDiagnostics.js';
import type {PlanningInput} from './planningDomain.js';
import type {OnboardingProvider} from './onboardingProvider.js';
import {weeklyLimits} from './weeklyPlanning.js';
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const text=(maxLength:number)=>({type:'string',minLength:1,maxLength});
export const documentWireName='document_week_v1';
export const documentSchema=object({days:{type:'array',minItems:7,maxItems:7,items:object({date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},sessions:{type:'array',maxItems:12,items:object({title:text(160),goal:text(600),timing:{anyOf:[text(600),{type:'null'}]},durationMinutes:object({min:{type:'number',minimum:1,maximum:1440},max:{type:'number',minimum:1,maximum:1440}}),optional:{type:'boolean'},workoutMarkdown:text(12000)})}})}});
const validate=new Ajv({strict:true}).compile<DocumentPlan>(documentSchema);
export function documentPrompt(answers:string[],dates:string[]){return `I want you to come up with an exercise plan for me. My goals are: ${answers[0]}. My current activity is: ${answers[1]}. My available equipment is: ${answers[2]}. My training preferences are: ${answers[3]}. My limitations are: ${answers[4]}.

Build the complete Monday–Sunday week, ${dates[0]} through ${dates[6]} inclusive, to help me achieve my goals. Choose the schedule and activities around my preferences, availability, equipment and limitations. Include the full week, even if some days have passed.

Return each day's sessions with a title, goal, timing if useful (otherwise null), approximate duration range in minutes, optionality, and the complete workout in workoutMarkdown. Rest days have empty session lists. Write clear, readable workout prescriptions with explicit units and recovery in Markdown. Use headings and lists where helpful. Return only the provided display schema.`;}
export function prepareDocument(provider:OnboardingProvider,input:PlanningInput){
 const answers=intakeAnswers(input.summary);if(!answers)throw new OnboardingError(409,'summary_needs_correction');
 let prompt=documentPrompt(answers,input.dates);
 if(input.documentReview)prompt+=`\n\nRevise this saved week according to my feedback. Preserve the work I ask to keep and return the complete updated week.\nFeedback:\n${input.documentReview.feedback}\nSaved week:\n${JSON.stringify(input.documentReview.plan)}`;
 const body=JSON.stringify({model:provider.model,store:false,stream:false,truncation:'disabled',service_tier:'default',reasoning:{effort:'low'},max_output_tokens:weeklyLimits.outputTokens,input:prompt,text:{format:{type:'json_schema',name:documentWireName,strict:true,schema:documentSchema}}});
 if(Buffer.byteLength(body)>weeklyLimits.inputBytes)throw new OnboardingError(422,'planning_context_limit');
 return {body,reserveMicro:provider.cost({input:Buffer.byteLength(body),output:weeklyLimits.outputTokens,cached:0,cacheWrite:0})};
}
export function checkDocument(value:unknown,input:PlanningInput):DocumentPlan{
 if(!validate(value))throw new CompleteValidationError('invalid_document',{stage:'schema',rule:'shape'});
 if(!validDocument(value,input.dates))throw new CompleteValidationError('invalid_document',{stage:'structure',rule:'overview'});
 if(Buffer.byteLength(JSON.stringify(value))>weeklyLimits.responseBytes)throw new CompleteValidationError('invalid_document',{stage:'integrity',rule:'size'});
 return value;
}
export {documentPlanVersion};
