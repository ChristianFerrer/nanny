import { scenario as s1 } from './01-corrections-and-teachings';
import { scenario as s2 } from './02-silence-cases';
import { scenario as s3 } from './03-learning-queue-resolution';
import { scenario as s4 } from './04-mixed-realistic';
import type { Scenario } from '../types';

export const ALL_SCENARIOS: Scenario[] = [s1, s2, s3, s4];

export function getScenarioById(id: string): Scenario | undefined {
  return ALL_SCENARIOS.find(s => s.id === id);
}
