# Sources and Further Reading

The bibliography, per-dish provenance, and research trail behind the content in `data/`. Design conclusions drawn from this material live in `docs/DESIGN.md`; the short user-facing source list lives in the Historical mode modal on the page itself. This file is the long-form record.

## Historical mode: core reading (northwest Europe)

- *The Time Traveler's Guide to Medieval England*, Ian Mortimer.
- *The English Alehouse: A Social History 1200-1830*, Peter Clark.
- The r/AskFoodHistorians audit. Jim Chevallier, food historian, supplied the itemized 1338 and 1451 inn accounts behind the price model, the "roasts and pies" correction to the one-pot tavern picture, the Trois Dames poem, the fast-day detail behind the fish-day mechanic, and the 1718 "menu" etymology; his quotes were largely drawn from his book *A History of the Food of Paris* (Rowman & Littlefield, 2018). u/iuabv pointed at further sources and errors.

## The arid dish corpus

Provenance for the 51 arid dishes merged into `data/authored_dishes.json` (find them by their `_comment` source notes, or by `biomes: ["arid"]`). This pack closed the research round once flagged in DESIGN.md as "the arid biome's historical layer is thin": caravanserai and cookshop fare, mukhallalat pickles, and the non-alcoholic syrup-drink culture, drawn from the medieval Islamic culinary corpus.

### Source texts

| Code | Text | Edition consulted |
|------|------|-------------------|
| S&F | *Kitab al-Wusla ila l-habib* (13th c. Syria, anonymous) | *Scents and Flavors: A Syrian Cookbook*, trans. Charles Perry, NYU Press / Library of Arabic Literature, 2017 |
| Z | Anthology of the tradition | Lilia Zaouali, *Medieval Cuisine of the Islamic World*, trans. DeBevoise, UC Press, 2007. Her recipe numbers carry source codes: [S] = al-Warraq, 10th c. Baghdad; [K] = *Kanz al-Fawa'id*, 14th c. Egypt; [R] = Ibn Razin al-Tujibi, 13th c. al-Andalus/Tunis; [W] = the Wusla itself |

Note the overlap: Zaouali's [W] recipes and Scents and Flavors translate the same Syrian text. Where a dish appears in both, the S&F chapter is the fuller witness.

