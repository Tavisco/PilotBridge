import { Box, Button, TextField, Typography } from "@mui/material";
import SaveIcon from '@mui/icons-material/Save';

export function CalendarSettingsPanel() {

  return (
    <Box
      component="form"
      sx={{ '& > :not(style)': { m: 1} }}
      noValidate
      autoComplete="off"
    >
      <Typography variant="body1">
      Enter the iCalendar URL:
      </Typography>
      <TextField id="outlined-basic" label="iCalendar URL" variant="outlined" />
      <Button variant="contained" endIcon={<SaveIcon />}  size="large" sx={{height: '6ch', width: '12ch'}}>
        Save
      </Button>
    </Box>
  );
}
