import { ConduitData, ConduitInterface, DatabaseStorageInterface, DlpConnection, fastSyncDb, slowSyncDb, writeDb } from "palm-sync";
import { debug } from 'palm-sync';
import { DatebookDatabase, DatebookRecord, EventTime, RawPdbDatabase } from "palm-pdb";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import { prefsStore } from "../prefs-store";

const dbStg = new WebDatabaseStorageImplementation();

export class GoogleCalendarConduit implements ConduitInterface {
    name = 'sync Google calendar';
  
  
    async execute(dlpConnection: DlpConnection, conduitData: ConduitData, fs: DatabaseStorageInterface): Promise<void> {
      try {
        
        // Fetch Google Calendar events
        const events = await this.listUpcomingEvents();
  
        // Process events into DatebookDatabase format
        const datebookDb = new DatebookDatabase();
        events.forEach((event, index) => {
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

          record.entry.uniqueId = new Date().getMilliseconds();
  
          datebookDb.records.push(record);
        });
  
        console.log(datebookDb);

        await writeDb(dlpConnection, datebookDb, {overwrite: true});

      } catch (error) {
        console.error('Error syncing with Google Calendar:', error);
      }
    }
  
   
    private async listUpcomingEvents(): Promise<any[]> {
      // try {
      //   const request = {
      //     calendarId: 'primary',
      //     timeMin: new Date().toISOString(),
      //     showDeleted: false,
      //     singleEvents: true,
      //     maxResults: 10,
      //     orderBy: 'startTime',
      //   };
      //   const response = await gapi.client.calendar.events.list(request);
      //   return response.result.items || [];
      // } catch (error) {
      //   console.error('Error fetching events:', error);
      //   throw error;
      // }
      const accessToken = prefsStore.get("googleToken");
      try {
          const startOfWeek = new Date(new Date().setDate(new Date().getDate() - new Date().getDay())).toISOString();
          const endOfWeek = new Date(new Date().setDate(new Date().getDate() + (30 - new Date().getDay()))).toISOString();

          const response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfWeek}&timeMax=${endOfWeek}&singleEvents=true&orderBy=startTime`,
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

         return data.items || [];
      } catch (error) {
          console.error('Error fetching events:', error);
          throw error;
      }
    }
  }