#!/usr/bin/env python3
"""Separate daily readings for Hopewick.

Word for the day: a short original Christian reflection with a real Bible
reference. Just for today: an original Narcotics Anonymous-style note,
one day at a time.

They are generated apart. The same Brisbane date does not share a theme,
a scene, or a sentence. This is not the copyrighted NA Just for Today book,
and it is not a commercial devotional.

Called from tools/build_daily_readings.py.
"""
from __future__ import annotations

import re

from plain_daily import (
    EVENTS,
    PLACES,
    focus_for,
    lcg_shuffle,
    needs_crisis_title,
)

STOP = set(
    """
    a an the of to and or for with in on at by from this that these those it its
    is be are was were been being as if not no nor but so than then too very
    just will would can could may might must should into over out up off onto
    about after before when while who what which per via own your our my me we
    you i us do does did doing done have has had having not today tonight
    one two three small little next back again still already only also
    """.split()
)

# Same-day themes that would feel like one reading split in two.
GROUPS = [
    {"honest", "honesty", "truth", "true"},
    {"patient", "patience", "pause", "wait"},
    {"courage", "brave"},
    {"rest", "sleep", "bed"},
    {"hope", "hopeful"},
    {"gratitude", "grateful", "thank", "thanks", "praise"},
    {"boundary", "boundaries", "limit"},
    {"forgive", "forgiveness", "pardon", "repair", "amends", "mend"},
    {"pray", "prayer", "faith"},
    {"kind", "kindness"},
    {"shame"},
    {"grief", "grieve", "mourn"},
    {"food", "meal", "hunger", "eat"},
    {"help", "ask", "support"},
    {"anger", "angry"},
    {"fear", "afraid"},
    {"love"},
    {"peace", "calm", "serene", "tranquil"},
    {"humble", "humility"},
    {"joy", "glad", "gladness"},
    {"light", "lamp", "sun", "sunlight", "dawn"},
    {"home", "shelter", "refuge", "haven", "harbour", "harbor"},
    {"fellowship", "meeting", "company", "companionship"},
    {"body"},
    {"water"},
    {"friend"},
    {"mercy", "grace"},
    {"gentle", "tender", "tenderness"},
    {"quiet", "silence", "hush"},
    {"strength", "strong"},
    {"begin", "start"},
    {"share"},
    {"safe", "safety"},
    {"free", "freedom"},
    {"listen"},
    {"speak", "voice", "speech"},
    {"walk"},
    {"morning", "sunrise"},
    {"evening", "night"},
    {"heart"},
    {"soul", "spirit"},
    {"wonder", "awe"},
    {"beauty"},
    {"change"},
    {"trust"},
    {"accept"},
    {"release"},
    {"notice"},
    {"choice", "decide"},
    {"simple", "simplicity"},
    {"enough"},
    {"present", "presence"},
    {"open", "openness"},
    {"clear", "clarity"},
    {"steady"},
    {"progress"},
    {"care"},
    {"warmth"},
    {"ground", "grounded"},
    {"fresh"},
    {"whole"},
    {"together"},
    {"balance"},
    {"dignity"},
    {"welcome"},
    {"renew"},
    {"belong", "belonging"},
    {"connect", "connection"},
    {"willing", "willingness"},
    {"honour", "honor"},
    {"comfort"},
    {"heal"},
    {"protect", "guard"},
    {"serve", "service"},
    {"step", "steps", "footstep"},
    {"work"},
    {"habit"},
    {"story"},
    {"plan"},
    {"promise"},
    {"forgive"},
    {"neighbour", "neighbor"},
    {"family"},
    {"laugh", "humour", "humor"},
    {"music"},
    {"window"},
    {"door", "doorway"},
    {"bread"},
    {"table"},
    {"kitchen"},
    {"phone"},
    {"text"},
    {"secret"},
    {"craving"},
    {"slip"},
    {"using"},
    {"clean"},
    {"sponsor"},
]

