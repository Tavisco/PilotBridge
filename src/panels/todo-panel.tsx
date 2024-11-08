import { PaperProps } from "@mui/material/Paper";
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography } from "@mui/material";
import { Panel } from "../panel";
import { DataGrid, GridActionsCellItem, GridColDef, GridEventListener, GridRowEditStopReasons, GridRowId, GridRowModes, GridRowModesModel, GridRowsProp, GridSlots, GridToolbarContainer } from '@mui/x-data-grid';
import { useEffect, useState } from "react";
import { DatabaseDate, RawPdbDatabase, ToDoDatabase, ToDoRecord } from "palm-pdb";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import { prefsStore } from "../prefs-store";
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Close';
import NotesIcon from '@mui/icons-material/Notes';
import CloseIcon from '@mui/icons-material/Close';
import hotsyncEvents, { HotsyncEvents } from "../event-emitter/hotsync-event-emitter";

interface Row {
    id: number;
    isNew: boolean;
    completed: boolean;
    priority: number;
    description: string;
    dueDate: Date;
}

interface EditToolbarProps {
    setRows: (newRows: (oldRows: GridRowsProp) => GridRowsProp) => void;
    setRowModesModel: (
        newModel: (oldModel: GridRowModesModel) => GridRowModesModel,
    ) => void;
}

const dbStg = new WebDatabaseStorageImplementation();
const priorities = [1, 2, 3, 4, 5];

function EditToolbar(props: EditToolbarProps) {
    const { setRows, setRowModesModel } = props;

    const handleClick = () => {
        const tempId = Math.floor(Math.random() * 129);
        setRows((oldRows) => [
            ...oldRows,
            { completed: false, id: tempId, priority: 1, description: '', dueDate: new Date(), isNew: true },
        ]);
        setRowModesModel((oldModel) => ({
            ...oldModel,
            [tempId]: { mode: GridRowModes.Edit, fieldToFocus: 'name' },
        }));
    };

    return (
        <GridToolbarContainer>
            <Button color="primary" startIcon={<AddIcon />} onClick={handleClick}>
                Add To Do
            </Button>
        </GridToolbarContainer>
    );
}

