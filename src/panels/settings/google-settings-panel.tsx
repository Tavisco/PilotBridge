import { Box, Button, FormControlLabel, FormGroup, Grid2, Switch, TextField, Typography } from "@mui/material";
import SaveIcon from '@mui/icons-material/Save';
import { prefsStore } from '../../prefs-store';
import { useEffect, useState } from "react";

export function GoogleSettingsPanel() {

  const [currentClientID, setCurrentClientId] = useState('');
  const [currentSecretKey, setCurrentSecretKey] = useState('');
  const [saveButtonColor, setSaveButtonColor] = useState('primary');
  const [integrationEnabled, setIntegrationEnabled] = useState(false);

  useEffect(() => {
    setCurrentClientId(prefsStore.get('googleClientID') as string);
    setCurrentSecretKey(prefsStore.get('googleSecretKey') as string);
    setIntegrationEnabled(prefsStore.isConduitEnabled('googleCalendar'));
  }, []);

  const handleSaveClick = () => {
    prefsStore.set('googleClientID', currentClientID);
    prefsStore.set('googleSecretKey', currentSecretKey);
    if (integrationEnabled) {
      prefsStore.enableConduit('googleCalendar');
    } else {
      prefsStore.disableConduit('googleCalendar');
    }

    setSaveButtonColor('success');
  };

  return (
    <Box
      component="form"
      sx={{ '& > :not(style)': { m: 1 } }}
      noValidate
      autoComplete="off"
    >
      <Grid2 container spacing={2} maxWidth="md">

        <Grid2 size={12} sx={{ '& > :not(style)': { m: 1 } }}>
          <FormGroup>
            <FormControlLabel control={<Switch checked={integrationEnabled} onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setIntegrationEnabled(event.target.checked);
            }}  />} label="Enable google integration" />
          </FormGroup>
        </Grid2>

        <Grid2 size={12} sx={{ '& > :not(style)': { m: 1 } }}>
          <Typography variant="body1">
            Enter the App Client ID:
          </Typography>
          <TextField fullWidth id="outlined-basic" label="Client ID" variant="outlined" value={currentClientID}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setCurrentClientId(event.target.value);
            }} />
        </Grid2>

        <Grid2 size={12} sx={{ '& > :not(style)': { m: 1 } }}>
          <Typography variant="body1">
            Enter the App Secret Key:
          </Typography>
          <TextField fullWidth id="outlined-basic" label="Secret Key" variant="outlined" value={currentSecretKey}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setCurrentSecretKey(event.target.value);
            }} />
        </Grid2>

        <Grid2 size={12} sx={{ '& > :not(style)': { m: 1 } }}>
          <Button variant="contained" endIcon={<SaveIcon />} size="large" sx={{ height: '6ch', width: '12ch' }} color={saveButtonColor as any} onClick={handleSaveClick}>
            Save
          </Button>
        </Grid2>
      </Grid2>
    </Box>
  );
}
