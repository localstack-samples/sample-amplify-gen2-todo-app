import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './index.css';
import './amplify-config'; // configures Amplify from amplify_outputs.json (and LocalStack endpoints when enabled)
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Authenticator>
      {({ signOut, user }) => <App signOut={signOut} user={user} />}
    </Authenticator>
  </StrictMode>,
);
