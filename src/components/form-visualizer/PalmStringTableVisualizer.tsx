import { Paper, Typography } from "@mui/material"
import Box from "@mui/material/Box";

interface PalmStringTableVisualizerProps {
    selectedTSTL: String[];
}

export const PalmStringTableVisualizer = ({selectedTSTL}: PalmStringTableVisualizerProps) => {
    return (
        <Paper
            variant="outlined"
            sx={{
                borderRadius: 1,
                overflow: "hidden",
            }}
        >
            {selectedTSTL.length > 0 ? (
                <Box component="ul" sx={{listStyle: "none", m: 0, p: 0}}>
                    {selectedTSTL.map((str, index) => (
                        <Box
                            component="li"
                            key={index}
                            sx={{
                                display: "flex",
                                px: 2,
                                py: 1,
                                borderBottom: index < selectedTSTL.length - 1 ? "1px solid #e0e0e0" : "none",
                                fontFamily: "monospace",
                            }}
                        >
                            <Typography
                                component="span"
                                sx={{
                                    fontFamily: "inherit",
                                    color: "text.disabled",
                                    mr: 2,
                                    userSelect: "none",
                                }}
                            >
                                {String(index).padStart(4, "0")}
                            </Typography>
                            <Typography
                                component="span"
                                sx={{
                                    fontFamily: "inherit",
                                    color: "text.primary",
                                    wordBreak: "break-word",
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {str}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            ) : (
                <Typography
                    sx={{p: 2, fontFamily: "monospace", color: "text.disabled"}}
                >
                    EMPTY STRING TABLE
                </Typography>
            )}
        </Paper>
    )
}