import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

(async () => {
  try {
    const { runDailyBankAuditAndAutofill } = await import('../services/bankLifecycleService.js');
    const result = await runDailyBankAuditAndAutofill(null, { batchSize: 30 });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('bank_audit failed:', error.message);
    process.exit(1);
  }
})();