# Real references. The gloss is an original paraphrase, not a quotation
# from a copyrighted translation and not a page from a published devotional.
VERSES = [
    ("John 3:16", "God loved the world and gave his Son so that trust in him leads to life with God"),
    ("Psalm 23:1", "the Lord is a shepherd who looks after his people, so they are not left without care"),
    ("Matthew 11:28", "Jesus invites weary people to come to him and find rest"),
    ("Philippians 4:6", "Paul tells believers to bring worries to God in prayer instead of carrying anxiety alone"),
    ("Isaiah 41:10", "God tells his people not to fear, because he is with them and will strengthen them"),
    ("Lamentations 3:23", "the writer says the Lord's mercies are new every morning"),
    ("Romans 8:1", "there is no condemnation for those who are in Christ Jesus"),
    ("Psalm 34:18", "the Lord is near to people whose hearts are broken"),
    ("Micah 6:8", "what the Lord asks is justice, mercy, and a humble walk with him"),
    ("1 John 4:19", "we love because God loved us first"),
    ("Matthew 6:34", "Jesus says not to borrow tomorrow's trouble, because this date has enough of its own"),
    ("John 14:27", "Jesus gives his own peace, a peace the world does not supply"),
    ("2 Corinthians 12:9", "grace is enough, and strength shows up in weakness"),
    ("Psalm 46:10", "God says to be still and know that he is God"),
    ("Ephesians 2:8", "salvation is a gift of grace through faith, not a wage that is earned"),
    ("Hebrews 13:5", "God promises never to leave his people or forsake them"),
    ("1 Peter 5:7", "Peter says to cast anxiety on God, because God cares"),
    ("James 1:19", "be quick to listen, slow to speak, and slow to anger"),
    ("Colossians 3:13", "forgive, because the Lord has forgiven"),
    ("Galatians 6:2", "carry one another's burdens"),
    ("Romans 12:18", "as far as it depends on you, live at peace with people"),
    ("John 8:12", "Jesus calls himself the light of the world"),
    ("Psalm 121:2", "help comes from the Lord, maker of heaven and earth"),
    ("Proverbs 3:5", "trust the Lord with your whole heart rather than leaning only on your own understanding"),
    ("Isaiah 40:31", "those who wait on the Lord renew their strength"),
    ("Matthew 5:7", "Jesus says the merciful are blessed and will receive mercy"),
    ("Luke 15:20", "in Jesus' story the father runs to meet the son who comes home"),
    ("John 11:35", "the gospel records that Jesus wept with grieving friends"),
    ("Psalm 103:12", "God removes sins as far as east is from west"),
    ("1 John 1:9", "if we confess our sins, God is faithful and just to forgive"),
    ("Matthew 22:39", "Jesus says to love your neighbour as yourself"),
    ("John 15:12", "Jesus tells his friends to love one another as he has loved them"),
    ("Romans 5:8", "Christ died for us while we were still sinners, which is how God shows his love"),
    ("Philippians 4:13", "Paul says he can face what comes through Christ who strengthens him"),
    ("2 Timothy 1:7", "God gives a spirit of power, love, and self-control, not fear"),
    ("Psalm 56:3", "when the psalmist is afraid, he puts his trust in God"),
    ("Joshua 1:9", "God tells Joshua to be strong and courageous, because the Lord is with him"),
    ("Deuteronomy 31:8", "the Lord goes ahead and does not abandon his people"),
    ("Matthew 6:11", "Jesus teaches us to ask for this day's bread"),
    ("Psalm 118:24", "this is the day the Lord has made, and it can be received with thanks"),
    ("Proverbs 15:1", "a soft answer turns anger aside"),
    ("Ecclesiastes 4:9", "two are better than one, because they can lift each other"),
    ("Isaiah 43:1", "God says he has called his people by name, and they are his"),
    ("Jeremiah 29:11", "the Lord speaks of a future and a hope, not of plans to harm"),
    ("Zephaniah 3:17", "the Lord rejoices over his people and quiets them with his love"),
    ("Mark 4:39", "Jesus speaks peace to a storm"),
    ("Luke 6:36", "Jesus says to be merciful, as your Father is merciful"),
    ("John 10:11", "Jesus calls himself the good shepherd who lays down his life for the sheep"),
    ("Acts 2:42", "the early church stayed with teaching, shared life, meals, and prayers"),
    ("Romans 8:38", "nothing can separate us from the love of God in Christ"),
    ("1 Corinthians 13:4", "love is patient and kind, and it does not keep a tally of wrongs"),
    ("Galatians 5:22", "the Spirit grows love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, and self-control"),
    ("Ephesians 4:32", "be kind and tender-hearted, forgiving as God in Christ forgave you"),
    ("Philippians 4:7", "the peace of God guards hearts and minds in Christ"),
    ("Colossians 3:15", "let the peace of Christ rule in your hearts"),
    ("1 Thessalonians 5:11", "encourage one another and build each other up"),
    ("Hebrews 4:16", "approach God's throne of grace for mercy and timely help"),
    ("James 1:5", "if you lack wisdom, ask God, who gives generously"),
    ("1 Peter 4:8", "keep love earnest, because love covers a multitude of sins"),
    ("Revelation 21:4", "God will wipe tears away, and mourning will not have the last word"),
    ("Psalm 23:4", "even in a dark valley the psalmist is not abandoned, because the Lord is with him"),
    ("Psalm 27:1", "the Lord is light and salvation"),
    ("Psalm 46:1", "God is a refuge and strength, a help found in trouble"),
    ("Psalm 51:10", "the psalmist asks God for a clean heart and a steady spirit within"),
    ("Psalm 139:14", "people are wonderfully made by God"),
    ("Matthew 5:4", "Jesus says those who mourn are blessed and will be comforted"),
    ("Matthew 5:9", "Jesus says peacemakers are blessed and called children of God"),
    ("Matthew 5:16", "let your light shine so that good work points people to the Father"),
    ("Matthew 11:29", "Jesus says he is gentle and lowly, and his yoke is kindly"),
    ("Matthew 28:20", "Jesus promises to be with his people always"),
    ("Mark 12:30", "love the Lord your God with heart, soul, mind, and strength"),
    ("Luke 6:31", "treat others as you would want them to treat you"),
    ("John 1:5", "the light shines in the darkness, and the darkness has not overcome it"),
    ("John 14:1", "Jesus tells his friends not to let their hearts be troubled, and to trust God"),
    ("John 16:33", "the world brings trouble, and Jesus says to take heart because he has overcome"),
    ("Romans 8:26", "the Spirit helps when we are weak and do not know how to pray"),
    ("Romans 8:28", "for those who love God, he works things towards good"),
    ("Romans 12:12", "rejoice in hope, be patient in trouble, and keep praying"),
    ("Romans 12:21", "do not be overcome by evil, but overcome evil with good"),
    ("1 Corinthians 16:14", "let everything you do be done in love"),
    ("2 Corinthians 1:3", "God is the Father of mercies and the God of all comfort"),
    ("2 Corinthians 5:17", "anyone in Christ is a new creation"),
    ("Ephesians 4:26", "be angry, and do not let the anger turn into sin"),
    ("Philippians 2:3", "in humility count others as significant, not only yourself"),
    ("Philippians 4:8", "think on what is true, honourable, just, pure, and lovely"),
    ("1 Thessalonians 5:16", "rejoice always"),
    ("1 Thessalonians 5:17", "pray and do not give up"),
    ("1 Thessalonians 5:18", "give thanks in all circumstances, for this is God's will in Christ"),
    ("Hebrews 11:1", "faith is confidence in what is hoped for, even when it is not yet seen"),
    ("James 4:8", "draw near to God, and he will draw near to you"),
    ("1 John 4:7", "love is from God"),
    ("1 John 4:18", "perfect love drives fear out"),
    ("Genesis 1:31", "God looked at what he had made and called it very good"),
    ("Exodus 14:14", "the Lord fights for his people, and they are told to be still"),
    ("Numbers 6:24", "the blessing asks the Lord to bless his people and keep them"),
    ("Deuteronomy 6:5", "love the Lord your God with all your heart, soul, and strength"),
    ("1 Samuel 16:7", "people look at the outside, and the Lord looks at the heart"),
    ("Nehemiah 8:10", "the joy of the Lord is strength"),
    ("Job 19:25", "Job says that his Redeemer lives"),
    ("Psalm 4:8", "the psalmist lies down in peace because the Lord makes him dwell in safety"),
    ("Psalm 19:1", "the heavens declare the glory of God"),
    ("Psalm 23:6", "goodness and mercy follow, and the psalmist will dwell with the Lord"),
    ("Psalm 30:5", "weeping may last for a night, and joy comes with the morning"),
    ("Psalm 37:5", "commit your way to the Lord and trust him"),
    ("Psalm 42:11", "the psalmist tells his own soul to hope in God"),
    ("Psalm 55:22", "cast your burden on the Lord, and he will sustain you"),
    ("Psalm 73:26", "body and heart may fail, and God remains the strength of the heart"),
    ("Psalm 91:1", "whoever lives in the shelter of the Most High rests in his shadow"),
    ("Psalm 100:4", "enter God's gates with thanksgiving"),
    ("Psalm 103:8", "the Lord is merciful and gracious, slow to anger, and rich in steadfast love"),
    ("Psalm 107:1", "give thanks to the Lord, for his steadfast love endures"),
    ("Psalm 119:105", "God's word is a lamp for the feet and a light for the path"),
    ("Psalm 133:1", "it is good when God's people live together in unity"),
    ("Psalm 145:18", "the Lord is near to all who call on him in truth"),
    ("Psalm 147:3", "he heals the brokenhearted and binds up their wounds"),
    ("Proverbs 17:17", "a friend loves at all times"),
    ("Proverbs 27:17", "as iron sharpens iron, one person sharpens another"),
    ("Ecclesiastes 3:1", "there is a season for everything"),
    ("Isaiah 26:3", "God keeps in peace the mind that stays on him"),
    ("Isaiah 40:11", "he tends his flock like a shepherd"),
    ("Isaiah 41:13", "the Lord holds his people's hand and tells them not to fear"),
    ("Jeremiah 31:3", "the Lord has loved his people with an everlasting love"),
    ("Lamentations 3:22", "the steadfast love of the Lord does not cease"),
    ("Ezekiel 36:26", "God promises a new heart and a new spirit"),
    ("Micah 7:18", "God delights to show steadfast love"),
    ("Matthew 5:5", "Jesus says the meek are blessed"),
    ("Matthew 5:8", "Jesus says the pure in heart will see God"),
    ("Matthew 6:33", "seek God's kingdom and his righteousness first"),
    ("Matthew 7:7", "Jesus says to ask, seek, and knock"),
    ("Matthew 18:20", "where two or three gather in Jesus' name, he is there among them"),
    ("Matthew 25:40", "what is done for the least of these is received by Jesus as done for him"),
    ("Mark 1:35", "Jesus rose early, went to a quiet place, and prayed"),
    ("Mark 6:31", "Jesus invites his friends to come away and rest"),
    ("Luke 1:37", "nothing will be impossible with God"),
    ("Luke 12:32", "Jesus says the Father delights to give the kingdom, so his little flock need not fear"),
    ("Luke 19:10", "the Son of Man came to seek and to save the lost"),
    ("John 1:14", "the Word became flesh and lived among us, full of grace and truth"),
    ("John 3:17", "God sent his Son to save the world, not to condemn it"),
    ("John 6:35", "Jesus says he is the bread of life"),
    ("John 10:10", "Jesus says he came so that people may have life in full"),
    ("John 13:34", "Jesus gives a new commandment to love one another as he has loved"),
    ("John 14:6", "Jesus says he is the way, the truth, and the life"),
    ("John 15:5", "Jesus is the vine, and apart from him his people cannot bear lasting fruit"),
    ("Romans 8:31", "if God is for us, another person's verdict is not the last word"),
    ("Romans 12:10", "love one another with genuine affection and outdo one another in showing honour"),
    ("Romans 15:13", "the God of hope fills his people with joy and peace as they trust him"),
    ("1 Corinthians 1:9", "God is faithful and calls people into life with his Son"),
    ("1 Corinthians 13:13", "faith, hope, and love remain, and the greatest of these is love"),
    ("2 Corinthians 5:7", "we walk by faith, not by sight"),
    ("Galatians 5:13", "freedom in Christ is for serving one another through love"),
    ("Galatians 6:9", "do not grow weary of doing good, for the harvest comes in time"),
    ("Ephesians 2:10", "we are God's workmanship, made in Christ for good works he prepared"),
    ("Ephesians 4:2", "live with humility, gentleness, and patience, bearing with one another"),
    ("Ephesians 4:29", "let your words build people up"),
    ("Philippians 1:6", "he who began a good work in you will carry it on towards completion"),
    ("Philippians 4:19", "God supplies every need according to his riches in Christ"),
    ("Colossians 3:12", "as God's chosen people, put on compassion, kindness, humility, and patience"),
    ("Colossians 3:23", "do your work as for the Lord, not only to impress people"),
    ("1 Timothy 6:6", "godliness with contentment is great gain"),
    ("Titus 3:5", "God saves by mercy, not by works anyone can boast about"),
    ("Hebrews 4:15", "Jesus sympathises with weakness, because he was tested too"),
    ("Hebrews 10:24", "stir one another up towards love and good works"),
    ("Hebrews 12:2", "look to Jesus, the pioneer and perfecter of faith"),
    ("Hebrews 13:8", "Jesus Christ is the same yesterday, today, and forever"),
    ("James 1:17", "every good gift comes from the Father of lights, who does not shift like a shadow"),
    ("James 1:22", "be doers of the word, not hearers only"),
    ("James 4:6", "God gives grace to the humble"),
    ("James 5:16", "pray for one another"),
    ("1 Peter 1:3", "God has given new birth into a living hope through the resurrection of Jesus"),
    ("1 Peter 5:6", "humble yourselves under God's hand, and he will lift you up in time"),
    ("1 John 3:1", "the Father's love calls us his children"),
    ("1 John 3:18", "let love be shown in deed and in truth, not in talk alone"),
    ("1 John 4:16", "God is love, and those who remain in love remain in God"),
    ("Revelation 21:5", "God says he is making all things new"),
    ("Genesis 1:27", "God created people in his image"),
    ("Exodus 33:14", "God says his presence will go with his people and give them rest"),
    ("Leviticus 19:18", "love your neighbour as yourself"),
    ("Deuteronomy 31:6", "be strong and courageous, because the Lord goes with you"),
    ("Ruth 1:16", "Ruth promises loyal companionship, to go where the other goes"),
    ("Psalm 9:10", "those who know God's name put their trust in him, and he does not forsake them"),
    ("Psalm 18:2", "the Lord is a rock, a fortress, and a deliverer"),
    ("Psalm 34:8", "taste and see that the Lord is good"),
    ("Psalm 37:7", "be still before the Lord and wait patiently for him"),
    ("Psalm 51:17", "a broken and contrite heart is not despised by God"),
    ("Psalm 63:1", "the soul thirsts for God"),
    ("Psalm 86:5", "the Lord is good and forgiving, and rich in steadfast love"),
    ("Psalm 90:12", "teach us to number our days so that we gain a wise heart"),
    ("Psalm 116:1", "the psalmist loves the Lord because the Lord heard his cry"),
    ("Psalm 119:11", "the psalmist stores God's word in the heart"),
    ("Psalm 121:7", "the Lord will keep your life"),
    ("Psalm 139:7", "there is nowhere to flee from God's presence"),
    ("Proverbs 3:6", "acknowledge the Lord, and he will straighten the path"),
    ("Proverbs 12:25", "anxiety weighs a heart down, and a good word cheers it"),
    ("Proverbs 16:24", "gracious words are sweet and bring healing"),
    ("Proverbs 18:10", "the name of the Lord is a strong tower"),
    ("Isaiah 9:6", "a child is promised who is called Wonderful Counsellor and Prince of Peace"),
    ("Isaiah 26:4", "trust in the Lord forever, for the Lord is an everlasting rock"),
    ("Isaiah 30:15", "in quietness and in trust is strength"),
    ("Isaiah 40:29", "he gives power to the faint"),
    ("Isaiah 43:2", "when you pass through deep waters, God says he will be with you"),
    ("Isaiah 49:16", "God says his people are engraved on the palms of his hands"),
    ("Isaiah 55:6", "seek the Lord while he may be found"),
    ("Jeremiah 29:13", "you will find God when you seek him with all your heart"),
    ("Lamentations 3:25", "the Lord is good to those who wait for him"),
    ("Joel 2:13", "return to the Lord, for he is gracious and merciful, slow to anger"),
    ("Amos 5:24", "let justice roll down like waters"),
    ("Jonah 2:2", "Jonah called to the Lord in distress, and the Lord answered"),
    ("Micah 7:7", "the writer will look to the Lord and wait for the God of salvation"),
    ("Nahum 1:7", "the Lord is good, a stronghold in the day of trouble"),
    ("Zechariah 4:6", "not by might, nor by power, but by the Spirit of the Lord"),
    ("Malachi 3:6", "the Lord does not change"),
    ("Matthew 5:14", "Jesus tells his followers they are the light of the world"),
    ("Matthew 5:44", "love your enemies and pray for people who hurt you"),
    ("Matthew 6:21", "where your treasure is, your heart will be also"),
    ("Matthew 9:36", "Jesus had compassion on crowds who were harassed and helpless"),
    ("Matthew 19:26", "with God all things are possible"),
    ("Luke 4:18", "Jesus says the Spirit has anointed him to bring good news to the poor"),
    ("Luke 10:27", "love the Lord your God, and love your neighbour as yourself"),
    ("Luke 15:7", "heaven rejoices when one sinner turns back"),
    ("John 6:37", "whoever comes to Jesus he will never cast out"),
    ("John 14:18", "Jesus says he will not leave his friends as orphans"),
    ("John 15:15", "Jesus calls his disciples friends"),
    ("Acts 17:28", "in God we live and move and have our being"),
    ("Romans 6:23", "the free gift of God is eternal life in Christ Jesus"),
    ("Romans 10:13", "everyone who calls on the name of the Lord will be saved"),
    ("Romans 14:19", "pursue what makes for peace and for building one another up"),
    ("1 Corinthians 15:58", "be steadfast, because in the Lord your labour is not in vain"),
    ("2 Corinthians 12:10", "when Paul is weak, then he is strong, because of Christ"),
    ("Ephesians 3:20", "God can do far more than we ask or imagine"),
    ("Philippians 4:4", "rejoice in the Lord always"),
    ("Colossians 1:17", "in Christ all things hold together"),
    ("1 Thessalonians 4:11", "aspire to live quietly, mind your own affairs, and work with your hands"),
    ("2 Timothy 3:16", "all Scripture is breathed out by God and is useful for teaching"),
    ("Hebrews 6:19", "hope in God is a sure and steadfast anchor"),
    ("Hebrews 11:6", "without faith it is impossible to please God, and he rewards those who seek him"),
    ("James 1:12", "blessed is the person who remains steadfast under trial"),
    ("James 3:17", "wisdom from above is pure, peaceable, gentle, and full of mercy"),
    ("1 Peter 3:8", "have unity of mind, sympathy, and a tender heart"),
    ("1 Peter 4:10", "serve one another with the gift you have been given"),
    ("1 Peter 5:10", "after suffering a while, God will restore and strengthen you"),
    ("1 John 1:7", "walking in the light brings real fellowship, and Jesus cleanses"),
    ("1 John 4:11", "if God so loved us, we ought to love one another"),
    ("Revelation 3:20", "Jesus stands at the door and knocks, and comes in where he is welcomed"),
    ("Revelation 1:8", "the Lord God is the Alpha and the Omega"),
    ("Genesis 2:2", "God rested from the work of creation"),
    ("Exodus 20:8", "remember the Sabbath and keep it holy"),
    ("Joshua 24:15", "choose whom you will serve, and the speaker chooses the Lord"),
    ("Psalm 1:2", "the blessed person delights in the Lord's instruction"),
    ("Psalm 5:3", "in the morning the psalmist lays a prayer before God"),
    ("Psalm 27:14", "wait for the Lord, be strong, and let your heart take courage"),
    ("Psalm 32:8", "the Lord promises to instruct and to teach the way"),
    ("Psalm 40:1", "the psalmist waited for the Lord, and the Lord turned towards him"),
    ("Psalm 84:11", "the Lord bestows favour and honour and does not withhold what is good"),
    ("Psalm 94:19", "when cares are many, God's consolations cheer the soul"),
    ("Psalm 107:9", "he satisfies the longing soul"),
    ("Psalm 143:8", "in the morning the psalmist asks to hear of God's steadfast love"),
    ("Proverbs 11:25", "a generous person is refreshed"),
    ("Proverbs 14:29", "whoever is slow to anger has great understanding"),
    ("Proverbs 19:21", "people make many plans, and the Lord's purpose stands"),
    ("Isaiah 12:2", "God is salvation, so trust can replace fear"),
    ("Isaiah 30:21", "a voice behind says which way to walk"),
    ("Isaiah 54:10", "mountains may move, and God's steadfast love will not"),
    ("Isaiah 58:11", "the Lord will guide you and satisfy you in dry places"),
    ("Isaiah 61:1", "the Spirit of the Lord brings good news and liberty to captives"),
    ("Jeremiah 17:7", "blessed is the person who trusts in the Lord"),
    ("Jeremiah 33:3", "call to the Lord and he will answer"),
    ("Hosea 6:6", "God desires steadfast love and knowledge of him, not empty ritual"),
    ("Habakkuk 3:19", "the Lord God is the writer's strength"),
    ("Matthew 4:4", "people do not live by bread alone, but by every word from God"),
    ("Matthew 6:6", "pray in secret, and the Father who sees in secret answers"),
    ("Matthew 6:14", "if you forgive others, your heavenly Father also forgives"),
    ("Matthew 7:12", "do for others what you would wish them to do for you"),
    ("Matthew 10:31", "you are of more value than many sparrows, so do not be afraid"),
    ("Mark 11:25", "when you pray, forgive, so that the Father may forgive you"),
    ("Luke 6:27", "love your enemies and do good to people who hate you"),
    ("John 4:14", "Jesus speaks of water that becomes a spring of eternal life"),
    ("John 8:32", "you will know the truth, and the truth will set you free"),
    ("John 13:14", "Jesus washed his friends' feet and tells them to serve in the same way"),
    ("John 15:13", "the greatest love lays down its life for friends"),
    ("John 20:21", "Jesus speaks peace and sends his friends as the Father sent him"),
    ("Acts 20:35", "it is more blessed to give than to receive"),
    ("Romans 5:5", "hope does not put us to shame, because God's love is poured into our hearts"),
    ("Romans 12:2", "do not be squeezed into the world's mould, but let your mind be renewed"),
    ("Romans 13:8", "owe no one anything, except to love one another"),
    ("1 Corinthians 6:19", "your body is a temple of the Holy Spirit"),
    ("2 Corinthians 3:17", "where the Spirit of the Lord is, there is freedom"),
    ("2 Corinthians 9:7", "God loves a cheerful giver"),
    ("Galatians 2:20", "Christ lives in his people, and life is lived by faith in the Son of God"),
    ("Galatians 5:1", "Christ has set us free, so do not go back under a slave's yoke"),
    ("Ephesians 1:7", "in Christ we have redemption and forgiveness by grace"),
    ("Ephesians 5:1", "be imitators of God, as beloved children"),
    ("Ephesians 6:10", "be strong in the Lord and in his mighty power"),
    ("Philippians 2:4", "look to the interests of others, not only to your own"),
    ("Colossians 3:2", "set your mind on the things of Christ, not only on earthly status"),
    ("1 Thessalonians 5:14", "encourage the fainthearted and help the weak"),
    ("2 Thessalonians 3:3", "the Lord is faithful, and he will strengthen and guard you"),
    ("1 Timothy 1:15", "Christ Jesus came into the world to save sinners"),
    ("2 Timothy 2:1", "be strengthened by the grace that is in Christ Jesus"),
    ("Titus 2:11", "the grace of God has appeared, bringing salvation"),
    ("Hebrews 13:16", "do not neglect to do good and to share, for that pleases God"),
    ("James 1:2", "when trials come, steadfastness is being grown"),
    ("James 2:17", "faith that never acts is dead"),
    ("James 4:10", "humble yourselves before the Lord, and he will lift you up"),
    ("1 Peter 2:17", "honour everyone and love the family of believers"),
    ("1 Peter 3:15", "honour Christ as holy, and answer with gentleness and respect"),
    ("2 Peter 1:3", "God's power has given what we need for life and godliness"),
    ("2 Peter 3:9", "the Lord is patient, not wishing that any should perish"),
    ("1 John 2:1", "if anyone sins, we have an advocate with the Father, Jesus Christ the righteous"),
    ("1 John 5:14", "if we ask according to his will, he hears us"),
    ("Jude 1:21", "keep yourselves in the love of God"),
    ("Revelation 7:17", "God will wipe away every tear"),
    ("Revelation 22:17", "the Spirit and the church say come, and whoever is thirsty may come"),
    ("Psalm 16:8", "the psalmist sets the Lord always before him"),
    ("Psalm 25:4", "the psalmist asks God to make his ways known"),
    ("Psalm 31:24", "be strong and let your heart take courage, all who wait for the Lord"),
    ("Psalm 62:5", "the soul waits in silence for God alone"),
    ("Psalm 68:19", "blessed be the Lord, who daily bears us up"),
    ("Psalm 118:6", "the Lord is on my side, so fear of people need not rule"),
    ("Psalm 138:8", "the Lord will fulfil his purpose"),
    ("Psalm 145:9", "the Lord is good to all, and his mercy is over all he has made"),
    ("Proverbs 2:6", "the Lord gives wisdom"),
    ("Proverbs 4:23", "guard your heart, for life flows from it"),
    ("Proverbs 22:1", "a good name is to be chosen rather than great riches"),
    ("Ecclesiastes 3:11", "God has made everything suitable in its time"),
    ("Isaiah 55:8", "God's thoughts are not our thoughts, and his ways are higher"),
    ("Habakkuk 2:20", "the Lord is in his holy temple, and the earth is called to keep silence before him"),
    ("Luke 11:3", "Jesus teaches a prayer that asks for each day's bread"),
    ("John 1:1", "in the beginning was the Word, and the Word was with God, and the Word was God"),
    ("Acts 1:8", "Jesus promises power when the Holy Spirit comes, so his people can witness"),
    ("1 Corinthians 10:13", "God is faithful when temptation comes, and he makes a way through it"),
    ("Philippians 3:13", "forgetting what is behind, Paul presses on towards what Christ has ahead"),
    ("1 Kings 8:56", "not one word has failed of all the Lord's good promise"),
    ("1 Chronicles 16:34", "give thanks to the Lord, for he is good and his love endures"),
    ("Psalm 121:1", "the psalmist lifts his eyes and asks where his help comes from"),
]

