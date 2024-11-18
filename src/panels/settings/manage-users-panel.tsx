import { Box, IconButton, List, ListItem, ListItemText, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useEffect, useState } from "react";
import { WebDatabaseStorageImplementation } from "../../database-storage/web-db-stg-impl";
import { prefsStore } from "../../prefs-store";
import hotsyncEvents, { HotsyncEvents } from "../../event-emitter/hotsync-event-emitter";

export function ManagerUsersPanel() {
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
      <Typography variant="body1">
        User list:
      </Typography>
      {usernames.length == 0 && (
            <div
              style={{
                display: "grid",
                placeContent: "center",
                textAlign: "center",
                padding: "2em",
              }}
            >
              <Typography variant="h6" gutterBottom>
                No known devices!
              </Typography>
              <Typography variant="body1">
                Go ahead and create a new user!
              </Typography>
            </div>
          )}
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
