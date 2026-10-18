/* Hopewick 2.0 Stage 3: coping toolkit content.
 *
 * General, non-clinical self-help. Not therapy, not medical advice. Wording is
 * cautious and reflects widely published guidance (see docs/CONTENT-SOURCES.md,
 * which lists sources per tool for clinical review before launch).
 * Keys must match COPING_TOOLS in server/wellbeing/validate.js.
 *
 * Step fields: title, text, optional seconds (a gentle timer), optional
 * breath: { in, hold, out, hold2, rounds } for the animated breathing guide.
 */
window.HW_COPING_TOOLS = Object.freeze([
  {
    key: 'breathing-box', type: 'breathing', icon: 'lungs', title: 'Box breathing',
    short: 'Breathe in a steady square: in, hold, out, hold.', minutes: 3, tags: ['anxiety', 'stress', 'cravings'],
    intro: 'Slow, even breathing can help your body settle when you feel tense or wound up. Breathe through your nose if that is comfortable. Stop if you feel dizzy and go back to normal breathing.',
    breath: { in: 4, hold: 4, out: 4, hold2: 4, rounds: 6 },
    steps: [
      { title: 'Get comfortable', text: 'Sit or stand with your feet on the floor. Let your shoulders drop. You can close your eyes or look at one spot.' },
      { title: 'Breathe with the square', text: 'Breathe in for 4, hold for 4, breathe out for 4, hold for 4. Follow the circle, or count in your head.', breathe: true },
      { title: 'Notice', text: 'Let your breathing go back to normal. Notice how your body feels now, without judging it.' },
    ],
  },
  {
    key: 'breathing-calm', type: 'breathing', icon: 'lungs', title: 'Calm breathing (longer out-breath)',
    short: 'Breathe in for 4, out for 6. Good for winding down.', minutes: 3, tags: ['anxiety', 'stress', 'sleep'],
    intro: 'Making your out-breath a little longer than your in-breath is a simple way to slow down. Keep it gentle: you should not feel short of air. Stop if you feel light-headed.',
    breath: { in: 4, hold: 0, out: 6, hold2: 0, rounds: 8 },
    steps: [
      { title: 'Settle', text: 'Put one hand on your belly if you like. Let your jaw and shoulders soften.' },
      { title: 'Breathe in 4, out 6', text: 'Breathe in through your nose for 4. Breathe out slowly, as if through a straw, for 6.', breathe: true },
      { title: 'Come back', text: 'Let your breath find its own pace. Take a moment before you move on.' },
    ],
  },
  {
    key: 'grounding-54321', type: 'grounding', icon: 'leaf', title: '5-4-3-2-1 grounding',
    short: 'Use your senses to come back to the present.', minutes: 4, tags: ['anxiety', 'hard', 'cravings'],
    intro: 'When thoughts are racing or feelings are big, noticing what is around you can help you feel more here and now. Go at your own pace. There are no wrong answers.',
    steps: [
      { title: '5 things you can see', text: 'Look around and name five things you can see. Small things count: a mark on the wall, the colour of a cup.' },
      { title: '4 things you can feel', text: 'Notice four things you can feel: your feet on the floor, your back on the chair, the air on your skin, your clothes.' },
      { title: '3 things you can hear', text: 'Listen for three sounds. Near or far, loud or quiet.' },
      { title: '2 things you can smell', text: 'Notice two smells. If you cannot smell anything, name two smells you like.' },
      { title: '1 thing you can taste', text: 'Notice one taste, or take a sip of water and notice that.' },
      { title: 'Check in', text: 'Take one slow breath. Notice if anything has shifted, even a little.' },
    ],
  },
  {
    key: 'urge-surfing', type: 'urge_surfing', icon: 'wave', title: 'Urge surfing',
    short: 'Ride a craving like a wave. It rises, peaks and passes.', minutes: 5, tags: ['cravings'],
    intro: 'Cravings usually build, peak and fade, often within 20 to 30 minutes, even if it does not feel that way. Urge surfing means noticing the urge with curiosity instead of fighting it or acting on it. If you are in danger of using in a way that could hurt you, use Get help now.',
    steps: [
      { title: 'Notice the urge', text: 'Say to yourself: "I am having an urge." Rate how strong it is from 0 to 10.' },
      { title: 'Find it in your body', text: 'Where do you feel it? Chest, stomach, mouth, hands? Notice what it feels like: tight, warm, buzzing.' },
      { title: 'Breathe with it', text: 'Breathe slowly. Picture the urge as a wave. You do not have to do anything except watch it.', seconds: 60 },
      { title: 'Watch it change', text: 'Notice how the feeling shifts, even a little. Waves rise and fall. Keep breathing.', seconds: 60 },
      { title: 'Rate it again', text: 'Rate the urge from 0 to 10 again. Whatever the number, you rode it this far.' },
      { title: 'Next small thing', text: 'Choose something for the next 10 minutes: a glass of water, a walk, texting someone, a circuit breaker.' },
    ],
  },
  {
    key: 'muscle-relaxation', type: 'muscle_relaxation', icon: 'body', title: 'Progressive muscle relaxation',
    short: 'Gently tense and release, one part of the body at a time.', minutes: 8, tags: ['stress', 'anxiety', 'sleep'],
    intro: 'Tensing a muscle for a few seconds and then letting it go can help you notice and release tension. Use gentle effort, about half your strength. Skip any area that is injured or painful, and stop if anything hurts.',
    steps: [
      { title: 'Hands and arms', text: 'Make fists and tighten your arms for about 5 seconds. Then let go and notice the difference for 10 seconds.', seconds: 15 },
      { title: 'Shoulders', text: 'Lift your shoulders towards your ears for about 5 seconds. Let them drop and rest for 10 seconds.', seconds: 15 },
      { title: 'Face', text: 'Scrunch your face gently for about 5 seconds. Release, and let your jaw hang loose.', seconds: 15 },
      { title: 'Belly', text: 'Tighten your stomach muscles for about 5 seconds. Release and breathe out slowly.', seconds: 15 },
      { title: 'Legs and feet', text: 'Press your feet into the floor and tighten your legs for about 5 seconds. Let go.', seconds: 15 },
      { title: 'Whole body', text: 'Take a slow breath and notice your whole body. Let any leftover tension go on the out-breath.' },
    ],
  },
  {
    key: 'mindful-minute', type: 'mindfulness', icon: 'sun', title: 'A mindful minute',
    short: 'One minute of noticing, without judging.', minutes: 2, tags: ['stress', 'low', 'anxiety'],
    intro: 'Mindfulness means paying attention to the present moment on purpose, with kindness. Your mind will wander. That is normal: just bring it back.',
    steps: [
      { title: 'Arrive', text: 'Notice where you are. Feel your feet and where your body is supported.' },
      { title: 'Breath', text: 'Notice your breathing without changing it. When your mind wanders, gently come back to the breath.', seconds: 60 },
      { title: 'Kind words', text: 'Say something kind to yourself, like you would to a friend: "This is hard, and I am doing my best."' },
    ],
  },
  {
    key: 'thought-reframe', type: 'thought_reframe', icon: 'brain', title: 'Thought reframing',
    short: 'Look at an unhelpful thought from another angle.', minutes: 6, tags: ['low', 'anxiety', 'stress'],
    intro: 'Thoughts are not always facts. This exercise helps you slow a thought down and look for a more balanced view. Anything you type here stays on this screen and is not saved.',
    steps: [
      { title: 'Catch the thought', text: 'What is the thought that is bothering you? Write it down or just name it.', input: 'The thought' },
      { title: 'Notice the feeling', text: 'How does this thought make you feel, and how strong is the feeling from 0 to 10?', input: 'The feeling' },
      { title: 'Check the evidence', text: 'What supports this thought? What does not fit with it? What would you say to a friend thinking this?', input: 'Other side' },
      { title: 'A more balanced thought', text: 'Try a thought that is fair and believable, not just positive. For example: "I slipped, and I can still get back on track."', input: 'Balanced thought' },
      { title: 'Check again', text: 'How strong is the feeling now from 0 to 10? Any change counts.' },
    ],
  },
  {
    key: 'name-it', type: 'emotion_regulation', icon: 'heart', title: 'Name it to tame it',
    short: 'Name the feeling, find what it needs, choose a response.', minutes: 4, tags: ['hard', 'low', 'anxiety'],
    intro: 'Putting a feeling into words can make it a little easier to manage. This is about understanding the feeling, not getting rid of it.',
    steps: [
      { title: 'Name it', text: 'What are you feeling? Try one or two words: angry, sad, ashamed, lonely, scared, numb, restless.' },
      { title: 'Where is it?', text: 'Where do you notice it in your body, and how strong is it from 0 to 10?' },
      { title: 'What set it off?', text: 'What happened just before? Hungry, angry, lonely or tired (HALT) can make feelings louder.' },
      { title: 'What does it need?', text: 'Rest, food, company, space, comfort, or to be heard? Pick one small thing you can give it.' },
      { title: 'Choose a response', text: 'Decide one thing you will do next that fits your values, even if the feeling stays for a while.' },
    ],
  },
  {
    key: 'tipp', type: 'distress_tolerance', icon: 'snow', title: 'TIPP for intense moments', badge: 'DBT-informed',
    short: 'Temperature, intense movement, paced breathing, paired relaxation.', minutes: 6, tags: ['hard', 'cravings', 'anxiety'],
    intro: 'TIPP is a set of quick, body-based skills inspired by Dialectical Behaviour Therapy (DBT) for moments when emotions feel overwhelming. This is a self-help guide, not therapy. Cold water and hard exercise can affect your heart rate: skip those steps if you have a heart condition, an eating disorder, are pregnant, or have been told to avoid them, and check with your doctor if unsure.',
    steps: [
      { title: 'T: Temperature', text: 'If it is safe for you, splash cool (not freezing) water on your face or hold something cool for up to 30 seconds. Skip this if it is not right for you.' },
      { title: 'I: Intense movement', text: 'If you are able, move briskly for a short time: a fast walk, stairs, star jumps. Keep it within what is safe for your body.', seconds: 60 },
      { title: 'P: Paced breathing', text: 'Slow your breathing so the out-breath is longer than the in-breath, for example in for 4 and out for 6.', seconds: 60 },
      { title: 'P: Paired muscle relaxation', text: 'As you breathe in, gently tense a muscle group. As you breathe out, let it go and say "relax" in your head.', seconds: 45 },
      { title: 'Check in', text: 'How intense is the feeling now from 0 to 10? If you are still not safe, use Get help now or call 000.' },
    ],
  },
  {
    key: 'stop-skill', type: 'distress_tolerance', icon: 'hand', title: 'STOP before you act', badge: 'DBT-informed',
    short: 'Stop, take a step back, observe, proceed mindfully.', minutes: 3, tags: ['hard', 'cravings'],
    intro: 'STOP is a skill inspired by Dialectical Behaviour Therapy (DBT) for the moment just before you do something you might regret. This is a self-help guide, not therapy.',
    steps: [
      { title: 'S: Stop', text: 'Freeze for a moment. Do not react yet. You are in charge of what happens next.' },
      { title: 'T: Take a step back', text: 'Step back from the situation, even physically. Take one slow breath.' },
      { title: 'O: Observe', text: 'Notice what is happening around you and inside you. What are you thinking and feeling? What do you know for sure?' },
      { title: 'P: Proceed mindfully', text: 'Ask: what will make this better, not worse? What would the person I want to be do now? Then take that step.' },
    ],
  },
  {
    key: 'relapse-check', type: 'relapse_prevention', icon: 'shield', title: 'Relapse prevention check',
    short: 'Spot early warning signs and plan your next few hours.', minutes: 5, tags: ['cravings', 'hard'],
    intro: 'Lapses and relapses are common in recovery and do not erase your progress. This check helps you notice early warning signs and plan what to do. Your relapse and exit plans in Hopewick can hold the details.',
    steps: [
      { title: 'HALT check', text: 'Am I Hungry, Angry, Lonely or Tired right now? Pick one thing to help with it.' },
      { title: 'Warning signs', text: 'Have I noticed my usual warning signs lately: skipping routines, isolating, romanticising using, being around old places or people?' },
      { title: 'High-risk times', text: 'When is the next risky time or place for me? Can I avoid it, change it, or bring support?' },
      { title: 'My people', text: 'Who could I contact today: a friend, sponsor, counsellor, or a support line like the National Alcohol and Other Drug Hotline (1800 250 015)?' },
      { title: 'Next few hours', text: 'Write or think of a simple plan for the next few hours. Small and doable is best.' },
    ],
  },
  {
    key: 'stress-reset', type: 'stress_management', icon: 'cup', title: 'Five-minute stress reset',
    short: 'Pause, breathe, sort what you can and cannot control.', minutes: 5, tags: ['stress'],
    intro: 'Stress is the body getting ready to cope. A short reset can help you think more clearly about what to do next.',
    steps: [
      { title: 'Pause', text: 'Stop what you are doing. Drop your shoulders and unclench your jaw.' },
      { title: 'Three slow breaths', text: 'Take three slow breaths with a longer out-breath.', seconds: 30 },
      { title: 'Sort it', text: 'What is worrying you? Sort it into: things I can do something about, and things I cannot control right now.' },
      { title: 'One small action', text: 'Pick one small thing from the "can do" pile and decide when you will do it.' },
      { title: 'Look after your body', text: 'Water, food, a stretch, fresh air, or rest. Pick one.' },
    ],
  },
]);
