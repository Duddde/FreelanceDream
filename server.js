/**
 * Serveur statique minimal (aucune dépendance) pour le simulateur.
 * Sert public/ à la racine et expose src/ pour le module de calcul
 * partagé entre Node et le navigateur.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 3000;

const TYPES_MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let chemin = normalize(decodeURIComponent(url.pathname)).replace(
    /^(\.\.[/\\])+/,
    ""
  );
  if (chemin === "/" || chemin === "") chemin = "/index.html";

  // Seuls public/ et src/ sont servis.
  const fichier = chemin.startsWith("/src/")
    ? join(RACINE, chemin)
    : join(RACINE, "public", chemin);

  if (!fichier.startsWith(RACINE)) {
    res.writeHead(403).end("Accès refusé");
    return;
  }

  try {
    const contenu = await readFile(fichier);
    res.writeHead(200, {
      "Content-Type": TYPES_MIME[extname(fichier)] || "application/octet-stream",
    });
    res.end(contenu);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Introuvable");
  }
});

serveur.listen(PORT, () => {
  console.log(`Simulateur disponible sur http://localhost:${PORT}`);
});
