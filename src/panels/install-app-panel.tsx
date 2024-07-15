import { useState } from "react";
import {
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import BoltIcon from "@mui/icons-material/Bolt";
import { runSync } from "./../run-sync";
import { DlpConnection, writeRawDb } from "palm-sync";
import { DatabaseHdrType, RawPdbDatabase, RawPrcDatabase } from "palm-pdb";

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function InstallAppPanel() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const filesArray = Array.from(event.target.files);
      const validFiles = filesArray.filter(
        (file) => file.name.endsWith(".prc") || file.name.endsWith(".pdb")
      );
      setSelectedFiles((prevFiles) => [...prevFiles, ...validFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  const handleGoClick = async () => {
    await runSync(async (dlpConnection: DlpConnection) => {
      for (let index = 0; index < selectedFiles.length; index++) {
        const file = selectedFiles[index];

        const arrbuf = await file.arrayBuffer();
        const buffer = Buffer.from(arrbuf);

        await writeDbFromBuffer(dlpConnection, buffer, { overwrite: true });
      }
    });
  };

  return (
    <Card sx={{ maxWidth: 600, margin: "auto", mt: 4 }}>
      <CardContent>
        <Typography variant="h6" component="div">
          Select which files to install
        </Typography>
        <Box mt={2}>
          <Button variant="contained" component="label">
            Select Files
            <input
              type="file"
              hidden
              onChange={handleFileChange}
              multiple
              accept=".prc,.pdb"
            />
          </Button>
        </Box>
        <List>
          {selectedFiles.map((file, index) => (
            <ListItem
              key={index}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={() => handleRemoveFile(index)}
                >
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemText
                primary={file.name}
                secondary={`${formatBytes(file.size)}`}
              />
            </ListItem>
          ))}
        </List>
      </CardContent>
      <CardActions>
        <Button
          variant="contained"
          color="primary"
          onClick={handleGoClick}
          disabled={selectedFiles.length === 0}
          endIcon={<BoltIcon />}
        >
          Install
        </Button>
      </CardActions>
    </Card>
  );
}
function writeDbFromBuffer(dlpConnection: DlpConnection, buffer: Buffer, opts: { overwrite: boolean; }) {
    const header = DatabaseHdrType.from(buffer);
    const rawDb = header.attributes.resDB
      ? RawPrcDatabase.from(buffer)
      : RawPdbDatabase.from(buffer);
    return writeRawDb(dlpConnection, rawDb, opts);
}

