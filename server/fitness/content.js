/**
 * Move & Recover content: 30-Minute Move, the heat and cold protocols and the
 * free safety information.
 *
 * STATUS: PENDING CLINICAL AND ACCREDITED EXERCISE PHYSIOLOGIST REVIEW.
 * Nothing here is published while FEATURE_FITNESS_PROTOCOLS is off.
 *
 * All wording is original to Hopewick, written from the evidence summary in
 * docs/FITNESS-PROTOCOLS.md (sources in docs/CONTENT-SOURCES.md). No text is
 * taken from any retailer, app or website. Plain, warm Australian English: no
 * diagnosis, no promised outcomes, always a route to Get help.
 *
 * Lives on the server (not under app/) so Plus content and anything not yet
 * released never reaches a browser that is not allowed to see it.
 */
import { FITNESS_RULES as R } from './rules.js';

export const CONTENT_VERSION = 'fit-content-v1';
export const REVIEW_NOTE = 'Draft: pending clinical and exercise physiologist review.';

/* ------------------------------------------------------------------ */
/* Free: safety rules and information (never Plus-gated)               */
/* ------------------------------------------------------------------ */
export const SAFETY = Object.freeze({
  title: 'Heat and cold: the Hopewick rules',
  rules: [
    { id: 'no-substances', title: 'No alcohol or other drugs', text: `No sauna, cold water or contrast after alcohol or any other drug, including a hangover or coming down. Hopewick locks these sessions for ${R.substanceLockHours} hours after any use.` },
    { id: 'never-alone', title: 'Never alone in cold water', text: 'Only get into cold water with someone right there who can help you out. The first gasp is the dangerous part.' },
    { id: 'get-out', title: 'Get out straight away if something feels wrong', text: 'Dizzy, faint, sick, confused, short of breath, chest pain, a racing or uneven heartbeat, or numbness: stop and get out. For chest pain or fainting, call 000.' },
    { id: 'head-out', title: 'Head out, breathe normally', text: 'Keep your head and face out of cold water. No breath-holding and no forced fast breathing in the water.' },
    { id: 'slow', title: 'Build up slowly', text: `Colder and longer is not better. Hopewick will not guide water colder than ${R.coldFloorC} °C or a sauna round longer than ${R.saunaMaxMinutesPerRound} minutes.` },
  ],
  stopSigns: ['Dizziness or feeling faint', 'Chest pain or tightness', 'A racing, pounding or uneven heartbeat', 'Feeling sick or confused', 'Numbness, or not being able to feel your fingers or toes', 'Shivering you cannot stop', 'Panic or not being able to catch your breath'],
  emergency: 'In an emergency call 000. Need to talk? Lifeline 13 11 14.',
  footer: 'General information only, not medical advice. If you are unsure, check with your GP, physio or exercise physiologist.',
});

export const INFO = Object.freeze({
  title: 'What the research says',
  paragraphs: [
    'Moving regularly is one of the best-studied things you can do for your health, and many people find it helps their mood. Walking, strength work and yoga all have good evidence for easing low mood. Exercise works alongside your support and treatment, not instead of it.',
    'Saunas and cold water are popular, and lots of people enjoy them. The research is still catching up. Long-term studies from Finland link regular sauna use with better heart health, and cold water may ease muscle soreness for a day or two after a hard session. There is not good evidence that heat or cold treat depression, anxiety or addiction.',
    'Heat and cold carry real risks, especially with alcohol or other drugs, some medicines, heart conditions or pregnancy. That is why Hopewick asks a few safety questions first.',
  ],
  reviewNote: REVIEW_NOTE,
});

/* ------------------------------------------------------------------ */
/* Levels, adapted tracks and the pain guide                           */
/* ------------------------------------------------------------------ */
export const LEVELS = Object.freeze([
  { id: 'beginner', label: 'Beginner', rounds: 2, reps: '8–10', restSeconds: 75, effort: '4–6 out of 10', note: 'You can talk the whole time. Two rounds is a full session.' },
  { id: 'intermediate', label: 'Intermediate', rounds: 3, reps: '10–15', restSeconds: 50, effort: '5–7 out of 10', note: 'You can talk, but you would not want to sing.' },
  { id: 'advanced', label: 'Advanced', rounds: 4, reps: '12–20, or a harder version', restSeconds: 40, effort: '6–8 out of 10', note: 'Lower slowly (about three seconds). A few words at a time is fine.' },
]);

export const TRACKS = Object.freeze([
  { id: 'standard', label: 'Standard', desc: 'The full program, with easier and harder options on every move.' },
  { id: 'seated', label: 'Seated or supported', desc: 'Everything from a sturdy chair, with no floor work and no jumping.' },
  { id: 'back', label: 'Back-friendly', desc: 'Smaller ranges, supported positions and no jumping.' },
  { id: 'knee', label: 'Knee-friendly', desc: 'No deep bends, kneeling or jumping.' },
  { id: 'hip', label: 'Hip-friendly', desc: 'Comfortable ranges, no deep squats, lunges or jumping.' },
  { id: 'shoulder', label: 'Shoulder-friendly', desc: 'No overhead pressing and no full push-ups.' },
]);
export const TRACK_NOTE = 'If you have an injury, ongoing pain, a recent operation or a work injury claim, check this plan with your GP, physio or exercise physiologist first. If you are on a return-to-work plan, follow your treating team’s limits first. Adapted training is still real training.';

export const PAIN_GUIDE = Object.freeze({
  title: 'How to read pain while you train',
  levels: [
    { id: 'green', label: 'Green: 0–2 out of 10', text: 'Keep going.' },
    { id: 'amber', label: 'Amber: 3–5 out of 10', text: 'Okay if it settles by the next day and is not getting worse each time. If it is, go back a level.' },
    { id: 'red', label: 'Red: more than 5, sharp, shooting, pins and needles or numbness', text: 'Stop that move, use the easier option or skip it, and check in with your health professional.' },
  ],
  reviewNote: REVIEW_NOTE,
});

