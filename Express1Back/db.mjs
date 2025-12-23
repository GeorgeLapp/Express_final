import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export async function initDB() {
  const db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      sport TEXT,
      tournament TEXT,
      team1 TEXT,
      team2 TEXT,
      startTime TEXT,
      outcome1 REAL,
      outcomeX REAL,
      outcome2 REAL,
      outcome1X REAL,
      outcomeX2 REAL,
      status TEXT,
      results TEXT,
      winning_outcome TEXT
    );
  `);

  const eventColumns = await db.all('PRAGMA table_info(events)');
  const eventColumnNames = new Set(eventColumns.map(c => c.name));
  if (!eventColumnNames.has('outcome1X')) {
    await db.exec('ALTER TABLE events ADD COLUMN outcome1X REAL');
  }
  if (!eventColumnNames.has('outcomeX2')) {
    await db.exec('ALTER TABLE events ADD COLUMN outcomeX2 REAL');
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id TEXT UNIQUE,
      balance REAL DEFAULT 0,
      attempts INTEGER DEFAULT 0
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_event_shows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      event_id TEXT,
      shown_outcome TEXT,
      shown_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(event_id) REFERENCES events(id)
    );
  `);

  return db;
} 
