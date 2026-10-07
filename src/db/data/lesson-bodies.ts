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
  // ─────────────────────── FORM & TECHNIQUE ───────────────────────
  'grip-basics': {
    why:
      'The grip decides two things nothing else can fix: how much spin the disc leaves with, and exactly when it leaves. Too loose and it slips out early, wobbling, with no spin to hold a line. Too tight and the wrist locks, which kills the snap that spin actually comes from. Almost every "I cannot throw far" problem has a grip component.',
    how: [
      'For drives, use a power grip: all four fingers curled under the rim with the pads pressed into the inside of the rim, thumb flat on top roughly above them.',
      'For putts and short approaches, a fan grip works better: fingers spread across the underside of the flight plate for control rather than power.',
      'Squeeze with the fingers, not the whole hand. The pressure is in the last joint of each finger; the wrist stays loose.',
      'Keep the thumb on the flight plate near the rim rather than stretched out toward the centre, which gives away leverage.',
      'Use the same grip for every throw of the same type. Grip is the one variable you should never be adjusting mid-round.',
    ],
    wrong: [
      {
        fault: 'A death grip, squeezing with the whole hand and forearm.',
        fix: 'Firm fingers, loose wrist. A locked wrist cannot snap, and the snap is where spin comes from — squeezing harder makes the disc spin less.',
      },
      {
        fault: 'Holding the disc loosely enough that it slips out early, which shows up as a wobbling flight.',
        fix: 'If the disc flutters off the hand, grip pressure is the first thing to raise. The disc should have to be ripped out, not let go.',
      },
      {
        fault: 'A different grip on every throw, so nothing else can be diagnosed.',
        fix: 'Set it deliberately before each throw until it is automatic. You cannot tune anything downstream of an input that keeps changing.',
      },
      {
        fault: 'The thumb stretched toward the centre of the flight plate.',
        fix: 'Keep it near the rim, opposite the fingers. That is where it can actually hold the disc against the pull.',
      },
    ],
    drill: {
      name: 'One grip, twenty throws',
      reps: '20 throws setting the grip deliberately before each one',
      body:
        'Set the grip, check it, then throw — twenty times, same disc, same effort. Watch only for wobble in the first twenty feet of flight. A clean throw leaves silently and flat; a slipped one flutters. You are looking to make the second kind disappear entirely before you worry about distance.',
    },
  },

  'stance-fundamentals': {
    why:
      'Your stance is everything upstream of the arm. If the base is unstable you cannot brace, and if you cannot brace, the energy you generate goes into moving your own body around rather than into the disc. This is why some players with modest arms outdrive stronger ones: they are standing on something solid.',
    how: [
      'Set your feet about shoulder width or a little wider, side-on to the target, with your throwing shoulder pointing where the disc is going.',
      'Start with your weight loaded on the back leg, knee soft rather than locked.',
      'Keep your chest turned away from the target as you reach back. Opening it early is how power leaks.',
      'Plant the front foot deliberately, with the toe pointing down the target line or slightly across it.',
      'Keep the knees bent through the throw. Standing up mid-throw is the quiet killer of distance.',
    ],
    wrong: [
      {
        fault: 'Feet too close together, which leaves nothing to brace against.',
        fix: 'Widen until you feel you could be shoved and not move. That is the base a throw is built on.',
      },
      {
        fault: 'Standing tall with straight legs.',
        fix: 'Soft knees at setup and through the throw. A straight leg cannot absorb or redirect anything.',
      },
      {
        fault: 'Opening the chest toward the target before the pull begins.',
        fix: 'Stay closed until the front foot has planted. The chest opening IS the throw; doing it early means doing it with nothing left.',
      },
      {
        fault: 'Weight already on the front foot before the arm starts.',
        fix: 'Load back, then move forward. If you start forward there is no transfer to make.',
      },
    ],
    drill: {
      name: 'Plant and hold',
      reps: '20 stand-still throws, holding the finish for 2 seconds',
      body:
        'Throw from a standstill and freeze when the disc leaves, holding your finish for a slow count of two. If you cannot hold it, you were off balance during the throw and the disc knows. This finds the fault faster than any amount of watching video of yourself.',
    },
  },

  'reach-back': {
    why:
      'The reach back sets the length of the path the disc accelerates over, but more importantly it sets the LINE. A reach back that drifts out behind you makes rounding inevitable, because the arm has to come back in before it can go forward — and no amount of work on the pull fixes a bad start to it.',
    how: [
      'Reach straight back along the line you want the disc to travel, not out to the side.',
      'Keep the disc level with your shoulder. Dropping it low or lifting it high changes the release angle before you have even started.',
      'Keep the disc flat, matching the angle you intend to release at.',
      'Let the shoulders turn away with the arm rather than the arm stretching away from a still body.',
      'Finish the reach back before the forward move starts. Smooth and complete beats long and rushed.',
    ],
    wrong: [
      {
        fault: 'Reaching back and around, so the disc ends up behind your back rather than behind your shoulder.',
        fix: 'Imagine a rail along your target line and keep the disc on it. Everything you want from a throw starts with this path being straight.',
      },
      {
        fault: 'Letting the disc drop toward the ground at the back of the reach.',
        fix: 'Level with the shoulder. A dropped reach back comes through nose-up, which is why the throw balloons.',
      },
      {
        fault: 'Over-reaching until balance goes.',
        fix: 'Reach as far as you can while still being able to stop. Extra inches bought with balance cost more than they pay.',
      },
      {
        fault: 'Starting forward while still reaching back, so the two moves overlap.',
        fix: 'Complete one, then the other. Rushing them together is what makes a throw feel frantic and come out short.',
      },
    ],
    drill: {
      name: 'On the rail',
      reps: '15 slow reps at half speed, then 10 throws',
      body:
        'Stand beside a fence line, a path edge or a line of discs on the ground running toward your target. Do fifteen reach-backs at half speed watching the disc stay on that line, then throw ten. The slow reps are the point — at full speed you cannot feel where the disc went.',
    },
  },

  'follow-through': {
    why:
      'You cannot stop a properly accelerated throw cleanly, so the follow-through is evidence as much as technique: if you can come to a dead halt at the release, you were slowing down before it. It is also what stops you decelerating in the first place, because a body that intends to finish does not brake at the last moment.',
    how: [
      'Let the momentum rotate you rather than resisting it. The hips and chest finish facing the target or past it.',
      'Allow the weight to arrive fully on the front foot.',
      'Let the trailing arm pull back as the throwing arm comes through — it is a counterweight, not decoration.',
      'Outside the putting circle, stepping through after the release is normal and legal. Let it happen.',
      'Finish balanced. Spinning off or falling sideways means something upstream was off.',
    ],
    wrong: [
      {
        fault: 'Stopping the arm at the moment of release.',
        fix: 'Throw through the release point, not to it. A disc that is still accelerating when it leaves goes further and flies flatter.',
      },
      {
        fault: 'Falling backwards after the throw.',
        fix: 'The weight never transferred. Work on the plant and brace rather than the finish — the finish is the symptom.',
      },
      {
        fault: 'Spinning off the plant foot before the disc has gone.',
        fix: 'The front leg should stop the body’s forward movement, not pivot out of its way. Plant it and let it hold.',
      },
    ],
    drill: {
      name: 'Hold the finish',
      reps: '20 throws, holding the finish until the disc lands',
      body:
        'Throw, then stand still in the finished position until the disc hits the ground. You will find yourself unable to on some throws, and those are exactly the ones that went badly. Making the hold possible every time quietly fixes balance, bracing and deceleration at once.',
    },
  },

  'putting-form': {
    why:
      'Putting is the one throw where everything that makes a drive long makes the shot worse. There is no run-up, no weight shift to time, no big rotation — and the single biggest putting fault among people who drive well is importing drive mechanics into a stroke that does not want them. This lesson is about what to strip out; the Putting path covers the stroke itself in depth.',
    how: [
      'Keep the motion short. The disc travels a fraction of the distance it does on a drive, and anything longer adds variability for no range.',
      'Keep the shoulders square to the target rather than turning away. Rotation is the drive’s engine and the putt’s enemy.',
      'Take what little power you need from the legs, pushing up and forward, not from a bigger arm swing.',
      'Move the hand in a straight line at the aim point and extend through it, finishing with the hand pointing at the pole.',
      'Stay balanced and upright. Inside circle 1 you must demonstrate control of balance after the release, so a putt you fall out of costs a stroke.',
    ],
    wrong: [
      {
        fault: 'Reaching back and rotating the shoulders as if driving.',
        fix: 'Square and short. If your putting motion looks like a small version of your drive, it is still too big.',
      },
      {
        fault: 'Adding power with the arm when the putt is long.',
        fix: 'Bend lower and push up with the legs. The arm’s job is the line; the legs’ job is the distance.',
      },
      {
        fault: 'Different power on every putt from the same distance.',
        fix: 'Pick an aim point and a stroke size that go together, and repeat them. Consistency of effort matters more than the exact amount.',
      },
      {
        fault: 'Falling forward on circle-1 putts.',
        fix: 'If you need to fall forward to get there you are outside your range. Lag it, or build the range in practice first.',
      },
    ],
    drill: {
      name: 'Square shoulders',
      reps: '20 putts from 20 ft with your back against nothing but your shoulders kept square',
      body:
        'Twenty putts from twenty feet with one rule: the shoulders do not turn. Have somebody watch from behind, or film it — most people are rotating far more than they believe. Taking the rotation out usually costs a little distance on the first session and gains a great deal of consistency within a week.',
    },
  },

  'advanced-weight-transfer': {
    why:
      'Distance is a timing problem rather than a strength one. Energy travels legs to hips to torso to shoulder to arm to disc, each link accelerating and then slowing to hand what it has to the next. Any link that fires early leaves the ones after it with less to work with — which is why a well-timed throw from an average athlete outruns a muscled one.',
    how: [
      'Load onto the rear leg at the end of the reach back, with the knee soft and the weight genuinely back.',
      'Start the move forward with the hips, not the arm or the shoulders.',
      'Plant the front foot and then BRACE — the front leg stops moving forward, which turns your linear speed into rotation.',
      'Let the chest open against that brace, then the shoulder, then the arm.',
      'The disc rips out last, late, when everything ahead of it has already done its work.',
    ],
    wrong: [
      {
        fault: 'The arm leading the throw, which is the most common fault at every level.',
        fix: 'Slow the whole thing to half speed and feel the hips start first. At half speed you can feel the order; at full speed you cannot.',
      },
      {
        fault: 'No brace — the front knee keeps travelling forward after the plant.',
        fix: 'The front leg is a wall, not a shock absorber. If it collapses forward there is nothing for the rotation to work against.',
      },
      {
        fault: 'Standing up through the throw, which unloads the legs before they have contributed.',
        fix: 'Stay at the same height from plant to release. Filming from the side shows this instantly.',
      },
      {
        fault: 'Weight still on the back foot at release.',
        fix: 'The transfer has to finish before the disc leaves. If you are still back, the arm threw it on its own.',
      },
    ],
    drill: {
      name: 'Half speed, right order',
      reps: '20 throws at 50% effort, then 10 at full',
      body:
        'Twenty throws at genuinely half effort, thinking only about hips-then-chest-then-arm. Then ten at full speed without thinking about it at all. The half-speed reps are where the sequence gets learned; the full-speed ones are where you find out whether it survived. Expect it not to, at first.',
    },
  },

  'nasty-anhyzer': {
    why:
      'The anhyzer is the only way to make a right-handed backhand finish to the right, which means it opens up every hole that bends that way without needing a forehand. It is also the least forgiving release angle in the game, because the thing that makes it work — the disc wanting to turn — is the same thing that makes it crash when thrown slowly.',
    how: [
      'Tilt the top edge of the disc away from you at release. That tilt is the shot.',
      'Keep the nose down relative to that tilted angle. Nose-up on an anhyzer turns over and dives almost immediately.',
      'Keep your arm speed up. An anhyzer thrown tentatively flips and crashes; this is a shot you commit to or do not play.',
      'Use a stable or slightly understable disc. An understable one holds the angle longer and finishes further right.',
      'Aim at where you want the disc at its highest point, not at where you want it to land.',
    ],
    wrong: [
      {
        fault: 'Throwing it softly because the angle feels risky.',
        fix: 'Soft is what makes it fail. Commit to full effort — the angle is controlled by the release, not by the power.',
      },
      {
        fault: 'Using an overstable disc, which climbs back out of the anhyzer and finishes left anyway.',
        fix: 'Match the disc to the shot. If the disc will not hold the angle, the angle is not the problem.',
      },
      {
        fault: 'Releasing nose-up, so the disc turns over and drops out of the sky.',
        fix: 'Nose down relative to the tilt. This is the difference between a shaped anhyzer and a crash.',
      },
      {
        fault: 'Reaching for an anhyzer when a hyzer gets to the same place.',
        fix: 'Hyzer is far more repeatable. Use the anhyzer when the hole demands it, not when it looks good.',
      },
    ],
    drill: {
      name: 'Three angles',
      reps: '10 anhyzers each at slight, medium and steep tilt (30 total)',
      body:
        'Open field, one disc, three deliberately different amounts of tilt, ten throws each. Watch how far right each one finishes and how much height it needs. You are building a mental table of what each angle buys you, which is the thing you will actually use on a course.',
    },
  },

  'hyzer-vs-anhyzer-release': {
    why:
      'Hyzer, flat and anhyzer are the entire vocabulary of shot shaping. Everything more advanced — hyzer flips, flex shots, rollers — is one of these three combined with a disc’s stability. Getting the three clear in your head is what turns "I threw it and it went somewhere" into choosing a shape.',
    how: [
      'Hyzer: the top edge is tilted toward you. The disc finishes left for a right-handed backhand, and lands predictably. It is the most reliable shape in the game.',
      'Anhyzer: the top edge is tilted away from you. The disc finishes right for a right-handed backhand.',
      'Flat: the disc is level. It gives the straightest flight, and it needs a disc whose stability suits your power or it will do one of the other two anyway.',
      'The finish comes from the angle AND the disc AND your power together. The same angle with an overstable and an understable disc gives two different shots.',
      'Reverse left and right throughout if you throw left-handed backhand or right-handed forehand.',
    ],
    wrong: [
      {
        fault: 'Thinking the release angle alone decides where the disc finishes.',
        fix: 'Stability and arm speed matter as much. A flat release of a very understable disc is an anhyzer shot in practice.',
      },
      {
        fault: 'Confusing a hyzer with simply aiming left.',
        fix: 'Hyzer is the disc’s tilt, not your aim. You can throw a hyzer aimed well right of the basket, and usually should.',
      },
      {
        fault: 'Reaching for an anhyzer on every hole that bends right.',
        fix: 'Consider a hyzer aimed right, or a flex shot, first. Anhyzer is the least repeatable of the three and should be a choice rather than a reflex.',
      },
    ],
    drill: {
      name: 'Ten of each',
      reps: '10 hyzer, 10 flat, 10 anhyzer with the same disc (30 total)',
      body:
        'One disc, one target, thirty throws split evenly between the three angles. Mark roughly where each group finishes. The three clusters are your actual shot shapes with that disc — and the gaps between them are the holes in your game that another disc, or another angle, has to fill.',
    },
  },

  'roller-shot-technique': {
    why:
      'A roller gets under a low ceiling, around a corner nothing flies around, and on firm flat ground it can travel further than anything you throw in the air. It is also the shot most people never learn, which means it quietly costs them a stroke on the same two holes every time they play their home course.',
    how: [
      'Use an understable disc. An overstable one will not turn over into the roll, which is most of the battle.',
      'Release on a steep anhyzer — far steeper than feels sensible, often close to vertical for a cut roller.',
      'Release with a downward angle so the disc meets the ground on its edge and stands up rather than landing flat.',
      'Aim at the patch of ground where you want the roll to begin, not at the basket.',
      'Expect the disc to roll in the direction it is leaning and to fall that way as it slows — usually to the right for a right-handed backhand roller.',
    ],
    wrong: [
      {
        fault: 'Using a stable or overstable disc.',
        fix: 'Pick the most understable, most worn disc in your bag. Rollers are the one place a beaten-up disc is the right tool.',
      },
      {
        fault: 'Too flat an angle, so the disc skips and lands on its back.',
        fix: 'Steeper than you think. A roller that fails usually failed because the angle was timid.',
      },
      {
        fault: 'Throwing a roller into long grass or soft ground.',
        fix: 'Rollers need firm, short ground. In the rough they stop dead and you have wasted a throw on a shot that was never available.',
      },
      {
        fault: 'Aiming at the target rather than at the landing point.',
        fix: 'The roll is most of the distance. Plan where it touches down and which way it will curve from there.',
      },
    ],
    drill: {
      name: 'Find the angle',
      reps: '15 rollers on firm open ground',
      body:
        'Fifteen rollers in a field with no target at all, varying only the steepness of the release. You are looking for the angle at which the disc stands up cleanly and runs rather than skipping or falling over. Once you have found it, it is repeatable — and this is a shot that stays learned.',
    },
  },

  'throwing-tight-fairways': {
    why:
      'In the woods, distance is worth very little and a miss is worth a great deal. A controlled 250 feet down the gap beats 350 feet into a trunk every single time, and the players who score well on wooded courses are almost never the ones throwing hardest. This is the category where discipline outscores ability.',
    how: [
      'Throttle back to around 80% effort. Control rises sharply as power comes off, and the distance you lose is less than you expect.',
      'Pick the gap, not the basket. Your target is the space the disc has to pass through, which may be nowhere near the hole.',
      'Use a stable midrange or a control driver. High-speed drivers need power you cannot afford to use here.',
      'Prefer a hyzer line, which finishes predictably, over a flat or anhyzer line that depends on everything going right.',
      'Play the shot that leaves the best next shot. On a wooded hole, position beats distance almost always.',
    ],
    wrong: [
      {
        fault: 'Throwing full power because the hole is long.',
        fix: 'Length is not the problem on a wooded hole; the trees are. Take the power off and take the line.',
      },
      {
        fault: 'Aiming at the basket through a line of trunks.',
        fix: 'Aim at the gap. If there is no gap toward the basket, aim at the gap that leaves you one.',
      },
      {
        fault: 'Attempting a gap you would hit one time in five.',
        fix: 'Count honestly: a one-in-five gap costs you more over a season than the safe line ever will. Take the shot you hit four times in five.',
      },
      {
        fault: 'Reaching for a distance driver because the fairway looks open at the start.',
        fix: 'A fast disc in the woods finishes hard left and finds the trees you could not see. Midrange until you have proved otherwise.',
      },
    ],
    drill: {
      name: 'Name the gap',
      reps: '9 wooded holes at a maximum of 80% power',
      body:
        'Play nine wooded holes with two rules: never throw above about 80% effort, and say out loud which gap you are throwing through before each shot. Compare the total with your usual score on the same nine. Most players shoot the same or better while feeling as though they are barely trying, which is the lesson.',
    },
  },

  'adjusting-release-point-wind': {
    why:
      'Wind changes what a disc does more than any other condition, and the adjustments are not intuitive — the most natural response, throwing harder into a headwind, makes the problem worse rather than better. Knowing which way each wind pushes a disc is worth several strokes on any exposed course.',
    how: [
      'Into a headwind, the extra airspeed makes a disc behave more understable, so it wants to turn over. Throw something more stable, keep it low, and keep the nose down.',
      'With a tailwind, there is less airspeed and less lift, so the disc behaves more overstable and drops sooner. Throw something more understable, with slightly more height.',
      'In a crosswind, a wind from your left will push the disc right and lift the left edge. Aim into the wind and let it bring the disc back.',
      'Keep everything lower in strong wind. Height is exposure, and a disc held up high is at the wind’s mercy for longer.',
      'Commit. A tentative throw in wind spends longer in the air at low speed, which is exactly what you do not want.',
    ],
    wrong: [
      {
        fault: 'Throwing harder into a headwind.',
        fix: 'More power means more airspeed, which makes the disc turn over more. Throw a more stable disc at normal effort instead.',
      },
      {
        fault: 'Releasing nose-up into a headwind, which makes the disc balloon straight up.',
        fix: 'Nose down, hard. This is the single biggest wind fault and it is very visible once you look for it.',
      },
      {
        fault: 'Using the same disc regardless of the wind.',
        fix: 'Carry one disc more stable and one less stable than your usual, specifically for this. Changing discs beats changing your throw.',
      },
      {
        fault: 'Ignoring a tailwind because it feels like help.',
        fix: 'A tailwind takes lift away and makes discs finish early and drop. It costs distance as often as it gives it.',
      },
    ],
    drill: {
      name: 'Four directions, one disc',
      reps: '10 throws in each of 4 wind directions (40 total), on a windy day',
      body:
        'Take one disc to an open field on a genuinely windy day and throw ten into the wind, ten with it, and ten across it each way. Note where each group finishes relative to your aim. This is the session nobody does and it is the one that separates scores when the weather turns.',
    },
  },

  'power-transfer': {
    why:
      'The ceiling on your distance is not how much energy you can generate, it is how much of it reaches the disc. Most players leak the majority of it — into an early arm, a collapsing front leg, or a body that stands up mid-throw. This is why form work adds more distance than strength work for almost everybody.',
    how: [
      'Think of it as a chain: ground, legs, hips, torso, shoulder, elbow, wrist, disc. Each link accelerates and then slows down, handing its speed to the next.',
      'Brace hard on the front leg. The brace is what converts your forward movement into rotation, and it is the link most often missing.',
      'Keep the disc close to your chest as it comes through the power pocket. A disc held out wide breaks the chain and bleeds speed.',
      'Let the wrist be the last thing to fire, very late. That final snap is where spin comes from.',
      'Stay at the same height from plant to release. Rising up through the throw unloads the legs before they have paid out.',
    ],
    wrong: [
      {
        fault: 'Starting the chain at the arm.',
        fix: 'The arm is the end of the sequence, not the start. If the arm moves first, everything behind it is just along for the ride.',
      },
      {
        fault: 'No brace: the front knee keeps moving forward through the release.',
        fix: 'Plant and stop. Film from the side — a collapsing front leg is obvious on video and invisible from the inside.',
      },
      {
        fault: 'Pulling the disc wide of the body, which breaks the chain at the last link.',
        fix: 'Close to the chest. All the sequencing in the world does not survive a rounded pull.',
      },
      {
        fault: 'Trying to add distance with effort.',
        fix: 'Effort goes into the parts of the chain that are already working and does nothing for the broken link. Find the leak first.',
      },
    ],
    drill: {
      name: 'Brace and feel it',
      reps: '20 stand-still throws at 70% focusing only on the front leg',
      body:
        'Stand-still throws at seventy percent, thinking about nothing except the front leg planting and stopping. You are feeling for the moment your forward movement turns into rotation. When it happens properly the throw feels easier and goes further, which is the most convincing evidence in the sport that power is not about effort.',
    },
  },

  // ───────────────────────────── DRIVING ─────────────────────────────
  'x-step-run-up': {
    why:
      'The x-step exists to let you arrive at the plant already moving, so the brace has something to convert. It is worth perhaps 15 to 20 percent over a standstill for most players — real, but far less than people expect, which is why learning it before you can throw well standing still mostly adds a new way to be off balance.',
    how: [
      'Start by walking it at half speed. The x-step is a timing pattern, not a sprint, and every fault in it comes from rushing.',
      'For a right-handed backhand the pattern is: step onto the right foot, cross the left behind it, then plant the right foot across your body at an angle to the target.',
      'Keep your shoulders turned away from the target the whole way through the steps.',
      'Time it so the plant foot lands exactly as the reach back reaches full extension. That coincidence is the entire point of the move.',
      'Stay low and smooth. If your head bobs up and down through the steps, you are losing more than the run-up is giving you.',
    ],
    wrong: [
      {
        fault: 'Running at the pad and hoping speed turns into distance.',
        fix: 'Speed you cannot brace against is wasted. Walk it until the timing is right, then add pace a little at a time.',
      },
      {
        fault: 'The plant landing before or after the reach back completes.',
        fix: 'Have somebody watch the two and tell you which arrives first. Almost everybody plants late, which means throwing from a stopped body.',
      },
      {
        fault: 'Opening the shoulders during the steps.',
        fix: 'Stay closed until the plant. If you are facing the target before you plant, the x-step has done nothing but move you forward.',
      },
      {
        fault: 'Adding an x-step before you can drive from a standstill.',
        fix: 'Build the standstill first. A run-up multiplies whatever your form already is, including the faults.',
      },
    ],
    drill: {
      name: 'Walk it',
      reps: '20 walking-pace x-steps, then 10 at full speed',
      body:
        'Twenty repetitions at walking pace, throwing at maybe half effort, watching only for the plant and the reach back finishing together. Then ten at full speed. If the full-speed ones fall apart, you have found your real pace — work there and let it rise on its own.',
    },
  },

  'distance-mechanics': {
    why:
      'Distance comes from four measurable things: how fast the disc leaves, how much spin it has, the angle it launches at and the nose angle. Arm strength affects one of them a little. This is why the biggest throwers are so rarely the biggest people, and why chasing distance through effort reliably stalls at about 300 feet.',
    how: [
      'Release speed comes from the chain working in order and bracing hard, not from pulling harder.',
      'Spin comes from the disc ripping out of a relaxed hand late. A disc with speed and no spin flips and dies.',
      'Launch angle wants to be slightly upward on most drives — the disc needs some height to use its glide.',
      'Nose angle wants to be slightly down. This is the one that costs people the most and the one they notice least.',
      'Add these one at a time. Trying to fix all four in a session means knowing nothing about any of them afterwards.',
    ],
    wrong: [
      {
        fault: 'Treating distance as a strength problem and going to the gym for it.',
        fix: 'Strength helps at the margins and only once the sequence is right. Form work pays several times more for almost everybody.',
      },
      {
        fault: 'Throwing harder, which usually means the arm leading and the nose rising.',
        fix: 'Throw at 80% while you work on the four factors. Max effort hides everything you are trying to see.',
      },
      {
        fault: 'Judging a change by one throw.',
        fix: 'Change one thing, throw twenty, measure the group rather than the best one. The best throw of twenty tells you nothing about what you will do on a course.',
      },
    ],
    drill: {
      name: 'One factor at a time',
      reps: '20 throws per factor, one factor per session',
      body:
        'Pick one of the four — start with nose angle, which pays most — and throw twenty focusing on nothing else. Pace out the group rather than the longest. Next session, the next factor. Four sessions covers all of them properly, which is faster than four months of changing everything at once.',
    },
  },

  'standstill-drives': {
    why:
      'The standstill is the best form diagnostic in the sport, because it removes every variable a run-up adds and leaves only what your body does with the disc. Most good players throw roughly 80% of their maximum distance from a standstill — so if yours is far below that, the problem was never the footwork.',
    how: [
      'Set up side-on, feet a little wider than shoulder width, weight loaded on the back leg.',
      'Reach back level and straight, with the shoulders turned away.',
      'Shift onto the front foot and brace, exactly as you would with a run-up. The sequence does not change; only the approach is gone.',
      'Rotate through the core and let the disc come out late and close to the body.',
      'Hold the finish. If you cannot, the standstill has just told you something a run-up would have hidden.',
    ],
    wrong: [
      {
        fault: 'Treating the standstill as a weaker, gentler throw.',
        fix: 'Throw it at full intent. The point is to see your real form at real speed, not to be careful.',
      },
      {
        fault: 'Leaving the weight on the back foot because there is no run-up pushing you forward.',
        fix: 'You still have to transfer. Without the run-up doing it for you, this is where you find out whether you ever were.',
      },
      {
        fault: 'Going back to the run-up the moment the standstill feels short.',
        fix: 'It is supposed to feel short at first. Build it until it is near your run-up distance, and your run-up distance rises with it.',
      },
    ],
    drill: {
      name: 'Standstill month',
      reps: '50 standstill drives per session, no run-up at all',
      body:
        'For one month of field work, throw nothing but standstills. Measure your best each session. Almost everybody gains distance on their full run-up during a month where they never practised it, because the run-up was never the limiting factor.',
    },
  },

  'nose-angle': {
    why:
      'Nose angle is the most expensive thing most players get wrong and the hardest to see. It is the angle of the disc’s leading edge relative to the direction it is travelling — not relative to the ground — and a few degrees nose-up turns a disc into a parachute that climbs, stalls and falls out of the sky well short.',
    how: [
      'Keep the front edge slightly below the flight path at release. Slightly down, not dramatically.',
      'Reach back level rather than low. A reach back that dips makes the disc come through rising, which is nose-up by definition.',
      'Keep the wrist flat through the power pocket — a wrist that curls up tilts the nose up with it.',
      'Watch the first thirty feet of flight. A nose-up throw climbs and loses speed visibly; a nose-down one tracks flat and holds.',
      'Pull on a slightly rising line through the body while keeping the nose down. These are different things and confusing them is the usual trap.',
    ],
    wrong: [
      {
        fault: 'Confusing launch angle with nose angle, and tilting the whole disc up to get height.',
        fix: 'Height comes from the line you pull on. The nose stays down regardless of how high you are throwing.',
      },
      {
        fault: 'A dipping reach back, which guarantees a nose-up release.',
        fix: 'Reach back level with your shoulder. Fix the back of the throw and the nose angle often fixes itself.',
      },
      {
        fault: 'Judging nose angle by how far the disc went.',
        fix: 'Judge it by the shape of the first thirty feet. A nose-up throw can still go far downwind and will tell you nothing.',
      },
    ],
    drill: {
      name: 'Watch the first thirty feet',
      reps: '20 throws, judging only the first 30 ft of flight',
      body:
        'Throw twenty and ignore where each lands entirely. Watch only whether the disc climbs in the first thirty feet or tracks flat. Climbing is nose-up. When twenty out of twenty track flat, the distance has already arrived without you looking for it.',
    },
  },

  'fix-grip-lock': {
    why:
      'Grip lock is holding the disc a fraction too long, so it leaves after the hand has already started across your body — which for a right-handed backhand sends it hard right, usually into whatever you were most trying to avoid. It feels like a grip problem and almost never is: it is a timing problem that the grip gets blamed for.',
    how: [
      'Check whether you are standing up through the throw. Rising pulls the release point back and late — this is the most common cause.',
      'Make sure you are rotating through rather than stopping. A body that stops makes the hand travel further across before the disc can leave.',
      'Release out in front of your chest, not behind it. The disc should go when your arm is extending toward the target.',
      'Ease the grip pressure slightly. Not loose — just not clenched, so the disc can rip out when it is supposed to.',
      'Work at 70% until it stops. Grip lock arrives with effort, so the diagnosis is easier below the effort that triggers it.',
    ],
    wrong: [
      {
        fault: 'Loosening the grip until the disc flies out early and wobbles.',
        fix: 'That trades one fault for a worse one. Fix the timing; the grip pressure is a small adjustment at the end, not the cure.',
      },
      {
        fault: 'Aiming further left to compensate.',
        fix: 'You are now aiming for a fault. When it stops happening — and it does, intermittently — the compensation puts you in trouble on the other side.',
      },
      {
        fault: 'Only seeing it at full power and assuming it is random.',
        fix: 'It is not random; it is effort-dependent. Throw at 70% and it will largely vanish, which tells you exactly what is causing it.',
      },
    ],
    drill: {
      name: 'Seventy percent',
      reps: '30 throws at 70%, raising effort only once 10 in a row are clean',
      body:
        'Throw thirty at seventy percent. Once you have ten consecutive throws with no right-side miss, go to eighty. Repeat. You are finding the effort level at which your timing holds and then raising it deliberately, rather than hoping the problem goes away at full power. It does not.',
    },
  },

  'utility-drives': {
    why:
      'Three shaped drives cover most of the holes that a straight throw cannot: the flex for distance on an open hole, the hyzer flip for a long straight line, and the spike hyzer for landing hard on a tight target. Having these means you stop trying to force your standard throw into holes it does not fit.',
    how: [
      'Flex shot: take an overstable disc and throw it on an anhyzer. It flexes back to flat and then fades, giving a long S-line and a predictable finish.',
      'Hyzer flip: take an understable disc and throw it on a hyzer. It flips up to flat and runs straight for a long way. This is the longest straight shot most players have.',
      'Spike hyzer: throw an overstable disc on a steep hyzer. It comes down hard and stops, which is what you want over or around an obstacle onto a tight pin.',
      'Each one is a disc choice plus an angle. Neither alone gives you the shot.',
      'Pick the shot for the shape the hole needs, then the disc that produces it at your arm speed — not the other way round.',
    ],
    wrong: [
      {
        fault: 'Throwing a flex shot with a disc that is not overstable enough, so it turns over and stays there.',
        fix: 'The flex needs a disc that genuinely wants to come back. If it does not return to flat, it is too understable for your arm.',
      },
      {
        fault: 'Attempting a hyzer flip with a disc that is too stable, so it never flips.',
        fix: 'Hyzer flips need an understable or well-worn disc. A fresh stable disc just flies a hyzer.',
      },
      {
        fault: 'Learning all three at once on the course.',
        fix: 'Learn each in a field until it is repeatable. A utility shot you are unsure of is worse than the standard throw you are sure of.',
      },
    ],
    drill: {
      name: 'One shape per session',
      reps: '25 throws of one shape, in an open field',
      body:
        'Pick one shape and throw twenty-five of them with the right disc, adjusting the angle until it works repeatably. Do not move on until you can call it before you throw it. Three sessions gives you all three shapes, which is more new ground than most players cover in a season.',
    },
  },

  'power-pocket-timing': {
    why:
      'The power pocket is the moment the disc is closest to your chest with the elbow bent around 90 degrees, just before everything unwinds. It is where the whip happens — and if the disc is already extending away from you at that moment, there is no whip left to release, which is exactly what rounding costs you.',
    how: [
      'Bring the disc in close as the front foot plants, elbow bent, disc near the sternum.',
      'Keep the elbow leading. The hand and the disc trail behind it until the final extension.',
      'Let the brace and the hip rotation unwind against that bent arm — that is what loads it.',
      'Extend late, so the arm straightens as the disc is already leaving.',
      'Time the peak of the reach back to the front-foot plant. If those two are out of order, there is no pocket to hit.',
    ],
    wrong: [
      {
        fault: 'Extending the arm early, so the disc swings out wide instead of coming in close.',
        fix: 'Elbow first, hand second. Feel the disc brush past your chest — this is the same cure as rounding, because it is the same fault.',
      },
      {
        fault: 'Trying to create the pocket by pulling the arm in with muscle.',
        fix: 'The pocket is a position the rotation puts you in, not something you do with the arm. Work on the brace and the hips.',
      },
      {
        fault: 'Hitting the pocket but with the shoulders already open.',
        fix: 'Stay closed until the plant. An open chest at the pocket means the load has already been spent.',
      },
    ],
    drill: {
      name: 'Brush the shirt',
      reps: '20 slow reps, then 20 throws',
      body:
        'Twenty slow-motion reps where the disc physically brushes your shirt at the pocket, then twenty throws trying to keep that contact. It is a feel you either have or do not, and when it arrives the throw gets noticeably quieter and longer at the same time.',
    },
  },

  'weight-shift': {
    why:
      'The weight shift is what turns the ground into disc speed. Without it the arm throws alone, which is both the slowest way to throw and the fastest way to hurt your shoulder. The common mistake is to think of it as moving forward, when what matters is moving forward and then STOPPING.',
    how: [
      'Load onto the back leg with the knee soft. Feel the weight genuinely there, not just leaning.',
      'Move the hips toward the target first, before the shoulders and well before the arm.',
      'Plant the front foot and let it stop you. The sudden stop is what converts the movement into rotation.',
      'Keep the movement smooth rather than lunging. A lunge arrives with the weight still travelling and nothing to brace against.',
      'Finish with the weight fully on the front foot and the body balanced over it.',
    ],
    wrong: [
      {
        fault: 'Lunging forward, so the body is still moving when the disc leaves.',
        fix: 'Smooth, then stop. The brace needs something to stop; a lunge arrives too fast to be stopped at all.',
      },
      {
        fault: 'Never loading onto the back leg in the first place.',
        fix: 'If you start with the weight central there is no shift to make. Feel it land on the back leg before anything moves forward.',
      },
      {
        fault: 'Shifting with the shoulders rather than the hips.',
        fix: 'Hips first. Shoulders leading is the same fault as the arm leading, one link further up.',
      },
    ],
    drill: {
      name: 'Load, plant, stop',
      reps: '20 standstill throws exaggerating the load onto the back leg',
      body:
        'Twenty standstill drives where you deliberately overload the back leg before moving — more than feels necessary. Then plant and feel the front leg stop you. Exaggerating it is how the feeling becomes findable; it settles back to normal size on its own once you know what you are looking for.',
    },
  },

  'choosing-a-driver': {
    why:
      'The most common equipment mistake in the sport is throwing a driver faster than your arm. A disc above your speed never reaches the part of its flight where it does anything interesting — it just fades left early for a right-handed backhand, which looks like a form problem and is not. Most amateurs score better with fairway drivers than with distance drivers, all season.',
    how: [
      'Fairway drivers are roughly speed 6 to 9. They need less arm, hold a line better and are far more accurate in the woods.',
      'Distance drivers are roughly speed 10 to 14. They need real arm speed to fly as designed.',
      'A reasonable gate: until you are throwing a fairway driver around 300 feet reliably, a distance driver is not adding anything.',
      'Judge a disc by whether it finishes where you aimed, not by how far it went on your best throw.',
      'If a disc fades hard left early for a right-handed backhand no matter how you throw it, it is too fast for you right now.',
    ],
    wrong: [
      {
        fault: 'Buying speed 13 drivers because that is what the professionals throw.',
        fix: 'They are throwing them at speeds you are not yet producing. The same disc in your hand is a completely different flight.',
      },
      {
        fault: 'Blaming your form for a disc that is simply too fast.',
        fix: 'Try the same shot with a fairway driver. If the problem disappears, it was the disc.',
      },
      {
        fault: 'Carrying five distance drivers and one fairway.',
        fix: 'Invert it. Most of your drives on most courses want control, and the driver you throw best is the one you should own several of.',
      },
    ],
    drill: {
      name: 'Fairway versus distance',
      reps: '15 throws with a fairway driver and 15 with a distance driver',
      body:
        'Same target, same day, fifteen of each. Pace out both groups and note not just the distance but how wide the spread is. Most players find the fairway group is barely shorter and dramatically tighter — and the tightness is what a scorecard measures.',
    },
  },

  'distance-control': {
    why:
      'Almost every hole asks for a specific distance rather than a maximum. A player who can throw 300 feet but only one distance is worse off than one who throws 250 on demand, because the second one can leave themselves a putt and the first one is always scrambling. This is the skill that turns driving ability into scores.',
    how: [
      'Change the disc before you change the throw. A slower disc at full form is far more repeatable than your driver at a guessed effort.',
      'When you must power down, keep the same form and shorten the reach back rather than slowing the arm. Slowing the arm changes the nose angle and the spin.',
      'Learn three distances properly: your comfortable putter distance, your comfortable midrange distance and your comfortable fairway distance. Those three cover most holes.',
      'Pace out the distances you actually achieve, rather than estimating them. Nearly everybody overestimates.',
      'Pick the shot that leaves the next one, not the one that gets furthest down the fairway.',
    ],
    wrong: [
      {
        fault: 'Throwing every shot at maximum and taking whatever distance arrives.',
        fix: 'Pick a target distance before you throw. A drive that goes 40 feet past into trouble is not a good drive.',
      },
      {
        fault: 'Powering down by slowing the arm, which changes nose angle and spin at the same time.',
        fix: 'Shorten the reach back and keep the arm speed. One variable instead of three.',
      },
      {
        fault: 'Guessing your own distances.',
        fix: 'Pace them out once. The gap between what people think they throw and what they throw is routinely 50 feet.',
      },
    ],
    drill: {
      name: 'Hit the number',
      reps: '10 throws each at 150, 200 and 250 ft (30 total)',
      body:
        'Mark three distances in a field and throw ten at each, aiming to land ON the mark rather than past it. Score how many finish within twenty feet. This is tedious and it is the single most score-reducing field session available — most players are shocked at how poor their control is at distances they thought were easy.',
    },
  },

  // ───────────────────────────── APPROACH ─────────────────────────────
  'scoring-zone': {
    why:
      'Inside about 150 feet is where rounds are decided, and it is the part of the game amateurs practise least and professionals practise most. Getting up and down from here — one throw to the circle, one putt — is the difference between par and bogey on holes where the drive went fine. A big drive that leaves a bad approach has saved nothing.',
    how: [
      'Pick a landing spot, not "near the basket". Name the patch of ground you want the disc to finish on.',
      'Choose the spot that leaves the putt you are best at, which for most people is straight and uphill rather than sidehill or downhill.',
      'Favour the side away from trouble. A shot that finishes 25 feet short on the safe side beats one that finishes 10 feet away over a bank.',
      'Use the slowest disc that will get there. A putter or midrange lands softer and stays where it lands.',
      'Account for what happens AFTER it lands — slope, skip, wet grass. Where it stops is the only thing that matters.',
    ],
    wrong: [
      {
        fault: 'Aiming at the basket and accepting wherever it ends up.',
        fix: 'Aim at a spot. Aiming at a basket means a miss can go anywhere; aiming at a spot means a miss is near that spot.',
      },
      {
        fault: 'Taking the aggressive line when a miss leaves a 40-foot comeback.',
        fix: 'Weigh the gain against the cost of the likely miss, not against the cost of the perfect shot.',
      },
      {
        fault: 'Throwing a driver from 150 feet because it is in your hand.',
        fix: 'A putter or midrange from here lands softer and stops. Drivers skip, and skips end up anywhere.',
      },
      {
        fault: 'Practising drives for an hour and approaches for five minutes.',
        fix: 'Invert the ratio. This is where the strokes are, and it is the cheapest part of the game to practise.',
      },
    ],
    drill: {
      name: 'Up and down',
      reps: '10 approaches from 120 ft, then putt each one out',
      body:
        'Throw an approach from 120 feet, walk to it, and putt it out. Score how many times you get down in two. Ten repetitions takes twenty minutes and tells you more about your scoring than any amount of distance work. Target is seven out of ten before you move further back.',
    },
  },

  'touch-approaches': {
    why:
      'The approach that finishes nearest is usually not the one thrown hardest at the basket — it is the one that lands dead and stays. A disc that arrives flat and slow stops where it lands; one that arrives fast skips, and a skip past the basket turns a 15-foot putt into a 40-foot one.',
    how: [
      'Use a putter or a midrange. Their slow speed is exactly what makes them land softly.',
      'Throw with easy, smooth power — this is a shot where effort actively hurts.',
      'Let the disc arrive slightly nose-up so it stalls and falls rather than driving forward. This is the one shot where nose-up is correct.',
      'Throw it on a line that lands beyond the basket only if the ground behind is safe. Otherwise land it short and let it finish.',
      'Watch the ground. Wet grass stops a disc dead; hard-packed dirt sends it another 20 feet.',
    ],
    wrong: [
      {
        fault: 'Throwing hard and relying on the basket to stop the disc.',
        fix: 'Baskets reject far more than they catch. Throw to land, not to hit.',
      },
      {
        fault: 'Using a driver, which arrives fast and skips.',
        fix: 'Slowest disc that reaches. The whole point of the shot is a soft arrival.',
      },
      {
        fault: 'Ignoring the ground conditions.',
        fix: 'Look at where it will land before you choose the shot. The same throw finishes 20 feet apart on wet and dry ground.',
      },
    ],
    drill: {
      name: 'Land it dead',
      reps: '20 approaches from 100 ft, scoring where it STOPS',
      body:
        'Twenty throws from 100 feet, and measure where each disc comes to rest rather than where it lands. Count how many finish inside 15 feet. You will find the soft, floaty ones win comfortably over the ones thrown at the chains, which is the lesson and is surprisingly hard to believe until you have counted.',
    },
  },

  'run-vs-lay-up': {
    why:
      'This is a decision, not a skill, and it is probably the cheapest stroke saving available to an intermediate player. The question is never "can I make this?" — it is "what does a miss cost, and how often will I miss?" Answering that honestly turns a lot of bogeys into pars at no physical cost at all.',
    how: [
      'Ask what happens to a miss. If it runs 30 feet past, or into OB, or down a slope, that is the real price of the attempt.',
      'Be honest about your make rate from that distance. Use the number from your practice sessions, not your memory of the one you made.',
      'Lay up to the distance you putt best from, which for most people is 15 to 20 feet and straight on.',
      'Run it when the miss is cheap — flat ground behind, nothing in play, a comeback you would take anyway.',
      'Decide before you step in, and then execute without revisiting it.',
    ],
    wrong: [
      {
        fault: 'Running everything because laying up feels passive.',
        fix: 'Laying up is a shot, not a surrender. The scorecard does not record how it felt.',
      },
      {
        fault: 'Judging the attempt by the best case rather than the likely one.',
        fix: 'Multiply: how often you make it against what the miss costs. That arithmetic almost always argues for the lay-up outside the circle.',
      },
      {
        fault: 'Laying up to a random distance rather than your favourite one.',
        fix: 'A lay-up should finish at the distance you practise most. Otherwise you have traded one hard putt for another.',
      },
      {
        fault: 'Changing your mind mid-stroke.',
        fix: 'A half-committed run is the worst of both. Decide behind the marker and then commit entirely.',
      },
    ],
    drill: {
      name: 'Count the cost',
      reps: '20 putts from 45 ft, recording the comeback distance on every miss',
      body:
        'Twenty putts from 45 feet. For each miss, measure how far the comeback is. Now you have two real numbers — your make rate and your average miss — and they are what the decision should be made on. Most players discover their average miss is far longer than they believed.',
    },
  },

  'approach-angles': {
    why:
      'A pin tucked behind a tree, on a slope, or against OB cannot be attacked straight. Having the three angles available for approach shots — hyzer, flat and anhyzer — means you can reach pins that otherwise force a lay-up, and more importantly it means you can pick the angle whose MISS finishes somewhere safe.',
    how: [
      'Hyzer: fades in and lands hard, which stops it quickly. Best when you need the disc to drop and stay, or to come in from the left for a right-handed backhand.',
      'Flat: the straightest line, and the most predictable distance. Use it when the path is open.',
      'Anhyzer: curves right for a right-handed backhand, which opens up pins behind a guardian on that side.',
      'Choose the angle by where a MISS goes, not only by where a make goes.',
      'With approaches you can use a putter or midrange for all three, which keeps the distance manageable while you shape it.',
    ],
    wrong: [
      {
        fault: 'Using the same angle for every approach because it is the comfortable one.',
        fix: 'Learn the other two in a field. A single angle means every pin that does not suit it costs you a stroke.',
      },
      {
        fault: 'Picking the angle purely by where the basket is.',
        fix: 'Pick it by where the trouble is. The shape that keeps a miss out of trouble is usually the right one.',
      },
      {
        fault: 'Shaping with a driver because it holds the angle better.',
        fix: 'It also lands faster and skips further. Shape it with a putter or midrange and accept a slightly less extreme curve.',
      },
    ],
    drill: {
      name: 'Three ways in',
      reps: '10 approaches each on hyzer, flat and anhyzer from 120 ft (30 total)',
      body:
        'One basket, one midrange, thirty approaches split between the three angles. Note where each group finishes and, importantly, where the misses in each group finish. That second pattern is the information you will actually use when picking a shape on the course.',
    },
  },

  'scramble-approaches': {
    why:
      'Everybody ends up behind a tree. The stroke is already spent — what decides whether it costs one or three is the next decision. The single most expensive habit in amateur disc golf is trying to rescue a bad position with a heroic shot and finding a worse one.',
    how: [
      'First, get back into play. A clean lie in the fairway is worth more than 40 extra feet from a bad one.',
      'Take the lowest, safest line out. Low shots hit fewer things and roll predictably.',
      'Look for the widest gap, even if it is backwards or sideways. A sideways throw to a clean lie is often the cheapest shot available.',
      'Use a disc you can control from an awkward stance — a putter or midrange, rarely a driver.',
      'Accept the bogey when it is the cheap option. Trying to save par from trouble is how a 4 becomes a 7.',
    ],
    wrong: [
      {
        fault: 'Attempting the gap that saves par when you would hit it one time in four.',
        fix: 'Count it honestly. Three times in four you are now in worse trouble with a stroke gone.',
      },
      {
        fault: 'Throwing hard out of trouble.',
        fix: 'Power magnifies whatever goes wrong, and from an awkward stance something usually does. Smooth and low.',
      },
      {
        fault: 'Refusing to throw sideways or backwards.',
        fix: 'The scorecard has no column for direction. Clean lie, next throw, move on.',
      },
    ],
    drill: {
      name: 'Deliberately bad lies',
      reps: '15 throws from lies you place on purpose',
      body:
        'Walk into the trees and drop a disc somewhere genuinely awkward — behind a trunk, in a kneeling lie, with a low ceiling. Play it out. Fifteen of these teaches you what you can actually do from bad positions, which is the knowledge the decision on the course depends on.',
    },
  },

  'roller-approaches': {
    why:
      'The approach roller is for the situation where there is no air route at all: a low ceiling, a line of trunks, a corner nothing flies around. It is a shorter, more controlled version of the driving roller, and because the distance is short it is far more precise than people expect once the angle is learned.',
    how: [
      'Use an understable disc — a worn midrange or putter is ideal for approach distance.',
      'Release on a steep anhyzer with a downward angle so the disc meets the ground on edge.',
      'Aim at the patch of ground where you want the roll to start, and plan the roll from there.',
      'Keep the power low. An approach roller needs direction, not speed, and a fast roller runs past.',
      'Check the ground first. Firm and short grass only — a roller dies instantly in the rough.',
    ],
    wrong: [
      {
        fault: 'Throwing it as hard as a driving roller.',
        fix: 'The roll carries most of the distance. Gentle release, correct angle, let it run.',
      },
      {
        fault: 'Attempting it on soft or long ground.',
        fix: 'Look at the surface before committing. If the grass is above your ankle, this shot is not available.',
      },
      {
        fault: 'Forgetting that the disc curves as it slows.',
        fix: 'A roller falls in the direction it is leaning as it loses speed. Plan for that curve rather than being surprised by it.',
      },
    ],
    drill: {
      name: 'Roll to a spot',
      reps: '15 approach rollers at a target 100 ft away',
      body:
        'Fifteen rollers at a target on firm, short ground, aiming to stop ON it rather than near it. You are learning two things at once: the release angle that makes the disc stand up, and how far it runs after it does. Both are specific to your disc and worth knowing precisely.',
    },
  },

  'long-approaches': {
    why:
      'From 200 feet and out you are not going to hit the chains often, so the shot is about leaving a putt rather than making one. The difference between a good and a bad long approach is rarely distance — it is which side of the basket the disc finishes on, and whether the putt it leaves is one you want.',
    how: [
      'Pick a disc that finishes predictably at that distance for you. Predictable beats long every time on this shot.',
      'Aim to leave an uphill, straight-on putt. Downhill and sidehill putts from the same distance are measurably harder.',
      'Favour the safe side of any trouble, even at the cost of twenty feet.',
      'Account for the landing: a disc arriving at 200 feet is still moving, so plan the skip or the roll out.',
      'Accept two throws from here as a good outcome. Trying to make it is how you end up three-putting from a bad side.',
    ],
    wrong: [
      {
        fault: 'Attacking the pin from 220 feet.',
        fix: 'Your make rate from there is near zero and the misses are expensive. Play for the best two-throw outcome.',
      },
      {
        fault: 'Choosing the disc that goes furthest rather than the one that finishes most reliably.',
        fix: 'You know the distance you need. Pick for predictability and spend the choice on the finish.',
      },
      {
        fault: 'Ignoring which side the putt will come from.',
        fix: 'Before you throw, decide which side you would rather putt from, and aim so the miss goes there.',
      },
    ],
    drill: {
      name: 'Leave the putt',
      reps: '10 approaches from 220 ft, scoring the putt they leave',
      body:
        'Ten throws from 220 feet. Score each one not on distance from the basket but on whether it left a putt you would be happy with — uphill, straight, inside 25 feet. Count the happy ones. Seven out of ten is a strong number and most people start well below it.',
    },
  },

  'approach-routine': {
    why:
      'Approaches get practised like drives and played like putts: one shot, one chance, consequence attached. Most players have a careful routine for putting and none at all for the shot immediately before it — which is why approach distance is so inconsistent compared with putting distance.',
    how: [
      'Stand behind your lie and decide the landing spot, the disc and the shape before you step in.',
      'Rehearse the exact throw once, at the pace you intend to use. Not a vague practice swing — the actual shot.',
      'Step in the same way each time, the same foot first.',
      'Take one breath, then throw. No pause between the rehearsal and the shot.',
      'Use it on every approach, including the easy ones, so it is automatic when the shot matters.',
    ],
    wrong: [
      {
        fault: 'Walking up and throwing because the shot looks straightforward.',
        fix: 'The easy ones are where the routine gets built. If you only use it under pressure you have never practised it under pressure.',
      },
      {
        fault: 'A rehearsal at a different speed from the real throw.',
        fix: 'Rehearse at the pace you will use. A gentle practice motion before a hard throw rehearses the wrong shot.',
      },
      {
        fault: 'Deciding the disc after stepping in.',
        fix: 'All decisions happen behind the lie. Once you are in your stance there is nothing left but to throw it.',
      },
    ],
    drill: {
      name: 'Routine every one',
      reps: '20 approaches from mixed distances, full routine on each',
      body:
        'Twenty approaches from distances you pick at random between 80 and 200 feet, one disc at a time, with the full routine on every single one — including walking back and resetting. It is slow. It is also the closest thing to an actual round that field work ever gets, and it transfers far better than throwing twenty from one spot.',
    },
  },

  // ───────────────────────────── FOREHAND ─────────────────────────────
  // Direction note: a right-handed FOREHAND spins the opposite way to a
  // right-handed backhand, so its turn is to the LEFT and its fade is to the
  // RIGHT -- the mirror image. Every left/right claim below says which throw
  // it is talking about, because getting this backwards is the single easiest
  // way to teach somebody the wrong shot.
  'forehand-grip': {
    why:
      'The forehand lives or dies on the grip, more than the backhand does. Two fingers are holding a disc that wants to leave early, and the wrist has to stay firm enough to deliver spin while the arm stays loose. Get the grip wrong and no amount of work on the mechanics will stop the disc wobbling out of your hand.',
    how: [
      'Put your index and middle finger under the disc with the middle finger pressed against the inside of the rim. The thumb sits on top.',
      'Choose between the power grip, with both fingers against the rim side by side, and the stacked grip, with the index resting on top of the middle finger. Both are used at the top level.',
      'Keep the wrist firm. Unlike the backhand, the forehand wants a wrist that holds its shape and then snaps, not one that stays loose throughout.',
      'Keep the forearm and shoulder relaxed. Tension there is what produces the arm-only forehand that wobbles.',
      'Rest the disc against the pad of the thumb and the inside of the rim so it is genuinely supported, not pinched.',
    ],
    wrong: [
      {
        fault: 'Holding the disc with the fingers away from the rim, out in the middle of the plate.',
        fix: 'Push the middle finger right up against the inside of the rim. That contact is what transfers spin.',
      },
      {
        fault: 'A loose wrist that collapses at release, producing wobble.',
        fix: 'Firm wrist, relaxed arm. This is the reverse of the backhand and it is why backhand players find the forehand awkward at first.',
      },
      {
        fault: 'Squeezing with the whole arm.',
        fix: 'The grip is in the fingers and the wrist. A tense shoulder makes the arm lead, which is the main cause of a bad forehand.',
      },
    ],
    drill: {
      name: 'Grip and flick',
      reps: '30 short flicks from 30 ft, watching only for wobble',
      body:
        'Short, easy flicks at a target thirty feet away, with no attempt at distance at all. Watch the first few feet of each flight. A clean forehand leaves flat and quiet; a bad grip shows as a visible wobble immediately. Fix it here, at thirty feet, where nothing else can be blamed.',
    },
  },

  'forehand-mechanics': {
    why:
      'The forehand is a shorter, quicker motion than the backhand and it rewards completely different things. People who throw a good backhand often throw a bad forehand for one reason: they try to generate it with the arm, because the arm is right there and the motion is short. The power comes from the same place it always does — the ground.',
    how: [
      'Set up side-on or slightly open to the target, weight loaded on the back foot.',
      'Lead with the elbow, keeping the disc close to your body as the arm comes forward.',
      'Let the disc trail behind the hand. The hand goes first and the disc follows, which is what loads the wrist.',
      'Extend out in front of your body and snap the wrist at release. The snap is the spin, and the spin is the shot.',
      'Keep the disc flat. A forehand released with the outside edge down will turn over to the left and roll for a right-handed thrower.',
      'Follow through across your body and let the weight finish on the front foot.',
    ],
    wrong: [
      {
        fault: 'Throwing it entirely with the arm and shoulder, like skipping a stone.',
        fix: 'Use the legs and rotation. The forehand is short, which makes it feel like an arm throw, and that feeling is the trap.',
      },
      {
        fault: 'Releasing beside or behind the body rather than out in front.',
        fix: 'Extend first, release second. A late release sends the disc low and left for a right-handed forehand.',
      },
      {
        fault: 'Letting the outside edge drop at release, so the disc turns over.',
        fix: 'Keep it flat or slightly on hyzer. Most forehand turnover is a release angle problem, not a disc problem.',
      },
      {
        fault: 'Rushing the whole motion because it is short.',
        fix: 'It is quick, not rushed. The sequence still has to happen in order: legs, rotation, elbow, hand, wrist.',
      },
    ],
    drill: {
      name: 'Standstill flicks',
      reps: '25 standstill forehands at 60% effort',
      body:
        'No footwork, no run-up, sixty percent effort, twenty-five throws. You are building the shape of the motion and the feel of the wrist snap without speed hiding either. Add power only once twenty-five in a row come out flat and clean, which usually takes a few sessions rather than a few throws.',
    },
  },

  'forehand-distance': {
    why:
      'Most players’ forehands top out well short of their backhands, and conclude the forehand is simply a shorter throw. It is not — it is a throw they are making with their arm. Forehand distance comes from exactly the same chain as backhand distance, and the players who throw both a long way are using their legs for both.',
    how: [
      'Use a run-up or at least a crow hop. The forehand benefits from momentum just as much as the backhand does.',
      'Load the back leg, drive the hips, plant and brace. The lower half does not know which throw you are making.',
      'Let the disc trail further behind the hand than feels natural. The longer the trail, the more the wrist loads.',
      'Snap late and hard. Everything before the snap is set-up; the snap is where distance actually appears.',
      'Keep the disc flat or very slightly hyzer. Forehands lose more distance to a turned-over release than to anything else.',
    ],
    wrong: [
      {
        fault: 'Adding effort in the arm and shoulder.',
        fix: 'That produces a faster arm and no more spin, so the disc flies badly and not far. The legs are where the distance is.',
      },
      {
        fault: 'Throwing an understable disc for extra distance, which turns over and rolls.',
        fix: 'Forehands need more stable discs than backhands at the same power, because the snap puts a lot of spin on. Go more overstable than feels right.',
      },
      {
        fault: 'Short-arming it — releasing close to the body to keep control.',
        fix: 'Extend out front. Distance and accuracy both live in the extension.',
      },
      {
        fault: 'Working on forehand distance before the motion is clean.',
        fix: 'A wobbling forehand does not get longer with power, it gets worse. Clean first, then long.',
      },
    ],
    drill: {
      name: 'Crow hop and brace',
      reps: '20 forehands with a crow hop, 20 without, same disc',
      body:
        'Twenty with a crow hop and twenty standstill, same disc, same target, and pace both groups. If the crow-hop group is not clearly longer, your lower half is not involved in the throw — which is the finding, and it is the thing to work on before anything else.',
    },
  },

  'forehand-utility': {
    why:
      'Overheads — the tomahawk and the thumber — are the shots for when nothing goes forward: a wall of trees with sky above, a dogleg with no line, a lie where you need the disc to come down almost vertically. They are also the shots most likely to hurt you if thrown often, so they are tools for specific holes rather than part of a regular rotation.',
    how: [
      'Tomahawk: hold the disc with a forehand grip and throw it vertically, overhand, like a baseball. It climbs, turns over in flight and comes down steeply.',
      'Thumber: put your thumb inside the rim and throw it overhand with the disc vertical. It flies a similar shape with a different release.',
      'Use an overstable disc for both. An understable one turns over too early and dives before it has got anywhere.',
      'Learn which way YOUR overhead finishes and throw the same disc every time. The finish depends on the disc, the release angle and your speed, so the only reliable answer is the one you have observed.',
      'Aim high. Overheads need height to work, and a flat one is just a bad throw.',
    ],
    wrong: [
      {
        fault: 'Throwing overheads regularly because they are fun.',
        fix: 'They put real strain on the shoulder and elbow. Keep them for the holes that genuinely have no other shot.',
      },
      {
        fault: 'Using an understable disc.',
        fix: 'Overstable, and the beatier the worse. An overhead relies on the disc resisting the turn long enough to get up and over.',
      },
      {
        fault: 'Assuming an overhead will finish the way somebody described online.',
        fix: 'Go and throw twenty in a field and watch. Yours finishes where yours finishes, and that is the only version that helps you on a course.',
      },
    ],
    drill: {
      name: 'Learn your own finish',
      reps: '20 overheads in an open field with one disc',
      body:
        'Twenty tomahawks with one overstable disc, in a field, with nothing in the way. Watch where each one finishes relative to your aim and how steeply it comes down. You are not practising accuracy yet — you are collecting the one piece of information that makes the shot usable, which is what your overhead actually does.',
    },
  },

  'forehand-rollers': {
    why:
      'A forehand roller gets a disc down a line a backhand roller cannot, and because the forehand curves the other way it opens up the opposite side of the course. For a right-handed thrower it is the natural roller when the ground runs away to the left, where a backhand roller would be fighting its own lean.',
    how: [
      'Use an understable disc. As with every roller, a stable one will not turn into the roll.',
      'Release with the outside edge dropped — the forehand equivalent of a steep anhyzer — and angled downward so the disc meets the ground on its edge.',
      'Throw at modest power. The roll supplies the distance, and a fast roller is an uncontrolled one.',
      'Aim at the ground where you want the roll to start, not at the target.',
      'Expect it to curve as it slows, in the direction it is leaning. Learn which way yours goes and plan for it.',
    ],
    wrong: [
      {
        fault: 'Using the same disc as your air forehand.',
        fix: 'That disc is almost certainly too stable to roll. Reach for the most understable thing in your bag.',
      },
      {
        fault: 'Too shallow an angle, so the disc skips and lands flat.',
        fix: 'Steeper. A roller that fails has nearly always failed because the release was too timid.',
      },
      {
        fault: 'Throwing one on soft ground or in long grass.',
        fix: 'Check the surface first. Rollers need firm, short ground or they stop within a few feet.',
      },
    ],
    drill: {
      name: 'Forehand roller angle',
      reps: '15 forehand rollers on firm open ground',
      body:
        'Fifteen rollers with one understable disc, varying only the steepness. You are hunting for the angle where the disc stands up and runs cleanly instead of skipping or flopping. Once found it is repeatable, and it is a shot that will sit unused for weeks and then save two strokes in one round.',
    },
  },

  'fixing-your-forehand': {
    why:
      'Two faults account for nearly every bad forehand: wobble, and turning over into a roll. They look like different problems and they usually have the same root — not enough spin, which means not enough wrist snap, which usually means the arm is doing the work. Fixing the cause fixes both at once.',
    how: [
      'Diagnose wobble first. A disc that leaves the hand oscillating has too little spin; everything else is downstream of that.',
      'Get the spin from a late, hard wrist snap rather than a faster arm. Slow the arm down deliberately and snap harder.',
      'Release out in front of your body. A release beside or behind you is both weaker and more likely to turn over.',
      'Keep the disc flat or slightly hyzer. A dropped outside edge turns the disc over to the left for a right-handed forehand, which is what produces the roll.',
      'If it still turns over with a clean release, use a more overstable disc. Forehands need more stability than backhands at the same power.',
    ],
    wrong: [
      {
        fault: 'Treating wobble as a grip problem and only adjusting the fingers.',
        fix: 'Check the grip once, then look at the wrist. Wobble is a spin problem far more often than a grip problem.',
      },
      {
        fault: 'Fighting a turnover by throwing harder.',
        fix: 'More arm speed with the same spin turns it over faster. More spin or more stability, not more effort.',
      },
      {
        fault: 'Changing three things at once and not knowing what worked.',
        fix: 'One change, twenty throws, judge the group. This is the only way to learn anything from a field session.',
      },
      {
        fault: 'Practising the forehand at full power while it is still broken.',
        fix: 'Sixty percent until it is clean. Power added to a bad forehand produces a worse one, loudly.',
      },
    ],
    drill: {
      name: 'Spin before speed',
      reps: '30 throws at 60% with a deliberate wrist snap',
      body:
        'Thirty throws at sixty percent effort where the only thing you try to do is snap the wrist hard and late. The disc should come out quiet and flat and not go very far. That is correct — you are separating spin from speed so you can build the first one, and the distance comes back on its own once it is there.',
    },
  },

  'backhand-vs-forehand': {
    why:
      'These are two different tools and the question is never which is better, it is which the hole wants. Having both means the course stops dictating to you. Having only one means every hole that bends the wrong way costs you something, every single round.',
    how: [
      'For a right-handed player, the backhand naturally finishes left and the forehand naturally finishes right. Those two are your default shapes.',
      'Reach for the forehand when the hole bends right, when you need a quick shot from an awkward stance, or when you cannot turn your back on the target for a backhand run-up.',
      'Reach for the backhand for distance and for most open holes. For nearly everybody the backhand goes further and holds a line better.',
      'In tight woods the forehand is often the safer shot simply because it needs less space to throw.',
      'Build the backhand first if you are starting out. It is the higher ceiling and the more useful of the two.',
    ],
    wrong: [
      {
        fault: 'Learning only one and shaping every hole around it.',
        fix: 'A serviceable 200-foot forehand is worth more than another 20 feet of backhand, because it changes which holes are available to you.',
      },
      {
        fault: 'Using the forehand because the backhand feels hard, before either is reliable.',
        fix: 'Build the backhand first. The forehand is a specialist shot that is easier to produce badly and harder to produce well.',
      },
      {
        fault: 'Throwing a forehand for distance on an open hole out of habit.',
        fix: 'Compare them honestly in a field. For almost everybody the backhand wins on distance by a clear margin.',
      },
    ],
    drill: {
      name: 'Both, same target',
      reps: '15 backhands and 15 forehands at the same target',
      body:
        'Same day, same target, fifteen of each. Pace both groups and note the spread as well as the distance. You will end up with two honest numbers, and those numbers — not habit or preference — are what should decide which throw you reach for when a hole could take either.',
    },
  },

  // ─────────────────────────── DISC SELECTION ───────────────────────────
  'flight-numbers': {
    why:
      'The four numbers on a disc are the closest thing the sport has to a specification, and reading them properly saves you from the most common equipment mistake there is: buying a disc that cannot do what you want at the speed you throw. They are not perfectly comparable between brands, but within a brand they are reliable.',
    how: [
      'Speed, roughly 1 to 14, is how fast the disc has to be moving to fly as designed. High speed needs a strong arm, not just a strong wish.',
      'Glide, roughly 1 to 7, is how well it stays in the air. More glide means more distance for the same effort, and less control into wind.',
      'Turn, from +1 to -5, is the high-speed behaviour. A negative number means the disc bends right early for a right-handed backhand, and the more negative the more it bends.',
      'Fade, 0 to 5, is the low-speed finish. A higher number means it hooks left harder at the end for a right-handed backhand.',
      'Read turn and fade together: a -3 / 1 disc is a long gentle right-to-straight flight, while a 0 / 3 disc goes left and keeps going left.',
      'Lower numbers all round are more forgiving. A beginner is better served by 5 / 5 / -1 / 1 than by anything exciting.',
    ],
    wrong: [
      {
        fault: 'Comparing numbers across manufacturers as if they were standardised.',
        fix: 'They are set by each brand, not by a governing body. A 5-speed from one maker can fly noticeably differently from another’s.',
      },
      {
        fault: 'Expecting the printed flight at your own arm speed.',
        fix: 'The numbers describe the flight at the speed the disc was designed for. Below that, every disc behaves more overstable than the numbers say.',
      },
      {
        fault: 'Choosing on turn alone and ignoring speed.',
        fix: 'An understable disc you cannot get up to speed still fades left. Speed is the gate; stability is the shape.',
      },
    ],
    drill: {
      name: 'Predict then throw',
      reps: '5 throws each with 4 different discs (20 total)',
      body:
        'Before each disc, say out loud what you expect from the numbers — where it will bend and where it will finish. Then throw five and see. Doing this with four discs teaches you how the numbers translate at YOUR arm speed, which is the only translation that matters.',
    },
  },

  'understable-vs-overstable': {
    why:
      'Stability is the single most useful concept in disc selection. It explains why a disc that works beautifully for one player is unthrowable for another, why your discs behave differently in wind, and why a brand new disc and a worn one from the same mould are effectively two different discs.',
    how: [
      'Understable discs want to bend right during the fast part of the flight, for a right-handed backhand. They are easier to get distance from with less power and they are what beginners should mostly throw.',
      'Overstable discs resist that bend and finish left, reliably and often hard. They are the answer in headwinds, for spike hyzers and for forehands.',
      'Stable sits between the two: holds a line and finishes gently.',
      'Stability is relative to YOUR arm speed. A disc that is stable for a strong thrower is overstable for a weaker one. There is no absolute answer.',
      'Match the stability to the shot: understable to turn right, overstable to come back left, stable to go straight.',
      'Reverse left and right throughout for a left-handed backhand or a right-handed forehand.',
    ],
    wrong: [
      {
        fault: 'Treating stability as a property of the disc alone.',
        fix: 'It is a property of the disc AND your arm speed AND the wind. The same disc is three different discs in those three variables.',
      },
      {
        fault: 'Buying overstable discs because they sound more controlled.',
        fix: 'Overstable discs need power to do anything other than go left. Without it they just go left sooner.',
      },
      {
        fault: 'Assuming an understable disc will fix an accuracy problem.',
        fix: 'Understable discs are less forgiving of a bad angle, not more. They are forgiving of low power, which is a different thing.',
      },
    ],
    drill: {
      name: 'Two extremes',
      reps: '15 throws with your most understable disc and 15 with your most overstable',
      body:
        'Same target, same effort, fifteen of each. Draw the two flight paths on paper afterwards. Everything else in your bag sits between those two lines, and knowing where the edges are is what lets you pick sensibly in the middle.',
    },
  },

  'starter-set': {
    why:
      'Three discs genuinely covers the whole game for a first season, and carrying three rather than fifteen makes you better faster — because improvement comes from knowing exactly what a disc does, and you only learn that by throwing the same one several hundred times.',
    how: [
      'A putter: speed 2 or 3, something comfortable in the hand. It putts, it approaches, and it is the most accurate disc you will own.',
      'A midrange: speed 4 or 5, straight and forgiving. This should be most of your throws for the first year.',
      'A fairway driver: speed 6 or 7, slightly understable. This is your distance shot until your arm catches up.',
      'Buy them light — 150 to 165 grams — so they fly properly at the speed you actually throw.',
      'Many brands sell exactly this as a three-disc beginner set, which is both cheaper and better chosen than picking individually from a wall of 400 discs.',
    ],
    wrong: [
      {
        fault: 'Adding a distance driver to the set because it is the exciting one.',
        fix: 'It will fade hard left for a right-handed backhand and teach you nothing. Add it when the fairway driver is reliably going 300 feet.',
      },
      {
        fault: 'Buying a bag of fifteen because a set was on offer.',
        fix: 'Carrying fifteen discs you cannot distinguish is worse than carrying three you know. Expand slowly and deliberately.',
      },
      {
        fault: 'Replacing a disc because somebody said a different mould was better.',
        fix: 'The mould matters far less than the reps. Throw yours until you know its flight before changing anything.',
      },
    ],
    drill: {
      name: 'Three discs, one month',
      reps: 'every round for 1 month with exactly 3 discs',
      body:
        'Play a month of rounds carrying nothing but the three. You will be forced to shape shots rather than reach for a different disc, which is the skill that transfers. Almost everybody scores the same or better while learning considerably more.',
    },
  },

  'when-to-use-midranges': {
    why:
      'The midrange is the most accurate disc in most bags and the least used. It holds a line, lands softly, and does not punish a slightly imperfect release the way a driver does. Players who score well throw midranges on holes where players who score badly throw drivers.',
    how: [
      'Reach for a midrange on anything inside about 250 feet. For many players that is most of the holes on most courses.',
      'Use one in the woods regardless of distance. Control is worth more than reach when the penalty for a miss is a tree.',
      'Use one for approaches where the disc needs to stop. Midranges land flatter and skip less than drivers.',
      'Learn one midrange properly before owning three. A single well-known mid covers a remarkable range of shots.',
      'Throw it at full effort. A midrange thrown hard goes much further than most people expect and stays accurate while it does.',
    ],
    wrong: [
      {
        fault: 'Reaching for a driver on a 250-foot hole because a driver is for driving.',
        fix: 'Pick the disc by what the shot needs, not by the name of the slot. A midrange that finishes near the basket beats a driver that finishes in trouble.',
      },
      {
        fault: 'Throwing midranges softly because they are the control disc.',
        fix: 'Throw them hard. They are accurate at full power, which is what makes them so useful.',
      },
      {
        fault: 'Skipping straight from putter to driver in the bag.',
        fix: 'The gap between them is where most holes live. A midrange fills it better than anything else.',
      },
    ],
    drill: {
      name: 'Midrange only',
      reps: '1 full round throwing nothing but a midrange and a putter',
      body:
        'Play a whole round with two discs: one midrange and one putter. Compare the score with your usual. Most players lose very little and some improve, and everybody comes away understanding what a midrange can actually do — which is the point and is hard to believe without trying it.',
    },
  },

  'choose-first-putter': {
    why:
      'Your putter is the disc you will throw more than any other, and the one where feel matters most, because a putting stroke is built around a specific shape in your hand. This is the one purchase where what somebody else recommends is close to irrelevant.',
    how: [
      'Hold several before buying. Rim depth, rim width and how stiff the plastic is all change how a putter sits in the hand.',
      'Choose on feel first and flight second. A putter that feels right gets thrown with confidence, which matters more than its numbers.',
      'Pick slightly stable rather than very understable, so it doubles as an approach disc.',
      'Then buy two or three of the same one. Putting with identical discs removes a variable you did not know you had.',
      'Throw that one putter exclusively for a season. Touch is built from repetition with one object.',
    ],
    wrong: [
      {
        fault: 'Buying the putter a professional uses.',
        fix: 'Their hand is not yours and their stroke is not yours. Hold some, pick what fits.',
      },
      {
        fault: 'Switching putters after a bad round.',
        fix: 'The putter is almost never the problem. Switching resets the touch you were building, which makes the next round worse.',
      },
      {
        fault: 'Putting with a different disc from the one you approach with.',
        fix: 'One mould for both means every approach is also putting practice. That is a large amount of free repetition.',
      },
    ],
    drill: {
      name: 'Hold before you buy',
      reps: 'try at least 5 putters in hand, then 20 putts with your pick',
      body:
        'In a shop, hold at least five different putters and notice which one your fingers settle into without you adjusting. Buy that one, then throw twenty putts from fifteen feet. Feel is not a sentimental criterion here — a disc you have to re-grip every time will never putt consistently.',
    },
  },

  'advanced-flight-ratings': {
    why:
      'The four numbers describe a brand-new disc thrown at full professional speed, which is two assumptions that are false for almost everybody. Understanding what the numbers leave out is the difference between predicting a flight and being surprised by it.',
    how: [
      'Assume every disc flies more overstable than its numbers at below-design speed. This is the single biggest correction to make.',
      'Account for wear. Discs become more understable as they are used, so a well-thrown disc is a different disc from the one you bought.',
      'Account for plastic. The same mould in base and premium plastic has the same printed numbers and noticeably different flights, and the base one changes much faster.',
      'Account for weight. A lighter disc of the same mould flies further for less power and is more understable in practice.',
      'Look at the disc itself: how domed it is, and how high the parting line sits on the rim, both affect stability within the same mould and run.',
      'Treat numbers as a starting point for a conversation with the disc, not as a prediction.',
    ],
    wrong: [
      {
        fault: 'Expecting two discs with identical numbers to fly identically.',
        fix: 'Different brands, plastics, weights, runs and amounts of wear all move the flight. The numbers are a rough bracket.',
      },
      {
        fault: 'Being surprised when a favourite disc starts turning over.',
        fix: 'That is wear, and it is normal. Buy its replacement before you need it so you have a fresh one broken in behind it.',
      },
      {
        fault: 'Buying a disc on numbers alone without throwing it.',
        fix: 'Fifteen throws tells you more than any specification. Borrow one first where you can.',
      },
    ],
    drill: {
      name: 'Same mould, different ages',
      reps: '10 throws each with a fresh and a worn copy of the same disc',
      body:
        'If you have a new and a well-used copy of one mould, throw ten of each at the same target. The difference is usually dramatic and it is the clearest possible demonstration that the printed numbers describe a moment in a disc’s life rather than a permanent property.',
    },
  },

  'minimal-travel-bag': {
    why:
      'A smaller bag makes better decisions. With four discs you ask what shape the hole needs; with twenty you spend the same moment hunting for the perfect tool and throw whichever you grabbed. Almost every professional throws a small handful of moulds far more than the rest of their bag.',
    how: [
      'Cover four slots: putter, midrange, fairway driver, distance driver. One disc in each is a complete bag.',
      'Add a fifth and sixth only where there is a genuine gap — usually one overstable disc for wind and forehands, and one understable for turnovers and rollers.',
      'Choose discs with clearly different flights. Two discs that fly almost the same are one disc and a decision you do not need.',
      'Carry multiples of your putter, which is the one place duplication pays.',
      'Know each one deeply. The goal is to call the flight before you throw it, every time.',
    ],
    wrong: [
      {
        fault: 'Filling a bag with discs that fly almost identically.',
        fix: 'Lay them all out and sort by actual flight, not by name. Most crowded bags have three or four real shapes in twenty discs.',
      },
      {
        fault: 'Carrying a disc you have not thrown in two months.',
        fix: 'Take it out. A disc you do not trust is weight and a distraction at the moment of choosing.',
      },
      {
        fault: 'Adding a disc to fix a shot you have not practised.',
        fix: 'Try the shot with what you have first. Most gaps in a bag are gaps in a skill.',
      },
    ],
    drill: {
      name: 'Cut to four',
      reps: '3 rounds with exactly 4 discs',
      body:
        'Play three rounds with one putter, one midrange, one fairway and one distance driver. Note every shot where you genuinely missed a disc you did not have. That short list — usually one or two entries, not ten — is what your bag actually needs beyond four.',
    },
  },

  'seasonal-disc-selection': {
    why:
      'The same disc does not fly the same in February and August. Cold air is denser and cold plastic is stiffer, and both push a disc toward behaving more overstable; warm air and softer plastic do the opposite. Players who do not adjust spend half the year wondering why their favourite disc stopped working.',
    how: [
      'In cold weather, expect your discs to finish left earlier and go shorter, for a right-handed backhand. Bag slightly understable to compensate.',
      'In hot weather, expect discs to turn over sooner. Bag slightly more stable than usual.',
      'Keep discs warm between throws in genuinely cold conditions — a disc straight from a freezing bag is stiffer than one from a pocket.',
      'Adjust by changing discs rather than changing your throw. Changing your form for the season is how a winter costs you a summer.',
      'Re-check your assumptions at the start of each season rather than mid-round in a competition.',
    ],
    wrong: [
      {
        fault: 'Blaming your form when a trusted disc stops behaving in January.',
        fix: 'Check the temperature before you check your technique. Cold is a large and completely normal effect.',
      },
      {
        fault: 'Changing your release angle to compensate for the season.',
        fix: 'Change the disc. Compensations learned in winter have to be unlearned in spring.',
      },
      {
        fault: 'Leaving discs in a hot car.',
        fix: 'Heat warps discs permanently. That is not a seasonal adjustment, it is a ruined disc.',
      },
    ],
    drill: {
      name: 'Same disc, two seasons',
      reps: '15 throws with one disc, repeated in cold and warm conditions',
      body:
        'Throw fifteen with a familiar disc at a known target on a cold day and note the finish. Repeat on a warm one. Writing the two down means you make the adjustment next winter from evidence rather than from a vague memory of things being harder.',
    },
  },

  'discs-hand-sizes-grip-styles': {
    why:
      'A disc that does not fit your hand cannot be gripped consistently, and a grip that changes on every throw makes everything downstream of it unfixable. This is a particular problem for players with smaller hands, who are often sold wide-rimmed drivers that they physically cannot hold properly.',
    how: [
      'Try the rim width. A wide rim on a small hand means the fingers cannot wrap properly, which costs grip strength and spin.',
      'Try the rim depth. Deeper rims suit a power grip; shallower ones suit a fan grip and feel better for putting and approaches.',
      'Notice whether you have to adjust your fingers after picking the disc up. If you do, it does not fit.',
      'Match the disc to your grip rather than changing your grip to the disc.',
      'Lower-speed discs have narrower rims, which is another reason they suit players still building power — the fit is better as well as the speed.',
    ],
    wrong: [
      {
        fault: 'Assuming a poor grip is a technique problem when the disc is simply too big.',
        fix: 'Borrow a narrower-rimmed disc and see whether the problem disappears. If it does, it was the disc.',
      },
      {
        fault: 'Buying online by numbers without ever holding the mould.',
        fix: 'Hold it where you can. Fit is not something a specification sheet describes.',
      },
      {
        fault: 'Changing grip style to accommodate a disc you like the look of.',
        fix: 'The grip is the foundation. Change the disc.',
      },
    ],
    drill: {
      name: 'Pick it up ten times',
      reps: 'pick up each candidate disc 10 times with your eyes closed',
      body:
        'Pick a disc up ten times without looking and notice whether your fingers land in the same place each time. A disc that fits settles identically; one that does not needs adjusting, and that adjustment is a variable you will carry into every throw.',
    },
  },

  'plastic-types': {
    why:
      'The same mould in two plastics is two different discs over time. Base plastic grips better and wears in quickly; premium plastic holds its flight for years. Choosing deliberately means your discs change when you want them to rather than on their own schedule.',
    how: [
      'Base plastic — names vary by brand — is cheaper, grippier in the hand and wears in fast. It is excellent for putters and for discs you want to season deliberately.',
      'Premium plastic is more durable and keeps its stability for a long time. It is what you want for a disc whose flight you rely on.',
      'Use base plastic where grip matters most: putters, and approach discs in wet weather.',
      'Use premium where consistency matters most: the drivers and midranges you have built your shots around.',
      'Accept that base plastic in a driver is a disc with a shelf life. That is not a flaw, it is the trade you chose.',
    ],
    wrong: [
      {
        fault: 'Buying a key driver in base plastic and being surprised when it turns over after a season.',
        fix: 'That is exactly what base plastic does. Premium for the discs you depend on.',
      },
      {
        fault: 'Dismissing base plastic as cheap.',
        fix: 'It grips better than anything in the rain, and it is the right choice for putters for exactly that reason.',
      },
      {
        fault: 'Expecting two plastics of the same mould to fly the same out of the box.',
        fix: 'They usually do not, even when new. Treat them as separate discs and learn each.',
      },
    ],
    drill: {
      name: 'Two plastics, one mould',
      reps: '10 throws each with the same mould in base and premium',
      body:
        'If you can borrow both, throw ten of each at one target. The difference when new is usually modest and the difference after a season is large. Knowing which of your discs will change under you is what stops a favourite quietly becoming something else.',
    },
  },

  'beat-in-seasoning': {
    why:
      'Discs get more understable as they wear, which means a disc you have thrown for two years is a genuinely different tool from the one you bought. Most players experience this as a favourite disc betraying them. Used deliberately it is the cheapest way to add a turnover shot and a roller to your bag.',
    how: [
      'Understand what wear does: scuffs and softened edges make a disc turn more and fade less, so it flies straighter for less power and eventually turns over.',
      'Season a disc by simply throwing it a lot, particularly in base plastic, which wears fastest.',
      'Keep one well-worn copy of a mould as your dedicated turnover and roller disc.',
      'Buy the replacement before the old one is finished, so you always have a fresh one coming through behind it.',
      'Label or mark them so you can tell your three stages of the same mould apart at a glance.',
    ],
    wrong: [
      {
        fault: 'Deliberately damaging discs against trees or concrete to speed up the process.',
        fix: 'It wears unevenly and can crack the rim, which makes the flight unpredictable rather than understable. Throw it instead.',
      },
      {
        fault: 'Keeping one copy of a favourite mould and being left with nothing when it goes.',
        fix: 'Keep a fresh, a mid-life and a worn copy. This is the one place in a bag where duplication genuinely earns its space.',
      },
      {
        fault: 'Not noticing a disc has changed and blaming your form for new turnovers.',
        fix: 'If a disc has started turning over, check the rim. Wear is gradual and easy to miss until it is obvious.',
      },
    ],
    drill: {
      name: 'Three stages',
      reps: '10 throws each with a fresh, a used and a worn copy of one mould',
      body:
        'Throw ten of each at one target and mark where the three groups finish. Those are three different shots available to you from one mould you already know how to throw — which is a much cheaper way to widen your bag than buying three new discs.',
    },
  },

  'disc-weight': {
    why:
      'Weight changes a disc’s flight as much as stability does, and it is the easiest adjustment for a developing arm. A lighter disc gets up to its design speed with less effort, which means a beginner actually sees the flight the disc was designed to produce rather than a truncated version of it.',
    how: [
      'Lighter discs — roughly 150 to 165 grams — fly further for less power and feel more understable. This is what most new players should be throwing.',
      'Heavier discs — around 170 to 175 grams — hold their line better in wind and resist being pushed around.',
      'Carry something heavier for genuinely windy days if you play an exposed course.',
      'Change weight before you change mould when a disc does not suit you. It is a smaller, cheaper and more predictable adjustment.',
      'Match putter weight to feel rather than to theory. Putting weight is personal and short throws are barely affected by wind.',
    ],
    wrong: [
      {
        fault: 'Buying everything at maximum weight because that is what is on the shelf.',
        fix: 'Ask for lighter. Most shops stock a range and the heavy ones are simply the most common.',
      },
      {
        fault: 'Throwing light discs on a very windy day and wondering why nothing holds.',
        fix: 'Light discs are at the wind’s mercy. This is the one condition where heavier is clearly better.',
      },
      {
        fault: 'Assuming heavier means more distance.',
        fix: 'For most amateur arms the opposite is true. Heavier means more stable, which at low speed means shorter.',
      },
    ],
    drill: {
      name: 'Light against heavy',
      reps: '10 throws each with a light and a heavy copy of one mould',
      body:
        'Same mould, two weights, ten throws each on a calm day — then repeat on a windy one if you can. The calm-day comparison usually surprises people with how much further the lighter one goes; the windy-day one shows exactly why you still want the heavy one in the bag.',
    },
  },

  'disc-care': {
    why:
      'Discs are cheap individually and expensive in aggregate, and a disc that is dirty, warped or lost is costing you strokes before you throw it. Nearly all of this is avoidable with habits that take seconds.',
    how: [
      'Wipe each disc before you throw it. Mud and water on the flight plate change the grip and the release more than people expect.',
      'Carry a small towel, and in wet weather a second dry one kept inside the bag.',
      'Store discs flat or on edge in a bag, never stacked under heavy objects, and never in a hot car — heat warps them permanently.',
      'Wash them in cool water with a little soap when they get properly dirty. Hot water can soften plastic.',
      'Write your name and phone number on every disc. This is the single highest-return thing in this lesson.',
    ],
    wrong: [
      {
        fault: 'Leaving a bag in a car boot through a hot summer day.',
        fix: 'Bring it inside. A warped disc cannot be straightened and will never fly properly again.',
      },
      {
        fault: 'Throwing a wet, muddy disc and blaming the release.',
        fix: 'Wipe it. A slipped release from a dirty plate looks exactly like a grip fault and is not one.',
      },
      {
        fault: 'Not marking discs, then losing a favourite permanently.',
        fix: 'Name and number, on every disc, today. Most of the disc golf community genuinely does return them.',
      },
    ],
    drill: {
      name: 'Mark the bag',
      reps: '20 minutes, once: every disc marked and checked flat',
      body:
        'Sit down with a marker and put your name and phone number on every disc you own, then check each one for warping by resting it on a flat surface. Twenty minutes, once, and it is the difference between losing a disc and having it handed back to you a week later.',
    },
  },

  // ───────────────────────────── PRACTICE ─────────────────────────────
  'practice-plan': {
    why:
      'Practice time divides badly by default: people throw drivers because it is fun and putt because they feel they should. The strokes are in the opposite place. A plan is just a decision made in advance so the hour is spent where it pays rather than where it entertains.',
    how: [
      'Weight the time toward where the strokes are. Putting and approaches inside 150 feet deserve more of your hour than driving does.',
      'A workable split for an hour: 25 minutes putting, 20 minutes approaches, 15 minutes field work.',
      'Give each session one goal. "Nose angle" or "putting from 25 feet" — not "get better".',
      'Keep sessions short and frequent rather than long and occasional. Three thirty-minute sessions beat one ninety-minute one.',
      'Write down one number per session so you can tell whether anything is changing.',
    ],
    wrong: [
      {
        fault: 'Spending most of the time on drivers because it is the enjoyable part.',
        fix: 'Keep some of it — practice you dislike does not happen. But put the majority where the scoring is.',
      },
      {
        fault: 'Practising everything a little in every session.',
        fix: 'One goal per session. Spreading attention across five things means improving at none of them measurably.',
      },
      {
        fault: 'Long sessions that end in fatigue.',
        fix: 'Tired reps teach a tired motion. Stop when the quality drops, not when the time runs out.',
      },
    ],
    drill: {
      name: 'The hour',
      reps: '25 min putting, 20 min approaches, 15 min field work',
      body:
        'Run exactly that hour, with one stated goal, three times in a fortnight. Record one number each time — putts made from 20 feet, approaches inside 15 feet, whatever matches the goal. Three data points is enough to tell whether the plan is working, which is more than most practice ever produces.',
    },
  },

  'field-work': {
    why:
      'Field work is the only place you can throw a disc fifty times and watch what it does. On a course you get one throw and a result confounded by trees, slopes and nerves. In a field the feedback is clean, which is the entire reason it is worth doing.',
    how: [
      'Take the whole bag and a lot of discs so you are not walking after every throw.',
      'Pick ONE form cue per session and hold it for the whole hour. Changing cues mid-session means learning nothing.',
      'Throw each disc enough times to see a pattern — ten or more. One throw is an anecdote.',
      'Walk out and look at the group, not the best throw. The spread is what you take to a course.',
      'Throw at a target, not into space. Aimless distance throwing builds a motion with no accuracy attached.',
    ],
    wrong: [
      {
        fault: 'Throwing for maximum distance the whole session.',
        fix: 'Max effort hides form faults and builds fatigue. Work at 80% where you can actually feel what you are doing.',
      },
      {
        fault: 'Changing the cue every few throws when it does not immediately work.',
        fix: 'Give one change a whole session. Most form changes feel worse before they feel better.',
      },
      {
        fault: 'Judging by the single best throw.',
        fix: 'Your best throw is not your game. Pace the middle of the group — that is the number that shows up on a scorecard.',
      },
    ],
    drill: {
      name: 'One cue, one hour',
      reps: '60 throws, one form cue, one target',
      body:
        'Sixty throws at one target with one cue held the whole way through, at about eighty percent effort. Pace out the middle of your group at the start and the end. That comparison is the only honest measure of whether an hour of field work did anything.',
    },
  },

  'form-drills': {
    why:
      'Changing a motion you have thrown thousands of times takes deliberate, slow repetition — at full speed your body simply does what it already knows. Drills exist to put the new position into the motion at a speed where you can actually feel it.',
    how: [
      'Work slowly. Half speed or less is where a new position can be felt and therefore learned.',
      'Use a mirror or a window to check positions you cannot feel, particularly the reach back and the power pocket.',
      'Try a towel drill: throw a towel with your normal motion. It only cracks when the sequence and the snap are right, so it gives instant feedback with no disc flight to distract you.',
      'Do one-step and standstill throws to isolate the upper body from the footwork.',
      'Finish each drill session with a few full-speed throws to see whether any of it survived.',
    ],
    wrong: [
      {
        fault: 'Doing drills at full speed, where the old motion simply takes over.',
        fix: 'Slow down until you can feel each position. Speed is the last thing added, not the first.',
      },
      {
        fault: 'Doing a drill without knowing which fault it addresses.',
        fix: 'Name the fault first. A drill chosen at random is exercise, not practice.',
      },
      {
        fault: 'Expecting a drill to transfer immediately.',
        fix: 'A motion changed in drills takes weeks to appear under pressure. Keep doing it after it starts working.',
      },
    ],
    drill: {
      name: 'Slow reps then real ones',
      reps: '30 slow reps, then 10 full-speed throws',
      body:
        'Thirty deliberate half-speed repetitions of one position, then ten throws at full effort. Watch whether the position survives the speed. When it does not — and it will not, at first — that tells you the drill is not finished rather than that it failed.',
    },
  },

  'filming-your-form': {
    why:
      'What your throw feels like and what it looks like are different things, and the gap is usually large. Thirty seconds of video answers questions that months of guessing will not, which makes a phone the cheapest coaching available.',
    how: [
      'Film from directly behind, down your target line. This shows rounding, the swing plane and the release angle.',
      'Film from the side, level with your hips. This shows the brace, whether you stand up, and the weight transfer.',
      'Film at the highest frame rate your phone offers, and use slow motion to step through the release.',
      'Compare against a professional at the SAME moment of the throw — plant, pocket, release — rather than against a general impression.',
      'Film again after a few weeks of work on one fault, from the same two angles, so the comparison is fair.',
    ],
    wrong: [
      {
        fault: 'Filming from an angle that shows nothing, usually from in front or far away.',
        fix: 'Behind and side-on, close. Those two angles answer nearly every question worth asking.',
      },
      {
        fault: 'Watching the whole throw at normal speed and concluding it looks fine.',
        fix: 'Step through it frame by frame around the release. Everything interesting happens in about a fifth of a second.',
      },
      {
        fault: 'Trying to fix everything the video reveals.',
        fix: 'Pick the one furthest back in the chain — usually footwork or reach back — and fix only that. The ones downstream often resolve themselves.',
      },
    ],
    drill: {
      name: 'Two angles, one fault',
      reps: '5 throws filmed from behind and 5 from the side',
      body:
        'Ten throws, two angles, then watch them once through and pick a single fault. Write it down. Work on nothing else for three sessions, then film again from the same two positions. That is a complete improvement cycle and it takes about three weeks.',
    },
  },

  'tracking-your-practice': {
    why:
      'Without numbers, practice is a feeling — and the feeling is usually that you are improving when you are not, or that you are stuck when you are not. Tracking also does the less obvious job of showing you how much you are throwing, which is what stands between a keen player and an injured one.',
    how: [
      'Track putting by distance: makes out of ten at 15, 20, 25 and 30 feet. Four numbers, once a week.',
      'Track approaches by result: how many from 100 feet finish inside 15 feet.',
      'Count full-power throws per session. Most overuse injuries come from volume, not from one bad throw.',
      'Review monthly rather than per session. Session to session is noise; a month is a trend.',
      'Let the numbers pick the next thing to practise, rather than your preference.',
    ],
    wrong: [
      {
        fault: 'Tracking everything until the admin outlasts the enthusiasm.',
        fix: 'Four or five numbers a week. A system you abandon measures nothing.',
      },
      {
        fault: 'Reading too much into a single bad session.',
        fix: 'Look at the month. One session is weather, sleep and mood as much as skill.',
      },
      {
        fault: 'Ignoring throwing volume until something hurts.',
        fix: 'Count the full-power throws and build up gradually. If something does hurt, stop and get it looked at properly rather than throwing through it.',
      },
    ],
    drill: {
      name: 'Four numbers a week',
      reps: '10 putts each at 15, 20, 25 and 30 ft, weekly',
      body:
        'Forty putts, four numbers, written down, once a week. After a month you will know precisely which distance is your weakest — and that is where the next month of practice should go. It takes fifteen minutes and it is the most useful record most players never keep.',
    },
  },

  'pressure-practice': {
    why:
      'Practice putts and tournament putts are different shots, and only one of them is being practised in an empty field on a Tuesday. The gap between them is nerves, and nerves can be rehearsed — but only if practice has something at stake.',
    how: [
      'Add a consequence. A set you must restart on a miss, a small wager, press-ups, anything that makes a miss cost something.',
      'Use must-make sets: five in a row from 20 feet, back to zero on a miss.',
      'Practise with other people watching. An audience is most of what tournament pressure actually is.',
      'Deliberately practise the shots you fear rather than the ones you enjoy.',
      'Do pressure work at the END of a session, when you are tired, because that is the state a closing hole finds you in.',
    ],
    wrong: [
      {
        fault: 'Practising only in comfortable conditions and expecting it to transfer.',
        fix: 'Comfortable practice builds a comfortable game. Add stakes deliberately, every session.',
      },
      {
        fault: 'Avoiding the shots that make you nervous.',
        fix: 'Those are the ones costing you strokes. Spend the practice time there, where it is cheap to fail.',
      },
      {
        fault: 'Making the stakes so high that practice becomes miserable.',
        fix: 'Enough to feel it, not enough to dread it. The aim is a slightly raised heart rate, not a bad afternoon.',
      },
    ],
    drill: {
      name: 'Five in a row, with a cost',
      reps: '5 consecutive makes from 20 ft, restarting on every miss',
      body:
        'Five in a row from twenty feet, back to zero on a miss, and you are not finished until it is done. Do it at the end of a session with somebody watching. The fourth putt feels completely different from the first, and that feeling is exactly the thing you came to practise.',
    },
  },

  'driving-practice-routine': {
    why:
      'Most driving practice is a bag of discs thrown as far as possible until the arm tires, which builds fatigue and a max-effort motion you will never use on a course. A routine turns the same hour into distance you can repeat and control you can rely on.',
    how: [
      'Warm up first: ten minutes of easy throws at 50 to 60 percent before anything at full effort. This matters for your shoulder as much as your form.',
      'Throw at targets, not into open space. Every throw should have a specific intent.',
      'Work at 80% for most of the session. That is the effort you actually use on a course and it is where form is learnable.',
      'Include distance control, not just maximum distance — throws aimed at 200 and 250 feet as well as as far as possible.',
      'Finish on good repetitions. Stop while the throws are still clean rather than when you are too tired to make one.',
    ],
    wrong: [
      {
        fault: 'Starting at full power with no warm-up.',
        fix: 'Ten minutes easy first, every time. This is where shoulder and elbow problems begin.',
      },
      {
        fault: 'Throwing until the arm is finished.',
        fix: 'Stop while the quality is high. The last ten tired throws teach a tired motion and cost you the next session too.',
      },
      {
        fault: 'Maximum effort on every throw.',
        fix: 'Mostly 80%. Max effort is a small part of a session and never the whole of one.',
      },
      {
        fault: 'Throwing with no target.',
        fix: 'Pick one for every throw. Distance without a direction does not show up on a scorecard.',
      },
    ],
    drill: {
      name: 'Warm, work, finish clean',
      reps: '10 min warm-up, 40 throws at 80% to targets, stop on 3 good ones',
      body:
        'Ten minutes easy, then forty purposeful throws at about eighty percent with a target for each, then stop as soon as you have strung three clean ones together. Ending on quality rather than exhaustion is what makes the next session start where this one finished.',
    },
  },

  // ────────────────────────── COURSE STRATEGY ──────────────────────────
  'know-your-lines': {
    why:
      'Players who score well see the whole flight before they throw; players who do not aim at the basket and hope. The difference is not vision, it is a habit — and it costs nothing to build. Picking a line also forces the honest question of whether you can actually throw it, which is where most strokes are saved.',
    how: [
      'Stand behind the tee and trace the entire flight with your eyes: where it leaves, where it peaks, where it bends, where it lands.',
      'Pick the line you hit most often, not the best one available. Those are different lines and the gap between them is where bogeys come from.',
      'Name the shot before you step on the pad — disc, angle, power, landing spot.',
      'If you cannot see a line, the answer is a shorter, safer shot rather than a hopeful one.',
      'Commit completely once chosen. A line thrown at 80% conviction becomes a different line in the air.',
    ],
    wrong: [
      {
        fault: 'Aiming at the basket rather than at a line.',
        fix: 'The basket is where the line ends, not what you aim at. Aim at the gap, the peak or the landing spot.',
      },
      {
        fault: 'Choosing the hero line because it is the one that would look best.',
        fix: 'Ask how often you hit it. Below about half the time it is costing you strokes over a season, however good it feels when it works.',
      },
      {
        fault: 'Deciding on the pad, with the disc already in hand.',
        fix: 'Decide behind the tee. Once you are standing on the pad there should be nothing left to work out.',
      },
    ],
    drill: {
      name: 'Say the line',
      reps: '1 full round naming the line out loud before every tee shot',
      body:
        'For one round, say the whole plan aloud before each drive: disc, angle, where it lands. It feels absurd for three holes and then becomes genuinely useful — mostly because saying a bad plan out loud is how you notice it is a bad plan.',
    },
  },

  'reading-landing-zone': {
    why:
      'A disc is not finished when it lands. On hard ground it skips, on a slope it runs, in wet grass it stops dead — and the difference between those outcomes is routinely thirty or forty feet. Players who plan only the flight are planning two thirds of the shot.',
    how: [
      'Look at the ground where the disc will land before choosing the shot: hard-packed, wet, sloped, leaf-covered.',
      'Plan the skip. A disc arriving flat and fast on hard ground will travel a long way further than it landed.',
      'Favour the safe side of any trouble, so that a miss finishes somewhere you can play from.',
      'Choose the landing zone that leaves the next shot you want, which usually means straight and uphill rather than short and sidehill.',
      'On downhill landings, expect considerably more run-out than you think and aim shorter.',
    ],
    wrong: [
      {
        fault: 'Planning the flight and ignoring what happens after it lands.',
        fix: 'Walk up and look at the ground, particularly on an unfamiliar hole. The landing is a third of the shot.',
      },
      {
        fault: 'Landing on the trouble side of the basket because the line was marginally better.',
        fix: 'Pick the side where a miss is survivable. The cost of a miss should drive the choice, not the quality of the best case.',
      },
      {
        fault: 'Treating all ground as equal.',
        fix: 'The same throw finishes 40 feet apart on baked dirt and wet grass. Check the surface, then choose.',
      },
    ],
    drill: {
      name: 'Predict the finish',
      reps: '18 holes predicting where each drive will STOP',
      body:
        'Before every drive, say where you think the disc will come to rest — not where it will land. Then check. You will be wrong a lot at first, mostly by underestimating skip and roll, and the habit of looking at the ground is worth several strokes once it is built.',
    },
  },

  'three-shot-types': {
    why:
      'Hyzer, flat and anhyzer cover the overwhelming majority of holes you will ever play. Having all three reliably is worth far more than another thirty feet of distance, because distance only helps on the holes that already suit your one shape.',
    how: [
      'Hyzer: the disc tilted with its top edge toward you, finishing left for a right-handed backhand. The most reliable shape in the game, and the one to default to under pressure.',
      'Flat: level release, straightest flight. Needs a disc whose stability matches your power or it becomes one of the other two.',
      'Anhyzer: top edge away from you, finishing right for a right-handed backhand. Opens up holes that bend the other way.',
      'Pick the shape from the hole, then the disc that produces it at your arm speed.',
      'When unsure, throw the hyzer. Its miss is predictable, which is what makes it the safe choice.',
      'Reverse left and right throughout for a left-handed backhand or a right-handed forehand.',
    ],
    wrong: [
      {
        fault: 'Owning one shape and bending every hole to fit it.',
        fix: 'Learn the other two in a field. One shape means every hole that does not suit it costs you something.',
      },
      {
        fault: 'Reaching for an anhyzer whenever a hole bends right.',
        fix: 'Consider a hyzer aimed well right first. Anhyzer is the least repeatable of the three and should be chosen, not defaulted to.',
      },
      {
        fault: 'Attempting a shape under pressure that you have not thrown in practice.',
        fix: 'Pressure is where your most reliable shape earns its place. Save experiments for the field.',
      },
    ],
    drill: {
      name: 'All three, one target',
      reps: '10 of each shape at one target (30 total)',
      body:
        'One disc, one target, ten hyzer, ten flat, ten anhyzer. Mark the three groups. Those clusters are your real shot shapes, and the gaps between them tell you which hole shapes you currently cannot cover.',
    },
  },

  'position-play': {
    why:
      'Distance is only useful where it leaves you a shot you can play. Throwing as far as possible every time means regularly finishing in positions you did not choose, and a drive that ends 40 feet further down the fairway and behind a tree has lost you a stroke, not gained one.',
    how: [
      'Decide where you want to be standing for your next shot before you choose this one.',
      'Pick the landing zone that leaves the approach you are best at — for most people straight and open rather than angled or blocked.',
      'Accept a shorter throw when it buys a cleaner next one. This is a gain, not a compromise.',
      'Think one shot ahead on every hole, and two on par 4s and 5s.',
      'On a hole you cannot reach, work backwards: where do you want to putt from, where does that mean the approach comes from, and therefore where should the drive finish?',
    ],
    wrong: [
      {
        fault: 'Throwing maximum distance on every hole by reflex.',
        fix: 'Ask what the next shot looks like from there. Sometimes the answer makes a shorter drive obviously correct.',
      },
      {
        fault: 'Thinking about the current shot only.',
        fix: 'Plan the hole, not the throw. Working backwards from the putt is the single best habit in course management.',
      },
      {
        fault: 'Treating a lay-up as a failure of nerve.',
        fix: 'It is a shot selection. The card records the number, not the ambition.',
      },
    ],
    drill: {
      name: 'Work backwards',
      reps: '9 holes planned from the basket outwards',
      body:
        'On each of nine holes, before teeing off, decide where you want to putt from, then what approach gets you there, then what drive sets up that approach. Play that plan. It is slower and it usually produces a better score, which is the point.',
    },
  },

  'risk-reward-decision-making': {
    why:
      'Most strokes lost by competent players are lost to decisions, not to technique. The arithmetic is simple and almost nobody does it: what you gain when the aggressive shot works, against what you lose when it does not, multiplied by how often each actually happens.',
    how: [
      'Estimate honestly how often you hit the aggressive shot. Use your practice numbers, not your memory of the best one.',
      'Work out what a miss costs — not a near miss, the typical miss. OB, a drop zone, a blocked lie.',
      'Compare the two. If the aggressive line gains one stroke half the time and costs two a quarter of the time, it is losing money.',
      'Treat OB and water as roughly a two-stroke swing, because that is usually what they are once the re-throw is counted.',
      'Take the aggressive line when the miss is cheap, and only then. A safe miss is what makes aggression correct.',
    ],
    wrong: [
      {
        fault: 'Judging the decision by the best case.',
        fix: 'The best case happens occasionally. Decide on the average outcome, which is what your score is made of.',
      },
      {
        fault: 'Overestimating your own success rate.',
        fix: 'Most players think they hit a given line far more often than they do. Count it in practice once and use that number.',
      },
      {
        fault: 'Taking the aggressive line to make up for an earlier bad hole.',
        fix: 'The previous hole is over and the odds have not changed. Chasing is the single most expensive habit in the sport.',
      },
      {
        fault: 'Being equally cautious on every hole.',
        fix: 'Where the miss is genuinely cheap, be aggressive. Blanket caution leaves strokes behind too.',
      },
    ],
    drill: {
      name: 'Do the arithmetic',
      reps: '1 round writing down the sum before each risky shot',
      body:
        'On every hole where you are tempted, write two numbers before you throw: how often you make it, and what the miss costs. Then throw whichever the numbers favour. After eighteen holes you will have a page that argues with your instincts, and the page is usually right.',
    },
  },

  'wind-adjusting-your-lines': {
    why:
      'Wind does not just move a disc sideways, it changes which disc you should be holding. Trying to fight it with the same disc and a different throw is how a windy round turns into a bad one — the adjustment that works is in the bag, not in the motion.',
    how: [
      'Into a headwind, go more overstable than usual. The extra airspeed makes everything behave understable, so you need a disc that resists it.',
      'With a tailwind, go more understable and add a little height. There is less lift available, so discs drop and fade earlier.',
      'In a crosswind, choose the disc that finishes INTO the wind, so the wind pushes it back toward your target rather than away.',
      'Lower the whole line in strong wind. Height is exposure.',
      'Change the disc first and the angle second. Changing your throw is the last resort because it has to be unlearned afterwards.',
    ],
    wrong: [
      {
        fault: 'Throwing the same disc harder into a headwind.',
        fix: 'More power is more airspeed, which makes it turn over further. Change the disc, keep the effort normal.',
      },
      {
        fault: 'Treating a tailwind as free distance.',
        fix: 'It removes lift. Discs come down early and fade hard, which costs as often as it gives.',
      },
      {
        fault: 'Picking the disc that will be pushed toward the basket in a crosswind.',
        fix: 'Pick the one finishing into the wind. A disc working against the wind is controlled; one working with it is not.',
      },
    ],
    drill: {
      name: 'Pick the disc, not the throw',
      reps: '9 holes on a windy day changing only the disc',
      body:
        'Play nine holes in real wind with one rule: you may change discs and angles as much as you like, but your throwing motion stays exactly as it is in calm conditions. This forces the adjustment into the bag where it belongs, and it is usually a revelation about how much the disc choice was doing.',
    },
  },

  'tournament-course-management': {
    why:
      'A tournament round is won by avoiding the big numbers, not by collecting birdies. Over eighteen holes the player who shoots level with no disasters almost always beats the one with four birdies and two doubles. Course management is the discipline of playing for that first scorecard.',
    how: [
      'Identify before the round which holes are birdie opportunities and which are par-save holes, and play each as what it is.',
      'On the par-save holes, take the safe route every time. The stroke you do not lose counts exactly as much as the one you gain.',
      'Avoid the double bogey above everything. One double undoes two birdies.',
      'Play your own game rather than matching your card-mates. Their distance is not available to you and attempting it is how rounds unravel.',
      'Keep the same decision process on hole 18 as on hole 1. Pressure changes the stakes, not the odds.',
    ],
    wrong: [
      {
        fault: 'Trying to birdie every hole.',
        fix: 'Half of most courses are not birdie holes for most players. Playing them as such converts pars into bogeys.',
      },
      {
        fault: 'Chasing a card-mate who outdrives you.',
        fix: 'Play the shot you have. Reaching for distance you do not own is the fastest way to a double bogey.',
      },
      {
        fault: 'Taking more risk late because the score is not what you wanted.',
        fix: 'The odds are the same on hole 17 as on hole 3. Chasing turns a mediocre round into a bad one.',
      },
    ],
    drill: {
      name: 'Mark the card first',
      reps: '1 round with every hole pre-labelled birdie or par-save',
      body:
        'Before teeing off, go down the card and mark each hole as a realistic birdie chance or a par-save. Play accordingly for all eighteen. Compare the total with your usual. Most players shoot better while feeling as though they tried less, which is the entire lesson of this category.',
    },
  },

  'scrambling-get-out-of-trouble': {
    why:
      'Everybody throws into trouble. What separates scores is the decision made from inside it, and the expensive instinct is to try to win the stroke back immediately. One bad throw is a bogey; one bad throw plus a hopeful recovery is a double or worse.',
    how: [
      'Accept the stroke that is already gone before you choose anything. It is not recoverable and trying to recover it is what costs the second one.',
      'Find the widest, safest route back to a clean lie, even if it is sideways or backwards.',
      'Take the lowest line available. Low shots hit fewer things.',
      'Use a disc you can control from an awkward stance — a putter or midrange, almost never a driver.',
      'Decide what score you will accept on this hole, then play the shots that guarantee it.',
    ],
    wrong: [
      {
        fault: 'Attempting the narrow gap that saves par.',
        fix: 'Count how often you would hit it. At one in four, three times out of four you are now in worse trouble a stroke down.',
      },
      {
        fault: 'Throwing hard from a bad lie.',
        fix: 'Power magnifies whatever the awkward stance does to your form. Smooth and short.',
      },
      {
        fault: 'Refusing to throw backwards or sideways on principle.',
        fix: 'A clean lie is worth more than direction. The card has no column for style.',
      },
      {
        fault: 'Deciding the escape route while standing in the trouble.',
        fix: 'Step out, look from a few angles, and pick. The view from inside a bush is not a good basis for a decision.',
      },
    ],
    drill: {
      name: 'Take your medicine',
      reps: '9 holes, always taking the safest escape',
      body:
        'Play nine holes with one rule: from any trouble, you must take the safest available route back to a clean lie, with no exceptions and no heroics. Compare the score. Almost everybody shoots better, and the number is the argument the instinct will not accept on its own.',
    },
  },

  'playoff-strategy-pressure': {
    why:
      'A playoff hole is one shot where everything you have practised either shows up or does not. The mistake people make is treating it as special and therefore playing it differently — reaching for a bigger shot than they own, on the one hole where a mistake cannot be absorbed.',
    how: [
      'Play to your strengths. If your reliable shot is a hyzer with a midrange, throw that, even if a driver would be closer when it works.',
      'Give yourself a putt. The goal is a look at the basket, not a hole-in-one.',
      'Use exactly the routine you have used all day. Changing it under pressure is changing the one thing that was working.',
      'Pick the shot you have actually thrown in practice, not the one you have imagined.',
      'Accept that your opponent might simply play it better. You control your shot and nothing else.',
    ],
    wrong: [
      {
        fault: 'Reaching for a bigger shot because the moment is bigger.',
        fix: 'The hole has not changed. Throw what you throw, which is the shot that got you to the playoff.',
      },
      {
        fault: 'Speeding up because of nerves.',
        fix: 'Deliberately slow the routine down. Nerves compress everything and the first casualty is tempo.',
      },
      {
        fault: 'Playing to what you think your opponent will do.',
        fix: 'Play your own best percentage shot. Reacting to somebody else puts you on a shot you did not choose.',
      },
    ],
    drill: {
      name: 'One shot, cold',
      reps: '10 single shots with a full routine and 5 minutes between each',
      body:
        'Throw one shot, walk away, wait five minutes, throw another. Ten of them. This is far harder than throwing ten in a row and it is exactly what a playoff asks — one cold shot with a full routine and no rhythm to lean on.',
    },
  },

  'using-course-maps': {
    why:
      'A course map tells you the distance, the par and where the trouble is before you have thrown anything. Thirty seconds reading one is the cheapest stroke saving in the game, and on an unfamiliar course it is the difference between playing the hole and discovering it.',
    how: [
      'Read the distance and par first, then decide what the hole actually asks of you.',
      'Find the trouble before you find the basket. OB lines, water, steep ground — those determine the shot more than the target does.',
      'Identify the safe miss: which side can you be on and still play from?',
      'Pick a target landing zone from the map before you walk to the tee.',
      'Check whether the basket position shown is the one in use. Many courses move pins and the map may show a different placement.',
    ],
    wrong: [
      {
        fault: 'Looking at the map only to find out how long the hole is.',
        fix: 'The length is the least useful thing on it. The OB lines and the shape are what change your decision.',
      },
      {
        fault: 'Trusting the map over what you can see.',
        fix: 'Maps go out of date, pins move and trees grow. Use the map to form a plan and your eyes to check it.',
      },
      {
        fault: 'Reading it on the tee pad with the group waiting.',
        fix: 'Read it while walking to the hole. Decisions made with people waiting are rushed decisions.',
      },
    ],
    drill: {
      name: 'Map before tee',
      reps: '18 holes reading the map before arriving at each tee',
      body:
        'For a whole round, read each hole’s map while walking to it and form a plan before you can see the hole. Then check the plan against the reality. You will find the map tells you most of what you needed, and the habit transfers directly to playing somewhere new.',
    },
  },

  'reading-elevation-changes': {
    why:
      'Elevation is the most commonly misjudged thing on a course. Uphill holes play significantly longer than their stated distance and downhill ones considerably shorter, and discs behave differently in both. Getting it wrong is how a well-thrown shot finishes forty feet from where it was aimed.',
    how: [
      'Uphill: the hole plays longer than the number on the sign. Take more disc or more power, and give the shot extra height.',
      'Uphill: expect the disc to fade earlier, because it reaches its slow phase sooner against the slope.',
      'Downhill: the hole plays shorter. The disc stays in the air longer, fades harder at the end and skips further when it lands.',
      'Downhill: throw a more understable disc or a flatter angle, because the extra airtime gives the fade more time to work.',
      'Elevated baskets need height and power together. A shot that arrives at basket height from below has already stopped climbing and will drop short.',
    ],
    wrong: [
      {
        fault: 'Throwing the signed distance on an uphill hole.',
        fix: 'Add to it. A 250-foot uphill hole plays like 290 or more depending on the slope.',
      },
      {
        fault: 'Forgetting that a downhill disc fades harder.',
        fix: 'Extra airtime means extra fade. Aim further right for a right-handed backhand, or throw something more understable.',
      },
      {
        fault: 'Ignoring the skip on a downhill landing.',
        fix: 'A disc landing on a downslope runs a long way. Plan to land it short of where you want it to stop.',
      },
    ],
    drill: {
      name: 'Pace the slope',
      reps: '10 throws each on an uphill and a downhill hole',
      body:
        'Find one uphill and one downhill hole and throw ten on each with the disc you would normally use. Pace out how far short or long you finish against the signed distance. Those two numbers are your personal elevation adjustment and they are worth more than any general rule.',
    },
  },

  'playing-in-rain': {
    why:
      'Rain changes grip, flight and ground all at once, and the players who score well in it are the ones who simplified rather than the ones who threw well. A wet round rewards preparation and conservatism far more than it rewards skill.',
    how: [
      'Keep towels dry. Carry at least two, keep the spare sealed in a bag, and dry the disc immediately before every throw.',
      'Use grippier plastic. Base plastic putters hold far better in the wet than premium ones.',
      'Throw more hyzer and simplify your shot selection. Wet discs slip and release early, which turns over anhyzers and flat shots.',
      'Expect no skip. Wet ground stops a disc roughly where it lands, which actually makes approach distance easier to judge.',
      'Keep your grip pressure slightly firmer than usual and accept a little less distance for a lot more control.',
    ],
    wrong: [
      {
        fault: 'Throwing with a wet flight plate.',
        fix: 'Dry it every single throw. A slipped release in the rain looks exactly like a form fault and is not one.',
      },
      {
        fault: 'Using one towel until it is soaked.',
        fix: 'Two towels, the spare kept dry inside a bag or under an umbrella. A wet towel does nothing.',
      },
      {
        fault: 'Playing the same aggressive lines as in the dry.',
        fix: 'Simplify. Rain is a round for safe, stable shots and accepting pars.',
      },
    ],
    drill: {
      name: 'Play one wet round on purpose',
      reps: '9 holes in the rain, drying the disc before all 9 tee shots',
      body:
        'Go out deliberately in light rain and play nine holes with a strict towel routine on every throw. You are rehearsing the handling as much as the shots, and the first time you do it in a competition should not be the first time you have done it.',
    },
  },

  'playing-into-wind-all-angles': {
    why:
      'Each wind direction does something different and the effects are not symmetrical. Knowing which is which turns wind from a source of random results into another variable you plan around — and since most players never practise in it, it is one of the largest edges available.',
    how: [
      'Headwind: the extra airspeed gives more lift and makes a disc behave understable, so it wants to turn over and get knocked down. Throw overstable, keep it low, keep the nose down.',
      'Tailwind: less airspeed means less lift, so the disc behaves overstable, drops sooner and fades harder. Throw understable, add height, expect less distance than it feels like you should get.',
      'Crosswind from your throwing side: it will push the disc away and tend to lift that edge. Aim into it and choose a disc that finishes into it.',
      'Crosswind from the other side: it pushes the disc the other way and can flatten a hyzer out. Allow for drift in that direction.',
      'In all four, keep the line lower than usual. Height is the single biggest multiplier on everything wind does.',
    ],
    wrong: [
      {
        fault: 'Assuming a tailwind helps.',
        fix: 'It removes lift and brings the fade forward. It is as likely to cost distance as to add it.',
      },
      {
        fault: 'Throwing high in wind to get more distance.',
        fix: 'Height is exposure. In strong wind the lower line almost always finishes further and far more predictably.',
      },
      {
        fault: 'Making one adjustment and applying it to every wind direction.',
        fix: 'They are genuinely different. Overstable into a headwind is right; overstable in a tailwind makes it worse.',
      },
    ],
    drill: {
      name: 'All four directions',
      reps: '10 throws in each of 4 directions (40 total), one disc',
      body:
        'One disc, one windy day, ten throws into the wind, ten with it, and ten across it from each side. Note the finish of each group against your aim. This produces a personal reference table that is more use than any general advice, because it is measured with your arm and your disc.',
    },
  },

  'position-play-not-basket': {
    why:
      'On a hole you cannot reach, going for it anyway is a decision that looks ambitious and plays badly. A planned lay-up to your best putting distance converts a long hole into a routine par; an unplanned one leaves you somewhere awkward with the same number of throws gone.',
    how: [
      'Decide early in the hole whether it is reachable for you. Be honest — reachable means reachable most of the time, not on your best throw.',
      'If it is not, pick the distance you putt best from and lay up to exactly that.',
      'Lay up to the side that leaves a straight, uphill putt rather than a sidehill or downhill one.',
      'Take the guaranteed par-save spot when the hole offers one. A certain 3 beats a possible 2 and a likely 4.',
      'Never attempt a shot in this situation that you have not practised. A long hole is the worst place to try something new.',
    ],
    wrong: [
      {
        fault: 'Going for a basket you reach one time in five.',
        fix: 'The other four times you are scrambling. Lay up and take the par that was always available.',
      },
      {
        fault: 'Laying up to a vague distance rather than your best one.',
        fix: 'A lay-up should finish where you practise from. Otherwise you have swapped one difficult shot for another.',
      },
      {
        fault: 'Deciding to lay up only after the drive went badly.',
        fix: 'Decide on the tee. A plan made mid-hole in disappointment is not a plan.',
      },
    ],
    drill: {
      name: 'Lay up on purpose',
      reps: '9 long holes laying up to your best putting distance every time',
      body:
        'Play nine holes you cannot reach and lay up deliberately to your favourite putting distance on every one. Count the pars. For most players the number is higher than when they go for it, and seeing that written down is what makes the habit stick.',
    },
  },

  'managing-double-bogey-hole': {
    why:
      'Big numbers come from sequences, not from single shots. One throw into trouble is a bogey at worst; it becomes a double or a triple when the next decision is made in frustration rather than in arithmetic. Breaking that sequence is probably the largest single scoring gain available to an average player.',
    how: [
      'Recognise the moment. The throw after a bad one is the dangerous one, and knowing that is most of the defence.',
      'Stop and take a breath before choosing anything. Thirty seconds is enough to get the decision out of the emotion.',
      'Decide what score you will accept on this hole now, and play the shots that guarantee it.',
      'Take the safest route back to a clean lie, however unambitious.',
      'Treat the next throw as its own shot with its own plan, rather than as part of a rescue.',
    ],
    wrong: [
      {
        fault: 'Throwing immediately after the bad shot while still annoyed.',
        fix: 'Wait. The urge to put it right at once is exactly what turns one mistake into three.',
      },
      {
        fault: 'Trying to get the stroke back on this hole.',
        fix: 'It is gone. The only question left is whether you lose one more or three more.',
      },
      {
        fault: 'Escalating the risk as the hole gets worse.',
        fix: 'Each throw should be the SAFEST sensible one, and more so as the number climbs. The usual instinct runs the opposite way.',
      },
    ],
    drill: {
      name: 'The next shot rule',
      reps: '1 round pausing 30 seconds after every bad shot',
      body:
        'For one round, after any throw you are unhappy with, stop and count thirty seconds before you even choose a disc. Note at the end how many holes could have become big numbers and did not. The pause is the whole technique and it costs nothing but the time.',
    },
  },

  'playing-unfamiliar-courses': {
    why:
      'Playing somewhere new is where good players lose strokes to bad information rather than to bad throws. Everything on an unknown hole is uncertain — the length, the trouble, where a miss finishes — and the right response to uncertainty is conservatism and a few minutes of looking.',
    how: [
      'Read the map or the sign on every hole before you tee, and walk up the fairway when the hole is blind.',
      'Find the OB and the trouble first. Knowing where you cannot be matters more than knowing where the basket is.',
      'Identify the safe miss on each hole and aim so that a miss goes there.',
      'Favour control discs. On an unknown hole the predictable shot is worth far more than the long one.',
      'Accept pars. A first round somewhere new is reconnaissance; the score comes the second time.',
    ],
    wrong: [
      {
        fault: 'Teeing off on a blind hole without looking.',
        fix: 'Walk up. Two minutes of looking is cheaper than the stroke you are about to guess away.',
      },
      {
        fault: 'Throwing your longest disc because the hole looks open from the pad.',
        fix: 'Open from the tee tells you nothing about the last hundred feet. Control disc until you have seen the hole.',
      },
      {
        fault: 'Expecting to score your usual number.',
        fix: 'Play it as information gathering. The familiar-course score comes from knowing the course, which you do not yet.',
      },
    ],
    drill: {
      name: 'Walk the blind ones',
      reps: '1 new course, walking every blind hole before throwing',
      body:
        'Play a course you do not know and walk up every hole where you cannot see the landing zone. Note how many times what you found differed from what you would have assumed. That count is the argument for doing it every time, and it is usually higher than people expect.',
    },
  },

  // ──────────────────────────── MENTAL GAME ────────────────────────────
  'pre-shot-routine': {
    why:
      'A routine is a sequence you run so that pressure has nothing left to change. Under stress the gap between deciding and throwing stretches, the tempo quickens, and a shot you have made a thousand times comes out differently. The routine is the same on hole 1 and hole 18, which is the entire point of having one.',
    how: [
      'Decide everything behind your lie: the line, the disc, the power, the landing spot.',
      'Rehearse the shot once, at the pace you will actually throw it.',
      'Step in the same way every time, same foot first, same stance.',
      'Take one breath out.',
      'Throw. No pause between the rehearsal and the shot, because that pause is where the tempo goes.',
      'Hold the finish until the disc lands, then step away.',
    ],
    wrong: [
      {
        fault: 'Only using it on shots that feel important.',
        fix: 'Use it on every throw including tap-ins. A routine you have never run under pressure is not a routine, it is an intention.',
      },
      {
        fault: 'Rehearsing at a different speed from the real throw.',
        fix: 'A gentle practice motion before a hard throw rehearses the wrong shot. Match the pace.',
      },
      {
        fault: 'Re-deciding once you are in your stance.',
        fix: 'Step all the way off and start again from behind the lie. Deciding twice is how both the line and the tempo go.',
      },
      {
        fault: 'Letting the routine get longer when you are nervous.',
        fix: 'Count it. The number of rehearsals is fixed, and knowing the number is what stops it creeping.',
      },
    ],
    drill: {
      name: 'Every single throw',
      reps: '1 full round with the routine on all 18 holes, tap-ins included',
      body:
        'One round, no exceptions, the full routine on every throw however trivial. It will feel pedantic for the first few holes. By hole 18 it will be automatic, and that is the state you want it in before it matters.',
    },
  },

  'staying-present-focus': {
    why:
      'You can only throw the shot in front of you, and attention spent on the last hole or the running total is attention not spent on this one. The practical problem is not knowing that — everybody knows that — it is having something to do with your attention instead.',
    how: [
      'Give your attention a job: the aim point, the line, the feel of the grip. Something specific and present.',
      'Use the walk between shots as the off switch. Think about whatever you like while walking; switch on at the lie.',
      'Breathe out slowly before you step in. A long exhale is the fastest physical route to a calmer head.',
      'Notice when you have drifted and come back without annoyance. Drifting is normal; staying gone is the problem.',
      'Do not check the running total mid-round unless the format genuinely requires it.',
    ],
    wrong: [
      {
        fault: 'Trying to stop thinking about the score.',
        fix: 'That does not work, in the same way that not thinking of something never works. Replace it with the aim point rather than suppressing it.',
      },
      {
        fault: 'Being hard on yourself for losing focus.',
        fix: 'Everybody drifts. The skill is the return, and treating the drift as a failure makes the return slower.',
      },
      {
        fault: 'Staying switched on for the whole round.',
        fix: 'Nobody can concentrate for three hours. Switch off between shots deliberately so you have something left at the lie.',
      },
    ],
    drill: {
      name: 'Switch on at the lie',
      reps: '1 round, deliberately switching off between every shot',
      body:
        'For one round, give yourself explicit permission to think about anything at all while walking, and then switch on when you reach your lie. Most players find they concentrate better in the moments that matter and finish the round less tired, which is the argument for doing it.',
    },
  },

  'managing-frustration-bad-shot': {
    why:
      'Anger after a bad throw is normal and is not the problem. The problem is that it reliably costs you the NEXT throw as well, because a frustrated decision is a worse decision and a tense body throws worse. One bad shot is a bogey; one bad shot plus the reaction is a double.',
    how: [
      'Let the reaction happen. Give it a few seconds rather than pretending it is not there.',
      'Then put a physical marker on the end of it: a breath out, picking up your bag, taking three steps. A deliberate action that signals the reaction is over.',
      'Switch attention to the next decision, which is a concrete problem with a concrete answer.',
      'Go back to your routine. It is a sequence, which gives a disturbed mind something to follow.',
      'Judge yourself on the process rather than the outcome. You cannot control whether a disc catches a branch.',
    ],
    wrong: [
      {
        fault: 'Throwing the next shot immediately while still angry.',
        fix: 'Wait. The urge to put it right at once is exactly what turns one mistake into two.',
      },
      {
        fault: 'Suppressing the reaction entirely.',
        fix: 'Suppressed frustration leaks into the next three holes. Feel it briefly, mark its end, move.',
      },
      {
        fault: 'Taking more risk to win the stroke back.',
        fix: 'The stroke is gone and the odds have not changed. Chasing is the most expensive habit in the sport.',
      },
      {
        fault: 'Replaying the shot while walking to it.',
        fix: 'Give yourself one review, then genuinely stop. Walking is for switching off, not for a post-mortem.',
      },
    ],
    drill: {
      name: 'Mark the end',
      reps: '1 round with a fixed physical reset after every bad shot',
      body:
        'Pick one deliberate action — a breath out and a tug on your bag strap, anything — and do it after every throw you are unhappy with, for a whole round. It sounds trivial. It works because it converts a vague feeling into a thing with a definite end.',
    },
  },

  'bounce-back-playing-next-shot': {
    why:
      'The throw immediately after a bad one is the most expensive throw in disc golf. It is taken by somebody annoyed, often from an awkward position, and it is the one most likely to be a hero attempt. Making that single throw reliably boring is worth more strokes than almost anything else you could work on.',
    how: [
      'Treat it as a shot in its own right with its own plan, not as part of a rescue.',
      'Pick the highest-percentage option available, which usually means the shortest safe one.',
      'Decide what score you will accept on this hole, then play the shots that guarantee it.',
      'Run your full routine on it. This is the throw that most needs the structure.',
      'Accept that it will often be unambitious. A dull next shot is what stops a bad hole becoming a terrible one.',
    ],
    wrong: [
      {
        fault: 'Attempting the shot that would undo the mistake.',
        fix: 'If it works you are level; if it fails you are two worse. Count how often it works before you reach for it.',
      },
      {
        fault: 'Rushing it because you want the hole over.',
        fix: 'Slow down deliberately. The wish for the hole to end is what makes the next number bigger.',
      },
      {
        fault: 'Skipping the routine because the shot is a recovery.',
        fix: 'Recovery shots are exactly where a routine earns its keep. Run it.',
      },
    ],
    drill: {
      name: 'The boring next shot',
      reps: '1 round always taking the safest option after a bad throw',
      body:
        'For one round, after any throw you are unhappy with, you must take the safest available next shot — no exceptions, no judgement calls. Compare the score to your usual. The number is the argument, because the instinct will not accept anything else.',
    },
  },

  'confidence-calibration': {
    why:
      'Confidence and ability should match. Too little and you lay up from distances you make; too much and you attempt shots you hit once in five. Both cost strokes, and the second costs more. The point is not to be confident — it is to be accurate about what you can actually do.',
    how: [
      'Count what you make in practice, by distance and by shot type. Real numbers, written down.',
      'Attempt in a round only what you make in practice at a decent rate. For most shots that means better than half.',
      'Know that your numbers drop under pressure, so keep a margin rather than throwing to the edge of your range.',
      'Build confidence by widening the range in practice, not by attempting more in rounds.',
      'Review it honestly every month. Ranges move in both directions.',
    ],
    wrong: [
      {
        fault: 'Judging your range by your best ever shot.',
        fix: 'One success is not a rate. Your range is what you do most of the time, which is a much shorter distance.',
      },
      {
        fault: 'Laying up from distances you reliably make.',
        fix: 'Under-confidence is also a leak. If the numbers say you make it, take it.',
      },
      {
        fault: 'Treating confidence as something to talk yourself into.',
        fix: 'It comes from repetitions you have actually done. There is no shortcut and pretending there is produces the overestimate.',
      },
    ],
    drill: {
      name: 'Know your real numbers',
      reps: '20 putts each at 20, 25, 30 and 35 ft (80 total)',
      body:
        'Eighty putts, four numbers, written down. The distance where you drop below about half is where "run it" stops being correct. Most players find that line is considerably shorter than they had been playing as though it was, and knowing it changes decisions immediately.',
    },
  },

  'tournament-mental-prep': {
    why:
      'Most of what goes wrong in a first tournament is not throwing, it is the day: arriving late, not knowing the format, being hungry on hole 12, and having no plan beyond "play well". All of that is preparable, and preparing it is what leaves attention available for the golf.',
    how: [
      'Know the format, the start time, the layout and where you need to be, the day before.',
      'Arrive early enough to warm up unhurried. Rushing to the first tee costs more than the extra half hour.',
      'Set process goals rather than score goals: run the routine every throw, commit to every line. Those are things you control.',
      'Pack food and water for the whole round. An energy dip at hole 12 reads exactly like losing your nerve.',
      'Walk or map the course beforehand if you can, so hole 7 is not a surprise.',
    ],
    wrong: [
      {
        fault: 'Setting a score target.',
        fix: 'You do not control the score, only the process. A target you cannot control is a stick to beat yourself with from hole 3 onward.',
      },
      {
        fault: 'Arriving with just enough time.',
        fix: 'Give yourself an hour. The whole first nine holes can be spent recovering from a rushed arrival.',
      },
      {
        fault: 'Trying something new on the day.',
        fix: 'A tournament is for executing what you have, not for experiments. Bring the discs and shots you trust.',
      },
    ],
    drill: {
      name: 'Rehearse the day',
      reps: '1 practice round played exactly as the tournament day will run',
      body:
        'Play a practice round at the same time of day, with the same warm-up, the same food, the same bag and the same routine you intend to use. You are rehearsing the day rather than the golf, and the number of small things that turn out to be unresolved is always higher than expected.',
    },
  },

  'visualization-before-the-round': {
    why:
      'Seeing a shot before you throw it gives your body a target to organise around, which is a more useful instruction than a list of mechanics. It is also the part of the routine that most reliably survives nerves, because it is a picture rather than a thought.',
    how: [
      'Picture the whole flight: the release, the shape, where it peaks, where it lands and where it finishes.',
      'Include the feel, not just the picture. What the throw feels like when it goes right is half of the rehearsal.',
      'Do it from behind the lie, looking at the actual line, rather than abstractly.',
      'Keep it brief — a few seconds. A long visualisation becomes a delay, and delay is what nerves exploit.',
      'Visualise the shot you intend, never the one you fear. Picturing the OB line is an instruction to throw at it.',
    ],
    wrong: [
      {
        fault: 'Picturing what you want to avoid.',
        fix: 'Replace the thought rather than fighting it: look at the line you want and describe it to yourself.',
      },
      {
        fault: 'Visualising only the sight and not the feel.',
        fix: 'Rehearse the physical sensation too. The body responds to that more readily than to a picture.',
      },
      {
        fault: 'Taking so long that it becomes a stall.',
        fix: 'A few seconds. If it is longer than your rehearsal motion it has become a delaying tactic.',
      },
    ],
    drill: {
      name: 'See it, feel it, throw it',
      reps: '1 round visualising every shot for 3 seconds before stepping in',
      body:
        'Three seconds of seeing the flight and feeling the throw, before every shot, for one round. The short fixed length is deliberate — it keeps it a part of the routine rather than something that expands whenever you are unsure.',
    },
  },

  'dealing-with-performance-anxiety': {
    why:
      'Nerves are a physical event: heart rate up, breathing shallow, muscles tightening, tempo quickening. That is not a character problem and it does not go away with experience — good players are nervous too. What they have is a way of working while it is happening.',
    how: [
      'Slow the breathing out. A long exhale is the most reliable physical lever on a fast heart rate.',
      'Point your attention outward at the target rather than inward at how you feel. Nerves grow on attention.',
      'Deliberately slow your routine, because nerves compress everything and tempo is the first casualty.',
      'Accept the feeling rather than fighting it. Fighting it adds a second problem on top of the first.',
      'Reframe it honestly: a raised heart rate before something you care about is your body getting ready, which is what it is for.',
    ],
    wrong: [
      {
        fault: 'Trying to calm down before throwing.',
        fix: 'You will usually not manage it, and waiting makes it worse. Throw while nervous, slowly and with your routine.',
      },
      {
        fault: 'Treating nerves as evidence you are not ready.',
        fix: 'Everybody has them. They mean the thing matters, which is the reason you entered.',
      },
      {
        fault: 'Speeding up to get the shot over with.',
        fix: 'This is the most common and the most costly. Make the routine deliberately slower than usual.',
      },
      {
        fault: 'Only ever practising calm.',
        fix: 'Practise with stakes and with people watching, so the feeling itself is familiar rather than novel.',
      },
    ],
    drill: {
      name: 'Throw it nervous',
      reps: '10 putts from 25 ft after 20 press-ups, with somebody watching',
      body:
        'Raise your heart rate deliberately, then putt with someone watching. You are rehearsing the physical state rather than the stroke. The point is not to make the nerves go away — it is to have thrown well while they were there, so the next time is not the first time.',
    },
  },

  'bouncing-back-bad-hole': {
    why:
      'A big number on one hole costs you that hole. It costs you the round only if you carry it to the next tee. Players who score consistently are not the ones who avoid the bad hole, they are the ones for whom the hole after a 6 looks exactly like any other hole.',
    how: [
      'Finish the hole, then draw a line under it on the walk to the next tee.',
      'Use the walk deliberately: one short review of what went wrong, then genuinely done.',
      'Run your normal routine on the next tee, unaltered. The temptation is to do something different, and something different is the mistake.',
      'Play the next hole as it deserves, not as compensation. A par 3 does not become a birdie hole because you just took a 6.',
      'Remember the arithmetic: one double is recoverable over eighteen holes; three is not, and the second and third come from chasing the first.',
    ],
    wrong: [
      {
        fault: 'Attacking the next hole to make the strokes back.',
        fix: 'The next hole has the same odds it always had. Chasing is how one bad hole becomes a bad round.',
      },
      {
        fault: 'Changing your routine, your disc or your style after a bad hole.',
        fix: 'Change nothing. One hole is not evidence of anything about your game.',
      },
      {
        fault: 'Mentally totalling the round from the bad hole onward.',
        fix: 'Arithmetic about the final score is not a shot. Go back to the line, the aim point and the next throw.',
      },
    ],
    drill: {
      name: 'Line under it',
      reps: '1 round, one 10-second review per bad hole and then done',
      body:
        'After any hole you are unhappy with, give yourself exactly ten seconds of review on the walk, then deliberately switch to the next hole. Count at the end of the round how many times a bad hole was followed by another. That count is what this is for, and it drops quickly.',
    },
  },

  'playing-with-lead-behind': {
    why:
      'Being ahead and being behind both change how people play, and usually for the worse: a lead makes players defensive and tight, a deficit makes them reckless. The scoreboard does not change the odds on any individual shot, and playing as though it does is how leads get lost.',
    how: [
      'With a lead, keep taking the shots you would otherwise take. Freezing up is how a lead becomes a tie.',
      'With a lead, do tighten on genuinely marginal decisions — but only those. There is a difference between playing sensibly and playing scared.',
      'Behind, be patient. Strokes come back over holes, not on one hero shot, and the hero shot usually makes it worse.',
      'Behind, take the good risks when the miss is cheap. That is a real adjustment and it is not the same as forcing.',
      'Either way, run the same routine. The routine is the thing that should not know the score.',
    ],
    wrong: [
      {
        fault: 'Playing not to lose when ahead.',
        fix: 'Defensive play is still a change of strategy, and an unrehearsed one. Keep playing your game.',
      },
      {
        fault: 'Forcing low-percentage shots when behind.',
        fix: 'They are still low percentage. Patience and the occasional good risk closes gaps; desperation widens them.',
      },
      {
        fault: 'Watching the scoreboard mid-round.',
        fix: 'Check it when the format requires and otherwise not at all. It cannot improve a single decision you are about to make.',
      },
    ],
    drill: {
      name: 'Play the hole, not the board',
      reps: '1 competitive round without checking the leaderboard until the end',
      body:
        'Play a whole round — a league night, a doubles round, anything with a score that matters — without looking at where you stand until it is over. Notice how many decisions you would have made differently, and whether any of them would have been better.',
    },
  },

  'focus-when-partner-struggling': {
    why:
      'You will regularly share a card with somebody having a bad day, and frustration is contagious. Their slow play, their muttering and their mood all land on your round unless you have something in place. This is a skill, and it is mostly about having a bubble rather than about being unaffected.',
    how: [
      'Run your own routine regardless. It is the thing that keeps your tempo yours rather than the card’s.',
      'Stand somewhere settled while others throw, and use the time for your own next shot.',
      'Be decent to them and then let it go. Sympathy does not require absorbing the mood.',
      'Keep your own pace even if the card slows. If waiting is long, stay loose and go through your own plan.',
      'Resist comparing your round to theirs, in either direction.',
    ],
    wrong: [
      {
        fault: 'Absorbing somebody else’s frustration.',
        fix: 'Notice it happening, which is most of the defence, and go back to your routine.',
      },
      {
        fault: 'Trying to coach a card-mate mid-round.',
        fix: 'It rarely helps and it takes you out of your own round. Unless they ask, leave it.',
      },
      {
        fault: 'Letting a slow card make you rush when it is your turn.',
        fix: 'Your tempo is yours. Take the same time you always take.',
      },
    ],
    drill: {
      name: 'Your own bubble',
      reps: '1 round with a full routine on every shot regardless of the card',
      body:
        'Play a round with a group and commit to running your complete routine on every throw whatever is happening around you — rushed, slow, loud, grumpy. The routine is the bubble, and this is the round where you find out whether yours is solid.',
    },
  },

  'manage-expectations-weakest-discs': {
    why:
      'Everybody has shots they hit about half the time. Treating those as reliable is how rounds blow up, and treating them as impossible leaves strokes on the course. Knowing which of your shots are coin flips, specifically, is what lets you plan around them instead of being surprised by them.',
    how: [
      'List your shots honestly and mark each one: reliable, about half, or a long shot.',
      'On the half-and-below shots, aim for the safe outcome rather than the best one.',
      'Plan holes so that your weak shots are not required. Often a different line turns a 50/50 into a routine shot.',
      'Practise the weak ones deliberately, which is where they stop being weak.',
      'Re-assess monthly. The list moves, and an out-of-date list is as misleading as no list.',
    ],
    wrong: [
      {
        fault: 'Planning a hole around a shot you hit half the time.',
        fix: 'Find the route that uses your reliable shots. There usually is one, and it is usually a stroke cheaper.',
      },
      {
        fault: 'Avoiding weak shots entirely, including in practice.',
        fix: 'Avoid them in rounds and seek them out in practice. That is how the list changes.',
      },
      {
        fault: 'Assuming a shot you hit in practice transfers immediately.',
        fix: 'Practice rates drop under pressure. Give yourself a margin before promoting a shot to reliable.',
      },
    ],
    drill: {
      name: 'Mark the list',
      reps: '10 attempts at each of your 5 least certain shots (50 total)',
      body:
        'Pick five shots you are unsure about, throw ten of each, and write the make rate beside them. You now have a factual list rather than an impression — and on the course it tells you instantly whether the shot you are considering is one you own.',
    },
  },

  // ─────────────────────── FITNESS & WARMUP ───────────────────────
  // Nothing in this category is medical advice. Where something hurts, the
  // instruction is to stop and get it looked at properly rather than to
  // self-diagnose from a lesson in a disc golf app.
  'five-minute-dynamic-warmup': {
    why:
      'A disc golf throw is a fast rotational movement through a big range, and a cold shoulder is poorly equipped for it. Five minutes before the first tee both reduces the chance of a strain and measurably improves the first few holes, which are otherwise spent warming up at the cost of strokes.',
    how: [
      'Arm circles, both directions, gradually bigger — about 30 seconds.',
      'Trunk rotations with the arms loose, letting them swing around you — 30 seconds.',
      'Leg swings forward and back, then side to side, holding something for balance — 30 seconds each leg.',
      'Hip openers: slow lunges with a gentle rotation toward the front leg.',
      'Then throw: ten easy putts, a few soft midranges, and build to full power over five or six throws.',
      'Keep it dynamic — moving stretches rather than held ones, which belong after the round rather than before.',
    ],
    wrong: [
      {
        fault: 'Going straight to full-power drives on hole 1.',
        fix: 'Build up over several throws. The first full-effort throw of the day is where strains happen.',
      },
      {
        fault: 'Long static stretches before throwing.',
        fix: 'Save held stretches for afterwards. Before throwing you want the body moving and warm, not lengthened and relaxed.',
      },
      {
        fault: 'Skipping it when running late.',
        fix: 'That is exactly when it is needed, and five minutes is almost always available. Shorten it rather than dropping it.',
      },
    ],
    drill: {
      name: 'Five minutes, every round',
      reps: '5 minutes before every round: 2 min mobility, 3 min building throws',
      body:
        'Two minutes of arm circles, trunk rotations and leg swings, then three minutes of throws building from easy putts to full power. Do it before every round for a month and compare how your first three holes go against your memory of them.',
    },
  },

  'balance-stability': {
    why:
      'A throw is generated against the ground, and the brace on the front leg is where the energy turns into disc speed. If that leg is unstable the body compensates by standing up or spinning off, both of which cost distance and accuracy. Balance work is the least glamorous distance training there is and among the most effective.',
    how: [
      'Train single-leg balance: stand on one leg for 30 seconds, then with eyes closed, then on an unstable surface.',
      'Add movement: single-leg reaches, where you balance on one leg and reach forward and down with the opposite hand.',
      'Train the core against rotation as well as in it — holds that resist being twisted build the stiffness a brace needs.',
      'Practise standstill throws, which expose balance faults immediately.',
      'Hold your finish after every throw. If you cannot, balance is the thing to work on.',
    ],
    wrong: [
      {
        fault: 'Working on balance only while standing still.',
        fix: 'Add movement and load. A throw tests balance while you are moving fast, not while you are standing on one leg in a kitchen.',
      },
      {
        fault: 'Assuming poor balance in the throw is a technique fault.',
        fix: 'Often it is a capacity fault. If you cannot hold a single-leg stance for 30 seconds, no technique cue will fix the brace.',
      },
      {
        fault: 'Training only the throwing-side leg.',
        fix: 'Both. Asymmetry is common in rotational sports and it is worth not making it worse.',
      },
    ],
    drill: {
      name: 'Thirty seconds a side',
      reps: '3 x 30 seconds single-leg balance per side, 4 days a week',
      body:
        'Three sets of thirty seconds on each leg, eyes closed once the eyes-open version is easy. It takes three minutes and can be done while the kettle boils. Then test it where it matters: hold your finish after twenty throws and count how many you can hold.',
    },
  },

  'hip-mobility': {
    why:
      'The throw rotates through the hips, and hips that do not rotate freely force the rotation somewhere else — usually the lower back, which is neither built for it nor forgiving about it. Mobility here buys distance and is the single most protective thing most throwers can do.',
    how: [
      'Work on rotation specifically: seated or standing hip rotations through the full available range.',
      'Open the hip flexors, which shorten with sitting and limit how far you can extend through a throw.',
      'Do a little most days rather than a lot occasionally. Mobility responds to frequency more than to duration.',
      'Work both sides equally even though the throw is one-sided.',
      'Move slowly and stop short of pain. Mobility work should feel like range, not like strain.',
    ],
    wrong: [
      {
        fault: 'Stretching hard once a week.',
        fix: 'Ten minutes most days beats an hour on Sunday. Frequency is what changes range.',
      },
      {
        fault: 'Pushing into pain to get more range.',
        fix: 'Stop short of it. Pain is not the mechanism and pushing through it is how a mobility session becomes an injury.',
      },
      {
        fault: 'Assuming lower-back soreness after throwing is normal.',
        fix: 'It is common and that is not the same as normal. Often it is the hips not rotating — and if it persists, get it looked at properly.',
      },
    ],
    drill: {
      name: 'Ten minutes, most days',
      reps: '10 minutes of hip mobility, 5 days a week for 4 weeks',
      body:
        'Ten minutes, five days a week, both sides, moving slowly through the range you have rather than forcing a bigger one. Four weeks is enough to notice, both in how far you can rotate and in how your back feels after a round.',
    },
  },

  'building-training-routine': {
    why:
      'Training that is not planned defaults to whatever is most enjoyable, which for almost everybody is throwing drivers. A routine is a decision made in advance about where the time goes, and its main job is making sure the unglamorous parts actually happen.',
    how: [
      'Split the week deliberately: putting most days, approaches twice, field work once, strength and mobility two or three times.',
      'Keep sessions short. Thirty focused minutes beats two distracted hours and is far more likely to happen again on Thursday.',
      'Give every session one goal, named before you start.',
      'Write down one number per session so you can tell whether it is working.',
      'Build in rest. A week with no recovery day is a week that ends with a sore shoulder.',
    ],
    wrong: [
      {
        fault: 'Planning an ambitious schedule you will not keep.',
        fix: 'Plan what you will actually do. Three honest half-hours beat a seven-day plan abandoned on Wednesday.',
      },
      {
        fault: 'Spending most of the time on the enjoyable parts.',
        fix: 'Keep some of it, because training you dislike does not happen — but weight the time toward putting and approaches.',
      },
      {
        fault: 'No rest days.',
        fix: 'Schedule them. Improvement happens during recovery, and throwing volume without rest is how overuse injuries start.',
      },
    ],
    drill: {
      name: 'Write the week',
      reps: '1 written week, repeated 4 times',
      body:
        'Write down an honest week — which days, how long, what each session is for — and run it four times. At the end you will have both a habit and a month of numbers, which is enough to see what is working and to adjust the next month on evidence.',
    },
  },

  'injury-prevention': {
    why:
      'The injuries that end disc golf seasons are nearly all overuse: shoulder, elbow and lower back, built up over weeks of throwing hard without warming up or resting. They are largely preventable, and the prevention is unexciting enough that most people skip it until the first time they cannot throw.',
    how: [
      'Warm up before every session and every round, without exceptions.',
      'Build throwing volume gradually. A sudden jump from one session a week to four is how elbows start hurting.',
      'Strengthen the shoulder and upper back, which take the load a throw puts through them.',
      'Keep the hips mobile so the lower back is not doing the rotating.',
      'Treat early soreness as information. Back off for a few days rather than throwing through it.',
      'If something hurts beyond ordinary soreness, or keeps coming back, get it looked at by a professional rather than diagnosing it yourself.',
    ],
    wrong: [
      {
        fault: 'Throwing through pain because it is only mild.',
        fix: 'Mild and persistent is how overuse injuries announce themselves. Rest it early, when a few days is enough.',
      },
      {
        fault: 'A big jump in throwing volume.',
        fix: 'Increase gradually. Most throwing injuries arrive a couple of weeks after a sudden increase.',
      },
      {
        fault: 'Warming up only before competitive rounds.',
        fix: 'Every time. Your shoulder does not know it is a casual round.',
      },
      {
        fault: 'Working on strength and skipping mobility.',
        fix: 'Both. Strength without range just loads a restricted joint harder.',
      },
    ],
    drill: {
      name: 'Warm up every time',
      reps: '5-minute warm-up before 100% of sessions, for 1 month',
      body:
        'The drill is the habit: five minutes before every single session and round for a month, with no exceptions made for being in a hurry. Count the exceptions at the end. The target is zero, and this is the cheapest insurance available on a throwing arm.',
    },
  },

  'recovery-rest-days': {
    why:
      'Improvement happens between sessions, not during them. Throwing every day without recovery produces fatigue, worse form and eventually an injury — and because the decline is gradual it is easy to mistake for a technique problem and to respond by throwing more.',
    how: [
      'Schedule rest days deliberately rather than taking them when you feel wrecked.',
      'Prioritise sleep, which is where most physical recovery actually happens.',
      'Stay hydrated, particularly across a hot tournament day where a round is several hours outdoors.',
      'Use light mobility on off days — gentle movement helps more than complete stillness.',
      'Treat an unusually bad session as possible fatigue rather than as a sudden loss of ability.',
    ],
    wrong: [
      {
        fault: 'Responding to a bad session by practising more.',
        fix: 'Check your rest first. Fatigue and a form fault look identical from the inside and have opposite cures.',
      },
      {
        fault: 'Taking rest days only when something hurts.',
        fix: 'By then it is late. Plan them in, the same way you plan sessions.',
      },
      {
        fault: 'Treating a rest day as complete inactivity.',
        fix: 'Light mobility or a walk is better than nothing at all. Rest from throwing, not from moving.',
      },
    ],
    drill: {
      name: 'Two planned rest days',
      reps: '2 scheduled rest days per week for 4 weeks',
      body:
        'Put two rest days in the week before the week starts, and keep them even when you feel fine — especially then. Note your practice numbers across the month. Most people find they go up, which is a difficult thing to believe until you have the numbers.',
    },
  },

  'building-disc-golf-strength': {
    why:
      'The strength that matters for throwing is rotational and explosive, not maximal. Being able to lift a heavy weight slowly has little to do with how fast you can rotate, which is why a lot of general gym work transfers poorly while a small amount of specific work transfers well.',
    how: [
      'Train rotation explosively: medicine-ball throws against a wall, rotating from the hips rather than the arms.',
      'Train the legs, which generate the force everything else transmits. Squats, lunges and single-leg work.',
      'Train the core to resist rotation as well as produce it — the brace depends on stiffness.',
      'Train for speed rather than load on the rotational work. Light and fast beats heavy and slow for this.',
      'Keep it to two or three sessions a week and leave recovery time before a throwing session.',
    ],
    wrong: [
      {
        fault: 'Heavy, slow lifting and expecting distance.',
        fix: 'Throwing is a speed event. Explosive and light transfers; grinding heavy singles mostly does not.',
      },
      {
        fault: 'Training arms and shoulders for distance.',
        fix: 'Distance comes from the legs and the rotation. Train the shoulder for durability, not for power.',
      },
      {
        fault: 'Lifting hard the day before a tournament.',
        fix: 'Leave a clear gap. Fatigue costs more than the session gains at that point.',
      },
      {
        fault: 'Adding strength work on top of an already full throwing week.',
        fix: 'Total load is what injures people. Add it in place of something, not on top of everything.',
      },
    ],
    drill: {
      name: 'Rotational throws',
      reps: '3 x 8 medicine-ball rotational throws per side, 2 days a week',
      body:
        'Three sets of eight each side against a wall, as fast as you can while staying controlled, rotating from the hips. Two sessions a week with recovery before your throwing days. This is the single most transferable gym exercise for a disc golf throw.',
    },
  },

  'pre-round-stretching': {
    why:
      'What you do in the ten minutes before the first tee decides how holes 1 to 3 go and how your shoulder feels on hole 18. The important distinction is dynamic versus static: moving the joints through their range before throwing, and saving the held stretches for afterwards.',
    how: [
      'Arm circles in both directions, building from small to large.',
      'Trunk rotations with loose arms, letting them wrap around you.',
      'Leg swings front to back and side to side, holding something for balance.',
      'Shoulder dislocates or wall slides, gently, to open the upper back.',
      'Finish with throws: putts first, then midranges, building to full power over several throws.',
    ],
    wrong: [
      {
        fault: 'Long held stretches before throwing.',
        fix: 'Dynamic before, static after. Held stretching immediately before explosive movement is not what you want.',
      },
      {
        fault: 'Stretching but not throwing before hole 1.',
        fix: 'The build-up throws are the most important part. The first full-power throw should not be a tee shot that counts.',
      },
      {
        fault: 'The same routine regardless of the weather.',
        fix: 'Cold days need longer. Add a few minutes and a few more build-up throws.',
      },
    ],
    drill: {
      name: 'The ten-minute version',
      reps: '10 minutes before a round: 4 min mobility, 6 min building throws',
      body:
        'Four minutes of dynamic mobility and six minutes of throws building from putts to full power. Run it before every round for a month. The holes you usually spend warming up into are the ones that get better, and those are strokes.',
    },
  },

  'core-strength': {
    why:
      'The core is what connects the legs to the arm, and a throw is only as strong as that connection. Its job in a throw is as much about resisting movement as producing it: the brace needs a trunk stiff enough to transmit rotation rather than absorb it.',
    how: [
      'Train anti-rotation as well as rotation — holds where you resist being twisted build exactly the stiffness a brace needs.',
      'Train the whole trunk, front, back and sides, rather than just the front.',
      'Include rotational work at speed, such as medicine-ball throws, since that is the pattern the throw uses.',
      'Keep sessions short and frequent. The core responds well to regular moderate work.',
      'Breathe and brace rather than holding your breath. A braced trunk is a stiff one, not a held one.',
    ],
    wrong: [
      {
        fault: 'Thinking of core work as sit-ups.',
        fix: 'Flexion is the least relevant pattern for throwing. Anti-rotation and rotation are what matter.',
      },
      {
        fault: 'Training only the front.',
        fix: 'The back and sides do most of the work in a rotational sport. Train all of it.',
      },
      {
        fault: 'High volume, poor quality.',
        fix: 'Short sets with real tension beat long sets done sloppily, and they are far kinder to the lower back.',
      },
    ],
    drill: {
      name: 'Anti-rotation holds',
      reps: '3 x 20 seconds per side, 3 days a week',
      body:
        'Hold a resisted position where something is trying to twist you and you refuse to let it — a band or cable held at chest height, arms extended, standing side-on. Three sets of twenty seconds each side. It is far harder than it sounds and it is the pattern a brace actually uses.',
    },
  },

  'shoulder-arm-care': {
    why:
      'The throwing shoulder takes the most load and complains first, and shoulder problems are the most common reason players lose months rather than days. Nearly all of it is volume and preparation rather than bad luck, which means nearly all of it is manageable.',
    how: [
      'Strengthen the rotator cuff and the upper back, which support and decelerate the shoulder through a throw.',
      'Warm the shoulder specifically before throwing, not just the body generally.',
      'Manage volume. Count your full-power throws and increase gradually rather than in jumps.',
      'Build up within a session too — the first throws should be easy ones.',
      'Treat a sore elbow or shoulder as a signal to back off for a few days, and if it persists or is sharp, get it assessed properly rather than working from advice in an app.',
    ],
    wrong: [
      {
        fault: 'Throwing hard through shoulder soreness.',
        fix: 'Back off early. A few days now is a far better trade than several weeks later.',
      },
      {
        fault: 'A big jump in throwing volume — a weekend of three rounds after a quiet month.',
        fix: 'Build gradually. Most throwing injuries follow a sudden increase by a week or two.',
      },
      {
        fault: 'Strengthening the throwing muscles and ignoring the upper back.',
        fix: 'The upper back and cuff decelerate the arm, which is where a lot of the strain actually lands.',
      },
      {
        fault: 'Self-diagnosing a persistent problem.',
        fix: 'Pain that is sharp, or that keeps returning, needs a professional. This lesson is about prevention, not treatment.',
      },
    ],
    drill: {
      name: 'Cuff and upper back',
      reps: '3 x 12 band external rotations and 3 x 12 band pull-aparts, 3 days a week',
      body:
        'Light resistance band, three sets of twelve of each, three times a week. It takes five minutes and it is tedious. It is also the work that keeps a throwing shoulder available for the whole season, which is worth more than any single distance gain.',
    },
  },

  // ─────────────────────── RULES & ETIQUETTE ───────────────────────
  // Rules here are cited to the PDGA rule number where one applies, because a
  // confident summary of a rule is exactly the kind of thing that is wrong on
  // a detail and gets repeated. Where a rule is optional or varies by event,
  // that is stated rather than smoothed over.
  'ob-relief-rules': {
    why:
      'Out of bounds is the most common penalty in the game and the one most often taken incorrectly — usually in the player’s own favour by accident. Knowing it properly costs nothing and saves the two awkward conversations that otherwise happen: where exactly the disc went out, and what it costs.',
    how: [
      'An out-of-bounds throw costs one penalty throw (PDGA 806.02).',
      'Your next lie is within one metre of the point where the disc LAST crossed into out of bounds, measured perpendicular from the line, and no closer to the target.',
      'You may instead play from your previous lie, which still carries the same one penalty throw. Sometimes that is the better option.',
      'A disc is out of bounds only when it comes to rest out of bounds. Passing over OB ground and landing in bounds is fine.',
      'Check the local OB lines before you tee — many courses mark paths, roads or water as OB, and they vary hole by hole.',
    ],
    wrong: [
      {
        fault: 'Playing from where the disc came to rest rather than where it last crossed the line.',
        fix: 'The crossing point is what matters, and it is often a long way back. Agree it with the group before anybody moves.',
      },
      {
        fault: 'Assuming a throw that flew over OB is penalised.',
        fix: 'Only where it comes to rest counts. Over and back in is no penalty at all.',
      },
      {
        fault: 'Forgetting that the previous lie is an option.',
        fix: 'Same penalty either way. From a bad crossing point, going back is sometimes the cheaper shot.',
      },
      {
        fault: 'Not knowing the local OB before teeing.',
        fix: 'Read the sign. OB varies by hole and by event and it is the most common source of an avoidable stroke.',
      },
    ],
    drill: {
      name: 'Walk the line',
      reps: '1 round, identifying every OB line before teeing on all holes',
      body:
        'For one round, before each tee shot, say out loud where the OB is on that hole and which side the safe miss is. By the end you will know your home course’s OB properly, which is worth more over a season than almost any technical work.',
    },
  },

  'lie-improvement-foot-faults': {
    why:
      'A foot fault is the easiest penalty to avoid and the easiest to commit without noticing, particularly on a follow-through. In casual play it mostly causes arguments; in a tournament it costs a throw. Both are avoidable by placing your foot deliberately rather than arriving at it.',
    how: [
      'Mark your lie, then place a supporting point within 30 centimetres directly behind the marker (PDGA 802.07).',
      'No supporting point may be closer to the target than the rear edge of your marker at the moment of release.',
      'Other body parts may be anywhere, including in front of the marker — it is supporting points that are restricted.',
      'Inside circle 1 (10 metres), you must also demonstrate full control of balance after release before advancing past the marker (806.01).',
      'Outside circle 1, following through past the marker after release is legal and normal.',
    ],
    wrong: [
      {
        fault: 'Stepping past the marker before the disc has left your hand.',
        fix: 'Place the foot first, deliberately, and release before anything moves past the marker.',
      },
      {
        fault: 'Falling forward on a putt inside the circle.',
        fix: 'That is a stance violation however well the putt flew. If you have to fall forward to reach, you are outside your range.',
      },
      {
        fault: 'Thinking any part of you in front of the marker is a fault.',
        fix: 'Only supporting points. You can lean a long way forward as long as nothing supporting you is past the line.',
      },
      {
        fault: 'Moving a branch or a stone to make the stance easier.',
        fix: 'Obstacles to a stance may not be moved (803.01). Take the lie you have.',
      },
    ],
    drill: {
      name: 'Place the foot',
      reps: '1 round deliberately placing the front foot before every throw',
      body:
        'Mark every lie and consciously place your supporting foot behind the marker before every throw, including ones where it plainly does not matter. One round of this and it becomes automatic, which is what you want before it is a tournament and somebody is watching.',
    },
  },

  'water-hazard-play': {
    why:
      'Water causes more rules confusion than anything else, because two completely different rules can apply and they have opposite consequences. Whether that pond is marked out of bounds or is simply water you can stand in decides whether you take a penalty or get free relief.',
    how: [
      'First establish which it is: water marked out of bounds, or ordinary water that is in bounds. The course signage or the event decides this, not the water.',
      'If it is marked OB, it is an ordinary OB penalty: one throw, and play from within one metre of where it last crossed.',
      'If the water is in bounds and your disc is in it and reachable, it is simply your lie. You may play it.',
      'Casual water — temporary water from rain, not a permanent feature — gives free relief: you may move back along the line of play, no closer to the target, to the nearest spot without the condition (PDGA 803.06).',
      'Casual relief is free; OB relief is not. Confusing the two is the mistake.',
    ],
    wrong: [
      {
        fault: 'Assuming all water is out of bounds.',
        fix: 'Only if the course or the event says so. Plenty of water is in bounds and simply playable.',
      },
      {
        fault: 'Taking free relief from water that is marked OB.',
        fix: 'That is one penalty throw and a specific lie. Free relief is for CASUAL water only.',
      },
      {
        fault: 'Taking casual relief closer to the target.',
        fix: 'Relief is never closer to the target. That constraint is what makes it free.',
      },
      {
        fault: 'Wading in to retrieve a disc that is out of bounds anyway.',
        fix: 'If it is OB you are taking the penalty regardless. Decide whether the disc is worth the wet feet separately.',
      },
    ],
    drill: {
      name: 'Read the sign',
      reps: '1 round identifying the status of every water feature before teeing',
      body:
        'On a course with water, check each hole’s signage before you tee and say which water is OB and which is not. It takes seconds and it is the single piece of information that decides what a wet throw costs you.',
    },
  },

  'courtesy-pace-of-play': {
    why:
      'Pace and courtesy cost no skill and decide whether people want to play with you. They also matter more than most players realise in a tournament, where slow play genuinely can be penalised and where the group behind is affected by every minute you take.',
    how: [
      'Stand still and silent behind the thrower, never in front and never in their eyeline.',
      'The player furthest from the basket throws first; on the tee, the best score on the previous hole goes first.',
      'Be ready when it is your turn: disc chosen, line decided, bag down.',
      'Walk to your disc while it is safe to do so, so you are not starting your decision when your turn arrives.',
      'Wave a faster group through rather than making them wait all round.',
      'Shout FORE immediately and loudly if a disc is heading anywhere near anyone.',
    ],
    wrong: [
      {
        fault: 'Starting to think about your shot only when it is your turn.',
        fix: 'Decide while others throw. This alone is most of playing at a good pace.',
      },
      {
        fault: 'Standing where the thrower can see you.',
        fix: 'Behind and to the side. It is distracting in a way people rarely mention and always notice.',
      },
      {
        fault: 'Spending five minutes looking for a disc with a group waiting.',
        fix: 'Mark it, wave them through, keep looking. Three minutes is the usual competitive limit for a lost disc.',
      },
      {
        fault: 'Hesitating to shout FORE because it feels embarrassing.',
        fix: 'Shout. Every time, loudly, immediately. This is the one piece of etiquette with real consequences.',
      },
    ],
    drill: {
      name: 'Ready when it is your turn',
      reps: '1 round deciding every shot before your turn arrives',
      body:
        'Play a round where you must have your disc in hand and your line chosen before it is your turn, every time. Notice how much faster the group moves and how much calmer your own throws feel without the decision being made under a waiting group’s gaze.',
    },
  },

  'official-vs-casual-play': {
    why:
      'There are two different games being played under one name: a casual round where the group agrees what counts, and a sanctioned round where the full PDGA rulebook applies. Most friction comes from people assuming they are in the same one. Knowing the difference lets you relax a rule on purpose rather than by ignorance.',
    how: [
      'In casual play, the group can agree to relax rules — mulligans, generous OB, no two-metre rule. That is fine as long as everybody agrees beforehand.',
      'In a sanctioned event, the full rulebook applies, plus whatever the director has specified for that event.',
      'Read the event’s own notes: OB definitions, mandatory routes, drop zones and optional rules are set per event.',
      'Learn the real rules even if you play casually, so when you relax one you are choosing to.',
      'When a group disagrees mid-round and it matters, play a provisional and sort it out afterwards.',
    ],
    wrong: [
      {
        fault: 'Assuming casual house rules apply at a tournament.',
        fix: 'They do not. Read the event notes, and ask at the players meeting rather than discovering it on hole 4.',
      },
      {
        fault: 'Enforcing full rules strictly in a casual round nobody agreed to.',
        fix: 'Agree at the start. Rules lawyering an unsanctioned round with friends is its own kind of bad etiquette.',
      },
      {
        fault: 'Never learning the rules because you only play casually.',
        fix: 'Knowing them is what makes relaxing them a choice. It also makes your first tournament far less daunting.',
      },
    ],
    drill: {
      name: 'Agree it on the first tee',
      reps: '1 casual round, rules agreed out loud before hole 1',
      body:
        'Before a casual round, spend thirty seconds agreeing what you are playing: mulligans or not, how OB works, two-metre rule on or off. It prevents every mid-round disagreement, and saying it aloud reveals how often people had different assumptions.',
    },
  },

  'pdga-rulebook-casual-players': {
    why:
      'The rulebook is long and almost none of it comes up. Perhaps eight rules cover everything you will meet in a normal round, and knowing those eight means you can play anywhere, with anyone, without needing to be taught mid-hole.',
    how: [
      'Tee off with supporting points behind the front line of the tee pad.',
      'Mark your lie, and throw with a supporting point within 30 cm behind the marker.',
      'Out of bounds is one penalty throw, played from within a metre of where it last crossed.',
      'You are holed out when the disc rests supported by the chains or in the tray.',
      'Furthest from the basket throws first.',
      'Obstacles to a stance may not be moved; casual water and loose debris give relief.',
      'Inside circle 1, show balance after a putt before advancing past your marker.',
      'When unsure, take the interpretation that is worse for you, and look it up afterwards.',
    ],
    wrong: [
      {
        fault: 'Guessing in your own favour when a rule is unclear.',
        fix: 'Take the stricter reading, then check afterwards. It costs little and it is how you stay somebody people trust to keep score.',
      },
      {
        fault: 'Trying to learn the whole rulebook before playing.',
        fix: 'Learn these eight. The rest you can look up on the rare occasions it comes up.',
      },
      {
        fault: 'Being embarrassed to ask mid-round.',
        fix: 'Ask. Every experienced player has looked something up, and nobody minds the question.',
      },
    ],
    drill: {
      name: 'The eight',
      reps: '1 round applying all 8 rules deliberately',
      body:
        'Play a round consciously applying each of the eight — marking, stance, order, OB, holing out. Say which one you are applying as you do it. After one round they are yours, and the rulebook stops being a thing you are vaguely worried about.',
    },
  },

  'drop-zone-rules': {
    why:
      'A drop zone is an alternative lie the course or event provides when the normal relief would be impractical — across water, past a mandatory, or off a cliff. The confusion is that using one does not necessarily mean the penalty goes away, and whether it applies is set by the event rather than by you.',
    how: [
      'A drop zone is a marked lie the course or the event director designates for specific situations.',
      'Use it when the signage or the event notes tell you to. It is not a general option you may take whenever you prefer it.',
      'Throwing from a drop zone usually still carries the penalty throw for whatever sent you there — missing a mandatory, or going out of bounds.',
      'Some holes offer a choice between the drop zone and the ordinary relief. Read which, before you tee.',
      'Check the players meeting or the event notes: drop zones are often specific to an event, not permanent features.',
    ],
    wrong: [
      {
        fault: 'Assuming the drop zone cancels the penalty.',
        fix: 'It usually does not. It provides a lie, not an amnesty.',
      },
      {
        fault: 'Using a drop zone because it is a better lie than the one you have.',
        fix: 'Only when directed to. Otherwise you have just taken an illegal lie.',
      },
      {
        fault: 'Not knowing a hole has one until you need it.',
        fix: 'Read the hole signage before teeing. Finding out under pressure is how it gets used incorrectly.',
      },
    ],
    drill: {
      name: 'Find them before you need them',
      reps: '1 round locating every drop zone on the course before teeing each hole',
      body:
        'Walk a round and find every drop zone the course has, noting what each is for. It takes a few extra minutes once, and it means the one time you need one you already know where it is and what it costs.',
    },
  },

  'marking-lie-correctly': {
    why:
      'Marking is the most frequently performed rule in the game — you do it on every throw after the tee — and doing it loosely is how a few centimetres of advantage creep in without anybody intending it. Doing it properly is also how you avoid a dispute in a round that counts.',
    how: [
      'Place your mini marker on the line of play, directly in front of the thrown disc, touching its front edge.',
      'Alternatively, play from the thrown disc itself, which is perfectly legal and often simpler.',
      'Then throw with a supporting point within 30 centimetres directly behind the marker.',
      'Mark before you pick the disc up, so the position is not a matter of memory.',
      'If the lie is unusual — on a slope, against an obstacle, above the ground — agree it with your group before moving anything.',
    ],
    wrong: [
      {
        fault: 'Picking the disc up before marking it.',
        fix: 'Mark first, every time. Once the disc is in your hand the exact lie is a reconstruction.',
      },
      {
        fault: 'Placing the mini a little further along the line of play.',
        fix: 'Touching the front edge. The creep is small, usually unintentional and completely avoidable.',
      },
      {
        fault: 'Marking inconsistently depending on how much the shot matters.',
        fix: 'Same every time. The habit is what protects you when it does matter.',
      },
    ],
    drill: {
      name: 'Mark every lie',
      reps: '1 full round marking all lies with a mini, including obvious ones',
      body:
        'Mark every lie precisely for a whole round, even the ones where it plainly makes no difference. It is slightly tedious for nine holes and automatic thereafter, which is the state you want it in before a round that counts.',
    },
  },

  'two-meter-rule': {
    why:
      'This is the rule most often quoted incorrectly, because it used to be standard and no longer is. A disc stuck in a tree above two metres is NOT automatically a penalty — in PDGA play the rule is optional and off unless the event or the course declares it. Knowing that is worth a stroke and an argument.',
    how: [
      'Default is OFF. In PDGA competition the two-metre rule applies only where the director has declared it, usually for specific holes or objects (PDGA 803.08).',
      'Where it is in effect: a disc resting more than two metres above the ground costs one penalty throw.',
      'Your lie in that case is marked on the ground directly below the disc.',
      'Where it is not in effect, there is no penalty: mark directly below and play on.',
      'Check the event notes or the course signage. In casual play, agree it on the first tee.',
    ],
    wrong: [
      {
        fault: 'Taking a penalty automatically for a disc up a tree.',
        fix: 'Check whether the rule is actually in effect. Most of the time it is not, and you have just given away a stroke.',
      },
      {
        fault: 'Assuming it applies because it used to.',
        fix: 'It has been optional since 2018. A lot of long-standing players still quote the old default.',
      },
      {
        fault: 'Measuring from where you are standing on a slope.',
        fix: 'It is the height above the ground directly below the disc. On a hill that is a meaningfully different measurement.',
      },
    ],
    drill: {
      name: 'Ask on the first tee',
      reps: 'every casual round: 1 question before hole 1',
      body:
        'Make it part of your first-tee routine to ask whether the two-metre rule is on. It takes one sentence, it settles the most commonly misquoted rule in the sport before it matters, and it saves the mid-round debate that otherwise always happens on hole 11.',
    },
  },

  'casual-relief': {
    why:
      'Casual relief is the free help the rules give you for conditions nobody intended to be part of the course: puddles, loose debris, a spectator, a parked car. Knowing you are entitled to it saves genuinely awkward lies, and knowing its limits saves you from taking relief you were not owed.',
    how: [
      'Casual water — temporary water, usually from rain, rather than a permanent feature — gives free relief (PDGA 803.06).',
      'Relief means moving to the nearest spot that avoids the condition, along the line of play, NO CLOSER to the target.',
      'Loose debris not attached to anything — leaves, twigs, loose stones — may be moved.',
      'Fixed or growing obstacles may not be moved, and neither may anything that is part of the course (803.01).',
      'Casual obstacles such as people, animals, vehicles and equipment can be moved or waited out.',
      'When in doubt about whether something is casual, ask the group and take the stricter reading.',
    ],
    wrong: [
      {
        fault: 'Treating permanent water or mud as casual.',
        fix: 'Casual means temporary and unintended. A pond that is always there is part of the course.',
      },
      {
        fault: 'Breaking or bending a branch that is in the way.',
        fix: 'Growing obstacles may not be moved. This is also the rule that keeps courses from being gradually destroyed.',
      },
      {
        fault: 'Taking relief closer to the target.',
        fix: 'Never closer. That constraint is what makes the relief free rather than an advantage.',
      },
    ],
    drill: {
      name: 'Name the condition',
      reps: '1 wet round, naming the relief rule for every awkward lie',
      body:
        'Play after rain and, at each awkward lie, say out loud whether the condition is casual and what relief you are entitled to. You will find you are entitled to more than you thought on puddles and less than you thought on branches, which is the useful correction.',
    },
  },

  'provisional-throws': {
    why:
      'A provisional throw is what stops a disagreement over a ruling from either halting the round or being settled badly under pressure. You play both outcomes, keep moving, and sort it out afterwards with somebody who knows. It is the most useful rule almost nobody uses.',
    how: [
      'Use one when the group genuinely disagrees about a ruling, or when it is unclear whether a disc is lost or out of bounds (PDGA 805.01).',
      'Announce it clearly to the group BEFORE throwing: say you are playing a provisional and what the two outcomes are.',
      'Play out both: your score under each interpretation.',
      'Resolve it after the round with an official, or with the rulebook, and record the correct score.',
      'Keep playing. The whole purpose is that the round does not stop and nobody has to be right on the spot.',
    ],
    wrong: [
      {
        fault: 'Deciding a contested ruling on the spot and moving on.',
        fix: 'If it genuinely matters and the group disagrees, play a provisional. Being pressured into a ruling is how the wrong score gets kept.',
      },
      {
        fault: 'Playing a provisional without announcing it.',
        fix: 'Announce it before the throw, clearly. An unannounced provisional is just a second throw.',
      },
      {
        fault: 'Using one to retake a shot you did not like.',
        fix: 'It is for genuine rules uncertainty, not for a second attempt. Using it otherwise is cheating with extra steps.',
      },
    ],
    drill: {
      name: 'Say it out loud once',
      reps: '1 practice announcement, before you ever need it',
      body:
        'Next time a ruling is even slightly unclear in a casual round, practise announcing a provisional properly — what you are doing and what the two outcomes are. Having said the words once makes it far more likely you will use it when it actually counts.',
    },
  },

  'mando-rules': {
    why:
      'A mandatory forces your disc to pass a marked object on a specified side, usually for safety or to stop players shortcutting a dogleg. Missing one is a penalty plus a specific lie, and it is the rule most likely to catch out a player on an unfamiliar course who did not read the sign.',
    how: [
      'A mando is marked with an arrow on the object — a tree, a pole — showing the side your disc must pass.',
      'Your disc must cross the mando line on the correct side (PDGA 804.01).',
      'If you miss it, you take one penalty throw and play from the designated drop zone for that mando.',
      'A double mando requires passing between two objects, which is a narrower window than it looks from the tee.',
      'Read the sign before you throw. Mandos are marked on the tee signage and are easy to miss on a course you do not know.',
    ],
    wrong: [
      {
        fault: 'Not noticing a mando until after throwing.',
        fix: 'Read the tee sign on every unfamiliar hole. A missed mando is a stroke and a worse lie, for a sign you walked past.',
      },
      {
        fault: 'Assuming you can play on from where the disc landed after missing it.',
        fix: 'You play from the drop zone with a penalty. Where the disc finished is irrelevant.',
      },
      {
        fault: 'Attempting a line that only just makes the mando.',
        fix: 'Give it margin. The cost of missing is a stroke plus a worse position, which is rarely worth the few feet gained.',
      },
    ],
    drill: {
      name: 'Read every tee sign',
      reps: '1 unfamiliar course, reading all 18 tee signs before throwing',
      body:
        'On a course you do not know, read the sign on every hole before teeing and note any mando, drop zone or OB. It adds a couple of minutes to the round and removes the single most common way of losing a stroke somewhere new.',
    },
  },

  // ─────────────────── TOURNAMENT & COMPETITION ───────────────────
  'reading-tournament-field': {
    why:
      'Knowing the shape of an event before you start — the format, the layout, how many rounds, who is in it — removes a whole category of surprise that otherwise eats attention during the golf. It also stops you playing the wrong strategy, which is easy to do when you do not know how the thing is scored.',
    how: [
      'Read the format, the number of rounds and the layout before round one.',
      'Know how the division works and what counts: points, cash, a cut, a final nine.',
      'Play the course rather than the competitors, especially early. The field is not something you can influence.',
      'Resist watching the leaderboard in the first round. There is nothing it can tell you that changes a good decision.',
      'Know when and where you are starting, and what the hole assignments are, the day before.',
    ],
    wrong: [
      {
        fault: 'Playing to beat a specific person.',
        fix: 'You control your own score only. Playing the course is both more effective and considerably less stressful.',
      },
      {
        fault: 'Checking the leaderboard constantly in round one.',
        fix: 'Early position tells you nothing and changes nothing. Leave it until it can actually affect a decision.',
      },
      {
        fault: 'Learning the format on the first tee.',
        fix: 'Read it in advance. Strategy depends on how you are scored, and discovering that late means playing the first round wrong.',
      },
    ],
    drill: {
      name: 'Know the event cold',
      reps: '1 written page before your next event: format, layout, times, division',
      body:
        'Before your next tournament, write down the format, the layout, your start time and hole, the division and how it is scored. One page. Everything on it is something you would otherwise be working out on the day with attention you needed for golf.',
    },
  },

  'warm-up-competition-day': {
    why:
      'Hole 1 in a tournament counts exactly as much as hole 18, and an unwarmed player throws their first few holes worse. A proper warm-up is the cheapest strokes available on competition day, and almost everybody shortens it because of nerves and timing.',
    how: [
      'Arrive early enough that the warm-up is unhurried. An hour before the horn is a reasonable target.',
      'Start with mobility: arm circles, trunk rotations, leg swings.',
      'Putt first. Twenty or thirty putts gets the hands and the stroke going, and it settles nerves better than driving does.',
      'Then throw, building from easy midranges to full-power drives over several throws.',
      'Finish with a few putts again, so the last thing you do before the horn is the thing you will do most.',
      'Have the whole sequence fixed in advance, so nerves cannot rush or reorder it.',
    ],
    wrong: [
      {
        fault: 'Arriving with barely enough time and warming up on hole 1.',
        fix: 'The first three holes count. Get there early enough that the warm-up is a routine rather than a scramble.',
      },
      {
        fault: 'Warming up by throwing drivers as hard as possible.',
        fix: 'Build up. The first max-effort throw of the day should not be the fifth thing you do.',
      },
      {
        fault: 'Skipping the putting warm-up because the drive feels more urgent.',
        fix: 'You will putt far more often than you drive, and putting settles the nerves better. Putt first.',
      },
    ],
    drill: {
      name: 'The fixed sequence',
      reps: '30 min: 5 mobility, 25 putts, 15 building throws, 10 putts',
      body:
        'Write the sequence down and use exactly the same one before every round, practice or competitive. The familiarity is the point — a known sequence is something to hold on to when the first tee is busier than usual.',
    },
  },

  'managing-nerves-slow-play': {
    why:
      'Tournament rounds are slower than casual ones, often considerably. That means long waits on tees, going cold between shots, and energy dips in the back nine. None of it is about throwing and all of it affects your score.',
    how: [
      'Stay loose during waits: easy arm circles, a gentle rotation, keep moving rather than sitting down.',
      'Eat and drink on a schedule rather than when you notice you need to. An energy dip at hole 12 feels exactly like losing your nerve.',
      'Use the waiting time for your own next shot rather than on the leaderboard or conversation.',
      'Run the full routine on every throw, which resets your tempo after a long gap.',
      'Accept the pace. Being annoyed about slow play costs you more than the slow play does.',
    ],
    wrong: [
      {
        fault: 'Going cold during long waits and throwing straight from standing still.',
        fix: 'Keep moving gently. A few easy rotations before stepping onto the pad is enough.',
      },
      {
        fault: 'Eating only when hungry.',
        fix: 'By then it is late. Small amounts regularly, on a schedule, across the whole round.',
      },
      {
        fault: 'Getting irritated by the pace.',
        fix: 'It is the same for everyone on the card. Irritation is a cost you add to a situation you cannot change.',
      },
    ],
    drill: {
      name: 'Practise the wait',
      reps: '20 throws with a 3-minute gap between each',
      body:
        'Throw, then wait three minutes, then throw again — twenty times. It is a dull session and it is exactly what a slow tournament round asks of you: a full-quality throw from cold, repeatedly, with your routine as the only thing bridging the gap.',
    },
  },

  'bag-setup-competitive': {
    why:
      'The bag you carry into a tournament should be chosen for that course on that day, not assembled by habit. The two mistakes are carrying experiments and carrying duplicates — both of which turn a decision you should make quickly into one you make badly under pressure.',
    how: [
      'Walk or study the layout first, then pick the bag the course asks for.',
      'Bag for the forecast. A windy day wants more stable discs and heavier weights than a calm one.',
      'Carry only discs you trust. A tournament is not the place for a mould you are still learning.',
      'Remove duplicates that fly almost identically. Two discs doing one job is a decision you do not need at speed.',
      'Know what each disc in the bag does TODAY, in these conditions, rather than in general.',
    ],
    wrong: [
      {
        fault: 'Carrying a new disc to try out.',
        fix: 'Leave it at home. Every disc in a competitive bag should be one whose flight you can call before you throw it.',
      },
      {
        fault: 'Bringing the same bag regardless of the course or weather.',
        fix: 'Pick for the layout and the forecast. A wooded course and an open one want different bags.',
      },
      {
        fault: 'Carrying twenty discs so that everything is covered.',
        fix: 'Weight and decision time both cost. A tight bag of trusted discs beats a complete one you have to search.',
      },
    ],
    drill: {
      name: 'Pack for the course',
      reps: '1 bag chosen deliberately per event, written down before packing',
      body:
        'Before your next event, write the list of discs and one line on what each is for on that layout. If you cannot write the line, the disc does not go. The list usually comes out shorter than your usual bag and the round feels simpler for it.',
    },
  },

  'safe-vs-aggressive': {
    why:
      'Risk level should be set by the situation, not by temperament. Playing safe all day leaves strokes on the course; attacking all day gives them away faster. The skill is noticing which situation you are in, which usually comes down to what a miss costs here and what the format rewards.',
    how: [
      'Default to safe where a par holds your position and the miss is expensive.',
      'Attack where the miss is cheap — open ground behind, nothing in play, a comeback you would take anyway.',
      'Let the format decide the baseline: a points race rewards consistency, a cash cut can reward late aggression.',
      'Account for where you are in the event. Needing strokes late genuinely changes the arithmetic; wanting them on hole 3 does not.',
      'Decide before you step in, and commit. A half-hearted aggressive shot is the worst of both.',
    ],
    wrong: [
      {
        fault: 'Picking a risk level by mood.',
        fix: 'Pick it from the hole and the format. Mood is the least reliable input available.',
      },
      {
        fault: 'Attacking early because you want a good start.',
        fix: 'There is no good start worth a double on hole 2. Early holes are where consistency pays most.',
      },
      {
        fault: 'Playing safe on the last few holes while needing strokes.',
        fix: 'If you genuinely need them, the arithmetic has changed. Safe play from behind guarantees the result you are trying to avoid.',
      },
    ],
    drill: {
      name: 'Label every hole',
      reps: '1 round labelling each hole safe or aggressive before teeing',
      body:
        'Label all eighteen before you throw on each, and play the label. At the end, check which labels were wrong. You are training the judgement itself rather than any shot, and it is the judgement that most separates tournament scores.',
    },
  },

  'post-round-review-adjustment': {
    why:
      'A round contains a great deal of information and almost all of it is lost within an hour. Five minutes of review afterwards turns a round into data — specifically, into the one thing worth practising next, which is otherwise chosen by whim.',
    how: [
      'Immediately after the round, note where the strokes went: drives, approaches, putts, decisions, penalties.',
      'Be specific. "Putting was bad" is not useful; "missed four putts between 20 and 30 feet" is.',
      'Separate bad execution from bad decisions. They need completely different fixes.',
      'Pick ONE thing to practise before the next round, and write it down.',
      'Track it across rounds. A pattern over five rounds is real; one round is noise.',
    ],
    wrong: [
      {
        fault: 'Reviewing only the bad holes.',
        fix: 'Strokes leak in ordinary holes too — a mediocre approach leading to a 30-foot putt is a cost that never looks dramatic.',
      },
      {
        fault: 'Picking three or four things to work on.',
        fix: 'One. Three changes at once means not knowing which worked, which is how practice becomes busywork.',
      },
      {
        fault: 'Reviewing days later.',
        fix: 'Do it in the car park. The detail is gone within an hour and the memory that remains is mostly the worst hole.',
      },
    ],
    drill: {
      name: 'Five minutes in the car park',
      reps: '5 minutes of notes after every round, for 5 rounds',
      body:
        'Five minutes immediately after each round: where the strokes went, bad decisions separated from bad execution, and one thing to practise. After five rounds read them together. The pattern that appears is usually not what you would have guessed.',
    },
  },

  'points-vs-cash-format-strategy': {
    why:
      'How you get paid should change how you play, and most players never think about it. A points series rewards turning up and being consistent; a cash event with a cut rewards being above a line. Those are genuinely different incentives and they argue for different risk levels.',
    how: [
      'Find out before you enter: points, cash, a cut, a final round, how deep the payout goes.',
      'In a points format, consistency wins. Avoiding a disaster round is worth more than a brilliant one.',
      'Where there is a cut, know roughly where the line is and whether you are safely inside it.',
      'When you are comfortably inside a payout and the next place is far away, there is nothing to gain from risk.',
      'When you need strokes to reach a line, the arithmetic genuinely changes and more risk becomes correct.',
    ],
    wrong: [
      {
        fault: 'Playing every event the same way.',
        fix: 'The format sets the baseline. A points series and a one-off cash event reward different things.',
      },
      {
        fault: 'Taking risks when already safely in a payout.',
        fix: 'Nothing to gain, something to lose. Consolidate.',
      },
      {
        fault: 'Not knowing the payout structure until afterwards.',
        fix: 'Read it before round one. It is part of knowing what game you are playing.',
      },
    ],
    drill: {
      name: 'Read the structure first',
      reps: '1 event, payout and format read before round 1',
      body:
        'Before your next event, read exactly how it pays and write one sentence on what that means for your risk level. It is five minutes, it is something most of the field will not have done, and it occasionally changes a decision worth several places.',
    },
  },

  'tournament-practice-prep': {
    why:
      'A practice round is worth more than any amount of general practice in the week before an event, because it converts unknowns into knowns. Every hole you have seen is a hole you are not working out under pressure with a group waiting.',
    how: [
      'Play at least one practice round on the layout, ideally at the same time of day.',
      'Note the lines, the OB, the mandos, the drop zones and where the pins are likely to be.',
      'Write down a plan for each hole: disc, shape, landing zone.',
      'Spend most of the remaining practice time on putting and approaches. Tight rounds are decided inside 150 feet.',
      'Do not change anything technical in the final week. Dial what you have rather than rebuilding it.',
    ],
    wrong: [
      {
        fault: 'Working on form in the week before an event.',
        fix: 'Too late to help and likely to hurt. Sharpen what exists; rebuild after the event.',
      },
      {
        fault: 'Playing a practice round and not writing anything down.',
        fix: 'Write the plan per hole. By the event you will have forgotten half of what you noticed.',
      },
      {
        fault: 'Spending the practice round trying to score.',
        fix: 'Throw several options from each tee and learn the hole. Scoring in a practice round proves nothing.',
      },
    ],
    drill: {
      name: 'A plan per hole',
      reps: '1 practice round, 18 written hole plans',
      body:
        'Play the layout and write one line per hole: disc, shape, landing zone, where the trouble is. Eighteen lines. Carry it. Most of the value is in having made the decisions when nothing was at stake.',
    },
  },

  'formats-and-doubles': {
    why:
      'Casual disc golf is played in several formats and knowing them means you can join any group without needing it explained. Doubles in particular is how most people first play competitively, and it is both the friendliest introduction and genuinely good practice.',
    how: [
      'Singles: everybody plays their own disc, lowest total wins. This is the default.',
      'Best-shot doubles: partners both throw, pick the better lie, and both throw again from there. The most common casual format.',
      'Alternate shot: partners take turns throwing the same disc, which makes position far more important.',
      'Worst-shot doubles: you play from the WORSE of the two lies, which is punishing and excellent practice.',
      'Know whether your format is handicapped, and how, before you start.',
    ],
    wrong: [
      {
        fault: 'Both partners playing it safe in best-shot doubles.',
        fix: 'One safe, one aggressive. That is the whole advantage of the format and most pairs never use it.',
      },
      {
        fault: 'Treating alternate shot like singles.',
        fix: 'Every throw hands a position to your partner. Think about where you are leaving them, not just about your own shot.',
      },
      {
        fault: 'Not asking the format before starting.',
        fix: 'Ask on the first tee. It takes a sentence and it decides how you play every hole.',
      },
    ],
    drill: {
      name: 'One safe, one attacking',
      reps: '1 round of best-shot doubles, deciding the order on every tee',
      body:
        'Play a doubles round where you explicitly agree before each hole which of you throws safe and which attacks — and have the safe one throw first. Most pairs have never done this and it is where the format’s advantage actually lives.',
    },
  },

  'scorekeeping': {
    why:
      'Keeping the card is a small responsibility that goes wrong in predictable ways, and a disputed score at the end of a round is both awkward and avoidable. It is also, quietly, the best way to learn the vocabulary and to pay attention to the whole group.',
    how: [
      'Confirm every player’s score out loud before leaving the hole, while everybody is still standing there.',
      'Record it immediately rather than carrying two or three holes in your head.',
      'Use a digital card where the event allows — it sums automatically and syncs live, which removes the arithmetic errors entirely.',
      'Where there are two cards, check them against each other at the turn rather than at the end.',
      'Include penalty throws as you record them, not afterwards.',
    ],
    wrong: [
      {
        fault: 'Carrying several holes in your head to keep pace.',
        fix: 'Record at the hole. It takes seconds and it is where almost all scoring errors come from.',
      },
      {
        fault: 'Confirming scores only at the end of the round.',
        fix: 'Confirm at each hole while everybody remembers. A dispute on hole 18 about hole 6 is unresolvable.',
      },
      {
        fault: 'Forgetting to add a penalty throw.',
        fix: 'Add it as it happens. Penalties are the single most commonly omitted stroke.',
      },
    ],
    drill: {
      name: 'Keep the card',
      reps: '1 round keeping the card for the whole group',
      body:
        'Volunteer to keep the card for a full round, confirming every score at every hole. You will pay more attention to the group and the round than you ever have, and the vocabulary stops being something you have to think about.',
    },
  },

};

/** True when a lesson has a written body, so callers can fall back to tips. */
export function hasBody(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(LESSON_BODIES, slug);
}
