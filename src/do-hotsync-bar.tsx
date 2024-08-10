import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
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

export const DoHotsyncBar = observer(function DoHotsyncBar() {
  const handleDoSyncClick = async () => {
    hotsyncEvents.emit(HotsyncEvents.HotsyncStarted);
    await runSync(async (dlpConnection: DlpConnection) => {
      try {
        let dbStg = new WebDatabaseStorageImplementation();

        let conduits = [
          new SyncDatabasesConduit(),
          new DownloadNewResourcesConduit(),
          new InstallNewResourcesConduit(),
          new UpdateClockConduit(),
          new UpdateSyncInfoConduit(),
        ];

        return await syncDevice(dlpConnection, "TaviscoVisor", dbStg, conduits);
      } catch (error) {
        console.error(error);
      }
    });

    hotsyncEvents.emit(HotsyncEvents.HotsyncFinished);
    return;
  };

  return (
    <Box
      sx={{
        minWidth: "10em",
        display: "flex",
      }}
    >
      <FormControl fullWidth variant="filled" size="small">
        <InputLabel id="demo-simple-select-label">Device</InputLabel>
        <Select
          autoWidth
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value="20"
          label="Device"
          // onChange={handleChange}
        >
          <MenuItem value="">
            <em>Add new</em>
          </MenuItem>
          <MenuItem value={20}>TaviscoVisor</MenuItem>
          <MenuItem value={30}>TaviscoTX</MenuItem>
        </Select>
      </FormControl>
      <Button
        color="success"
        size="small"
        variant="contained"
        startIcon={<SyncIcon />}
        sx={{ marginLeft: "10px", width: "14em" }}
        onClick={handleDoSyncClick}
      >
        Do Hotsync
      </Button>
    </Box>
  );
});
