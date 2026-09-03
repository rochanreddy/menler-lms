// Full-screen stop page for "your session was closed somewhere else" — someone
// signed in on another device, an admin revoked this one, or the password
// changed. Pushed mid-session by the api() 'lms:session-revoked' event.
//
// Deliberately not the login screen. Being dropped there with no explanation
// reads as a bug, and the one thing the user needs to know is that their
// account is in use elsewhere — which is exactly what a login form omits.
import LineIcon from '../components/LineIcon.jsx';
import { Button, Card, Stack, Text } from '../components/ui/index.js';

const TITLES = {
  superseded: 'Signed in on another device',
  password_reset: 'Your password was changed',
  blocked: 'Account blocked',
  logout: 'Signed out',
};

export default function SignedOutElsewhere({ message, reason, onLogout }) {
  return (
    <div className="center">
      <Card>
        <Stack gap="4">
          <div className="blocked-icon"><LineIcon name="key" size={30} /></div>
          <Text role="heading-2">{TITLES[reason] || 'Signed out'}</Text>
          <Text role="body" tone="muted">
            {message || 'This session was signed out from another device.'}
          </Text>
          <Text role="caption">
            Your Menler account is for one person. If you did not do this, change your
            password and tell your program administrator.
          </Text>
          <Button onClick={onLogout}>Sign in again</Button>
        </Stack>
      </Card>
    </div>
  );
}
