import { AIRemote } from '@aibind/sveltekit/remote';
import { models } from '../models.server';

export const googleAi = new AIRemote(models.google);
