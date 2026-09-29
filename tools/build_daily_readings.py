#!/usr/bin/env python3
"""Build Hopewick's original daily readings.

Writes 365 Word-for-the-day entries and 365 Just-for-today entries, indexed by
non-leap month and day (1 January = 0 … 31 December = 364). 29 February reuses
28 February in the app. Prose is original, plain, and written for a hard
morning in recovery. It is not AA/NA literature, not a commercial devotional,
and not clinical advice.

The same pair is shown to everyone on that Brisbane date. Faith language is
optional inside the reading (prayer or a friend, God or the next kind step).
People who choose no faith content are not told they must believe.

Run from the repo root:
  python3 tools/build_daily_readings.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "app" / "data"

MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

# Distinctive copyrighted passages we must never emit. The shared idea of
# "one day at a time" is not itself a quotation.
BANNED = [
    "live through this day only",
    "not tackle my whole life problem",
    "william james",
    "i am but one in a universe",
    "adjust myself to what is",
    "strengthen my mind",
    "i will exercise my soul",
    "i will be agreeable",
    "talk low",
    "act courteously",
    "criticise not",
    "two pests",
    "quiet half hour",
    "i will be unafraid",
    "as i give to the world, the world will give to me",
    "god grant me the serenity",
    "accept the things i cannot change",
    "courage to change the things i can",
    "wisdom to know the difference",
    "we admitted we were powerless",
    "came to believe that a power greater",
    "made a decision to turn our will and our lives",
    "searching and fearless moral inventory",
    "admitted to god, to ourselves, and to another human being",
    "humbly asked him to remove our shortcomings",
    "made a list of all persons we had harmed",
    "made direct amends to such people",
    "continued to take personal inventory",
    "sought through prayer and meditation to improve our conscious contact",
    "having had a spiritual awakening",
    "just for today i will try to live",
    "just for today i will be happy",
    "we are not saints",
    "easy does it",
    "let go and let god",
    "first things first",
    "live and let live",
]


def lines(block: str) -> list[str]:
    return [ln.strip() for ln in block.strip().splitlines() if ln.strip()]


ORIGINALS = lines("""
Honesty
Patience
Courage
Willingness
Kindness
Rest
Hope
Humility
Connection
Gratitude
Boundaries
Presence
Enough
Begin
Breathe
Ask
Stay
Gentle
Truth
Pause
Trust
Show up
Small steps
Belonging
Forgiveness
Clarity
Steady
Openness
Care
Listen
Choice
Mercy
Progress
Simplicity
Support
Keep going
Soften
Morning
Light
Company
Return
Quiet
Strength
Accept
One step
Warmth
Release
Notice
Repair
Shelter
Practice
Ease
Reach
Ground
Fresh
Hold both
Share
Wait
Try again
Safe
Real
Slow
Here
Next
Room
Peace
Tender
Whole
Free
Together
Unlearn
Keep
Name it
Allow
Balance
Dignity
Neighbour
Dawn
Carry less
Undo
Welcome
Still
Little
Stay close
Renew
Honest ask
Spare
Return path
Companionship
This day
""")

NEW_WORDS = lines("""
Amends
Anger
Attention
Awe
Beauty
Become
Bend
Blessing
Body
Brave
Bridge
Calm
Candle
Change
Circle
Comfort
Commit
Compassion
Confidence
Consider
Continue
Courtesy
Curiosity
Daily
Dare
Daylight
Decide
Delight
Depend
Depth
Deserve
Detach
Direction
Doorway
Early
Earnest
Effort
Embrace
Emerge
Empty
Encourage
Endurance
Energy
Enter
Evening
Everyday
Face
Fair
Faith
Family
Fear
Fellowship
Flourish
Focus
Food
Footing
Forgive
Forward
Foundation
Fragile
Freedom
Friend
Fruit
Gather
Generous
Gift
Go gently
Goodwill
Grace
Grieve
Grounded
Grow
Guard
Guide
Habit
Hands
Harmony
Heal
Heart
Help
Hidden
Home
Honest
Honour
Hopeful
Humble
Humour
Hunger
Hush
Imagine
Integrity
Intention
Invite
Joy
Journey
Justice
Keep faith
Kind voice
Labour
Laugh
Lay down
Lean
Learn
Leave
Let be
Lift
Limit
Longing
Look up
Loose
Love
Margin
Meal
Meaning
Memory
Mend
Midday
Mirror
Modest
Moment
Music
Mystery
Nourish
Nudge
Offer
Old patterns
One thing
Open hands
Ordinary
Outside
Pain
Pardon
Path
Pay attention
Persist
Plan
Plenty
Praise
Prayer
Prepare
Present
Preserve
Promise
Protect
Purpose
Question
Receive
Reconcile
Recover
Redirect
Refresh
Refuge
Relax
Rely
Remain
Remember
Respect
Respond
Restore
Reverence
Rhythm
Right-size
Risk
Ritual
Routine
Sanctuary
Satisfy
Season
Self-kindness
Separate
Serene
Serve
Settle
Shade
Shame
Shape
Shift
Shine
Shoulder
Silence
Sincere
Sleep
Slip
Smile
Soothe
Sorry
Soul
Speak
Spirit
Story
Stretch
Stumble
Sufficient
Sun
Surrender
Tears
Tend
Thanks
Thirst
This hour
Thought
Today's page
Tone
Touch
Tranquil
Treasure
Trust again
Turn toward
Unburden
Understand
Unfold
Unite
Unplug
Unwind
Upright
Useful
Value
Venture
Voice
Walk
Wash
Water
Weave
Weep
Wide
Willing
Window
Wisdom
Within
Witness
Wonder
Worth
Wound
Write it down
Yes to help
Yield
Anchor
Arrival
Blanket
Clearing
Ember
Foothold
Harbour
Hearth
Lamp
Loyal
Rooted
Steadfast
Sunrise
Threshold
Unhurried
Haven
Gladness
Solace
Solidarity
Spacious
Second wind
Soft landing
Wholehearted
This breath
Plain speech
No hurry
True north
Bread
Door
Fireside
Footstep
Good enough
Halfway
Holding
Humane
Kindred
Lighter
Long view
Measured
Nearness
Night peace
Open heart
Plain day
Quiet mind
Reassurance
Root
Safe harbour
Simple care
Still here
Sunlight
Tenderness
This room
Unforced
Watchful
Well enough
With care
""")

# If the pool runs long, drop the least distinctive titles first.
DROP_IF_LONG = lines("""
Daily
Enter
Everyday
Face
Fair
Forward
Hidden
Honest
Labour
Leave
Loose
Midday
Moment
Outside
Plenty
Question
Remain
Season
Separate
Shine
Thought
Tone
Touch
Turn toward
Wide
Willing
Yield
Consider
Continue
Depend
Depth
Emerge
Empty
Energy
Flourish
Fruit
Gather
Guide
Habit
Harmony
Imagine
Invite
Margin
Memory
Modest
Mystery
Nudge
Offer
Pardon
Path
Persist
Plan
Prepare
Present
Purpose
Receive
Rely
Respond
Risk
Routine
Satisfy
Shape
Shift
Sorry
Stretch
Sun
Tend
Thirst
Useful
Venture
Voice
Walk
Wash
Weave
Window
Within
Wonder
Write it down
""")


def words() -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for w in ORIGINALS + NEW_WORDS:
        if w in seen:
            continue
        seen.add(w)
        out.append(w)
    if len(out) > 365:
        for w in DROP_IF_LONG:
            if len(out) <= 365:
                break
            if w in seen and w not in ORIGINALS:
                out.remove(w)
                seen.remove(w)
    if len(out) != 365:
        raise SystemExit(f"expected 365 words, got {len(out)}")
    for required in ("Show up", "Hold both", "Small steps", "This day", "True north"):
        if required not in out:
            raise SystemExit(f"missing multi-word title: {required}")
    return out


HANDMADE_TITLES = lines(
    """