/* ------------------------------------------------------------------ */
/* Exercise library (original wording)                                 */
/* adapted: notes per track. Swaps per track live in TRACK_SWAPS.      */
/* ------------------------------------------------------------------ */
const X = (id, o) => [id, Object.freeze({ id, impact: 'low', ...o })];
export const EXERCISES = Object.freeze(Object.fromEntries([
  // Warm-up and cool-down moves
  X('march', { name: 'March on the spot', group: 'warm-up', steps: ['Stand tall, holding a bench or wall if you like.', 'Lift one knee to a comfortable height, then the other.', 'Swing your arms gently in time.'], cues: ['Soft knees', 'Breathe easily'], easier: 'Smaller steps, or march while seated.', harder: 'Lift your knees higher and pick up the pace.', adapted: { seated: 'Sit tall near the front of the chair and march your feet.' } }),
  X('arm-circles', { name: 'Arm circles', group: 'warm-up', steps: ['Stand or sit tall with your arms out to the side.', 'Draw small circles forwards for 15 seconds, then make them a bit bigger.', 'Swap direction.'], cues: ['Shoulders relaxed, away from your ears'], easier: 'Keep the circles small.', harder: 'Make slow, full circles.', adapted: { shoulder: 'Keep the circles small and below shoulder height.' } }),
  X('hip-circles', { name: 'Hip circles', group: 'warm-up', steps: ['Stand with feet hip-width apart and hands on your hips.', 'Draw slow circles with your hips, about 8 one way.', 'Swap direction.'], cues: ['Keep your upper body fairly still'], easier: 'Small circles, holding a wall.', harder: 'Bigger, slower circles.', adapted: { seated: 'Seated: rock your pelvis forwards and back, then side to side.', hip: 'Keep the circles small and comfortable.' } }),
  X('ankle-rocks', { name: 'Ankle rocks', group: 'warm-up', steps: ['Face a wall with one foot slightly in front.', 'Keeping your front heel down, gently move your knee towards the wall.', 'Come back and repeat, then swap legs.'], cues: ['Heel stays on the floor', 'Knee travels over your middle toes'], easier: 'Smaller movement.', harder: 'Move your foot further from the wall.', adapted: { seated: 'Seated: slide one foot back under the chair and rock your knee forwards.' } }),
  X('easy-walk', { name: 'Easy walk', group: 'cool-down', steps: ['Walk slowly around the room or outside.', 'Let your breathing settle.'], cues: ['Relax your shoulders'], easier: 'Walk on the spot.', harder: 'Not needed: this is the wind-down.', adapted: { seated: 'Seated: slow march with long, easy breaths.' } }),
  X('calf-stretch', { name: 'Calf stretch', group: 'cool-down', steps: ['Hands on a wall, step one foot back.', 'Keep the back heel down and the back leg fairly straight.', 'Lean in until you feel a gentle stretch. Hold 20–30 seconds each side.'], cues: ['No bouncing', 'Breathe slowly'], easier: 'Shorter step back.', harder: 'Bend the back knee slightly for a lower calf stretch too.', adapted: { seated: 'Seated: straighten one leg, heel down, and pull your toes towards you.' } }),
  X('hip-flexor-stretch', { name: 'Front-of-hip stretch', group: 'cool-down', steps: ['Stand in a split stance holding a chair, or half-kneel on a cushion.', 'Gently tuck your tailbone under and shift forwards a little.', 'Hold 20–30 seconds each side.'], cues: ['Stay tall', 'Gentle stretch, never pain'], easier: 'Standing version with a chair.', harder: 'Reach the arm on the back-leg side up and over.', adapted: { knee: 'Standing version only, no kneeling.', seated: 'Sit sideways on the chair, let one leg drop back and sit tall.' } }),
  X('hamstring-stretch', { name: 'Back-of-thigh stretch', group: 'cool-down', steps: ['Sit on the front edge of a chair.', 'Straighten one leg with the heel on the floor.', 'Keep your back long and lean forward from the hips. Hold 20–30 seconds each side.'], cues: ['Lead with your chest, not your head'], easier: 'Lean forward less.', harder: 'Lift the toes of the straight leg.', adapted: { back: 'Keep the lean small and your back long.' } }),
  X('chest-opener', { name: 'Chest opener', group: 'cool-down', steps: ['Stand or sit tall.', 'Clasp your hands behind your back, or rest a forearm on a door frame.', 'Gently open your chest. Hold 20–30 seconds.'], cues: ['Shoulders down', 'Chin level'], easier: 'Hands on your lower back instead.', harder: 'Lift your hands slightly away from your back.', adapted: { shoulder: 'Use the gentlest version: hands on your lower back, elbows drawing back.' } }),
  X('breathing', { name: 'Slow breathing', group: 'cool-down', steps: ['Sit or lie comfortably.', 'Breathe in through your nose for a count of 4.', 'Breathe out slowly for a count of 6. Repeat for a minute.'], cues: ['Let your belly move', 'If counting makes you anxious, just breathe slowly'], easier: 'Breathe in for 3, out for 4.', harder: 'Not needed.', adapted: {} }),

  // Lower body
  X('squat', { name: 'Squat', group: 'lower', steps: ['Stand with your feet about shoulder-width apart and toes turned out a little.', 'Push your hips back and bend your knees as if sitting into a chair.', 'Go as low as feels comfortable, then push through your whole foot to stand.'], cues: ['Chest proud', 'Knees follow your toes', 'Heels stay down', 'Breathe out on the way up'], easier: 'Sit-to-stand from a chair, or hold a bench.', harder: 'Lower over 3 seconds and pause, hold a loaded backpack, then try split squats.', adapted: { knee: 'Use a box squat to a high chair, with a range that feels comfortable.', hip: 'Box squat to a high chair, feet a little wider.', back: 'Keep the range comfortable and your back long.', seated: 'Use sit-to-stand instead.' } }),
  X('sit-to-stand', { name: 'Sit-to-stand', group: 'lower', steps: ['Sit near the front of a sturdy chair, feet flat and hip-width apart.', 'Lean forwards slightly and stand up, pushing through your feet.', 'Lower back down slowly with control.'], cues: ['Nose over toes as you rise', 'Control the way down'], easier: 'Add a cushion to raise the seat, or use your hands on your thighs.', harder: 'Arms crossed, slower lowering, or a lower chair.', adapted: { knee: 'Raise the seat with a cushion.', hip: 'Raise the seat and keep feet a little wider.' } }),
  X('box-squat', { name: 'Box squat to a high chair', group: 'lower', steps: ['Stand in front of a high chair or bed edge.', 'Push your hips back and lower until you lightly touch the seat.', 'Stand straight back up without flopping down.'], cues: ['Light touch, no resting', 'Knees in line with toes'], easier: 'A higher seat.', harder: 'A lower seat, or a backpack held at your chest.', adapted: {} }),
  X('split-squat', { name: 'Split squat', group: 'lower', steps: ['Stand tall in a long stride, holding a chair if needed.', 'Lower your back knee towards the floor, keeping your front knee over the middle of your foot.', 'Push through your front heel to come up. Do all reps, then swap legs.'], cues: ['Tall body', 'Most of your weight on the front leg', 'Control the way down'], easier: 'A smaller range with a hand on a chair.', harder: 'Step back into a reverse lunge, or put your back foot on a chair.', adapted: { knee: 'Swap for glute bridges.', hip: 'Swap for standing side leg lifts.', back: 'Keep the range small and your body upright.' } }),
  X('glute-bridge', { name: 'Glute bridge', group: 'lower', steps: ['Lie on your back with knees bent and feet flat, hip-width apart.', 'Squeeze your bottom and lift your hips until your body is in a line from shoulders to knees.', 'Pause, then lower slowly.'], cues: ['Push through your heels', 'Ribs down, do not arch your lower back'], easier: 'A smaller lift.', harder: 'Marching bridge, single-leg bridge, or feet up on a chair.', adapted: { back: 'Usually well tolerated. Keep the lift small and pain-free.', seated: 'Use seated knee lifts instead.' } }),
  X('hip-hinge', { name: 'Hip hinge', group: 'lower', steps: ['Stand with soft knees, hands on your thighs.', 'Push your hips back and slide your hands towards your knees, keeping your back long.', 'Stand tall by squeezing your bottom.'], cues: ['Imagine closing a car door with your bottom', 'Neck in line with your spine'], easier: 'A smaller range.', harder: 'Hold a backpack at your chest, then try a single-leg version holding a wall.', adapted: { back: 'Small range only. Stop if you feel pain travel down a leg.', seated: 'Seated hinge: sit tall, lean forwards from the hips, then sit back up.' } }),
  X('calf-raise', { name: 'Calf raise', group: 'lower', steps: ['Stand holding a wall or bench.', 'Rise up onto the balls of your feet.', 'Pause, then lower slowly.'], cues: ['Straight up, not rolling out', 'Slow on the way down'], easier: 'Smaller lift.', harder: 'Heels hanging off a step, then one leg at a time.', adapted: { seated: 'Seated heel raises.' } }),
  X('step-up', { name: 'Step-up', group: 'lower', steps: ['Stand facing the bottom stair, holding the rail.', 'Step up with one foot and stand tall, then step down with control.', 'Do all reps, then lead with the other leg.'], cues: ['Whole foot on the step', 'Push through the top leg, not the bottom one'], easier: 'A lower step.', harder: 'A higher step, or no hands.', adapted: { knee: 'Use a low step and the rail.', seated: 'Use seated knee extensions instead.' } }),
  X('standing-hip-abduction', { name: 'Standing side leg lift', group: 'lower', steps: ['Stand side-on to a wall or bench and hold it.', 'Keeping your toes pointing forwards, lift your outside leg out to the side.', 'Lower slowly. Do all reps, then swap.'], cues: ['Stay tall, do not lean', 'Small, controlled lift'], easier: 'A smaller lift.', harder: 'Pause at the top for 2 seconds.', adapted: {} }),
  X('seated-knee-extension', { name: 'Seated knee straightening', group: 'lower', steps: ['Sit tall in a sturdy chair.', 'Slowly straighten one knee until the leg is out in front.', 'Pause, then lower slowly. Do all reps, then swap.'], cues: ['Sit tall', 'Squeeze the front of the thigh at the top'], easier: 'A smaller range.', harder: 'Pause for 3 seconds at the top, or add a light ankle weight if your physio agrees.', adapted: {} }),
  X('seated-knee-lift', { name: 'Seated knee lift', group: 'lower', steps: ['Sit tall near the front of a chair.', 'Lift one knee a few centimetres off the seat, then lower.', 'Alternate sides.'], cues: ['Stay tall, do not lean back'], easier: 'Smaller lift.', harder: 'Hold each lift for 3 seconds.', adapted: {} }),
  X('seated-heel-raise', { name: 'Seated heel raise', group: 'lower', steps: ['Sit tall with feet flat.', 'Lift both heels as high as you can, keeping toes down.', 'Lower slowly.'], cues: ['Slow and steady'], easier: 'One foot at a time.', harder: 'Press down on your knees with your hands for resistance.', adapted: {} }),
  X('seated-hinge', { name: 'Seated hip hinge', group: 'lower', steps: ['Sit tall near the front of a chair, feet flat.', 'Keeping your back long, lean forwards from your hips.', 'Sit back up tall by squeezing your bottom.'], cues: ['Long back', 'Move from the hips'], easier: 'A smaller lean.', harder: 'Hold a light bag at your chest.', adapted: {} }),

  // Upper body
  X('push-up', { name: 'Push-up (pick your level)', group: 'upper', steps: ['Hands a little wider than your shoulders, body in a straight line.', 'Lower your chest towards the surface with elbows angled back at about 45 degrees.', 'Push away until your arms are straight.'], cues: ['Brace your tummy', 'Squeeze your bottom', 'Do not let your hips sag'], easier: 'Wall, then kitchen bench, then knees on the floor.', harder: 'Full push-up, then feet up on a chair.', adapted: { shoulder: 'Stay on the wall or bench, keep elbows close and use a smaller range.', seated: 'Wall push-up.' } }),
  X('wall-push-up', { name: 'Wall push-up', group: 'upper', steps: ['Stand an arm’s length from a wall, hands on the wall at chest height.', 'Bend your elbows to bring your chest towards the wall.', 'Push back to the start.'], cues: ['Body in a straight line', 'Elbows angled back'], easier: 'Stand closer to the wall.', harder: 'Step further back, or move to a bench.', adapted: { shoulder: 'Keep elbows close and the range comfortable.' } }),
  X('backpack-row', { name: 'Backpack row', group: 'upper', steps: ['Hold a backpack with some books or bottles in it.', 'Put one hand and one knee on a chair or bench, back long and flat.', 'Pull the bag towards your lower ribs, squeeze your shoulder blade back, then lower slowly. Swap sides.'], cues: ['Pull with your elbow', 'Shoulders away from your ears'], easier: 'A lighter bag, or towel pull-aparts.', harder: 'A heavier bag, or a 2-second squeeze at the top.', adapted: { back: 'Always use the supported version with a hand and knee on the chair.', shoulder: 'A light bag and a comfortable range.', seated: 'Use towel pull-aparts instead.' }, caution: 'Do not use door straps or table rows unless an exercise physiologist has checked your set-up.' }),
  X('towel-pull-apart', { name: 'Towel pull-apart', group: 'upper', steps: ['Hold a towel with both hands at chest height, arms straight.', 'Pull your hands outwards as if trying to stretch the towel, squeezing your shoulder blades together.', 'Hold 3 seconds, then relax.'], cues: ['Shoulders down', 'Squeeze between your shoulder blades'], easier: 'A softer pull.', harder: 'Hold for 5 seconds.', adapted: {} }),
  X('prone-y-t', { name: 'Y and T raises', group: 'upper', steps: ['Lie face down with your forehead on a folded towel.', 'With arms overhead in a Y shape, lift your thumbs a little, squeezing between your shoulder blades. Lower.', 'Repeat with your arms out to the sides in a T shape.'], cues: ['Small lift', 'Neck relaxed'], easier: 'Lean forwards in a chair and make the same shapes.', harder: 'Hold each lift for 3 seconds.', adapted: { seated: 'Lean forwards in the chair and make the same shapes.', shoulder: 'T shape only, small range.' } }),
  X('overhead-press', { name: 'Overhead press', group: 'upper', steps: ['Stand tall holding a backpack or two water bottles at shoulder height.', 'Press up until your arms are straight, keeping your ribs down.', 'Lower with control.'], cues: ['Squeeze your bottom and tummy', 'Do not lean back'], easier: 'Lighter bottles, or seated.', harder: 'Heavier load, or one arm at a time.', adapted: { shoulder: 'Skip this, or press only to forehead height.', back: 'Do it seated with your back supported.' } }),

  // Core
  X('dead-bug', { name: 'Dead bug', group: 'core', steps: ['Lie on your back with arms pointing at the ceiling and knees bent at 90 degrees.', 'Gently press your lower back into the floor.', 'Slowly lower one heel to tap the floor, then bring it back. Alternate sides.'], cues: ['Lower back stays down', 'Move slowly, breathe out as you lower'], easier: 'Feet start on the floor and slide one heel out at a time.', harder: 'Reach the opposite arm back at the same time, or straighten the leg further.', adapted: { seated: 'Use seated bracing instead.' } }),
  X('bird-dog', { name: 'Bird dog', group: 'core', steps: ['Start on your hands and knees.', 'Reach one arm forwards and the opposite leg back until both are level with your body.', 'Hold 2 seconds and return. Alternate sides.'], cues: ['Imagine a glass of water balanced on your lower back'], easier: 'Arm only, or leg only.', harder: 'Hold for 5 seconds, or draw elbow to knee between reps.', adapted: { knee: 'Put a folded towel under your knees, or use seated bracing instead.', seated: 'Use seated bracing instead.' } }),
  X('side-plank', { name: 'Side plank', group: 'core', steps: ['Lie on your side with your elbow under your shoulder and knees bent.', 'Lift your hips so your body is straight from knees to head.', 'Hold 15–30 seconds, then swap sides.'], cues: ['Hips forward, not sagging', 'Breathe normally'], easier: 'Shorter holds.', harder: 'Legs straight, then lift the top leg.', adapted: { shoulder: 'Use a standing side lean against a wall instead.', seated: 'Seated side bend.' } }),
  X('standing-side-lean', { name: 'Standing side lean', group: 'core', steps: ['Stand side-on to a wall, forearm on the wall at shoulder height, feet a little away.', 'Brace your tummy and hold your body in a straight line.', 'Hold 15–30 seconds, then swap sides.'], cues: ['Hips forward', 'Do not shrug'], easier: 'Feet closer to the wall.', harder: 'Feet further away.', adapted: {} }),
  X('seated-brace', { name: 'Seated bracing', group: 'core', steps: ['Sit tall near the front of a chair.', 'Gently tighten your tummy as if bracing for a light poke, while breathing normally.', 'Hold 10 seconds while lifting one foot slightly, then swap.'], cues: ['Breathe throughout', 'Stay tall'], easier: 'Brace without lifting a foot.', harder: 'Reach one arm forwards while lifting the opposite foot.', adapted: {} }),
  X('seated-side-bend', { name: 'Seated side bend', group: 'core', steps: ['Sit tall with feet flat.', 'Slide one hand down the side of the chair, bending sideways a little.', 'Come back up using the muscles on the other side. Alternate.'], cues: ['Bend sideways, not forwards'], easier: 'A smaller bend.', harder: 'Hold a light bottle in the reaching hand.', adapted: {} }),

  // Cardio
  X('brisk-walk', { name: 'Brisk walk', group: 'cardio', steps: ['Walk at a pace where you can talk but would not want to sing.', 'Stand tall and let your arms swing.', 'Add hills or stairs to make it harder.'], cues: ['Talk test: talking is fine, singing is hard'], easier: 'A slower pace, with rests.', harder: 'Hills, stairs, or faster stretches.', adapted: { seated: 'Use the seated cardio circuit.', knee: 'Flat ground, good shoes. Water walking or a bike are good options.', hip: 'Flat ground, shorter steps.' } }),
  X('low-impact-circuit', { name: 'Low-impact home circuit', group: 'cardio', steps: ['Do each move for 40 seconds, then go to the next.', 'Knee lifts on the spot, step-ups on the bottom stair, knee to opposite elbow, shadow boxing, side steps with arm reaches.', 'Repeat the circuit until the timer ends.'], cues: ['Keep moving, keep breathing', 'Make it smaller if you need a breather'], easier: 'Rest for 20 seconds between moves.', harder: 'Bigger moves and faster pace.', adapted: { knee: 'Skip the step-ups. Keep knee lifts low.', back: 'Keep shadow boxing gentle, with no twisting jabs.' } }),
  X('seated-cardio', { name: 'Seated cardio circuit', group: 'cardio', steps: ['Sit tall near the front of a sturdy chair.', 'Do each move for 40 seconds: seated march, seated punches, alternate knee lifts, arm circles, heel taps.', 'Repeat until the timer ends.'], cues: ['Sit tall', 'Breathe out with effort'], easier: 'Rest 20 seconds between moves.', harder: 'Faster pace and bigger arm moves.', adapted: {} }),
  X('high-impact', { name: 'Higher-impact intervals', group: 'cardio', impact: 'high', steps: ['Advanced only. Jog on the spot, skaters, squat jumps or burpees.', 'Land softly through your whole foot.', 'Step back instead of jumping if your knees or wrists complain.'], cues: ['Soft landings', 'Quality over speed'], easier: 'Use the low-impact circuit.', harder: 'Longer work intervals.', adapted: { back: 'Use the low-impact circuit.', knee: 'Use the low-impact circuit.', hip: 'Use the low-impact circuit.', seated: 'Use the seated cardio circuit.' } }),

  // Mobility and balance
  X('cat-cow', { name: 'Cat–cow', group: 'mobility', steps: ['On hands and knees (or seated, hands on knees).', 'Breathe in and gently arch your back, lifting your chest.', 'Breathe out and round your back, tucking your chin.'], cues: ['Move with your breath', 'Gentle range'], easier: 'Seated version.', harder: 'Slow it right down.', adapted: { knee: 'Use the seated version.', seated: 'Seated: hands on knees, arch then round.' } }),
  X('open-book', { name: 'Open book', group: 'mobility', steps: ['Lie on your side with knees bent and arms out in front.', 'Open your top arm up and across to the other side, following it with your eyes.', 'Return slowly. Do 6–8, then swap sides.'], cues: ['Knees stay together', 'Only go as far as is comfortable'], easier: 'A smaller arc.', harder: 'Pause at the end and breathe out.', adapted: { shoulder: 'Keep the arm bent and the arc small.', seated: 'Seated rotation instead.' } }),
  X('lunge-reach', { name: 'Lunge with a reach', group: 'mobility', steps: ['Step into a lunge, hands on your front thigh or a chair.', 'Place the inside hand down (or on the chair) and rotate the other arm up to the ceiling.', 'Return and swap sides.'], cues: ['Long spine', 'Rotate from your upper back'], easier: 'Do it standing, holding a chair.', harder: 'Back knee off the floor.', adapted: { knee: 'Standing version with a chair, no kneeling.', hip: 'Short stance, standing version.', seated: 'Seated rotation instead.' } }),
  X('seated-rotation', { name: 'Seated rotation', group: 'mobility', steps: ['Sit tall with arms crossed over your chest.', 'Turn your upper body to one side, as far as is comfortable.', 'Return and turn the other way.'], cues: ['Hips stay facing forwards', 'Grow taller as you turn'], easier: 'Smaller turn.', harder: 'Pause and breathe out at the end of each turn.', adapted: {} }),
  X('hip-90-90', { name: 'Hip switches', group: 'mobility', steps: ['Sit on the floor with knees bent and feet wider than your hips, hands behind you.', 'Let both knees drop to one side, then the other.', 'Keep it slow and comfortable.'], cues: ['Sit tall if you can'], easier: 'Seated in a chair, rock both knees side to side.', harder: 'Hands off the floor.', adapted: { hip: 'Use knee hugs instead.', seated: 'Rock both knees side to side in the chair.' } }),
  X('thread-needle', { name: 'Thread the needle', group: 'mobility', steps: ['On hands and knees, slide one arm under your body along the floor.', 'Let your shoulder and the side of your head rest down.', 'Return and reach that arm up to the ceiling. Swap sides.'], cues: ['Slow and gentle'], easier: 'Smaller range.', harder: 'Hold for 3 breaths at each end.', adapted: { knee: 'Use seated rotation instead.', shoulder: 'Use chin tucks and shoulder rolls instead.' } }),
  X('single-leg-stand', { name: 'Single-leg balance', group: 'mobility', steps: ['Stand next to a bench or wall.', 'Lift one foot off the floor and balance for up to 30 seconds.', 'Swap legs. Progress from hands on, to fingertips, to no hands.'], cues: ['Soft standing knee', 'Eyes on a fixed point'], easier: 'Keep a hand on the bench.', harder: 'Eyes closed (advanced, near support).', adapted: { seated: 'Seated: lift both feet slightly and balance on your sit bones for 10 seconds.' } }),
  X('heel-toe-walk', { name: 'Heel-to-toe walk', group: 'mobility', steps: ['Walk along a hallway, placing one heel directly in front of the other toes.', 'Use the wall for support if you need it.', 'Turn and walk back.'], cues: ['Look ahead, not at your feet'], easier: 'Hand on the wall.', harder: 'Walk slowly backwards (near support).', adapted: { seated: 'Seated: tap heel then toe in a line in front of you.' } }),
  X('chin-tuck', { name: 'Chin tucks and shoulder rolls', group: 'mobility', steps: ['Sit or stand tall.', 'Gently glide your chin straight back, as if making a double chin. Hold 3 seconds. Do 8.', 'Roll your shoulders back and down 8 times.'], cues: ['Small movement', 'Eyes stay level'], easier: 'Fewer reps.', harder: 'Hold each tuck for 5 seconds.', adapted: {} }),
  X('childs-pose', { name: 'Rest pose', group: 'mobility', steps: ['Kneel and sit back towards your heels, arms forwards on the floor.', 'Let your forehead rest down and breathe slowly.', 'Stay for 4–6 breaths.'], cues: ['Relax your shoulders'], easier: 'A cushion between your heels and bottom.', harder: 'Walk your hands to each side.', adapted: { knee: 'Lie on your back and hug your knees instead.', hip: 'Lie on your back and hug your knees instead.', seated: 'Seated: lean forwards, forearms on your thighs, and breathe.' } }),
  X('knee-hug', { name: 'Knee hug', group: 'mobility', steps: ['Lie on your back.', 'Gently draw one or both knees towards your chest.', 'Hold for 4–6 slow breaths.'], cues: ['Relax your shoulders and neck'], easier: 'One knee at a time.', harder: 'Gently rock side to side.', adapted: {} }),
]));

