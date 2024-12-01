import { ConduitData, ConduitInterface, DatabaseStorageInterface, DlpConnection, fastSyncDb, slowSyncDb, writeDb } from "palm-sync";
import { debug } from 'palm-sync';
import { DatebookDatabase, DatebookRecord, EventTime, RawPdbDatabase } from "palm-pdb";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";

const dbStg = new WebDatabaseStorageImplementation();

export class GoogleCalendarConduit implements ConduitInterface {
    name = 'sync Google calendar';
  
    private CLIENT_ID = '<CLIENT ID>'; // Replace with your client ID
    private SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
  
    private tokenClient: any;
    private gapiInitialized = false;
    private gisInitialized = false;
  
    async execute(dlpConnection: DlpConnection, conduitData: ConduitData, fs: DatabaseStorageInterface): Promise<void> {
      try {
        // Initialize GAPI and GIS
        this.initializeGisClient();
        await this.initializeGapiClient();
  
        // Authenticate and fetch access token
        const token = await this.getAccessToken();
  
        if (!token) {
          throw new Error('Failed to obtain access token');
        }
  
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
  
    private async initializeGapiClient(): Promise<void> {
      return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
          try {
            await gapi.client.init({
              apiKey: '<API KEY>',
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
            });
            this.gapiInitialized = true;
            console.log('gapi ok');
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    }
  
    private initializeGisClient(): void {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.CLIENT_ID,
        scope: this.SCOPES,
        callback: (response: any) => {
          if (response.error) {
            console.error('Error obtaining access token:', response.error);
          }
        },
      });
      this.gisInitialized = true;
      console.log('token Client OK');
    }
  
    private async getAccessToken(): Promise<string | null> {
      return new Promise((resolve, reject) => {
        if (gapi.client.getToken() === null) {
          this.tokenClient.callback = (response: any) => {
            if (response.error) {
              reject(response.error);
            } else {
              resolve(response.access_token);
            }
          };
          this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          resolve(gapi.client.getToken().access_token);
        }
      });
    }
  
    private async listUpcomingEvents(): Promise<any[]> {
      try {
        const request = {
          calendarId: 'primary',
          timeMin: new Date().toISOString(),
          showDeleted: false,
          singleEvents: true,
          maxResults: 10,
          orderBy: 'startTime',
        };
        const response = await gapi.client.calendar.events.list(request);
        return response.result.items || [];
      } catch (error) {
        console.error('Error fetching events:', error);
        throw error;
      }
    }
  }