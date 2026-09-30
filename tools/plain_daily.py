#!/usr/bin/env python3
"""Plain-language daily readings for Hopewick.

Shared word lists, scene lines, and title glosses for the daily readings.
The two slots are composed in distinct_readings.py so a Christian Word for
the day and an NA Just for today are not the same theme. This module's
compose() is the older intertwined generator and is not what the app ships.

Run via tools/build_daily_readings.py.
"""
from __future__ import annotations

import re

TITLE_VERBS = (
    "Stay with",
    "Return to",
    "Make room for",
    "Be kind to",
    "Come back to",
    "Be gentle with",
    "Keep close to",
    "Honour",
)

PLACES = [
    "at the kitchen sink",
    "on the bus",
    "in a quiet car park",
    "on a short walk",
    "on the edge of the bed",
    "waiting for the kettle",
    "in a supermarket aisle",
    "outside a meeting",
    "in the shower",
    "at the kitchen table",
    "on the couch",
    "in the doorway, keys still in hand",
    "in the car, not ready to go in",
    "on the phone, on hold",
    "folding the washing",
    "on the back step",
    "awake before the alarm",
    "awake too late",
    "in a waiting room",
    "at a family table",
    "on a lunch break",
    "walking the long way home",
    "avoiding the mirror",
    "by a window",
    "on the floor by the cupboard",
    "in a group, smiling more than the feeling matches",
    "alone with a craving",
    "after a hard conversation",
    "in the kitchen, before any real food",
    "in a room where a sharp sentence still hangs",
    "in a quiet house with a loud mind",
    "scrolling, and feeling alone",
    "holding a bill that is hard to open",
    "halfway up the stairs",
    "in the bathroom, putting off the next thing",
    "packing a bag and feeling unsure",
    "at work, trying to look fine",
    "in bed, not sleeping",
    "at the clothesline",
    "staring at an unanswered message",
]

EVENTS = [
    "a craving is trying to sound like a good idea",
    "shame got there first",
    "sleep was short",
    "money stress is sitting on the table",
    "loneliness is louder than the noise around",
    "someone's words are still ringing",
    "the urge to hide is strong",
    "the body is tired and the mind is loud",
    "a slip is on the mind",
    "hunger and irritation are easy to mix up",
    "the evening feels risky",
    "comparison has crept in",
    "quitting looks easier than starting",
    "a message is waiting and feels hard to open",
    "the room is safe enough, but the chest is tight",
    "grief showed up without warning",
    "a drink, a drug, or a numbing scroll looks tempting",
    "a sharp sentence already landed",
    "the house is quiet and the mind is not",
    "food is being put off",
    "everything feels behind",
    "a secret feels heavy",
    "a big decision is trying to happen while feelings are hot",
    "help is on offer and feels hard to take",
    "being alone is pretending to be strength",
    "the day feels very dark",
]

FEELINGS = [
    "shame",
    "a craving",
    "loneliness",
    "anger",
    "tiredness",
    "fear",
    "sadness",
    "the urge to hide",
    "money stress",
    "grief",
    "the wish to give up",
    "comparison",
    "the urge to go numb",
    "hunger",
    "a heavy secret",
    "worry about the future",
    "numbness",
    "the thought that the day is already ruined",
    "irritation",
    "the pull to be alone",
]

SECONDS = [
    "a glass of water",
    "a simple meal",
    "a text to someone safe",
    "a few minutes of daylight",
    "a washed face",
    "a short walk",
    "the phone in another room",
    "lights dimmed at a decent hour",
    "one worry written on paper",
    "a slower breath",
    "a kind sentence, spoken as to a friend",
    "an open window",
    "quiet company",
    "a ten-minute pause before a big choice",
    "one money worry named to someone safe",
    "a stretch and a drink of water",
]

POOLS = {
    "truth": [
        "tell someone safe one true sentence",
        "write one true sentence on paper",
        "say the plain fact out loud, once",
        "send the honest text instead of going silent",
    ],
    "body": [
        "drink a glass of water",
        "eat something simple",
        "take a slow walk to the corner and back",
        "unclench the jaw and drop the shoulders",
        "wash face and hands",
        "take three slow breaths, out longer than in",
        "step outside for a few minutes of air",
        "stretch gently for one minute",
    ],
    "people": [
        "text one safe person",
        "ask for a short call",
        "sit with someone kind, even in quiet",
        "go to a meeting, even if staying quiet",
        "thank one person for one small thing",
    ],
    "rest": [
        "dim the lights and aim for a decent bedtime",
        "leave worries on paper before bed",
        "put the phone in another room for twenty minutes",
        "make the evening small: food, a wash, and lights out",
    ],
    "boundary": [
        "say one short no, and keep it short",
        "leave a place that is not safe",
        "choose safer company for the next hour",
        "delay the reply until things feel calmer",
    ],
    "shame": [
        "speak kindly, as to a friend",
        "tell someone safe about a slip, if there was one",
        "name the feeling without an insult",
        "replace the inner insult with one factual sentence",
    ],
    "craving": [
        "wait ten minutes before acting on a craving",
        "put the phone down and drink water",
        "tell someone safe that a craving is loud",
        "move to a safer room",
    ],
    "grief": [
        "let the sad feeling be here for ten minutes, without numbing it",
        "tell someone safe that grief is here",
        "sit quietly with the sadness for the length of a song",
    ],
    "hope": [
        "name one ordinary thing that is still all right",
        "text someone who is staying, and borrow a little hope",
        "let one good moment stay good for a full minute",
    ],
    "help": [
        "ask for help in one short text",
        "say yes to help that is already offered",
        "tell someone what is too heavy to carry alone",
    ],
    "faith": [
        "sit quietly for a few minutes",
        "say a simple prayer, or name one hope if prayer is not the fit",
        "hand the heavy part to a prayer, a friend, or a written plan",
    ],
    "start": [
        "do the next small task only",
        "begin again from this hour",
        "write the next three tiny steps and ignore the rest",
    ],
    "food": [
        "eat something simple before any big decision",
        "drink water, then have a real snack",
        "set a simple place to eat",
    ],
    "money": [
        "tell someone safe that money is tight",
        "write the next money step in one sentence",
        "open one bill, or name the money worry out loud to someone safe",
    ],
}