NA_FORBIDDEN = re.compile(
    r"\b(jesus|christ|bible|church|scripture|gospel|psalm|matthew|sermon|verse|worship|pastor|pulpit)\b",
    re.I,
)
WORD_FORBIDDEN = re.compile(
    r"narcotics anonymous|\b(sponsor|home group|higher power)\b|just for today|\btwelve steps\b|\bstep one\b",
    re.I,
)
REF_RE = re.compile(r"\b(?:[1-3]\s)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s\d+:\d+\b")

WORD_OPEN = [
    "The Christian theme, {word}, is read with {ref}.",
    "On this page the Christian theme is {word}, and the text is {ref}.",
    "{word} is the Christian theme here, set beside {ref}.",
]

WORD_BRIDGE = [
    "That verse is a welcome, not a test you pass before God will look at {word}.",
    "Nothing in {ref} asks you to pretend, and {word} can begin while you are still tired.",
    "Read {word} in the light of that verse, without turning it into a performance for other people.",
    "Christ is gentle with unfinished people, so {word} does not have to arrive already polished.",
]

WORD_PRACTICE = [
    "To live {word}, read {ref} once, pray in your own words, and then do one kindness a neighbour could feel.",
    "Give {word} a body: a short prayer, then a practical favour that stays quiet.",
    "Let {word} sound like a softer answer where the house has been sharp, with {ref} still in mind.",
    "Carry {word} into an ordinary hour by telling the truth kindly, in the spirit of {ref}.",
    "Practise {word} at the sink or on the footpath: thank God for one mercy, and notice one person.",
    "If you were wrong, let {word} include an apology in a single clean sentence, because of {ref}.",
    "Set a cup of tea beside the thought of {ref}, and let {word} be unhurried company for someone lonely.",
    "Leave a harsh opinion unsaid, and let that restraint be how {word} shows up this afternoon.",
]

