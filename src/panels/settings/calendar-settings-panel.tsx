import { Box, Button, TextField, Typography } from "@mui/material";
import SaveIcon from '@mui/icons-material/Save';
import { prefsStore } from '../../prefs-store';
import { useEffect, useState } from "react";

export function CalendarSettingsPanel() {

  const [currentICalendarURL, setCurrentICalendarURL] = useState('');
  const [saveButtonColor, setSaveButtonColor] = useState('primary');

  useEffect(() => {
    setCurrentICalendarURL(prefsStore.get('iCalendarURL') as string);
  }, []);

  const handleSaveClick = () => {
    setSaveButtonColor('success');
    prefsStore.set('iCalendarURL', currentICalendarURL);
  }

  return (
    <Box
      component="form"
      sx={{ '& > :not(style)': { m: 1 } }}
      noValidate
      autoComplete="off"
    >
      <Typography variant="body1">
        Enter the iCalendar URL:
      </Typography>
      <TextField id="outlined-basic" label="iCalendar URL" variant="outlined" value={currentICalendarURL}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          setCurrentICalendarURL(event.target.value);
        }} />
      <Button variant="contained" endIcon={<SaveIcon />} size="large" sx={{ height: '6ch', width: '12ch' }} color={saveButtonColor as any} onClick={handleSaveClick}>
        Save
      </Button>
    </Box>
  );
}
