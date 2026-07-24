# FreelanceDream

Simulateur de **net-en-poche freelance** : ce que ton TJM te rapporte
*réellement* par jour facturé, en SASU « salaire minimum + dividendes ».

> Ton TJM à 500 € ne te rapporte pas 500 €. Il te rapporte ~260 € en poche
> par jour facturé.

Le bon indicateur d'un freelance n'est pas le TJM, c'est le
**net-en-poche annuel ÷ jours facturés**. Cette app fait le calcul complet et
laisse chaque hypothèse ajustable — parce que oui, toi tu factures peut-être
plus de jours, avec un plus gros TJM et moins de frais.

## 🚀 Essayer en ligne

**https://srv725641.hstgr.cloud/simulateur/**

## Lancer l'app

Aucune dépendance, Node ≥ 18 suffit :

```bash
npm start
# → http://localhost:3000
```

## Tester

```bash
npm test
```

Les tests vérifient notamment le scénario de référence (TJM 500 €, 180 jours
facturés → ~47 000 € net/an, ~260 €/jour) et les cas limites.

## Paramètres modifiables

- **Activité** : TJM, jours ouvrés, semaines de congés, jours d'intercontrat
- **Frais pro annuels** : comptable, RC Pro, mutuelle, prévoyance,
  matériel/logiciels, formation
- **Rémunération & fiscalité** : salaire net annuel, taux de charges sur
  salaire, taux moyen d'IR, PFU sur dividendes

L'IS est calculé automatiquement (15 % jusqu'à 42 500 € de résultat, 25 %
au-delà). L'app affiche le net par jour facturé, la répartition complète du
chiffre d'affaires (net, frais, charges, IS, PFU, IR) et le calcul étape par
étape.

## Structure

```
src/simulateur.js       # moteur de calcul (ESM pur, partagé Node/navigateur)
server.js               # serveur statique node:http, zéro dépendance
public/                 # interface (HTML/CSS/JS vanilla)
test/simulateur.test.js # tests node:test
```

⚠️ Simulation indicative : elle ne remplace pas un expert-comptable.
