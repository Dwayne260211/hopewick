# Coping toolkit and check-in content: sources

Hopewick's coping exercises (`app/data/coping-tools.js`) and check-in wording are
general self-help in plain Australian English. They are **not therapy, not medical
advice and not a diagnosis**. Wording is cautious and follows widely published
public guidance. **Before launch, a qualified clinician should review every tool**
(flagged below as "Clinical review: needed").

| Tool (key) | Based on | Sources |
| --- | --- | --- |
| Box breathing (`breathing-box`) | Paced breathing | Beyond Blue (beyondblue.org.au), Head to Health (headtohealth.gov.au), NHS Every Mind Matters (nhs.uk/every-mind-matters) |
| Calm breathing, longer out-breath (`breathing-calm`) | Slow diaphragmatic breathing | Centre for Clinical Interventions, WA Health (cci.health.wa.gov.au), Anxiety Canada (anxietycanada.com) |
| 5-4-3-2-1 grounding (`grounding-54321`) | Sensory grounding | ReachOut Australia (au.reachout.com), Beyond Blue |
| Urge surfing (`urge-surfing`) | Mindfulness-based relapse prevention | Bowen, Chawla & Marlatt, *Mindfulness-Based Relapse Prevention for Addictive Behaviors* (2nd ed., 2021); Alcohol and Drug Foundation (adf.org.au) |
| Progressive muscle relaxation (`muscle-relaxation`) | PMR | Centre for Clinical Interventions, Anxiety Canada |
| A mindful minute (`mindful-minute`) | Brief mindfulness | Black Dog Institute (blackdoginstitute.org.au), Head to Health |
| Thought reframing (`thought-reframe`) | CBT thought records | Centre for Clinical Interventions, Beyond Blue |
| Name it to tame it (`name-it`) | Emotion labelling and regulation | ReachOut Australia, Black Dog Institute |
| TIPP for intense moments (`tipp`), labelled "DBT-informed" | DBT distress-tolerance skill | Linehan, *DBT Skills Training Manual* (2nd ed., 2015). Includes medical cautions about cold water and exercise |
| STOP before you act (`stop-skill`), labelled "DBT-informed" | DBT STOP skill | Linehan (2015) |
| Relapse prevention check (`relapse-check`) | Relapse prevention | Marlatt & Gordon, *Relapse Prevention* (1985; Marlatt & Donovan 2nd ed., 2005); Alcohol and Drug Foundation |
| Five-minute stress reset (`stress-reset`) | Stress management basics | Head to Health, NHS Every Mind Matters, Beyond Blue |

Crisis contacts shown with these tools: Lifeline 13 11 14 (lifeline.org.au),
emergency 000. These are always free and never behind Plus.

Clinical review: needed for all 12 tools, the "Struggling" support message, and
the check-in suggestion rules in `app/hw-stage3.js` (`suggestTool`). Those rules
are simple, transparent and do not predict risk.

# Learning modules (Stage 4): sources, reuse terms and review

The learning modules (`server/library/learning-modules.json`, validated by
`server/learning.js`) are short, general self-help lessons in plain Australian
English. Each takes about 5 minutes and has a short reading, a quick reflection
and one practical step. **They are not therapy, not medical advice and not a
diagnosis, and they make no clinical claims.** They are written to sit alongside
professional support, not replace it. Every module shows "Pending clinical
review" in the app and carries `review: "pending"` in the data.

**Clinical review: needed for all 12 modules before launch**, along with the
quiz feedback, the defusion crisis-phrase check (`CRISIS_RE` in
`app/hw-stage4.js`) and the after-a-lapse card in the recovery tracker.

## Original wording only

All module text (readings, cards, quizzes, feedback, reflections, timer cues,
values lists and thought-record prompts) is **original wording written for
Hopewick**. No text, scripts, worksheets or exercises are copied from any source
below. Sources are used to check that the ideas match mainstream public health
guidance. They are credited in each module's "Sources and credit" section and
linked here.

## ACT (Russ Harris, *The Happiness Trap*): terms checked 18 Oct 2026

