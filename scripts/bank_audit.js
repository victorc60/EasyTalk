import { runDailyBankAuditAndAutofill } from '../services/bankLifecycleService.js';

(async () => {
  try {
    const result = await runDailyBankAuditAndAutofill(null, { batchSize: 30 });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('bank_audit failed:', error.message);
    process.exit(1);
  }
})();
