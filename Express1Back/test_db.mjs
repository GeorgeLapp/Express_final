import { initDB } from './db.mjs';

async function testDB() {
  const db = await initDB();

  // Тест: вставка пользователя
  await db.run('DELETE FROM users WHERE tg_id = ?', 'test_user');
  await db.run('INSERT INTO users (tg_id, balance, attempts, shown_events) VALUES (?, ?, ?, ?)', 'test_user', 100, 2, JSON.stringify(['event1', 'event2']));
  const user = await db.get('SELECT * FROM users WHERE tg_id = ?', 'test_user');
  console.log('User:', user);

  // Тест: вставка события
  await db.run('DELETE FROM events WHERE id = ?', 'test_event');
  await db.run('INSERT INTO events (id, tournament, team1, team2, startTime, outcome1, outcomeX, outcome2, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'test_event', 'Футбол', 'Команда1', 'Команда2', '2024-01-01T12:00:00Z', 1.5, 3.2, 2.1, 'active');
  const event = await db.get('SELECT * FROM events WHERE id = ?', 'test_event');
  console.log('Event:', event);

  // Очистка
  await db.run('DELETE FROM users WHERE tg_id = ?', 'test_user');
  await db.run('DELETE FROM events WHERE id = ?', 'test_event');
  console.log('DB test completed successfully.');
}

testDB(); 