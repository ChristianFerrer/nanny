import { scenario as s1 } from './01-corrections-and-teachings';
import { scenario as s2 } from './02-silence-cases';
import { scenario as s3 } from './03-learning-queue-resolution';
import { scenario as s4 } from './04-mixed-realistic';
import { scenario as s5 } from './05-events-and-routines';
import { scenario as s6 } from './06-emotional-conflict';
import { scenario as s7 } from './07-medical-info';
import type { Scenario } from '../types';

export const ALL_SCENARIOS: Scenario[] = [s1, s2, s3, s4, s5, s6, s7];

export function getScenarioById(id: string): Scenario | undefined {
  return ALL_SCENARIOS.find(s => s.id === id);
}
