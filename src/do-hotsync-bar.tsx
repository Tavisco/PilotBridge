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
  Tooltip,
  Chip,
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
import { GoogleCalendarConduit } from "./conduits/google-calendar-conduit";
import { useGoogleLogin } from "@react-oauth/google";
import GoogleIcon from '@mui/icons-material/Google';
import { ICalendarConduit } from "./conduits/iCalendar-conduit";
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CloudOffIcon from '@mui/icons-material/CloudOff';

const dbStg = new WebDatabaseStorageImplementation();
const addNewDevicePlaceholder = "add_new_device";

function GoogleLoginButton({ disabled }: { disabled: boolean }) {
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      prefsStore.set('googleToken', tokenResponse.access_token);
      prefsStore.set('googleTokenDate', new Date().toISOString()); // Store as string for safety
    },
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
  });

  return (
      <Button
          color="info"
          size="small"
          variant="contained"
          startIcon={<GoogleIcon />}
          sx={{ marginLeft: "10px", width: "17em" }}
          onClick={() => googleLogin()}
          disabled={disabled}
      >
        Google Login
      </Button>
  );
}

const GoogleStatusIndicator = observer(() => {
  const isEnabled = prefsStore.isConduitEnabled('googleCalendar');
  const hasClientId = !!prefsStore.get('googleClientID');
  const token = prefsStore.get('googleToken');
  const lastTokenRefresh = prefsStore.get('googleTokenDate') as string;

  const isExpired = lastTokenRefresh
      ? (Date.now() - new Date(lastTokenRefresh).getTime()) > 3300 * 1000
      : true;

  if (!isEnabled) return null;

  if (!hasClientId) {
    return (
        <Tooltip title="Google Integration enabled but Client ID is missing in Settings">
          <ErrorOutlineIcon color="warning" sx={{ mr: 1, alignSelf: 'center' }} />
        </Tooltip>
    );
  }

  if (token && !isExpired) {
    return (
        <Tooltip title="Google Calendar Connected">
          <CheckCircleIcon color="success" sx={{ mr: 1, alignSelf: 'center' }} />
        </Tooltip>
    );
  }

  return (
      <Tooltip title="Google Authentication Required">
        <CloudOffIcon color="action" sx={{ mr: 1, alignSelf: 'center' }} />
      </Tooltip>
  );
});

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
          new GoogleCalendarConduit(),
          // new ICalendarConduit(),
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

  function shouldDisplayGoogleLogin(): boolean {
    const clientId = prefsStore.get('googleClientID');
    const lastTokenRefresh = prefsStore.get('googleTokenDate') as string;
    const isTokenEmpty = !prefsStore.get('googleToken');

    const isAlmostExpired = lastTokenRefresh
        ? (Date.now() - new Date(lastTokenRefresh).getTime()) > 3300 * 1000
        : true;

    return !!clientId && prefsStore.isConduitEnabled('googleCalendar') && (isTokenEmpty || isAlmostExpired);
  }

  return (
      <Box sx={{ minWidth: "25em", display: "flex", alignItems: "center" }}>

        {/* 1. Add the indicator here, at the start of the bar */}
        <GoogleStatusIndicator />

        <FormControl fullWidth variant="filled" size="small" disabled={doingHotsync}>
          <InputLabel id="demo-simple-select-label">User</InputLabel>
          <Select
              autoWidth
              labelId="demo-simple-select-label"
              id="demo-simple-select"
              value={selectedDevice}
              label="User"
              onChange={handleChange}
          >
            <MenuItem value={addNewDevicePlaceholder}><em>Add new</em></MenuItem>
            {knownDevices.map((device) => (
                <MenuItem key={device} value={device}>{device}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {!shouldDisplayGoogleLogin() ? (
            <Button
                color="success"
                size="small"
                variant="contained"
                startIcon={<SyncIcon />}
                sx={{ marginLeft: "10px", width: "14em" }}
                onClick={handleDoSyncClick}
                disabled={doingHotsync || selectedDevice === ''}
            >
              {!doingHotsync ? "Hotsync" : "Syncing..."}
            </Button>
        ) : (
            <GoogleLoginButton disabled={doingHotsync || selectedDevice === ''} />
        )}

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
