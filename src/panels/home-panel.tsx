import { PaperProps } from "@mui/material/Paper";
import { Box, Divider, Grid2, List, ListItem, ListItemText, Typography } from "@mui/material";
import { Panel } from "../panel";
import React from "react";

export function HomePanel(props: PaperProps) {
    const style = {
        p: 0,
        width: '100%',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
    };

    const changelogData = [
        { version: '1.3.0', date: 'xxxxxx', changes: ['Add To Do'] },
        { version: '1.2.0', date: '2024-09-08', changes: ['Add data export and import in the settings', 'Remove unimplemented functionality from the menu bar', 'New URL! https://pilotbridge.tavisco.dev/'] },
        { version: '1.1.0', date: '2024-08-22', changes: ['Improve the performance of the first sync'] },
        { version: '1.0.0', date: '2024-08-10', changes: ['Initial release'] },
    ];


    return (
        <Box>
            <Grid2 container spacing={2} maxWidth="md">
                <Grid2 size={12}>
                    <Panel
                        title="Help"
                        isExpandedByDefault={true}
                        {...props}
                        sx={{ width: "100%" }}
                    >
                        <Box>
                            <div
                                style={{
                                    display: "grid",
                                    padding: "2em",
                                }}
                            >
                                <List sx={style}>
                                    <ListItem key="setup">
                                        <ListItemText primary="Setup the USB drivers" secondary="(Only needed if using USB) On windows you need to install the Zadig drivers, the offical Palm Desktop/Aceeca drivers won't work. On Linux, you need to blacklist the visor modules. On MacOS, it should work out of the box. The following link has instructions on how to set up for each platform: https://github.com/jichu4n/palm-sync/blob/doc/docs/connecting-palm-os-devices.md" />
                                    </ListItem>
                                    <Divider component="li" />
                                    <ListItem key="start">
                                        <ListItemText primary="How to get started" secondary="After setting up the drivers (if using USB), add a new user clicking in the 'Users' dropdown at the right top, and then select the 'Add new' option." />
                                    </ListItem>
                                    <Divider component="li" />
                                    <ListItem key="startHotsync">
                                        <ListItemText primary="How to start a Hotsync" secondary="In the bottom left of the screen, make sure to select the correct conenction method (USB or Serial). Select the User in the dropdown and insert the PDA in the cradle, then, click the green 'Hotsync' buttom at the top right, a pop-up prompting to select a device will appear. At this moment press the hotsync button in the cradle, which will cause the PDA to appear in the list, select it and click 'Connect'. The hotsync will start." />
                                    </ListItem>
                                    <Divider component="li" />
                                    <ListItem key="cloud">
                                        <ListItemText primary="Is my data backuped to a server/cloud?" secondary="No. All data is only stored in your browser's OPFS storage and never leaves it. Everything runs on the client-side (your browser), there is no backend server in play here." />
                                    </ListItem>
                                </List>
                            </div>
                        </Box>
                    </Panel>
                </Grid2>
                <Grid2 size={12}>
                    <Panel
                        title="Changelog"
                        isExpandedByDefault={true}
                        {...props}
                        sx={{ width: "100%" }}
                    >
                        <Box>
                            <div
                                style={{
                                    display: "grid",
                                    padding: "2em",
                                    width: "100%"
                                }}
                            >
                                <List sx={style}>
                                    {changelogData.map(entry => (
                                        <React.Fragment key={entry.version}>
                                            <ListItem>
                                                <ListItemText
                                                    primary={`Version ${entry.version} - ${entry.date}`}
                                                    secondary={
                                                        <Typography component="div">
                                                            <List>
                                                                {entry.changes.map((change, idx) => (
                                                                    <ListItem key={entry.version + idx} style={{ padding: 0 }}>
                                                                        - {change}
                                                                    </ListItem>
                                                                ))}
                                                            </List>
                                                        </Typography>
                                                    }
                                                />
                                            </ListItem>
                                            <Divider component="li" />
                                        </React.Fragment>
                                    ))}
                                </List>
                            </div>
                        </Box>
                    </Panel>
                </Grid2>
            </Grid2>


        </Box>

    );
}
