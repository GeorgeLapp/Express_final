import { initDB } from './db.mjs';

async function main() {
  const db = await initDB();
  await db.run('UPDATE events SET results = NULL;');
  console.log('Все результаты очищены (results = NULL)');
}

main().catch(console.error); 