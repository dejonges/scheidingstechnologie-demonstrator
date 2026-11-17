# Demonstrator Scheidingstechnologie

Interactieve demonstrator voor het vak Scheidingstechnologie (KU Leuven, FIIW), met drie onderdelen:

- **Continue destillatie** (McCabe-Thiele, T-x-y, platen en energie versus reflux)
- **Batchdestillatie** (Rayleigh, constante reflux of constante topsamenstelling)
- **Absorptie en strippen** met evenwichtsplaten (H4: Kremser en McCabe-Thiele) of een gepakte kolom (H3: N<sub>Oy</sub>, H<sub>Oy</sub>, Z), verdund (x, y) of geconcentreerd (X, Y)

**Openen:** https://dejonges.github.io/scheidingstechnologie-demonstrator/

Studenten variëren reflux, boilup, relatieve vluchtigheid, voedingsdebiet en -toestand en de gewenste zuiverheid, en zien live het effect op het kolomschema, het McCabe-Thiele-diagram, het T-x-y-diagram, het aantal platen en het energieverbruik. Ideale systemen (constante α) en niet-ideale systemen (Van Laar, UNIFAC, meetgegevens) zijn beschikbaar.

## In Notion
`/embed` → plak de link hierboven. Met de knop **Link kopiëren** krijg je een link die alle instellingen bewaart (bv. per oefening).

## Structuur
- `index.html`: de volledige demonstrator in één bestand (geen server, geen externe bibliotheken; werkt ook offline).
- `src/`: broncode (`core.js` rekenkern destillatie, `extra.js` T-x-y en refluxgrafiek, `batch.js` batchdestillatie, `absorptie.js` absorptie en strippen, `ui.js` interface, `template.html` opmaak). Na een wijziging: `python3 src/build.py`.

## Veronderstellingen
Absorptie: evenwicht y* = m·x, a = top, b = bodem; verdund met L en V constant, geconcentreerd met inertstromen L′ en V′ (molverhoudingen X, Y). Nagekeken: A = 0.9 en 78.66% geabsorbeerd geeft exact 5 ideale platen (Kremser = grafisch, Oef. 4.2); bij verdunde gepakte kolommen is de integraal gelijk aan (y_b − y_a)/Δy_LM en geldt H_Ox·N_Ox = H_Oy·N_Oy.

Destillatie: Constante molaire overloop, totale condensor, reboiler = ideale trap, Murphree-dampefficiëntie op de platen, platen genummerd van boven naar beneden; de voedingsplaat is de trap die over het snijpunt van de werklijnen stapt.
