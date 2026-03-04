import type { SvaiConfig, ServerConfig, LanguageModel } from '../types.js';

// Client-side config
let _config: SvaiConfig | null = $state(null);

// Server-side config (module-level, no runes needed)
let _serverConfig: ServerConfig | null = null;

/** Configure svai for client-side use */
export function createAI(config: SvaiConfig): SvaiConfig {
	_config = config;
	return config;
}

/** Configure svai for server-side use */
export function configureServer(config: ServerConfig): void {
	_serverConfig = config;
}

/** Get the current client config (throws if not initialized) */
export function getConfig(): SvaiConfig {
	if (!_config) {
		throw new Error(
			'svai: No configuration found. Call createAI({ model: ... }) before using svai primitives.'
		);
	}
	return _config;
}

/** Get the server config (throws if not initialized) */
export function getServerConfig(): ServerConfig {
	if (!_serverConfig) {
		throw new Error(
			'svai/server: No configuration found. Call configureServer({ model: ... }) first.'
		);
	}
	return _serverConfig;
}

/** Resolve a model — use override if provided, otherwise fall back to config default */
export function getModel(override?: LanguageModel): LanguageModel {
	if (override) return override;
	return getConfig().model;
}

/** Resolve server model */
export function getServerModel(override?: LanguageModel): LanguageModel {
	if (override) return override;
	return getServerConfig().model;
}

/** Get the base URL for streaming endpoints */
export function getBaseUrl(): string {
	return _config?.baseUrl ?? '/api/svai';
}
