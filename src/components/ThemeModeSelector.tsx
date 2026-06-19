import { useCallback } from "react";
import { Typography, ToggleButton, ToggleButtonGroup, Stack } from "@mui/material";
import { observer } from "mobx-react";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import { prefsStore } from "../prefs-store.ts";

export const ThemeModeSelector = observer(function ThemeModeSelector() {
    const themeMode = prefsStore.get("themeMode") as "light" | "dark" | "auto";

    const onChange = useCallback((_: unknown, newMode: "light" | "dark" | "auto") => {
        if (newMode) {
            prefsStore.set("themeMode", newMode);
        }
    }, []);

    const buttons = [
        ["light", Brightness7Icon, "Light"],
        ["dark", Brightness4Icon, "Dark"],
        ["auto", SettingsBrightnessIcon, "Auto"],
    ] as const;

    return (
        <Stack
            spacing={1}
            sx={{
                p: 1.5,
                width: "100%",
                boxSizing: "border-box"
            }}
        >
            <Typography
                variant="caption"
                color="text.secondary"
                fontWeight="medium"
                letterSpacing={0.5}
                sx={{ px: 0.5 }}
            >
                Appearance
            </Typography>

            <ToggleButtonGroup
                value={themeMode}
                exclusive
                fullWidth
                onChange={onChange}
                color="primary"
                size="small"
                sx={{
                    backgroundColor: "action.hover",
                    padding: 0.5,
                    borderRadius: 2,
                    "& .MuiToggleButtonGroup-grouped": {
                        margin: "0 2px",
                        border: "none",
                        borderRadius: 1.5,
                        padding: "6px 4px",
                        transition: "all 0.2s ease-in-out",
                        "&.Mui-selected": {
                            backgroundColor: "background.paper",
                            boxShadow: 1,
                            color: "text.primary",
                            "&:hover": {
                                backgroundColor: "background.paper",
                            },
                        },
                        "&:not(:first-of-type), &:not(:last-of-type)": {
                            borderRadius: 1.5,
                            border: "none",
                        },
                    },
                }}
            >
                {buttons.map(([value, Icon, label]) => (
                    <ToggleButton
                        key={value}
                        value={value}
                        disableRipple
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                            textTransform: "none",
                            fontWeight: 500,
                            fontSize: "0.7rem",
                            lineHeight: 1,
                        }}
                    >
                        <Icon sx={{ fontSize: "1.25rem" }} />
                        <span>{label}</span>
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
        </Stack>
    );
});