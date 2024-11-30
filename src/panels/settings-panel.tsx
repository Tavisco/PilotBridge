import { PaperProps } from "@mui/material/Paper";
import { Box } from "@mui/material";
import { Panel } from "../panel";
import Tab from '@mui/material/Tab';
import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';
import { useState } from "react";
import PeopleIcon from '@mui/icons-material/People';
import SaveIcon from '@mui/icons-material/Save';
import ScienceIcon from "@mui/icons-material/Science";
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { ManagerUsersPanel } from "./settings/manage-users-panel";
import { TestPanel } from "./settings/test-panel";
import { DataMgmtPanel } from "./settings/data-mgmt-panel";
import { CalendarSettingsPanel } from "./settings/calendar-settings-panel";
import { GoogleSettingsPanel } from "./settings/google-settings-panel";

export function SettingsPanel(props: PaperProps) {
  const [value, setValue] = useState('users');

  const handleChange = (_event: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
  };

  return (
    <Box minWidth="60vh">
      <Panel
        title="Settings"
        isExpandedByDefault={true}
        {...props}
        // sx={{ width: "100%" }}
      >
        <Box>
          <div
            style={{
              padding: "2em",
              paddingTop: "0em"
            }}
          >
            <TabContext value={value}>
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <TabList onChange={handleChange} aria-label="Settings tabs" centered>
                  <Tab icon={<PeopleIcon />} iconPosition="start" label="Users" value="users" />
                  <Tab icon={<SaveIcon />} iconPosition="start" label="Data" value="data" />
                  <Tab icon={<ScienceIcon />} iconPosition="start" label="Testing" value="testing" />
                  <Tab icon={<CalendarMonthIcon />} iconPosition="start" label="Calendar" value="calendar" />
                  <Tab icon={<CalendarMonthIcon />} iconPosition="start" label="Google Integration" value="google" />
                </TabList>
              </Box>
              <TabPanel value="users"><ManagerUsersPanel /></TabPanel>
              <TabPanel value="data"><DataMgmtPanel /></TabPanel>
              <TabPanel value="testing"><TestPanel /></TabPanel>
              <TabPanel value="calendar"><CalendarSettingsPanel /></TabPanel>
              <TabPanel value="google"><GoogleSettingsPanel /></TabPanel>
            </TabContext>
          </div>
        </Box>
      </Panel>
    </Box>
  );
}
