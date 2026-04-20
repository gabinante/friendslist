import { execSync } from 'child_process';

/**
 * Kill and remove orphan friendlist-session-* containers from previous crashes.
 * Called at server startup when Docker mode is enabled.
 */
export function cleanupOrphans(): void {
  try {
    const output = execSync(
      'docker ps -a --filter "name=friendlist-session-" --format "{{.Names}}"',
      { encoding: 'utf-8' }
    ).trim();

    if (!output) return;

    const containers = output.split('\n').filter(Boolean);
    for (const name of containers) {
      try {
        console.log(`Cleaning up orphan container: ${name}`);
        execSync(`docker rm -f ${name}`, { stdio: 'ignore' });
      } catch {
        console.warn(`Failed to remove orphan container: ${name}`);
      }
    }

    if (containers.length > 0) {
      console.log(`Cleaned up ${containers.length} orphan container(s)`);
    }
  } catch {
    // Docker may not be available; that's fine at this point
    console.warn('Could not check for orphan containers (Docker may not be running)');
  }
}

/** Force-kill a specific container by name */
export function killContainer(name: string): void {
  try {
    execSync(`docker rm -f ${name}`, { stdio: 'ignore' });
  } catch {
    // Container may already be gone
  }
}
