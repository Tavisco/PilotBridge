import { Paper } from "@mui/material"

interface PalmStringVisualizerProps {
    selectedTSTR: String;
}

export const PalmStringVisualizer = ({selectedTSTR}: PalmStringVisualizerProps) => {
    return (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                borderRadius: 1,
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
            }}
        >
            {selectedTSTR.length > 0 ? selectedTSTR : "EMPTY STRING"}
        </Paper>
    )
}