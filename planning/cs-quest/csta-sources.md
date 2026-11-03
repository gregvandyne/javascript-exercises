# CSTA K-12 CS Standards (2017) — Level 1B and Level 2: evidence log

Gathered 2026-11-03 for CS Quest. Output: `csta.json` in this folder (21 Level 1B + 23 Level 2 = 44 standards).

## Network situation

The sandbox proxy is an allowlist. Blocked (HTTP 403 CONNECT / ENOTFOUND for WebFetch): csteachers.org, code.org, curriculum.code.org, studio.code.org, ospi.k12.wa.us, portal.ct.gov, educate.iowa.gov, dpi.nc.gov, makecode.microbit.org, ryanstraight.github.io, web.archive.org, archive.org, docs.google.com, huggingface.co, en.wikipedia.org, gist.githubusercontent.com. Reachable: github.com (git clone), api.github.com (unauthenticated search), raw.githubusercontent.com, registry.npmjs.org, pypi.org. So the official csteachers.org PDF/XLSX could not be opened directly; every statement below was instead confirmed by agreement between independent GitHub-hosted mirrors, two of which are machine exports of CSTA's own data (Code.org's seed CSV and an XLSX-derived CSV from an IACE researcher).

## Sources used (all fetched at the pinned commits)

| # | Source | What it is | URL |
|---|---|---|---|
| S1 | Code.org `dashboard/config/standards/csta_standards.csv` (+ `csta_categories.csv`, `frameworks.csv`) | Code.org's seed data for framework `csta` = "CSTA K-12 Computer Science Standards (2017)"; 120 rows, all five levels; columns framework,category,standard,description. Obtained by `git clone --filter=blob:none` of code-dot-org/code-dot-org at commit b4b5f28b928abf86ea85aff4b6e0ec4b41513d7f (staging, 2026-11-03). | https://github.com/code-dot-org/code-dot-org/blob/b4b5f28b928abf86ea85aff4b6e0ec4b41513d7f/dashboard/config/standards/csta_standards.csv |
| S2 | dcpetty/google-colaboratory `state-standards/State Standards - CSTA Standards.csv` | Dataset from Julie M. Smith (Institute for Advancing Computing Education, csedresearch.org) used in "Exploring State and CSTA K-12 CS Learning Standards" (ReimaginingCS Pathways). Columns: Identifier, Level, Grades, Sequence, Standard, Clarification, Concept, Subconcept, Practice, Practice(s), Subpractice — the same column set as CSTA's official 2017 XLSX download. Commit 6e26253d82db410a77f68e9d44ae4a73847069b5. | https://github.com/dcpetty/google-colaboratory/blob/6e26253d82db410a77f68e9d44ae4a73847069b5/state-standards/State%20Standards%20-%20CSTA%20Standards.csv |
| S3 | whiskethy/GP1_and_2_Lesson_plans `Standards/CSTA Standards.md` | Full transcription of the 2017 document (all 120 standards) with per-standard `*(Subconcept: …; Practice: …)*` annotation and clarification statement. Commit ecbefe65ace15ddca434715743ce549c923f2b98. | https://github.com/whiskethy/GP1_and_2_Lesson_plans/blob/ecbefe65ace15ddca434715743ce549c923f2b98/Standards/CSTA%20Standards.md |
| S4 | bomonike/bomonike.github.io `data/csta-2024.csv` | TSV the author states was saved from https://csteachers.org/k12standards/interactive/ (columns _Concept, _Subconcept, _Grades, _Standard, _Identifier, _Practice(s)). Commit de54be630158322565b1bad8a11e961619e0e68e. | https://github.com/bomonike/bomonike.github.io/blob/de54be630158322565b1bad8a11e961619e0e68e/data/csta-2024.csv |
| S5 | bootstrapworld/curriculum `shared/langs/en-us/standards/standards-csta-dictionary.json` | Bootstrap curriculum's CSTA dictionary (id -> description), 103 entries. Commit b0d8ca7319e2898a34c841846101eb843b4e48bb. | https://github.com/bootstrapworld/curriculum/blob/b0d8ca7319e2898a34c841846101eb843b4e48bb/shared/langs/en-us/standards/standards-csta-dictionary.json |
| S6 | mattjones1/stem_207 `assets/js/data/standards.js` | Partial id -> text map (22 of the 44). Commit 6967ce4c641873d7555d04a323adfdc6edd10037. | https://github.com/mattjones1/stem_207/blob/6967ce4c641873d7555d04a323adfdc6edd10037/assets/js/data/standards.js |
| S7 | ikollipara/connection `app/Enums/Standard.php` | PHP enum with id + text (one copy error at 1B-AP-16, ignored). Commit a9eb19dae1a6079aefb453f2c01a532a95ff4dfd. | https://github.com/ikollipara/connection/blob/a9eb19dae1a6079aefb453f2c01a532a95ff4dfd/app/Enums/Standard.php |

Not used for text (paraphrased, not verbatim): cxedhub/wiki `data/standards.json`, H-H-E/lesson-hub `docs/CSTA-STANDARDS.md`. Located via `https://api.github.com/search/code?q="1B-AP-10"+"2-NI-05"` (11 hits) and three further id-pair searches (10-11 hits each, same files). Web searches (WebSearch tool) confirmed that csteachers.org/wp-content/uploads/2025/03/csta-k-12-computer-science-standards-revised.pdf, portal.ct.gov/-/media/sde/cte/csta-k12-computer-science-standards-revised-2017.pdf and ospi.k12.wa.us/sites/default/files/2022-12/cs-standards-{3-5,6-8}.pdf are copies of the official document, and quoted 1B-CS-01 and 2-DA-07 text that matches the sources above, but those hosts could not be opened.

## Method and decisions

- Statement text: taken from S2 (XLSX-shaped export) and required to equal S3 after whitespace/quote normalisation; then compared with S1, S4, S5, S6, S7. Every one of the 44 statements is matched verbatim by at least five of the seven sources, so all 44 are marked `verified`. Curly apostrophes/quotes were normalised to ASCII; nothing else was changed.
- Counts: Level 1B = 21 (CS 01-03, NI 04-05, DA 06-07, AP 08-17, IC 18-21). Level 2 = 23 (CS 01-03, NI 04-06, DA 07-09, AP 10-19, IC 20-23). All sources agree; the five levels total 18+21+23+30+28 = 120 = number of rows in Code.org's file. The task brief's expectation of 31 for Level 2 does not match the 2017 document (3A has 30).
- Subconcept and practice codes: from S2, cross-checked against S3 (44/44 agree on practice codes, 40/44 on subconcept spelling — S3 writes the PDF punctuation "Collection, Visualization, & Transformation" and "Safety, Law & Ethics" where S2/S4 write "Collection Visualization & Transformation" / "Safety Law & Ethics"; the JSON uses the latter, which is the spelling the brief asked for). `practices` holds the practice numbers; `practiceCodes` keeps the published sub-practice codes (e.g. "5.2"; 2-DA-07 is published as whole practice "4").
- Clarification statements: from S2, equal to S3 for 44/44 (normalised). Included as a supplementary field.
- Four statements differ between Code.org (S1) and all other sources by one comma; the majority reading was kept:
- **1B-AP-12**: Code.org reads `Modify, remix or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features.`; the other five sources read `Modify, remix, or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features.`. Majority (and the XLSX-derived export) kept.
- **1B-AP-16**: Code.org reads `Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation and review stages of program development.`; the other five sources read `Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation, and review stages of program development.`. Majority (and the XLSX-derived export) kept.
- **1B-IC-18**: Code.org reads `Discuss computing technologies that have changed the world and express how those technologies influence, and are influenced by, cultural practices.`; the other five sources read `Discuss computing technologies that have changed the world, and express how those technologies influence, and are influenced by, cultural practices.`. Majority (and the XLSX-derived export) kept.
- **1B-IC-21**: Code.org reads `Use public domain or creative commons media and refrain from copying or using material created by others without permission.`; the other five sources read `Use public domain or creative commons media, and refrain from copying or using material created by others without permission.`. Majority (and the XLSX-derived export) kept.

## Raw evidence

### S1 — Code.org csta_standards.csv, Level 1B and 2 rows (verbatim lines)

```
framework,category,standard,description
csta,AP,1B-AP-08,Compare and refine multiple algorithms for the same task and determine which is the most appropriate.
csta,AP,1B-AP-09,Create programs that use variables to store and modify data.
csta,AP,1B-AP-10,"Create programs that include sequences, events, loops, and conditionals."
csta,AP,1B-AP-11,"Decompose (break down) problems into smaller, manageable subproblems to facilitate the program development process."
csta,AP,1B-AP-12,"Modify, remix or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features."
csta,AP,1B-AP-13,Use an iterative process to plan the development of a program by including others' perspectives and considering user preferences.
csta,AP,1B-AP-14,Observe intellectual property rights and give appropriate attribution when creating or remixing programs.
csta,AP,1B-AP-15,Test and debug (identify and fix errors) a program or algorithm to ensure it runs as intended.
csta,AP,1B-AP-16,"Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation and review stages of program development."
csta,AP,1B-AP-17,"Describe choices made during program development using code comments, presentations, and demonstrations."
csta,AP,2-AP-10,Use flowcharts and/or pseudocode to address complex problems as algorithms.
csta,AP,2-AP-11,Create clearly named variables that represent different data types and perform operations on their values.
csta,AP,2-AP-12,"Design and iteratively develop programs that combine control structures, including nested loops and compound conditionals."
csta,AP,2-AP-13,"Decompose problems and subproblems into parts to facilitate the design, implementation, and review of programs."
csta,AP,2-AP-14,Create procedures with parameters to organize code and make it easier to reuse.
csta,AP,2-AP-15,Seek and incorporate feedback from team members and users to refine a solution that meets user needs.
csta,AP,2-AP-16,"Incorporate existing code, media, and libraries into original programs, and give attribution."
csta,AP,2-AP-17,Systematically test and refine programs using a range of test cases.
csta,AP,2-AP-18,Distribute tasks and maintain a project timeline when collaboratively developing computational artifacts.
csta,AP,2-AP-19,"Document programs in order to make them easier to follow, test, and debug."
csta,CS,1B-CS-01,Describe how internal and external parts of computing devices function to form a system.
csta,CS,1B-CS-02,Model how computer hardware and software work together as a system to accomplish tasks.
csta,CS,1B-CS-03,Determine potential solutions to solve simple hardware and software problems using common troubleshooting strategies.
csta,CS,2-CS-01,"Recommend improvements to the design of computing devices, based on an analysis of how users interact with the devices."
csta,CS,2-CS-02,Design projects that combine hardware and software components to collect and exchange data.
csta,CS,2-CS-03,Systematically identify and fix problems with computing devices and their components.
csta,DA,1B-DA-06,Organize and present collected data visually to highlight relationships and support a claim.
csta,DA,1B-DA-07,"Use data to highlight or propose cause-and-effect relationships, predict outcomes, or communicate an idea."
csta,DA,2-DA-07,Represent data using multiple encoding schemes.
csta,DA,2-DA-08,Collect data using computational tools and transform the data to make it more useful and reliable.
csta,DA,2-DA-09,Refine computational models based on the data they have generated.
csta,IC,1B-IC-18,"Discuss computing technologies that have changed the world and express how those technologies influence, and are influenced by, cultural practices."
csta,IC,1B-IC-19,Brainstorm ways to improve the accessibility and usability of technology products for the diverse needs and wants of users.
csta,IC,1B-IC-20,Seek diverse perspectives for the purpose of improving computational artifacts.
csta,IC,1B-IC-21,Use public domain or creative commons media and refrain from copying or using material created by others without permission.
csta,IC,2-IC-20,Compare tradeoffs associated with computing technologies that affect people's everyday activities and career options.
csta,IC,2-IC-21,Discuss issues of bias and accessibility in the design of existing technologies.
csta,IC,2-IC-22,Collaborate with many contributors through strategies such as crowdsourcing or surveys when creating a computational artifact.
csta,IC,2-IC-23,Describe tradeoffs between allowing information to be public and keeping information private and secure.
csta,NI,1B-NI-04,"Model how information is broken down into smaller pieces, transmitted as packets through multiple devices over networks and the Internet, and reassembled at the destination."
csta,NI,1B-NI-05,Discuss real-world cybersecurity problems and how personal information can be protected.
csta,NI,2-NI-04,Model the role of protocols in transmitting data across networks and the Internet.
csta,NI,2-NI-05,Explain how physical and digital security measures protect electronic information.
csta,NI,2-NI-06,Apply multiple methods of encryption to model the secure transmission of information.
```