/** Which exercise replaces which on each adapted track. Not listed = same exercise with the track's note. */
export const TRACK_SWAPS = Object.freeze({
  standard: {},
  seated: {
    squat: 'sit-to-stand', 'split-squat': 'seated-knee-extension', 'step-up': 'seated-knee-extension', 'glute-bridge': 'seated-knee-lift',
    'hip-hinge': 'seated-hinge', 'push-up': 'wall-push-up', 'backpack-row': 'towel-pull-apart', 'dead-bug': 'seated-brace', 'bird-dog': 'seated-brace',
    'side-plank': 'seated-side-bend', 'calf-raise': 'seated-heel-raise', 'brisk-walk': 'seated-cardio', 'low-impact-circuit': 'seated-cardio',
    'high-impact': 'seated-cardio', 'open-book': 'seated-rotation', 'lunge-reach': 'seated-rotation', 'hip-90-90': 'seated-knee-lift',
    'thread-needle': 'chin-tuck', 'heel-toe-walk': 'seated-heel-raise', 'single-leg-stand': 'seated-brace', 'childs-pose': 'breathing', 'easy-walk': 'march',
  },
  back: { 'high-impact': 'low-impact-circuit' },
  knee: { squat: 'box-squat', 'split-squat': 'glute-bridge', 'high-impact': 'low-impact-circuit', 'childs-pose': 'knee-hug', 'thread-needle': 'seated-rotation', 'bird-dog': 'seated-brace' },
  hip: { squat: 'box-squat', 'split-squat': 'standing-hip-abduction', 'high-impact': 'low-impact-circuit', 'hip-90-90': 'knee-hug', 'lunge-reach': 'seated-rotation', 'childs-pose': 'knee-hug' },
  shoulder: { 'push-up': 'wall-push-up', 'overhead-press': 'towel-pull-apart', 'side-plank': 'standing-side-lean', 'thread-needle': 'chin-tuck' },
});

