// Réglages d'affichage du prompteur, propres à chaque appareil (un PC et un
// téléphone n'ont pas la même taille d'écran).
import { useCallback, useState } from 'react';

export type Settings = {
  fontSize: number; // px
  lineHeight: number;
  textWidth: number; // % de la largeur de l'écran
  speed: number; // 1–30
  startPosition: number; // % de la hauteur : où se place la 1re ligne au départ
  zoneTop: number; // % : haut de la zone de lecture
  zoneHeight: number; // % : hauteur de la zone de lecture
  dimOpacity: number; // assombrissement hors zone (0–0.95)
  showMarker: boolean;
  // Vitre sans tain : téléphone posé à plat sous la vitre. Le retournement dépend du sens
  // dans lequel pointe le haut du texte : vers la caméra → vertical, vers moi → horizontal.
  glass: boolean;
  glassPlacement: 'camera' | 'me';
  orientation: 'auto' | 'portrait' | 'landscape';
  align: 'left' | 'center';
  fontFamily: 'sans' | 'serif' | 'mono';
  textColor: string;
  bgColor: string;
  countdown: number; // secondes
  slidePosition: 'zone' | 'start';
};

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 56,
  lineHeight: 1.4,
  textWidth: 80,
  speed: 5,
  startPosition: 40,
  zoneTop: 30,
  zoneHeight: 22,
  dimOpacity: 0.55,
  showMarker: true,
  glass: false,
  glassPlacement: 'camera',
  orientation: 'auto',
  align: 'left',
  fontFamily: 'sans',
  textColor: '#ffffff',
  bgColor: '#000000',
  countdown: 3,
  slidePosition: 'zone',
};

export const FONT_STACKS: Record<Settings['fontFamily'], string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

/** Vitesse de défilement en px/s : proportionnelle à la taille du texte. */
export function pixelsPerSecond(s: Settings) {
  return s.speed * s.fontSize * s.lineHeight * 0.09;
}

const LS_SETTINGS = 'tp.settings.v1';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<Settings> & { mirrorX?: boolean; mirrorY?: boolean };
    // Anciens réglages miroir X/Y → vitre, dans la position la plus courante (haut vers la caméra).
    if (saved.glass === undefined && (saved.mirrorX || saved.mirrorY)) {
      saved.glass = true;
      saved.glassPlacement = 'camera';
    }
    delete saved.mirrorX;
    delete saved.mirrorY;
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => {
    setSettings((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      try {
        localStorage.setItem(LS_SETTINGS, JSON.stringify(next));
      } catch {
        // stockage indisponible : réglages non mémorisés
      }
      return next;
    });
  }, []);
  return [settings, update] as const;
}

/** Retournement à appliquer à l'affichage pour qu'il se lise dans la vitre. */
export function glassFlip(s: Settings) {
  if (!s.glass) return { x: 1, y: 1 };
  return s.glassPlacement === 'camera' ? { x: 1, y: -1 } : { x: -1, y: 1 };
}
