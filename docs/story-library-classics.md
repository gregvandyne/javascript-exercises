# Story Library: the Classics shelf

Written by `scripts/import-classics.js` (2026-11-20). Do not edit by hand: change `seed-library/classics.json` or the importer and run it again.

## Sources

Illustrated editions that are in the public domain, read from Project Gutenberg's HTML transcriptions (saved from the GITenberg mirror on GitHub). Only the public-domain words and pictures are used: Project Gutenberg's headers, footers, license text and name are not copied, and the site does not name Project Gutenberg (no endorsement is implied). The ebook numbers are kept here and in `seed-library/classics.json` only.

**The rule** (`checkPublicDomain` in `server/library/classics-lib.js`): published before 1931 (public domain in the US), and the author, illustrator and translator all died before 1956, so the book is out of copyright in "life plus 70 years" countries too. A translator not named in the book counts as anonymous: the book is old enough (published before 1931) for an anonymous work to be free everywhere.

| Ebook | Edition | Published | Makers | Used |
| --- | --- | --- | --- | --- |
| 32488 | Just So Stories, Doubleday, Page & Company, New York | 1912 | Rudyard Kipling (author, died 1936); Joseph M. Gleeson (illustrator, died 1917) | yes |
| 18732 | Aesop's Fables: A New Revised Version From Original Sources, Frank F. Lovell & Company, New York | 1884 | Aesop (author, lived about 564 BC); the translator (not named in the book) (translator, not named); Harrison Weir (illustrator, died 1906); John Tenniel (illustrator, died 1914); Ernest Griset (illustrator, died 1907) | yes |
| 19994 | The Aesop for Children, Rand McNally & Company, Chicago | 1919 | Aesop (author, lived about 564 BC); Milo Winter (illustrator, died 1956) | no: illustrator Milo Winter died in 1956, not before 1956 (still in copyright in life-plus-70 countries) |
| 14838 | The Tale of Peter Rabbit, Frederick Warne & Co. | 1902 | Beatrix Potter (author, died 1943); Beatrix Potter (illustrator, died 1943) | yes |
| 15077 | The Tale of Mr. Jeremy Fisher, Frederick Warne & Co., New York | 1906 | Beatrix Potter (author, died 1943); Beatrix Potter (illustrator, died 1943) | yes |
| 45264 | The Tale of Two Bad Mice, Frederick Warne & Co., London | 1904 | Beatrix Potter (author, died 1943); Beatrix Potter (illustrator, died 1943) | yes |
| 17089 | The Tale of Mrs. Tittlemouse, Frederick Warne & Co. | 1910 | Beatrix Potter (author, died 1943); Beatrix Potter (illustrator, died 1943) | yes |
| 14877 | The Tale of Ginger and Pickles, Frederick Warne & Co. | 1909 | Beatrix Potter (author, died 1943); Beatrix Potter (illustrator, died 1943) | yes |
| 11757 | The Velveteen Rabbit, Doubleday & Company, Garden City, New York | 1922 | Margery Williams (author, died 1944); William Nicholson (illustrator, died 1949) | yes |
| 17860 | Stories from Hans Andersen, Hodder & Stoughton, London | 1911 | Hans Christian Andersen (author, died 1875); the translator (not named in the book) (translator, not named); Edmund Dulac (illustrator, died 1953) | yes |

## Pages

Each story is cut into pages that fit half of a 1280 x 720 screen in the reader's Classics type (`paginate`, `PAGE_FIT`: at most 13 lines of about 42 characters and 105 words). A page ends only where a sentence ends (never inside one, nor between the lines of a poem or list that is one sentence, nor after "Mr."), preferably where a paragraph ends, and never right after a fable's title. Each picture goes on the page with the sentence it illustrates: for Kipling the sentence just before it (or one a person names from its caption), for Beatrix Potter the words after it (a run of pictures shares them out), for Aesop each fable's main picture with that fable. Pictures printed as decoration (head- and tail-pieces, big first letters) are not used; captions printed as paragraphs are left out (`skip`). The words are the author's own: only clear typos are corrected (listed below), the big first letter printed as a picture is put back, and a first word printed in small capitals is set in normal type.

## Totals

- Books: **21** (Pre-K/K: 0, Grade 1: 0, Grade 2: 0, Grade 3: 2, Grades 4-5: 19); left out: 2
- Pictures: 4.4 MB (WebP; pages at most 720 px, quality 40; covers 440 px, quality 55)
- The grade rule is the library's (`gradeOf`), with the length cap raised to 4,000 words for this source.

## Included

