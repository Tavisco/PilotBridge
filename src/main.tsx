import '@fontsource/inter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { prefsStore } from './prefs-store';
import { observer } from "mobx-react";
import {useAppTheme} from "./useAppTheme.ts"; // Import observer

export const AppWrapper = observer(function AppWrapper() {
    // const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

    const theme = useAppTheme();

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