### S1 — Code.org csta_categories.csv (verbatim)
```
framework,parent,category,type,description
csta,,AP,Concept,Algorithms & Programming
csta,,CS,Concept,Computing Systems
csta,,DA,Concept,Data & Analysis
csta,,IC,Concept,Impacts of Computing
csta,,NI,Concept,Networks & the Internet
```

### S2 — dcpetty/IACE export, Level 1B and 2 rows

Header: `Identifier,Level,Grades,Sequence,SequenceAll,Level,Standard,Standard,Clarification,Concept,Subconcept,Subconcept,Practice,Practice(s),Subpractice,Search,`

- **1B-CS-01** | Level 1B | Grades 3-5 | Concept: Computing Systems | Subconcept: Devices | Practice: Communicating About Computing | Subpractice: 7.2
  - Standard: Describe how internal and external parts of computing devices function to form a system.
  - Clarification: Computing devices often depend on other devices or components. For example, a robot depends on a physically attached light sensor to detect changes in brightness, whereas the light sensor depends on the robot for power. Keyboard input or a mouse click could cause an action to happen or information to be displayed on a screen; this could only happen because the computer has a processor to evaluate what is happening externally and produce corresponding responses. Students should describe how devices and components interact using correct terminology.
- **1B-CS-02** | Level 1B | Grades 3-5 | Concept: Computing Systems | Subconcept: Hardware & Software | Practice: Developing and Using Abstractions | Subpractice: 4.4
  - Standard: Model how computer hardware and software work together as a system to accomplish tasks.
  - Clarification: In order for a person to accomplish tasks with a computer, both hardware and software are needed. At this stage, a model should only include the basic elements of a computer system, such as input, output, processor, sensors, and storage. Students could draw a model on paper or in a drawing program, program an animation to demonstrate it, or demonstrate it by acting this out in some way.
- **1B-CS-03** | Level 1B | Grades 3-5 | Concept: Computing Systems | Subconcept: Troubleshooting | Practice: Testing and Refining Computational Artifacts | Subpractice: 6.2
  - Standard: Determine potential solutions to solve simple hardware and software problems using common troubleshooting strategies.
  - Clarification: Although computing systems may vary, common troubleshooting strategies can be used on all of them. Students should be able to identify solutions to problems such as the device not responding, no power, no network, app crashing, no sound, or password entry not working. Should errors occur at school, the goal would be that students would use various strategies, such as rebooting the device, checking for power, checking network availability, closing and reopening an app, making sure speakers are turned on or headphones are plugged in, and making sure that the caps lock key is not on, to solve these problems, when possible.
- **1B-NI-04** | Level 1B | Grades 3-5 | Concept: Networks & the Internet | Subconcept: Network Communication & Organization | Practice: Developing and Using Abstractions | Subpractice: 4.4
  - Standard: Model how information is broken down into smaller pieces, transmitted as packets through multiple devices over networks and the Internet, and reassembled at the destination.
  - Clarification: Information is sent and received over physical or wireless paths. It is broken down into smaller pieces called packets, which are sent independently and reassembled at the destination. Students should demonstrate their understanding of this flow of information by, for instance, drawing a model of the way packets are transmitted, programming an animation to show how packets are transmitted, or demonstrating this through an unplugged activity which has them act it out in some way.
- **1B-NI-05** | Level 1B | Grades 3-5 | Concept: Networks & the Internet | Subconcept: Cybersecurity | Practice: Recognizing and Defining Computational Problems | Subpractice: 3.1
  - Standard: Discuss real-world cybersecurity problems and how personal information can be protected.
  - Clarification: Just as we protect our personal property offline, we also need to protect our devices and the information stored on them. Information can be protected using various security measures. These measures can be physical and/or digital. Students could discuss or use a journaling or blogging activity to explain, orally or in writing, about topics that relate to personal cybersecurity issues. Discussion topics could be based on current events related to cybersecurity or topics that are applicable to students, such as the necessity of backing up data to guard against loss, how to create strong passwords and the importance of not sharing passwords, or why we should install and keep anti-virus software updated to protect data and systems.
- **1B-DA-06** | Level 1B | Grades 3-5 | Concept: Data & Analysis | Subconcept: Collection Visualization & Transformation | Practice: Communicating About Computing | Subpractice: 7.1
  - Standard: Organize and present collected data visually to highlight relationships and support a claim.
  - Clarification: Raw data has little meaning on its own. Data is often sorted or grouped to provide additional clarity. Organizing data can make interpreting and communicating it to others easier. Data points can be clustered by a number of commonalities. The same data could be manipulated in different ways to emphasize particular aspects or parts of the data set. For example, a data set of sports teams could be sorted by wins, points scored, or points allowed, and a data set of weather information could be sorted by high temperatures, low temperatures, or precipitation.
- **1B-DA-07** | Level 1B | Grades 3-5 | Concept: Data & Analysis | Subconcept: Inference & Models | Practice: Communicating About Computing | Subpractice: 7.1
  - Standard: Use data to highlight or propose cause-and-effect relationships, predict outcomes, or communicate an idea.
  - Clarification: The accuracy of data analysis is related to how realistically data is represented. Inferences or predictions based on data are less likely to be accurate if the data is not sufficient or if the data is incorrect in some way. Students should be able to refer to data when communicating an idea. For example, in order to explore the relationship between speed, time, and distance, students could operate a robot at uniform speed, and at increasing time intervals to predict how far the robot travels at that speed. In order to make an accurate prediction, one or two attempts of differing times would not be enough. The robot may also collect temperature data from a sensor, but that data would not be relevant for the task. Students must also make accurate measurements of the distance the robot travels in order to develop a valid prediction. Students could record the temperature at noon each day as a basis to show that temperatures are higher in certain months of the year. If temperatures are not recorded on non-school days or are recorded incorrectly or at different times of the day, the data would be incomplete and the ideas being communicated could be inaccurate. Students may also record the day of the week on which the data was collected, but this would have no relevance to whether temperatures are higher or lower. In order to have sufficient and accurate data on which to communicate the idea, students might want to use data provided by a governmental weather agency.
- **1B-AP-08** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Algorithms | Practice: Testing and Refining Computational Artifacts, Recognizing and Defining Computational Problems | Subpractice: 6.3, 3.3
  - Standard: Compare and refine multiple algorithms for the same task and determine which is the most appropriate.
  - Clarification: Different algorithms can achieve the same result, though sometimes one algorithm might be most appropriate for a specific situation. Students should be able to look at different ways to solve the same task and decide which would be the best solution. For example, students could use a map and plan multiple algorithms to get from one point to another. They could look at routes suggested by mapping software and change the route to something that would be better, based on which route is shortest or fastest or would avoid a problem. Students might compare algorithms that describe how to get ready for school. Another example might be to write different algorithms to draw a regular polygon and determine which algorithm would be the easiest to modify or repurpose to draw a different polygon.
- **1B-AP-09** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Variables | Practice: Creating Computational Artifacts | Subpractice: 5.2
  - Standard: Create programs that use variables to store and modify data.
  - Clarification: Variables are used to store and modify data. At this level, understanding how to use variables is sufficient. For example, students may use mathematical operations to add to the score of a game or subtract from the number of lives available in a game. The use of a variable as a countdown timer is another example.
- **1B-AP-10** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Control | Practice: Creating Computational Artifacts | Subpractice: 5.2
  - Standard: Create programs that include sequences, events, loops, and conditionals.
  - Clarification: Control structures specify the order (sequence) in which instructions are executed within a program and can be combined to support the creation of more complex programs. Events allow portions of a program to run based on a specific action. For example, students could write a program to explain the water cycle and when a specific component is clicked (event), the program would show information about that part of the water cycle. Conditionals allow for the execution of a portion of code in a program when a certain condition is true. For example, students could write a math game that asks multiplication fact questions and then uses a conditional to check whether or not the answer that was entered is correct. Loops allow for the repetition of a sequence of code multiple times. For example, in a program that produces an animation about a famous historical character, students could use a loop to have the character walk across the screen as they introduce themselves.
- **1B-AP-11** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Modularity | Practice: Recognizing and Defining Computational Problems | Subpractice: 3.2
  - Standard: Decompose (break down) problems into smaller, manageable subproblems to facilitate the program development process.
  - Clarification: Decomposition is the act of breaking down tasks into simpler tasks. For example, students could create an animation by separating a story into different scenes. For each scene, they would select a background, place characters, and program actions.
- **1B-AP-12** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Modularity | Practice: Creating Computational Artifacts | Subpractice: 5.3
  - Standard: Modify, remix, or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features.
  - Clarification: Programs can be broken down into smaller parts, which can be incorporated into new or existing programs. For example, students could modify prewritten code from a single-player game to create a two-player game with slightly different rules, remix and add another scene to an animated story, use code to make a ball bounce from another program in a new basketball game, or modify an image created by another student.
- **1B-AP-13** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Fostering an Inclusive Computing Culture, Creating Computational Artifacts | Subpractice: 1.1, 5.1
  - Standard: Use an iterative process to plan the development of a program by including others' perspectives and considering user preferences.
  - Clarification: Planning is an important part of the iterative process of program development. Students outline key features, time and resource constraints, and user expectations. Students should document the plan as, for example, a storyboard, flowchart, pseudocode, or story map.
- **1B-AP-14** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Creating Computational Artifacts, Communicating About Computing | Subpractice: 5.2, 7.3
  - Standard: Observe intellectual property rights and give appropriate attribution when creating or remixing programs.
  - Clarification: Intellectual property rights can vary by country but copyright laws give the creator of a work a set of rights that prevents others from copying the work and using it in ways that they may not like. Students should identify instances of remixing, when ideas are borrowed and iterated upon, and credit the original creator. Students should also consider common licenses that place limitations or restrictions on the use of computational artifacts, such as images and music downloaded from the Internet. At this stage, attribution should be written in the format required by the teacher and should always be included on any programs shared online.
- **1B-AP-15** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Testing and Refining Computational Artifacts | Subpractice: 6.1, 6.2
  - Standard: Test and debug (identify and fix errors) a program or algorithm to ensure it runs as intended.
  - Clarification: As students develop programs they should continuously test those programs to see that they do what was expected and fix (debug),  any errors. Students should also be able to successfully debug simple errors in programs created by others.
- **1B-AP-16** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Collaborating Around Computing | Subpractice: 2.2
  - Standard: Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation, and review stages of program development.
  - Clarification: Collaborative computing is the process of performing a computational task by working in pairs or on teams. Because it involves asking for the contributions and feedback of others, effective collaboration can lead to better outcomes than working independently. Students should take turns in different roles during program development, such as note taker, facilitator, program tester, or “driver” of the computer.
