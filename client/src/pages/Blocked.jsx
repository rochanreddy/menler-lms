// Full-screen stop page shown when the admin has blocked this account —
// either discovered at login/refresh or pushed mid-session via the api()
// 'lms:blocked' event.
import LineIcon from '../components/LineIcon.jsx';
import { Button, Card, Stack, Text } from '../components/ui/index.js';

export default function Blocked({ message, onLogout }) {
  return (
    <div className="center">
      <Card>
        <Stack gap="4">
          <div className="blocked-icon"><LineIcon name="ban" size={30} /></div>
          <Text role="heading-2">Account blocked</Text>
          <Text role="body" tone="muted">
            {message || 'Your account has been blocked by the administrator.'}
          </Text>
          <Text role="caption">
            If you believe this is a mistake, contact your program administrator.
          </Text>
          <Button onClick={onLogout}>Back to sign in</Button>
        </Stack>
      </Card>
    </div>
  );
}
