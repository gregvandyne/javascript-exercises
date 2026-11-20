# Story Library: sources and the books

Written by `scripts/import-stories.js` (2026-11-20). Do not edit by hand: change `seed-library/storyweaver.json` or the importer and run it again.

## Source

StoryWeaver picture books by Pratham Books, from the community mirrors `global-asp/pb-source` (story text, `en/NNNN_slug.md`) and `global-asp/pb-imagebank` (`large/NNNN/NN.jpg` pictures and `metadata/NNNN.md`, one license per picture). Pratham Books does not endorse Oomba Academy.

## License rule (checked in code: `server/library/import-lib.js`)

- The story text must be CC BY 4.0 or Public Domain, and so must every picture the book uses, each read from its own row of the metadata table.
- Anything else is left out: NC, ND, SA, a version other than 4.0, a missing license, or a row that cannot be read (for example a table row whose columns ran together).
- Pictures are used when there is exactly one more picture than text pages (picture 01 is the cover, picture N+1 goes with page N). Otherwise a person may place them by hand from the metadata descriptions (`pictureMap` in `seed-library/storyweaver.json`), only when every page has one clear match; anything else is left out rather than guessed, with the reason below.
- Every book page and every reader page credits the title, author, illustrator(s), translator(s), "Pratham Books, StoryWeaver", the license with a link to its deed, and says Oomba resized the pictures and shows one page at a time. The story words are not changed (whitespace and conversion leftovers only), except for the typos a person listed for a book (`fixes` in `seed-library/storyweaver.json`: spelling, punctuation, spacing, capitalization and small grammar slips, never the style or the meaning); those books also say "Oomba corrected spelling and punctuation.", and every correction is listed below.

## Reading levels: US grades (Oomba's estimate)

Each book gets the US school grade it suits best, estimated by Oomba from public, documented measures of its text. These are not Lexile, Guided Reading or Fountas & Pinnell levels. The rule is in `server/library/import-lib.js` (`measure`, `gradeOf`); docs/decisions.md "Story Library: US grade levels" explains it with worked examples.

- Measures: words in all, words a page, words a sentence, syllables a word, the Flesch-Kincaid grade, and the share of words outside the Dolch and Fry sight-word lists (`server/library/sight-words.json`).
- Each measure becomes a grade number between anchor points; the weighted mean is the score (Flesch-Kincaid and the sight-word share count for less under 300 words, as they are unreliable on very short texts).
- Bands: Pre-K/K below 0.5, Grade 1 below 1.5, Grade 2 below 2.5, Grade 3 below 3.5, Grades 4-5 below 5. Over 2,500 words, or a score of 5 or more, is left out.

| Measure | Pre-K/K | Grade 1 | Grade 2 | Grade 3 | Grades 4-5 | Weight |
| --- | --- | --- | --- | --- | --- | --- |
| Words in all | 60 | 150 | 400 | 900 | 2000 | 0.25 |
| Words a page | 6 | 12 | 25 | 50 | 100 | 0.25 |
| Words a sentence | 4.5 | 6 | 7.5 | 9.5 | 12 | 0.2 |
| % not sight words | 8 | 12 | 16 | 20 | 25 | 0.05 to 0.15 |
| Flesch-Kincaid grade | (its own value) | | | | | 0 to 0.15 |

## Choosing the books

Every candidate below was read in full by a person and checked for ages 4 to 10: no violence beyond mild peril, nothing scary or gory, no romance, no religious instruction, no stereotypes, nothing likely to upset parents, and no text so full of mistakes that fixing it would mean rewriting it (smaller typos are corrected, listed below). The site's text scanners (`textfilter.profanityMatch`, `personalInfo`, the Builder's `prefilter` and `mockClassify`) run on every page; a flagged book is left out unless a person reviewed the flag (listed below). Each book has 3 questions written by Oomba (two about what the text says, one that needs a small inference), each pointing at the page that answers it, and an optional glossary for words US children may not know.

## Totals

- Books in the source: 395
- Included: **147** (Pre-K/K: 9, Grade 1: 46, Grade 2: 59, Grade 3: 22, Grades 4-5: 11)
- Left out: 248
  - read and left out: 187
  - pictures do not line up with pages: 50
  - an image license: unreadable: 6
  - too long for the library: 3
  - picture N.jpg is in the metadata but not in the image bank: 2
- Pictures on the site: 29.5 MB (WebP, pages at most 720 px, covers 440 px)

## Included