POOL_WORDS = [
    ("money", ("bill", "money")),
    ("food", ("food", "meal", "hunger", "bread", "nourish", "thirst")),
    ("faith", ("pray", "faith", "grace", "spirit", "soul", "reverence", "praise", "bless", "sanctuary", "surrender")),
    ("sleep", ("sleep", "evening", "night", "unwind", "hush")),
    ("rest", ("rest", "quiet", "ease", "relax", "serene", "tranquil", "peace")),
    ("body", ("body", "breathe", "breath", "walk", "wash", "stretch", "water", "foot")),
    ("truth", ("honest", "truth", "sincere", "integrity", "speak", "voice", "plain speech")),
    ("shame", ("shame", "slip", "stumble", "sorry", "forgive", "amends", "mercy", "pardon")),
    ("craving", ("detach", "redirect", "old pattern")),
    ("people", ("connect", "company", "friend", "fellowship", "together", "belong", "neighbour", "kindred", "gather", "companion")),
    ("boundary", ("boundar", "limit", "protect", "guard")),
    ("grief", ("grieve", "tear", "weep", "pain", "wound", "longing")),
    ("help", ("help", "ask", "support", "reach", "rely", "yes to help")),
    ("hope", ("hope", "light", "dawn", "sunrise", "glad", "joy", "wonder")),
    ("start", ("begin", "try again", "return", "renew", "start")),
]

CRISIS_WORDS = {
    "Fear",
    "Shame",
    "Slip",
    "Grieve",
    "Pain",
    "Wound",
    "Tears",
    "Weep",
    "Empty",
    "Fragile",
    "Longing",
    "Stumble",
    "Surrender",
    "Refuge",
    "Shelter",
    "Harbour",
}

SEASONS = {
    1: "In the January heat, let {k} include water, shade, and a slower pace.",
    2: "Late summer can feel heavy, so let {k} stay lighter than the weather.",
    3: "Cooler mornings are here, and {k} can use that gentler pace.",
    4: "Evenings draw in, so let {k} live inside a smaller day.",
    5: "The dark comes earlier, so let {k} include a real light turned on.",
    6: "Winter mornings are hard, so let {k} stay small.",
    7: "Getting up in midwinter is already brave, and {k} can be part of that bravery.",
    8: "Late winter can look bare and still be growing, and {k} can be quiet too.",
    9: "Spring is uneven, and {k} is allowed to be uneven too.",
    10: "Warm days get busy, so save a little time for {k}.",
    11: "The heat is building, so let {k} include water, shade, and a kind tone.",
    12: "The year is loud, and {k} is only for this day.",
}


