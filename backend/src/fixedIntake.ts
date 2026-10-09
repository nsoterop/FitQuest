import { OnboardingError } from './onboardingError.js';
import type { TrainingSummary } from './trainingSummary.js';

export const intakeQuestions=[
  'What would you like to achieve with your training?',
  'What does your current activity or training look like?',
  'What equipment and training facilities do you have access to?',
  "What would you like your training schedule to look like—days available, time per session, and whether you're open to multiple sessions per day? You can leave the arrangement up to the coach.",
  'Are there any injuries, pain, medical restrictions or other limitations your plan should account for? “None” is fine.',
] as const;
export const intakeCategories=['goals','experience','equipment','availability','limitations'] as const;
export type FixedIntake={version:1;answers:string[]};
export function checkedIntake(value:FixedIntake,complete=false):FixedIntake {
  if(value?.version!==1||!Array.isArray(value.answers)||value.answers.length>5||(complete&&value.answers.length!==5)||value.answers.some(s=>typeof s!=='string'||!s.trim()||s.length>4000))throw new OnboardingError(422,'invalid_intake');
  return value;
}
export function intakeSummary(intake:FixedIntake):TrainingSummary {
  return checkedIntake(intake,true).answers.map((text,intakeIndex)=>({category:intakeCategories[intakeIndex]!,text,origin:'user_report',intakeIndex}));
}
export function intakeAnswers(summary:TrainingSummary):string[]|undefined {
  if(!summary.some(f=>f.intakeIndex!==undefined))return;
  if(summary.length!==5||summary.some((f,i)=>f.intakeIndex!==i||f.category!==intakeCategories[i]||f.origin!=='user_report'||f.goals!=null||f.nutritionInput!=null))throw new OnboardingError(422,'invalid_intake');
  return checkedIntake({version:1,answers:summary.map(f=>f.text)},true).answers;
}
export const intakeDisclosure='Planning is for adults 18+. These five answers are saved privately, exactly as submitted. No AI is used during intake. Generate plan sends your answers to OpenAI in one request to create your complete week and written workouts. Only its outline is shown first. Use this plan reveals the saved exercises without another AI request. Submitted planning answers and plans remain private; intake revisions and the device draft are removed after submission. Provider retention and backups are separate.';