WORD_CLOSE = [
    "Ask the Lord to keep {word} honest and gentle until you sleep, and leave the rest in God's care.",
    "Mercy is wider than today's mistakes, and {word} can stand inside that mercy without showing off.",
    "Hand the evening to God, and let {word} be unfinished without being abandoned.",
    "You can begin {word} before you feel holy, because the Father already knows the day.",
    "The point of {ref}, for {word}, is trust, not a performance.",
    "Jesus does not rush slow learners, and {word} is allowed to be slow.",
    "No one else has to share your creed for you to practise {word} in the sight of God.",
    "Put {word} where your hands are, and let the text stay a lamp rather than a weapon.",
]

WORD_EXTRA = [
    "Australian weather can be hot, wet, or cold, and {word} still fits the actual day.",
    "A neighbour does not need a creed explained before they can receive the fruit of {word}.",
    "If the morning was clumsy, {word} can begin again after lunch in the sight of God.",
    "God's kindness towards you is the ground under {word}, not a prize withheld until you improve.",
    "Keep {word} Christian and specific: one verse, one prayer, one person.",
    "In Christ, {word} is worth attention even when the calendar is full.",
]

JFT_LEAD = [
    "Narcotics Anonymous asks only for this date, and the task is to {focus}.",
    "Narcotics Anonymous keeps the work the size of this date: {focus}.",
    "Narcotics Anonymous moves one day at a time, so the job is to {focus}.",
]

