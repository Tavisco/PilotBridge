import FileUploadIcon from "@mui/icons-material/FileUpload";
import InfoIcon from "@mui/icons-material/Info";
import InstallMobileIcon from "@mui/icons-material/InstallMobile";
import ScienceIcon from "@mui/icons-material/Science";
import SyncIcon from "@mui/icons-material/Sync";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Paper, { PaperProps } from "@mui/material/Paper";
import SvgIcon from "@mui/material/SvgIcon";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { observer } from "mobx-react";
import * as React from "react";
import { useCallback } from "react";
import { SerialIcon, UsbIcon } from "./icons";
import { InstallAppPanel } from "./panels/install-app-panel";
import { TestPanel } from "./panels/test-panel";
import { prefsStore } from "./prefs-store";

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
          sx={{ width: "10em" }}
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
  );
});

interface TabPanelProps {
  children?: React.ReactNode;
  dir?: string;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`full-width-tabpanel-${index}`}
      aria-labelledby={`full-width-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `full-width-tab-${index}`,
    "aria-controls": `full-width-tabpanel-${index}`,
  };
}

export function ActionPanel(props: PaperProps) {
  const [value, setValue] = React.useState(0);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Paper elevation={3} {...props}>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" px={2} py={2}>
          PilotBridge
          <Typography variant="caption" px={1}>V 0.0.1</Typography>
        </Typography>

        <div style={{ margin: 10 }}>
          <ConnectionSelector />
        </div>
      </div>

      <Divider />

      <Tabs value={value} onChange={handleChange} centered>
      <Tab
          icon={<SyncIcon />}
          iconPosition="start"
          label="Hotsync"
          {...a11yProps(0)}
        />
        <Tab
          icon={<InstallMobileIcon />}
          iconPosition="start"
          label="Install app"
          {...a11yProps(1)}
        />
        <Tab
          icon={<FileUploadIcon />}
          iconPosition="start"
          label="Retrieve app"
          {...a11yProps(2)}
        />
        <Tab
          icon={<ScienceIcon />}
          iconPosition="start"
          label="Testing"
          {...a11yProps(3)}
        />
        <Tab
          icon={<InfoIcon />}
          iconPosition="start"
          label="About"
          {...a11yProps(4)}
        />
      </Tabs>

      <TabPanel value={value} index={0}>
        WIP Hotsync
      </TabPanel>
      <TabPanel value={value} index={1}>
        <InstallAppPanel/>
      </TabPanel>
      <TabPanel value={value} index={2}>
        WIP Retrieve app
      </TabPanel>
      <TabPanel value={value} index={3}>
        <TestPanel />
      </TabPanel>
      <TabPanel value={value} index={4}>
        WIP Info
      </TabPanel>
    </Paper>
  );
}
