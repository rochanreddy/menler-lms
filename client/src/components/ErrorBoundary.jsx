import { Component } from 'react';
import LineIcon from './LineIcon.jsx';
import { Button, Card, Stack, Text } from './ui/index.js';

// Catches a render crash anywhere below it (a malformed lesson body, a
// missing field in a submission, a failed lazy-chunk load) and keeps the
// shell intact instead of letting React unmount the whole app to a blank
// white page. No reset logic needed: AppShell remounts this on every route
// change (its <main> is keyed on the pathname), so navigating away already
// clears a stuck error.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center">
        <Card>
          <Stack gap="4">
            <div className="blocked-icon"><LineIcon name="alert" size={30} /></div>
            <Text role="heading-2">Something went wrong</Text>
            <Text role="body" tone="muted">
              This page hit an error and couldn't finish loading. Your session is fine,
              try reloading, or use the navigation above to head somewhere else.
            </Text>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </Stack>
        </Card>
      </div>
    );
  }
}
