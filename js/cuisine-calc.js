/* Calculs purs de l'outil repas (sans accès au navigateur : testables seuls). */

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// Arrondi à l'achat : au multiple supérieur pratique
export function arrondir(unite, q) {
  if (unite === "pc") return Math.ceil(q - 1e-9);
  if (q < 100) return Math.ceil(q / 5 - 1e-9) * 5;
  if (q < 1000) return Math.ceil(q / 10 - 1e-9) * 10;
  return Math.ceil(q / 50 - 1e-9) * 50;
}

export function formater(unite, q) {
  if (unite === "pc") return nf.format(q);
  if (unite === "g") return q >= 1000 ? `${nf.format(q / 1000)} kg` : `${nf.format(q)} g`;
  return q >= 1000 ? `${nf.format(q / 1000)} L` : `${nf.format(q)} ml`;
}

// g et ml : prix au kilo / au litre ; pc : prix à la pièce
export function coutLigne(unite, qteArrondie, prix) {
  return unite === "pc" ? qteArrondie * prix : (qteArrondie / 1000) * prix;
}

// Quantités brutes fusionnées de plusieurs recettes : { clé: quantité }
export function agregerCourses(recettes, facteur, ingredients) {
  const brut = {};
  for (const r of recettes) {
    for (const [k, q] of r.lignes) {
      if (!ingredients[k]) continue;
      brut[k] = (brut[k] || 0) + q * facteur;
    }
  }
  return brut;
}
