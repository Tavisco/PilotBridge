import { Box, FormControl, InputLabel, Select, MenuItem, Button } from "@mui/material";
import { observer } from "mobx-react";
import SyncIcon from "@mui/icons-material/Sync";
import { runSync } from "./run-sync";
import { DlpConnection, syncDevice } from "palm-sync";

export const DoHotsyncBar = observer(function DoHotsyncBar()
{
    const handleDoSyncClick = async () => {
        return await runSync(async (dlpConnection: DlpConnection) => {
            try {
                const path = "Palms" as string;
                const user = "TaviscoVisor" as string;
                return await syncDevice(dlpConnection, path, user);
            } catch (error) {
                console.error(error);
            }
            
        });
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
            <MenuItem value={20}>Twenty</MenuItem>
            <MenuItem value={30}>Thirty</MenuItem>
          </Select>
        </FormControl>
        <Button
          color="success"
          size="small"
          variant="outlined"
          startIcon={<SyncIcon />}
          sx={{ marginLeft: "10px", width: "14em" }}
          onClick={handleDoSyncClick}
        >
          Do Hotsync
        </Button>
      </Box>
    )
})