import React from "react";
import { PaperProps } from "@mui/material/Paper";
import {
    Box,
    Divider,
    Grid2,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Typography,
    Link,
    Chip
} from "@mui/material";
import {
    Usb as UsbIcon,
    PersonAdd as PersonAddIcon,
    Sync as SyncIcon,
    CloudOff as CloudOffIcon
} from "@mui/icons-material";
import { Panel } from "../panel";

// 1. Move static data outside the component to prevent unnecessary re-renders
const setupSteps = [
    {
        id: "setup",
        icon: <UsbIcon color="primary" />,
        title: "1. Setup the USB drivers",
        description: (
            <>
                (Only needed if using USB) On Windows, you need to install the Zadig drivers; the official Palm Desktop/Aceeca drivers won't work. On Linux, you need to blacklist the visor modules. On MacOS, it should work out of the box.{" "}
                <Link
                    href="https://github.com/jichu4n/palm-sync/blob/doc/docs/connecting-palm-os-devices.md"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    View platform-specific instructions here.
                </Link>
            </>
        )
    },
    {
        id: "start",
        icon: <PersonAddIcon color="primary" />,
        title: "2. Setup the user",
        description: "After finishing step 1, add a new user by clicking the 'Users' dropdown at the top right, and then select the 'Add new' option."
    },
    {
        id: "startHotsync",
        icon: <SyncIcon color="primary" />,
        title: "3. Start a Hotsync",
        description: "In the bottom left, select the correct connection method (USB or Serial). Select the User in the dropdown and insert the PDA into the cradle. Click the green 'Hotsync' button at the top right. When prompt appears to select a device, press the hotsync button on the cradle. Select your PDA from the list and click 'Connect'."
    },
    {
        id: "cloud",
        icon: <CloudOffIcon color="secondary" />,
        title: "Bonus: Is my data backed up to a server/cloud?",
        description: "No. All data is strictly stored in your browser's OPFS storage and never leaves it. Everything runs entirely client-side; there is no backend server or cloud involved."
    }
];

const changelogData = [
    { version: '1.4.0', date: '2026-05-14', changes: ['Add Google Calendar sync', 'High resolution icons on app install'] },
    { version: '1.3.0', date: '2024-11-07', changes: ['Add To Do'] },
    { version: '1.2.0', date: '2024-09-08', changes: ['Add data export and import in the settings', 'Remove unimplemented functionality from the menu bar', 'New URL! https://pilotbridge.tavisco.dev/'] },
    { version: '1.1.0', date: '2024-08-22', changes: ['Improve the performance of the first sync'] },
    { version: '1.0.0', date: '2024-08-10', changes: ['Initial release'] },
];

// 2. Define shared styles cleanly
const listContainerStyle = {
    width: '100%',
    borderRadius: 2,
    border: '1px solid',
    borderColor: 'divider',
    backgroundColor: 'background.paper',
    mt: 2
};

export function HomePanel(props: PaperProps) {
    return (
        <Box sx={{ p: 2 }}>
            <Grid2 container spacing={3} maxWidth="md" margin="0 auto">

                {/* GETTING STARTED PANEL */}
                <Grid2 size={12}>
                    <Panel
                        title="Getting Started"
                        isExpandedByDefault={true}
                        sx={{ width: "100%" }}
                        {...props}
                    >
                        <Box sx={{ p: { xs: 2, sm: 3 } }}>
                            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                                Follow these instructions to get your device connected:
                            </Typography>

                            <List sx={listContainerStyle} disablePadding>
                                {setupSteps.map((step, index) => (
                                    <React.Fragment key={step.id}>
                                        <ListItem alignItems="flex-start" sx={{ py: 2 }}>
                                            <ListItemIcon sx={{ mt: 0.5 }}>
                                                {step.icon}
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={
                                                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                                                        {step.title}
                                                    </Typography>
                                                }
                                                secondary={
                                                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                                                        {step.description}
                                                    </Typography>
                                                }
                                            />
                                        </ListItem>
                                        {index < setupSteps.length - 1 && <Divider component="li" />}
                                    </React.Fragment>
                                ))}
                            </List>
                        </Box>
                    </Panel>
                </Grid2>

                {/* CHANGELOG PANEL */}
                <Grid2 size={12}>
                    <Panel
                        title="Changelog"
                        isExpandedByDefault={true}
                        sx={{ width: "100%" }}
                        {...props}
                    >
                        <Box sx={{ p: { xs: 2, sm: 3 } }}>
                            <List sx={listContainerStyle} disablePadding>
                                {changelogData.map((entry, index) => (
                                    <React.Fragment key={entry.version}>
                                        <ListItem alignItems="flex-start" sx={{ py: 2, flexDirection: "column" }}>

                                            {/* Version Header */}
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, width: '100%' }}>
                                                <Chip
                                                    label={`v${entry.version}`}
                                                    color="primary"
                                                    size="small"
                                                    variant={index === 0 ? "filled" : "outlined"}
                                                />
                                                <Typography variant="caption" color="text.secondary">
                                                    {entry.date}
                                                </Typography>
                                            </Box>

                                            {/* Changes List */}
                                            <List dense disablePadding sx={{ width: '100%', pl: 1 }}>
                                                {entry.changes.map((change, idx) => (
                                                    <ListItem key={`${entry.version}-${idx}`} sx={{ display: 'list-item', py: 0.5 }}>
                                                        <Typography variant="body2" color="text.primary">
                                                            {change}
                                                        </Typography>
                                                    </ListItem>
                                                ))}
                                            </List>

                                        </ListItem>
                                        {index < changelogData.length - 1 && <Divider component="li" />}
                                    </React.Fragment>
                                ))}
                            </List>
                        </Box>
                    </Panel>
                </Grid2>

            </Grid2>
        </Box>
    );
}