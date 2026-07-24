/**
 * Moteur de simulation du net-en-poche d'un freelance en SASU
 * (stratégie salaire minimum + dividendes).
 *
 * Module ESM pur, sans dépendance : utilisable côté Node (serveur, tests)
 * comme côté navigateur.
 */

/** Barème de l'impôt sur les sociétés (PME) : taux réduit puis taux normal. */
export const IS_SEUIL_TAUX_REDUIT = 42500;
export const IS_TAUX_REDUIT = 0.15;
export const IS_TAUX_NORMAL = 0.25;

/**
 * Paramètres par défaut, repris du post de référence
 * (freelance IT à 500 € HT/jour).
 */
export const DEFAUTS = {
  // Activité
  tjm: 500, // TJM facturé, en € HT
  joursOuvres: 218, // jours ouvrés théoriques dans l'année
  semainesConges: 5, // semaines de congés (5 jours ouvrés chacune)
  joursIntercontrat: 13, // jours d'intercontrat / non facturés

  // Frais professionnels annuels, en €
  fraisComptable: 1500,
  fraisRcPro: 400,
  fraisMutuelle: 2000,
  fraisPrevoyance: 2000,
  fraisMateriel: 2000, // matériel + logiciels
  fraisFormation: 2000,

  // Rémunération & fiscalité
  salaireNetAnnuel: 15000, // salaire net versé par la SASU, en €
  tauxChargesSalaire: 46.7, // charges (patronales + salariales) en % du net
  tauxIrSalaire: 6.7, // taux moyen d'IR sur le salaire, en %
  tauxPfu: 30, // flat tax sur les dividendes, en %
};

/**
 * Calcule l'IS dû sur un résultat imposable, avec le taux réduit PME
 * jusqu'à IS_SEUIL_TAUX_REDUIT puis le taux normal au-delà.
 */
export function calculerIS(resultatImposable) {
  if (resultatImposable <= 0) return 0;
  const trancheReduite = Math.min(resultatImposable, IS_SEUIL_TAUX_REDUIT);
  const trancheNormale = Math.max(0, resultatImposable - IS_SEUIL_TAUX_REDUIT);
  return trancheReduite * IS_TAUX_REDUIT + trancheNormale * IS_TAUX_NORMAL;
}

/**
 * Simule une année d'activité et retourne le détail complet du calcul,
 * du chiffre d'affaires au net-en-poche par jour facturé.
 *
 * @param {Partial<typeof DEFAUTS>} params - paramètres à surcharger
 * @returns {object} détail de la simulation (montants annuels en €)
 */
export function simuler(params = {}) {
  const p = { ...DEFAUTS, ...params };

  // 1. Jours réellement facturés
  const joursConges = p.semainesConges * 5;
  const joursFactures = Math.max(
    0,
    p.joursOuvres - joursConges - p.joursIntercontrat
  );

  // 2. Chiffre d'affaires et frais
  const chiffreAffaires = p.tjm * joursFactures;
  const fraisTotal =
    p.fraisComptable +
    p.fraisRcPro +
    p.fraisMutuelle +
    p.fraisPrevoyance +
    p.fraisMateriel +
    p.fraisFormation;
  const resultatAvantRemuneration = chiffreAffaires - fraisTotal;

  // 3. Salaire : coût employeur, charges, IR
  const coutSalaire = p.salaireNetAnnuel * (1 + p.tauxChargesSalaire / 100);
  const chargesSalaire = coutSalaire - p.salaireNetAnnuel;
  const irSalaire = p.salaireNetAnnuel * (p.tauxIrSalaire / 100);
  const salaireNetApresIR = p.salaireNetAnnuel - irSalaire;

  // Le coût du salaire ne peut pas dépasser ce que l'activité dégage :
  // au-delà, le résidu est simplement négatif et il n'y a rien à distribuer.
  const resultatImposable = resultatAvantRemuneration - coutSalaire;

  // 4. IS, dividendes, PFU
  const impotSocietes = calculerIS(resultatImposable);
  const beneficeDistribuable = Math.max(0, resultatImposable - impotSocietes);
  const pfuDividendes = beneficeDistribuable * (p.tauxPfu / 100);
  const dividendesNets = beneficeDistribuable - pfuDividendes;

  // 5. Net-en-poche
  const netEnPoche = salaireNetApresIR + dividendesNets;
  const netParJourFacture = joursFactures > 0 ? netEnPoche / joursFactures : 0;
  const ratioNetSurCA = chiffreAffaires > 0 ? netEnPoche / chiffreAffaires : 0;

  return {
    parametres: p,
    joursConges,
    joursFactures,
    chiffreAffaires,
    fraisTotal,
    resultatAvantRemuneration,
    coutSalaire,
    chargesSalaire,
    irSalaire,
    salaireNetApresIR,
    resultatImposable,
    impotSocietes,
    beneficeDistribuable,
    pfuDividendes,
    dividendesNets,
    netEnPoche,
    netEnPocheMensuel: netEnPoche / 12,
    netParJourFacture,
    ratioNetSurCA,
    // La rémunération demandée dépasse ce que l'activité dégage
    salaireInsoutenable: resultatImposable < 0,
  };
}
