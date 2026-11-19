# Story Library: sources and the launch set

Written by `scripts/import-stories.js` (2026-11-19). Do not edit by hand: change `seed-library/storyweaver.json` or the importer and run it again.

## Source

StoryWeaver picture books by Pratham Books, from the community mirrors `global-asp/pb-source` (story text, `en/NNNN_slug.md`) and `global-asp/pb-imagebank` (`large/NNNN/NN.jpg` pictures and `metadata/NNNN.md`, one license per picture). Pratham Books does not endorse Oomba Academy.

## License rule (checked in code: `server/library/import-lib.js`)

- The story text must be CC BY 4.0 or Public Domain, and so must every picture the book uses, each read from its own row of the metadata table.
- Anything else is left out: NC, ND, SA, a version other than 4.0, a missing license, or a row that cannot be read (for example a table row whose columns ran together).
- Pictures are used only when there is exactly one more picture than text pages (picture 01 is the cover, picture N+1 goes with page N). Anything else is left out rather than guessed.
- Every book page and every reader page credits the title, author, illustrator(s), translator(s), "Pratham Books, StoryWeaver", the license with a link to its deed, and says Oomba resized the pictures and shows one page at a time. The story words are not changed (whitespace and conversion leftovers only).

## Reading levels

From the words on each page that has text, and the words in the whole book:

- **Level 1 (Just starting)**: at most 12 words a page on average, no page over 20, at most 150 words in all.
- **Level 2 (Learning to read)**: at most 30 words a page on average and 450 words in all.
- **Level 3 (Reading on my own)**: longer, up to 1200 words. Longer books are left out of the launch set.

## Choosing the launch set

