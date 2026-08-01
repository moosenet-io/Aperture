import { AppRoutes } from './routes';

/**
 * Router root. The shell (navigation, command palette, module surfaces) is built out by the
 * later foundation items; this is the mount point they compose into.
 */
export function App(): JSX.Element {
  return <AppRoutes />;
}