JFT_SCENE = [
    "A member trying to {focus} might be {place}, while {event}.",
    "You might be {place}, and {event}, on a date whose real work is to {focus}.",
    "It can be {place}, and {event}, while you {focus}.",
]

JFT_MOVE = [
    "Phone a sponsor or sit in an NA meeting so you can actually {focus}.",
    "Tell another member the plain facts, then {focus}, before a using idea gets a vote.",
    "A Higher Power, as you understand that Power, can be asked for willingness while you {focus}.",
    "The home group has room for hard truth, so let a member hear you as you {focus}.",
    "Use the phone list, decline the old contact, and {focus} with someone else in the loop.",
    "Let a craving rise and fall while you {focus}, and tell a sponsor what it felt like.",
    "A small service for a newcomer can sit beside the choice to {focus}.",
    "Remain for the meeting, then {focus}, and leave tomorrow's using ideas outside this date.",
]

JFT_EXTRA = [
    "Staying clean for this date is the promise inside the choice to {focus}, not a speech about next year.",
    "Secrecy would feed a using plan, and Narcotics Anonymous would rather you {focus} where a member can hear it.",
    "A sponsor does not need a polished report, only the facts, and then you can {focus}.",
    "Higher Power, as each member understands that Power, is not impressed by performance while you {focus}.",
    "The NA way here is concrete: people, a meeting, no pickup, and the willingness to {focus}.",
]