/* ------------------------------------------------------------------ */
/* 30-Minute Move: warm-up, cool-down and the weekly rotation          */
/* ------------------------------------------------------------------ */
export const WARMUP = Object.freeze({ minutes: 5, items: [
  { id: 'march', seconds: 60 }, { id: 'arm-circles', seconds: 60 }, { id: 'hip-circles', seconds: 60 },
  { id: 'sit-to-stand', reps: 8, seconds: 45 }, { id: 'hip-hinge', reps: 8, seconds: 45 }, { id: 'ankle-rocks', seconds: 30 },
] });
export const COOLDOWN = Object.freeze({ minutes: 5, items: [
  { id: 'easy-walk', seconds: 60 }, { id: 'calf-stretch', seconds: 50 }, { id: 'hip-flexor-stretch', seconds: 50 },
  { id: 'hamstring-stretch', seconds: 50 }, { id: 'chest-opener', seconds: 30 }, { id: 'breathing', seconds: 60 },
] });

/** day: 0 = Sunday … 6 = Saturday (Brisbane). kind decides how the main block is timed. */
export const WORKOUTS = Object.freeze([
  { id: 'gentle-recovery', day: 0, kind: 'gentle', title: 'Gentle Recovery', purpose: 'Rest, sleep and a mood check-in. An easy walk, gentle stretches and slow breathing.', mainMinutes: 20,
    main: [{ id: 'easy-walk', seconds: 900 }, { id: 'cat-cow', seconds: 90 }, { id: 'knee-hug', seconds: 90 }, { id: 'breathing', seconds: 120 }] },
  { id: 'strength-a', day: 1, kind: 'strength', title: 'Strength A', purpose: 'Legs, push and core. Guideline strength day 1.', mainMinutes: 20,
    main: [{ id: 'squat' }, { id: 'push-up' }, { id: 'glute-bridge' }, { id: 'dead-bug' }, { id: 'side-plank', hold: true }, { id: 'calf-raise' }] },
  { id: 'cardio-steady', day: 2, kind: 'cardio', title: 'Cardio: steady', purpose: 'Heart and lungs. 20 minutes at a talk-test pace.', mainMinutes: 20,
    main: [{ id: 'brisk-walk', seconds: 1200, alt: 'low-impact-circuit' }] },
  { id: 'mobility', day: 3, kind: 'mobility', title: 'Mobility and Balance', purpose: 'Joints, balance and posture. Two rounds, 45 seconds each.', mainMinutes: 20,
    main: [{ id: 'cat-cow', seconds: 45 }, { id: 'open-book', seconds: 45 }, { id: 'lunge-reach', seconds: 45 }, { id: 'hip-90-90', seconds: 45 }, { id: 'thread-needle', seconds: 45 }, { id: 'single-leg-stand', seconds: 60 }, { id: 'heel-toe-walk', seconds: 45 }, { id: 'chin-tuck', seconds: 45 }, { id: 'childs-pose', seconds: 45 }], rounds: 2 },
  { id: 'strength-b', day: 4, kind: 'strength', title: 'Strength B', purpose: 'Hinge, pull and core. Guideline strength day 2.', mainMinutes: 20,
    main: [{ id: 'split-squat' }, { id: 'hip-hinge' }, { id: 'backpack-row' }, { id: 'prone-y-t' }, { id: 'bird-dog' }, { id: 'step-up' }] },
  { id: 'cardio-intervals', day: 5, kind: 'intervals', title: 'Cardio: intervals', purpose: 'Fitness. Faster bursts with easy recovery. Beginners keep it steady with short pick-ups.', mainMinutes: 20,
    main: [{ id: 'low-impact-circuit', alt: 'brisk-walk' }],
    intervals: { beginner: { work: 60, rest: 180, rounds: 5, label: '5 × 1 minute a bit faster, 3 minutes easy' }, intermediate: { work: 40, rest: 80, rounds: 10, label: '10 × 40 seconds brisk, 80 seconds easy' }, advanced: { work: 40, rest: 20, rounds: 20, label: '20 × 40 seconds hard, 20 seconds easy (jumping options allowed)', alt: 'high-impact' } } },
  { id: 'your-choice', day: 6, kind: 'choice', title: 'Your Choice', purpose: 'Enjoy moving: a walk, swim, bike ride, dance, sport or play. Advanced can do Strength C.', mainMinutes: 20,
    options: ['A walk somewhere you like', 'A swim or water walking (easy on joints)', 'A bike ride', 'Dancing in the lounge room', 'Kicking a ball with the kids', 'Strength C (advanced)'],
    main: [{ id: 'brisk-walk', seconds: 1200 }] },
  { id: 'strength-c', day: 6, kind: 'strength', advancedOnly: true, title: 'Strength C (advanced)', purpose: 'An optional third strength day for advanced members.', mainMinutes: 20,
    main: [{ id: 'squat' }, { id: 'overhead-press' }, { id: 'split-squat' }, { id: 'push-up' }, { id: 'side-plank', hold: true }] },
]);
export const ROTATION_RULES = Object.freeze([
  'Move days around to suit your week. Try not to do strength on two days in a row for the same muscles.',
  'Keep at least one gentle day each week.',
  'Missing a day is normal. Pick up where you left off.',
]);
export const OVERDOING_IT = Object.freeze({
  title: 'Looking after yourself',
  text: 'If you have felt run down, slept badly, felt lower in mood or had a niggle that will not settle for about two weeks, take an easier week and talk to your GP. Hopewick never counts calories or tracks weight. If you feel you have to exercise to make up for eating, the Butterfly Foundation can help on 1800 33 4673.',
});