| Id | Title | Grade | Score | Words | Pages | Text | Illustration | Translation | License |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sw-0026 | Can and Can't | Pre-K/K | 0.45 | 50 | 7 | Radha HS | Ruchi Shah | – | CC BY 4.0 |
| sw-0073 | Colours (Tell me now series) | Pre-K/K | 0 | 65 | 11 | Madhav Chavan | Rijuta Ghate | – | CC BY 4.0 |
| sw-0055 | Curly and Straight | Pre-K/K | 0.18 | 73 | 13 | Radha HS | Ruchi Shah | – | CC BY 4.0 |
| sw-0072 | Happy and Sad (Tell me now series) | Pre-K/K | 0.14 | 64 | 11 | Madhav Chavan | Rijuta Ghate | – | CC BY 4.0 |
| sw-0114 | I Am Not Afraid! | Pre-K/K | 0.45 | 106 | 11 | Mini Shrinivasan | Rayika Sen | – | CC BY 4.0 |
| sw-0100 | I Can Climb! | Pre-K/K | 0.42 | 89 | 11 | Mini Shrinivasan | Deval Maniar | – | CC BY 4.0 |
| sw-0262 | Many Bananas | Pre-K/K | 0.45 | 68 | 8 | Smruthi K | Angie & Upesh | – | CC BY 4.0 |
| sw-0064 | My Friends | Pre-K/K | 0.04 | 69 | 11 | Rukmini Banerji | Rajeev Verma 'Banjara' | Manisha Chaudhry | CC BY 4.0 |
| sw-0118 | Why, Oh Why! | Pre-K/K | -0.15 | 54 | 11 | Richa Bhaskar | Shailja Jain Chougule | – | CC BY 4.0 |
| sw-0301 | And this is how the earth got colour. | Grade 1 | 1.07 | 87 | 9 | Krutarth Shah | Greystroke, Ketan Raut, Nimret Handa, Phidi Pulu, Muniza Shariq | – | CC BY 4.0 |
| sw-0047 | Bunty and Bubbly | Grade 1 | 1.1 | 120 | 11 | Sorit Gupto | Sorit Gupto | – | CC BY 4.0 |
| sw-0126 | Busy Ants | Grade 1 | 1.3 | 192 | 11 | Kanchan Bannerjee | Deepa Balsavar | – | CC BY 4.0 |
| sw-0031 | Cheep Cheep Drip Drip | Grade 1 | 0.87 | 127 | 11 | Lubaina Bandukwala | Zainab Tambawalla | – | CC BY 4.0 |
| sw-0127 | Clean Cat | Grade 1 | 1.49 | 203 | 11 | Kanchan Bannerjee | Deepa Balsavar | – | CC BY 4.0 |
| sw-0071 | Colours of Nature | Grade 1 | 1.18 | 168 | 16 | Bulbul Sharma | Bulbul Sharma | – | CC BY 4.0 |
| sw-0382 | Crocky and friends | Grade 1 | 0.89 | 74 | 7 | Khushboo Awasthi | Herminder Ohri, Bulbul Sharma | – | CC BY 4.0 |
| sw-0054 | Do and Don't | Grade 1 | 1.05 | 117 | 7 | Radha HS | Ruchi Shah | – | CC BY 4.0 |
| sw-0101 | Flying High | Grade 1 | 1.45 | 235 | 8 | Vidya Tiware | Rijuta Ghate | Rohini Nilekani | CC BY 4.0 |
| sw-0173 | Fun with Balloon | Grade 1 | 0.93 | 93 | 5 | Madhuri Pai | Greystroke, Ajit Narayan, Shailja Jain Chougule | – | CC BY 4.0 |
| sw-0094 | Going to Buy a Book | Grade 1 | 1.25 | 278 | 9 | Rukmini Banerji | Santosh Pujari | – | CC BY 4.0 |
| sw-0018 | Goloo the Circle | Grade 1 | 1.43 | 174 | 8 | Jagdish Joshi | Jagdish Joshi | – | CC BY 4.0 |
| sw-0103 | I Can Make Things! | Grade 1 | 0.59 | 91 | 11 | Mini Shrinivasan | Tanvee Nabar | – | CC BY 4.0 |
| sw-0317 | Lalu the owl | Grade 1 | 1.41 | 58 | 5 | Payoshni Saraf | Wiehan de Jager | – | CC BY 4.0 |
| sw-0007 | Listen to My Body | Grade 1 | 1.23 | 221 | 22 | Rohini Nilekani | Angie & Upesh | – | CC BY 4.0 |
| sw-0052 | Little Painters | Grade 1 | 1.43 | 199 | 11 | Cheryl Rao | Tanvi Choudhury | – | CC BY 4.0 |
| sw-0178 | Long Water | Grade 1 | 1.11 | 201 | 6 | Madhuri Pai | Herminder Ohri, Sonal Goyal, Sumit Sakhuja, Sanjay Sarkar, Santosh Pujari | – | CC BY 4.0 |
| sw-0041 | Look At Me | Grade 1 | 0.68 | 120 | 11 | Pankaj Chaturvedi | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0067 | Lost and Found | Grade 1 | 1.03 | 153 | 11 | Sukhada Rahalkar | Sukhada Rahalkar | – | CC BY 4.0 |
| sw-0125 | My Best Friend | Grade 1 | 0.8 | 111 | 11 | Anupa Lal | Suvidha Mistry | – | CC BY 4.0 |
| sw-0048 | My Home | Grade 1 | 0.94 | 114 | 15 | Rukmini Banerji | Rajeev Verma 'Banjara' | Manisha Chaudhry | CC BY 4.0 |
| sw-0256 | My Juggling Grandma | Grade 1 | 1.35 | 95 | 6 | Rachita Uday Kumar | Niloufer Wadia | – | CC BY 4.0 |
| sw-0129 | Naughty Dog | Grade 1 | 1.14 | 167 | 12 | Kanchan Bannerjee | Deepa Balsavar | – | CC BY 4.0 |
| sw-0128 | Noisy Crows | Grade 1 | 1.29 | 177 | 12 | Kanchan Bannerjee | Deepa Balsavar | – | CC BY 4.0 |
| sw-0010 | Pehelwaan Ji | Grade 1 | 0.87 | 108 | 15 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0063 | Playtime | Grade 1 | 0.94 | 138 | 10 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0181 | Prakruti | Grade 1 | 1.32 | 164 | 14 | Prakruti & Shruti Bhat | Priya Kuriyan | – | CC BY 4.0 |
| sw-0087 | Rain, Rain | Grade 1 | 0.78 | 109 | 11 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0020 | Rani's First Day at School | Grade 1 | 1.28 | 179 | 6 | Cheryl Rao | Mayur Mistry | – | CC BY 4.0 |
| sw-0001 | Smile Please! | Grade 1 | 0.88 | 102 | 11 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0137 | Spot and Spike | Grade 1 | 1.13 | 122 | 6 | Natasha Sharma | Archana Sreenivasan | – | CC BY 4.0 |
| sw-0156 | Subaami's Family | Grade 1 | 1.3 | 127 | 6 | Arthi Anand-Navaneeth | Priya Kuriyan, Greystroke | – | CC BY 4.0 |
| sw-0385 | The Many Tails of Jiril the Squirrel | Grade 1 | 1.45 | 109 | 6 | Jill Keeler | Sanjay Sarkar | – | CC BY 4.0 |
| sw-0053 | The Moon and The Cap | Grade 1 | 1.19 | 143 | 11 | Rohini Nilekani | Angie & Upesh | – | CC BY 4.0 |
| sw-0069 | The Red Raincoat | Grade 1 | 1.38 | 231 | 9 | Kiran Kasturia | Zainab Tambawalla | – | CC BY 4.0 |
| sw-0433 | The Tree | Grade 1 | 1.13 | 408 | 11 | Usha Rane | Ketan Raut | Madhav Chavan | CC BY 4.0 |
| sw-0059 | This and That | Grade 1 | 1.31 | 101 | 7 | Radha HS | Ruchi Shah | – | CC BY 4.0 |
| sw-0193 | Timmi's dream | Grade 1 | 0.94 | 78 | 9 | Rachita Uday Kumar | Santosh Pujari | – | CC BY 4.0 |
| sw-0030 | Timmy and Pepe | Grade 1 | 0.73 | 175 | 11 | Madhav Chavan | Santosh Pujari | – | CC BY 4.0 |
| sw-0113 | Topsy Turvy | Grade 1 | 1.47 | 201 | 11 | Rohini Nilekani | Angie & Upesh | Rohini Nilekani | CC BY 4.0 |
| sw-0172 | Tree on a plate | Grade 1 | 1.36 | 146 | 7 | Madhuri Pai | Angie & Upesh, Rijuta Ghate, Henu, Ajit Narayan, Padmanabh, Suvidha Mistry | – | CC BY 4.0 |
| sw-0123 | Under My Bed | Grade 1 | 1.06 | 139 | 11 | Anupa Lal | Suvidha Mistry | – | CC BY 4.0 |
| sw-0003 | Vayu, the Wind | Grade 1 | 1.21 | 194 | 10 | Madhuri Pai | Rijuta Ghate | Rohini Nilekani | CC BY 4.0 |
| sw-0036 | What Does Anu See? | Grade 1 | 0.89 | 181 | 11 | Lavanya Karthik | Lavanya Karthik | – | CC BY 4.0 |
| sw-0170 | What Makes You Special? | Grade 1 | 1.28 | 305 | 9 | Nalini Sorensen | Greystroke | – | CC BY 4.0 |
| sw-0045 | What Shall I Wear Today? | Grade 1 | 1.35 | 136 | 9 | Natasha Sharma | Tanvi Choudhury | – | CC BY 4.0 |
| sw-0008 | "My fish!" "No, my fish!" | Grade 2 | 1.53 | 185 | 11 | Suraj J Menon | Soumya Menon | – | CC BY 4.0 |
| sw-0343 | A bear makes lasting memories | Grade 2 | 1.85 | 147 | 5 | Amna Singh | Pia Meenakshi | – | CC BY 4.0 |
| sw-0046 | Aaloo-Maaloo-Kaaloo | Grade 2 | 1.68 | 141 | 7 | Vinita Krishna | Suvidha Mistry | Ritu Singh | CC BY 4.0 |
| sw-0261 | Aditi's Trip To Moon | Grade 2 | 1.57 | 229 | 9 | Rajalakshmi Paramasivam | Helga Parekh, Sorit Gupto, Greystroke, Suvidha Mistry, Ajit Narayan, Rijuta Ghate, Taposhi Ghoshal | – | CC BY 4.0 |
| sw-0381 | Am I Alone? | Grade 2 | 1.97 | 213 | 5 | Sarita Shetty | Rajeev Verma 'Banjara' | – | CC BY 4.0 |
| sw-0177 | Amazing Ants | Grade 2 | 1.8 | 100 | 4 | Jerina puthuran | Deepa Balsavar | – | CC BY 4.0 |
| sw-0151 | Ammu's Puppy | Grade 2 | 1.62 | 337 | 16 | Sowmya Rajendran | Soumya Menon | – | CC BY 4.0 |
| sw-0060 | Annual Haircut Day | Grade 2 | 2.16 | 241 | 19 | Rohini Nilekani | Angie & Upesh | – | CC BY 4.0 |
| sw-0013 | Aunty Jui's Baby | Grade 2 | 2.1 | 682 | 17 | Madhuri Purandare | Madhuri Purandare | Pratham Books Team | CC BY 4.0 |
| sw-0070 | Bani | Grade 2 | 2.35 | 715 | 18 | Herminder Ohri | Taposhi Ghoshal | – | CC BY 4.0 |
| sw-0062 | Bheema, the Sleepyhead | Grade 2 | 2.31 | 281 | 7 | Kiran Kasturia | Shweta Mohapatra | Rajesh Khar | CC BY 4.0 |
| sw-0148 | BooBoo sings for Vihaan | Grade 2 | 2.41 | 255 | 10 | Surekha Pillai | Jithin Jacob | – | CC BY 4.0 |
| sw-0078 | Cheenu's Gift | Grade 2 | 2.3 | 302 | 11 | Sridala Swami | Suvidha Mistry | – | CC BY 4.0 |
| sw-0323 | Chhoti and Bade | Grade 2 | 2.31 | 184 | 7 | Shivani Kumar | Sanjay Sarkar, Rayika Sen | – | CC BY 4.0 |
| sw-0021 | Chhuk-Chhuk-Chhak | Grade 2 | 1.69 | 124 | 7 | Vinita Krishna | Suvidha Mistry | Ritu Singh | CC BY 4.0 |
| sw-0341 | Fonky's Fishy Party | Grade 2 | 1.72 | 202 | 6 | Vinuta Shirgopikar | Greystroke, Srikrishna Kedilaya | – | CC BY 4.0 |
| sw-0415 | Frog in the Movie | Grade 2 | 2.34 | 106 | 2 | Aparna Ganapathy | Delwyn Remedios, Vartika Sharma | – | CC BY 4.0 |
| sw-0056 | Goodnight, Tinku! | Grade 2 | 1.57 | 421 | 11 | Preethi Nambiar | Sonal Goyal, Sumit Sakhuja | – | CC BY 4.0 |
| sw-0124 | Grandma's Glasses | Grade 2 | 1.89 | 296 | 10 | Rohini Nilekani | Tanaya Vyas | – | CC BY 4.0 |
| sw-0075 | Gulli's Box of Things | Grade 2 | 2.3 | 324 | 11 | Anupama Ajinkya Apte | Anupama Ajinkya Apte | – | CC BY 4.0 |
| sw-0014 | I Want That One! | Grade 2 | 1.53 | 292 | 11 | Mala Kumar | Soumya Menon | – | CC BY 4.0 |
| sw-0247 | It's bath time! | Grade 2 | 2.41 | 237 | 9 | Akshara Rajesh | Rijuta Ghate, Sonal Goyal, Sumit Sakhuja | – | CC BY 4.0 |
| sw-0171 | Jaggee's mornings | Grade 2 | 2.26 | 198 | 7 | Sandhya Sridhar | Rijuta Ghate, Angie & Upesh, Suvidha Mistry, Shailja Jain Chougule, Hari Kumar Nair, Rajiv Eipe, Tapas Guha | – | CC BY 4.0 |
| sw-0276 | King of Birds | Grade 2 | 2.08 | 465 | 14 | African Storybook Initiative | Wiehan de Jager | – | CC BY 4.0 |
| sw-0379 | Lalu the Owl | Grade 2 | 1.55 | 117 | 8 | Payoshni Saraf | Wiehan de Jager, Padmanabh | – | CC BY 4.0 |
| sw-0061 | Lassi, Ice-cream or Falooda? | Grade 2 | 2.33 | 299 | 7 | Mala Kumar, Manisha Chaudhry | Priya Kuriyan | – | CC BY 4.0 |
| sw-0328 | Little Blue Alien | Grade 2 | 2.24 | 265 | 7 | Mohan Bambha | Kavita Singh Kale | – | CC BY 4.0 |
| sw-0372 | Mango Tango | Grade 2 | 2.44 | 321 | 9 | Reshma Jannath | Nimret Handa, Rijuta Ghate, Jagdish Joshi, Archana Sreenivasan, Sanjay Sarkar, Ketan Raut, Sonal Gupta, Greystroke | – | CC BY 4.0 |
| sw-0229 | Manya's perfect dress | Grade 2 | 1.55 | 143 | 8 | Rachita Uday Kumar | Tanvi Choudhury | – | CC BY 4.0 |
| sw-0351 | Moti and Mohan | Grade 2 | 2.18 | 71 | 1 | Harinishree Bala | Greystroke | – | CC BY 4.0 |
| sw-0105 | Mouse in the House | Grade 2 | 1.76 | 260 | 11 | Sowmya Rajendran | Tanaya Vyas | – | CC BY 4.0 |
| sw-0038 | My Balwadi | Grade 2 | 1.55 | 287 | 9 | Rukmini Banerji | Sheetal Thapa | Madhav Chavan | CC BY 4.0 |
| sw-0174 | My Friend Trace Roger the robot! | Grade 2 | 2.39 | 287 | 4 | Baani Pahwa | Nirvaan Pahwa, Greystroke, Vibhash Pandey, Ruchi Shah | – | CC BY 4.0 |
| sw-0024 | No Smiles Today | Grade 2 | 1.86 | 243 | 6 | Cheryl Rao | Saurabh Pandey | – | CC BY 4.0 |
| sw-0359 | Nosy Natasha takes a Note | Grade 2 | 2.37 | 200 | 7 | Simoni Kothari | Rupa Prakash | – | CC BY 4.0 |
| sw-0005 | Not Now, Not Now! | Grade 2 | 1.66 | 177 | 7 | Rohini Nilekani | Ruchi Shah | – | CC BY 4.0 |
| sw-0332 | Oh the Way We Ran, in the Fish Rain | Grade 2 | 2.34 | 285 | 6 | Yamini | Manjari Chakravarti | – | CC BY 4.0 |
| sw-0119 | Pehelwaan ji Plays Cricket | Grade 2 | 1.8 | 276 | 15 | Sanjiv Jaiswal 'Sanjay' | Ajit Narayan | Manisha Chaudhry | CC BY 4.0 |
| sw-0112 | Phani's Funny Chappals | Grade 2 | 2 | 260 | 12 | Sridala Swami | Sanjay Sarkar | – | CC BY 4.0 |
| sw-0160 | Preetha Aunty, My Teacher | Grade 2 | 1.63 | 108 | 4 | Arthi Anand-Navaneeth | Greystroke, Sheetal Thapa, Soumya Menon, Herminder Ohri, Rijuta Ghate | – | CC BY 4.0 |
| sw-0044 | Ramya's Stars | Grade 2 | 2.34 | 242 | 9 | Mala Ashok | Helga Parekh | – | CC BY 4.0 |
| sw-0057 | Ritu's Letter Gets Longer! | Grade 2 | 2.48 | 597 | 14 | Mala Kumar | Henu | – | CC BY 4.0 |
| sw-0121 | Saboo and Jojo | Grade 2 | 2.09 | 285 | 8 | Herminder Ohri | Herminder Ohri | – | CC BY 4.0 |
| sw-0235 | Shambu and the little man | Grade 2 | 1.79 | 134 | 5 | Rachita Uday Kumar | Megha Vishwanath | – | CC BY 4.0 |
| sw-0362 | Shriya and her Piyali | Grade 2 | 2.46 | 407 | 9 | Anusha Parthasarathy | Soumya Menon | – | CC BY 4.0 |
| sw-0135 | Singing in the Rain | Grade 2 | 2.32 | 217 | 7 | Mala Kumar, Manisha Chaudhry | Rajiv Eipe | Mala Kumar, Manisha Chaudhry | CC BY 4.0 |
| sw-0009 | Susheela's Kolams | Grade 2 | 2.48 | 210 | 9 | Sridala Swami | Priya Kuriyan | – | CC BY 4.0 |
| sw-0091 | The Boat Ride | Grade 2 | 2.46 | 358 | 8 | Herminder Ohri | Herminder Ohri | – | CC BY 4.0 |
| sw-0240 | The Day It Rained Fish | Grade 2 | 2.31 | 254 | 7 | Ramendra Kumar | Delwyn Remedios | – | CC BY 4.0 |
| sw-0255 | The love of art | Grade 2 | 1.65 | 182 | 10 | Rachita Uday Kumar | Tanvi Choudhury | – | CC BY 4.0 |
| sw-0237 | The missing cat | Grade 2 | 1.77 | 125 | 7 | Rachita Uday Kumar | Ruchi Shah | – | CC BY 4.0 |
| sw-0195 | The party | Grade 2 | 1.81 | 173 | 10 | Rachita Uday Kumar | Greystroke | – | CC BY 4.0 |
| sw-0264 | The perfect project | Grade 2 | 1.62 | 124 | 8 | Rachita Uday Kumar | Priya Kuriyan | – | CC BY 4.0 |
| sw-0154 | The Princess and the Veggy Lion | Grade 2 | 1.99 | 245 | 10 | Uma Balamurali | Uma Balamurali, Sanjay Sarkar, Preeti Krishnamurthy, Rayika Sen, Ketan Raut, Padmanabh, Ajit Narayan, Tapas Guha | – | CC BY 4.0 |
| sw-0035 | The Scarecrows on Parade | Grade 2 | 2.37 | 514 | 13 | Shamim Padamsee | Tanaya Vyas | – | CC BY 4.0 |
| sw-0185 | The Surprise | Grade 2 | 2.11 | 216 | 6 | Ad Sarin | Ad Sarin | – | CC BY 4.0 |
| sw-0203 | The train journey | Grade 2 | 2.09 | 120 | 6 | Kanti Jadia | Preeti Krishnamurthy, Deepa Balsavar, Santosh Pujari, Madhuvanti Anantharajan | – | CC BY 4.0 |
| sw-0244 | When the Wind Blew Today... | Grade 2 | 2.3 | 71 | 5 | Vinayak Varma | Vinayak Varma | – | CC BY 4.0 |
| sw-0149 | Where is Gogo? | Grade 2 | 2 | 200 | 7 | Mala Kumar, Manisha Chaudhry | Soumya Menon | Mala Kumar, Manisha Chaudhry | CC BY 4.0 |
| sw-0319 | A Brighter Day | Grade 3 | 2.77 | 109 | 1 | Aditi | Anjora Noronha | – | CC BY 4.0 |
| sw-0120 | Anaya's Thumb | Grade 3 | 2.53 | 445 | 9 | Natasha Sharma | Ruchi Shah | – | CC BY 4.0 |
| sw-0214 | Chameleon Life | Grade 3 | 2.87 | 143 | 3 | Prateek Chandrawal | Muniza Shariq, Rajeev Verma 'Banjara', Nirvaan Pahwa, Herminder Ohri | – | CC BY 4.0 |
| sw-0432 | Daddy's Mo | Grade 3 | 2.99 | 427 | 8 | Madhuri Purandare | Madhuri Purandare | Sai Keskar | CC BY 4.0 |
| sw-0175 | Don't get scared! Try! | Grade 3 | 2.86 | 229 | 5 | Varshini Vijay | Sanjay Sarkar, Helga Parekh | – | CC BY 4.0 |
| sw-0140 | It's All the Cat's Fault! | Grade 3 | 2.71 | 190 | 9 | Anushka Ravishankar | Priya Kuriyan | – | CC BY 4.0 |
| sw-0356 | Life full of dreams | Grade 3 | 3.17 | 245 | 6 | Batul Bhanpurawala | Manjari Chakravarti, Vibhash Pandey, Preeti Krishnamurthy, Lavanya Karthik, Aditi Dilip | – | CC BY 4.0 |
| sw-0157 | My Musical Adventure | Grade 3 | 3.32 | 699 | 6 | Anush-Adi Navaneeth | Priya Kuriyan, Ajit Narayan, Vibhash Pandey, Preeti Krishnamurthy, Rijuta Ghate, Madhuri Purandare | – | CC BY 4.0 |
| sw-0400 | Nanni and the Oil Spill | Grade 3 | 2.73 | 220 | 4 | Paroma Sengupta | Tessa Welch, Lavanya Karthik, Siraj Saxena | – | CC BY 4.0 |
| sw-0257 | Nina Plays With the Butterflies | Grade 3 | 2.68 | 190 | 5 | Adhvika Deepak | Herminder Ohri, Sorit Gupto, Priya Kuriyan, Sanjay Sarkar, Preeti Krishnamurthy | – | CC BY 4.0 |
| sw-0017 | Peacocks and Pakodas! | Grade 3 | 2.91 | 361 | 7 | Mala Kumar, Manisha Chaudhry | Priya Kuriyan | – | CC BY 4.0 |
| sw-0363 | Pet Respect | Grade 3 | 3.11 | 302 | 10 | Simoni Kothari | Soumya Menon | – | CC BY 4.0 |
| sw-0191 | Richard's unlucky day | Grade 3 | 2.96 | 207 | 6 | Lotte Van Oijen | Rijuta Ghate, Angie & Upesh, Greystroke, Lavanya Karthik, Deepa Balsavar | – | CC BY 4.0 |
| sw-0096 | Samira Goes Shopping | Grade 3 | 3.1 | 629 | 13 | Bharati Jagannathan | Preeti Krishnamurthy | – | CC BY 4.0 |
| sw-0308 | Starry and the land of the unknown | Grade 3 | 2.53 | 181 | 6 | Rachita Uday Kumar | Nidhi Jha, Ajanta Guhathakurta | – | CC BY 4.0 |
| sw-0364 | Talking Tree of Alpha Town | Grade 3 | 2.63 | 177 | 7 | Maryam Soni | Archana Sreenivasan | – | CC BY 4.0 |
| sw-0370 | Terrific Trio | Grade 3 | 2.91 | 230 | 5 | Vinuta Shirgopikar | Deepa Balsavar, Priya Kuriyan, Santosh Pujari | – | CC BY 4.0 |
| sw-0311 | The huge beauty | Grade 3 | 3.2 | 241 | 5 | Vaishnavi guttikonda | Santosh Pujari, Nimret Handa | – | CC BY 4.0 |
| sw-0310 | The Moon and the Stars | Grade 3 | 2.75 | 403 | 5 | Nidhi Jha | Nidhi Jha | – | CC BY 4.0 |
| sw-0159 | The puppy that did not bark!!! | Grade 3 | 2.88 | 586 | 11 | Uma Balamurali | Greystroke, Priya Kuriyan, Madhuri Purandare, Soumya Menon, Santosh Pujari, Preeti Krishnamurthy, Deepa Balsavar, Suvidha Mistry, Natasha Sharma | – | CC BY 4.0 |
| sw-0200 | The Unusual Rainmaking Duet | Grade 3 | 3 | 241 | 8 | Srividya Suryanarayanan | Rajiv Eipe | – | CC BY 4.0 |
| sw-0034 | Veeru Goes to the Circus | Grade 3 | 2.55 | 294 | 9 | Richa Ingle Deo | Reshma Barve | – | CC BY 4.0 |
| sw-0416 | Dive! | Grades 4-5 | 3.95 | 736 | 19 | Rajiv Eipe | Rajiv Eipe | – | CC BY 4.0 |
| sw-0187 | Happy world | Grades 4-5 | 3.71 | 313 | 3 | Reshma Krishnamurthy Sharma | Zainab Tambawalla, Angie & Upesh, Greystroke | – | CC BY 4.0 |
| sw-0348 | How Do Aeroplanes Fly? | Grades 4-5 | 3.58 | 907 | 12 | Aditi Sarawagi | Lavanya Karthik | – | CC BY 4.0 |
| sw-0397 | Jadav and the Tree-Place | Grades 4-5 | 3.66 | 1485 | 19 | Vinayak Varma | Vinayak Varma | – | CC BY 4.0 |
| sw-0352 | Let's Go Seed Collecting! | Grades 4-5 | 3.55 | 1306 | 18 | Neha Sumitran | Archana Sreenivasan | – | CC BY 4.0 |
| sw-0093 | Marching to Freedom | Grades 4-5 | 3.82 | 1358 | 6 | Subhadra Sen Gupta | Tapas Guha | – | CC BY 4.0 |
| sw-0090 | Raza Meets the King | Grades 4-5 | 4.22 | 1250 | 7 | Subhadra Sen Gupta | Tapas Guha | – | CC BY 4.0 |
| sw-0322 | The Carpenter's last job | Grades 4-5 | 3.6 | 244 | 3 | Rupa Prakash | Rupa Prakash | – | CC BY 4.0 |
| sw-0089 | The Magic Powder - A Folktale from Myanmar | Grades 4-5 | 3.87 | 1141 | 7 | Greystroke | P.G. Dinesh | – | CC BY 4.0 |
| sw-0051 | The Timid Train | Grades 4-5 | 3.75 | 619 | 11 | Bharati Jagannathan | Preeti Krishnamurthy | – | CC BY 4.0 |
| sw-0274 | Wonders of Martina's Adventure | Grades 4-5 | 4.23 | 564 | 4 | Anusri | Sangeeta Das, Prashant Miranda, Sonal Goyal, Sumit Sakhuja, Sanjay Sarkar | – | CC BY 4.0 |

