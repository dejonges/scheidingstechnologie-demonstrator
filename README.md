# Demonstrator Scheidingstechnologie

Interactieve McCabe-Thiele-demonstrator voor binaire destillatie, gemaakt voor het vak Scheidingstechnologie (KU Leuven, FIIW).

**Openen:** https://dejonges.github.io/scheidingstechnologie-demonstrator/

Studenten variëren reflux, boilup, relatieve vluchtigheid, voedingsdebiet en -toestand en de gewenste zuiverheid, en zien live het effect op het kolomschema, het McCabe-Thiele-diagram, het T-x-y-diagram, het aantal platen en het energieverbruik. Ideale systemen (constante α) en niet-ideale systemen (Van Laar, UNIFAC, meetgegevens) zijn beschikbaar.

## In Notion
`/embed` → plak de link hierboven. Met de knop **Link kopiëren** krijg je een link die alle instellingen bewaart (bv. per oefening).

## Structuur
- `index.html`: de volledige demonstrator in één bestand (geen server, geen externe bibliotheken; werkt ook offline).
- `src/`: broncode (`core.js` rekenkern, `extra.js` T-x-y en refluxgrafiek, `ui.js` interface, `template.html` opmaak). Na een wijziging: `python3 src/build.py`.

## Veronderstellingen
Constante molaire overloop, totale condensor, reboiler = ideale trap, Murphree-dampefficiëntie op de platen, platen genummerd van boven naar beneden; de voedingsplaat is de trap die over het snijpunt van de werklijnen stapt.
