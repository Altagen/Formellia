import { eq } from "drizzle-orm";
import { db } from "./index";
import { appSettings } from "./schema";
import { DEFAULT_THRESHOLDS, type PriorityThresholds } from "@/lib/utils/priority";
import { dbLogger as log } from "@/lib/logger";

export async function getSettings(): Promise<PriorityThresholds> {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    if (rows[0]) {
      return {
        redMaxDays: rows[0].redMaxDays,
        orangeMaxDays: rows[0].orangeMaxDays,
        yellowMaxDays: rows[0].yellowMaxDays,
      };
    }
  } catch (e) {
    log.error({ err: e }, "getSettings error");
  }
  return DEFAULT_THRESHOLDS;
}

export async function saveSettings(s: PriorityThresholds): Promise<void> {
  await db
    .insert(appSettings)
    .values({ id: 1, ...s })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        redMaxDays: s.redMaxDays,
        orangeMaxDays: s.orangeMaxDays,
        yellowMaxDays: s.yellowMaxDays,
      },
    });
}