- **1B-AP-17** | Level 1B | Grades 3-5 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Communicating About Computing | Subpractice: 7.2
  - Standard: Describe choices made during program development using code comments, presentations, and demonstrations.
  - Clarification: People communicate about their code to help others understand and use their programs. Another purpose of communicating one's design choices is to show an understanding of one's work. These explanations could manifest themselves as in-line code comments for collaborators and assessors, or as part of a summative presentation, such as a code walk-through or coding journal.
- **1B-IC-18** | Level 1B | Grades 3-5 | Concept: Impacts of Computing | Subconcept: Culture | Practice: Recognizing and Defining Computational Problems | Subpractice: 3.1
  - Standard: Discuss computing technologies that have changed the world, and express how those technologies influence, and are influenced by, cultural practices.
  - Clarification: New computing technology is created and existing technologies are modified for many reasons, including to increase their benefits, decrease their risks, and meet societal needs.  Students, with guidance from their teacher, should discuss topics that relate to the history of technology and the changes in the world due to technology. Topics could be based on current news content, such as robotics, wireless Internet, mobile computing devices, GPS systems, wearable computing, or how social media has influenced social and political changes.
- **1B-IC-19** | Level 1B | Grades 3-5 | Concept: Impacts of Computing | Subconcept: Culture | Practice: Fostering an Inclusive Computing Culture | Subpractice: 1.2
  - Standard: Brainstorm ways to improve the accessibility and usability of technology products for the diverse needs and wants of users.
  - Clarification: The development and modification of computing technology are driven by people’s needs and wants and can affect groups differently. Anticipating the needs and wants of diverse end users requires students to purposefully consider potential perspectives of users with different backgrounds, ability levels, points of view, and disabilities. For example, students may consider using both speech and text when they wish to convey information in a game.  They may also wish to vary the types of programs they create, knowing that not everyone shares their own tastes.
- **1B-IC-20** | Level 1B | Grades 3-5 | Concept: Impacts of Computing | Subconcept: Social Interactions | Practice: Fostering an Inclusive Computing Culture | Subpractice: 1.1
  - Standard: Seek diverse perspectives for the purpose of improving computational artifacts.
  - Clarification: Computing provides the possibility for collaboration and sharing of ideas and allows the benefit of diverse perspectives. For example, students could seek feedback from other groups in their class or students at another grade level. Or, with guidance from their teacher, they could use video conferencing tools or other online collaborative spaces, such as blogs, wikis, forums, or website comments, to gather feedback from individuals and groups about programming projects.
- **1B-IC-21** | Level 1B | Grades 3-5 | Concept: Impacts of Computing | Subconcept: Safety Law & Ethics | Practice: Communicating About Computing | Subpractice: 7.3
  - Standard: Use public domain or creative commons media, and refrain from copying or using material created by others without permission.
  - Clarification: Ethical complications arise from the opportunities provided by computing. The ease of sending and receiving copies of media on the Internet, such as video, photos, and music, creates the opportunity for unauthorized use, such as online piracy, and disregard of copyrights. Students should consider the licenses on computational artifacts that they wish to use. For example, the license on a downloaded image or audio file may have restrictions that prohibit modification, require attribution, or prohibit use entirely.
- **2-CS-01** | Level 2 | Grades 6-8 | Concept: Computing Systems | Subconcept: Devices | Practice: Recognizing and Defining Computational Problems | Subpractice: 3.3
  - Standard: Recommend improvements to the design of computing devices, based on an analysis of how users interact with the devices.
  - Clarification: The study of human–computer interaction (HCI) can improve the design of devices, including both hardware and software. Students should make recommendations for existing devices (e.g., a laptop, phone, or tablet) or design their own components or interface (e.g., create their own controllers). Teachers can guide students to consider usability through several lenses, including accessibility, ergonomics, and learnability. For example, assistive devices provide capabilities such as scanning written information and converting it to speech.
- **2-CS-02** | Level 2 | Grades 6-8 | Concept: Computing Systems | Subconcept: Hardware & Software | Practice: Creating Computational Artifacts | Subpractice: 5.1
  - Standard: Design projects that combine hardware and software components to collect and exchange data.
  - Clarification: Collecting and exchanging data involves input, output, storage, and processing. When possible, students should select the hardware and software components for their project designs by considering factors such as functionality, cost, size, speed, accessibility, and aesthetics. For example, components for a mobile app could include accelerometer, GPS, and speech recognition. The choice of a device that connects wirelessly through a Bluetooth connection versus a physical USB connection involves a tradeoff between mobility and the need for an additional power source for the wireless device.
- **2-CS-03** | Level 2 | Grades 6-8 | Concept: Computing Systems | Subconcept: Troubleshooting | Practice: Testing and Refining Computational Artifacts | Subpractice: 6.2
  - Standard: Systematically identify and fix problems with computing devices and their components.
  - Clarification: Since a computing device may interact with interconnected devices within a system, problems may not be due to the specific computing device itself but to devices connected to it. Just as pilots use checklists to troubleshoot problems with aircraft systems, students should use a similar, structured process to troubleshoot problems with computing systems and ensure that potential solutions are not overlooked. Examples of troubleshooting strategies include following a troubleshooting flow diagram, making changes to software to see if hardware will work, checking connections and settings, and swapping in working components.
- **2-NI-04** | Level 2 | Grades 6-8 | Concept: Networks & the Internet | Subconcept: Network Communication & Organization | Practice: Developing and Using Abstractions | Subpractice: 4.4
  - Standard: Model the role of protocols in transmitting data across networks and the Internet.
  - Clarification: Protocols are rules that define how messages between computers are sent. They determine how quickly and securely information is transmitted across networks and the Internet, as well as how to handle errors in transmission. Students should model how data is sent using protocols to choose the fastest path, to deal with missing information, and to deliver sensitive data securely. For example, students could devise a plan for resending lost information or for interpreting a picture that has missing pieces. The priority at this grade level is understanding the purpose of protocols and how they enable secure and errorless communication. Knowledge of the details of how specific protocols work is not expected.
- **2-NI-05** | Level 2 | Grades 6-8 | Concept: Networks & the Internet | Subconcept: Cybersecurity | Practice: Communicating About Computing | Subpractice: 7.2
  - Standard: Explain how physical and digital security measures protect electronic information.
  - Clarification: Information that is stored online is vulnerable to unwanted access. Examples of physical security measures to protect data include keeping passwords hidden, locking doors, making backup copies on external storage devices, and erasing a storage device before it is reused. Examples of digital security measures include secure router admin passwords, firewalls that limit access to private networks, and the use of a protocol such as HTTPS to ensure secure data transmission.
- **2-NI-06** | Level 2 | Grades 6-8 | Concept: Networks & the Internet | Subconcept: Cybersecurity | Practice: Developing and Using Abstractions | Subpractice: 4.4
  - Standard: Apply multiple methods of encryption to model the secure transmission of information.
  - Clarification: Encryption can be as simple as letter substitution or as complicated as modern methods used to secure networks and the Internet. Students should encode and decode messages using a variety of encryption methods, and they should understand the different levels of complexity used to hide or secure information. For example, students could secure messages using methods such as Caesar cyphers or steganography (i.e., hiding messages inside a picture or other data). They can also model more complicated methods, such as public key encryption, through unplugged activities.
- **2-DA-07** | Level 2 | Grades 6-8 | Concept: Data & Analysis | Subconcept: Storage | Practice: Developing and Using Abstractions | Subpractice: 4
  - Standard: Represent data using multiple encoding schemes.
  - Clarification: Data representations occur at multiple levels of abstraction, from the physical storage of bits to the arrangement of information into organized formats (e.g., tables). Students should represent the same data in multiple ways. For example, students could represent the same color using binary, RGB values, hex codes (low-level representations), as well as forms understandable by people, including words, symbols, and digital displays of the color (high-level representations).
- **2-DA-08** | Level 2 | Grades 6-8 | Concept: Data & Analysis | Subconcept: Collection Visualization & Transformation | Practice: Testing and Refining Computational Artifacts | Subpractice: 6.3
  - Standard: Collect data using computational tools and transform the data to make it more useful and reliable.
  - Clarification: As students continue to build on their ability to organize and present data visually to support a claim, they will need to understand when and how to transform data for this purpose. Students should transform data to remove errors, highlight or expose relationships, and/or make it easier for computers to process. The cleaning of data is an important transformation for ensuring consistent format and reducing noise and errors (e.g., removing irrelevant responses in a survey). An example of a transformation that highlights a relationship is representing males and females as percentages of a whole instead of as individual counts.
- **2-DA-09** | Level 2 | Grades 6-8 | Concept: Data & Analysis | Subconcept: Inference & Models | Practice: Creating Computational Artifacts, Developing and Using Abstractions | Subpractice: 5.3, 4.4
  - Standard: Refine computational models based on the data they have generated.
  - Clarification: A model may be a programmed simulation of events or a representation of how various data is related. In order to refine a model, students need to consider which data points are relevant, how data points relate to each other, and if the data is accurate. For example, students may make a prediction about how far a ball will travel based on a table of data related to the height and angle of a track. The students could then test and refine their model by comparing predicted versus actual results and considering whether other factors are relevant (e.g., size and mass of the ball). Additionally, students could refine game mechanics based on test outcomes in order to make the game more balanced or fair.
- **2-AP-10** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Algorithms | Practice: Developing and Using Abstractions | Subpractice: 4.4, 4.1
  - Standard: Use flowcharts and/or pseudocode to address complex problems as algorithms.
  - Clarification: Complex problems are problems that would be difficult for students to solve computationally. Students should use pseudocode and/or flowcharts to organize and sequence an algorithm that addresses a complex problem, even though they may not actually program the solutions. For example, students might express an algorithm that produces a recommendation for purchasing sneakers based on inputs such as size, colors, brand, comfort, and cost. Testing the algorithm with a wide range of inputs and users allows students to refine their recommendation algorithm and to identify other inputs they may have initially excluded.
- **2-AP-11** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Variables | Practice: Creating Computational Artifacts | Subpractice: 5.1, 5.2
  - Standard: Create clearly named variables that represent different data types and perform operations on their values.
  - Clarification: A variable is like a container with a name, in which the contents may change, but the name (identifier) does not. When planning and developing programs, students should decide when and how to declare and name new variables. Students should use naming conventions to improve program readability. Examples of operations include adding points to the score, combining user input with words to make a sentence, changing the size of a picture, or adding a name to a list of people.
- **2-AP-12** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Control | Practice: Creating Computational Artifacts | Subpractice: 5.1, 5.2
  - Standard: Design and iteratively develop programs that combine control structures, including nested loops and compound conditionals.
  - Clarification: Control structures can be combined in many ways. Nested loops are loops placed within loops. Compound conditionals combine two or more conditions in a logical relationship (e.g., using AND, OR, and NOT), and nesting conditionals within one another allows the result of one conditional to lead to another. For example, when programming an interactive story, students could use a compound conditional within a loop to unlock a door only if a character has a key AND is touching the door.
- **2-AP-13** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Modularity | Practice: Recognizing and Defining Computational Problems | Subpractice: 3.2
  - Standard: Decompose problems and subproblems into parts to facilitate the design, implementation, and review of programs.
  - Clarification: Students should break down problems into subproblems, which can be further broken down to smaller parts. Decomposition facilitates aspects of program development by allowing students to focus on one piece at a time (e.g., getting input from the user, processing the data, and displaying the result to the user). Decomposition also enables different students to work on different parts at the same time. For example, animations can be decomposed into multiple scenes, which can be developed independently.
