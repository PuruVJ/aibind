import { AIServer } from '@aibind/svelte/server';
import { models } from '../models.server';

export const googleAi = new AIServer(models.google);
