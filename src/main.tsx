import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// StrictMode removido temporariamente para debug
createRoot(document.getElementById('root')!).render(<App />);
