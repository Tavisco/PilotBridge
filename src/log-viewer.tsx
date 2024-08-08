import Box, { BoxProps } from "@mui/material/Box";
import { observer } from "mobx-react";
import { useEffect, useRef } from "react";
import { logStore } from "./log-store";
import {
  Card,
  CardContent,
  CardProps,
  Divider,
  Typography,
} from "@mui/material";

export const LogViewer = observer(function LogViewer(props: CardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrolledToBottom = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (isScrolledToBottom.current) {
      container.scrollTop = container.scrollHeight;
    }
  });

  return (
    <Card variant="outlined" {...props}>
      <CardContent sx={{ height: "93vh", overflow: "hidden" }}>
        <Typography sx={{ fontSize: 16 }} color="text.secondary" gutterBottom>
          Sync log
        </Typography>
        <Divider />
        <Box
          sx={{ height: "98%", padding: 1, overflowY: "auto" }}
          ref={containerRef} 
          onScroll={() => {
            const container = containerRef.current;
            if (!container) {
              return;
            }
            isScrolledToBottom.current =
              container.scrollHeight -
                container.scrollTop -
                container.clientHeight <
              2;
          }}
        >
          {logStore.logs.map((entry, i) => (
            <div key={i}>
              {entry.type === "log" ? (
                <>
                  <code
                    style={{
                      fontSize: "0.8em",
                      wordBreak: "break-all",
                      whiteSpace: "preserve",
                    }}
                  >
                    {entry.module && (
                      <span style={{ opacity: "50%", marginRight: "1em" }}>
                        {entry.module}
                      </span>
                    )}
                    {entry.message}
                  </code>
                </>
              ) : (
                <hr style={{ margin: "1em 0" }} />
              )}
            </div>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
});