CRISIS = [
    "If the effort to {focus} comes with thoughts of self-harm, call 000.",
    "If trying to {focus} includes thoughts of hurting yourself, call 000 and let another person remain nearby.",
]


def content_tokens(text: str) -> set[str]:
    toks = set(re.findall(r"[a-z0-9']+", text.lower()))
    return {t for t in toks if t not in STOP and len(t) > 2}


def group_ids(text: str) -> set[int]:
    toks = content_tokens(text)
    found = set()
    for i, group in enumerate(GROUPS):
        if toks & group:
            found.add(i)
    return found


def compatible(word: str, title: str) -> bool:
    if word.lower() in title.lower() or title.lower() in word.lower():
        return False
    if content_tokens(word) & content_tokens(title):
        return False
    if group_ids(word) & group_ids(title):
        return False
    return True


def separate_titles(words: list[str], titles: list[str]) -> list[str]:
    base = list(titles)
    for seed in range(1, 120):
        cand = lcg_shuffle(base, seed)
        if _resolve(words, cand):
            return cand
    raise SystemExit("could not separate Word themes from Just for today titles")


def _resolve(words: list[str], titles: list[str]) -> bool:
    n = len(titles)
    for _ in range(n * 2):
        for i, word in enumerate(words):
            if compatible(word, titles[i]):
                continue
            swapped = False
            for j in range(n):
                if j == i:
                    continue
                if compatible(word, titles[j]) and compatible(words[j], titles[i]):
                    titles[i], titles[j] = titles[j], titles[i]
                    swapped = True
                    break
            if not swapped:
                return False
        else:
            return True
    return all(compatible(w, t) for w, t in zip(words, titles))


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9'’\-]+", text))


