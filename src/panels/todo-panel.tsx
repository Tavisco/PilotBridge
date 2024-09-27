import { PaperProps } from "@mui/material/Paper";
import { Box } from "@mui/material";
import { Panel } from "../panel";
import { DataGrid, GridActionsCellItem, GridColDef, GridEventListener, GridRowEditStopReasons, GridRowId, GridRowModes, GridRowModesModel, GridRowsProp, GridSlots, GridToolbarContainer } from '@mui/x-data-grid';
import { useEffect, useState } from "react";
import { ToDoDatabase } from "palm-pdb";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import { prefsStore } from "../prefs-store";
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Close';

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
        const tempId = new Date().getTime();
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
    const [rows, setRows] = useState<Row[]>([]);
    const [rowModesModel, setRowModesModel] = useState<GridRowModesModel>({});

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

    const processRowUpdate = (newRow: Row) => {
        const updatedRow = { ...newRow, isNew: false };
        setRows(rows.map((row) => (row.id === newRow.id ? updatedRow : row)));
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
            minWidth: 300,
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
            width: 100,
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
        const db = ToDoDatabase.from(await dbStg.getDatabaseBuffer(selectedDeviceName, 'ToDoDB.pdb'));

        console.log(db);

        setRows(
            db.records.map((record, index) => ({
                id: index,
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
    }, []);

    return (
        <Panel
            title="To Do List"
            isExpandedByDefault={true}
            {...props}
            sx={{ width: "100%" }}
        >
            <Box>
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
                </div>
            </Box>
        </Panel>
    );
}