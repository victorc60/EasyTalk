import fs from 'node:fs';

// Explicit, additive migrations needed by queue:sync before the bot starts.
// Do not use global sync({ alter/force }) or execute arbitrary migration files.
const MIGRATIONS = [
  '001_content_deliveries.sql',
  '002_bank_automation.sql',
  '003_content_identities.sql',
];

export async function ensureContentSchema(database) {
  const statements = MIGRATIONS.flatMap(file => {
    const sql = fs.readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
    return sql.split(';').map(statement => statement.trim()).filter(Boolean).map(statement => {
      if (!/^CREATE TABLE IF NOT EXISTS\s+[a-z_]+\s*\(/i.test(statement)) {
        throw new Error(`Non-additive statement in content migration ${file}`);
      }
      return { file, statement };
    });
  });
  for (const { file, statement } of statements) {
    try {
      await database.query(statement);
    } catch (error) {
      throw new Error(`Content migration ${file} failed: ${error.message}`, { cause: error });
    }
  }
}
