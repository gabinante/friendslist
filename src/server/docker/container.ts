import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { ClaudeProcess } from '../session/process.js';
import type { DockerConfig } from '../config/docker.js';
import type { ImageAttachment } from '../../shared/types.js';

/** Build the `docker run` args for a sandboxed Claude session */
function buildDockerArgs(config: {
  dockerConfig: DockerConfig;
  sessionId: string;
  resumeSessionId?: string;
  sessionName?: string;
  cwd: string;
  model: string;
  prompt: string;
}): string[] {
  const dc = config.dockerConfig;
  const containerName = `friendlist-session-${config.sessionId}`;

  // Ensure claude-data dir exists on host
  mkdirSync(dc.claudeDataDir, { recursive: true });

  const args: string[] = [
    'run', '--rm', '-i',
    '--name', containerName,
    '--memory', dc.memory,
    '--cpus', dc.cpus,
    '--pids-limit', String(dc.pidsLimit),
  ];

  // Firewall capabilities
  if (dc.firewall.enabled) {
    args.push('--cap-add', 'NET_ADMIN', '--cap-add', 'NET_RAW');
    args.push('-e', `FRIENDLIST_FIREWALL=true`);
    args.push('-e', `FRIENDLIST_ALLOWED_HOSTS=${dc.firewall.allowedHosts.join(',')}`);
  }

  // Credentials
  if (dc.credentials.mode === 'api-key' && dc.credentials.anthropicApiKey) {
    args.push('-e', `ANTHROPIC_API_KEY=${dc.credentials.anthropicApiKey}`);
  } else if (dc.credentials.mode === 'mount-claude-dir') {
    args.push('-v', `${join(homedir(), '.claude')}:/host-claude:ro`);
  }

  // Volume mounts
  args.push('-v', `${config.cwd}:/workspace:delegated`);
  args.push('-v', `${dc.claudeDataDir}:/home/claude/.claude:delegated`);

  // Image attachment mount (read-only)
  const tempImageDir = join('/tmp', 'friendlist-images');
  mkdirSync(tempImageDir, { recursive: true });
  args.push('-v', `${tempImageDir}:${tempImageDir}:ro`);

  // Linux Docker Desktop compatibility
  args.push('--add-host', 'host.docker.internal:host-gateway');

  // Image
  args.push(dc.image);

  // Build the claude command that runs inside the container
  const port = process.env.PORT ?? '3456';
  const mcpConfig = JSON.stringify({
    mcpServers: {
      friendlist: {
        type: 'stdio',
        command: 'npx',
        args: ['tsx', '/opt/friendlist-mcp/server.ts'],
        env: {
          FRIENDLIST_SESSION_ID: config.sessionId,
          FRIENDLIST_SESSION_NAME: config.sessionName ?? '',
          FRIENDLIST_API: `http://host.docker.internal:${port}/api`,
        },
      },
    },
  });

  // The entrypoint expects the command as arguments
  const claudeArgs = [
    'claude', '-p', config.prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--model', config.model,
    '--dangerously-skip-permissions',
    '--mcp-config', mcpConfig,
  ];

  if (config.resumeSessionId) {
    claudeArgs.push('--resume', config.resumeSessionId);
  } else {
    claudeArgs.push('--session-id', config.sessionId);
  }

  // Pass the whole claude command as a single string to the entrypoint
  args.push(claudeArgs.join(' '));

  return args;
}

/**
 * Spawn a Claude session inside a Docker container.
 * Returns a ClaudeProcess with the same interface as the host spawn path.
 */
export function spawnClaudeOneShotDocker(config: {
  sessionId: string;
  resumeSessionId?: string;
  sessionName?: string;
  cwd: string;
  model: string;
  prompt: string;
  images?: ImageAttachment[];
  dockerConfig: DockerConfig;
}): ClaudeProcess {
  const proc = new ClaudeProcess({
    id: config.sessionId,
    claudeSessionId: config.sessionId,
    name: config.sessionName ?? '',
    cwd: config.cwd,
    model: config.model,
  });

  // Handle images: write to shared temp dir so container can access them
  let prompt = config.prompt;
  if (config.images && config.images.length > 0) {
    const { writeFileSync } = require('fs');
    const tempDir = join('/tmp', 'friendlist-images');
    mkdirSync(tempDir, { recursive: true });

    const ext: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };

    const paths: string[] = [];
    for (let i = 0; i < config.images.length; i++) {
      const img = config.images[i];
      const suffix = ext[img.mediaType] ?? '.png';
      const filePath = join(tempDir, `${config.sessionId}-${Date.now()}-${i}${suffix}`);
      writeFileSync(filePath, Buffer.from(img.data, 'base64'));
      paths.push(filePath);
    }

    const imageRefs = paths.join('\n');
    prompt = `${config.prompt}\n\n[The user has attached ${paths.length} image(s). Read them with the Read tool before responding.]\n${imageRefs}`;
  }

  const dockerArgs = buildDockerArgs({
    ...config,
    prompt,
  });

  const child = spawn('docker', dockerArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Store container name for cleanup
  const containerName = `friendlist-session-${config.sessionId}`;
  (proc as unknown as Record<string, unknown>)._containerName = containerName;

  // Wire up event handling (same as host path)
  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        proc.emit('message', msg);
        if (msg.type === 'result') proc.emit('result', msg);
        else if (msg.type === 'assistant') proc.emit('assistant', msg);
        else if (msg.type === 'system') proc.emit('system', msg);
      } catch {
        proc.emit('raw', line);
      }
    });
  }

  if (child.stderr) {
    const rl = createInterface({ input: child.stderr });
    rl.on('line', (line) => proc.emit('stderr', line));
  }

  child.on('exit', (code, signal) => proc.emit('exit', { code, signal }));
  child.on('error', (err) => proc.emit('error', err));

  return proc;
}
