// src/components/install-app-panel.tsx
import { useEffect, useState } from "react";
import {
  Button, Box, List, ListItem, ListItemText,
  IconButton, ListItemIcon, PaperProps, Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { RawPdbDatabase, RawPrcDatabase } from "palm-pdb";

import { Panel } from "../panel";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import hotsyncEvents, { HotsyncEvents } from "../event-emitter/hotsync-event-emitter";
import { prefsStore } from "../prefs-store";
import { extractTAIBResource } from "../utils/taib-extractor";
import { PalmIcon } from "../components/PalmIcon.tsx";

const dbStg = new WebDatabaseStorageImplementation();

export function InstallAppPanel(props: PaperProps) {
  const [hasValidUser, setHasValidUser] = useState<boolean>(true);
  const [filenames, setFilenames] = useState<string[]>([]);
  const [databasesState, setDatabasesState] = useState<(RawPdbDatabase | RawPrcDatabase)[]>([]);

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
              const bitmap = extractTAIBResource(db);

              return (
                  <ListItem
                      key={`${filename}-${index}`}
                      secondaryAction={
                        <IconButton edge="end" aria-label="delete" onClick={() => handleRemoveFile(index)}>
                          <DeleteIcon />
                        </IconButton>
                      }
                  >
                    <ListItemIcon style={{ marginInlineEnd: "1em" }}>
                      <PalmIcon bitmap={bitmap} />
                    </ListItemIcon>
                    <ListItemText primary={appName} secondary={filename} />
                  </ListItem>
              );
            })}
          </List>
        </Box>
      </Panel>
  );
}