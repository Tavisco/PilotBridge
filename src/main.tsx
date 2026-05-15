import '@fontsource/inter';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import React, { useMemo} from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { prefsStore } from './prefs-store';
import { observer } from "mobx-react"; // Import observer

export const AppWrapper = observer(function AppWrapper() {
    const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

    const theme = useMemo(() => createTheme({
        typography: { fontFamily: 'Inter, sans-serif' },
        palette: { mode: prefersDarkMode ? 'dark' : 'light' },
    }), [prefersDarkMode]);

    // Read directly from the store inside the render function
    const clientId = (prefsStore.get('googleClientID') as string || '').trim();

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {/* If clientId exists, the Provider is mounted, and DoHotsyncBar's hook will work */}
            {clientId ? (
                <GoogleOAuthProvider clientId={clientId}>
                    <App />
                </GoogleOAuthProvider>
            ) : (
                <App />
            )}
        </ThemeProvider>
    );
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AppWrapper />
    </React.StrictMode>
);