// src/db/data/lesson-bodies.ts — the written lesson, as opposed to the video.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT IN lessons.ts
// Measured before writing a word: all 134 curated lessons carried a `tips`
// array and nothing else -- min 13 words, median 21, max 39. A "coached
// lesson" was a video plus a tweet. Reported from a real session: players
// ignore the article link, read the three tips, and get very little.
//
// Pulling the linked articles' text in was the obvious fix and is the wrong
// one twice over: those words belong to UDisc and Dynamic Discs, and a preview
// of somebody else's article still is not our lesson. So the body is written
// here instead. `lessons.ts` is a single 125KB JSON line (metadata, videos,
// resources) and is no place to hand-write prose, so the prose lives in its
// own file keyed by slug and is merged at seed time.
//
// THE SHAPE IS FIXED ON PURPOSE. Four named fields rather than free-form
// sections, so 134 lessons cannot drift into 134 different layouts, and so the
// drill's rep count is a FIELD -- a drill without a number to hit is a
// suggestion, and that is what the old tips already were.
//
// WHAT IS NOT ALLOWED IN HERE: a technique claim nobody can stand behind. The
// 2026-09-29 audit spent its length cleaning up content that merely looked
// plausible. Where the sport genuinely disagrees -- push putt versus spin putt
// being the clearest case -- this says so and names the trade, rather than
// picking the side that reads more confidently. Rules citations are to the
// PDGA rule, not to a forum summary of it.
//
// Coverage is partial by design: a lesson with no entry here keeps rendering
// its tips exactly as before, so this can land one category at a time.
// Bump CONTENT_VERSION in src/db/seed.ts after editing.

/** One fault and the correction for it. Paired so neither ships without the other. */
export interface LessonFault {
  fault: string;
  fix: string;
}

export interface LessonDrill {
  /** What to call it, so a player can ask for it by name. */
  name: string;
  /** The number to hit. "20 putts from 15 ft" -- never "practise regularly". */
  reps: string;
  body: string;
}

export interface LessonBody {
  /** Why a player should care, in terms of strokes. Two or three sentences. */
  why: string;
  /** The method, in order. Each step is one action. */
  how: string[];
  /** The faults that actually happen, each with its fix. */
  wrong: LessonFault[];
  drill: LessonDrill;
}