def _pairs(block: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in block.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, value = line.split("|", 1)
        key, value = key.strip(), value.strip()
        if key in out:
            raise SystemExit(f"duplicate key: {key}")
        out[key] = value
    return out


MEANINGS = _pairs(
    """
Honesty | One true sentence is enough when a softer lie would be easier.
Patience | Waiting ten minutes can stop a craving from turning into a plan.
Courage | Courage today can be a short text that asks for help.
Willingness | Willingness can be as small as one yes.
Kindness | Kindness can start with the tone used on yourself.
Rest | Rest is part of staying well, not a prize to earn.
Hope | Hope can be borrowed from a friend when it cannot be felt.
Humility | Humility is telling the truth about how hard today is.
Connection | A lonely hour gets lighter when one safe person knows.
Gratitude | Gratitude can be one ordinary thing that is still all right.
Boundaries | A short no can be kind and still be firm.
Presence | Presence means this room, not the worst-case future.
Enough | Enough can be chosen, even before it feels true.
Begin | A new start can happen at this hour, not only at midnight.
Breathe | A longer breath out can give a loud feeling less power.
Ask | Asking for help is a strong move, not a failed one.
Stay | Staying through a dull hour often keeps the day safe.
Gentle | A gentle pace still counts as recovery.
Truth | Truth can be one fact, without a punishment stuck on the end.
Pause | A pause before a reply can save a mood and a relationship.
Trust | Trust can start as one small promise that is actually kept.
Show up | Showing up can mean staying in the room, even while quiet.
Small steps | Three tiny steps beat a perfect plan that never starts.
Belonging | There is a place among people who are trying, even on a messy day.
Forgiveness | Forgiveness can be one clean sentence and a kinder next hour.
Clarity | Clarity often comes after food, water, and a slower breath.
Steady | Steady work beats a dramatic promise that cannot be kept.
Openness | Openness is letting one safe person see the unpolished truth.
Care | Care can look like a meal, a wash, and a decent bedtime.
Listen | Listening can mean hearing the body before a big choice.
Choice | The safer next hour is a real choice.
Mercy | Mercy lets a person start again without a lecture.
Progress | Progress is any honest step, including a late one.
Simplicity | A simple plan is easier to keep on a tired day.
Support | Support is the help already near, if it is let in.
Keep going | Keeping going can mean the next hour, not a flawless year.
Soften | The jaw, the voice, or the inner insult can soften.
Morning | Morning can be a glass of water and one true line.
Light | Light can be a lamp, a window, or one less harsh thought.
Company | Company can be quiet and still mean not being alone.
Return | The way back can be a text, a meeting, or the next kind action.
Quiet | Quiet can be rest, not a sign of giving up.
Strength | Strength can be borrowed when your own feels thin.
Accept | A feeling can be accepted, and a safe action can still be chosen.
One step | One true next step is a full success.
Warmth | Warmth can be a blanket, a mug, or a kind voice.
Release | A fight that cannot be won today can be put down.
Notice | One thing that is still all right can be allowed to stay all right.
Repair | A repair can be one honest sentence while the hurt is still small.
Shelter | Shelter is a safe person, a safe room, or Get help if danger is close.
Practice | Practice is doing the care again, even when it feels ordinary.
Ease | Ease can mean a slower pace, not giving up.
Reach | Reach out before silence turns into a plan to disappear.
Ground | Feet on the floor, and a name for the room, can bring you back.
Fresh | Fresh can be a wash, clean clothes, or a new start after lunch.
Hold both | A hard feeling and a good fact can sit in the same hour.
Share | One hidden fact can be shared with someone who is safe.
Wait | A feeling can be waited out, and it can move.
Try again | A slip does not lock the door on trying again today.
Safe | Safe means leaving what causes harm and staying near kind people.
Real | Real is the true story, not the polished one.
Slow | Slow is often the pace that keeps a person well.
Here | Here means this room and this hour, not every fear at once.
Next | Next is the following small action, not the tenth one.
Room | The day needs room for food, rest, and one person.
Peace | Peace can be a truce with this hour, not a perfect calm.
Tender | A sore place needs care, not contempt.
Whole | A shaky day does not cancel being a whole person.
Free | Free can mean one hour not run by a craving or a secret.
Together | This day does not have to be done in secret.
Unlearn | One harsh inner rule can be refused for today.
Keep | One small promise, like water, food, or a text, can be kept.
Name it | A feeling named in a few words has less secret power.
Allow | A feeling can be here without being obeyed.
Balance | Food, rest, and honesty can share the same day.
Dignity | A wash, a meal, or a true sentence can restore a bit of dignity.
Neighbour | Anyone near you can be met with an ordinary kind tone.
Dawn | A poor sleep does not remove the chance in a new morning.
Carry less | This hour is enough to carry, and the other years can be set down.
Undo | A sharp word can be met with one clean apology, then the self-attack can stop.
Welcome | The tired part can be welcomed and given care.
Still | A pause can be allowed, and a pause is not failure.
Little | A little care is still care.
Stay close | Stay near the people and routines that keep you steady.
Renew | If the morning went badly, the day can renew at noon.
Honest ask | An honest ask is a short request for help, without a speech.
Spare | A little energy can be spared, and not all of it spent on worry.
Return path | The way back is shorter than shame says it is.
Companionship | One safe voice can be enough company for a lonely hour.
This day | This day is the only page that has to be lived.
Amends | Amends can be a changed hour, not a dramatic vow.
Anger | Anger is a signal, and it does not have to pick a fight.
Attention | Hunger, anger, loneliness, or tiredness may be what needs attention.
Awe | One minute with the sky, a tree, or a pet can be enough wonder.
Beauty | Beauty can be a clean corner, a plant, or light on a wall.
Become | Becoming is slow, and today only asks for a little more honesty.
Bend | A plan can bend without the day breaking.
Blessing | A blessing can be help that was not earned, or a meal that was eaten.
Body | The body needs food, water, movement, and rest before a big decision.
Brave | Brave can be telling the truth while a voice shakes.
Bridge | A bridge back can be a text, a meeting, or a simple apology.
Calm | Calm can be three slow breaths, not a new personality.
Candle | There can be enough light for the next step, not the whole road.
Change | Change can start with one different choice in this hour.
Circle | Safe people around you can make a heavy day lighter.
Comfort | Comfort can be a blanket, a warm drink, or a kind sentence.
Commit | The next hour can be the commitment, and the month can wait.
Compassion | Compassion uses the voice you would use for a friend.
Confidence | Confidence can be one finished task, not a loud feeling.
Consider | The safer option can be considered before the fast one.
Continue | A messy patch does not mean the whole day has to be binned.
Courtesy | A kinder tone is still possible when irritation is up.
Curiosity | Curiosity asks what a feeling needs, instead of obeying it.
Dare | Help can be asked for before pride writes a long speech.
Daylight | A few minutes of daylight on the face can shift a heavy mood.
Decide | The next small thing can be decided, and the life-sized choice can wait.
Delight | A good moment is allowed, and it does not need an apology.
Depend | Leaning on safe people can be a form of strength.
Depth | A simple truth is deep enough for today.
Deserve | Food, rest, and kindness still belong on a day that went badly.
Detach | An argument that cannot be won can be left, and your own side tended.
Direction | Direction can be the safer road, chosen on purpose.
Doorway | A meal or a text can be a doorway back into the day.
Early | Early help is better than a perfect speech later.
Earnest | A small promise counts when it is meant, even if it looks plain.
Effort | Effort counts even when nobody claps.
Embrace | The real day can be met, not only the one that was rehearsed.
Emerge | Leaving the bed, the scroll, or the secret can be a real step.
Empty | Empty feelings pass more safely with food, people, and rest.
Encourage | One factual kind sentence can encourage a hard hour.
Endurance | Endurance is staying for this hour, not grinding yourself down.
Energy | Food, water, and a short walk often bring a little energy back.
Evening | An evening is safer when it is smaller: food, a wash, and an earlier night.
Faith | Faith can mean trust in the next hour, with or without religious words.
Family | Family can be warm or complicated, and a kind boundary can still stand.
Fear | Fear can be named and shared, and it does not have to run the day.
Fellowship | Fellowship is people who stay, even a meeting where you barely speak.
Flourish | Getting through today kindly is enough growth.
Focus | The next task can have the focus, and the long list can wait.
Food | Food comes before feelings, especially when thoughts are harsh.
Footing | Both feet on the floor, and a plan for the next hour, is a footing.
Forgive | A clumsy try can be forgiven, and one cleaner try can follow.
Foundation | Water, food, truth, and one person are a strong base for a day.
Fragile | A fragile day needs a slower pace and more help, not more shame.
Freedom | Freedom can be one hour that is not handed to a craving.
Friend | A friend can hold a sentence that feels too heavy to hold alone.
Fruit | The fruit of this work is often quiet: a safer night, a kinder tone.
Gather | One fact, one need, and one person are enough to gather.
Generous | A specific thank-you, or a meal you allow yourself, can be generous.
Gift | Help can be received as a gift, without keeping a score.
Go gently | When the day is loud, a gentle pace can be the whole plan.
Goodwill | Goodwill can be one concrete wish for your own good.
Grace | Grace is kindness that does not have to be earned before a new start.
Grieve | Grief can sit with you, and it does not have to be numbed to get through the hour.
Grounded | Grounded means a body in a real room, not a mind stuck in next year.
Grow | One honest action is enough growth for today.
Guard | Sleep, safety, and the company you keep are worth guarding.
Guide | A safe person or a simple plan can guide the next hour.
Habit | Coming back matters more than a perfect streak.
Hands | Hands can do the next care: a mug, a text, a washed plate.
Harmony | A truce can be enough harmony for a feeling-filled house.
Heal | Healing is slow, and today the sore place can be tended kindly.
Heart | Heart shows up as honesty, not as a performance of being fine.
Help | Help is allowed today, and it can be asked for in a few words.
Home | Food, light, and a safe plan can make home a little kinder.
Honour | A limit that protects sleep, safety, or peace is worth honouring.
Hopeful | A tiny hope still counts.
Humble | Saying you need help, without name-calling, is a humble act.
Humour | A joke can tell the truth without being cruel, especially to yourself.
Hunger | Hunger can dress up as anger, so eat before a decision.
Hush | The inner insult can be hushed for one quiet minute.
Imagine | The next kind action can be pictured, then done.
Integrity | Integrity is one small action that matches the words.
Intention | An intention becomes real when the next tiny step is done.
Invite | Help can be invited in, even if the invite is a short text.
Joy | Joy is allowed to visit, and it does not have to be argued with.
Journey | The way is walked one day at a time, and this is that day.
Justice | Fairness includes being fair to yourself, not only hard on yourself.
Keep faith | The next hour can be stayed inside, and that is a faithful act.
Kind voice | Use the voice you would want a friend to hear on a hard day.
Laugh | Laughter can come, and it does not mean the hard thing is fake.
Lay down | Other people's choices can be laid down.
Lean | Lean on someone safe before an old habit gets the lean.
Learn | One plain lesson is enough, and then rest is allowed.
Let be | Some things can stay unfinished while one care gets done.
Lift | Daylight, a wash, or a kind text can lift the day a little.
Limit | A limit can protect sleep, money, or safety.
Longing | A longing for comfort is human, and it can be met without a substance.
Look up | Looking up from the screen shows the room you are actually in.
Love | Love can be practical: food, truth, and staying near safe people.
Margin | A little spare room in the day stops a feeling from running it.
Meal | A meal is a recovery tool, even when it is plain.
Meaning | The next kind action can be meaning enough for today.
Memory | A memory can visit without being put in charge of tonight.
Mend | A sharp moment can be mended while it is still small.
Mirror | The mirror does not get the last word, and a wash is enough.
Modest | A modest goal is one that can be finished today.
Music | One song can hold you while an urge rises and falls.
Mystery | Some answers can wait while the next safe thing is done.
Nourish | The body can be fed first, and the speeches can come second.
Nudge | A nudge toward help is kinder than a shove of shame.
Offer | The care you would offer a friend can be offered inward too.
Old patterns | Old patterns speak in a familiar voice, and they can be declined.
One thing | One thing done is better than ten things promised.
Open hands | Help can be received without keeping score.
Ordinary | Ordinary days are where recovery is actually kept.
Pain | Pain can be named and shared, and it does not have to be faced alone.
Pardon | A clumsy hour can be pardoned, and the next hour can be cleaner.
Path | Today's path is the safer step, not the fastest one.
Pay attention | Hunger, anger, loneliness, and tiredness are worth a check.
Persist | The small care can continue even when the mood dips.
Plan | A plan for the next hour beats a plan for ten years.
Praise | Praise can be naming one thing that went all right.
Prayer | Prayer can be a few honest words, or a quiet minute if that fits better.
Prepare | Tonight can prepare one kindness for the morning: food, clothes, or who to call.
Present | This hour counts more when the phone is down for a little while.
Preserve | Sleep and safety come before looking as if everything is fine.
Promise | A promise can stay small enough for this day to hold.
Protect | Sleep, safety, and a kind boundary are worth protecting.
Purpose | Staying safe and being honest can be purpose enough today.
Receive | Help can be received without a speech about deserving it.
Reconcile | One honest text, or one changed hour, can begin a repair.
Recover | Recovery lives in the kitchen, the meeting, and the bedtime.
Redirect | A craving can be pointed toward water, a walk, or a safe person.
Refresh | A wash, a drink, and a step outside can refresh a stuck hour.
Refuge | Refuge can be a safe room, a safe person, or Get help if the day is dark.
Relax | Shoulders can drop on purpose, so the body knows it can stand down.
Rely | The supports that have helped before can be used again.
Remember | Hard hours have been got through before, one hour at a time.
Respect | A limit, a body, and kind people are worth respect.
Respond | A reply can be slower than the feeling, with softer words.
Restore | One repaired sentence, or one decent meal, can restore a bit of the day.
Reverence | A life can be treated as worth care, and that is a quiet reverence.
Rhythm | Food, movement, and sleep in a simple rhythm can steady the mind.
Right-size | The job can be made small enough to fit in the next hour.
Risk | The honest text is a safer risk than the old hiding place.
Ritual | Tea, a walk, or a short quiet can mark a return to safety.
Routine | A routine is a friend on days when motivation is late.
Sanctuary | A quiet corner, a meeting, or a safe voice can be a sanctuary.
Satisfy | Food, water, rest, and truth can satisfy the simple needs first.
Season | This stretch of life can be slow, and slow is allowed.
Self-kindness | A factual kind sentence is care, not an excuse to drop the next right thing.
Separate | What is yours to tend can be separated from other people's choices.
Serene | A full calm is not required, and a quieter minute is enough.
Serve | One useful kindness, including kindness to yourself, can serve the day.
Settle | A slower breath can settle the body before any hard conversation.
Shade | Shade, water, and a slower pace are real care when the day is hot.
Shame | Shame is not a coach, and it does not get to run the day.
Shape | The next hour can be shaped, and the month can stay in the month.
Shift | A window, a wash, or a change of company can shift a room.
Shine | Honesty can be the shine, not a show of having it all together.
Shoulder | A friend, a meeting, or a helpline can be a shoulder for this hour.
Silence | Quiet with someone safe is different from quiet that hides a slip.
Sincere | One true sentence can be sincere, even if it is clumsy.
Sleep | Sleep is part of staying well, so a decent bedtime is worth protecting.
Slip | A slip can be told to someone safe before it turns into a secret life.
Smile | A smile is allowed, and it does not make the hard thing fake.
Soothe | Warmth, water, or a slower breath can soothe a raw body.
Sorry | Sorry can be one clean sentence, then a changed action.
Soul | The deepest self needs kindness as much as the body does.
Speak | The need can be spoken before resentment speaks instead.
Spirit | Spirit can mean the part that still wants to be honest and kind.
Story | The real story can be told to someone safe, not only the impressive one.
Stretch | A gentle stretch can bring you back when the mind has raced ahead.
Stumble | A stumble is a moment, and the next step can still be safe.
Sufficient | Enough is a fair place to stop.
Sun | A minute of sun can remind you the world is larger than the worry.
Surrender | The heavy part can be handed to a prayer, a friend, or a written plan.
Tears | Tears are allowed, and they are not a failure of strength.
Tend | What is yours can be tended: body, words, and the next hour.
Thanks | A small, specific thanks still matters.
Thirst | A thirst for comfort is human, and water, company, or rest can answer first.
This hour | This hour is the only one that has to be lived right now.
Thought | A thought is not a fact, and it is not an order.
Today's page | Today's page can stay free of tomorrow's disaster story.
Tone | The tone can stay soft while the facts stay clear.
Touch | A pet, a safe hand, or a hand on the chest can bring you back to now.
Tranquil | A less harsh hour is still a win if full calm does not arrive.
Treasure | An ordinary good, like a meal or a kind reply, can be treasured.
Trust again | Trust can start again with one safe person and one kept promise.
Turn toward | Help, food, or a friend can be turned toward, instead of an old escape.
Unburden | One safe person can be told what has been carried.
Understand | Understanding can wait until after food.
Unfold | The day can unfold one hour at a time.
Unite | One conversation with people who want good for you is enough unity.
Unplug | The scroll, the argument, or the craving can be unplugged for a while.
Unwind | A wash, a dimmer light, and one worry on paper can unwind the night.
Upright | Getting up and telling the truth is an upright day.
Useful | A meal, a text, or an opened bill can be the useful thing.
Value | Food, rest, and honesty are ways to treat yourself as valuable.
Venture | A small ask, a short walk, or a meeting can be the venture.
Voice | Use a voice you would be glad to hear from someone else.
Walk | A walk to the corner can change a stuck hour.
Wash | A wash can end one hard stretch and start the next hour.
Water | Water before a big decision is a simple act of care.
Weave | Food, truth, and people can be woven through the day.
Weep | Tears can come, and someone safe can be told if the sadness is too heavy.
Wide | One hard hour is not a whole life.
Willing | Being willing is enough to begin, even when confidence is missing.
Window | An open window can change the air and the mood of a room.
Wisdom | The safer choice, made before the upset takes over, is wisdom enough.
Within | A kinder inner voice can be practised, even if it feels new.
Witness | One safe person who hears the true story can be a witness.
Wonder | Wonder can be small: light, a pet, a tree, a good mouthful of food.
Worth | Worth does not rise and fall with one hour.
Wound | A wound needs care and company, not a lecture.
Write it down | The feeling, the need, and the person to tell can be written down.
Yes to help | Yes can be a short reply to help that is already offered.
Yield | The big argument can be yielded, and the protective boundary kept.
Anchor | A routine, a person, or a simple prayer can be an anchor.
Arrival | Getting to the next safe place counts, even if you feel shaky.
Blanket | A blanket, a warm drink, or a kind voice can settle a raw hour.
Clearing | One cleared surface, or one worry moved onto paper, can help the mind.
Ember | A small remaining willingness is enough to start.
Foothold | The next safe step is a foothold, and the whole staircase can wait.
Harbour | A safe place with someone who knows the truth can be a harbour.
Hearth | A kitchen table and a simple meal can be a hearth.
Lamp | Enough light for this step is a real lamp.
Loyal | The care chosen this morning can be stayed loyal to.
Rooted | Feet on the floor, and people who know the truth, is a rooted hour.
Steadfast | Coming back after a wobble is steadfast, and never wobbling is not required.
Sunrise | After a bad night, a morning can still be a start.
Threshold | The moment the safer side is chosen is a real threshold.
Unhurried | A human pace still gets you there.
Haven | A meeting, a friend's voice, or a quiet safe room can be a haven.
Gladness | A brief gladness can be allowed to stay.
Solace | Company, music, or a simple prayer can be solace.
Solidarity | Other people are staying too, and their steadiness can be borrowed.
Spacious | The day can have room for rest, not only for tasks.
Second wind | A little energy can return after food, water, and a short rest.
Soft landing | A gentle evening can be a soft landing after a hard day.
Wholehearted | Meaning the small thing is enough, and feeling grand is not required.
This breath | When the mind is racing, this breath is a place to start.
Plain speech | The true sentence, without extra drama, is plain speech.
No hurry | The next care can happen at a human pace.
True north | Honesty, safety, and the next kind step can be the direction.
Bread | Real food is a serious part of getting through the day.
Door | After a slip, a fight, or a silence, a way back in can still be open.
Fireside | Warmth and safety can be a quiet kitchen, not only a grand picture.
Footstep | One step toward help is a real move.
Good enough | A finished small care is good enough, and a perfect day is not required.
Halfway | Halfway through a hard feeling, a safe action can still be chosen.
Holding | Staying near people, and not making a huge decision tonight, is a way to hold on.
Humane | Cruelty can be refused, including cruelty toward yourself.
Kindred | Kindred are people who know the struggle and want good for you.
Lighter | Telling the truth and eating can make the hour a little lighter.
Long view | The long view can wait, because this day is the short view that matters.
Measured | A measured reply is slower, kinder, and clearer.
Nearness | Being near safe people is a protection, not a weakness.
Night peace | A small evening and a light out can build a more peaceful night.
Open heart | One honest sentence can be an open heart, without telling everything.
Plain day | A plain day, kept safe, is a good day in recovery.
Quiet mind | A tended body and a told truth often quiet the mind a little.
Reassurance | Reassurance can be borrowed from someone who wants good for you.
Root | A routine can hold when feelings swing.
Safe harbour | A person or place where pretending is not required can be a safe harbour.
Simple care | Water, food, rest, and one true sentence are simple care.
Still here | Still being here this morning is a fact that matters.
Sunlight | A few minutes of sunlight is a free help for a heavy head.
Tenderness | A tender tone toward yourself makes the next right thing more possible.
This room | Naming this room out loud can interrupt a spiral.
Unforced | The care can be done without faking a feeling.
Watchful | A risky hour can be noticed early and told to someone.
Well enough | Well enough is a fair aim for today.
With care | The next action can be kind, honest, and small enough to finish.
"""
)

GLOSSES = _pairs(
    """
One true sentence | say one true sentence to someone safe, or write it down
The hour you can hold | stay inside the next hour and leave the rest
Skip the inner trial | stop the self-attack and do one kind thing
Food, then feelings | eat something simple before sorting feelings
Shame is not a coach | refuse shame as a teacher and use a kind tone
A boundary with kindness | say one short no, kindly, and keep it
Begin again at noon | begin again from this hour if the morning went badly
Rest is allowed | rest without having to earn it first
Company over secrecy | choose company over a secret for one fact
The pause that protects | pause before the reply, the urge, or the decision
No life overhaul | keep the change small enough to finish today
The next kind thing | do the next kind thing and then stop
Water, food, truth | drink water, eat, and tell one true thing
Do not decide while upset | delay any big decision until after food and a safe talk
A softer inner voice | replace the inner insult with one factual sentence
The help already here | accept one help that is already offered
Let good be good | let one good moment stay good for a full minute
Enough is a decision | decide that enough is enough for today
Out of hiding | bring one hidden fact to someone safe
The feeling will move | sit with the feeling until it shifts a little
Ask before you disappear | ask for help before going quiet
Keep the problem small | keep the problem to the next hour
Ordinary courage | do one ordinary brave thing, like sending an honest text
Sleep is part of staying | protect a decent bedtime
A promise the size of today | keep one promise small enough for today
The evening you protect | make the evening small with food, a wash, and lights out
Tell someone early | tell someone safe early, before a secret grows
The craving can wait | wait ten minutes before acting on a craving
Three small cares | do three small cares and ignore the long list
Mercy for a clumsy try | give the clumsy try some mercy and try once more
A walk without a lecture | take a short walk without a self-lecture
Make the job smaller | shrink the job until it fits in an hour
The way back is open | take one step back toward help
Stay where it is safe | stay in the safer place, or with safer people
Leave tomorrow for tomorrow | leave tomorrow's worries out of tonight
A table set for yourself | set a simple place to eat
Keep today on today's page | keep today's effort on today's page
Small things have worth | treat one small care as something with worth
Unclench and continue | unclench the jaw, drop the shoulders, and continue
A factual next step | take the next real step, not the imagined one
Borrow a little hope | borrow a little hope from someone who is staying
Give the lonely hour company | give the lonely hour a safe person, even by text
Do the care, skip the speech | do the care and skip the long speech
A kinder reason to try | choose a kinder reason than shame
A thought is not a fact | name the thought and do not treat it as a fact
Ten minutes of willingness | give ten minutes of willingness to the next care
Recovery in ordinary clothes | do recovery in an ordinary way, like a meal or a bedtime
A messy try still counts | let the messy try count, and continue
A small repair is enough | make one small repair and then stop
Put the phone in another room | put the phone in another room for a while
A kinder coach than shame | pick a kinder guide than shame for the next hour
A bad hour is not the story | refuse to make a bad hour into the whole story
Food before big thoughts | eat before chasing big thoughts
Someone who wants you well | contact someone who is safe and kind
A noon beginning | start again at noon if the morning needs it
The sharp word, repaired | repair a sharp word with one clean sentence
Let the day be ordinary | let the day be ordinary and still worthwhile
Stay for the dull stretch | stay through the dull stretch
A limit that loves you | keep one limit that protects sleep, safety, or peace
Write it down and breathe | write the worry down and take a slower breath
A feeling is not the whole story | treat the loud feeling as a passing mood, not as the whole person
A meeting, even silent | go to a meeting, even if staying quiet
Tell the secret safely | tell one secret to someone safe
Choose the safer road | choose the safer road for the next hour
A plan for the next hour | make a plan that only covers the next hour
The body you thank | thank the body for getting this far today
Pause for one song | pause for the length of one song before answering an urge
Half a hope still counts | let a small hope count as real hope
A human hour | treat this hour in a human way, with food and kindness
Unfinished, and still welcome | let an unfinished day still be welcome
Enough light for this step | use the light that is enough for this step
Choose people | choose people over a secret for one fact
This date is enough | let this date be enough
A longer exhale | breathe out longer than the breath in, three times
Worth protecting | protect something worth keeping, like sleep or safety
Call loneliness by its name | name the loneliness, then reach for a person
A meal with no debate | eat a meal without a debate about deserving it
Steady is enough today | choose steady over dramatic
The next right kindness | do the next kind thing and finish it
Stop keeping score | stop keeping a score of worth
A day you do not abandon | do not abandon the day, and do one more care
Courage in an ordinary hour | show courage in an ordinary way
A slower reply | send a slower, kinder reply
Recovery in the kitchen | practise recovery in the kitchen with a simple meal
Do not load tonight with tomorrow | keep tonight free of tomorrow's load
Tell the real story | tell the real story to someone safe
A night you actually wind down | wind the night down with a wash and a dim light
Half a prayer, or half a hope | say a short prayer, or name one hope, whichever fits
The habit of coming back | come back to the care, even after a drift
Willingness the size of a text | let willingness be as small as a text
Hungry, angry, lonely, tired | check hunger, anger, loneliness, and tiredness, then tend the one that fits
A boundary you mean | keep one boundary that was actually meant
"""
)


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


def low(text: str) -> str:
    return text[:1].lower() + text[1:]


def cap(text: str) -> str:
    return text[:1].upper() + text[1:]


def sentences_of(text: str) -> list[str]:
    flat = text.replace("\n", " ")
    parts = re.split(r"(?<=[.!?])\s+", flat)
    return [p.strip() for p in parts if p.strip()]


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9'’\-]+", text))


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 1
    if w.endswith("e") and not w.endswith("le") and len(w) > 2:
        w = w[:-1]
    groups = re.findall(r"[aeiouy]+", w)
    return max(1, len(groups))


def grade(text: str) -> float:
    sents = sentences_of(text)
    words = re.findall(r"[A-Za-z']+", text)
    if not sents or not words:
        return 0.0
    syl = sum(syllables(w) for w in words)
    return 0.39 * (len(words) / len(sents)) + 11.8 * (syl / len(words)) - 15.59


def paragraphs(*parts: str) -> str:
    cleaned = []
    for part in parts:
        part = re.sub(r"\s+", " ", part).strip()
        if part:
            cleaned.append(part)
    return "\n\n".join(cleaned)


def pool_for(word: str) -> str:
    hay = word.lower()
    for name, keys in POOL_WORDS:
        if name == "sleep":
            name = "rest"
        for key in keys:
            if key in hay:
                return "rest" if name == "rest" else name
    return "general"


def action_for(word: str, i: int) -> str:
    name = pool_for(word)
    if name == "general":
        pool = POOLS["truth"] + POOLS["body"] + POOLS["people"] + POOLS["help"] + POOLS["start"]
    else:
        pool = POOLS[name]
    return pool[(i * 3) % len(pool)]


def focus_for(title: str) -> str:
    for verb in TITLE_VERBS:
        prefix = verb + " "
        if title.startswith(prefix):
            return low(verb) + " " + title[len(prefix):]
    if title not in GLOSSES:
        raise SystemExit(f"missing gloss for title: {title}")
    return GLOSSES[title]


def _must_contain(text: str, key: str, label: str) -> None:
    for sent in sentences_of(text):
        if key.lower() not in sent.lower():
            raise SystemExit(f"{label} sentence missing {key!r}: {sent}")


def hope_word(style: int, word: str) -> str:
    k = low(word)
    blocks = [
        f"{word} can be a short prayer, or a few quiet words to a friend.",
        f"{word} can begin again today, and mercy means you do not have to earn that start.",
        f"{word} can stay small while you borrow hope from someone safe.",
        f"{word} belongs to this day only, and tomorrow can keep its own worries.",
        f"{word} grows more easily with a kind tone than with shame.",
        f"{word} can be a value you keep, in a quiet way that fits you.",
        f"{word} gets easier to hold when you ask for help in a short text.",
        f"If God is part of your life, you can pray about {k} today. If not, a friend can sit with you, and {k} can be shared.",
    ]
    text = blocks[style % len(blocks)]
    _must_contain(text, k, "hope-word")
    return text


def hope_line(style: int, word: str) -> str:
    k = low(word)
    blocks = [
        f"We can pray in plain words, or talk to a friend, and {k} can be held either way.",
        f"Mercy means {k} can begin again for us without a lecture.",
        f"We can borrow hope from each other, and {k} can stay small while we do.",
        f"We only need {k} for this day, and next year can wait.",
        f"Shame does not get to be the boss, so {k} can stay gentle.",
        f"We can keep {k} as a value, in a quiet way that fits us.",
        f"A short text for help is enough, and {k} does not have to be carried alone.",
        f"If God is part of our lives, we can pray about {k} today. If not, a friend can sit with us, and {k} can be shared too.",
    ]
    text = blocks[style % len(blocks)]
    _must_contain(text, k, "hope-line")
    return text


def crisis_word(word: str) -> str:
    k = low(word)
    return (
        f"If {k} sits next to thoughts of hurting yourself, open Get help or call 000, and stay near people. "
        f"A reading about {k} is not a crisis plan."
    )


def crisis_line(title: str) -> str:
    k = low(title)
    return (
        f"If {k} comes with thoughts of hurting yourself, open Get help or call 000. "
        f"Stay near other people, and do not leave {k} to a reading alone. "
        f"Real help matters more than getting {k} perfect."
    )


def needs_crisis_title(title: str) -> bool:
    hay = title.lower()
    return any(
        bit in hay
        for bit in (
            "disappear",
            "shame",
            "dark",
            "harm",
            "secret",
            "lonely",
            "craving",
            "slip",
        )
    )


def opener(i: int, word: str) -> str:
    options = [
        f"{word} can stay small today.",
        f"{word} fits a hard morning.",
        f"{word} is only for this day.",
        f"{word} is allowed to be imperfect.",
        f"{word} does not have to be loud to be real.",
        f"{word} can start in an ordinary hour.",
    ]
    return options[i % len(options)]


def compose(theme_words: list[str], titles: list[str], index_to_month_day) -> tuple[list[dict], list[dict]]:
    missing = [w for w in theme_words if w not in MEANINGS]
    extra = sorted(set(MEANINGS) - set(theme_words))
    if missing or extra:
        raise SystemExit(f"meaning keys missing={missing[:8]} extra={extra[:8]}")
    if len(titles) != 365 or len(theme_words) != 365:
        raise SystemExit("compose expected 365")
    for title in titles:
        focus_for(title)
    seen_focus = {}
    for title in titles:
        focus = focus_for(title)
        if focus in seen_focus:
            raise SystemExit(f"duplicate focus {focus!r} for {title} and {seen_focus[focus]}")
        seen_focus[focus] = title
    for gloss in GLOSSES.values():
        if re.search(r"\b(I|me|my|myself|we|our|you|your|yourself)\b", gloss):
            raise SystemExit(f"gloss has a pronoun: {gloss}")

    scene_pairs = take_pairs(len(PLACES), len(EVENTS), 365, 11)
    word_entries = []
    jft_entries = []
    grades = []
    for i, word in enumerate(theme_words):
        month, day = index_to_month_day(i)
        title = titles[i]
        k = low(word)
        place = PLACES[scene_pairs[i][0]]
        event = EVENTS[scene_pairs[i][1]]
        feeling = FEELINGS[i % len(FEELINGS)]
        action = action_for(word, i)
        second = SECONDS[(i * 5 + 2) % len(SECONDS)]
        if action.split()[0] in second:
            second = SECONDS[(i * 5 + 3) % len(SECONDS)]
        meaning = MEANINGS[word]
        if not meaning.endswith("."):
            meaning += "."
        focus = focus_for(title)
        line = low(title)

        word_parts = [
            f"{opener(i, word)} {meaning} You can start before you feel brave, and {k} still counts.",
            (
                f"You might be {place}, and {event}. "
                f"{cap(feeling)} can be here too, and {k} can stay small. "
                f"You do not have to fix all of that today."
            ),
            (
                f"{cap(action)}, so {k} has a real step today. "
                f"{word} still counts if that is all you do. "
                f"{cap(second)} gives {k} a little extra help."
            ),
            hope_word(i % 8, word),
        ]
        if i % 6 == 0:
            word_parts.append(SEASONS[month].format(k=k))
        if word in CRISIS_WORDS or "very dark" in event:
            word_parts.append(crisis_word(word))
        word_reading = paragraphs(*word_parts)

        jft_parts = [
            (
                f"{cap(focus)}. "
                f"We only have to do this for today, and {k} can stay that small. "
                f"A hard hour does not cancel {k}."
            ),
            (
                f"We might be {place}, and {event}. "
                f"The task can still be done."
            ),
            (
                f"{cap(feeling)} can show up. "
                f"{cap(second)} gives {k} a little extra help too."
            ),
            f"Food, a drink of water, and one safe person can support {k} today.",
            hope_line((i + 4) % 8, word),
        ]
        if needs_crisis_title(title) and word not in CRISIS_WORDS and "very dark" not in event:
            jft_parts.append(crisis_word(word))
        jft_parts.append(f"Just for today, I will {focus}.")
        jft_reading = paragraphs(*jft_parts)

        for label, text in (("word", word_reading), ("jft", jft_reading)):
            for sent in sentences_of(text):
                n = word_count(sent)
                if n > 28:
                    raise SystemExit(f"long sentence ({n}) {label} {month}-{day}: {sent}")
            grades.append(grade(text))

        word_entries.append({"month": month, "day": day, "word": word, "reading": word_reading})
        jft_entries.append({"month": month, "day": day, "title": title, "reading": jft_reading})

    if grades:
        avg = sum(grades) / len(grades)
        print(f"readability grade min {min(grades):.1f} max {max(grades):.1f} avg {avg:.1f}")
    return word_entries, jft_entries