Every candidate below was read in full by a person and checked for ages 4 to 10: no violence beyond mild peril, nothing scary or gory, no romance, no religious instruction, no stereotypes, nothing likely to upset parents, and no mistakes in the source text (we may not correct a story's words). The site's text scanners (`textfilter.profanityMatch`, `personalInfo`, the Builder's `prefilter` and `mockClassify`) run on every page; a flagged book is left out unless a person reviewed the flag (listed below). Each book has 3 questions written by Oomba (two about what the text says, one that needs a small inference), each pointing at the page that answers it, and an optional glossary for words US children may not know.

## Totals

- Books in the source: 395
- Included: **58** (level 1: 18, level 2: 25, level 3: 15)
- Left out: 337
  - licensed, not picked for the launch set: 222
  - pictures do not line up with pages: 52
  - read and left out: 40
  - too long for the launch set: 15
  - an image license: unreadable: 6
  - picture N.jpg is in the metadata but not in the image bank: 2
- Pictures on the site: 14.1 MB (WebP, pages at most 720 px, covers 440 px)

## Included

| Id | Title | Level | Words | Pages | Text | Illustration | Translation | License |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sw-0026 | Can and Can't | 1 | 50 | 7 | Radha HS | Ruchi Shah | – | CC BY 4.0 |
| sw-0073 | Colours (Tell me now series) | 1 | 65 | 11 | Madhav Chavan | Rijuta Ghate | – | CC BY 4.0 |
| sw-0382 | Crocky and friends | 1 | 74 | 7 | Khushboo Awasthi | Herminder Ohri, Bulbul Sharma | – | CC BY 4.0 |
| sw-0055 | Curly and Straight | 1 | 73 | 13 | Radha HS | Ruchi Shah | – | CC BY 4.0 |
| sw-0072 | Happy and Sad (Tell me now series) | 1 | 64 | 11 | Madhav Chavan | Rijuta Ghate | – | CC BY 4.0 |
| sw-0114 | I Am Not Afraid! | 1 | 106 | 11 | Mini Shrinivasan | Rayika Sen | – | CC BY 4.0 |
| sw-0100 | I Can Climb! | 1 | 89 | 11 | Mini Shrinivasan | Deval Maniar | – | CC BY 4.0 |
| sw-0103 | I Can Make Things! | 1 | 91 | 11 | Mini Shrinivasan | Tanvee Nabar | – | CC BY 4.0 |
| sw-0317 | Lalu the owl | 1 | 58 | 5 | Payoshni Saraf | Wiehan de Jager | – | CC BY 4.0 |
| sw-0041 | Look At Me | 1 | 120 | 11 | Pankaj Chaturvedi | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0262 | Many Bananas | 1 | 68 | 8 | Smruthi K | Angie & Upesh | – | CC BY 4.0 |
| sw-0125 | My Best Friend | 1 | 111 | 11 | Anupa Lal | Suvidha Mistry | – | CC BY 4.0 |
| sw-0064 | My Friends | 1 | 69 | 11 | Rukmini Banerji | Rajeev Verma 'Banjara' | Manisha Chaudhry | CC BY 4.0 |
| sw-0048 | My Home | 1 | 114 | 15 | Rukmini Banerji | Rajeev Verma 'Banjara' | Manisha Chaudhry | CC BY 4.0 |
| sw-0010 | Pehelwaan Ji | 1 | 108 | 15 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0087 | Rain, Rain | 1 | 109 | 11 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0001 | Smile Please! | 1 | 102 | 11 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0118 | Why, Oh Why! | 1 | 54 | 11 | Richa Bhaskar | Shailja Jain Chougule | – | CC BY 4.0 |
| sw-0008 | "My fish!" "No, my fish!" | 2 | 185 | 11 | Suraj J Menon | Soumya Menon | – | CC BY 4.0 |
| sw-0046 | Aaloo-Maaloo-Kaaloo | 2 | 141 | 7 | Vinita Krishna | Suvidha Mistry | Ritu Singh | CC BY 4.0 |
| sw-0047 | Bunty and Bubbly | 2 | 120 | 11 | Sorit Gupto | Sorit Gupto | – | CC BY 4.0 |
| sw-0126 | Busy Ants | 2 | 192 | 11 | Kanchan Bannerjee | Deepa Balsavar | – | CC BY 4.0 |
| sw-0031 | Cheep Cheep Drip Drip | 2 | 127 | 11 | Lubaina Bandukwala | Zainab Tambawalla | – | CC BY 4.0 |
| sw-0021 | Chhuk-Chhuk-Chhak | 2 | 124 | 7 | Vinita Krishna | Suvidha Mistry | Ritu Singh | CC BY 4.0 |
| sw-0101 | Flying High | 2 | 235 | 8 | Vidya Tiware | Rijuta Ghate | Rohini Nilekani | CC BY 4.0 |
| sw-0018 | Goloo the Circle | 2 | 174 | 8 | Jagdish Joshi | Jagdish Joshi | – | CC BY 4.0 |
| sw-0124 | Grandma's Glasses | 2 | 296 | 10 | Rohini Nilekani | Tanaya Vyas | – | CC BY 4.0 |
| sw-0014 | I Want That One! | 2 | 292 | 11 | Mala Kumar | Soumya Menon | – | CC BY 4.0 |
| sw-0052 | Little Painters | 2 | 199 | 11 | Cheryl Rao | Tanvi Choudhury | – | CC BY 4.0 |
| sw-0067 | Lost and Found | 2 | 153 | 11 | Sukhada Rahalkar | Sukhada Rahalkar | – | CC BY 4.0 |
| sw-0105 | Mouse in the House | 2 | 260 | 11 | Sowmya Rajendran | Tanaya Vyas | – | CC BY 4.0 |
| sw-0005 | Not Now, Not Now! | 2 | 177 | 7 | Rohini Nilekani | Ruchi Shah | – | CC BY 4.0 |
| sw-0063 | Playtime | 2 | 138 | 10 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0044 | Ramya's Stars | 2 | 242 | 9 | Mala Ashok | Helga Parekh | – | CC BY 4.0 |
| sw-0020 | Rani's First Day at School | 2 | 179 | 6 | Cheryl Rao | Mayur Mistry | – | CC BY 4.0 |
| sw-0009 | Susheela's Kolams | 2 | 210 | 9 | Sridala Swami | Priya Kuriyan | – | CC BY 4.0 |
| sw-0053 | The Moon and The Cap | 2 | 143 | 11 | Rohini Nilekani | Angie & Upesh | – | CC BY 4.0 |
| sw-0069 | The Red Raincoat | 2 | 231 | 9 | Kiran Kasturia | Zainab Tambawalla | – | CC BY 4.0 |
| sw-0059 | This and That | 2 | 101 | 7 | Radha HS | Ruchi Shah | – | CC BY 4.0 |
| sw-0030 | Timmy and Pepe | 2 | 175 | 11 | Madhav Chavan | Santosh Pujari | – | CC BY 4.0 |
| sw-0003 | Vayu, the Wind | 2 | 194 | 10 | Madhuri Pai | Rijuta Ghate | Rohini Nilekani | CC BY 4.0 |
| sw-0036 | What Does Anu See? | 2 | 181 | 11 | Lavanya Karthik | Lavanya Karthik | – | CC BY 4.0 |
| sw-0045 | What Shall I Wear Today? | 2 | 136 | 9 | Natasha Sharma | Tanvi Choudhury | – | CC BY 4.0 |
| sw-0120 | Anaya's Thumb | 3 | 445 | 9 | Natasha Sharma | Ruchi Shah | – | CC BY 4.0 |
| sw-0013 | Aunty Jui's Baby | 3 | 682 | 17 | Madhuri Purandare | Madhuri Purandare | Pratham Books Team | CC BY 4.0 |
| sw-0062 | Bheema, the Sleepyhead | 3 | 281 | 7 | Kiran Kasturia | Shweta Mohapatra | Rajesh Khar | CC BY 4.0 |
| sw-0094 | Going to Buy a Book | 3 | 278 | 9 | Rukmini Banerji | Santosh Pujari | – | CC BY 4.0 |
| sw-0056 | Goodnight, Tinku! | 3 | 421 | 11 | Preethi Nambiar | Sonal Goyal, Sumit Sakhuja | – | CC BY 4.0 |
| sw-0061 | Lassi, Ice-cream or Falooda? | 3 | 299 | 7 | Mala Kumar, Manisha Chaudhry | Priya Kuriyan | – | CC BY 4.0 |
| sw-0024 | No Smiles Today | 3 | 243 | 6 | Cheryl Rao | Saurabh Pandey | – | CC BY 4.0 |
| sw-0017 | Peacocks and Pakodas! | 3 | 361 | 7 | Mala Kumar, Manisha Chaudhry | Priya Kuriyan | – | CC BY 4.0 |
| sw-0057 | Ritu's Letter Gets Longer! | 3 | 597 | 14 | Mala Kumar | Henu | – | CC BY 4.0 |
| sw-0121 | Saboo and Jojo | 3 | 285 | 8 | Herminder Ohri | Herminder Ohri | – | CC BY 4.0 |
| sw-0096 | Samira Goes Shopping | 3 | 629 | 13 | Bharati Jagannathan | Preeti Krishnamurthy | – | CC BY 4.0 |
| sw-0091 | The Boat Ride | 3 | 358 | 8 | Herminder Ohri | Herminder Ohri | – | CC BY 4.0 |
| sw-0035 | The Scarecrows on Parade | 3 | 514 | 13 | Shamim Padamsee | Tanaya Vyas | – | CC BY 4.0 |
| sw-0051 | The Timid Train | 3 | 619 | 11 | Bharati Jagannathan | Preeti Krishnamurthy | – | CC BY 4.0 |
| sw-0034 | Veeru Goes to the Circus | 3 | 294 | 9 | Richa Ingle Deo | Reshma Barve | – | CC BY 4.0 |

### Scanner flags reviewed by a person

- sw-0073 Colours (Tell me now series): The scanner's violence rule matches "blood": it is a science question ("Why is blood red? There is iron in the blood"). Reviewed: fine.
- sw-0103 I Can Make Things!: The scanner's private-person rule matches "my sister": the narrator's sister in the story, not a real person. Reviewed: fine.
- sw-0096 Samira Goes Shopping: The scanner's chat rule matches "don't talk to any strangers": a mother's safety advice. Reviewed: fine.

## Left out

| Id | Title | Reason |
| --- | --- | --- |
| sw-0002 | Fat King Thin Dog | read and left out: Held back for the owner to decide: the jokes poke fun at body size ("fat king"). |
| sw-0004 | Chuskit Goes to School! | pictures do not line up with pages (23 images for 21 pages) |
| sw-0006 | Counting on Moru | picture 25.jpg is in the metadata but not in the image bank |
| sw-0007 | Listen to My Body | read and left out: A mistake in the source text ("mothers kitchen"). |
| sw-0011 | Sister, Sister, Where Does the Sun Go at Night? | licensed, not picked for the launch set (not read yet) |
| sw-0012 | Everything looks new! | read and left out: Religious practice is central (praying to a goddess, the Holika bonfire). |
| sw-0015 | Hot Tea and Warm Rugs | picture 15.jpg is in the metadata but not in the image bank |
| sw-0016 | Kheer on a Full Moon Night | read and left out: Several religious festivals are central (Navaratri dolls, Deepavali firecrackers). |
| sw-0019 | The Cat in the Ghat! | too long for the launch set (1221 words) |
| sw-0023 | Little by Little | read and left out: Violence: boiling water is thrown at a wolf, and the wolves threaten to "tear you to pieces". |
| sw-0025 | The Missing Bat | read and left out: An old man is described by his hunchback and the joke is at his expense. |
| sw-0027 | Jungle Brew | too long for the launch set (3029 words) |
| sw-0028 | Going to a Wedding | licensed, not picked for the launch set (not read yet) |
| sw-0029 | Going Home | read and left out: A child runs across a busy road through traffic; a page is repeated in the source text. |
| sw-0032 | Paper Play | pictures do not line up with pages (12 images for 10 pages) |
| sw-0033 | Suraj and Sher Singh | read and left out: A page is repeated in the source text, and a child is called "a fat boy". |
| sw-0037 | The Jungle School | read and left out: Lines are repeated in the source text and the ending is unclear. |
| sw-0038 | My Balwadi | pictures do not line up with pages (11 images for 9 pages) |
| sw-0039 | A Walk Among Trees | too long for the launch set (3808 words) |
| sw-0040 | Sister, Sister, Where Does Thunder Come From? | licensed, not picked for the launch set (not read yet) |
| sw-0042 | Sister, Sister Why is the Sky So Blue? | licensed, not picked for the launch set (not read yet) |
| sw-0043 | Sister, Sister, Why Don't Things Fall Up? | licensed, not picked for the launch set (not read yet) |
| sw-0049 | Kaka and Munni: A Folktale from Punjab | licensed, not picked for the launch set (not read yet) |
| sw-0050 | Too Many Bananas | read and left out: A religious ceremony (a pooja with a priest and offerings to the gods) is central to the plot. |
| sw-0054 | Do and Don't | licensed, not picked for the launch set (not read yet) |
| sw-0058 | Sailing Home | too long for the launch set (1385 words) |
| sw-0060 | Annual Haircut Day | licensed, not picked for the launch set (not read yet) |
| sw-0066 | My Car | read and left out: Children ride a toy car after being told not to, and one loses a tooth. |
| sw-0068 | The Auto That Flew | licensed, not picked for the launch set (not read yet) |
| sw-0070 | Bani | licensed, not picked for the launch set (not read yet) |
| sw-0071 | Colours of Nature | licensed, not picked for the launch set (not read yet) |
| sw-0074 | Naughty or Not (Tell me now series) | read and left out: Labels children as "a bad boy" and "a naughty girl". |
| sw-0075 | Gulli's Box of Things | licensed, not picked for the launch set (not read yet) |
| sw-0076 | Paplu, the Giant | too long for the launch set (1213 words) |
| sw-0078 | Cheenu's Gift | licensed, not picked for the launch set (not read yet) |
| sw-0079 | Kallu's World 1 - In Big Trouble Again! | too long for the launch set (1989 words) |
| sw-0080 | The Day the Vegetables Came to School | pictures do not line up with pages (17 images for 15 pages) |
| sw-0081 | The Generous Crow | read and left out: Romance joke ("Are you getting married soon?"). |
| sw-0082 | The Woodcutter of Gura - A Folktale from Ethiopia | pictures do not line up with pages (11 images for 9 pages) |
| sw-0083 | Three for Free - A Folktale from Taiwan | pictures do not line up with pages (7 images for 7 pages) |
| sw-0084 | Who is a good dog? | read and left out: A man threatens a dog ("I am going to teach you a lesson") and catches it. |
| sw-0085 | When Amma Went to School | read and left out: A pet snake eats a pet mouse, then chases the class. |
| sw-0086 | Grandpa Fish and the Radio | image 07.jpg license: unreadable |
| sw-0088 | The Flyaway Cradle | licensed, not picked for the launch set (not read yet) |
| sw-0089 | The Magic Powder - A Folktale from Myanmar | licensed, not picked for the launch set (not read yet) |
| sw-0090 | Raza Meets the King | too long for the launch set (1250 words) |
| sw-0092 | The Sparrow and The Fruit | read and left out: A boy is beaten and a cow is whipped. |
| sw-0093 | Marching to Freedom | too long for the launch set (1401 words) |
| sw-0095 | Shobhini and Nani | licensed, not picked for the launch set (not read yet) |
| sw-0097 | Sniffles, the Crocodile and Punch, the Butterfly | read and left out: Hunters with guns come to kill crocodiles for their skins. |
| sw-0098 | The Hare & the Tortoise (Again!) | pictures do not line up with pages (16 images for 14 pages) |
| sw-0099 | Here Comes the Camel and Other Poems | pictures do not line up with pages (18 images for 19 pages) |
| sw-0102 | Rumniya | licensed, not picked for the launch set (not read yet) |
| sw-0104 | I lost my bat! I found my bat! | pictures do not line up with pages (9 images for 7 pages) |
| sw-0106 | What If? | licensed, not picked for the launch set (not read yet) |
| sw-0107 | Samira's Awful Lunch | image 07.jpg license: unreadable |
| sw-0108 | The Royal Toothache | pictures do not line up with pages (11 images for 11 pages) |
| sw-0109 | Monkey Business on Stage - Kallu's World 2 | pictures do not line up with pages (5 images for 5 pages) |
| sw-0110 | Smart Sona Helps Her Mother | image 07.jpg license: unreadable |
| sw-0111 | Too Much Noise | read and left out: An angry grown-up calls a tiger "stupid" and glares at his wife. |
| sw-0112 | Phani's Funny Chappals | licensed, not picked for the launch set (not read yet) |
| sw-0113 | Topsy Turvy | licensed, not picked for the launch set (not read yet) |
| sw-0115 | I Can Help! | image 07.jpg license: unreadable |
| sw-0116 | Wailers Three - A Folktale From China | pictures do not line up with pages (11 images for 9 pages) |
| sw-0117 | Tok Tok | licensed, not picked for the launch set (not read yet) |
| sw-0119 | Pehelwaan ji Plays Cricket | licensed, not picked for the launch set (not read yet) |
| sw-0122 | First House | read and left out: A tiger has killed an animal and the body is described. |
| sw-0123 | Under My Bed | licensed, not picked for the launch set (not read yet) |
| sw-0127 | Clean Cat | licensed, not picked for the launch set (not read yet) |
| sw-0128 | Noisy Crows | licensed, not picked for the launch set (not read yet) |
| sw-0129 | Naughty Dog | licensed, not picked for the launch set (not read yet) |
| sw-0130 | The Boy and the Drum | pictures do not line up with pages (13 images for 13 pages) |
| sw-0131 | The Elephant Bird | too long for the launch set (1447 words) |
| sw-0132 | We Are All Animals | licensed, not picked for the launch set (not read yet) |
| sw-0133 | The Boy and the Drum (A Shorter Version) | pictures do not line up with pages (11 images for 11 pages) |
| sw-0134 | Pishi Caught in a Storm | read and left out: A deep wound and dead tissue are described; the animal's life is in danger. |
| sw-0135 | Singing in the Rain | read and left out: A spelling mistake in the source text ("dinosuar"); we do not change a story's words. |
| sw-0136 | Tara Finds Her Stars | read and left out: Reads as a child travelling alone and being asked if she has run away. |
| sw-0137 | Spot and Spike | licensed, not picked for the launch set (not read yet) |
| sw-0138 | Thangwang and Bhalluka | read and left out: A baby alone with a wild bear; the fact page says bears kill goats. |
| sw-0139 | My Juggling Granny | pictures do not line up with pages (9 images for 7 pages) |
| sw-0140 | It's All the Cat's Fault! | licensed, not picked for the launch set (not read yet) |
| sw-0141 | Who Made This World? | read and left out: Religious ("Who made this world? God knows!"). |
| sw-0143 | The Lantern Queen | pictures do not line up with pages (1 images for 1 pages) |
| sw-0144 | The cat and the monkey | licensed, not picked for the launch set (not read yet) |
| sw-0145 | The Jolly Juggler | licensed, not picked for the launch set (not read yet) |
| sw-0146 | My Diwali Book | pictures do not line up with pages (22 images for 18 pages) |
| sw-0147 | Mili's birthday celebration | licensed, not picked for the launch set (not read yet) |
| sw-0148 | BooBoo sings for Vihaan | licensed, not picked for the launch set (not read yet) |
| sw-0149 | Where is Gogo? | licensed, not picked for the launch set (not read yet) |
| sw-0151 | Ammu's Puppy | licensed, not picked for the launch set (not read yet) |
| sw-0152 | Mangoes For Moidootty | licensed, not picked for the launch set (not read yet) |
| sw-0153 | The Woman With No Soul | pictures do not line up with pages (1 images for 1 pages) |
| sw-0154 | The Princess and the Veggy Lion | licensed, not picked for the launch set (not read yet) |
| sw-0155 | When Percy Said Sorry | licensed, not picked for the launch set (not read yet) |
| sw-0156 | Subami's Family | licensed, not picked for the launch set (not read yet) |
| sw-0157 | My Musical Adventure | licensed, not picked for the launch set (not read yet) |
| sw-0158 | Asha gives up a bad habit! | pictures do not line up with pages (1 images for 1 pages) |
| sw-0159 | The puppy that did not bark!!! | licensed, not picked for the launch set (not read yet) |
| sw-0160 | Preetha Aunty- My teacher | licensed, not picked for the launch set (not read yet) |
| sw-0161 | The Cave Party | licensed, not picked for the launch set (not read yet) |
| sw-0162 | Climb and Hop | licensed, not picked for the launch set (not read yet) |
| sw-0163 | Me and my Strong Kite | licensed, not picked for the launch set (not read yet) |
| sw-0164 | The Horrible Crocobots | too long for the launch set (1552 words) |
| sw-0165 | The Story-Pooping Cat | licensed, not picked for the launch set (not read yet) |
| sw-0166 | Have You Seen These Birds? | read and left out: A list of bird names, not a story (too little text for 3 questions). |
| sw-0167 | Didi and the Colourful Treasure | read and left out: Held back for the owner to decide: children live by a garbage dump and do not go to school. |
| sw-0168 | My Anti Litter Poem | licensed, not picked for the launch set (not read yet) |
| sw-0169 | Eat and Share | licensed, not picked for the launch set (not read yet) |
| sw-0170 | What Makes You Special? | read and left out: A mistake in the source text ("What's makes you special?"). |
| sw-0171 | Jaggee's mornings | licensed, not picked for the launch set (not read yet) |
| sw-0172 | Tree on a plate | licensed, not picked for the launch set (not read yet) |
| sw-0173 | Fun with Balloon | licensed, not picked for the launch set (not read yet) |
| sw-0174 | My Friend Trace Roger the robot! | licensed, not picked for the launch set (not read yet) |
| sw-0175 | Don't get scared! Try! | licensed, not picked for the launch set (not read yet) |
| sw-0176 | Nadir's Pet | licensed, not picked for the launch set (not read yet) |
| sw-0177 | Amazing Ants | licensed, not picked for the launch set (not read yet) |
| sw-0178 | Long Water | licensed, not picked for the launch set (not read yet) |
| sw-0179 | Stripey the Bee | licensed, not picked for the launch set (not read yet) |
| sw-0180 | The Rainbow Story | licensed, not picked for the launch set (not read yet) |
| sw-0181 | Prakruti | licensed, not picked for the launch set (not read yet) |
| sw-0182 | Animals Are Kind | licensed, not picked for the launch set (not read yet) |
| sw-0184 | The boy who hated vegetables | licensed, not picked for the launch set (not read yet) |
| sw-0185 | The Surprise | licensed, not picked for the launch set (not read yet) |
| sw-0186 | Secrets of the earth | pictures do not line up with pages (2 images for 0 pages) |
| sw-0187 | Happy world | licensed, not picked for the launch set (not read yet) |
| sw-0188 | Where Is My Mother? | licensed, not picked for the launch set (not read yet) |
| sw-0189 | Tina and the crazy animal | licensed, not picked for the launch set (not read yet) |
| sw-0190 | Kaushik, the Kind Detective | pictures do not line up with pages (14 images for 10 pages) |
| sw-0191 | Richard's unlucky day | licensed, not picked for the launch set (not read yet) |
| sw-0192 | The Disaster | licensed, not picked for the launch set (not read yet) |
| sw-0193 | Timmi's dream | read and left out: Mistakes in the source text ("touch it's nose") and a thin story. |
| sw-0194 | Dadhi's crazy specatal day | read and left out: Mistakes in the source text, including the title ("specatal"). |
| sw-0195 | The party | licensed, not picked for the launch set (not read yet) |
| sw-0196 | Mr. Fish won't talk | licensed, not picked for the launch set (not read yet) |
| sw-0197 | The Race | licensed, not picked for the launch set (not read yet) |
| sw-0199 | The Magical Zoo | licensed, not picked for the launch set (not read yet) |
| sw-0200 | The Unusual Rainmaking Duet | licensed, not picked for the launch set (not read yet) |
| sw-0201 | The Brave Girl | licensed, not picked for the launch set (not read yet) |
| sw-0202 | Sheela Learns to make friends | licensed, not picked for the launch set (not read yet) |
| sw-0203 | The train journey | licensed, not picked for the launch set (not read yet) |
| sw-0204 | The Story of Stories | licensed, not picked for the launch set (not read yet) |
| sw-0205 | Golu Detective | licensed, not picked for the launch set (not read yet) |
| sw-0206 | The Duet of Rainmakers | pictures do not line up with pages (1 images for 1 pages) |
| sw-0207 | No Tricking Kutti | licensed, not picked for the launch set (not read yet) |
| sw-0208 | The Brave Kitten | licensed, not picked for the launch set (not read yet) |
| sw-0209 | The Man likes to Sing | licensed, not picked for the launch set (not read yet) |
| sw-0210 | Friendship in need is friend indeed | pictures do not line up with pages (2 images for 0 pages) |
| sw-0212 | Clean Surroundings and Keep Bright | licensed, not picked for the launch set (not read yet) |
| sw-0213 | Kalaywani teacher class | licensed, not picked for the launch set (not read yet) |
| sw-0214 | Chameleon Life | licensed, not picked for the launch set (not read yet) |
| sw-0216 | School going Boy Story | licensed, not picked for the launch set (not read yet) |
| sw-0217 | The King and his music | licensed, not picked for the launch set (not read yet) |
| sw-0218 | Monkey in the Kitchen | licensed, not picked for the launch set (not read yet) |
| sw-0219 | Be greater than others | licensed, not picked for the launch set (not read yet) |
| sw-0220 | Monkey and Yummy Mangoes | licensed, not picked for the launch set (not read yet) |
| sw-0221 | Monkey at home | licensed, not picked for the launch set (not read yet) |
| sw-0222 | Honey Bee journey | licensed, not picked for the launch set (not read yet) |
| sw-0223 | Mischievous Monkey | licensed, not picked for the launch set (not read yet) |
| sw-0224 | Hoggy and Ramu | licensed, not picked for the launch set (not read yet) |
| sw-0225 | Naughty Children | licensed, not picked for the launch set (not read yet) |
| sw-0226 | Diwali | licensed, not picked for the launch set (not read yet) |
| sw-0227 | The dog | too long for the launch set (1634 words) |
| sw-0228 | Granny and her Bird Friend | pictures do not line up with pages (1 images for 1 pages) |
| sw-0229 | Manya's perfect dress | licensed, not picked for the launch set (not read yet) |
| sw-0230 | Didi's knowledge | licensed, not picked for the launch set (not read yet) |
| sw-0231 | Shruti's secret to winning | licensed, not picked for the launch set (not read yet) |
| sw-0232 | My best friend | read and left out: Mistakes in the source text ("Me and my friend") and a near copy of My Best Friend (0125), which is included. |
| sw-0233 | Follow Your Dreams | licensed, not picked for the launch set (not read yet) |
| sw-0234 | Tita | read and left out: Mistakes in the source text ("did'nt"). |
| sw-0235 | Shambu and the little man | licensed, not picked for the launch set (not read yet) |
| sw-0236 | Amma's stories | licensed, not picked for the launch set (not read yet) |
| sw-0237 | The missing cat | licensed, not picked for the launch set (not read yet) |
| sw-0238 | Holiday in Hathipur | pictures do not line up with pages (6 images for 3 pages) |
| sw-0240 | The Day It Rained Fish | read and left out: A mistake in the source text ("there was was"). |
| sw-0241 | Rachel and Big Ben | licensed, not picked for the launch set (not read yet) |
| sw-0242 | Cute Rat | licensed, not picked for the launch set (not read yet) |
| sw-0243 | Where is my Home? | licensed, not picked for the launch set (not read yet) |
| sw-0244 | When the Wind Blew Today... | licensed, not picked for the launch set (not read yet) |
| sw-0246 | Crumbled Tear Laden Walls | pictures do not line up with pages (1 images for 1 pages) |
| sw-0247 | It's bath time! | licensed, not picked for the launch set (not read yet) |
| sw-0248 | Ham and Lily | pictures do not line up with pages (4 images for 4 pages) |
| sw-0249 | Maya - Story of Us | pictures do not line up with pages (64 images for 32 pages) |
| sw-0250 | The Angry Shopkeeper | licensed, not picked for the launch set (not read yet) |
| sw-0251 | Windy's adventure | licensed, not picked for the launch set (not read yet) |
| sw-0252 | The book of poems | licensed, not picked for the launch set (not read yet) |
| sw-0253 | Dia's favourite festivals | licensed, not picked for the launch set (not read yet) |
| sw-0254 | The Magical Jackal | licensed, not picked for the launch set (not read yet) |
| sw-0255 | The love of art | licensed, not picked for the launch set (not read yet) |
| sw-0256 | My Juggling Grandma | licensed, not picked for the launch set (not read yet) |
| sw-0257 | Nina Plays With the Butterflies | licensed, not picked for the launch set (not read yet) |
| sw-0258 | Gargi and Soapy | licensed, not picked for the launch set (not read yet) |
| sw-0259 | Treasure of Deeds | licensed, not picked for the launch set (not read yet) |
| sw-0260 | Guess this place? Ghost Town! | licensed, not picked for the launch set (not read yet) |
| sw-0261 | Aditi's Trip To Moon | licensed, not picked for the launch set (not read yet) |
| sw-0263 | Hacking Is Life Part 2 - The Kid Can't Be Kidnapped | pictures do not line up with pages (1 images for 1 pages) |
| sw-0264 | The perfect project | licensed, not picked for the launch set (not read yet) |
| sw-0265 | Mittai Lals' Sweet Dream | licensed, not picked for the launch set (not read yet) |
| sw-0266 | Intelligent Friends | licensed, not picked for the launch set (not read yet) |
| sw-0267 | The little girl and Teddy | licensed, not picked for the launch set (not read yet) |
| sw-0268 | The Girl and the Bear | licensed, not picked for the launch set (not read yet) |
| sw-0269 | Hooray!!! It's Sunday- Time for Leisure Shower and Fun time | licensed, not picked for the launch set (not read yet) |
| sw-0270 | Viva.., the curious girl | licensed, not picked for the launch set (not read yet) |
| sw-0271 | Best Friends Forever | licensed, not picked for the launch set (not read yet) |
| sw-0272 | Life's Lighter Moments | licensed, not picked for the launch set (not read yet) |
| sw-0273 | App-ily ever after | licensed, not picked for the launch set (not read yet) |
| sw-0274 | Wonders of Martina's Adventure | licensed, not picked for the launch set (not read yet) |
| sw-0275 | Cinderella | licensed, not picked for the launch set (not read yet) |
| sw-0276 | King of Birds | licensed, not picked for the launch set (not read yet) |
| sw-0277 | The brave boy! | pictures do not line up with pages (1 images for 1 pages) |
| sw-0278 | Queen's Village | licensed, not picked for the launch set (not read yet) |
| sw-0279 | Croaky the Frog | licensed, not picked for the launch set (not read yet) |
| sw-0280 | The day of an owl | read and left out: Mistakes in the source text and an unclear plot (a falling bird, a vulture). |
| sw-0281 | Abhinav and the Cat | licensed, not picked for the launch set (not read yet) |
| sw-0282 | The Avengers and the age of powerful mach Green Goblin | licensed, not picked for the launch set (not read yet) |
| sw-0283 | Food makes everything better! | licensed, not picked for the launch set (not read yet) |
| sw-0284 | Our earth is precious | read and left out: Unclear text ("Ladies when they pray", monsters) and mistakes. |
| sw-0285 | Zara | licensed, not picked for the launch set (not read yet) |
| sw-0286 | The Clever Tortoise and the Foolish Fox | licensed, not picked for the launch set (not read yet) |
| sw-0287 | My family | licensed, not picked for the launch set (not read yet) |
| sw-0288 | Adventures of Anna | licensed, not picked for the launch set (not read yet) |
| sw-0290 | Sheema and King Kenrykoof | licensed, not picked for the launch set (not read yet) |
| sw-0291 | Akash's sweet lesson to brush | licensed, not picked for the launch set (not read yet) |
| sw-0292 | God | licensed, not picked for the launch set (not read yet) |
| sw-0294 | Truth Alone Triumphs | licensed, not picked for the launch set (not read yet) |
| sw-0295 | Silly & Billy Meet the Ministry of Petrol Pumps | licensed, not picked for the launch set (not read yet) |
| sw-0296 | Rizwan and his friends having fun in the snow | licensed, not picked for the launch set (not read yet) |
| sw-0297 | Holiday Fun | licensed, not picked for the launch set (not read yet) |
| sw-0298 | Inhabitants of the Sea | licensed, not picked for the launch set (not read yet) |
| sw-0299 | How Does the Toothpaste Get into the Tube? | pictures do not line up with pages (13 images for 11 pages) |
| sw-0300 | Toothpaste trouble!! | licensed, not picked for the launch set (not read yet) |
| sw-0301 | And this is how the earth got colour. | read and left out: Mistakes in the source text ("a artist"). |
| sw-0302 | Oliver beats his problem! | licensed, not picked for the launch set (not read yet) |
| sw-0303 | My brother | licensed, not picked for the launch set (not read yet) |
| sw-0304 | Why Do Bees Buzz? | pictures do not line up with pages (13 images for 11 pages) |
| sw-0305 | The Cloud Dragon | licensed, not picked for the launch set (not read yet) |
| sw-0306 | Our easy escape | licensed, not picked for the launch set (not read yet) |
| sw-0307 | Hyena and Raven | licensed, not picked for the launch set (not read yet) |
| sw-0308 | Starry and the land of the unknown | licensed, not picked for the launch set (not read yet) |
| sw-0309 | A Kind Boy. | licensed, not picked for the launch set (not read yet) |
| sw-0310 | The Moon and the Stars | licensed, not picked for the launch set (not read yet) |
| sw-0311 | The huge beauty | licensed, not picked for the launch set (not read yet) |
| sw-0312 | The bizarre island | licensed, not picked for the launch set (not read yet) |
| sw-0313 | Long Live Friendship! A Humorous Play for Children | too long for the launch set (2964 words) |
| sw-0314 | Loving Family | licensed, not picked for the launch set (not read yet) |
| sw-0315 | Chottu - The Little Boy | licensed, not picked for the launch set (not read yet) |
| sw-0316 | “Everything happens for the good” | licensed, not picked for the launch set (not read yet) |
| sw-0318 | Why Does A Poori Puff Up? | pictures do not line up with pages (15 images for 12 pages) |
| sw-0319 | A Brighter Day | licensed, not picked for the launch set (not read yet) |
| sw-0320 | The Rabbit's Kite Tales | licensed, not picked for the launch set (not read yet) |
| sw-0321 | Drigo lost in Space | licensed, not picked for the launch set (not read yet) |
| sw-0322 | The Carpenter's last job | licensed, not picked for the launch set (not read yet) |
| sw-0323 | Chhoti and Bade | licensed, not picked for the launch set (not read yet) |
| sw-0324 | Why Can't We Glow Like Fireflies? | licensed, not picked for the launch set (not read yet) |
| sw-0325 | Trip to the Dragon Land | licensed, not picked for the launch set (not read yet) |
| sw-0328 | Little Blue Alien | licensed, not picked for the launch set (not read yet) |
| sw-0329 | The Change | pictures do not line up with pages (8 images for 8 pages) |
| sw-0330 | Eldorado | pictures do not line up with pages (1 images for 1 pages) |
| sw-0331 | Everyone needs a friend | licensed, not picked for the launch set (not read yet) |
| sw-0332 | Oh the Way We Ran, in the Fish Rain | licensed, not picked for the launch set (not read yet) |
| sw-0333 | The Indigo Fairy and the Lizard | licensed, not picked for the launch set (not read yet) |
| sw-0334 | Kardi | licensed, not picked for the launch set (not read yet) |
| sw-0337 | Jack and Anny go to space | licensed, not picked for the launch set (not read yet) |
| sw-0338 | The Birthday Party | image 07.jpg license: unreadable |
| sw-0339 | The Indigo Fairy and the Water Buffaloes | licensed, not picked for the launch set (not read yet) |
| sw-0340 | The Indigo Fairy and the Frogs | licensed, not picked for the launch set (not read yet) |
| sw-0341 | Fonky's Fishy Party | licensed, not picked for the launch set (not read yet) |
| sw-0342 | Unbreakable Friendship | licensed, not picked for the launch set (not read yet) |
| sw-0343 | A bear makes lasting memories | licensed, not picked for the launch set (not read yet) |
| sw-0344 | Gabbar Is Back | licensed, not picked for the launch set (not read yet) |
| sw-0348 | How Do Aeroplanes Fly? | licensed, not picked for the launch set (not read yet) |
| sw-0349 | Chulli and the cows | read and left out: Only 3 pages; the story stops before it ends. |
| sw-0351 | Moti and Mohan | licensed, not picked for the launch set (not read yet) |
| sw-0352 | Let's Go Seed Collecting! | too long for the launch set (1307 words) |
| sw-0356 | Life full of dreams | licensed, not picked for the launch set (not read yet) |
| sw-0357 | Sam the Dragon | pictures do not line up with pages (11 images for 12 pages) |
| sw-0358 | Nanni's Birthday Gift | licensed, not picked for the launch set (not read yet) |
| sw-0359 | Nosy Natasha takes a Note | licensed, not picked for the launch set (not read yet) |
| sw-0360 | Reeti and Mithu | pictures do not line up with pages (11 images for 19 pages) |
| sw-0361 | Journey to many lands | licensed, not picked for the launch set (not read yet) |
| sw-0362 | Shriya and her Piyali | licensed, not picked for the launch set (not read yet) |
| sw-0363 | Pet Respect | licensed, not picked for the launch set (not read yet) |
| sw-0364 | Talking Tree of Alpha Town | licensed, not picked for the launch set (not read yet) |
| sw-0365 | Ananya's first story | licensed, not picked for the launch set (not read yet) |
| sw-0366 | Little Madhu's Dream | licensed, not picked for the launch set (not read yet) |
| sw-0367 | Rupa's Vacation...!! | licensed, not picked for the launch set (not read yet) |
| sw-0368 | Anty's Team | pictures do not line up with pages (1 images for 1 pages) |
| sw-0369 | Karthik loves to read | licensed, not picked for the launch set (not read yet) |
| sw-0370 | Terrific Trio | licensed, not picked for the launch set (not read yet) |
| sw-0372 | Mango Tango | licensed, not picked for the launch set (not read yet) |
| sw-0374 | The Monkey in You | read and left out: Compares children to monkeys, which can read as a slur; left out to be safe. |
| sw-0377 | Dum Dum-a-Dum Biryani! | pictures do not line up with pages (20 images for 12 pages) |
| sw-0378 | Have You Ever Travelled By? | read and left out: A list of vehicles, not a story. |
| sw-0379 | Lalu the Owl | licensed, not picked for the launch set (not read yet) |
| sw-0380 | Bonda and Devi | pictures do not line up with pages (19 images for 17 pages) |
| sw-0381 | Am I Alone? | licensed, not picked for the launch set (not read yet) |
| sw-0383 | Tintu's Day at Garden | read and left out: Mistakes in the source text ("the bird's play", "Day at Garden"). |
| sw-0384 | Tilly and Kyle make Vegetable Curry | licensed, not picked for the launch set (not read yet) |
| sw-0385 | The Many Tails of Jiril the Squirrel | licensed, not picked for the launch set (not read yet) |
| sw-0386 | Danny The Dragon | pictures do not line up with pages (11 images for 11 pages) |
| sw-0388 | Where Did Your Dimples Go? | pictures do not line up with pages (11 images for 14 pages) |
| sw-0389 | My best friend and I | licensed, not picked for the launch set (not read yet) |
| sw-0390 | Browny The Horse | licensed, not picked for the launch set (not read yet) |
| sw-0391 | Up World, Down World | pictures do not line up with pages (24 images for 22 pages) |
| sw-0392 | We Don't Pick Up Dog Family | pictures do not line up with pages (1 images for 1 pages) |
| sw-0394 | The Big Game | licensed, not picked for the launch set (not read yet) |
| sw-0395 | Manikantan Has Enough | pictures do not line up with pages (21 images for 17 pages) |
| sw-0397 | Jadav and the Tree-Place | too long for the launch set (1485 words) |
| sw-0399 | Cat Dreams | licensed, not picked for the launch set (not read yet) |
| sw-0400 | Nanni and the Oil Spill | licensed, not picked for the launch set (not read yet) |
| sw-0401 | Baby in the clouds | licensed, not picked for the launch set (not read yet) |
| sw-0403 | The Messy Desk | too long for the launch set (1369 words) |
| sw-0404 | The Mango Pickle | licensed, not picked for the launch set (not read yet) |
| sw-0406 | A Helping Hand | image 01.jpg license: unreadable |
| sw-0407 | Jamun Has Her Wish | pictures do not line up with pages (11 images for 13 pages) |
| sw-0409 | The wait | licensed, not picked for the launch set (not read yet) |
| sw-0410 | Inside the World Wide Web | pictures do not line up with pages (11 images for 16 pages) |
| sw-0411 | Nilofar | licensed, not picked for the launch set (not read yet) |
| sw-0412 | The Magic Pond | licensed, not picked for the launch set (not read yet) |
| sw-0413 | Chimni | licensed, not picked for the launch set (not read yet) |
| sw-0414 | The Mango Tree | licensed, not picked for the launch set (not read yet) |
| sw-0415 | Frog in the Movie | licensed, not picked for the launch set (not read yet) |
| sw-0416 | Dive! | licensed, not picked for the launch set (not read yet) |
| sw-0417 | River and Sun | pictures do not line up with pages (11 images for 11 pages) |
| sw-0418 | Can you smile when you snore? | pictures do not line up with pages (11 images for 11 pages) |
| sw-0420 | Amit and his Football | pictures do not line up with pages (1 images for 1 pages) |
| sw-0421 | Under the sea | pictures do not line up with pages (13 images for 11 pages) |
| sw-0422 | Happy Holi! | licensed, not picked for the launch set (not read yet) |
| sw-0423 | The mouse+dragon | licensed, not picked for the launch set (not read yet) |
| sw-0424 | The Moon and Daisy | licensed, not picked for the launch set (not read yet) |
| sw-0425 | Seasons | read and left out: Four words in all (too little text for 3 questions). |
| sw-0426 | Zara and the butterfly | licensed, not picked for the launch set (not read yet) |
| sw-0427 | Food Thieves | licensed, not picked for the launch set (not read yet) |
| sw-0428 | Shyamlal, your work! | licensed, not picked for the launch set (not read yet) |
| sw-0429 | The Nose-less King | licensed, not picked for the launch set (not read yet) |
| sw-0432 | Daddy's Mo | licensed, not picked for the launch set (not read yet) |
| sw-0433 | The Tree | pictures do not line up with pages (13 images for 11 pages) |
