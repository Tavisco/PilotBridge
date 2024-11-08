import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  SelectChangeEvent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { observer } from "mobx-react";
import SyncIcon from "@mui/icons-material/Sync";
import { runSync } from "./run-sync";
import {
  DlpConnection,
  DownloadNewResourcesConduit,
  InstallNewResourcesConduit,
  SyncDatabasesConduit,
  syncDevice,
  UpdateClockConduit,
  UpdateSyncInfoConduit,
} from "palm-sync";
import { WebDatabaseStorageImplementation } from "./database-storage/web-db-stg-impl";
import hotsyncEvents, {
  HotsyncEvents,
} from "./event-emitter/hotsync-event-emitter";
import { useEffect, useState } from "react";
import { prefsStore } from "./prefs-store";

const dbStg = new WebDatabaseStorageImplementation();
const addNewDevicePlaceholder = "add_new_device";

export const DoHotsyncBar = observer(function DoHotsyncBar() {
  const [doingHotsync, setDoingHotsync] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [knownDevices, setKnownDevices] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const handleClose = () => {
    setOpen(false);
  };

  useEffect(() => {
    async function loadKnownDevices() {
      const handleLoadKnownDevices = async () => {
        setKnownDevices(await dbStg.getAllDevicesNames());

        const lastUsedDevice = prefsStore.get("selectedDevice") as string;
        setSelectedDevice(lastUsedDevice);
      };

      hotsyncEvents.on(HotsyncEvents.HotsyncUserChanged, handleLoadKnownDevices);
      handleLoadKnownDevices();

      return () => {
        hotsyncEvents.off(HotsyncEvents.HotsyncUserChanged, handleLoadKnownDevices);
      }
    }

    loadKnownDevices();
  }, []);

  async function updateSelectedDevice(deviceName: string) {
    setKnownDevices(await dbStg.getAllDevicesNames());
    
    prefsStore.set("selectedDevice", deviceName);
    
    hotsyncEvents.emit(HotsyncEvents.HotsyncUserChanged);
  }

  const handleDoSyncClick = async () => {
    const deviceName = prefsStore.get("selectedDevice") as string;

    hotsyncEvents.emit(HotsyncEvents.HotsyncStarted);
    setDoingHotsync(true);

    try {
      await runSync(async (dlpConnection: DlpConnection) => {
        let conduits = [
          new SyncDatabasesConduit(),
          new DownloadNewResourcesConduit(),
          new InstallNewResourcesConduit(),
          new UpdateClockConduit(),
          new UpdateSyncInfoConduit(),
        ];
        return await syncDevice(dlpConnection, deviceName, dbStg, conduits);
      });
    } catch (error) {
      console.error(error);
    } finally {
      setDoingHotsync(false);
      hotsyncEvents.emit(HotsyncEvents.HotsyncFinished);
    }
  };

  const handleChange = (event: SelectChangeEvent) => {
    const deviceName = event.target.value as string;

    if (addNewDevicePlaceholder === deviceName) {
      setOpen(true);
    } else {
      updateSelectedDevice(deviceName);
    }
  };

  return (
    <Box
      sx={{
        minWidth: "10em",
        display: "flex",
      }}
    >
      <FormControl
        fullWidth
        variant="filled"
        size="small"
        disabled={doingHotsync}
      >
        <InputLabel id="demo-simple-select-label">User</InputLabel>
        <Select
          autoWidth
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value={selectedDevice}
          label="User"
          onChange={handleChange}
        >
          <MenuItem value={addNewDevicePlaceholder}>
            <em>Add new</em>
          </MenuItem>

          {knownDevices.map((device) => (
            <MenuItem key={device} value={device}>
              {device}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Button
        color="success"
        size="small"
        variant="contained"
        startIcon={<SyncIcon />}
        sx={{ marginLeft: "10px", width: "14em" }}
        onClick={handleDoSyncClick}
        disabled={doingHotsync || selectedDevice === ''}
      >
        {!doingHotsync ? <a>Hotsync</a> : <a>Syncing...</a>}
      </Button>
      <Dialog
        open={open}
        onClose={handleClose}
        PaperProps={{
          component: 'form',
          onSubmit: async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const formJson = Object.fromEntries((formData as any).entries());
            const username = formJson.username;
            await dbStg.getUserDirectory(username, true);
            updateSelectedDevice(username);
            handleClose();
          },
        }}
      >
        <DialogTitle>Add new user</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Each PalmOS device should have a unique identifier known as User. If you ever performed a hotsync
            before in that specific PDA, it it shown in the hotsync app in the top-right corner, otherwise
            it will be blank and you can assign whatever Username you want.
            Please, insert the existing or the desired username below:
          </DialogContentText>
          <TextField
            autoFocus
            required
            margin="dense"
            id="username"
            name="username"
            label="Username"
            fullWidth
            variant="standard"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit">Add device</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});
