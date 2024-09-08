import { PaperProps } from "@mui/material/Paper";
import { Box, IconButton, List, ListItem, ListItemText } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useEffect, useState } from "react";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import { prefsStore } from "../prefs-store";
import hotsyncEvents, { HotsyncEvents } from "../event-emitter/hotsync-event-emitter";

export function ManagerUsersPanel(props: PaperProps) {
  const [usernames, setUsernames] = useState<string[]>([]);

  const dbStg = new WebDatabaseStorageImplementation();

  useEffect(() => {
    async function loadKnownDevices() {
      setUsernames(await dbStg.getAllDevicesNames());
    }

    loadKnownDevices();
  }, []);

  const handleDeleteUsername = async (username: string) => {
    await dbStg.removeDevice(username);
    setUsernames(await dbStg.getAllDevicesNames());
    prefsStore.set("selectedDevice", '');
    hotsyncEvents.emit(HotsyncEvents.HotsyncUserChanged);
  };

  return (
    <Box>
      <List>
        {usernames.map((username) => (
          <ListItem
            key={username}
            secondaryAction={
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={() => handleDeleteUsername(username)}
              >
                <DeleteIcon />
              </IconButton>
            }
          >
            <ListItemText
              primary={username}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
