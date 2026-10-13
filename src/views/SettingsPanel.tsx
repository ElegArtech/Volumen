import type { ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import type { Mode } from '../store';

type Update = (patch: Partial<Settings>) => void;

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 1, unit = '', onChange } = props;
  return (
    <label className="field">
      <span className="field-label">
        {label}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field toggle">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Choice<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{props.label}</span>
      <div className="segmented small">
        {props.options.map(([v, text]) => (
          <button key={v} className={props.value === v ? 'on' : ''} onClick={() => props.onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function SettingsPanel(props: { settings: Settings; update: Update; mode: Mode; onClose: () => void }) {
  const { settings: s, update, mode, onClose } = props;
  return (
    <aside className="panel">
      <header>
        <h2>Réglages</h2>
        <button className="btn ghost" onClick={onClose}>
          Fermer
        </button>
      </header>

      <Group title="Texte">
        <Slider label="Taille" value={s.fontSize} min={16} max={200} unit=" px" onChange={(fontSize) => update({ fontSize })} />
        <Slider label="Interligne" value={s.lineHeight} min={1} max={2.4} step={0.05} onChange={(lineHeight) => update({ lineHeight })} />
        <Slider label="Largeur du texte" value={s.textWidth} min={20} max={100} unit=" %" onChange={(textWidth) => update({ textWidth })} />
        <Choice label="Alignement" value={s.align} options={[['left', 'Gauche'], ['center', 'Centré']]} onChange={(align) => update({ align })} />
        <Choice
          label="Police"
          value={s.fontFamily}
          options={[['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']]}
          onChange={(fontFamily) => update({ fontFamily })}
        />
      </Group>

      {mode === 'scroll' ? (
        <Group title="Défilement">
          <Slider label="Vitesse" value={s.speed} min={0.5} max={30} step={0.5} onChange={(speed) => update({ speed })} />
          <Slider
            label="Point de départ"
            value={s.startPosition}
            min={0}
            max={100}
            unit=" %"
            onChange={(startPosition) => update({ startPosition })}
          />
          <Slider label="Compte à rebours" value={s.countdown} min={0} max={10} unit=" s" onChange={(countdown) => update({ countdown })} />
        </Group>
      ) : (
        <Group title="Slides">
          <Choice
            label="Position des slides"
            value={s.slidePosition}
            options={[['zone', 'Centrée sur la zone'], ['start', 'Au point de départ']]}
            onChange={(slidePosition) => update({ slidePosition })}
          />
          {s.slidePosition === 'start' && (
            <Slider
              label="Point de départ"
              value={s.startPosition}
              min={0}
              max={100}
              unit=" %"
              onChange={(startPosition) => update({ startPosition })}
            />
          )}
        </Group>
      )}

      <Group title="Zone de lecture">
        <Slider label="Position" value={s.zoneTop} min={0} max={95} unit=" %" onChange={(zoneTop) => update({ zoneTop })} />
        <Slider label="Hauteur" value={s.zoneHeight} min={5} max={100} unit=" %" onChange={(zoneHeight) => update({ zoneHeight })} />
        <Slider
          label="Assombrir hors zone"
          value={Math.round(s.dimOpacity * 100)}
          min={0}
          max={95}
          unit=" %"
          onChange={(v) => update({ dimOpacity: v / 100 })}
        />
        <Toggle label="Repère ▶" value={s.showMarker} onChange={(showMarker) => update({ showMarker })} />
      </Group>

      <Group title="Vitre sans tain">
        <Toggle label="Mode vitre (texte retourné)" value={s.glass} onChange={(glass) => update({ glass })} />
        <Choice
          label="Téléphone posé à plat, le haut du texte pointe…"
          value={s.glassPlacement}
          options={[
            ['camera', '⇵ Vers la caméra'],
            ['me', '⇋ Vers moi'],
          ]}
          onChange={(glassPlacement) => update({ glassPlacement, glass: true })}
        />
        <p className="field-help">
          Le plus courant : téléphone posé comme pour le lire sur une table, haut vers la caméra. Si le texte
          apparaît encore à l'envers dans la vitre, choisis l'autre sens.
        </p>
        <Choice
          label="Bloquer l'orientation de l'écran"
          value={s.orientation}
          options={[
            ['auto', 'Non'],
            ['portrait', 'Portrait'],
            ['landscape', 'Paysage'],
          ]}
          onChange={(orientation) => update({ orientation })}
        />
        <p className="field-help">
          Évite que le téléphone pivote tout seul une fois posé à plat. Fonctionne en plein écran ou avec
          l'appli installée.
        </p>
        <Toggle
          label="Plein écran automatique (tactile)"
          value={s.autoFullscreen}
          onChange={(autoFullscreen) => update({ autoFullscreen })}
        />
        <p className="field-help">
          Dès que tu touches le prompteur, Android masque ses barres : glisser le texte vers le haut depuis
          le bas de l'écran ne renvoie plus à l'accueil (il faudrait balayer deux fois).
        </p>
      </Group>

      <Group title="Couleurs">
        <label className="field toggle">
          <span>Couleur du texte</span>
          <input type="color" value={s.textColor} onChange={(e) => update({ textColor: e.target.value })} />
        </label>
        <label className="field toggle">
          <span>Couleur du fond</span>
          <input type="color" value={s.bgColor} onChange={(e) => update({ bgColor: e.target.value })} />
        </label>
      </Group>

      <button className="btn ghost reset" onClick={() => confirm('Revenir aux réglages par défaut ?') && update(DEFAULT_SETTINGS)}>
        Réinitialiser les réglages
      </button>

      <details className="keys">
        <summary>Raccourcis clavier / télécommande</summary>
        <ul>
          <li>
            <kbd>Espace</kbd> <kbd>Entrée</kbd> <kbd>PageDown</kbd> : lecture / pause (slides : suivante)
          </li>
          <li>
            <kbd>↑</kbd> <kbd>↓</kbd> : vitesse (slides : précédente / suivante)
          </li>
          <li>
            <kbd>PageUp</kbd> : reculer (slides : précédente)
          </li>
          <li>
            <kbd>Début</kbd> : revenir au début · <kbd>m</kbd> vitre · <kbd>f</kbd> plein écran · <kbd>s</kbd> réglages
          </li>
          <li>
            <kbd>n</kbd> / <kbd>p</kbd> : bloc suivant / précédent du dossier
          </li>
          <li>Tactile : toucher = lecture/pause, glisser = avancer/reculer. En slides : toucher à gauche = précédente.</li>
        </ul>
      </details>
    </aside>
  );
}
