# Attribution

**Last updated:** 2026-07-10

This file records provenance and attribution notes for bundled module content and assets.

## Contents

- [Book Journal Sources](#book-journal-sources)
- [Starship Art](#starship-art)
- [HGTTG Species Art](#hgttg-species-art)
- [Related upstream licenses](#related-upstream-licenses)

---

## Book Journal Sources

The PHB, Expanded Content, and Wretched Hives journal compendia in this module are generated from upstream SW5e parser source text.

### Upstream Source

- Repository: [sangheili868/StarWars5e.Core](https://github.com/sangheili868/StarWars5e.Core)
- Path: `StarWars5e.Parser/Sources/en`
- Files: PHB (`PHB/phb_*.txt`), Expanded Content (`ec_*.txt`), Wretched Hives (`WH/wh_*.txt`)

### Generation

- Importer: `utils/import-books-journals.mjs`
- Default local source checkout: `.book-sources/` (not committed; obtain via sparse clone or `--source-dir`)
- Generated output: `packs/_source/phb-journals/`, `packs/_source/expanded-content-journals/`, `packs/_source/wretched-hives-journals/`

### Licensing Note

Book text is community SW5e reference material. Before redistributing modified or full-text journal exports outside this module's intended distribution channel, confirm upstream and SW5e community licensing expectations for your release.

---

## Starship Art


### Bundled starship artwork

Drake's Shipyard and related starship actor/token images under `icons/packs/Starship/` are **bundled module assets** shipped with `sw5e-module`. Sheet portraits restored in Phase 1 (2026-06-24) reference existing local `*.Token.webp` files already used for prototype tokens.

### Provenance

- Starship token and avatar WebP files in `icons/packs/Starship/` were carried forward from the legacy SW5E Foundry system release artifacts into this module's asset tree.
- **Maintainers should confirm and document original art sources, creators, and license terms** before treating this artwork as fully cleared for redistribution beyond the module's existing distribution model.
- This file does **not** assert third-party copyright clearance. It records that restoration uses **only local bundled paths**, not re-hosted external URLs.

### What is not restored

The following external portrait hotlinks are **intentionally not** used in compendium source data:

- Fandom / Wikia (`static.wikia.nocookie.net`, etc.)
- imgur and other third-party image hosts
- ArtStation hotlinks

Phase 1 restoration wires blank or imgur `img` fields to local `modules/sw5e-module/icons/packs/Starship/{slug}.Token.webp` when that file exists in the repository.

### Maintainer follow-up

- [ ] Confirm starship art provenance and add credited sources where known
- [ ] Add dedicated `*.Avatar.webp` portraits where distinct sheet art is available and approved

---

## HGTTG Species Art

<!-- BEGIN:HGTTG-SPECIES-ART -->

HGTTG species art is extracted from the provided Heretic's Guide to the Galaxy PDF source document.

Generated: 2026-04-27T20:43:11.705Z
PDF: Heretic's Guide to the Galaxy (local maintainer source; not committed)
### PDF-Sourced Images

#### Abednedo

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/abednedo.png`
- PDF page: 3
- Extraction confidence: high

#### Adarian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/adarian.png`
- PDF page: 4
- Extraction confidence: high

#### Askajian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/askajian.png`
- PDF page: 5
- Extraction confidence: high

#### Avogwi

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/avogwi.png`
- PDF page: 6
- Extraction confidence: high

#### Bardottan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/bardottan.png`
- PDF page: 7
- Extraction confidence: high

#### Belugan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/belugan.png`
- PDF page: 8
- Extraction confidence: high

#### Bimm

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/bimm.png`
- PDF page: 9
- Extraction confidence: high

#### Bivall

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/bivall.png`
- PDF page: 10
- Extraction confidence: high

#### Blarina

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/blarina.png`
- PDF page: 11
- Extraction confidence: high

#### Bravaisian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/bravaisian.png`
- PDF page: 12
- Extraction confidence: high

#### Calibop

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/calibop.png`
- PDF page: 13
- Extraction confidence: high

#### Chalactan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/chalactan.png`
- PDF page: 14
- Extraction confidence: high

#### Charon

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/charon.png`
- PDF page: 15
- Extraction confidence: high

#### Chev

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/chev.png`
- PDF page: 16
- Extraction confidence: high

#### Chistori

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/chistori.png`
- PDF page: 17
- Extraction confidence: high

#### Columi

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/columi.png`
- PDF page: 18
- Extraction confidence: high

#### Cosian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/cosian.png`
- PDF page: 19
- Extraction confidence: high

#### Coway

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/coway.png`
- PDF page: 20
- Extraction confidence: high

#### Cragmoloid

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/cragmoloid.png`
- PDF page: 21
- Extraction confidence: high

#### Cyclorrian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/cyclorrian.png`
- PDF page: 22
- Extraction confidence: high

#### Dantari

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/dantari.png`
- PDF page: 23
- Extraction confidence: high

#### Devlikk

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/devlikk.png`
- PDF page: 24
- Extraction confidence: high

#### Drabatan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/drabatan.png`
- PDF page: 25
- Extraction confidence: high

#### Drall

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/drall.png`
- PDF page: 26
- Extraction confidence: high

#### Dressellian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/dressellian.png`
- PDF page: 27
- Extraction confidence: high

#### Dulok

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/dulok.png`
- PDF page: 28
- Extraction confidence: high

#### Dybrinthe

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/dybrinthe.png`
- PDF page: 29
- Extraction confidence: high

#### Ebruchi

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/ebruchi.png`
- PDF page: 30
- Extraction confidence: high

#### Elom

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/elom.png`
- PDF page: 31
- Extraction confidence: high

#### Elomin

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/elomin.png`
- PDF page: 32
- Extraction confidence: high

#### Em'liy

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/em-liy.png`
- PDF page: 33
- Extraction confidence: high

#### Epicanthix

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/epicanthix.png`
- PDF page: 34
- Extraction confidence: high

#### Farfallan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/farfallan.png`
- PDF page: 35
- Extraction confidence: high

#### Farghul

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/farghul.png`
- PDF page: 36
- Extraction confidence: high

#### Feeorin

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/feeorin.png`
- PDF page: 37
- Extraction confidence: high

#### Firrerreo

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/firrerreo.png`
- PDF page: 38
- Extraction confidence: high

#### Fosh

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/fosh.png`
- PDF page: 39
- Extraction confidence: high

#### Frozian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/frozian.png`
- PDF page: 40
- Extraction confidence: high

#### Gigoran

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/gigoran.png`
- PDF page: 41
- Extraction confidence: high

#### Gossam

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/gossam.png`
- PDF page: 42
- Extraction confidence: high

#### Gree

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/gree.png`
- PDF page: 43
- Extraction confidence: high

#### Hassk

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/hassk.png`
- PDF page: 44
- Extraction confidence: high

#### Hiromi

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/hiromi.png`
- PDF page: 45
- Extraction confidence: high

#### H'nemthe

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/h-nemthe.png`
- PDF page: 46
- Extraction confidence: high

#### Holwuff

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/holwuff.png`
- PDF page: 47
- Extraction confidence: high

#### Iakaru

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/iakaru.png`
- PDF page: 48
- Extraction confidence: high

#### Iotran

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/iotran.png`
- PDF page: 49
- Extraction confidence: high

#### Ishi Tib

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/ishi-tib.png`
- PDF page: 50
- Extraction confidence: high

#### Kerestian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/kerestian.png`
- PDF page: 51
- Extraction confidence: high

#### Kerkoiden

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/kerkoiden.png`
- PDF page: 52
- Extraction confidence: high

#### Kessurian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/kessurian.png`
- PDF page: 54
- Extraction confidence: high

#### Khil

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/khil.png`
- PDF page: 55
- Extraction confidence: high

#### Kian'thar

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/kian-thar.png`
- PDF page: 56
- Extraction confidence: high

#### Kitonak

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/kitonak.png`
- PDF page: 57
- Extraction confidence: high

#### Kobok

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/kobok.png`
- PDF page: 58
- Extraction confidence: high

#### Koorivar

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/koorivar.png`
- PDF page: 59
- Extraction confidence: high

#### Kowakian Monkey-Lizard

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/kowakian-monkey-lizard.png`
- PDF page: 60
- Extraction confidence: high

#### Krevaaki

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/krevaaki.png`
- PDF page: 61
- Extraction confidence: high

#### Krish

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/krish.png`
- PDF page: 62
- Extraction confidence: high

#### Lamproid

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/lamproid.png`
- PDF page: 63
- Extraction confidence: high

#### Lepi

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/lepi.png`
- PDF page: 64
- Extraction confidence: high

#### Lorrdian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/lorrdian.png`
- PDF page: 65
- Extraction confidence: high

#### Lutrillian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/lutrillian.png`
- PDF page: 66
- Extraction confidence: high

#### Melitto

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/melitto.png`
- PDF page: 67
- Extraction confidence: high

#### Morseerian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/morseerian.png`
- PDF page: 68
- Extraction confidence: high

#### Mrlssi

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/mrlssi.png`
- PDF page: 69
- Extraction confidence: high

#### Myneyrsh

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/myneyrsh.png`
- PDF page: 70
- Extraction confidence: high

#### Nagai

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/nagai.png`
- PDF page: 71
- Extraction confidence: high

#### Nazzar

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/nazzar.png`
- PDF page: 72
- Extraction confidence: high

#### Nimbanel

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/nimbanel.png`
- PDF page: 73
- Extraction confidence: high

#### Noehon

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/noehon.png`
- PDF page: 74
- Extraction confidence: high

#### Nosaurian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/nosaurian.png`
- PDF page: 75
- Extraction confidence: high

#### Nuiwit

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/nuiwit.png`
- PDF page: 76
- Extraction confidence: high

#### Ongree

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/ongree.png`
- PDF page: 77
- Extraction confidence: high

#### Pacithhip

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/pacithhip.png`
- PDF page: 78
- Extraction confidence: high

#### Parwan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/parwan.png`
- PDF page: 79
- Extraction confidence: high

#### Patitite

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/patitite.png`
- PDF page: 80
- Extraction confidence: high

#### Polis Massan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/polis-massan.png`
- PDF page: 81
- Extraction confidence: high

#### Ranat

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/ranat.png`
- PDF page: 82
- Extraction confidence: high

#### Revwien

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/revwien.png`
- PDF page: 83
- Extraction confidence: high

#### Ruurian, Larvae

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/ruurian-larvae.png`
- PDF page: 84
- Extraction confidence: high

#### Rybet

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/rybet.png`
- PDF page: 85
- Extraction confidence: high

#### Sakiyan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/sakiyan.png`
- PDF page: 86
- Extraction confidence: high

#### Sanyassan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/sanyassan.png`
- PDF page: 87
- Extraction confidence: high

#### Sarkan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/sarkan.png`
- PDF page: 88
- Extraction confidence: high

#### Sathari

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/sathari.png`
- PDF page: 89
- Extraction confidence: high

#### Sephi

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/sephi.png`
- PDF page: 90
- Extraction confidence: high

#### Shawda Ubb

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/shawda-ubb.png`
- PDF page: 91
- Extraction confidence: high

#### Siniteen

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/siniteen.png`
- PDF page: 92
- Extraction confidence: high

#### Skakoan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/skakoan.png`
- PDF page: 93
- Extraction confidence: high

#### Skel

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/skel.png`
- PDF page: 94
- Extraction confidence: high

#### S'kytri

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/s-kytri.png`
- PDF page: 95
- Extraction confidence: high

#### Skrilling

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/skrilling.png`
- PDF page: 96
- Extraction confidence: high

#### Sluissi

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/sluissi.png`
- PDF page: 97
- Extraction confidence: high

#### Snivvian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/snivvian.png`
- PDF page: 98
- Extraction confidence: high

#### Swokes Swokes

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/swokes-swokes.png`
- PDF page: 99
- Extraction confidence: high

#### Sylphe

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/sylphe.png`
- PDF page: 100
- Extraction confidence: high

#### Talortai

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/talortai.png`
- PDF page: 101
- Extraction confidence: high

#### Talpini

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/talpini.png`
- PDF page: 102
- Extraction confidence: high

#### Teedo

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/teedo.png`
- PDF page: 103
- Extraction confidence: high

#### Teek

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/teek.png`
- PDF page: 104
- Extraction confidence: high

#### Terrelian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/terrelian.png`
- PDF page: 105
- Extraction confidence: high

#### Thakwaash

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/thakwaash.png`
- PDF page: 106
- Extraction confidence: high

#### Tholothian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/tholothian.png`
- PDF page: 107
- Extraction confidence: high

#### Tof

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/tof.png`
- PDF page: 108
- Extraction confidence: high

#### Toong

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/toong.png`
- PDF page: 109
- Extraction confidence: high

#### Trianii

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/trianii.png`
- PDF page: 110
- Extraction confidence: high

#### T'surr

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/t-surr.png`
- PDF page: 111
- Extraction confidence: high

#### Tynnan

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/tynnan.png`
- PDF page: 112
- Extraction confidence: high

#### Ubese

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/ubese.png`
- PDF page: 113
- Extraction confidence: high

#### Utai

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/utai.png`
- PDF page: 114
- Extraction confidence: high

#### Vagaari

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/vagaari.png`
- PDF page: 115
- Extraction confidence: high

#### Vahla

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/vahla.png`
- PDF page: 116
- Extraction confidence: high

#### Vodran

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/vodran.png`
- PDF page: 117
- Extraction confidence: high

#### Vor

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/vor.png`
- PDF page: 118
- Extraction confidence: high

#### Vratix

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/vratix.png`
- PDF page: 119
- Extraction confidence: high

#### Vulptereen

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/vulptereen.png`
- PDF page: 120
- Extraction confidence: high

#### Vuvrian

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/vuvrian.png`
- PDF page: 121
- Extraction confidence: high

#### Whiphid

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/whiphid.png`
- PDF page: 122
- Extraction confidence: high

#### Woostoid

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/woostoid.png`
- PDF page: 123
- Extraction confidence: high

#### Xamster

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/xamster.png`
- PDF page: 125
- Extraction confidence: high

#### Yam'rii

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/yam-rii.png`
- PDF page: 126
- Extraction confidence: high

#### Yarkora

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/yarkora.png`
- PDF page: 127
- Extraction confidence: high

#### Yinchorri

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/yinchorri.png`
- PDF page: 128
- Extraction confidence: high

#### Yuzzum

- Local file: `modules/sw5e-module/icons/packs/Species/hgttg/yuzzum.png`
- PDF page: 129
- Extraction confidence: high

<!-- END:HGTTG-SPECIES-ART -->

---

## Related upstream licenses

- Game icon SVGs (legacy system): see upstream `static/icons/LICENSE` in the `sw5e` repository