/* ------------------------------------------------------------------ */
/* Heat and cold protocols (Plus, after the safety screen)             */
/* ------------------------------------------------------------------ */
export const PROTOCOLS = Object.freeze({
  sauna: {
    id: 'sauna', title: 'Sauna', kind: 'sauna',
    intro: 'A traditional dry sauna. Start low and short, and build up over weeks. You can always leave early, and that still counts.',
    stages: [
      { id: 'sauna-start', label: 'Start (weeks 1–2)', temp: 'Lower bench, about 60–70 °C', minutes: [5, 10], rounds: 1, frequency: '1–2 times a week', next: 'It feels comfortable and you feel normal within 10 minutes of finishing.' },
      { id: 'sauna-build', label: 'Build (weeks 3–6)', temp: '70–80 °C', minutes: [10, 15], rounds: 2, frequency: '2–3 times a week', next: 'Same as above, with no dizziness.' },
      { id: 'sauna-regular', label: 'Regular', temp: '70–90 °C', minutes: [15, R.saunaMaxMinutesPerRound], rounds: R.saunaMaxRounds, frequency: '2–4 times a week', next: 'Stay here. There is no need to go hotter or longer.' },
    ],
    steps: [
      'Do the safety check in the app first.',
      'Drink a glass of water and have a quick shower.',
      'Sit on a towel on the lower bench and start the timer.',
      'Breathe normally. Too hot? Move down a bench or leave.',
      'When the timer ends, sit for 30 seconds, then stand up slowly holding the rail.',
      'Cool down for 5–10 minutes in fresh air or under a cool (not icy) shower, sitting down.',
      'Drink one or two glasses of water, then do your quick mood check.',
    ],
    timing: 'Fine after training once you have cooled down and had a drink. Avoid it just before a hard session or a long drive.',
    infrared: 'Infrared saunas run cooler (about 45–60 °C) and have much less research. Use the same time limits.',
  },
  cold: {
    id: 'cold', title: 'Cold water', kind: 'cold',
    intro: `Start with a cold finish to a warm shower and build up over weeks. Hopewick will not guide water colder than ${R.coldFloorC} °C. Never get into a plunge or ice bath alone.`,
    stages: [
      { id: 'cold-shower', label: 'Start (weeks 1–2): cold finish to a shower', temp: 'Coldest tap setting (in Brisbane often 18–25 °C)', seconds: [15, 60], frequency: '2–4 times a week', next: 'Your breathing settles within about 30 seconds.', solo: true },
      { id: 'cold-step', label: 'Step up (weeks 3–4)', temp: 'About 15 °C', seconds: [30, 60], frequency: '2–3 times a week', next: 'Calm breathing, no numbness, and warm again within 15 minutes.' },
      { id: 'cold-regular', label: 'Regular', temp: `${R.coldFloorC}–15 °C, no colder`, seconds: [60, 180], maxSeconds: R.coldMaxMinutes * 60, frequency: '2–4 times a week', next: 'Stay here. Colder and longer are not the goal.' },
      { id: 'cold-soreness', label: 'After hard cardio or sport (optional)', temp: '11–15 °C', seconds: [300, 600], frequency: 'After hard cardio or sport, not strength days', next: 'Only if you are already comfortable at 5 minutes.' },
    ],
    steps: [
      'Do the safety check: no alcohol or drugs, your support person is with you, and you know the water temperature.',
      'Have a towel, warm clothes and a beanie ready. Take off jewellery.',
      'Sit on the edge and splash water on your wrists and neck.',
      'Lower yourself in slowly, feet first, to chest or shoulder height. Keep your head and face out.',
      'Expect a gasp. Breathe out slowly, like blowing through a straw. Do not hold your breath.',
      'Stay calm and still while the timer runs. Get out early if you shiver hard, cannot feel your fingers, or feel dizzy or panicky.',
      'Climb out carefully, dry off, dress warmly and move gently for 5–10 minutes. Sit down if you feel light-headed.',
      'Do your quick mood check.',
    ],
    supportScript: 'Support person: stay within arm’s reach, watch their face and breathing, help them out if they are gasping and cannot settle, seem confused or do not respond, and call 000 if they collapse.',
    timing: `Keep cold water at least ${R.strengthColdGapHours} hours away from a strength session, ideally on cardio, mobility or rest days. Cold water straight after strength training can reduce strength and muscle gains. Morning or early afternoon suits most people.`,
  },
  contrast: {
    id: 'contrast', title: 'Contrast (sauna and cool)', kind: 'contrast',
    intro: 'An option for recovery days if you enjoy it, once you are comfortable at the Regular stage of both the sauna and cold protocols. Not for anyone with a heart, blood pressure, fainting or Raynaud’s flag.',
    stages: [
      { id: 'contrast-regular', label: 'Contrast rounds', temp: `Sauna 70–85 °C, then a cool shower or ${R.coldFloorC}–15 °C plunge`, rounds: R.contrastMaxRounds, frequency: '1–2 times a week, not within 6 hours after strength', next: `Up to ${R.contrastMaxRounds} rounds, and no more than ${R.contrastMaxSaunaMinutes} minutes of sauna in total.` },
    ],
    round: [
      { label: 'Sauna', minutes: [10, 15] },
      { label: 'Sit for 30 seconds, stand slowly, walk to the cool area', minutes: [1, 1] },
      { label: 'Cool shower, or plunge with your support person', seconds: [30, 120] },
      { label: 'Rest in fresh air, warm up naturally and sip water', minutes: [5, 10] },
    ],
    steps: [
      'Do the safety check, including your support person if you will use a plunge.',
      'Sauna for 10–15 minutes.',
      'Sit for 30 seconds, stand up slowly and walk carefully to the cool area.',
      'Cool shower, or plunge for 30 seconds to 2 minutes with your support person there.',
      'Rest for 5–10 minutes and let your body warm up naturally. Sip water.',
      `Repeat up to ${R.contrastMaxRounds} rounds. Finish whichever way you prefer.`,
    ],
    timing: 'Cardio, mobility or rest days. Not within 6 hours after a strength session.',
  },
});
export const SLEEP_TIP = 'For sleep, a warm bath or shower (about 40–42 °C) one to two hours before bed has the best evidence. Cold water tends to wake you up, so it suits mornings.';

