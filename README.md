# Volumen

*Volumen* : le rouleau de lecture romain, qu'on déroulait en lisant.

Téléprompteur web installable (PWA) avec synchro temps réel entre le PC et le téléphone.

- **Défilement** : vitesse, taille, interligne, largeur du texte, **point de départ** à l'écran,
  zone de lecture (position, hauteur, assombrissement), repère, compte à rebours.
- **Slides** : sépare les blocs par une ligne `---` ; toucher / clic / télécommande = slide suivante.
- **Mode vitre sans tain** pour un téléphone posé à plat sous la vitre : retournement vertical si le haut
  du texte pointe vers la caméra (cas courant), horizontal s'il pointe vers soi. Orientation de l'écran verrouillable.
- **Dossiers** : un dossier par vidéo (ex. « Vlog 2 »), un script par séquence, dans l'ordre de tournage
  (▲▼ pour réordonner). Dans le prompteur, ‹ › ou `n` / `p` passent au bloc suivant / précédent.
- **Synchro instantanée** : tu écris sur le PC, le texte apparaît sur le téléphone, même pendant le prompteur.
- **Hors ligne** : chaque appareil garde une copie ; les modifications partent au retour du réseau.
- Écran maintenu allumé pendant le prompteur (Wake Lock).

Mise en forme du script (Markdown) : `**gras**`, `*italique*`, `***gras italique***`, `# titre`, `- puce`,
`[indication scénique]` (affichée en petit, atténuée), `---` seul sur une ligne = nouvelle slide
(en mode défilement, il s'affiche comme un trait pointillé).

## Lancer

```bash
npm install
npm run build
npm start            # http://127.0.0.1:8787
```

En développement (rechargement à chaud) : `npm run dev` puis http://localhost:5173.

Variables : `PORT` (8787), `HOST` (127.0.0.1), `DATA_DIR` (`./data`, base SQLite).

## Déploiement

L'app tourne dans Docker sur un serveur, exposée uniquement sur le réseau Tailscale (tailnet).

1. Copier `.deploy.env.example` en `.deploy.env` (non versionné) et renseigner l'hôte SSH et l'URL.
2. Déployer (et redéployer après chaque modification) :

   ```bash
   ./deploy.sh
   ```

3. Une seule fois sur le serveur, exposer l'app en HTTPS sur le tailnet, **sur un port dédié** :

   ```bash
   sudo tailscale serve --bg --https=8443 http://127.0.0.1:8787
   ```

   ⚠️ Sans `--https=<port>`, `tailscale serve` prend le port 443 et remplace ce qui y est déjà exposé.
   Pour retirer la règle : `sudo tailscale serve --https=8443 off`.

Sur le téléphone (Android) : ouvrir l'URL dans Chrome → menu ⋮ → **Installer l'application**.

## Raccourcis (clavier et télécommande Bluetooth)

| Touche | Défilement | Slides |
| --- | --- | --- |
| Espace / Entrée / PageDown | lecture / pause | suivante |
| ↑ ↓ (← →) | vitesse − / + | précédente / suivante |
| PageUp | reculer d'un tiers d'écran | précédente |
| Début | revenir au début | première slide |
| `m` / `f` / `s` | vitre / plein écran / réglages | idem |
| Échap | pause, puis retour à l'éditeur | idem |

Tactile : toucher = lecture/pause, glisser = avancer/reculer. En slides : toucher à droite = suivante, à gauche = précédente.

Les réglages d'affichage sont propres à chaque appareil ; les scripts sont partagés.

## Architecture

- `server/index.ts` : Node 24 sans dépendance (`node:http` + `node:sqlite`), API REST, flux SSE `/api/events`.
- `src/store.ts` : cache local + file d'envoi + réception temps réel (last-write-wins sur `updatedAt`).
- `src/views/Prompter.tsx` : moteur du prompteur (défilement en `requestAnimationFrame`, slides).
