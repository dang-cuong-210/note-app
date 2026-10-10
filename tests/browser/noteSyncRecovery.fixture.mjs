import React from 'react';
import { createRoot } from 'react-dom/client';
import { useAppData } from '../../src/hooks/useAppData';
import { channels, calls, controls, rpcCalls } from './noteSyncRecovery.mock.mjs';
import * as cache from '../../src/lib/db';

window.testHarness = { channels, calls, controls, rpcCalls, cache };
function Harness() {
  const [account, setAccount] = React.useState(null);
  const data = useAppData(account);
  window.testHarness.data = data;
  window.testHarness.start = (next) => { controls.account = next; setAccount(next); };
  return React.createElement('div', { 'data-loaded': data.loaded, 'data-note-count': data.notes.length });
}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
