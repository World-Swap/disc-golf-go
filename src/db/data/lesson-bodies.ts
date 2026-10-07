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

};

/** True when a lesson has a written body, so callers can fall back to tips. */
export function hasBody(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(LESSON_BODIES, slug);
}
