# KanalCalc — proračun pada pritiska u kanalima

Desktop aplikacija (Windows) za proračun i dimenzionisanje kanalske mreže ventilacije i klimatizacije.

## Kako se radi

1. Iz palete (lijevo) prevuci **klima komoru** na radnu površinu.
2. Na **„+“** koji se pojavi prevuci sljedeći element: kanal, koljeno, odvojak (T), lastin rep, oprema, difuzor…
   Umjesto prevlačenja možeš kliknuti na „+“ i izabrati element iz menija.
3. Račve daju dva „+“ (prolaz i ogranak, odnosno dva kraka lastinog repa), pa se sistem grana dalje.
4. Na distributivne elemente unesi **protok** i **kataloški Δp**. Program sabira protoke do klima komore.
5. Program **dimenzioniše kanale** izabranom metodom (jednako trenje ili brzine po zonama) i
   **predlaže suženja** iza odvojaka kada stari presjek izađe iz granica metode. Prijedlozi se prihvataju jednim klikom.
6. Rezultat: potreban pritisak po kritičnoj dionici, balansiranje grana, tabela proračuna po dionicama.

Malim „+“ na sredini linije ubacuješ element između dva postojeća (npr. koljeno u postojeći kanal).
Dovod i odsis su odvojeni sistemi (kartice gore); u odsisu se koriste konvergentne račve i prelazi u smjeru strujanja.

## Metode i podaci

- **Trenje:** Darcy–Weisbach, λ po Colebrooku; pravougaoni kanal preko hidrauličkog prečnika Dh = 2ab/(a+b).
- **Lokalni otpori:** ASHRAE Duct Fitting Database (ASHRAE Handbook — Fundamentals) i SMACNA za dio račvi —
  87 elemenata (ulazi, izlazi, koljena, prelazi, račve, klapne, prepreke), sa ispravkama štamparskih grešaka iz izvora.
- **Jednako trenje:** najmanji standardni presjek sa R ≤ R_cilj i v ≤ v_max (glavni / ogranak / priključak).
  Presjek se zadržava iza odvojka dok je R ≥ R_min; kad padne ispod, predlaže se suženje.
- **Brzine po zonama:** najmanji presjek sa v ≤ v_cilj; presjek se zadržava dok je v ≥ udio · v_cilj.
- **Standardni prečnici:** 14 preporučenih po EN 1506 (63…1250) + 150 i 300; lista se mijenja u podešavanjima.
- **Suženje pravougaonog kanala:** jednostrani (ASHRAE 4-3, gornja strana ravna), simetrični (4-2) ili piramidalni (4-4).
- **Balansiranje:** višak pritiska svake grane u odnosu na kritičnu dionicu; ako u grani postoji regulaciona klapna,
  računa se potreban ugao zatvaranja.

Idelčik (*Handbook of Hydraulic Resistance*, 1960, prevod AEC-tr-6630) se dodaje kao druga biblioteka u sljedećoj fazi.

## Razvoj

```bash
npm install
npm run dev          # web pregled na http://localhost:5173
npm test             # testovi računskog jezgra
npm run typecheck
npm run build:single # jedan HTML fajl (dist-single/index.html)
npx tauri dev        # desktop prozor (potreban Rust)
npx tauri build      # Windows instalacija (na Windowsu)
```

Windows instalaciju (`.exe`) automatski gradi GitHub Actions (`.github/workflows/kanalcalc.yml`) pri svakom pushu;
gotov fajl je u artefaktu **KanalCalc-Windows** na stranici izvršavanja workflowa.

## Struktura

| Putanja | Sadržaj |
|---|---|
| `src/core/ashrae/library.js` | ASHRAE/SMACNA tabele i interpolacija |
| `src/core/engine.ts` | protoci, dionice, dimenzionisanje, prijedlozi suženja, Δp, kritična dionica, balansiranje |
| `src/core/table.ts` | tabela proračuna po dionicama |
| `src/core/engine.test.ts` | kontrolne tačke iz tabela i provjere proračuna |
| `src/ui/` | paleta, šema (React Flow), svojstva, panel sistema, tabela |
| `src-tauri/` | Windows omotač (Tauri 2) |

## Plan

1. ✅ Unos mreže, protoci, dimenzionisanje, prijedlozi suženja, Δp po ASHRAE, kritična dionica, balansiranje, SR/EN
2. Idelčik — sekcija V (difuzori i prelazi), pa III, IV, VI, VII, XI; poređenje sa ASHRAE po elementu
3. Izvještaj (PDF, Excel), specifikacija materijala (m² lima, fitinzi) za predmjer
4. Static regain, akustika, uvoz iz Revita/AutoCAD-a
