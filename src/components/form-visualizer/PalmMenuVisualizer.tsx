import {useEffect, useMemo, useState} from "react";
import {Box} from "@mui/material";
import Grid2 from "@mui/material/Grid2";
import {PilrcTextVisualizer} from "./PilrcTextVisualizer.tsx";

interface PalmMenuVisualizerProps {
    pilrcText: string;
}

type MenuItem = {
    separator: boolean;
    id?: number;
    text?: string;
    command?: string;
};

type MenuPulldown = {
    title: string;
    items: MenuItem[];
};

type ParsedMenu = {
    resourceId: string;
    pulldowns: MenuPulldown[];
};

function unescapePilrcString(text: string): string {
    return text
        .replace(/\\r/g, "\r")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}

function parseMenuResource(pilrcText: string): ParsedMenu {
    const result: ParsedMenu = {
        resourceId: "ID",
        pulldowns: [],
    };

    const text = String(pilrcText || "");
    if (!text) return result;

    const headerMatch = text.match(/MENU\s+ID\s+([^\n]+)\s+BEGIN/i);
    if (headerMatch) {
        result.resourceId = headerMatch[1].trim();
    }

    const pulldownRegex = /PULLDOWN\s+"((?:\\.|[^"])*)"\s*\n\s*BEGIN([\s\S]*?)\n\s*END/gim;
    let pulldownMatch: RegExpExecArray | null;

    while ((pulldownMatch = pulldownRegex.exec(text)) !== null) {
        const title = unescapePilrcString(pulldownMatch[1].trim());
        const body = pulldownMatch[2];

        const items: MenuItem[] = [];

        const lines = body
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        for (const line of lines) {
            if (/^MENUITEM\s+SEPARATOR$/i.test(line)) {
                items.push({separator: true});
                continue;
            }

            const itemMatch = line.match(
                /^MENUITEM\s+"((?:\\.|[^"])*)"\s+ID\s+([0-9+-]+)(?:\s+"((?:\\.|[^"])*)")?$/i
            );

            if (itemMatch) {
                items.push({
                    separator: false,
                    text: unescapePilrcString(itemMatch[1].trim()),
                    id: Number(itemMatch[2]),
                    command: itemMatch[3] ? unescapePilrcString(itemMatch[3]).slice(0, 1) : undefined,
                });
            }
        }

        result.pulldowns.push({title, items});
    }

    return result;
}

export const PalmMenuVisualizer = ({pilrcText}: PalmMenuVisualizerProps) => {
    const menu = useMemo(() => parseMenuResource(pilrcText), [pilrcText]);

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    useEffect(() => {
        setOpenIndex(null);
    }, [pilrcText]);

    const titleLayout = useMemo(() => {
        let x = 4;
        return menu.pulldowns.map((pd) => {
            const w = Math.max(28, Math.min(56, Math.round(pd.title.length * 4.5 + 10)));
            const item = {x, w};
            x += w;
            return item;
        });
    }, [menu.pulldowns]);

    const activePulldown = openIndex !== null ? menu.pulldowns[openIndex] : null;
    const activeLayout = openIndex !== null ? titleLayout[openIndex] : null;

    const screenWidth = 160;
    const dropdownWidth = 120;

    const dropdownLeft =
        activeLayout
            ? Math.max(2, Math.min(activeLayout.x, screenWidth - dropdownWidth - 2))
            : 2;

    return (
        <Grid2 container spacing={2}>
            <Grid2 size={{xs: 12, md: 6}}>
                <PilrcTextVisualizer pilrcText={pilrcText} />
            </Grid2>
            <Grid2 size={{xs: 12, md: 6}}>
                {pilrcText &&
                    <Box
                        sx={{
                            width: 320,
                            height: 320,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            bgcolor: "#e0e0e0",
                            borderRadius: 1,
                        }}
                    >
                        <Box
                            sx={{
                                width: 160,
                                height: 160,
                                backgroundColor: "#ffffff",
                                position: "relative",
                                transform: "scale(2)",
                                transformOrigin: "center center",
                                border: "1px solid #999",
                                boxShadow: "0px 4px 12px rgba(0,0,0,0.15)",
                                fontFamily: "sans-serif",
                                overflow: "hidden",
                                boxSizing: "border-box",
                                backgroundImage: "radial-gradient(#d3d3d3 1px, transparent 1px)",
                                backgroundSize: "4px 4px",
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: 13,
                                    bgcolor: "#fff",
                                    borderBottom: "1px solid #000",
                                    display: "flex",
                                    alignItems: "center",
                                    px: "2px",
                                    gap: "1px",
                                    zIndex: 2,
                                    boxSizing: "border-box",
                                }}
                            >
                                {menu.pulldowns.map((pd, index) => {
                                    const layout = titleLayout[index];
                                    const isOpen = openIndex === index;

                                    return (
                                        <Box
                                            key={`${pd.title}-${index}`}
                                            onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                                            sx={{
                                                position: "absolute",
                                                left: `${layout.x}px`,
                                                top: "1px",
                                                width: `${layout.w}px`,
                                                height: "10px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                fontSize: "7px",
                                                fontWeight: 700,
                                                bgcolor: isOpen ? "#000" : "transparent",
                                                color: isOpen ? "#fff" : "#000",
                                                border: "1px solid transparent",
                                                borderRadius: "2px",
                                                cursor: "pointer",
                                                userSelect: "none",
                                                lineHeight: 1,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {pd.title}
                                        </Box>
                                    );
                                })}
                            </Box>

                            {activePulldown && (
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "13px",
                                        left: `${dropdownLeft}px`,
                                        width: `${dropdownWidth}px`,
                                        bgcolor: "#fff",
                                        border: "1px solid #000",
                                        boxShadow: "1px 1px 0px #000",
                                        zIndex: 3,
                                        boxSizing: "border-box",
                                        pb: "1px",
                                    }}
                                >

                                    <Box sx={{py: "1px"}}>
                                        {activePulldown.items.map((item, itemIndex) => {
                                            if (item.separator) {
                                                return (
                                                    <Box
                                                        key={`sep-${itemIndex}`}
                                                        sx={{
                                                            height: "5px",
                                                            my: "1px",
                                                            mx: "3px",
                                                            borderTop: "1px solid #000",
                                                        }}
                                                    />
                                                );
                                            }

                                            const label = item.text || "";
                                            const command = item.command ? `  [${item.command}]` : "";

                                            return (
                                                <Box
                                                    key={`item-${itemIndex}`}
                                                    sx={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        px: "3px",
                                                        py: "1px",
                                                        fontSize: "7px",
                                                        lineHeight: "10px",
                                                        color: "#000",
                                                        cursor: "pointer",
                                                        userSelect: "none",
                                                        "&:hover": {
                                                            bgcolor: "#000",
                                                            color: "#fff",
                                                        },
                                                    }}
                                                >
                                                    <Box
                                                        sx={{
                                                            minWidth: 0,
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                            pr: "4px",
                                                        }}
                                                    >
                                                        {label}
                                                    </Box>
                                                    <Box sx={{flexShrink: 0, opacity: item.command ? 1 : 0.35}}>
                                                        {item.id !== undefined ? item.id : ""}
                                                        {command}
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    </Box>
                }
            </Grid2>
        </Grid2>
    );
};