import { homedir } from 'os';
import { join } from 'path';

export interface DockerFirewallConfig {
  enabled: boolean;
  allowedHosts: string[];
}

export interface DockerCredentialsConfig {
  mode: 'api-key' | 'mount-claude-dir';
  anthropicApiKey?: string;
}

export interface DockerConfig {
  enabled: boolean;
  image: string;
  buildOnStart: boolean;
  memory: string;
  cpus: string;
  pidsLimit: number;
  firewall: DockerFirewallConfig;
  credentials: DockerCredentialsConfig;
  claudeDataDir: string;
}

export function loadDockerConfig(): DockerConfig {
  const enabled = process.env.FRIENDLIST_DOCKER_ENABLED === 'true';

  const allowedHosts = process.env.FRIENDLIST_DOCKER_ALLOWED_HOSTS
    ? process.env.FRIENDLIST_DOCKER_ALLOWED_HOSTS.split(',').map(h => h.trim())
    : ['api.anthropic.com', 'registry.npmjs.org', 'github.com'];

  const credMode = process.env.FRIENDLIST_DOCKER_CRED_MODE === 'mount-claude-dir'
    ? 'mount-claude-dir' as const
    : 'api-key' as const;

  return {
    enabled,
    image: process.env.FRIENDLIST_DOCKER_IMAGE ?? 'friendlist-sandbox:latest',
    buildOnStart: process.env.FRIENDLIST_DOCKER_BUILD_ON_START !== 'false',
    memory: process.env.FRIENDLIST_DOCKER_MEMORY ?? '4g',
    cpus: process.env.FRIENDLIST_DOCKER_CPUS ?? '2',
    pidsLimit: parseInt(process.env.FRIENDLIST_DOCKER_PIDS_LIMIT ?? '256'),
    firewall: {
      enabled: process.env.FRIENDLIST_DOCKER_FIREWALL === 'true',
      allowedHosts,
    },
    credentials: {
      mode: credMode,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    },
    claudeDataDir: process.env.FRIENDLIST_DOCKER_CLAUDE_DATA_DIR
      ?? join(homedir(), '.friendlist', 'claude-data'),
  };
}