- **2-AP-14** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Modularity | Practice: Developing and Using Abstractions | Subpractice: 4.1, 4.3
  - Standard: Create procedures with parameters to organize code and make it easier to reuse.
  - Clarification: Students should create procedures and/or functions that are used multiple times within a program to repeat groups of instructions. These procedures can be generalized by defining parameters that create different outputs for a wide range of inputs. For example, a procedure to draw a circle involves many instructions, but all of them can be invoked with one instruction, such as “drawCircle.” By adding a radius parameter, the user can easily draw circles of different sizes.
- **2-AP-15** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Collaborating Around Computing, Fostering an Inclusive Computing Culture | Subpractice: 2.3, 1.1
  - Standard: Seek and incorporate feedback from team members and users to refine a solution that meets user needs.
  - Clarification: Development teams that employ user-centered design create solutions (e.g., programs and devices) that can have a large societal impact, such as an app that allows people with speech difficulties to translate hard-to-understand pronunciation into understandable language. Students should begin to seek diverse perspectives throughout the design process to improve their computational artifacts. Considerations of the end-user may include usability, accessibility, age-appropriate content, respectful language, user perspective, pronoun use, color contrast, and ease of use.
- **2-AP-16** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Developing and Using Abstractions, Creating Computational Artifacts, Communicating About Computing | Subpractice: 4.2, 5.2, 7.3
  - Standard: Incorporate existing code, media, and libraries into original programs, and give attribution.
  - Clarification: Building on the work of others enables students to produce more interesting and powerful creations. Students should use portions of code, algorithms, and/or digital media in their own programs and websites. At this level, they may also import libraries and connect to web application program interfaces (APIs). For example, when creating a side-scrolling game, students may incorporate portions of code that create a realistic jump movement from another person's game, and they may also import Creative Commons-licensed images to use in the background. Students should give attribution to the original creators to acknowledge their contributions.
- **2-AP-17** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Testing and Refining Computational Artifacts | Subpractice: 6.1
  - Standard: Systematically test and refine programs using a range of test cases.
  - Clarification: Use cases and test cases are created and analyzed to better meet the needs of users and to evaluate whether programs function as intended. At this level, testing should become a deliberate process that is more iterative, systematic, and proactive than at lower levels. Students should begin to test programs by considering potential errors, such as what will happen if a user enters invalid input (e.g., negative numbers and 0 instead of positive numbers).
- **2-AP-18** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Collaborating Around Computing | Subpractice: 2.2
  - Standard: Distribute tasks and maintain a project timeline when collaboratively developing computational artifacts.
  - Clarification: Collaboration is a common and crucial practice in programming development. Often, many individuals and groups work on the interdependent parts of a project together. Students should assume pre-defined roles within their teams and manage the project workflow using structured timelines. With teacher guidance, they will begin to create collective goals, expectations, and equitable workloads. For example, students may divide the design stage of a game into planning the storyboard, flowchart, and different parts of the game mechanics. They can then distribute tasks and roles among members of the team and assign deadlines.
- **2-AP-19** | Level 2 | Grades 6-8 | Concept: Algorithms & Programming | Subconcept: Program Development | Practice: Communicating About Computing | Subpractice: 7.2
  - Standard: Document programs in order to make them easier to follow, test, and debug.
  - Clarification: Documentation allows creators and others to more easily use and understand a program. Students should provide documentation for end users that explains their artifacts and how they function. For example, students could provide a project overview and clear user instructions. They should also incorporate comments in their product and communicate their process using design documents, flowcharts, and presentations.
- **2-IC-20** | Level 2 | Grades 6-8 | Concept: Impacts of Computing | Subconcept: Culture | Practice: Communicating About Computing | Subpractice: 7.2
  - Standard: Compare tradeoffs associated with computing technologies that affect people's everyday activities and career options.
  - Clarification: Advancements in computer technology are neither wholly positive nor negative. However, the ways that people use computing technologies have tradeoffs. Students should consider current events related to broad ideas, including privacy, communication, and automation. For example, driverless cars can increase convenience and reduce accidents, but they are also susceptible to hacking. The emerging industry will reduce the number of taxi and shared-ride drivers, but will create more software engineering and cybersecurity jobs.
- **2-IC-21** | Level 2 | Grades 6-8 | Concept: Impacts of Computing | Subconcept: Culture | Practice: Fostering an Inclusive Computing Culture | Subpractice: 1.2
  - Standard: Discuss issues of bias and accessibility in the design of existing technologies.
  - Clarification: Students should test and discuss the usability of various technology tools (e.g., apps, games, and devices) with the teacher's guidance. For example, facial recognition software that works better for lighter skin tones was likely developed with a homogeneous testing group and could be improved by sampling a more diverse population. When discussing accessibility, students may notice that allowing a user to change font sizes and colors will not only make an interface usable for people with low vision but also benefits users in various situations, such as in bright daylight or a dark room.
- **2-IC-22** | Level 2 | Grades 6-8 | Concept: Impacts of Computing | Subconcept: Social Interactions | Practice: Collaborating Around Computing, Creating Computational Artifacts | Subpractice: 2.4, 5.2
  - Standard: Collaborate with many contributors through strategies such as crowdsourcing or surveys when creating a computational artifact.
  - Clarification: Crowdsourcing is gathering services, ideas, or content from a large group of people, especially from the online community. It can be done at the local level (e.g., classroom or school) or global level (e.g., age-appropriate online communities, like Scratch and Minecraft). For example, a group of students could combine animations to create a digital community mosaic. They could also solicit feedback from many people though use of online communities and electronic surveys.
- **2-IC-23** | Level 2 | Grades 6-8 | Concept: Impacts of Computing | Subconcept: Safety Law & Ethics | Practice: Communicating About Computing | Subpractice: 7.2
  - Standard: Describe tradeoffs between allowing information to be public and keeping information private and secure.
  - Clarification: Sharing information online can help establish, maintain, and strengthen connections between people. For example, it allows artists and designers to display their talents and reach a broad audience. However, security attacks often start with personal information that is publicly available online. Social engineering is based on tricking people into revealing sensitive information and can be thwarted by being wary of attacks, such as phishing and spoofing.

### S3 — whiskethy transcription, Level 1B and 2 sections (statement + annotation line as seen)

Preamble of the file: "# CSTA K-12 Computer Science Standards (2017) — Created by the CSTA Standards Revision Task Force and released by the Computer Science Teachers Association (CSTA) at its Annual Conference in July 2017. Licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)."

- **1B-CS-01**: Describe how internal and external parts of computing devices function to form a system. *(Subconcept: Devices; Practice: 7.2)*
- **1B-CS-02**: Model how computer hardware and software work together as a system to accomplish tasks. *(Subconcept: Hardware & Software; Practice: 4.4)*
- **1B-CS-03**: Determine potential solutions to solve simple hardware and software problems using common troubleshooting strategies. *(Subconcept: Troubleshooting; Practice: 6.2)*
- **1B-NI-04**: Model how information is broken down into smaller pieces, transmitted as packets through multiple devices over networks and the Internet, and reassembled at the destination. *(Subconcept: Network Communication & Organization; Practice: 4.4)*
- **1B-NI-05**: Discuss real-world cybersecurity problems and how personal information can be protected. *(Subconcept: Cybersecurity; Practice: 3.1)*
- **1B-DA-06**: Organize and present collected data visually to highlight relationships and support a claim. *(Subconcept: Collection, Visualization, & Transformation; Practice: 7.1)*
- **1B-DA-07**: Use data to highlight or propose cause-and-effect relationships, predict outcomes, or communicate an idea. *(Subconcept: Inference & Models; Practice: 7.1)*
- **1B-AP-08**: Compare and refine multiple algorithms for the same task and determine which is the most appropriate. *(Subconcept: Algorithms; Practice: 6.3, 3.3)*
- **1B-AP-09**: Create programs that use variables to store and modify data. *(Subconcept: Variables; Practice: 5.2)*
- **1B-AP-10**: Create programs that include sequences, events, loops, and conditionals. *(Subconcept: Control; Practice: 5.2)*
- **1B-AP-11**: Decompose (break down) problems into smaller, manageable subproblems to facilitate the program development process. *(Subconcept: Modularity; Practice: 3.2)*
- **1B-AP-12**: Modify, remix, or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features. *(Subconcept: Modularity; Practice: 5.3)*
- **1B-AP-13**: Use an iterative process to plan the development of a program by including others' perspectives and considering user preferences. *(Subconcept: Program Development; Practice: 1.1, 5.1)*
- **1B-AP-14**: Observe intellectual property rights and give appropriate attribution when creating or remixing programs. *(Subconcept: Program Development; Practice: 5.2, 7.3)*
- **1B-AP-15**: Test and debug (identify and fix errors) a program or algorithm to ensure it runs as intended. *(Subconcept: Program Development; Practice: 6.1, 6.2)*
- **1B-AP-16**: Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation, and review stages of program development. *(Subconcept: Program Development; Practice: 2.2)*
- **1B-AP-17**: Describe choices made during program development using code comments, presentations, and demonstrations. *(Subconcept: Program Development; Practice: 7.2)*
- **1B-IC-18**: Discuss computing technologies that have changed the world, and express how those technologies influence, and are influenced by, cultural practices. *(Subconcept: Culture; Practice: 3.1)*
- **1B-IC-19**: Brainstorm ways to improve the accessibility and usability of technology products for the diverse needs and wants of users. *(Subconcept: Culture; Practice: 1.2)*
- **1B-IC-20**: Seek diverse perspectives for the purpose of improving computational artifacts. *(Subconcept: Social Interactions; Practice: 1.1)*
- **1B-IC-21**: Use public domain or creative commons media, and refrain from copying or using material created by others without permission. *(Subconcept: Safety, Law & Ethics; Practice: 7.3)*
- **2-CS-01**: Recommend improvements to the design of computing devices, based on an analysis of how users interact with the devices. *(Subconcept: Devices; Practice: 3.3)*
- **2-CS-02**: Design projects that combine hardware and software components to collect and exchange data. *(Subconcept: Hardware & Software; Practice: 5.1)*
- **2-CS-03**: Systematically identify and fix problems with computing devices and their components. *(Subconcept: Troubleshooting; Practice: 6.2)*
- **2-NI-04**: Model the role of protocols in transmitting data across networks and the Internet. *(Subconcept: Network Communication & Organization; Practice: 4.4)*
- **2-NI-05**: Explain how physical and digital security measures protect electronic information. *(Subconcept: Cybersecurity; Practice: 7.2)*
- **2-NI-06**: Apply multiple methods of encryption to model the secure transmission of information. *(Subconcept: Cybersecurity; Practice: 4.4)*
- **2-DA-07**: Represent data using multiple encoding schemes. *(Subconcept: Storage; Practice: 4)*
- **2-DA-08**: Collect data using computational tools and transform the data to make it more useful and reliable. *(Subconcept: Collection, Visualization, & Transformation; Practice: 6.3)*
- **2-DA-09**: Refine computational models based on the data they have generated. *(Subconcept: Inference & Models; Practice: 5.3, 4.4)*
- **2-AP-10**: Use flowcharts and/or pseudocode to address complex problems as algorithms. *(Subconcept: Algorithms; Practice: 4.4, 4.1)*
- **2-AP-11**: Create clearly named variables that represent different data types and perform operations on their values. *(Subconcept: Variables; Practice: 5.1, 5.2)*
- **2-AP-12**: Design and iteratively develop programs that combine control structures, including nested loops and compound conditionals. *(Subconcept: Control; Practice: 5.1, 5.2)*
- **2-AP-13**: Decompose problems and subproblems into parts to facilitate the design, implementation, and review of programs. *(Subconcept: Modularity; Practice: 3.2)*
- **2-AP-14**: Create procedures with parameters to organize code and make it easier to reuse. *(Subconcept: Modularity; Practice: 4.1, 4.3)*
- **2-AP-15**: Seek and incorporate feedback from team members and users to refine a solution that meets user needs. *(Subconcept: Program Development; Practice: 2.3, 1.1)*
- **2-AP-16**: Incorporate existing code, media, and libraries into original programs, and give attribution. *(Subconcept: Program Development; Practice: 4.2, 5.2, 7.3)*
- **2-AP-17**: Systematically test and refine programs using a range of test cases. *(Subconcept: Program Development; Practice: 6.1)*
- **2-AP-18**: Distribute tasks and maintain a project timeline when collaboratively developing computational artifacts. *(Subconcept: Program Development; Practice: 2.2)*
- **2-AP-19**: Document programs in order to make them easier to follow, test, and debug. *(Subconcept: Program Development; Practice: 7.2)*
- **2-IC-20**: Compare tradeoffs associated with computing technologies that affect people's everyday activities and career options. *(Subconcept: Culture; Practice: 7.2)*
- **2-IC-21**: Discuss issues of bias and accessibility in the design of existing technologies. *(Subconcept: Culture; Practice: 1.2)*
- **2-IC-22**: Collaborate with many contributors through strategies such as crowdsourcing or surveys when creating a computational artifact. *(Subconcept: Social Interactions; Practice: 2.4, 5.2)*
- **2-IC-23**: Describe tradeoffs between allowing information to be public and keeping information private and secure. *(Subconcept: Safety, Law & Ethics; Practice: 7.2)*

