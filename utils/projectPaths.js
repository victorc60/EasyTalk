import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');

export function dataFilePath(...segments) {
  return path.join(DATA_DIR, ...segments);
}
