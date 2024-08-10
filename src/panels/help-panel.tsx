import { PaperProps } from "@mui/material/Paper";
import { Box, Divider, List, ListItem, ListItemText } from "@mui/material";
import { Panel } from "../panel";

export function HelpPanel(props: PaperProps) {
    const style = {
        p: 0,
        width: '100%',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
    };

    return (
        <Panel
            title="Help"
            isExpandedByDefault={true}
            {...props}
            sx={{ width: "100%" }}
        >
            <Box>
                <div
                    style={{
                        height: "36vh",
                        display: "grid",
                        placeContent: "center",
                        padding: "2em",
                    }}
                >
                    <List sx={style}>
                        <ListItem>
                            <ListItemText primary="How to get started" secondary="Add a new user clicking in the 'Users' dropdown at the right top, and then select the 'Add new' option."/>
                        </ListItem>
                        <Divider component="li" />
                        <ListItem>
                            <ListItemText primary="How to start a Hotsync" secondary="Select the User in the dropdown and insert the PDA in the cradle, then, click the green 'Hotsync' buttom at the top right, a pop-up prompting to select a device will appear. At this moment press the hotsync button in the cradle, which will cause the PDA to appear in the list, select it and click 'Connect'. The hotsync will start."/>
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
    );
}