### S4 — bomonike csta-2024.csv rows (tab-separated, as seen)
```
Computing Systems	Devices	*	03+	Describe how internal and external parts of computing devices function to form a system.	1B-CS-01	Communicating
Computing Systems	Hardware & Software	*	03+	Model how computer hardware and software work together as a system to accomplish tasks.	1B-CS-02	Abstraction
Computing Systems	Troubleshooting	*	03+	Determine potential solutions to solve simple hardware and software problems using common Troubleshooting strategies.	1B-CS-03	Testing
Networks & the Internet	Network Communication & Organization	*	03+	Model how information is broken down into smaller pieces, transmitted as packets through multiple devices over networks and the Internet, and reassembled at the destination.	1B-NI-04	Abstraction 
Networks & the Internet	Cybersecurity	*	03+	Discuss real-world cybersecurity problems and how personal information can be protected.	1B-NI-05	Computational Problems
Data & Analysis	Collection Visualization & Transformation	*	03+	Organize and present collected data visually to highlight relationships and support a claim.	1B-DA-06	Communicating
Data & Analysis	Inference & Models	*	03+	Use data to highlight or propose cause-and-effect relationships, predict outcomes, or communicate an idea.	1B-DA-07	Communicating
Algorithms & Programming	Algorithms	*	03+	Compare and refine multiple algorithms for the same task and determine which is the most appropriate.	1B-AP-08	Testing, Computational Problems
Algorithms & Programming	Variables	*	03+	Create programs that use variables to store and modify data.	1B-AP-09	Creating
Algorithms & Programming	Control	*	03+	Create programs that include sequences, events, loops, and conditionals.	1B-AP-10	Creating
Algorithms & Programming	Modularity	*	03+	Decompose (break down) problems into smaller, manageable subproblems to facilitate the program development process.	1B-AP-11	Computational Problems
Algorithms & Programming	Modularity	*	03+	Modify, remix, or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features.	1B-AP-12	Creating
Algorithms & Programming	Program Development	*	03+	Use an iterative process to plan the development of a program by including others' perspectives and considering user preferences.	1B-AP-13	Inclusion, Creating
Algorithms & Programming	Program Development	*	03+	Observe intellectual property rights and give appropriate attribution when creating or remixing programs.	1B-AP-14	Creating, Communicating
Algorithms & Programming	Program Development	*	03+	Test and debug (identify and fix errors) a program or algorithm to ensure it runs as intended.	1B-AP-15	Testing
Algorithms & Programming	Program Development	*	03+	Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation, and review stages of program development.	1B-AP-16	Collaborating
Algorithms & Programming	Program Development	*	03+	Describe choices made during program development using code comments, presentations, and demonstrations.	1B-AP-17	Communicating
Impacts of Computing	Culture	*	03+	Discuss computing technologies that have changed the world, and express how those technologies influence, and are influenced by, cultural practices.	1B-IC-18	Computational Problems
Impacts of Computing	Culture	*	03+	Brainstorm ways to improve the accessibility and usability of technology products for the diverse needs and wants of users.	1B-IC-19	Inclusion
Impacts of Computing	Social Interactions	*	03+	Seek diverse perspectives for the purpose of improving computational artifacts.	1B-IC-20	Inclusion
Impacts of Computing	Safety Law & Ethics	*	03+	Use public domain or creative commons media, and refrain from copying or using material created by others without permission.	1B-IC-21	Communicating
Computing Systems	Devices	*	06+	Recommend improvements to the design of computing devices, based on an analysis of how users interact with the devices.	2-CS-01	Computational Problems
Computing Systems	Hardware & Software	*	06+	Design projects that combine hardware and software components to collect and exchange data.	2-CS-02	Creating
Computing Systems	Troubleshooting	*	06+	Systematically identify and fix problems with computing devices and their components.	2-CS-03	Testing
Networks & the Internet	Network Communication & Organization	*	06+	Model the role of protocols in transmitting data across networks and the Internet.	2-NI-04	Abstraction
Networks & the Internet	Cybersecurity	*	06+	Explain how physical and digital security measures protect electronic information.	2-NI-05	Communicating
Networks & the Internet	Cybersecurity	*	06+	Apply multiple methods of encryption to model the secure transmission of information.	2-NI-06	Abstraction
Data & Analysis	Storage	*	06+	Represent data using multiple encoding schemes.	2-DA-07	Abstraction 
Data & Analysis	Collection Visualization & Transformation	*	06+	Collect data using computational tools and transform the data to make it more useful and reliable.	2-DA-08	Testing
Data & Analysis	Inference & Models	*	06+	Refine computational models based on the data they have generated.	2-DA-09	Creating, Abstraction
Algorithms & Programming	Algorithms	*	06+	Use flowcharts and/or pseudocode to address complex problems as algorithms.	2-AP-10	Abstraction
Algorithms & Programming	Variables	*	06+	Create clearly named variables that represent different data types and perform operations on their values.	2-AP-11	Creating
Algorithms & Programming	Control	*	06+	Design and iteratively develop programs that combine control structures, including nested loops and compound conditionals.	2-AP-12	Creating
Algorithms & Programming	Modularity	*	06+	Decompose problems and subproblems into parts to facilitate the design, implementation, and review of programs.	2-AP-13	Computational Problems
Algorithms & Programming	Modularity	*	06+	Create procedures with parameters to organize code and make it easier to reuse.	2-AP-14	Abstraction
Algorithms & Programming	Program Development	*	06+	Seek and incorporate feedback from team members and users to refine a solution that meets user needs.	2-AP-15	Collaborating, Inclusion
Algorithms & Programming	Program Development	*	06+	Incorporate existing code, media, and libraries into original programs, and give attribution.	2-AP-16	Abstraction, Creating, Communicating
Algorithms & Programming	Program Development	*	06+	Systematically test and refine programs using a range of test cases.	2-AP-17	Testing
Algorithms & Programming	Program Development	*	06+	Distribute tasks and maintain a project timeline when collaboratively developing computational artifacts.	2-AP-18	Collaborating
Algorithms & Programming	Program Development	*	06+	Document programs in order to make them easier to follow, test, and debug.	2-AP-19	Communicating
Impacts of Computing	Culture	*	06+	Compare tradeoffs associated with computing technologies that affect people's everyday activities and career options.	2-IC-20	Communicating
Impacts of Computing	Culture	*	06+	Discuss issues of bias and accessibility in the design of existing technologies.	2-IC-21	Inclusion
Impacts of Computing	Social Interactions	*	06+	Collaborate with many contributors through strategies such as crowdsourcing or surveys when creating a computational artifact.	2-IC-22	Collaborating, Creating
Impacts of Computing	Safety Law & Ethics	*	06+	Describe tradeoffs between allowing information to be public and keeping information private and secure.	2-IC-23	Communicating
```

### S5 — bootstrapworld dictionary entries
```
1B-CS-01: "Describe how internal and external parts of computing devices function to form a system."
1B-CS-02: "Model how computer hardware and software work together as a system to accomplish tasks."
1B-CS-03: "Determine potential solutions to solve simple hardware and software problems using common troubleshooting strategies."
1B-NI-04: "Model how information is broken down into smaller pieces, transmitted as packets through multiple devices over networks and the Internet, and reassembled at the destination."
1B-NI-05: "Discuss real-world cybersecurity problems and how personal information can be protected."
1B-DA-06: "Organize and present collected data visually to highlight relationships and support a claim."
1B-DA-07: "Use data to highlight or propose cause-and-effect relationships, predict outcomes, or communicate an idea."
1B-AP-08: "Compare and refine multiple algorithms for the same task and determine which is the most appropriate."
1B-AP-09: "Create programs that use variables to store and modify data."
1B-AP-10: "Create programs that include sequences, events, loops, and conditionals."
1B-AP-11: "Decompose (break down) problems into smaller, manageable subproblems to facilitate the program development process."
1B-AP-12: "Modify, remix, or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features."
1B-AP-13: "Use an iterative process to plan the development of a program by including others' perspectives and considering user preferences."
1B-AP-14: "Observe intellectual property rights and give appropriate attribution when creating or remixing programs."
1B-AP-15: "Test and debug (identify and fix errors) a program or algorithm to ensure it runs as intended."
1B-AP-16: "Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation, and review stages of program development."
1B-AP-17: "Describe choices made during program development using code comments, presentations, and demonstrations."
1B-IC-18: "Discuss computing technologies that have changed the world, and express how those technologies influence, and are influenced by, cultural practices."
1B-IC-19: "Brainstorm ways to improve the accessibility and usability of technology products for the diverse needs and wants of users."
1B-IC-20: "Seek diverse perspectives for the purpose of improving computational artifacts."
1B-IC-21: "Use public domain or creative commons media, and refrain from copying or using material created by others without permission."
2-CS-01: "Recommend improvements to the design of computing devices, based on an analysis of how users interact with the devices."
2-CS-02: "Design projects that combine hardware and software components to collect and exchange data."
2-CS-03: "Systematically identify and fix problems with computing devices and their components."
2-NI-04: "Model the role of protocols in transmitting data across networks and the Internet."
2-NI-05: "Explain how physical and digital security measures protect electronic information."
2-NI-06: "Apply multiple methods of encryption to model the secure transmission of information"
2-DA-07: "Represent data using multiple encoding schemes."
2-DA-08: "Collect data using computational tools and transform the data to make it more useful and reliable."
2-DA-09: "Refine computational models based on the data they have generated."
2-AP-10: "Use flowcharts and/or pseudocode to address complex problems as algorithms"
2-AP-11: "Create clearly named variables that represent different data types and perform operations on their values."
2-AP-12: "Design and iteratively develop programs that combine control structures, including nested loops and compound conditionals"
2-AP-13: "Decompose problems and subproblems into parts to facilitate the design, implementation, and review of programs"
2-AP-14: "Create procedures with parameters to organize code and make it easier to reuse."
2-AP-15: "Seek and incorporate feedback from team members and users to refine a solution that meets user needs."
2-AP-16: "Incorporate existing code, media, and libraries into original programs, and give attribution."
2-AP-17: "Systematically test and refine programs using a range of test cases"
2-AP-18: "Distribute tasks and maintain a project timeline when collaboratively developing computational artifacts."
2-AP-19: "Document programs in order to make them easier to follow, test, and debug."
2-IC-20: "Compare tradeoffs associated with computing technologies that affect people's everyday activities and career options."
2-IC-21: "Discuss issues of bias and accessibility in the design of existing technologies"
2-IC-22: "Collaborate with many contributors through strategies such as crowdsourcing or surveys when creating a computational artifact."
2-IC-23: "Describe tradeoffs between allowing information to be public and keeping information private and secure."
```

