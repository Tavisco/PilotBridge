import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { debug, DlpConnection, readDbList } from "palm-sync";
import { Fragment, useCallback } from "react";
import { runSync } from "./../run-sync";

const log = debug("result");

function NoOp() {
  const handleClick = useCallback(async () => {
    await runSync(async () => {});
  }, []);

  return (
    <Button variant="contained" fullWidth onClick={handleClick}>
      No-op
    </Button>
  );
}

function ListDb() {
  const handleClick = useCallback(async () => {
    await runSync(async (dlpConnection: DlpConnection) => {
      const dbInfoList = await readDbList(dlpConnection, {
        ram: true,
        rom: true,
      });
      log(dbInfoList.map(({ name }) => `=> ${name}`).join("\n"));
    });
  }, []);
  return (
    <Button variant="contained" fullWidth onClick={handleClick}>
      List DB
    </Button>
  );
}

export function TestPanel() {
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up("sm"));

  const controls = [NoOp, ListDb];

  return (
    <Grid container spacing={1} p={2} justifyContent="center">
      <Grid item xs={12} />
      {controls.map((Component, idx) => (
        <Fragment key={idx}>
          <Grid
            item
            xs={4}
            sm={5}
            {...(!isWide && idx > 0 ? { sx: { marginLeft: 1 } } : {})}
          >
            <Component />
          </Grid>
          {isWide && <Grid item xs={12} />}
        </Fragment>
      ))}
    </Grid>
  );
}
