import { PaperProps } from "@mui/material/Paper";
import { Alert, AlertTitle, Box, Button, Typography } from "@mui/material";
import { Panel } from "../panel";
import { useEffect, useState } from "react";
import hotsyncEvents, { HotsyncEvents } from "../event-emitter/hotsync-event-emitter";
import { useGoogleLogin } from "@react-oauth/google";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from 'moment';
import './calendar.css'

const localizer = momentLocalizer(moment)

export function CalendarPanel(props: PaperProps) {
    const [hotsyncInProgress, setHotsyncInProgress] = useState(false);
    const [events, setEvents] = useState<any[]>([]);

    const login = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            const accessToken = tokenResponse.access_token;
            fetchCalendarEvents(accessToken);
        },
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
    });

    const fetchCalendarEvents = async (accessToken: string) => {
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

            // Transform Google Calendar events into react-big-calendar format
            const formattedEvents = data.items.map((event: any) => ({
                title: event.summary,
                start: new Date(event.start.dateTime || event.start.date),
                end: new Date(event.end.dateTime || event.end.date),
            }));

            setEvents(formattedEvents);
        } catch (error) {
            console.error('Error fetching events:', error);
        }
    };

    useEffect(() => {
        // hotsyncEvents.on(HotsyncEvents.HotsyncUserChanged, refreshScreen);
        hotsyncEvents.on(HotsyncEvents.HotsyncStarted, () => setHotsyncInProgress(true));
        hotsyncEvents.on(HotsyncEvents.HotsyncFinished, () => {
            setHotsyncInProgress(false);
            // loadToDo();
        });

        return () => {
            // hotsyncEvents.off(HotsyncEvents.HotsyncUserChanged, refreshScreen);
            hotsyncEvents.off(HotsyncEvents.HotsyncStarted, setHotsyncInProgress);
            hotsyncEvents.off(HotsyncEvents.HotsyncFinished, setHotsyncInProgress);
        };

    }, []);

    return (
        <Panel
            title="Calendar"
            isExpandedByDefault={true}
            {...props}
            sx={{ width: "100%" }}
        >
            <Box>
                {!hotsyncInProgress && (
                    <div
                        style={{
                            minHeight: "35vh",
                            placeContent: "start",
                            textAlign: "start",
                            padding: "1em",
                            width: "100%"
                        }}
                    >
                        <Alert severity="info">
                            <AlertTitle>Info</AlertTitle>
                            Setup your google config first in the App settings. The following view is read-only.
                        </Alert>
                        <div className="dark-calendar" style={{ height: '100vh', padding: '20px' }}>
                            <Button variant="contained" onClick={() => login()} style={{ marginBottom: '20px' }}>
                                Refresh from Google
                            </Button>
                            <Calendar
                                localizer={localizer}
                                events={events}
                                startAccessor="start"
                                endAccessor="end"
                                style={{ height: '80vh' }}
                            />
                        </div>
                    </div>
                )}

                {hotsyncInProgress && (
                    <div
                        style={{
                            display: "grid",
                            placeContent: "center",
                            textAlign: "center",
                            padding: "2em",
                        }}
                    >
                        <Typography variant="h5" gutterBottom>
                            🔁 HotSync in progress...
                        </Typography>
                        <Typography variant="body1">
                            Please wait for the current HotSync session to finish.
                        </Typography>
                    </div>
                )}
            </Box>
        </Panel>
    );
}
