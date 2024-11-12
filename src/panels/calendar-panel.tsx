import { PaperProps } from "@mui/material/Paper";
import { Box, Typography } from "@mui/material";
import { Panel } from "../panel";
import { useEffect, useState } from "react";
import hotsyncEvents, { HotsyncEvents } from "../event-emitter/hotsync-event-emitter";

export function CalendarPanel(props: PaperProps) {
    const [hotsyncInProgress, setHotsyncInProgress] = useState(false);

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
                    <p>Bacana!</p>
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
