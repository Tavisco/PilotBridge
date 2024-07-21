import Typography from "@mui/material/Typography";
import { useCallback } from "react";
import {
  Toolbar,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  SvgIcon,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import React from "react";
import MenuIcon from "@mui/icons-material/Menu";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import InfoIcon from "@mui/icons-material/Info";
import InstallMobileIcon from "@mui/icons-material/InstallMobile";
import ScienceIcon from "@mui/icons-material/Science";
import SyncIcon from "@mui/icons-material/Sync";
import { observer } from "mobx-react";
import { UsbIcon, SerialIcon } from "./icons";
import { prefsStore } from "./prefs-store";
import { InstallAppPanel } from "./panels/install-app-panel";
import { TestPanel } from "./panels/test-panel";
import { DeviceInfoPanel } from "./device-info-panel";
import { DoHotsyncBar } from "./do-hotsync-bar";

function UnsupportedApisBanner() {
  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeContent: "center",
        textAlign: "center",
        padding: "2em",
      }}
    >
      <Typography variant="h4" gutterBottom>
        WebUSB and Web Serial APIs are not enabled.
      </Typography>
      <Typography variant="body1">
        Please use a Chromium-based browser, ensure WebUSB or Web Serial
        functionality are enabled, and open this page over HTTPS.
      </Typography>
    </div>
  );
}

const ConnectionSelector = observer(function ConnectionSelector() {
  const connectionString = prefsStore.get("connectionString");
  const onChange = useCallback((_: unknown, newConnectionString: string) => {
    if (newConnectionString === "usb" || newConnectionString === "serial:web") {
      prefsStore.set("connectionString", newConnectionString);
    }
  }, []);
  const buttons = [
    ["usb", UsbIcon, "USB", !!navigator.usb],
    ["serial:web", SerialIcon, "Serial", !!navigator.serial],
  ] as const;
  return (
    <div
      style={{
        display: "grid",
        placeContent: "center",
        textAlign: "center",
        padding: "1em",
        paddingTop: "0.5em",
      }}
    >
      <Typography variant="caption">Connection method</Typography>

      <ToggleButtonGroup
        value={connectionString}
        exclusive
        onChange={onChange}
        color="primary"
      >
        {buttons.map(([value, Icon, label, isEnabled]) => (
          <ToggleButton
            key={value}
            value={value}
            sx={{ width: "8em" }}
            size="small"
            disabled={!isEnabled}
          >
            <SvgIcon sx={{ marginRight: 1 }}>
              <Icon />
            </SvgIcon>
            <span
              style={{
                // Hack to center the text vertically compared to icon
                lineHeight: "24px",
              }}
            >
              {label}
            </span>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
});

export function App() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [currentComponent, setCurrentComponent] = React.useState("hotsync");
  const drawerWidth = 240;

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleListItemClick = (component: React.SetStateAction<string>) => {
    setCurrentComponent(component);
    setMobileOpen(false);
  };

  const drawer = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            Menu
          </Typography>
        </Toolbar>
        <Divider />
        <List>
          <ListItem key="hotsync" disablePadding>
            <ListItemButton
              selected={currentComponent === "hotsync"}
              onClick={() => handleListItemClick("hotsync")}
            >
              <ListItemIcon>
                <SyncIcon />
              </ListItemIcon>
              <ListItemText primary="Hotsync" />
            </ListItemButton>
          </ListItem>
          <ListItem key="simple-install" disablePadding>
            <ListItemButton
              selected={currentComponent === "install"}
              onClick={() => handleListItemClick("install")}
            >
              <ListItemIcon>
                <InstallMobileIcon />
              </ListItemIcon>
              <ListItemText primary="Install App" />
            </ListItemButton>
          </ListItem>
          <ListItem key="simple-retrieve" disablePadding>
            <ListItemButton
              selected={currentComponent === "retrieve"}
              onClick={() => handleListItemClick("retrieve")}
            >
              <ListItemIcon>
                <FileUploadIcon />
              </ListItemIcon>
              <ListItemText primary="Retrieve App" />
            </ListItemButton>
          </ListItem>
          <ListItem key="testing" disablePadding>
            <ListItemButton
              selected={currentComponent === "testing"}
              onClick={() => handleListItemClick("testing")}
            >
              <ListItemIcon>
                <ScienceIcon />
              </ListItemIcon>
              <ListItemText primary="Testing" />
            </ListItemButton>
          </ListItem>
          <ListItem key="about" disablePadding>
            <ListItemButton
              selected={currentComponent === "about"}
              onClick={() => handleListItemClick("about")}
            >
              <ListItemIcon>
                <InfoIcon />
              </ListItemIcon>
              <ListItemText primary="About" />
            </ListItemButton>
          </ListItem>
        </List>
        <Divider />
      </div>
      <div style={{ marginTop: "auto" }}>
        <Divider />
        <DeviceInfoPanel />
        <Divider />
        <ConnectionSelector />
      </div>
    </div>
  );

  if (!navigator.serial && !navigator.usb) {
    return <UnsupportedApisBanner />;
  }

  const renderComponent = () => {
    switch (currentComponent) {
      case "hotsync":
        return <div>WIP Hotsync</div>;
      case "install":
        return <InstallAppPanel />;
      case "retrieve":
        return <div>WIP Retrieve app</div>;
      case "testing":
        return <TestPanel />;
      case "about":
        return <div>WIP Info</div>;
      default:
        return null;
    }
  };

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" noWrap component="div">
              PilotBridge
              <Typography variant="caption" px={1}>
                V 0.0.1
              </Typography>
            </Typography>
          </Box>
          <DoHotsyncBar/>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: "block", sm: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", sm: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />

        {renderComponent()}
      </Box>
    </Box>
  );
}