def sentences_of(text: str) -> list[str]:
    flat = text.replace("\n", " ")
    parts = re.split(r"(?<=[.!?])\s+", flat)
    return [p.strip() for p in parts if p.strip()]


def cap_first(text: str) -> str:
    text = text.strip()
    if not text:
        return text
    return text[:1].upper() + text[1:]


def polish(paragraph: str) -> str:
    return " ".join(cap_first(b) for b in sentences_of(paragraph))


def paragraphs(*parts: str) -> str:
    cleaned = [polish(p) for p in parts if p and p.strip()]
    return "\n\n".join(cleaned)


def choose(options: list[str], banned: set[str], salt: int, **fmt) -> str:
    n = len(options)
    for k in range(n):
        text = options[(salt + k) % n].format(**fmt)
        if content_tokens(text) & banned:
            continue
        return text
    raise SystemExit(f"no line avoids {sorted(banned)[:12]}")


def verse_for(i: int, banned: set[str]) -> tuple[str, str]:
    n = len(VERSES)
    for shift in range(n):
        ref, meaning = VERSES[(i + shift) % n]
        if any(ch in meaning for ch in ".!?"):
            raise SystemExit(f"meaning must be one clause: {ref}")
        if content_tokens(meaning) & banned or content_tokens(ref) & banned:
            continue
        return ref, meaning
    raise SystemExit(f"no verse avoids {sorted(banned)[:12]}")