One true sentence
The hour you can hold
Skip the inner trial
Food, then feelings
Shame is not a coach
A boundary with kindness
Begin again at noon
Rest is allowed
Company over secrecy
The pause that protects
No life overhaul
The next kind thing
Water, food, truth
Do not decide while upset
A softer inner voice
The help already here
Let good be good
Enough is a decision
Out of hiding
The feeling will move
Ask before you disappear
Keep the problem small
Ordinary courage
Sleep is part of staying
A promise the size of today
The evening you protect
Tell someone early
The craving can wait
Three small cares
Mercy for a clumsy try
A walk without a lecture
Make the job smaller
The way back is open
Stay where it is safe
Leave tomorrow for tomorrow
A table set for yourself
Keep today on today's page
Small things have worth
Unclench and continue
A factual next step
Borrow a little hope
Give the lonely hour company
Do the care, skip the speech
A kinder reason to try
A thought is not a fact
Ten minutes of willingness
Recovery in ordinary clothes
A messy try still counts
A small repair is enough
Put the phone in another room
A kinder coach than shame
A bad hour is not the story
Food before big thoughts
Someone who wants you well
A noon beginning
The sharp word, repaired
Let the day be ordinary
Stay for the dull stretch
A limit that loves you
Write it down and breathe
A feeling is not the whole story
A meeting, even silent
Tell the secret safely
Choose the safer road
A plan for the next hour
The body you thank
Pause for one song
Half a hope still counts
A human hour
Unfinished, and still welcome
Enough light for this step
Choose people
This date is enough
A longer exhale
Worth protecting
Call loneliness by its name
A meal with no debate
Steady is enough today
The next right kindness
Stop keeping score
A day you do not abandon
Courage in an ordinary hour
A slower reply
Recovery in the kitchen
Do not load tonight with tomorrow
Tell the real story
A night you actually wind down
Half a prayer, or half a hope
The habit of coming back
Willingness the size of a text
Hungry, angry, lonely, tired
A boundary you mean
"""
)

TITLE_VERBS = [
    "Stay with",
    "Return to",
    "Make room for",
    "Be kind to",
    "Come back to",
    "Be gentle with",
    "Keep close to",
    "Honour",
]

TITLE_OBJECTS = [
    "the next hour",
    "one true sentence",
    "a small repair",
    "the safer step",
    "a kinder pace",
    "today's real page",
    "the help already here",
    "a short pause",
    "an honest ask",
    "the way back",
    "a living repair",
    "company instead of a secret",
    "the tired part",
    "a promise sized for today",
    "a boundary that can be kept",
    "the meal on the table",
    "a feeling that can pass",
    "the evening still open",
    "one safe person",
    "the body that got this far",
    "the truth that a craving can pass",
    "grief that has no tidy name",
    "the choice not to hide a slip",
    "the good almost argued away",
    "a meeting, even a quiet one",
    "sleep as part of staying well",
    "a no that protects",
    "the true story",
    "one plain task",
    "people who are safe and kind",
    "a simple prayer or a quiet hope",
    "a silence that counts as care",
    "the values under the day",
    "a hope borrowed honestly",
    "the floor underfoot",
    "water and the truth",
    "the hard message",
    "a walk long enough to breathe",
    "the part of the day still open",
    "an ordinary kindness",
]

PLACES = [
    "at the kitchen sink",
    "on a crowded bus",
    "in a quiet car park",
    "halfway through a walk",
    "on the edge of the bed",
    "waiting for the kettle",
    "in a supermarket aisle",
    "outside a meeting",
    "in the shower",
    "at a desk long after the useful work is done",
    "on the couch while the television talks to nobody",
    "in a doorway with keys still in hand",
    "sitting in the car, not ready to go in",
    "on hold, phone warm against a shoulder",
    "folding washing that does not care what kind of day it was",
    "on the back step in whatever light is available",
    "awake before the alarm",
    "awake too late, watching the ceiling",
    "in a waiting room with old magazines",
    "at a family table where everyone is being careful",
    "on a lunch break that was almost skipped",
    "taking the long way home",
    "avoiding the mirror",
    "beside a window in the late light",
    "on the floor with a back against the cupboard",
    "in a group, smiling more than the feeling matches",
    "alone with a craving that is dressing itself up as a plan",
    "just after a conversation that wants a redo",
    "in the kitchen before any real food",
    "in the room where a sharp sentence is still hanging in the air",
    "in a house that has gone quiet while the mind has not",
    "in the glow of a group chat, with loneliness louder than the jokes",
    "with a cup going cold nearby",
    "at the clothesline",
    "on a park bench, or in a pew, or in no special place at all",
    "staring at a message that has not been answered",
    "holding a bill that does not want to be opened",
    "halfway up the stairs, suddenly tired",
    "in the bathroom, delaying the next thing",
    "packing a bag without being sure it is needed",
]

EVENTS = [
    "the day asks for more than seems available",
    "an old story starts narrating",
    "the pull toward numbing shows up dressed as a good idea",
    "shame tries to speak first",
    "the wish to disappear arrives with the wish to be found",
    "shoulders are already up near the ears",
    "it is hard to tell hunger from anger, loneliness, or tiredness",
    "the next hour looks too big",
    "the temptation is to audition a better version of the truth",
    "grief arrives without an appointment",
    "irritation starts looking for a target",
    "a guarantee is wanted and the day is not offering one",
    "loneliness pretends to be boredom",
    "someone else's pace tries to become the measure",
    "a small good thing feels hard to trust",
    "quitting looks easier than beginning",
    "the feeling is loud and the facts are quiet",
    "a speech nobody asked for starts rehearsing itself",
    "the body asks for something simpler than a breakthrough",
    "hope feels too fragile to say out loud",
    "a craving starts sounding like a schedule",
    "the last conversation plays on a loop",
    "the stomach is empty and the thoughts are harsh",
    "a sharp sentence is still looking for a home",
    "nothing dramatic is wrong, and yet the hour feels heavy",
    "kindness is on offer and feels difficult to take",
    "the urge to isolate calls itself independence",
    "a bill, a memory, or a message asks to be faced",
    "the future tries to move into the afternoon",
    "a frightened thought volunteers to be the prophet",
    "rest is being accused of laziness",
    "secrecy is being called privacy",
    "the image wants protecting more than the person does",
    "other people's choices are being carried as if they were ours",
    "urgency is being mistaken for importance",
    "a slip is being edited into a whole identity",
    "the room is safe enough, and leaving still sounds tempting",
    "the room is not calm, and staying would cost too much",
    "good news has arrived and is being argued with",
    "the simplest care is the thing being postponed",
]

GERUNDS = [
    "telling one true thing",
    "taking a real rest",
    "asking for help",
    "keeping a kind boundary",
    "staying through an uncomfortable hour",
    "naming what is felt",
    "making one small repair",
    "eating a simple meal",
    "texting someone safe",
    "leaving an argument that hunts you",
    "sitting with a feeling",
    "beginning again after a messy morning",
    "speaking kindly to yourself",
    "putting the phone in another room",
    "writing the truth down",
    "letting an urge pass",
    "choosing the safer option",
    "sharing the unpolished version",
    "coming back after a drift",
    "softening a sharp tone",
    "noticing one ordinary good",
    "protecting sleep",
    "saying a short, clean no",
    "saying yes to help",
    "stepping into daylight",
    "praying or sitting quietly",
    "releasing one grudge for the day",
    "slowing the pace on purpose",
    "clearing one small surface",
    "telling someone a hidden fact",
    "delaying a big decision",
    "making the evening smaller",
    "replacing an inner insult with a fact",
    "setting a place for yourself",
    "thanking someone specifically",
    "choosing company over secrecy",
    "treating a craving as weather",
    "leaving other people's choices with them",
    "ending a harsh inner speech",
    "letting a good moment stay good",
    "resting before trying to be clever",
    "receiving help without a scoreboard",
    "telling someone if the day goes dark",
    "keeping food and water in the plan",
    "pausing before a reply",
    "tending what is actually yours",
    "washing your face and coming back",
    "opening a window",
    "walking a little way",
    "feeding yourself before solving the day",
]

ATTACKS = [
    "turning the effort into a verdict on a whole life",
    "waiting until it looks impressive",
    "using the moment as a punishment",
    "demanding a perfect record first",
    "comparing the effort with someone else's best day",
    "adding a harsh commentary",
    "making a performance of it",
    "deciding a whole future from one hour",
    "pretending it only counts when you feel serene",
    "hiding until you feel more presentable",
    "calling the need for it weakness",
    "rushing past it because it looks small",
    "treating it as something you must earn",
    "covering the moment with busyness",
    "stacking tomorrow on top of today",
    "letting shame supervise the effort",
    "measuring worth by how easy it felt",
    "needing an audience",
    "abandoning the effort when the mood dips",
    "postponing it until you feel like a better person",
    "explaining the effort away",
    "keeping it secret out of pride",
]

FEELING_NP = [
    "a rush of self-defence",
    "the wish to numb",
    "a wave of not-enough",
    "the heat of embarrassment",
    "a flat, grey tiredness",
    "the itch to control someone else's reaction",
    "a sudden loneliness",
    "the fear that the day is already ruined",
    "a want to be rescued and a pride that will not ask",
    "grief with no tidy name",
    "anger that is really hurt",
    "the temptation to make a permanent decision inside a temporary feeling",
    "a craving dressed as common sense",
    "comparison, sharp and unfair",
    "the old urge to disappear",
    "a tightness in the jaw and the story that goes with it",
    "hope that feels too fragile to admit",
    "irritation looking for a target",
    "the rehearsed speech nobody requested",
    "shame pretending to be responsibility",
    "a hunger for certainty the day cannot give",
    "boredom that is loneliness in a cheaper coat",
    "the pull to scroll past your own life",
    "a good moment you are tempted to argue with",
    "fear dressed up as planning",
    "the heaviness of an unanswered message",
    "relief that you do not quite trust yet",
    "a childish need for someone to be kind, which is still a human need",
    "the wish to quit before you have begun",
    "love and resentment sitting in the same chair",
    "a body asking for food, water, or sleep while the mind makes speeches",
    "the quiet dread of evening",
]

OLD_PATTERNS = [
    "a verdict handed down before breakfast",
    "the claim that one flawed hour has cancelled the person",
    "a demand for a year's progress before lunch",
    "an invitation to isolate and call it strength",
    "shame dressed up as a teacher",
    "a permanent decision wearing a temporary feeling",
    "someone else's later chapter used as a ruler",
    "a secret asking to be fed",
    "a body ignored in favour of a spiral",
    "disaster rehearsed until the present disappears",
    "motivation treated as a prerequisite for care",
    "help treated as a prize that has not been earned",
    "a craving narrating a whole identity",
    "a fight picked so loneliness does not have to be felt",
    "busyness outrunning grief",
    "perfection promised, then abandoned at the first miss",
    "other people's choices carried as if they were ours",
    "rest accused of being laziness",
    "privacy used as a mask for secrecy",
    "urgency mistaken for importance",
    "tomorrow's catastrophe moved into this afternoon",
    "an image protected at the expense of the person",
    "a frightened thought trusted as a prophet",
    "a solo effort used to prove we are not a burden",
    "a boundary turned into a debate that must be won",
    "comparison sitting in the chair that belongs to our own pace",
    "a slip edited into a life sentence",
    "contempt aimed inward and called motivation",
    "the future used as a stick",
    "numbness sold as a solution",
    "a performance of being fine",
    "the whole relationship put on trial over one comment",
]

PRACTICES = [
    "put both feet on the floor and name the room you are actually in",
    "drink a glass of water before you decide what the feeling means",
    "text someone safe the plain sentence rather than the polished one",
    "eat something simple, even if appetite is late",
    "step outside for a few minutes of air",
    "write the true thing where only you will see it",
    "set a ten-minute timer and let the urge rise without obeying it",
    "wash your face or your hands as a way of coming back to yourself",
    "say out loud that this is a hard hour and not a ruined life",
    "unclench your jaw and drop your shoulders on purpose",
    "check whether you are hungry, angry, lonely, or tired, and tend the one that fits",
    "change the plan from fixing a whole life to doing the next kind thing",
    "ask for a call, a ride, or company without adding a long apology",
    "put the scroll, the argument, or the old pattern down for the length of one song",
    "pray, meditate, or sit in silence for a few minutes in whatever language is yours",
    "name one ordinary thing that is still good",
    "apologise in one clean sentence if needed, then stop prosecuting yourself",
    "move your body gently with a walk to the corner, a stretch, or a shower",
    "protect tonight's sleep as if it matters, because it does",
    "say no to one thing that pulls you off course, and keep the no short",
    "say yes to one help that is already on offer",
    "look at a tree, a pet, a plant, or the sky for a full minute",
    "speak to yourself as you would to a friend on a hard day",
    "delay any big decision until you have eaten and told someone safe",
    "tell someone safe today if you slipped, rather than building a secret",
    "make the evening smaller with food, a wash, and a light out at a decent hour",
    "write the next three tiny actions and ignore the rest of the list",
    "sit with someone kind, even in silence, instead of disappearing",
    "replace the insult in your head with one factual sentence",
    "stay out of the place, the thread, or the company that hunts you",
    "breathe in for four and out for six, three times, without turning it into a test",
    "tell a friend, a meeting, or a page what you are unwilling to carry alone",
    "put your phone in another room for twenty minutes",
    "name a boundary in a calm sentence and then keep it",
    "thank someone for something specific and small",
    "speak one honest prayer if you have a faith, or one honest hope if you do not",
    "let one song finish before you answer the jab or the urge",
    "prepare tomorrow's first kindness tonight, as food, clothes, or a reminder of who to call",
    "admit you do not know, in the place where you have been performing certainty",
    "notice warmth in sun, water, a blanket, or a voice, and let your body register it",
    "do the task in front of you plainly rather than waiting to do it impressively",
    "keep one promise the size of a glass of water",
    "speak a fear in plain words so it loses a little of its costume",
    "leave if the place is not safe, and contact a support person or a helpline if you need to",
    "ask what would help for one hour, and do only that",
    "set a place at the table for yourself, even if the meal is plain",
    "walk without headphones for a few minutes and let the world be larger than your thoughts",
    "give the lonely part of you a name, then reach for a human voice",
    "move, drink water, and wait before sending the message if anger is up",
    "choose company over secrecy for one fact you usually hide",
    "let a good moment be good without arguing with it",
    "wind the day down by washing, dimming the light, and leaving one worry on paper",
    "treat the craving as weather and shelter until it moves",
    "offer yourself the tone you needed when you were younger",
    "release the person you cannot change and tend your own side of the day",
    "stay for the end of the meeting, the meal, or the feeling",
    "mark the day with one line about where you are, what you need, and who you will tell",
    "keep your words soft and your facts clear in the next hard conversation",
    "go where voices are kind if you want to isolate, even if you barely speak",
    "begin again at this hour without waiting for a perfect midnight",
    "open a window, or a blind, and let the air or the light change the room",
    "read a single steady page and then close it",
    "share the credit for a good hour with the people and practices that helped",
    "put recovery ahead of looking recovered",
    "feed yourself before you try to solve the meaning of the day",
    "let someone else be right about something small",
    "write the fear down so the mind does not have to hold it all night",
    "choose the safer option and skip the debate about whether it is impressive",
    "stand up, feel both feet, and postpone the spiral by doing the next physical thing",
    "keep a little beauty near you, even if it is only a clean corner or a plant",
    "say not today to the old pattern, and mean it only for this day",
    "reconcile in proportion with one honest text or one changed hour",
    "receive the help without keeping a score of who owes whom",
    "look after the animal needs of the day: food, water, movement, and rest",
    "use a meeting, a friend, or a quiet public place if being alone is getting sharp",
    "forgive the clumsy attempt from earlier and make one cleaner try",
    "tell the truth about money, time, or mood in one sentence to someone safe",
    "dim the lights and leave tomorrow on tomorrow's page",
    "place a hand on your chest and lengthen the exhale",
    "notice the urge, name it, and do not promote it to captain",
    "ask a safe person to sit with you, even if the sitting is mostly quiet",
    "keep the plan to water, food, truth, and one human contact",
    "honour a limit that protects sleep, safety, or peace",
    "laugh if laughter comes, and do not call it denial",
    "return to the room you are actually in when the mind runs ahead",
    "send the awkward honest message rather than the polished disappearance",
    "treat rest as responsible, not as something you must deserve",
    "name what is yours to tend, and set down what is not",
    "give the lonely part of you company before you give it a substance or a spiral",
    "speak more slowly than the feeling, with softer words and clearer facts",
    "remember you belong somewhere, even if today you only belong in this small effort",
    "do one thing the morning version of you will be glad you did",
    "leave the highlight reel and describe the day in one plain sentence",
    "keep sarcasm away from your own name",
    "borrow hope if you cannot manufacture it, and thank the source",
    "stay through the dull stretch, because dull is often where the day is kept",
    "make the next kindness specific, small, and finished",
    "tell a safe person if the day has gone dark, and use the help that exists",
    "change out of the day, wash, and let the body know the shift is over",
    "choose fellowship over image for one fact",
    "let the good thing be good for ten full seconds before you minimise it",
    "walk as far as the corner if that is all the pilgrimage available",
    "set the phone down until the feeling finishes its first wave",
    "cook, pour, or plate something as if the person eating matters, because they do",
    "say the boundary once, kindly, and skip the essay",
    "pray in your own words, or sit in silence if prayer is not your language",
    "unlearn one harsh rule by refusing to repeat it to yourself today",
    "keep today's page free of tomorrow's catastrophe",
    "offer a kindness that does not announce itself",
    "check the company you are about to keep, and choose the safer room",
    "write three words only: the feeling, the need, and the person",
    "stretch, drink, and look out a window before you answer the hard thought",
    "admit the loneliness instead of feeding it a disguise",
    "protect a pocket of quiet the size of a song",
    "thank your body for getting you to this morning",
    "choose dignity in one concrete way: a wash, a meal, or a truthful no",
    "let the meeting, the friend, or the page hold what you will not carry alone",
    "begin the repair while it is still small",
    "refuse the total, and work only with the next honest piece",
    "keep a light on, literally or figuratively, until the hour softens",
    "tell the truth without adding a punishment to the end of the sentence",
    "make room for joy if it knocks, and do not demand that it explain itself",
    "stay in today when the mind offers you every year at once",
    "use the long way home if the short way goes past what hunts you",
    "give the feeling a chair and give your feet the floor",
    "keep one ordinary promise and let the extraordinary ones wait",
    "speak to the part of you that is tired of starting over, and be decent about it",
    "end the inner cross-examination and eat",
    "ask for the ride, the call, or the company before pride writes a speech",
    "notice one thing still intact, however plain",
    "set down the person you cannot steer and pick up the hour you can",
    "let willingness be the size of a text message",
    "breathe, tell the truth, and do the next small care, in whatever order you can",
    "keep the secret out of recovery by telling it once, safely",
    "match your pace to the body you actually have today",
    "choose a gentler motivation than contempt",
    "leave the courtroom and come back to the kitchen",
    "honour the unfinished attempt instead of binning the whole day",
    "make the table, the mug, or the corner a little kinder to return to",
    "say where you are in one sentence, then stop explaining",
    "delay the big talk until you are fed, watered, and not alone with it",
    "let someone who wants you well have a vote",
    "practise the pause as if it were a door and not a delay",
    "keep faith with the next hour by living inside it",
    "offer the day a truce: no extra punishment, only the next care",
    "name the weather inside, then choose a shelter",
    "do poorly if you must, but do the one kind thing",
    "remember that a wave is not a climate",
    "put your hand on something real — a mug, a tree, a pet — and come back to now",
    "tell the day the truth and then make it smaller",
    "save the speech and send the simple ask",
    "let mercy be practical: water, food, rest, and one honest sentence",
    "stay near the people and routines that steady you",
    "forgive the pace you actually have",
    "keep the light you have, and walk by that",
    "make amends with a changed hour, not a dramatic vow",
    "notice beauty without turning it into a test of gratitude",
    "choose the sentence you would be glad someone said to you",
    "leave one worry on paper and go to bed at a human hour",
    "hold both the hard thing and the fact that you are still here",
    "ask what the next kind thing is, and let that be the whole question",
    "keep company with your own life for the length of this day",
]

SECONDS = [
    "a glass of water",
    "a simple meal",
    "a message to someone safe",
    "a few minutes of daylight",
    "a washed face",
    "a meeting or a quiet call",
    "lights dimmed at a decent hour",
    "one cleared surface",
    "a worry left on paper",
    "a softer jaw and dropped shoulders",
    "a short prayer or a short silence",
    "one calm boundary sentence",
    "a walk to the corner and back",
    "the phone in another room for a little while",
    "one true sentence, said aloud",
    "food before any large decision",
    "a kinder next reply",
    "quiet company",
    "an early night",
    "a page of something steady",
    "the safer option, chosen on purpose",
    "a stretch and a slower exhale",
    "the next three actions, written down",
    "a thank-you said specifically",
    "a window opened",
    "the mug, the pet, or the tree, really looked at",
    "one fact brought out of hiding",
    "a gentler tone in the mirror",
    "rest taken before it is earned on a scoreboard",
    "tomorrow left on tomorrow's shelf",
]

JEWELS = [
    "'{word}' is easy to admire and harder to inhabit, and the inhabited version is usually quiet: a tone softened, a truth left undecorated, a help allowed in. None of that will trend, yet that unphotographed minute is where '{word}' keeps a person inside the day.",
    "There is a counterfeit of '{word}' that demands a performance, and it can be set down. The real '{word}' has dirt on it and can survive an ordinary Tuesday, a short temper, and a plan only half kept.",
    "If '{word}' only arrived when you felt ready, it would almost never arrive, because readiness is a poor doorman. Begin '{word}' mid-feeling, mid-sentence, and slightly embarrassed, because that is an honest doorway into it.",
    "Other people can suggest '{word}', but they cannot live it into your hands. What they can do is sit nearby so the courage for '{word}' does not have to be invented from scratch. Borrow their steadiness, then take one step of '{word}' that is actually yours.",
    "There is no trophy for making '{word}' look effortless, and the effort is a sign of being awake rather than a reason for shame. Let '{word}' be visible to you even if nobody claps, and let that visibility be dignity.",
    "'{word}' will not erase what hurts, and it was never a bargain of that kind. '{word}' is a way of staying beside the hurt without feeding it the whole future, so pain can be in the room and still not chair the meeting.",
    "When the mind offers a total of every mistake, every year, and every person, '{word}' answers with a smaller unit: this hour, this choice, this body. Small '{word}' is not shallow, and that smaller unit is how a life stays possible.",
    "You are allowed to practise '{word}' imperfectly and still be a person of your word, because a late start or a clumsy tone is material, not disqualification. Pick '{word}' up from where it fell and continue without a speech.",
    "Secrecy starves '{word}'. Not every fact belongs on a public stage, but the fact that most wants to hide usually needs one safe witness if '{word}' is going to breathe. Tell it plainly, and let shared light become part of how '{word}' breathes.",
    "'{word}' includes the body, because thoughts can pretend to be the whole story while hunger, tiredness, or a clenched jaw runs the meeting. Tend those animal facts and '{word}' gets a fairer hearing.",
    "Do not wait to feel '{word}' before you act it. With '{word}', feeling often follows action, the way warmth follows a walk. If the feeling never catches up today, the action was still '{word}', and it counted.",
    "Comparison is a thief of '{word}', and someone else's pace is not the measure of this hour. The fairer measure of '{word}' is simpler: truth told, safety kept, and the next kind step taken.",
    "'{word}' can be a prayer without a script, or a value with no religious name at all. The direction of '{word}' matters more than the label: toward honesty, toward care, and away from abandoning yourself or bullying yourself into change.",
    "Leave a little room inside '{word}' for joy, because this path is not only damage control. A joke, a good mouthful, light on a wall, or the weight of a pet can belong to '{word}' if good is allowed to be good.",
    "If you were sharp, '{word}' is not a long self-trial. '{word}' here is a clean repair: one sentence of truth and a changed next action. '{word}' prefers that repair to rumination, and it refuses to turn a moment into an identity.",
    "At the end of the day, '{word}' is a way of coming back before sleep, not a score but a tone. Tell the truth about how '{word}' went, then leave tomorrow on its own shelf.",
    "Fear will dress up as wisdom and suggest postponing '{word}' until the stakes feel lower. The stakes are this day, and '{word}' done nervously still counts.",
    "You do not have to understand a whole history in order to practise '{word}' this afternoon. Further insight can wait, because '{word}' only needs the next honest, safe, concrete action.",
    "Loneliness likes to rename itself boredom or irritability, and '{word}' gets clearer when the loneliness is called by its real name. Then '{word}' can mean reaching for one safe voice instead of a numbing detour.",
    "A boundary can serve '{word}' when it protects sleep, safety, or peace. A short no, spoken calmly, may be '{word}' doing a real job rather than failing at niceness.",
    "Do not make '{word}' a debate that must be won against everyone in the house. Make it a loyalty you keep, public only as far as safety and kindness require, and let '{word}' stay proportionate.",
    "If the day has already gone sideways, '{word}' does not demand a rewind. It asks for the next truthful movement, and it lets the earlier hours stand without hiring them as judges of '{word}'.",
    "Humour can belong to '{word}' when it tells the truth and does not draw blood, especially your own. A lighter minute is not denial if '{word}' is still in the room.",
    "You are a whole person on the days '{word}' is shaky, not a project awaiting approval. Let '{word}' be something you practise, not a verdict you wait to receive from the mirror.",
    "The useful question is not whether '{word}' has been mastered. It is whether '{word}' has been given one honest place to stand in this actual day. Give '{word}' that place, then stop auditioning.",
    "Grief and '{word}' can share a table. You do not have to park the sadness before a gentle practice of '{word}' is allowed. '{word}' is sturdy enough to sit beside what aches.",
    "Image will ask you to look as though '{word}' were already finished. '{word}' will ask you to be honest. When those two pull apart, choose '{word}', even if the choosing is invisible.",
    "A meeting, a friend, a page, or a quiet bench can all be rooms where '{word}' is practised. The furniture matters less than the refusal to do '{word}' in total secrecy.",
    "You can be angry and still practise '{word}'. Beside '{word}', anger is a signal, not a licence and not a sin to be crushed. Let '{word}' give the anger a safer job than wreckage.",
    "Night is an honest test of '{word}', because the audience has gone home. The private version — a wash, a dimmer light, a kinder last thought — is '{word}' without costume.",
    "If faith is a home for you, let '{word}' be prayed in your own words, without a performance. If faith is not your home, let '{word}' be a value you keep. Both doors open onto a kinder practice of '{word}'.",
    "Do not confuse '{word}' with fixing other people. The piece of '{word}' that belongs to you is already large enough. '{word}' gets clearer when other people's choices are left in their hands.",
]

WORD_OPENERS = [
    "Let '{word}' mean something you can actually live today: {definition}. {scene} {feeling}",
    "{scene} Nothing about that moment looks like a lesson, and still '{word}' can begin there, because it is {definition}. {feeling}",
    "What if '{word}' is smaller than you were taught — not a grand reform, but {definition}? {scene} {feeling}",
    "A harsh counterfeit likes to stand in for '{word}', and it is worth refusing. The real thing is {definition}. {scene} {feeling}",
    "The body often recognises what '{word}' needs before any explanation does. {scene} Let '{word}' start in that recognition. It is {definition}. {feeling}",
    "'{word}' grows faster beside someone than it does in a locked room. It is {definition}. {scene} {feeling}",
    "You are not asked to be finished at '{word}' by tonight. You are asked for a few honest minutes of it, understood as {definition}. {scene} {feeling}",
    "If you have already been unkind to yourself today, '{word}' can restart at the next breath. Think of it as {definition}. {scene} {feeling}",
    "Here is a human-sized reading of '{word}': {definition}. {scene} {feeling}",
    "Two things can be held at once while you practise '{word}'. The day can be hard, and you can still live this: {definition}. {scene} {feeling}",
    "If you drifted, '{word}' does not ask for a speech before it lets you return. It is simply {definition}. {scene} {feeling}",
    "In kitchens, on buses, and in quiet car parks, '{word}' is still possible. It looks like {definition}. {scene} {feeling}",
    "Shame would like to supervise '{word}', and shame is a poor supervisor. '{word}' is {definition}. {scene} {feeling}",
    "The useful size of '{word}' is one hour, not one lifetime. For this hour it is {definition}. {scene} {feeling}",
]

FEELING_WRAPS = [
    "What shows up next is often {np}, and it can pretend to be the whole truth about the hour.",
    "Under the moment sits {np}, which is information rather than a command.",
    "{cap} may arrive quickly, and it does not have to be obeyed to prove it was felt.",
    "It is easy to mistake the hour for {np}.",
    "You can notice {np} without promoting it to the boss of the day.",
    "{cap} is allowed to be here and still not be in charge.",
    "There is no need to negotiate with {np} as if it were a prophet.",
    "Let {np} have one sentence, then come back to what is actually in the room.",
    "An ordinary hour can hold {np} without becoming a verdict.",
    "{cap} can be loud, and volume is not the same thing as wisdom.",
    "If {np} takes the microphone, it can be thanked and still refused the rest of the day.",
    "Name {np} if you can, because named weather is easier to wait out.",
]

SPIRITS = [
    "Some people will meet '{word}' as a gift from God, and some as ordinary mercy, and both ways of meeting it are welcome here.",
    "If you pray, one honest line about '{word}' is enough prayer for today, and if you do not pray, one quiet minute can do the same gentle work.",
    "Grace — keep the word if you like it, or say mercy if you do not — makes room for '{word}' without auditing your progress first.",
    "A quiet presence, not owned by any one tradition, can sit beside you while '{word}' is still clumsy and unfinished.",
    "A higher power, as you understand that power, is not waiting to be impressed by '{word}', and if that language is not yours, your deepest values can be just as patient with it.",
    "No tradition has a lease on the kindness that helps '{word}' grow, so take the form — prayer, silence, fellowship, or a walk — that lets you practise it without cruelty.",
    "If harsh religion taught you that love had to be earned, you may set the harshness down and still keep '{word}', because care was never meant to be a tollgate.",
    "Wonder can be small and still spiritual: a tree, a clean glass, a voice that wants you well, or a few minutes given honestly to '{word}'.",
    "Hand the part of '{word}' you cannot carry to God as you understand God, or to a safe person, or to a plan on a page, so you do not have to hold all of it alone.",
    "Blessing, in this reading of '{word}', is not a prize for the tidy, but the ordinary chance to begin again without humiliation.",
    "Peace around '{word}' is rarely a finished feeling, and more often a truce you sign with the hour you have, in whatever language your spirit trusts.",
    "Sacred is a roomy word, and a meal, a truthful sentence, a pause, or a prayer can all be holy if they help '{word}' stay gentle, so use the form that fits.",
    "You can borrow hope for '{word}' from a tradition, a meeting, a friend, or the stubborn goodness of morning, and you do not have to sign a creed to use what you borrow.",
    "The point of '{word}', spiritually speaking, is not to become impressive, but to stay near love — named as God, as people, or simply as the next kind choice — while you are still learning.",
]

CLOSES = [
    "For now, let '{word}' be small enough to hold, and let that smallness be a kindness.",
    "You can leave the wider story for later and keep '{word}' inside this hour.",
    "Enough '{word}' for one day is a real success, even if nobody sees it.",
    "Walk with '{word}' only as far as tonight, and let that short walk count.",
    "If the day does not sparkle, let '{word}' be the quiet light you still carry.",
    "You do not have to feel sure before '{word}' is allowed to be honest.",
    "Set the performance down and let '{word}' remain, plain and sufficient.",
    "Tomorrow can keep its own worries, because today only asks for '{word}'.",
]

JFT_OPENERS = [
    "We sometimes put a whole life on trial before breakfast, and '{word}' gets lost in the verdict. When the old pattern sounds like {old}, it is trying to talk us out of the only '{word}' we could practise today.",
    "The habit has a favourite story: if the day is already imperfect, it may as well be abandoned, and '{word}' can wait forever. That story sounds like {old}, and believing it has never made '{word}' easier by night.",
    "We can think ourselves into a corner about '{word}' while ignoring a body that needs food, water, or rest. That corner is {old}, and '{word}' returns when we do something a person can actually finish.",
    "Secrecy dresses up as privacy and starves '{word}'. If the inner voice against '{word}' is really {old}, the remedy is not a finer mask but one safe person and a plainer practice of '{word}'.",
    "A craving will try to become a plan, and it may borrow the language of '{word}' to sound reasonable. Underneath, it is only {old}, which is not '{word}', so shelter and honesty have to answer instead.",
    "Comparison steals hours that '{word}' needs, measuring our insides against someone else's edited day. That measurement is {old}, and it is not a fair judge of '{word}', so we can give the ruler back.",
    "Asking for help belongs to '{word}', and it is not a failure of it. The resistance usually sounds like {old}, and we can ask anyway, in few words, and let the ask be '{word}' practised in public.",
    "After a sharp word or a slip, shame wants the microphone and will narrate '{word}' as ruined. Shame's script about '{word}' is {old}, yet a repair is smaller than that script, and '{word}' can live inside the repair.",
    "Evenings are where '{word}' is often quietly lost, not in a dramatic noon but in a tired, unguarded hour. The risk to '{word}' sounds like {old}, and a smaller evening can keep '{word}' intact enough for sleep.",
    "We do not have to generate '{word}' from nothing when other people are staying too. Isolation's case against '{word}' sounds like {old}. Fellowship offers a borrowed steadiness, and '{word}' can be practised inside it.",
    "A boundary can be part of '{word}' when it is calm, short, and actually kept. The old argument against that limit sounds like {old}, and we can hold it without a courtroom so '{word}' stays kind.",
    "The only '{word}' required today is the next hour's worth, not a reformed personality by dinner. Inflating '{word}' sounds like {old}, but right-sized '{word}' is something we can finish before the day ends.",
]

JFT_SPIRITS = [
    "Some of us ask a higher power, as we understand that power, for help to live '{word}' for this day only, and some of us ask a friend or our deepest values. The ask itself means '{word}' is not attempted in total isolation.",
    "We do not all pray, and we do not all name what is kind in the same way, yet '{word}' needs mercy more than it needs a speech, whatever name mercy goes by in our lives.",
    "If God is part of our language, we can hand over the piece of '{word}' we cannot carry, and if God is not our language, we can hand that piece to someone safe or to a simple written plan.",
    "Fellowship can be a spiritual practice: we borrow strength for '{word}' from people who are also staying, and we do not pretend that borrowed strength is a small thing.",
    "There is a mercy that does not keep a scoreboard, and it can reach our clumsy version of '{word}' without asking us to be impressive first.",
    "We can let '{word}' be holy in a kitchen-sized way — a meal, a truthful sentence, a pause — whether or not a hymn is anywhere near us.",
    "For those who use the phrase, the God of our understanding cares more about honest '{word}' than about polish, and those who do not use the phrase can still choose the honest version of '{word}'.",
    "We can leave room for doubt inside '{word}', because a day of recovery does not require a finished creed. It asks for a willingness to stay kind and stay present while we practise '{word}'.",
    "Light, in old stories and in ordinary kitchens, often arrives before we feel we deserve it, and a little of that unearned kindness can touch our practice of '{word}' today.",
    "If religion was used harshly on us, we may refuse the harshness and still keep whatever love was real, and '{word}' does not require us to return to a pulpit in order to be practised.",
    "A little honest quiet is enough spirituality for '{word}' today: tell the truth, refuse cruelty toward ourselves, and let any larger creed wait outside.",
    "We belong to this effort of '{word}' together, whether it is offered upward in prayer or sideways to a friend, and we are not meant to carry '{word}' alone.",
]

JFT_CLOSES = [
    "Just for today, I will {action}, and that is '{word}' in a form I can carry.",
    "Just for today, it is enough that I {action}, and I will let '{word}' be that simple.",
    "Just for today, I practise '{word}' like this: I {action}.",
    "Just for today, '{word}' means I {action}, and then I stop negotiating with the rest of my life.",
    "Just for today, I keep '{word}' small enough to do, which means I {action}.",
    "Just for today, when the old story gets loud, I will {action}, and I will let that be my '{word}'.",
    "Just for today, my part in '{word}' is plain: I {action}, and I let it count.",
    "Just for today, I will {action} before I try to solve anything larger than this day's '{word}'.",
]

YOU_TAGS = [
    "let that count as '{word}'.",
    "this is '{word}' with its sleeves rolled up.",
    "call this enough '{word}' for the hour.",
    "'{word}' does not need a grander stage than this.",
    "a pocket-sized '{word}' still changes the day.",
    "this is '{word}' in ordinary clothes.",
    "let this be the whole of '{word}' for now.",
    "noble feelings are optional, and this is still '{word}'.",
]

WE_TAGS = [
    "a human-sized '{word}'.",
    "our plain version of '{word}', kept small.",
    "how we practise '{word}' without a speech.",
    "'{word}' in a form we can actually do.",
    "enough '{word}' for the people we are today.",
    "our way of keeping '{word}' honest.",
    "the next faithful piece of '{word}'.",
    "'{word}' with muddy shoes, which still counts.",
]

SEASONS = {
    1: [
        "In the bright heat of an Australian summer, '{word}' may need shade, water, and a pace that does not show off.",
        "When the holidays recede and ordinary January days return, '{word}' is a gentle way back into the calendar.",
    ],
    2: [
        "Late-summer air can feel heavy, and '{word}' is allowed to be lighter than the weather.",
        "As routines gather speed again, '{word}' can be the thread kept while the calendar fills.",
    ],
    3: [
        "Autumn light is often a little kinder, and '{word}' can match that softer edge.",
        "Cooler mornings ask for a jumper and a truer pace, and '{word}' fits either one.",
    ],
    4: [
        "Earlier evenings are a chance to make the day smaller, and '{word}' belongs inside that smaller day.",
        "An in-between month does not delay '{word}', and unfinished weather is a fine place to practise it.",
    ],
    5: [
        "The dark arrives sooner now, and '{word}' can be a lamp actually switched on, not a theory about light.",
        "Cool nights reward a simple routine, and '{word}' can be part of how the day comes indoors.",
    ],
    6: [
        "Cold, reluctant mornings do not have spare heroics in them, so '{word}' is allowed to be appropriately small.",
        "Short winter days still count, and '{word}' may be the reason the day begins kindly anyway.",
    ],
    7: [
        "In the middle of winter, getting up is already a kind of courage, and '{word}' can join that courage instead of competing with it.",
        "Rain on the roof is enough weather for one day, and '{word}' does not need a bigger storm.",
    ],
    8: [
        "Late winter can look bare and still be preparing, and '{word}' may be working quietly too.",
        "Wind at the windows does not cancel '{word}', and indoors a steadier practice of it is still available.",
    ],
    9: [
        "Spring is uneven on purpose, and '{word}' is allowed to be uneven as well.",
        "The light stays a little longer, and a few of those minutes can be given to '{word}'.",
    ],
    10: [
        "Warmth returns with the busy calendars, and a pocket of the day kept for '{word}' is not a luxury.",
        "Blossom and to-do lists can share a week, and '{word}' keeps a person from living only inside the list.",
    ],
    11: [
        "As the year rushes, '{word}' is a way to stay inside the day that is actually here.",
        "Heat begins to build, and '{word}' includes water, shade, and not taking the temperature out on people.",
    ],
    12: [
        "Long light and full tables can be lovely and complicated, and '{word}' helps a person stay present to both.",
        "A closing year does not require a summary of a whole life, because '{word}' is for this day, not for the highlight reel.",
    ],
}


def lcg_shuffle(items: list, seed: int) -> list:
    items = list(items)
    state = seed % (2**31)
    for i in range(len(items) - 1, 0, -1):
        state = (state * 1103515245 + 12345) % (2**31)
        j = state % (i + 1)
        items[i], items[j] = items[j], items[i]
    return items


def take_pairs(n_a: int, n_b: int, count: int, seed: int) -> list[tuple[int, int]]:
    pairs = [(a, b) for a in range(n_a) for b in range(n_b)]
    if len(pairs) < count:
        raise SystemExit(f"need {count} pairs, have {len(pairs)}")
    return lcg_shuffle(pairs, seed)[:count]


def index_to_month_day(index: int) -> tuple[int, int]:
    left = index
    month = 1
    for n in MONTH_LENGTHS:
        if left < n:
            return month, left + 1
        left -= n
        month += 1
    raise SystemExit(f"bad index {index}")


def to_we(text: str) -> str:
    text = text.replace("Yourself", "Ourselves").replace("yourself", "ourselves")
    text = text.replace("Your body", "Our bodies").replace("your body", "our bodies")
    text = text.replace("Your", "Our").replace("your", "our")
    text = text.replace("You are", "We are").replace("you are", "we are")
    text = text.replace("You", "We").replace("you", "we")
    return text


def to_i(text: str) -> str:
    text = text.replace("Yourself", "Myself").replace("yourself", "myself")
    text = text.replace("Your", "My").replace("your", "my")
    text = text.replace("You are", "I am").replace("you are", "I am")
    text = text.replace("You", "I").replace("you", "I")
    return text


def capitalise(np: str) -> str:
    return np[:1].upper() + np[1:]


def make_definition(i: int, gerund: str, attack: str) -> str:
    forms = [
        f"the practice of {gerund} without {attack}",
        f"a way of {gerund} without {attack}",
        f"what remains when you stop {attack} and simply keep {gerund}",
        f"less a performance and more a moment of {gerund}, without {attack}",
        f"{gerund}, especially when the alternative is {attack}",
    ]
    return forms[i % len(forms)]


def tidy(text: str) -> str:
    text = text.replace(" — — ", " — ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" +([.,;:!?])", r"\1", text)
    text = re.sub(r"\s+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def paragraphs(*parts: str) -> str:
    cleaned = []
    for part in parts:
        part = tidy(part)
        if part:
            cleaned.append(part)
    return "\n\n".join(cleaned)


def build_titles() -> list[str]:
    if len(HANDMADE_TITLES) != len(set(HANDMADE_TITLES)):
        raise SystemExit("duplicate handmade title")
    patterned = lcg_shuffle(
        [f"{verb} {obj}" for verb in TITLE_VERBS for obj in TITLE_OBJECTS],
        91,
    )
    titles: list[str | None] = [None] * 365
    used: set[str] = set()
    hi = 0
    for i in range(365):
        if i % 4 == 0 and hi < len(HANDMADE_TITLES):
            title = HANDMADE_TITLES[hi]
            hi += 1
            titles[i] = title
            used.add(title)
    pi = 0
    for i in range(365):
        if titles[i] is not None:
            continue
        while pi < len(patterned) and patterned[pi] in used:
            pi += 1
        if pi >= len(patterned):
            raise SystemExit("ran out of Just for today titles")
        titles[i] = patterned[pi]
        used.add(patterned[pi])
        pi += 1
    out = [t for t in titles if t]
    if len(out) != 365 or len(set(out)) != 365:
        raise SystemExit(f"title count {len(out)} unique {len(set(out))}")
    return out


def practice_you(base: str, tag: str) -> str:
    imp = base[:1].upper() + base[1:].rstrip(".")
    return f"{imp} — {tag}"


def practice_we(base: str, tag: str) -> str:
    return f"We can {to_we(base)} — {tag}"


def sentences_of(text: str) -> list[str]:
    flat = text.replace("\n", " ")
    parts = re.split(r"(?<=[.!?])\s+", flat)
    return [p.strip() for p in parts if p.strip()]


def build() -> tuple[list[dict], list[dict]]:
    from plain_daily import compose

    theme_words = words()
    titles = build_titles()
    overlap = set(theme_words) & set(titles)
    if overlap:
        raise SystemExit(f"titles collide with words: {sorted(overlap)[:8]}")
    word_entries, jft_entries = compose(theme_words, titles, index_to_month_day)
    validate(word_entries, jft_entries)
    return word_entries, jft_entries


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9'’\-]+", text))


def validate(words_e: list[dict], jft_e: list[dict]) -> None:
    if len(words_e) != 365 or len(jft_e) != 365:
        raise SystemExit("entry count")
    if [index_to_month_day(i) for i in range(365)] != [
        (e["month"], e["day"]) for e in words_e
    ]:
        raise SystemExit("calendar index drifted")
    if words_e[0]["month"] != 1 or words_e[0]["day"] != 1:
        raise SystemExit("jan 1")
    if words_e[58]["month"] != 2 or words_e[58]["day"] != 28:
        raise SystemExit("feb 28")
    if words_e[59]["month"] != 3 or words_e[59]["day"] != 1:
        raise SystemExit("mar 1")
    if words_e[364]["month"] != 12 or words_e[364]["day"] != 31:
        raise SystemExit("dec 31")

    wset = [e["word"] for e in words_e]
    tset = [e["title"] for e in jft_e]
    if len(set(wset)) != 365:
        raise SystemExit("duplicate words")
    if len(set(tset)) != 365:
        raise SystemExit("duplicate titles")
    for w in wset:
        if not (1 <= len(w) <= 28):
            raise SystemExit(f"word length: {w}")
    for t in tset:
        if not (8 <= len(t) <= 72):
            raise SystemExit(f"title length {len(t)}: {t}")

    seen: dict[str, str] = {}
    blob_parts = []
    for label, entries, key in (
        ("word", words_e, "reading"),
        ("jft", jft_e, "reading"),
    ):
        for e in entries:
            text = e[key]
            blob_parts.append(text)
            wc = word_count(text)
            if wc < 90 or wc > 230:
                raise SystemExit(f"{label} {e['month']}-{e['day']} word count {wc}\n{text[:400]}")
            sents = sentences_of(text)
            if len(sents) < 5:
                raise SystemExit(f"{label} {e['month']}-{e['day']} only {len(sents)} sentences")
            if "<" in text or ">" in text:
                raise SystemExit("markup in reading")
            for s in sents:
                # Short refrains may repeat. Longer lines must stay unique so the
                # year does not collapse into one copied paragraph.
                if word_count(s) < 12:
                    continue
                prev = seen.get(s)
                if prev:
                    raise SystemExit(f"duplicate sentence ({prev} and {label} {e['month']}-{e['day']}):\n{s}")
                seen[s] = f"{label} {e['month']}-{e['day']}"
    for e in jft_e:
        if "Just for today" not in e["reading"]:
            raise SystemExit("missing Just for today")
        if not e["reading"].strip().split("\n\n")[-1].startswith("Just for today"):
            raise SystemExit("pledge is not its own closing paragraph")
    blob = "\n".join(blob_parts).lower()
    for banned in BANNED:
        if banned in blob:
            raise SystemExit(f"banned phrase: {banned}")
    # Denominational pressure we do not want in a shared card.
    for banned in (
        "you must believe",
        "only jesus",
        "unless you are bapt",
        "the one true church",
        "you are going to hell",
        "non-believers will",
    ):
        if banned in blob:
            raise SystemExit(f"exclusivist phrase: {banned}")


def emit(path: Path, var_name: str, entries: list[dict], blurb: str) -> None:
    payload = json.dumps(entries, ensure_ascii=False, indent=2)
    # JSON is valid JS. Keep the file as a classic script so file:// and the
    # single-page app can share the array without a build step.
    text = (
        "/*\n"
        f"   {blurb}\n"
        "   Original Hopewick prose. Not AA/NA literature, not a commercial\n"
        "   devotional, and not clinical advice.\n"
        "   Index: non-leap month-day in Australia/Brisbane.\n"
        "   0 = 1 January, 58 = 28 February, 59 = 1 March, 364 = 31 December.\n"
        "   29 February reuses 28 February.\n"
        "   Regenerate with: python3 tools/build_daily_readings.py\n"
        "*/\n"
        f"var {var_name} = {payload};\n"
    )
    path.write_text(text, encoding="utf-8")


def main() -> None:
    words_e, jft_e = build()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    emit(
        OUT_DIR / "word-for-the-day.js",
        "WORD_FOR_THE_DAY",
        words_e,
        "Word for the day — 365 original plain-language readings.",
    )
    emit(
        OUT_DIR / "just-for-today.js",
        "JUST_FOR_TODAY",
        jft_e,
        "Just for today — 365 original plain-language readings.",
    )
    counts_w = [word_count(e["reading"]) for e in words_e]
    counts_j = [word_count(e["reading"]) for e in jft_e]
    print(f"words {len(words_e)}  wc {min(counts_w)}-{max(counts_w)} avg {sum(counts_w)//len(counts_w)}")
    print(f"jft   {len(jft_e)}  wc {min(counts_j)}-{max(counts_j)} avg {sum(counts_j)//len(counts_j)}")
    sample_path = Path("/tmp/reading-samples.txt")
    chunks = []
    for i in (0, 1, 14, 31, 58, 59, 180, 364):
        w, j = words_e[i], jft_e[i]
        chunks.append(
            f"===== {w['month']:02d}-{w['day']:02d}  {w['word']} / {j['title']} =====\n\n"
            f"WORD\n{w['reading']}\n\nJFT\n{j['reading']}\n"
        )
    sample_path.write_text("\n".join(chunks), encoding="utf-8")
    print(f"samples {sample_path}")


if __name__ == "__main__":
    main()