export const LESSON_BODIES: Record<string, LessonBody> = {
  // ─────────────────────── NEW TO DISC GOLF ───────────────────────
  'what-is-disc-golf': {
    why:
      'Disc golf is the rare sport you can play properly on your first afternoon. Most courses are free, a starter set costs less than a round of ball golf, and nothing about the game needs a lesson before you can enjoy it. What it does reward, immediately and for years, is accuracy and putting rather than raw power — which is why a 70-year-old regularly beats a 25-year-old who throws further.',
    how: [
      'You throw from a tee pad toward a basket, and every throw counts. The lowest total across the course wins.',
      'Wherever your disc comes to rest is where you throw from next. You mark that spot and throw again.',
      'The hole is finished when the disc comes to rest supported by the chains or sitting in the tray. Hitting the pole or the outside of the basket does not count.',
      'Most holes are par 3, meaning a drive, an approach and a putt. A course is usually 9 or 18 holes.',
      'Three discs cover the whole game: a putter for close in, a midrange for most shots, and a slower driver for distance.',
    ],
    wrong: [
      {
        fault: 'Assuming you need a bag of twenty discs before you can play.',
        fix: 'Three is genuinely enough for your first year, and fewer discs makes you better faster because you learn what each one does.',
      },
      {
        fault: 'Thinking the game is about throwing far.',
        fix: 'Rounds are decided inside 100 feet. Distance is the part that looks impressive and the part that matters least.',
      },
      {
        fault: 'Buying a fast distance driver first because the name sounds like the one you want.',
        fix: 'A fast disc needs arm speed you have not built yet and will dive hard left of where you aimed. Start slow and work up.',
      },
    ],
    drill: {
      name: 'Nine holes, three discs',
      reps: '9 holes with exactly 3 discs, counting every throw',
      body:
        'Take a putter, a midrange and one driver, and play nine holes counting honestly — penalties included. The number you write down is not meant to be good. It is your baseline, and beating it a month later is the most motivating thing in the sport.',
    },
  },

  'your-first-discs': {
    why:
      'The single biggest cause of early frustration is a disc that is too fast for your arm. A high-speed driver thrown at beginner speed finishes hard left for a right-handed backhand no matter how well you throw it — so it punishes good form and bad form identically, and teaches you nothing. Picking three forgiving discs is the cheapest improvement available to you.',
    how: [
      'Read the four flight numbers printed on most discs: speed, glide, turn and fade. Speed is how much arm you need; turn is negative when a disc wants to bend right for a right-handed backhand; fade is how hard it finishes left.',
      'Get a putter, around speed 2 or 3. It is for putting and for anything inside about 150 feet.',
      'Get a midrange, around speed 4 or 5. This should be the disc you throw most often for your first season.',
      'Get an understable fairway driver, around speed 6 or 7 with a turn of -2 or -3. That is your long shot.',
      'Choose lighter weights — 150 to 165 grams rather than 175. A lighter disc flies further with less power, which is exactly your situation.',
    ],
    wrong: [
      {
        fault: 'Starting with a speed 12 or 13 distance driver.',
        fix: 'Nothing above speed 9 is useful until you are throwing a midrange about 250 feet. Put it in the cupboard and come back to it.',
      },
      {
        fault: 'Buying at maximum weight because heavier sounds more stable.',
        fix: 'It is more stable, which is the opposite of what you want. Go light until your arm catches up.',
      },
      {
        fault: 'Borrowing a strong player’s overstable disc, throwing it badly, and concluding you cannot throw.',
        fix: 'Their discs are matched to their arm speed. Try the same shot with a light understable midrange before you judge yourself.',
      },
      {
        fault: 'Owning ten discs before you can reliably tell two of them apart in the air.',
        fix: 'Three discs, thrown a thousand times, teaches more than ten discs thrown a hundred times each.',
      },
    ],
    drill: {
      name: 'Learn what yours do',
      reps: '10 throws with each of your 3 discs (30 total), into an open field',
      body:
        'Throw each disc ten times at the same target with the same effort, and watch where it finishes rather than how far it goes. You are learning the shape: which one holds straight, which one fades left, which one turns right first. Knowing those three shapes is most of course management.',
    },
  },

  'your-first-throws': {
    why:
      'Almost every beginner throw fails the same two ways: the nose points up, so the disc climbs, stalls and falls; and the arm swings out away from the body, so the power leaks sideways. Fix those two and distance arrives on its own, without throwing harder — which is fortunate, because throwing harder makes both of them worse.',
    how: [
      'Take a power grip: four fingers curled under the rim, thumb flat on top, firm but not clenched.',
      'Stand side-on to your target, feet about shoulder width, with your throwing shoulder pointing where you want the disc to go.',
      'Reach back level. The disc stays at the same height the whole way back — not dropped, not lifted.',
      'Keep the disc flat with the nose very slightly down. A nose-up release is what makes a throw balloon and die.',
      'Pull the disc across your chest in a straight line, close to your body, the way you would start a lawnmower across you.',
      'Let it go without squeezing, and let your body rotate through rather than stopping at the release.',
      'Aim right of your target if you throw right-handed backhand. Every disc finishes left, and fighting that is how people spend a year throwing into trees.',
    ],
    wrong: [
      {
        fault: 'Rounding — swinging the disc out away from your body in an arc instead of pulling it straight across.',
        fix: 'Pull the disc past your sternum, close enough to brush your shirt. This is the single most common form fault in the sport.',
      },
      {
        fault: 'Releasing nose-up, so the disc climbs, stalls and drops.',
        fix: 'Think about the front edge pointing slightly down at release. It will feel like the disc will hit the ground. It will not.',
      },
      {
        fault: 'Throwing with the arm alone while the feet stay planted.',
        fix: 'Let your weight move from the back foot to the front foot as you throw. The arm is the last thing to move, not the only thing.',
      },
      {
        fault: 'Gripping so hard the wrist locks, which kills the snap that makes a disc spin.',
        fix: 'Firm fingers, loose wrist. Spin comes from the disc ripping out of a relaxed hand, not from squeezing.',
      },
    ],
    drill: {
      name: 'Stand-still flat',
      reps: '20 stand-still throws, no run-up, with a midrange',
      body:
        'No approach, no x-step: just stand side-on and throw. You are not chasing distance, you are chasing a disc that leaves flat and lands flat. Watch the last second of each flight — if it is turning over or stalling upward, the nose angle is the thing to change. A flat 200 feet beats a wobbling 250 every time.',
    },
  },

  'basic-rules': {
    why:
      'You only need about six rules to play a fair round, and they settle the two arguments that actually come up: where you are allowed to stand, and what going out of bounds costs. Knowing them also means you can play a casual round with strangers without anybody having to teach you mid-hole.',
    how: [
      'Tee off with your supporting point behind the front line of the tee pad, not over it.',
      'Play it where it lies. Mark your lie with a mini marker disc placed directly in front of where the disc came to rest, then throw with a supporting point within 30 cm directly behind that marker.',
      'The player whose disc is furthest from the basket throws first.',
      'Out of bounds costs one penalty throw, and you play from within one metre of the point where the disc last crossed into bounds.',
      'You have holed out when the disc comes to rest supported by the chains or resting in the tray. The pole and the outside of the basket do not count.',
      'Inside circle 1 — ten metres, usually marked — you must show you are balanced after a putt before you walk past your marker.',
    ],
    wrong: [
      {
        fault: 'Stepping past the marker on the follow-through, which is a foot fault.',
        fix: 'Place your front foot deliberately behind the marker before you throw, and on putts inside the circle, stay on your feet until the disc lands.',
      },
      {
        fault: 'Moving a branch, a leaf or a stone that is in the way.',
        fix: 'PDGA rule 803.01 says obstacles to a stance may not be moved. You take the lie as you find it — which is also why where your drive finishes matters so much.',
      },
      {
        fault: 'Re-throwing a bad shot because it felt like practice.',
        fix: 'Every throw counts from the moment you start the hole. Counting honestly is the whole basis of the score meaning anything.',
      },
      {
        fault: 'Assuming a disc stuck up a tree is automatically a penalty.',
        fix: 'The two-metre rule is optional and off by default in PDGA play — it only applies where the organiser says so. In a casual round, mark below it and play on.',
      },
    ],
    drill: {
      name: 'Play one strict round',
      reps: '1 full round marking every single lie',
      body:
        'Play nine or eighteen holes marking every lie with a mini and placing your foot deliberately behind it, including on throws where it obviously does not matter. It is slow and slightly silly for one round, and after that you do it without thinking — which is the point, because the rules only cost you strokes when you are improvising under pressure.',
    },
  },

  'how-scoring-works': {
    why:
      'Scoring itself is simple arithmetic. What catches people out is the vocabulary, and not knowing it is the thing that makes a first round with strangers uncomfortable. Ten minutes here means you can keep a card for a group on day one.',
    how: [
      'Count every throw you make on a hole, and add any penalty throws, to get your score for that hole.',
      'Par is the number a competent player is expected to take. On most disc golf holes that is 3: a drive, an approach and a putt.',
      'Your score is usually spoken relative to par. One under is a birdie, two under an eagle, one over a bogey, two over a double bogey.',
      'Holing out from the tee is an ace — a hole in one.',
      'Add every hole together for a round total. Scorecards normally also show your running total against par, so +4 after nine holes means four throws more than par.',
      'Lowest total wins. There is no scoring advantage anywhere for throwing further.',
    ],
    wrong: [
      {
        fault: 'Forgetting to add the penalty throw after going out of bounds.',
        fix: 'Write the hole score down before you walk to the next tee, while the penalty is still fresh.',
      },
      {
        fault: 'Not counting a short throw that only travelled a few feet.',
        fix: 'Every release counts, including the one that hit a tree two metres away.',
      },
      {
        fault: 'Comparing your total with a professional’s score on television.',
        fix: 'They are playing a different course at a different length. Compare your total only with your own previous total on the same layout.',
      },
      {
        fault: 'Judging a round by par when par is set for far better players.',
        fix: 'For your first season, ignore par entirely and track your own number. Going from 72 to 65 on your local course is real progress whatever par says.',
      },
    ],
    drill: {
      name: 'Keep the card',
      reps: '1 full round, writing each hole score down before leaving the tee',
      body:
        'Keep the card for your whole group for one round, on paper or in the app. Writing somebody else’s score forces you to actually watch and count, and after eighteen holes of it the vocabulary is yours permanently.',
    },
  },

  'etiquette-101': {
    why:
      'Disc golf is played in groups, on shared ground, with objects flying at head height. Nearly every bit of friction on a course is avoidable, and the habits that avoid it take no skill at all — which makes this the fastest way to be welcome in any group you join.',
    how: [
      'Stand still and quiet behind the person throwing, never in front of them and never in their eyeline.',
      'Whoever is furthest from the basket throws first. On the tee, the lowest score on the previous hole goes first.',
      'Shout "FORE!" loudly and immediately if your disc heads anywhere near another person. It is the one thing you should never be shy about.',
      'Wait until the group ahead is out of range before you throw. If a faster group catches you, wave them through.',
      'Take your rubbish with you, and do not break branches to open a line. The course belongs to everybody who plays it after you.',
      'Help look for a lost disc, and return any you find — which is why your name and phone number should be on yours.',
    ],
    wrong: [
      {
        fault: 'Walking ahead to your own disc while somebody is still throwing.',
        fix: 'Stay behind the thrower until the disc has landed. This is the most common one and the most genuinely dangerous.',
      },
      {
        fault: 'Talking, rustling a bag or moving during someone’s throw.',
        fix: 'Be still from the moment they step onto the pad. It costs you nothing and is noticed every time.',
      },
      {
        fault: 'Throwing when you are not sure whether the group ahead is clear.',
        fix: 'If you cannot see them, wait. A disc at speed into a stranger is the one mistake with consequences beyond your scorecard.',
      },
      {
        fault: 'Playing music out loud on a busy course.',
        fix: 'Headphones, or nothing. Other groups are concentrating even if you are not.',
      },
    ],
    drill: {
      name: 'Watch where you stand',
      reps: '1 round deliberately positioning yourself for every throw',
      body:
        'For one round, before each person throws, consciously put yourself behind them and off to the side where they can see you are not in the way. Notice how often you would otherwise have been ahead of the thrower. After one round it stops being a decision.',
    },
  },

  'your-first-round': {
    why:
      'The first round decides whether most people come back. The sport is not the problem when they do not — the course usually is. Picking a short, open, quiet course for your first outing is worth more than any amount of practice beforehand.',
    how: [
      'Pick a beginner-friendly course: mostly par 3s, holes under about 300 feet, and not heavily wooded. Course apps list length and difficulty.',
      'Go at a quiet time. A weekday morning means nobody waiting behind you while you look for a disc.',
      'Take three discs, water, a mini marker and a small towel. That is the whole kit.',
      'Play from the shortest tees. There is no prize for the long ones and they turn a fun round into a long one.',
      'Write your name and phone number on every disc before you leave the house.',
      'Count every throw, write the total down, and keep it. That number is the one you will beat.',
    ],
    wrong: [
      {
        fault: 'Starting at the longest, most wooded course nearby because it is the one everybody talks about.',
        fix: 'Those courses are good because they are hard. Earn them. A short open course on day one is far more fun.',
      },
      {
        fault: 'Going on a Saturday afternoon with groups stacked up behind you.',
        fix: 'Go early on a weekday. You will play twice as fast and feel none of the pressure.',
      },
      {
        fault: 'Measuring the day against par and leaving discouraged.',
        fix: 'Par is set for players with years of practice. Your own total, beaten next time, is the only score that means anything yet.',
      },
      {
        fault: 'Taking one disc, or taking fifteen.',
        fix: 'Three. You will lose less, carry less and learn faster.',
      },
    ],
    drill: {
      name: 'Beat your own number',
      reps: 'the same 9 holes, twice, within 2 weeks',
      body:
        'Play nine holes and write the total down. Play the same nine again within a fortnight and compare. Almost everybody improves by several throws between the first and second attempt, purely from knowing where the trouble is — and seeing that happen is what turns a first round into a second season.',
    },
  },

  // ─────────────────────────────── PUTTING ───────────────────────────────
  'putting-fundamentals': {
    why:
      'A putt is the shortest throw in the game and the most expensive one to miss: a 20-foot putt that slides past costs exactly the same stroke as a drive into the woods, and you will face far more of them. Everything inside the circle is also the part of your game you can practise in a back garden, without a course, in ten minutes. That combination — high cost, cheap practice — is why it comes first.',
    how: [
      'Set your feet the same way every time. Staggered, with your throwing-side foot forward, is the usual starting point: feet about shoulder width, front toe pointed at the basket, weight even or slightly forward.',
      'Take a grip you can repeat. A fan grip spreads the fingers under the flight plate for control; a stacked grip bunches them under the rim for more spin. Either is fine. Changing between them mid-round is not.',
      'Hold the disc flat and level, out in front of your sternum, with the nose neither up nor down.',
      'Pick one aim point before you move — a single link of chain, not "the basket".',
      'Move the disc back a short way and then push it at the aim point. This is a pendulum, not a swing: the hand travels in a straight line toward the target.',
      'Extend through the release so your hand finishes pointing at the pole, and keep your eyes on the aim point until you hear the disc land.',
    ],
    wrong: [
      {
        fault: 'Slowing down just before release, usually on a putt you badly want.',
        fix: 'Commit to the aim point before you step in, then accelerate through the release. A decelerating putt misses low and short almost every time.',
      },
      {
        fault: 'Lifting your eyes to watch the result while the disc is still in your hand.',
        fix: 'Hold your eyes on the aim point through the release. Looking up pulls your shoulders and the disc with them.',
      },
      {
        fault: 'Aiming at the basket as a whole.',
        fix: 'Aim at one link. A target the size of a dinner plate produces a tighter miss than a target the size of a basket.',
      },
      {
        fault: 'A different stance on every putt, so the stroke never gets a chance to repeat.',
        fix: 'Mark your lie, then set your front foot first, the same way, every single time — including on tap-ins.',
      },
    ],
    drill: {
      name: 'Twenty from fifteen',
      reps: '20 putts from 15 ft, then 20 from 20 ft',
      body:
        'Same aim point, same stance, same grip for all twenty. Count your makes and write the number down. At 15 feet you are looking for 18 out of 20 before you move back; if you are below that, stay there — a stroke that is not reliable at 15 feet is not going to become reliable at 30.',
    },
  },

  'push-vs-spin-putt': {
    why:
      'These are the two putting styles, and the sport genuinely has not settled which is better — there are world titles won with each. What costs strokes is not picking the wrong one, it is never picking: a half-committed stroke somewhere between the two gives you a different amount of spin on every putt, and therefore a different flight. The point of this lesson is to choose and stop choosing.',
    how: [
      'The push putt: the disc is pushed at the target by the legs and the extending arm, with the wrist staying nearly fixed. It leaves with little spin, flies slowly and lands softly.',
      'The spin putt: the same stroke plus a wrist snap at release, which puts spin on the disc. It carries further for the same effort and holds whatever angle you release it at.',
      'Know the real trade. Spin resists being pushed off line, so a slightly imperfect release angle still flies roughly straight — but a spinning disc is more likely to hit chains and spin back out. Low spin drops into the tray instead of spitting, but gives you less margin on the angle.',
      'Test both honestly rather than by feel: fifteen putts from 20 feet with each, on three different days, counting makes.',
      'Take the higher number and stop switching. If they tie, keep whichever one you can repeat when you are tired.',
    ],
    wrong: [
      {
        fault: 'Switching styles mid-round after two misses.',
        fix: 'Finish the round with what you started. A style change is a practice-session decision, not an in-round one.',
      },
      {
        fault: 'A hybrid nobody chose — some wrist on some putts, none on others.',
        fix: 'Film ten putts from behind. If the amount of spin visibly varies, you do not yet have a style, you have two half-styles.',
      },
      {
        fault: 'Choosing from what a favourite pro does rather than from your own numbers.',
        fix: 'Their stroke suits their body and their practice history. Your counted makes are the only evidence that applies to you.',
      },
    ],
    drill: {
      name: 'Head to head',
      reps: '15 putts per style from 20 ft, on 3 separate days (90 putts total)',
      body:
        'Alternate in blocks of five so neither style gets only your fresh arm. Write the six numbers down before you judge anything — one session is noise, three is a signal. Then commit to the winner for a month before you reconsider.',
    },
  },

  'putting-routine': {
    why:
      'Your stroke does not leave you on hole 18. Your tempo does. Under pressure the gap between setting up and releasing stretches, the number of practice motions creeps up, and the putt comes out slower than the one you made all afternoon in practice. A routine is a fixed sequence that gives pressure nothing to change.',
    how: [
      'Stand behind your marker and decide everything there: the aim point, the line, how hard. Decisions happen here and nowhere else.',
      'Step in with the same foot first, to the same place, every time.',
      'Make a fixed number of practice motions — one, two or three, whichever suits you. Pick the number now and count it.',
      'Take one breath out.',
      'Putt immediately. There is no pause between the last practice motion and the real one; that pause is where the stroke changes.',
      'Hold your finish and your eyes until the disc lands, then step off.',
    ],
    wrong: [
      {
        fault: 'A practice-motion count that grows when the putt matters.',
        fix: 'Count them out loud in practice until the number is automatic. Two is two on hole 1 and on hole 18.',
      },
      {
        fault: 'Freezing over the putt while you reconsider the line.',
        fix: 'Step all the way off, go back behind your marker and start the routine again. Re-deciding from inside the stance is how both the line and the tempo go.',
      },
      {
        fault: 'Running the routine only on putts that feel important.',
        fix: 'Use it on every putt including two-footers. A routine you only use under pressure is a routine you have never practised under pressure.',
      },
    ],
    drill: {
      name: 'Count your own',
      reps: '10 putts filmed, then 10 putts to a fixed count',
      body:
        'Film ten putts from the side and count the practice motions on each. Most players are surprised — the number is rarely the same twice. Then pick your number and putt ten more to it exactly. Carry it into your next three rounds, tap-ins included.',
    },
  },

  'putting-pop-power': {
    why:
      'Your stand-still range is the distance at which you can still putt at the chains rather than lagging. If that range is 25 feet, every putt past it is a two-putt by default. Adding ten honest feet of range does not just add makes at 30 feet — it turns a whole band of lag putts into looks at the basket.',
    how: [
      'Start lower than feels necessary: bend at the knees, with your weight settled rather than perched.',
      'Drive upward and forward with the legs as the arm extends. The disc gets its extra speed from your whole body rising, not from a harder pull.',
      'Let the weight shift from the back foot to the front foot as you go. The stroke shape does not change; the engine underneath it does.',
      'Keep the release angle flat and the aim point the same. Extra power is the only variable you are adding.',
      'Land balanced. Inside the circle, PDGA rule 806.01 requires you to demonstrate full control of balance before you move past your marker, so a putt you fall forward out of is a stroke penalty however well it flew.',
    ],
    wrong: [
      {
        fault: 'Adding power with the arm, which changes the release angle and scatters putts left and right.',
        fix: 'Keep the arm doing exactly what it does at 20 feet and add the leg drive underneath it.',
      },
      {
        fault: 'Standing tall at setup, which leaves no leg left to push with.',
        fix: 'Get low first. You cannot drive up from a position you are already standing up in.',
      },
      {
        fault: 'Straightening up before the disc leaves your hand.',
        fix: 'Time the rise so the disc is released as you extend, not after. If you are already upright at release, the legs contributed nothing.',
      },
      {
        fault: 'Falling forward on circle-1 putts to reach the basket.',
        fix: 'If you need to fall forward to get there, you are outside your range — lag it, or straddle for a more stable base.',
      },
    ],
    drill: {
      name: 'Find the edge',
      reps: '10 putts each from 25, 30 and 35 ft (30 total)',
      body:
        'Stand-still only, counting makes at each distance. The distance where your make rate drops below about half is the real edge of your range — not where you feel confident, where the numbers stop. Then do the bulk of your practice five feet inside it, which is where added range actually comes from.',
    },
  },

  'straddle-putt': {
    why:
      'Sooner or later your lie is behind a trunk, under a low branch, or on a slope where a staggered stance will not stand up. The straddle solves all three. It also gives you a much wider, more stable base, which is why it is worth having for long circle-1 putts where the balance rule is the thing most likely to cost you a stroke.',
    how: [
      'Set your feet wide and roughly parallel, both pointing more or less at the basket, with the obstacle between them or outside your front foot.',
      'Settle your weight evenly between the feet and bend both knees. The width is the point; a narrow straddle is just a worse stance.',
      'Start the disc in front of your sternum, flat, with your shoulders square to the target.',
      'Push the disc straight at the aim point. The hand travels in a line toward the basket — it does not swing across your body.',
      'Keep your chest square through the release and stay balanced over both feet.',
    ],
    wrong: [
      {
        fault: 'A base barely wider than a normal stance, which gives up the stability the straddle exists for.',
        fix: 'Go wider than feels natural. If you can comfortably bring your feet together from where you are standing, you are not straddling.',
      },
      {
        fault: 'Pulling the disc across the body instead of pushing it out, which sends a right-handed putt left.',
        fix: 'Feel the hand finish pointing at the pole, not at your opposite shoulder.',
      },
      {
        fault: 'Leaning onto the front foot, which re-introduces the balance problem you straddled to avoid.',
        fix: 'Keep the weight between the feet. Pick the aim point so you do not need to lean to reach it.',
      },
      {
        fault: 'Trying to generate the same pop from a base you cannot push up out of.',
        fix: 'Accept slightly less range from a straddle, and lag from distances where you would have to force it.',
      },
    ],
    drill: {
      name: 'Blocked lie',
      reps: '20 straddle putts from 20 ft, then 10 alternating from 25 ft',
      body:
        'Put your bag on the ground where a trunk would be, directly in front of your marker, so the straddle is forced rather than chosen. Twenty from 20 feet. Then alternate five staggered and five straddled from 25 feet, counting each separately — the gap between those two numbers is how much the straddle is currently costing you, and it should shrink with practice.',
    },
  },

  'lag-putting-c2': {
    why:
      'From circle 2 — 33 to 66 feet — nobody makes a high percentage, professionals included. So the stroke you are saving is almost never the one you are standing over. It is the next one. A good circle-2 putt leaves a tap-in and costs you two; a bad one runs 20 feet past or stops 20 feet short and costs you three. Play for the two.',
    how: [
      'Pick a landing zone rather than a link: a patch of ground just under the basket that you would be happy to putt from next.',
      'Choose the safe side. Away from the OB line, away from the slope that runs off, away from the bush behind — a miss on that side still leaves a putt.',
      'Throw a full, committed stroke on a slightly higher line, so the disc arrives descending and sits down instead of skipping.',
      'Use a putter you can comfortably reach the basket with. Straining for the distance changes the angle long before it changes the result.',
      'Accept it as a lag. Hitting the chains from 55 feet is a bonus, not the plan.',
    ],
    wrong: [
      {
        fault: 'Jamming it — a hard, flat putt that misses and runs well past, leaving a longer comeback than the putt you just had.',
        fix: 'Trade the small chance of a make for the large chance of a tap-in. Higher line, softer arrival.',
      },
      {
        fault: 'Decelerating because the distance looks intimidating, and leaving it 20 feet short.',
        fix: 'A full stroke on a higher line goes further than a timid stroke on a flat one. Commit to the stroke and control distance with the line.',
      },
      {
        fault: 'Aiming at the chains with no thought for where a miss finishes.',
        fix: 'Before you step in, name out loud where you would rather be if you miss, and aim so a miss goes there.',
      },
    ],
    drill: {
      name: 'Score the second putt',
      reps: '10 putts from 45 ft',
      body:
        'Do not count makes. Count how many finish inside ten feet of the basket, which is the thing that decides whether you two-putt. Eight out of ten is a good number to chase. This scores the skill the shot actually needs, and it will change how you throw the putt within about five reps.',
    },
  },

  'putting-in-wind': {
    why:
      'Wind is the condition that separates scores, because almost nobody practises in it — the still evening in the back garden is not the round you lose strokes in. The adjustments are small, specific and different in each direction, and knowing them turns a windy round from a lottery into an ordinary one.',
    how: [
      'Into a headwind, putt lower and firmer with more spin. The extra airspeed gives the disc more lift and makes it want to turn over, so aim at the bottom of the chains or the base of the pole rather than the top band.',
      'With a tailwind, take power off and aim at the front edge of the tray. There is less airspeed holding the disc up, but the wind is carrying it along, so a normal-strength putt sails past.',
      'Across the wind, aim upwind of the chains by however far you judge it will drift, and tilt the leading edge slightly into the wind so the air pushes the disc down rather than lifting it.',
      'In any wind, get lower and widen your base — a straddle is often the right answer — and put more spin on the putt so the disc holds the angle you gave it.',
      'Keep your routine running at its normal speed. Waiting out a gust that never fully arrives costs more putts than the gust would have.',
    ],
    wrong: [
      {
        fault: 'Putting soft into a headwind, which lets the wind knock the disc down short.',
        fix: 'Firmer and lower. A headwind punishes a floaty putt more than any other condition.',
      },
      {
        fault: 'Aiming at the chains in a crosswind and letting the wind decide the rest.',
        fix: 'Pick an aim point off the basket, upwind, and commit to it. It will feel wrong and it will work.',
      },
      {
        fault: 'Standing tall and getting pushed around mid-stroke.',
        fix: 'Lower centre of gravity, wider feet. Stability first, then power.',
      },
      {
        fault: 'Using the same putter in 25 mph as in dead calm.',
        fix: 'Carry something more stable, or a beaded putter, for wind — and know which one it is before you need it.',
      },
    ],
    drill: {
      name: 'Three directions',
      reps: '20 putts from 20 ft in each of headwind, tailwind and crosswind (60 total)',
      body:
        'This one has to be done on a windy day, which is the whole point — it is the session everybody skips. Move around the basket so the wind comes from each direction in turn, and note how far the misses drift rather than just counting makes. The drift distance is the number you will actually use on the course.',
    },
  },

  'jump-putt': {
    why:
      'A jump putt is how you attack from outside your stand-still range instead of lagging. It is also the putt most often thrown illegally, so the rule is worth getting exactly right before the technique.',
    how: [
      'Know where it is legal. Inside circle 1 — 10 metres — PDGA rule 806.01 requires you to demonstrate full control of balance before moving past your marker, which rules the jump putt out entirely. Outside the circle it is legal.',
      'Know what makes it legal out there. Rule 802.07 requires that any supporting point touching the ground at the moment of release is behind your marker. Airborne means no supporting point at all, so the release has to happen before you land.',
      'Load onto the back foot behind your marker, bending to store something to push with.',
      'Jump up and forward, toward the basket rather than straight into the air.',
      'Release at the top, while you are still off the ground, with the same upper-body stroke you use standing still.',
      'Land past the marker and stay on your feet.',
    ],
    wrong: [
      {
        fault: 'Landing before the disc leaves your hand, which is a stance violation.',
        fix: 'Release earlier — at the top of the jump, not on the way down. If you are unsure, have someone film it from the side once.',
      },
      {
        fault: 'Jumping straight up, which adds effort and no distance.',
        fix: 'Drive forward at the basket. The jump is a way of moving your whole body at the target.',
      },
      {
        fault: 'Changing the arm stroke at the same time, so two variables move at once and nothing is diagnosable.',
        fix: 'Keep the stroke identical. The legs supply the distance; that is the entire idea.',
      },
      {
        fault: 'Jumping so hard the release angle tilts and the putt sprays.',
        fix: 'Use the smallest jump that reaches. A controlled hop beats a leap.',
      },
    ],
    drill: {
      name: 'Is it earning its place',
      reps: '10 stand-still then 10 jump putts from 40 ft',
      body:
        'Same spot, same basket, back to back. Compare two numbers: makes, and how far the misses finish from the basket. If the jump putt is not reaching further without scattering more, it is not ready for a round yet — keep it in practice and lag instead. Most players find it gains distance long before it gains accuracy.',
    },
  },

  'putting-drills': {
    why:
      'Throwing a hundred putts from the same spot is not practice, it is repetition with no feedback — and it builds a stroke you never actually use, because on the course you get one putt, from an awkward angle, with a routine in front of it. A drill has a distance, a rep count and a number to beat, which is what makes it possible to tell whether you are improving.',
    how: [
      'The ladder: five putts each from 15, 20, 25, 30 and 35 feet, recording makes per distance. This is the one that tells you where your range really ends.',
      'Around the world: ten putts from 20 feet, moving to a different angle every putt. Your lie in a round is almost never straight on.',
      'The pressure set: make five in a row from 20 feet before you are allowed to stop. One miss and the count goes back to zero.',
      'One-putt: twenty putts taken one at a time, each with your full routine, from a distance you pick at random. This is the only drill that rehearses the thing a hole actually asks of you.',
      'Keep sessions short — 50 to 100 putts in fifteen or twenty minutes, with attention on every one, beats 300 on autopilot.',
    ],
    wrong: [
      {
        fault: 'Practising only the distance you are already good at.',
        fix: 'Let the ladder pick for you. Spend your time where the numbers fall off, not where they look good.',
      },
      {
        fault: 'Rapid-firing from a pile of discs with no routine.',
        fix: 'At least one set per session with the full routine, one disc, stepping off between putts. Otherwise you are practising a stroke you will never use.',
      },
      {
        fault: 'Keeping no record, so progress is a matter of opinion.',
        fix: 'Write the numbers in a note on your phone. Five numbers per session is enough to see a trend in a month.',
      },
      {
        fault: 'Practising to exhaustion, which trains a tired stroke.',
        fix: 'Stop when your attention goes, not when your arm does.',
      },
    ],
    drill: {
      name: 'The ladder, written down',
      reps: '25 putts — 5 each from 15, 20, 25, 30 and 35 ft, once a week',
      body:
        'Five numbers, recorded every week. That is the whole drill, and it is the most useful fifteen minutes in your practice week: it tells you your real circle-1 range, it shows you which distance to work on next, and after a month it tells you whether anything you changed actually helped.',
    },
  },

  'putting-mental': {
    why:
      'By the time a putt matters, the stroke is already built — it does not leave you on the last hole of a tournament. What leaves is commitment: the decision gets made twice, the tempo stretches, and a putt you have made a thousand times comes out differently. This is about keeping the decision and the execution in separate places.',
    how: [
      'Make every decision behind your marker: the aim point, the line, the power. Then they are made.',
      'Once you have stepped in, you are only executing. There is nothing left to decide, so there is nothing to second-guess.',
      'Carry one thought into the release — the aim point. Not the mechanics, not the score, not the consequence.',
      'Keep your eyes on the aim point until the disc lands, which is a mechanical cue as much as a mental one.',
      'Allow yourself a few seconds to react to a miss, then put it down. The next putt is a separate event and does not inherit anything from this one.',
    ],
    wrong: [
      {
        fault: 'Thinking about mechanics over the putt — grip, elbow, follow-through.',
        fix: 'That work belongs in practice. On the course the only thought is where you are aiming.',
      },
      {
        fault: 'Replaying the last miss while standing over the next putt.',
        fix: 'Run the routine. It is a physical sequence precisely because it gives your attention something to do that is not the last hole.',
      },
      {
        fault: 'Specific negative self-talk — "I always miss these from here."',
        fix: 'Notice that a sentence like that is an instruction, and replace it with the aim point. Saying the aim point quietly out loud works better than trying not to think the other thing.',
      },
      {
        fault: 'Changing your routine or your style because you missed two.',
        fix: 'Finish the round with what you brought. Two misses is not evidence of anything.',
      },
    ],
    drill: {
      name: 'Five in a row, tired',
      reps: '5 consecutive makes from 20 ft, at the END of a session',
      body:
        'Miss and the count goes back to zero. Doing it last, when you are tired and want to go home, is the entire point — that is the state a closing hole puts you in. Then take one thing onto the course: say your aim point quietly out loud before every putt inside 30 feet, for one whole round.',
    },
  },
};

/** True when a lesson has a written body, so callers can fall back to tips. */
export function hasBody(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(LESSON_BODIES, slug);
}
