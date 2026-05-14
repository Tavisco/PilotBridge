import { PaperProps } from "@mui/material/Paper";
import { Box, Stack, Typography } from "@mui/material";
import { Panel } from "../panel";
import { useEffect, useMemo, useState } from "react";
import hotsyncEvents, { HotsyncEvents } from "../event-emitter/hotsync-event-emitter";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "./calendar.css";
import { prefsStore } from "../prefs-store";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl.ts";
import { DatebookDatabase } from "palm-pdb";

const dbStg = new WebDatabaseStorageImplementation();
const DATEBOOK_DB_NAME = 'DatebookDB.pdb';
const localizer = momentLocalizer(moment);

type CalendarEvent = {
    title: string;
    start: Date;
    end: Date;
    source: "google" | "device";
};

export function CalendarPanel(props: PaperProps) {
    const [hotsyncInProgress, setHotsyncInProgress] = useState(false);
    const [deviceEvents, setDeviceEvents] = useState<CalendarEvent[]>([]);
    const [loadingDevice, setLoadingDevice] = useState(false);
    const [hasValidUser, setHasValidUser] = useState<boolean>(true);

    const deviceName = prefsStore.get("selectedDevice") as string;

    // We only track device events now based on your requirement
    const events = useMemo(() => deviceEvents, [deviceEvents]);

    const loadDeviceCalendarEvents = async () => {
        if (!deviceName) return;

        setLoadingDevice(true);
        try {
            const dbBuffer = await dbStg.getDatabaseBuffer(deviceName, DATEBOOK_DB_NAME);
            const datebookDb = DatebookDatabase.from(dbBuffer);

            const formattedEvents: CalendarEvent[] = (datebookDb.records ?? [])
                .map((record: any, index: number) => {
                    const year = record.date?.year;
                    const month = record.date?.month;
                    const day = record.date?.dayOfMonth;

                    if (typeof year !== "number" || typeof month !== "number" || typeof day !== "number") {
                        return null;
                    }

                    const startHour = record.startTime?.hour ?? 0;
                    const startMinute = record.startTime?.minute ?? 0;
                    const endHour = record.endTime?.hour;
                    const endMinute = record.endTime?.minute;

                    const start = new Date(year, month, day, startHour, startMinute, 0);
                    const end = typeof endHour === "number" && typeof endMinute === "number"
                        ? new Date(year, month, day, endHour, endMinute, 0)
                        : new Date(start.getTime() + 30 * 60 * 1000);

                    return {
                        title: record.description || `Device event ${index + 1}`,
                        start,
                        end,
                        source: "device" as const,
                    };
                })
                .filter((event: CalendarEvent | null): event is CalendarEvent => event !== null);

            setDeviceEvents(formattedEvents);
        } catch (error) {
            console.error("Error loading device calendar:", error);
        } finally {
            setLoadingDevice(false);
        }
    };

    // 1. Logic to check for valid user and Auto-load data
    useEffect(() => {
        const init = async () => {
            if (!deviceName) {
                setHasValidUser(false);
                return;
            }

            try {
                await dbStg.getDatabasesFromInstallList(deviceName);
                setHasValidUser(true);
                // Always load device calendar once validated
                loadDeviceCalendarEvents();
            } catch (error) {
                setHasValidUser(false);
            }
        };

        init();
    }, [deviceName]);

    // 2. HotSync Listeners
    useEffect(() => {
        const handleHotsyncStarted = () => setHotsyncInProgress(true);
        const handleHotsyncFinished = () => {
            setHotsyncInProgress(false);
            loadDeviceCalendarEvents(); // Refresh data after sync finishes
        };

        hotsyncEvents.on(HotsyncEvents.HotsyncStarted, handleHotsyncStarted);
        hotsyncEvents.on(HotsyncEvents.HotsyncFinished, handleHotsyncFinished);
        hotsyncEvents.on(HotsyncEvents.HotsyncUserChanged, handleHotsyncFinished);

        return () => {
            hotsyncEvents.off(HotsyncEvents.HotsyncStarted, handleHotsyncStarted);
            hotsyncEvents.off(HotsyncEvents.HotsyncFinished, handleHotsyncFinished);
            hotsyncEvents.on(HotsyncEvents.HotsyncUserChanged, handleHotsyncFinished);
        };
    }, [deviceName]);

    return (
        <Panel
            title="Calendar"
            isExpandedByDefault={true}
            {...props}
            sx={{ width: "100%" }}
        >
            <Box>
                {!hasValidUser && (
                    <div style={{ display: "grid", placeContent: "center", textAlign: "center", padding: "2em" }}>
                        <Typography variant="h5" gutterBottom>
                            That's a new device! 🎉
                        </Typography>
                        <Typography variant="body1">
                            Please hotsync it first.
                        </Typography>
                    </div>
                )}

                {hasValidUser && hotsyncInProgress && (
                    <div style={{ display: "grid", placeContent: "center", textAlign: "center", padding: "2em" }}>
                        <Typography variant="h5" gutterBottom>
                            🔁 HotSync in progress...
                        </Typography>
                        <Typography variant="body1">
                            Please wait for the current HotSync session to finish.
                        </Typography>
                    </div>
                )}

                {hasValidUser && !hotsyncInProgress && (
                    <div
                        style={{
                            minHeight: "35vh",
                            textAlign: "start",
                            padding: "1em",
                            width: "100%",
                        }}
                    >
                        <div className="dark-calendar" style={{ height: "100vh", padding: "20px" }}>
                            <Calendar
                                localizer={localizer}
                                events={events}
                                startAccessor="start"
                                endAccessor="end"
                                style={{ height: "80vh" }}
                            />
                        </div>
                    </div>
                )}
            </Box>
        </Panel>
    );
}