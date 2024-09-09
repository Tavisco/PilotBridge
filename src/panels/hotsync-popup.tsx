import React, { useState } from "react";
import { Dialog, Typography, Button, Box } from "@mui/material";
import "./hotsync-popup.css"; // Import the CSS file

const HotSyncPopup: React.FC = () => {
  const [open, setOpen] = useState(true);


  return (
    <Dialog open={open} onClose={() => setOpen(false)}>
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        padding="20px"
        style={{ width: "300px", textAlign: "center" }}
      >
        <Typography variant="h6" gutterBottom>
          HotSync Progress
        </Typography>
        <Typography variant="body2">Status: Synchronizing CASL</Typography>
        <Typography variant="body2">User: Bryan Willard</Typography>
        <Box display="flex" justifyContent="center" marginTop="20px">
          {/* Static icons */}
          <Box className="icon" />
          <Box className="icon" />
          {/* Animated icon */}
          <Box>
              {/* SVG with red and blue arrows */}

              <svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 192.756 192.756"><g fill-rule="evenodd" clip-rule="evenodd"><path fill="#fff" d="M0 0h192.756v192.756H0V0z"/><path d="M108.914 25c-2.422-.518-4.412-.919-11.5-.535-41.339 2.273-67.533 32.396-67.7 71.328-.134 29.888 26.345 50.482 26.345 50.482l26.788-26.244-15.17-14.793 44.849-.184-.082 43.729c0 .033-14.428-14.109-14.428-14.109l-37.268 36.141-.083-.166c-26.036-13.842-44.407-41.725-44.407-72.732 0-45.1 37.386-81.658 83.514-81.658 8.191 0 13.039.668 15.98 1.638L108.914 25z" fill="#9c3234"/><path d="M83.825 167.74c2.432.5 4.413.936 11.517.533 41.34-2.273 67.516-32.395 67.717-71.326.1-29.889-26.344-50.5-26.344-50.5l-26.812 26.244 15.145 14.81-44.818.185.083-43.713c0-.017 14.427 14.108 14.427 14.108L132 21.958l.1.15c26.045 13.824 44.398 41.707 44.398 72.698 0 45.117-37.377 81.691-83.522 81.691-8.199 0-13.021-.668-15.98-1.639l6.829-7.118z" fill="#3b4396"/></g></svg>
            </Box>
        </Box>
        <Button
          variant="outlined"
          onClick={() => setOpen(false)}
          style={{ marginTop: "20px" }}
        >
          Cancel
        </Button>
      </Box>
    </Dialog>
  );
};

export default HotSyncPopup;