### Pictures placed by a person

These books have more pictures than pages. A person matched each page to a picture from the metadata descriptions, and only where the match is unambiguous; pictures left over are not used.

- sw-0433 The Tree: 13 pictures for 11 pages. The descriptions match page by page: 01 the tree and its stages (cover); 02 a tree (page 1), 03 roots (page 2, roots), 04 roots and soil (page 3, soil covers the roots), 05 trunk (page 4), 06 a fully grown tree (page 5, branches), 07 leaves (page 6), 08 leaves and flowers (page 7), 09 fruits (page 8), 10 seeds (page 9), 11 little plants (page 10, a tiny plant from the seed), 12 the tree's stages of growth (page 11, the wordless last page). 13 "a happy tree in black and white" is a coloring page and is not used.
- sw-0038 My Balwadi: 11 pictures for 9 pages. The descriptions match page by page: 01 happy children (cover); 02 children going to school (page 1, this is my school), 03 a boy and a girl (page 2, my brother Mannu and I), 04 entering a room (page 3, shoes by the door), 05 tiffin boxes on the wall (page 4), 06 children and toys (page 5, counting and blocks), 07 teacher and children learning (page 6, letters), 08 teacher with a puppet (page 7), 09 surprised children (page 8, my friends are surprised), 10 children playing with a tub (page 9, a tub of play dough). 11 is a second picture of the tub and is not used.

### Text corrected by Oomba

63 books, 319 corrections. Page 0 is the title; a line break is shown as ⏎.

