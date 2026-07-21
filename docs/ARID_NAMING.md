# Arid Establishment Naming: De-Anglicizing the Desert Inn

Companion to `ARID_SOURCES.md`. The current name engine (`src/innname.js` + `data/inn_names.json`) models English tavern-sign syntax: charge-first names ("The White Hart") with a tier designator appended ("Great Inn"). That grammar is itself Eurocentric, independent of which charges sit in the arid pool. Swapping suns and serpents in for harts and bells produces an English pub wearing a desert costume. This doc lays out what the sources support and how to shift the grammar, not just the vocabulary.

## 1. What the two source books actually attest

The cookbooks are elite household manuals and never describe a hostelry. But they document two things a name generator can use.

**The naming grammar of the culture.** Prestige naming in both books is genitive and personal: dishes are named for the patron they were made for or the place they came from, never for a painted device.

- Patron-genitive: buraniyya (for Buran, bride of Caliph al-Ma'mun), ma'muniyya (al-Ma'mun), nasiriyya ("made in the house of al-Malik al-Nasir", S&F ch. 7), incense "made for Ibn Barmak" (S&F ch. 1), the Georgian kebab the Wusla author made for his uncle al-Malik al-Ashraf (S&F ch. 6), the ka'k of al-Hafiziyya, "maidservant of al-Malik al-'Adil" (S&F ch. 7).
- Place-nisba: Egyptian kebab, Frankish roast, Monk's Roast, Mosul kata, Basra-style basisah (S&F); Toledo-style mujabbana, Yemeni subiyyah, Persian and Greek turnip pickles (S&F ch. 8; Zaouali no. 73).

**The commercial texture around food.** Zaouali: harisa sold as cookshop and stall food (pp. 20, 42); the shops of the attarin, the spice-and-perfume sellers (ch. 2); pastry shops and nut vendors emptying out during Ramadan; hisba market codes setting prices for foodstuffs "sold in urban markets to innkeepers and private hosts"; Ibn Battuta's description of a Muslim quarter as mosque, inn, and bazaar. S&F 6.125 waves off the first lentil recipe because "market folk and the bulk of people" already cook it: direct evidence of a common-cookery layer beneath the book. The muruj/murawwaj manuscript dispute (Zaouali, fish ch., trans. note) even hinges on whether a dish name meant "sold ready-made in the souk."

## 2. The general-history layer (not from these books, flagged as such)

Establishment typology of the medieval Islamic world: the **funduq** (urban merchant hostel), **khan** (urban or road inn), **caravanserai** (Persian karwansaray, the fortified road inn at day-march intervals), **manzil** (stage/stopping place), **wikala** (the Cairo term), **ribat** (fortified hostel). Verified real names show the grammar consistently: Khan al-Sabun (Soap Khan, Aleppo), Khan al-Harir (Silk Khan, Damascus), Khan al-Wazir (of the Vizier, Aleppo), Khan al-Tujjar (of the Merchants, Nablus and Galilee), Khan al-Umdan (of the Columns, Acre), Khan Sulayman Pasha and Khan As'ad Pasha (patron names, Damascus). The pattern: **[type] + genitive of commodity / trade-guild / patron / architectural feature**. Caveat: these surviving named buildings are Mamluk and Ottoman (15th–18th c.), later than the 13th-century cookbooks; the institutions themselves are attested throughout the medieval period, and the genitive grammar matches the dish-naming grammar the cookbooks do attest.

Also worth knowing: painted signboards are the English tradition the engine models. Khans were identified by name, gate, and reputation. The `sign` field can survive as a carved motif over the gate arch rather than a hung board; that's a tooltip-text change, not a code change.

## 3. Implementation

> Status: implemented. 3a-3e all landed in `src/innname.js` and `data/inn_names.json`; see the "Inn names" section of `DESIGN.md` for the shipped behavior. The notes below record the design reasoning.

### 3a. Biome-aware designators (the one structural change)

`designators` is currently keyed by tier only. Key it by biome with a fallback to the current table, and give arid:

| Tier | Designators (weighted) |
|------|------------------------|
| roadside | Cookshop 35, Wayhouse 30, Rest 25, Khan 10 |
| common | Khan 50, Funduq 30, Hostel 20 |
| fine | Caravanserai 55, Khan 35, Funduq 10 |
| noble | Great Caravanserai 60, Royal Khan 40 |

"Cookshop" is directly supported by the harisa evidence and pairs with the tier_max caps on the dish pack's street food. "Caravanserai" is an ordinary English word; "Khan" and "Funduq" are the judgment call between flavor and obscurity: if "Funduq" reads too opaque in playtests, "Rest-house" is the translated fallback.

### 3b. A genitive pattern for arid

Add one pattern, `genitive`: **The [Designator] of the [Attribute]**, where the attribute draws from the existing charge, trade (pluralized), and figure pools. This inverts the syntax: designator becomes the head of the name instead of a suffix.

- The Khan of the Two Palms
- The Caravanserai of the Spicers
- The Funduq of the Vizier
- The Khan of the Columns

Weight it heavily for arid (~30) and zero elsewhere. `sign` = the attribute. The existing fallback machinery (drop pattern if pool can't satisfy) already covers it.

### 3c. Per-biome pattern reweighting

Patterns are currently global weights. Add per-biome overrides; for arid:

| Pattern | Current | Arid | Rationale |
|---|---|---|---|
| genitive |  | 30 | the native grammar (see 3b) |
| possessive | 8 | 20 | "The Qadi's Rest" is patron-genitive in English clothing |
| waypoint | 5 | 15 | wells, shade, gates, milestones: caravan-route naming |
| single | 56 | 20 | keep some, the pools are decent |
| number | 8 | 8 | "The Two Palms" register is fine |
| arms | 6 | 5 | reads as guild-genitive; acceptable |
| color | 16 | 2 | heraldic tincture is the English signboard tell |
| on_object | 3 | 0 | "The George on Horseback" grammar, purely English |
| body_part | 2 | 0–2 | "The Nomad's Head" is established; keep only if attached to it |

### 3d. Pool additions (arid-tagged)

- **Trades**: Perfumer (the attarin, attested in Zaouali), Soapmaker and Silk Merchant (Khan al-Sabun / al-Harir), Camel-Driver, Well-Keeper, Date-Seller. Existing Spicer, Dyer, Gemcutter already fit.
- **Figures**: Qadi (Ibn Battuta's urban triad includes one; the dish pack's Judge's Morsels reinforces it), Vizier (fine/noble), Pilgrim (roadside/common), Caravan-Master (common/fine). Existing Nomad, Sultan, Raider stand.
- **Charges**: Column/Pillar (Khan al-Umdan), Cistern, Dome, Star. Existing Palm, Well, Camel, Crescent carry most of the load.
- **Waypoints**: Cistern, Spring, Last Palm. Existing Well, Shade, Gate, Milestone are already the right register.
- **Numbers**: allow Two for arid (`The Two Palms`); currently Three carries nearly everything.

### 3e. What this yields

Roadside: The Last Well Rest, The Pilgrim's Cookshop, The Ninth Milestone Wayhouse. Common: The Khan of the Two Palms, The Date-Sellers' Funduq, The Qadi's Khan. Fine: The Caravanserai of the Spicers, The Khan of the Columns. Noble: The Great Caravanserai of the Sultan, The Vizier's Royal Khan.

The tier ladder still reads, but through the institution and the genitive attribute rather than through heraldic charges and "Great Inn" suffixes.

## Verification note

Sections 1 draws only on the two translated sources in `ARID_SOURCES.md`, with locators. Section 2's khan examples were verified against Archnet and standard references; the typology summary is general history and should be spot-checked against a survey (e.g. the caravanserai literature) before being cited anywhere outside this repo. Nothing in section 3 claims historicity; it's design translation.
