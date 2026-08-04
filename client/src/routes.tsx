import { Navigate, Route, Routes } from 'react-router-dom';

import { ApertureMark } from './components/ApertureMark';
import { t } from './strings';

/**
 * Route table placeholder.
 *
 * Every path here is app-relative. Backend addressing is never expressed as a route and never
 * as an absolute URL — requests go through the injectable SDK transport (APTR-07), whose base
 * URL is supplied per target at runtime.
 */
export const ROUTES = {
  chat: '/chat',
} as const;

function Placeholder(): JSX.Element {
  return (
    <main className="app-placeholder">
      <ApertureMark size={64} title={t('app.mark.title')} />
      <h1>{t('app.name')}</h1>
      <p>{t('app.shell.underConstruction')}</p>
    </main>
  );
}

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={ROUTES.chat} replace />} />
      <Route path={ROUTES.chat} element={<Placeholder />} />
      <Route path="*" element={<Navigate to={ROUTES.chat} replace />} />
    </Routes>
  );
}
