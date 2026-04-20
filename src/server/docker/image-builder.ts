import { execSync, spawn } from 'child_process';
import { resolve } from 'path';
import type { DockerConfig } from '../config/docker.js';

/** Check if the Docker image already exists locally */
function imageExists(image: string): boolean {
  try {
    execSync(`docker image inspect ${image}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Build the friendlist sandbox Docker image */
export async function buildImage(config: DockerConfig): Promise<void> {
  const projectRoot = resolve(import.meta.dirname, '../../..');

  return new Promise<void>((resolve, reject) => {
    console.log(`Building Docker image ${config.image}...`);

    const child = spawn('docker', [
      'build',
      '-t', config.image,
      '-f', 'docker/Dockerfile',
      '.',
    ], {
      cwd: projectRoot,
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`Docker image ${config.image} built successfully`);
        resolve();
      } else {
        reject(new Error(`Docker build failed with exit code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/** Ensure the Docker image exists, building it if necessary */
export async function ensureImageExists(config: DockerConfig): Promise<void> {
  if (imageExists(config.image)) {
    console.log(`Docker image ${config.image} already exists`);
    return;
  }

  if (!config.buildOnStart) {
    throw new Error(
      `Docker image ${config.image} not found and buildOnStart is disabled. ` +
      `Build it manually with: docker build -t ${config.image} -f docker/Dockerfile .`
    );
  }

  await buildImage(config);
}
