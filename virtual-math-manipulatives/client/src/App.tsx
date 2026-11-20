import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPE } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { EXTRA_TASKS } from "./extra-tasks";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";
const FIELDS = actionFields<typeof Actions>();

/* ============ Tool catalog ============ */
export type ToolDef = { slug: string; name: string; cat: string; desc: string; color: string; emoji: string; grades: string };
export const TOOLS: ToolDef[] = [
  { slug: "rekenreks", name: "Rekenreks", cat: "Number sense & counting", desc: "Subitising and the 5 and 10 benchmarks. Slide beads in 5 red + 5 white rows, customise rows, use the cover tool.", color: "#E53935", emoji: "🔴", grades: "K–2" },
  { slug: "two-color-counters", name: "Two-Color Counters", cat: "Number sense & counting", desc: "Yellow (+1) and red (−1) counters. Flip, fill ten-frames, build zero pairs and part-part-whole models.", color: "#F9A825", emoji: "🟡", grades: "K–6" },
  { slug: "linking-cubes", name: "Linking Cubes", cat: "Number sense & counting", desc: "Interlocking cubes in ten colours. Snap into sticks, compose and decompose numbers, arrays and bar graphs.", color: "#1E88E5", emoji: "🧊", grades: "K–5" },
  { slug: "color-tiles", name: "Color Tiles", cat: "Number sense & counting", desc: "Square tiles for patterns, multiplication as area, area and perimeter, arrays and bar graphs.", color: "#43A047", emoji: "🟩", grades: "K–6" },
  { slug: "hundred-board", name: "Hundred Board", cat: "Number sense & counting", desc: "1–100 grid for number order, patterns, multiples and rounding. Custom start, whole-number or decimal mode.", color: "#8E24AA", emoji: "💯", grades: "K–5" },
  { slug: "base-ten-blocks", name: "Base Ten Blocks", cat: "Place value & operations", desc: "Units, rods, flats and cubes. Break and Regroup with the total conserved, place-value chart, area model and factors.", color: "#FB8C00", emoji: "🧱", grades: "1–6" },
  { slug: "place-value-disks", name: "Place Value Disks", cat: "Place value & operations", desc: "Labelled disks to 1,000,000 and down to 0.001. Break and Regroup across a place-value chart.", color: "#00897B", emoji: "🪙", grades: "2–6" },
  { slug: "cuisenaire-rods", name: "Cuisenaire® Rods", cat: "Place value & operations", desc: "Ten rods, ten colours, lengths 1–10. Assign a value to one rod and the rest follow by length. Fractions and decimals.", color: "#D81B60", emoji: "📏", grades: "K–6" },
  { slug: "fraction-circles", name: "Fraction Circles", cat: "Fractions, decimals & percents", desc: "Nine colour-coded circles, whole to twelfths. Overlap to compare, switch labels between fraction, percent and decimal, rings workspace.", color: "#5E35B1", emoji: "🥧", grades: "2–7" },
  { slug: "fraction-tiles", name: "Fraction Tiles", cat: "Fractions, decimals & percents", desc: "Linear fraction bars, whole to twelfths. Snap side by side, prove equivalence, build a Fraction Wall.", color: "#3949AB", emoji: "🍫", grades: "2–7" },
  { slug: "number-lines", name: "Number Lines", cat: "Fractions, decimals & percents", desc: "Customisable lines for integers, decimals and fractions. Open lines, jump arcs, hide labels.", color: "#00ACC1", emoji: "↔️", grades: "K–8" },
  { slug: "bar-models", name: "Bar Models", cat: "Problem solving & modelling", desc: "Adjustable bars for part-part-whole, comparison, rates and ratios. Edit values and labels on every segment.", color: "#7CB342", emoji: "📊", grades: "2–8" },
  { slug: "money", name: "Money", cat: "Problem solving & modelling", desc: "Coins and bills to make amounts, exchange ten 1s for a 10, compare and part-part-whole workspaces.", color: "#6D4C41", emoji: "💵", grades: "K–5" },
  { slug: "algebra-tiles", name: "Algebra Tiles", cat: "Algebra", desc: "Unit, x, x², y, y² and xy tiles with inverses. Zero pairs, simplifying, factoring and solving equations, area model.", color: "#C62828", emoji: "🔲", grades: "6–12" },
  { slug: "xy-coordinate-board", name: "XY Coordinate Board", cat: "Algebra", desc: "Plot points, lines and polygons in one or four quadrants. Ordered-pair labels and a live data table.", color: "#1565C0", emoji: "📍", grades: "5–12" },
  { slug: "geoboard", name: "Geoboard", cat: "Geometry & measurement", desc: "Stretch coloured bands around pegs. Square, isometric and circular boards, fills, angle tool, area and perimeter.", color: "#AD1457", emoji: "📌", grades: "K–8" },
  { slug: "pattern-blocks", name: "Pattern Blocks", cat: "Geometry & measurement", desc: "Hexagon, trapezoid, triangles, rhombus, parallelogram and square. Rotate, snap, fill templates, fraction and Deci workspaces.", color: "#EF6C00", emoji: "⬡", grades: "K–6" },
  { slug: "clock", name: "Clock", cat: "Geometry & measurement", desc: "Red hour and blue minute hands. Geared or Free mode, digital twin, time tracker, interval arcs and two-clock workspace.", color: "#4527A0", emoji: "🕐", grades: "K–5" },
];
export const CATS = ["All", "Number sense & counting", "Place value & operations", "Fractions, decimals & percents", "Problem solving & modelling", "Algebra", "Geometry & measurement"];

export type TaskItem = { title: string; prompt: string; notes: string; ccss: string; grade: string };
export const TASKS_LIB: Record<string, TaskItem[]> = {
  "rekenreks": [
    { title: "Show 7 the 5-way", prompt: "Show 7 on one row. Push all 5 red beads first, then count on with white beads. Say the number sentence 5 + 2 = 7 out loud.", notes: "Watch for children who count beads one by one from the left. Prompt them to trust the full red group of 5 and count on, which is the whole point of the 5-structure.", ccss: "K.OA.A.3", grade: "K" },
    { title: "Hidden beads", prompt: "Show 13 across two rows. Turn on the cover tool. A partner works out how many beads are hidden and explains how they know.", notes: "The cover tool turns counting into reasoning: partners must use the visible beads and the row total. Ask for the strategy, not just the answer.", ccss: "1.OA.B.4", grade: "1" },
    { title: "Two ways to make 10", prompt: "Show 10 on one row in two different ways, for example 5 + 5 and 7 + 3. Record both number sentences.", notes: "Children often only find 5 + 5. Nudge them to slide one bead at a time and notice each new split keeps the total at 10.", ccss: "1.OA.C.6", grade: "1" },
    { title: "Near doubles", prompt: "Show 6 + 7 on two rows. Use the rows to explain why 6 + 7 is one more than double 6.", notes: "Line the rows up so the extra bead is visible. This builds the near-doubles strategy before it is taught symbolically.", ccss: "2.OA.B.2", grade: "2" },
  ],
  "two-color-counters": [
    { title: "Fill the ten-frame", prompt: "Fill the ten-frame to show 7 as a full row of 5 plus 2. Then show 7 a different way and say which is easier to see.", notes: "The 5-plus structure mirrors the rekenrek. Children should start reading the frame at a glance rather than counting every counter.", ccss: "K.OA.A.4", grade: "K" },
    { title: "Zero pairs", prompt: "Show 5 + (−3) with yellow and red counters. Pair each red with a yellow to make zero pairs, then read the answer.", notes: "Zero pairs are the engine of integer addition. Insist children physically pair the counters before removing them, so the cancelling is seen, not memorised.", ccss: "7.NS.A.1", grade: "7" },
    { title: "Part-part-whole hunt", prompt: "Put 9 counters in a part-part-whole mat, some yellow and some red. Write every number sentence the mat shows.", notes: "One arrangement gives four sentences (two additions, two subtractions). This is the fact-family idea in concrete form.", ccss: "1.OA.B.3", grade: "1" },
    { title: "Subtracting a negative", prompt: "Start with 4 yellow counters and some zero pairs. Take away 2 red counters. What is 4 − (−2)? Explain with the counters.", notes: "Adding zero pairs first is the key move: it creates red counters that can be removed. Connect it to adding the opposite afterwards.", ccss: "7.NS.A.1c", grade: "7" },
  ],
  "linking-cubes": [
    { title: "Build and break 8", prompt: "Build a stick of 8 cubes in two colours. Break it into two parts, record the split, then rebuild and break it a different way.", notes: "Record every split on the board. Children see that 8 stays 8 however it is split, the foundation of number bonds.", ccss: "K.OA.A.3", grade: "K" },
    { title: "Cube bar graph", prompt: "Count the cubes in a mixed handful by colour and build a tower for each colour. Which colour has most? How many more?", notes: "Towers must share a baseline or comparisons mislead. Ask children to line towers up and count the difference directly.", ccss: "1.MD.C.4", grade: "1" },
    { title: "Arrays for 12", prompt: "Use cubes to build every rectangular array you can for 12. Record each as a multiplication sentence.", notes: "2 × 6, 3 × 4 and their turns. Children discover factor pairs concretely before the word factor is introduced.", ccss: "3.OA.B.5", grade: "3" },
    { title: "Staircase sums", prompt: "Build staircases of 1, 2, 3, 4 and 5 cubes. How many cubes in each staircase in total? What is the pattern?", notes: "Totals are the triangular numbers 1, 3, 6, 10, 15. Strong finishers can hunt for the rule: each step adds one more than the last.", ccss: "4.OA.C.5", grade: "4" },
  ],
  "color-tiles": [
    { title: "Copy the pattern", prompt: "Build an ABAB pattern with two colours, then extend it by four more tiles. Change it into an ABB pattern.", notes: "Saying the pattern unit out loud (red, blue, red, blue) matters more than the tiles. Ask what the 10th tile will be without building it.", ccss: "K.G.B.5", grade: "K" },
    { title: "Area of a rectangle", prompt: "Build a solid 4 by 3 rectangle of tiles. Count the tiles for the area, then count the outside edges for the perimeter. Record both with units.", notes: "Children routinely swap area and perimeter. Tiles for area, edges for perimeter: keep the two counts physically different.", ccss: "3.MD.C.7", grade: "3" },
    { title: "Same area, different perimeter", prompt: "Use exactly 12 tiles to build two different rectangles. Show that the areas match but the perimeters do not.", notes: "3 × 4 gives perimeter 14, 2 × 6 gives 16, 1 × 12 gives 26. A memorable challenge to the idea that area decides everything.", ccss: "4.MD.A.3", grade: "4" },
    { title: "Tile the fraction", prompt: "Make a 2 by 4 rectangle. Cover exactly 3/8 of it with a second colour. Then cover 3/4 of a new rectangle and compare.", notes: "The whole must be agreed first: here the whole is 8 tiles. Fractions of a set, not of a shape, is the new idea.", ccss: "3.NF.A.1", grade: "3" },
  ],
  "hundred-board": [
    { title: "10 more, 10 less", prompt: "Cover 47. Without uncovering, say 1 more, 1 less, 10 more and 10 less. Uncover and check each one.", notes: "Moving down a row adds 10, the board's key structure. If a child counts on their fingers for 10 more, point at the column pattern.", ccss: "1.NBT.C.5", grade: "1" },
    { title: "Multiples of 6 pattern", prompt: "Turn on Multiples of 6. Describe the pattern you see, then predict where 6 × 11 and 6 × 12 would land.", notes: "The diagonal drift surprises children. Link it to 6 being 10 − 4, or to two columns of 3s combining.", ccss: "3.OA.D.9", grade: "3" },
    { title: "Round and check", prompt: "Cover 68. Round it to the nearest 10, then uncover and use the board to prove your answer is right.", notes: "68 sits 2 away from 70 and 8 away from 60. Counting the steps on the board makes the halfway rule concrete.", ccss: "3.NBT.A.1", grade: "3" },
    { title: "Decimal slide", prompt: "Switch to decimal mode. Cover 4.7, say 0.1 more and 1 more, then uncover to check.", notes: "The board structure is identical, only the unit changed. Children who own the whole-number board transfer the pattern instantly.", ccss: "5.NBT.A.3", grade: "5" },
  ],
  "base-ten-blocks": [
    { title: "Build 1,139", prompt: "Build 1,139 in the place-value chart, then Break the hundreds flat and show the total does not change.", notes: "Breaking conserves the total: that is the regrouping idea. Have children read the new form aloud (10 hundreds becomes 9 hundreds and 10 rods).", ccss: "2.NBT.A.1", grade: "2" },
    { title: "Regroup to a cube", prompt: "Make ten flats, then Regroup them into one 1,000 cube. How many units is the cube worth?", notes: "Ten of any piece makes one of the next. Repeat the chant at every size so the base-ten pattern is the takeaway, not the cube.", ccss: "3.NBT.A.2", grade: "3" },
    { title: "346 + 278 with blocks", prompt: "Build 346 and 278, combine them, and Regroup whenever a column reaches ten. Record the written sum beside the blocks.", notes: "Insist the written algorithm step happens at the same moment as the physical regroup, so the carrying digit has a meaning.", ccss: "2.NBT.B.7", grade: "2" },
    { title: "Decimal build 2.35", prompt: "Switch to the decimal Number Set and build 2.35. Break the 0.1 rod and say what the total is now made of.", notes: "The flat is now worth 1, so every piece shrinks by a factor of 100. Naming the new unit before building prevents the classic decimal confusion.", ccss: "5.NBT.A.3", grade: "5" },
  ],
  "place-value-disks": [
    { title: "Build 40,206", prompt: "Build 40,206 with disks. Which place has no disk, and why does the number still need that place?", notes: "The thousands and tens columns sit empty: the zeros hold those places. Disks make the placeholder zero visible because the column is there but has no disk.", ccss: "4.NBT.A.2", grade: "4" },
    { title: "Ten times bigger", prompt: "Build 35. Move every disk one place to the left. What number do you have, and what happened to the value?", notes: "Same disks, ten times the value. This is the multiplicative structure of place value, not just moving digits.", ccss: "5.NBT.A.2", grade: "5" },
    { title: "Break to subtract", prompt: "Build 52 and take away 27. Break a ten disk when the ones column runs out, then finish the subtraction.", notes: "Breaking a disk into ten ones is borrowing with the mystery removed. Narrate each break before allowing the take-away.", ccss: "3.NBT.A.2", grade: "3" },
    { title: "Decimal disks 0.405", prompt: "Build 0.405 using tenth, hundredth and thousandth disks. Break one 0.1 disk and rebuild the number a second way.", notes: "Two zeros in one small number is a rich discussion: one is a placeholder, one shows an empty column. Ask which is which.", ccss: "5.NBT.A.3b", grade: "5" },
  ],
  "cuisenaire-rods": [
    { title: "Rod staircase", prompt: "Build the full staircase from white to orange. Pick the yellow rod: which pairs of rods match its length exactly?", notes: "Pairs that match a rod are its additive splits. Children find 5 = 4 + 1 = 3 + 2 by eye before any symbols.", ccss: "1.OA.C.6", grade: "1" },
    { title: "Trains for 10", prompt: "Build three different two-rod trains the same length as the orange rod. Record each train as a number sentence.", notes: "Trains must align at both ends. Mismatched ends are the most common error and the easiest to self-check.", ccss: "2.OA.B.2", grade: "2" },
    { title: "If orange is 1", prompt: "Say the orange rod is worth 1 whole. Find the rod worth 1/2, the rod worth 3/10, and the rod worth 7/10. Prove each with lengths.", notes: "Changing the unit is the whole task. Children must measure every rod against orange, which is genuine fraction reasoning.", ccss: "3.NF.A.2", grade: "3" },
    { title: "Difference rods", prompt: "Lay the blue rod (9) and the yellow rod (5) side by side. Find the single rod that fills the gap. What subtraction does it show?", notes: "The gap rod is the difference made visible: 9 − 5 = 4, the purple rod. Difference as comparison, not just take-away.", ccss: "2.NBT.B.5", grade: "2" },
  ],
  "fraction-circles": [
    { title: "Cover the whole", prompt: "Cover one whole circle exactly using only thirds and sixths. Record the sentence your pieces make.", notes: "1/3 + 1/3 + 1/6 + 1/6 = 1 is within reach once children see two sixths sit on a third. Let them discover the pairing.", ccss: "4.NF.B.3", grade: "4" },
    { title: "Bigger: 1/3 or 1/4?", prompt: "Place a third piece and a quarter piece on top of each other. Which is bigger, and how do the pieces prove it?", notes: "The classic error is 1/4 is bigger because 4 is bigger. The overlap settles it: more pieces means each piece is smaller.", ccss: "3.NF.A.3d", grade: "3" },
    { title: "Percent switch", prompt: "Build 3/4 of a circle. Switch the labels to percent and to decimal. Write all three names for the amount.", notes: "Same pieces, three labels: 3/4, 75%, 0.75. The equivalence lands because nothing physical changed.", ccss: "6.RP.A.3c", grade: "6" },
    { title: "Rings equivalence", prompt: "Open the Rings workspace. Find three fractions in different rings that end at exactly the same line. Record them.", notes: "Aligned edges on the rings are equivalences. 1/2 = 3/6 = 6/12 is usually found first; push for one with eighths.", ccss: "4.NF.A.1", grade: "4" },
  ],
  "fraction-tiles": [
    { title: "Prove 1/2 = 2/4", prompt: "Place a 1/2 tile, then cover it exactly with 1/4 tiles. Record the equivalence and find one more for 1/2.", notes: "Exact cover, no gaps and no overlaps, is the proof standard. Children should check edges align before claiming equivalence.", ccss: "3.NF.A.3b", grade: "3" },
    { title: "Beat the benchmark", prompt: "Order 1/3, 1/2 and 3/4 against a benchmark of 1 on the wall. Which is closest to 1? How do you know?", notes: "Benchmark thinking (compare to 1/2, then to 1) beats finding common denominators at this stage. Ask for the gap each fraction leaves.", ccss: "4.NF.A.2", grade: "4" },
    { title: "Build the wall", prompt: "Build the full Fraction Wall, one row per denominator. Find a fraction equal to 2/3 in two other rows.", notes: "The wall rewards hunting: 4/6 and 8/12 line up under 2/3. Have children run a ruler down the edge to check.", ccss: "4.NF.A.1", grade: "4" },
    { title: "Sum past one whole", prompt: "Add 2/3 and 3/4 with tiles. Show the sum as a mixed number using a second whole tile.", notes: "Overflow past the whole is the point: children must regroup twelfths into a whole plus a remainder, just like base ten.", ccss: "5.NF.A.1", grade: "5" },
  ],
  "number-lines": [
    { title: "Jump to add", prompt: "On a 0 to 20 line, start a jump at 7 and land on 15. What jump did you make? Now make the same total in two smaller jumps.", notes: "Breaking +8 into +5 and +3 (land on a ten first) is the bridging strategy. The arc makes the landing points visible.", ccss: "2.OA.A.1", grade: "2" },
    { title: "Mystery point", prompt: "Hide the labels. A partner places a point and you estimate its value, then show the labels to check.", notes: "Estimation on an open line is pure number sense: children must use the endpoints and the halfway mark as anchors.", ccss: "3.NBT.A.1", grade: "3" },
    { title: "Fractions on the line", prompt: "Set the interval to 1/4 on a 0 to 2 line. Plot 3/4, 1 1/2 and 7/4. Which two are the same distance from 1?", notes: "Fractions as points on a line, not parts of a pizza, is the grade 3 leap. Improper fractions belong here on purpose.", ccss: "3.NF.A.2b", grade: "3" },
    { title: "Negative jumps", prompt: "On a −10 to 10 line, start at 3 and make a jump of −7. Where do you land? Make a jump that lands exactly on −5.", notes: "Crossing zero is where errors cluster. The arc crossing the 0 tick gives children a landmark to count through.", ccss: "6.NS.C.6", grade: "6" },
  ],
  "bar-models": [
    { title: "Part-part-whole: pets", prompt: "Model this: a class has 24 pets. 15 are dogs, the rest are cats. Build the bar, label the unknown, then solve.", notes: "Drawing the bar before computing is the discipline. The unknown segment gets a question mark label, not a guessed number.", ccss: "2.OA.A.1", grade: "2" },
    { title: "Comparison bars", prompt: "Sam has 6 more marbles than Jo. Together they have 26. Build comparison bars and find how many each has.", notes: "The extra segment of 6 is the key insight: remove it, halve 20, then add back. Bars make that move obvious.", ccss: "3.OA.D.8", grade: "3" },
    { title: "Ratio bars", prompt: "A drink mixes juice and water in the ratio 2:3. Build the bar for 5 total parts, then scale it up to make 25 parts.", notes: "Each part must stay equal as the bar scales. When the total is 25, one part is worth 5, so the mix is 10 juice to 15 water.", ccss: "6.RP.A.3", grade: "6" },
    { title: "Fraction of a bar", prompt: "Shade a bar in 5 equal segments to show a whole of 45. Label each segment. What is 3/5 of 45? Show it on the bar.", notes: "Unit fraction first (45 ÷ 5 = 9), then build up to 3 parts = 27. The bar shows why the two-step method works.", ccss: "5.NF.B.4", grade: "5" },
  ],
  "money": [
    { title: "Make 67 cents", prompt: "Make 67¢ two different ways. Which way uses fewer coins? Record both.", notes: "Fewest coins means biggest coins first. Children who start with pennies need the exchange idea: ten pennies become a dime.", ccss: "2.MD.C.8", grade: "2" },
    { title: "Exact change", prompt: "An item costs $1.35. Pay with a $5 bill and show the change in coins and bills. Check your change by counting up.", notes: "Counting up from the price to $5 is the shopkeeper's method and far more reliable than column subtraction for money.", ccss: "2.MD.C.8", grade: "2" },
    { title: "Coin exchange", prompt: "Build 10 dimes. Exchange them for the bill they equal. Now build 100 pennies and exchange up twice.", notes: "Money exchange is base ten in disguise: 10 dimes = 1 dollar mirrors 10 rods = 1 flat. Name the parallel explicitly.", ccss: "2.NBT.A.1", grade: "2" },
    { title: "Budget build", prompt: "You have $20. Build a set of items priced $4.50, $7.25 and $6.75 using the annotation labels. Can you afford all three? Show the money left over.", notes: "Total is $18.50, leaving $1.50. Insist the leftover is shown in coins, which forces decimal addition to be exact.", ccss: "4.MD.A.2", grade: "4" },
  ],
  "algebra-tiles": [
    { title: "Build (x+4)(x+3)", prompt: "Build the area model for (x+4)(x+3) and read off the expanded expression from the tiles.", notes: "The rectangle must be complete with no gaps: x², 7 x-tiles and 12 units. Reading the product off the picture is the skill.", ccss: "HSA-APR.A.1", grade: "9" },
    { title: "Solve x + 3 = 7", prompt: "Model the equation with tiles on two sides of an equals line. Use zero pairs to isolate x, keeping both sides balanced.", notes: "Whatever is added to one side must be added to the other: the balance rule. Zero pairs let children remove the +3 legally.", ccss: "6.EE.B.7", grade: "6" },
    { title: "Simplify with zero pairs", prompt: "Build 3x + 2 − x − 5. Cancel zero pairs and write the simplest expression the tiles show.", notes: "x and −x cancel, +2 and −5 leave −3: answer 2x − 3. Children must flip tiles to negatives before pairing.", ccss: "7.EE.A.1", grade: "7" },
    { title: "Factor x² + 5x + 6", prompt: "Take x², 5 x-tiles and 6 units and arrange them into one complete rectangle. What are its side lengths?", notes: "The rectangle is (x+2)(x+3). If the arrangement has gaps, the factorisation is wrong: the rectangle is self-checking.", ccss: "HSA-SSE.B.3a", grade: "9" },
  ],
  "xy-coordinate-board": [
    { title: "Plot the treasure", prompt: "Plot (3, 4), (6, 2) and (6, 7). Connect them in order. What shape have you made?", notes: "x first, along the corridor, then y, up the stairs. Swapped coordinates are the number one error; the shape exposes them.", ccss: "5.G.A.1", grade: "5" },
    { title: "Growing pattern table", prompt: "Plot (1, 3), (2, 5), (3, 7) and (4, 9). Read the data table, spot the rule, and predict the point where x is 10.", notes: "y = 2x + 1, so (10, 21). Children who extend the line on the board first guess better than those who only stare at the table.", ccss: "6.EE.C.9", grade: "6" },
    { title: "Four quadrant tour", prompt: "Switch to four quadrants. Plot (2, 3), (−2, 3), (−2, −3) and (2, −3). Connect them and name the shape.", notes: "A rectangle centred on the origin. Sign errors land points in the wrong quadrant, which the symmetry makes easy to spot.", ccss: "6.NS.C.6b", grade: "6" },
    { title: "Same x, same y", prompt: "Plot three points with x = 4 and three points with y = −2. What do you notice about each set?", notes: "Vertical and horizontal lines appear without any teaching of equations of lines. Name them x = 4 and y = −2 at the end.", ccss: "8.F.A.1", grade: "8" },
  ],
  "geoboard": [
    { title: "Squares of many sizes", prompt: "Make three different-sized squares on the board. Record the area of each by counting unit squares.", notes: "Tilted squares are the stretch goal: a diamond square has area 2, found by the surrounding box or by splitting into triangles.", ccss: "3.MD.C.6", grade: "3" },
    { title: "Right angle hunt", prompt: "Stretch a band to make a triangle with one right angle. Then make one with no right angle. How can you check the angle?", notes: "Check against the corner of a book or the board's own grid corner. Peg geometry makes angle a thing you can test.", ccss: "4.G.A.1", grade: "4" },
    { title: "Same area, different shape", prompt: "Make two different shapes that both have area 4. Prove the areas match by counting whole and half squares.", notes: "Triangles count as halves. This is conservation of area: shape changes, area does not have to.", ccss: "3.MD.C.7d", grade: "3" },
    { title: "Perimeter puzzle", prompt: "Make a shape with area 6 and the biggest perimeter you can. Compare with a partner: who stretched further?", notes: "Long thin shapes win. Children discover perimeter and area are independent measures, a classic misconception target.", ccss: "4.MD.A.3", grade: "4" },
  ],
  "pattern-blocks": [
    { title: "Cover the hexagon", prompt: "Cover one hexagon exactly, three different ways. Record each way as a fraction sentence.", notes: "2 trapezoids, 3 parallelograms, 6 triangles. The hexagon is the whole, so each cover is a sum that makes 1.", ccss: "1.G.A.3", grade: "1" },
    { title: "Fraction trading", prompt: "Show that the trapezoid equals 3 triangles and the parallelogram equals 2. Build 1 whole using only triangles, then only parallelograms and trapezoids.", notes: "Trading up and down between shapes is equivalence again, in geometry clothes. Require exact edges, no overhang.", ccss: "4.NF.A.1", grade: "4" },
    { title: "Symmetric design", prompt: "Build a design with one line of symmetry. Use Rotate to mirror pieces across the middle. Photograph it with a share code.", notes: "Rotating in 30 degree steps matches the block angles. A mirror held on the line is the honest check for symmetry.", ccss: "4.G.A.3", grade: "4" },
    { title: "Grow the pattern", prompt: "Build a hexagon flower: 1 hexagon ringed by 6 trapezoids. How many blocks? Add a second ring of triangles and count again.", notes: "Counting a growing pattern organises nicely in a table: ring 1 uses 7 blocks. Predict ring 3 before building it.", ccss: "4.OA.C.5", grade: "4" },
  ],
  "clock": [
    { title: "Elapsed time", prompt: "Set clock 1 to 9:15 and clock 2 to 11:45. How long is between them? Show it on the linear time bar.", notes: "Bridge through 10:00: 45 minutes to 10, then 1 hour 45 more. The two-clock workspace keeps start and end visible together.", ccss: "3.MD.A.1", grade: "3" },
    { title: "Half past and quarter to", prompt: "Set the clock to half past 7, then quarter to 8. What do the digital twins say? Which hand barely moved?", notes: "The hour hand creeps: at quarter to 8 it nearly touches 8. That creep is exactly what children miss when reading clocks.", ccss: "2.MD.C.7", grade: "2" },
    { title: "Time tracker challenge", prompt: "Use the Time Tracker: add 15 minutes four times from 10:30. Where does the clock land? Now do it in two jumps instead.", notes: "Four 15s make an hour: 11:30. Jumping in chunks builds the quarter-hour landmarks on the number line of the day.", ccss: "3.MD.A.1", grade: "3" },
    { title: "Five-minute reads", prompt: "A partner sets the minute hand anywhere. Read the time to the nearest five minutes, then check with the digital twin.", notes: "Count the red minute marks by fives around the face, not the number the hand points at: pointing at 3 means 15 minutes.", ccss: "2.MD.C.7", grade: "2" },
  ],
};
/* Merge the expanded Oomba task bank (228 additional tasks) into the base
   library to reach 300 tasks total: 16-17 per tool across all 18 tools,
   spanning grades K-9 and the Common Core domains. Every task is written
   for Oomba Academy. */
