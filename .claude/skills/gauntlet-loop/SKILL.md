---
name: gauntlet-loop
description: Développer une version de Catapal en la clonant en comportement contre une référence jouable, avec critères de sortie mesurables écrits avant le code et un gate builder/critique en aveugle. À invoquer avant de coder une version (V0, V1, V2...) ou pour auditer une version déjà codée.
---

# Gauntlet Loop — Catapal

Ce skill implémente la méthode décrite dans `docs/PRD.md` section 1. Le principe
général (« gauntlet loop ») est celui documenté par Matt Shumer et repris dans
robonuggets/gauntlet-loop et duolahypercho/gauntlet-loop : on ne juge jamais son
propre travail sur une impression subjective, on le fait rivaliser contre une
référence concrète, avec un juge qui ne sait pas quel côté il regarde.

**Rappel du principe : tu es le frein.** La boucle ne s'arrête pas toute
seule sur un "c'est bien comme ça". Elle s'arrête quand les critères de sortie
écrits à l'étape 2 sont vérifiés au vert, ou quand l'utilisateur dit stop.

## Quand l'invoquer

- `/gauntlet-loop V0` (ou V1, V2...) — avant d'écrire la moindre ligne de code
  d'une version, pour produire les critères de sortie et le plan de clonage.
- `/gauntlet-loop V0 audit` — sur une version déjà codée, pour la comparer à
  sa référence et décider du gate (vert/rouge).

## Le cycle (5 étapes, dans l'ordre, jamais dans le désordre)

### 1. Jouer la référence 30 minutes, noter 10 sensations précises

La référence de chaque version est fixée dans `docs/PRD.md` section 3 (ex :
V0 = Yetisports 1 « Pingu Throw », V1 = Nanaca†Crash!!). Les émulateurs Flash
sont sur flashpointarchive.org / Ruffle ; Nanaca Crash sur flasharch.com.

Les notes vont dans `docs/versions/<version>.md`, section "Sensations". Une
sensation est une observation de comportement mesurable ou reproductible, pas
une opinion :

- Bon : « Le rebond au sol perd environ 40 % de vitesse. »
- Mauvais : « Le rebond est satisfaisant. »

10 sensations minimum. Si tu n'arrives pas à en écrire 10 de précises, tu n'as
pas assez joué la référence — recommence, n'invente pas les 3 dernières.

### 2. Écrire les critères de sortie mesurables AVANT de coder

Ils sont déjà rédigés dans `docs/PRD.md` pour chaque version (section 3,
"Critères de sortie"). Copie-les tels quels dans `docs/versions/<version>.md`,
section "Critères de sortie". **On ne les révise pas en cours de route pour se
donner raison.** Si un critère semble mal calibré une fois le prototype en
main, note-le comme désaccord daté dans le fichier, mais le critère écrit
reste la référence du gate tant que l'utilisateur n'a pas explicitement
validé un changement.

### 3. Cloner le comportement, jamais les assets

Autorisé : rythme, timing, courbes de vitesse, disposition des éléments,
structure des menus, formules de physique (recalculées, pas copiées d'un
désassemblage).

Interdit : sprites, personnages nommés, musique, titre, tout fichier binaire
ou texte issu d'une des références. Le style visuel de Catapal (placeholders
géométriques en V0, style maison à partir de V2) est toujours original.

### 4. Builder / critique en aveugle

Fais tourner un builder (toi, ou un sous-agent `Agent` dédié) qui produit ou
améliore le prototype. Fais ensuite tourner un critique **en contexte
séparé** (sous-agent frais, sans savoir quel côté est Catapal) qui compare
côte à côte, sur les mêmes actions d'entrée quand c'est possible : la
question posée n'est jamais « c'est bien ? » mais **« lequel tu relances ? »**.

En session solo (pas de vrais testeurs disponibles), documente cette
comparaison toi-même dans `docs/versions/<version>.md` section "Comparaison"
en étant explicitement honnête sur les limites (auto-évaluation vs. vrai
playtest utilisateur), et propose à l'utilisateur d'organiser le vrai
playtest à 5 personnes décrit à l'étape 5 avant de considérer le gate comme
définitivement vert.

Itère builder → critique jusqu'à ce que le prototype gagne la comparaison
sur chaque critère, ou jusqu'à ce que l'utilisateur arrête la boucle.

### 5. Playtest A/B et gate

Protocole cible : 5 personnes, référence dans un onglet, prototype dans
l'autre, question unique « lequel tu relances ? ». Consigne les résultats
dans `docs/versions/<version>.md` section "Gate".

- **Tous les critères de sortie vérifiés → gate vert.** Mets à jour le statut
  dans `docs/versions/<version>.md` et dans le tableau de roadmap du README,
  puis passe à la version suivante.
- **Un ou plusieurs critères rouges → on itère ou on tue, jamais « on
  corrigera en V+1 ».** Retourne à l'étape 3 sur les points rouges. Si le
  PRD prévoit un couperet explicite pour la version (ex: V0 rouge après une
  semaine de tuning = arrêt du projet), applique-le et remonte-le à
  l'utilisateur au lieu de continuer silencieusement.

## Sortie attendue de ce skill

Un fichier `docs/versions/<version>.md` rempli avec les sections Sensations,
Critères de sortie, Comparaison, Gate — écrit **avant** ou **en même temps
que** le code de la version, jamais après coup comme justification a
posteriori.
