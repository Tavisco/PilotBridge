// src/pages/manage-apps.tsx
import { Box } from "@mui/material";
import Grid2 from "@mui/material/Grid2";
import {InstallAppPanel} from "./install-app-panel.tsx";
import {InstalledAppsPanel} from "./installed-apps-panel.tsx";

export function ManageAppsPage() {
    return (
        <Box p={3} sx={{ maxWidth: 800, margin: "0 auto" }}>

            <Grid2 container spacing={4}>
                <Grid2 size={12}>
                    <InstallAppPanel />
                </Grid2>

                <Grid2 size={12}>
                    <InstalledAppsPanel />
                </Grid2>
            </Grid2>
        </Box>
    );
}