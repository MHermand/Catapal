# Catapal

> « Catapulte tes potes. » / « Catapult your pals. »

Jeu de lancement de distance (genre *Nanaca Crash* / *Yetisports*) où le
joueur uploade des photos de son entourage, converties par IA en personnages
2D qui servent à la fois de projectile et de mobilier de terrain. Le détail
complet du produit est dans **[docs/PRD.md](docs/PRD.md)**.

## Méthode : gauntlet loop

Chaque version se développe contre une référence jouable existante, clonée
en **comportement** (jamais en assets), avec des critères de sortie
mesurables écrits avant le code. Le protocole est implémenté comme skill
Claude Code dans
**[`.claude/skills/gauntlet-loop/SKILL.md`](.claude/skills/gauntlet-loop/SKILL.md)**
(inspiré de [robonuggets/gauntlet-loop](https://github.com/robonuggets/gauntlet-loop)
et [duolahypercho/gauntlet-loop](https://github.com/duolahypercho/gauntlet-loop),
adapté au cycle en 5 étapes défini dans `docs/PRD.md` section 1) : jouer la
référence, écrire les critères de sortie, cloner le comportement, comparer en
aveugle, gate vert/rouge.

Le détail de chaque version (sensations relevées, critères, comparaison,
statut du gate) vit dans `docs/versions/<version>.md`.

## Statut des versions

| Version | Référence clonée | Statut |
|---|---|---|
| **V0 — Le feel nu** | Yetisports 1, Pingu Throw | 🟡 Prototype jouable, gate en attente d'un vrai playtest — voir [docs/versions/v0.md](docs/versions/v0.md) |
| V1 — Le cœur Nanaca | Nanaca†Crash!! | ⬜ Non démarrée |
| V2 — L'upload et la stylisation | Turbo Dismount (UX) | ⬜ Non démarrée |
| V3 — Le casting | Nanaca†Crash!! / Paf le Chien | ⬜ Non démarrée |
| V4 — Méta-progression et économie | Hedgehog Launch / Learn to Fly / Burrito Bison | ⬜ Non démarrée |
| V5 — Boutique cosmétique et saisons | Sling Kong / Burrito Bison: Launcha Libre | ⬜ Non démarrée |

## Stack

- **App web** : [Next.js](https://nextjs.org) (App Router) + TypeScript.
- **Rendu jeu** : Canvas 2D natif en V0/V1 (PixiJS envisagé seulement si le
  besoin de particules/personnages nombreux se confirme, à partir de la V3).
- **Physique** : intégrateur maison déterministe (Euler semi-implicite, pas
  fixe 60 Hz) dans `src/lib/physics/engine.ts` — volontairement pas de moteur
  rigid body (Matter.js/Rapier), voir `docs/PRD.md` section 2.2.
- **Backend / IA** : prévus à partir de la V2 seulement (route handlers
  Next.js, Postgres, worker Python pour le pipeline image).

## Lancer le projet

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run lint      # ESLint
npm run build     # build de production (inclut le typecheck)
npm start         # sert le build de production
npm test          # tests vitest (déterminisme du moteur, harnais de gate V0)
npm run tune:v0   # rapport texte du gate V0 simulé (VERT/ROUGE par critère)
```

## Structure

```
docs/PRD.md                       Product Requirements Document complet
docs/versions/v0.md, v1.md, ...   Sensations / critères / gate de chaque version
.claude/skills/gauntlet-loop/     Skill Claude Code implémentant la méthode
src/app/                          Pages Next.js (App Router)
src/components/Game.tsx           Boucle de jeu V0 (canvas 2D)
src/lib/physics/engine.ts         Intégrateur physique déterministe
src/lib/game/                     Constantes de tuning et score local
src/lib/game/v0-gate.ts           Harnais de mesure du gate V0 (populations simulées)
scripts/tune-v0.ts                Rapport `npm run tune:v0`
```

## Convention

Ce README est tenu à jour à chaque commit ou merge qui change le statut
d'une version, la stack ou la structure du projet — voir `CLAUDE.md`.
