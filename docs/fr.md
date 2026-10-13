# Faikout

Cette intégration relie Gladys à vos climatisations **Daikin** équipées d'un
module [**Faikout**](https://www.faikin.au) (anciennement _Faikin_). Le module
Faikout remplace le module Wi-Fi d'origine et se pilote **en local**, sur votre
réseau : pas de cloud, pas de compte, pas d'Internet nécessaire.

Dans Gladys, chaque climatisation devient un appareil avec :

- **marche / arrêt**, **mode** (auto, froid, chauffage, déshumidification,
  ventilation), **consigne** et **vitesse de ventilation** ;
- **balayage** horizontal et vertical (marche ou arrêt : pas de position fixe), et les modes **Econo**, **Powerful**,
  **Comfort**, **Streamer**, **unité extérieure silencieuse**, quand votre
  climatisation les a ;
- les mesures : **température de la pièce**, **température extérieure**,
  températures d'**entrée d'air** et du **fluide frigorigène**, **humidité**,
  **puissance consommée**.

L'intégration ne crée que ce que votre climatisation remonte vraiment : une
fonction absente de votre modèle n'apparaît pas.

## Avant de commencer

1. Installez le module Faikout dans la climatisation (voir le
   [manuel d'installation Faikout](https://codeberg.org/RevK/ESP32-Faikout/src/branch/main/Manuals/Setup.md)).
2. Connectez-le à votre Wi-Fi : au premier démarrage il crée son propre point
   d'accès, avec une page de configuration.
3. Vérifiez que vous pouvez ouvrir sa page web (`http://<adresse du module>/`)
   depuis votre réseau et piloter la climatisation depuis cette page.
4. **Donnez-lui une adresse IP fixe** (réservation DHCP dans votre box ou votre
   routeur). C'est cette adresse que Gladys utilisera.

Gladys parle au module comme sa propre page web : il faut garder les
**commandes web** du Faikout actives (`webcontrol`, actives par défaut).

## Configuration

Dans **Intégrations → Faikout → Configuration** :

| Champ                              | Rôle                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unités Faikout**                 | L'adresse de chaque module, séparées par des virgules. Un nom suivi de `=` devant l'adresse donne son nom à l'appareil.                                                          |
| **Mot de passe web**               | Seulement si un **mot de passe web** est défini dans les réglages du Faikout (le même pour toutes les unités). Laissez vide sinon. Le mot de passe des réglages n'est pas utile. |
| **Intervalle de rafraîchissement** | Toutes les combien de secondes chaque climatisation est lue (30 s par défaut, de 5 à 600). Un réglage fait à la télécommande apparaît dans Gladys au plus tard après ce délai.   |

Exemple :

```
Salon=192.168.1.50, Chambre=192.168.1.51, 192.168.1.52
```

- Sans nom, l'appareil prend le nom du module (son _hostname_).
- Un nom en `.local` (par exemple `guestac.local`) n'est souvent **pas résolu**
  depuis le conteneur de l'intégration : préférez l'adresse IP.
- Un port autre que 80 s'écrit `192.168.1.50:8080`.
- Avec un **mot de passe web**, Gladys l'envoie comme la page du Faikout une
  fois connecté (un cookie, en clair sur votre réseau, comme le signalent les
  réglages du Faikout). Le mot de passe des réglages reste inconnu de Gladys :
  il n'en a jamais besoin.

Cliquez ensuite sur **Tester la connexion** : pour chaque unité, le message dit
si elle répond, son modèle, son protocole (S21, X50A…), son mode et la
température de la pièce.

Enfin, ouvrez l'onglet **Découverte** de l'intégration et créez les appareils
proposés.

## Ce que montre le badge de chaque appareil

| Badge                    | Signification                                                                 |
| ------------------------ | ----------------------------------------------------------------------------- |
| **Local**                | Le Faikout répond, la climatisation aussi.                                    |
| **Local** + point orange | Le Faikout répond, mais **pas la climatisation** : vérifiez le câble S21/X50. |
| **Injoignable**          | Le Faikout ne répond pas : coupé, hors Wi-Fi, ou adresse changée.             |

## Scènes

### Déclencheurs

| Déclencheur                                          | Quand                                                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Une climatisation se déconnecte ou revient**       | Le Faikout ne répond plus (raison `unreachable`), la climatisation ne répond plus au Faikout (raison `aircon`), puis quand tout répond de nouveau.                  |
| **Une climatisation est modifiée hors de Gladys**    | Marche, mode, consigne ou ventilation changés à la télécommande infrarouge, sur la page web du Faikout, ou par un minuteur du Faikout. Jamais par Gladys elle-même. |
| **Une climatisation commence ou finit un dégivrage** | En chauffage par temps froid, l'unité extérieure s'arrête quelques minutes pour fondre son givre.                                                                   |

Chaque déclencheur se filtre par climatisation, et par état (ou par ce qui a
changé). Les valeurs sont disponibles dans la scène, par exemple
`{{triggerEvent.data.mode}}` ou `{{triggerEvent.data.temperature}}`.

Les changements faits par le **Faikout auto** (qui déplace la consigne et le
mode tout seul) ne déclenchent pas « modifiée hors de Gladys ».

### Actions

| Action                       | Rôle                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Régler une climatisation** | Marche, mode, consigne et ventilation en une seule fois. Un champ laissé vide garde sa valeur.                                                                      |
| **Régler le Faikout auto**   | Le Faikout chauffe ou refroidit tout seul pour garder la pièce entre _cible − marge_ et _cible + marge_. Une marge de 0 l'arrête.                                   |
| **Lire une climatisation**   | Une lecture fraîche : en ligne, marche, mode, consigne, température de la pièce et extérieure, humidité. Ne tombe jamais en erreur : testez la sortie **En ligne**. |

Les sorties de ces actions sont utilisables par les actions suivantes de la
scène (conditions, messages…).

Pour une simple commande (allumer, changer la consigne), l'action standard
**Contrôler un appareil** de Gladys marche aussi.

## Widgets du tableau de bord

- **Climatisation Faikout** : une climatisation. Tuiles en direct (pièce,
  consigne, extérieur, puissance), une courbe des températures pièce, consigne
  et extérieur sur 24 h, puis état, mode, ventilation, volets, modes confort,
  et Faikout auto ou dégivrage quand ils tournent. Un bouton **Allumer** ou
  **Éteindre** (l'inverse de l'état actuel) et **Actualiser**. Choisissez la
  climatisation dans les réglages du widget.
- **Vue d'ensemble Faikout** : toutes vos climatisations sur une carte, avec
  leur mode et la température de la pièce.

## Dépannage

- **« pas de réponse »** au test de connexion : ouvrez
  `http://<adresse>/` depuis un ordinateur du même réseau que Gladys. Si la
  page ne s'ouvre pas, le souci est le réseau (adresse, Wi-Fi, VLAN), pas
  Gladys.
- **« mot de passe web absent ou faux »** : un mot de passe web est défini sur
  le Faikout. Tapez le même dans **Mot de passe web** (copiez-le depuis les
  réglages du Faikout).
- **Une commande échoue avec « did not apply »** : la climatisation n'a pas
  cette fonction, ou le Faikout ne peut pas la piloter.
- **Le Faikout auto ne s'applique pas** : le Faikout est piloté par un
  contrôleur externe (EnvMon, commande MQTT `control`), qui a la priorité.
- **Un appareil reste injoignable après un changement d'adresse** : mettez la
  nouvelle adresse dans **Unités Faikout**. L'appareil Gladys est lié à
  l'adresse MAC du module : il garde son historique et ses scènes.

## Confidentialité

Tout reste sur votre réseau : l'intégration ne parle qu'aux adresses que vous
lui donnez, en HTTP et WebSocket locaux. Le mot de passe web, s'il y en a un, est gardé
par Gladys avec la configuration et envoyé seulement aux unités. Elle garde seulement, dans son volume
`/data`, l'adresse MAC, le nom, le modèle et la liste des fonctions de chaque
unité, pour retrouver ses appareils même si une climatisation est éteinte au
démarrage.