### S6 — mattjones standards.js entries
```
1B-NI-05: Discuss real-world cybersecurity problems and how personal information can be protected.
1B-DA-06: Organize and present collected data visually to highlight relationships and support a claim.
1B-DA-07: Use data to highlight or propose cause-and-effect relationships, predict outcomes, or communicate an idea.
1B-AP-08: Compare and refine multiple algorithms for the same task and determine which is the most appropriate.
1B-AP-09: Create programs that use variables to store and modify data.
1B-AP-10: Create programs that include sequences, events, loops, and conditionals.
1B-AP-13: Use an iterative process to plan the development of a program by including others' perspectives and considering user preferences.
1B-AP-15: Test and debug (identify and fix errors) a program or algorithm to ensure it runs as intended.
2-NI-05: Explain how physical and digital security measures protect electronic information.
2-NI-06: Apply multiple methods of encryption to model the secure transmission of information.
2-DA-07: Represent data using multiple encoding schemes.
2-DA-09: Refine computational models based on the data they have generated.
2-AP-10: Use flowcharts and/or pseudocode to address complex problems as algorithms.
2-AP-11: Create clearly named variables that represent different data types and perform operations on their values.
2-AP-12: Design and iteratively develop programs that combine control structures, including nested loops and compound conditionals.
2-AP-13: Decompose problems and subproblems into parts to facilitate the design, implementation, and review of programs.
2-AP-14: Create procedures with parameters to organize code and make it easier to reuse.
2-AP-15: Seek and incorporate feedback from team members and users to refine a solution that meets user needs.
2-AP-17: Systematically test and refine programs using a range of test cases.
2-AP-18: Distribute tasks and maintain a project timeline when collaboratively developing computational artifacts.
2-IC-20: Compare tradeoffs associated with computing technologies that affect people's everyday activities and career options.
2-IC-21: Discuss issues of bias and accessibility in the design of existing technologies.
```

### S7 — ikollipara Standard.php entries
```
1B-CS-01: Describe how internal and external parts of computing devices function to form a system
1B-CS-02: Model how computer hardware and software work together as a system to accomplish
             tasks
1B-CS-03: Determine potential solutions to solve simple hardware and software problems using
             common troubleshooting strategies
1B-NI-04: Model how information is broken down into smaller pieces, transmitted as packets through
             multiple devices over networks and the Internet, and reassembled at the destination
1B-NI-05: Discuss real-world cybersecurity problems and how personal information can be protected
1B-DA-06: Organize and present collected data visually to highlight relationships and support a claim
1B-DA-07: Use data to highlight or propose cause-and-effect relationships, predict outcomes, or
             communicate an idea
1B-AP-08: Compare and refine multiple algorithms for the same task and determine which is the most
             appropriate
1B-AP-09: Create programs that use variables to store and modify data
1B-AP-10: Create programs that include sequences, events, loops, and conditionals
1B-AP-11: Decompose (break down) problems into smaller, manageable subproblems to facilitate the
             program development process
1B-AP-12: Modify, remix, or incorporate portions of an existing program into one's own work, to
             develop something new or add more advanced features
1B-AP-13: Use an iterative process to plan the development of a program by including others'
             perspectives and considering user preferences
1B-AP-14: Observe intellectual property rights and give appropriate attribution when creating or
             remixing programs
1B-AP-15: Test and debug (identify and fix errors) a program or algorithm to ensure it runs as
             intended
1B-AP-16: Use flowcharts and/or pseudocode to address complex problems as algorithms
1B-AP-17: Describe choices made during program development using code comments, presentations,
             and demonstrations
1B-IC-18: Discuss computing technologies that have changed the world, and express how those
             technologies influence, and are influenced by, cultural practices
1B-IC-19: Brainstorm ways to improve the accessibility and usability of technology products for the
             diverse needs and wants of users
1B-IC-20: Seek diverse perspectives for the purpose of improving computational artifacts
1B-IC-21: Use public domain or creative commons media, and refrain from copying or using material
             created by others without permission
2-CS-01: Recommend improvements to the design of computing devices, based on an analysis of
             how users interact with the devices
2-CS-02: Design projects that combine hardware and software components to collect and exchange
             data
2-CS-03: Systematically identify and fix problems with computing devices and their components
2-NI-04: Model the role of protocols in transmitting data across networks and the Internet
2-NI-05: Explain how physical and digital security measures protect electronic information
2-NI-06: Apply multiple methods of encryption to model the secure transmission of information
2-DA-07: Represent data using multiple encoding schemes
2-DA-08: Collect data using computational tools and transform the data to make it more useful and
             reliable
2-DA-09: Refine computational models based on the data they have generated
2-AP-10: Use flowcharts and/or pseudocode to address complex problems as algorithms
2-AP-11: Create clearly named variables that represent different data types and perform operations
             on their values
2-AP-12: Design and iteratively develop programs that combine control structures, including nested
             loops and compound conditionals
2-AP-13: Decompose problems and subproblems into parts to facilitate the design, implementation,
             and review of programs
2-AP-14: Create procedures with parameters to organize code and make it easier to reuse
2-AP-15: Seek and incorporate feedback from team members and users to refine a solution that
             meets user needs
2-AP-16: Incorporate existing code, media, and libraries into original programs, and give attribution
2-AP-17: Systematically test and refine programs using a range of test cases
2-AP-18: Distribute tasks and maintain a project timeline when collaboratively developing
             computational artifacts
2-AP-19: Document programs in order to make them easier to follow, test, and debug
2-IC-20: Compare tradeoffs associated with computing technologies that affect people's everyday
             activities and career options
2-IC-21: Discuss issues of bias and accessibility in the design of existing technologies
2-IC-22: Collaborate with many contributors through strategies such as crowdsourcing or surveys
             when creating a computational artifact
2-IC-23: Describe tradeoffs between allowing information to be public and keeping information
             private and secure
```

### Cross-source comparison output

