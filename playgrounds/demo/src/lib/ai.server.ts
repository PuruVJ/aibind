import { configureServer } from 'svai/server';
import { anthropic } from '@ai-sdk/anthropic';

// Server-side config — uses actual provider instance
configureServer({
	model: anthropic('claude-sonnet-4-20250514')
});
