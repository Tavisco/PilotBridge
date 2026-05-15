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
  Tooltip, Typography,
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
import GoogleIcon from "@mui/icons-material/Google";
import LinkIcon from "@mui/icons-material/Link";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LinkOffIcon from "@mui/icons-material/LinkOff";

const dbStg = new WebDatabaseStorageImplementation();
const addNewDevicePlaceholder = "add_new_device";

function GoogleLoginButton({ disabled }: { disabled: boolean }) {
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      prefsStore.set("googleToken", tokenResponse.access_token);
      prefsStore.set("googleTokenDate", new Date().toISOString());
    },
    scope: "https://www.googleapis.com/auth/calendar.readonly",
  });

  return (
      <Button
          color="info"
          size="medium" // Changed to medium for better clickability
          variant="contained"
          startIcon={<GoogleIcon />}
          sx={{ minWidth: "150px" }} // Unified minWidth
          onClick={() => googleLogin()}
          disabled={disabled}
      >
        Google Login
      </Button>
  );
}

const GoogleStatusIndicator = observer(() => {
  const isEnabled = prefsStore.isConduitEnabled("googleCalendar");
  const hasClientId = !!prefsStore.get("googleClientID");
  const token = prefsStore.get("googleToken");
  const lastTokenRefresh = prefsStore.get("googleTokenDate") as string;

  const isExpired = lastTokenRefresh
      ? Date.now() - new Date(lastTokenRefresh).getTime() > 3300 * 1000
      : true;

  if (!isEnabled) return null;

  if (!hasClientId) {
    return (
        <Tooltip title="Google Integration enabled but Client ID is missing in Settings">
          <ErrorOutlineIcon color="warning" />
        </Tooltip>
    );
  }

  if (token && !isExpired) {
    return (
        <Tooltip title="Google Calendar Connected">
          <LinkIcon color="success" />
        </Tooltip>
    );
  }

  return (
      <Tooltip title="Google Authentication Required">
        <LinkOffIcon color="action" />
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
      };
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
    const clientId = prefsStore.get("googleClientID");
    const lastTokenRefresh = prefsStore.get("googleTokenDate") as string;
    const isTokenEmpty = !prefsStore.get("googleToken");

    const isAlmostExpired = lastTokenRefresh
        ? Date.now() - new Date(lastTokenRefresh).getTime() > 3300 * 1000
        : true;

    return (
        !!clientId &&
        prefsStore.isConduitEnabled("googleCalendar") &&
        (isTokenEmpty || isAlmostExpired)
    );
  }

  return (
      <Box
          sx={{
            width: "100%",
            display: "flex",
            flexDirection: { xs: "column", md: "row" }, // Stack on mobile, row on desktop
            alignItems: "center",
            justifyContent: "space-between", // Pushes content to opposite ends
            gap: 2,
            py: 1,
          }}
      >
        {/* LEFT SIDE: Brand & Version */}
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography variant="h6" component="h1" fontWeight="bold" sx={{ letterSpacing: 1 }}>
            PilotBridge
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.7, fontFamily: 'monospace' }}>
            v1.4.0
          </Typography>
        </Box>

        {/* RIGHT SIDE: Controls & Status */}
        <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              width: { xs: "100%", md: "auto" }, // Full width on mobile for easier tapping
              justifyContent: "flex-end",
            }}
        >
          <GoogleStatusIndicator />

          <FormControl
              variant="filled"
              size="small"
              disabled={doingHotsync}
              sx={{ minWidth: "180px" }}
          >
            <InputLabel id="user-select-label">User</InputLabel>
            <Select
                labelId="user-select-label"
                value={selectedDevice}
                onChange={handleChange}
                label="User"
            >
              <MenuItem value={addNewDevicePlaceholder}>
                <em>Add new...</em>
              </MenuItem>
              {knownDevices.map((device) => (
                  <MenuItem key={device} value={device}>
                    {device}
                  </MenuItem>
              ))}
            </Select>
          </FormControl>

          {!shouldDisplayGoogleLogin() ? (
              <Button
                  color="success"
                  variant="contained"
                  startIcon={<SyncIcon />}
                  sx={{ minWidth: "140px", height: "48px" }} // Height matches 'filled' input size
                  onClick={handleDoSyncClick}
                  disabled={doingHotsync || selectedDevice === ""}
              >
                {!doingHotsync ? "Hotsync" : "Syncing..."}
              </Button>
          ) : (
              <GoogleLoginButton disabled={doingHotsync || selectedDevice === ""} />
          )}
        </Box>

        <Dialog
            open={open}
            onClose={handleClose}
            PaperProps={{
              component: "form",
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
              Each PalmOS device should have a unique identifier known as User. If you ever
              performed a hotsync before in that specific PDA, it is shown in the hotsync app
              in the top-right corner; otherwise, it will be blank, and you can assign
              whatever Username you want. Please, insert the existing or the desired username
              below:
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
            <Button type="submit" variant="contained">Add device</Button>
          </DialogActions>
        </Dialog>
      </Box>
  );
});