export function TodoPanel(props: PaperProps) {
    const [db, setDb] = useState<ToDoDatabase>(new ToDoDatabase);
    const [rows, setRows] = useState<Row[]>([]);
    const [rowModesModel, setRowModesModel] = useState<GridRowModesModel>({});
    const [notesModalOpen, setNotesModalOpen] = useState(false);
    const [noteId, setNoteId] = useState<number>();
    const [noteContent, setNoteContent] = useState<string>();
    const [hotsyncInProgress, setHotsyncInProgress] = useState(false);

    const handleRowEditStop: GridEventListener<'rowEditStop'> = (params, event) => {
        if (params.reason === GridRowEditStopReasons.rowFocusOut) {
            event.defaultMuiPrevented = true;
        }
    };

    const handleEditClick = (id: GridRowId) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.Edit } });
    };

    const handleSaveClick = (id: GridRowId) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
    };

    const handleDeleteClick = (id: GridRowId) => () => {
        db.records = db.records.filter((record) => record.entry.uniqueId !== id);
        const selectedDeviceName = prefsStore.get("selectedDevice") as string;
        dbStg.writeDatabase(selectedDeviceName, RawPdbDatabase.from(db.serialize()));

        setRows(rows.filter((row) => row.id !== id));
    };

    const handleCancelClick = (id: GridRowId) => () => {
        setRowModesModel({
            ...rowModesModel,
            [id]: { mode: GridRowModes.View, ignoreModifications: true },
        });

        const editedRow = rows.find((row) => row.id === id);
        if (editedRow!.isNew) {
            setRows(rows.filter((row) => row.id !== id));
        }
    };

    const processRowUpdate = (handledRow: Row) => {
        var dbRecord = handledRow.isNew ? new ToDoRecord : db.records.filter((record) => record.entry.uniqueId == handledRow.id)[0]

        dbRecord.description = handledRow.description;
        dbRecord.priority = handledRow.priority;
        dbRecord.isCompleted = handledRow.completed;
        dbRecord.dueDate = DatabaseDate.of(handledRow.dueDate);
        dbRecord.entry.uniqueId = handledRow.id;
        dbRecord.entry.attributes.dirty = true;

        if (handledRow.isNew) {
            db.records.push(dbRecord);
        }
        
        const selectedDeviceName = prefsStore.get("selectedDevice") as string;
        dbStg.writeDatabase(selectedDeviceName, RawPdbDatabase.from(db.serialize()));

        const updatedRow = { ...handledRow, isNew: false };
        setRows(rows.map((row) => (row.id === handledRow.id ? updatedRow : row)));
        return updatedRow;
    };

    const handleRowModesModelChange = (newRowModesModel: GridRowModesModel) => {
        setRowModesModel(newRowModesModel);
    };

    const columns: GridColDef<(typeof rows)[number]>[] = [
        {
            field: 'completed',
            headerName: 'Completed',
            type: 'boolean',
            width: 130,
            editable: true,
        },
        {
            field: 'priority',
            headerName: 'Priority',
            width: 130,
            editable: true,
            type: 'singleSelect',
            valueOptions: priorities,
        },
        {
            field: 'description',
            headerName: 'Description',
            flex: 1,
            minWidth: 290,
            editable: true,
        },
        {
            field: 'dueDate',
            headerName: 'Due Date',
            type: 'date',
            width: 135,
            editable: true,
        },
        {
            field: 'actions',
            type: 'actions',
            headerName: 'Actions',
            width: 110,
            cellClassName: 'actions',
            getActions: ({ id }) => {
                const isInEditMode = rowModesModel[id]?.mode === GridRowModes.Edit;

                if (isInEditMode) {
                    return [
                        <GridActionsCellItem
                            icon={<SaveIcon />}
                            label="Save"
                            sx={{
                                color: 'primary.main',
                            }}
                            onClick={handleSaveClick(id)}
                        />,
                        <GridActionsCellItem
                            icon={<CancelIcon />}
                            label="Cancel"
                            className="textPrimary"
                            onClick={handleCancelClick(id)}
                            color="inherit"
                        />,
                    ];
                }

                return [
                    <GridActionsCellItem
                        icon={<NotesIcon />}
                        label="Notes"
                        className="textPrimary"
                        onClick={handleClickNotesOpen(id)}
                        color="inherit"
                    />,
                    <GridActionsCellItem
                        icon={<EditIcon />}
                        label="Edit"
                        className="textPrimary"
                        onClick={handleEditClick(id)}
                        color="inherit"
                    />,
                    <GridActionsCellItem
                        icon={<DeleteIcon />}
                        label="Delete"
                        onClick={handleDeleteClick(id)}
                        color="inherit"
                    />,
                ];
            },
        }
    ];

    async function loadToDo() {
        const selectedDeviceName = prefsStore.get("selectedDevice") as string;
        const tempDb = ToDoDatabase.from(await dbStg.getDatabaseBuffer(selectedDeviceName, 'ToDoDB.pdb'));
        if (tempDb === undefined) {
            console.log('Failed to load database!');
            return;
        }

        setDb(tempDb);

        setRows(
            tempDb.records.map(record => ({
                id: record.entry.uniqueId,
                isNew: false,
                completed: record.isCompleted,
                priority: record.priority,
                description: record.description,
                dueDate: record.dueDate == null ? new Date() : record.dueDate.value,
            }))
        );
    }

    useEffect(() => {
        loadToDo();

        const refreshScreen = () => {
            loadToDo();
        };

        hotsyncEvents.on(HotsyncEvents.HotsyncUserChanged, refreshScreen);
        hotsyncEvents.on(HotsyncEvents.HotsyncStarted, () => setHotsyncInProgress(true));
        hotsyncEvents.on(HotsyncEvents.HotsyncFinished, () => {
            setHotsyncInProgress(false);
            loadToDo();
        });

        return () => {
            hotsyncEvents.off(HotsyncEvents.HotsyncUserChanged, refreshScreen);
            hotsyncEvents.off(HotsyncEvents.HotsyncStarted, setHotsyncInProgress);
            hotsyncEvents.off(HotsyncEvents.HotsyncFinished, setHotsyncInProgress);
        };

    }, []);


    const handleClickNotesOpen = (id: GridRowId) => () => {
        if (id == null) {
            return;
        }

        setNoteId(id as number);
        setNoteContent(db.records.filter((record) => record.entry.uniqueId == id)[0].note);
        setNotesModalOpen(true);
    };

    const handleNotesClose = () => {
        var dbRecord = db.records.filter((record) => record.entry.uniqueId == noteId)[0];

        if (dbRecord == null) {
            console.error("Failed to find dbRecord to put note in!");
            return;
        }

        dbRecord.note = noteContent as string;
        dbRecord.entry.attributes.dirty = true;

        const selectedDeviceName = prefsStore.get("selectedDevice") as string;
        dbStg.writeDatabase(selectedDeviceName, RawPdbDatabase.from(db.serialize()));

        setNoteContent("");
        setNotesModalOpen(false);
    };

    return (
        <Panel
            title="To Do List"
            isExpandedByDefault={true}
            {...props}
            sx={{ width: "100%" }}
        >
            <Box>
            {!hotsyncInProgress && (
                <div
                    style={{
                        minHeight: "35vh",
                        placeContent: "start",
                        textAlign: "start",
                        padding: "1em",
                        width: "100%"
                    }}
                >
                    <DataGrid
                        style={{
                            minHeight: "35vh"
                        }}
                        rows={rows}
                        columns={columns}
                        initialState={{
                            pagination: {
                                paginationModel: {
                                    pageSize: 7,
                                },
                            },
                        }}
                        pageSizeOptions={[7]}
                        disableRowSelectionOnClick
                        editMode="row"
                        rowModesModel={rowModesModel}
                        onRowModesModelChange={handleRowModesModelChange}
                        onRowEditStop={handleRowEditStop}
                        processRowUpdate={processRowUpdate}
                        slots={{
                            toolbar: EditToolbar as GridSlots['toolbar'],
                        }}
                        slotProps={{
                            toolbar: { setRows, setRowModesModel },
                        }}
                    />
                    <br/>
                    <Typography variant="body1">
                        Known issues:
                        <ul>
                            <li>Deleting notes is currently not supported. They will re-appear in the next sync.</li>
                        </ul>
                    </Typography>
                </div>
            )}

            {hotsyncInProgress && (
                <div
                style={{
                    display: "grid",
                    placeContent: "center",
                    textAlign: "center",
                    padding: "2em",
                }}
                >
                <Typography variant="h5" gutterBottom>
                    🔁 HotSync in progress...
                </Typography>
                <Typography variant="body1">
                    Please wait for the current HotSync session to finish.
                </Typography>
                </div>
            )}
            </Box>
            <Dialog
                onClose={handleNotesClose}
                aria-labelledby="customized-dialog-title"
                open={notesModalOpen}
                fullWidth={true}
                maxWidth={"md"}
            >
                <DialogTitle sx={{ m: 0, p: 2 }} id="customized-dialog-title">
                    Note
                </DialogTitle>
                <IconButton
                    aria-label="close"
                    onClick={handleNotesClose}
                    sx={(theme) => ({
                        position: 'absolute',
                        right: 8,
                        top: 8,
                        color: theme.palette.grey[500],
                    })}
                >
                    <CloseIcon />
                </IconButton>
                <DialogContent
                    dividers
                >
                    <TextField
                        autoFocus
                        id="note-content"
                        label="Note content"
                        multiline
                        fullWidth
                        rows={14}
                        value={noteContent}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          setNoteContent(event.target.value);
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button autoFocus onClick={handleNotesClose}>
                        Save changes
                    </Button>
                </DialogActions>
            </Dialog>
        </Panel>
    );
}