def contains_phrase(hay: str, phrase: str) -> bool:
    return re.search(rf"\b{re.escape(phrase.lower())}\b", hay.lower()) is not None


def compose(theme_words, titles, index_to_month_day):
    if len(theme_words) != 365 or len(titles) != 365:
        raise SystemExit("compose expected 365")
    titles = separate_titles(theme_words, titles)
    for title in titles:
        focus_for(title)
    word_entries = []
    jft_entries = []
    for i, word in enumerate(theme_words):
        month, day = index_to_month_day(i)
        title = titles[i]
        focus = focus_for(title)
        if not compatible(word, title):
            raise SystemExit(f"still paired: {word} / {title}")
        word_reading = build_word(i, word, title)
        jft_reading = build_jft(i, word, title, focus)
        _assert_split(word, title, focus, word_reading, jft_reading, i)
        word_entries.append({"month": month, "day": day, "word": word, "reading": word_reading})
        jft_entries.append({"month": month, "day": day, "title": title, "reading": jft_reading})
    return word_entries, jft_entries


def build_word(i, word, title):
    banned = content_tokens(title)
    ref, meaning = verse_for(i * 3 + 1, banned)
    meaning_s = meaning.strip().rstrip(".")
    fmt = {"word": word, "ref": ref}
    opener = choose(WORD_OPEN, banned, i, **fmt)
    bridge = choose(WORD_BRIDGE, banned, i + 3, **fmt)
    practice = choose(WORD_PRACTICE, banned, i + 7, **fmt)
    close = choose(WORD_CLOSE, banned, i + 11, **fmt)
    gloss = f"For {word}, the sense of {ref} is this: {meaning_s}."
    if content_tokens(gloss) & banned:
        gloss = f"With {word} in view, {ref} puts it this way: {meaning_s}."
    parts = [f"{opener} {gloss}", f"{bridge} {practice}", close]
    text = paragraphs(*parts)
    extra_i = 0
    while word_count(text) < 96 and extra_i < len(WORD_EXTRA) * 2:
        extra = choose(WORD_EXTRA, banned, i + 20 + extra_i, **fmt)
        if extra not in text:
            parts[-1] = parts[-1] + " " + extra
            text = paragraphs(*parts)
        extra_i += 1
    wc = word_count(text)
    if wc < 90 or wc > 230:
        raise SystemExit(f"word wc {wc} {word}\n{text}")
    return text


def build_jft(i, word, title, focus):
    banned = content_tokens(word)
    place = choose(PLACES, banned, i + 1)
    event = choose(EVENTS, banned, i * 3 + 2)
    fmt = {"focus": focus, "place": place, "event": event}
    lead = choose(JFT_LEAD, banned, i, **fmt)
    scene = choose(JFT_SCENE, banned, i + 4, **fmt)
    move = choose(JFT_MOVE, banned, i + 8, **fmt)
    move_text = move + " " + choose(JFT_EXTRA, banned, i + 13, focus=focus)
    extra_i = 0
    while True:
        chunks = [paragraphs(lead, scene, move_text)]
        if needs_crisis_title(title):
            chunks.append(choose(CRISIS, banned, i, focus=focus))
        pledge = f"Just for today, I will {focus}."
        chunks.append(pledge)
        text = paragraphs(*chunks)
        if word_count(text) >= 96 or extra_i > len(JFT_EXTRA) * 3:
            break
        extra = choose(JFT_EXTRA, banned, i + 14 + extra_i, focus=focus)
        extra_i += 1
        if extra not in move_text:
            move_text = move_text + " " + extra
    if not text.strip().split("\n\n")[-1].startswith("Just for today"):
        raise SystemExit("pledge paragraph")
    wc = word_count(text)
    if wc < 90 or wc > 230:
        raise SystemExit(f"jft wc {wc} {title}\n{text}")
    return text


def _assert_split(word, title, focus, word_reading, jft_reading, i):
    if contains_phrase(jft_reading, word):
        raise SystemExit(f"day {i} jft contains word {word}\n{jft_reading}")
    if title.lower() in word_reading.lower():
        raise SystemExit(f"day {i} word contains title {title}")
    if len(focus) > 20 and focus.lower() in word_reading.lower():
        raise SystemExit(f"day {i} word contains focus")
    if "just for today" in word_reading.lower():
        raise SystemExit("word has just for today")
    if not REF_RE.search(word_reading):
        raise SystemExit(f"missing reference {word}\n{word_reading}")
    if REF_RE.search(jft_reading):
        raise SystemExit(f"jft has verse ref {title}\n{jft_reading}")
    if "Narcotics Anonymous" not in jft_reading:
        raise SystemExit(f"jft missing NA\n{jft_reading}")
    if NA_FORBIDDEN.search(jft_reading):
        hit = NA_FORBIDDEN.search(jft_reading).group()
        raise SystemExit(f"church language in jft ({hit}) {title}\n{jft_reading}")
    if WORD_FORBIDDEN.search(word_reading):
        raise SystemExit(f"NA language in word {word}\n{word_reading}")
    if re.search(r"\b(jesus|christ|bible|scripture|gospel|church)\b", jft_reading, re.I):
        raise SystemExit("sermon token in jft")
    shared = {s.lower() for s in sentences_of(word_reading)} & {s.lower() for s in sentences_of(jft_reading)}
    if shared:
        raise SystemExit(f"shared sentence {i}: {next(iter(shared))}")
    # Different subject: title content words should not all be the word's subject.
    if content_tokens(word) & content_tokens(title):
        raise SystemExit(f"theme overlap {word} / {title}")
