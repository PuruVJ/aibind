import { AIServer } from 'svai/server';
import { models } from '../models.server';

export const googleAi = new AIServer(models.google);
