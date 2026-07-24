import { test } from "node:test";
import assert from "node:assert/strict";
import { simuler, calculerIS, DEFAUTS } from "../src/simulateur.js";

// Tolérance en € : le post de référence arrondit ses montants.
const proche = (reel, attendu, tolerance, message) =>
  assert.ok(
    Math.abs(reel - attendu) <= tolerance,
    `${message} : attendu ~${attendu}, obtenu ${Math.round(reel)}`
  );

test("scénario du post : TJM 500 € → ~260 € net par jour facturé", () => {
  const r = simuler(); // valeurs par défaut = celles du post

  assert.equal(r.joursFactures, 180, "218 − 25 congés − 13 intercontrat");
  assert.equal(r.chiffreAffaires, 90000, "500 € × 180 jours");
  assert.equal(r.fraisTotal, 9900, "somme des frais pro du post");

  proche(r.coutSalaire, 22000, 100, "coût total du salaire");
  proche(r.impotSocietes, 10250, 100, "IS");
  proche(r.dividendesNets, 33400, 200, "dividendes nets après PFU");
  proche(r.salaireNetApresIR, 14000, 100, "salaire net après IR");
  proche(r.netEnPoche, 47000, 700, "net-en-poche annuel");
  proche(r.netParJourFacture, 260, 5, "net par jour facturé");

  // La moitié du TJM, pas 500 €.
  assert.ok(r.netParJourFacture / DEFAUTS.tjm < 0.55, "ratio net/TJM ≈ 50 %");
  assert.ok(r.netParJourFacture / DEFAUTS.tjm > 0.45, "ratio net/TJM ≈ 50 %");
});

test("barème IS : 15 % jusqu'à 42 500 €, 25 % au-delà", () => {
  assert.equal(calculerIS(0), 0);
  assert.equal(calculerIS(-5000), 0);
  assert.equal(calculerIS(42500), 6375);
  assert.equal(calculerIS(58000), 6375 + 15500 * 0.25); // = 10 250
});

test("la répartition du CA est exhaustive (les parts somment au CA)", () => {
  const r = simuler();
  const somme =
    r.netEnPoche +
    r.fraisTotal +
    r.chargesSalaire +
    r.impotSocietes +
    r.pfuDividendes +
    r.irSalaire;
  proche(somme, r.chiffreAffaires, 1, "net + frais + prélèvements = CA");
});

test("paramètres personnalisés : plus de jours, plus gros TJM, moins de frais", () => {
  const r = simuler({
    tjm: 700,
    joursIntercontrat: 0,
    semainesConges: 4,
    fraisMutuelle: 0,
    fraisPrevoyance: 500,
    fraisFormation: 500,
  });
  assert.equal(r.joursFactures, 198);
  assert.equal(r.chiffreAffaires, 138600);
  assert.ok(r.netParJourFacture > 260, "un meilleur profil dégage plus par jour");
  assert.ok(r.netEnPoche > 47000);
});

test("salaire insoutenable : pas de dividendes et alerte levée", () => {
  const r = simuler({ tjm: 200, salaireNetAnnuel: 40000 });
  assert.ok(r.resultatImposable < 0);
  assert.equal(r.beneficeDistribuable, 0);
  assert.equal(r.dividendesNets, 0);
  assert.equal(r.salaireInsoutenable, true);
});

test("cas limites : zéro jour facturé ne divise pas par zéro", () => {
  const r = simuler({ joursOuvres: 30, semainesConges: 5, joursIntercontrat: 10 });
  assert.equal(r.joursFactures, 0);
  assert.equal(r.chiffreAffaires, 0);
  assert.equal(r.netParJourFacture, 0);
  assert.equal(r.ratioNetSurCA, 0);
});