| Source | What the terms say | What Hopewick does |
| --- | --- | --- |
| thehappinesstrap.com (book and online program) | The site terms of use reserve copyright. Clause 9.3 does not allow copying, republishing or making derivative works from site content without written consent. The book is also copyrighted. | Nothing is reproduced. ACT concepts (defusion, dropping anchor, acceptance and expansion, values, committed action) are taught in original wording. The book and site are credited with a link, with a "concepts only, not reproduced" note. |
| actmindfully.com.au "Free Stuff" page (Russ Harris) | Free downloads are offered, but we found no open or permissive licence that allows republishing or adapting them inside another product. | Link only, with credit ("link only, not reproduced"). No worksheets, scripts or audio are embedded or adapted. |

The phrase "I'm noticing I'm having the thought that…" is a widely taught,
generic ACT defusion stem. Hopewick uses it as a short prompt with its own
surrounding text. Founder sign-off is requested on this (see the PR).

Where no permissive licence was found, the rule is the same for every other
freely released material (Beyond Blue, Head to Health, THIS WAY UP, Black Dog
Institute, CCI, ADF, healthdirect, Sleep Health Foundation, NHMRC): **link and
credit, do not reproduce.** Phone numbers and service names are facts and are
used as facts.

## CBT and DBT

CBT modules (noticing thoughts, thought record, behavioural activation) draw on
CCI, THIS WAY UP, Beyond Blue and Black Dog Institute. The DBT module (TIPP,
STOP, opposite action, wise mind) is labelled "DBT-informed". It credits Linehan,
*DBT Skills Training Manual* (2nd ed., 2015) as a book reference only, with the
same cold-water and exercise cautions as the TIPP coping tool.

## Module sources

