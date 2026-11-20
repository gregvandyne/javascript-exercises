# Story Library: Bloom Library books

Written by `scripts/import-bloom.js` (2026-11-20). Do not edit by hand: change `seed-library/bloom.json` or the importer and run it again.

## Source

Picture books from [Bloom Library](https://bloomlibrary.org) (SIL Global), read at import time from the files Bloom publishes for each book (its `meta.json` and book HTML, and the pictures). Only Bloom's book id is kept; each book links to its page on bloomlibrary.org. Neither Bloom Library nor SIL Global nor the books' publishers endorse Oomba Academy.

## License rule (checked in code: `server/library/bloom-lib.js`)

- The book must be CC BY, CC BY-SA or CC0 (version from the book's own license link; a ported or unclear version is left out), Bloom must be done processing it and have it in circulation, and it must not be tagged as a shell, template, draft, test, incoming or problem book or have activity, quiz or video pages.
- Its license notes, copyright, credits and acknowledgments must not restrict it ("not for distribution", "all rights reserved", "permission", "do not copy" and the like).
- Every picture it uses (the cover and one per page) must carry its own CC BY, CC BY-SA or CC0 license, no stricter than the book's (no BY-SA picture in a CC BY book). A picture with no license of its own is used when its copyright holder is the book's own; it then inherits the book's license (counted as "inherited" below). A picture with no license and no copyright at all ("unlabeled") also takes the book's license, but only when the book has at most 2 of them, they are not most of its pictures, and nothing about the picture names a stock or clip-art source (the owner's rule: "if there is a book with just a couple of missing licenses, then just add it"). A picture with a stricter license of its own (NC, ND, all rights reserved, custom) or credited to a stock or clip-art source (Microsoft, Pixabay, Google and the like) leaves the whole book out, as does any other picture that fails.
- Every story page must have English text (a page with a picture and no words in any language is kept as a wordless page) and exactly one picture. The reader shows the English only; the book's other languages are recorded for later (`otherLangs`).
- Every book page and reader page credits the author, illustrator(s), translator(s), the publisher or copyright holder, "Bloom Library", the license linked to its deed, and what Oomba changed; for CC BY-SA books, that Oomba's adapted pages are shared under the same license. The story words are changed only to correct real mistakes (spelling, punctuation, spacing, capitalization, obvious grammar slips), each one written down in `seed-library/bloom.json` (`fixes`) and listed below; those books also say "Oomba corrected spelling and punctuation."

## Choosing the books

Every candidate that passed the rule was read in full by a person for ages 4 to 10, with the same rules as the StoryWeaver books, applied strictly because Bloom books are uploaded by anyone: no violence beyond mild peril, nothing scary, no romance, no religious instruction, Bible stories, prayers or religion-centered plots, no labels on bodies, age or disability, no stereotypes, no unsafe behavior shown as fine, no medical advice beyond basic hygiene, nothing political, and no mistakes in the source text. Copies and translations of the same story were compared and the best English version kept; books already in the library from StoryWeaver were left out. The site's text scanners run on every page. Grades use the same rule as the StoryWeaver books (`docs/story-library-sources.md`).

## Totals

- English books on Bloom: 13396; with an allowed license in meta.json: 3962
- Candidates checked: 1771
- Included: **162** (Pre-K/K: 31, Grade 1: 50, Grade 2: 55, Grade 3: 22, Grades 4-5: 4)
- By license: CC BY 4.0: 138, CC BY-SA 4.0: 23, CC0 1.0: 1
- Pictures: 1965 with their own license, 26 inherited from the book (same copyright holder; 6 books), 9 with no license or copyright that take the book's license (at most 2 a book; 7 books)
- Text corrected by Oomba: 49 books, 177 corrections (listed below)
- Left out: 1609
  - read and left out: 474
  - page N has no picture: 357
  - a picture's license is missing, unclear or stricter: 272
  - N pictures have no license or copyright: 167
  - a page has several pictures: 138
  - the book's notes say: 109
  - English missing on page N: 70
  - no cover picture: 5
  - book HTML missing: 4
  - book license: no clear version: 4
  - no story pages: 3
  - most pictures have no license or copyright: 2
  - page N is an activity, quiz or video page: 2
  - picture /bloom/bookEdit/img/cogGrey.svg is not in the book's folder: 1
  - picture b - cover (cubierta is not in the book's folder: 1
- Bloom pictures on the site: 41.7 MB (WebP, pages at most 720 px, covers 440 px)

## Included

Pictures: own license / inherited from the book's copyright holder / no license or copyright (takes the book's license). Fixes: text corrections.

| Id | Title | Grade | Score | Words | Pages | Text | Illustration | Translation | Publisher | License | Pictures | Fixes | Other languages |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bl-ILj5QS0v0J | At the Market | Pre-K/K | 0.09 | 58 | 14 | Robyn Nottingham | Robyn Nottingham | – | SIL-PNG Education for Life | CC BY-SA 4.0 | 15/0/0 | – | km, tpi |
| bl-oh0S2OsR5l | Caterpillar Lives in Our Garden | Pre-K/K | -0.07 | 35 | 6 | Tandi Jackson | Michael John | Sidam Jamuna Ramesh | CBase Solutions Private Limited | CC BY 4.0 | 7/0/0 | – | tpi, wsg |
| bl-FUKSMHZKGV | Clever Pig | Pre-K/K | -0.12 | 68 | 12 | Nathalie Koenig | Joshua Morgan | – | Joshua Morgan, Nathalie Koenig, Lee- Ann Knowles, Carol Kagezi, BookDash.org | CC BY 4.0 | 13/0/0 | – | – |
| bl-DZw4pSaygC | Come Back, Cat! | Pre-K/K | -0.06 | 60 | 10 | Nicola Rijsdijk | Karen Lilje | – | Karen Lilje, Nicola Rijsdijk, Sam Scarborough, and BookDash.org | CC BY 4.0 | 11/0/0 | – | – |
| bl-zlWZv5fGOe | Fire's story | Pre-K/K | 0.43 | 62 | 8 | Deborah Namugosa, Beatres Nabune, Alison Tukei, Rose Sabano, Nina Orange | Rob Owen | – | African Storybook Initiative | CC BY 4.0 | 9/0/0 | – | es |
| bl-PDE01EHFGv | Friends | Pre-K/K | 0.45 | 99 | 16 | – | Catherine Groenewald | – | African Storybook Initiative and Molteno Institue | CC BY 4.0 | 17/0/0 | – | pt |
| bl-pkep1Xedfa | Helping Others | Pre-K/K | -0.25 | 29 | 6 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 7/0/0 | – | tpi |
| bl-pHiPGbsKde | Homes | Pre-K/K | 0.25 | 106 | 16 | – | Michael John | – | SIL-PNG Education for Life | CC BY 4.0 | 17/0/0 | – | tpi |
| bl-bSwdvrAr3j | Houses | Pre-K/K | 0.18 | 47 | 8 | Clare Verbeek, Thembani Dladla, Zanele Buthelezi | Kathy Arbuckle | – | School of Education and Development (Centre for Adult Education), University of KwaZulu-Natal | CC BY 4.0 | 9/0/0 | – | – |
| bl-vsgb9DGb0k | How do you want your eggs? | Pre-K/K | 0.12 | 62 | 13 | – | Richard Bolland | – | SIL - Education for Life | CC BY 4.0 | 14/0/0 | – | – |
| bl-L1FIUWglad | I Like to Read | Pre-K/K | -0.07 | 45 | 8 | Letta Machoga | Wiehan de Jager | – | African Storybook Initiative | CC BY 4.0 | 9/0/0 | – | – |
| bl-xbtUczudzv | I Want to Hide | Pre-K/K | -0.11 | 29 | 6 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 7/0/0 | – | tpi |
| bl-NiYrkUxLOO | In the Park | Pre-K/K | 0 | 40 | 8 | Rituparna Ghosh | Archana Sreenivasan, Deepa Balsavar, Deval Maniar, Preeti Krishnamurthy, Sanjay Sarkar, Sukhada Rahalkar, Suvidha Mistry | – | Rituparna Ghosh | CC BY 4.0 | 9/0/0 | – | – |
| bl-jGyaRvVUml | Let’s Count Legs | Pre-K/K | -0.15 | 36 | 8 | Komar Rien Komar Cheh | Meas SovannaraI | Sule Yakubu for GILLBT | GILLBT | CC BY 4.0 | 9/0/0 | – | maw |
| bl-wGdrG089au | Maria's Family | Pre-K/K | -0.38 | 43 | 11 | – | Magriet Brink, Leo Daly | – | Little Zebra Books | CC BY 4.0 | 0/12/0 | – | pt |
| bl-MiVg4YRgRi | My red ball | Pre-K/K | -0.18 | 72 | 16 | Marion Drew | Marion Drew | Khothatso Ranoosi, Marion Drew | Artwork: African Storybook Initiative; Text: Khothatso Ranoosi ?and Marion Drew | CC BY 4.0 | 17/0/0 | – | – |
| bl-6ryYW1p7iD | Nina and Peter | Pre-K/K | 0.22 | 97 | 14 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 15/0/0 | – | tpi |
| bl-Y2olGWKQyY | Our day at the zoo | Pre-K/K | 0.04 | 70 | 12 | Zimbili Dlamini, Hlengiwe Zondi | Melany Pietersen | – | African Storybook Initiative and Molteno Institute | CC BY 4.0 | 13/0/0 | – | – |
| bl-OJoRsE9eav | Our Values | Pre-K/K | 0.13 | 57 | 6 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 7/0/0 | – | tpi |
| bl-q4nSDcCPoG | Pendo our cow | Pre-K/K | 0.09 | 58 | 12 | Ruth Odondi | Rob Owen | – | African Storybook Initiative and Molteno Institute | CC BY 4.0 | 13/0/0 | – | – |
| bl-idPZs7o3gn | Shongololo's Shoes | Pre-K/K | 0.24 | 89 | 11 | Jacqui L’Ange | Megan Lötter | – | Book Dash | CC BY 4.0 | 12/0/0 | – | – |
| bl-IHMaoTmVrw | Sport | Pre-K/K | 0.05 | 77 | 16 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 17/0/0 | – | tpi |
| bl-KWFeqXHHge | Teeth | Pre-K/K | 0.4 | 64 | 8 | Zanele Buthelezi, Thembani Dladla, Clare Verbeek | Rob Owen, Development | – | SIL International | CC BY 4.0 | 9/0/0 | – | tnn |
| bl-bw69H3aL6F | The Visitors | Pre-K/K | 0.21 | 66 | 10 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 11/0/0 | – | tpi |
| bl-bLA0AsOuuS | Transport | Pre-K/K | 0.27 | 94 | 14 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 15/0/0 | – | tpi |
| bl-atsG5ppVC1 | Trees | Pre-K/K | 0.47 | 82 | 11 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 12/0/0 | – | tpi |
| bl-oP7kQamjXU | What Animals Can You See? | Pre-K/K | 0.14 | 93 | 18 | – | Michael John | – | SIL PNG | CC BY 4.0 | 19/0/0 | – | adz, tpi |
| bl-I81XFHux5t | What Is It? | Pre-K/K | 0.17 | 85 | 12 | Kate Sidley | Robyn Penn | – | Robyn Penn, Kate Sidley, Ann Roberts, and BookDash.org | CC BY 4.0 | 13/0/0 | – | oks |
| bl-LqZJkdOKv7 | When Mama Is Away | Pre-K/K | 0.23 | 68 | 9 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 10/0/0 | – | tpi |
| bl-aeo3n5ry6J | Whose foot is this? | Pre-K/K | -0.34 | 48 | 12 | – | Proyecto “Arte para la Alfabetización en México" | – | Instituto Lingüístico de Verano, A.C | CC BY-SA 4.0 | 13/0/0 | – | es, jmx, jmx-x-coi, jmx-x-smp |
| bl-DzR6jBUVP0 | Yellow | Pre-K/K | 0.15 | 59 | 11 | Reviva Schermbrucker | Sue Kramer | – | Reviva Schermbrucker, Sue Kramer and PRAESA | CC BY 4.0 | 12/0/0 | – | – |
| bl-7x6RogP4Ou | A House for Mouse | Grade 1 | 0.81 | 98 | 12 | Michele Fry | Amy Uzzell, Jennifer Jacobs | – | NTC Literacy team | CC BY 4.0 | 13/0/0 | – | nst |
| bl-EEjyHGIyGp | A Surprise for the Football Team | Grade 1 | 1.25 | 92 | 7 | Letta Machoga, Elizabeth Carlson | Vusi Malindi, Catherine Groenewald, Molteno Institute. CC BY 4.0 | – | SIL International | CC BY 4.0 | 8/0/0 | – | tnn |
| bl-5EDlLhFmlN | A very tall man | Grade 1 | 0.53 | 79 | 11 | Cornelius Gulere | Catherine Groenewald | – | Text: Ugandan Community Libraries Association; Illustration: African Storybook Initiative | CC BY 4.0 | 12/0/0 | – | – |
| bl-NWmuplJDVr | Afo and I | Grade 1 | 1.14 | 165 | 11 | Canato Jimo | Canato Jimo | – | Pratham Books | CC BY 4.0 | 12/0/0 | – | – |
| bl-eg9aLLFlV0 | Agama Lizard | Grade 1 | 0.52 | 65 | 5 | – | Gordon Martin | Nfonkwa Samuel Kilese, Soka Sylverius Dosi | SIL Cameroon | CC BY 4.0 | 0/6/0 | – | ncr |
| bl-hPzSEW4Gsi | An Ant Named Mari | Grade 1 | 1.21 | 194 | 9 | Kanchan Bannerjee, Elizabeth Carlson | Deepa Balsavar | – | SIL International | CC BY 4.0 | 10/0/0 | – | tnn |
| bl-FnQCTrCX1y | And Also! | Grade 1 | 1.35 | 162 | 13 | – | Anja Ventor | – | SIL-PNG Education for Life | CC BY-SA 4.0 | 14/0/0 | – | tpi |
| bl-Ivaw5VLWgv | Azizi the doll | Grade 1 | 0.82 | 109 | 12 | Lawrence A. Konjuro | Natalie Propa | – | African Storybook Initiative | CC BY 4.0 | 13/0/0 | – | fr, ht |
| bl-z5EDZ4xIgf | Bed-Time Stories | Grade 1 | 1.13 | 78 | 7 | – | Harshvardhan Gantha | – | Pratham Books | CC BY 4.0 | 8/0/0 | – | – |
| bl-rYVSK51hu5 | Counting | Grade 1 | 0.8 | 66 | 8 | Clare Verbeek, Thembani Dladla, Zanele Buthelezi | Gay Galsworthy | – | africanstorybook | CC BY 4.0 | 9/0/0 | – | maw |
| bl-7Mn8ROiBog | Dance, Mihlali! | Grade 1 | 1.09 | 150 | 16 | Matona Fatman | Aimee Ayres | – | Book Dash | CC BY 4.0 | 17/0/0 | – | – |
| bl-gmR8JZOR9Y | Dembe the shopkeeper | Grade 1 | 1.41 | 122 | 9 | Annet Ssebaggala | Zablon Alex Nguku | Annet Ssebaggala | African Storybook Initiative | CC BY 4.0 | 10/0/0 | – | – |
| bl-o2qHFb5zbs | Girl called Norah | Grade 1 | 1 | 119 | 8 | Annet Ssebaggala | Melany Pietersen | Annet Ssebaggala | African Storybook Initiative | CC BY 4.0 | 9/0/0 | – | – |
| bl-oyjnKnB2WG | How to Tame a Monster | Grade 1 | 1.35 | 128 | 13 | – | Anja Venter | – | SIL - Education for Life | CC BY 4.0 | 12/0/2 | – | – |
| bl-W9BZOhXDw9 | I can do this! | Grade 1 | 1.24 | 143 | 9 | World education | Silva Afonso | Isabelle Duston | World Education Inc | CC BY 4.0 | 9/0/1 | 1 | – |
| bl-thk2O2wNEG | I Colour In | Grade 1 | 1.39 | 79 | 9 | – | World Education, Inc. | – | SIL-PNG Education for Life | CC BY-SA 4.0 | 10/0/0 | – | tpi |
| bl-cg0dKM2jy5 | I Like to Draw | Grade 1 | 0.83 | 112 | 9 | World  Education, Inc, World Education, Inc | Silva Afonso World Education, Inc | Jackson Iauko | SIL International | CC BY 4.0 | 10/0/0 | – | tnn |
| bl-rShBHrHYV6 | Jaaka the fisherman | Grade 1 | 1.29 | 94 | 8 | Tom Sabwa, Children’s Development Center at Masese | Zablon Alex Nguku | Cornelius Gulere | Ugandan Community Libraries Association | CC BY 4.0 | 9/0/0 | – | – |
| bl-M2mgINIpLR | Jobs | Grade 1 | 0.71 | 102 | 9 | – | Michael Mape | Nfonkwa Samuel Kilese, Soka Sylverius Dosi | SIL Cameroon | CC BY 4.0 | 10/0/0 | – | ncr |
| bl-sNIVfFbhiB | Kabali and Kateera | Grade 1 | 0.81 | 90 | 8 | Milly Kasule | Franz Phooko | – | African Storybook Initiative | CC BY 4.0 | 9/0/0 | – | – |
| bl-PmkkQa8tI7 | Little Caterpillar | Grade 1 | 0.94 | 109 | 8 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 9/0/0 | – | tpi |
| bl-dw0b0u21Hs | Maggy and Doris the cat | Grade 1 | 0.65 | 68 | 6 | Amos Metui Karia | Marleen Visser | – | Amos Metui Karia | CC BY 4.0 | 7/0/0 | – | – |
| bl-ldaG8moDne | My teacher | Grade 1 | 0.91 | 73 | 8 | Zimbili Dlamini, Hlengiwe Zondi | Jesse Pietersen | Zimbili Dlamini, Hlengiwe Zondi | African Storybook Initiative and Molteno Institute | CC BY 4.0 | 9/0/0 | – | – |
| bl-WjEB24Dti4 | Namukuru’s bicycle | Grade 1 | 1.08 | 86 | 8 | Munanga ASb teachers | Wiehan de Jager | Munanga ASb teachers | African Storybook Initiative | CC BY 4.0 | 9/0/0 | – | – |
| bl-bKz6msEr9K | Nema Buys Thread | Grade 1 | 1.39 | 190 | 12 | – | Mirjam Gyger, Marleen Visser | – | Little Zebra Books | CC BY-SA 4.0 | 13/0/0 | – | – |
| bl-uYwJas8xs3 | Neo finds her pig | Grade 1 | 0.89 | 95 | 8 | Sehlopa sa Malea-lea ASP | Marion Drew | Khothatso Ranoosi, Marion Drew | African Storybook Initiative | CC BY 4.0 | 9/0/0 | – | – |
| bl-NnhnuZmTS0 | Nigie Goes to School | Grade 1 | 1.01 | 83 | 8 | – | – | – | SIL-PNG Education for Life | CC BY-SA 4.0 | 9/0/0 | – | bpe-x-pou, tpi |
| bl-Yt2R2HoU1F | Open the Door | Grade 1 | 1.28 | 201 | 13 | – | Gabriella Jardine | – | SIL Education for Life | CC BY 4.0 | 14/0/0 | – | – |
| bl-Kepva7B4x5 | Palm Tree | Grade 1 | 1.09 | 69 | 8 | Simon Ipoo | Rob Owen | Simon Ipoo | African Storybook Initiative | CC BY 4.0 | 9/0/0 | – | – |
| bl-zhpmHjWPbm | Poki Pig | Grade 1 | 0.98 | 161 | 10 | – | Michael John | – | SIL-PNG Education for Life | CC BY 4.0 | 11/0/0 | – | tpi |
| bl-VGcHIVygjT | Red | Grade 1 | 0.58 | 72 | 11 | Reviva Schermbrucker | Sue Kramer | – | Reviva Schermbrucker, Sue Kramer and PRAESA | CC BY 4.0 | 12/0/0 | – | – |
| bl-hxE0zqYVh3 | Scared Tumi | Grade 1 | 1.49 | 128 | 11 | Mohale Mashigo | Nicola Anne Smith | – | Nicola Anne Smith, Mohale Mashigo, Nontobeko Kunene, Ester Levinrad and Bookdash.org | CC BY 4.0 | 12/0/0 | – | – |
| bl-SkbPuCPZd0 | The day the Sun went away | Grade 1 | 1.41 | 190 | 12 | Khothatso Ranoosi, Marion Drew | Jesse Breytenbach | – | African Storybook Initiative | CC BY 4.0 | 11/0/2 | 3 | – |
| bl-PCA1hFVmG4 | The Fox and the Grapes | Grade 1 | 1.34 | 114 | 10 | – | Stuart Westcott, Dibujado por Stuart Westscott | – | Stuart Westcott | CC BY-SA 4.0 | 11/0/0 | – | es, jmx-x-EnAm, jmx-x-coi |
| bl-LKE0zR5qKe | The Sea | Grade 1 | 1.17 | 177 | 9 | Nicola Rijsdijk | Lauren Nel, Julie Smith-Belton | – | Nicola Rijsdijk, Lauren Nel and Julie Smith-Belton, Ester Levinrad, and BookDash.org | CC BY 4.0 | 10/0/0 | – | – |
| bl-7YWHmKnmy5 | The Three Little Kittens | Grade 1 | 0.66 | 109 | 13 | Chou Chinith | Youm Kosal | Magdalena Cooper | Room to Read | CC BY 4.0 | 14/0/0 | – | oks |
| bl-w1XWYHXhyn | The Wood Carver | Grade 1 | 1.28 | 114 | 9 | – | Michael John | – | SIL-PNG Education for Life | CC BY 4.0 | 10/0/0 | – | tpi |
| bl-FbURyCuoid | Unathi and the Dirty, Smelly Beast | Grade 1 | 0.77 | 122 | 12 | Jon Keevy | Jess Jardim-Wedepohl | – | Jon Keevy, Jess Jardim-Wedepohl, Thokozani Mkhize, Bongani Kona, and BookDash.org | CC BY 4.0 | 13/0/0 | – | – |
| bl-2Bis5QlQwQ | Water is Coming. | Grade 1 | 1.48 | 205 | 11 | – | Joanna Smith | – | Joanna Smith | CC BY 4.0 | 12/0/0 | 10 | hi |
| bl-Fm8bG2VRDX | We like to Play Many Games | Grade 1 | 0.96 | 104 | 6 | – | – | – | SIL-PNG Education for Life | CC BY-SA 4.0 | 7/0/0 | – | bpe-x-barupu, tpi |
| bl-gEHeFP9GIj | What Are They Doing? | Grade 1 | 0.57 | 74 | 10 | – | N.D. Mazin | – | Little Zebra Books | CC BY-SA 4.0 | 11/0/0 | – | – |
| bl-7Vx6k2Zh5y | What Do You Like to Do? | Grade 1 | 0.89 | 241 | 18 | – | Ubongo | – | Ubongo | CC BY 4.0 | 19/0/0 | – | – |
| bl-OQL6nmYB0x | What Jobs Can I Do? | Grade 1 | 1.43 | 124 | 12 | – | Tamsin Hinrichsen | – | Little Zebra Books | CC BY-SA 4.0 | 13/0/0 | – | – |
| bl-KN9QkPKliG | What Shall I Use to Travel? | Grade 1 | 0.74 | 124 | 16 | Ursula Nafula | Sue Kramer, Catherine Groenewald, Marion Drew, Louwrisa Blaauw, Rob Owen, Vusi Malindi, Jesse Breytenbach, Natalie Propa, Wiehan de Jager, Mango Tree | Ursula Nafula | African Storybook Initiative | CC BY 4.0 | 17/0/0 | – | – |
| bl-zIWFhPaoX7 | What the Dark Sounds Like | Grade 1 | 0.8 | 111 | 17 | Aparna Kapur | Krishna Bala Shenoi | – | Pratham Books | CC BY 4.0 | 18/0/0 | – | – |
| bl-ZRQug5puZx | Where Is Thabo? | Grade 1 | 0.61 | 102 | 12 | Melissa Fagan | Ndumiso Nyoni | – | Ndumiso Nyoni, Melissa Fagan, Fathima Kathrada, Bongani Kona, and BookDash.org | CC BY 4.0 | 13/0/0 | – | – |
| bl-sDW77HauCs | Who is Big? | Grade 1 | 0.6 | 108 | 7 | Sara Saunders | Wiehan de Jager, Karen Lilje, blackmoondev.com | – | Sara Saunders | CC BY 4.0 | 8/0/0 | – | – |
| bl-yAzknqBbas | Who Will Help Me? | Grade 1 | 0.73 | 143 | 8 | – | Michael Mape | – | SIL-PNG Education for Life | CC BY 4.0 | 9/0/0 | – | tpi |
| bl-6umwhq0WvV | Zama is great! | Grade 1 | 1.22 | 127 | 12 | Nina Orange | Vusi Malindi | – | Text: Uganda Community Libraries Association (UgCLA; Illustrations: African Storybook Initiative | CC BY 4.0 | 13/0/0 | – | – |
| bl-U4W4NFvz2l | Zibu & Zizo | Grade 1 | 0.89 | 113 | 12 | Refilwe Nsibande | Josephine Versfeld | – | Book Dash | CC BY 4.0 | 12/0/1 | 1 | – |
| bl-Bra5VpKEm8 | A Street, or a Zoo? | Grade 2 | 1.79 | 173 | 11 | Mala Kumar, Manisha Chaudhry | Priya Kuriyan | – | Pratham Books | CC BY 4.0 | 12/0/0 | – | – |
| bl-AlIhhm6Df3 | A wise crow | Grade 2 | 1.74 | 132 | 7 | Beatres Nabune, Wilson Lwagala | Melany Pietersen, Graham Paterson, Katrien Coetzer, Rob Owen | – | Mugulu Integrated Primary School | CC BY 4.0 | 7/0/1 | 4 | ht |
| bl-a5QYD93dfs | About Birds | Grade 2 | 1.71 | 215 | 14 | Tandi Jackson | Michael Mape | – | SIL PNG | CC BY 4.0 | 15/0/0 | – | adz, tpi |
| bl-MISNo6Z1OP | Amazing Daisy | Grade 2 | 1.88 | 332 | 19 | – | Siya Masuku | – | Nozizwe Herero, Siya Masuku, Leona Ingram and BookDash.org | CC BY 4.0 | 20/0/0 | 4 | – |
| bl-ilT4d1OEUU | Andiswa Soccer Star | Grade 2 | 1.88 | 183 | 8 | Eden Daniels | Eden Daniels | – | African Storybook Initiative | CC BY 4.0 | 9/0/0 | 3 | fr, ht |
| bl-CHLB3IYhFE | Anna is a Big Girl | Grade 2 | 1.51 | 176 | 12 | Uganda Community Libraries Association | Vusi Malindi | – | SIL International | CC BY 4.0 | 13/0/0 | 2 | tnn |
| bl-U6Ym2v9aZX | Clever Cat | Grade 2 | 1.51 | 138 | 12 | Ursula Nafula | Catherine Groenewald | Ursula Nafula | African Storybook Initiative | CC BY 4.0 | 13/0/0 | 1 | – |
| bl-DhU02tDwAo | Curious baby elephant | Grade 2 | 1.71 | 308 | 21 | Judith Baker et Lorato Trok | Wiehan de Jager | – | SIL Mali | CC BY 4.0 | 22/0/0 | – | fr, lgg, nso, swh, tn, zu |
| bl-TcM4yYeFkq | Deepa's Resolution | Grade 2 | 2.27 | 112 | 6 | Usha Ayyar | Henu, Ketan Raut, Priya Kuriyan, Sonal Goyal, Sumit Sakhuja, Sunaina Coelho, Suvidha Mistry, Yulianto Qin | – | Usha Ayyar | CC BY 4.0 | 7/0/0 | 2 | – |
| bl-i57MwJlCEv | Dudu's Hat | Grade 2 | 2.08 | 315 | 13 | – | Stephen Wallace | – | SIL - Education for Life | CC BY-SA 4.0 | 14/0/0 | 8 | – |
| bl-pFdwOIAZXn | Elders | Grade 2 | 1.82 | 248 | 8 | Oku Modesto | Salim Kasamba | Oku Modesto | African Storybook Initiative | CC BY 4.0 | 9/0/0 | – | – |
| bl-MJt3XUbsiU | Forgetful Dida | Grade 2 | 2.36 | 446 | 13 | Himanjali Sankar | Aditi Anand | – | Pratham Books | CC BY 4.0 | 14/0/0 | 1 | – |
| bl-Npv1Gjw0SC | Goplu's Train Ride | Grade 2 | 1.76 | 275 | 14 | Timira Gupta | Parmita Mukherjee | – | Pratham Books | CC BY 4.0 | 15/0/0 | 2 | – |
| bl-IfBivy6I1X | Greedy Kiundu | Grade 2 | 2.2 | 279 | 12 | Mutugi Kamundi | Alex Zablon | – | African StoryBook Project | CC BY 4.0 | 13/0/0 | – | – |
| bl-n0TYvD2hao | Greeny and Hoppers Become Friends | Grade 2 | 1.85 | 211 | 4 | Jeon Wonwoo | Sweta Roy Choudhury | – | Jeon Wonwoo | CC BY 4.0 | 5/0/0 | – | – |
| bl-htefPgQyFq | Hippo wants to dance | Grade 2 | 1.51 | 187 | 11 | Sam Beckbessinger | Megan Andrews | – | Book Dash | CC BY 4.0 | 12/0/0 | – | – |
| bl-tL6sbfQUTf | How Ant Saved Dove | Grade 2 | 1.59 | 354 | 28 | – | Wiehan de Jager | – | SIL-PNG Education for Life | CC BY-SA 4.0 | 29/0/0 | – | tpi |
| bl-mScXjHSaTx | Juliana Wants a Pet | Grade 2 | 2.05 | 123 | 5 | Johanna Roman | – | – | Resources for the Blind, Inc | CC BY-SA 4.0 | 6/0/0 | 4 | tl |
| bl-N2O83BGUNs | Kaushik, the Kind Detective | Grade 2 | 2.37 | 359 | 10 | N. Chokkan | Megha Vishwanath | N. Chokkan | Pratham Books | CC BY 4.0 | 11/0/0 | 3 | – |
| bl-Ck8ZoY71QY | Khalai talks to plants | Grade 2 | 1.59 | 152 | 8 | Ursula Nafula | Jesse Pietersen | Ursula Nafula | African Storybook Initiative | CC BY 4.0 | 9/0/0 | 5 | – |
| bl-vjjpa4c82g | Letter to mum | Grade 2 | 2.22 | 276 | 16 | Ursula Nafula | Catherine Groenewald | – | African Storybook Initiative | CC BY 4.0 | 17/0/0 | – | – |
| bl-kqVxQB1tI1 | Lory Dory | Grade 2 | 1.78 | 194 | 12 | Brendon O’Neill | Sonia Dearling | – | Book Dash | CC BY 4.0 | 13/0/0 | – | – |
| bl-z1odsw2Oe7 | Mary | Grade 2 | 2.27 | 241 | 11 | Cynthia Birgen | Mango Tree, Jesse Pietersen, Silva Afonso, Vusi | – | Cynthia Birgen | CC BY 4.0 | 12/0/0 | 7 | – |
| bl-sQ5PBtPOBk | Mbone and Akinyi | Grade 2 | 2.14 | 155 | 8 | Esther Mutheu | Catherine Groenewald, Marleen Visser, Silva Afonso, Vusi Malindi, José Jochicala, Salim Kasamba, Melany Pietersen | – | Esther Mutheu | CC BY 4.0 | 9/0/0 | 7 | – |
| bl-WDAU6pRXg5 | Mini's house | Grade 2 | 2.13 | 130 | 5 | Ravi Ranjan Goswami | Bindia Thapar, Kabini Amin, Kaveri Gopalakrishnan, Preethi Krishnan | Ravi Ranjan Goswami | Ravi Ranjan Goswami | CC BY 4.0 | 6/0/0 | 2 | – |
| bl-JTp5wxctcI | Miss Tiny Chef | Grade 2 | 2.39 | 309 | 12 | Linda Nabasa | Raymond Diby | – | Raymond Diby, Linda Nabasa, Ruramai Musekiwa, Nabeela Kalla, and BookDash.org | CC BY 4.0 | 13/0/0 | 2 | – |
| bl-wMmKgKXlQo | Mrs. Penguin's Perfect Palace | Grade 2 | 1.63 | 297 | 24 | Helen Brain | Celeste Beckerling | – | Celeste Beckerling, Helen Brain, Arthur Attwell, Vian Oelofsen, Jennifer Jacobs, and BookDash.org | CC BY 4.0 | 25/0/0 | – | – |
| bl-W1xCSDTuft | My Juggling Granny | Grade 2 | 1.74 | 154 | 6 | Mala Kumar, Manisha Chaudhry | Niloufer Wadia | Mala Kumar, Manisha Chaudhry | Pratham Books | CC BY 4.0 | 7/0/0 | 1 | – |
| bl-HwWX8KGLxj | My Special Hair | Grade 2 | 1.89 | 287 | 12 | Candice Dingwall | Jess Jardim-Wedepohl | – | Jess Jardim-Wedepohl, Candace Dingwall, Renate van Rensburg, Kelly Norwood-Young, and BookDash.org | CC BY 4.0 | 13/0/0 | – | – |
| bl-0msgQEILAb | Naughty Cow | Grade 2 | 1.74 | 254 | 9 | Joanna Smith | Joanna Smith | – | Joanna Smith | CC BY 4.0 | 10/0/0 | 4 | hi |
| bl-ZBwjL0Bbp3 | O Rain Come | Grade 2 | 2.03 | 204 | 12 | Fiske Serah Nyirongo | Éidín Griffin | – | Book Dash, Éidín Griffin, Fiske Serah Nyirongo, and Jennifer Jacobs | CC BY 4.0 | 13/0/0 | – | – |
| bl-foadKZ4Asb | Ou Ou Wants to Have Friends | Grade 2 | 2.06 | 259 | 13 | 'ອຸອູຢາກມີໝູ່' | Vongsavanh Damlongsouk | – | Room to Read | CC BY 4.0 | 14/0/0 | 4 | – |
| bl-qELPLaz9lr | Papa's Shamba | Grade 2 | 1.79 | 115 | 6 | Judith Twala | Jesse Breytenbach, Wiehan de Jager, Marion Drew, Catherine Groenewald, Jesse Pietersen, Silva Afonso, Vusi Malindi | – | Judith Twala | CC BY 4.0 | 7/0/0 | 3 | – |
| bl-v8o0OxKOr6 | Paper Play | Grade 2 | 2.23 | 368 | 10 | Mala Kumar | Ruchi Shah | – | Pratham Books | CC BY 4.0 | 11/0/0 | 2 | – |
| bl-scfTyZM5tr | Piu...Piu...Piu | Grade 2 | 1.98 | 291 | 9 | World Education, Inc | Silva Afonso | Isabelle Duston | World Education Inc | CC BY 4.0 | 10/0/0 | 9 | – |
| bl-SWCNOVTQ6F | Rabbit Goes to a Party | Grade 2 | 1.74 | 146 | 7 | Students at Universidade Pedagógica, Maxixe (a Mozambican folktale) | Hélder de Paz Alexandre | – | SIL Nigeria | CC BY-SA 4.0 | 7/0/1 | – | bcy |
| bl-edobKpbCK5 | Rabbit under the tree | Grade 2 | 1.82 | 475 | 16 | Phumy Zikode | Wiehan de Jager | Phumy Zikode | African Storybook Initiative | CC BY 4.0 | 17/0/0 | 6 | – |
| bl-z1IlL1iI4k | Sam Uncle | Grade 2 | 1.88 | 70 | 3 | Abhishek Khanna | Ajanta Guhathakurta, Priya Kuriyan, Rupa | – | Abhishek Khanna | CC BY 4.0 | 4/0/0 | 5 | – |
| bl-5KnZbVBmOA | Sara's Canoe | Grade 2 | 1.76 | 243 | 13 | – | Rachel Greer | – | Little Zebra Books | CC BY-SA 4.0 | 13/1/0 | – | – |
| bl-ZYIJu9ZuAK | Satya, Watch Out! | Grade 2 | 1.98 | 292 | 17 | Yamini Vijayan | Vishnu M Nair | – | Pratham Books | CC BY 4.0 | 18/0/0 | – | – |
| bl-xduyDtPcyn | Senzo and the Sun | Grade 2 | 1.59 | 237 | 12 | Sarah McGregor | Adrie le roux | – | Adrie le roux, Sarah McGregor, Liam Longland, Elise Varga, and Bookdash.org | CC BY 4.0 | 13/0/0 | – | – |
| bl-YAm9F82mVG | Sipho Reads with Joy | Grade 2 | 2.21 | 290 | 11 | – | Marleen Visser | – | Little Zebra Books | CC BY-SA 4.0 | 12/0/0 | – | – |
| bl-2YIynlyAt7 | Smart Sona Helps Her Mother | Grade 2 | 2.23 | 259 | 13 | Vinita Krishna | Suvidha Mistry | Manisha Chaudhry | Pratham Books | CC BY 4.0 | 14/0/0 | 2 | – |
| bl-YfFjdYu19T | Sunday at the park | Grade 2 | 1.59 | 167 | 10 | Neo | Neo | – | Neo | CC BY 4.0 | 11/0/0 | 1 | – |
| bl-hePTMk0ymw | The Big Juicy Mango | Grade 2 | 2.47 | 143 | 9 | Katelyn Mostert | Wiehan de Jager</p>, Wiehan de Jager | – | Katelyn Mostert | CC BY 4.0 | 10/0/0 | 2 | – |
| bl-0Nd19U6Opf | The elephant in the room | Grade 2 | 2.09 | 377 | 12 | Sam Wilson | Michael Tymbios | – | Book Dash | CC BY 4.0 | 13/0/0 | – | – |
| bl-FewlLlor3n | The Fox and the Crow | Grade 2 | 2.06 | 127 | 9 | Gordon Westcott, from a fable by Aesop | Gordon Westcott | – | Gordon Westcott | CC BY-SA 4.0 | 10/0/0 | 3 | es, jmx-x-EnAm, jmx-x-coi |
| bl-4yn12xdsaX | The Little Red Hen | Grade 2 | 2.17 | 366 | 18 | – | ARCODI | – | Instituto Lingüístico de Verano, A. C | CC BY-SA 4.0 | 19/0/0 | – | es |
| bl-G37Uu0elWo | The Plant Whisperer | Grade 2 | 2.28 | 637 | 22 | Sayantan Datta | Bhavya Kumar | – | Pratham Books | CC BY 4.0 | 23/0/0 | – | – |
| bl-xNeM7BMoKZ | The Royal Toothache | Grade 2 | 2.19 | 224 | 11 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | Pratham Books | CC BY 4.0 | 12/0/0 | 3 | – |
| bl-MozyTFFFRR | Tortoise Finds his House | Grade 2 | 2 | 468 | 14 | Maya Fowler | Katrien Coetzer | Maya Fowler | Katrien Coetzer, Maya Fowler, Damian Gibbs, bookdash.org and African Storybook Initiative | CC BY 4.0 | 15/0/0 | 1 | – |
| bl-U81TOWfdQ7 | When I Grow Up | Grade 2 | 2.29 | 175 | 14 | – | Simóne van der Spuy | – | SIL-PNG | CC BY-SA 4.0 | 15/0/0 | – | tpi |
| bl-5LGuN9YHRf | When the Clouds Came Home | Grade 2 | 1.62 | 388 | 13 | Ramesh Hengadi | Ramesh Hengadi | Shinibali Saigal | Pratham Books | CC BY 4.0 | 14/0/0 | – | – |
| bl-3NpGshx2Po | Who Stole Bhaiya's Smile? | Grade 2 | 2.42 | 726 | 21 | Sanjana Kapur | Sunaina Coelho | – | Pratham Books | CC BY 4.0 | 22/0/0 | 3 | – |
| bl-OtPErgGATN | Yapo Saves the Day | Grade 2 | 2.38 | 339 | 12 | – | Liam Longland | – | SIL-PNG Education for Life | CC BY-SA 4.0 | 13/0/0 | 4 | tpi |
| bl-xtDFOOj29m | A Tiny Seed: The Story of Wangari Maathai | Grade 3 | 2.57 | 412 | 12 | Nicola Rijsdijk | Maya Marshak, Onesmus Kakungi | – | Nicola Rijsdijk, Maya Marshak, Tarryn-Anne Anderson, Bookdash.org and African Storybook Initiative | CC BY 4.0 | 13/0/0 | – | – |
| bl-ERMHxDymEF | Anansi and Turtle | Grade 3 | 3.34 | 605 | 10 | – | Wiehan de Jager | – | African Storybook Initiative | CC BY 4.0 | 11/0/0 | 2 | – |
| bl-aSBzr5Sznf | Chik-chik Girl | Grade 3 | 2.62 | 624 | 13 | Komilla Raote | Shubhshree Mathur | – | Pratham Books | CC BY 4.0 | 14/0/0 | – | – |
| bl-R3YJdUYpQn | Full of Light | Grade 3 | 2.72 | 759 | 18 | Mathangi Subramanian | Proiti Roy | – | Pratham Books | CC BY 4.0 | 19/0/0 | 4 | – |
| bl-IDzZLFhQ66 | Grandma’s bananas | Grade 3 | 3.03 | 528 | 10 | Ursula Nafula | Catherine Groenwald | – | African StoryBook Initiative | CC BY 4.0 | 11/0/0 | – | – |
| bl-6rvW9OSAe9 | Grandpa Fish and the Radio | Grade 3 | 3.25 | 543 | 20 | – | Srikrishna Kedilaya | – | Pratham Books | CC BY 4.0 | 21/0/0 | 2 | – |
| bl-UKTKWVO4tI | Icecream in Spiti | Grade 3 | 2.79 | 611 | 13 | – | Joanna Smith | – | Joanna Smith | CC BY 4.0 | 14/0/0 | 14 | – |
| bl-5u99Uj7X4H | Ira's Monsoon Feast | Grade 3 | 2.86 | 325 | 12 | Mukta Patil | Kavita Singh Kale | – | Pratham Books | CC BY 4.0 | 12/1/0 | 1 | – |
| bl-lWtxIe8FLk | Mangalyaan: A Journey to Mars | Grade 3 | 2.88 | 901 | 26 | Nikhil Gulati | Nikhil Gulati | – | SIL International | CC BY 4.0 | 27/0/0 | 6 | – |
| bl-NqhZ26F97f | Moon Pizza | Grade 3 | 2.65 | 507 | 13 | Anurag Minus Verma | Pankaj Saikia | Rahul Soni | Pratham Books | CC BY 4.0 | 14/0/0 | – | – |
| bl-bZMuyGtMhQ | Mother Works on a Hill | Grade 3 | 2.86 | 604 | 12 | Hansda Sowvendra Shekhar | Mohith O | – | Pratham Books | CC BY 4.0 | 13/0/0 | – | – |
| bl-FBrulNVj3h | Mr Mkhize's quarters | Grade 3 | 3.03 | 634 | 14 | Lindiwe Tshabalala, Lorato Trok | Marleen Visser | – | African Storybook Initiative | CC BY 4.0 | 15/0/0 | 2 | – |
| bl-BA6cZZVUjt | Our Library | Grade 3 | 3.17 | 321 | 9 | Raviraj Shetty | Deepa Balsavar | – | Pratham Books | CC BY 4.0 | 7/3/0 | – | – |
| bl-sSr1HWLVCY | Our Very Own Star: The Sun | Grade 3 | 2.89 | 473 | 9 | – | Daniel Vong | – | NASA - National Aeronautics and Space Administration | CC0 1.0 | 10/0/0 | – | – |
| bl-FIUpYo1KL7 | Rathna and the Ring of Fire | Grade 3 | 2.6 | 234 | 8 | Nandita Jayaraj | Shivam Choudhary | – | Pratham Books | CC BY 4.0 | 9/0/0 | 1 | – |
| bl-gsN0mazwsF | Samira's Awful Lunch | Grade 3 | 3.14 | 717 | 17 | Bharati Jagannathan | Preeti Krishnamurthy | – | Pratham Books | CC BY 4.0 | 18/0/0 | 4 | – |
| bl-Ucyxs3J2iQ | Sringeri Srinivas Learns to Laugh | Grade 3 | 2.57 | 661 | 19 | Rohini Nilekani | Angie & Upesh | – | SIL International | CC BY 4.0 | 19/0/1 | – | vi |
| bl-3xdzTkHClw | The Fox and the Crane | Grade 3 | 3.41 | 234 | 9 | – | Andrew Westcott | – | Andrew Westcott | CC BY-SA 4.0 | 10/0/0 | – | es, jmx-x-EnAm, jmx-x-coi |
| bl-oegxW8pPUn | The Fox and the Goat | Grade 3 | 2.57 | 214 | 10 | – | Andrew Westcott | – | Andrew Westcott | CC BY-SA 4.0 | 11/0/0 | – | es, jmx-x-EnAm, jmx-x-coi |
| bl-XtaBVLbUsM | Tick-tock, tick-tock... | Grade 3 | 2.55 | 413 | 9 | World Education, Inc | Silva Afonso | Isabelle Duston | World Education Inc | CC BY 4.0 | 10/0/0 | 1 | – |
| bl-8XHMoltHcI | Will we get there in time? | Grade 3 | 2.8 | 599 | 16 | – | Joanna Smith | – | Joanna Smith | CC BY 4.0 | 17/0/0 | 12 | – |
| bl-kxS1WhIY3v | Zanele Situ: My Story | Grade 3 | 3.11 | 486 | 13 | Liz Sparg | Jesse Breytenbach | – | Liz Sparg, Jesse Breytenbach, Andy Thesen, and bookdash.org | CC BY 4.0 | 14/0/0 | – | – |
| bl-i2CfCbcKyG | Searching for the spirit of spring | Grades 4-5 | 3.57 | 649 | 11 | Mosa Mahlaba | Selina Masego Morulane | – | Book Dash | CC BY 4.0 | 12/0/0 | 2 | – |
| bl-BpsFSHbUOY | The Hare & the Tortoise (Again!) | Grades 4-5 | 3.62 | 465 | 12 | Venkatramana Gowda | Padmanabh | Divaspathy Hegde | Pratham Books | CC BY 4.0 | 13/0/0 | – | – |
| bl-S2R4QNezp3 | The Lion and the Mouse | Grades 4-5 | 3.55 | 198 | 2 | – | Aesop | – | Bloom Library | CC BY 4.0 | 0/3/0 | 1 | – |
| bl-k9sHUvZcbD | Why Can't We Glow Like Fireflies? | Grades 4-5 | 3.65 | 561 | 11 | – | Samidha Gunjal | – | SIL-PNG Education for Life | CC BY-SA 4.0 | 12/0/0 | – | – |

### Pages left out at the end

Pages after the story that are not part of it, named by a person; the story pages are all kept.

- bl-oh0S2OsR5l Caterpillar Lives in Our Garden: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-pkep1Xedfa Helping Others: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the story.
- bl-pHiPGbsKde Homes: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-xbtUczudzv I Want to Hide: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the story.
- bl-6ryYW1p7iD Nina and Peter: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-OJoRsE9eav Our Values: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-IHMaoTmVrw Sport: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-bw69H3aL6F The Visitors: 1 page(s): The last page is comprehension questions for the class, not part of the book.
- bl-bLA0AsOuuS Transport: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-atsG5ppVC1 Trees: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-oP7kQamjXU What Animals Can You See?: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-LqZJkdOKv7 When Mama Is Away: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-thk2O2wNEG I Colour In: 1 page(s): Page 10 is a note about the meaning of the Mozambique flag (independence struggle), after the book ends.
- bl-PmkkQa8tI7 Little Caterpillar: 3 page(s): The last three pages are a life-cycle fact page, comprehension questions and a drawing activity, after the story ends.
- bl-zhpmHjWPbm Poki Pig: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the story.
- bl-w1XWYHXhyn The Wood Carver: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-yAzknqBbas Who Will Help Me?: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-a5QYD93dfs About Birds: 2 page(s): The last two pages are comprehension questions and a drawing activity for the class, not part of the book.
- bl-W1xCSDTuft My Juggling Granny: 1 page(s): "Dear Reader" questions after the story.
- bl-ZYIJu9ZuAK Satya, Watch Out!: 3 page(s): Pages 18 to 20 are a fact section about how animals move, after the story ends.
- bl-G37Uu0elWo The Plant Whisperer: 1 page(s): Page 23 is a note for grown-ups about the scientist's research, after the story ends.
- bl-U81TOWfdQ7 When I Grow Up: 2 page(s): The last two pages are a page without words and discussion questions for the class, after the book ends.
- bl-5LGuN9YHRf When the Clouds Came Home: 1 page(s): Page 14 is a note for grown-ups about the artist's village (development, climate, and nature revered as gods), not part of the story.
- bl-6rvW9OSAe9 Grandpa Fish and the Radio: 3 page(s): Two coloring pages after the story ("Use your imagination and colour this picture").
- bl-5u99Uj7X4H Ira's Monsoon Feast: 2 page(s): Notes after the story about eating seasonally (Eating Seasonally), not part of the story.
- bl-FIUpYo1KL7 Rathna and the Ring of Fire: 1 page(s): A timeline of Rathnasree Nandivada's life for grown-ups, after the story.
- bl-BpsFSHbUOY The Hare & the Tortoise (Again!): 3 page(s): The last two pages are coloring pages ("colour this picture"), not part of the story; a wordless page before them is then left out too.
- bl-k9sHUvZcbD Why Can't We Glow Like Fireflies?: 2 page(s): The last two pages are do-it-yourself activities ("Make a firefly with a plastic bottle and a glow stick"), after the book ends.

### Text corrections

Each correction as `seed-library/bloom.json` records it (page: from → to; page 0 is the title). The importer stops if a correction no longer matches the book exactly once.

- bl-0msgQEILAb Naughty Cow: p1 ""Come on girl!”" → "“Come on, girl!”"; p2 "animals –sheep, goats, cows and yaks –up" → "animals – sheep, goats, cows and yaks – up"; p4 ""Where is our cow?”" → "“Where is our cow?”"; p6 "“Ask them."" → "“Ask them.”"
- bl-2Bis5QlQwQ Water is Coming.: p1 "water pump will work” answered" → "water pump will work,” answered"; p2 "Come” called Padma" → "Come,” called Padma"; p2 "coming.” ​" → "coming.”"; p4 "called Padma “Water" → "called Padma. “Water"; p5 "called Padma “Water is coming."" → "called Padma. “Water is coming.”"; p6 "Padma called, “Water is coming”." → "Padma called. “Water is coming.”"; p8 "Padam called “Water" → "Padma called. “Water"; p9 "Come.” She called “Water" → "Come,” she called. “Water"; p10 "Cousin is making monos. "Achi, Achi. Come," said Padma, "Water is coming."" → "Cousin is making momos. “Achi, Achi. Come,” said Padma. “Water is coming.”"; p11 ""Now everyone will get water," said Padma happily. "Yes, we will all get water!" Dechen smiled." → "“Now everyone will get water,” said Padma happily. “Yes, we will all get water!” Dechen smiled."
- bl-2YIynlyAt7 Smart Sona Helps Her Mother: p12 "waist.Chun-chanan-chan" → "waist. Chun-chanan-chan"; p13 "laughed Sona.“Silence" → "laughed Sona. “Silence"
- bl-3NpGshx2Po Who Stole Bhaiya's Smile?: p0 "Who Stole Bahaiya's Smile" → "Who Stole Bhaiya's Smile?"; p3 "want to," Bhaiya says. "I am" → "want to,” Bhaiya says. “I am"; p12 "pretty?" Chiru says. “They are okay, Chiru.” Bhaiya says." → "pretty?” Chiru says. “They are okay, Chiru,” Bhaiya says."
- bl-5u99Uj7X4H Ira's Monsoon Feast: p4 "take one,when our hands are full,‌we are done" → "take one, when our hands are full, we are done"
- bl-6rvW9OSAe9 Grandpa Fish and the Radio: p11 "take them away!They could be coming to your river very soon!"" → "take them away! They could be coming to your river very soon!”"; p14 ""Please tell your father to come and see me immediately,"" → "“Please tell your father to come and see me immediately,”"
- bl-8XHMoltHcI Will we get there in time?: p1 "doesn’t make to Attara" → "doesn’t make it to Attara"; p2 "“Let’s go, Mum,” She said." → "“Let’s go, Mum,” she said."; p3 "as driver kept trying" → "as the driver kept trying"; p5 "thought Zompa “We" → "thought Zompa. “We"; p6 "thought Zompa “We" → "thought Zompa. “We"; p6 "the Conductor and" → "the conductor and"; p7 "the Driver yelled" → "the driver yelled"; p12 "other side of river" → "other side of the river"; p12 "in time,” She cried." → "in time,” she cried."; p13 "“Oh, no.” cried everyone on the bus as they lent out" → "“Oh, no!” cried everyone on the bus as they leant out"; p13 "see us and stop,” thought Zompa, as she held her breath.Yes." → "see us and stop?” thought Zompa, as she held her breath. Yes."; p16 "said Zomba to the driver, “You are" → "said Zompa to the driver. “You are"
- bl-AlIhhm6Df3 A wise crow: p1 "in search for water for drinking" → "in search of water to drink"; p2 "tried to fly back. To the tree" → "tried to fly back to the tree"; p6 "The crow put his mouth and drunk the water droplets." → "The crow put his mouth in and drank the water droplets."; p7 "satisfied.." → "satisfied."
- bl-CHLB3IYhFE Anna is a Big Girl: p4 "remind me mama." → "remind me, Mama."; p8 "“I’m big now Mama,”" → ""I'm big now, Mama,""
- bl-Ck8ZoY71QY Khalai talks to plants: p2 "ripe oranges."" → "ripe oranges.”"; p3 "don’t dry up."" → "don’t dry up.”"; p4 "in my hair."" → "in my hair.”"; p5 "under your shade."" → "under your shade.”"; p6 "from bad people."" → "from bad people.”"
- bl-ERMHxDymEF Anansi and Turtle: p5 "hungrier and hungrier" → "hungrier and hungrier."; p6 "And Turtle dived" → "And Turtle dived"
- bl-FBrulNVj3h Mr Mkhize's quarters: p12 "give you your money back. " → "give you your money back.” "; p13 "atchaar" → "atchar"
- bl-FIUpYo1KL7 Rathna and the Ring of Fire: p1 "Today is a day like no other" → "Today is a day like no other."
- bl-FewlLlor3n The Fox and the Crow: p3 ""My Miss Crow," → ""My, Miss Crow,"; p5 "Begged the fox." → "begged the fox."; p9 "A Pity about" → "A pity about"
- bl-JTp5wxctcI Miss Tiny Chef: p2 "ming- ling stick" → "mingling stick"; p4 "loud- ly" → "loudly"
- bl-MISNo6Z1OP Amazing Daisy: p3 "sky," Daisy said." → "sky," Daisy said."; p8 "chick- ens" → "chickens"; p13 "flap- ped" → "flapped"; p14 "BAM !" → "BAM!"
- bl-MJt3XUbsiU Forgetful Dida: p7 "forgetmy" → "forget my"
- bl-MozyTFFFRR Tortoise Finds his House: p4 "whizzed away.“But" → "whizzed away. “But"
- bl-N2O83BGUNs Kaushik, the Kind Detective: p4 "for a first time detective" → "for a first-time detective"; p6 "a brave voice,"Who" → "a brave voice, "Who"; p8 "for few minutes" → "for a few minutes"
- bl-Npv1Gjw0SC Goplu's Train Ride: p5 "vegetables.They" → "vegetables. They"; p13 "Sunil uncle’s gift" → "Sunil Uncle’s gift"
- bl-OtPErgGATN Yapo Saves the Day: p7 "pep talk, ‘Play together and pass the ball to whoever is free!' 'Yapo," → "pep talk. ‘Play together and pass the ball to whoever is free!’ ‘Yapo,"; p9 "back into the game, ‘The score" → "back into the game. ‘The score"; p11 "‘GOAL!’ cried Coach Tazi." → "‘GOAL!’ cried Coach Tazi."; p12 "Congratulations for a mighty comeback" → "Congratulations on a mighty comeback"
- bl-R3YJdUYpQn Full of Light: p6 "poop,” Shakthi said." → "poop,” Shakthi said."; p7 "“It’s a peacock!” The girl said" → "“It’s a peacock!” the girl said"; p13 ""Yes, Amma,”" → "“Yes, Amma,”"; p15 ""I am a champion at cutting straight lines."" → "“I am a champion at cutting straight lines.”"
- bl-S2R4QNezp3 The Lion and the Mouse: p2 "said the Mouse.“Now" → "said the Mouse. “Now"
- bl-SkbPuCPZd0 The day the Sun went away: p7 "Meanwhile,on" → "Meanwhile, on"; p11 "Lotsof" → "Lots of"; p12 "back,”she beamed" → "back,” she beamed"
- bl-TcM4yYeFkq Deepa's Resolution: p3 "asked "Grandpa, if you plant a tree now, when will the tree grow and when will you get fruits? "" → "asked, "Grandpa, if you plant a tree now, when will the tree grow and when will you get fruits?""; p4 "answered "The" → "answered, "The"
- bl-U4W4NFvz2l Zibu & Zizo: p12 "'We look the same, but we are different and like different things and that's okay.'" → "‘We look the same, but we are different and like different things and that’s okay.’"
- bl-U6Ym2v9aZX Clever Cat: p10 "“Purr! Purr! Purr!" → "“Purr! Purr! Purr!”"
- bl-UKTKWVO4tI Icecream in Spiti: p2 "Wangmo, “We boarders" → "Wangmo, “We boarders"; p2 "in the holidays."" → "in the holidays.”"; p5 "she saidas she" → "she said as she"; p6 "come? they asked." → "come?” they asked."; p6 "said Dolkar, “There are so many different favours" → "said Dolkar. “There are so many different flavours"; p6 "I wish I can try one" → "I wish I could try one"; p6 "hide them in your bag." → "hide them in your bag.”"; p10 "herself, “What has" → "herself, “What has"; p10 "seewhat" → "see what"; p11 "said Dolkar, “But something" → "said Dolkar, “but something"; p12 "said Dolkar, “They didn’t stayfrozen!”“Ice cream need" → "said Dolkar. “They didn’t stay frozen!” “Ice cream needs"; p12 "frozen!”laughed Pema.“We" → "frozen!” laughed Pema. “We"; p12 "Wangmo,as" → "Wangmo, as"; p13 "said Dolkar, “when you come to KazaI will" → "said Dolkar. “When you come to Kaza I will"
- bl-W1xCSDTuft My Juggling Granny: p4 "Spoiltsports" → "Spoilsports"
- bl-W9BZOhXDw9 I can do this!: p9 "classroom.”Amelia" → "classroom.” Amelia"
- bl-WDAU6pRXg5 Mini's house: p1 "her Mom and dad" → "her mom and dad"; p2 "Mini likes Keer" → "Mini likes Kheer"
- bl-XtaBVLbUsM Tick-tock, tick-tock...: p2 "I do not want to be tailor." → "I do not want to be a tailor."
- bl-YfFjdYu19T Sunday at the park: p3 "play on the see saw. I wonder which one of us is heaviest?" → "play on the seesaw. I wonder which one of us is heavier?"
- bl-edobKpbCK5 Rabbit under the tree: p6 "about what she heard. She started" → "about what he heard. He started"; p8 "The horse starts to run" → "The horse started to run"; p9 "asked,“Why" → "asked, “Why"; p10 "So Donkey starts running too." → "So Donkey started running too."; p12 "The cow is worried and starts to run as well." → "The cow was worried and started to run as well."; p15 "running?’’" → "running?”"
- bl-foadKZ4Asb Ou Ou Wants to Have Friends: p1 "Ou Ou, the little porcupine likes" → "Ou Ou, the little porcupine, likes"; p7 ""What quills?”" → "“What quills?”"; p9 "my prickly friend, ” the little mouse says. “ I have" → "my prickly friend,” the little mouse says. “I have"; p12 ""We're sorry, Ou Ou," they say." → "“We’re sorry, Ou Ou,” they say."
- bl-gsN0mazwsF Samira's Awful Lunch: p3 "“Oh, yes ! They" → "“Oh, yes! They"; p10 "halfeaten" → "half-eaten"; p13 "noodles,” and ran" → "noodles,” and ran"; p17 "up. ‘How nice my parathas and brinjal curry are,’ she thought and quickly ate them up." → "up."
- bl-hePTMk0ymw The Big Juicy Mango: p3 "spreading it's branches" → "spreading its branches"; p5 "First comes the flowers" → "First come the flowers"
- bl-i2CfCbcKyG Searching for the spirit of spring: p9 "as she a passed" → "as she passed"; p10 "needed.With" → "needed. With"
- bl-i57MwJlCEv Dudu's Hat: p4 ""OK," says Dudu. "I'll count to three."" → "“OK,” says Dudu. “I'll count to three.”"; p4 ""One . . . " says Dudu slowly. "two" . . . "THREE!"" → "“One . . .” says Dudu slowly. “Two . . .” “THREE!”"; p6 "laugh so hard, Dudu has to hold her tummy. she says. "AGAIN!"" → "laugh so hard, Dudu has to hold her tummy. “AGAIN!” she says."; p7 "counts, ​“One" → "counts, “One"; p8 ""Again!" says Dumisani." → "“Again!” says Dumisani."; p9 "“Ah, please, Dudu?” says Dumisani." → "“Ah, please, Dudu?” says Dumisani."; p11 "shout,lifting their arms in victory. "Yes!"" → "shout, lifting their arms in victory. “Yes!”"; p13 ""Teacher!" Dudu shouts" → "“Teacher!” Dudu shouts"
- bl-ilT4d1OEUU Andiswa Soccer Star: p0 "Andiswa Soccer" → "Andiswa Soccer Star"; p1 "if she can practise with them" → "if she could practise with them"; p5 "let her to play" → "let her play"
- bl-lWtxIe8FLk Mangalyaan: A Journey to Mars: p2 "And yet it, is so far away" → "And yet it is so far away"; p7 "Research Organisation (ISRO) launched" → "Research Organisation (ISRO) launched"; p17 "Mission Control" → "Mission Control"; p23 "It is called Gaganyaan." → "It is called Gaganyaan."; p24 "Sun and Earth." → "Sun and Earth."; p26 "(oval) in shape. ​" → "(oval) in shape."
- bl-mScXjHSaTx Juliana Wants a Pet: p1 "name him Swimmer" → "name him Swimmer."; p3 "name it Fluffy" → "name it Fluffy."; p4 "following her around" → "following her around."; p5 "She named the puppy Happy" → "She named the puppy Happy."
- bl-qELPLaz9lr Papa's Shamba: p2 "planted.The" → "planted. The"; p4 "one of the giant pumpkin." → "one of the giant pumpkins."; p5 "This are neighbor's cows feeding on papa's" → "These are the neighbor's cows feeding on Papa's"
- bl-sQ5PBtPOBk Mbone and Akinyi: p1 "sisters.They" → "sisters. They"; p3 "a ride on his car" → "a ride in his car"; p4 "their grandparent's home" → "their grandparents' home"; p6 "their grandparent's cattle" → "their grandparents' cattle"; p6 "The animals were peacefully as they played." → "The animals grazed peacefully as they played."; p8 "their grandparent's home" → "their grandparents' home"; p8 " The End..." → ""
- bl-scfTyZM5tr Piu...Piu...Piu: p2 "squeal, "Piu…piu." The chickens cluck, "Couck... couck."" → "squeal, “Piu… piu.” The chickens cluck, “Couck… couck.”"; p3 ""Curru...curru,"" → "“Curru… curru,”"; p4 ""Now let's go see the goats," says Maria. "They eat grass!" says Carlos. "We should pull up some grass to feed the goats." "No," answers Maria, "The goats can feed themselves."" → "“Now let's go see the goats,” says Maria. “They eat grass!” says Carlos. “We should pull up some grass to feed the goats.” “No,” answers Maria. “The goats can feed themselves.”"; p5 ""Meee... meee."" → "“Meee… meee.”"; p5 "“ Do you know" → "“Do you know"; p7 "has not eaten,”says Carlos" → "has not eaten,” says Carlos"; p7 ""Whaf..whaf." He seems to be saying, "I'm hungry."" → "“Whaf… whaf.” He seems to be saying, “I'm hungry.”"; p8 ""Whaf..whaf," barks" → "“Whaf… whaf,” barks"; p9 "Mary replies" → "Maria replies"
- bl-v8o0OxKOr6 Paper Play: p1 ""Oh, this looks horrible! she said." → "“Oh, this looks horrible!” she said."; p5 "Bittus hands" → "Bittu’s hands"
- bl-xNeM7BMoKZ The Royal Toothache: p2 "toothache since two days" → "toothache for two days"; p8 "teeth everyday" → "teeth every day"; p10 ""Alright," laughed" → "“Alright,” laughed"
- bl-z1IlL1iI4k Sam Uncle: p1 "lives in Saket area of new Delhi." → "lives in the Saket area of New Delhi."; p2 "drops me everyday to my school" → "drops me every day at my school"; p2 "Mehrauli,New Delhi" → "Mehrauli, New Delhi"; p2 "at 7 AM." → "at 7 AM."; p2 "always follow the traffic rules" → "always follows the traffic rules"
- bl-z1odsw2Oe7 Mary: p4 "brother.Tom" → "brother. Tom"; p9 "my grandparents home" → "my grandparents' home"; p10 "my grandparents home" → "my grandparents' home"; p10 "eat and say stories" → "eat and tell stories"; p11 "my grandparents home" → "my grandparents' home"; p11 "I always love opening of school" → "I always love the opening of school"; p11 "good morals which helps us" → "good morals which help us"

### Pictures with no license or copyright: other limits

Books left out only because more than 2 of their pictures carry no license and no copyright, that would pass every other automatic check (not yet read for content) at a higher limit: at most 3: 0; at most 5: 1; any number (still not most of the pictures): 1; any number, even when most or all pictures are unlabeled: 169.

### Scanner flags reviewed by a person

- bl-LKE0zR5qKe The Sea: The contact-details check matched "They run up to meet me" (waves on a beach); a person read it: no personal details.
- bl-DhU02tDwAo Curious baby elephant: The contact-details check matched a line on page 14 (Crow's warning to Baby Elephant); a person read it: no personal details.
- bl-tL6sbfQUTf How Ant Saved Dove: The scanner read "had not drunk water" (an ant that is thirsty) as a drug word; a person read it: fine.
- bl-3NpGshx2Po Who Stole Bhaiya's Smile?: The contact-details check matched page 11 ("It's all in your head ... everyone says."); a person read it: no personal details.
- bl-NqhZ26F97f Moon Pizza: The scanner flagged brand names said in passing (YouTube, a Natraj eraser); a person read it: nothing to change.
- bl-bZMuyGtMhQ Mother Works on a Hill: The scanner flagged "blood pressure", "blood sugar" and children "jabbed" with vaccines (a nurse at work); a person read it: fine.
- bl-Ucyxs3J2iQ Sringeri Srinivas Learns to Laugh: The scanner flagged "the scariest frown in the world" (a grumpy farmer's frown); a person read it: a funny story, fine.
- bl-S2R4QNezp3 The Lion and the Mouse: The scanner flagged "to kill her" (the Lion's paw on the Mouse in Aesop's fable, which he lets go); a person read it: mild peril, fine.

## Left out

| Id | Title | Reason |
| --- | --- | --- |
| bl-0uZZN80N6l | 26 - My Family | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-YEi7I6Aizd | 26 - My Family | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-6BbJdtQhZj | Sam and Max | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-EZQwFKDYYX | Sam and Max | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-VuqIp7h2Md | Sam and Max | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-juSlWu134O | Sam and Max | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-rjHhHqFDFJ | Sam and Max | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-91DBpKpAGH | Story 14: Arya in the Cockpit | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-CxTS2B7OM0 | Story 4: Lara the Yellow Ladybug | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-Ihtv3RuicS | Story 6: How can I keep safe? | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-NsObwt1f5K | Story 9: Rainbow Boys | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-BOmiXQoXB1 | The hungry caterpillar | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-AhXAfoMwCD | The Lizard and the Hyena | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-E99qyOROmD | The Ocean | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-PtptU9KDJZ | The Ocean | 10 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-ya7yPjrAX9 | 21 - The New Boy | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-AAek0QBC7m | 23 - The New Boy | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-QBnPMGmFDz | 26 - Who Will Help Me? | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-zC2khpmAUC | 26 - Who Will Help Me? | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-hIW297bgYV | Azizi the doll | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-2MR0E1NwPY | Day and Night | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-QaH0HbpZoE | Day and Night | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-c5LxP5M7uo | Day and Night | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-cPsZu2Tomc | Day and Night | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-wz5fqr1FUM | Day and Night | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-QrkkRpHCHD | Lango Folk Story: Mr Hare and the Giant Elephant | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-YWhoOAE2Ai | Story 1: In Search of a Name | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-Lh3neBG5hL | The New Boy | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-2BT8fyt2Cq | Who Will Help Me? | 11 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-W4kWd8VcQR | 19 - Friends | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-iVA8hiF8eZ | 19 - Friends | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-fi6lCbwNnF | 20 - Greetings | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-sqSbbkpykS | 20 - Greetings | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-SmJXjCMmy5 | 21 - Christmas in PNG | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-JNtOE6bNTK | 22 - Christmas in PNG | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-GnwLfoNHnB | 23 - Little Caterpillar | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-aM4GDCecGX | 23 - Little Caterpillar | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-1vATlKeHH1 | 25 - The Wood Carver | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-m1F4Y0ghpk | 25 - The Wood Carver | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-5KUCayLXBc | 27 - My Food Garden | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-qeIwNFCFlG | 27 - My Food Garden | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-H5SlfUpDu3 | 30 - When Mama Is Away | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-g3AWPcb4oY | 30 - When Mama Is Away | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-6qFJtXuDsa | 31 - The Visitors | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-FHh1zICQTt | 31 - The Visitors | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-mSjeQyVSqx | Christmas in PNG | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-pAz5JqsVX1 | Greetings | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-0qgD9yuLj8 | Little Caterpillar | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-PWqrLWc0FU | My Food Garden | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-RooEH5ViwM | The Visitors | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-aHZHUTAXXH | The Wood Carver | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-F20eUIT4fE | When Mama Is Away | 12 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-cMQUlOGLna | 20 - PNG Coffee | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-pVfY3CekbX | 22 - PNG Coffee | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-IDpjawtXL2 | 25 - Our Friend John | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-pXSQZTAjJf | 25 - Our Friend John | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-OUOIFxiju1 | 28 - Poki Pig | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-qJ2NoA65Oo | 28 - Poki Pig | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-tFAzmHFAmU | Dina's Magical Garden Adventure | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-SMlAOnTOl4 | Men or Women | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-60ABz4pMjt | Our Friend John | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-GBTk1NCXc4 | PNG Coffee | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-7iKFO61y9K | Poki Pig | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-WdRuZPxhtZ | Porridge | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-kIUpAOdvLh | Story 8: Rainbow Girls | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-9IRQ9v5Naw | What's happening? | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-XcX1kY5S7R | What's happening? | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-bYPaGAWHnW | What's happening? | 13 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-SjEG9OEbuZ | 22 - Jobs | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-hIxF4Cxp6D | 22 - Jobs | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-6OAJnR2Xjr | 23 - Peter's Peanuts | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-LETnc2a0IA | 23 - Peter's Peanuts | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-KPFaZ8HKrh | 24 - Rat and Frog | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-PMDSGRoeKy | 24 - Rat and Frog | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-6BS5oWllpS | 32 - Trees | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-ZW105k5ebY | 32 - Trees | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-J0qOLtUbc9 | Jimmy's Hat | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-rzLlpDoTNY | Jimmy's Hat | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-XOkXGBmjIh | Peter's Peanuts | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-GM2d8zzvqA | Rat and Frog | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-GEASuFJmzy | Trees | 14 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-Bn5Qaywfiq | 25 - My Body | 15 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-ra0s0TdqAm | 25 - My Body | 15 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-xtdpHJIAXs | My Body | 15 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-KBJ3cV8cgf | (3-5) Spider, Spider | 16 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-8e1RXpRg8T | How to Use Bitcoin: Part 1 - Setting Up a Bitcoin Wallet | 16 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-mmA9KbSJhv | 20 - About Birds | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-zeFqatqbh1 | 23 - About Birds | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-JnwdmIbQ07 | 24 - Nina and Peter | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-PbMwDjg8dw | 24 - Nina and Peter | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-3oH7YFgGnE | 27 - Papa and the Snake | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-Hwi5hzzTw2 | 27 - Papa and the Snake | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-1YKOpmDu2I | 29 - Transport | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-NUEsLVufwu | 29 - Transport | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-Rxbu9ZaIcQ | About Birds | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-TsnZCn8DfH | Nina and Peter | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-MEuXBoxeds | Papa and the Snake | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-Js9smfTTTX | This is for me! | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-ikqgz2BKoz | Transport | 17 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-nsGm7GykIp | 22 - Homes | 19 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-wV5iMUk8Ei | 22 - Homes | 19 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-FM7nsAABZ4 | 30 - Sport | 19 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-dCYYzmUAcx | 30 - Sport | 19 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-0OXJZoJ3Vm | Homes | 19 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-cjc8mPZjmP | Sport | 19 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-soAaU1BvZL | Story 15: Zanele Situ: My Story | 20 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-NGKdbTPAxl | 29 - Our School | 21 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-caLbn8MFaj | 29 - Our School | 21 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-RGJ4MtR1Hp | 33 - What Animals Can You See? | 21 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-dgASTA1bVU | 33 - What Animals Can You See? | 21 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-p6hf7rbvHw | Our School | 21 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-HbMXExUscg | What Animals Can You See? | 21 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-WzgQWtRJQv | Story 12: The Boy Who Cried Wolf | 3 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-5swN9mptnm | Story 13: The Turtle and the Rabbit | 3 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-WKMcDW54yI | Story 7: The Crow and the Pitcher | 3 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-R4GVmH676W | Clouds | 4 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-wmBMtIUNAM | Clouds | 4 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-xmdFLR6W2D | Clouds | 4 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-0TZK4PH7ug | Story 5: Loco, the Timid Train | 4 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-8lvw9ww08k | My Template | 5 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-0ZBddHmFKx | Bat and his friends | 6 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-EDwPii1qzf | Bat and his friends | 6 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-UF2zMjM0gk | Bat and his friends | 6 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-clKST4qn0x | Bat and his friends | 6 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-QyRR1qnIcp | Juliana Wants a Pet | 6 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-vf2vLAhx2s | Suynsɨ | 6 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-36eOiU847M | Cow in the Room | 7 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-ky5rZAnOPS | My Mother's Grocery | 7 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-5ZmvATEDnj | Sesona's Spring Surprise | 7 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-c76Cl6ghKu | Superfrog's Swamp Adventure | 7 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-kLScCuh5GP | Superfrog's Swamp Adventure | 7 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-eH6fFwltCk | The Wisdom of the Oak Tree | 7 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-77tDxRs3Cz | 23 - I Want to Fly | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-8fInaeGQ7J | 23 - I Want to Fly | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-H1sUBoxMFX | 28 - My People | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-cMh4czXW8z | 28 - My People | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-E5Vzj3MXy4 | A home for Curly | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-Ehn3iOGJE3 | A home for Curly | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-Szg3tGpGaE | A home for Curly | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-fyT7TZtCF7 | A home for Curly | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-rPrO8DtP03 | A home for Curly | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-1qayT8KSo7 | Daddy goes to work | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-KAd0Pb7l7R | Daddy goes to work | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-MALcvHseMZ | Daddy goes to work | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-UTljneJLfy | Daddy goes to work | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-PxMim82j5x | I Want to Fly | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-0Isxb3EsEH | Market | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-nDwtsoBiH4 | Market | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-sBM7XnLIHA | Market | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-x8hFwgJO1f | Market | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-osWJ1pLePv | Moses and the Very Good Farm | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-BcRDN7TR1v | My People | 8 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-fD5yjJKLLx | 21 - Caterpillar Lives in Our Garden | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-fHImc0W7b9 | 21 - Caterpillar Lives in Our Garden | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-5mFX6PlCvR | 21 - Helping Others | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-VPVSZpIIdx | 21 - Helping Others | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-Reppvlpown | 24 - I Want to Hide | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-h9VwSsV2FX | 24 - I Want to Hide | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-jOlicZ16Qh | 26 - Our Values | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-mdwKtzIYe0 | 26 - Our Values | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-hwIO6OkyGs | Caterpillar Lives in Our Garden | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-XdXvn6DKLe | Helping Others | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-s4h242oEK6 | I Want to Hide | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-AlODadq4Ux | Lala's Masterpiece | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-KtfTCy5E4w | Our Values | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-WRtjhU7Phz | Pamanyaup karing Aliwa Helping Others | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-vVePpIZGbr | The big tortilla | 9 pictures have no license or copyright (at most 2 may take the book's license) |
| bl-8hjva1rIJX | Goldilocks and the three bears  | book HTML missing |
| bl-uiRajtIZsU | How Little Ant Thanked White Bird | book HTML missing |
| bl-bWJ8ag8AJT | Samuel Tells Time | book HTML missing |
| bl-2JzFJHIh4m | Veggie Veggies  | book HTML missing |
| bl-h978JlTJDs | (2-3) Who will Help Me? | book license: no clear version (cc-by) |
| bl-ZH2ooKZVMe | Ada' Beauty | book license: no clear version (cc-by) |
| bl-319zmKzsOE | Edible Plants | book license: no clear version (cc-by) |
| bl-NFFj1HRFCF | Edible Plants | book license: no clear version (cc-by) |
| bl-q9HtK4ppUI | (16) What are You Doing? | cover picture has no license and another copyright holder |
| bl-cNO74jgvHi | A5-How do you Sleep? | cover picture has no license and another copyright holder |
| bl-R06kiDXSLQ | Baby Goats | cover picture has no license and another copyright holder |
| bl-qZDONexRyk | Baby Goats | cover picture has no license and another copyright holder |
| bl-6TyhWQfcXP | Big Blue Bus | cover picture has no license and another copyright holder |
| bl-JvBzFXdtE2 | Big Blue Bus | cover picture has no license and another copyright holder |
| bl-Uev3g1l0aT | Big Blue Bus | cover picture has no license and another copyright holder |
| bl-obpMg3wezJ | Big Blue Bus | cover picture has no license and another copyright holder |
| bl-yDwIbHxsZQ | Big Blue Bus | cover picture has no license and another copyright holder |
| bl-mUNAZUbF8z | Chameleon Races Rabbit | cover picture has no license and another copyright holder |
| bl-xGPW8wwY2i | Chameleon Races Rabbit | cover picture has no license and another copyright holder |
| bl-vpBHfINGuc | El burro flojo | cover picture has no license and another copyright holder |
| bl-4B0IIahHE0 | How do you Sleep? | cover picture has no license and another copyright holder |
| bl-4xxnIxtj2s | How do you Sleep? | cover picture has no license and another copyright holder |
| bl-mHzDv4Oja2 | How do you Sleep? | cover picture has no license and another copyright holder |
| bl-nGloCTbWEq | How do you Sleep? | cover picture has no license and another copyright holder |
| bl-YMtL3fzKPA | I Want to Fly | cover picture has no license and another copyright holder |
| bl-tWHJpq4RAv | I Want to Fly | cover picture has no license and another copyright holder |
| bl-grS3mPPrz6 | Kálugúran Friends | cover picture has no license and another copyright holder |
| bl-lvC98rp9oL | Let's be Friends! | cover picture has no license and another copyright holder |
| bl-o14Q3BCOfl | Let's be Friends! | cover picture has no license and another copyright holder |
| bl-tMq6qoCvE7 | Let's be Friends! | cover picture has no license and another copyright holder |
| bl-Pnsz9WtI2h | Let's Eat! | cover picture has no license and another copyright holder |
| bl-B1YGzcJTML | Meera and Ameera | cover picture has no license and another copyright holder |
| bl-uIR3b2RSSk | Meera and Ameera | cover picture has no license and another copyright holder |
| bl-hpC7zh0UC8 | Metung, Adwa, Atlu One Two Three | cover picture has no license and another copyright holder |
| bl-LEZQZpgBd1 | My Food Garden | cover picture has no license and another copyright holder |
| bl-ZDjP4WXfHI | My Food Garden | cover picture has no license and another copyright holder |
| bl-15k9Mnq5Hc | Parts of the face | cover picture has no license and another copyright holder |
| bl-Uale8s5Bcn | Sara’s Canoe | cover picture has no license and another copyright holder |
| bl-MNnndjQQeU | Sendi and Lins | cover picture has no license and another copyright holder |
| bl-xtXGiE8y6D | Square-How Do You Sleep? | cover picture has no license and another copyright holder |
| bl-2TmUvE03X3 | The Brave Children and the Jackal | cover picture has no license and another copyright holder |
| bl-SuEBxRnKI9 | The hyena and the mintor lizard | cover picture has no license and another copyright holder |
| bl-6aWweGnlGe | The Lazy Little Donkey | cover picture has no license and another copyright holder |
| bl-JirdzGcera | The Lazy Little Donkey | cover picture has no license and another copyright holder |
| bl-POVk4CufLB | The Lazy Little Donkey | cover picture has no license and another copyright holder |
| bl-8ir3HIdVb5 | The Lion and the Mosquito. | cover picture has no license and another copyright holder |
| bl-lISu2PVGQW | The Lion and the Mosquito. | cover picture has no license and another copyright holder |
| bl-laVgIQsrnI | The Lion and the Mosquito. | cover picture has no license and another copyright holder |
| bl-UCBNR9PTnC | The Yellow Bucket | cover picture has no license and another copyright holder |
| bl-FMnmQKyvvb | ఉంది రండు మూంద్ | cover picture has no license and another copyright holder |
| bl-PNKyibrhZW | “The Three Birds” | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-fYlpA88x3L | “The Three Birds” | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-vPftT2H1eE | A5-Why Can't We Glow Like Fireflies? | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-Ox5PmFY8aU | A6-Why Can't We Glow Like Fireflies? | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-w9tA0SvGaP | Amina | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-NSaLWWBOG0 | Baby Talk | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-Mx35hd6hra | Bea and Ming-Su | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-WE8csCRmao | Bea and Ming-Su | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-cRVFFT8gC6 | Beloved Daughter | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-qpzx5BgBab | Beloved Daughter | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-9plqXqVHVh | Chisay | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-G7v5VqmsLr | Chisay | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-79qaw3wwYo | Crocodile Daydreams | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-TkoqA1vlwX | Dangerous Objects | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-8TkkVdChFF | Decodable Reader | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-EZuaGsWqg6 | Gown | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-OjtqqJKfmj | Healthy Body | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-WWAP3XlEys | Healthy Body | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-CqKtcrrF5T | In The River | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-ZCaQ926ERY | In The River | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-HkNjTm7PGg | John's Boat Journey | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-mB4cHGefUi | Melay and the Vegetables Garden | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-l9tQFtZNkc | Monster in Harembo | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-8SZn1LycQQ | My Blind Classmate | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-zSf7RUGZOG | My Blind Classmate | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-YqdLRAH31f | Names of Some Animals in Oko | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-NZS6Wqq9fu | Nani's Durian | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-eX40kysRK8 | Sam and the Big Fish The consonants: s, m, b, f, k, p, d, g | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-T53xjAVDKZ | The Comb of Pipay | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-vuY9gSIy6W | The Comb of Pipay | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-CfK0V9f8CM | The Family | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-P5nz6lUBHD | The Family | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-l8FLaHrPoD | The Family | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-G6hgCAJ8qI | The Model Boy | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-Vsp44G90yw | The New Baby. | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-2v3RvlCJk8 | The Young Crow | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-5z5IyJDESz | The Young Crow | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-M2sU6aQcYE | Toby and the Talking Tree | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-T5BO8YdRAU | Wake Up!! | cover picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-h6yttUaX78 | Animals | cover picture is BY-SA, stricter than the book's CC0 1.0 |
| bl-CZ3rCdtmbu | All About Rockets | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-J1OGBeC148 | Nanpat lui ကိန်းများ(1-10) | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-xjORHVhfUG | Nanpat lui ကိန်းများ(1-10) | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-dPvaqP6AbL | Numbers | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-gdl9gOW0X1 | Numbers | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-gwhY9nS8V4 | Numbers | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-qGP8RcKuqN | Numbers | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-usYSo1DeuC | Numbers | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-IQebf8X2oK | The Cat and the Rat | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-dAzC0Fubt7 | की अहाँ ऐ चिड़ै सभकेँ देखने छी?Have You Seen These Birds? (Maithili-English) | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-b2l5wesxCp | घर सभ Houses (Maithili-English) | cover picture is BY, stricter than the book's CC0 1.0 |
| bl-wRkOGAOMu8 | If I didn't believe... | cover picture is credited to 123rf, whose terms are not an open license |
| bl-fWPnqvLy10 | Actions in a Room Phase 1, Unit 03, Game 02 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-Gw1EiwAONr | Common Objects Phase 1, Unit 4, Game 4 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-hGeAFGfpGl | Furnishings 1 Phase 1, Unit 02, Game 01 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-9LoN9DmWs8 | Hold and Touch Phase 1, Unit 3, Game 6 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-qDw6RtKk67 | Hold and Touch Phase 1, Unit 3, Game 6 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-uQAmW6W8oG | Human Body 2 Phase 1, Unit 5, Game 3 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-dvIdeY2Dsc | Human Body 2 Phase 1, Unit 6, Game 4 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-eFq5qqG95z | Look around the room Phase 1, Unit 03, Game 01 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-ggfaMZKaos | Lots of Places Phase 1, Unit 04, Game 05 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-ByEnXdfdD0 | Meet More Family. Phase 1, Unit 5, Game 5B Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-e4MsZuT6j6 | Meet More Family. Phase 1, Unit 5, Game 5B Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-TRf7cMtbtW | Meet the Family Phase 1, Unit 5, Game 5 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-sZOlgfC7lo | Object Positions 1 Phase 1, Unit 02, Game 03a Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-OtKxUbVY9P | Objects in the kitchen; more Animals Phase 1, Unit 03, Game 03a Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-ME1hyDsxyQ | People from Head to Toe | cover picture is credited to Canva, whose terms are not an open license |
| bl-hGBOxjGSOQ | People from Head to Toe Phase 1, Unit 5, Game 1a Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-vHEI0dNlXk | Person Actions 4 Phase 1, Unit 02, Game 04 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-ruxeODdJFU | Phrases 01: In the Classroom Phase 1, Unit 01 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-ripeVC0HxF | Phrases 4 Phase 1, Unit 4, Game 7 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-MrKQBYrvlz | Si Piak | cover picture is credited to Canva, whose terms are not an open license |
| bl-wbvUwmv1v1 | Tails and Horns and Stuff Phase 1, Unit 5, Game 4 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-eSEa1A6LYa | Things in the house again Phase 1, Unit 4, Game 1A Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-gh8UnzwCnu | Touch Commands 1 Phase 1, Unit 02, Game 03c Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-hHuBozXoUI | Us in Action Phase 1, Unit 4, Game 02 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-3Ozjs6kgxr | Useful Phrases 02 Phase 1, Unit 02 05 Mvskoke Growing Bilingual Community | cover picture is credited to Canva, whose terms are not an open license |
| bl-7JwWyuv0XC | Where the Pet Sat? | cover picture is credited to Canva, whose terms are not an open license |
| bl-bo1ijOBU3c | Where the Pet Sat? | cover picture is credited to Canva, whose terms are not an open license |
| bl-InXagbnVld | Nchînɨ̀ ì jùŋ | cover picture is credited to Clipart, whose terms are not an open license |
| bl-BFzbZCtHuD | Yi n-fom sɨ nà gâmtì à! | cover picture is credited to Clipart, whose terms are not an open license |
| bl-5asC5j8MKM | A Class Trip | cover picture is credited to google, whose terms are not an open license |
| bl-oFZfXOKj0R | Dog's Day | cover picture is credited to google, whose terms are not an open license |
| bl-xTmMj12K5M | My Cat | cover picture is credited to google, whose terms are not an open license |
| bl-4EoRdA3ov4 | Little Bird Learns Her Lesson | cover picture is credited to Microsoft, whose terms are not an open license |
| bl-vxHjzmS3vn | Our Home | cover picture is credited to pexels, whose terms are not an open license |
| bl-1ZHOX307N8 | Anna’s Adventure | cover picture is credited to Pixabay, whose terms are not an open license |
| bl-QucCht6uLC | Water Moves | cover picture is credited to Unsplash, whose terms are not an open license |
| bl-OFuGIcBRtp | My Cat | cover picture license: CUSTOM |
| bl-Kv9S3bhVp3 | Sniffles | cover picture license: CUSTOM |
| bl-C36GhkQmYK | The Sad Frog | cover picture license: CUSTOM |
| bl-ZpGwNuhr5j | The Sad Frog | cover picture license: CUSTOM |
| bl-1VJPr0SVcu | The Stubborn Chick | cover picture license: CUSTOM |
| bl-OBKHjtiOGv | The Stubborn Chick | cover picture license: CUSTOM |
| bl-SMq6sDiAbM | The Stubborn Chick | cover picture license: CUSTOM |
| bl-jSqtHWZuIJ | The Wolf and the Crane | cover picture license: CUSTOM |
| bl-9kvmLZpEmz | (2-3a) Who will Help Me? | cover picture license: NC |
| bl-aHhXWhuAOW | 1d The big book of nature | cover picture license: NC |
| bl-jphro6stNv | 1d The Big Book of Nature | cover picture license: NC |
| bl-CToUSX700n | 2h How Do You Sleep? | cover picture license: NC |
| bl-si9l2Iy7AB | 2h How Do You Sleep? | cover picture license: NC |
| bl-Xlc3oPCfrj | A Cow is My Friend | cover picture license: NC |
| bl-sBw8ZEeHA6 | A Fish and a Gift | cover picture license: NC |
| bl-B1WRiH3kiE | A Trip to the Tap | cover picture license: NC |
| bl-2viZiVhlvE | A5-Colours of a Rainbow | cover picture license: NC |
| bl-Rr6LZuM6BQ | A5-The Big Book of Nature | cover picture license: NC |
| bl-gR1wTQ8FIf | A6-Little and Big | cover picture license: NC |
| bl-tEtAxGXyfm | A6-Mr and Mrs Snake | cover picture license: NC |
| bl-ZD97XO1lfM | Adun the Beautiful | cover picture license: NC |
| bl-MVaHpK6iWC | Adun, the beautiful | cover picture license: NC |
| bl-sAyekK3nIS | Amahle wants to help! | cover picture license: NC |
| bl-Og5q7AGyZ1 | Amara and Her Dog | cover picture license: NC |
| bl-lHI6LJ38NT | Ana's Tortillas | cover picture license: NC |
| bl-oRJdMhMxOv | Ana's Tortillas | cover picture license: NC |
| bl-GyVu7VFsgt | Ang Pula na Sapatos | cover picture license: NC |
| bl-yKnyDJgfUa | Ang Pulang Sapatos | cover picture license: NC |
| bl-TLRgk4iMOG | At the Market | cover picture license: NC |
| bl-0H8QFHV6Xl | Back to School | cover picture license: NC |
| bl-1FNSBRaRAE | Back to School | cover picture license: NC |
| bl-fvgGBFFmAm | Baraka's School Schedule | cover picture license: NC |
| bl-jmyCqvQwA5 | Bat and his friends | cover picture license: NC |
| bl-m30IoV9tw8 | Before the Festival Ends | cover picture license: NC |
| bl-mFon4dixi4 | Can you find these things? | cover picture license: NC |
| bl-3o75YZgNBE | Child As a Peacemaker | cover picture license: NC |
| bl-RC92M1f7rs | Child As a Peacemaker | cover picture license: NC |
| bl-eKxOYgpA2o | Child As a Peacemaker | cover picture license: NC |
| bl-v4Ju7nAbZl | Child As a Peacemaker | cover picture license: NC |
| bl-v49gOnoAod | Crocodile Daydreams | cover picture license: NC |
| bl-PJ13TsmIno | Crushed Louse | cover picture license: NC |
| bl-4PB5HUoSDY | Daddy goes to work | cover picture license: NC |
| bl-nUjdShjrTy | Dancing | cover picture license: NC |
| bl-Y0MHALCRws | Danny the Boy | cover picture license: NC |
| bl-OP3y7O8B7L | Dima and Owl | cover picture license: NC |
| bl-fMsKxiLlOW | Disagreement Among Occupations | cover picture license: NC |
| bl-eWEvXM9hAH | Feathered Friends | cover picture license: NC |
| bl-wDfq3DMmCx | Funny Story | cover picture license: NC |
| bl-yzqudH99zo | Funny Story | cover picture license: NC |
| bl-TrsDPEflvP | I Can Do | cover picture license: NC |
| bl-FMNCQuGKvi | I Can Help! | cover picture license: NC |
| bl-jJI5j7JeKi | I Korok om i Gipan | cover picture license: NC |
| bl-wMw7Emx61r | I Like Trees | cover picture license: NC |
| bl-DjF3unmrkJ | I Pick Pitpit | cover picture license: NC |
| bl-G5SFW6WWch | Joaquin Plays Soccer | cover picture license: NC |
| bl-FdzQhlyWTZ | Journey to Abardares | cover picture license: NC |
| bl-wWmUkQbThV | Juliana | cover picture license: NC |
| bl-DMxtvtQPTF | Karabo's Question | cover picture license: NC |
| bl-HIV3vHTULY | Katta yordamchi | cover picture license: NC |
| bl-vx4fUEGyBn | Light | cover picture license: NC |
| bl-j8ldJxbO30 | Literacy International: Of Plants and An Empty Pot | cover picture license: NC |
| bl-oiymABUUIE | Literacy International: Smells | cover picture license: NC |
| bl-cbf032tL44 | Literacy International: The Universal Declaration of Human Rights | cover picture license: NC |
| bl-ShL0un2KCv | little KarOsi | cover picture license: NC |
| bl-qT27zTriHY | Maguru gives out legs | cover picture license: NC |
| bl-9YT8QA0bds | Market | cover picture license: NC |
| bl-0yNj6HHY0K | Mondli and Mbali Visit Grandmother | cover picture license: NC |
| bl-vCYksr4857 | MUD! | cover picture license: NC |
| bl-GyNkc8i0D1 | My Dog | cover picture license: NC |
| bl-55SchbAYwI | My first pair of shoes | cover picture license: NC |
| bl-r3vH5fAwOX | My New Shirt | cover picture license: NC |
| bl-nmb6yh2n7E | Namukhaywa | cover picture license: NC |
| bl-P6rvCt4BWY | Nature's Webmasters | cover picture license: NC |
| bl-oMJ2Cwquwc | No Pigs Allowed | cover picture license: NC |
| bl-FETv4fE0vL | OMI LIKES TO EAT ICE CREAM | cover picture license: NC |
| bl-sS7rXMNrjX | One Lonely Cassowary | cover picture license: NC |
| bl-Wa8KpDLoc6 | Opposites and Differences 1 | cover picture license: NC |
| bl-nG0EAB0nDr | Opposites and Differences 1 | cover picture license: NC |
| bl-SXDBPFbOTg | PNG Coffee | cover picture license: NC |
| bl-48MbQvGTHl | Rat and Frog Find Mangos | cover picture license: NC |
| bl-FVn48hkVnQ | Reba wants ice cream | cover picture license: NC |
| bl-Xd4wevEMFa | Sir Michael Somare | cover picture license: NC |
| bl-6ufNSVs25w | Square-The Big Book of Nature | cover picture license: NC |
| bl-uAjjot18Fr | Stone Soup | cover picture license: NC |
| bl-iolH6e0yD0 | Swimmy | cover picture license: NC |
| bl-5vFrFbOGqq | The Big Book of Nature | cover picture license: NC |
| bl-EOFhCdB4kf | The Big Book of Nature | cover picture license: NC |
| bl-gcmINJ8NAz | The Big Book of Nature | cover picture license: NC |
| bl-otNXMt1eIJ | The Big Book of Nature | cover picture license: NC |
| bl-zflSBFz4SL | The boy who lied | cover picture license: NC |
| bl-Zav7izR3LW | The Dancing Goat | cover picture license: NC |
| bl-mqPinCwBVT | The Four Animals | cover picture license: NC |
| bl-9nW01hzXgk | The Giant Turnip | cover picture license: NC |
| bl-nKxmBkhbBZ | The hungry caterpillar | cover picture license: NC |
| bl-S28QWpPZC4 | The Old Man and His Sons | cover picture license: NC |
| bl-GgaQhLMUDS | This Person is Happy | cover picture license: NC |
| bl-tMW5QDHBUe | Wa ghɨ wul ta ghɨ kàʼ a ghɨ samsɨ | cover picture license: NC |
| bl-4fg5c4ADmc | Wewak Boy | cover picture license: NC |
| bl-VR618WqfRz | What are You Doing? | cover picture license: NC |
| bl-dNE23l54Ji | What Colors Do You Like? | cover picture license: NC |
| bl-negmpcfkGT | What Do You Feed a Pig? | cover picture license: NC |
| bl-eWuHCJrTqS | Who Can Fly Without Wings? | cover picture license: NC |
| bl-XJABow5MO7 | Who eats this? | cover picture license: NC |
| bl-mefrNT4DVB | Who eats this? | cover picture license: NC |
| bl-3ebvLRZLIL | Who Is This? | cover picture license: NC |
| bl-gIOaHAeCdq | Why Can't We Glow Like Fireflies? Portrait | cover picture license: NC |
| bl-xHBFbt55IN | Ellie Finds a Skunk | cover picture license: ND |
| bl-hQnpn72h6d | I like Dogs | cover picture license: ND |
| bl-7EYXovHbvn | Jacob and the Fish | cover picture license: ND |
| bl-JCt95YWxg0 | My Mother | cover picture license: ND |
| bl-UZa8esuP7K | My Mother | cover picture license: ND |
| bl-DF8oPxLcNF | My Two Dogs | cover picture license: ND |
| bl-UCnaFEIdVm | My Two Dogs | cover picture license: ND |
| bl-hTG0q9Hq6t | Our Sailboat Song | cover picture license: ND |
| bl-1O58Hl9Qn3 | Swahili Time | cover picture license: ND |
| bl-PM78AmeVj4 | How Does It Work | cover picture says "BY-NC" |
| bl-JSZUFcSeX6 | A Tea Garden Party | English missing on page 1 |
| bl-0zrKkcNa3M | Achchachi's Bagbrella | English missing on page 1 |
| bl-2A1uaXx46V | Ang  Manggagawang Langgam | English missing on page 1 |
| bl-omQ8yqzZ6X | Ang Aking Matalik Na Kaibigan | English missing on page 1 |
| bl-XqyOkUhVpv | Ang Akong Suod Nga Higala | English missing on page 1 |
| bl-ZLUNESPyiW | Ang Trabahanteng Olmigas | English missing on page 1 |
| bl-NTCA9pms4l | Animal Husbandry Practices | English missing on page 1 |
| bl-yoGD7z1WeT | Branches of Agriculture | English missing on page 1 |
| bl-hGxbi481tD | Chomp, Gulp... Burp! | English missing on page 1 |
| bl-AtKDoUM6FD | Common Farm Tools | English missing on page 1 |
| bl-0eFqcM2gIT | Crops Grown in Malawi | English missing on page 1 |
| bl-YZUPIWzfbY | DOMESTIC ANIMAL | English missing on page 1 |
| bl-Gpx0rCrTTp | Every Minute Counts | English missing on page 1 |
| bl-iPDEGYcTGo | Farm Animals Raised in Malawi | English missing on page 1 |
| bl-HitEc10UqT | Farm Business Activities | English missing on page 1 |
| bl-UG70viwEfA | Farming Methods | English missing on page 1 |
| bl-1Yx18szgiX | Fly Safe | English missing on page 1 |
| bl-BoBtaoCsfk | Gola Gola | English missing on page 1 |
| bl-HGQV8kXDRz | Harmful Effects of the Major Elements of the Agricultural Environment | English missing on page 1 |
| bl-AGXyX2PQ03 | Harvesting & Storage of Maize | English missing on page 1 |
| bl-jp65FHUBi6 | Housing & Feeding Farm Animals | English missing on page 1 |
| bl-WeNFaoyvJf | HWAKYE YOR KANCILKE | English missing on page 1 |
| bl-sHS0ocJ6Dk | Importance of Agriculture | English missing on page 1 |
| bl-UgEFNrdSfF | Importance of Crops | English missing on page 1 |
| bl-hQVyUS8rZS | Importance of Farm Animals | English missing on page 1 |
| bl-LU1CaUr1wD | Inku Chomps, Gobbles and Slurps | English missing on page 1 |
| bl-UNMdc6P9H1 | Juan's goat | English missing on page 1 |
| bl-7M1i3y0dSO | Land Preparation & Planting in Maize | English missing on page 1 |
| bl-V5ybNCAHkx | Let's Play Cricket | English missing on page 1 |
| bl-9t7YrYiWUh | Look Up! | English missing on page 1 |
| bl-WAtlZJa8Wh | Maintenance of Farm Tools | English missing on page 1 |
| bl-qiiwLzqjbt | Major Elements of the Agricultural Environment | English missing on page 1 |
| bl-mESn5DP208 | Management of the Harmful Effects of the Major Elements of the Agricultural Environment | English missing on page 1 |
| bl-0wJ54i1qZG | Meaning of Agriculture | English missing on page 1 |
| bl-WYYgqarVOa | Mummy's Glasses | English missing on page 1 |
| bl-wuoLhZKskJ | My Book | English missing on page 1 |
| bl-U0LbaqMWil | Pest & Disease Control in Maize Crop | English missing on page 1 |
| bl-ck5WSurYqD | Picnic on Grass | English missing on page 1 |
| bl-NyaHo2W9ec | Plants Are Everywhere | English missing on page 1 |
| bl-LEaIsb5FwW | Safe Ways of Using Farm Tools | English missing on page 1 |
| bl-QoBR6I9XgX | Shiro's Friends Save the Day | English missing on page 1 |
| bl-bUkkfwIq7i | So Many Leaves | English missing on page 1 |
| bl-zZhXUMJHEh | Sonth Is Here | English missing on page 1 |
| bl-x0Z38AzQX5 | The Ideal Pupil | English missing on page 1 |
| bl-AKKIZehPH3 | The Right Tools | English missing on page 1 |
| bl-SMxObCl3RM | Tony the Turkey | English missing on page 1 |
| bl-ZwFKY2OZxG | Weeding & Fertilizer Application in Maize | English missing on page 1 |
| bl-Ofg3yomEeM | What I Want | English missing on page 1 |
| bl-noHDazBJ4Y | What Would You Like to Drink? | English missing on page 1 |
| bl-1FdS4iG1JE | Where Do the Groceries Go? | English missing on page 1 |
| bl-aydkVWwBRV | ଗୋଟେ ମାଗଣା କୁଲଫି! | English missing on page 1 |
| bl-xchp1sCENs | ତାତ୍ୟାଙ୍କ ପାଇଁ ଆଲେପାକ | English missing on page 1 |
| bl-Nf7edrImx4 | Beauty Is Missing | English missing on page 2 |
| bl-U8klXn0IFQ | Bintu and Bingo | English missing on page 2 |
| bl-NYTzu6mA7L | I am still a kid but I can help | English missing on page 2 |
| bl-Pdps9E7Bgf | Ndeelu | English missing on page 2 |
| bl-5AvF2zzLKD | The Animals Dig a Well | English missing on page 2 |
| bl-9bVczvY0PA | The Animals Dig a Well | English missing on page 2 |
| bl-64Fz3EAxyK | The Young Child | English missing on page 2 |
| bl-rTqow9nrUP | The Young Child | English missing on page 2 |
| bl-02UPg7BQjf | How Ant Saved Dove | English missing on page 21 |
| bl-2tg3T4E0Bl | I Gonsuri om I Gorouk | English missing on page 3 |
| bl-eiw9Kgmv6Q | Kapayas | English missing on page 3 |
| bl-LNyDg6P0Cx | My First Dictionary With Pictures | English missing on page 3 |
| bl-bqYC5YX46W | Cómo se ayudaron Pájaro Blanco y Hormiguita | English missing on page 32 |
| bl-QBxdNVmzHh | How Little Ant Thanked White Bird | English missing on page 32 |
| bl-cEPlCsvBMt | The Donkey Beautiful | English missing on page 7 |
| bl-J80aGJuVwG | The Little Plant | English missing on page 7 |
| bl-qyufy7wR9P | A Butterfly Smile | English missing on page 8 |
| bl-3h5ML2f196 | The Dream | English missing on page 9 |
| bl-qaCU2BrFpg | Story 11: The Ants and the Grasshopper | most pictures have no license or copyright (2 of 2) |
| bl-9blicAVbl4 | The One Who Love Their Enemy | most pictures have no license or copyright (2 of 2) |
| bl-lNC0fIh2zm | Kindness power | no cover picture |
| bl-IKYWdIkeYn | My Template | no cover picture |
| bl-rUqFqylsjQ | The Farmer and His Fowls | no cover picture |
| bl-sJ3opPFaQq | The Village Thief | no cover picture |
| bl-oD99FDDctN | এসো পড়ি | no cover picture |
| bl-ROAThNZGus | Crop Husbandry Practices | no story pages |
| bl-h9JARwTJDe | One Two Three | no story pages |
| bl-RoXkCCtn9l | Spiti's Secret | no story pages |
| bl-bGJlixXfxd | -12- Күчүк, мышык жана сөөлжандар | page 1 has 2 pictures |
| bl-gj7aBr2Puw | -8- Cat and Dog: Dog is Cold | page 1 has 2 pictures |
| bl-jaHEf8mTot | -9- Cat and Dog: Draw and Colour | page 1 has 2 pictures |
| bl-of3yntXss0 | Healthy Teeth | page 1 has 2 pictures |
| bl-eeXjc4YtbQ | Leopards | page 1 has 2 pictures |
| bl-nm4yEs5WJQ | Literacy International: Think and Be Strong | page 1 has 2 pictures |
| bl-hBe1NdvulU | Little Goat | page 1 has 2 pictures |
| bl-nU0GenHXYi | Little Goat | page 1 has 2 pictures |
| bl-zuTZeOJNmn | Memory Game Cards Template | page 1 has 2 pictures |
| bl-1DSTQpA2Sc | More than a Pretty Face. Phase 1, Unit 5, Game 1B Mvskoke Growing Bilingual Community | page 1 has 2 pictures |
| bl-t3e5JZjKk0 | Peter's Peanuts | page 1 has 2 pictures |
| bl-BD04KcLC1y | Thato's Birthday Surprise | page 1 has 2 pictures |
| bl-w5Qk3CBaTl | Thato's Birthday Surprise | page 1 has 2 pictures |
| bl-5tnAOLAMj8 | The path from corn to tortillas | page 1 has 2 pictures |
| bl-XfM2CcOFrF | The path from corn to tortillas | page 1 has 2 pictures |
| bl-nHNBO6CS6q | The path from corn to tortillas | page 1 has 2 pictures |
| bl-jacuRzV6Ee | Water Changes | page 1 has 2 pictures |
| bl-nRh4j6pyiZ | Why People are Polygamists | page 1 has 2 pictures |
| bl-raE5eoZSEA | ¿Quién es nuestro amigo? | page 1 has 3 pictures |
| bl-5040nkns0h | 02 - Cat and Dog: Words | page 1 has 3 pictures |
| bl-ku64ZcdBm7 | My Favorite Color | page 1 has 3 pictures |
| bl-5qvG1y3R9d | Opposites | page 1 has 3 pictures |
| bl-MbebdFYCbl | Who is our friend? | page 1 has 3 pictures |
| bl-AdYwMFHdjG | Literacy International: What Can We Do With a Palm Tree? (and other useful plants) | page 1 has 4 pictures |
| bl-o4QMFcFPND | Literacy International: What Can We Do With a Palm Tree? (and other useful plants) | page 1 has 4 pictures |
| bl-JDJ2ojt3KA | Who is our friend? | page 1 has 4 pictures |
| bl-XNnYIgHqEP | Cats and Kittens | page 1 has 5 pictures |
| bl-it70QEb65y | Cats and Kittens | page 1 has 5 pictures |
| bl-eFVgh980ZS | Edible Plants | page 1 has 6 pictures |
| bl-FtUZrEfcaN | Living Animals | page 1 has 6 pictures |
| bl-ay1sSfD1nG | The Mënub̒ù Language | page 1 has 6 pictures |
| bl-jfM6Yk3S90 | 3j Have You Seen My Family? | page 1 has no picture |
| bl-uwMUVEguuA | A Family’s Experience with COVID-19 at Home | page 1 has no picture |
| bl-FOpOv5tVdA | A Lesson | page 1 has no picture |
| bl-KcrxRYabEz | All about opposites! | page 1 has no picture |
| bl-cFRwWwLMmq | Autumn's In The Air | page 1 has no picture |
| bl-gqSLTElxSk | Autumn's In The Air | page 1 has no picture |
| bl-GedbxG8Ekn | BIG BOOK of NATURE | page 1 has no picture |
| bl-2j4FU7p4x0 | Bilingual Hazaragi-English Dictionary With Pictures | page 1 has no picture |
| bl-Cl7tKaJiNj | Binta and her Assistant | page 1 has no picture |
| bl-ofXSQQVBs8 | Binta and her Assistant | page 1 has no picture |
| bl-UoqhTqBDWl | Bintu and Bingo | page 1 has no picture |
| bl-aXKWFiDBjT | Bintu and Bingo | page 1 has no picture |
| bl-ri9kBPVGDB | Bintu and Bingo | page 1 has no picture |
| bl-7bGW9sB7sx | Children's Hand Hygiene Role Play | page 1 has no picture |
| bl-MOLRvOqQdk | Coming to the United States | page 1 has no picture |
| bl-mFrjSOYsdZ | Demane and Demazane | page 1 has no picture |
| bl-tWcE5ufEYE | ​Diligent Teacher Jocelyn | page 1 has no picture |
| bl-298izfrkPT | Dum Dum-a-Dum Biryani! | page 1 has no picture |
| bl-aYVgKlG6Sn | Faranji | page 1 has no picture |
| bl-TWAWbs9XCp | Fatima Can Count | page 1 has no picture |
| bl-2sDFXvd1fS | Goso the Teacher | page 1 has no picture |
| bl-SK3ZG6KuKK | Hazaragi Traditional Folk Songs | page 1 has no picture |
| bl-8yX11iNI7o | How to Build a Tippy Tap Handwashing Station | page 1 has no picture |
| bl-5XLcs6CckE | I Listen to My Body | page 1 has no picture |
| bl-d2K6E5OlmU | Jummai’s Three Wishes | page 1 has no picture |
| bl-hp3Wvel09h | Jummai’s Three Wishes | page 1 has no picture |
| bl-Gp0E7KcjET | Ken omopalewihkeh Istaktototl iwan  Askatzintli | page 1 has no picture |
| bl-tiXLpcyLGn | Lara the Yellow Ladybird | page 1 has no picture |
| bl-314vKKdzXS | Learning at Home | page 1 has no picture |
| bl-a3SE0LfQFF | Learning at Home | page 1 has no picture |
| bl-fEzgmIckjp | Learning at Home | page 1 has no picture |
| bl-dR5Ju8tPRm | Let's Count with Robin the Rabbit | page 1 has no picture |
| bl-dAKvyRjVop | Literacy International: Animal Stories | page 1 has no picture |
| bl-EFbAPGikq1 | Literacy International: Mountains | page 1 has no picture |
| bl-9B5oE3h5mb | Literacy International: Special Women: Corrie Ten Boom | page 1 has no picture |
| bl-TF7e161p51 | Literacy International: Special Women: Eleanor Roosevelt | page 1 has no picture |
| bl-8h8golyV69 | Literacy International: Special Women: Marie Curie | page 1 has no picture |
| bl-V7h4byvB3M | Literacy International: Special Women: Mother Teresa | page 1 has no picture |
| bl-xAOQSEQolp | Literacy International: Three Men of Peace | page 1 has no picture |
| bl-5dnhgaE7Kk | Local Fishing | page 1 has no picture |
| bl-VTtLM4PCTu | Monkey Business on Stage Kallu's World 2 | page 1 has no picture |
| bl-sp3J6DB1U9 | Name That Fruit | page 1 has no picture |
| bl-6uKDPpnivk | NT Greek Discourse Features | page 1 has no picture |
| bl-3w8Zxe7ryv | Opposites and Differences 1 | page 1 has no picture |
| bl-iQEp9mUKFN | Opposites and Differences 2 | page 1 has no picture |
| bl-oSp2aerZwC | Opposites and Differences 2 | page 1 has no picture |
| bl-pFKAamHkt3 | Paulo Freire Reading the Word and the World | page 1 has no picture |
| bl-Ukry2F86bq | River and Sun | page 1 has no picture |
| bl-sVwItI4U8a | Sebuah Kejutan Spesial | page 1 has no picture |
| bl-Ec0EAXKzFf | SHADOWS IN THE SILENCE | page 1 has no picture |
| bl-jN0YUcvJH8 | Spider and the Many Legs | page 1 has no picture |
| bl-pW1JPSW8g7 | Spider and the Many Legs | page 1 has no picture |
| bl-q2NfBC2gAw | Spider and the Many Legs | page 1 has no picture |
| bl-GHl5pbGWBC | Square-Egg | page 1 has no picture |
| bl-bsMHQ2rqmT | Square-Have You Seen My Family? | page 1 has no picture |
| bl-5AugWmZyNH | Square-Little and Big | page 1 has no picture |
| bl-xOs7orruQL | Square-Little and Big | page 1 has no picture |
| bl-7mGzRgEuGo | Square-Why is Nita Upside Down | page 1 has no picture |
| bl-l3RfqfLCV3 | Sun, Moon, Rain and Wind | page 1 has no picture |
| bl-bckPPMtgtY | Tech Tips for Budget Tight Schools | page 1 has no picture |
| bl-2rYRMh6USD | The Blessings of Living Well | page 1 has no picture |
| bl-fIrYcwyjpn | The Blessings of Living Well | page 1 has no picture |
| bl-9iCMw9AaC3 | The Boy and the Drum | page 1 has no picture |
| bl-XXX0asXnLk | The Boy Who Turned Bad Luck into Good | page 1 has no picture |
| bl-i8Ph3qBBpM | The Flight of A Lifetime | page 1 has no picture |
| bl-AQ7UeIRIai | The Football Fans of Zama | page 1 has no picture |
| bl-TGlYSoOYeb | The Football Fans of Zama | page 1 has no picture |
| bl-LXoTqWMZUY | THE LIFE OF A RUBBER TAPPER | page 1 has no picture |
| bl-h3SP119ZAX | The Little Boy who Loved Newroz | page 1 has no picture |
| bl-xLAz2Amv7X | The Promise | page 1 has no picture |
| bl-B1TARUtW3P | The Secret Kingdom | page 1 has no picture |
| bl-YrzufqzQJ8 | The Secret Kingdom | page 1 has no picture |
| bl-JDIC3h9SRD | The Seventh Sun | page 1 has no picture |
| bl-s0XOyHyY2p | The Seventh Sun | page 1 has no picture |
| bl-1cqQrmiqnx | The Story of the Fruits | page 1 has no picture |
| bl-FKcQu91U3J | The Sun and the Moon | page 1 has no picture |
| bl-Z9wZeXOIwi | The Sun and the Moon | page 1 has no picture |
| bl-QCjfXyjASD | The Tale of Busyawan Falls | page 1 has no picture |
| bl-CIJlYvA4fW | The Thousand Bags of Grain | page 1 has no picture |
| bl-5ZXO144H7V | The Wise Old Woman and the Foolish Servant | page 1 has no picture |
| bl-mcH1GYDSKA | The Wise Old Woman and the Foolish Servant | page 1 has no picture |
| bl-iPyt63dRJs | The Woodcutter of Gura - A Folktale from Ethiopia | page 1 has no picture |
| bl-JeWdlA5NKY | Translating Science Vocabulary into Minority Languages A guide for translating What is Climate Change? and What is Sustainability? | page 1 has no picture |
| bl-X516C8EgsH | Travel Memior | page 1 has no picture |
| bl-c9xdw7ul1L | Water, Sanitation, and Hygiene‌ | page 1 has no picture |
| bl-zfONogfCBc | What’s That Nut? | page 1 has no picture |
| bl-K3YQVFzpEp | When the Mountains Speak | page 1 has no picture |
| bl-vErYHW8a1P | Why Does Poori Puff Up? | page 1 has no picture |
| bl-yDGs64XyqN | Wind, the Wind | page 1 has no picture |
| bl-3oUnwTJiqs | Winnie-the-Pooh | page 1 has no picture |
| bl-L6CSGl2Bha | ACR- PNG Sign Alphabet | page 1 is an activity, quiz or video page |
| bl-uPCIzNMlcE | 48 Animals | page 1 picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-UKzKwJHkUn | Don't Cry, My Child | page 1 picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-lwpB7FjDuO | Don't Cry, My Child | page 1 picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-rYTyg5bOi5 | Clouds | page 1 picture is credited to Microsoft, whose terms are not an open license |
| bl-oio92dZiu0 | Aminata and the red spiky ball | page 1 picture license: NC |
| bl-KxJHNzW2qo | Dancing | page 1 picture license: NC |
| bl-hHqVZfFyiy | I Can | page 1 picture license: NC |
| bl-EfhU2vlExA | Lion and Warthog | page 1 picture license: NC |
| bl-ePF4YSoJCN | Mother Crab | page 1 picture license: NC |
| bl-NPHcSzQKfU | My Sweet Dominica | page 1 picture license: NC |
| bl-vZ1Cp2YJ8x | The Drought | page 1 picture license: NC |
| bl-14Q6tCgi3K | A Fight | page 1 picture license: ND |
| bl-LniyOiJdF3 | Amra and a River | page 10 has 2 pictures |
| bl-dGB6ziCBcO | Katiiti's Song | page 10 has 2 pictures |
| bl-TU1hzrl8wT | Turtle Dove | page 10 has 4 pictures |
| bl-KMr0q6Q9pA | 05 - Baby Who Cried | page 10 has no picture |
| bl-xtcmUzjprE | A5-Little and Big | page 10 has no picture |
| bl-onkFfAms2A | Baby Who Cried | page 10 has no picture |
| bl-mfygMTy2d0 | Friends become enemies | page 10 has no picture |
| bl-kPWtufCG6t | Goldie the Eagle | page 10 has no picture |
| bl-HnxryPAI9Q | How do you feel? | page 10 has no picture |
| bl-GFFQfMxgAb | Jackal and the sun | page 10 has no picture |
| bl-GsQSoClYCA | Pam-Pam bird | page 10 has no picture |
| bl-yESEGLdDGz | Square-Baby Who Cried | page 10 has no picture |
| bl-t5NovXX66O | Square-Lara the Yellow Ladybird | page 10 has no picture |
| bl-4o3BQYQ7Do | Square-Wash Your Hands! | page 10 has no picture |
| bl-VOqIrEd215 | Wash Your Hands! | page 10 has no picture |
| bl-aohA0j5pC5 | Do you like my Fish? | page 11 has 2 pictures |
| bl-6xNGFzfSUw | Off to Explore | page 11 has 2 pictures |
| bl-iNN7nv8RCT | Off to Explore | page 11 has 2 pictures |
| bl-BXqhUDCWsv | Let's Count Birds | page 11 has 6 pictures |
| bl-oN6lDAbqP8 | Let's Count Birds | page 11 has 6 pictures |
| bl-zjP9HGwbla | 'M'e Maneo's pumpkin | page 11 has no picture |
| bl-U2TTN9wbV4 | Bad Mrs Chicken | page 11 has no picture |
| bl-DMb39J2rZ3 | Independence Day | page 11 has no picture |
| bl-XKUoa9OJaG | Independence Day | page 11 has no picture |
| bl-UdeooucPSs | Learning Together: An Inclusive Education Story [Level 3] By Edmund Vurobaravu | page 11 has no picture |
| bl-Hs2kAKEL5b | Literacy International: The Man, the Boy and the Donkey | page 11 has no picture |
| bl-LFZvQRqDuW | Mr and Mrs Snake | page 11 has no picture |
| bl-aDykvQtPeo | My Mother's Grocery | page 11 has no picture |
| bl-eGh98ODr7T | My Mother's Grocery | page 11 has no picture |
| bl-DgL0SrArc0 | Nawmxnawmx's Pumpkin | page 11 has no picture |
| bl-1PRNTk6JB9 | Tell Me, What is a Drone? | page 11 has no picture |
| bl-yslkvF0Qy7 | The Old Pink Bilum | page 11 has no picture |
| bl-fZybO4qkpm | Where is Dawuda? | page 11 has no picture |
| bl-tjXogB9tvr | Coco's Adventures | page 11 picture has no license and another copyright holder |
| bl-PEcbdUGylz | Kichkina bo‘yoqchilar | page 11 picture has no license and another copyright holder |
| bl-fhIZRsuBFN | Painting | page 11 picture has no license and another copyright holder |
| bl-wzzMCzTslp | The Lives of Farm Animals | page 11 picture has no license and another copyright holder |
| bl-ZVEE60VKCd | When I Grow Up | page 12 has 2 pictures |
| bl-CMwAvoKOox | "Ake na Sidda!" "Dili imo! Ake na Sidda ni." | page 12 has no picture |
| bl-bQqqRziaSO | Fishing in My Village | page 12 has no picture |
| bl-3VeL6O0gU7 | Good friends | page 12 has no picture |
| bl-2rIeqT7pB9 | Hot Tea and Warm Rugs | page 12 has no picture |
| bl-8U0FO7n7Rf | I Enjoy | page 12 has no picture |
| bl-Q7PAOztLr5 | I Enjoy | page 12 has no picture |
| bl-nHiX5eZmNU | JAMES LIKES FRUITS [Level 3] By Edmund Vurobaravu | page 12 has no picture |
| bl-XyH81QPMUy | My Brother and Me | page 12 has no picture |
| bl-SKGar92oHj | Namorutunga | page 12 has no picture |
| bl-XH0E2GQlLR | Round and Round (Tell me now series) | page 12 has no picture |
| bl-9Xgg1B0Osi | Sweet and Sour (Tell me now series) | page 12 has no picture |
| bl-El855hIdIY | Sweet and Sour (Tell me now series) | page 12 has no picture |
| bl-Nh1t5Si688 | Sweet and Sour (Tell me now series) | page 12 has no picture |
| bl-oYsZLV6jll | Sweet and Sour (Tell me now series) | page 12 has no picture |
| bl-qmntRoE4hY | Sweet and Sour (Tell me now series) | page 12 has no picture |
| bl-gUsmf4LGfQ | Tell me now! - 'Good For You' | page 12 has no picture |
| bl-irguGSupmp | Tell me now! - 'Good For You' | page 12 has no picture |
| bl-oo0a0Zwfz5 | Tell me now! - 'Good For You' | page 12 has no picture |
| bl-F0JuNhtJ96 | The Solar System | page 12 has no picture |
| bl-e1tXgoQBiK | Water is Coming. | page 12 has no picture |
| bl-C3fpivVJbl | When I Grow Up | page 12 has no picture |
| bl-c4e5VPOTmc | When I Grow Up | page 12 has no picture |
| bl-J2N49XNAjb | Whoop, Goes the Pufferfish | page 12 has no picture |
| bl-yqPtM9r9R3 | Birds (40 pictures) | page 12 picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-A86aoyAfQ3 | A5-Chicken and Millipede | page 13 has no picture |
| bl-Vx4ZRbhXvt | A5-Who is our Friend? | page 13 has no picture |
| bl-WrMHvjnAcr | At Least I'm Okay! | page 13 has no picture |
| bl-302x4rFFIH | Get that Fox! | page 13 has no picture |
| bl-J2Rw7m2RXp | Get that Fox! | page 13 has no picture |
| bl-9mBJdOMp0Z | Literacy International: How Do We Get There? | page 13 has no picture |
| bl-Wcf6zr5CoF | Rebecca, the Maasai Changemaker- based on a true story (Maithili translation by Gajendra Thakur) | page 13 has no picture |
| bl-OWBUT7rHN9 | These things are opposites | page 13 has no picture |
| bl-XHXe2VNT2r | चलू हम तँ ठीक छी ने!At Least I'm Okay!(Maithili-English) | page 13 has no picture |
| bl-p3sHdYBgiT | चलू हम तँ ठीक छी ने!At Least I'm Okay!(Maithili-English) | page 13 has no picture |
| bl-x1gRGUBUuu | Hello | page 14 has 3 pictures |
| bl-sE7EpZMixu | Aminata and the Red Spiky Ball | page 14 has no picture |
| bl-EExiz7QQVw | Fishing in My Village | page 14 has no picture |
| bl-6KoXGfMHZ0 | Papa's Cough | page 14 has no picture |
| bl-kUuTHAAGaC | Papa's Cough | page 14 has no picture |
| bl-qJL7M3GyXT | Riu's Busy Day | page 14 has no picture |
| bl-gdUeBrjnNd | The Three Little Kittens | page 14 has no picture |
| bl-WDIsqtgCvH | Ammachi's Amazing Machines | page 15 has no picture |
| bl-jOHUEJfVM1 | Ammachi's Amazing Machines | page 15 has no picture |
| bl-KzvEDkTu6C | Chipko takes root | page 15 has no picture |
| bl-oAzbl8H7vo | Ekai and the domestic animals | page 15 has no picture |
| bl-1w4u25zXbm | The tree that saved the village of Ombalantu | page 15 has no picture |
| bl-bzl9Bu4aJU | Who Made the Tomato Chutney? | page 15 has no picture |
| bl-8RTSAD9eSC | At the Beach | page 16 has 2 pictures |
| bl-xqCH9Vg51z | Things My Father Likes | page 16 has 2 pictures |
| bl-LiOJ4DMID3 | Hyena and Tortoise | page 16 has no picture |
| bl-KR9B1T74d6 | It's Harvest Time | page 16 has no picture |
| bl-aL9ZTEf4ov | It's Harvest Time | page 16 has no picture |
| bl-oeByzjIByR | Reeti and Mithu | page 16 has no picture |
| bl-DAyQdtYfHY | When Will Amma Be Back? | page 16 has no picture |
| bl-W6Xihu5DhE | When Will Amma Be Back? | page 16 has no picture |
| bl-yYPJesTttl | 4d Dive | page 16 is an activity, quiz or video page |
| bl-btGdSmoMHB | I will help you | page 17 has 2 pictures |
| bl-v2WZq8LRGs | I will help you | page 17 has 2 pictures |
| bl-cTFfNTeSiI | I Pick Pitpit | page 17 has no picture |
| bl-Qd7yiA0ass | Inside the World Wide Web | page 18 has 2 pictures |
| bl-GCta02Xmzc | Anna's Extraordinary Experiments with Weather | page 18 has no picture |
| bl-9wPbm9n21y | Bonda and Devi | page 18 has no picture |
| bl-mf2wyupELr | Slip and Slide | page 18 has no picture |
| bl-AoQkHXQbIk | A Butterfly Smile | page 19 has no picture |
| bl-Zp9SFyRoI0 | Little Ant's Big Plan | page 19 has no picture |
| bl-B7kBENM7Wy | Six Principles of Life-Giving Agriculture for Farming and Gardening | page 19 has no picture |
| bl-EGo0RTXUB7 | Six Principles of Life-Giving Agriculture for Farming and Gardening | page 19 has no picture |
| bl-KRfsDkux1d | Six Principles of Life-Giving Agriculture for Farming and Gardening | page 19 has no picture |
| bl-aJZYiz8COt | Six Principles of Life-Giving Agriculture for Farming and Gardening | page 19 has no picture |
| bl-5V06qpaDvx | The Magic Block | page 19 has no picture |
| bl-gbWiBvCISd | Burns - What to do | page 2 has 2 pictures |
| bl-3aUfBkLzHa | Count to Ten | page 2 has 2 pictures |
| bl-C3A4GLZ3Hn | Count to Ten | page 2 has 2 pictures |
| bl-X1eDbD4x6b | Count to Ten | page 2 has 2 pictures |
| bl-IyF5CcMmMm | Cuenta hasta diez | page 2 has 2 pictures |
| bl-jgGupUpUkp | Depression | page 2 has 2 pictures |
| bl-AmG8NW5i8H | Dogari Hamadou | page 2 has 2 pictures |
| bl-OSwTlzKgnz | Don't pick our Berries! | page 2 has 2 pictures |
| bl-fJ76z2FsMc | My Dream in the Drawer | page 2 has 2 pictures |
| bl-5efbiJygia | Nomvundla and the Chilli-Eating Contest | page 2 has 2 pictures |
| bl-T7RAGyf5Vs | Oedipus the King | page 2 has 2 pictures |
| bl-mdfuQNb76U | The best thing ever | page 2 has 2 pictures |
| bl-ubgjlton8k | The best thing ever | page 2 has 2 pictures |
| bl-yU3KOF7Da1 | The best thing ever | page 2 has 2 pictures |
| bl-CUnvITxR8v | The Little Sock and the Tiny Creatures | page 2 has 2 pictures |
| bl-9SImFk9BVB | The Wolf and the Crane | page 2 has 2 pictures |
| bl-VCt6aZney9 | Toad and Lizard | page 2 has 2 pictures |
| bl-gdNNPBGFuA | Toad and Lizard | page 2 has 2 pictures |
| bl-xpXpNFy6Xw | When I am Big | page 2 has 2 pictures |
| bl-8DPCjoW47D | Princess Amiya | page 2 has 3 pictures |
| bl-CxseTFMFPi | "Oh, Moses!!" | page 2 has no picture |
| bl-Inw2sjqo7l | A Helping Hand | page 2 has no picture |
| bl-SUzRS4OUE7 | A Lesson | page 2 has no picture |
| bl-K0fjEPdBEG | A NAME FOR MY ISLAND | page 2 has no picture |
| bl-WkPEtzRHZt | A Special Surprise | page 2 has no picture |
| bl-WcNc9XiP0G | A Town with Ten Trees | page 2 has no picture |
| bl-fIFFxFlgdX | A Town with Ten Trees | page 2 has no picture |
| bl-b5BXILmbXJ | Aminata and the Red Spiky Ball | page 2 has no picture |
| bl-2HShLhBEqG | Ang Puno ng Buhay | page 2 has no picture |
| bl-VHXXq1LJ6I | Ang Puno-an sa Kinabuhi | page 2 has no picture |
| bl-LFPID8p1XQ | Ani Dan Bola Merah Berduri | page 2 has no picture |
| bl-5m3oid7x6W | Batuk Papa | page 2 has no picture |
| bl-sXRZ5P55Fd | Brave Bora | page 2 has no picture |
| bl-5Eu5dLiPlX | Dance contest | page 2 has no picture |
| bl-Tlwk3OIIMH | Dangerous Disrespect | page 2 has no picture |
| bl-bevAELHDal | First Day of School | page 2 has no picture |
| bl-1D9Ae29skn | Hermit Crabs | page 2 has no picture |
| bl-5xzKp5nivV | Holiday Time | page 2 has no picture |
| bl-eRd4EuyoNs | How Far is Far? | page 2 has no picture |
| bl-1MVU1vabcM | How Old is Muttajji? | page 2 has no picture |
| bl-rVcTtEoV1S | How to Customize Bloom Books | page 2 has no picture |
| bl-FehP4sxmky | Hypertension - High Blood Pressure | page 2 has no picture |
| bl-8WPmLbaTA1 | I Colour In | page 2 has no picture |
| bl-lD4LTF2HqZ | I know how to draw! | page 2 has no picture |
| bl-FaEbJe9iA7 | Jungle Brew | page 2 has no picture |
| bl-9ooNMKsHv6 | Katitu Momambo the Clever Little Girl | page 2 has no picture |
| bl-VATIUy1U1R | Kuttu and his night friends | page 2 has no picture |
| bl-tuIVjtXXdU | Literacy International: Deserts | page 2 has no picture |
| bl-9OejsdbbTA | Literacy International: One President Heard Around the World | page 2 has no picture |
| bl-oktSHtuCvw | Literacy International: Special Women: Ellen Johnson Sirleaf | page 2 has no picture |
| bl-sMtFDSndtI | Literacy International: Special Women: Florence Nightingale | page 2 has no picture |
| bl-onxasCZ7Qx | Literacy International: Special Women: Rosa Parks | page 2 has no picture |
| bl-eLYgssHuub | Literacy International: What Should You Do? | page 2 has no picture |
| bl-ADuT7Y6vc5 | Literacy International: You Decide | page 2 has no picture |
| bl-dS5sDYz1kP | Manikantan Has Enough | page 2 has no picture |
| bl-gtOxfc8pD7 | Mr and Mrs Snake | page 2 has no picture |
| bl-q05afEA4wB | Papa's Cough | page 2 has no picture |
| bl-rgsxDu7eaZ | Papa's Cough | page 2 has no picture |
| bl-fVaQhBnWof | The Competition of the Monkey and the Winds | page 2 has no picture |
| bl-0EoH2fugWY | The Fascinating Fibonaccis | page 2 has no picture |
| bl-BxwMSKZ2uh | The Helpful Hen | page 2 has no picture |
| bl-OdPYCdowpB | THE LITTLE SHOOTING STAR | page 2 has no picture |
| bl-nDVijbu6im | The Slow Tortoise Wins the Race | page 2 has no picture |
| bl-4nClqVMjIJ | The Thousand Bags of Grain | page 2 has no picture |
| bl-0SyRDUItfC | THE WHISPERS OF BLUE FOG | page 2 has no picture |
| bl-s7SzWz1rDP | Colours of a Rainbow | page 2 picture has no license and another copyright holder |
| bl-BfbBHuGGvw | My Body | page 2 picture has no license and another copyright holder |
| bl-R7uVR0E8Kr | My Body | page 2 picture has no license and another copyright holder |
| bl-7kucxOKoFO | Our community | page 2 picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-IA5aUNYv5h | Tom Keeps Animals | page 2 picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-cNJm8EXEmi | Tom Keeps Animals | page 2 picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-yLysTB9GJu | Keeper and his special nursery | page 20 has no picture |
| bl-DgeEFo0fe3 | The Night the Moon Went Missing | page 21 has 2 pictures |
| bl-MwJk0fgQ4q | Counting on Moru | page 21 has no picture |
| bl-QcVPRBmdBY | Counting on Moru | page 21 has no picture |
| bl-35QtbjBenW | Welcome to the Forest | page 21 has no picture |
| bl-Fcgy3mkeUv | The Girl Who Could Not Stop Laughing | page 22 has no picture |
| bl-OcyzZa0b0W | The Girl Who Could Not Stop Laughing | page 22 has no picture |
| bl-EgjXGVYOxm | There's a Hole in my Galaxy | page 22 has no picture |
| bl-FSmmpaJmsl | There's a Hole in my Galaxy | page 22 has no picture |
| bl-gTuGNOGTp2 | There's a Hole in my Galaxy | page 22 has no picture |
| bl-kGtBckgnxN | There's a Hole in my Galaxy | page 22 has no picture |
| bl-hJRzAejX1r | Nakehi and the beans | page 25 has no picture |
| bl-7qBrZtknEu | Square-To the Top | page 27 has no picture |
| bl-pXcOvVARhD | Animals (40 pictures) | page 28 picture is BY-SA, stricter than the book's CC BY 4.0 |
| bl-hcmrdDwAqP | Apples for the Teacher | page 3 has 2 pictures |
| bl-m7cfABbnc4 | Apples for the Teacher | page 3 has 2 pictures |
| bl-KByfVNAVRJ | Literacy International: The Six Blind Men and the Elephant | page 3 has 2 pictures |
| bl-6D1Mqt1JjG | Small Bird's BIG Adventure | page 3 has 2 pictures |
| bl-C2ZAxzunvM | Small Bird's BIG Adventure | page 3 has 2 pictures |
| bl-CTuMSSSyqu | Small Bird's BIG Adventure | page 3 has 2 pictures |
| bl-qoC09hgEJG | Small Bird's BIG Adventure | page 3 has 2 pictures |
| bl-y86dDIZUQm | The Lazy Cheptoo | page 3 has 2 pictures |
| bl-lGGrQ4ASbo | The White Men Who Live in Our Village | page 3 has 2 pictures |
| bl-fy9KApvqcM | Where does water come from? Exploring the water cycle | page 3 has 2 pictures |
| bl-xJHoJFlcU3 | Why Must I Wash My Hands? | page 3 has 2 pictures |
| bl-6s3UrD5X3c | Zanele Sees Numbers | page 3 has 2 pictures |
| bl-tEnEALbgJL | Zanele Sees Numbers | page 3 has 2 pictures |
| bl-uu4oB5zALA | Zanele Sees Numbers | page 3 has 2 pictures |
| bl-wB5R5pKg3K | Zanele Sees Numbers | page 3 has 2 pictures |
| bl-1AgCV2u5hL | Papaya | page 3 has 3 pictures |
| bl-ELdk1p6RIU | Papaya | page 3 has 3 pictures |
| bl-GKGG6cunEz | Papaya | page 3 has 3 pictures |
| bl-EYQbsMnhYd | Strong Bones | page 3 has 3 pictures |
| bl-7MOEMBPdAz | Measles | page 3 has 4 pictures |
| bl-DKBFNBGikA | The Mother | page 3 has 4 pictures |
| bl-mjexHXW3OY | The Mother | page 3 has 4 pictures |
| bl-disq8LAlXH | A forest with snakes | page 3 has no picture |
| bl-9fUo0PlYl9 | Ang Magig-agaw | page 3 has no picture |
| bl-Vry7U8MTq8 | Ang Magpinsan | page 3 has no picture |
| bl-097gIArgSf | Around the World With a Chilli | page 3 has no picture |
| bl-DgupnGiclU | Around the World With a Chilli | page 3 has no picture |
| bl-KPoBwZE6QM | Basketball | page 3 has no picture |
| bl-ZAE2OFEyJa | Basketball | page 3 has no picture |
| bl-N7FFJze1PA | Chinza is Polite | page 3 has no picture |
| bl-WogbtL0C1D | Chuskit Goes to School! | page 3 has no picture |
| bl-vSKLnaz3DQ | Clean Hands, Healthy Village | page 3 has no picture |
| bl-PxVxvuIC3T | COLOR WITH US DOM GYPSIES | page 3 has no picture |
| bl-zRwuzYcT24 | Guro | page 3 has no picture |
| bl-0kGxNP7GNF | Iboboro beats his problem! | page 3 has no picture |
| bl-ig0aF6hhVH | Literacy International: Read! | page 3 has no picture |
| bl-0EyAGmicIC | Michelle Smiley is Smily | page 3 has no picture |
| bl-oiQVT32A4I | Square-Brave Bora | page 3 has no picture |
| bl-30AoWxd6Zw | Teacher | page 3 has no picture |
| bl-Xkl5n3qBoZ | The Cottonwool Doctor | page 3 has no picture |
| bl-tgxUpPyUvc | THE SCENT OF PASSION | page 3 has no picture |
| bl-DEcJGu1H8e | The talking bag | page 3 has no picture |
| bl-d2mfzQUcAn | Tjenga and the eland man | page 3 has no picture |
| bl-G1GetkPHxv | Together We're Strong | page 3 has no picture |
| bl-v3g9fTDQEB | We call her Ba - A Biography of Kasturba Gandhi | page 3 has no picture |
| bl-QSOkdCPCVY | My Choice *for mature readers* | page 30 has no picture |
| bl-8SOfXNlgS0 | A Naughty Girl | page 4 has 2 pictures |
| bl-pkWJ7clCvM | Far Away | page 4 has 2 pictures |
| bl-Cr3lFIlcCn | Susan | page 4 has 2 pictures |
| bl-PV49oCKq89 | Typhoid | page 4 has 3 pictures |
| bl-ZDTPnYFlSy | AMINA THE ORPHAN | page 4 has no picture |
| bl-Ao7Oq38Hof | Dengue | page 4 has no picture |
| bl-89tlmCurem | Dima and Owl | page 4 has no picture |
| bl-L1M6gBh912 | I Want to be Tomato | page 4 has no picture |
| bl-HceCrtHg7K | Kisirusiru, the foolish one | page 4 has no picture |
| bl-cRI9H0avUG | Literacy International: Forests | page 4 has no picture |
| bl-MDoEkDFYgf | Little Lamb | page 4 has no picture |
| bl-1IBhDEhzkU | Mga Maikling Kuwento, Tula, at Sanaysay sa Pelikulang Dekada '70 | page 4 has no picture |
| bl-cOwWgSa5TR | Syonzola and his lies | page 4 has no picture |
| bl-6j7rLeAwEJ | The Tortoise and The Weaverbird | page 4 has no picture |
| bl-0UZ8gYMgXf | Buboy's Go Bag | page 5 has 2 pictures |
| bl-6pwvY2EsgJ | Buboy's Go Bag | page 5 has 2 pictures |
| bl-De5z82tFeM | Hawa Soccer Star | page 5 has 2 pictures |
| bl-CFbrrclvbj | I am a Very Big Crocodile | page 5 has 2 pictures |
| bl-zmdUOGREFd | I am a Very Big Crocodile | page 5 has 2 pictures |
| bl-5g5kiyaozX | Proverbs | page 5 has 2 pictures |
| bl-HG73v5370l | Safe from Worms | page 5 has 2 pictures |
| bl-csT1U0PaQL | Useful Phrases 3 Phase 1, Unit 3 , Game 5 Mvskoke Growing Bilingual Community | page 5 has 2 pictures |
| bl-dc7CtcKuIv | Bats | page 5 has 3 pictures |
| bl-rm237p41KN | Bats | page 5 has 3 pictures |
| bl-wwqU8AGd3P | Bats | page 5 has 3 pictures |
| bl-AimTaRMCJa | Blind and Deaf | page 5 has no picture |
| bl-Wdl939dRFl | Blind and Deaf | page 5 has no picture |
| bl-Mn2jH4oVcu | Children of wax | page 5 has no picture |
| bl-86XFlfSyrA | Holidays | page 5 has no picture |
| bl-ncPttQCEM0 | Life in Bangco | page 5 has no picture |
| bl-N7MUAns1he | Literacy International: Seasons Around the World | page 5 has no picture |
| bl-gH48knI7At | My Pen | page 5 has no picture |
| bl-tLJXBk4d9c | Sannah: The Mute | page 5 has no picture |
| bl-ktZ8zoW8JH | Semmbinndu e Doombel | page 5 has no picture |
| bl-sV3NM8lVQ1 | Square-The Ocean Dream | page 5 has no picture |
| bl-MxA1lVw5bt | Teacher Mulongo | page 5 has no picture |
| bl-mSTVf73Yis | The Chase | page 5 has no picture |
| bl-LNSxrL75Tq | THE CUB LEFT IN THE RAIN | page 5 has no picture |
| bl-rXxdsdeWSv | The Fox and the Crow | page 5 has no picture |
| bl-NNqmgpkAPo | The friend I miss | page 5 has no picture |
| bl-Brzctxwav6 | Wagi the Happy Huli | page 5 has no picture |
| bl-UDyRK6crqp | Where Did Your Dimples Go? | page 5 has no picture |
| bl-MBIks0Ai67 | A Man Who Built a House | page 6 has 2 pictures |
| bl-apfmFOoeUJ | A Man Who Built a House | page 6 has 2 pictures |
| bl-y1g3oNMm23 | A Man Who Built a House | page 6 has 2 pictures |
| bl-4GvF1JHlfN | Skeeter the Seagull | page 6 has 2 pictures |
| bl-yqCqHcTF7i | The generous rich man | page 6 has 2 pictures |
| bl-r575liB9hD | The Lion Who Wouldn't Try | page 6 has 2 pictures |
| bl-reyaLJtC4Z | The Wolf and the Crane | page 6 has 2 pictures |
| bl-1jky7BQvID | Why is Nita Upside Down? | page 6 has 2 pictures |
| bl-pfEjahtTC0 | Why is Nita Upside Down? | page 6 has 2 pictures |
| bl-J6W9b6WUlg | Why is Tiniya Upside Down? | page 6 has 2 pictures |
| bl-8r38FezWl8 | Londi the Dreaming Girl | page 6 has 3 pictures |
| bl-F4b4kRhBWF | Agama lizard | page 6 has no picture |
| bl-54UEqmuepw | Anna and Don | page 6 has no picture |
| bl-0QIyr83MOH | Refiloe and the washed chickens | page 6 has no picture |
| bl-ATfELAESKt | Wailers Three - A Folktale From China | page 6 has no picture |
| bl-DzJ2qo9zHF | No Naughty Fingers, No Weird Websites | page 7 has 2 pictures |
| bl-nPE43HPjVu | No Naughty Fingers, No Weird Websites | page 7 has 2 pictures |
| bl-r16R0kCU9t | Princess Naldy and Her Pool Party | page 7 has 2 pictures |
| bl-T32rL2TdeO | The Philippine Flag | page 7 has 2 pictures |
| bl-cWcnT7odHT | Who Did It? *for mature readers only* | page 7 has 2 pictures |
| bl-O8PkdESF45 | The Philippine Flag | page 7 has 3 pictures |
| bl-g6Qp80Vxiz | Animals dig a well | page 7 has no picture |
| bl-0CCEF0hTuh | Animals in Action 1 Phase 1, Unit 01, Game 02b Mvskoke Growing Bilingual Community | page 7 has no picture |
| bl-549m8qRi6M | Do Your Work Well | page 7 has no picture |
| bl-LVaTScyHbj | Foods and Drinks in Kampung Ensengei, Sebuyau | page 7 has no picture |
| bl-puiajmpnVc | Go home Pig | page 7 has no picture |
| bl-v3OIwA8OOy | Haran and his pet | page 7 has no picture |
| bl-GIzQFTyH1s | How Does the Toothpaste Get into the Tube? | page 7 has no picture |
| bl-U28Gp0nMYQ | Kapopo, the Mango Tree | page 7 has no picture |
| bl-qo5mQoQEWi | Kato Clever and the big trouble | page 7 has no picture |
| bl-VaVvVAqiYF | Kuya Ko, Idolo Ko! | page 7 has no picture |
| bl-ovBR3kphig | Living Well with HIV | page 7 has no picture |
| bl-EEzmSmD8O3 | Talking Tree | page 7 has no picture |
| bl-nA5fAvSTYF | Teach Me to Read | page 7 has no picture |
| bl-EHEwgCWsHp | The Animals Dig a Well | page 7 has no picture |
| bl-vU5qiN8dKO | The bleeding apple | page 7 has no picture |
| bl-tQJFNdut3h | The Sick Hyena | page 7 has no picture |
| bl-FQMtTMm1sf | Wet Day | page 7 has no picture |
| bl-ZtqbAWoV6Z | Wet Day | page 7 has no picture |
| bl-ikl8ByJphV | Wet Day | page 7 has no picture |
| bl-pbOnvP5cAt | Wet Day | page 7 has no picture |
| bl-rssAezE8Cm | Wet Day | page 7 has no picture |
| bl-iqFNjHPMoQ | Windy Day (AI Experiment) | page 7 has no picture |
| bl-4NEtAgExlH | Toltol Raiyn | page 7 picture license: NC |
| bl-RixGM53p9Q | A5-Why is Nita Upside Down | page 8 has 2 pictures |
| bl-4M3NQ4ypJ1 | Elephant and Chameleon | page 8 has 2 pictures |
| bl-5adaPG9qmQ | Is There Anyone Like Me? | page 8 has 2 pictures |
| bl-eYJRy256kH | Kim menga  o‘xshaydi? | page 8 has 2 pictures |
| bl-SELvIkiN2r | The Unused Ball | page 8 has 2 pictures |
| bl-LzfJar6zIN | Lizard and Her Friends | page 8 has 5 pictures |
| bl-aOCRhSfqrC | Lizard and Her Friends | page 8 has 5 pictures |
| bl-nh8fXkLhyF | "Oh, Moses!" | page 8 has no picture |
| bl-M9MXavnPB6 | (11) It's OK to be Different | page 8 has no picture |
| bl-9gMPu9dSTs | Days of the week | page 8 has no picture |
| bl-Id7vt08GWg | Don likes Bats and Frogs | page 8 has no picture |
| bl-KEBZFGcgji | It's OK to be Different | page 8 has no picture |
| bl-ZMf3zdIYl1 | Kids Let's Wash Our Hands | page 8 has no picture |
| bl-TEZmDYYz2c | Lion that wanted friendship | page 8 has no picture |
| bl-ac45iNPS4O | My Diwali Book | page 8 has no picture |
| bl-YRxGF2FVs6 | My Pet | page 8 has no picture |
| bl-hSorA7NoSO | Papa at the Tap | page 8 has no picture |
| bl-B6MPtKpRKP | Play | page 8 has no picture |
| bl-TQXwSECsWd | Sizwe’s Smile | page 8 has no picture |
| bl-9UbXjAxLFT | The Dream | page 8 has no picture |
| bl-iHRBu0oBlj | The Sad King | page 8 has no picture |
| bl-UD1PxmoNLV | The Seventh Sun | page 8 has no picture |
| bl-lYUY2lI808 | Tone's Big Drop | page 8 has no picture |
| bl-5u4lo3L89c | Up World, Down World | page 8 has no picture |
| bl-MvN81OREsZ | Watch Out! The Tiger is Here! | page 8 has no picture |
| bl-RfacET0APl | What are you doing? | page 8 has no picture |
| bl-CehR5VWWhj | What Are You Doing? | page 8 has no picture |
| bl-GKAFLMjULn | What Are You Doing? | page 8 has no picture |
| bl-62WpI7JuTG | What's In the Pot? | page 8 has no picture |
| bl-sUnEuou2Gz | Why Do Bees Buzz? | page 8 has no picture |
| bl-BNvS70MJ3q | Things we Can Do | page 8 picture has no license and another copyright holder |
| bl-GAiCyK7N2I | Akatope | page 9 has 2 pictures |
| bl-9hxABbUx8K | Grandpa's Gold | page 9 has 2 pictures |
| bl-TheMJaDfwk | HOW CAN I BE COOL? | page 9 has 2 pictures |
| bl-DzWr0Ew4QW | I Wonder What This Is For? | page 9 has 2 pictures |
| bl-k1llJNLXIF | Walk, Fly, Swim | page 9 has 2 pictures |
| bl-xwHtDQFl6T | Walk, Fly, Swim | page 9 has 2 pictures |
| bl-sPXKbCNLB4 | Erenro, the Farmer | page 9 has 6 pictures |
| bl-GTAE4coAoW | Uwa, the Farmer | page 9 has 6 pictures |
| bl-OZflvhbK9V | Uwa, the Farmer | page 9 has 6 pictures |
| bl-euaQktTSAa | सुदाकर इनना कास्‍तकर मनकल | page 9 has 6 pictures |
| bl-FQGTmEBisq | (07) Look at the Animals | page 9 has no picture |
| bl-tjL95yPZcb | A Special Surprise | page 9 has no picture |
| bl-D0YuUuu1BT | Awesome Volcanos | page 9 has no picture |
| bl-5IKQZWVPde | Don likes bananas | page 9 has no picture |
| bl-4EIHf9Cfiw | Fasia: The Girl With Many Tales to Tell | page 9 has no picture |
| bl-CLgloJbB2o | Grandmother and the Smelly Girl | page 9 has no picture |
| bl-3CAbXV6Vr7 | How to Catch the Wind | page 9 has no picture |
| bl-5GlpE461Ib | How to Catch the Wind | page 9 has no picture |
| bl-Vkb2EsYU9A | I AM JUST A TOY | page 9 has no picture |
| bl-FVFV5nnuR4 | I Like to Read | page 9 has no picture |
| bl-GLD9F6xkKC | I Want Fish to Eat | page 9 has no picture |
| bl-K71m3S9Ify | Mwema the bad boy | page 9 has no picture |
| bl-JcCJl5bxJT | My friend Coco | page 9 has no picture |
| bl-Q5GrXv1gUR | Red Hen | page 9 has no picture |
| bl-BI0kWy2ng4 | Sindi and the Moon | page 9 has no picture |
| bl-giBnTObW0G | Sweet Sunday | page 9 has no picture |
| bl-IKbJv0ezlk | The story of Tiger and Cat | page 9 has no picture |
| bl-zVFpezR7Gk | The story of Tiger and Cat | page 9 has no picture |
| bl-k5qZswIWBG | The Three Doof-Doofs | page 9 has no picture |
| bl-Z67jfd2A6R | Where is my jacket? | page 9 has no picture |
| bl-beqrZKjI7Q | Where is my jacket? | page 9 has no picture |
| bl-rZV3cMX5ok | Where is the rat? | page 9 has no picture |
| bl-uZ5vapsz7T | Which Animals Do You Like? | page 9 has no picture |
| bl-8rLQf6LRxq | The Staring Game | picture /bloom/bookEdit/img/cogGrey.svg is not in the book's folder |
| bl-AUXLh4H70V | The Fox and the Crane | picture b - cover (cubierta is not in the book's folder |
| bl-GWKKsjbf46 | Story 3: The Lion and the Mosquito | read and left out: "bleed a lot!“I surren...": a missing space, and a mosquito makes a lion bleed. |
| bl-KORoDVb5RP | Animals, Animals | read and left out: "Cows and goats are paid as bride price"; a list with little story. |
| bl-7xtDpyhrGo | The Rat in the Cat | read and left out: "Fat cat. No rat." with the title The Rat in the Cat: the cat eats the rat. |
| bl-FQ9UIh7c09 | Sbu's Special Shoes | read and left out: "I can race cars!" in big brother's shoes reads as racing in traffic. |
| bl-2AvYlhy3La | I Cannot Find It | read and left out: "I cannot find my Bible": a religious item in a short list book. |
| bl-9Cd0tZNXKU | I Can Do | read and left out: "I pray." in a short list book. |
| bl-grkDAsWE3O | If I were ... | read and left out: "I would treat people with slaps!", hunting, and a priest taking people to heaven. |
| bl-vANqdOrxA4 | My first day at the market | read and left out: "My big round aunt" (a label on a body), and a lost child fears children are sold at the market (too frightening). |
| bl-prT8FpN0T6 | Look! There! | read and left out: "There is a Bible." in a short list book. |
| bl-HG24iSUYUf | Look! There! | read and left out: "There is a Bible" (religion) in a list with nothing to ask about. |
| bl-gEzthTvl3G | Sakima's song | read and left out: "You are only a blind boy" and a boy found beaten up by the road. |
| bl-k8LIoIu30X | Mbóó, a̱jma̱, ajsú. | read and left out: 10 words, mostly in another language. |
| bl-q0dFChGuOA | All about Opposites! | read and left out: 10 words: too little for 3 questions. |
| bl-niIT2IC0ug | Look in the sky. What do you see? | read and left out: 10 words: too little for 3 questions. |
| bl-wsquE6Kpw3 | Look in the sky. What do you see? | read and left out: 10 words: too little for 3 questions. |
| bl-5GddumzuBp | One Two Three | read and left out: 10 words: too little for 3 questions. |
| bl-eAbg5Y2SRN | Parts of the Body | read and left out: 10 words: too little for 3 questions. |
| bl-iuBvRydn2x | Parts of the Body | read and left out: 10 words: too little for 3 questions. |
| bl-M3t9Q8YgbU | Parts of the Face | read and left out: 10 words: too little for 3 questions. |
| bl-yWuroqWWbE | Animales de la granja | read and left out: 11 words, in Spanish. |
| bl-M7CkE5cFW9 | Animals | read and left out: 11 words: too little for 3 questions. |
| bl-OBRSjogPno | Farm Animals | read and left out: 11 words: too little for 3 questions. |
| bl-exRjqWKbME | Farm Animals | read and left out: 11 words: too little for 3 questions. |
| bl-rMH2wzIQlW | Everyone is Different | read and left out: 13 words: too little for 3 questions. |
| bl-3eZO6GkpMa | The Big Book of Nature | read and left out: 14 words: too little for 3 questions. |
| bl-Hba4fXWXbh | Things we can do | read and left out: 16 words: too little for 3 questions. |
| bl-kiuTyxwQNn | Barit bad baheh | read and left out: 20 words in another language. |
| bl-GRIqvzhRD0 | Big and little | read and left out: 20 words, half the pages without words: too little for 3 questions. |
| bl-vFQ1FdViJj | Big and little | read and left out: 20 words, half the pages without words: too little for 3 questions. |
| bl-LAISEayJPp | Little and big | read and left out: 20 words, half the pages without words: too little for 3 questions. |
| bl-ikA4WU4vpw | Little and big | read and left out: 20 words, half the pages without words: too little for 3 questions. |
| bl-Ej3t0qDIlh | Egg | read and left out: 25 words: too little for 3 questions (another upload of Egg). |
| bl-n9NNqs3nwz | Egg | read and left out: 25 words: too little for 3 questions. |
| bl-8Cjf91iCZo | Everyone is Different | read and left out: 26 words: too little for 3 questions. |
| bl-HzuVljQAa9 | The Island | read and left out: 4 words: too little for 3 questions. |
| bl-7GSFcsZ839 | I Feel | read and left out: 6 words: too little for 3 questions. |
| bl-dJYimFfFlb | I Feel | read and left out: 6 words: too little for 3 questions. |
| bl-1BIlQfo6H5 | Shapes | read and left out: 7 words: too little for 3 questions. |
| bl-8LsjfzZJ3N | Dangerous Objects | read and left out: 9 words: too little for 3 questions. |
| bl-RkaHz9P7Ua | The Zoo | read and left out: A "blood curdling scream", remarks on a man's potbelly, and the president's speech on salaries. |
| bl-FHbAbw1D7W | When I Grow Up, I'll Have a House | read and left out: A "doom room" where you "sleep in a grave", a funeral band, and a bodyguard who shows people out: too dark in places for ages 4 to 10. |
| bl-ZVkahSZ6mf | What is wrong child? | read and left out: A baby cries and nobody knows why: no story to answer; the title needs a comma. |
| bl-n6wm8KedPC | The Blacksmith's Dilemma | read and left out: A chief demands a man who bleeds real human blood, and every villager's head is shaved. |
| bl-SGFa1kxBNS | Monu was Lost and Found! | read and left out: A child gets lost (the title's "Lost and Found"). |
| bl-U3nyb8mUfQ | The Hornbill | read and left out: A child shoots a hornbill with a catapult and it is eaten (hunting, violence to an animal). |
| bl-LEZDrxFl2s | Day I left home for the city | read and left out: A child travels alone to the city and worries whether his mother is safe: too sad for ages 4 to 10. |
| bl-3Mfp79lS3v | Father's friends | read and left out: A click letter (ǃ) typed in place of "!", and "Ant ... favorite food is wood". |
| bl-5sRF2IS4XO | Goodnight, Eben! | read and left out: A copy of Goodnight, Tinku! (sw-0056), already in the library. |
| bl-UhcxbS1LKM | A House | read and left out: A copy of Houses (bl-bSwdvrAr3j). |
| bl-DJ0K4RgQch | What Type of Teeth? | read and left out: A copy of Teeth (bl-KWFeqXHHge), the African Storybook original, which is used. |
| bl-STzNrpbJuE | Who is Big? | read and left out: A copy of Who is Big? (bl-sDW77HauCs). |
| bl-l01ThqIzx3 | Gracas Dream | read and left out: A father dying, a plane crash and the politics of Mozambique: too grown-up. |
| bl-ScNfQFrnAq | Cow with one horn | read and left out: A fighting cow people are afraid of; little story. |
| bl-KCPE3nj7A8 | Forest of snakes | read and left out: A forest of snakes that eat goats, and Swahili lines left unexplained. |
| bl-0t8lGGRdV6 | Pontshibobo’s tree | read and left out: A friend presses him to "smoke a zol" (a drug) and the tree says it will die: not for ages 4 to 10. |
| bl-nPya9Q3DWX | Tselane and the Giant | read and left out: A giant kidnaps a girl. |
| bl-DJEPB3EfVz | The Talking Bag | read and left out: A giant leads a little girl away from her parents. |
| bl-Zcjq49XcpI | Flowers | read and left out: A girl goes alone to fetch water from a river, churches as part of the list, and an unfinished sentence ("because............."). |
| bl-1rlDTtAVFC | Goat, Dog and Cow | read and left out: A goat runs off without paying and a cow takes her time crossing the road: unsafe road habits as the moral. |
| bl-7x2ikQbFaz | Old Rooster | read and left out: A horse kicks a man to death. |
| bl-Rh3vylONeC | The man who lived alone | read and left out: A hyena devours the man's wife. |
| bl-3wRBNqz5Il | Kalabushe, the talkative | read and left out: A hyena swallows the girl and her aunt. |
| bl-lRXHy1WUBk | Ajay of Agumbe and the Signal Snake | read and left out: A king cobra swallows a snake, leeches feed on Ajay, and the notes describe putting a radio inside a snake. |
| bl-1r8Faw5czf | Back to School | read and left out: A list of 41 school words, nothing to ask about. |
| bl-PcdsgJqi2s | Animals (44 pictures) | read and left out: A list of 44 animal pictures with names, nothing to ask about. |
| bl-JSs1TNZx8d | Food (54 pictures) | read and left out: A list of 54 food pictures with names, nothing to ask about. |
| bl-1t4sDoGN8J | Domestic animals | read and left out: A list of animal names with nothing to ask about. |
| bl-HxtDoEU3mn | Domestic animals | read and left out: A list of animal names with nothing to ask about. |
| bl-QqCDQAgcXj | Wild Animals | read and left out: A list of animal names with nothing to ask about. |
| bl-b9LEDelBFg | Wild Animals | read and left out: A list of animal names, one a page, printed twice: nothing to ask about. |
| bl-6aaJyCcu7b | Let's Eat! | read and left out: A list of food names with nothing to ask about. |
| bl-ZjjFQWaQaC | What we eat | read and left out: A list of food names, nothing to ask about. |
| bl-S7Tbg2odYA | My first trip to Kampala | read and left out: A list of Kampala sights with odd lines ("A shower in Nakivuubo"). |
| bl-Fc7uAZq9OY | Our School | read and left out: A list of labels with uneven quotation marks. |
| bl-eSlpt84E3W | एकटा नीक दिन A Beautiful Day (Maithili-English) | read and left out: A Maithili-English upload of A Beautiful Day (bl-PIAheZZLBq). |
| bl-f19pSdhGMo | एकटा नीक दिन A Beautiful Day (Maithili-English) | read and left out: A Maithili-English upload of A Beautiful Day (bl-PIAheZZLBq). |
| bl-vRLFbTXUot | The Man and the Lion | read and left out: A man is nearly eaten by a hungry lion. |
| bl-761LoeoB5F | Nakehi and the Beans | read and left out: A man kicks over his wife's cooking and his loincloth falls off as a joke. |
| bl-7XRKU4XUJP | Noakawir and the Beans | read and left out: A man kicks over his wife's cooking in anger and his cloth falls off as a joke. |
| bl-4Iw0jmBWkF | The tree wife | read and left out: A man makes himself a wife from a tree. |
| bl-VmRHQYf6Jr | The Hours and Minutes in Ismail’s Day | read and left out: A maths workbook (time questions to the reader), not a story. |
| bl-DF8YkOHTMW | Abike's day | read and left out: A maths workbook story with questions to the reader, and a child lost alone in the bush. |
| bl-7aSvMcDc0V | Asha's Voice | read and left out: A meeting with the village's Member of Parliament and the protest song "We shall overcome": political. |
| bl-NBi4wrGiYG | Nanu's Taxi | read and left out: A missing closing quotation mark on page 2. |
| bl-vX0StFUnPe | Ketty the naughty girl | read and left out: A monster that eats children at night. |
| bl-erDmu9qEcb | Narrow escape | read and left out: A mother shoots at the cat with a gun over blood-stained sheets; a snake is killed (violence and scary). |
| bl-GhVVC9CI4k | Byantaka and the Dead Pot | read and left out: A neighbor borrows a pot and claims it died: a trick and a quarrel over a death. |
| bl-M4IveGvDbX | Visual Phonics A to Z | read and left out: A phonics letter chart, not a story. |
| bl-kHmrqewQC2 | Pickpocketer | read and left out: A pickpocket story with a missing space ("came.Mmamontsh..."). |
| bl-tSVDNqY9J7 | The Teen pilot. | read and left out: A plane catches fire and a pilot falls unconscious ("unconcious"). |
| bl-GmqmjaTpZJ | Malasile and Wetsakhulya | read and left out: A pot of rotting blood. |
| bl-elcs9cW7Cb | Picnic | read and left out: A rewrite of A Beautiful Day with made-up baby words and Dad and Papa mixed up. |
| bl-HFy8iyDhpP | Zanele Situ: My Story | read and left out: A rewrite of bl-kxS1WhIY3v with mistakes ("Some Some") and the word "lame". |
| bl-OQFiwlEpQZ | Remo's Shoes | read and left out: A rewrite of Sbu's Special Shoes: "I can race cars!" reads as racing in traffic. |
| bl-0qEZ7WpiV5 | We are Going to the Clinic | read and left out: A rewrite of Walking Together that ends with a prayer. |
| bl-TDrTnLlDry | The wisdom of the Oak Tree | read and left out: A script with the speakers' names missing on most pages, so it is unclear who says what; fixing it would mean rewriting it. |
| bl-fUkt4Of8WG | Adventures with the words and phrases | read and left out: A set of unrelated phrases for language practice, not a story. |
| bl-FbiJNg0w0b | In the Land Where Beetles Rule | read and left out: A short abstract poem with little to ask about. |
| bl-QJeeR8tW1v | The Day the Sun Went Away | read and left out: A shorter version of The day the Sun went away (bl-SkbPuCPZd0). |
| bl-TqDqEnzTAP | The Day the Sun Went Away | read and left out: A shorter version of The day the Sun went away (bl-SkbPuCPZd0). |
| bl-1jWVbi8azo | Luwo's House | read and left out: A small boy leaves church alone and walks the road looking for his house. |
| bl-EWEifcKWKh | Neymar's visit to Africa | read and left out: A soccer star's real-life visit: little story, and how-to kicking notes. |
| bl-cca6qGUK9k | Adie and Adhoch | read and left out: A stepmother drowns a girl, and her sister drowns too. |
| bl-K5VnNiI7Rs | The Market Cows | read and left out: A stray page number ("2") in the text. |
| bl-JX1x45tTRz | Magozwe | read and left out: A street child ("school.What" missing space); too sad for ages 4 to 10. |
| bl-QkYmmS1pfX | The Noisy Hare | read and left out: A thief caught in a trap and "had to pay"; mistakes all through ("anad", "Ever night", "A thieves days") that would need rewriting. |
| bl-LoAAj8WDI6 | Timonjero the thief | read and left out: A thief, and missing spaces ("hut.They"). |
| bl-Jun1P3IRmM | Wind | read and left out: A tornado swallows up the child: scary. |
| bl-JirhMSeGO0 | Lion is Sick | read and left out: A version of Lion Gets Sick: the cure is from a hyena's heart. |
| bl-XQw3wiEdq2 | Lion is Sick | read and left out: A version of Lion Gets Sick: the cure is from a hyena's heart. |
| bl-erQMwme1Ui | Itiyogben's House | read and left out: A version of Luwo's House (a small boy walks the road alone). |
| bl-XVV0nINFcT | Itiyoʼs House | read and left out: A version of Luwo's House (a small boy walks the road alone). |
| bl-XN5xO7GNHS | ANGEL | read and left out: A version of The Moon and The Cap (sw-0053), already in the library. |
| bl-BD32lipLnk | Biboy's Cap | read and left out: A version of The Moon and The Cap (sw-0053), already in the library. |
| bl-7q8PWKiicd | Dar må pittar barìtt | read and left out: A version of The Moon and The Cap (sw-0053), already in the library. |
| bl-FQ4B4fojhX | JUSTIN'S CAP | read and left out: A version of The Moon and The Cap (sw-0053), already in the library. |
| bl-jCuaXOj7wh | The Moon and My Cap | read and left out: A version of The Moon and The Cap (sw-0053), already in the library. |
| bl-4G1oic2h21 | The Moon and the Hat | read and left out: A version of The Moon and The Cap (sw-0053), already in the library. |
| bl-eRJv2BBzoK | The Moon and the Hat | read and left out: A version of The Moon and The Cap (sw-0053), already in the library. |
| bl-wtUk6KTh3Z | Leela Learns to Ride! | read and left out: A word split over two lines ("Ding-/Ding!") on every page. |
| bl-X2EO48lOC6 | Bathtub Safari | read and left out: A young child is left alone in the bath. |
| bl-TIGQsI8RuH | Amazing Daisy | read and left out: An adaptation of Amazing Daisy (bl-MISNo6Z1OP, the Book Dash original) with a missing closing quotation mark. |
| bl-G7zglg8AQY | Mrs Penguin's Perfect Palace | read and left out: An adaptation of bl-wMmKgKXlQo (Mrs. Penguin's Perfect Palace); the original is used. |
| bl-GGvbqacp3n | So Many Leaves | read and left out: An adaptation with a mistake added ("Pandanus (Banyan) leaves"); the Pratham original is checked separately. |
| bl-tFMiyh1hZx | Plants are Everywhere | read and left out: An adaptation with mistakes added ("lean on poles and climb up poles", "seagrass are rooted"). |
| bl-xJaIwCNJ45 | Men or Women | read and left out: An argument about men against women. |
| bl-x8ENWVqT2I | This Is How I Draw | read and left out: An artist's sketchbook with notes ("Medium:Watercolo..."), not a story; 1,348 words. |
| bl-e3d3GMwtCd | My mother planted | read and left out: An odd ending ("sacks of flowers") with little to ask about. |
| bl-PKwuWrHpUp | Ms Phone | read and left out: An odd portrait (five phones, one for people who owe her) with little story. |
| bl-CbLxQuAzT2 | Mulongo and the ogre | read and left out: An ogre lures children. |
| bl-N4IDXrMl9q | Mwari and the ogre | read and left out: An ogre, and uneven quotation marks. |
| bl-xeQrTpIjNL | Simbegwire | read and left out: An orphan's grief and a cruel aunt: too sad for ages 4 to 10. |
| bl-qBW4NPZOGb | Tintu's Day at the Garden | read and left out: An unclear story (a beetle asks for soup) with little to ask about. |
| bl-JB95tU8uB5 | The Fish Story | read and left out: An unclear story in which a magician's bear tries to eat the fish. |
| bl-IS9pTKrvoF | My baby boy. | read and left out: An unfortunate line about a rooster (scanner flag), and odd sentences. |
| bl-4Vzevt7B3Z | Goat, the false king | read and left out: Animals tie up the goat and drag him off; dreams of relatives dying. |
| bl-e8MeGx4VAe | How to Tame a Monster | read and left out: Another adaptation of How to Tame a Monster (bl-oyjnKnB2WG) with the pages out of order (it starts "That's okay"). |
| bl-HIf0xwaSvl | Anansi and Turtle Anansi et la Tortue | read and left out: Another telling of Anansi and Turtle (bl-ERMHxDymEF), with a mistake ("Anansi was sand") and no copyright. |
| bl-wTvu6fCn7T | The Little Red Hen | read and left out: Another telling of The Little Red Hen (bl-4yn12xdsaX), from the same pictures. |
| bl-bcArLsQyBf | Where is my Dolly? | read and left out: Another telling of the Norah story (bl-o2qHFb5zbs) with uneven quotation marks. |
| bl-d5XwwfKql7 | Where is my Dolly? | read and left out: Another telling of the Norah story (bl-o2qHFb5zbs), already in the library. |
| bl-E7TaceudNm | A Beautiful Day | read and left out: Another upload of A Beautiful Day (bl-PIAheZZLBq), with each page's text printed twice. |
| bl-R1oRAKq4S4 | A dog | read and left out: Another upload of A dog (bl-8AMIZkWZ0V). |
| bl-ESEAkdX87i | A Monkey called Manki | read and left out: Another upload of A Monkey called Manki ("anywhere- nearby"). |
| bl-l8nm9TJlTA | A Street, or a Zoo? | read and left out: Another upload of A Street, or a Zoo? (bl-Bra5VpKEm8). |
| bl-hU2A1vftYE | A Surprise for the Football Team | read and left out: Another upload of A Surprise for the Football Team (bl-EEjyHGIyGp). |
| bl-YbmRu9UGMR | A Very Tall Man | read and left out: Another upload of A very tall man (bl-5EDlLhFmlN). |
| bl-vtbWVFf5j6 | Abike's day | read and left out: Another upload of Abike's day (bl-DF8YkOHTMW). |
| bl-xxjc2t4xMX | Adie and Adhoch | read and left out: Another upload of Adie and Adhoch (drownings). |
| bl-TtD8oHxbWx | Akoro and the banana business | read and left out: Another upload of Akoro and the banana business (unexplained words). |
| bl-l6HdGCaj0C | An Ant Named Mari | read and left out: Another upload of An Ant Named Mari (bl-hPzSEW4Gsi). |
| bl-EaKaVBRbK7 | Anansi and Turtle | read and left out: Another upload of Anansi and Turtle (bl-ERMHxDymEF). |
| bl-RMRRHuIIRM | Anansi and Vulture | read and left out: Another upload of Anansi and Vulture (Anansi steals). |
| bl-3JqPj2GfcJ | Animals, Animals | read and left out: Another upload of Animals, Animals (bride price). |
| bl-cHx5T3fBYH | Anna is a Big Girl | read and left out: Another upload of Anna is a Big Girl (bl-CHLB3IYhFE). |
| bl-BZ8452OPVK | Annoying Mosquito | read and left out: Another upload of Annoying Mosquito (bl-d3RqOjKoAv). |
| bl-d3RqOjKoAv | Annoying Mosquito | read and left out: Another upload of Annoying Mosquito with the same mistake ("shill"). |
| bl-aV0BfOCRdO | Arrogant Bird Learned Lesson | read and left out: Another upload of Arrogant Bird Learned a Lesson (bl-bZEpSuEHkb). |
| bl-MqA4FHdqWj | Asha's Voice | read and left out: Another upload of Asha's Voice (bl-7aSvMcDc0V): political. |
| bl-frNI9wk7Ys | Counting | read and left out: Another upload of Counting (bl-rYVSK51hu5). |
| bl-3KaImaiPpd | Crocodile daydreams | read and left out: Another upload of Crocodile daydreams (wants to eat a dog). |
| bl-Z425A5Nr2G | Crocodile daydreams | read and left out: Another upload of Crocodile daydreams (wants to eat a dog). |
| bl-u2pcSPFmxx | Curious baby elephant | read and left out: Another upload of Curious baby elephant (bl-DhU02tDwAo). |
| bl-JKRtPnVf0T | Deepa's Resolution | read and left out: Another upload of Deepa's Resolution (a space before "?"). |
| bl-YfipsN30eU | Disability is not inability | read and left out: Another upload of Disability is not inability (left out under the rule on labels). |
| bl-jEjUmuaUT6 | Friends | read and left out: Another upload of Friends (bl-PDE01EHFGv). |
| bl-wDOtxBJ0TG | Get Down, Rocky! | read and left out: Another upload of Get Down, Rocky! (bl-scx88aqCVs). |
| bl-i0zhidpNHe | Goat and the hyena’s knife | read and left out: Another upload of Goat and the hyena's knife (Hyena will eat Goat). |
| bl-jTX2bVSUBE | Goat, Dog and Cow | read and left out: Another upload of Goat, Dog and Cow (unsafe road habits as the moral). |
| bl-grtFCzi2hl | Goat, Dog, and Cow with TV | read and left out: Another upload of Goat, Dog, and Cow with TV (bl-ckChDyvXdS). |
| bl-OggNtShfme | Grandpa Fish and the Radio | read and left out: Another upload of Grandpa Fish and the Radio ("away!They"). |
| bl-fSBEPYPbAe | Houses | read and left out: Another upload of Houses (bl-bSwdvrAr3j). |
| bl-W9hfCLHtTP | How Do You Use These Things? | read and left out: Another upload of How Do You Use These Things? (answers only in the pictures). |
| bl-Szbcvc1gXJ | I Cannot Find It | read and left out: Another upload of I Cannot Find It ("my Bible"). |
| bl-xWmPDeLdxs | I know how to play the teacher! | read and left out: Another upload of I know how to play the teacher! (hymns). |
| bl-objovd5cCz | I Like to Draw | read and left out: Another upload of I Like to Draw (bl-cg0dKM2jy5). |
| bl-72Q7XhntPC | Menga daraxtlar yoqadi | read and left out: Another upload of I like trees (bl-RfilkjDYNU), under an Uzbek title. |
| bl-9nU1AtWBAB | Icecream in Spiti | read and left out: Another upload of Icecream in Spiti (bl-UKTKWVO4tI) with many more words run together. |
| bl-IgeCDLF1YD | Jobs | read and left out: Another upload of Jobs (bl-M2mgINIpLR). |
| bl-xp7Bcefcyw | Joy goes to school | read and left out: Another upload of Joy goes to school (bl-fw7y12Xeeh). |
| bl-pUvqihNhwQ | Kaukare and Kasik Went Fishing | read and left out: Another upload of Kaukare and Kasik Went Fishing (unsafe: the boys fall on the rocks and into the ocean). |
| bl-CFyrOiuLAn | Let’s Count Legs | read and left out: Another upload of Let's Count Legs (bl-jGyaRvVUml). |
| bl-QGACDHsMEf | Life in my village | read and left out: Another upload of Life in my village (drinking blood from the cow). |
| bl-sNSmcjEdU5 | Lights in the Water | read and left out: Another upload of Lights in the Water (unsafe: a child alone in the sea at night). |
| bl-k9yqs0sbCY | Lion Gets Sick | read and left out: Another upload of Lion Gets Sick: the cure is an ointment from a hyena's heart. |
| bl-5jHn8p4tcE | Little Dog | read and left out: Another upload of Little Dog (bl-h1cxhK0aQi), with line breaks from the print layout. |
| bl-h1cxhK0aQi | Little Dog | read and left out: Another upload of Little Dog (uneven quotation marks). |
| bl-8ecZoU3nAa | Luwo's House | read and left out: Another upload of Luwo's House (a small boy walks the road alone). |
| bl-ewM2pu21BP | Maria's Family | read and left out: Another upload of Maria's Family (bl-wGdrG089au). |
| bl-b7DcmuVPzF | Mosquito | read and left out: Another upload of Mosquito ("Mosquito!!!!"). |
| bl-Vp76b8DxIv | My Friend | read and left out: Another upload of My Friend (bl-LN5OrJI9qn). |
| bl-ADTHZo4SnB | My Juggling Granny | read and left out: Another upload of My Juggling Granny ("Spoiltsports"). |
| bl-U03jdRtWkT | My red ball | read and left out: Another upload of My red ball (bl-MiVg4YRgRi). |
| bl-LOuEqFvCub | Naughty Cow | read and left out: Another upload of Naughty Cow (bl-0msgQEILAb). |
| bl-pLbfZJ6hrL | Nema Buys Thread | read and left out: Another upload of Nema Buys Thread (bl-bKz6msEr9K). |
| bl-nrH55HGvdl | Noakawir and the Beans | read and left out: Another upload of Noakawir and the Beans (bl-7XRKU4XUJP). |
| bl-fvCOlUJ0rs | Ox and Donkey | read and left out: Another upload of Ox and Donkey (a whipping, and a plan to kill the ox). |
| bl-fOo7rKEpOU | Picnic | read and left out: Another upload of Picnic (bl-elcs9cW7Cb), already in the library. |
| bl-ZXslwaW3zz | Rain | read and left out: Another upload of Rain (bl-1rVUeUXCcR). |
| bl-PGXLPpB9s7 | Remo's Shoes | read and left out: Another upload of Remo's Shoes: "I can race cars!" reads as racing in traffic. |
| bl-BT8Qdy3EQE | School Clothes | read and left out: Another upload of School Clothes (unfinished lines). |
| bl-w2yPebKbQP | Setina and her Dog | read and left out: Another upload of Setina and her Dog ("soemthing"). |
| bl-OhoAqHAkfW | Silly Meta | read and left out: Another upload of Silly Meta (a label on a child). |
| bl-TfPPnnkjph | Teeth | read and left out: Another upload of Teeth (bl-KWFeqXHHge). |
| bl-36gVZsZdqm | What type of teeth? | read and left out: Another upload of Teeth (bl-KWFeqXHHge). |
| bl-GimG59np8t | The day the Sun went away | read and left out: Another upload of The day the Sun went away (bl-SkbPuCPZd0); its copyright line is only a license note in Kyrgyz. |
| bl-fZAufUS6kA | The day the Sun went away | read and left out: Another upload of The day the Sun went away (bl-SkbPuCPZd0); its copyright line is only a license note in Russian. |
| bl-1KMcnatH3e | The Hare & the Tortoise (Again!) | read and left out: Another upload of The Hare & the Tortoise (Again!) (bl-BpsFSHbUOY). |
| bl-kKrylBr7wI | The Noisy Farm Animals | read and left out: Another upload of The Noisy Farm Animals ("Cluck,cluck!"). |
| bl-zuI0iU36mQ | The Teen pilot. | read and left out: Another upload of The Teen pilot. (a plane catches fire). |
| bl-Y97gQFMHpN | They Can Do Many Things | read and left out: Another upload of They Can Do Many Things (left out under the rule on labels). |
| bl-xhOFhFddNX | Too Big! Too Small! | read and left out: Another upload of Too Big! Too Small! (bl-HR29rbSUlL), with page 10 printed twice. |
| bl-nWmMZmARIz | Tortoise Finds his House | read and left out: Another upload of Tortoise Finds his House (bl-MozyTFFFRR). |
| bl-8ByJNBbzCF | True friends | read and left out: Another upload of True friends (text mistakes, a dog falls in a river). |
| bl-auDlJVaBSp | We made a decision | read and left out: Another upload of We made a decision (theft, child labor). |
| bl-rL7Ja3G8eC | We the nature lovers | read and left out: Another upload of We the nature lovers ("father,Priya"). |
| bl-eapbARoRRV | What Are They Doing? | read and left out: Another upload of What Are They Doing? (bl-gEHeFP9GIj). |
| bl-eaGwEaGRNQ | What is this I hear? | read and left out: Another upload of What is this I hear? (unclear lines). |
| bl-E28W620BBn | Where is it? | read and left out: Another upload of Where is it? (answers only in the pictures). |
| bl-rT6AQA5rdE | Where is my bat? | read and left out: Another upload of Where is my bat? (bl-XO5qBMpyjZ). |
| bl-jsGrv9V0Av | Who Stole Bahaiya's Smile | read and left out: Another upload of Who Stole Bhaiya's Smile? (bl-3NpGshx2Po). |
| bl-kebSNrBnkK | Whose tail is this? | read and left out: Another upload of Whose tail is this? (bl-apJRbLv3xS). |
| bl-tdkXEEcPIP | Work and Play | read and left out: Another upload of Work and Play (Ken shoots a bird). |
| bl-dhm9mGLO2H | Иллюcтрации Вуси Малинди автор Нина Оранже адаптация Карлыгач Байгазиевой | read and left out: Another upload of Zama is great! (bl-6umwhq0WvV), under a Russian title. |
| bl-qTeahwk6lG | Zama aqlli! | read and left out: Another upload of Zama is great! (bl-6umwhq0WvV), under an Uzbek title. |
| bl-AxFg88mBsU | Иллюcтрации Вуси Малинди автор Нина Оранже адаптация Карлыгач Байгазиевой | read and left out: Another upload of Zama is great! (bl-6umwhq0WvV). |
| bl-dixSkyR4oP | Delmbe mfagna biashara | read and left out: Another version of Dembe the shopkeeper (bl-gmR8JZOR9Y), already in the library. |
| bl-jnVNNoC3Yj | Delmbe mfagna biashara | read and left out: Another version of Dembe the shopkeeper (bl-gmR8JZOR9Y), already in the library. |
| bl-oODb5dF7V9 | Dembe the Businessman | read and left out: Another version of Dembe the shopkeeper (bl-gmR8JZOR9Y), already in the library. |
| bl-qpHpz7Dce6 | Grandma's Bananas | read and left out: Another version of Grandma's bananas (bl-IDzZLFhQ66) with uneven quotation marks. |
| bl-eQiJnmpJz4 | Keke's swing | read and left out: Another version of Keke's Swing (a fall with a head injury). |
| bl-dAZkyd4LBQ | What Animals Can You See? | read and left out: Another version of What Animals Can You See? (bl-oP7kQamjXU), already in the library. |
| bl-5kONReRZ3K | Zibu & Zizo | read and left out: Another version of Zibu & Zizo (bl-U4W4NFvz2l), with a mistake that one corrects ("Mama buys same clothes"). |
| bl-wclHKITUTq | Sindiwe and the Fireflies | read and left out: Apartheid and unhappy work as a cleaner; a blessing to the ancestors: too grown-up and partly religious. |
| bl-v0kRQVoPnc | Little Ant’s big plan | read and left out: Awkward rhymes and the ants carry a burger off from a restaurant; the author's name is spelled two ways in the credits. |
| bl-J7ddOEeuHQ | Uncle's farm | read and left out: Awkward sentences ("the pigeon with black and white") and a scanner flag on a word for a rooster. |
| bl-chXkktC40c | Walking Together | read and left out: Awkward, broken lines ("like that good hat I'll keep your face dry", "be brave, why cry?"). |
| bl-SPF5lsAviM | An Egg for Bride Wealth | read and left out: Bride wealth, and a missing space ("cried,“Ei"). |
| bl-Bk6RP9bFYU | I am a Big Fish | read and left out: Calls a seahorse and a reef fish "a big fish": a mistake for a fact book. |
| bl-AUpqs2FhgD | Chicken and Millipede | read and left out: Chicken swallows Millipede. |
| bl-CMB5Jr2TFs | Chicken and Millipede | read and left out: Chicken swallows Millipede. |
| bl-cTjlL79vAk | Chicken and Millipede | read and left out: Chicken swallows Millipede. |
| bl-m0AMojo4oJ | Sima and Siza | read and left out: Children push a boy's doll's head in a toilet, his father is angry about a dress, and a bleeding head injury. |
| bl-xdYmZ6F7c0 | A careless man | read and left out: Children scramble for the little food left and their mother lies down crying (too sad), and mistakes ("did not mind of storing food"). |
| bl-7VBT2OsbQe | Christmas in PNG | read and left out: Christmas church services and the birth of Jesus: religious. |
| bl-o60O3pyaCN | Otoyo | read and left out: Church on Sunday as part of the plot, and "Who would not wish to be like him?". |
| bl-GviWDllqYe | My Brothers and I | read and left out: Church on Sunday as part of the plot, children caned for being late, and mistakes all through ("head architecture", "Today is on Sunday"). |
| bl-79BRtGCUST | Can and Cannot | read and left out: Close to sw-0026 (Can and Can't), already in the library. |
| bl-vTjoiEHOzC | Can and Cannot | read and left out: Close to sw-0026 (Can and Can't), already in the library. |
| bl-Hg5lCLehuI | Cat | read and left out: Close to sw-0127 (Clean Cat), already in the library. |
| bl-TeQOEOxh1W | Cat | read and left out: Close to sw-0127 (Clean Cat), already in the library. |
| bl-0m01BEtrHj | Daddy's Moustache | read and left out: Close to sw-0432 already in the library (shares most of its text). |
| bl-GrkHJqFHri | Daddy's Moustache | read and left out: Close to sw-0432 already in the library (shares most of its text). |
| bl-eRxZfUeW73 | Bean and Coal | read and left out: Coal falls into the river and Bean laughs until he splits. |
| bl-apJRbLv3xS | Whose tail is this? | read and left out: Credits unclear: the copyright holder is a person not named as the author or illustrator, and the text has no named author. |
| bl-OHX0AqhJdl | Crocodile and Baboon | read and left out: Crocodile plans to eat his best friend. |
| bl-iyhIbzmBOC | Crocodile and Baboon | read and left out: Crocodile plans to eat his best friend. |
| bl-CVnCSLXJPR | Anansi, the crows, and the crocodiles | read and left out: Crocodiles trick and eat crows. |
| bl-iOw9BR5SmW | Anansi, the crows, and the crocodiles | read and left out: Crocodiles trick and eat crows. |
| bl-W5FPNr6QMR | Ruhang'i | read and left out: Describes a friend by his skin color ("He is brown."). |
| bl-nrepmpqnHZ | Owl Nighter Owen | read and left out: Double exclamation marks ("Hahahaha!!", "sorry!!"). |
| bl-nDhAdlNpPK | Life in my village | read and left out: Drinking blood from the cow, a bull that frightens children, and drought. |
| bl-MCpYre700D | Mosquito | read and left out: Ends "I am going to kill you Mosquito!!!!" (a threat to kill). |
| bl-KoCqUQyjRP | The Little Fish | read and left out: Ends "We should be thankful to God for the way He has made us" and "May be". |
| bl-D1JGssxt3W | Locusts | read and left out: Ends with the farms destroyed and the villagers asking what they will eat this year. |
| bl-uawk3oqpOz | My mom and I | read and left out: Ends with the mother praying for her (religion); grammar mistakes all through ("my my takes me", "On bed time"). |
| bl-cspfN0LpaK | Why the library was built? | read and left out: Every page starts with a run of dots and is a fragment ("..... a lot of story books"): it does not hold together as a book. |
| bl-5FjEw8IVnP | Arọn Buys Thread | read and left out: Every page's text is printed twice, the title names Arọn but the story is about Nema, and a private person holds the copyright of a book first published by Mercy Air and JOCUM. |
| bl-Ktv79MHYmy | Silly Meta | read and left out: Everyone calls him "Silly Meta" and his mother calls him silly again and again: a label on a child (the same story as Silly Sizwe). |
| bl-bZ8LS1FgD5 | Silly Sizwe | read and left out: Everyone calls him "Silly Sizwe" and his mother calls him "stupid": labels on a child. |
| bl-Rfu5k51g0k | My Little Goat | read and left out: Five lines: too little for 3 questions. |
| bl-Xe7kcAcOkj | My People | read and left out: Five short lines: too little for 3 questions. |
| bl-MAcXrhbszy | Suman Didi | read and left out: Four short pages with little to ask about. |
| bl-9HcCP1YxO2 | Why Frog is So Ugly | read and left out: Frog throws himself into boiling water and calls himself ugly. |
| bl-Y970PQJ7aT | Our Classroom | read and left out: Grammar mistakes ("They very noise in class", "chalks") and an unclear copyright holder ("onyinkwa.service to all"). |
| bl-TqmHS9hbpr | The Tortoise and the Bird | read and left out: Grammar mistakes all through ("felled down", "more higher", "forgive each other") that would need rewriting; the tortoise falls onto rocks and cracks his shell. |
| bl-BdD4DsTW8J | My Holiday | read and left out: Grammar mistakes all through ("I had become the first position", "Our walked together as we story tell") that would need rewriting. |
| bl-7uGXMMgk02 | We the nature lovers | read and left out: Grammar mistakes all through ("Priya was 10 years old girl", "explained her that plants gives us oxygen by which we breath"): fixing them would mean rewriting it. |
| bl-HBCQLPEsD3 | Mr. Paper... | read and left out: Grammar mistakes all through ("very useful article", "Now a days", "help out the environment it makes better place"): fixing them would mean rewriting it. |
| bl-qmJXoHSMtk | The Humble Girl | read and left out: Grammar mistakes all through ("was was going for work yet she was very late", "arrived to the school that I was going to be admitted") that would need rewriting; a moral about being favored. |
| bl-u76U34jBdS | Hamisi's lucky day | read and left out: Grammar slip ("a shirt like that boy"). |
| bl-MgTp0mn0yl | Pinky | read and left out: Grammar slip ("keen in studies") and little to ask about. |
| bl-XSEUUAbFA5 | Greed | read and left out: Grandmother shouts and Vusi runs to the toilet: little story beyond the stomachache. |
| bl-k80qQYmwG1 | Imagine | read and left out: Graves, giving birth and reaching the creator: not for ages 4 to 10. |
| bl-PwxmCIbIyR | Kumbana's Child | read and left out: Grown-up themes: pregnancy, boyfriends, and a stepfather who beats the girl. |
| bl-SAbuXLPfAD | Whose shoe is this? | read and left out: Half the pages have no words and the rest repeat one question; a rewrite with uneven quotation marks. |
| bl-7xwHBWhGqf | Hare tricks Elephant again | read and left out: Hare tells Elephant to put his legs in a fire. |
| bl-AAuWUXBMky | Ways To Avoid The Spread Of COVID-19 | read and left out: Health advice about COVID-19 beyond basic hygiene, and "etc". |
| bl-vUJAY7QZAk | Milk is good | read and left out: Health claims about milk ("breast milk") and "alot". |
| bl-JVZOpAZI8K | Goat and the hyena’s knife | read and left out: Hyena says he will eat Goat and her young. |
| bl-C4lpkMqmOa | Hare and Hyena | read and left out: Hyena threatens to eat Hare, and it ends with Hare stealing food; grammar mistakes all through ("Once a upon a time", "worked so good", "who's farm"). |
| bl-kGUb5nAp9S | Mulongo and the hyenas | read and left out: Hyenas take children into the forest. |
| bl-qqgs5VJU1w | El juego de mirar sin parpadear | read and left out: In Spanish. |
| bl-oHKCXdUYNC | Sly Jackal Tricks the Silly Donkey | read and left out: Jackal tricks Donkey into a well and leaves him trapped. |
| bl-hlwZV2K7w6 | Singing the Truth: The Story of Miriam Makeba | read and left out: Jail, apartheid laws and selling beer: too political and grown-up for ages 4 to 10. |
| bl-FrEyFzA22d | Maddy Moona’s Menagerie! | read and left out: Jokes about a lion eating the brother and a python suffocating the girl. |
| bl-Y2QFOxHOfJ | Work and Play | read and left out: Ken shoots a bird. |
| bl-LPYs8bgXkE | Naughty or Not | read and left out: Labels children as "a bad boy" and "a naughty girl". |
| bl-Y3CaSJFuDU | The lost Dog | read and left out: Letters split from words ("s lu n w bu") in the text. |
| bl-XLFiDXk9yN | Lion's fire sticks | read and left out: Lion's song threatens to eat everyone, and it ends "I will hunt you and chase you and eat you!". |
| bl-o2ElIwSVHF | Rain for Nomvula | read and left out: Long isiXhosa lines left unexplained and an unclear line ("Oh no, me!"). |
| bl-nYXLKqGfzx | Can you smile when you snore? | read and left out: Long runs of letters ("zzzzzzzzzzzzzz", "hoinkkkkkhoinkkkk") a reader cannot read aloud. |
| bl-hWHuDfFTaA | Lights in the Water | read and left out: Maisha slips out alone at night while her parents sleep and swims under the sea (unsafe behavior shown as fine). |
| bl-Se8c3eTgxn | Pumpkins? | read and left out: Many words in another language left unexplained. |
| bl-baRzAazpor | Moses and the tyre | read and left out: Mark puts something on fire and Moses shoots at a bird. |
| bl-il7uNSsnCD | A Family Learns about Immunisations | read and left out: Medical advice about immunizations (beyond basic hygiene) and uneven quotation marks. |
| bl-AArip9iyUP | A Family Learns about Immunisations | read and left out: Medical advice about immunizations, beyond basic hygiene ("childhood sicknesses that can kill them"), as with bl-il7uNSsnCD. |
| bl-rkbv82OyQ5 | Falcon Superheroes | read and left out: Melam sneaks out alone at night against his mother's wishes, shown as heroic, and trained geese leave the bully with painful wounds. |
| bl-P0eaZmMCH4 | Monkey and the hunter’s wife | read and left out: Missing spaces ("Kwi!Kwi!", "up!Throw") and a hunter's wife and a monkey. |
| bl-wfklczxtJ7 | Mr. Kigode and his family | read and left out: Mistakes all through ("Mr kigode", "specious room", "The are", "with is his children"), a lecture ("We are advised to have bathrooms like Mr. Kigode's"), and the copyright holder is unclear ("children tales"). |
| bl-DYYUGijbHJ | His Fishy Friends | read and left out: Mixed tenses ("the rains start pouring", "as fast as he can") and a boy falls into a flooding river. |
| bl-y4oX0fIWQR | Five Little Monkeys | read and left out: Monkeys bonk their heads again and again, and "Now I can lay down". |
| bl-Hza9CLjQzB | Anni yaw? | read and left out: Mostly in another language (Adi), with English only in places. |
| bl-TaST0LirOh | Si Bantay anna Si Mingming | read and left out: Mostly in another language. |
| bl-pZaeZ3B7G2 | Njeri | read and left out: Names in capitals and line breaks from the print layout all through ("UZALENDO primary school", "we go back to home") that would need rewriting, and a list with no story. |
| bl-ykF0eajzmu | Football game Chiefs and Aces | read and left out: Names no author or illustrator to credit (only a disclaimer asking for credit), and the title runs words together. |
| bl-KaMAHu4hUk | Dina's Magical Garden Adventure | read and left out: Names no author or illustrator, and the pictures carry no creator. |
| bl-YzK22r3G0I | Pip Visits the Planets | read and left out: Names no author or illustrator, and the pictures carry no creator. |
| bl-ALb450KJ6n | Colors | read and left out: Nine color words, one a page: too little for 3 questions. |
| bl-0MhyyoMWGB | Greetings | read and left out: Nine pages of "Good morning", "Good afternoon" and "Good night": too little for 3 questions. |
| bl-6A9bGIyj45 | Things I know | read and left out: Odd claims ("Mice are dangerous animals"), and a scanner flag on a word for a rooster. |
| bl-AGYMgaFJCk | Rafiki’s Style | read and left out: Older kids tease Rafiki about his teeth, skin and hair (mocking bodies). |
| bl-3Tt769gYGU | Our Friend John | read and left out: Opens "In our class John is different. John cannot walk like us.": a label on a disability. |
| bl-fJOHV3RvQY | Story 1: In Search of a Name | read and left out: Opens with "Did God tell you my name". |
| bl-U63n8nbDAH | How Night Came to Opio’s Village | read and left out: Opio is given beer to drink. |
| bl-zW3jaA0F6M | The New Boy | read and left out: Owner's call: children laugh at a disabled new boy ("He walks in a different way, too!") before he is welcomed; left out under the rule on mocking. |
| bl-SHYqRu95HB | Disability is not inability | read and left out: Owner's call: Disability is not inability names each child's disability; left out under the rule on labels. |
| bl-KcdhC2sTx0 | They Can Do Many Things | read and left out: Owner's call: each page names a person's disability ("He is blind", "has no hands") to show what they can do; left out under the rule on labels. |
| bl-fvG2rsLnqF | Picnic and Pine Needles | read and left out: Pa smokes a pipe in the first line, and quotation marks and spacing are wrong all through ("Shooo !!….niii"). |
| bl-RgtxzxxvVF | Danny The Dragon | read and left out: Page 11 repeats page 10 word for word. |
| bl-1hqSz0Xzvf | Lara the Yellow Ladybird | read and left out: Page 2 repeats page 1 word for word; "Sally's legs" points at a body. |
| bl-qCNjPXIpQh | Little Badger goes to the moon | read and left out: Page 4 repeats page 3, a spelling mistake ("to small"), and the dog leaves home alone through a scary forest and a deep river. |
| bl-EphQJsW8bI | Lekishon and the cows | read and left out: Page 7 repeats page 6 word for word. |
| bl-LH13rCbq1t | Papa's Dog | read and left out: Page 8 repeats page 7, it is unclear who Papa is ("before going to school"), and the dog barks at cars on the road. |
| bl-vgJxulAYdH | A Monkey called Manki | read and left out: People throw stones at the monkeys and a boy rushes at them with a stick (beyond mild peril for animals); several text mistakes. |
| bl-Ha363FZ1PJ | Up, Up, Up in the Sky | read and left out: Punctuation and grammar mistakes all through ("lab!", I called", "if I had took", long runs of dots) that would need rewriting. |
| bl-XUgWYJvjdn | The boy who would not listen | read and left out: Punctuation and grammar mistakes all through ("What type of fruit." Asked Eissa", "Let me get this strait") and the brothers laugh at him; fixing it would mean rewriting it. |
| bl-NOyPFYqLsT | Rainbow visits the village | read and left out: Punctuation mistake ("from the sky.” Neno said."). |
| bl-IcQi5InOSP | Under the sea | read and left out: Punctuation mistakes ("whale -watching.....") and a child drifts away from his mother while snorkeling. |
| bl-l4wFLYfSit | Why Hippos have no hair | read and left out: Rabbit has Fire burn Hippo for revenge. |
| bl-pTr1nSyh0n | The Honeyguide's Revenge | read and left out: Revenge in the title and plot: the honeyguide leads a man to a lion. |
| bl-O0ADNFGGJu | How about you? | read and left out: Rhyming nonsense with little to ask about; "eurgghhh... aargh!". |
| bl-2xpizIZV5Z | Everything is possible! | read and left out: Rita stands on her window edge and swings up onto the terrace at night (unsafe); punctuation mistakes all through that would need rewriting. |
| bl-4xjrLSlS2c | Fox and Rooster | read and left out: Rooster lies to be king, and it ends "foxes eat roosters and their families". |
| bl-AHAnUQOVTy | Rooster and Hare | read and left out: Rooster tells Hare his family chops off their heads at night, and Hare's family tries it. |
| bl-U1AzmbUyxE | My Brother Ken | read and left out: Run-on sentences, and two boys bathe in a river alone. |
| bl-5J9mFjqYgU | We are Going to the Clinic | read and left out: Same book as bl-0qEZ7WpiV5 (We are Going to the Clinic), which ends with a prayer. |
| bl-V6zwe08yUu | Come Back, Cat! | read and left out: Same book as bl-DZw4pSaygC (Come Back, Cat!), another upload. |
| bl-Y1c1xTAEU1 | What Is It? | read and left out: Same book as bl-I81XFHux5t (What Is It?), another upload. |
| bl-meM0Qs7aLB | The Sea | read and left out: Same book as bl-LKE0zR5qKe (The Sea), a translation upload; the original is used. |
| bl-Mi84BPF3ol | A Tiny Seed: The Story of Wangari Maathai | read and left out: Same book as bl-xtDFOOj29m (A Tiny Seed), a translation upload; the original is used. |
| bl-cUsWBh5pAi | Open the Door | read and left out: Same book as bl-Yt2R2HoU1F (Open the Door), another upload. |
| bl-ChdSnQmk7g | Men va do‘stim Ziyrakvoy | read and left out: Same book as sw-0030 (Timmy and Pepe), already in the library, under an Uzbek title. |
| bl-Nvk51ioVlv | Xayrli tun, Kumayik! | read and left out: Same book as sw-0056 (Goodnight, Tinku!), already in the library, under an Uzbek title. |
| bl-O8geoZJCBv | Qizil plash | read and left out: Same book as sw-0069 (The Red Raincoat), already in the library, under an Uzbek title. |
| bl-DQL2q1zEwE | Happy and Sad | read and left out: Same book as sw-0072 (Happy and Sad), already in the library. |
| bl-nKnm6sJqpO | Happy and Sad | read and left out: Same book as sw-0072 (Happy and Sad), already in the library. |
| bl-dAgjdRNK1z | Colours | read and left out: Same book as sw-0073 (Colours), already in the library. |
| bl-iB8hlHkYfU | Colours | read and left out: Same book as sw-0073 (Colours), already in the library. |
| bl-ZDGql37k6i | Tell me...now! Colours | read and left out: Same book as sw-0073 (Colours), already in the library. |
| bl-oJk3FNj3uC | Yuksak parvoz | read and left out: Same book as sw-0101 (Flying High), already in the library, under an Uzbek title. |
| bl-gdPBvX1a7W | A House for Mouse | read and left out: Same story and pictures as bl-7x6RogP4Ou (A House for Mouse), another upload. |
| bl-WquvspbNEL | Scared Tumi | read and left out: Same story as bl-hxE0zqYVh3 (Scared Tumi), a shorter translation upload; the original is used. |
| bl-uLFuoA3cCe | Whose Shoe is This? | read and left out: Same story as bl-SAbuXLPfAD (Whose shoe is this?). |
| bl-JQLyaC43WI | Oscar the Shark | read and left out: Says carrots will help the shark see better: a health myth. |
| bl-3PZLoKkUh3 | Patching Jeans by Hand | read and left out: Sewing instructions for grown-ups, not a children's book. |
| bl-wtFE3bkhVF | The Rainbow | read and left out: Six short lines: too little for 3 questions. |
| bl-RfilkjDYNU | I like trees | read and left out: Small text mistakes ("farmer grandfather", "can not") and "people starve". |
| bl-GQxm7TW199 | Tingi and the Cows | read and left out: Soldiers take the cows and hunt the boy and his grandmother. |
| bl-gn74HjkBWQ | THE INVISIBLE WAVE | read and left out: Spaces before colons and a grown-up legend of a king and a wave; 880 words. |
| bl-HwTcDj4fgx | Of Karuvadams and summer vacations | read and left out: Spaces before punctuation ("70's ,", "pregnancy .") and a grown-up memoir; 860 words. |
| bl-zhUxJz9Lp2 | Colours of a Rainbow | read and left out: Spelling mistake: "Vilolet". |
| bl-DLWDvgyB4u | THE FLAMES OF TOAFA | read and left out: Spelling mistakes ("sneack", "ennemies", "enought") and curses; 1,720 words. |
| bl-hJVJM87XtG | A Trip to Zanzibar | read and left out: Swahili names left unexplained and unclear lines ("watching at an angle"). |
| bl-VZKQ1FahB4 | Setina and her Dog | read and left out: Teaches grabbing a dog's nose to punish it, and "I am much smarter than my dog". |
| bl-vGownOuWfz | Where Is It? | read and left out: Ten "Where is the ...?" questions answered only in the pictures. |
| bl-jJ1h4BFt08 | Mrs. Rubandama the Tailor | read and left out: Tense and grammar mistakes all through ("She had a sewing machine here", "She makes ... She can make tops skirts") that would need rewriting. |
| bl-eLyXMgnI5h | Child Listens and Helps Mother | read and left out: Tense and grammar mistakes all through ("told Melay that they will visit", "So he went along with their plot") and no author named. |
| bl-Ln8tMyChJD | Do not scare the snakes! | read and left out: Text mistake ("Close the mango tree" for close to) and the girls fall out of a tree. |
| bl-0RlyptyxJg | The Wise Man | read and left out: Text mistake ("father- in-law") and a story about wives. |
| bl-OVqXEhfI3e | How Do Actions Change Me? | read and left out: Text mistake ("loking") and "... like girls" teasing. |
| bl-N7Wo1cR3Vu | Keke's Swing | read and left out: Text mistake ("Next time I help you") and a fall from a swing with a head injury. |
| bl-kQdi49O0sB | Thimba to the rescue! | read and left out: Text mistake ("peddling" for pedaling) and maths questions to the reader. |
| bl-zMeZotjBmb | The Day the Vegetables Came to School | read and left out: Text mistake ("really you?\" The que..." lowercase after a question) and a queen of vegetables plot with little sense. |
| bl-JkiOMnC0J4 | Whose button is this? | read and left out: Text mistake (a missing opening quote) and the hero plays on a busy road. |
| bl-qUSZD2rHZV | Mogau's Gift | read and left out: Text mistake from the print layout ("happi- ness"); calls the village "a dull African village". |
| bl-NHaLGjW022 | Mina and the Birthday Dress | read and left out: Text mistake: "Idon't". |
| bl-IvLCVoinPQ | My daughter Polar | read and left out: Text mistake: "This my daughter Polar." |
| bl-ylpCY9rZWO | Sleepy Mr. Sloth | read and left out: Text mistake: "Try climb one more branch". |
| bl-ji70TGCZCd | Sane in the market | read and left out: Text mistake: "where is mother mother?" |
| bl-1rVUeUXCcR | Rain | read and left out: Text mistake: a double full stop ("hair.."). |
| bl-ogYKTt7rBB | Yes you can! | read and left out: Text mistake: a missing opening quote on page 3. |
| bl-LVDGHlHIt4 | Wait for Us! | read and left out: Text mistake: a missing space ("breath.Yes"). |
| bl-KBfvyWdDvs | The Noisy Farm Animals | read and left out: Text mistake: a missing space ("Cluck,cluck!"). |
| bl-ckChDyvXdS | Goat, Dog, and Cow with TV | read and left out: Text mistake: a missing space ("taxi.They"). |
| bl-PIAheZZLBq | A Beautiful Day | read and left out: Text mistake: a missing space ("too!”says Dog"). |
| bl-oLgY9LaYL7 | There must be a rainbow | read and left out: Text mistake: the quotation marks on page 8 do not match; a storm destroys the village's homes. |
| bl-tjCDkHJa8h | The Smell Thief | read and left out: Text mistakes ("‘ Good morning,’", a missing quotation mark on page 13) and a baker drags a homeless woman to court. |
| bl-8AMIZkWZ0V | A dog | read and left out: Text mistakes ("a man with his one dog", "every thing", unfinished sentences). |
| bl-YZhnEdQIui | The Girl who Played | read and left out: Text mistakes ("an old man with her wife", "Some one", "Kollo") and a punishment. |
| bl-hMYzQppNc6 | Palesa Can Walk! | read and left out: Text mistakes ("And, with one big heave, pushes herself up" has no subject; "A Sandile?"). |
| bl-x67Ccxbr6L | King Kayanja and his daughter | read and left out: Text mistakes ("andhis" in the title, "said,“Let’s") and a bride price plot. |
| bl-scx88aqCVs | Get Down, Rocky! | read and left out: Text mistakes ("Baaaaaa!Silly humans", "Rocy"). |
| bl-Jr3hahgB8L | Importance of trees | read and left out: Text mistakes ("Everyday", "Everytime Clouds") and a prayer for rain. |
| bl-HR29rbSUlL | Too Big! Too Small! | read and left out: Text mistakes ("for e to carry you", a missing exclamation mark, "ABBU"). |
| bl-y3DH7Gy0o4 | Foxy Joxy Plays a Trick | read and left out: Text mistakes ("Fox Joxy", "water- melon") and the animals stuff the fox in a melon and kick it. |
| bl-ZE7f1Dqa9p | A careless man | read and left out: Text mistakes ("He did not mind of storing food") and hungry children crying. |
| bl-fwtVoatYaB | Jojo and Cow | read and left out: Text mistakes ("Jojo living with his mother", "go to bed"). |
| bl-5FVHiOrFJq | The Playful Toto | read and left out: Text mistakes ("Mr.Tito", "towars") and church on Sunday as part of the plot of a day. |
| bl-BWTAQQObNi | Swimming | read and left out: Text mistakes ("On day", "I don't know to swim") and a drowning with mouth-to-mouth rescue. |
| bl-8tfdxOAZ5E | The Giraffe | read and left out: Text mistakes ("please! please! help..", "up to date") and unclear opening. |
| bl-fw7y12Xeeh | Joy goes to school | read and left out: Text mistakes ("put water in basin", "played all the day"). |
| bl-MKUG1Muct0 | True friends | read and left out: Text mistakes ("sitting in an umbrella", "fishes") and a dog falls in a river. |
| bl-saxmmWDVVs | Soccer Game is Good | read and left out: Text mistakes ("the best payer", "Maloki"). |
| bl-LN5OrJI9qn | My Friend | read and left out: Text mistakes ("wrapped around his Friend", mixed tenses) and a child with no name living alone in a field. |
| bl-yD8WKiPzI4 | Say No | read and left out: Text mistakes and body-safety advice ending with a girl slapping boys. |
| bl-drNBDRZLmm | Tumi Goes to the Park | read and left out: Text mistakes from the print layout ("bring- ing", "BYE,TUMI!"). |
| bl-bZEpSuEHkb | Arrogant Bird Learned Lesson | read and left out: Text mistakes in the title alone ("Arrogant Bird Learned Lesson"). |
| bl-XGGWm1gER0 | Clever Goats | read and left out: Text mistakes, and a man spears his own goat. |
| bl-XBLO7p8oF2 | The busy big mango tree | read and left out: Text mistakes, politicians, a drinking place and prayers. |
| bl-sEnQoSQGoa | Thandi misses her school bus | read and left out: Thandi walks to school with a stranger, shown as fine (unsafe); punctuation missing all through. |
| bl-BTE9jcrPaj | The Secrets of Rocks | read and left out: The adaptation adds a young-Earth claim ("as young as 7,000 years", "dispelling many long-age theories") to the Pratham science book: a religious claim in a science book. |
| bl-rtWm1zrBDC | Rabbit Goes to a Party | read and left out: The animals pull Rabbit's ears as a punishment. |
| bl-vhZxie5DEy | How Do You Use These Things? | read and left out: The answers are only in the pictures: nothing to ask about the words. |
| bl-XO5qBMpyjZ | Where is my bat? | read and left out: The bat is never found: a list of places with no story to ask about. |
| bl-zzl8agh72I | One hot Saturday afternoon | read and left out: The children disobey, swim in the river alone and are spanked. |
| bl-qrcQWH9ber | The Biscuit Jar Must Fall | read and left out: The children try one unsafe way after another to reach a high shelf (chairs, shoulders, a rope). |
| bl-6XP6jzvDGK | 02 - Cat and Dog and the Ball | read and left out: The copyright line is only a license note in Kyrgyz and names no author or publisher; the title carries a series number ("02 -"). |
| bl-OKyJx6Lf1s | Linda's Surprise | read and left out: The cover credits "Grade 1 Students" while a private person holds the copyright; and mistakes all through ("she ask to see it", a missing quotation mark, "suprised"). |
| bl-aTPEugcFIT | Crocodile daydreams | read and left out: The crocodile wants to eat a dog ("Dogs are good to eat too"). |
| bl-CZl6R3lk9g | Lion Gets Sick | read and left out: The cure is an ointment from a hyena's heart. |
| bl-RqStjNHg1a | Eagle And The Hen | read and left out: The eagle begins eating the hen's chicks (violence). |
| bl-f8VXS1hYBN | So the clock came to be... | read and left out: The Earth prays to God for help (religion), and grammar mistakes ("The talked and talked"). |
| bl-ytjFpHhRFB | The Elephant and the Frogs | read and left out: The elephant kills all the frogs and is put in prison (violence). |
| bl-BVZZB5BHx2 | Children of wax | read and left out: The English text pages carry web addresses and Kyrgyz credit lines. |
| bl-2Xcb4Sie3M | Ox and Donkey | read and left out: The farmer whips the donkey and plans to kill and eat the ox. |
| bl-mlkTQP8DuU | My Father and His Dog | read and left out: The father shoots a wild pig. |
| bl-5Qv2xYm1XM | Queen of Soweto: The Story of Basetsana Kumalo | read and left out: The life story of a beauty-pageant winner and TV star: not for ages 4 to 10. |
| bl-ZIG1K9TOsk | My family and I | read and left out: The lines do not make sense together ("My dinosaur and I", "make monkey balls from clay"). |
| bl-CPXoeThE3p | All About the Great Barrier Reef | read and left out: The pictures are credited to "AI" and the copyright names Google: not clearly open. |
| bl-UU6JPfqQ9C | No pigs allowed | read and left out: The pig is thrown down from the sky and lands on his nose. |
| bl-YBwGzN81zm | We Have Grown so Much! | read and left out: The same girl is called Ankita and Anku, and it is not clear who is whose sister: fixing it would mean guessing. |
| bl-6XGmUp7Fyf | Rat and Frog | read and left out: The snake blames "bad spirits". |
| bl-CfBFcdGtnG | Mother's phone gets lost | read and left out: The story skips how the phone was found, and mistakes ("to go to get ready", a stray quotation mark). |
| bl-YOA5fMo826 | I know how to play the teacher! | read and left out: The teacher "sings hymns in order": religious practice in a school book. |
| bl-PynSHZrDvx | My Eyes | read and left out: The text does not hold together ("I use it for reading even for looking at things that are beautiful to look at around", page 2 repeats page 1): fixing it would mean rewriting it. |
| bl-digk5MYidm | My first birthday party | read and left out: The text does not hold together ("promised to organize for him his first birthday party", "after twenty five years"): fixing it would mean rewriting it. |
| bl-AYIcSiYgTh | Our Happy Family | read and left out: The text marked as English is in another language. |
| bl-omRW9MZgTg | My fish! No, it's my fish! | read and left out: The text marked as English is in Spanish. |
| bl-mghRS1Yic3 | Lion and Zebra Look for water | read and left out: The text marked as English is mostly isiXhosa. |
| bl-tJj2ODGfJa | SIN0THANDO AND HER DOG MVELO: FINDING THE LOST BALL | read and left out: The text marked as English is mostly isiZulu. |
| bl-6jFUJ8jeEv | Si Melay at Ang Gulayan | read and left out: The title and text are in Filipino. |
| bl-DZACnzNEy6 | Ang Pamilya | read and left out: The title is in Filipino (Ang Pamilya); a family list book. |
| bl-T8hSbtdx8Z | Sigir, It va Echki | read and left out: The title is in Uzbek; a copy of Goat, Dog and Cow (unsafe road habits as the moral). |
| bl-OTf1DeL0VB | Thembi's Family | read and left out: The title says Thembi but the girl says "I am Maria". |
| bl-MqriPgkQvI | Mod the Toad | read and left out: The toad is burned by a bush fire and blistered. |
| bl-R6b2equUsP | River Temu | read and left out: The villagers chase away their headman: politics as the plot. |
| bl-28wOjGEY5X | The Boy who Cried Wolf | read and left out: The wolf eats the whole flock (as with the other tales where animals are eaten). |
| bl-r7uga0HaMe | New pussy cat | read and left out: The word the text uses for a cat trips the profanity filter on every page. |
| bl-CG7Y1Brt1x | We made a decision | read and left out: Theft, child labor and people cut by broken glass: too grown-up. |
| bl-rJbC50SZ2V | How tortoise’s nose became crooked | read and left out: Tortoise beats Mole with a big stick and Mole bites his nose until it bleeds (violence). |
| bl-2VjV9Xc9bb | Tortoise and rabbit's journey to the bats’ party | read and left out: Tortoise tricks Rabbit out of all the food; grammar mistakes all through that would need rewriting ("once they reach at the party", "rabbit then moved out running"). |
| bl-FkaMWn1nqP | Kaukare and Kasik Went Fishing | read and left out: Two boys go fishing alone on a reef rock; one hits his head and the other falls into the ocean, played for fun (unsafe). |
| bl-sR5HrZ153W | The Tortoiseshell Beetle | read and left out: Unclear free verse ("She wipes away the dejected faces of other adults", "tries hard to fix himself"). |
| bl-WaGuyuIHTQ | What is this I hear? | read and left out: Unclear lines ("do you hear all these things, or no?"). |
| bl-vk2MLNYeYy | Nakitto at School | read and left out: Unclear sentences ("They went out for more lessons."). |
| bl-IoojSP5JGq | Papa and the Snake | read and left out: Uneven quotation marks and a snake scare. |
| bl-F60EkJQWif | Anansi and Vulture | read and left out: Uneven quotation marks; Anansi steals from Vulture. |
| bl-NuNqpoT4PX | Young Palinyang’ | read and left out: Unexplained words and a grown-up tale of a herd and a curse. |
| bl-wTv8qxo1e0 | Akoro and the banana business | read and left out: Unexplained words and grammar slips ("do such job"). |
| bl-BVrO2mRF2m | Old grandmother | read and left out: Unexplained words in another language and "Old grandmother" teased. |
| bl-J5nMMddog0 | School Clothes | read and left out: Unfinished lines ("This belt is...") with little to ask about. |
| bl-BvTpxksEY0 | Saxiy qarg‘a | read and left out: Uzbek title; a copy of another book. |
| bl-rEjGrXklld | Live and let live | read and left out: Written as a script with mistakes all through ("Ones upon a time", "Men 's selfishness", "big- big buildings") that would need rewriting. |
| bl-AGLeXxuGlK | Chicken Care Book 1 Introduction and Preparation | the book's notes say "BY-NC" |
| bl-ZBxarq22ty | Chicken Care Book 2 Daily Care | the book's notes say "BY-NC" |
| bl-Wuvgzs0pUc | Chicken Care Book 3 Increasing the Number of Chickens | the book's notes say "BY-NC" |
| bl-tRPvXie0dc | Chicken Care Book 4 Common Sicknesses | the book's notes say "BY-NC" |
| bl-2OY4EEdFhZ | I Got Shoes | the book's notes say "BY-NC" |
| bl-5mubDU9lw9 | I Got Shoes | the book's notes say "BY-NC" |
| bl-imrQXp2mgY | I have Ten Fingers | the book's notes say "BY-NC" |
| bl-OCq7b2B58h | I Have Ten Fingers | the book's notes say "BY-NC" |
| bl-WwAa2y5GHB | I Have Ten Fingers | the book's notes say "BY-NC" |
| bl-7i09ABAft3 | Making Compost in a Steel Drum | the book's notes say "BY-NC" |
| bl-td21oJzQZo | Malaria | the book's notes say "BY-NC" |
| bl-0kM9ok9Tej | Rice Paddy Book 1 How to Plant Rice | the book's notes say "BY-NC" |
| bl-N4RDLyis3C | Rice Paddy Book 2 Problems with Poor Soil | the book's notes say "BY-NC" |
| bl-9HI10OqZN7 | Rice Paddy Book 3 Problems with Pests | the book's notes say "BY-NC" |
| bl-Z2r2LTGX5a | Rice Paddy Book 4 Problems with Diseases | the book's notes say "BY-NC" |
| bl-2sXxyESV6r | The Bird and the Turtle | the book's notes say "BY-NC" |
| bl-4zMlgMiWBf | The Bird and the Turtle | the book's notes say "BY-NC" |
| bl-25cHHebJwE | Tiki Stole | the book's notes say "BY-NC" |
| bl-UmVveEvaqz | Tiki Stole | the book's notes say "BY-NC" |
| bl-hlHFO6Z02n | What is that Animal? | the book's notes say "BY-NC" |
| bl-2ZW1F7xuD7 | What is That Animal? | the book's notes say "BY-NC" |
| bl-LVmVv8JWwo | Who is the Best? | the book's notes say "BY-NC" |
| bl-lKi3zDXuJp | Who is the Best? | the book's notes say "BY-NC" |
| bl-e86FoR7IZC | Fight the Virus! | the book's notes say "may not be used" |
| bl-dg9oRGt2Sv | Fox and Rooster | the book's notes say "NonCommercial" |
| bl-4URRIxzahX | A Family’s Experience with COVID-19 at Home | the book's notes say "permission" |
| bl-KiLv8gjpnp | A Family’s Experience with COVID-19 at Home | the book's notes say "permission" |
| bl-We8PQUrUCL | A Family’s Experience with COVID-19 at Home | the book's notes say "permission" |
| bl-oRt5FP3nMx | A Family’s Experience with COVID-19 at Home | the book's notes say "permission" |
| bl-rzSAYulG9Z | A Sustainable Future? The Effects of Climate Change | the book's notes say "permission" |
| bl-xF9DI3HEyn | Cats and Kittens | the book's notes say "permission" |
| bl-V6t8SW66eC | Count Animals | the book's notes say "permission" |
| bl-o3aNsSbJoh | Count Animals | the book's notes say "permission" |
| bl-2zVALiSeOR | Count to Ten | the book's notes say "permission" |
| bl-q3mew1VxIU | Count to Ten | the book's notes say "permission" |
| bl-TmOQiBBUTY | From Arid Lands to Well-Watered Fields | the book's notes say "permission" |
| bl-5Fk5CrhVzR | Gardening for Better Nutrition | the book's notes say "permission" |
| bl-YLd4g2ESlN | How Family Planning Methods Work | the book's notes say "permission" |
| bl-cL21fI1zdX | How Family Planning Methods Work | the book's notes say "permission" |
| bl-w5MXUKN9es | How to Build an Outside Toilet (Basic Latrine Design) | the book's notes say "permission" |
| bl-1a4tDc16sX | Let's go | the book's notes say "permission" |
| bl-oNkLP7wUqe | Let's go | the book's notes say "permission" |
| bl-W2RV57N3Yb | Magnificent Mangroves Protecting coasts, fostering fish and storing carbon | the book's notes say "permission" |
| bl-XPFxmCoZHq | Restoring a Mangrove Forest The View from Mexico​ | the book's notes say "permission" |
| bl-W3mfjQHSXf | Restoring a Tropical Forest: The View from Sabah | the book's notes say "permission" |
| bl-CF0MuzOlRW | Safe Drinking Water​ | the book's notes say "permission" |
| bl-ylNb5L6GFN | The Book of Hygiene | the book's notes say "permission" |
| bl-AeZPk0iQ4f | The Book of Water | the book's notes say "permission" |
| bl-EL4L7zeqle | The farmer and the soothsayer | the book's notes say "permission" |
| bl-nSht9yB3Kf | The Problem with Plastic | the book's notes say "permission" |
| bl-2BHeM9renh | Vaccinations | the book's notes say "permission" |
| bl-ynnPworJ8Z | Vaccinations | the book's notes say "permission" |
| bl-utrFZzPOmI | Washing Your Hands A Handbook for Children | the book's notes say "permission" |
| bl-W4LAE0hD3W | Waste Management Household Rubbish Pits and a Community Waste Collection Service | the book's notes say "permission" |
| bl-X6NNTtljKP | Waste Management Reduce, Reuse, Recycle | the book's notes say "permission" |
| bl-jmQsbWECzM | A Simple Chicken Feeder | the book's notes say "Permission" |
| bl-uwst8Emaqj | An Easy Way to Water Seeds (and Tree Seedlings) | the book's notes say "Permission" |
| bl-nbeCY5j3Wu | BiocharA‌ special form of charcoal‌ | the book's notes say "Permission" |
| bl-5jW5JoPhQS | Bokashi for Better SoilImproving fertility without fertiliser‌ | the book's notes say "Permission" |
| bl-ymQIH6X5Sd | Cattle Care | the book's notes say "Permission" |
| bl-DaNATZZD46 | Collecting and Keeping Seeds | the book's notes say "Permission" |
| bl-HVxliYE9Wi | Coping with Climate Change Tips for Farmers | the book's notes say "Permission" |
| bl-GQnK02TyeN | Crickets - the New Cattle? | the book's notes say "Permission" |
| bl-wwcAEYrxdP | Cultivating Eru | the book's notes say "Permission" |
| bl-r0no9SzRGy | Early Maize Seedlings | the book's notes say "Permission" |
| bl-lV6J7yLeEA | Eelgrass - Environmental Gains and Edible Grains | the book's notes say "Permission" |
| bl-AMqDlEnOD9 | Farming with Disabilities | the book's notes say "Permission" |
| bl-6QraUGs7qz | Fattening Cattle in Your Backyard | the book's notes say "Permission" |
| bl-ETAxGhqzEU | Food and Farming An overview of relevant Shell Books | the book's notes say "Permission" |
| bl-NdMwn7X6ba | From Arid Lands to Well-Watered Fields | the book's notes say "Permission" |
| bl-mtSsdD4nFm | Gardening in Small Spaces | the book's notes say "Permission" |
| bl-TsdesbASg8 | Good Granary Design | the book's notes say "Permission" |
| bl-CeZRdgoffG | Growing Bamboo | the book's notes say "Permission" |
| bl-uYOaTWi8ij | Growing Mushrooms | the book's notes say "Permission" |
| bl-VMB30sBByP | Growing Vegetables in Bags | the book's notes say "Permission" |
| bl-xt4PP51QnE | Harvesting Fruit the Easy Way | the book's notes say "Permission" |
| bl-LWmjBJDEqC | How to Extract Quality Honey | the book's notes say "Permission" |
| bl-PotjRpI9nr | How to Make and Use a Donkey Plough | the book's notes say "Permission" |
| bl-YBJnr7Q2Gz | How to Make and Wear a Bee-Keeper's Veil | the book's notes say "Permission" |
| bl-MOlt8yKulx | How to Manage Bees | the book's notes say "Permission" |
| bl-WnGNfl8OFd | How to Manage Bees | the book's notes say "Permission" |
| bl-p4izcX5f8M | How to Store Grain Effectively | the book's notes say "Permission" |
| bl-GjSySIRN88 | How to Treat Coccidiosis in Chickens | the book's notes say "Permission" |
| bl-llfGlNOSGo | Hydroponics Growing Crops without Soil | the book's notes say "Permission" |
| bl-LIM2f5sNsI | Increase Chicken Production | the book's notes say "Permission" |
| bl-wqNPR8lHvQ | Keeping Fish and Ducks | the book's notes say "Permission" |
| bl-WbllPy7VME | Lining a Fishpond | the book's notes say "Permission" |
| bl-qjjemAC7tD | Making a Beehive | the book's notes say "Permission" |
| bl-740inRDzei | Making Compost in a Pit or Box | the book's notes say "Permission" |
| bl-NBVs3hv0bf | Natural Pesticides Helpful Weeds | the book's notes say "Permission" |
| bl-GZZhkf5QUX | Natural Pesticides Red Chilli Peppers | the book's notes say "Permission" |
| bl-TJDGoa1Ifi | Natural Pesticides Wood and Rice Husk Ash | the book's notes say "Permission" |
| bl-fzgGpoXNtG | Natural Regeneration A bonus for farmers | the book's notes say "Permission" |
| bl-Lj0FUaVElr | Pig Farming Raising and Caring for Pigs | the book's notes say "Permission" |
| bl-QKTZYsbbaP | Raising Fish | the book's notes say "Permission" |
| bl-ztGRGx76ID | Raising Goats | the book's notes say "Permission" |
| bl-EbNBthu6Z5 | Small Livestock Farming Grasscutters (Cane Rats) | the book's notes say "Permission" |
| bl-hOFNJeZFkL | Small Livestock Farming Guinea Pigs | the book's notes say "Permission" |
| bl-DUNZpBeHr6 | Small Livestock Farming Rabbits | the book's notes say "Permission" |
| bl-6CWM8excRY | Starting a Tree Nursery | the book's notes say "Permission" |
| bl-GloDgPOSkO | Sterilising Seed Beds | the book's notes say "Permission" |
| bl-X8IwBCXcKS | The Lizard and the Hyena | the book's notes say "Permission" |
| bl-Rm88FqmkRw | Two Farmers Talking about Conservation Agriculture | the book's notes say "Permission" |
| bl-yZeWDXSo65 | Two Productive Gardens: The Midi and the Mini | the book's notes say "Permission" |
| bl-axqdL9Hrzv | Using a Sandbar to Grow Pumpkins | the book's notes say "Permission" |
| bl-Oxd996qNzs | Vermicompost: Improving soil with the aid of worms | the book's notes say "Permission" |
| bl-jgk42RW57A | Versatile Vetiver A Grass of Many Virtues | the book's notes say "Permission" |
| bl-NWgOSJTLtc | Who would eat a false banana? | the book's notes say "Permission" |
| bl-J2KBpBbZLh | Willow for Healthier Lambs A Natural Tonic for Sheep | the book's notes say "Permission" |
