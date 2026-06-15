import { useEffect } from 'react';
import { useUI } from './store';
import { Orchard } from './components/Orchard';
import { Workspace } from './components/Workspace';

export default function App() {
  const theme = useUI((s) => s.theme);
  const spaceId = useUI((s) => s.spaceId);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return spaceId ? <Workspace spaceId={spaceId} /> : <Orchard />;
}
