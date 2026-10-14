import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { folderOf, scriptsInFolder, updateScript, type Mode, type Script } from '../store';
import { FONT_STACKS, glassFlip, pixelsPerSecond, useSettings, type Settings } from '../settings';
import { RichText, splitSlides } from '../rich';
import { navigate } from '../router';
import { SettingsPanel } from './SettingsPanel';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen');
      } catch {
        // refusé (batterie faible, contexte non sécurisé…)
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

// Posé à plat, le téléphone peut pivoter l'écran tout seul : on verrouille l'orientation
// (Android exige le plein écran ou l'appli installée ; ignoré ailleurs).
function useOrientationLock(orientation: Settings['orientation']) {
  useEffect(() => {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (orientation === 'auto' || !so?.lock) return;
    const lock = () => so.lock!(orientation === 'portrait' ? 'portrait-primary' : 'landscape-primary').catch(() => {});
    lock();
    document.addEventListener('fullscreenchange', lock);
    return () => {
      document.removeEventListener('fullscreenchange', lock);
      so.unlock?.();
    };
  }, [orientation]);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else enterFullscreen();
}

function enterFullscreen() {
  if (document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
}

// Sur téléphone, les gestes système d'Android (balayer depuis le bas = accueil) passent avant la page :
// un glisser qui démarre près du bord renvoie l'appli à l'arrière-plan. En plein écran immersif, le
// premier balayage ne fait qu'afficher les barres. On y entre au premier toucher (un tap ou la fin
// d'un glisser comptent comme geste utilisateur), et on en sort en quittant le prompteur.
function useAutoFullscreen(enabled: boolean) {
  const entered = useRef(false);
  useEffect(
    () => () => {
      if (entered.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
    [],
  );
  return useCallback(
    (e: React.SyntheticEvent) => {
      // Chrome transmet aussi le type de pointeur sur les clics : seul le tactile est concerné.
      const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch';
      if (!enabled || !touch || document.fullscreenElement) return;
      entered.current = true;
      enterFullscreen();
    },
    [enabled],
  );
}

export function Prompter({ script }: { script: Script }) {
  const [settings, update] = useSettings();
  const mode = script.mode;
  const [playing, setPlaying] = useState(false);
  const [hud, setHud] = useState(true);
  const [panel, setPanel] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(0);
  const slideScrolled = useRef(0);
  const [slideMore, setSlideMore] = useState({ up: false, down: false });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const slides = useMemo(() => splitSlides(script.content), [script.content]);
  // Blocs voisins dans le dossier (ordre de tournage).
  const folder = folderOf(script);
  const siblings = folder ? scriptsInFolder(folder.id) : [];
  const blockIdx = siblings.findIndex((x) => x.id === script.id);
  const prevBlock = blockIdx > 0 ? siblings[blockIdx - 1] : undefined;
  const nextBlock = blockIdx >= 0 ? siblings[blockIdx + 1] : undefined;
  const goBlock = (target?: Script) => target && navigate(`/play/${target.id}`);
  const slideIdx = Math.min(slide, slides.length - 1);

  useWakeLock();
  useOrientationLock(settings.orientation);
  const autoFullscreen = useAutoFullscreen(settings.autoFullscreen);

  // --- Défilement ---
  const maxScroll = useCallback(() => {
    const stage = stageRef.current;
    const text = textRef.current;
    if (!stage || !text) return 0;
    const h = stage.clientHeight;
    const s = settingsRef.current;
    // On s'arrête quand la dernière ligne a traversé la zone de lecture.
    return Math.max(0, (h * s.startPosition) / 100 + text.offsetHeight - (h * s.zoneTop) / 100);
  }, []);

  const apply = useCallback(() => {
    const stage = stageRef.current;
    const el = scrollerRef.current;
    if (!stage || !el) return;
    scrolled.current = clamp(scrolled.current, 0, maxScroll());
    const y = (stage.clientHeight * settingsRef.current.startPosition) / 100 - scrolled.current;
    el.style.transform = `translate3d(0, ${y}px, 0)`;
  }, [maxScroll]);

  // --- Slide plus haute que l'écran : on la fait défiler à l'intérieur ---
  const slideBounds = useCallback(() => {
    const stage = stageRef.current;
    const el = slideRef.current;
    if (!stage || !el) return { top: 0, max: 0 };
    const h = stage.clientHeight;
    const s = settingsRef.current;
    const margin = h * 0.05;
    const anchor = (h * (s.slidePosition === 'zone' ? s.zoneTop + s.zoneHeight / 2 : s.startPosition)) / 100;
    // Centrée, une slide trop haute déborderait par le haut : on garde son début visible.
    const top = Math.max(s.slidePosition === 'zone' ? anchor - el.offsetHeight / 2 : anchor, Math.min(anchor, margin));
    // En bas, de quoi dégager la dernière ligne de la barre de commandes.
    return { top, max: Math.max(0, top + el.offsetHeight - h * 0.88) };
  }, []);

  const applySlide = useCallback(() => {
    const el = slideRef.current;
    if (!el) return;
    const { top, max } = slideBounds();
    slideScrolled.current = clamp(slideScrolled.current, 0, max);
    el.style.transform = `translate(-50%, ${top - slideScrolled.current}px)`;
    const up = slideScrolled.current > 1;
    const down = slideScrolled.current < max - 1;
    setSlideMore((m) => (m.up === up && m.down === down ? m : { up, down }));
  }, [slideBounds]);

  const scrubSlide = useCallback(
    (px: number) => {
      slideScrolled.current += px;
      applySlide();
    },
    [applySlide],
  );

  useLayoutEffect(apply, [settings, script.content, mode, apply]);
  useLayoutEffect(applySlide, [settings, script.content, mode, slide, applySlide]);

  useEffect(() => {
    const onResize = () => {
      apply();
      applySlide();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [apply, applySlide]);

  useEffect(() => {
    if (!playing || mode !== 'scroll') return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      scrolled.current += pixelsPerSecond(settingsRef.current) * dt;
      const end = scrolled.current >= maxScroll();
      apply();
      if (end) {
        setPlaying(false);
        setHud(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, mode, apply, maxScroll]);

  // Compte à rebours avant le départ
  useEffect(() => {
    if (count === null) return;
    if (count <= 0) {
      setCount(null);
      setPlaying(true);
      return;
    }
    const t = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  const scrubBy = useCallback(
    (px: number) => {
      scrolled.current += px;
      apply();
    },
    [apply],
  );

  const togglePlay = () => {
    if (count !== null) {
      setCount(null);
      setHud(true);
      return;
    }
    if (playing) {
      setPlaying(false);
      setHud(true);
      return;
    }
    if (scrolled.current >= maxScroll() - 1) {
      scrolled.current = 0;
      apply();
    }
    setHud(false);
    setPanel(false);
    if (scrolled.current <= 0 && settings.countdown > 0) setCount(settings.countdown);
    else setPlaying(true);
  };

  const restart = () => {
    setPlaying(false);
    setCount(null);
    setSlide(0);
    scrolled.current = 0;
    slideScrolled.current = 0;
    apply();
    applySlide();
  };

  const nudgeSpeed = (delta: number) => {
    const speed = clamp(Math.round((settingsRef.current.speed + delta) * 2) / 2, 0.5, 30);
    update({ speed });
    setFlash(`Vitesse ${speed}`);
  };

  // --- Slides ---
  // Si la slide déborde, « suivante » / « précédente » la font d'abord défiler d'environ un écran.
  const slidePage = () => (stageRef.current?.clientHeight ?? 600) * 0.6;
  const goSlide = (i: number) => {
    const target = clamp(i, 0, slides.length - 1);
    if (target === slideIdx) return;
    slideScrolled.current = 0;
    setSlide(target);
  };
  const next = () => {
    if (slideScrolled.current < slideBounds().max - 1) scrubSlide(slidePage());
    else goSlide(slideIdx + 1);
  };
  const prev = () => {
    if (slideScrolled.current > 1) scrubSlide(-slidePage());
    else goSlide(slideIdx - 1);
  };

  const setMode = (m: Mode) => {
    if (m === mode) return;
    restart();
    updateScript(script.id, { mode: m });
  };

  // --- Clavier / télécommande Bluetooth (PageUp/PageDown, flèches, espace) ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.panel') && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (target.tagName === 'BUTTON') target.blur();
      const k = e.key;
      let handled = true;

      if (k === 'Escape') {
        if (panel) setPanel(false);
        else if (playing || count !== null) togglePlay();
        else navigate(`/edit/${script.id}`);
      } else if (k === 'f') toggleFullscreen();
      else if (k === 'm') update({ glass: !settings.glass });
      else if (k === 's') setPanel((p) => !p);
      else if (k === 'Home') restart();
      else if (k === 'n' && nextBlock) goBlock(nextBlock);
      else if (k === 'p' && prevBlock) goBlock(prevBlock);
      else if (mode === 'scroll') {
        if (k === ' ' || k === 'Enter' || k === 'PageDown') togglePlay();
        else if (k === 'ArrowDown' || k === 'ArrowRight' || k === '+' || k === '=') nudgeSpeed(0.5);
        else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === '-') nudgeSpeed(-0.5);
        else if (k === 'PageUp') scrubBy(-(stageRef.current?.clientHeight ?? 600) / 3);
        else handled = false;
      } else {
        if ([' ', 'Enter', 'PageDown', 'ArrowRight', 'ArrowDown'].includes(k)) next();
        else if (['PageUp', 'ArrowLeft', 'ArrowUp', 'Backspace'].includes(k)) prev();
        else if (k === 'End') goSlide(slides.length - 1);
        else handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Tactile : tap = lecture/pause (ou slide suivante), glisser = avancer/reculer ---
  const drag = useRef<{ x: number; y: number; last: number; moved: boolean } | null>(null);
  const flip = glassFlip(settings);
  const flipY = flip.y;

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, last: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) d.moved = true;
    if (d.moved) {
      const dy = -(e.clientY - d.last) * flipY;
      if (mode === 'scroll') scrubBy(dy);
      else scrubSlide(dy);
      d.last = e.clientY;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    autoFullscreen(e);
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    if (mode === 'scroll') togglePlay();
    else {
      setHud(false);
      setPanel(false);
      if (e.clientX < window.innerWidth * 0.3) prev();
      else next();
    }
  };

  // --- Rendu ---
  const s = settings;
  const stageStyle: CSSProperties = {
    background: s.bgColor,
    color: s.textColor,
    fontFamily: FONT_STACKS[s.fontFamily],
    transform: `scale(${flip.x}, ${flip.y})`,
  };
  const textStyle: CSSProperties = {
    width: `${s.textWidth}%`,
    fontSize: `${s.fontSize}px`,
    lineHeight: s.lineHeight,
    textAlign: s.align,
  };
  const zoneBottom = Math.min(100, s.zoneTop + s.zoneHeight);

  return (
    <div className="prompter">
      <div className="stage" ref={stageRef} style={stageStyle}>
        {mode === 'scroll' ? (
          <div className="scroller" ref={scrollerRef}>
            <div className="prompt-text" ref={textRef} style={textStyle}>
              <RichText text={script.content} separators />
            </div>
          </div>
        ) : (
          <div key={slideIdx} ref={slideRef} className="slide prompt-text" style={textStyle}>
            <RichText text={slides[slideIdx]} />
          </div>
        )}

        {mode === 'scroll' && (
          <>
            <div className="dim" style={{ top: 0, height: `${s.zoneTop}%`, background: s.bgColor, opacity: s.dimOpacity }} />
            <div className="dim" style={{ top: `${zoneBottom}%`, bottom: 0, background: s.bgColor, opacity: s.dimOpacity }} />
          </>
        )}
        {s.showMarker && (
          <div className="marker" style={{ top: `${s.zoneTop + s.zoneHeight / 2}%` }}>
            ▶
          </div>
        )}

        {panel && (
          <>
            <div className="guide zone" style={{ top: `${s.zoneTop}%`, height: `${s.zoneHeight}%` }}>
              <span>Zone de lecture</span>
            </div>
            <div className="guide start" style={{ top: `${s.startPosition}%` }}>
              <span>Point de départ</span>
            </div>
          </>
        )}

        {mode === 'slides' && (
          <div className="slide-counter">
            {slideIdx + 1} / {slides.length}
          </div>
        )}
        {mode === 'slides' && slideMore.up && <div className="slide-more up">▲</div>}
        {mode === 'slides' && slideMore.down && <div className="slide-more down">▼</div>}
        {count !== null && count > 0 && <div className="countdown">{count}</div>}
        {flash && <div className="flash">{flash}</div>}
      </div>

      <div
        className="touch"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => (mode === 'scroll' ? scrubBy : scrubSlide)(e.deltaY * flipY)}
      />


      {hud ? (
        <>
          <div className="hud top">
            <button className="btn ghost" onClick={() => navigate(`/edit/${script.id}`)}>
              ← Éditer
            </button>
            <span className="hud-title">
              {folder && <span className="hud-folder">{folder.name} · </span>}
              {script.title || 'Sans titre'}
            </span>
            {folder && (
              <div className="blocks" role="group" aria-label="Blocs du dossier">
                <button className="btn ghost" onClick={() => goBlock(prevBlock)} disabled={!prevBlock} title="Bloc précédent (p)">
                  ‹
                </button>
                <span>
                  Bloc {blockIdx + 1}/{siblings.length}
                </span>
                <button className="btn ghost" onClick={() => goBlock(nextBlock)} disabled={!nextBlock} title="Bloc suivant (n)">
                  ›
                </button>
              </div>
            )}
            <div className="segmented" role="group" aria-label="Mode">
              <button className={mode === 'scroll' ? 'on' : ''} onClick={() => setMode('scroll')}>
                Défilement
              </button>
              <button className={mode === 'slides' ? 'on' : ''} onClick={() => setMode('slides')}>
                Slides
              </button>
            </div>
            <button
              className={`btn ghost ${s.glass ? 'on' : ''}`}
              onClick={() => update({ glass: !s.glass })}
              title="Mode vitre sans tain (m)"
            >
              {s.glassPlacement === 'camera' ? '⇵' : '⇋'} Vitre
            </button>
            <button className="btn ghost" onClick={toggleFullscreen} title="Plein écran (f)">
              ⛶
            </button>
            <button className={`btn ghost ${panel ? 'on' : ''}`} onClick={() => setPanel((p) => !p)} title="Réglages (s)">
              ⚙ Réglages
            </button>
          </div>

          <div className="hud bottom">
            {mode === 'scroll' ? (
              <>
                <button className="btn ghost" onClick={restart} title="Revenir au début (Début)">
                  ⏮
                </button>
                <button className="btn ghost" onClick={() => nudgeSpeed(-0.5)} aria-label="Ralentir">
                  −
                </button>
                <span className="speed">Vitesse {s.speed}</span>
                <button className="btn ghost" onClick={() => nudgeSpeed(0.5)} aria-label="Accélérer">
                  +
                </button>
                <button
                  className="btn primary play"
                  onClick={(e) => {
                    autoFullscreen(e);
                    togglePlay();
                  }}
                >
                  {playing || count !== null ? '❚❚ Pause' : '▶ Lecture'}
                </button>
              </>
            ) : (
              <>
                <button className="btn ghost" onClick={restart} title="Première slide (Début)">
                  ⏮
                </button>
                <button className="btn ghost" onClick={prev} disabled={slideIdx === 0 && !slideMore.up}>
                  ◀ Précédente
                </button>
                <span className="speed">
                  {slideIdx + 1} / {slides.length}
                </span>
                <button className="btn primary" onClick={next} disabled={slideIdx === slides.length - 1 && !slideMore.down}>
                  Suivante ▶
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <button
          className="hud-corner"
          aria-label="Afficher les commandes"
          onClick={() => {
            setPlaying(false);
            setCount(null);
            setHud(true);
          }}
        >
          ☰
        </button>
      )}

      {panel && <SettingsPanel settings={s} update={update} mode={mode} onClose={() => setPanel(false)} />}
    </div>
  );
}
