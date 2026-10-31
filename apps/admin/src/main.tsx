import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './context/AppContext.js';
import { App } from './App.js';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);