/* ------------------------------------------------------------------ */
/* Plus weekly drops. Dates come from FITNESS_PLUS_START (YYYY-MM-DD,  */
/* Brisbane): week 1 opens on that date, week 2 seven days later, etc. */
/* Unset = everything open (preview). Safety rules are never scheduled.*/
/* ------------------------------------------------------------------ */
export const RELEASES = Object.freeze([
  { week: 1, id: 'move-start', title: '30-Minute Move: start here + beginner week + movement safety questions', unlocks: ['program', 'level:beginner', 'track:standard'] },
  { week: 2, id: 'move-levels', title: 'Intermediate and advanced levels', unlocks: ['level:intermediate', 'level:advanced'] },
  { week: 3, id: 'move-adapted', title: 'Adapted tracks: seated, back, knee, hip and shoulder', unlocks: ['track:seated', 'track:back', 'track:knee', 'track:hip', 'track:shoulder'] },
  { week: 4, id: 'move-mobility', title: 'Mobility and Balance, Gentle Recovery and the warm-shower sleep routine', unlocks: ['workout:mobility', 'workout:gentle-recovery'] },
  { week: 5, id: 'heatcold-safety', title: 'Heat and cold: safety questions', unlocks: ['screen:heat-cold'] },
  { week: 6, id: 'protocol-sauna', title: 'Sauna protocol', unlocks: ['protocol:sauna'] },
  { week: 7, id: 'protocol-cold', title: 'Cold water protocol', unlocks: ['protocol:cold'] },
  { week: 8, id: 'protocol-contrast', title: 'Contrast protocol', unlocks: ['protocol:contrast'] },
]);