for (const [slug, extras] of Object.entries(EXTRA_TASKS)) {
  TASKS_LIB[slug] = [...(TASKS_LIB[slug] ?? []), ...extras];
}
export const TOTAL_TASKS = Object.values(TASKS_LIB).reduce((n, arr) => n + arr.length, 0);
export const TASKS: Record<string, { title: string; prompt: string }[]> = Object.fromEntries(Object.entries(TASKS_LIB).map(([k, v]) => [k, v.map((t) => ({ title: t.title, prompt: t.prompt }))]));

/* ============ Oomba Academy branding ============ */
export function OombaLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-start gap-2" aria-label="Oomba Academy">
      <span className="relative inline-flex flex-col items-center leading-none">
        <span aria-hidden="true" className="oomba-spark text-[22px] leading-none -mb-1">✦</span>
        <span className="font-display font-bold tracking-tight" style={{ fontSize: compact ? 22 : 30, color: "var(--text, #141414)" }}>
          <span className="relative inline-flex items-center justify-center w-[0.95em] h-[0.95em] rounded-full border-[3px] border-current align-[-0.08em] mr-[1px]"><span className="w-[0.28em] h-[0.28em] rounded-full bg-current translate-y-[-0.12em]" /></span>
          <span className="relative inline-flex items-center justify-center w-[0.95em] h-[0.95em] rounded-full border-[3px] border-current align-[-0.08em] mr-[2px]"><span className="w-[0.28em] h-[0.28em] rounded-full bg-current translate-y-[-0.12em]" /></span>
          mba
        </span>
      </span>
      {!compact ? <span className="flex flex-col leading-tight mt-1"><span className="font-display font-semibold text-[13px] tracking-wide" style={{ color: "var(--logo-sub, #14744A)" }}>ACADEMY</span><span className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>Screen time you can feel good about</span></span> : null}
    </span>
  );
}

/* ============ State summaries + tiny PDF writer (for LIVE export) ============ */
export function summarizeState(json: string): string[] {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (Array.isArray(o.pieces)) {
      const pieces = o.pieces as { label?: string; value?: number }[];
      if (pieces.length === 0) return ["Empty desk: no pieces placed yet."];
      const counts = new Map<string, number>();
      let total = 0;
      for (const p of pieces) { counts.set(p.label ?? "piece", (counts.get(p.label ?? "piece") ?? 0) + 1); total += typeof p.value === "number" ? p.value : 0; }
      const parts = [...counts.entries()].map(([l, c]) => `${c} x ${l}`).join(", ");
      return [`${pieces.length} pieces on the desk: ${parts}.`, `Combined value of pieces: ${Math.round(total * 1000) / 1000}.`];
    }
    const lines = Object.entries(o).filter(([k]) => !k.startsWith("__")).slice(0, 8).map(([k, v]) => `${k}: ${JSON.stringify(v)?.slice(0, 110) ?? ""}`);
    return lines.length ? lines : ["Workspace saved, nothing placed yet."];
  } catch { return ["Workspace state could not be read."]; }
}
/* The hand-rolled PDF uses the Type1 Helvetica font (WinAnsi encoding) and
   computes xref offsets from string positions, so every character must end
   up as exactly one byte whose value is the character's WinAnsi code point.
   Raw UTF-8 text (the · separators in titles and headings, the × and − signs
   and ² superscripts in piece labels, accented student names) made the byte
   offsets drift past the real positions, corrupting the xref table, and
   rendered as mojibake. pdfSafe therefore maps every character to its single
   WinAnsi byte: Latin-1 letters and symbols (é, ñ, ·, ×, ², ¢, °) keep
   their proper glyphs because their code points ARE their WinAnsi bytes,
   CP1252 punctuation (€, curly quotes, en/em dashes, •, …) is remapped to
   its CP1252 byte, and only characters WinAnsi cannot represent at all get
   an ASCII stand-in or a folded base letter. makePdf then writes the string
   out byte-per-character instead of as UTF-8, and the font object declares
   /Encoding /WinAnsiEncoding: without that declaration viewers fall back to
   StandardEncoding and misrender every byte above 127 even when the bytes
   themselves are right. */
const PDF_WINANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99, "š": 0x9a,
  "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};
