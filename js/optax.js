/* ===================== SKŁADANIE OPISU OPTAX =====================
   Z obiektu 'wpis' składamy wieloliniowy opis jak w pliku OPTAX. */

const OPTAX = (() => {
  function krok(wiek) {
    return wiek <= 40 ? 2 : 5;
  }

  function klasaWieku(wiek) {
    // klasa I = 1–20 l, II = 21–40 l, ... (zaokrąglone w dół do pełnych 20)
    const n = Math.max(1, Math.ceil(wiek / 20));
    const rzymskie = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    return rzymskie[Math.min(n, rzymskie.length - 1)] || "XII";
  }

  function sklad(w) {
    if (!w.panujacy) return "";
    const pan = w.udzialPanujacy != null ? w.udzialPanujacy : 10 - (w.udzialDrugi || 0);
    if (w.drugi && w.udzialDrugi > 0)
      return pan + w.panujacy + ";" + w.udzialDrugi + w.drugi;
    return pan + w.panujacy;
  }

  /* pełny, wieloliniowy opis — jak w czarnej belce podglądu */
  function linie(w) {
    const out = [];
    const s = (w.siedlisko === "OJ" ? "OlJ" : w.siedlisko) || "—";
    out.push(s + "  " + (sklad(w) || "—"));
    if (w.panujacy) {
      const k = krok(w.wiekPrzec);
      out.push(w.panujacy + "/" + (w.wiekPrzec - k) + "-" + (w.wiekPrzec + k) + "/" + w.wiekPrzec + "l");
    }
    if (w.pjd && w.pjd.length) {
      const kp = krok(w.pjdWiekPrzec);
      out.push("pjd." + w.pjd.join(", ") + "/" + (w.pjdWiekPrzec - kp) + "-" +
        (w.pjdWiekPrzec + kp) + "/" + w.pjdWiekPrzec + "l");
    }
    if (w.zwarcie) out.push("zw. " + w.zwarcie);
    /* podszyt uwzględniamy gdy wskazano gatunki LUB samo pokrycie */
    if ((w.podsz && w.podsz.length) || (w.podszProc || 0) > 0) {
      const gat = (w.podsz && w.podsz.length) ? w.podsz.join(", ") + " " : "";
      out.push("Podsz.: " + gat + (w.podszProc || 0) + "% pow.");
    }
    if (w.obreby && String(w.obreby).trim()) out.push("obr. " + String(w.obreby).trim());
    const dz = Array.isArray(w.dzialki) ? w.dzialki.join(", ") : String(w.dzialki || "");
    if (dz.trim()) out.push("nr-y.Rej. " + dz.trim());
    return out;
  }

  /* jedna linia (do podglądu skróconego / wykazu) */
  function jednaLinia(w) { return linie(w).join(" "); }

  return { krok, klasaWieku, sklad, linie, jednaLinia };
})();