Chapter map for S&F citations: ch. 2 beverages, ch. 6 sautés (kebabs, eggplant, greens), ch. 7 sweets and baked goods (decimal numbers like 7.82 are the edition's recipe numbers), ch. 8 pickles.

### Provenance table

| id | Historical name | Source | Locator |
|----|-----------------|--------|---------|
| harisa-porridge | harisa | Z [S] | pp. 20, 42 (cookshop context) |
| plain-tharid | tharid | Z no. 10 [S]; crumbing method in no. 11 headnote [R] | Bread and Broth ch. |
| truffle-tharid | shashiyyat Ibn al-Rafi | Z no. 11 [R] | Bread and Broth ch. |
| mujaddara-lentils | mujaddara | Z | p. 42 |
| qamhiyya-wheat | qamhiyya | Z no. 87 [W] | Soups ch. |
| broth-noodles | itriya / nabatiyya | Z nos. 89–97 [R][K][S] | Pasta ch. |
| classic-couscous | kuskusu | Z no. 98 [R] | Couscous ch. |
| walnut-couscous | couscous with walnuts | Z no. 99 [R] | Couscous ch. |
| bedouin-spit-lamb | Bedouin roast | S&F ch. 6 | kebab section, "a Bedouin specialty" |
| sumac-skewer-kebab | Egyptian kebab + sumac crumbs | S&F ch. 6 | kebab section; crumb stuffing "with sumac" |
| vinegar-braised-lamb | sikbaj | Z no. 15 headnote | Sweet-and-Sour ch. |
| eggplant-meatball-sour | sikbaj with eggplant; cf. kibritiyya | Z nos. 15 [K], 42 [W] |  |
| zirbaj-almond-chicken | zirbaj / zirbajiyya | Z nos. 19 [W], 20 [R] |  |
| rutabiyya-date-lamb | rutabiyya | Z no. 26 [W] | rutab = fresh-ripe dates |
| pomegranate-meatballs | rummaniyya | Z no. 16 [K] |  |
| mulukhiyya-greens | mulukhiyya | Z no. 47 [K] (meatless no. 48); S&F ch. 6 | four types in S&F |
| buraniyya-eggplant | buraniyya | S&F ch. 6 | first of eight eggplant types |
| stuffed-eggplant-lamb | mahshi eggplant | S&F ch. 6 sixth type; Z no. 44 [W] |  |
| mufalfal-rice-lamb | mufalfal rice | Z no. 105 [W] | Rice ch. |
| labaniyya-yogurt-lamb | labaniyya | Z no. 39 [W] |  |
| limuniyya-lemon-fish | limuniyya | Z no. 50 [K] | Fish ch. |
| sanbusak-pastries | sanbusak | S&F ch. 6 and ch. 7 | four recipes |
| grilled-liver-sausages | laqaniq (liver) | Z no. 32 [S] | "in the manner of Caliph al-Mu'tamid" |
| chickpea-spice-puree |  | Z no. 6 [K] | Cold Appetizers ch. |
| fava-sour-hazelnut |  | Z no. 7 [K] | Cold Appetizers ch. |
| eggplant-yogurt-puree |  | Z no. 8 [K] | Cold Appetizers ch. |
| carrot-sesame-paste |  | Z no. 9 [K] | Cold Appetizers ch. |
| cold-herb-chicken | barida | Z no. 1 [S] | attributed to al-Ma'mun's lost book |
| thyme-olives |  | Z no. 5 [S] | Cold Appetizers ch. |
| turnip-pickles | mukhallal lift | S&F ch. 8 | nine variants, first pickle type |
| preserved-lemons | salted lemons | S&F ch. 8 | third pickle type |
| vinegar-pickled-onions |  | S&F ch. 8 | twelfth pickle type, three variations |
| sumac-capers |  | S&F ch. 8 | sixth pickle type |
| pickled-stuffed-eggplant |  | S&F ch. 8 | second pickle type, stuffed kinds |
| pickled-roses |  | S&F ch. 8 | sixteenth pickle type |
| village-fish-paste | "village fish paste" | S&F ch. 8 | seventeenth type, mock fish paste |
| kamakh-crock | kamakh | Z no. 139 [K] | Zaouali likens the family to blue cheese |
| locust-sahna | locust sahna | Z no. 140 [S] | Condiments ch. |
| honeyed-dates |  | S&F ch. 7 supplement |  |
| almond-stuffed-dates |  | S&F ch. 7 supplement | "Stuffed dates" |
| date-halwa | halwa' tamriyyah | S&F 7.58 |  |
| mamuniyya-pudding | ma'muniyya | S&F ch. 7 | fifth kind, three recipes |
| zulabiyya-fritters | zulabiyya mushabbaka | Z no. 120 [S] |  |
| judges-morsels | luqam al-qadi | S&F 7.82 | historical name kept |
| traveler-basisa | basisa / qawut | S&F 7.92, 7.94 | travel provisions |
| candied-citron-peel |  | Z no. 125 [K] |  |
| quince-oxymel | quince sikanjubin | Z no. 123 [K] | sekanjabin family |
| subiyya-brew | subiyyah | S&F 2.1 | "Yemeni subiyyah"; very low ferment |
| apricot-cordial |  | S&F ch. 2 | sweet-kerneled apricot drink |
| pomegranate-draught | habb rumman drinks | S&F ch. 2 | two pomegranate preparations |
| lemon-sugar-sherbet |  | S&F ch. 2 | "Sugar and lemon drink" |

### Editorial decisions on the data

Tier assignment is editorial, not sourced. The books record elite kitchens; tier placement follows the social-context evidence instead: harisa, tharid, mujaddara, subiyya and basisa are attested as cookshop, street, and travel food and sit at tier 1 (a few with tier_max 2 to keep them off fine tables), while saffron, sugar, almond and candied dishes carry tier_min 2–3 on ingredient cost. Sugar-sweetened items price above honey-sweetened ones for the same reason.

Seasonality is inferred: fresh dates and pomegranate in autumn, desert truffles after spring rains, eggplant and mulukhiyya in summer, citrus and pickles carrying winter. Preserved goods run all-seasons.

All entries carry the existing `mediterranean` cuisine tag for consistency with the current arid pool. Peculiar-tagged entries (locust relish, village fish paste, kamakh, pickled roses) are all historically attested, unlike the invented beetle grubs; the sourcing makes them sturdier, not weirder.

Alcohol policy: the pack adds no alcoholic drinks. The tradition's own ambivalence (the wine recipes sit awkwardly in the sources) is already represented by the existing date-wine entry; subiyya is included as the barely fermented street-drink middle ground.

Flavor lines are original text written for this pack, safe to ship under the repo's CC-BY-SA data license. Historical dish names and ingredient compositions are facts and carry no license burden; do not paste translation prose from either book into the data files.

## The evidence behind arid establishment naming

Why the arid inn-name grammar shifted from English tavern signs to genitive, institution-led names. The shipped behavior (biome-keyed designators, the genitive pattern, per-biome weights) is documented in DESIGN.md's "Inn names" section and lives in `data/inn_names.json`; this section records the evidence it rests on.

### What the two source books actually attest

The cookbooks are elite household manuals and never describe a hostelry. But they document two things a name generator can use.

**The naming grammar of the culture.** Prestige naming in both books is genitive and personal: dishes are named for the patron they were made for or the place they came from, never for a painted device.

- Patron-genitive: buraniyya (for Buran, bride of Caliph al-Ma'mun), ma'muniyya (al-Ma'mun), nasiriyya ("made in the house of al-Malik al-Nasir", S&F ch. 7), incense "made for Ibn Barmak" (S&F ch. 1), the Georgian kebab the Wusla author made for his uncle al-Malik al-Ashraf (S&F ch. 6), the ka'k of al-Hafiziyya, "maidservant of al-Malik al-'Adil" (S&F ch. 7).
- Place-nisba: Egyptian kebab, Frankish roast, Monk's Roast, Mosul kata, Basra-style basisah (S&F); Toledo-style mujabbana, Yemeni subiyyah, Persian and Greek turnip pickles (S&F ch. 8; Zaouali no. 73).

**The commercial texture around food.** Zaouali: harisa sold as cookshop and stall food (pp. 20, 42); the shops of the attarin, the spice-and-perfume sellers (ch. 2); pastry shops and nut vendors emptying out during Ramadan; hisba market codes setting prices for foodstuffs "sold in urban markets to innkeepers and private hosts"; Ibn Battuta's description of a Muslim quarter as mosque, inn, and bazaar. S&F 6.125 waves off the first lentil recipe because "market folk and the bulk of people" already cook it: direct evidence of a common-cookery layer beneath the book. The muruj/murawwaj manuscript dispute (Zaouali, fish ch., trans. note) even hinges on whether a dish name meant "sold ready-made in the souk."

### The general-history layer (not from these books, flagged as such)

Establishment typology of the medieval Islamic world: the **funduq** (urban merchant hostel), **khan** (urban or road inn), **caravanserai** (Persian karwansaray, the fortified road inn at day-march intervals), **manzil** (stage/stopping place), **wikala** (the Cairo term), **ribat** (fortified hostel). Verified real names show the grammar consistently: Khan al-Sabun (Soap Khan, Aleppo), Khan al-Harir (Silk Khan, Damascus), Khan al-Wazir (of the Vizier, Aleppo), Khan al-Tujjar (of the Merchants, Nablus and Galilee), Khan al-Umdan (of the Columns, Acre), Khan Sulayman Pasha and Khan As'ad Pasha (patron names, Damascus). The pattern: **[type] + genitive of commodity / trade-guild / patron / architectural feature**. Caveat: these surviving named buildings are Mamluk and Ottoman (15th–18th c.), later than the 13th-century cookbooks; the institutions themselves are attested throughout the medieval period, and the genitive grammar matches the dish-naming grammar the cookbooks do attest.

Also worth knowing: painted signboards are the English tradition the engine models. Khans were identified by name, gate, and reputation. The `sign` field survives in arid as a carved motif over the gate arch rather than a hung board; the UI tooltip says so.

### Verification note

The cookbook evidence above draws only on the two translated sources in the arid corpus section, with locators. The khan examples were verified against Archnet and standard references; the typology summary is general history and should be spot-checked against a survey (e.g. the caravanserai literature) before being cited anywhere outside this repo. The design translation built on this evidence claims no historicity of its own.

## Pending reading

Leads offered but not yet consulted; each is a candidate for a future research round.

- **Price model, itemized statutes.** Jim Chevallier points at 16th-century French price statutes, in period for the Historical mode's outer range: François I's 1519 and 1532 orders had officials set prices per item (bread by color, meat by cut, eggs by number), the surviving 1532 Auvergne list reads like menu entries ("a bowl of bouillon without bread", "two eggs cooked without sauce"), and the lists were displayed at the door. Could ground per-dish pricing the way the assize grounds bread and ale. [The invention of the restaurant was no big deal](https://parisfoodhistory.blogspot.com/2020/10/the-invention-of-restaurant-was-no-big.html).
- **Cheap common food register.** His survey of Paris street cries, a look at what ordinary people bought ready-made. [What the cries of Paris tell us](https://parisfoodhistory.blogspot.com/2018/01/what-cries-of-paris-tell-us-about.html).
- **Dining out across time.** His broad survey of eating out in London and Paris before roughly 1800. [Dining out in London and Paris](https://parisfoodhistory.blogspot.com/2018/03/dining-out-in-london-and-paris-before.html).