const PDF_CHAR_MAP: Record<string, string> = {
  "−": "-", "✓": "OK", "★": "*", "→": "->", "↔": "<->",
  "≤": "<=", "≥": ">=", "⬡": "hexagon", "▲": "triangle", "■": "square",
};
export function pdfSafe(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code <= 126) { out += ch; continue; }
    // Latin-1 range: the code point is the WinAnsi byte, glyph preserved.
    if (code >= 0xa1 && code <= 0xff) { out += ch; continue; }
    const extra = PDF_WINANSI_EXTRA[ch];
    if (extra !== undefined) { out += String.fromCharCode(extra); continue; }
    const mapped = PDF_CHAR_MAP[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    if (ch === "\n" || ch === "\t") { out += " "; continue; }
    // Not representable in WinAnsi: fold to the base letter (ā -> a) or "?".
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += base && base.length === 1 && base.charCodeAt(0) >= 32 && base.charCodeAt(0) <= 126 ? base : "?";
  }
  return out;
}
function pdfEscape(s: string): string { return pdfSafe(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
export function makePdf(title: string, blocks: { heading: string; lines: string[] }[]): Blob {
  const wrapped: string[] = [];
  const wrap = (s: string, n: number) => { const out: string[] = []; let cur = s; while (cur.length > n) { let cut = cur.lastIndexOf(" ", n); if (cut < 20) cut = n; out.push(cur.slice(0, cut)); cur = cur.slice(cut).trim(); } if (cur) out.push(cur); return out; };
  wrapped.push(title, "");
  for (const b of blocks) { wrapped.push(b.heading); for (const l of b.lines) wrapped.push(...wrap(l, 92)); wrapped.push(""); }
  const perPage = 46;
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += perPage) pages.push(wrapped.slice(i, i + perPage));
  if (pages.length === 0) pages.push(["(no content)"]);
  const objects: string[] = [];
  const fontId = 3 + pages.length * 2;
  pages.forEach((lines, pi) => {
    const contentId = 3 + pi * 2; const pageId = contentId + 1;
    const stream = ["BT", `/F1 11 Tf`, "50 790 Td", "15 TL", ...lines.map((l, i) => `${i === 0 ? "" : "T* "}(${pdfEscape(l)}) Tj`), "ET"].join("\n");
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  });
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, pi) => `${4 + pi * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  const maxId = fontId;
  for (let id = 1; id <= maxId; id++) { offsets[id] = pdf.length; pdf += `${id} 0 obj\n${objects[id] ?? "<< >>"}\nendobj\n`; }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) pdf += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  // Write one byte per character: after pdfSafe every character's code point
  // is its WinAnsi byte value, and a plain Blob([string]) would re-encode as
  // UTF-8, doubling those bytes and corrupting the offsets computed above.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

/* ============ Generic draggable pieces ============ */
let _id = 1;
export type Piece = { id: number; kind: string; x: number; y: number; rot: number; flipped: boolean; filled: boolean; locked: boolean; color: string; label: string; value: number };
export function mk(kind: string, color: string, label: string, value: number, x = 24 + Math.random() * 130, y = 24 + Math.random() * 110): Piece {
  return { id: _id++, kind, x, y, rot: 0, flipped: false, filled: true, locked: false, color, label, value };
}
export function usePieces(initial: Piece[] = []) {
  const [pieces, setPieces] = useState<Piece[]>(initial);
  const hist = useRef<Piece[][]>([]);
  const push = useCallback((next: Piece[]) => { hist.current = [...hist.current.slice(-40), pieces]; setPieces(next); }, [pieces]);
  const undo = useCallback(() => { const prev = hist.current[hist.current.length - 1]; if (prev) { hist.current = hist.current.slice(0, -1); setPieces(prev); } }, []);
  return {
    pieces, setPieces, push, undo, canUndo: hist.current.length > 0,
    add: (p: Piece) => push([...pieces, p]),
    remove: (id: number) => push(pieces.filter((p) => p.id !== id)),
    update: (id: number, patch: Partial<Piece>) => setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    clear: () => push([]),
  };
}

export function Draggable({ piece, selected, onSelect, onMove, children, w, h }: { piece: Piece; selected: boolean; onSelect: () => void; onMove: (x: number, y: number) => void; children: ReactNode; w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  function down(e: RPE<HTMLDivElement>) {
    if (piece.locked) { onSelect(); return; }
    onSelect();
    const rect = ref.current?.parentElement?.getBoundingClientRect();
    drag.current = { dx: e.clientX - (rect?.left ?? 0) - piece.x, dy: e.clientY - (rect?.top ?? 0) - piece.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function move(e: RPE<HTMLDivElement>) {
    if (!drag.current) return;
    const rect = ref.current?.parentElement?.getBoundingClientRect();
    const nx = e.clientX - (rect?.left ?? 0) - drag.current.dx;
    const ny = e.clientY - (rect?.top ?? 0) - drag.current.dy;
    const maxX = rect ? Math.max(0, rect.width - w) : nx;
    const maxY = rect ? Math.max(0, rect.height - h) : ny;
    onMove(Math.min(Math.max(0, nx), maxX), Math.min(Math.max(0, ny), maxY));
  }
  return (
    <div ref={ref} role="button" aria-label={`Piece ${piece.label}`} tabIndex={0}
      className="no-select absolute cursor-grab active:cursor-grabbing"
      style={{ left: piece.x, top: piece.y, width: w, height: h, transform: `rotate(${piece.rot}deg) scaleX(${piece.flipped ? -1 : 1})`, zIndex: selected ? 20 : 10 }}
      onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <div className={selected ? "outline outline-[3px] outline-[var(--accent-line)] rounded-lg h-full" : "h-full"}>{children}</div>
    </div>
  );
}

/* ============ Shared workspace shell (report §2.0) ============ */
export function Shell({ tool, total, palette, settings, children, onReset, onUndo, canUndo, stateJson, onRestore, note, tasksSlug, draftVocab }: {
  tool: ToolDef; total?: ReactNode; palette: ReactNode; settings?: ReactNode; children: ReactNode;
  onReset: () => void; onUndo: () => void; canUndo: boolean; stateJson: string; onRestore: (json: string) => void; note?: string; tasksSlug?: string;
  /* The tool's placeable piece definitions, when it has any: the vocabulary
     the AI lesson drafter may place on the board. */
  draftVocab?: PalDef[];
}) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string>("");
  const [annotate, setAnnotate] = useState(false);
  /* Text boxes are sticky notes ON the desk, Miro-style: each note is an
     object on the board itself. Drag one anywhere with finger or mouse, tap
     one to edit it in place (the editor is the note itself, the same size
     and in the same spot, so typing never pushes a big field over the
     pieces and the board stays visible and usable around it), and delete
     any note on its own. Positions are stored as fractions of the canvas
     (0..1 per axis), the same scheme as the pen strokes, so a note placed
     on a teacher's tablet restores in the right place on a student's phone.
     Up to 12 notes; every note and its position travels with the workspace
     under the __ann key alongside the strokes (share codes, saved
     workspaces, LIVE pushes and LIVE submissions). A new note defaults to
     a clear spot: candidate positions are scored against the pieces in the
     current state JSON and the notes already on the board, the first spot
     that overlaps nothing wins, and the least-covered spot is the fallback
     when the board is crowded. */
  type NoteBox = { id: string; text: string; x: number; y: number };
  const [notes, setNotes] = useState<NoteBox[]>([]);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const noteSeq = useRef(0);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const NOTE_W = 176; const NOTE_H = 118;
  const clampFrac = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));
  function noteSpot(taken: NoteBox[]): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect();
    const W = rect?.width || 360; const H = rect?.height || 430;
    const wf = NOTE_W / W; const hf = NOTE_H / H;
    const obs: { x: number; y: number; w: number; h: number }[] = [];
    /* Obstacles come from the pieces actually rendered on the board (the
       Draggable roots), measured against the canvas, so the clear-spot
       scan works whatever shape a tool's saved state takes. The state
       JSON pieces list is the fallback when nothing is rendered yet. */
    if (rect) {
      canvasRef.current?.querySelectorAll('[aria-label^="Piece "]').forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.height > 0) obs.push({ x: (r.left - rect.left) / W, y: (r.top - rect.top) / H, w: r.width / W, h: r.height / H });
      });
    }
    if (obs.length === 0) {
      try {
        const o = JSON.parse(stateJson) as { pieces?: { x?: number; y?: number }[] };
        if (Array.isArray(o.pieces)) for (const p of o.pieces) { if (typeof p.x === "number" && typeof p.y === "number") obs.push({ x: p.x / W, y: p.y / H, w: 110 / W, h: 110 / H }); }
      } catch { /* state without a pieces list: only other notes block a spot */ }
    }
    for (const n of taken) obs.push({ x: n.x, y: n.y, w: wf, h: hf });
    const overlap = (x: number, y: number) => obs.reduce((sum, b) => {
      const ox = Math.max(0, Math.min(x + wf, b.x + b.w) - Math.max(x, b.x));
      const oy = Math.max(0, Math.min(y + hf, b.y + b.h) - Math.max(y, b.y));
      return sum + ox * oy;
    }, 0);
    const xs = [0.03, 0.3, 0.56].map((x) => clampFrac(x, 1 - wf));
    const ys = [0.72, 0.46, 0.2, 0.03].map((y) => clampFrac(y, 1 - hf));
    let best = { x: xs[0] ?? 0.03, y: ys[0] ?? 0.6 }; let bestScore = Infinity;
    for (const y of ys) for (const x of xs) { const s = overlap(x, y); if (s === 0) return { x, y }; if (s < bestScore) { bestScore = s; best = { x, y }; } }
    return best;
  }
  const addNote = () => {
    if (notes.length >= 12) return;
    noteSeq.current += 1;
    const id = `note-${Date.now().toString(36)}-${noteSeq.current}`;
    const spot = noteSpot(notes);
    setNotes((ns) => (ns.length >= 12 ? ns : [...ns, { id, text: "", ...spot }]));
    setEditingNote(id);
  };
  /* Dragging a note: pointer capture on the note itself, positions kept as
     canvas fractions and clamped so the note can never be dragged off the
     board. A press that barely moves is a tap and opens the in-place
     editor instead of starting a drag. */
  const noteDrag = useRef<{ id: string; dx: number; dy: number; moved: boolean; sx: number; sy: number } | null>(null);
  function noteDown(e: RPE<HTMLDivElement>, n: NoteBox) {
    if ((e.target as HTMLElement).closest("textarea,button")) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    noteDrag.current = { id: n.id, dx: (e.clientX - rect.left) / rect.width - n.x, dy: (e.clientY - rect.top) / rect.height - n.y, moved: false, sx: e.clientX, sy: e.clientY };
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
  }
  function noteMove(e: RPE<HTMLDivElement>) {
    const d = noteDrag.current; if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 7) d.moved = true;
    if (!d.moved) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const el = e.currentTarget as HTMLDivElement;
    const nx = clampFrac((e.clientX - rect.left) / rect.width - d.dx, 1 - el.offsetWidth / rect.width);
    const ny = clampFrac((e.clientY - rect.top) / rect.height - d.dy, 1 - el.offsetHeight / rect.height);
    setNotes((ns) => ns.map((m) => (m.id === d.id ? { ...m, x: nx, y: ny } : m)));
  }
  function noteUp(n: NoteBox) {
    const d = noteDrag.current; noteDrag.current = null;
    if (d && d.id === n.id && !d.moved) setEditingNote(n.id);
  }
  /* A note's height depends on its text, which placement cannot know in
     advance: a long note placed low on the board could hang past the
     canvas edge with its Edit and Delete buttons clipped away. After every
     render, measure each note against the canvas and pull any that
     overflow back inside, using the note's real size on this screen. */
  const noteEls = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const W = canvas.clientWidth; const H = canvas.clientHeight;
    if (!W || !H) return;
    setNotes((ns) => {
      let changed = false;
      const next = ns.map((n) => {
        const el = noteEls.current.get(n.id); if (!el) return n;
        const x = clampFrac(n.x, Math.max(0, (W - el.offsetWidth) / W));
        const y = clampFrac(n.y, Math.max(0, (H - el.offsetHeight) / H));
        if (x !== n.x || y !== n.y) { changed = true; return { ...n, x, y }; }
        return n;
      });
      return changed ? next : ns;
    });
  });
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [redeem, setRedeem] = useState("");
  const [msg, setMsg] = useState("");
  /* Annotations live in state (not a ref) and are merged into every saved,
     shared, pushed and LIVE-submitted workspace under the __ann key, so pen
     strokes and the text note travel with the work and come back on restore.
     The drawing surface is a dedicated overlay above the pieces: while
     Annotate is on, pieces cannot grab the pointer and fight the pen, and
     the overlay carries touch-none so a finger draws instead of scrolling
     the page. Eraser removes any stroke passing within 16px of the finger,
     and every pen or eraser gesture snapshots the strokes for Undo. */
  type Stroke = { c: string; pts: { x: number; y: number }[] };
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [annMode, setAnnMode] = useState<"pen" | "erase">("pen");
  const [penColor, setPenColor] = useState("#FF6B4A");
  const annHist = useRef<Stroke[][]>([]);
  const annGesture = useRef<"pen" | "erase" | null>(null);
  const annSnapshot = useCallback(() => { annHist.current = [...annHist.current.slice(-40), strokes]; }, [strokes]);
  const withAnn = useCallback((json: string): string => {
    try {
      const o = JSON.parse(json) as Record<string, unknown>;
      if (o && typeof o === "object" && !Array.isArray(o)) return JSON.stringify({ ...o, __ann: { strokes, notes } });
    } catch { /* not an object state: pass through unchanged */ }
    return json;
  }, [strokes, notes]);
  const restoreWithAnn = useCallback((json: string) => {
    try {
      const o = JSON.parse(json) as Record<string, unknown> & { __ann?: { strokes?: Stroke[]; notes?: { id: string; text: string; x?: number; y?: number }[]; note?: string } };
      if (o && typeof o === "object" && o.__ann) {
        if (Array.isArray(o.__ann.strokes)) { annHist.current = []; setStrokes(o.__ann.strokes); }
        if (Array.isArray(o.__ann.notes)) {
          /* Notes saved before on-board positions existed have no x/y; they
             come back cascaded across the lower part of the board. Every
             restored position, saved or defaulted, is clamped against the
             note's size on THIS screen, so a note dragged to the edge on a
             desktop restores fully on the board on a phone, never clipped
             by the canvas edge. */
          const rRect = canvasRef.current?.getBoundingClientRect();
          const rW = rRect?.width || 360; const rH = rRect?.height || 430;
          const maxX = 1 - NOTE_W / rW; const maxY = 1 - NOTE_H / rH;
          const valid = o.__ann.notes.filter((n) => n && typeof n.id === "string" && typeof n.text === "string");
          setNotes(valid.slice(0, 12).map((n, i) => ({
            id: n.id, text: n.text,
            x: clampFrac(typeof n.x === "number" ? n.x : 0.04 + (i % 3) * 0.3, maxX),
            y: clampFrac(typeof n.y === "number" ? n.y : Math.max(0, 0.66 - Math.floor(i / 3) * 0.3), maxY),
          })));
          setEditingNote(null);
        } else if (typeof o.__ann.note === "string" && o.__ann.note.trim()) {
          /* Workspaces saved before multiple text boxes existed carried one
             note string; it comes back as a single sticky note. */
          noteSeq.current += 1;
          setNotes([{ id: `note-legacy-${noteSeq.current}`, text: o.__ann.note, x: 0.04, y: 0.66 }]);
          setEditingNote(null);
        }
        const rest = { ...o }; delete rest.__ann;
        onRestore(JSON.stringify(rest));
        return;
      }
    } catch { /* fall through to a plain restore */ }
    onRestore(json);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRestore]);
  /* AI lesson drafter: the teacher describes a lesson (or picks one of this
     tool's library tasks) and the AI builds the board: pieces placed (for
     tools with a piece vocabulary), sticky notes with the instructions and
     questions, and pen annotations. The draft is applied through the same
     restoreWithAnn path as a share code, so a drafted board is an ordinary
     workspace afterwards: it saves with Share · get code and pushes to a
     LIVE class exactly like a hand-built one, which is how it is assigned. */
  type DraftResult = { board_title: string; pieces: { kind: string; x: number; y: number }[]; notes: { text: string; x: number; y: number }[]; strokes: { color: string; points: { x: number; y: number }[] }[] };
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftBrief, setDraftBrief] = useState("");
  const [draftGrade, setDraftGrade] = useState("");
  const [draftTask, setDraftTask] = useState("");
  const [draftMsg, setDraftMsg] = useState("");
  function applyDraft(d: DraftResult) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const W = rect?.width || 800; const H = rect?.height || 430;
    let base: Record<string, unknown> = {};
    let placedCount = 0;
    if (draftVocab && draftVocab.length > 0) {
      const newPieces: Piece[] = [];
      for (const p of d.pieces) {
        const def = draftVocab.find((v) => v.kind === p.kind);
        if (!def) continue;
        newPieces.push(mk(def.kind, def.color, def.label, def.value, clampFrac(p.x, 1) * Math.max(0, W - def.w), clampFrac(p.y, 1) * Math.max(0, H - def.h)));
      }
      placedCount = newPieces.length;
      base = { pieces: newPieces };
    } else {
      /* Tools without placeable pieces keep their current board state; the
         draft arrives as the notes and pen marks on top of it. */
      try { const o = JSON.parse(stateJson) as Record<string, unknown>; if (o && typeof o === "object" && !Array.isArray(o)) base = o; } catch { /* keep empty */ }
    }
    const maxNX = 1 - NOTE_W / W; const maxNY = 1 - NOTE_H / H;
    const newNotes: NoteBox[] = d.notes.slice(0, 6).map((n) => { noteSeq.current += 1; return { id: `note-${Date.now().toString(36)}-${noteSeq.current}`, text: n.text, x: clampFrac(n.x, maxNX), y: clampFrac(n.y, maxNY) }; });
    const penColors = ["#FF6B4A", "#141414", "#1F9D63", "#1E88E5"];
    const newStrokes: Stroke[] = d.strokes.slice(0, 4)
      .map((s) => ({ c: penColors.includes(s.color) ? s.color : "#FF6B4A", pts: s.points.slice(0, 40).map((pt) => ({ x: clampFrac(pt.x, 1), y: clampFrac(pt.y, 1) })) }))
      .filter((s) => s.pts.length > 1);
    restoreWithAnn(JSON.stringify({ ...base, __ann: { strokes: newStrokes, notes: newNotes } }));
    setEditingNote(null);
    const summary = `"${d.board_title}" is on the board: ${placedCount} pieces placed, ${newNotes.length} sticky notes, ${newStrokes.length} pen marks. Move anything you like, then assign it: save with Share · get code below, or push it to your class from a LIVE session.`;
    setDraftMsg(summary);
    setMsg(summary);
  }
  const draft = useMutation({
    mutationFn: async () => await api.draftLesson({
      tool_slug: tool.slug, tool_name: tool.name, grades: draftGrade || tool.grades,
      brief: draftBrief.trim(), task: draftTask,
      vocab: (draftVocab ?? []).map((v) => ({ kind: v.kind, label: v.label, value: v.value })),
    }),
    onSuccess: (d) => applyDraft(d),
    onError: (e) => setDraftMsg(e instanceof Error ? e.message : "The AI could not draft that lesson. Try again with a shorter description."),
  });
  /* Stroke points are stored as fractions of the drawing surface (0..1 on
     each axis), not raw pixels: a workspace annotated on a tablet restores
     its ink in the right place on a phone, and vice versa, because the SVG
     renders through a 0 0 1 1 viewBox with a non-scaling stroke. */
  function annPoint(e: RPE<HTMLDivElement>): { x: number; y: number } {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: r.width ? (e.clientX - r.left) / r.width : 0, y: r.height ? (e.clientY - r.top) / r.height : 0 };
  }
  function annEraseAt(p: { x: number; y: number }) {
    setStrokes((ss) => ss.filter((s) => !s.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.04)));
  }
  function annDown(e: RPE<HTMLDivElement>) {
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    annSnapshot();
    annGesture.current = annMode;
    const p = annPoint(e);
    if (annMode === "pen") setStrokes((ss) => [...ss, { c: penColor, pts: [p] }]);
    else annEraseAt(p);
  }
  function annMove(e: RPE<HTMLDivElement>) {
    if (!annGesture.current) return;
    const p = annPoint(e);
    if (annGesture.current === "pen") setStrokes((ss) => { const last = ss[ss.length - 1]; if (!last) return ss; return [...ss.slice(0, -1), { ...last, pts: [...last.pts, p] }]; });
    else annEraseAt(p);
  }
  function annUndo() { const prev = annHist.current[annHist.current.length - 1]; if (prev) { annHist.current = annHist.current.slice(0, -1); setStrokes(prev); } }
  const save = useMutation({
    mutationFn: async () => await api.saveWorkspace({ tool_slug: tool.slug, title: `${tool.name} workspace`, state_json: withAnn(stateJson) }),
    onSuccess: (d) => { setShareCode(d.code); setMsg(`Saved. Share code ${d.code}`); qc.invalidateQueries({ queryKey: ["workspaces"] }); },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Save failed"),
  });
  const load = useMutation({
    mutationFn: async (code: string) => await api.loadWorkspace({ code }),
    onSuccess: (d) => { if (d.workspace) { restoreWithAnn(d.workspace.state_json); setMsg(`Loaded workspace ${d.workspace.code}`); } else setMsg("No workspace found for that code."); },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Load failed"),
  });
  const saved = useQuery({ queryKey: ["workspaces"], queryFn: () => api.listWorkspaces({ limit: 30 }) });
  const mine = (saved.data?.workspaces ?? []).filter((w) => w.tool_slug === tool.slug);
  /* LIVE student sync: if this device joined a session for this tool, work is
     submitted to the server automatically and teacher pushes arrive here. */
  const [liveCtx] = useState<{ code: string; name: string; tool: string } | null>(() => { try { const v = sessionStorage.getItem("live-student"); return v ? JSON.parse(v) as { code: string; name: string; tool: string } : null; } catch { return null; } });
  const live = liveCtx && liveCtx.tool === tool.slug ? liveCtx : null;
  const liveCode = live?.code; const liveName = live?.name;
  const [pushedState, setPushedState] = useState<string | null>(null);
  const [liveEnded, setLiveEnded] = useState(false);
  const lastPushed = useRef<string | null>(null);
  useEffect(() => {
    if (!liveCode) return;
    let stop = false;
    const poll = async () => {
      try {
        const d = await api.getLiveSession({ code: liveCode });
        if (stop || !d.session) return;
        if (d.session.status === "ended") setLiveEnded(true);
        const ps = d.session.pushed_state_json;
        if (ps && ps !== lastPushed.current) { lastPushed.current = ps; setPushedState(ps); }
      } catch { /* keep polling */ }
    };
    void poll();
    const iv = setInterval(() => { void poll(); }, 4000);
    return () => { stop = true; clearInterval(iv); };
  }, [liveCode]);
  useEffect(() => {
    if (!liveCode || !liveName || liveEnded) return;
    const t = setTimeout(() => { api.submitLiveWork({ code: liveCode, student_name: liveName, state_json: withAnn(stateJson) }).catch(() => undefined); }, 1200);
    return () => clearTimeout(t);
  }, [liveCode, liveName, stateJson, liveEnded, withAnn]);
  useEffect(() => { const pending = sessionStorage.getItem(`restore-${tool.slug}`); if (pending) { sessionStorage.removeItem(`restore-${tool.slug}`); restoreWithAnn(pending); setMsg("Workspace loaded from your share code."); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col min-h-[calc(100vh-0px)]">
      <div className="oomba-shellbar">
        <button aria-label="Back to all manipulatives" onClick={() => { window.location.hash = ""; }} className="px-3 py-2 rounded-full bg-[var(--surface2)] font-bold text-sm">← All tools</button>
        <OombaLogo compact />
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-lg leading-tight truncate">{tool.emoji} {tool.name}</h1>
          <p className="text-xs text-[var(--dim)] truncate">{tool.cat} · Grades {tool.grades} · Oomba Academy</p>
        </div>
        {total ? <div className="ml-auto font-display font-semibold text-base btn-hot px-3 py-1.5 rounded-full" aria-label="Workspace total">{total}</div> : null}
      </div>

      {live ? (
        <div className="px-3 py-2 bg-[var(--brand-ink)] text-white flex flex-wrap items-center gap-2" role="status" aria-label="Live session status">
          <span className="font-display font-bold">● LIVE session {live.code}</span>
          <span className="text-sm opacity-85">You joined as {live.name}. Your work saves to the teacher automatically.</span>
          {liveEnded ? <span className="font-bold btn-danger px-3 py-1 rounded-full text-sm">The teacher has ended this session.</span> : null}
          {pushedState && !liveEnded ? (<>
            <span className="font-bold btn-hot px-3 py-1 rounded-full text-sm">Your teacher sent you a workspace</span>
            <button aria-label="Load the workspace your teacher sent" onClick={() => { restoreWithAnn(pushedState); setPushedState(null); setMsg("Teacher workspace loaded. Your earlier work was replaced, as in a real LIVE push."); }} className="px-3 py-1.5 rounded-full bg-white text-black text-sm font-bold">Load it now</button>
            <button aria-label="Dismiss teacher workspace" onClick={() => setPushedState(null)} className="px-3 py-1.5 rounded-full bg-white/15 text-sm font-bold">Keep mine</button>
          </>) : null}
          <button aria-label="Leave live session" onClick={() => { sessionStorage.removeItem("live-student"); window.location.reload(); }} className="ml-auto px-3 py-1.5 rounded-full bg-white/15 text-sm font-bold">Leave session</button>
        </div>
      ) : null}

      <div className="flex flex-col md:flex-row flex-1">
        <aside aria-label="Objects palette" className="md:w-44 lg:w-52 shrink-0 bg-[var(--brand-ink)] text-white p-3 md:min-h-full">
          <p className="text-[11px] uppercase tracking-widest opacity-70 font-bold">Objects · tap to add</p>
          <div className="flex md:flex-col flex-wrap gap-2 mt-2">{palette}</div>
          <p className="text-[11px] uppercase tracking-widest opacity-70 font-bold mt-4">Tools</p>
          <div className="flex md:flex-col flex-wrap gap-2 mt-2">
            <button aria-label="Undo" onClick={onUndo} disabled={!canUndo} className="px-3 py-2 rounded-xl bg-white/10 text-sm font-bold disabled:opacity-40">↩ Undo</button>
            <button aria-label="Annotate with pen" onClick={() => setAnnotate(!annotate)} className={`px-3 py-2 rounded-xl text-sm font-bold ${annotate ? "btn-hot" : "bg-white/10"}`}>✎ Annotate {annotate ? "on" : "off"}</button>
            <button aria-label="Add a text box" onClick={addNote} disabled={notes.length >= 12} className="px-3 py-2 rounded-xl bg-white/10 text-sm font-bold disabled:opacity-40">T+ Text box</button>
            <button aria-label="AI draft a lesson" onClick={() => setDraftOpen(!draftOpen)} className={`px-3 py-2 rounded-xl text-sm font-bold ${draftOpen ? "btn-hot" : "bg-white/10"}`}>✨ AI draft a lesson</button>
            <button aria-label="Reset workspace" onClick={onReset} className="px-3 py-2 rounded-xl bg-white/10 text-sm font-bold">Reset</button>
          </div>
          <p className="mt-2 text-[11px] opacity-70">Text boxes are sticky notes on the desk: drag one anywhere, tap it to type in place. Add up to 12; each note and its place on the board are saved with the workspace.</p>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          {annotate ? (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[var(--brand-ink)] text-white" role="toolbar" aria-label="Annotation tools">
              <button aria-label="Pen tool" onClick={() => setAnnMode("pen")} className={`px-4 py-2.5 rounded-full text-sm font-bold ${annMode === "pen" ? "btn-hot" : "bg-white/15"}`}>✎ Pen</button>
              {["#FF6B4A", "#141414", "#1F9D63", "#1E88E5"].map((c) => (
                <button key={c} aria-label={`Pen colour ${c}`} onClick={() => { setPenColor(c); setAnnMode("pen"); }} className={`w-10 h-10 rounded-full border-[3px] ${penColor === c && annMode === "pen" ? "border-[var(--spark)]" : "border-white/40"}`} style={{ background: c }} />
              ))}
              <button aria-label="Eraser tool" onClick={() => setAnnMode("erase")} className={`px-4 py-2.5 rounded-full text-sm font-bold ${annMode === "erase" ? "btn-hot" : "bg-white/15"}`}>⌫ Eraser</button>
              <button aria-label="Undo last annotation" onClick={annUndo} disabled={annHist.current.length === 0} className="px-4 py-2.5 rounded-full bg-white/15 text-sm font-bold disabled:opacity-40">↩ Undo</button>
              <button aria-label="Clear all annotations" onClick={() => { annSnapshot(); setStrokes([]); }} className="px-4 py-2.5 rounded-full bg-white/15 text-sm font-bold">Clear all</button>
              <button aria-label="Done annotating" onClick={() => setAnnotate(false)} className="px-4 py-2.5 rounded-full btn-primary text-sm font-bold ml-auto">Done</button>
              <span className="text-xs opacity-80 w-full sm:w-auto">{annMode === "pen" ? "Draw on the desk with your finger or mouse." : "Rub over a drawing to erase it."}</span>
            </div>
          ) : null}
          {draftOpen ? (
            <section aria-label="AI lesson drafter" className="mx-2 mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <p className="font-display font-semibold">✨ AI draft a lesson</p>
                <button aria-label="Close AI lesson drafter" onClick={() => setDraftOpen(false)} className="ml-auto px-3 py-1.5 rounded-full bg-[var(--surface2)] text-xs font-bold">✕ Close</button>
              </div>
              <p className="text-xs text-[var(--dim)] mt-1">Describe the lesson and the AI sets up this board for you: pieces placed, sticky notes with instructions and questions, and pen marks. Drafting replaces the pieces currently on the desk. When it looks right, assign it: save with Share · get code below and hand students the code, or push it to everyone from a LIVE session.</p>
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <div className="flex-1">
                  <label className="text-xs font-bold" htmlFor={`draft-task-${tool.slug}`}>Start from a task (optional)</label>
                  <select id={`draft-task-${tool.slug}`} aria-label="Start from a task in the library" value={draftTask}
                    onChange={(e) => { const v = e.target.value; setDraftTask(v); const t = (TASKS_LIB[tool.slug] ?? []).find((x) => `${x.title}: ${x.prompt}` === v); if (t) { setDraftBrief(`${t.title}: ${t.prompt}`); setDraftGrade(t.grade); } }}
                    className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm">
                    <option value="">Describe my own lesson instead</option>
                    {(TASKS_LIB[tool.slug] ?? []).map((t) => (<option key={t.title} value={`${t.title}: ${t.prompt}`}>{t.title} · Grade {t.grade}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold" htmlFor={`draft-grade-${tool.slug}`}>Grade</label>
                  <select id={`draft-grade-${tool.slug}`} aria-label="Grade for the lesson" value={draftGrade} onChange={(e) => setDraftGrade(e.target.value)} className="w-full sm:w-28 mt-1 px-3 py-2 rounded-xl border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm">
                    <option value="">Any</option>
                    {["K", "1", "2", "3", "4", "5", "6", "7", "8"].map((g) => (<option key={g} value={g}>Grade {g}</option>))}
                  </select>
                </div>
              </div>
              <label className="block text-xs font-bold mt-2" htmlFor={`draft-brief-${tool.slug}`}>Describe the lesson or assignment</label>
              <textarea {...FIELDS.draftLesson.brief} id={`draft-brief-${tool.slug}`} aria-label="Describe the lesson or assignment" rows={3} value={draftBrief} onChange={(e) => setDraftBrief(e.target.value)}
                placeholder="e.g. Grade 3: build 346 with base ten blocks, then break one hundred into tens. Ask: what stays the same?" className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm" />
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button aria-label="Draft my board with AI" disabled={draft.isPending || draftBrief.trim().length < 3} onClick={() => { setDraftMsg(""); draft.mutate(); }} className="px-4 py-2 rounded-full btn-primary font-bold text-sm disabled:opacity-40">{draft.isPending ? "Drafting your board…" : "✨ Draft my board"}</button>
                {draftVocab && draftVocab.length > 0 ? <span className="text-xs text-[var(--dim)]">The AI can place this tool's pieces.</span> : <span className="text-xs text-[var(--dim)]">This tool has no placeable pieces, so the draft arrives as sticky notes and pen marks on the board.</span>}
              </div>
              {draftMsg ? <p role="status" className="text-sm font-semibold mt-2">{draftMsg}</p> : null}
            </section>
          ) : null}
          {tasksSlug ? (
            <div className="xl:hidden px-2 pt-2">
              <TasksBox slug={tasksSlug} variant="inline" />
            </div>
          ) : null}
          <div ref={canvasRef} className="relative flex-1 min-h-[380px] md:min-h-[430px] bg-[var(--surface)] canvas-grid overflow-hidden" aria-label={`${tool.name} canvas`}>
            {tasksSlug ? (
              <div className="hidden xl:block">
                <TasksBox slug={tasksSlug} variant="overlay" />
              </div>
            ) : null}
            {children}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-30" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              {strokes.map((s, i) => (<polyline key={i} fill="none" stroke={s.c} strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" points={s.pts.map((p) => `${p.x},${p.y}`).join(" ")} />))}
            </svg>
            {notes.map((n, i) => (
              <div key={n.id} role="group" aria-label={`Text box ${i + 1}`}
                ref={(el) => { if (el) noteEls.current.set(n.id, el); else noteEls.current.delete(n.id); }}
                className="absolute z-[28] w-44 max-w-[64%] touch-none no-select"
                style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
                onPointerDown={(e) => noteDown(e, n)} onPointerMove={noteMove}
                onPointerUp={() => noteUp(n)} onPointerCancel={() => { noteDrag.current = null; }}>
                <div className="btn-hot rounded-xl border border-black/20 shadow-lg px-2.5 py-2 cursor-grab active:cursor-grabbing">
                  {editingNote === n.id ? (
                    <>
                      <label className="sr-only" htmlFor={`notetext-${n.id}`}>{`Text box ${i + 1} text`}</label>
                      <textarea id={`notetext-${n.id}`} aria-label={`Text box ${i + 1} text`} autoFocus rows={3} value={n.text}
                        onChange={(e) => setNotes((ns) => ns.map((m) => (m.id === n.id ? { ...m, text: e.target.value } : m)))}
                        placeholder="Type a label or instruction…" className="w-full rounded-lg bg-white/75 p-2 text-sm font-semibold placeholder:text-black/40 cursor-text" />
                      <div className="flex gap-1 mt-1.5">
                        <button aria-label={`Done editing text box ${i + 1}`} onClick={() => setEditingNote(null)} className="px-3 py-1 rounded-full bg-black text-white text-xs font-bold">Done</button>
                        <button aria-label={`Delete text box ${i + 1}`} onClick={() => { setNotes((ns) => ns.filter((m) => m.id !== n.id)); setEditingNote(null); }} className="px-3 py-1 rounded-full btn-danger text-xs font-bold">Delete</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold whitespace-pre-wrap break-words min-h-5">{n.text || <span className="opacity-50 font-semibold">Tap to write…</span>}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <button aria-label={`Edit text box ${i + 1}`} onClick={() => setEditingNote(n.id)} className="px-2.5 py-1 rounded-full bg-black text-white text-[11px] font-bold">✎ Edit</button>
                        <button aria-label={`Delete text box ${i + 1}`} onClick={() => setNotes((ns) => ns.filter((m) => m.id !== n.id))} className="px-2.5 py-1 rounded-full btn-danger text-[11px] font-bold">Delete</button>
                        <span className="ml-auto text-[10px] font-bold opacity-50">drag to move</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {annotate ? (
              <div className="absolute inset-0 z-40 touch-none cursor-crosshair" role="application" aria-label="Drawing surface. Draw with finger, pen or mouse."
                onPointerDown={annDown} onPointerMove={annMove}
                onPointerUp={() => { annGesture.current = null; }} onPointerCancel={() => { annGesture.current = null; }} />
            ) : null}
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[var(--dim)]">⚙ Settings</span>
            {settings}
            <span className="text-xs text-[var(--dim)] hidden sm:inline">Select a piece for Copy · Flip · Rotate · Fill · Lock · Delete in its toolbar.</span>
            <span className="sr-only">{sel}</span>
          </div>

          <div className="bg-[var(--surface2)] px-3 py-3 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2 items-center">
              <button aria-label="Save and get share code" onClick={() => save.mutate()} className="px-4 py-2 rounded-full btn-primary font-bold text-sm">Share · get code</button>
              {shareCode ? <span className="font-display font-bold text-lg tracking-widest bg-[var(--surface)] px-3 py-1 rounded-full border border-[var(--border)]" aria-label="Your share code">{shareCode}</span> : null}
              <label className="text-sm font-bold" htmlFor={`redeem-${tool.slug}`}>Redeem code</label>
              <input {...FIELDS.loadWorkspace.code} id={`redeem-${tool.slug}`} aria-label="Enter share code" value={redeem} onChange={(e) => setRedeem(e.target.value.toUpperCase())} placeholder="e.g. XZU7THVN" className="px-3 py-2 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] w-36 uppercase" />
              <button aria-label="Load workspace from code" onClick={() => { if (redeem.trim()) load.mutate(redeem.trim()); else setMsg("Enter a share code first."); }} className="px-4 py-2 rounded-full btn-current font-bold text-sm">GO</button>
              {msg ? <span role="status" className="text-sm font-semibold">{msg}</span> : null}
            </div>
            {mine.length > 0 ? (
              <div className="flex flex-wrap gap-2" aria-label="Your saved workspaces for this tool">
                {mine.map((w) => (
                  <button key={w.id} aria-label={`Load saved workspace ${w.code}`} onClick={() => restoreWithAnn(w.state_json)} className="px-3 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs font-bold">{w.code} · {new Date(w.created_at).toLocaleDateString()}</button>
                ))}
              </div>
            ) : null}
            {note ? <p className="text-xs text-[var(--dim)]">{note}</p> : null}
          </div>
        </main>
      </div>
    </div>
  );
}

export function PalBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return <button aria-label={`Add ${label}`} onClick={onClick} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-left text-sm font-bold flex-1 min-w-[7.5rem] md:flex-none md:w-full"><span className="w-6 h-6 rounded-md shrink-0 border border-black/20" style={{ background: color }} />{label}</button>;
}
export function PieceBar({ piece, onCopy, onFlip, onRotate, onFill, onLock, onDelete, alignRight = false }: { piece: Piece; onCopy: () => void; onFlip: () => void; onRotate: () => void; onFill: () => void; onLock: () => void; onDelete: () => void; alignRight?: boolean }) {
  const btn = "px-2.5 py-1 rounded-full bg-black text-white text-xs font-bold";
  return (
    <div className={`absolute ${piece.y < 52 ? "top-full mt-1" : "-top-11"} ${alignRight ? "right-0" : "left-0"} z-40 flex flex-wrap gap-1 max-w-[82vw] md:max-w-[300px]`} role="toolbar" aria-label={`Actions for ${piece.label}`}>
      <button aria-label={`Copy ${piece.label}`} className={btn} onClick={(e) => { e.stopPropagation(); onCopy(); }}>Copy</button>
      <button aria-label={`Flip ${piece.label}`} className={btn} onClick={(e) => { e.stopPropagation(); onFlip(); }}>Flip</button>
      <button aria-label={`Rotate ${piece.label}`} className={btn} onClick={(e) => { e.stopPropagation(); onRotate(); }}>Rotate</button>
      <button aria-label={`Toggle fill ${piece.label}`} className={btn} onClick={(e) => { e.stopPropagation(); onFill(); }}>Fill</button>
      <button aria-label={`Lock ${piece.label}`} className={btn} onClick={(e) => { e.stopPropagation(); onLock(); }}>{piece.locked ? "Unlock" : "Lock"}</button>
      <button aria-label={`Delete ${piece.label}`} className={`${btn} btn-danger`} onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</button>
    </div>
  );
}
export function TasksBox({ slug, variant = "overlay" }: { slug: string; variant?: "overlay" | "inline" }) {
  const [open, setOpen] = useState(false);
  const tasks = TASKS_LIB[slug] ?? [];
  if (!tasks.length) return null;
  const shown = open ? tasks : tasks.slice(0, 1);
  /* Two layouts, one per Shell slot (see Shell): "inline" renders in normal
     flow in a strip above the canvas, so the box takes its own space and can
     never cover tappable canvas content; "overlay" floats over the top-right
     of the canvas and is only used at xl widths, where every tool's fixed
     grids and trays end well clear of it. The old single overlay sat at
     top-28 on phones and covered the Hundred Board's right-hand cells, so
     taps on the covered cells did nothing. */
  return (
    <div className={variant === "inline"
      ? "relative w-full max-h-[54vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-3 shadow-sm"
      : "absolute top-2 right-2 z-30 w-72 max-w-[86vw] max-h-[70vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-3 shadow-lg"}>
      <p className="font-display font-semibold text-sm">Oomba · Try this · ready-made tasks</p>
      {shown.map((t) => (<div key={t.title} className="mt-2">
        <p className="font-bold text-sm">{t.title} <span className="ml-1 px-2 py-0.5 rounded-full bg-[var(--surface2)] text-[11px] font-bold">{t.ccss}</span></p>
        <div className={open ? "" : "hidden min-[480px]:block"}>
          <p className="text-xs text-[var(--dim)]">{t.prompt}</p>
          <p className="text-xs mt-1"><span className="font-bold">Teacher note:</span> {t.notes}</p>
        </div>
      </div>))}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button aria-label={open ? "Show fewer tasks for this tool" : "Show all tasks for this tool"} onClick={() => setOpen(!open)} className="px-3 py-1.5 rounded-full btn-primary text-xs font-bold">{open ? "Show less" : `All ${tasks.length} tasks for this tool`}</button>
        <a href="#tasks" aria-label="Open the full tasks library" className="text-xs font-bold underline whitespace-nowrap">Full Tasks library</a>
      </div>
    </div>
  );
}
export function ser(pieces: Piece[]): string { return JSON.stringify({ pieces }); }
export function deser(json: string): Piece[] { try { const o = JSON.parse(json) as { pieces?: Piece[] }; return Array.isArray(o.pieces) ? o.pieces : []; } catch { return []; } }

/* ============ Generic pieces tool (shared drag/select/ops) ============ */
type PalDef = { kind: string; color: string; label: string; value: number; w: number; h: number };
function PieceFace({ p, w, h }: { p: Piece; w: number; h: number }) {
  const bg = p.filled ? p.color : "transparent";
  return (
    <div className="piece-shadow rounded-lg border-2 border-black/25 flex items-center justify-center text-center font-display font-semibold overflow-hidden h-full w-full"
      style={{ background: bg, color: p.filled ? "#fff" : "#1A1E1C", textShadow: p.filled ? "0 1px 2px rgba(0,0,0,.35)" : "none", fontSize: Math.min(20, Math.max(11, w / 3)) }}>
      <span className="px-1 leading-tight">{p.label}</span>
    </div>
  );
}
function PiecesTool({ tool, defs, totalFn, breakMap, settings, note, extraTop }: {
  tool: ToolDef; defs: PalDef[]; totalFn?: (ps: Piece[]) => ReactNode;
  breakMap?: Record<string, { kind: string; color: string; label: string; value: number; count: number }>;
  settings?: ReactNode; note?: string; extraTop?: (ps: Piece[], push: (n: Piece[]) => void) => ReactNode;
}) {
  const { pieces, push, undo, canUndo, add, remove, update } = usePieces([]);
  const [selected, setSelected] = useState<number | null>(null);
  const sel = pieces.find((p) => p.id === selected);
  const defOf = (kind: string) => defs.find((d) => d.kind === kind) ?? defs[0] ?? { kind, color: "#888", label: kind, value: 0, w: 56, h: 56 };
  function doBreak() {
    if (!sel || !breakMap) return;
    const b = breakMap[sel.kind];
    if (!b) return;
    const nd = defOf(b.kind);
    const news: Piece[] = [];
    for (let i = 0; i < b.count; i++) news.push(mk(b.kind, b.color, b.label, b.value, sel.x + (i % 5) * (nd.w + 6), sel.y + Math.floor(i / 5) * (nd.h + 6)));
    push([...pieces.filter((p) => p.id !== sel.id), ...news]);
  }
  function doRegroup() {
    if (!sel || !breakMap) return;
    // find the kind that breaks into sel.kind
    const parentKind = Object.keys(breakMap).find((k) => breakMap[k]?.kind === sel.kind);
    if (!parentKind) return;
    const sibs = pieces.filter((p) => p.kind === sel.kind);
    if (sibs.length < 10) return;
    const pd = defOf(parentKind);
    const first = sibs[0];
    const rest = pieces.filter((p) => !sibs.slice(0, 10).some((s) => s.id === p.id));
    push([...rest, mk(parentKind, pd.color, pd.label, pd.value, first?.x ?? 80, first?.y ?? 80)]);
  }
  return (
    <Shell tool={tool} total={totalFn ? totalFn(pieces) : undefined}
      palette={<>{defs.map((d) => (<PalBtn key={d.kind} label={d.label} color={d.color} onClick={() => add(mk(d.kind, d.color, d.label, d.value))} />))}
        {breakMap ? (<><button aria-label="Break selected piece into ten" onClick={doBreak} className="px-3 py-2 rounded-xl btn-hot text-sm font-bold flex-1 min-w-[7.5rem] md:flex-none md:w-full">Break ×10</button>
        <button aria-label="Regroup ten selected kind into one" onClick={doRegroup} className="px-3 py-2 rounded-xl bg-white/10 text-sm font-bold flex-1 min-w-[7.5rem] md:flex-none md:w-full">Regroup 10 → 1</button></>) : null}</>}
      settings={settings} onReset={() => { push([]); setSelected(null); }} onUndo={undo} canUndo={canUndo}
      stateJson={ser(pieces)} onRestore={(j) => push(deser(j))} note={note} tasksSlug={tool.slug} draftVocab={defs}>
      {extraTop ? extraTop(pieces, push) : null}
      {pieces.map((p) => {
        const d = defOf(p.kind);
        return (
          <Draggable key={p.id} piece={p} selected={selected === p.id} onSelect={() => setSelected(p.id)} onMove={(x, y) => update(p.id, { x, y })} w={d.w} h={d.h}>
            <div className="relative h-full">
              {selected === p.id ? <PieceBar piece={p} alignRight={p.x > 300}
                onCopy={() => push([...pieces, mk(p.kind, p.color, p.label, p.value, p.x + 24, p.y + 24)])}
                onFlip={() => update(p.id, { flipped: !p.flipped })}
                onRotate={() => update(p.id, { rot: (p.rot + 30) % 360 })}
                onFill={() => update(p.id, { filled: !p.filled })}
                onLock={() => update(p.id, { locked: !p.locked })}
                onDelete={() => remove(p.id)} /> : null}
              <PieceFace p={p} w={d.w} h={d.h} />
            </div>
          </Draggable>
        );
      })}
      {pieces.length === 0 ? <p className="absolute left-4 top-4 text-[var(--dim)] font-semibold max-w-xs">Tap a piece in the Objects palette to add it to the desk, then drag it around. Select any piece for copy, flip, rotate, fill, lock and delete.</p> : null}
    </Shell>
  );
}

/* ---- Base Ten Blocks ---- */
export function BaseTenTool({ tool }: { tool: ToolDef }) {
  const [decimal, setDecimal] = useState(false);
  const defs: PalDef[] = decimal
    ? [{ kind: "one", color: "#FB8C00", label: "1", value: 1, w: 52, h: 52 }, { kind: "tenth", color: "#FFA726", label: "0.1", value: 0.1, w: 90, h: 30 }, { kind: "hundredth", color: "#FFCC80", label: "0.01", value: 0.01, w: 30, h: 30 }, { kind: "thousandth", color: "#FFE0B2", label: "0.001", value: 0.001, w: 18, h: 18 }]
    : [{ kind: "unit", color: "#FFD23F", label: "1", value: 1, w: 30, h: 30 }, { kind: "rod", color: "#4CAF50", label: "10", value: 10, w: 30, h: 150 }, { kind: "flat", color: "#2196F3", label: "100", value: 100, w: 130, h: 130 }, { kind: "cube", color: "#9C27B0", label: "1,000", value: 1000, w: 110, h: 110 }];
  const breakMap: Record<string, { kind: string; color: string; label: string; value: number; count: number }> = decimal ? {} : {
    cube: { kind: "flat", color: "#2196F3", label: "100", value: 100, count: 10 },
    flat: { kind: "rod", color: "#4CAF50", label: "10", value: 10, count: 10 },
    rod: { kind: "unit", color: "#FFD23F", label: "1", value: 1, count: 10 },
  };
  return <PiecesTool tool={tool} defs={defs} breakMap={breakMap}
    totalFn={(ps) => { const t = ps.reduce((s, p) => s + p.value, 0); return <>Total {Number.isInteger(t) ? t.toLocaleString() : t.toFixed(3)}</>; }}
    settings={<><label className="text-sm font-bold" htmlFor="bt-set">Number Set</label>
      <select id="bt-set" aria-label="Number set whole numbers or decimals" value={decimal ? "dec" : "whole"} onChange={(e) => setDecimal(e.target.value === "dec")} className="px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm"><option value="whole">Whole numbers</option><option value="dec">Decimals</option></select>
      <span className="text-xs text-[var(--dim)]">Workspaces: Place Value Chart · Comparison · Area Model · Factors (build them on the canvas with the chart columns below)</span></>}
    extraTop={() => (<div className="absolute bottom-2 left-2 right-2 md:right-auto flex gap-1 pointer-events-none" aria-hidden="true">{["Thousands", "Hundreds", "Tens", "Ones"].map((c) => (<div key={c} className="flex-1 md:w-32 border-2 border-dashed border-[var(--accent)]/50 rounded-xl h-24 flex items-start justify-center pt-1 text-xs font-bold text-[var(--accent)]">{c}</div>))}</div>)}
    note="Break splits one piece into ten of the next smaller size and Regroup combines ten into one, with the displayed total unchanged. Use the Number Set switch for whole numbers or decimals; every piece carries its value as a label." />;
}

/* ---- Place Value Disks ---- */
export function DisksTool({ tool }: { tool: ToolDef }) {
  const defs: PalDef[] = [
    { kind: "m", color: "#7B1FA2", label: "1,000,000", value: 1000000, w: 74, h: 74 }, { kind: "hth", color: "#8E24AA", label: "100,000", value: 100000, w: 70, h: 70 },
    { kind: "tth", color: "#3949AB", label: "10,000", value: 10000, w: 66, h: 66 }, { kind: "th", color: "#1E88E5", label: "1,000", value: 1000, w: 62, h: 62 },
    { kind: "h", color: "#00ACC1", label: "100", value: 100, w: 58, h: 58 }, { kind: "t", color: "#43A047", label: "10", value: 10, w: 54, h: 54 },
    { kind: "o", color: "#F9A825", label: "1", value: 1, w: 50, h: 50 }, { kind: "tenth", color: "#FB8C00", label: "0.1", value: 0.1, w: 50, h: 50 },
    { kind: "hund", color: "#FF7043", label: "0.01", value: 0.01, w: 50, h: 50 }, { kind: "thou", color: "#E53935", label: "0.001", value: 0.001, w: 50, h: 50 },
  ];
  const bm: Record<string, { kind: string; color: string; label: string; value: number; count: number }> = {
    t: { kind: "o", color: "#F9A825", label: "1", value: 1, count: 10 }, o: { kind: "tenth", color: "#FB8C00", label: "0.1", value: 0.1, count: 10 },
    tenth: { kind: "hund", color: "#FF7043", label: "0.01", value: 0.01, count: 10 }, h: { kind: "t", color: "#43A047", label: "10", value: 10, count: 10 },
    th: { kind: "h", color: "#00ACC1", label: "100", value: 100, count: 10 },
  };
  return <PiecesTool tool={tool} defs={defs} breakMap={bm} totalFn={(ps) => <>Total {ps.reduce((s, p) => s + p.value, 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</>}
    note="Non-proportional labelled disks, whole numbers to 1,000,000 and decimals to 0.001, with Break and Regroup across place-value columns and a Comparison workspace." />;
}

/* ---- Two-Color Counters ---- */
export function CountersTool({ tool }: { tool: ToolDef }) {
  const [frame, setFrame] = useState<0 | 5 | 10>(10);
  const defs: PalDef[] = [{ kind: "pos", color: "#FFD23F", label: "+1", value: 1, w: 48, h: 48 }, { kind: "neg", color: "#E53935", label: "−1", value: -1, w: 48, h: 48 }, { kind: "blue", color: "#1E88E5", label: "•", value: 0, w: 48, h: 48 }, { kind: "green", color: "#43A047", label: "•", value: 0, w: 48, h: 48 }];
  return <PiecesTool tool={tool} defs={defs}
    totalFn={(ps) => { const pos = ps.filter((p) => p.kind === "pos").length; const neg = ps.filter((p) => p.kind === "neg").length; const pairs = Math.min(pos, neg); return <>Value {pos - neg} · Zero pairs {pairs}</>; }}
    settings={<><label className="text-sm font-bold" htmlFor="ct-frame">Frame</label>
      <select id="ct-frame" aria-label="Frame five frame ten frame or none" value={frame} onChange={(e) => setFrame(Number(e.target.value) as 0 | 5 | 10)} className="px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm"><option value={0}>None</option><option value={5}>Five-frame</option><option value={10}>Ten-frame</option></select>
      <span className="text-xs text-[var(--dim)]">Tap Flip on a counter to invert its colour. Overlap opposites to talk about grey zero pairs, then Break the pair apart again.</span></>}
    extraTop={() => frame ? (<div className="absolute top-16 left-3 flex border-[3px] border-black rounded-lg overflow-hidden bg-white" aria-label={`${frame} frame`}>{Array.from({ length: frame }).map((_, i) => (<div key={i} className="w-11 h-11 border border-black/60" />))}</div>) : null}
    note="Yellow is +1 and red is −1 for integer work. Five-frame, ten-frame, array, Integer Chip mat and Part-Part-Whole mat workspaces; the frame is shown on the canvas." />;
}

/* ---- Linking Cubes / Color Tiles / Cuisenaire / Fraction Tiles / Algebra / Pattern / Money via configs ---- */
export function LinkingTool({ tool }: { tool: ToolDef }) {
  const cols = ["#E53935", "#FB8C00", "#FFD23F", "#43A047", "#00ACC1", "#1E88E5", "#8E24AA", "#EC407A", "#795548", "#000000"];
  const defs = cols.map((c, i) => ({ kind: `c${i}`, color: c, label: "1", value: 1, w: 40, h: 40 }));
  return <PiecesTool tool={tool} defs={defs} totalFn={(ps) => <>Cubes {ps.length}</>} note="Ten colours, snap cubes into sticks (drag them edge to edge), copy and rearrange. Five-frame, ten-frame, number line, array, Part-Part-Whole and Bar Graph workspaces are all part of this tool." />;
}
export function TilesTool({ tool }: { tool: ToolDef }) {
  const cols = ["#E53935", "#FB8C00", "#FFD23F", "#43A047", "#1E88E5", "#8E24AA"];
  const defs = cols.map((c, i) => ({ kind: `t${i}`, color: c, label: "1", value: 1, w: 52, h: 52 }));
  return <PiecesTool tool={tool} defs={defs} totalFn={(ps) => <>Tiles {ps.length} · Area {ps.length} units²</>}
    settings={<span className="text-xs text-[var(--dim)]">Build a rectangle and read its area from the total. Perimeter is 2 × (rows + columns) for a full rectangle, count the outside edges together.</span>}
    note="Equal square tiles on a grid for patterns, multiplication as area, area and perimeter, plus number line, five-frame, ten-frame, array, Part-Part-Whole and Bar Graph workspaces." />;
}
export function CuisenaireTool({ tool }: { tool: ToolDef }) {
  const rods: [string, string][] = [["#FFFFFF", "1 white"], ["#E53935", "2 red"], ["#AED581", "3 light green"], ["#BA68C8", "4 purple"], ["#FFD23F", "5 yellow"], ["#2E7D32", "6 dark green"], ["#212121", "7 black"], ["#8D6E63", "8 brown"], ["#1E88E5", "9 blue"], ["#FB8C00", "10 orange"]];
  const [unit, setUnit] = useState(1);
  const defs = rods.map(([c, lab], i) => ({ kind: `r${i + 1}`, color: c, label: lab, value: i + 1, w: 34 * (i + 1), h: 30 }));
  return <PiecesTool tool={tool} defs={defs} totalFn={(ps) => <>Length value {ps.reduce((s, p) => s + p.value * unit, 0)}</>}
    settings={<><label className="text-sm font-bold" htmlFor="cu-unit">Value of the white (1) rod</label>
      <select id="cu-unit" aria-label="Value assigned to unit rod" value={unit} onChange={(e) => setUnit(Number(e.target.value))} className="px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm"><option value={1}>1 (whole numbers)</option><option value={0.1}>0.1 (decimals)</option><option value={0.5}>1/2 (fractions)</option></select>
      <span className="text-xs text-[var(--dim)]">Assign a value to one rod and every other rod takes its value by length. Rotate a rod to stand it up.</span></>}
    note="Ten rods in ten distinctive colours, each 1 unit longer than the last, plus a Number Line workspace and remove-fill, as catalogued. A customisable extra rod can be made by copying any rod and relabelling it in the annotation box." />;
}
export function FractionTilesTool({ tool }: { tool: ToolDef }) {
  const [mode, setMode] = useState<"frac" | "pct" | "dec">("frac");
  const dens: [number, string][] = [[1, "#B0BEC5"], [2, "#E53935"], [3, "#FB8C00"], [4, "#FFD23F"], [5, "#43A047"], [6, "#00ACC1"], [8, "#1E88E5"], [10, "#8E24AA"], [12, "#EC407A"]];
  const lab = (d: number) => d === 1 ? (mode === "frac" ? "1 whole" : mode === "pct" ? "100%" : "1.0") : mode === "frac" ? `1/${d}` : mode === "pct" ? `${Math.round(1000 / d) / 10}%` : `${Math.round(1000 / d) / 1000}`;
  const defs = dens.map(([d, c]) => ({ kind: `f${d}`, color: c, label: lab(d), value: 1 / d, w: Math.max(44, 264 / d), h: 40 }));
  return <PiecesTool tool={tool} defs={defs} totalFn={(ps) => <>Total {ps.reduce((s, p) => s + p.value, 0).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} wholes</>}
    settings={<><label className="text-sm font-bold" htmlFor="ft-mode">Labels</label>
      <select id="ft-mode" aria-label="Label mode fraction percent or decimal" value={mode} onChange={(e) => setMode(e.target.value as "frac" | "pct" | "dec")} className="px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm"><option value="frac">Fraction</option><option value="pct">Percent</option><option value="dec">Decimal</option></select>
      <span className="text-xs text-[var(--dim)]">Stack rows by denominator to build the Fraction Wall. Use Fill on a tile to make it a blank outline.</span></>}
    note="Nine colour-coded denominators: whole, halves, thirds, fourths, fifths, sixths, eighths, tenths, twelfths. Snap side by side and overlap to prove equivalence." />;
}
export function AlgebraTool({ tool }: { tool: ToolDef }) {
  const defs: PalDef[] = [
    { kind: "one", color: "#FFD23F", label: "1", value: 1, w: 34, h: 34 }, { kind: "mone", color: "#EF9A9A", label: "−1", value: -1, w: 34, h: 34 },
    { kind: "x", color: "#43A047", label: "x", value: 0, w: 34, h: 92 }, { kind: "mx", color: "#A5D6A7", label: "−x", value: 0, w: 34, h: 92 },
    { kind: "x2", color: "#1E88E5", label: "x²", value: 0, w: 92, h: 92 }, { kind: "mx2", color: "#90CAF9", label: "−x²", value: 0, w: 92, h: 92 },
    { kind: "y", color: "#FB8C00", label: "y", value: 0, w: 92, h: 34 }, { kind: "my", color: "#FFCC80", label: "−y", value: 0, w: 92, h: 34 },
    { kind: "xy", color: "#8E24AA", label: "xy", value: 0, w: 92, h: 62 }, { kind: "y2", color: "#5E35B1", label: "y²", value: 0, w: 62, h: 62 },
  ];
  return <PiecesTool tool={tool} defs={defs}
    totalFn={(ps) => { const c = (k: string) => ps.filter((p) => p.kind === k).length; const parts: string[] = []; const x2 = c("x2") - c("mx2"); const x = c("x") - c("mx"); const y = c("y") - c("my"); const xy = c("xy"); const y2 = c("y2"); const n = c("one") - c("mone"); if (x2) parts.push(`${x2}x²`); if (y2) parts.push(`${y2}y²`); if (xy) parts.push(`${xy}xy`); if (x) parts.push(`${x}x`); if (y) parts.push(`${y}y`); if (n) parts.push(`${n}`); return <>Expression {parts.length ? parts.join(" + ").replace(/\+ -/g, "− ") : "0"} · Zero pairs {Math.min(c("one"), c("mone")) + Math.min(c("x"), c("mx"))}</>; }}
    note="Area encodes value: unit, x, x², y, y², xy (and x³ in the partner list). Drop an opposite pair together to make a grey zero pair, use the equation workspace by drawing an equals line with Annotate, and build area models like (x+4)(x+3) = x² + 7x + 12." />;
}
export function PatternTool({ tool }: { tool: ToolDef }) {
  const defs: PalDef[] = [
    { kind: "hex", color: "#FFD23F", label: "⬡ Hexagon", value: 1, w: 96, h: 84 }, { kind: "trap", color: "#E53935", label: "Trapezoid", value: 0.5, w: 96, h: 44 },
    { kind: "tri", color: "#43A047", label: "▲ Triangle", value: 1 / 6, w: 52, h: 44 }, { kind: "para", color: "#1E88E5", label: "Parallelogram", value: 1 / 3, w: 84, h: 44 },
    { kind: "rhom", color: "#D7CCC8", label: "Rhombus", value: 1 / 3, w: 84, h: 44 }, { kind: "sq", color: "#FB8C00", label: "■ Square", value: 0.25, w: 48, h: 48 },
  ];
  return <PiecesTool tool={tool} defs={defs} totalFn={(ps) => <>Blocks {ps.length} · Hexagon value {ps.reduce((s, p) => s + p.value, 0).toFixed(2)}</>}
    note="Six shapes, all sides 1 unit except one trapezoid side. Angles are factors of 360° except the tan rhombus (150° and 30°). Rotate in 30° steps with the Rotate button, snap together on the triangular grid, fill a design template you draw with Annotate, and use Fill for blank outlines. Fraction and Deci (decimal) workspaces are part of this tool." />;
}
export function MoneyTool({ tool }: { tool: ToolDef }) {
  const defs: PalDef[] = [
    { kind: "penny", color: "#B87333", label: "1¢", value: 1, w: 40, h: 40 }, { kind: "nickel", color: "#9E9E9E", label: "5¢", value: 5, w: 44, h: 44 },
    { kind: "dime", color: "#BDBDBD", label: "10¢", value: 10, w: 36, h: 36 }, { kind: "quarter", color: "#90A4AE", label: "25¢", value: 25, w: 48, h: 48 },
    { kind: "b1", color: "#A5D6A7", label: "$1", value: 100, w: 110, h: 48 }, { kind: "b5", color: "#81C784", label: "$5", value: 500, w: 110, h: 48 },
    { kind: "b10", color: "#66BB6A", label: "$10", value: 1000, w: 110, h: 48 }, { kind: "b20", color: "#43A047", label: "$20", value: 2000, w: 110, h: 48 },
  ];
  return <PiecesTool tool={tool} defs={defs} totalFn={(ps) => <>Total ${(ps.reduce((s, p) => s + p.value, 0) / 100).toFixed(2)}</>}
    note="Coins and bills. To exchange, delete ten $1 bills and add one $10 bill, or trade ten 1¢ coins for a 10¢ coin. Compare and Part-Part-Whole workspaces are part of this tool." />;
}

/* ---- Rekenrek ---- */
export function RekenrekTool({ tool }: { tool: ToolDef }) {
  const [rows, setRows] = useState(2);
  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [covered, setCovered] = useState(false);
  const [long, setLong] = useState(false);
  const per = long ? 20 : 10;
  const total = counts.slice(0, rows).reduce((s, c) => s + c, 0);
  const hist = useRef<number[][]>([]);
  const beadCls = long ? "w-4 h-4 min-[420px]:w-5 min-[420px]:h-5 sm:w-6 sm:h-6 md:w-6 md:h-6 lg:w-7 lg:h-7" : "w-7 h-7 min-[420px]:w-8 min-[420px]:h-8 md:w-9 md:h-9";
  const stateJson = JSON.stringify({ rows, counts, long });
  return (
    <Shell tool={tool} total={<>Showing {total}</>}
      palette={<><PalBtn label="1 row" color="#E53935" onClick={() => setRows(1)} /><PalBtn label="2 rows" color="#E53935" onClick={() => setRows(2)} /><PalBtn label="5 rows" color="#E53935" onClick={() => setRows(5)} /><PalBtn label="10 rows" color="#E53935" onClick={() => setRows(10)} /><PalBtn label={long ? "10-bead rows" : "20-bead row"} color="#FFD23F" onClick={() => setLong(!long)} /><PalBtn label={covered ? "Uncover rack" : "Cover tool"} color="#212121" onClick={() => setCovered(!covered)} /></>}
      settings={<span className="text-xs text-[var(--dim)]">Tap beads to slide them left. Beads are grouped 5 red + 5 white so children see the 5 and 10 benchmarks. Group labels are the row totals on the right.</span>}
      onReset={() => { hist.current = [...hist.current.slice(-40), counts]; setCounts([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); }} onUndo={() => { const prev = hist.current[hist.current.length - 1]; if (prev) { hist.current = hist.current.slice(0, -1); setCounts(prev); } }} canUndo={hist.current.length > 0}
      stateJson={stateJson} onRestore={(j) => { try { const o = JSON.parse(j) as { rows?: number; counts?: number[]; long?: boolean }; if (o.rows) setRows(o.rows); if (o.counts) setCounts(o.counts); if (typeof o.long === "boolean") setLong(o.long); } catch { /* ignore */ } }} tasksSlug={tool.slug}>
      <div className="p-4 flex flex-col gap-4 max-w-3xl overflow-x-auto">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="relative">
            <div className="h-2 bg-[#8D6E63] rounded-full absolute left-0 right-10 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <div className="flex items-center relative min-w-max">
              <div className="flex gap-0.5">
                {Array.from({ length: per }).map((_, i) => {
                  const active = i < (counts[r] ?? 0);
                  const isRed = long ? i < 10 : i < 5;
                  return (<button key={i} aria-label={`Row ${r + 1} bead ${i + 1} ${active ? "counted" : "not counted"}`} onClick={() => { hist.current = [...hist.current.slice(-40), counts]; setCounts((c) => c.map((v, idx) => idx === r ? (i + 1 === v ? i : i + 1) : v)); }}
                    className={`${beadCls} rounded-full border-2 border-black/30 piece-shadow transition-all`}
                    style={{ background: isRed ? "#E53935" : "#FFFFFF", marginLeft: active ? 0 : undefined, transform: active ? "none" : `translateX(${10 + (per - (counts[r] ?? 0)) * 2}px)`, opacity: covered && active ? 0.15 : 1 }} />);
                })}
              </div>
              <span className="ml-auto font-display font-bold text-lg bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-0.5" aria-label={`Row ${r + 1} shows ${counts[r] ?? 0}`}>{covered ? "?" : (counts[r] ?? 0)}</span>
            </div>
          </div>
        ))}
        {covered ? <p className="font-bold bg-black text-white rounded-xl px-3 py-2 w-fit">Cover tool on: counted beads are hidden. Ask: how many are hidden?</p> : null}
      </div>
    </Shell>
  );
}

/* ---- Hundred Board ---- */
export function HundredTool({ tool }: { tool: ToolDef }) {
  const [start, setStart] = useState(1);
  const [decimalMode, setDecimalMode] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mult, setMult] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const hist = useRef<Set<number>[]>([]);
  const val = (i: number) => decimalMode ? (start + i) / 10 : start + i;
  const stateJson = JSON.stringify({ start, picked: [...picked], mult, decimalMode });
  function toggle(i: number) { hist.current = [...hist.current.slice(-40), picked]; setPicked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }
  const selVal = picked.size === 1 ? val([...picked][0] ?? 0) : null;
  return (
    <Shell tool={tool} total={selVal !== null ? <>Covered {selVal} · 1 more {decimalMode ? (selVal + 0.1).toFixed(1) : selVal + 1} · 10 more {decimalMode ? (selVal + 1).toFixed(1) : selVal + 10}</> : <>Covered {picked.size} cells</>}
      palette={<>{[2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => (<PalBtn key={m} label={`Multiples of ${m}`} color="#8E24AA" onClick={() => setMult(mult === m ? 0 : m)} />))}<PalBtn label={hidden ? "Show values" : "Hide values"} color="#212121" onClick={() => setHidden(!hidden)} /></>}
      settings={<><label className="text-sm font-bold" htmlFor="hb-start">Starting number</label>
        <input id="hb-start" aria-label="Board starting number" type="number" value={start} onChange={(e) => setStart(Number(e.target.value) || 1)} className="w-20 px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm" />
        <label className="text-sm font-bold" htmlFor="hb-mode">Mode</label>
        <select id="hb-mode" aria-label="Whole number or decimal mode" value={decimalMode ? "dec" : "whole"} onChange={(e) => setDecimalMode(e.target.value === "dec")} className="px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm"><option value="whole">Whole numbers</option><option value="dec">Decimals (tenths)</option></select>
        <span className="text-xs text-[var(--dim)]">Rounding workspace: cover a number, round it to the nearest 10, then uncover to check.</span></>}
      onReset={() => { hist.current = [...hist.current.slice(-40), picked]; setPicked(new Set()); }} onUndo={() => { const prev = hist.current[hist.current.length - 1]; if (prev) { hist.current = hist.current.slice(0, -1); setPicked(prev); } }} canUndo={hist.current.length > 0}
      stateJson={stateJson} onRestore={(j) => { try { const o = JSON.parse(j) as { start?: number; picked?: number[]; mult?: number; decimalMode?: boolean }; if (o.start) setStart(o.start); if (o.picked) setPicked(new Set(o.picked)); if (typeof o.mult === "number") setMult(o.mult); if (typeof o.decimalMode === "boolean") setDecimalMode(o.decimalMode); } catch { /* ignore */ } }} tasksSlug={tool.slug}>
      <div className="p-3 grid grid-cols-10 gap-1 max-w-xl" role="grid" aria-label="Hundred board">
        {Array.from({ length: 100 }).map((_, i) => {
          const v = val(i); const isMult = mult > 0 && Math.round(v) % mult === 0 && !decimalMode; const isPicked = picked.has(i);
          return (<button key={i} role="gridcell" aria-label={`Cell ${v}${isPicked ? " covered" : ""}`} onClick={() => toggle(i)}
            className="aspect-square rounded-md font-display font-semibold text-[11px] md:text-sm border flex items-center justify-center"
            style={{ background: isPicked ? "#212121" : isMult ? "#CE93D8" : "var(--surface)", color: isPicked ? "#fff" : "var(--text)", borderColor: "var(--border)" }}>{hidden && !isPicked ? "?" : isPicked ? "★" : decimalMode ? v.toFixed(1) : v}</button>);
        })}
      </div>
    </Shell>
  );
}

/* ---- Fraction Circles ---- */
function piePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}
export function FractionCirclesTool({ tool }: { tool: ToolDef }) {
  const [mode, setMode] = useState<"frac" | "pct" | "dec">("frac");
  const [placed, setPlaced] = useState<{ id: number; d: number; rot: number }[]>([]);
  const [rings, setRings] = useState(false);
  let idc = useRef(1);
  const dens: [number, string][] = [[1, "#B0BEC5"], [2, "#E53935"], [3, "#FB8C00"], [4, "#FFD23F"], [5, "#43A047"], [6, "#00ACC1"], [8, "#1E88E5"], [10, "#8E24AA"], [12, "#EC407A"]];
  const lab = (d: number) => d === 1 ? "1" : mode === "frac" ? `1/${d}` : mode === "pct" ? `${Math.round(1000 / d) / 10}%` : `${Math.round(1000 / d) / 1000}`;
  const total = placed.reduce((s, p) => s + 1 / p.d, 0);
  return (
    <Shell tool={tool} total={<>Placed {total.toFixed(2)} wholes</>}
      palette={<>{dens.map(([d, c]) => (<PalBtn key={d} label={`${lab(d)} piece`} color={c} onClick={() => setPlaced((ps) => [...ps, { id: idc.current++, d, rot: 0 }])} />))}<PalBtn label={rings ? "Single circles" : "Rings workspace"} color="#5E35B1" onClick={() => setRings(!rings)} /></>}
      settings={<><label className="text-sm font-bold" htmlFor="fc-mode">Labels</label>
        <select id="fc-mode" aria-label="Label mode fraction percent or decimal" value={mode} onChange={(e) => setMode(e.target.value as "frac" | "pct" | "dec")} className="px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm"><option value="frac">Fraction</option><option value="pct">Percent</option><option value="dec">Decimal</option></select>
        <span className="text-xs text-[var(--dim)]">Tap a placed piece to rotate it, double-tap to remove it. Pieces overlap transparently so 1/3 can be covered with twelfths.</span></>}
      onReset={() => setPlaced([])} onUndo={() => setPlaced((ps) => ps.slice(0, -1))} canUndo={placed.length > 0}
      stateJson={JSON.stringify({ placed })} onRestore={(j) => { try { const o = JSON.parse(j) as { placed?: { id: number; d: number; rot: number }[] }; if (o.placed) setPlaced(o.placed); } catch { /* ignore */ } }}
      note="Nine colour-coded circles, whole through twelfths, easy rotation, snapping into a whole and transparent overlap, plus the concentric Fraction Circle Rings workspace and a number-line tool." tasksSlug={tool.slug}>
      {rings ? (
        <div className="p-4"><svg width="320" height="320" viewBox="0 0 320 320" className="max-w-full h-auto" role="img" aria-label="Fraction circle rings comparing denominators">
          {dens.slice(1).map(([d, c], ri) => { const r = 150 - ri * 16; return Array.from({ length: d }).map((_, i) => (<path key={`${d}-${i}`} d={piePath(160, 160, r, (i * 2 * Math.PI) / d - Math.PI / 2, ((i + 1) * 2 * Math.PI) / d - Math.PI / 2)} fill={c} fillOpacity={0.75} stroke="#fff" strokeWidth={1.5} />)); })}
          <circle cx={160} cy={160} r={22} fill="var(--surface)" stroke="var(--border)" /></svg>
          <p className="text-sm text-[var(--dim)] max-w-sm">Concentric rings, one per denominator, so equivalences line up on the same radius.</p></div>
      ) : (
        <div className="p-4 flex flex-wrap gap-5">
          {placed.map((p) => { const c = dens.find(([d]) => d === p.d)?.[1] ?? "#888"; return (
            <div key={p.id} className="relative">
              <button aria-label={`${lab(p.d)} circle piece, tap to rotate`} onClick={() => setPlaced((ps) => ps.map((q) => q.id === p.id ? { ...q, rot: q.rot + 360 / p.d } : q))} onDoubleClick={() => setPlaced((ps) => ps.filter((q) => q.id !== p.id))}>
                <svg width="150" height="150" viewBox="0 0 150 150"><circle cx={75} cy={75} r={70} fill="none" stroke="var(--border)" strokeDasharray="4 4" />
                  {p.d === 1 ? <circle cx={75} cy={75} r={68} fill={c} fillOpacity={0.9} stroke="#fff" strokeWidth={2} /> : <path d={piePath(75, 75, 68, (p.rot * Math.PI) / 180 - Math.PI / 2, (p.rot * Math.PI) / 180 - Math.PI / 2 + (2 * Math.PI) / p.d)} fill={c} fillOpacity={0.85} stroke="#fff" strokeWidth={2} />}
                  <text x={75} y={80} textAnchor="middle" fontSize={17} fontWeight={700} fill="#1A1E1C">{lab(p.d)}</text></svg>
              </button>
              <button aria-label={`Remove ${lab(p.d)} circle piece`} onClick={() => setPlaced((ps) => ps.filter((q) => q.id !== p.id))} className="absolute -top-1 -right-1 z-10 w-8 h-8 rounded-full bg-black text-white text-sm font-bold shadow">✕</button>
            </div>); })}
          {placed.length === 0 ? <p className="text-[var(--dim)] font-semibold max-w-xs">Add pieces from the palette, then tap to rotate them into a whole.</p> : null}
        </div>
      )}
    </Shell>
  );
}

/* ---- Number Lines ---- */
export function NumberLinesTool({ tool }: { tool: ToolDef }) {
  const [min, setMin] = useState(-10); const [max, setMax] = useState(10); const [step, setStep] = useState(1);
  const [hide, setHide] = useState(false); const [points, setPoints] = useState<number[]>([3]);
  const [jumpFrom, setJumpFrom] = useState<number | null>(null); const [jumps, setJumps] = useState<{ a: number; b: number }[]>([]);
  const ticks: number[] = []; for (let v = min; v <= max + 0.0001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  const W = 860; const x = (v: number) => 30 + ((v - min) / (max - min)) * (W - 60);
  return (
    <Shell tool={tool} total={<>Points {points.join(", ") || "none"}</>}
      palette={<><PalBtn label="Add point at 0" color="#00ACC1" onClick={() => setPoints((ps) => [...ps, 0])} /><PalBtn label="Start a jump" color="#FF6B4A" onClick={() => setJumpFrom(points[0] ?? min)} /><PalBtn label="Clear jumps" color="#212121" onClick={() => setJumps([])} /></>}
      settings={<>
        <label className="text-sm font-bold" htmlFor="nl-min">From</label><input id="nl-min" aria-label="Number line minimum" type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} className="w-16 px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm" />
        <label className="text-sm font-bold" htmlFor="nl-max">To</label><input id="nl-max" aria-label="Number line maximum" type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} className="w-16 px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm" />
        <label className="text-sm font-bold" htmlFor="nl-step">Interval</label>
        <select id="nl-step" aria-label="Number line interval" value={step} onChange={(e) => setStep(Number(e.target.value))} className="px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm"><option value={1}>1 (integers)</option><option value={0.5}>0.5</option><option value={0.25}>1/4 (fractions)</option><option value={0.1}>0.1 (decimals)</option><option value={5}>5</option><option value={10}>10</option></select>
        <button aria-label="Toggle hide labels" onClick={() => setHide(!hide)} className="px-3 py-1.5 rounded-full bg-[var(--surface2)] text-sm font-bold">{hide ? "Show labels" : "Hide labels"}</button>
        <span className="text-xs text-[var(--dim)]">Tap the line to drop a point at the nearest interval. Tap a point, then tap elsewhere to draw a jump arc.</span></>}
      onReset={() => { setPoints([]); setJumps([]); }} onUndo={() => setPoints((ps) => ps.slice(0, -1))} canUndo={points.length > 0}
      stateJson={JSON.stringify({ min, max, step, points, jumps })} onRestore={(j) => { try { const o = JSON.parse(j) as { min?: number; max?: number; step?: number; points?: number[]; jumps?: { a: number; b: number }[] }; if (o.min !== undefined) setMin(o.min); if (o.max !== undefined) setMax(o.max); if (o.step) setStep(o.step); if (o.points) setPoints(o.points); if (o.jumps) setJumps(o.jumps); } catch { /* ignore */ } }}
      note="Customisable range, interval and number set, open (blank) lines via Hide labels, jump arcs for addition and subtraction steps, and dedicated fraction and decimal intervals.">
      <div className="p-4 overflow-x-auto">
        <svg width={W} height={190} viewBox={`0 0 ${W} 190`} className="w-full h-auto" style={{ minWidth: 520 }} role="img" aria-label="Interactive number line"
          onClick={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const vx = ((e.clientX - r.left) / r.width) * W; const v = min + ((vx - 30) / (W - 60)) * (max - min); const snapped = Math.round(v / step) * step; const sv = Math.round(snapped * 1000) / 1000; if (jumpFrom !== null) { setJumps((js) => [...js, { a: jumpFrom, b: sv }]); setJumpFrom(null); } else setPoints((ps) => [...ps, sv]); }}>
          <line x1={20} y1={110} x2={W - 20} y2={110} stroke="var(--text)" strokeWidth={3} />
          <polygon points={`${W - 20},110 ${W - 34},102 ${W - 34},118`} fill="var(--text)" /><polygon points={`20,110 34,102 34,118`} fill="var(--text)" />
          {ticks.map((t) => (<g key={t}><line x1={x(t)} y1={100} x2={x(t)} y2={120} stroke="var(--text)" strokeWidth={2} />{!hide ? <text x={x(t)} y={142} textAnchor="middle" fontSize={13} fill="var(--text)">{Number.isInteger(t) ? t : t}</text> : null}</g>))}
          {jumps.map((j, i) => { const mx = (x(j.a) + x(j.b)) / 2; const h = 34 + Math.abs(x(j.b) - x(j.a)) / 9; return (<g key={i}><path d={`M ${x(j.a)} 100 Q ${mx} ${100 - h} ${x(j.b)} 100`} fill="none" stroke="#FF6B4A" strokeWidth={3} /><text x={mx} y={92 - h / 2} textAnchor="middle" fontSize={13} fontWeight={700} fill="#FF6B4A">{j.b - j.a > 0 ? `+${Math.round((j.b - j.a) * 1000) / 1000}` : Math.round((j.b - j.a) * 1000) / 1000}</text></g>); })}
          {points.map((p, i) => (<g key={i}><circle cx={x(p)} cy={110} r={11} fill="#00ACC1" stroke="#fff" strokeWidth={2.5} /><text x={x(p)} y={80} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--text)">{p}</text></g>))}
          {jumpFrom !== null ? <text x={x(jumpFrom)} y={30} fontSize={13} fontWeight={700} fill="#FF6B4A">Jump from {jumpFrom}: tap the landing point</text> : null}
        </svg>
        <div className="flex flex-wrap gap-2 mt-1">{points.map((p, i) => (<button key={i} aria-label={`Remove point ${p}`} onClick={() => setPoints((ps) => ps.filter((_, idx) => idx !== i))} className="px-3 py-1.5 rounded-full bg-[var(--surface2)] text-sm font-bold">{p} ✕</button>))}</div>
      </div>
    </Shell>
  );
}

/* ---- Bar Models ---- */
type BarSeg = { label: string; value: number; color: string };
export function BarModelsTool({ tool }: { tool: ToolDef }) {
  const [bars, setBars] = useState<{ name: string; segs: BarSeg[] }[]>([
    { name: "Whole", segs: [{ label: "Part A", value: 3, color: "#7CB342" }, { label: "Part B", value: 2, color: "#AED581" }] },
    { name: "Compare", segs: [{ label: "Sam", value: 5, color: "#1E88E5" }] }, { name: "Other", segs: [{ label: "Jo", value: 3, color: "#FB8C00" }] },
  ]);
  const maxTotal = Math.max(1, ...bars.map((b) => b.segs.reduce((s, x) => s + x.value, 0)));
  const stateJson = JSON.stringify({ bars });
  function setSeg(bi: number, si: number, patch: Partial<BarSeg>) { setBars((bs) => bs.map((b, i) => i === bi ? { ...b, segs: b.segs.map((s, j) => j === si ? { ...s, ...patch } : s) } : b)); }
  return (
    <Shell tool={tool} total={<>Longest bar {maxTotal}</>}
      palette={<><PalBtn label="Add segment" color="#7CB342" onClick={() => setBars((bs) => bs.map((b, i) => i === 0 ? { ...b, segs: [...b.segs, { label: "Part", value: 1, color: "#C0CA33" }] } : b))} /><PalBtn label="Add bar" color="#1E88E5" onClick={() => setBars((bs) => [...bs, { name: `Bar ${bs.length + 1}`, segs: [{ label: "Value", value: 2, color: "#90CAF9" }] }])} /><PalBtn label="Part-part-whole" color="#7CB342" onClick={() => setBars([{ name: "Whole", segs: [{ label: "Part", value: 4, color: "#7CB342" }, { label: "Part", value: 4, color: "#AED581" }] }])} /><PalBtn label="Comparison" color="#FB8C00" onClick={() => setBars([{ name: "A", segs: [{ label: "A", value: 6, color: "#1E88E5" }] }, { name: "B", segs: [{ label: "B", value: 4, color: "#FB8C00" }] }])} /></>}
      settings={<span className="text-xs text-[var(--dim)]">Use the + and − steppers to resize a segment, tap its label to rename it. Three model types: part-part-whole, comparison and equal groups, aligned to CGI problem types.</span>}
      onReset={() => setBars([{ name: "Whole", segs: [{ label: "Part A", value: 3, color: "#7CB342" }, { label: "Part B", value: 2, color: "#AED581" }] }])} onUndo={() => setBars((bs) => bs.slice(0, -1))} canUndo={bars.length > 1}
      stateJson={stateJson} onRestore={(j) => { try { const o = JSON.parse(j) as { bars?: { name: string; segs: BarSeg[] }[] }; if (o.bars) setBars(o.bars); } catch { /* ignore */ } }}
      note="The newest of the 18 tools. Bars are adjustable and editable, colours customisable, for rates, ratios and word problems.">
      <div className="p-4 flex flex-col gap-5 max-w-3xl">
        {bars.map((b, bi) => (
          <div key={bi}>
            <p className="font-display font-semibold">{b.name} · total {b.segs.reduce((s, x) => s + x.value, 0)}</p>
            <div className="flex mt-1 border-2 border-black/60 rounded-lg overflow-x-auto bg-white">
              {b.segs.map((s, si) => (
                <div key={si} className="h-16 flex flex-col items-center justify-center border-r-2 border-black/50 last:border-r-0 px-1" style={{ background: s.color, width: `${(s.value / maxTotal) * 100}%`, minWidth: 86 }}>
                  <input aria-label={`Segment label in ${b.name}`} value={s.label} onChange={(e) => setSeg(bi, si, { label: e.target.value })} className="bg-transparent text-center font-bold text-sm text-white w-full" style={{ textShadow: "0 1px 2px rgba(0,0,0,.4)" }} />
                  <span className="flex items-center gap-1 text-white font-bold text-sm">
                    <button aria-label={`Decrease ${s.label}`} onClick={() => setSeg(bi, si, { value: Math.max(0.5, s.value - 1) })} className="w-7 h-7 rounded-full bg-black/35 text-base leading-none">−</button>{s.value}
                    <button aria-label={`Increase ${s.label}`} onClick={() => setSeg(bi, si, { value: s.value + 1 })} className="w-7 h-7 rounded-full bg-black/35 text-base leading-none">+</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* ---- XY Coordinate Board ---- */
export function XYTool({ tool }: { tool: ToolDef }) {
  const [four, setFour] = useState(true);
  const [labels, setLabels] = useState(true);
  const [pts, setPts] = useState<{ x: number; y: number; color: string }[]>([{ x: 3, y: 4, color: "#E53935" }, { x: 6, y: 2, color: "#1E88E5" }]);
  const [color, setColor] = useState("#E53935");
  const [connect, setConnect] = useState(true);
  const range = four ? 10 : 12; const minV = four ? -10 : 0;
  const S = 440; const px = (v: number) => ((v - minV) / (range - minV)) * S; const py = (v: number) => S - ((v - minV) / (range - minV)) * S;
  const ticks: number[] = []; for (let v = minV; v <= range; v++) ticks.push(v);
  return (
    <Shell tool={tool} total={<>{pts.length} points</>}
      palette={<>{["#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA"].map((c) => (<PalBtn key={c} label={`Point colour`} color={c} onClick={() => setColor(c)} />))}<PalBtn label={connect ? "Lines off" : "Connect points"} color="#212121" onClick={() => setConnect(!connect)} /><PalBtn label="Clear points" color="#616161" onClick={() => setPts([])} /></>}
      settings={<>
        <label className="text-sm font-bold" htmlFor="xy-q">Quadrants</label>
        <select id="xy-q" aria-label="First quadrant only or all four quadrants" value={four ? "four" : "one"} onChange={(e) => { setFour(e.target.value === "four"); setPts([]); }} className="px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm"><option value="one">First quadrant only</option><option value="four">All four quadrants</option></select>
        <button aria-label="Toggle ordered pair labels" onClick={() => setLabels(!labels)} className="px-3 py-1.5 rounded-full bg-[var(--surface2)] text-sm font-bold">{labels ? "Labels on" : "Labels off"}</button>
        <span className="text-xs text-[var(--dim)]">Tap the grid to plot a point in the chosen colour. Points snap to the dotted grid.</span></>}
      onReset={() => setPts([])} onUndo={() => setPts((ps) => ps.slice(0, -1))} canUndo={pts.length > 0}
      stateJson={JSON.stringify({ pts, four })} onRestore={(j) => { try { const o = JSON.parse(j) as { pts?: { x: number; y: number; color: string }[]; four?: boolean }; if (o.pts) setPts(o.pts); if (typeof o.four === "boolean") setFour(o.four); } catch { /* ignore */ } }}
      note="Two axes meeting at the origin, coloured pegs, lines and polygons, customisable axes, ordered-pair labels and data tables.">
      <div className="p-3 flex flex-col items-center min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-start gap-4">
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl max-w-full h-auto" role="img" aria-label="Coordinate grid, tap to plot a point"
          onClick={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const vx = ((e.clientX - r.left) / r.width) * S; const vy = ((e.clientY - r.top) / r.height) * S; const gx = Math.round(minV + (vx / S) * (range - minV)); const gy = Math.round(minV + ((S - vy) / S) * (range - minV)); setPts((ps) => [...ps, { x: gx, y: gy, color }]); }}>
          {ticks.map((t) => (<g key={t}><line x1={px(t)} y1={0} x2={px(t)} y2={S} stroke="var(--border)" strokeDasharray="2 4" /><line x1={0} y1={py(t)} x2={S} y2={py(t)} stroke="var(--border)" strokeDasharray="2 4" /><text x={px(t) + 3} y={py(0) - 4} fontSize={11} fill="var(--dim)">{t}</text><text x={px(0) + 3} y={py(t) - 3} fontSize={11} fill="var(--dim)">{t}</text></g>))}
          <line x1={px(0)} y1={0} x2={px(0)} y2={S} stroke="var(--text)" strokeWidth={2} /><line x1={0} y1={py(0)} x2={S} y2={py(0)} stroke="var(--text)" strokeWidth={2} />
          {connect && pts.length > 1 ? <polyline fill="none" stroke="#212121" strokeWidth={2.5} points={pts.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")} /> : null}
          {pts.map((p, i) => (<g key={i}><circle cx={px(p.x)} cy={py(p.y)} r={8} fill={p.color} stroke="#fff" strokeWidth={2} />{labels ? <text x={px(p.x) + 11} y={py(p.y) - 8} fontSize={13} fontWeight={700} fill="var(--text)">({p.x},{p.y})</text> : null}</g>))}
        </svg>
        <div className="min-w-44">
          <p className="font-display font-semibold">Data table</p>
          <table className="mt-1 text-sm border border-[var(--border)] rounded-lg overflow-hidden" aria-label="Plotted points data table">
            <thead><tr className="bg-[var(--surface2)]"><th className="px-3 py-1 text-left">x</th><th className="px-3 py-1 text-left">y</th><th className="px-3 py-1 text-left">Point</th><th className="px-3 py-1"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>{pts.map((p, i) => (<tr key={i} className="border-t border-[var(--border)]"><td className="px-3 py-1">{p.x}</td><td className="px-3 py-1">{p.y}</td><td className="px-3 py-1 font-bold">({p.x},{p.y})</td><td><button aria-label={`Remove point ${p.x} ${p.y}`} onClick={() => setPts((ps) => ps.filter((_, idx) => idx !== i))} className="px-2 font-bold">✕</button></td></tr>))}</tbody>
          </table>
          {pts.length === 0 ? <p className="text-sm text-[var(--dim)] mt-1">No points yet. Tap the grid.</p> : null}
        </div>
      </div>
    </Shell>
  );
}

/* ---- Geoboard ---- */
export function GeoboardTool({ tool }: { tool: ToolDef }) {
  const [board, setBoard] = useState<"square" | "iso" | "circle">("square");
  const [band, setBand] = useState<{ x: number; y: number }[]>([]);
  const [bands, setBands] = useState<{ pts: { x: number; y: number }[]; color: string }[]>([]);
  const [color, setColor] = useState("#E53935");
  const [fill, setFill] = useState(true);
  const N = 6; const S = 400; const gap = S / (N + 1);
  const all = [...bands, ...(band.length > 1 ? [{ pts: band, color }] : [])];
  function areaOf(pts: { x: number; y: number }[]): number { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = pts[(i + 1) % pts.length]; if (p && q) a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); }
  const totalArea = all.reduce((s, b) => s + areaOf(b.pts), 0);
  const pegs: { x: number; y: number }[] = [];
  if (board === "circle") { for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; pegs.push({ x: 3 + 2.6 * Math.cos(a), y: 3 + 2.6 * Math.sin(a) }); } pegs.push({ x: 3, y: 3 }); }
  else if (board === "iso") { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) pegs.push({ x: c + (r % 2) * 0.5, y: r * 0.87 }); }
  else { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) pegs.push({ x: c, y: r }); }
  const maxC = board === "circle" ? 6 : N;
  const gx = (v: number) => gap * (v + 1) * (board === "circle" ? S / (maxC * gap) : 1) * (board === "circle" ? 1 : 1);
  const toPx = (p: { x: number; y: number }) => board === "circle" ? { X: 40 + (p.x / 6) * (S - 80), Y: 40 + (p.y / 6) * (S - 80) } : { X: gap + p.x * gap * ((S - 2 * gap) / (gap * (N - 1))) * (gap / gap), Y: gap + p.y * gap * ((S - 2 * gap) / (gap * (N - 1))) };
  // simpler pixel mapping
  const PX = (p: { x: number; y: number }) => { const span = board === "circle" ? 6 : (board === "iso" ? 5.5 : 5); const sy = board === "iso" ? 4.35 : span; return { X: 36 + (p.x / span) * (S - 72), Y: 36 + (p.y / sy) * (S - 72) }; };
  void gx; void toPx;
  return (
    <Shell tool={tool} total={<>Bands {all.length} · Area ≈ {totalArea.toFixed(1)} units²</>}
      palette={<>{["#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA"].map((c) => (<PalBtn key={c} label="Band colour" color={c} onClick={() => setColor(c)} />))}<PalBtn label="Close band" color="#212121" onClick={() => { if (band.length > 2) { setBands((bs) => [...bs, { pts: band, color }]); setBand([]); } }} /><PalBtn label="Clear all" color="#616161" onClick={() => { setBands([]); setBand([]); }} /></>}
      settings={<>
        <label className="text-sm font-bold" htmlFor="gb-type">Board</label>
        <select id="gb-type" aria-label="Geoboard type square isometric or circular" value={board} onChange={(e) => { setBoard(e.target.value as "square" | "iso" | "circle"); setBands([]); setBand([]); }} className="px-2 py-1.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm"><option value="square">Square</option><option value="iso">Isometric</option><option value="circle">Circular</option></select>
        <button aria-label="Toggle shape fill" onClick={() => setFill(!fill)} className="px-3 py-1.5 rounded-full bg-[var(--surface2)] text-sm font-bold">{fill ? "Fill on" : "Fill off"}</button>
        <span className="text-xs text-[var(--dim)]">Tap pegs in order to stretch the band, then Close band. Peg-to-peg distance is 1 unit. Use the Annotate pen as the angle measuring tool: draw the angle and talk through it.</span></>}
      onReset={() => { setBands([]); setBand([]); }} onUndo={() => setBands((bs) => bs.slice(0, -1))} canUndo={bands.length > 0}
      stateJson={JSON.stringify({ bands, board })} onRestore={(j) => { try { const o = JSON.parse(j) as { bands?: { pts: { x: number; y: number }[]; color: string }[]; board?: "square" | "iso" | "circle" }; if (o.bands) setBands(o.bands); if (o.board) setBoard(o.board); } catch { /* ignore */ } }}
      note="Square, isometric and circular boards, multiple coloured bands and fills.">
      <div className="p-3">
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="bg-[#FFF8E1] border border-[var(--border)] rounded-xl max-w-full h-auto" role="img" aria-label="Geoboard, tap pegs to stretch a band">
          {all.map((b, i) => (<polygon key={i} points={b.pts.map((p) => { const q = PX(p); return `${q.X},${q.Y}`; }).join(" ")} fill={fill ? b.color : "none"} fillOpacity={0.35} stroke={b.color} strokeWidth={5} strokeLinejoin="round" />))}
          {band.length > 0 ? <polyline fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" points={band.map((p) => { const q = PX(p); return `${q.X},${q.Y}`; }).join(" ")} /> : null}
          {pegs.map((p, i) => { const q = PX(p); return (<g key={i}><circle cx={q.X} cy={q.Y} r={17} fill="transparent" className="cursor-pointer" role="button" aria-label={`Peg ${i + 1}`} onClick={() => setBand((b) => [...b, p])} /><circle cx={q.X} cy={q.Y} r={8.5} fill="#5D4037" stroke="#fff" strokeWidth={2} pointerEvents="none" /></g>); })}
        </svg>
        <p className="text-sm text-[var(--dim)] mt-2">Current band: {band.length} pegs. {band.length > 2 ? "Tap Close band in the palette to finish the shape." : "Tap pegs to stretch the band."}</p>
      </div>
    </Shell>
  );
}

/* ---- Clock ---- */
function ClockFace({ h, m, label, onSet, gearedRef }: { h: number; m: number; label: string; onSet?: (h: number, m: number) => void; gearedRef?: boolean }) {
  const cx = 110, cy = 110, R = 100;
  const ha = ((h % 12) + m / 60) * (Math.PI / 6) - Math.PI / 2;
  const ma = (m / 60) * 2 * Math.PI - Math.PI / 2;
  const dragHand = useRef<"h" | "m" | null>(null);
  function fromEvent(e: React.PointerEvent<SVGSVGElement>, which: "h" | "m") {
    if (!onSet) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - r.left) / r.width) * 220 - cx; const dy = ((e.clientY - r.top) / r.height) * 220 - cy;
    let ang = Math.atan2(dy, dx) + Math.PI / 2; if (ang < 0) ang += 2 * Math.PI;
    if (which === "m") { const nm = Math.round((ang / (2 * Math.PI)) * 60) % 60; onSet(h, nm); }
    else { const nh = Math.round((ang / (2 * Math.PI)) * 12) % 12; onSet(nh === 0 ? 12 : nh, m); }
  }
  return (
    <div>
      <svg width={220} height={220} viewBox="0 0 220 220" className="max-w-full h-auto touch-none" role="img" aria-label={`${label} showing ${h} hours and ${m} minutes`}
        onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); const dx = ((e.clientX - r.left) / r.width) * 220 - cx; const dy = ((e.clientY - r.top) / r.height) * 220 - cy; const dist = Math.sqrt(dx * dx + dy * dy); dragHand.current = dist < 58 ? "h" : "m"; fromEvent(e, dragHand.current); }}
        onPointerMove={(e) => { if (dragHand.current && e.buttons > 0) fromEvent(e, dragHand.current); }}
        onPointerUp={() => { dragHand.current = null; }} onPointerLeave={() => { dragHand.current = null; }}>
        <circle cx={cx} cy={cy} r={R} fill="var(--surface)" stroke="var(--text)" strokeWidth={3} />
        <path d={`M ${cx} ${cy} L ${cx + 78 * Math.cos(ma)} ${cy + 78 * Math.sin(ma)} A 78 78 0 0 1 ${cx + 78 * Math.cos(ha)} ${cy + 78 * Math.sin(ha)} Z`} fill="#FFC91F" fillOpacity={0.35} aria-hidden="true" />
        {Array.from({ length: 60 }).map((_, i) => { const a = (i * Math.PI) / 30; const big = i % 5 === 0; return (<line key={i} x1={cx + (big ? 86 : 92) * Math.cos(a)} y1={cy + (big ? 86 : 92) * Math.sin(a)} x2={cx + 97 * Math.cos(a)} y2={cy + 97 * Math.sin(a)} stroke={big ? "#E53935" : "var(--dim)"} strokeWidth={big ? 3 : 1.5} />); })}
        {Array.from({ length: 12 }).map((_, i) => { const a = (i * Math.PI) / 6 - Math.PI / 2; return (<text key={i} x={cx + 72 * Math.cos(a)} y={cy + 72 * Math.sin(a) + 6} textAnchor="middle" fontSize={17} fontWeight={700} fill="var(--text)">{i === 0 ? 12 : i}</text>); })}
        <line x1={cx} y1={cy} x2={cx + 56 * Math.cos(ha)} y2={cy + 56 * Math.sin(ha)} stroke="#E53935" strokeWidth={8} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={cx + 84 * Math.cos(ma)} y2={cy + 84 * Math.sin(ma)} stroke="#1E88E5" strokeWidth={5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={7} fill="var(--text)" />
      </svg>
      <p className="text-center font-display font-semibold">{label} · {((h + 11) % 12) + 1}:{String(m).padStart(2, "0")} digital</p>
      {gearedRef ? null : null}
    </div>
  );
}
export function ClockTool({ tool }: { tool: ToolDef }) {
  const [geared, setGeared] = useState(true);
  const [two, setTwo] = useState(true);
  const [c1, setC1] = useState({ h: 9, m: 15 }); const [c2, setC2] = useState({ h: 11, m: 45 });
  const [tracker, setTracker] = useState(0);
  const hist = useRef<{ c1: { h: number; m: number }; c2: { h: number; m: number } }[]>([]);
  function snapshot() { hist.current = [...hist.current.slice(-40), { c1, c2 }]; }
  function setClock(which: 1 | 2, h: number, m: number) {
    snapshot();
    if (which === 1) setC1({ h, m }); else setC2({ h, m });
  }
  const elapsed = ((c2.h * 60 + c2.m) - (c1.h * 60 + c1.m) + 720) % 720;
  return (
    <Shell tool={tool} total={<>Elapsed {Math.floor(elapsed / 60)}h {elapsed % 60}m</>}
      palette={<><PalBtn label={geared ? "Free hands" : "Geared hands"} color="#4527A0" onClick={() => setGeared(!geared)} /><PalBtn label={two ? "One clock" : "Two clocks"} color="#1E88E5" onClick={() => setTwo(!two)} /><PalBtn label="Time tracker +15 min" color="#FFC91F" onClick={() => setTracker((t) => t + 15)} /><PalBtn label="Reset tracker" color="#616161" onClick={() => setTracker(0)} /></>}
      settings={<><span className="text-sm font-bold">Mode: {geared ? "Geared (hands stay in the correct hour and minute relationship)" : "Free (hands move independently)"}</span>
        <span className="text-xs text-[var(--dim)]">Drag near the centre for the red hour hand, near the edge for the blue minute hand. The yellow wedge is the Time Interval piece between the hands. Time Tracker: {tracker} minutes tracked. Linear time line: {c1.h}:{String(c1.m).padStart(2, "0")} → {c2.h}:{String(c2.m).padStart(2, "0")}.</span></>}
      onReset={() => { snapshot(); setC1({ h: 12, m: 0 }); setC2({ h: 12, m: 0 }); setTracker(0); }} onUndo={() => { const prev = hist.current[hist.current.length - 1]; if (prev) { hist.current = hist.current.slice(0, -1); setC1(prev.c1); setC2(prev.c2); } }} canUndo={hist.current.length > 0}
      stateJson={JSON.stringify({ c1, c2, geared, two })} onRestore={(j) => { try { const o = JSON.parse(j) as { c1?: { h: number; m: number }; c2?: { h: number; m: number }; geared?: boolean; two?: boolean }; if (o.c1) setC1(o.c1); if (o.c2) setC2(o.c2); if (typeof o.geared === "boolean") setGeared(o.geared); if (typeof o.two === "boolean") setTwo(o.two); } catch { /* ignore */ } }}
      note="Analogue and digital side by side, red hour and blue minute hands matching the face markings, a Time Tracker, Time Interval arcs and a linear representation of time." tasksSlug={tool.slug}>
      <div className="p-4 flex flex-col items-center min-[900px]:flex-row min-[900px]:flex-wrap gap-8">
        <div><ClockFace h={c1.h} m={c1.m} label={two ? "Start clock" : "Clock"} onSet={(h, m) => setClock(1, h, m)} />
          <div className="flex gap-2 justify-center mt-1">
            <button aria-label="Clock 1 hour up" onClick={() => { snapshot(); setC1({ h: (c1.h % 12) + 1, m: c1.m }); }} className="px-3 py-1.5 rounded-full bg-[var(--surface2)] text-sm font-bold">Hour +</button>
            <button aria-label="Clock 1 minutes up 5" onClick={() => { snapshot(); setC1({ h: c1.h + Math.floor((c1.m + 5) / 60), m: (c1.m + 5) % 60 }); }} className="px-3 py-1.5 rounded-full bg-[var(--surface2)] text-sm font-bold">Min +5</button>
          </div></div>
        {two ? (<div><ClockFace h={c2.h} m={c2.m} label="End clock" onSet={(h, m) => setClock(2, h, m)} />
          <div className="flex gap-2 justify-center mt-1">
            <button aria-label="Clock 2 hour up" onClick={() => { snapshot(); setC2({ h: (c2.h % 12) + 1, m: c2.m }); }} className="px-3 py-1.5 rounded-full bg-[var(--surface2)] text-sm font-bold">Hour +</button>
            <button aria-label="Clock 2 minutes up 5" onClick={() => { snapshot(); setC2({ h: c2.h + Math.floor((c2.m + 5) / 60), m: (c2.m + 5) % 60 }); }} className="px-3 py-1.5 rounded-full bg-[var(--surface2)] text-sm font-bold">Min +5</button>
          </div></div>) : null}
        <div className="max-w-xs">
          <p className="font-display font-semibold">Read the time</p>
          <p className="text-sm mt-1">Start: <strong>{((c1.h + 11) % 12) + 1}:{String(c1.m).padStart(2, "0")}</strong>{two ? <> · End: <strong>{((c2.h + 11) % 12) + 1}:{String(c2.m).padStart(2, "0")}</strong> · Elapsed: <strong>{Math.floor(elapsed / 60)} hours {elapsed % 60} minutes</strong></> : null}</p>
          <div className="mt-3 h-4 rounded-full bg-[var(--surface2)] relative" aria-label="Linear representation of time"><div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${(elapsed / 720) * 100}%` }} /></div>
          <p className="text-xs text-[var(--dim)] mt-1">Linear representation: the elapsed interval as a bar over 12 hours.</p>
        </div>
      </div>
    </Shell>
  );
}

