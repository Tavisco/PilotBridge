import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  SelectChangeEvent,
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

export const DoHotsyncBar = observer(function DoHotsyncBar() {
  const [doingHotsync, setDoingHotsync] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [knownDevices, setKnownDevices] = useState<string[]>([]);

  useEffect(() => {
    async function loadKnownDevices() {
      setKnownDevices(await dbStg.getAllDevicesNames());

      const lastUsedDevice = prefsStore.get("selectedDevice") as string;
      setSelectedDevice(lastUsedDevice);
    }
    loadKnownDevices();
  }, []);

  const handleDoSyncClick = async () => {
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
        const deviceName = prefsStore.get("selectedDevice") as string;
        return await syncDevice(dlpConnection, deviceName, dbStg, conduits);
      });
    } catch (error) {
      console.error(error);
    }

    setDoingHotsync(false);
    hotsyncEvents.emit(HotsyncEvents.HotsyncFinished);
    return;
  };

  const handleChange = (event: SelectChangeEvent) => {
    const deviceName = event.target.value as string;
    setSelectedDevice(deviceName);
    prefsStore.set("selectedDevice", deviceName);
    hotsyncEvents.emit(HotsyncEvents.HotsyncUserChanged);
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
        <InputLabel id="demo-simple-select-label">Device</InputLabel>
        <Select
          autoWidth
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value={selectedDevice}
          label="Device"
          onChange={handleChange}
        >
          <MenuItem value="add_new_device">
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
        disabled={doingHotsync}
      >
        {!doingHotsync ? <a>Hotsync</a> : <a>Syncing...</a>}
      </Button>
    </Box>
  );
});
