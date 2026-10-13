import { useEffect, useState } from 'react';

// Routage par hash : fonctionne sans configuration serveur et hors ligne.
export function navigate(path: string) {
  location.hash = path;
}

export function useRoute() {
  const [path, setPath] = useState(() => location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const onChange = () => setPath(location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}
