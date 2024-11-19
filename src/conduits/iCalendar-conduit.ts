import { ConduitData, ConduitInterface, DatabaseStorageInterface, DlpConnection } from "palm-sync";
import ICAL from "ical.js";
import { debug } from 'palm-sync';
import { prefsStore } from '../prefs-store';
import { DatebookDatabase, DatebookRecord, EventTime } from "palm-pdb";



export class ICalendarConduit implements ConduitInterface {
    name = 'sync iCalendar file';
    async execute(dlpConnection: DlpConnection, conduitData: ConduitData, fs: DatabaseStorageInterface): Promise<void> {

        try {
            // Replace with the URL of your iCalendar file
            const icsUrl = prefsStore.get('iCalendarURL');
            
            // Fetch the iCalendar file
            const response = await fetch(icsUrl);
            if (!response.ok) {
              throw new Error(`Failed to download file: ${response.statusText}`);
            }
            
            // Read the file as text
            const icsText = await response.text();
            
            // Parse the iCalendar data using ical.js
            const jcalData = ICAL.parse(icsText);
            const vcalendar = new ICAL.Component(jcalData);
            const vevents = vcalendar.getAllSubcomponents("vevent");

              // Create a new DatebookDatabase
            const datebookDb = new DatebookDatabase();

            // Map each VEVENT into a DatebookRecord
            vevents.forEach((component, index) => {
                const event = new ICAL.Event(component);
                const start = event.startDate;
                const end = event.endDate;
                const summary = event.summary;
            
                if (!start || !summary) return;
            
                const record = new DatebookRecord();
                record.description = summary;
                record.note = `Note from iCal event #${index}`;
            
                // Set basic date and time
                record.date.year = start.year;
                record.date.month = start.month + 1;
                record.date.dayOfMonth = start.day;
                record.startTime = EventTime.with({
                  hour: start.hour,
                  minute: start.minute,
                });
            
                if (end) {
                  record.endTime = EventTime.with({
                    hour: end.hour,
                    minute: end.minute,
                  });
                }
            
                datebookDb.records.push(record);
              });
      
            // Log each event
            console.log(datebookDb);
          } catch (error) {
            console.error("Error processing iCalendar file:", error);
          }

        debug.log('iCalendar sync is done!');

        return;
    }
}