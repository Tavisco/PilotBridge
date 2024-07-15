import Box, { BoxProps } from "@mui/material/Box";
import { observer } from "mobx-react";
import { useEffect, useRef } from "react";
import { logStore } from "./log-store";
import { Card, CardContent, CardProps, Typography } from "@mui/material";

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
    <Card
      sx={{ overflowY: "scroll", height: 1, padding: 1 }}
      ref={containerRef}
      variant="outlined"
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
      {...props}
    >
      <CardContent>
        <Typography sx={{ fontSize: 16 }} color="text.secondary" gutterBottom>
          Sync log
        </Typography>
        <Box>
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
