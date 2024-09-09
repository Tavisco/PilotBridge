import { PaperProps } from "@mui/material/Paper";
import { Box, Divider, Grid2, List, ListItem, ListItemText } from "@mui/material";
import { Panel } from "../panel";

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
        { version: '1.2.0', date: '2024-09-08', changes: ['Add data export and import in the settings', 'Remove unimplemented functionality from the menu bar', 'New URL! https://pilotbridge.tavisco.dev/'] },
        { version: '1.1.0', date: '2024-08-22', changes: ['Improve the performance of the first sync'] },
        { version: '1.0.0', date: '2024-08-10', changes: ['Initial release'] },
    ];


    return (
        <Box>
            <Grid2 container spacing={2}>
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
                                    <ListItem>
                                        <ListItemText primary="How to get started" secondary="Add a new user clicking in the 'Users' dropdown at the right top, and then select the 'Add new' option." />
                                    </ListItem>
                                    <Divider component="li" />
                                    <ListItem>
                                        <ListItemText primary="How to start a Hotsync" secondary="In the bottom left of the screen, make sure to select the correct conenction method (USB or Serial). Select the User in the dropdown and insert the PDA in the cradle, then, click the green 'Hotsync' buttom at the top right, a pop-up prompting to select a device will appear. At this moment press the hotsync button in the cradle, which will cause the PDA to appear in the list, select it and click 'Connect'. The hotsync will start." />
                                    </ListItem>
                                    <Divider component="li" />
                                    <ListItem>
                                        <ListItemText primary="When I press the hotsync button in the cradle the PDA does not appear in the list" secondary="Follow the instructions provided in the following link to setup the connection correctly: https://github.com/jichu4n/palm-sync/blob/doc/docs/connecting-palm-os-devices.md" />
                                    </ListItem>
                                    <Divider component="li" />
                                    <ListItem>
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
                                    {changelogData.map((entry, index) => (

                                        <>
                                        <ListItem key={index}>
                                            <ListItemText
                                                primary={`Version ${entry.version} - ${entry.date}`}
                                                secondary={<List>
                                                    {entry.changes.map((change, idx) => (
                                                        <ListItem key={idx} style={{ padding: 0 }}>
                                                            - {change}
                                                        </ListItem>
                                                    ))}
                                                </List>} />
                                        </ListItem>
                                        <Divider component="li" />
                                        </>
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
