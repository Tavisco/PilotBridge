// src/components/installed-apps-panel.tsx
import { useEffect, useState } from "react";
import {
    Box, List, ListItem, ListItemText,
    IconButton, ListItemIcon, PaperProps, Typography,
    FormControlLabel, Switch,
    Dialog, DialogTitle, DialogContent,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import { RawPdbDatabase, RawPrcDatabase } from "palm-pdb";

import { Panel } from "../panel";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import hotsyncEvents, { HotsyncEvents } from "../event-emitter/hotsync-event-emitter";
import { prefsStore } from "../prefs-store";
import { extractTAIBResource } from "../utils/taib-extractor";
import { PalmIcon } from "../components/PalmIcon.tsx";
import {PrcExplorerPanel} from "./prc-explorer-panel.tsx";
import {ManageSearch} from "@mui/icons-material";

const dbStg = new WebDatabaseStorageImplementation();

export function InstalledAppsPanel(props: PaperProps) {
    const [hasValidUser, setHasValidUser] = useState<boolean>(true);
    const [showAll, setShowAll] = useState<boolean>(false);
    const [installedDatabases, setInstalledDatabases] = useState<(RawPdbDatabase | RawPrcDatabase)[]>([]);

    // Pop‑up state
    const [explorerOpen, setExplorerOpen] = useState(false);
    const [selectedDb, setSelectedDb] = useState<RawPdbDatabase | RawPrcDatabase | null>(null);

    async function loadInstalledApps() {
        const deviceName = prefsStore.get("selectedDevice") as string;
        if (!deviceName) return;

        try {
            let allDatabases = await dbStg.getAllDatabases(deviceName);
            if (!showAll) {
                allDatabases = allDatabases.filter((x) => x.header?.attributes?.backup);
            }
            setInstalledDatabases(allDatabases);
            setHasValidUser(true);
        } catch (error) {
            console.log(error);
            // setHasValidUser(false);
            // setInstalledDatabases([]);
        }
    }

    const handleDownloadApp = (db: RawPdbDatabase | RawPrcDatabase) => {
        // ... unchanged download logic ...
        const appName = db?.header?.name ?? "database";
        const isPdb = !db.header.attributes.resDB;
        const extension = isPdb ? "pdb" : "prc";
        try {
            const targetData = typeof (db as any).serialize === "function"
                ? (db as any).serialize()
                : JSON.stringify(db);
            const blob = new Blob([targetData], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${appName.replace(/[/\\?%*:|"<>]/g, "-")}.${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Could not export database file:", error);
        }
    };

    // Triggers reload on initial mount, HotSync events, OR when showAll changes
    useEffect(() => {
        loadInstalledApps();
        const refreshScreen = () => loadInstalledApps();
        hotsyncEvents.on(HotsyncEvents.HotsyncFinished, refreshScreen);
        hotsyncEvents.on(HotsyncEvents.HotsyncUserChanged, refreshScreen);
        return () => {
            hotsyncEvents.off(HotsyncEvents.HotsyncFinished, refreshScreen);
            hotsyncEvents.off(HotsyncEvents.HotsyncUserChanged, refreshScreen);
        };
    }, [showAll]);

    // Pop‑up handlers
    const openExplorer = (db: RawPdbDatabase | RawPrcDatabase) => {
        setSelectedDb(db);
        setExplorerOpen(true);
    };
    const closeExplorer = () => {
        setExplorerOpen(false);
        setSelectedDb(null);   // clear to reset internal state on next open
    };

    return (
        <Panel title="Installed Applications" isExpandedByDefault={true} {...props} sx={{ width: "100%" }}>
            <Box>
                {hasValidUser && (
                    <Box px={2} pt={1} display="flex" justifyContent="flex-end">
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={showAll}
                                    onChange={(e) => setShowAll(e.target.checked)}
                                    color="primary"
                                />
                            }
                            label="Show all"
                        />
                    </Box>
                )}

                {!hasValidUser ? (
                    <div style={{ display: "grid", placeContent: "center", textAlign: "center", padding: "2em" }}>
                        <Typography variant="body1" color="textSecondary">
                            No active device database found. Please perform a HotSync.
                        </Typography>
                    </div>
                ) : (
                    <List dense>
                        {installedDatabases.length === 0 ? (
                            <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic", p: 2 }}>
                                No database records found.
                            </Typography>
                        ) : (
                            installedDatabases.map((db, index) => {
                                const appName = db?.header?.name ?? "Unknown App";
                                const bitmap = extractTAIBResource(db);
                                const creatorCode = db?.header?.creator ?? "??? ";

                                return (
                                    <ListItem
                                        key={`installed-${appName}-${index}`}
                                        // no onClick anymore
                                        secondaryAction={
                                            <Box sx={{ display: "flex", gap: 0.5 }}>
                                                <IconButton
                                                    edge="end"
                                                    aria-label="open explorer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openExplorer(db);
                                                    }}
                                                >
                                                    <ManageSearch />
                                                </IconButton>
                                                <IconButton
                                                    edge="end"
                                                    aria-label="download"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDownloadApp(db);
                                                    }}
                                                >
                                                    <DownloadIcon />
                                                </IconButton>
                                            </Box>
                                        }
                                    >
                                        <ListItemIcon style={{ marginInlineEnd: "1em" }}>
                                            <PalmIcon bitmap={bitmap} />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={appName}
                                            secondary={`Creator Code: ${creatorCode}`}
                                        />
                                    </ListItem>
                                );
                            })
                        )}
                    </List>
                )}
            </Box>

            {/* Explorer Pop‑up */}
            <Dialog
                open={explorerOpen}
                onClose={closeExplorer}
                fullWidth
                maxWidth="xl"
                PaperProps={{ sx: { height: "80vh" } }}
            >
                <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    Database Explorer
                    <IconButton onClick={closeExplorer} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {selectedDb && (
                        <PrcExplorerPanel
                            database={selectedDb}
                            enableFileUpload={false}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Panel>
    );
}