/** Brisbane days since start (start day = 0). */
function daysSince(start, today) {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}
/** The set of unlock keys open today, or null when every drop is open (no start date set). */
export function openUnlocks(env = process.env, today) {
  const start = String(env.FITNESS_PLUS_START || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const d = daysSince(start, today);
  const set = new Set();
  for (const r of RELEASES) if (d >= (r.week - 1) * 7) for (const u of r.unlocks) set.add(u);
  return set;
}
export function isOpen(unlocks, key) {
  if (!unlocks) return true;
  if (unlocks.has(key)) return true;
  // Workouts other than the two scheduled later open with the program in week 1.
  if (key.startsWith('workout:') && !['workout:mobility', 'workout:gentle-recovery'].includes(key)) return unlocks.has('program');
  return false;
}
export function releaseSchedule(env = process.env, today) {
  const start = String(env.FITNESS_PLUS_START || '').trim();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start);
  return RELEASES.map((r) => {
    let date = null;
    if (valid) { const t = new Date(`${start}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + (r.week - 1) * 7); date = t.toISOString().slice(0, 10); }
    return { week: r.week, id: r.id, title: r.title, plusDate: date, open: !valid || daysSince(start, today) >= (r.week - 1) * 7, newThisWeek: valid && daysSince(start, today) >= (r.week - 1) * 7 && daysSince(start, today) < r.week * 7 };
  });
}