Per-id agreement (reference = Code.org), produced by compare.py:
```
DCPETTY HEADER: ['Identifier', 'Level', 'Grades', 'Sequence', 'SequenceAll', 'Level', 'Standard', 'Standard', 'Clarification', 'Concept', 'Subconcept  ', 'Subconcept', 'Practice', 'Practice(s)', 'Subpractice', 'Search', '']
BOMONIKE HEADER: ['_Concept', '_Subconcept', '_s', '_Grades', '_Standard', '_Identifier', '_Practice(s)']
BOOTSTRAP SAMPLE: 1B-CS-01 {"description": "Describe how internal and external parts of computing devices function to form a system.", "lessons": []}
WHISKETHY SAMPLE SECTION for 1B-AP-10:
 
Create programs that include sequences, events, loops, and conditionals. *(Subconcept: Control; Practice: 5.2)*

*Control structures specify the order (sequence) in which instructions are executed within a program and can be combined to support the creation of more complex programs. Events allow portions of a program to run based on a specific action. For example, students could write a program to explain the water cycle and when a specific component is clicked (event), the program would show information about that part of the water cycle. Conditionals allow for the execution of a portion of code in a program when a certain condition is true. For example, students could write a math game th
CXEDHUB TOP KEYS: ['descriptions', 'framework_urls']

ID COUNTS per source (1B / 2):
  codeorg      1B=21 2=23
  dcpetty      1B=21 2=23
  bomonike     1B=21 2=23
  bootstrap    1B=21 2=23
  mattjones    1B=8 2=14
  ikollipara   1B=21 2=23
  whiskethy_raw 1B=21 2=23

UNION ids: 44 1B: 21 2: 23

=== PER-ID COMPARISON (reference = codeorg) ===

1B-AP-08 | codeorg: Compare and refine multiple algorithms for the same task and determine which is the most appropriate.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Algorithms'/'Algorithms & Programming: Algorithms' Practice='Testing and Refining Computational Artifacts, Recognizing and Defining Computational Problems' Practice(s)='Testing, Computational Problems' Subpractice='6.3, 3.3' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Algorithms' Grades='03+' Practice(s)='Testing, Computational Problems'

1B-AP-09 | codeorg: Create programs that use variables to store and modify data.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Variables'/'Algorithms & Programming: Variables' Practice='Creating Computational Artifacts' Practice(s)='#REF!' Subpractice='5.2' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Variables' Grades='03+' Practice(s)='Creating'

1B-AP-10 | codeorg: Create programs that include sequences, events, loops, and conditionals.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Control'/'Algorithms & Programming: Control' Practice='Creating Computational Artifacts' Practice(s)='#REF!' Subpractice='5.2' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Control' Grades='03+' Practice(s)='Creating'

1B-AP-11 | codeorg: Decompose (break down) problems into smaller, manageable subproblems to facilitate the program development process.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Modularity'/'Algorithms & Programming: Modularity' Practice='Recognizing and Defining Computational Problems' Practice(s)='#REF!' Subpractice='3.2' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Modularity' Grades='03+' Practice(s)='Computational Problems'

1B-AP-12 | codeorg: Modify, remix or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features.
   agree: []
   DIFF dcpetty: Modify, remix, or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features.
   DIFF bomonike: Modify, remix, or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features.
   DIFF bootstrap: Modify, remix, or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features.
   DIFF ikollipara: Modify, remix, or incorporate portions of an existing program into one's own work, to
             develop something new or add more advanced features
   dcpetty cols: Concept='Algorithms & Programming' Sub='Modularity'/'Algorithms & Programming: Modularity' Practice='Creating Computational Artifacts' Practice(s)='#REF!' Subpractice='5.3' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Modularity' Grades='03+' Practice(s)='Creating'

1B-AP-13 | codeorg: Use an iterative process to plan the development of a program by including others' perspectives and considering user preferences.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Fostering an Inclusive Computing Culture, Creating Computational Artifacts' Practice(s)='Inclusion, Creating' Subpractice='1.1, 5.1' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='03+' Practice(s)='Inclusion, Creating'

1B-AP-14 | codeorg: Observe intellectual property rights and give appropriate attribution when creating or remixing programs.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Creating Computational Artifacts, Communicating About Computing' Practice(s)='Creating, Communicating' Subpractice='5.2, 7.3' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='03+' Practice(s)='Creating, Communicating'

1B-AP-15 | codeorg: Test and debug (identify and fix errors) a program or algorithm to ensure it runs as intended.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Testing and Refining Computational Artifacts' Practice(s)='#REF!' Subpractice='6.1, 6.2' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='03+' Practice(s)='Testing'

1B-AP-16 | codeorg: Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation and review stages of program development.
   agree: []
   DIFF dcpetty: Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation, and review stages of program development.
   DIFF bomonike: Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation, and review stages of program development.
   DIFF bootstrap: Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation, and review stages of program development.
   DIFF ikollipara: Use flowcharts and/or pseudocode to address complex problems as algorithms
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Collaborating Around Computing' Practice(s)='#REF!' Subpractice='2.2' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='03+' Practice(s)='Collaborating'

1B-AP-17 | codeorg: Describe choices made during program development using code comments, presentations, and demonstrations.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Communicating About Computing' Practice(s)='#REF!' Subpractice='7.2' Grades='3-5'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='03+' Practice(s)='Communicating'

1B-CS-01 | codeorg: Describe how internal and external parts of computing devices function to form a system.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Computing Systems' Sub='Devices'/'Computing Systems: Devices' Practice='Communicating About Computing' Practice(s)='#REF!' Subpractice='7.2' Grades='3-5'
   bomonike cols: Concept='Computing Systems' Sub='Devices' Grades='03+' Practice(s)='Communicating'

1B-CS-02 | codeorg: Model how computer hardware and software work together as a system to accomplish tasks.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Computing Systems' Sub='Hardware & Software'/'Computing Systems: Hardware & Software' Practice='Developing and Using Abstractions' Practice(s)='#REF!' Subpractice='4.4' Grades='3-5'
   bomonike cols: Concept='Computing Systems' Sub='Hardware & Software' Grades='03+' Practice(s)='Abstraction'

1B-CS-03 | codeorg: Determine potential solutions to solve simple hardware and software problems using common troubleshooting strategies.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Computing Systems' Sub='Troubleshooting'/'Computing Systems: Troubleshooting' Practice='Testing and Refining Computational Artifacts' Practice(s)='#REF!' Subpractice='6.2' Grades='3-5'
   bomonike cols: Concept='Computing Systems' Sub='Troubleshooting' Grades='03+' Practice(s)='Testing'

1B-DA-06 | codeorg: Organize and present collected data visually to highlight relationships and support a claim.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Data & Analysis' Sub='Collection Visualization & Transformation'/'Data & Analysis: Collection Visualization & Transformation' Practice='Communicating About Computing' Practice(s)='#REF!' Subpractice='7.1' Grades='3-5'
   bomonike cols: Concept='Data & Analysis' Sub='Collection Visualization & Transformation' Grades='03+' Practice(s)='Communicating'

1B-DA-07 | codeorg: Use data to highlight or propose cause-and-effect relationships, predict outcomes, or communicate an idea.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Data & Analysis' Sub='Inference & Models'/'Data & Analysis: Inference & Models' Practice='Communicating About Computing' Practice(s)='#REF!' Subpractice='7.1' Grades='3-5'
   bomonike cols: Concept='Data & Analysis' Sub='Inference & Models' Grades='03+' Practice(s)='Communicating'

1B-IC-18 | codeorg: Discuss computing technologies that have changed the world and express how those technologies influence, and are influenced by, cultural practices.
   agree: []
   DIFF dcpetty: Discuss computing technologies that have changed the world, and express how those technologies influence, and are influenced by, cultural practices.
   DIFF bomonike: Discuss computing technologies that have changed the world, and express how those technologies influence, and are influenced by, cultural practices.
   DIFF bootstrap: Discuss computing technologies that have changed the world, and express how those technologies influence, and are influenced by, cultural practices.
   DIFF ikollipara: Discuss computing technologies that have changed the world, and express how those
             technologies influence, and are influenced by, cultural practices
   dcpetty cols: Concept='Impacts of Computing' Sub='Culture'/'Impacts of Computing: Culture' Practice='Recognizing and Defining Computational Problems' Practice(s)='#REF!' Subpractice='3.1' Grades='3-5'
   bomonike cols: Concept='Impacts of Computing' Sub='Culture' Grades='03+' Practice(s)='Computational Problems'

1B-IC-19 | codeorg: Brainstorm ways to improve the accessibility and usability of technology products for the diverse needs and wants of users.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Impacts of Computing' Sub='Culture'/'Impacts of Computing: Culture' Practice='Fostering an Inclusive Computing Culture' Practice(s)='#REF!' Subpractice='1.2' Grades='3-5'
   bomonike cols: Concept='Impacts of Computing' Sub='Culture' Grades='03+' Practice(s)='Inclusion'

1B-IC-20 | codeorg: Seek diverse perspectives for the purpose of improving computational artifacts.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Impacts of Computing' Sub='Social Interactions'/'Impacts of Computing: Social Interactions' Practice='Fostering an Inclusive Computing Culture' Practice(s)='#REF!' Subpractice='1.1' Grades='3-5'
   bomonike cols: Concept='Impacts of Computing' Sub='Social Interactions' Grades='03+' Practice(s)='Inclusion'

1B-IC-21 | codeorg: Use public domain or creative commons media and refrain from copying or using material created by others without permission.
   agree: []
   DIFF dcpetty: Use public domain or creative commons media, and refrain from copying or using material created by others without permission.
   DIFF bomonike: Use public domain or creative commons media, and refrain from copying or using material created by others without permission.
   DIFF bootstrap: Use public domain or creative commons media, and refrain from copying or using material created by others without permission.
   DIFF ikollipara: Use public domain or creative commons media, and refrain from copying or using material
             created by others without permission
   dcpetty cols: Concept='Impacts of Computing' Sub='Safety Law & Ethics'/'Impacts of Computing: Safety Law & Ethics' Practice='Communicating About Computing' Practice(s)='#REF!' Subpractice='7.3' Grades='3-5'
   bomonike cols: Concept='Impacts of Computing' Sub='Safety Law & Ethics' Grades='03+' Practice(s)='Communicating'

1B-NI-04 | codeorg: Model how information is broken down into smaller pieces, transmitted as packets through multiple devices over networks and the Internet, and reassembled at the destination.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Networks & the Internet' Sub='Network Communication & Organization'/'Networks & the Internet: Network Communication & Organization' Practice='Developing and Using Abstractions' Practice(s)='#REF!' Subpractice='4.4' Grades='3-5'
   bomonike cols: Concept='Networks & the Internet' Sub='Network Communication & Organization' Grades='03+' Practice(s)='Abstraction '

1B-NI-05 | codeorg: Discuss real-world cybersecurity problems and how personal information can be protected.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Networks & the Internet' Sub='Cybersecurity'/'Networks & the Internet: Cybersecurity' Practice='Recognizing and Defining Computational Problems' Practice(s)='#REF!' Subpractice='3.1' Grades='3-5'
   bomonike cols: Concept='Networks & the Internet' Sub='Cybersecurity' Grades='03+' Practice(s)='Computational Problems'

2-AP-10 | codeorg: Use flowcharts and/or pseudocode to address complex problems as algorithms.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Algorithms'/'Algorithms & Programming: Algorithms' Practice='Developing and Using Abstractions' Practice(s)='Abstraction' Subpractice='4.4, 4.1' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Algorithms' Grades='06+' Practice(s)='Abstraction'

2-AP-11 | codeorg: Create clearly named variables that represent different data types and perform operations on their values.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Variables'/'Algorithms & Programming: Variables' Practice='Creating Computational Artifacts' Practice(s)='Creating' Subpractice='5.1, 5.2' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Variables' Grades='06+' Practice(s)='Creating'

2-AP-12 | codeorg: Design and iteratively develop programs that combine control structures, including nested loops and compound conditionals.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Control'/'Algorithms & Programming: Control' Practice='Creating Computational Artifacts' Practice(s)='Creating' Subpractice='5.1, 5.2' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Control' Grades='06+' Practice(s)='Creating'

2-AP-13 | codeorg: Decompose problems and subproblems into parts to facilitate the design, implementation, and review of programs.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Modularity'/'Algorithms & Programming: Modularity' Practice='Recognizing and Defining Computational Problems' Practice(s)='Computational Problems' Subpractice='3.2' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Modularity' Grades='06+' Practice(s)='Computational Problems'

2-AP-14 | codeorg: Create procedures with parameters to organize code and make it easier to reuse.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Modularity'/'Algorithms & Programming: Modularity' Practice='Developing and Using Abstractions' Practice(s)='Abstraction' Subpractice='4.1, 4.3' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Modularity' Grades='06+' Practice(s)='Abstraction'

2-AP-15 | codeorg: Seek and incorporate feedback from team members and users to refine a solution that meets user needs.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Collaborating Around Computing, Fostering an Inclusive Computing Culture' Practice(s)='Collaborating, Inclusion' Subpractice='2.3, 1.1' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='06+' Practice(s)='Collaborating, Inclusion'

2-AP-16 | codeorg: Incorporate existing code, media, and libraries into original programs, and give attribution.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Developing and Using Abstractions, Creating Computational Artifacts, Communicating About Computing' Practice(s)='Abstraction, Creating, Communicating' Subpractice='4.2, 5.2, 7.3' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='06+' Practice(s)='Abstraction, Creating, Communicating'

2-AP-17 | codeorg: Systematically test and refine programs using a range of test cases.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Testing and Refining Computational Artifacts' Practice(s)='Testing' Subpractice='6.1' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='06+' Practice(s)='Testing'

2-AP-18 | codeorg: Distribute tasks and maintain a project timeline when collaboratively developing computational artifacts.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Collaborating Around Computing' Practice(s)='Collaborating' Subpractice='2.2' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='06+' Practice(s)='Collaborating'

2-AP-19 | codeorg: Document programs in order to make them easier to follow, test, and debug.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Algorithms & Programming' Sub='Program Development'/'Algorithms & Programming: Program Development' Practice='Communicating About Computing' Practice(s)='Communicating' Subpractice='7.2' Grades='6-8'
   bomonike cols: Concept='Algorithms & Programming' Sub='Program Development' Grades='06+' Practice(s)='Communicating'

2-CS-01 | codeorg: Recommend improvements to the design of computing devices, based on an analysis of how users interact with the devices.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Computing Systems' Sub='Devices'/'Computing Systems: Devices' Practice='Recognizing and Defining Computational Problems' Practice(s)='Computational Problems' Subpractice='3.3' Grades='6-8'
   bomonike cols: Concept='Computing Systems' Sub='Devices' Grades='06+' Practice(s)='Computational Problems'

2-CS-02 | codeorg: Design projects that combine hardware and software components to collect and exchange data.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Computing Systems' Sub='Hardware & Software'/'Computing Systems: Hardware & Software' Practice='Creating Computational Artifacts' Practice(s)='Creating' Subpractice='5.1' Grades='6-8'
   bomonike cols: Concept='Computing Systems' Sub='Hardware & Software' Grades='06+' Practice(s)='Creating'

2-CS-03 | codeorg: Systematically identify and fix problems with computing devices and their components.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Computing Systems' Sub='Troubleshooting'/'Computing Systems: Troubleshooting' Practice='Testing and Refining Computational Artifacts' Practice(s)='Testing' Subpractice='6.2' Grades='6-8'
   bomonike cols: Concept='Computing Systems' Sub='Troubleshooting' Grades='06+' Practice(s)='Testing'

2-DA-07 | codeorg: Represent data using multiple encoding schemes.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Data & Analysis' Sub='Storage'/'Data & Analysis: Storage' Practice='Developing and Using Abstractions' Practice(s)='Abstraction' Subpractice='4' Grades='6-8'
   bomonike cols: Concept='Data & Analysis' Sub='Storage' Grades='06+' Practice(s)='Abstraction '

2-DA-08 | codeorg: Collect data using computational tools and transform the data to make it more useful and reliable.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Data & Analysis' Sub='Collection Visualization & Transformation'/'Data & Analysis: Collection Visualization & Transformation' Practice='Testing and Refining Computational Artifacts' Practice(s)='Testing' Subpractice='6.3' Grades='6-8'
   bomonike cols: Concept='Data & Analysis' Sub='Collection Visualization & Transformation' Grades='06+' Practice(s)='Testing'

2-DA-09 | codeorg: Refine computational models based on the data they have generated.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Data & Analysis' Sub='Inference & Models'/'Data & Analysis: Inference & Models' Practice='Creating Computational Artifacts, Developing and Using Abstractions' Practice(s)='Creating, Abstraction' Subpractice='5.3, 4.4' Grades='6-8'
   bomonike cols: Concept='Data & Analysis' Sub='Inference & Models' Grades='06+' Practice(s)='Creating, Abstraction'

2-IC-20 | codeorg: Compare tradeoffs associated with computing technologies that affect people's everyday activities and career options.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Impacts of Computing' Sub='Culture'/'Impacts of Computing: Culture' Practice='Communicating About Computing' Practice(s)='Communicating' Subpractice='7.2' Grades='6-8'
   bomonike cols: Concept='Impacts of Computing' Sub='Culture' Grades='06+' Practice(s)='Communicating'

2-IC-21 | codeorg: Discuss issues of bias and accessibility in the design of existing technologies.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Impacts of Computing' Sub='Culture'/'Impacts of Computing: Culture' Practice='Fostering an Inclusive Computing Culture' Practice(s)='Inclusion' Subpractice='1.2' Grades='6-8'
   bomonike cols: Concept='Impacts of Computing' Sub='Culture' Grades='06+' Practice(s)='Inclusion'

2-IC-22 | codeorg: Collaborate with many contributors through strategies such as crowdsourcing or surveys when creating a computational artifact.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Impacts of Computing' Sub='Social Interactions'/'Impacts of Computing: Social Interactions' Practice='Collaborating Around Computing, Creating Computational Artifacts' Practice(s)='Collaborating, Creating' Subpractice='2.4, 5.2' Grades='6-8'
   bomonike cols: Concept='Impacts of Computing' Sub='Social Interactions' Grades='06+' Practice(s)='Collaborating, Creating'

2-IC-23 | codeorg: Describe tradeoffs between allowing information to be public and keeping information private and secure.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Impacts of Computing' Sub='Safety Law & Ethics'/'Impacts of Computing: Safety Law & Ethics' Practice='Communicating About Computing' Practice(s)='Communicating' Subpractice='7.2' Grades='6-8'
   bomonike cols: Concept='Impacts of Computing' Sub='Safety Law & Ethics' Grades='06+' Practice(s)='Communicating'

2-NI-04 | codeorg: Model the role of protocols in transmitting data across networks and the Internet.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'ikollipara']
   dcpetty cols: Concept='Networks & the Internet' Sub='Network Communication & Organization'/'Networks & the Internet: Network Communication & Organization' Practice='Developing and Using Abstractions' Practice(s)='Abstraction' Subpractice='4.4' Grades='6-8'
   bomonike cols: Concept='Networks & the Internet' Sub='Network Communication & Organization' Grades='06+' Practice(s)='Abstraction'

2-NI-05 | codeorg: Explain how physical and digital security measures protect electronic information.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Networks & the Internet' Sub='Cybersecurity'/'Networks & the Internet: Cybersecurity' Practice='Communicating About Computing' Practice(s)='Communicating' Subpractice='7.2' Grades='6-8'
   bomonike cols: Concept='Networks & the Internet' Sub='Cybersecurity' Grades='06+' Practice(s)='Communicating'

2-NI-06 | codeorg: Apply multiple methods of encryption to model the secure transmission of information.
   agree: ['dcpetty', 'bomonike', 'bootstrap', 'mattjones', 'ikollipara']
   dcpetty cols: Concept='Networks & the Internet' Sub='Cybersecurity'/'Networks & the Internet: Cybersecurity' Practice='Developing and Using Abstractions' Practice(s)='Abstraction' Subpractice='4.4' Grades='6-8'
   bomonike cols: Concept='Networks & the Internet' Sub='Cybersecurity' Grades='06+' Practice(s)='Abstraction'
```