| Module | Approach or topic | Release | Sources (credited, link only) |
| --- | --- | --- | --- |
| Cravings and triggers (`cravings-triggers`) | Recovery | Free core | Alcohol and Drug Foundation [Reducing risk](https://adf.org.au/reducing-risk/); healthdirect [Drugs and alcohol](https://www.healthdirect.gov.au/drugs-and-alcohol); Bowen, Chawla and Marlatt Mindfulness-Based Relapse Prevention for Addictive Behaviors, 2nd edition (2021). Book reference, concepts only. |
| Sleep basics (`sleep-basics`) | Wellbeing | Free core | Sleep Health Foundation [Sleep topics and fact sheets](https://www.sleephealthfoundation.org.au/); healthdirect [Sleep](https://www.healthdirect.gov.au/sleep) |
| Stress and anxiety basics (`stress-anxiety`) | Wellbeing | Free core | Beyond Blue [Stress](https://www.beyondblue.org.au/mental-health/stress); Beyond Blue [Anxiety](https://www.beyondblue.org.au/mental-health/anxiety); Beyond Blue [Treatments for anxiety](https://www.beyondblue.org.au/mental-health/anxiety/treatments-for-anxiety); healthdirect [Stress](https://www.healthdirect.gov.au/stress); healthdirect [Anxiety](https://www.healthdirect.gov.au/anxiety); THIS WAY UP (St Vincent's Hospital Sydney) [Learning hub](https://thiswayup.org.au/learning-hub/) |
| Staying safer: harm reduction basics (`harm-reduction`) | Recovery | Free core | Alcohol and Drug Foundation [Reducing risk](https://adf.org.au/reducing-risk/); National Health and Medical Research Council [Australian guidelines to reduce health risks from drinking alcohol (2020)](https://www.nhmrc.gov.au/health-advice/alcohol); Australian Government Department of Health [Take Home Naloxone program](https://www.health.gov.au/our-work/take-home-naloxone-program/about-the-take-home-naloxone-program); healthdirect [Drugs and alcohol](https://www.healthdirect.gov.au/drugs-and-alcohol); Australian Government Department of Health [National Alcohol and Other Drug Hotline](https://www.health.gov.au/contacts/national-alcohol-and-other-drug-hotline) |
| Getting support in Australia (`support-australia`) | Support | Free core | Australian Government Department of Health [National Alcohol and Other Drug Hotline](https://www.health.gov.au/contacts/national-alcohol-and-other-drug-hotline); Counselling Online (Turning Point) [Free 24/7 alcohol and drug counselling](https://www.counsellingonline.org.au/); Beyond Blue [Get support](https://www.beyondblue.org.au/get-support); 13YARN [13 92 76](https://www.13yarn.org.au/); Lifeline Australia [13 11 14](https://www.lifeline.org.au/); Alcohol and Drug Foundation [Help and support](https://adf.org.au/help-support/) |
| Thoughts, feelings and actions (CBT basics) (`cbt-basics`) | CBT | Free core | Centre for Clinical Interventions (WA Health) [Looking after yourself: self-help resources](https://www.cci.health.wa.gov.au/Resources/Looking-After-Yourself); THIS WAY UP (St Vincent's Hospital Sydney) [Learning hub](https://thiswayup.org.au/learning-hub/); Beyond Blue [Treatments for anxiety](https://www.beyondblue.org.au/mental-health/anxiety/treatments-for-anxiety); Black Dog Institute [Resources and support](https://www.blackdoginstitute.org.au/resources-support/) |
| Unhooking from difficult thoughts (ACT basics) (`act-unhooking`) | ACT | Free core | Dr Russ Harris [The Happiness Trap (book and program; concepts only, not reproduced)](https://thehappinesstrap.com/); Dr Russ Harris, ACT Mindfully [Free resources (link only, not reproduced)](https://www.actmindfully.com.au/free-stuff/); Black Dog Institute [Resources and support](https://www.blackdoginstitute.org.au/resources-support/) |
| Riding out intense moments (DBT skills basics) (`dbt-skills`) | DBT | Plus 2026-10-18, free 6 months later | Marsha M. Linehan DBT Skills Training Manual, 2nd edition (Guilford Press, 2015). Book reference, concepts only.; Black Dog Institute [Resources and support](https://www.blackdoginstitute.org.au/resources-support/); ReachOut Australia [ReachOut](https://au.reachout.com/) |
| Your thought record (CBT) (`thought-record`) | CBT | Plus 2026-10-25, free 6 months later | Centre for Clinical Interventions (WA Health) [Looking after yourself: self-help resources](https://www.cci.health.wa.gov.au/Resources/Looking-After-Yourself); THIS WAY UP (St Vincent's Hospital Sydney) [Learning hub](https://thiswayup.org.au/learning-hub/); Beyond Blue [Treatments for anxiety](https://www.beyondblue.org.au/mental-health/anxiety/treatments-for-anxiety) |
| What matters to you (ACT values and committed action) (`act-values`) | ACT | Plus 2026-11-01, free 6 months later | Dr Russ Harris [The Happiness Trap (book and program; concepts only, not reproduced)](https://thehappinesstrap.com/); Dr Russ Harris, ACT Mindfully [Free resources (link only, not reproduced)](https://www.actmindfully.com.au/free-stuff/); Black Dog Institute [Resources and support](https://www.blackdoginstitute.org.au/resources-support/) |
| Doing more of what helps (behavioural activation) (`behavioural-activation`) | CBT | Plus 2026-11-08, free 6 months later | Centre for Clinical Interventions (WA Health) [Looking after yourself: self-help resources](https://www.cci.health.wa.gov.au/Resources/Looking-After-Yourself); THIS WAY UP (St Vincent's Hospital Sydney) [Learning hub](https://thiswayup.org.au/learning-hub/); Black Dog Institute [Resources and support](https://www.blackdoginstitute.org.au/resources-support/) |
| Making room for feelings (ACT acceptance) (`act-acceptance`) | ACT | Plus 2026-11-15, free 6 months later | Dr Russ Harris [The Happiness Trap (book and program; concepts only, not reproduced)](https://thehappinesstrap.com/); Dr Russ Harris, ACT Mindfully [Free resources (link only, not reproduced)](https://www.actmindfully.com.au/free-stuff/); Black Dog Institute [Resources and support](https://www.blackdoginstitute.org.au/resources-support/) |

Support numbers in the modules (checked 18 Oct 2026): Lifeline 13 11 14,
13YARN 13 92 76, the National Alcohol and Other Drug Hotline 1800 250 015 (it
routes to your state service, and hours vary by state), Counselling Online
(24/7 AOD chat), and emergency 000. These are always free and never behind Plus.

