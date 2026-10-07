import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthScreen } from '../../src/components/AuthScreen';
import { AuthContext } from '../../src/contexts/AuthContext';
import '../../src/index.css';
window.authCalls = [];
window.authResult = 'Invalid login credentials';
const invoke = async (method, email, password) => {
  window.authCalls.push({ method, email, password });
  await new Promise(resolve => { window.finishAuth = resolve; });
  if (window.authResult === 'throw') throw new Error('offline');
  return { error: window.authResult };
};
createRoot(document.getElementById('root')).render(React.createElement(AuthContext.Provider, {
  value: { user: null, session: null, loading: false, signIn: (...args) => invoke('signin', ...args),
    signUp: (...args) => invoke('signup', ...args), signOut() {} },
}, React.createElement(AuthScreen)));
