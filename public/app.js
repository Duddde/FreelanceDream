// Import relatif : la page doit fonctionner aussi bien à la racine du
// domaine que derrière un préfixe de chemin (ex. /simulateur/).
import { simuler, DEFAUTS } from "./src/simulateur.js";

const formulaire = document.getElementById("formulaire");
const barre = document.getElementById("barre");
const legende = document.getElementById("legende");
const infobulle = document.getElementById("infobulle");
const tableDetail = document.getElementById("tableDetail");
const alerte = document.getElementById("alerte");

const euros = (v) =>
  Math.round(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const pourcent = (v) =>
  (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %";

/** Segments de la barre : répartition exhaustive du CA. */
const SEGMENTS = [
  { cle: "netEnPoche", nom: "Net en poche", couleur: "var(--serie-net)" },
  { cle: "fraisTotal", nom: "Frais pro", couleur: "var(--serie-frais)" },
  { cle: "chargesSalaire", nom: "Charges sociales", couleur: "var(--serie-charges)" },
  { cle: "impotSocietes", nom: "IS", couleur: "var(--serie-is)" },
  { cle: "pfuDividendes", nom: "PFU dividendes", couleur: "var(--serie-pfu)" },
  { cle: "irSalaire", nom: "IR salaire", couleur: "var(--serie-ir)" },
];

function lireParametres() {
  const params = {};
  for (const [nom, valeur] of new FormData(formulaire)) {
    const nombre = parseFloat(valeur);
    params[nom] = Number.isFinite(nombre) ? nombre : DEFAUTS[nom];
  }
  return params;
}

function majTuiles(r) {
  document.getElementById("netParJour").textContent =
    euros(r.netParJourFacture) + " / jour";
  document.getElementById("ratioTjm").textContent =
    `soit ${pourcent(r.joursFactures > 0 ? r.netParJourFacture / r.parametres.tjm : 0)} ` +
    `de ton TJM de ${euros(r.parametres.tjm)}`;
  document.getElementById("netAnnuel").textContent = euros(r.netEnPoche);
  document.getElementById("netMensuel").textContent = euros(r.netEnPocheMensuel);
  document.getElementById("joursFactures").textContent = r.joursFactures;
  document.getElementById("caAnnuel").textContent = euros(r.chiffreAffaires);

  alerte.hidden = !r.salaireInsoutenable;
  if (r.salaireInsoutenable) {
    alerte.textContent =
      "⚠ Le coût de ton salaire dépasse ce que l'activité dégage après frais : " +
      "aucun dividende distribuable, la société est en perte. Baisse le salaire " +
      "ou augmente le TJM / les jours facturés.";
  }
}

function majBarre(r) {
  barre.innerHTML = "";
  legende.innerHTML = "";
  const total = Math.max(1, r.chiffreAffaires);

  for (const s of SEGMENTS) {
    const valeur = Math.max(0, r[s.cle]);
    const part = valeur / total;

    if (valeur > 0) {
      const div = document.createElement("div");
      div.className = "segment";
      div.style.background = s.couleur;
      div.style.flex = `${part} 1 0`;
      div.dataset.nom = s.nom;
      div.dataset.valeur = euros(valeur);
      div.dataset.part = pourcent(part);
      barre.appendChild(div);
    }

    const li = document.createElement("li");
    li.innerHTML =
      `<span class="pastille" style="background:${s.couleur}"></span>` +
      `${s.nom}&nbsp;: <span class="valeur">${euros(valeur)}</span>` +
      ` (${pourcent(part)})`;
    legende.appendChild(li);
  }
}

function majTable(r) {
  const p = r.parametres;
  const lignes = [
    ["section", "1 · Jours réellement facturés"],
    ["", "Jours ouvrés théoriques", `${p.joursOuvres} j`],
    ["", `Congés (${p.semainesConges} semaines)`, `− ${r.joursConges} j`],
    ["", "Intercontrat", `− ${p.joursIntercontrat} j`],
    ["total", "Jours facturés", `${r.joursFactures} j`],
    ["section", "2 · Chiffre d'affaires et frais"],
    ["", `CA : ${euros(p.tjm)} × ${r.joursFactures} j`, euros(r.chiffreAffaires)],
    ["", "Frais professionnels", "− " + euros(r.fraisTotal)],
    ["total", "Résultat avant rémunération", euros(r.resultatAvantRemuneration)],
    ["section", "3 · Salaire et impôt société"],
    ["", `Coût total du salaire (net ${euros(p.salaireNetAnnuel)} + charges)`, "− " + euros(r.coutSalaire)],
    ["", "Résultat imposable", euros(r.resultatImposable)],
    ["", "IS (15 % ≤ 42 500 €, puis 25 %)", "− " + euros(r.impotSocietes)],
    ["total", "Bénéfice distribuable", euros(r.beneficeDistribuable)],
    ["section", "4 · Net-en-poche"],
    ["", `Salaire net après IR (${p.tauxIrSalaire.toLocaleString("fr-FR")} %)`, euros(r.salaireNetApresIR)],
    ["", `Dividendes nets après PFU (${p.tauxPfu.toLocaleString("fr-FR")} %)`, euros(r.dividendesNets)],
    ["total", "Net-en-poche annuel", euros(r.netEnPoche)],
    ["total", "Par jour facturé", euros(r.netParJourFacture)],
  ];

  tableDetail.innerHTML = lignes
    .map(([classe, libelle, valeur]) =>
      classe === "section"
        ? `<tr class="section"><td colspan="2">${libelle}</td></tr>`
        : `<tr class="${classe}"><td>${libelle}</td><td>${valeur}</td></tr>`
    )
    .join("");
}

function recalculer() {
  const r = simuler(lireParametres());
  majTuiles(r);
  majBarre(r);
  majTable(r);
}

/* Infobulle au survol des segments */
barre.addEventListener("pointermove", (e) => {
  const segment = e.target.closest(".segment");
  if (!segment) {
    infobulle.hidden = true;
    return;
  }
  infobulle.innerHTML =
    `<strong>${segment.dataset.nom}</strong>` +
    `<span>${segment.dataset.valeur} · ${segment.dataset.part} du CA</span>`;
  infobulle.hidden = false;
  const cadre = barre.parentElement.getBoundingClientRect();
  const x = Math.min(e.clientX - cadre.left + 12, cadre.width - infobulle.offsetWidth - 8);
  infobulle.style.left = `${Math.max(8, x)}px`;
  infobulle.style.top = `${e.clientY - cadre.top - infobulle.offsetHeight - 10}px`;
});
barre.addEventListener("pointerleave", () => (infobulle.hidden = true));

document.getElementById("reinitialiser").addEventListener("click", () => {
  for (const [nom, valeur] of Object.entries(DEFAUTS)) {
    const champ = formulaire.elements[nom];
    if (champ) champ.value = valeur;
  }
  recalculer();
});

formulaire.addEventListener("input", recalculer);
recalculer();
