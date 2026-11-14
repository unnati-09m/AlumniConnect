import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ensures environment variables from server/.env are loaded stably
 * regardless of whether commands are started from project root or server/.
 */
export function loadEnv() {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../');
  const candidates = [
    path.join(serverDir, '.env'),
    path.resolve(process.cwd(), 'server/.env'),
    path.resolve(process.cwd(), '.env')
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        return envPath;
      } catch {
        // Fall back to next candidate
      }
    }
  }
  return null;
}

loadEnv();