- sw-0007 Listen to My Body: p19 "mothers kitchen" → "mother's kitchen"; p21 "mothers wonderful" → "mother's wonderful"
- sw-0070 Bani: p6 "May be sing" → "Maybe sing"; p10 "Oh! those" → "Oh! Those"
- sw-0090 Raza Meets the King: p7 "Mughlai cusine" → "Mughlai cuisine"
- sw-0093 Marching to Freedom: p6 "waiting for you.”⏎⏎“Hmm, you're right, G … nd Binni and I will be waiting for you.”" → "waiting for you.”"; p3 "quiet,⏎Dhani went looking for his father. He found⏎him" → "quiet, Dhani went looking for his father. He found him"; p3 "walk so much.⏎Only" → "walk so much. Only"; p4 "you can!”⏎Dhani replied stubbornly. “You can't stop me⏎from" → "you can!” Dhani replied stubbornly. “You can't stop me from"; p4 "explained⏎patiently, “Only the people who have been⏎chosen" → "explained patiently, “Only the people who have been chosen"; p5 "following⏎me" → "following me"; p5 "began⏎nervously" → "began nervously"; p5 "Dandi⏎is 385" → "Dandi is 385"; p6 "At Dandi, Gandhi and his followers colle … boycotted schools, colleges and offices." → "At Dandi, Gandhi and his followers made  … . Gandhi was arrested a few weeks later."; p6 "5. The year 2005 marks the 75th anniversary of the Dandi March." → "5. In 2005, India marked the 75th anniversary of the Dandi March."
- sw-0123 Under My Bed: p7 "“What happened dear?Did you call me?”" → "“What happened, dear? Did you call me?”"
- sw-0135 Singing in the Rain: p3 "dinosuar" → "dinosaur"
- sw-0148 BooBoo sings for Vihaan: p3 "look!,"" → "look!""; p8 "Vihaan!,"" → "Vihaan!""; p8 "SONG!,"" → "SONG!""; p9 "Dont cry" → "Don't cry"; p10 "HIHIHI!,'" → "HIHIHI!'"
- sw-0151 Ammu's Puppy: p7 "for her." We'll see," said Achan." → "for her. "We'll see," said Achan."; p13 "He's brown.'"" → "He's brown.""
- sw-0154 The Princess and the Veggy Lion: p3 "looked⏎⏎around" → "looked around"; p5 ""Help Help "" → ""Help! Help!""; p6 "away "." → "away.""; p7 "palace? "" → "palace?""; p8 "" Surely" → ""Surely"; p8 "here "." → "here.""; p9 "Thank you dear elephant ", said the Princess. Will you" → "Thank you, dear elephant," said the Princess. "Will you"; p9 "now on? "" → "now on?""; p1 " ." → "."; p6 " ." → "."; p7 "lion ." → "lion."; p7 "forest ." → "forest."; p7 " ." → "."; p8 "way ." → "way."; p8 " ." → "."; p10 "her ." → "her."; p10 " ." → "."; p8 ""Surely ," → ""Surely,"; p8 " ," → ","; p10 " ," → ","; p6 " :" → ":"
- sw-0156 Subaami's Family: p0 "Subami" → "Subaami"; p1 "mother- Swetha." → "mother, Swetha."; p1 "Shreyas and I, made" → "Shreyas and I made"; p4 "with S- Sweety" → "with S: Sweety"; p5 "stories, I read" → "stories, and I read"
- sw-0157 My Musical Adventure: p2 "⏎⏎* * *⏎⏎" → "⏎⏎"; p5 "My Dida said" Savitri, it doesn't matter … lose. Just enjoy yourself and the music"" → "My Dida said, "Savitri, it doesn't matte … ose. Just enjoy yourself and the music.""; p6 "sang " Suraj" → "sang "Suraj"; p6 "sleep ." → "sleep."
- sw-0159 The puppy that did not bark!!!: p2 "pup ."" → "pup.""; p2 "puppy"," → "puppy,""; p3 "school ," → "school,"; p3 "older. "" → "older.""; p3 "said " " → "said, ""; p3 "pup. "" → "pup.""; p3 "father , "Daddy ," → "father, "Daddy,"; p4 "Brownie ." → "Brownie."; p5 "Rinku , " " → "Rinku, ""; p5 "noises . " " → "noises. ""; p7 "pup"." → "pup.""; p7 "said," okay " → "said, "Okay "; p7 "" I" → ""I"; p9 "Wow. "" → "Wow.""; p9 " him⏎" → " him.⏎"; p9 "evening ," → "evening,"; p9 "noises .⏎⏎" Woof woof", they said" → "noises.⏎⏎"Woof woof," they said,"; p10 "loudly , " " → "loudly, ""; p10 "garden . "Bow wow " , "bow wow"," → "garden. "Bow wow," "bow wow,""; p10 "wow , bow wow ."" → "wow, bow wow.""; p10 " bow wow "!!!" → "bow wow"!!!"; p10 "dog ." → "dog."; p11 "WOW,"" → "WOW.""; p11 "night ," → "night,"
- sw-0160 Preetha Aunty, My Teacher: p0 "Preetha Aunty- My teacher" → "Preetha Aunty, My Teacher"; p2 "Preeta aunty" → "Preetha Aunty"; p4 "She told me "Dhanyawaad"" → "She told me, "Dhanyawaad.""; p4 "say" Welcome"" → "say "Welcome""
- sw-0170 What Makes You Special?: p1 "What's makes" → "What makes"; p8 "dinosaurs I'm" → "dinosaurs, I'm"
- sw-0171 Jaggee's mornings: p3 "Most of the days I fall back to sleep for a few minutes!", Jaggee says." → "Most days I fall back to sleep for a few minutes!" Jaggee says."; p5 "start my day", says" → "start my day," says"; p6 "favourite subject- Math." → "favourite subject, Math."
- sw-0172 Tree on a plate: p1 "on her plate" → "on her plate."; p3 "her yellow lake" → "her yellow lake."; p6 "a stock" → "a stalk"; p6 "colour Roma" → "colour. Roma"; p7 "what is Roma's happy tree?" → "what Roma's happy tree is?"
- sw-0173 Fun with Balloon: p5 "Balloon grew" → "The balloon grew"
- sw-0174 My Friend Trace Roger the robot!: p1 "robot! with my dad's help, I fixed the r … se. But then I named it as Tracey Roger." → "robot! With my dad's help, I fixed the r … no use. But then I named it Trace Roger."; p3 "a long breadth" → "a long breath"
- sw-0175 Don't get scared! Try!: p2 "One day , there" → "One day, there"; p2 "set of early" → "set off early"; p3 "Badarsikhwaserdem , Tofu" → "Badarsikhwaserdem, Tofu"; p4 "told him that 'Tofu respect is very impo … st you will gain respect not loose it '." → "told him, "Tofu, respect is very importa … est you will gain respect, not lose it.""; p5 "Tofu then , tried" → "Tofu then tried"
- sw-0177 Amazing Ants: p1 "sweets and few pieces fell down. After s … r to see what it was and finds they were" → "sweets and a few pieces fell down. After … r to see what it was and found they were"; p2 "They all stuck together" → "They all stick together"
- sw-0178 Long Water: p2 "I have lot of water" → "I have a lot of water"; p5 "who am I?" → "who I am?"
- sw-0181 Prakruti: p2 "means Nature"." → "means Nature.""; p2 "mean?", asked" → "mean?" asked"; p2 ""Look outside", said" → ""Look outside," said"; p4 "and the breeze.." → "and the breeze."; p5 "and cold.." → "and cold."; p6 "and gold.." → "and gold."; p7 "in our⏎⏎courtyard.." → "in our courtyard."; p8 "in our⏎⏎frontyard.." → "in our front yard."; p9 "on the⏎⏎mountain tops .." → "on the mountain tops."; p10 "where⏎⏎sand is lots.." → "where sand is lots."; p11 "in the⏎⏎sunlight.." → "in the sunlight."; p12 "in the⏎⏎moonlight.." → "in the moonlight."; p13 "within us⏎⏎helpful, loving and full of joy.." → "within us,⏎⏎helpful, loving and full of joy."; p14 "I hope you enjoy",⏎⏎ended Ajji." → "I hope you enjoy," ended Ajji."
- sw-0185 The Surprise: p1 "Sara and Zara they were twins" → "Sara and Zara. They were twins"; p1 "merry -go -round" → "merry-go-round"; p2 "poster she called Sara" → "poster. She called Sara"; p2 "merry go round" → "merry-go-round"; p6 "However happy they were they couldn't control their excitement." → "They were so happy they couldn't control their excitement."; p6 "in their point of view It Was The BEST DAY EVER!!!!:)" → "in their view, it was the BEST DAY EVER!!!!"
- sw-0187 Happy world: p1 "saying a goodbye" → "saying goodbye"; p2 "asked her, " Ma can I" → "asked her, "Ma, can I"; p2 "hesitatingly " Er.. yes" → "hesitatingly, "Er... yes"; p2 "voice, " Aloke don't" → "voice, "Aloke, don't"; p2 "dinosaur's face."" → "dinosaur's face."
- sw-0191 Richard's unlucky day: p2 "straight away" → "straight away."; p4 "said was ''HUH''" → "said was "HUH.""
- sw-0193 Timmi's dream: p8 "she taught it how to touch it's nose." → "She taught it how to touch its nose."
- sw-0195 The party: p4 "his *sidekick. *sidekick-a person who accompanies you." → "his sidekick."; p5 "Nela's the horse's" → "Nela the horse's"; p7 "On the way. they" → "On the way, they"; p7 "along with them" → "along with them."; p8 "prises" → "prizes"; p10 "resturant" → "restaurant"
- sw-0200 The Unusual Rainmaking Duet: p2 "on the desert" → "in the desert"; p6 "rain bearing clouds gathered with lightening" → "rain-bearing clouds gathered with lightning"
- sw-0203 The train journey: p3 "luggage along" → "luggage along."; p1 " ," → ","; p2 " ," → ","; p4 " ," → ","; p6 "Shubhi ," → "Shubhi,"; p6 " ," → ","
- sw-0214 Chameleon Life: p1 "A Chameleon is color changing animal" → "A Chameleon is a color changing animal"; p1 "On day, Chameleon sleeping" → "One day, Chameleon was sleeping"; p1 "got scared on started changing its color, It has changed color" → "got scared and started changing its color. It changed color"; p2 "he wants to drink" → "he wanted to drink"; p3 "changed color of bushes" → "changed to the color of the bushes"
- sw-0229 Manya's perfect dress: p8 "falling in her chudidhar. At first , she" → "falling on her chudidhar. At first, she"; p1 "did'nt" → "didn't"; p8 "She did'nt " → "She didn't "; p8 "did'nt" → "didn't"
- sw-0235 Shambu and the little man: p2 "He suddenly hears" → "He suddenly heard"; p2 "He thought" Oh no!I think someone small is hurt"." → "He thought, "Oh no! I think someone small is hurt.""; p2 "He takes out" → "He took out"; p5 "unti it" → "until it"
- sw-0237 The missing cat: p5 "the wholetown" → "the whole town"; p7 "running towards." → "running towards her."
- sw-0240 The Day It Rained Fish: p3 "there was was" → "there was"; p7 "“Why?”asked" → "“Why?” asked"
- sw-0247 It's bath time!: p1 "your bath ", mummy called." → "your bath," mummy called."; p1 "Whooosh!!! whoosh!!!" → "Whooosh!!! Whoosh!!!"; p2 ""Ooh , Ooh " squealed" → ""Ooh, Ooh," squealed"; p3 "Rub , Rub , Rub Mummy" → "Rub, Rub, Rub, Mummy"; p4 "“Stop stop ,“ cried mummy, “ you are wet .”" → "“Stop, stop,” cried mummy, “you are wet.”"; p7 "Chinku 's tummy" → "Chinku's tummy"; p7 ""Oh, You are hungry " said" → ""Oh, you are hungry," said"; p8 "grandpa' s lap" → "grandpa's lap"; p1 ""Nandu ," → ""Nandu,"; p1 " ," → ","; p2 " splash , splish" → " splash, splish"; p2 " ," → ","; p5 " ," → ","; p1 "here ." → "here."; p1 "elephant ." → "elephant."; p1 " ." → "."; p2 "water ." → "water."; p2 " ." → "."; p3 " ." → "."; p5 "Chinku ." → "Chinku."; p5 " ." → "."; p6 "pajamas ." → "pajamas."; p6 "Chinku ." → "Chinku."; p6 " ." → "."; p7 " ." → "."; p8 " ." → "."
- sw-0255 The love of art: p6 "clean they house" → "clean the house"
- sw-0256 My Juggling Grandma: p3 "got hundred rupees" → "got a hundred rupees"; p4 "with a!!SPLAT!!" → "with a SPLAT!!"
- sw-0257 Nina Plays With the Butterflies: p3 "After awhile" → "After a while"; p5 "called her Mother and said, “I saw a lot … ther.” Both Nina and her mother, enjoyed" → "called her mother and said, “I saw a lot … other.” Both Nina and her mother enjoyed"
- sw-0261 Aditi's Trip To Moon: p1 "sitting on bed Aditi" → "sitting on her bed, Aditi"; p1 "" How I wish I go to moon." she thought.⏎Immediately, Aditi found herself flying ." → ""How I wish I could go to the moon," she thought. Immediately, Aditi found herself flying."; p2 "she wanted" → "She wanted"; p5 "something.." → "something."; p6 "felt like someone touching her" → "felt someone touching her"; p6 "said," Aditi, Don't cry." → "said, "Aditi, don't cry."; p7 "Eyes wide opened Aditi" → "Eyes wide open, Aditi"; p9 "her," Aditi wake up." → "her, "Aditi, wake up."; p9 "Oh! . It was" → "Oh! It was"
- sw-0264 The perfect project: p1 "project?Dia" → "project? Dia"; p1 "the the birds" → "the birds"; p2 "Gujia's, Dokhla" → "Gujias, Dhokla"; p3 "on" The India Gate."" → "on "The India Gate.""; p4 "The Desert's of" → "The Deserts of"; p5 "Peacok" → "Peacock"; p6 "did'nt" → "didn't"; p7 "on" Diwali". So" → "on "Diwali." So"; p8 "asked her from where did she get such a wonderful project" → "asked her where she got such a wonderful project"
- sw-0274 Wonders of Martina's Adventure: p1 "within the pacific ocean" → "within the Pacific Ocean"; p2 "travel any where" → "travel anywhere"; p3 "co- operated" → "co-operated"; p3 "of the pacific ocean" → "of the Pacific Ocean"
- sw-0301 And this is how the earth got colour.: p1 "There was a artist" → "There was an artist"; p9 "He wondered who painted the sky?" → "He wondered who painted the sky."
- sw-0308 Starry and the land of the unknown: p1 "in cloud haeven. He was'nt a normal dragon who could breathe fire, he could" → "in cloud heaven. He wasn't a normal dragon who could breathe fire; he could"; p2 "of cloud haeven" → "of cloud heaven"; p3 "was on a drought" → "was in a drought"; p5 "went to king Zeus" → "went to King Zeus"
- sw-0310 The Moon and the Stars: p2 "with it's cool" → "with its cool"; p3 "catch and cook" But" → "catch and cook." But"; p3 "among-st" → "amongst"; p4 "said " My dear" → "said, "My dear"; p4 "calling out to them"." → "calling out to them.""; p5 "and the all the glitter" → "and all the glitter"
- sw-0311 The huge beauty: p4 "large or over grown tomato" → "large or overgrown tomato"; p5 "she reach exactly when" → "She reached just when"; p5 "all the veggie competition which were" → "all the veggie competitions, which were"
- sw-0323 Chhoti and Bade: p1 "Everyday she" → "Every day she"; p5 "Bade- the elephant" → "Bade, the elephant"; p6 "kind eyes before" → "kind eyes before."
- sw-0328 Little Blue Alien: p5 "That how he is stuck alone and lost" → "That he was stuck alone and lost"
- sw-0341 Fonky's Fishy Party: p2 "for you.. Come" → "for you. Come"; p3 "he said," Let's" → "he said, "Let's"; p4 "from it." Oh! It is a Radio!", said Fonky." → "from it. "Oh! It is a radio!" said Fonky."; p5 "the new Radio" → "the new radio"; p6 "waiting for me"." → "waiting for me.""
- sw-0343 A bear makes lasting memories: p1 "tra-la-la-la" → "Tra-la-la-la"; p5 "in all it's glory" → "in all its glory"
- sw-0348 How Do Aeroplanes Fly?: p2 "the first Indian women pilot" → "the first Indian woman pilot"; p7 "change direction.⏎⏎ٴ" → "change direction."
- sw-0351 Moti and Mohan: p1 "They eat and play together." → "They ate and played together."
- sw-0352 Let's Go Seed Collecting!: p1 "five o' clock" → "five o'clock"; p2 "Their favourite thing to collect are seeds" → "Their favourite things to collect are seeds"; p3 "shake it about" → "shake them about"; p6 "“Hellllooooo."" → "“Hellllooooo.”"; p11 "grow into apple trees”" → "grow into apple trees.”"; p12 "all shapes and sizes”, Pacha" → "all shapes and sizes,” Pacha"; p16 "Capsicum annum" → "Capsicum annuum"; p16 "Coffeea Arabica" → "Coffea arabica"; p17 "Cocos Nucifera" → "Cocos nucifera"; p18 "Common name: Ricea" → "Common name: Rice"
- sw-0356 Life full of dreams: p3 "granny, " I dream" → "granny, "I dream"; p6 "to make to dream come true" → "to make your dream come true"
- sw-0359 Nosy Natasha takes a Note: p4 "call me that?", she cried" → "call me that?" she cried"; p4 ""I thought we were friends"." → ""I thought we were friends.""; p5 "so untrue" cried" → "so untrue," cried"; p6 ""Oh I get it now", she replied" → ""Oh, I get it now," she replied"; p7 "what 'irony" meant" → "what "irony" meant"
- sw-0362 Shriya and her Piyali: p3 "as much time with her parrot" → "as much time as she could with her parrot"; p5 ""Don't you not like our home?"" → ""Don't you like our home?""; p5 "my friends/"" → "my friends.""; p5 ""Definitely No"." → ""Definitely not.""; p5 "I can't too." → "I can't either."; p8 "inthe sky" → "in the sky"; p9 "needed to be go to the park" → "needed to go to the park"
- sw-0363 Pet Respect: p2 "One day when Lilly was feeding Yuri. Yuri suddenly" → "One day, when Lilly was feeding Yuri, Yuri suddenly"; p3 "asked Yuri, "what is the matter, Yuri?". … ing me outside in the fresh air , I feel" → "asked Yuri, "What is the matter, Yuri?"  … king me outside in the fresh air, I feel"; p3 "right now" says, Lilly" → "right now," says Lilly"; p4 "having so much, Yuri is lonely" → "having so much fun, while Yuri is lonely"; p5 "embarassed" → "embarrassed"
- sw-0364 Talking Tree of Alpha Town: p7 "thier mom" → "their mom"; p1 "friends ," → "friends,"; p1 "doggie ," → "doggie,"; p1 " ," → ","; p2 " ," → ","; p4 " ," → ","; p6 " ," → ","; p1 "usual ." → "usual."; p1 " ." → "."; p2 "tree ." → "tree."; p2 "town ." → "town."; p2 " ." → "."; p3 " ." → "."; p4 "'refreshing' ." → "'refreshing'."; p4 " ." → "."; p5 "'coffee' ." → "'coffee'."; p5 "energizing ." → "energizing."; p5 " ." → "."; p6 " ." → "."; p7 " ." → "."
- sw-0370 Terrific Trio: p1 "their parents eyes. Thou they" → "their parents' eyes. Though they"; p1 "palbable" → "palpable"; p2 "thou Vidya" → "though Vidya"; p3 "as his sibling had gone" → "as her siblings had gone"; p3 "went away immediately" → "went away immediately."; p5 "Adtiya" → "Aditya"; p5 "in Vidya Mummy and daddy" → "in Vidya, Mummy and Daddy"
- sw-0372 Mango Tango: p1 ""Yummy, yummy" said" → ""Yummy, yummy," said"; p1 ""Let's plant this seed" Nayana said" → ""Let's plant this seed," Nayana said"; p1 "big mango tree" Zia" → "big mango tree," Zia"; p4 ""sniff sniff" he sniffed" → ""Sniff sniff," he sniffed"; p4 "Oh ho! will it" → "Oh ho! Will it"; p4 "laid it over" → "laid them over"; p6 "Oh ho! will the hen" → "Oh ho! Will the hen"; p9 "Golden and yellow ," → "Golden and yellow,"
- sw-0379 Lalu the Owl: p5 "But Lalu was said." → "But Lalu was sad."
- sw-0381 Am I Alone?: p2 "Parrots with red beak" → "Parrots with red beaks"; p3 "My books, let me be anyone who I want to be. It also takes me" → "My books let me be anyone who I want to be. They also take me"
- sw-0400 Nanni and the Oil Spill: p1 "She hardly every listened" → "She hardly ever listened"; p1 "seen in the horizon" → "seen on the horizon"; p1 "decided to go an adventure" → "decided to go on an adventure"; p4 "told her, that had she" → "told her that had she"
- sw-0415 Frog in the Movie: p2 "a frogs's croaking" → "a frog's croaking"; p2 "They were curios. And suddenly they see" → "They were curious. And suddenly they saw"; p2 "And alas, what they see? A on his seat." → "And what did they see? A frog on his seat."

