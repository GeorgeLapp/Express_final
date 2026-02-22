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
      username TEXT,
      balance REAL DEFAULT 0,
      attempts INTEGER DEFAULT 0
    );
  `);

  const userColumns = await db.all('PRAGMA table_info(users)');
  const userColumnNames = new Set(userColumns.map(c => c.name));
  if (!userColumnNames.has('username')) {
    await db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_event_shows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      event_id TEXT,
      shown_outcome TEXT,
      username TEXT,
      batch_id TEXT,
      shown_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(event_id) REFERENCES events(id)
    );
  `);

  const userEventShowColumns = await db.all('PRAGMA table_info(user_event_shows)');
  const userEventShowColumnNames = new Set(userEventShowColumns.map(c => c.name));
  if (!userEventShowColumnNames.has('username')) {
    await db.exec('ALTER TABLE user_event_shows ADD COLUMN username TEXT');
  }
  if (!userEventShowColumnNames.has('batch_id')) {
    await db.exec('ALTER TABLE user_event_shows ADD COLUMN batch_id TEXT');
  }

  return db;
} 
