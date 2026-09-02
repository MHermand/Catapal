@AGENTS.md

# Catapal

Jeu de lancement de distance (genre Nanaca Crash / Yetisports) avec casting
personnalisé par IA. Le PRD complet est dans `docs/PRD.md` — le lire avant
toute décision de scope ou d'architecture, il tranche la plupart des
questions de design.

## Méthode de développement : gauntlet loop

Ce projet se construit version par version (V0 → V5, voir `docs/PRD.md`
section 3), chacune clonée en **comportement** (jamais en assets) contre une
référence jouable existante, avec des critères de sortie mesurables écrits
avant le code. Le protocole complet est dans le skill
`.claude/skills/gauntlet-loop/SKILL.md` — invoque-le (`/gauntlet-loop <version>`)
avant de commencer le code d'une nouvelle version. Ne jamais commencer à
coder une version sans que `docs/versions/<version>.md` existe avec ses
sensations et ses critères de sortie déjà écrits.

Statut des versions : voir le tableau dans `README.md`, tenu à jour à chaque
commit (voir convention ci-dessous).

## Stack

- **Web app** : Next.js (App Router) + TypeScript, dans `src/`. C'est la
  stack par défaut du porteur de projet pour toute application web.
- **Rendu jeu** : Canvas 2D natif en V0/V1 (pas besoin de WebGL tant qu'il n'y
  a pas beaucoup de particules/personnages à l'écran — voir PRD 2.1). PixiJS
  n'est envisagé qu'à partir de la V3 si le besoin est démontré.
- **Physique** : intégrateur maison en TypeScript (`src/lib/physics`), Euler
  semi-implicite, pas de temps fixe 60 Hz, **jamais** de moteur rigid body
  (Matter.js/Rapier). Voir `docs/PRD.md` section 2.2 pour les paramètres et
  la justification — c'est la décision technique la plus importante du
  projet, ne pas la reconsidérer sans repasser par un gauntlet loop.
- **Déterminisme** : même seed + même suite d'inputs = même distance au pixel
  près. Requis dès que la V1 introduit un serveur (validation de score par
  rejeu, PRD 2.5) : le module de physique doit rester pur (pas de `Math.random`
  sans seed, pas de dépendance au framerate réel) pour être partageable
  client/serveur tel quel.
- **Backend / IA** : à partir de la V2 seulement (route handlers Next.js,
  Postgres, worker Python pour le pipeline image — PRD 2.1/2.3). Ne pas
  introduire ces briques en avance de phase.

## Conventions de code

- Pas de commentaires sauf si une contrainte non évidente le justifie (voir
  règles générales de l'agent).
- Pas d'abstraction anticipée pour des versions futures (V2+) tant que la
  version courante ne l'exige pas — le PRD prévient explicitement contre le
  sur-engineering prématuré (ex: le contrat de sprite ne se fige qu'en V2,
  pas avant).
- `npm run lint` et `npm run build` doivent passer avant tout commit.

## Convention : README toujours à jour

Après chaque commit ou merge sur ce projet, relire `README.md` et le mettre
à jour si le commit a changé : le statut d'une version (gate vert/rouge), la
stack, les scripts disponibles, ou la structure du projet. Un commit qui
change le comportement du jeu sans mise à jour du tableau de statut des
versions est incomplet. Cette convention s'applique à toute session Claude
Code travaillant sur ce dépôt, pas seulement à la session qui l'a écrite.
