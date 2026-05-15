import {
  ConduitData,
  ConduitInterface,
  DatabaseStorageInterface,
  DlpConnection,
  DlpOpenConduitReqType,
  debug,
} from "palm-sync";
import { DatebookDatabase, DatebookRecord, EventTime } from "palm-pdb";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import { prefsStore } from "../prefs-store";

const log = debug("palm-sync").extend("conduit").extend("google-calendar");
const dbStg = new WebDatabaseStorageImplementation();
const DATEBOOK_DB_NAME = "DatebookDB.pdb";
const ONE_HOUR_MS = 60 * 60 * 1000;

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
};

function generateUniqueId(apiId: string): number {
  let hash = 2166136261;

  for (let i = 0; i < apiId.length; i++) {
    hash ^= apiId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % 0xFFFFFF;
}

function getCalendarRange() {
  const start = new Date();

  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 30);

  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  };
}

function toEventRecords(event: GoogleCalendarEvent): DatebookRecord[] {
  const records: DatebookRecord[] = [];
  const summary = event.summary?.trim();
  if (!summary) return [];

  const isAllDay = !!event.start.date;

  let current: Date;
  let eventEnd: Date;

  if (isAllDay) {
    const [sY, sM, sD] = event.start.date!.split('-').map(Number);
    const [eY, eM, eD] = event.end.date!.split('-').map(Number);
    current = new Date(sY, sM - 1, sD, 0, 0, 0);
    eventEnd = new Date(eY, eM - 1, eD, 0, 0, 0);
  } else {
    current = new Date(event.start.dateTime!);
    eventEnd = new Date(event.end.dateTime!);
    if (eventEnd.getTime() - current.getTime() < ONE_HOUR_MS) {
      eventEnd = new Date(current.getTime() + ONE_HOUR_MS);
    }
  }

  while (current < eventEnd) {
    const record = new DatebookRecord();
    record.description = summary;

    record.date.year = current.getFullYear();
    record.date.month = current.getMonth();
    record.date.dayOfMonth = current.getDate();

    if (isAllDay) {
      record.startTime = EventTime.with({ hour: 0, minute: 0 });
      record.endTime = EventTime.with({ hour: 23, minute: 59 });
      record.note = `Google All-day event`;
    } else {
      const isFirstDay = records.length === 0;

      record.startTime = EventTime.with({
        hour: isFirstDay ? current.getHours() : 0,
        minute: isFirstDay ? current.getMinutes() : 0,
      });
      const endOfToday = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59);

      if (eventEnd <= endOfToday) {
        record.endTime = EventTime.with({
          hour: eventEnd.getHours(),
          minute: eventEnd.getMinutes(),
        });
      } else {
        record.endTime = EventTime.with({ hour: 23, minute: 59 });
      }
      record.note = `Sync'd from Google: ${event.id}`;
    }

    records.push(record);

    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 0);
  }

  return records;
}

export class GoogleCalendarConduit implements ConduitInterface {
  name = "sync Google calendar";

  async execute(
      dlpConnection: DlpConnection,
      conduitData: ConduitData,
      _fs: DatabaseStorageInterface
  ): Promise<void> {
    await dlpConnection.execute(new DlpOpenConduitReqType());

    try {
      const events = await this.listUpcomingEvents();
      const datebookDb = DatebookDatabase.from(
          await dbStg.getDatabaseBuffer(conduitData.palmID.userName, DATEBOOK_DB_NAME)
      );

      let added = 0;

      for (const event of events) {
        const generatedRecords = toEventRecords(event);

        for (const [_subIndex, record] of generatedRecords.entries()) {
          const salt = `${event.id}-${record.date.year}${record.date.month}${record.date.dayOfMonth}`;
          const uniqueId = generateUniqueId(salt);

          const existingRecord = datebookDb.records.find(
              (r) => r.entry.uniqueId === uniqueId
          );

          if (existingRecord) {
            log(`Segment for [0x${uniqueId}] already exists, skipping...`);
            continue;
          }

          record.entry.uniqueId = uniqueId;
          record.entry.attributes.dirty = true;

          datebookDb.records.push(record);
          added += 1;
        }
      }

      log(`Sync complete. Inserted [${added}] total records (including duplicates for multiday).`);

      await dbStg.writeDatabaseBuffer(
          conduitData.palmID.userName,
          DATEBOOK_DB_NAME,
          datebookDb.serialize()
      );
    } catch (error) {
      console.error("Error syncing with Google Calendar:", error);
    }
  }

  private async listUpcomingEvents(): Promise<GoogleCalendarEvent[]> {
    const accessToken = prefsStore.get("googleToken");
    if (!accessToken) {
      throw new Error("Missing googleToken");
    }

    const { timeMin, timeMax } = getCalendarRange();

    log("Fetching events from Google...");

    const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return (data.items ?? []) as GoogleCalendarEvent[];
  }
}