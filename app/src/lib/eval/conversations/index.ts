import { conversation as organized } from './01-organized';
import { conversation as chaotic } from './02-chaotic';
import { conversation as shortMessages } from './03-short-messages';
import { conversation as planChangers } from './04-plan-changers';
import { conversation as unequalLoad } from './05-unequal-load';
import { conversation as bilingual } from './06-bilingual';
import { conversation as newborn } from './07-newborn';
import { conversation as daycarePrimary } from './08-daycare-primary';
import { conversation as argueResponsibilities } from './09-argue-responsibilities';
import { conversation as lovingMessy } from './10-loving-messy';
import type { SyntheticConversation } from '../types';

export const allConversations: SyntheticConversation[] = [
  organized,
  chaotic,
  shortMessages,
  planChangers,
  unequalLoad,
  bilingual,
  newborn,
  daycarePrimary,
  argueResponsibilities,
  lovingMessy,
];