| Id | Title | Grade | Score | Words | Pages | With a picture | Ebook | Author | Pictures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cl-jeremy-fisher | The Tale of Mr. Jeremy Fisher | Grade 3 | 3.41 | 810 | 22 | 22 | 15077 | Beatrix Potter | Beatrix Potter (1906) |
| cl-tittlemouse | The Tale of Mrs. Tittlemouse | Grade 3 | 3.13 | 1155 | 28 | 25 | 17089 | Beatrix Potter | Beatrix Potter (1910) |
| cl-aesop-animal-wisdom | Aesop's Fables: Animal Wisdom | Grades 4-5 | 3.8 | 629 | 9 | 6 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-aesop-clever-thinking | Aesop's Fables: Clever Thinking | Grades 4-5 | 3.83 | 890 | 15 | 6 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-aesop-friends | Aesop's Fables: Friends and Helpers | Grades 4-5 | 3.96 | 1073 | 15 | 6 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-aesop-lions-wolves-foxes | Aesop's Fables: Lions, Wolves and Foxes | Grades 4-5 | 3.88 | 772 | 12 | 2 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-aesop-showing-off | Aesop's Fables: Showing Off | Grades 4-5 | 4.01 | 739 | 11 | 5 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-aesop-wind-and-sun | Aesop's Fables: The Wind, the Sun and the Trees | Grades 4-5 | 3.76 | 735 | 12 | 4 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-aesop-think-again | Aesop's Fables: Think Again | Grades 4-5 | 3.95 | 815 | 12 | 3 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-aesop-tricksters | Aesop's Fables: Tricks and Flattery | Grades 4-5 | 3.86 | 728 | 12 | 6 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-aesop-wanting-more | Aesop's Fables: Wanting More | Grades 4-5 | 3.78 | 612 | 10 | 5 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-aesop-work-and-fair-play | Aesop's Fables: Work and Fair Play | Grades 4-5 | 3.88 | 674 | 10 | 1 | 18732 | Aesop | Harrison Weir, John Tenniel, Ernest Griset (1884) |
| cl-camel | How the Camel Got His Hump | Grades 4-5 | 3.65 | 881 | 13 | 2 | 32488 | Rudyard Kipling | Joseph M. Gleeson (1912) |
| cl-whale | How the Whale Got His Throat | Grades 4-5 | 4.1 | 999 | 14 | 2 | 32488 | Rudyard Kipling | Joseph M. Gleeson (1912) |
| cl-armadillos | The Beginning of the Armadillos | Grades 4-5 | 4.28 | 2579 | 36 | 2 | 32488 | Rudyard Kipling | Joseph M. Gleeson (1912) |
| cl-emperors-new-clothes | The Emperor's New Clothes | Grades 4-5 | 4.27 | 1683 | 23 | 2 | 17860 | Hans Christian Andersen | Edmund Dulac (1911) |
| cl-kangaroo | The Sing-Song of Old Man Kangaroo | Grades 4-5 | 3.97 | 994 | 15 | 2 | 32488 | Rudyard Kipling | Joseph M. Gleeson (1912) |
| cl-ginger-and-pickles | The Tale of Ginger and Pickles | Grades 4-5 | 3.81 | 1141 | 29 | 23 | 14877 | Beatrix Potter | Beatrix Potter (1909) |
| cl-peter-rabbit | The Tale of Peter Rabbit | Grades 4-5 | 3.54 | 971 | 26 | 26 | 14838 | Beatrix Potter | Beatrix Potter (1902) |
| cl-two-bad-mice | The Tale of Two Bad Mice | Grades 4-5 | 3.83 | 923 | 26 | 26 | 45264 | Beatrix Potter | Beatrix Potter (1904) |
| cl-velveteen-rabbit | The Velveteen Rabbit | Grades 4-5 | 4.5 | 3898 | 50 | 7 | 11757 | Margery Williams | William Nicholson (1922) |

### Text corrected by Oomba

- cl-tittlemouse The Tale of Mrs. Tittlemouse: "Mrs. tittlemouse was a most" → "Mrs. Tittlemouse was a most" (capital letter); "Mrs. tittlemouse went on her way" → "Mrs. Tittlemouse went on her way" (capital letter); "Mrs. tittlemouse began to pull" → "Mrs. Tittlemouse began to pull" (capital letter); "Mrs. tittlemouse decided" → "Mrs. Tittlemouse decided" (capital letter)

### Scanner flags reviewed by a person

- cl-jeremy-fisher The Tale of Mr. Jeremy Fisher: Read by a person: "it seized Mr. Jeremy with a snap" is a trout catching the frog (he is spat out at once), not personal information; nothing to change.
- cl-aesop-friends Aesop's Fables: Friends and Helpers: Read by a person: the Lion "was about to kill" the Mouse but lets him go (mild peril; nobody is hurt); nothing to change.
- cl-aesop-wanting-more Aesop's Fables: Wanting More: Read by a person: "A Woman possessed a Hen" means owned; nothing to change.
- cl-armadillos The Beginning of the Armadillos: Read by a person: "the prickles hurt him" (a jaguar's sore paw), "those directions" and "This is a mess!" are ordinary words; nothing to change.
- cl-emperors-new-clothes The Emperor's New Clothes: Read by a person: "how stupid his neighbour was" is the story's point about vanity, not a label on a child; nothing to change.
- cl-two-bad-mice The Tale of Two Bad Mice: Read by a person: "The knife crumpled up and hurt him" (a doll's tin knife bends and a mouse sucks his finger) is mild; nothing to change.
- cl-velveteen-rabbit The Velveteen Rabbit: Read by a person: "made all in one piece" (the toy rabbit's body) is not the name of a cartoon; nothing to change.

## Left out

| Ebook | Story | Reason |
| --- | --- | --- |
| 14848 | The Story of Miss Moppet | read and left out: Its first sentence calls the kitten "a Pussy" (the old word for a cat); today the word reads as rude to many parents and the site's word filter flags it, and the author's words are not ours to change. |
| 15137 | The Tale of Mrs. Tiggy-Winkle | read and left out: Several old names and words read as rude today and the site's word filter flags them ("Cock Robin" twice, "little dicky shirt-fronts", "Tom Titmouse"), and the author's words are not ours to change; the copy that was transcribed is also a 1986 printing. |
