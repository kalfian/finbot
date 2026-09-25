import { databasePath, initializeDatabase, openDatabase } from "../lib/database";
const database = openDatabase();
try { initializeDatabase(database); console.log(`SQLite database initialized at ${databasePath()}`); } finally { database.close(); }