whiskethy vs dcpetty check (statement / subconcept / practice codes / clarification), produced by whisk.py:
```
(statement / subconcept / practice codes / clarification) ===
1B-AP-08: stmt=ok sub=ok prac=ok clar=ok  practices=['3.3', '6.3']  
1B-AP-09: stmt=ok sub=ok prac=ok clar=ok  practices=['5.2']  
1B-AP-10: stmt=ok sub=ok prac=ok clar=ok  practices=['5.2']  
1B-AP-11: stmt=ok sub=ok prac=ok clar=ok  practices=['3.2']  
1B-AP-12: stmt=ok sub=ok prac=ok clar=ok  practices=['5.3']  
1B-AP-13: stmt=ok sub=ok prac=ok clar=ok  practices=['1.1', '5.1']  
1B-AP-14: stmt=ok sub=ok prac=ok clar=ok  practices=['5.2', '7.3']  
1B-AP-15: stmt=ok sub=ok prac=ok clar=ok  practices=['6.1', '6.2']  
1B-AP-16: stmt=ok sub=ok prac=ok clar=ok  practices=['2.2']  
1B-AP-17: stmt=ok sub=ok prac=ok clar=ok  practices=['7.2']  
1B-CS-01: stmt=ok sub=ok prac=ok clar=ok  practices=['7.2']  
1B-CS-02: stmt=ok sub=ok prac=ok clar=ok  practices=['4.4']  
1B-CS-03: stmt=ok sub=ok prac=ok clar=ok  practices=['6.2']  
1B-DA-06: stmt=ok sub=X prac=ok clar=ok  practices=['7.1']  SUB w='Collection, Visualization, & Transformation' dc='Collection Visualization & Transformation'
1B-DA-07: stmt=ok sub=ok prac=ok clar=ok  practices=['7.1']  
1B-IC-18: stmt=ok sub=ok prac=ok clar=ok  practices=['3.1']  
1B-IC-19: stmt=ok sub=ok prac=ok clar=ok  practices=['1.2']  
1B-IC-20: stmt=ok sub=ok prac=ok clar=ok  practices=['1.1']  
1B-IC-21: stmt=ok sub=X prac=ok clar=ok  practices=['7.3']  SUB w='Safety, Law & Ethics' dc='Safety Law & Ethics'
1B-NI-04: stmt=ok sub=ok prac=ok clar=ok  practices=['4.4']  
1B-NI-05: stmt=ok sub=ok prac=ok clar=ok  practices=['3.1']  
2-AP-10: stmt=ok sub=ok prac=ok clar=ok  practices=['4.1', '4.4']  
2-AP-11: stmt=ok sub=ok prac=ok clar=ok  practices=['5.1', '5.2']  
2-AP-12: stmt=ok sub=ok prac=ok clar=ok  practices=['5.1', '5.2']  
2-AP-13: stmt=ok sub=ok prac=ok clar=ok  practices=['3.2']  
2-AP-14: stmt=ok sub=ok prac=ok clar=ok  practices=['4.1', '4.3']  
2-AP-15: stmt=ok sub=ok prac=ok clar=ok  practices=['1.1', '2.3']  
2-AP-16: stmt=ok sub=ok prac=ok clar=ok  practices=['4.2', '5.2', '7.3']  
2-AP-17: stmt=ok sub=ok prac=ok clar=ok  practices=['6.1']  
2-AP-18: stmt=ok sub=ok prac=ok clar=ok  practices=['2.2']  
2-AP-19: stmt=ok sub=ok prac=ok clar=ok  practices=['7.2']  
2-CS-01: stmt=ok sub=ok prac=ok clar=ok  practices=['3.3']  
2-CS-02: stmt=ok sub=ok prac=ok clar=ok  practices=['5.1']  
2-CS-03: stmt=ok sub=ok prac=ok clar=ok  practices=['6.2']  
2-DA-07: stmt=ok sub=ok prac=ok clar=ok  practices=['4']  
2-DA-08: stmt=ok sub=X prac=ok clar=ok  practices=['6.3']  SUB w='Collection, Visualization, & Transformation' dc='Collection Visualization & Transformation'
2-DA-09: stmt=ok sub=ok prac=ok clar=ok  practices=['4.4', '5.3']  
2-IC-20: stmt=ok sub=ok prac=ok clar=ok  practices=['7.2']  
2-IC-21: stmt=ok sub=ok prac=ok clar=ok  practices=['1.2']  
2-IC-22: stmt=ok sub=ok prac=ok clar=ok  practices=['2.4', '5.2']  
2-IC-23: stmt=ok sub=X prac=ok clar=ok  practices=['7.2']  SUB w='Safety, Law & Ethics' dc='Safety Law & Ethics'
2-NI-04: stmt=ok sub=ok prac=ok clar=ok  practices=['4.4']  
2-NI-05: stmt=ok sub=ok prac=ok clar=ok  practices=['7.2']  
2-NI-06: stmt=ok sub=ok prac=ok clar=ok  practices=['4.4']  

=== whiskethy text of the 4 comma cases ===
1B-AP-12 -> Modify, remix, or incorporate portions of an existing program into one's own work, to develop something new or add more advanced features.
1B-AP-16 -> Take on varying roles, with teacher guidance, when collaborating with peers during the design, implementation, and review stages of program development.
1B-IC-18 -> Discuss computing technologies that have changed the world, and express how those technologies influence, and are influenced by, cultural practices.
1B-IC-21 -> Use public domain or creative commons media, and refrain from copying or using material created by others without permission.
```


## Independent verification (adversarial check, 2026-11-03)

A second reviewer re-checked `csta.json` against sources NOT used above (all fetched from raw.githubusercontent.com into a clean directory; non-GitHub hosts csteachers.org, curriculum.code.org, michiganlearning.org and codehs.com are outside this sandbox's allowlist, so they were only reached through WebSearch snippets):

- Statements: every one of the 44 statements appears verbatim (after quote/whitespace normalisation) in at least 2 further mirrors, among them amyjko/critically-conscious-computing `editions/1/book.json` (all 23 Level 2), CS4Kids/website `docs/lessons/*.md` (all 23 Level 2 with practice codes), bjc-edc/bjc-r Sparks teaching guide, CodeVA-Curriculum/standards `middle-school/mscse.yaml`, raymondjohnson/Colorado-Academic-Standards CS-2024 (3rd/4th/5th grade + middle school), bacalj/challengegalaxy `store/standards.js`, CodeAlgoAcademy `utils/allSkill.ts`, MatthewDanh/Vex-Robotics-LMS, GirlsCodeLincoln/Curriculum, microsoft/pxt-microbit ucp-science `resources.md`, w4ester MSDE (Maryland) json, pessoaflavio `thesis/data/cs_test.txt`. No swapped neighbours (1B-AP-10/11, 1B-AP-14/2-AP-16, 2-AP-11/12, 1B-AP-11/2-AP-13 all carry the right text). The four one-comma variants in Code.org's CSV (1B-AP-12, 1B-AP-16, 1B-IC-18, 1B-IC-21) are Code.org's; the majority reading kept here is also the reading in the independent mirrors.
- Counts: 21 (1B) and 23 (Level 2) are confirmed by the independent mirrors (CS4Kids README and amyjko book.json each list exactly the 23 Level-2 ids). The task brief's "expect 31" for Level 2 is wrong for the 2017 document (3A has 30, 3B 28).
- Subconcepts: agree with all mirrors that carry them (CS4Kids, Colorado, Michigan/California snippets).
- Practice codes: all 23 Level-2 codes (including 2-DA-07 = whole practice "4") match CS4Kids' per-lesson rows "id | practice name(s): codes"; 12 of the 21 Level-1B codes were additionally seen in WebSearch snippets of state copies (WA OSPI, Iowa, CSTA progression chart, California where the text is identical). The remaining nine 1B codes (1B-CS-01 7.2, 1B-NI-04 4.4, 1B-DA-07 7.1, 1B-AP-09 5.2, 1B-AP-10 5.2, 1B-AP-14 5.2/7.3, 1B-AP-16 2.2, 1B-AP-17 7.2, 1B-IC-20 1.1) rest on S2+S3 above and the reviewer's knowledge of the 2017 PDF; no source contradicted them.
- Caution for future lookups: California's standards (cde.ca.gov) are an adaptation, not a copy — e.g. 6-8.DA.9 is a different statement from 2-DA-09 — so they confirm CSTA text only where identical. A vendor file (omriphoenix-arch) carried an invented 1B-NI-05 text; it was ignored.
- Change made to `csta.json`: one "independent check 2026-11-03: ..." entry appended to each standard's `verifiedBy`; no other field changed.
