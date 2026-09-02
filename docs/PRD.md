# CATAPAL — Product Requirements Document

*Jeu de lancement de distance avec casting personnalisé par IA*

Version du document : 1.0 — Septembre 2026
Auteur : Maxence Hermand

---

## 0. Résumé exécutif

**Le produit.** Un jeu de lancement de distance (genre *Nanaca Crash* / *Yetisports*) où le joueur uploade des photos de son entourage. Chaque photo est convertie par IA en personnage 2D dans le style maison. Ces personnages jouent deux rôles : projectile (celui qu'on lance) et mobilier de terrain (ceux sur lesquels on rebondit, qui boostent ou qui stoppent).

**La proposition de valeur.** Le genre est mort de sa banalité : tous les launchers lancent un pingouin générique. Ici, le contenu émotionnel est apporté par le joueur lui-même. La blague se renouvelle à chaque nouveau contact ajouté.

**Le pari à valider en premier.** Pas la stylisation IA — elle marche techniquement. Le pari, c'est que le *game feel* du genre tient encore en 2026 sur mobile web. Si la V0 n'est pas addictive avec un pingouin générique, aucune quantité d'IA ne la sauvera. D'où l'ordre des versions ci-dessous : le fun d'abord, l'IA en V2.

**Précédent de marché.** *Turbo Dismount* (Secret Exit) vend explicitement « utilise les photos de tes amis » et dépasse 50 M de téléchargements sur Google Play, avec une exécution graphique bien inférieure à ce que la stylisation IA permet aujourd'hui. Le besoin est validé ; c'est la qualité d'exécution qui est disponible.

---

## 1. Méthode : le gauntlet loop

Chaque version se développe contre une référence concrète, jouable, que l'on clone en comportement.

**Le cycle, par version :**

1. **Jouer la référence 30 minutes.** Noter 10 sensations précises, pas des features. « Le rebond au sol perd environ 40 % de vitesse », « on sait en 0,3 s si le lancer est raté », « le compteur de distance accélère et c'est ça qui fait le plaisir ».
2. **Écrire les critères de sortie mesurables AVANT de coder.** Ils sont dans ce document pour chaque version. On ne les révise pas en cours de route pour se donner raison.
3. **Cloner le comportement, jamais les assets.** Les mécaniques de jeu ne sont pas protégeables ; les sprites, les personnages nommés, la musique et le titre le sont. On ne réutilise aucun fichier issu des références.
4. **Playtest en A/B côte à côte.** 5 personnes, la référence dans un onglet, le prototype dans l'autre. La question posée n'est pas « c'est bien ? » mais « lequel tu relances ? ».
5. **Gate.** Critères verts → version suivante. Critères rouges → on itère ou on tue. Pas de « on corrigera en V+1 ».

**Où jouer les références.** Les originaux Flash sont préservés par Flashpoint Archive (flashpointarchive.org) et jouables via l'émulateur Ruffle. Nanaca Crash est jouable sur flasharch.com et sur le miroir megami.starcreator.com/nanaca-crash/. Paf le Chien est disponible sur les portails de jeux flash français. Les Dismount et Sling Kong sont sur les stores mobiles. Prévoir un budget de quelques dizaines d'euros pour acheter les versions payantes et les disséquer.

---

## 2. Architecture technique

### 2.1 Stack

| Couche | Choix | Justification |
|---|---|---|
| App web | Next.js (App Router), TypeScript | Stack maîtrisée, SSR pour les pages de partage (OG images = levier viral) |
| Rendu jeu | PixiJS (WebGL) ou Canvas 2D natif | Pixi si l'on vise beaucoup de particules et de personnages à l'écran, sinon Canvas suffit en V0 |
| Physique | **Intégrateur custom, pas de moteur** | Voir 2.2, c'est la décision technique la plus importante du projet |
| Backend | Route handlers Next.js + Postgres (Neon/Supabase) | Simple, pas de service séparé avant la V4 |
| Stockage assets | Object storage S3-compatible (Cloudflare R2) + CDN | Les sprites générés sont servis des milliers de fois |
| Pipeline IA | Worker **Python** (FastAPI + file de tâches) | Détourage, normalisation, atlas : l'outillage image est en Python |
| Génération | Modèle image-to-image à forte cohérence de personnage | Voir 2.3 |

### 2.2 Physique : ne pas utiliser de moteur rigid body

**Décision : intégrateur maison, déterministe, à pas de temps fixe (60 Hz).**

Le réflexe serait de prendre Matter.js ou Rapier. C'est une erreur pour ce genre. La physique de Nanaca Crash n'est pas une simulation : c'est une courbe de plaisir déguisée en physique. Les rebonds gagnent parfois de l'énergie, la traînée est arbitraire, le personnage tourne sans moment d'inertie réel. Un moteur rigid body va se battre contre vous sur exactement ces points, et vous passerez plus de temps à contraindre le solveur qu'à tuner le fun.

Un intégrateur d'Euler semi-implicite sur un point matériel fait tenir tout le jeu en ~150 lignes, et chaque paramètre devient directement tunable.

```
état : position (x, y), vitesse (vx, vy), rotation
par tick (dt fixe = 1/60) :
  vy += gravité * dt
  vx *= traînée_air ; vy *= traînée_air
  x += vx * dt ; y += vy * dt
  si contact sol : vy = -vy * restitution ; vx *= friction_sol
  si |v| < seuil_arrêt et au sol : fin de partie
```

Paramètres de départ pour le tuning (à ajuster au playtest, pas à la calculette) : gravité ≈ 1200 px/s², restitution sol 0,55 à 0,70, traînée air 0,999 par tick, vitesse initiale 900 à 2400 px/s, angle 10° à 70°, seuil d'arrêt 40 px/s. Échelle d'affichage : 10 px = 1 mètre.

Matter.js ne devient pertinent que si l'on veut un ragdoll articulé (membres qui pendouillent) en V5+. À ce moment-là, le ragdoll sera purement décoratif et la trajectoire restera pilotée par l'intégrateur custom.

**Corollaire : le déterminisme est une exigence, pas un confort.** Même seed + même suite d'inputs = même distance, au pixel près. C'est ce qui permet de valider les scores côté serveur (2.4) et de rejouer un run pour générer un replay partageable.

### 2.3 Pipeline de stylisation IA

Le pipeline tourne côté serveur, en asynchrone, jamais dans le navigateur.

```
photo uploadée
  → [1] contrôles d'entrée : taille, format, présence d'un visage unique
  → [2] modération : NSFW, détection d'âge apparent, contenu interdit
  → [3] détourage / cadrage du sujet (rembg ou équivalent, Python)
  → [4] génération image-to-image, N poses, style verrouillé par image de référence
  → [5] post-traitement : détourage alpha, normalisation d'échelle, palette,
        contour, recadrage sur canvas fixe
  → [6] validation automatique (le sujet remplit-il le cadre attendu ?)
  → [7] écriture atlas + métadonnées, purge de la photo source
  → [8] écran de validation par le joueur : accepter / regénérer / annuler
```

**Modèles.** Au T3 2026, le marché s'est stabilisé sur trois familles pour l'édition image-to-image : Nano Banana 2 (Gemini 3.1 Flash Image, réputé le meilleur sur la cohérence de personnage à travers plusieurs scènes, ~0,08 $/image en 1K), GPT Image 2 (meilleur sur les instructions spatiales complexes, tarification au token), et FLUX.2 (multi-références, jusqu'à 9 images de contexte). Des modèles de batch type Seedream v5 Lite descendent à ~0,03 $/image. Vérifier les tarifs en vigueur avant de figer le business model : ils bougent tous les trimestres.

Pour ce cas d'usage — même personnage, plusieurs poses, style maison constant — la cohérence de personnage prime sur tout le reste. C'est le critère de sélection n°1 lors du benchmark de la V2.

**Coût unitaire à surveiller.** Avec 2 à 4 tentatives par personnage et 3 poses par personnage retenu, on est entre 0,20 € et 0,80 € par personnage créé. À 5 personnages par joueur, cela fait 1 à 4 € de coût variable par joueur *avant* toute monétisation. C'est la ligne qui tue le projet si elle n'est pas plafonnée dès la V2. Mitigations : quota gratuit (3 personnages), cache par hash de photo, dégradation vers un modèle moins cher pour les regénérations.

### 2.4 Le contrat de sprite — décision à prendre en V2, pas en V5

**C'est le piège structurel du projet.** Si la V2 génère des personnages en format libre, la boutique cosmétique de la V5 est impossible : on ne peut pas poser un chapeau sur 40 000 sprites tous cadrés différemment.

Il faut donc figer, dès la première ligne de la V2, un contrat que toute sortie IA doit respecter :

- **Canvas fixe** (ex. 512 × 512), fond transparent
- **Pose canonique** imposée par le prompt et vérifiée automatiquement
- **Points d'ancrage normalisés** : centre de la tête, épaules, taille, pieds, exprimés en coordonnées relatives et stockés en base
- **Sortie multi-couches ou multi-poses** : neutre, vol/rotation, impact — au minimum 3
- **Palette contrainte** par une image de référence de style passée en entrée

Tout sprite qui ne passe pas la validation automatique est regénéré, pas accepté « parce que c'est joli ». Le respect du contrat est ce qui rend les cosmétiques possibles.

### 2.5 Validation des scores

Le client envoie `{seed, suite d'inputs horodatés, distance revendiquée}`. Le serveur rejoue la simulation avec le même intégrateur (partagé entre client et serveur, en TypeScript) et compare. Écart > tolérance → score rejeté. Sans cela, un leaderboard public est un bac à sable pour bots dès la première semaine.

---

## 3. Les versions

### V0 — Le feel nu (≈ 1 semaine)

**Objectif.** Répondre à une seule question : la boucle de base est-elle encore addictive en 2026 ?

**Référence à copier : Yetisports 1 — Pingu Throw.** On copie précisément : le rythme en deux temps (une jauge d'angle qui oscille, puis une jauge de puissance), l'absence totale d'input après le lancement, la brièveté (une partie dure moins de 15 s), et le bouton « rejouer » placé sous le pouce.

**Périmètre.** Un écran. Un personnage placeholder (forme géométrique, aucun asset). Angle + puissance. Rebonds au sol. Compteur de distance. Meilleur score en mémoire locale. Rien d'autre.

**Hors périmètre.** Comptes, base de données, IA, son, menu, personnages au sol.

**Critères de sortie.**
- 5 testeurs enchaînent spontanément 20 lancers ou plus sans qu'on le leur demande
- Le rapport entre la distance médiane et la distance du 95e centile est d'au moins 3 : le skill doit payer
- Le temps entre deux lancers est inférieur à 2 secondes
- 60 fps stables sur un mobile milieu de gamme de 3 ans

**Si les critères sont rouges :** on tune la physique une semaine de plus. Toujours rouge → on arrête le projet ici. C'est le meilleur moment pour l'arrêter.

---

### V1 — Le cœur Nanaca (≈ 3 à 4 semaines)

**Objectif.** Passer d'un jeu de hasard à un jeu de skill. C'est ici que se crée la rétention.

**Référence à copier : Nanaca†Crash!!** On copie précisément :

- **Les deux Aerial Crash.** Un boost rouge qui projette vers le haut, limité à 3 par partie. Un boost bleu qui projette vers le bas en diagonale, illimité mais avec une jauge de recharge visible. Toute la profondeur du jeu tient dans cet arbitrage : dépenser une ressource rare maintenant ou espérer une meilleure opportunité plus loin.
- **La grille de personnages au sol, aux effets typés.** Au minimum 5 archétypes : *Booster diagonal* (relance à 45°, effet standard), *Booster vertical* (renvoie haut, plus puissant), *Ralentisseur* (à éviter, coupe la vitesse), *Neutre* (change l'angle sans gain ni perte), *Bloqueur* (fin de partie immédiate au contact). La position des personnages est semi-aléatoire mais reproductible par seed.
- **Les Specials à fenêtre de timing.** Sur certains contacts, une icône apparaît ; un tap dans les ~0,7 s déclenche un effet majeur (accélération prolongée, vol horizontal sur une longue portée, protection contre le prochain Bloqueur). Raté, le contact produit son effet normal. C'est ce qui transforme un spectateur en joueur.
- **La courbe de session.** Les parties fortes durent 40 à 90 s ; les parties ratées se terminent en 10 s et se relancent immédiatement.

**Ajouts hors référence.** Leaderboard serveur avec validation par rejeu (2.5). Tutoriel en 3 lancers guidés.

**Critères de sortie.**
- Un joueur entraîné fait au moins 5 fois la distance d'un joueur débutant sur 10 parties
- Rétention J1 supérieure à 30 % sur un panel de 30 testeurs recrutés hors entourage proche
- Médiane de 8 lancers ou plus par session
- Aucun score aberrant accepté par le serveur sur une campagne de test adversarial

---

### V2 — L'upload et la stylisation (≈ 3 à 4 semaines)

**Objectif.** Prouver que la conversion photo → personnage est fiable, rapide, économiquement soutenable et légalement propre.

**Référence à copier : Stair Dismount / Turbo Dismount, pour l'UX uniquement.** On copie : le placement de la fonction (accessible dès le premier écran, pas enfoui dans un menu), la promesse formulée simplement (« mets tes potes dans le jeu »), et le fait que le personnage par défaut reste jouable sans jamais uploader quoi que ce soit.

**Périmètre.**
- Upload d'une photo, cadrage guidé, prévisualisation
- Pipeline complet 2.3, avec le contrat de sprite 2.4 respecté et testé
- Écran de validation : accepter / regénérer (quota) / supprimer
- Le personnage validé devient le projectile
- Quota de 3 personnages gratuits
- Parcours de consentement et de suppression (voir section 5)

**Critères de sortie.**
- Taux d'acceptation au premier essai ≥ 85 % sur un jeu de test de 100 photos volontairement variées (éclairages, âges, teints, lunettes, groupes, photos floues, animaux)
- Latence perçue < 30 s, avec un écran d'attente qui ne donne pas envie de fermer l'onglet
- Coût médian par personnage validé < 0,40 €
- 100 % des sprites générés respectent le contrat (validation automatique, pas d'exception manuelle)
- 0 sortie inappropriée sur le jeu de test adversarial de modération

**Point de vigilance.** Une photo de groupe, une photo d'animal, un dessin, une capture d'écran : ces cas arriveront dès le premier jour. Ils doivent produire un message clair, pas une erreur 500 ni un sprite monstrueux.

---

### V3 — Le casting (≈ 3 semaines) — la version qui différencie

**Objectif.** Livrer la seule feature que personne n'a faite dans ce genre.

**Le principe.** Les personnages uploadés ne sont plus seulement le projectile : ils peuplent aussi le terrain. Le joueur assigne un archétype à chaque personnage de son casting (Booster, Ralentisseur, Bloqueur…). Il lance Kévin, rebondit sur Sarah, se fait stopper par son manager. La blague devient sociale et se renouvelle à chaque ajout au casting.

**Référence à copier : Nanaca†Crash pour la structure de rôles, Paf le Chien version Facebook pour la mécanique de partage.** De Paf le Chien on retient surtout un contre-exemple : sa version Facebook a fini par étouffer le jeu sous les invitations obligatoires et l'énergie limitée. On copie la viralité, pas la coercition.

**Périmètre.**
- Gestion du casting : jusqu'à 8 personnages, assignation des rôles, réorganisation
- Génération du terrain à partir du casting du joueur
- Replay partageable : GIF ou vidéo courte du meilleur run, avec image OG générée côté serveur
- Défi asynchrone : un lien de partage rejoue exactement la même seed pour le destinataire

**Critères de sortie.**
- ≥ 60 % des joueurs qui ont uploadé un personnage en assignent au moins un au terrain
- ≥ 15 % des sessions produisent un partage
- Le nombre de lancers par session augmente d'au moins 25 % par rapport à la V1

---

### V4 — Méta-progression et économie (≈ 4 semaines)

**Objectif.** Transformer une curiosité en habitude. Donner une raison de revenir le lendemain.

**Références à copier : Hedgehog Launch et Learn to Fly pour la boucle d'upgrade, Burrito Bison pour la *juiciness*.** On copie : la monnaie gagnée proportionnellement à la performance, l'arbre d'améliorations qui change réellement la trajectoire (puissance de lancement, nombre d'Aerial rouges, vitesse de recharge du bleu, résistance à un Bloqueur), les objectifs par paliers qui donnent un cap, et surtout — de Burrito Bison — le feedback à l'impact : ralenti, tremblement d'écran, chiffres qui giclent, accélération du compteur.

**Périmètre.** Monnaie douce. Arbre d'upgrades (8 à 12 nœuds). Objectifs quotidiens. Comptes utilisateurs et synchronisation. Passage du leaderboard local à des ligues hebdomadaires.

**Critères de sortie.**
- Rétention J7 ≥ 15 %
- ≥ 40 % des joueurs actifs dépensent de la monnaie dans les 3 premières sessions
- Coût IA par joueur actif mensuel inférieur au revenu moyen projeté par joueur (à ce stade : publicité ou pré-monétisation)

---

### V5 — Boutique cosmétique et saisons (≈ 4 à 6 semaines)

**Objectif.** Monétiser sans dégrader le jeu.

**Références à copier : Sling Kong pour la collection, Burrito Bison: Launcha Libre pour le F2P mobile.** On copie : la cosmétique strictement non fonctionnelle (aucune tenue ne donne d'avantage de distance), les sets thématiques rotatifs, et la vitrine qui montre l'objet porté par *ton* personnage, pas par un mannequin générique.

**Périmètre.**
- Système de couches cosmétiques posées sur les ancrages normalisés du contrat de sprite (2.4)
- Boutique : monnaie dure, packs, rotation hebdomadaire
- Saisons thématiques avec une piste de récompenses
- Génération de cosmétiques assistée par IA côté production interne — pas côté joueur, pour garder le contrôle qualité et les coûts

**Critères de sortie.**
- Taux de conversion payeur ≥ 2 % des joueurs actifs mensuels
- Aucune régression mesurable de rétention après l'introduction de la boutique
- Marge brute positive par joueur payant, coûts IA inclus

---

### Au-delà — pistes non engagées

Ligues et duels temps réel. Terrains thématiques (plage, ville, montagne) sur le modèle des variantes Yetisports. Mode « équipe » où plusieurs joueurs contribuent au casting d'un même terrain. Application mobile native si les métriques web le justifient — pas avant.

---

## 4. Métriques de pilotage

| Métrique | Où elle compte | Seuil d'alerte |
|---|---|---|
| Lancers par session | V0 → V5 | < 6 |
| Rétention J1 / J7 | V1 → V5 | < 25 % / < 12 % |
| Taux d'upload (joueurs ayant créé ≥ 1 personnage) | V2 → | < 40 % |
| Taux d'acceptation du sprite au 1er essai | V2 → | < 80 % |
| Coût IA par personnage validé | V2 → | > 0,50 € |
| Coût IA par joueur actif mensuel | V4 → | > ARPU |
| Taux de partage par session | V3 → | < 10 % |
| Signalements pour 1 000 personnages créés | V2 → | > 5 |

---

## 5. Risques — par ordre de gravité

### 5.1 Harcèlement — risque n°1, réputationnel et humain

Un jeu où l'on lance la photo de quelqu'un est un outil de harcèlement scolaire prêt à l'emploi. Ce risque est supérieur au risque juridique parce qu'il est irréparable et qu'il tuerait le produit du jour au lendemain.

Mitigations non négociables, à intégrer dès la V2 :
- **Registre de ton.** On « envoie voler », on ne « détruit » pas. Aucun sang, aucune blessure, aucun compteur de dégâts, aucun bruit d'os. Le personnage se relève à la fin et fait un signe de la main. C'est un choix de design, pas un habillage : c'est ce qui sépare une blague entre amis d'une humiliation.
- **Privé par défaut.** Un casting n'est visible que par son créateur. Aucun annuaire, aucune recherche de personnages, aucune galerie publique.
- **Signalement en un geste** depuis tout écran affichant un personnage, avec retrait sous 24 h.
- **Pas de nommage libre en public.** Si des noms sont attachés aux personnages, ils restent privés au casting.

### 5.2 Données personnelles et droit à l'image

Une photo de visage est une donnée personnelle. La photo d'un tiers uploadée par un joueur engage à la fois le RGPD et, en France, le droit à l'image de la personne photographiée.

- **Base légale et consentement.** Le joueur qui uploade doit déclarer détenir l'accord de la personne. C'est nécessaire mais insuffisant : prévoir un canal de retrait accessible aux tiers, sans compte.
- **Minimisation.** La photo source est supprimée immédiatement après génération. Seul le sprite dérivé est conservé. Cela réduit fortement l'exposition et simplifie la position juridique.
- **Mineurs.** Sujet le plus sensible. Détection d'âge apparent en modération, et politique explicite. Un mineur photographié ne peut pas consentir seul.
- **Qualification biométrique.** Une stylisation n'est en principe pas un traitement biométrique au sens du RGPD, qui vise l'identification unique. À faire confirmer par un juriste avant le lancement public — la réponse conditionne l'obligation d'AIPD.
- **Droits.** Accès, suppression, opposition, avec un délai de traitement tenu.

Ce point doit passer devant un avocat spécialisé avant la V2, pas avant la V5. Le coût d'une consultation est marginal face au coût d'un retrait de store.

### 5.3 Conditions d'utilisation des fournisseurs IA

Générer des images à partir de photos de personnes réelles identifiables est encadré différemment selon les fournisseurs. Vérifier les conditions de chacun avant de figer l'architecture, et prévoir une abstraction du fournisseur dans le code : ces politiques changent, et un changement unilatéral en pleine croissance est un risque d'arrêt de service.

### 5.4 Coût variable

Détaillé en 2.3. Un plafond gratuit, un cache par hash et un modèle de repli moins cher pour les regénérations sont à implémenter en même temps que le pipeline, pas après.

### 5.5 Cohérence de style à l'échelle

Cent visages uploadés doivent produire cent personnages qui semblent issus du même jeu. C'est le défi produit le plus sous-estimé : une variance visuelle trop forte donne un jeu qui ressemble à un collage. La réponse est le contrat de sprite (2.4) plus une image de référence de style systématiquement injectée en entrée, plus une validation automatique impitoyable.

---

## 6. Ce que ce document ne tranche pas

- **Le modèle de distribution.** Web mobile d'abord (partage sans friction, pas de commission de store) puis application native — c'est l'hypothèse de travail, à réévaluer en V4.
- **La direction artistique.** Le style maison doit être choisi avant la V2 puisqu'il conditionne l'image de référence du pipeline. Contrainte : un style suffisamment stylisé pour absorber les défauts de génération, suffisamment reconnaissable pour rester identifiable, et suffisamment simple pour supporter des cosmétiques en surcouche.
- **Le budget.** À chiffrer après la V0, quand on saura si le projet continue.
