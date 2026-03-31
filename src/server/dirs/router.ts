import type { FastifyInstance } from 'fastify';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { homedir } from 'os';

interface DirEntry {
  path: string;
  name: string;
  isGitRepo: boolean;
}

/**
 * Recursively find git repos up to a given depth.
 */
function findGitRepos(root: string, maxDepth: number, depth = 0): DirEntry[] {
  if (depth > maxDepth || !existsSync(root)) return [];

  const results: DirEntry[] = [];
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    const hasGit = entries.some(e => e.name === '.git' && e.isDirectory());

    if (hasGit) {
      results.push({
        path: root,
        name: root.split('/').pop() ?? root,
        isGitRepo: true,
      });
      // Don't recurse into git repos
      return results;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push(...findGitRepos(join(root, entry.name), maxDepth, depth + 1));
    }
  } catch {
    // Permission denied or similar — skip
  }
  return results;
}

/**
 * List immediate subdirectories of a path.
 */
function listSubdirs(dir: string): DirEntry[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => {
        const full = join(dir, e.name);
        const isGitRepo = existsSync(join(full, '.git'));
        return { path: full, name: e.name, isGitRepo };
      })
      .sort((a, b) => {
        // Git repos first, then alphabetical
        if (a.isGitRepo !== b.isGitRepo) return a.isGitRepo ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}

export function registerDirRoutes(app: FastifyInstance): void {
  // Discover git repos under common development directories
  app.get('/api/dirs/repos', async () => {
    const home = homedir();
    const searchPaths = [
      join(home, 'git'),
      join(home, 'src'),
      join(home, 'projects'),
      join(home, 'code'),
      join(home, 'dev'),
      join(home, 'repos'),
      join(home, 'workspace'),
      join(home, 'Documents', 'code'),
      join(home, 'Documents', 'projects'),
    ];

    const repos: DirEntry[] = [];
    const seen = new Set<string>();

    for (const searchPath of searchPaths) {
      for (const repo of findGitRepos(searchPath, 2)) {
        if (!seen.has(repo.path)) {
          seen.add(repo.path);
          repos.push(repo);
        }
      }
    }

    // Sort alphabetically by name
    repos.sort((a, b) => a.name.localeCompare(b.name));
    return repos;
  });

  // Browse a directory's children
  app.get<{ Querystring: { path?: string } }>('/api/dirs/browse', async (req) => {
    const dir = req.query.path ?? homedir();
    const resolved = resolve(dir);

    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      return { path: resolved, parent: dirname(resolved), entries: [] };
    }

    return {
      path: resolved,
      parent: dirname(resolved),
      entries: listSubdirs(resolved),
    };
  });
}
