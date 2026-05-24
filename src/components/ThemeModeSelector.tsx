
import { useCallback } from "react";
import { Typography, ToggleButton, ToggleButtonGroup, SvgIcon } from "@mui/material";
import { observer } from "mobx-react";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import {prefsStore} from "../prefs-store.ts";

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
        <div
            style={{
                display: "grid",
                placeContent: "center",
                textAlign: "center",
                padding: "1em",
                paddingTop: "0.5em",
            }}
        >
            <Typography variant="caption">Theme mode</Typography>
            <ToggleButtonGroup
                value={themeMode}
                exclusive
                onChange={onChange}
                color="primary"
                size="small"
            >
                {buttons.map(([value, Icon, label]) => (
                    <ToggleButton key={value} value={value} sx={{ width: "6em" }}>
                        <SvgIcon sx={{ marginRight: 1 }}>
                            <Icon />
                        </SvgIcon>
                        <span style={{ lineHeight: "24px" }}>{label}</span>
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
        </div>
    );
});