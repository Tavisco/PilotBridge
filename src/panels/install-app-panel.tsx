// src/components/install-app-panel.tsx
import { useEffect, useState } from "react";
import {
  Button, Box, List, ListItem, ListItemText,
  IconButton, ListItemIcon, PaperProps, Typography,
  Dialog, DialogTitle, DialogContent,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";
import { RawPdbDatabase, RawPrcDatabase } from "palm-pdb";

import { Panel } from "../panel";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import hotsyncEvents, { HotsyncEvents } from "../event-emitter/hotsync-event-emitter";
import { prefsStore } from "../prefs-store";
import { extractBestAppIcon } from "../utils/taib-extractor";
import { PalmIcon } from "../components/PalmIcon.tsx";
import {PrcExplorerPanel} from "./prc-explorer-panel.tsx";
import {ManageSearch} from "@mui/icons-material";

const dbStg = new WebDatabaseStorageImplementation();

export function InstallAppPanel(props: PaperProps) {
  const [hasValidUser, setHasValidUser] = useState<boolean>(true);
  const [filenames, setFilenames] = useState<string[]>([]);
  const [databasesState, setDatabasesState] = useState<(RawPdbDatabase | RawPrcDatabase)[]>([]);

  // Pop‑up state
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [selectedDb, setSelectedDb] = useState<RawPdbDatabase | RawPrcDatabase | null>(null);

  async function renderFiles() {
    const deviceName = prefsStore.get("selectedDevice") as string;
    try {
      let { databases, filenames } = await dbStg.getDatabasesFromInstallList(deviceName);
      setFilenames(filenames);
      setDatabasesState(databases);
      setHasValidUser(true);
    } catch (error) {
      setHasValidUser(false);
      setFilenames([]);
      setDatabasesState([]);
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const validFiles = files.filter(
          (file) => file.name.endsWith(".prc") || file.name.endsWith(".pdb")
      );
      const deviceName = prefsStore.get("selectedDevice") as string;

      for (const file of validFiles) {
        await dbStg.putDatabaseInInstallList(deviceName, file);
      }
      renderFiles();
    }
  };

  const handleRemoveFile = async (index: number) => {
    const deviceName = prefsStore.get("selectedDevice") as string;
    await dbStg.removeDatabaseBeforeInstallFromList(deviceName, filenames[index]);
    renderFiles();
  };

  const openExplorer = (db: RawPdbDatabase | RawPrcDatabase) => {
    setSelectedDb(db);
    setExplorerOpen(true);
  };
  const closeExplorer = () => {
    setExplorerOpen(false);
    setSelectedDb(null);
  };

  useEffect(() => {
    renderFiles();
    const refreshScreen = () => renderFiles();

    hotsyncEvents.on(HotsyncEvents.HotsyncFinished, refreshScreen);
    hotsyncEvents.on(HotsyncEvents.HotsyncUserChanged, refreshScreen);

    return () => {
      hotsyncEvents.off(HotsyncEvents.HotsyncFinished, refreshScreen);
      hotsyncEvents.off(HotsyncEvents.HotsyncUserChanged, refreshScreen);
    };
  }, []);

  return (
      <Panel title="Install list" isExpandedByDefault={true} {...props} sx={{ width: "100%" }}>
        <Box>
          <Box p={2}>
            <Button variant="contained" component="label" disabled={!hasValidUser}>
              Select Files
              <input type="file" hidden onChange={handleFileChange} multiple accept=".prc,.pdb" />
            </Button>
          </Box>

          {!hasValidUser && (
              <div style={{ display: "grid", placeContent: "center", textAlign: "center", padding: "2em" }}>
                <Typography variant="h5" gutterBottom>
                  That's a new device! 🎉
                </Typography>
                <Typography variant="body1">
                  Please hotsync it first before installing new software.
                </Typography>
              </div>
          )}

          <List>
            {databasesState.map((db, index) => {
              const appName = db?.header?.name ?? "Loading...";
              const filename = filenames[index] ?? "";
              const bitmap = extractBestAppIcon(db);

              return (
                  <ListItem
                      key={`${filename}-${index}`}
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
                              aria-label="delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFile(index);
                              }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      }
                  >
                    <ListItemIcon style={{ marginInlineEnd: "1em" }}>
                      {bitmap && (
                        <PalmIcon bitmap={bitmap} />
                      )}
                      {!bitmap && (
                          <img
                              src="/generic_icon.png"
                              alt="Default icon"
                              style={{ width: 44, height: 44, objectFit: 'contain' }}
                          />
                      )}
                    </ListItemIcon>
                    <ListItemText primary={appName} secondary={filename} />
                  </ListItem>
              );
            })}
          </List>
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