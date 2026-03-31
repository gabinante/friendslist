import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './connection.js';

migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations complete.');
