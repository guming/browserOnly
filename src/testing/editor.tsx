import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { TestEditor } from './TestEditor';

const root = document.getElementById('root');
if (root) createRoot(root).render(<TestEditor />);
