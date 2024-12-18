import { ConduitData, ConduitInterface, DatabaseStorageInterface, DlpConnection, DlpOpenConduitReqType } from "palm-sync";
import { DatebookDatabase, DatebookRecord, EventTime } from "palm-pdb";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import { prefsStore } from "../prefs-store";
import { debug } from 'palm-sync';

const log = debug('palm-sync').extend('conduit').extend('google-calendar');
const dbStg = new WebDatabaseStorageImplementation();
const DATEBOOK_DB_NAME = 'DatebookDB.pdb';

function generateUniqueId(apiId: string): number {
  // FNV-1a hash function
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < apiId.length; i++) {
    hash ^= apiId.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  // Ensure the result fits within the 0xFFFFFF range
  return Math.abs(hash) % 0xFFFFFF;
}

function datebookAlreadyHasThatEvent(datebookDb: DatebookDatabase, uniqueId: number): boolean {
  return datebookDb.records.findIndex((record) => {
    return uniqueId === record.entry.uniqueId;
  }) != -1;
}

export class GoogleCalendarConduit implements ConduitInterface {
  name = 'sync Google calendar';

  
  async execute(dlpConnection: DlpConnection, conduitData: ConduitData, fs: DatabaseStorageInterface): Promise<void> {
    await dlpConnection.execute(DlpOpenConduitReqType.with({}));
    
    try {
      // Fetch Google Calendar events
      const events = await this.listUpcomingEvents();

      // Process events into DatebookDatabase format
      const datebookDb = DatebookDatabase.from(await dbStg.getDatabaseBuffer(conduitData.palmID.userName, DATEBOOK_DB_NAME));
      log('Device datebook opened');
      var added = 0;
      events.forEach((event, index) => {
        console.log(event);

        const uniqueId = generateUniqueId(event.id);

        if (datebookAlreadyHasThatEvent(datebookDb, uniqueId)) {
          log(`Database already has event with id [0x${uniqueId}]. Skipping...`);
          return;
        }

        const start = new Date(event.start.dateTime || event.start.date);
        const end = event.end.dateTime ? new Date(event.end.dateTime) : undefined;
        const summary = event.summary;

        if (!start || !summary) return;

        const record = new DatebookRecord();
        record.description = summary;
        record.note = `Note from Google Calendar event #${index}`;

        // Set date and time
        record.date.year = start.getFullYear();
        record.date.month = start.getMonth();
        record.date.dayOfMonth = start.getDate();
        record.startTime = EventTime.with({
          hour: start.getHours(),
          minute: start.getMinutes(),
        });

        if (end) {
          record.endTime = EventTime.with({
            hour: end.getHours(),
            minute: end.getMinutes(),
          });
        }

        record.entry.uniqueId = uniqueId;//Math.floor(Math.random() * 0xFFFFFF);
        record.entry.attributes.dirty = true;

        datebookDb.records.push(record);
        added += 1;
      });

      log(`Successfully inserted [${added}] events from Google Calendar in the datebook!`);

      dbStg.writeDatabaseBuffer(conduitData.palmID.userName, DATEBOOK_DB_NAME, datebookDb.serialize());
    } catch (error) {
      console.error('Error syncing with Google Calendar:', error);
    }
  }


  private async listUpcomingEvents(): Promise<any[]> {

    const accessToken = prefsStore.get("googleToken");
    try {
      const startOfWeek = new Date(new Date().setDate(new Date().getDate() - new Date().getDay())).toISOString();
      const endOfWeek = new Date(new Date().setDate(new Date().getDate() + (30 - new Date().getDay()))).toISOString();

      log('Fetching events from Google...');
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfWeek}&timeMax=${endOfWeek}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      log('Successfully fetched the calendar events!');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return data.items || [];
    } catch (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
  }
}