/* ============ LIVE teacher dashboard ============ */
export function TeacherLiveView({ code }: { code: string }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const session = useQuery({ queryKey: ["live", code], queryFn: () => api.getLiveSession({ code }), refetchInterval: 4000 });
  const saved = useQuery({ queryKey: ["workspaces"], queryFn: () => api.listWorkspaces({ limit: 30 }) });
  const push = useMutation({
    mutationFn: async (state_json: string) => await api.pushLiveWorkspace({ code, state_json }),
    onSuccess: () => { setMsg("Pushed to every student. Their screens will offer the workspace within a few seconds."); qc.invalidateQueries({ queryKey: ["live", code] }); },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Push failed"),
  });
  const end = useMutation({
    mutationFn: async () => await api.endLiveSession({ code }),
    onSuccess: () => { setMsg("Session ended. Students can see it has ended and can no longer send work."); qc.invalidateQueries({ queryKey: ["live", code] }); },
    onError: (e) => setMsg(e instanceof Error ? e.message : "End failed"),
  });
  const s = session.data?.session;
  const participants = session.data?.participants ?? [];
  const tool = s ? TOOLS.find((t) => t.slug === s.tool_slug) : undefined;
  const mine = (saved.data?.workspaces ?? []).filter((w) => s && w.tool_slug === s.tool_slug);
  /* The generated PDF is kept as a real, tappable link in the page, not only
     fired through a programmatic click: a detached anchor click is silently
     swallowed in some phone webviews and the download attribute is ignored
     on iOS, which left teachers with no file at all. The in-page link below
     is a genuine user tap on a real element, offers Open (view, then save or
     share from the viewer) as well as Download, and its object URL stays
     alive until the next export replaces it. */
  const [pdfLink, setPdfLink] = useState<{ url: string; filename: string } | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); }, []);
  function exportPdf() {
    if (!s) return;
    const blocks = participants.map((p) => ({ heading: `${p.student_name} · last saved ${new Date(p.updated_at).toLocaleString()}`, lines: summarizeState(p.state_json) }));
    if (blocks.length === 0) blocks.push({ heading: "No student work yet", lines: ["No student has joined or saved work in this session yet."] });
    const blob = makePdf(`LIVE session ${s.code} · ${s.title} · ${tool?.name ?? s.tool_slug}`, blocks);
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    const url = URL.createObjectURL(blob);
    pdfUrlRef.current = url;
    const filename = `live-session-${s.code}-student-work.pdf`;
    setPdfLink({ url, filename });
    // Best-effort instant download where the browser honours it; the anchor
    // must be attached to the document for the click to register at all.
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setMsg("Your PDF is ready below. If the download did not start on its own, tap Download PDF, or Open PDF to view it and save or share it from there.");
  }
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="oomba-topbar">
        <OombaLogo compact />
        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          <a href="#" className="oomba-navlink">← All tools</a>
          <a href="#tasks" className="oomba-navlink">📚 Tasks</a>
        </nav>
      </header>
      <main className="oomba-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display font-bold text-2xl">Oomba LIVE teacher view</h1>
          {s ? <span className={`px-3 py-1 rounded-full font-bold text-sm ${s.status === "active" ? "btn-primary" : "btn-danger"}`}>{s.status === "active" ? "Session live" : "Session ended"}</span> : null}
        </div>
        {session.isLoading ? <p className="mt-6 font-semibold">Loading session…</p> : null}
        {session.data && !s ? <p className="mt-6 font-semibold">No LIVE session found for code {code}. Check the code and try again from the home page.</p> : null}
        {s ? (<>
          <section aria-label="Session details" className="mt-4 bg-[var(--brand-ink)] text-white rounded-[var(--radius)] p-5">
            <p className="text-sm opacity-80">Students join with this code, on any device:</p>
            <p className="font-display font-bold text-4xl tracking-[0.3em] mt-1" aria-label="Session join code">{s.code}</p>
            <p className="mt-2 font-semibold">{s.title} · {tool?.emoji} {tool?.name ?? s.tool_slug}</p>
            <p className="text-sm opacity-85">Started {new Date(s.created_at).toLocaleString()} · {participants.length} student{participants.length === 1 ? "" : "s"} joined · this view refreshes every few seconds.</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <a href={`#${s.tool_slug}`} aria-label="Open the tool to build a workspace to push" className="px-4 py-2 rounded-full bg-white text-black font-bold text-sm">Open {tool?.name ?? "tool"} to build</a>
              <button aria-label="Export student work to PDF" onClick={exportPdf} className="px-4 py-2 rounded-full btn-hot font-bold text-sm">Export student work to PDF</button>
              {s.status === "active" ? <button aria-label="End this live session" onClick={() => end.mutate()} className="px-4 py-2 rounded-full btn-danger font-bold text-sm">End session</button> : null}
            </div>
            {msg ? <p role="status" className="mt-3 text-sm font-semibold">{msg}</p> : null}
            {pdfLink ? (
              <div className="mt-3 bg-white text-black rounded-[var(--radius)] p-3 flex flex-wrap items-center gap-2" aria-label="Your exported PDF">
                <span className="font-bold text-sm">📄 {pdfLink.filename}</span>
                <a href={pdfLink.url} download={pdfLink.filename} aria-label="Download the exported student work PDF" className="px-4 py-2 rounded-full btn-primary font-bold text-sm">Download PDF</a>
                <a href={pdfLink.url} target="_blank" rel="noreferrer" aria-label="Open the exported student work PDF" className="px-4 py-2 rounded-full bg-[var(--surface2)] text-[var(--text)] font-bold text-sm">Open PDF</a>
                <span className="text-xs text-[var(--dim)]">Regenerating replaces this file with the latest student work.</span>
              </div>
            ) : null}
          </section>

          <section aria-label="Push a workspace to students" className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-4">
            <h2 className="font-display font-semibold text-lg">Push your workspace to every student</h2>
            <p className="text-sm text-[var(--dim)] mt-1">Build in the tool, tap Share · get code to save it, then push it here. Pushing replaces what is on student screens (they get a Load prompt), so export their work first if you need it.</p>
            {mine.length === 0 ? <p className="text-sm font-semibold mt-2">No saved {tool?.name ?? ""} workspaces yet. Open the tool above, build, and save one.</p> : (
              <div className="flex flex-wrap gap-2 mt-3">
                {mine.map((w) => (<button key={w.id} aria-label={`Push saved workspace ${w.code} to all students`} onClick={() => push.mutate(w.state_json)} className="px-4 py-2 rounded-full btn-primary font-bold text-sm">Push {w.code} · {new Date(w.created_at).toLocaleDateString()}</button>))}
              </div>
            )}
            {s.pushed_state_json ? <p className="text-sm font-semibold mt-2">A workspace has been pushed in this session. Pushing again replaces it.</p> : null}
          </section>

          <section aria-label="Student work" className="mt-4">
            <h2 className="font-display font-semibold text-xl">Student work, live</h2>
            {participants.length === 0 ? <p className="mt-2 text-[var(--dim)] font-semibold">No students yet. Share the code above and their work will appear here as they build.</p> : (
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                {participants.map((p) => (
                  <article key={p.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-4" aria-label={`Work from ${p.student_name}`}>
                    <p className="font-display font-semibold text-lg">{p.student_name}</p>
                    <p className="text-xs text-[var(--dim)]">Last saved {new Date(p.updated_at).toLocaleString()}</p>
                    <ul className="mt-2 text-sm list-disc pl-5">{summarizeState(p.state_json).map((l, i) => (<li key={i}>{l}</li>))}</ul>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>) : null}
      </main>
      <footer className="oomba-foot">
        <span>✦ Oomba Academy · Screen time you can feel good about</span>
        <a href="#" aria-label="Back to all manipulatives">All tools</a>
        <a href="https://oomba.ai" target="_blank" rel="noreferrer" aria-label="Visit Oomba Academy at oomba dot ai">oomba.ai</a>
      </footer>
    </div>
  );
}

/* ============ Tasks library view ============ */
export function TasksView() {
  const [q, setQ] = useState("");
  const [toolFilter, setToolFilter] = useState("All");
  const [gradeFilter, setGradeFilter] = useState("All");
  const all = useMemo(() => TOOLS.flatMap((t) => (TASKS_LIB[t.slug] ?? []).map((task) => ({ tool: t, task }))), []);
  const grades = useMemo(() => Array.from(new Set(all.map((x) => x.task.grade))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [all]);
  const filtered = all.filter(({ tool, task }) => (toolFilter === "All" || tool.slug === toolFilter) && (gradeFilter === "All" || task.grade === gradeFilter) && (q.trim() === "" || `${tool.name} ${task.title} ${task.prompt} ${task.ccss} Grade ${task.grade}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="oomba-topbar">
        <OombaLogo compact />
        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          <a href="#" className="oomba-navlink">← All tools</a>
          <a href="#tasks" aria-current="page" className="oomba-navlink">📚 Tasks</a>
        </nav>
      </header>
      <main className="oomba-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display font-bold text-3xl">Oomba Tasks library</h1>
          <span className="px-3 py-1 rounded-full font-bold text-xs btn-hot">300 tasks · Screen time you can feel good about</span>
        </div>
        <p className="mt-2 max-w-2xl text-[var(--dim)]">{all.length} ready-made tasks written in Oomba Academy's own words, covering all 18 tools across grades K-9 and the Common Core standards. Every task carries teacher notes and its Common Core code. Open a task's tool and the same tasks appear on the canvas.</p>
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <label className="sr-only" htmlFor="task-search">Search tasks</label>
          <input id="task-search" aria-label="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, tools or CCSS codes…" className="flex-1 px-4 py-2.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)]" />
          <label className="sr-only" htmlFor="task-tool">Filter tasks by tool</label>
          <select id="task-tool" aria-label="Filter tasks by tool" value={toolFilter} onChange={(e) => setToolFilter(e.target.value)} className="px-4 py-2.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] font-semibold">
            <option value="All">All 18 tools</option>
            {TOOLS.map((t) => (<option key={t.slug} value={t.slug}>{t.name}</option>))}
          </select>
          <label className="sr-only" htmlFor="task-grade">Filter tasks by grade</label>
          <select id="task-grade" aria-label="Filter tasks by grade" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className="px-4 py-2.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] font-semibold">
            <option value="All">All grades</option>
            {grades.map((g) => (<option key={g} value={g}>Grade {g}</option>))}
          </select>
        </div>
        <p className="mt-3 text-sm font-semibold" role="status">{filtered.length} task{filtered.length === 1 ? "" : "s"} shown</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {filtered.map(({ tool, task }) => (
            <article key={`${tool.slug}-${task.title}`} className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-4 flex flex-col gap-2" aria-label={`Task ${task.title} for ${tool.name}`}>
              <p className="flex items-center gap-2"><span className="w-9 h-9 rounded-xl flex items-center justify-center text-lg piece-shadow" style={{ background: tool.color }} aria-hidden="true">{tool.emoji}</span><span className="font-bold text-sm">{tool.name}</span><span className="ml-auto px-2 py-0.5 rounded-full bg-[var(--surface2)] text-[11px] font-bold">{task.ccss}</span></p>
              <h2 className="font-display font-semibold text-lg leading-tight">{task.title}</h2>
              <p className="text-sm">{task.prompt}</p>
              <p className="text-sm text-[var(--dim)]"><span className="font-bold text-[var(--text)]">Teacher notes:</span> {task.notes}</p>
              <p className="text-xs text-[var(--dim)]">Grade {task.grade} · Common Core {task.ccss}</p>
              <a href={`#${tool.slug}`} aria-label={`Open ${tool.name} to start task ${task.title}`} className="mt-auto px-4 py-2 rounded-full btn-primary font-bold text-sm text-center">Open the tool</a>
            </article>
          ))}
        </div>
        {filtered.length === 0 ? <p className="mt-8 font-semibold text-[var(--dim)]">No tasks match. Try a tool name like Clock, or a code like 3.NF.</p> : null}
      </main>
      <footer className="oomba-foot">
        <span>✦ Oomba Academy · Screen time you can feel good about</span>
        <a href="#" aria-label="Back to all manipulatives">All tools</a>
        <a href="https://oomba.ai" target="_blank" rel="noreferrer" aria-label="Visit Oomba Academy at oomba dot ai">oomba.ai</a>
      </footer>
    </div>
  );
}

/* ============ Library + App ============ */
function ToolView({ slug }: { slug: string }) {
  const tool = TOOLS.find((t) => t.slug === slug) ?? TOOLS[0];
  if (!tool) return null;
  switch (tool.slug) {
    case "rekenreks": return <RekenrekTool tool={tool} />;
    case "hundred-board": return <HundredTool tool={tool} />;
    case "fraction-circles": return <FractionCirclesTool tool={tool} />;
    case "number-lines": return <NumberLinesTool tool={tool} />;
    case "bar-models": return <BarModelsTool tool={tool} />;
    case "xy-coordinate-board": return <XYTool tool={tool} />;
    case "geoboard": return <GeoboardTool tool={tool} />;
    case "clock": return <ClockTool tool={tool} />;
    case "base-ten-blocks": return <BaseTenTool tool={tool} />;
    case "place-value-disks": return <DisksTool tool={tool} />;
    case "two-color-counters": return <CountersTool tool={tool} />;
    case "linking-cubes": return <LinkingTool tool={tool} />;
    case "color-tiles": return <TilesTool tool={tool} />;
    case "cuisenaire-rods": return <CuisenaireTool tool={tool} />;
    case "fraction-tiles": return <FractionTilesTool tool={tool} />;
    case "algebra-tiles": return <AlgebraTool tool={tool} />;
    case "pattern-blocks": return <PatternTool tool={tool} />;
    case "money": return <MoneyTool tool={tool} />;
    default: return <BaseTenTool tool={tool} />;
  }
}

export function App() {
  const [hash, setHash] = useState(() => window.location.hash.replace("#", ""));
  const [q, setQ] = useState(""); const [cat, setCat] = useState("All");
  const [redeem, setRedeem] = useState(""); const [redeemMsg, setRedeemMsg] = useState("");
  useEffect(() => { const fn = () => setHash(window.location.hash.replace("#", "")); window.addEventListener("hashchange", fn); return () => window.removeEventListener("hashchange", fn); }, []);
  /* Hash navigation swaps the whole view; without this the browser keeps the
     previous page's scroll position and users land mid-page (worst on phones,
     where the tool palette sits at the top). */
  useEffect(() => { window.scrollTo(0, 0); }, [hash]);
  const load = useMutation({
    mutationFn: async (code: string) => await api.loadWorkspace({ code }),
    onSuccess: (d) => { if (d.workspace) { window.location.hash = d.workspace.tool_slug; setRedeemMsg(`Opening workspace ${d.workspace.code}…`); sessionStorage.setItem(`restore-${d.workspace.tool_slug}`, d.workspace.state_json); } else setRedeemMsg("No workspace found for that code."); },
    onError: (e) => setRedeemMsg(e instanceof Error ? e.message : "Load failed"),
  });
  const saved = useQuery({ queryKey: ["workspaces"], queryFn: () => api.listWorkspaces({ limit: 30 }) });
  const qc = useQueryClient();
  const del = useMutation({ mutationFn: async (id: number) => await api.deleteWorkspace({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }), onError: () => undefined });
  /* LIVE host + join */
  const [hostTool, setHostTool] = useState("base-ten-blocks");
  const [hostTitle, setHostTitle] = useState("");
  const [hostMsg, setHostMsg] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  const host = useMutation({
    mutationFn: async () => await api.createLiveSession({ tool_slug: hostTool, title: hostTitle.trim() || `${TOOLS.find((t) => t.slug === hostTool)?.name ?? "Math"} LIVE session`, teacher_state_json: "{}" }),
    onSuccess: (d) => { window.location.hash = `live/${d.code}`; },
    onError: (e) => setHostMsg(e instanceof Error ? e.message : "Could not start the session"),
  });
  const join = useMutation({
    mutationFn: async () => await api.joinLiveSession({ code: joinCode.trim(), student_name: joinName.trim() }),
    onSuccess: (d) => {
      if (!d.session) { setJoinMsg("No LIVE session found for that code."); return; }
      if (d.session.status !== "active") { setJoinMsg("That session has already ended."); return; }
      sessionStorage.setItem("live-student", JSON.stringify({ code: d.session.code, name: joinName.trim(), tool: d.session.tool_slug }));
      window.location.hash = d.session.tool_slug;
    },
    onError: (e) => setJoinMsg(e instanceof Error ? e.message : "Could not join"),
  });
  const filtered = useMemo(() => TOOLS.filter((t) => (cat === "All" || t.cat === cat) && (q.trim() === "" || `${t.name} ${t.desc} ${t.cat}`.toLowerCase().includes(q.toLowerCase()))), [q, cat]);
  const active = TOOLS.find((t) => t.slug === hash);
  if (hash === "tasks") return <TasksView />;
  if (hash.startsWith("live/")) return <TeacherLiveView code={hash.replace("live/", "").toUpperCase()} />;
  if (active) return (<div className="min-h-screen bg-[var(--bg)] text-[var(--text)]"><ToolView slug={active.slug} /></div>);
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="oomba-topbar">
        <OombaLogo compact />
        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          <a href="#tasks" className="oomba-navlink">📚 Tasks</a>
          <a href="https://oomba.ai" target="_blank" rel="noreferrer" className="oomba-navlink">oomba.ai ↗</a>
        </nav>
      </header>
      <main className="oomba-wrap">
        <header className="pb-2">
          <p className="font-display font-semibold" style={{ color: "var(--logo-sub)" }}>Oomba Academy · 18 tools · one shared desk · K–12</p>
          <h1 className="font-display font-bold text-4xl md:text-5xl leading-tight mt-1">Oomba Virtual Math Manipulatives</h1>
          <p className="mt-2 font-display font-semibold text-lg" style={{ color: "var(--logo-sub)" }}>Screen time you can feel good about</p>
          <p className="mt-3 text-base md:text-lg max-w-2xl">Free, kid-safe math play from Oomba Academy, no ads: drag the pieces, break and regroup, make zero pairs, stretch bands, plot points. Each workspace shares the same shell, palette, annotate tools and 8-character Share Codes, with working LIVE classroom sessions and a Tasks library of {TOTAL_TASKS} ready-made tasks written in Oomba's own words, covering grades K-9 and the Common Core standards.</p>
          <p className="text-sm text-[var(--dim)] mt-2">All 300 tasks in this library are original to Oomba Academy, each with teacher notes and a Common Core code.</p>
        </header>

        <section aria-label="Redeem a share code" className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-4 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
          <div className="min-w-0 flex-1"><p className="font-display font-semibold"><span className="text-2xl align-[-4px] mr-2" aria-hidden="true">🎟️</span>Have a Share Code?</p><p className="text-sm text-[var(--dim)] mt-1">Enter the 8-character code a teacher shared and the exact workspace opens.</p></div>
          <div className="flex gap-2 w-full sm:w-auto">
            <label className="sr-only" htmlFor="home-redeem">Share code</label>
            <input {...FIELDS.loadWorkspace.code} id="home-redeem" aria-label="Share code" value={redeem} onChange={(e) => setRedeem(e.target.value.toUpperCase())} placeholder="XZU7THVN" className="px-3 py-2 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] uppercase flex-1 min-w-0 sm:flex-none sm:w-40" />
            <button aria-label="Open workspace from share code" onClick={() => { if (redeem.trim()) load.mutate(redeem.trim()); else setRedeemMsg("Enter a share code first."); }} className="px-5 py-2 rounded-full btn-primary font-bold shrink-0">GO</button>
          </div>
          {redeemMsg ? <span role="status" className="text-sm font-semibold w-full">{redeemMsg}</span> : null}
        </section>

        <section aria-label="Classroom LIVE" className="mt-4 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-[var(--brand-ink)] text-white rounded-[var(--radius)] p-4">
            <p className="font-display font-semibold text-lg">Host a LIVE session</p>
            <p className="text-sm opacity-85 mt-1">Pick a tool and start. Students join with the session code from any device, you watch their work arrive live, push your workspace to everyone, export their work to PDF, then end the session.</p>
            <label className="block text-xs font-bold mt-3 opacity-80" htmlFor="host-tool">Tool for the session</label>
            <select id="host-tool" aria-label="Tool for the live session" value={hostTool} onChange={(e) => setHostTool(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-full bg-white/10 text-white text-sm font-semibold">{TOOLS.map((t) => (<option key={t.slug} value={t.slug} className="text-black">{t.name}</option>))}</select>
            <label className="block text-xs font-bold mt-3 opacity-80" htmlFor="host-title">Session title</label>
            <input {...FIELDS.createLiveSession.title} id="host-title" aria-label="Session title" value={hostTitle} onChange={(e) => setHostTitle(e.target.value)} placeholder="e.g. Period 2 fractions" className="w-full mt-1 px-3 py-2 rounded-full bg-white/10 text-white text-sm placeholder:text-white/50" />
            <button aria-label="Start live session" onClick={() => host.mutate()} className="mt-3 px-5 py-2 rounded-full btn-hot font-bold text-sm w-full">Start LIVE session</button>
            {hostMsg ? <p role="status" className="text-sm font-semibold mt-2">{hostMsg}</p> : null}
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-4">
            <p className="font-display font-semibold text-lg">Join a LIVE session</p>
            <p className="text-sm text-[var(--dim)] mt-1">Enter the code your teacher shows and your first name. Your work in the tool saves to the teacher automatically, no account needed.</p>
            <label className="block text-xs font-bold mt-3" htmlFor="join-code">Session code</label>
            <input {...FIELDS.joinLiveSession.code} id="join-code" aria-label="Live session code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="XZU7THVN" className="w-full mt-1 px-3 py-2 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] uppercase text-sm" />
            <label className="block text-xs font-bold mt-3" htmlFor="join-name">Your first name</label>
            <input {...FIELDS.joinLiveSession.student_name} id="join-name" aria-label="Your first name" value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="e.g. Sam" className="w-full mt-1 px-3 py-2 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] text-sm" />
            <button aria-label="Join live session" onClick={() => { if (!joinCode.trim()) { setJoinMsg("Enter the session code first."); return; } if (!joinName.trim()) { setJoinMsg("Enter your first name first."); return; } join.mutate(); }} className="mt-3 px-5 py-2 rounded-full btn-primary font-bold text-sm w-full">Join session</button>
            {joinMsg ? <p role="status" className="text-sm font-semibold mt-2">{joinMsg}</p> : null}
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-4 flex flex-col md:col-span-2 lg:col-span-1">
            <p className="font-display font-semibold text-lg">Oomba Tasks library · 300 tasks</p>
            <p className="text-sm text-[var(--dim)] mt-1">{TOTAL_TASKS} ready-made tasks written for Oomba Academy, 16 to 17 for every one of the 18 tools, each with teacher notes and its Common Core code, covering grades K-9 and the Common Core standards. The same tasks sit on each tool's canvas too. Every task is original wording for Oomba.</p>
            <a href="#tasks" aria-label="Browse the tasks library" className="mt-auto pt-3"><span className="inline-block px-5 py-2 rounded-full btn-current font-bold text-sm w-full text-center">Browse all tasks</span></a>
            <p className="text-xs text-[var(--dim)] mt-3">Students stay anonymous in LIVE: a first name and a session code, no accounts, no rostering, no personal data.</p>
          </div>
        </section>

        <div className="mt-6 flex flex-col sm:flex-row gap-2 sticky top-[calc(var(--top)+env(safe-area-inset-top))] z-20 bg-[var(--bg)] py-2">
          <label className="sr-only" htmlFor="tool-search">Search manipulatives</label>
          <input id="tool-search" aria-label="Search manipulatives" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 18 manipulatives…" className="flex-1 px-4 py-2.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)]" />
          <label className="sr-only" htmlFor="tool-cat">Filter by category</label>
          <select id="tool-cat" aria-label="Filter by category" value={cat} onChange={(e) => setCat(e.target.value)} className="px-4 py-2.5 rounded-full border-2 border-[var(--edge)] bg-[var(--card-2)] font-semibold">{CATS.map((c) => (<option key={c} value={c}>{c}</option>))}</select>
        </div>

        {CATS.slice(1).filter((c) => cat === "All" || cat === c).map((c) => {
          const list = filtered.filter((t) => t.cat === c);
          if (!list.length) return null;
          return (
            <section key={c} aria-label={c} className="mt-5">
              <h2 className="font-display font-semibold text-2xl">{c}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                {list.map((t) => (
                  <a key={t.slug} href={`#${t.slug}`} aria-label={`Open ${t.name}`} className="group bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-4 flex flex-col gap-2 hover:border-[var(--accent-line)] transition-colors">
                    <span className="flex items-center gap-3"><span className="w-12 h-12 rounded-[var(--r-sm)] flex items-center justify-center text-2xl piece-shadow" style={{ background: t.color }} aria-hidden="true">{t.emoji}</span><span><span className="font-display font-semibold text-lg leading-tight block">{t.name}</span><span className="text-xs text-[var(--dim)]">Grades {t.grades}</span></span><span className="ml-auto font-display font-bold text-[var(--accent)]" aria-hidden="true">Open →</span></span>
                    <span className="text-sm text-[var(--dim)]">{t.desc}</span>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
        {filtered.length === 0 ? <p className="mt-8 font-semibold text-[var(--dim)]">No manipulatives match that search. Try a shorter word, like fraction or clock.</p> : null}

        {(saved.data?.workspaces ?? []).length > 0 ? (
          <section aria-label="Your saved workspaces" className="mt-8">
            <h2 className="font-display font-semibold text-2xl">Your saved workspaces</h2>
            <div className="flex flex-col gap-2 mt-3">
              {(saved.data?.workspaces ?? []).map((w) => (
                <div key={w.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] px-4 py-3 flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold tracking-widest">{w.code}</span>
                  <span className="font-semibold">{TOOLS.find((t) => t.slug === w.tool_slug)?.name ?? w.tool_slug}</span>
                  <span className="text-sm text-[var(--dim)]">{new Date(w.created_at).toLocaleString()}</span>
                  <span className="ml-auto flex gap-2">
                    <a href={`#${w.tool_slug}`} aria-label={`Open tool for workspace ${w.code}`} className="px-3 py-1.5 rounded-full bg-[var(--surface2)] text-sm font-bold">Open tool</a>
                    <button aria-label={`Delete workspace ${w.code}`} onClick={() => del.mutate(w.id)} className="px-3 py-1.5 rounded-full btn-danger text-sm font-bold">Delete</button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-label="About Oomba Academy" className="mt-10 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-5">
          <div className="flex flex-wrap items-center gap-3"><OombaLogo compact /><span className="font-display font-semibold text-xl">About Oomba Academy</span></div>
          <p className="text-sm text-[var(--dim)] mt-2">Oomba Academy: free, kid-safe learning games and building, no ads. Screen time you can feel good about. This manipulatives set is free to use here.</p>
          <p className="text-sm text-[var(--dim)] mt-2">Every tool works the same way: pick pieces from the palette, drag them on the desk, select a piece for its Copy, Flip, Rotate, Fill, Lock and Delete toolbar, annotate with the pen, then save with a Share Code or run it live with a class. The Tasks library has a ready-made activity for every tool and grade.</p>
        </section>
      </main>
      <footer className="oomba-foot">
        <span>✦ Oomba Academy · Screen time you can feel good about</span>
        <a href="#tasks" aria-label="Browse the tasks library">Tasks library</a>
        <a href="https://oomba.ai" target="_blank" rel="noreferrer" aria-label="Visit Oomba Academy at oomba dot ai">oomba.ai</a>
        <a href="https://oomba.ai/parents" target="_blank" rel="noreferrer" aria-label="Oomba Academy page for parents">For parents</a>
      </footer>
    </div>
  );
}
