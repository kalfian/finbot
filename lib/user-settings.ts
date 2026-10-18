import type Database from "better-sqlite3";
import { DEFAULT_TIMEZONE, validateTimezone } from "./timezone";

export function getUserSettings(database: Database.Database, userId: number) {
  const row = database
    .prepare("SELECT timezone FROM user_settings WHERE user_id = ?")
    .get(userId) as { timezone: string } | undefined;
  return { timezone: row?.timezone ?? DEFAULT_TIMEZONE };
}

export function setUserTimezone(
  database: Database.Database,
  userId: number,
  value: unknown,
) {
  const timezone = validateTimezone(value);
  if (!timezone)
    throw new Error(
      "Choose a valid IANA timezone, such as Asia/Jakarta or America/New_York.",
    );
  database
    .prepare(
      "INSERT INTO user_settings (user_id, timezone) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone",
    )
    .run(userId, timezone);
  return { timezone };
}
