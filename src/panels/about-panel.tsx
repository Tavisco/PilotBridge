import { PaperProps } from "@mui/material/Paper";
import { Box, Typography } from "@mui/material";
import { Panel } from "../panel";

export function AboutPanel(props: PaperProps) {
  return (
    <Box maxWidth="60vh">
      <Panel
        title="About PilotBridge"
        isExpandedByDefault={true}
        {...props}
        sx={{ width: "100%" }}
      >
        <Box>
          <div
            style={{
              height: "30vh",
              display: "grid",
              placeContent: "center",
              textAlign: "center",
              padding: "2em",
            }}
          >
            <Typography variant="body1">
              Front-end coded by Otávio Pinheiro <a href="https://github.com/Tavisco/PilotBridge">source code</a>
            </Typography>
            <Typography variant="body1">
              Hotsync engine (<a href="https://github.com/jichu4n/palm-sync">palm-sync</a>) coded by Chuan Ji and contributors
            </Typography>
          </div>
        </Box>
      </Panel>
    </Box>
  );
}