### Scanner flags reviewed by a person

- sw-0073 Colours (Tell me now series): The scanner's violence rule matches "blood": it is a science question ("Why is blood red? There is iron in the blood"). Reviewed: fine.
- sw-0103 I Can Make Things!: The scanner's private-person rule matches "my sister": the narrator's sister in the story, not a real person. Reviewed: fine.
- sw-0343 A bear makes lasting memories: The scanner's drugs rule matches "rum-pa-pum-pa-pum": the bear humming. Reviewed: fine.
- sw-0148 BooBoo sings for Vihaan: The scanner's profanity rule matches "BooBoo", the bear's name. Reviewed: fine.
- sw-0096 Samira Goes Shopping: The scanner's chat rule matches "don't talk to any strangers": a mother's safety advice. Reviewed: fine.
- sw-0159 The puppy that did not bark!!!: The scanner's profanity rule matches "cocked his ears": the puppy listening. Reviewed: fine.
- sw-0093 Marching to Freedom: The scanner's real-people rule matches Gandhiji: a history story about the Dandi March of 1930. Reviewed: fine.
- sw-0089 The Magic Powder - A Folktale from Myanmar: The scanner's rules check matches "repeat the above step": a step in the banana activity. Reviewed: fine.

## Left out

| Id | Title | Reason |
| --- | --- | --- |
| sw-0002 | Fat King Thin Dog | read and left out: Left out by the owner (20 Nov 2026): the jokes poke fun at body size ("fat king"). |
| sw-0004 | Chuskit Goes to School! | pictures do not line up with pages (23 images for 21 pages); reviewed: More pictures than pages (23 for 21): three pictures of faces (15, 16, 17) look like one page, and nothing says which page each goes with. |
| sw-0006 | Counting on Moru | picture 25.jpg is in the metadata but not in the image bank |
| sw-0011 | Sister, Sister, Where Does the Sun Go at Night? | read and left out: A mistake in the source text ("That's were I think"); a demon eats the sun and the sky is "stained red with his blood". |
| sw-0012 | Everything looks new! | read and left out: Religious practice is central (praying to a goddess, the Holika bonfire). |
| sw-0015 | Hot Tea and Warm Rugs | picture 15.jpg is in the metadata but not in the image bank |
| sw-0016 | Kheer on a Full Moon Night | read and left out: Several religious festivals are central (Navaratri dolls, Deepavali firecrackers). |
| sw-0019 | The Cat in the Ghat! | read and left out: A mistake in the source text ("come trueHope"); a prayer to God; a tribesman described by his face "painted black". |
| sw-0023 | Little by Little | read and left out: Violence: boiling water is thrown at a wolf, and the wolves threaten to "tear you to pieces". |
| sw-0025 | The Missing Bat | read and left out: An old man is described by his hunchback and the joke is at his expense. |
| sw-0027 | Jungle Brew | too long for the library (too long (3029 words)) |
| sw-0028 | Going to a Wedding | read and left out: Labels a grown-up by body size ("My fat aunt ... her thin husband"). |
| sw-0029 | Going Home | read and left out: A child runs across a busy road through traffic; a page is repeated in the source text. |
| sw-0032 | Paper Play | pictures do not line up with pages (12 images for 10 pages); reviewed: More pictures than pages, and the descriptions do not show which pictures go with which page. |
| sw-0033 | Suraj and Sher Singh | read and left out: A page is repeated in the source text, and a child is called "a fat boy". |
| sw-0037 | The Jungle School | read and left out: Lines are repeated in the source text and the ending is unclear. |
| sw-0039 | A Walk Among Trees | too long for the library (too long (3808 words)) |
| sw-0040 | Sister, Sister, Where Does Thunder Come From? | read and left out: A child says his mother would have spanked him, and the story leans on a mythological demon (Kumbhakarna). |
| sw-0042 | Sister, Sister Why is the Sky So Blue? | read and left out: A joke that a stain "drives the old woman insane"; left out to be safe. |
| sw-0043 | Sister, Sister, Why Don't Things Fall Up? | read and left out: A curse, a mother praying to her gods and a greedy demon under the earth are three of the answers. |
| sw-0049 | Kaka and Munni: A Folktale from Punjab | read and left out: The animals plan again and again to kill a deer, and the crow burns its tail in a furnace. |
| sw-0050 | Too Many Bananas | read and left out: A religious ceremony (a pooja with a priest and offerings to the gods) is central to the plot. |
| sw-0058 | Sailing Home | read and left out: Describes foreign sailors by their skin and "narrow tilted eyes", and a soldier calls a girl "you silly girl" (the scanner flagged it too). |
| sw-0066 | My Car | read and left out: Children ride a toy car after being told not to, and one loses a tooth. |
| sw-0068 | The Auto That Flew | read and left out: A child selling water between cars in busy traffic, called "a grubby boy". |
| sw-0074 | Naughty or Not (Tell me now series) | read and left out: Labels children as "a bad boy" and "a naughty girl". |
| sw-0076 | Paplu, the Giant | read and left out: A giant threatens bandits with swords ("I'll rip each and every limb from your bodies and chew them up"). |
| sw-0079 | Kallu's World 1 - In Big Trouble Again! | read and left out: Name-calling ("you idiot"), a teacher's harsh punishments, and the boy says he will kill his siblings and break his brother's other leg. |
| sw-0080 | The Day the Vegetables Came to School | pictures do not line up with pages (17 images for 15 pages); reviewed: Two pages are coloring pages ("Use your imagination and colour this picture") and there are 17 pictures for 15 pages; the extra pictures cannot be placed. |
| sw-0081 | The Generous Crow | read and left out: Romance joke ("Are you getting married soon?"). |
| sw-0082 | The Woodcutter of Gura - A Folktale from Ethiopia | pictures do not line up with pages (11 images for 9 pages); reviewed: Craft pages (how to make a raft) at the end, with two raft pictures for them; which picture goes with which craft page is not clear. |
| sw-0083 | Three for Free - A Folktale from Taiwan | pictures do not line up with pages (7 images for 7 pages); reviewed: As many pictures as pages: the descriptions do not show which picture is the cover or which page would go without one. |
| sw-0084 | Who is a good dog? | read and left out: A man threatens a dog ("I am going to teach you a lesson") and catches it. |
| sw-0085 | When Amma Went to School | read and left out: A pet snake eats a pet mouse, then chases the class. |
| sw-0086 | Grandpa Fish and the Radio | image 07.jpg license: unreadable |
| sw-0088 | The Flyaway Cradle | read and left out: A page is repeated in the source text, and children throw rocks at a cradle while the baby's father is away. |
| sw-0092 | The Sparrow and The Fruit | read and left out: A boy is beaten and a cow is whipped. |
| sw-0095 | Shobhini and Nani | read and left out: A child sends ants up in a basket tied to a balloon and teases a monkey; conversion leftovers ("###") are in the text. |
| sw-0097 | Sniffles, the Crocodile and Punch, the Butterfly | read and left out: Hunters with guns come to kill crocodiles for their skins. |
| sw-0098 | The Hare & the Tortoise (Again!) | pictures do not line up with pages (16 images for 14 pages); reviewed: The last two pages are coloring pages and there are 16 pictures for 14 pages; the story pictures cannot be placed one to one. |
| sw-0099 | Here Comes the Camel and Other Poems | pictures do not line up with pages (18 images for 19 pages); reviewed: Fewer pictures than pages, so some pages would have no picture. |
| sw-0102 | Rumniya | read and left out: A lost toddler lifts up every woman's sari to find her grandmother, and crying is called "silly baby-like". |
| sw-0104 | I lost my bat! I found my bat! | pictures do not line up with pages (9 images for 7 pages); reviewed: The descriptions map pictures 02-08 to pages 1-7, but the last picture (the girl with the bat) is the ending, which has no text page: the story would stop before the bat is found. |
| sw-0106 | What If? | read and left out: Left out by the owner (20 Nov 2026): the boy calls himself "a little skinny". |
| sw-0107 | Samira's Awful Lunch | image 07.jpg license: unreadable |
| sw-0108 | The Royal Toothache | pictures do not line up with pages (11 images for 11 pages); reviewed: The descriptions show 01 is the cover and 02-11 go with pages 1-10, so page 11 would have no picture. |
| sw-0109 | Monkey Business on Stage - Kallu's World 2 | pictures do not line up with pages (5 images for 5 pages); reviewed: As many pictures as pages: the descriptions do not show which picture is the cover or which page would go without one. |
| sw-0110 | Smart Sona Helps Her Mother | image 07.jpg license: unreadable |
| sw-0111 | Too Much Noise | read and left out: An angry grown-up calls a tiger "stupid" and glares at his wife. |
| sw-0115 | I Can Help! | image 07.jpg license: unreadable |
| sw-0116 | Wailers Three - A Folktale From China | pictures do not line up with pages (11 images for 9 pages); reviewed: Craft pages (a paper lantern) at the end, with three craft pictures for two pages; not clear which goes where. |
| sw-0117 | Tok Tok | read and left out: A mistake in the source text ("he bought Pasupati the zoo-keeper" for brought); the king calls his guards idiots and wants to cut a cow in two. |
| sw-0122 | First House | read and left out: A tiger has killed an animal and the body is described. |
| sw-0130 | The Boy and the Drum | pictures do not line up with pages (13 images for 13 pages); reviewed: As many pictures as pages: the descriptions do not show which picture is the cover or which page would go without one. |
| sw-0131 | The Elephant Bird | read and left out: Villagers with knives and spears set out to kill the bird, other children mock a girl's limp, and she walks alone through the jungle at night. |
| sw-0132 | We Are All Animals | read and left out: A child's brother is called "definitely an animal" because he is wild; the same reason as 0374. |
| sw-0133 | The Boy and the Drum (A Shorter Version) | pictures do not line up with pages (11 images for 11 pages); reviewed: As many pictures as pages: the descriptions do not show which picture is the cover or which page would go without one. |
| sw-0134 | Pishi Caught in a Storm | read and left out: A deep wound and dead tissue are described; the animal's life is in danger. |
| sw-0136 | Tara Finds Her Stars | read and left out: Reads as a child travelling alone and being asked if she has run away. |
| sw-0138 | Thangwang and Bhalluka | read and left out: A baby alone with a wild bear; the fact page says bears kill goats. |
| sw-0139 | My Juggling Granny | pictures do not line up with pages (9 images for 7 pages); reviewed: Nine pictures for seven pages and the last is described only as "6framestory"; not clear which pictures go where. |
| sw-0141 | Who Made This World? | read and left out: Religious ("Who made this world? God knows!"). |
| sw-0143 | The Lantern Queen | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0144 | The cat and the monkey | read and left out: Revisited for typos (20 Nov 2026): one page of 31 words ("That's all."), not a story. |
| sw-0145 | The Jolly Juggler | read and left out: Revisited for typos (20 Nov 2026): too many mistakes to fix without rewriting (speech with no quotation marks throughout, "OMG", "She asked to his great grandmom"). |
| sw-0146 | My Diwali Book | pictures do not line up with pages (22 images for 18 pages); reviewed: More pictures than pages (22 for 18), and a Diwali book with a puja (left out anyway). |
| sw-0147 | Mili's birthday celebration | read and left out: Revisited for typos (20 Nov 2026): the mistakes run through every sentence ("they had decided that this time it will not be the cakes", "Anna (older brother) got ready with the decorations of putting a new toran", "best Indian dressed child"); fixing it would mean rewriting. |
| sw-0152 | Mangoes For Moidootty | read and left out: Children use a spell to call a demon; mistakes in the source text ("wont", "cant"). |
| sw-0153 | The Woman With No Soul | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0155 | When Percy Said Sorry | read and left out: One page with a mistake in the source text ("One-day ants decided"); ants are hurt "endlessly". |
| sw-0158 | Asha gives up a bad habit! | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0161 | The Cave Party | read and left out: Many mistakes in the source text ("a tiger who live in a cave", "a elephant"); a tiger traps its prey. |
| sw-0162 | Climb and Hop | read and left out: Revisited for typos (20 Nov 2026): a one-page poem of 81 words, too little for 3 questions, with mistakes ("Its time", "shop!Then") and a threat to "pop". |
| sw-0163 | Me and my Strong Kite | read and left out: A six-line poem on one page about a kite that fights other kites; too little for 3 questions. |
| sw-0164 | The Horrible Crocobots | read and left out: Mistakes in the source text ("like we where", "helped my fix myself"); threats to dismantle a robot, and a factory set on fire. |
| sw-0165 | The Story-Pooping Cat | read and left out: The jokes are about a cat pooping stories, and a child calls another "that annoying boy in Grade Four". |
| sw-0166 | Have You Seen These Birds? | read and left out: A list of bird names, not a story (too little text for 3 questions). |
| sw-0167 | Didi and the Colourful Treasure | read and left out: Left out by the owner (20 Nov 2026): children live by a garbage dump and do not go to school. |
| sw-0168 | My Anti Litter Poem | read and left out: A one-page poem about disease, malaria and sea animals dying; not a story. |
| sw-0169 | Eat and Share | read and left out: A one-page poem that labels "beggar children"; not a story. |
| sw-0176 | Nadir's Pet | read and left out: Thieves are about to "cut" a stolen horse; mistakes in the source text ("stitch very good"). |
| sw-0179 | Stripey the Bee | read and left out: A mistake in the source text ("Finally , Stripey"); the honey recipe tells bees to "throw up". |
| sw-0180 | The Rainbow Story | read and left out: Mistakes in the source text ("u" for you, "Voilet", stray spaces before quotes); a puja is part of the plot. |
| sw-0182 | Animals Are Kind | read and left out: A farmer throws stones at birds; mistakes in the source text (missing periods). |
| sw-0184 | The boy who hated vegetables | read and left out: Revisited for typos (20 Nov 2026): the child gives chocolate to the dog (unsafe for dogs) and prays to God to undo his dream; still left out. |
| sw-0186 | Secrets of the earth | pictures do not line up with pages (2 images for 0 pages); reviewed: No story text in the source, only pictures. |
| sw-0188 | Where Is My Mother? | read and left out: Many mistakes in the source text (lowercase "i", "run run", "papered out of nowhere"); a bird carries off the turtle's sister. |
| sw-0189 | Tina and the crazy animal | read and left out: Mistakes in the source text ("Tina cold hear", "so hey went"), and villagers set out to kill the animal. |
| sw-0190 | Kaushik, the Kind Detective | pictures do not line up with pages (14 images for 10 pages); reviewed: More pictures than pages, and the descriptions do not show which pictures go with which page. |
| sw-0192 | The Disaster | read and left out: Mistakes in the source text ("near a mushroom (fungi) .", "went more close"); a cat burnt by acid in the plot. |
| sw-0194 | Dadhi's crazy specatal day | read and left out: Revisited for typos (20 Nov 2026): page 8 repeats page 7 word for word, and the joke is a child hiding her grandmother's glasses; fixing it would mean rewriting. |
| sw-0196 | Mr. Fish won't talk | read and left out: Revisited for typos (20 Nov 2026): a one-page note of 48 words with conversion headings ("### Before"); too little for 3 questions. |
| sw-0197 | The Race | read and left out: Revisited for typos (20 Nov 2026): too broken to fix without rewriting (a sentence that stops, "etc participated", a runner who appears only in the results). |
| sw-0199 | The Magical Zoo | read and left out: Revisited for typos (20 Nov 2026): one page of 79 words ending in a moral, with mistakes in most sentences ("here was a magical jungle", "but one an elephant", "telling him a slow poke"). |
| sw-0201 | The Brave Girl | read and left out: Parents go missing in a war and a plane crashes and burns; a mistake in the source text ("He father was"). |
| sw-0202 | Sheela Learns to make friends | read and left out: Mistakes in the source text ("sliently", the illustrators' names inside the story text); a child left alone and lost in a forest at dark. |
| sw-0204 | The Story of Stories | read and left out: A "Singing Sardarji" as a stock comic character can read as a stereotype of Sikh men; left out to be safe (the scanner flagged it too). |
| sw-0205 | Golu Detective | read and left out: Mistakes in the source text ("promised her to take her back home", a missing period); a child lost in a jungle. |
| sw-0206 | The Duet of Rainmakers | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0207 | No Tricking Kutti | read and left out: The plot is a boy wondering whether God is tricking him; mistakes in the source text ("tried to makes sense", "murukku's"). |
| sw-0208 | The Brave Kitten | read and left out: Revisited for typos (20 Nov 2026): one page, the kitten is "she" and "it" by turns and most sentences need fixing ("Small kitten was playing", "climbed and tree"); fixing it would mean rewriting. |
| sw-0209 | The Man likes to Sing | read and left out: Revisited for typos (20 Nov 2026): one page whose sentences all need rewriting ("One Day man went to forest and to see the forest, Practice the music over there"). |
| sw-0210 | Friendship in need is friend indeed | pictures do not line up with pages (2 images for 0 pages); reviewed: No story text in the source, only pictures. |
| sw-0212 | Clean Surroundings and Keep Bright | read and left out: Revisited for typos (20 Nov 2026): one page ending in a moral, with mistakes in most sentences ("a untidy place", "din't", "barking on them"). |
| sw-0213 | Kalaywani teacher class | read and left out: A teacher says "i will beat you"; mistakes in the source text (lowercase "i", "The cat torn my testpaper"). |
| sw-0216 | School going Boy Story | read and left out: Revisited for typos (20 Nov 2026): one page of 58 words, a dog grabs a frightened boy's book and he runs away; mistakes in every sentence. |
| sw-0217 | The King and his music | read and left out: Mistakes in the source text ("a king who like music", "he born as a common man"); the king dies. |
| sw-0218 | Monkey in the Kitchen | read and left out: Revisited for typos (20 Nov 2026): one page of 64 words with mistakes in several sentences (""did you eat the mangoes? " .", "it is not her child who ate"); too little for 3 questions. |
| sw-0219 | Be greater than others | read and left out: Revisited for typos (20 Nov 2026): one page whose sentences need rewriting ("I can do many things than others", "Curator also came as participant"). |
| sw-0220 | Monkey and Yummy Mangoes | read and left out: Revisited for typos (20 Nov 2026): one page with mistakes in most sentences, a monkey scares a woman and a crying child, and a stick is kept to keep the "money" (monkey) away. |
| sw-0221 | Monkey at home | read and left out: Revisited for typos (20 Nov 2026): one sentence of 33 words ("I am not there in home"), too little for 3 questions. |
| sw-0222 | Honey Bee journey | read and left out: Revisited for typos (20 Nov 2026): one page of 50 words, not a story. |
| sw-0223 | Mischievous Monkey | read and left out: One page; a monkey breaks into a kitchen and frightens people; nothing to ask 3 questions about. |
| sw-0224 | Hoggy and Ramu | read and left out: One page with mistakes in the source text ("mokey", ""what are you doing here?"."). |
| sw-0225 | Naughty Children | read and left out: One page of 42 words with mistakes in the source text ("One of the student writing"), and labels the children "naughty". |
| sw-0226 | Diwali | read and left out: A Lakshmi Pooja and firecrackers are central; mistakes in the source text ("lightning diyas", "its holiday"). |
| sw-0227 | The dog | read and left out: Written for adults: "damn dog", a soldier deploying to Iraq who may not come back. |
| sw-0228 | Granny and her Bird Friend | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0230 | Didi's knowledge | read and left out: A mistake in the source text ("There was an earthquack"); children left to set up a house alone after an earthquake. |
| sw-0231 | Shruti's secret to winning | read and left out: Revisited for typos (20 Nov 2026): a teacher stays at a pupil's home and has a robot camera follow her everywhere; left out to be safe. |
| sw-0232 | My best friend | read and left out: Revisited for typos (20 Nov 2026): still left out: a near copy of My Best Friend (0125), which is included. |
| sw-0233 | Follow Your Dreams | read and left out: Revisited for typos (20 Nov 2026): one page with mistakes in many sentences ("he grew up and became 6 years", "he told a speech", quotes not closed). |
| sw-0234 | Tita | read and left out: Revisited for typos (20 Nov 2026): 40 words, unclear who does what, and a small child ironing all the clothes (unsafe). |
| sw-0236 | Amma's stories | read and left out: Revisited for typos (20 Nov 2026): eight very short stories with many mistakes ("confusedat", "gotn", "selfcontroled") and conversion headings ("###"); fixing it would mean rewriting. |
| sw-0238 | Holiday in Hathipur | pictures do not line up with pages (6 images for 3 pages); reviewed: No story text in the source, only pictures. |
| sw-0241 | Rachel and Big Ben | read and left out: A mistake in the source text ("He had become old, little faded"); a girl pulled away by a river in a dream. |
| sw-0242 | Cute Rat | read and left out: One page of 51 words, not a story; a mistake in the source text ("Bits of papers ... is a bad deed"). |
| sw-0243 | Where is my Home? | read and left out: One page with mistakes in the source text ("thought to had a urgent meeting"); calls people "MEAN HUMANS". |
| sw-0246 | Crumbled Tear Laden Walls | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0248 | Ham and Lily | pictures do not line up with pages (4 images for 4 pages); reviewed: As many pictures as pages: the descriptions do not show which picture is the cover or which page would go without one. |
| sw-0249 | Maya - Story of Us | pictures do not line up with pages (64 images for 32 pages); reviewed: No story text in the source (64 pictures, no words). |
| sw-0250 | The Angry Shopkeeper | read and left out: A mistake in the source text ("amd set off for work"); a shopkeeper screams at a crowd; a man is labeled "a beggar in rags". |
| sw-0251 | Windy's adventure | read and left out: Revisited for typos (20 Nov 2026): the children slip out of their village with a new friend without telling anyone, and many mistakes ("under where her town", "they were loud noises", "their festival which they give"). |
| sw-0252 | The book of poems | read and left out: Old poems by other writers collected together, a rabbit crying in a snare, and mistakes ("Our habits weather right or wrong", missing spaces after commas). |
| sw-0253 | Dia's favourite festivals | read and left out: Mistakes in the source text ("ethenic", "synthitic", "diya's", "Me and my family enjoy"); religious festivals are the whole book. |
| sw-0254 | The Magical Jackal | read and left out: Mistakes in the source text ("1'o' clock", "Saturday .", "the the"); a child sneaks out of her dormitory into a dark forest at night. |
| sw-0258 | Gargi and Soapy | read and left out: Germs "kick and punch" a sick girl and a "war"; mistakes in the source text ("magnificient", "boat ,"). |
| sw-0259 | Treasure of Deeds | read and left out: Written for older readers: drunk men eye a young woman on an empty night bus; mistakes in the source text ("strench"). |
| sw-0260 | Guess this place? Ghost Town! | read and left out: A Ramayana story (Lord Rama, Ravana, a prayer to Lord Shiva) is the plot. |
| sw-0263 | Hacking Is Life Part 2 - The Kid Can't Be Kidnapped | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0265 | Mittai Lals' Sweet Dream | read and left out: Labels a man by body size ("fat and round like a laddu") and ends with him breaking his arm. |
| sw-0266 | Intelligent Friends | read and left out: Revisited for typos (20 Nov 2026): too many mistakes to fix without rewriting (most sentences), and a lion threatens to eat the friends. |
| sw-0267 | The little girl and Teddy | read and left out: Revisited for typos (20 Nov 2026): still left out: one page, cut off and garbled at the end, with mistakes throughout ("throwed", "my mother told you can"). |
| sw-0268 | The Girl and the Bear | read and left out: Revisited for typos (20 Nov 2026): too many mistakes to fix without rewriting ("didn't had", "fishes have started raining"), and a girl alone in a flooded forest. |
| sw-0269 | Hooray!!! It's Sunday- Time for Leisure Shower and Fun time | read and left out: Revisited for typos (20 Nov 2026): awkward throughout ("their sleep mood", "a fun filled bathing playing activity") with little story; fixing it would mean rewriting. |
| sw-0270 | Viva.., the curious girl | read and left out: Revisited for typos (20 Nov 2026): sentence fragments and grammar slips on every page ("This experiences make her the \"The active pupil\""), and little story for 3 questions. |
| sw-0271 | Best Friends Forever | read and left out: Revisited for typos (20 Nov 2026): too many mistakes to fix without rewriting ("They two cried", "the two of them's houses", "They lived in the hut areas"). |
| sw-0272 | Life's Lighter Moments | read and left out: Mistakes in the source text ("in the age of10", "how really hated", "asusual"); a boy's hand stuck in a hole in a busy road. |
| sw-0273 | App-ily ever after | read and left out: Mistakes in the source text ("All in day's job"); the plot is an advert for a made-up map app. |
| sw-0275 | Cinderella | read and left out: Mistakes in the source text ("she is a sweet girl" without a capital, "did not allowed"); a contest for the most beautiful girl to marry a prince. |
| sw-0277 | The brave boy! | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0278 | Queen's Village | read and left out: A queen dies and people die of disease; mistakes in the source text ("ther was no rains", "Atlast"). |
| sw-0279 | Croaky the Frog | read and left out: Revisited for typos (20 Nov 2026): sentences run across three page breaks, the man is also called a boy, "taking" for talking, and the answer is "asking Google"; fixing it would mean rewriting. |
| sw-0280 | The day of an owl | read and left out: Revisited for typos (20 Nov 2026): the plot is unclear (a bird is "falling on the ground" while a vulture circles, then is helped back up), with sentences split across pages; fixing it would mean rewriting. |
| sw-0281 | Abhinav and the Cat | read and left out: Revisited for typos (20 Nov 2026): the plot leans on a TV cartoon's characters (Oggy and the Cockroaches) we have no rights to, and many mistakes ("in a sauce", "catoon", "became as one"). |
| sw-0282 | The Avengers and the age of powerful mach Green Goblin | read and left out: Uses Marvel characters (the Avengers, the Green Goblin) we have no rights to; fighting; mistakes (lowercase names). |
| sw-0283 | Food makes everything better! | read and left out: Calls a girl "weak in studies" and a bear "greedy"; mistakes in the source text ("Thutankan", "Thepla's", "contended"). |
| sw-0284 | Our earth is precious | read and left out: Unclear text ("Ladies when they pray", monsters) and mistakes. |
| sw-0285 | Zara | read and left out: Both of a girl's parents die in the first two pages. |
| sw-0286 | The Clever Tortoise and the Foolish Fox | read and left out: Mistakes in the source text (run-on sentences, the tortoise becomes a turtle mid-story, no final period); a fox tries to eat the tortoise. |
| sw-0287 | My family | read and left out: Revisited for typos (20 Nov 2026): one page describing a family (a bank, films, restaurants) with mistakes in most sentences; not a story. |
| sw-0288 | Adventures of Anna | read and left out: One page with mistakes in the source text ("She like to take risks", "heavely", "stromy"); a girl lost alone in a jungle at night. |
| sw-0290 | Sheema and King Kenrykoof | read and left out: Mistakes in the source text ("Her mother" capitalized mid-sentence, lowercase "king kenrykoof"); a fight with an army. |
| sw-0291 | Akash's sweet lesson to brush | read and left out: Mistakes in the source text ("mommy and daddy has warned him", "a cake awaiting for him"); a monster threatens to eat a child's teeth. |
| sw-0292 | God | read and left out: Religious: God comes to earth as Lord Krishna; mistakes in the source text ("donot"). |
| sw-0294 | Truth Alone Triumphs | read and left out: A boy sneaks out while his parents nap and expects to be beaten; a mistake in the source text ("sitting in is house"). |
| sw-0295 | Silly & Billy Meet the Ministry of Petrol Pumps | read and left out: Revisited for typos (20 Nov 2026): a sentence runs across a page break ("wagging their / tails"), and the plot (two animals off to meet "the ministry of petrol pumps") does not hold together; fixing it would mean rewriting. |
| sw-0296 | Rizwan and his friends having fun in the snow | read and left out: Revisited for typos (20 Nov 2026): garbled sentences ("Like him this Saturday morning, the parents finally allowed", "shared the pictures to all their cousins ... to come"); fixing it would mean rewriting. |
| sw-0297 | Holiday Fun | read and left out: Warriors fighting, then unrelated lines; mistakes in the source text ("One day there are 3 warriors", "we love beach"). |
| sw-0298 | Inhabitants of the Sea | read and left out: Revisited for typos (20 Nov 2026): still left out: a list of sea animals and where they live, not a story (the missing period is easy to fix, the thinness is not). |
| sw-0299 | How Does the Toothpaste Get into the Tube? | pictures do not line up with pages (13 images for 11 pages); reviewed: More pictures than pages, and the descriptions do not show which pictures go with which page. |
| sw-0300 | Toothpaste trouble!! | read and left out: Revisited for typos (20 Nov 2026): wrong facts children could learn (toothpaste invented in the 1960s, made with sugar and wood), as well as the mistakes ("did'nt", "had rot"). |
| sw-0302 | Oliver beats his problem! | read and left out: A boy is called "very fat" and teased at school; the story is about losing weight. |
| sw-0303 | My brother | read and left out: A mother dies and her small son does child labor; many mistakes in the source text ("amoun", "fall ill"). |
| sw-0304 | Why Do Bees Buzz? | pictures do not line up with pages (13 images for 11 pages); reviewed: More pictures than pages, and the descriptions do not show which pictures go with which page. |
| sw-0305 | The Cloud Dragon | read and left out: Lord Indra and a war in heaven are the plot; mistakes in the source text ("didn't breath fire", "on wards"). |
| sw-0306 | Our easy escape | read and left out: A haunted house and a ghost; a boy goes into a stranger's house against his mother's advice. |
| sw-0307 | Hyena and Raven | read and left out: The hyena falls from the sky and is badly hurt ("howling in pain, with a broken leg and dark scars"). |
| sw-0309 | A Kind Boy. | read and left out: Revisited for typos (20 Nov 2026): fixable, but a man the boy helped once tells him "I would also like to help you with anything you need. Please come and meet me later" (the scanner flags it too); left out to be safe. |
| sw-0312 | The bizarre island | read and left out: Revisited for typos (20 Nov 2026): too many mistakes to fix without rewriting ("several dwarf came", "ascending towards them by the smell"), hands pull two children into a portal and a dinosaur is said to be coming to eat them. |
| sw-0313 | Long Live Friendship! A Humorous Play for Children | too long for the library (too long (2964 words)) |
| sw-0314 | Loving Family | read and left out: Mistakes in the source text ("Little yo came running", "less marks", a missing period); a child terrified of her parents' reaction. |
| sw-0315 | Chottu - The Little Boy | read and left out: A boy is teased about his height and attacks another child wrestling-style ("Charlie's neck twisted"); brand names (Manchester United, WWE, Complan). |
| sw-0316 | “Everything happens for the good” | read and left out: A hunting accident takes a man's thumb, cannibals capture a king, and a friend is put in prison. |
| sw-0318 | Why Does A Poori Puff Up? | pictures do not line up with pages (15 images for 12 pages); reviewed: More pictures than pages, and the descriptions do not show which pictures go with which page. |
| sw-0320 | The Rabbit's Kite Tales | read and left out: Revisited for typos (20 Nov 2026): the rabbit is Balloo and Ballu, and the ending ("It was the last time Ballu had seen Appu...") reads as if the elephant is gone for good; fixing it would mean rewriting. |
| sw-0321 | Drigo lost in Space | read and left out: Revisited for typos (20 Nov 2026): the dragon eats aliens he takes for chillies, and the text is mostly runs of dots and fragments; fixing it would mean rewriting. |
| sw-0324 | Why Can't We Glow Like Fireflies? | read and left out: Revisited for typos (20 Nov 2026): the one mistake ("Fireflies maybe tiny") is easy to fix, but the page about fireflies choosing mates ("female fireflies prefer flashy males") stays a reason to leave it out. |
| sw-0325 | Trip to the Dragon Land | read and left out: Revisited for typos (20 Nov 2026): the tense changes from page to page and the last page starts with a part sentence; the dream and the trip do not hold together without rewriting. |
| sw-0329 | The Change | pictures do not line up with pages (8 images for 8 pages); reviewed: As many pictures as pages and two are "Rocket flying over green hills"; the text also has mistakes ("eyery one"). |
| sw-0330 | Eldorado | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0331 | Everyone needs a friend | read and left out: Lions plan to "share the kill" of a giraffe; mistakes in the source text ("asked." It's", "life."" Everyone"). |
| sw-0333 | The Indigo Fairy and the Lizard | read and left out: A lizard calls a little girl "a sweet little dope"; a mistake in the source text ("Well It would seem"). |
| sw-0334 | Kardi | read and left out: Mistakes in the source text ("immediately drawn his attention", "soo happy", "He was surprise"); calls the goat "very fat". |
| sw-0337 | Jack and Anny go to space | read and left out: Revisited for typos (20 Nov 2026): reported speech is mixed up on every page ("asked their mother if we could go") and the last line ("they would quarrel about being a scientist back again") is unclear; fixing it would mean rewriting. |
| sw-0338 | The Birthday Party | image 07.jpg license: unreadable |
| sw-0339 | The Indigo Fairy and the Water Buffaloes | read and left out: The plot is a breathing meditation ("The breath moves in...the breath moves out"), close to spiritual instruction; an unclear line ("Off went the calf with the teeth"). |
| sw-0340 | The Indigo Fairy and the Frogs | read and left out: Meditation and trances are the plot, close to spiritual instruction; a mistake in the source text ("a flower , a very special flower"). |
| sw-0342 | Unbreakable Friendship | read and left out: Revisited for typos (20 Nov 2026): too many mistakes to fix without rewriting (run-on sentences, "THen", "full of people's", lowercase "i"), and the bear's prayer ("Oh god! thank you") ends the story. |
| sw-0344 | Gabbar Is Back | read and left out: The other animals mock the crocodile as a baby, his friends trick him by pretending a snail is drowning, and a mistake ("anwhere"). |
| sw-0349 | Chulli and the cows | read and left out: Only 3 pages; the story stops before it ends. |
| sw-0357 | Sam the Dragon | pictures do not line up with pages (11 images for 12 pages); reviewed: Fewer pictures than pages, so some pages would have no picture. |
| sw-0358 | Nanni's Birthday Gift | read and left out: The jokes are about an uncle's bald head; mistakes in the source text ("noded", "headfull", "Everyone in the house were"). |
| sw-0360 | Reeti and Mithu | pictures do not line up with pages (11 images for 19 pages); reviewed: Fewer pictures than pages, so some pages would have no picture. |
| sw-0361 | Journey to many lands | read and left out: Velociraptors attack and bite the mother dinosaur; mistakes in the source text ("knocked their breaths of", "It's body"). |
| sw-0365 | Ananya's first story | read and left out: One page of 45 words about bursting firecrackers; nothing to ask 3 questions about. |
| sw-0366 | Little Madhu's Dream | read and left out: Revisited for typos (20 Nov 2026): the last page is an author's note saying nouns are in bold and italics, which the text does not have; taking it out and fixing the speech punctuation on every page ("in my dream." replied Madhu) is more than a typo fix. |
| sw-0367 | Rupa's Vacation...!! | read and left out: Many mistakes in the source text (sentences starting lowercase, "1 O" clock", "dont"); a child hides to make the family miss the train. |
| sw-0368 | Anty's Team | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0369 | Karthik loves to read | read and left out: Revisited for typos (20 Nov 2026): half the book is an author's note to parents (reading tips), not the story; the mistake ("listen to her in attention") is small, but the note stays a reason. |
| sw-0374 | The Monkey in You | read and left out: Compares children to monkeys, which can read as a slur; left out to be safe. |
| sw-0377 | Dum Dum-a-Dum Biryani! | pictures do not line up with pages (20 images for 12 pages); reviewed: More pictures than pages, and the descriptions do not show which pictures go with which page. |
| sw-0378 | Have You Ever Travelled By? | read and left out: A list of vehicles, not a story. |
| sw-0380 | Bonda and Devi | pictures do not line up with pages (19 images for 17 pages); reviewed: More pictures than pages (19 for 17); 11 and 12 have the same description and 19 shows two men at a computer, which matches no page. |
| sw-0383 | Tintu's Day at Garden | read and left out: Revisited for typos (20 Nov 2026): 52 words, a sentence split across two pages, and a child cooks soup on his own. |
| sw-0384 | Tilly and Kyle make Vegetable Curry | read and left out: Children cook on the gas burner alone while their grandmother sleeps; tenses mixed in the source text ("Ammamma is sleeping. Tilly and Kyle were"). |
| sw-0386 | Danny The Dragon | pictures do not line up with pages (11 images for 11 pages); reviewed: As many pictures as pages: the descriptions do not show which picture is the cover or which page would go without one. |
| sw-0388 | Where Did Your Dimples Go? | pictures do not line up with pages (11 images for 14 pages); reviewed: Fewer pictures than pages, so some pages would have no picture. |
| sw-0389 | My best friend and I | read and left out: Revisited for typos (20 Nov 2026): the story skips from a walk to "she remembered it was my birthday" with nothing between, with broken sentences ("Oh I said.. we took some rest. and all"); fixing it would mean rewriting. |
| sw-0390 | Browny The Horse | read and left out: Boys throw stones at a horse; mistakes in the source text ("There he saw , many", "jumping into the fire from the frying pan"). |
| sw-0391 | Up World, Down World | pictures do not line up with pages (24 images for 22 pages); reviewed: More pictures than pages (24 for 22) and several have the same description (16 and 17, 10 and 22); not clear which goes where. |
| sw-0392 | We Don't Pick Up Dog Family | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0394 | The Big Game | read and left out: A coach is called "Fatty Patty", the children are given an energy drink, and mistakes ("Its", "thats", "lets"). |
| sw-0395 | Manikantan Has Enough | pictures do not line up with pages (21 images for 17 pages); reviewed: More pictures than pages, and the descriptions do not show which pictures go with which page. |
| sw-0399 | Cat Dreams | read and left out: Revisited for typos (20 Nov 2026): two lines (28 words), too little for 3 questions. |
| sw-0401 | Baby in the clouds | read and left out: Revisited for typos (20 Nov 2026): a long story told inside the mother's speech, with the crane's and the baby's words unmarked and quotation marks missing throughout; fixing it would mean rewriting. |
| sw-0403 | The Messy Desk | read and left out: Mistakes in the source text ("brought you hear", "a huge anthill in sitting"); a gun and Toy Story characters are mentioned. |
| sw-0404 | The Mango Pickle | read and left out: Mistakes in the source text ("who's hearing and eyesight was not to good"); "Oh My God!" and "box Pa's ears"; a feared uncle yells at a driver. |
| sw-0406 | A Helping Hand | image 01.jpg license: unreadable |
| sw-0407 | Jamun Has Her Wish | pictures do not line up with pages (11 images for 13 pages); reviewed: Fewer pictures than pages, so some pages would have no picture. |
| sw-0409 | The wait | read and left out: An 11-year-old alone at home in the evening; mistakes in the source text ("and and city lights", "He remembered on his good friend"). |
| sw-0410 | Inside the World Wide Web | pictures do not line up with pages (11 images for 16 pages); reviewed: Fewer pictures than pages, so some pages would have no picture. |
| sw-0411 | Nilofar | read and left out: A girl snatches a skirt from a shop in her dream and is chased; mistakes in the source text ("“Nilofar”!!!", "Ever so Slowly"). |
| sw-0412 | The Magic Pond | read and left out: A girl is mocked for her looks ("a nose as big as a mango", "You look like a circus clown!"); the story is about her appearance. |
| sw-0413 | Chimni | read and left out: An orphan girl is described as "fair, tall and thin"; a pooja; mistakes in the source text ("'I am feeling guilty, said Mummy"). |
| sw-0414 | The Mango Tree | read and left out: One page of 67 words; the story stops before anything happens. |
| sw-0417 | River and Sun | pictures do not line up with pages (11 images for 11 pages); reviewed: As many pictures as pages: the descriptions do not show which picture is the cover or which page would go without one. |
| sw-0418 | Can you smile when you snore? | pictures do not line up with pages (11 images for 11 pages); reviewed: As many pictures as pages: the descriptions do not show which picture is the cover or which page would go without one. |
| sw-0420 | Amit and his Football | pictures do not line up with pages (1 images for 1 pages); reviewed: The whole story is one page of text with one picture: no separate cover, and the reader would show it all at once. |
| sw-0421 | Under the sea | pictures do not line up with pages (13 images for 11 pages); reviewed: More pictures than pages, and the descriptions do not show which pictures go with which page. |
| sw-0422 | Happy Holi! | read and left out: Describes people as "fat and thin, beautiful and ugly"; mistakes in the source text ("shouts." Am I", "lets go", "was was"). |
| sw-0423 | The mouse+dragon | read and left out: A holy man's mantras shrink a dragon, and a cat bites off its tail; mistakes in the source text ("sunbath"). |
| sw-0424 | The Moon and Daisy | read and left out: A wicked sea-beast named Moron tricks a girl, drags her into the sea and locks her up. |
| sw-0425 | Seasons | read and left out: Four words in all (too little text for 3 questions). |
| sw-0426 | Zara and the butterfly | read and left out: Revisited for typos (20 Nov 2026): the typos are easy to fix, but "I hate my life" and children who live under a bridge stay reasons to leave it out. |
| sw-0427 | Food Thieves | read and left out: Animals steal a woodcutter's food and are praised for never being caught; a mistake in the source text ("an woodcutter"). |
| sw-0428 | Shyamlal, your work! | read and left out: Revisited for typos (20 Nov 2026): pages 3 to 7 are a few words and dots each, and the story ends by warning readers they "will suffer like Shyamlal Babu". |
| sw-0429 | The Nose-less King | read and left out: A king swallows a bird twice and soldiers swing swords to chop off its head (they cut off the king's nose). |
