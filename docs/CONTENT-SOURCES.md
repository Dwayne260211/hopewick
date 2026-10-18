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

---

# Move & Recover (fitness, sauna, cold and contrast): sources

Behind `FEATURE_FITNESS_PROTOCOLS` (off by default). Full design notes:
`docs/FITNESS-PROTOCOLS.md`. All exercise, protocol and screen wording in
`server/fitness/content.js` and `server/fitness/screen.js` is original Hopewick
text written from the evidence below. Nothing was copied from myritual.com.au or
any other retailer, app or website.

**Clinical review: needed for everything in this section**, by a clinician
(GP or AOD medical officer) for the safety screen, the pre-session check and the
heat and cold protocols, and by an accredited exercise physiologist (ESSA) for
the 30-Minute Move program, the adapted tracks and the pain guide. A pharmacist
should confirm the medicines list (screen B3 and B11) against current Australian
product information.

| Content | Where | Based on |
| --- | --- | --- |
| Weekly targets (150 min, strength 2 days) and the 7-day rotation | `content.js` `WORKOUTS`, `rules.js` | [E1] [E2] [E10] |
| Exercise for mood, used as "may help", never "treats" | `content.js` `INFO` | [E3] [E4] [E5] [E6] [E7] [E8] [E9] |
| Movement safety questions (Part A), paraphrased | `screen.js` `move` | [E11] |
| Over-exercise and eating disorder wording, Butterfly 1800 33 4673 | `content.js` `OVERDOING_IT`, screen A8 / B13 | [E12] [E13] [E14] |
| Sauna stages (60–90 °C, up to 20 min a round, 2 rounds) | `content.js` `PROTOCOLS.sauna` | [S1] [S4] [S5] [S6] [S7] [R2] |
| Heat is not presented as a depression treatment | `content.js` `INFO` | [S8] [S8b] |
| Warm bath or shower before bed for sleep | `content.js` `SLEEP_TIP` | [S10] |
| Cold stages, 10 °C floor, head out, never alone | `content.js` `PROTOCOLS.cold`, `rules.js` | [K1] [K2] [K3] [K5] [K13] [R3] [R4] [R5] |
| Keep cold water 6 h away from strength sessions | `rules.js` `strengthColdGapHours`, check warning | [K6] [K7] [K8] |
| Contrast rounds, limits | `content.js` `PROTOCOLS.contrast` | [X1] |
| No heat or cold after alcohol or other drugs (24 h pause) | `rules.js` D1, `screen.js` `evaluateCheck` | [R1] [R1b] [R2] [R4] [R5] [R8] [R12] |
| Heart, long QT, methadone, blood pressure, stroke | screen B1–B6, B3 | [R2] [R3] [R13] |
| Pregnancy | screen B7 | [R6] |
| Raynaud's, cold urticaria | screen B8 | [R7] [R7b] |
| Medicines that affect heat tolerance | screen B11 | [R9] [R10] [R11] |

## Reference list

## Exercise and physical activity (E)

- **[E1] Guideline (Australia, 2026).** Australian Government Department of Health, Disability and Ageing. *Australian 24-hour movement guidelines for adults (18 to 64 years) and older adults (65+ years).* Published 2026. Recommendations page: https://www.health.gov.au/topics/physical-activity/24-hour-movement-guidelines-for-all-australians/recommendations-for-adults-18-to-64-years · Report PDF: https://www.health.gov.au/sites/default/files/2026-03/australian-24-hour-movement-guidelines-for-adults-18-to-64-years-and-older-adults-65-years.pdf
  - As summarised by search of the official page (the site returned server errors to direct fetch, so **re-check the wording before publishing**): ≥30 min moderate-to-vigorous activity on most days (at least 2.5 h a week), muscle-strengthening on ≥2 days a week, mobility, balance and coordination activities on ≥3 days a week, several hours of light activity a day, limiting and breaking up sitting, and 7–9 h of sleep.
  - Note: the brief's figures (150–300 min moderate or 75–150 min vigorous a week, plus strength 2 days a week) come from the previous Australian guidelines (2014) and the WHO 2020 guidelines [E2]. They are consistent with the new ones.
- **[E2] Guideline (WHO).** Bull FC, Al-Ansari SS, Biddle S, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. *Br J Sports Med* 2020;54(24):1451–1462. https://doi.org/10.1136/bjsports-2020-102955
- **[E3] SR + NMA.** Noetel M, Sanders T, Gallardo-Gómez D, et al. Effect of exercise for depression: systematic review and network meta-analysis of randomised controlled trials. *BMJ* 2024;384:e075847. https://doi.org/10.1136/bmj-2023-075847. 218 RCTs, n=14,170. Versus active controls: walking or jogging g −0.62, yoga −0.55, strength training −0.49, mixed aerobic −0.43, tai chi or qigong −0.42. Effects scaled with intensity. Strength and yoga were best tolerated. CINeMA confidence was low for walking or jogging and very low for others.
- **[E4] Umbrella review.** Singh B, Olds T, Curtis R, et al. Effectiveness of physical activity interventions for improving depression, anxiety and distress: an overview of systematic reviews. *Br J Sports Med* 2023;57(18):1203–1209. https://doi.org/10.1136/bjsports-2022-106195. 97 reviews, 1,039 RCTs, n=128,119. Depression SMD −0.43, anxiety −0.42, distress −0.60. Higher intensity worked better.
- **[E5] Cochrane SR.** Cooney GM, Dwan K, Greig CA, et al. Exercise for depression. *Cochrane Database Syst Rev* 2013;(9):CD004366. https://doi.org/10.1002/14651858.CD004366.pub6 (moderate effect overall, smaller in high-quality trials).
- **[E6] SR/MA.** Aylett E, Small N, Bower P. Exercise in the treatment of clinical anxiety in general practice: a systematic review and meta-analysis. *BMC Health Serv Res* 2018;18:559. https://doi.org/10.1186/s12913-018-3313-5
- **[E7] MA (SUD).** Wang D, Wang Y, Wang Y, Li R, Zhou C. Impact of physical exercise on substance use disorders: a meta-analysis. *PLoS ONE* 2014;9(10):e110728. https://doi.org/10.1371/journal.pone.0110728. Abstinence OR 1.69, plus less withdrawal, anxiety (SMD −0.31) and depression (SMD −0.47). Effects were stronger for illicit drugs than alcohol.
- **[E8] SR/MA (AUD).** Hallgren M, Vancampfort D, Giesen ES, Lundin A, Stubbs B. Exercise as treatment for alcohol use disorders: systematic review and meta-analysis. *Br J Sports Med* 2017;51(14):1058–1064. https://doi.org/10.1136/bjsports-2016-096814. No significant effect on drinking. Less depression, better fitness. About 40% dropout.
- **[E9] SR/MA (AUD).** Effect of exercise on mental health and alcohol consumption in individuals with alcohol use disorder: a systematic review and meta-analysis. *BMJ Open* 2025;15(10):e102622. https://doi.org/10.1136/bmjopen-2025-102622. 15 RCTs, n=938. Anxiety SMD −0.53, depression −0.84, stress −1.14. Alcohol intake not significantly reduced.
- **[E10] SR/MA (cohorts).** Momma H, Kawakami R, Honda T, Sawada SS. Muscle-strengthening activities are associated with lower risk and mortality in major non-communicable diseases: a systematic review and meta-analysis of cohort studies. *Br J Sports Med* 2022;56(13):755–763. https://doi.org/10.1136/bjsports-2021-105061
- **[E11] Screening tool (Australia).** Exercise & Sports Science Australia, Fitness Australia, Sports Medicine Australia. *Adult Pre-Exercise Screening System (APSS)*, 2019 (v2). https://essa.org.au/Common/Uploaded%20files/Tools%20and%20templates/Adult%20Pre%20Screening%20Tool%202021.pdf · launch notice: https://sma.org.au/launch-of-latest-adult-pre-exercise-screening-system-for-health-and-fitness-industry/
- **[E12] Consensus.** Meeusen R, Duclos M, Foster C, et al. Prevention, diagnosis, and treatment of the overtraining syndrome: joint consensus statement of the ECSS and ACSM. *Med Sci Sports Exerc* 2013;45(1):186–205. https://doi.org/10.1249/MSS.0b013e318279a10a
- **[E13] Review.** Quesnel DA, Cooper M, Fernandez-del-Valle M, Reilly A, Calogero RM. Medical and physiological complications of exercise for individuals with an eating disorder: a narrative review. *J Eat Disord* 2023;11:3. https://doi.org/10.1186/s40337-022-00685-9
- **[E14] Clinical guideline.** Safe Exercise at Every Stage (SEES) guideline for compulsive or dysfunctional exercise in eating disorders. https://www.safeexerciseateverystage.com/

### Sauna and heat (S)

- **[S1] Cohort.** Laukkanen T, Khan H, Zaccardi F, Laukkanen JA. Association between sauna bathing and fatal cardiovascular and all-cause mortality events. *JAMA Intern Med* 2015;175(4):542–548. https://doi.org/10.1001/jamainternmed.2014.8187. KIHD cohort, 2,315 Finnish men aged 42–60, 20.7 years of follow-up. 4–7 vs 1 session a week: all-cause HR 0.60, fatal CVD 0.50, sudden cardiac death 0.37. Mean sauna temperature 78.9 °C, mean session 14.2 min.
- **[S2] Cohort.** Zaccardi F, Laukkanen T, Willeit P, Kunutsor SK, Kauhanen J, Laukkanen JA. Sauna bathing and incident hypertension: a prospective cohort study. *Am J Hypertens* 2017;30(11):1120–1125. https://doi.org/10.1093/ajh/hpx102 (4–7/week: HR 0.53).
- **[S3] Cohort.** Laukkanen T, Kunutsor S, Kauhanen J, Laukkanen JA. Sauna bathing is inversely associated with dementia and Alzheimer's disease in middle-aged Finnish men. *Age Ageing* 2017;46(2):245–249. https://doi.org/10.1093/ageing/afw212
- **[S4] Review.** Laukkanen JA, Laukkanen T, Kunutsor SK. Cardiovascular and other health benefits of sauna bathing: a review of the evidence. *Mayo Clin Proc* 2018;93(8):1111–1121. https://doi.org/10.1016/j.mayocp.2018.04.008
- **[S5] SR.** Hussain J, Cohen M. Clinical effects of regular dry sauna bathing: a systematic review. *Evid Based Complement Alternat Med* 2018;2018:1857413. https://doi.org/10.1155/2018/1857413
- **[S6] RCT.** Lee E, Kolunsarka I, Kostensalo J, et al. Effects of regular sauna bathing in conjunction with exercise on cardiovascular function: a multi-arm, randomized controlled trial. *Am J Physiol Regul Integr Comp Physiol* 2022;323(3):R289–R299. https://doi.org/10.1152/ajpregu.00076.2022
- **[S7] Review.** Heinonen I, Laukkanen JA. Effects of heat and cold on health, with special reference to Finnish sauna bathing. *Am J Physiol Regul Integr Comp Physiol* 2018;314(5):R629–R638. https://doi.org/10.1152/ajpregu.00115.2017
- **[S8] RCT.** Janssen CW, Lowry CA, Mehl MR, et al. Whole-body hyperthermia for the treatment of major depressive disorder: a randomized clinical trial. *JAMA Psychiatry* 2016;73(8):789–795. https://doi.org/10.1001/jamapsychiatry.2016.1031. n=34 randomised, 29 analysed. One session of medical-device hyperthermia (core temperature to about 38.5 °C) vs sham: HAM-D −6.5 at week 1, −4.3 at week 6. Unmedicated, medically healthy adults. **Not a sauna.**
- **[S8b] Single-arm feasibility trial.** Mason AE, Chowdhary A, Hartogensis W, et al. Feasibility and acceptability of an integrated mind-body intervention for depression: whole-body hyperthermia (WBH) and cognitive behavioral therapy (CBT). *Int J Hyperthermia* 2024;41(1):2351459. https://doi.org/10.1080/02656736.2024.2351459 (n=16, no control group).
- **[S9] SR.** Effects of post-exercise heat exposure on acute recovery and training-induced performance adaptations: a systematic review. *Sports Med Open* 2025. https://doi.org/10.1186/s40798-025-00910-0 (acute recovery effects inconsistent, low-to-moderate evidence).
- **[S10] SR/MA.** Haghayegh S, Khoshnevis S, Smolensky MH, Diller KR, Castriotta RJ. Before-bedtime passive body heating by warm shower or bath to improve sleep: a systematic review and meta-analysis. *Sleep Med Rev* 2019;46:124–135. https://doi.org/10.1016/j.smrv.2019.04.008 (40–42.5 °C water, 1–2 h before bed, as little as 10 min).

### Cold water immersion (K)

- **[K1] SR/MA.** Cain T, Brinsley J, Bennett H, Nelson M, Maher C, Singh B. Effects of cold-water immersion on health and wellbeing: a systematic review and meta-analysis. *PLoS ONE* 2025;20(1):e0317615. https://doi.org/10.1371/journal.pone.0317615. Submitted 2024, published 29 Jan 2025; this is the "2024 PLOS ONE review" in the brief. 11 RCTs, healthy adults, ≤15 °C. Inflammation **up** immediately (SMD 1.03) and at 1 h (1.26). Stress down at 12 h only (−1.00). No pooled immune effect. Better sleep and quality of life in narrative synthesis. **No effect on mood.** Few small RCTs.
- **[K2] Cochrane SR.** Bleakley C, McDonough S, Gardner E, Baxter GD, Hopkins JT, Davison GW. Cold-water immersion (cryotherapy) for preventing and treating muscle soreness after exercise. *Cochrane Database Syst Rev* 2012;(2):CD008262. https://doi.org/10.1002/14651858.CD008262.pub2
- **[K3] SR/MA.** Machado AF, Ferreira PH, Micheletti JK, et al. Can water temperature and immersion time influence the effect of cold water immersion on muscle soreness? A systematic review and meta-analysis. *Sports Med* 2016;46(4):503–514. https://doi.org/10.1007/s40279-015-0431-7 (best results at about 11–15 °C for 11–15 min).
- **[K4] RCT (mech).** Peake JM, Roberts LA, Figueiredo VC, et al. The effects of cold water immersion and active recovery on inflammation and cell stress responses in human skeletal muscle after resistance exercise. *J Physiol* 2017;595(3):695–711. https://doi.org/10.1113/JP272881 (no difference from active recovery).
- **[K5] Review.** Tipton MJ, Collier N, Massey H, Corbett J, Harper M. Cold water immersion: kill or cure? *Exp Physiol* 2017;102(11):1335–1355. https://doi.org/10.1113/EP086283
- **[K6] RCT.** Roberts LA, Raastad T, Markworth JF, et al. Post-exercise cold water immersion attenuates acute anabolic signalling and long-term adaptations in muscle to strength training. *J Physiol* 2015;593(18):4285–4301. https://doi.org/10.1113/JP270570
- **[K7] SR/MA.** Malta ES, Dutra YM, Broatch JR, Bishop DJ, Zagatto AM. The effects of regular cold-water immersion use on training-induced changes in strength and endurance performance: a systematic review with meta-analysis. *Sports Med* 2021;51(1):161–174. https://doi.org/10.1007/s40279-020-01362-0 (strength gains reduced, SMD about −0.6; endurance unaffected).
- **[K8] SR/MA.** Piñero A, Burke R, Augustin F, et al. Throwing cold water on muscle growth: a systematic review with meta-analysis of the effects of postexercise cold water immersion on resistance training-induced hypertrophy. *Eur J Sport Sci* 2024;24(2):177–189. https://doi.org/10.1002/ejsc.12074
- **[K9] Cross-sectional.** Søberg S, Löfgren J, Philipsen FE, et al. Altered brown fat thermoregulation and enhanced cold-induced thermogenesis in young, healthy, winter-swimming men. *Cell Rep Med* 2021;2(10):100408. https://doi.org/10.1016/j.xcrm.2021.100408. Swimmers reported about 11 min of cold and 57 min of sauna a week. Small, male only, observational.
- **[K10] Mech.** Šrámek P, Šimečková M, Janský L, Šavlíková J, Vybíral S. Human physiological responses to immersion into water of different temperatures. *Eur J Appl Physiol* 2000;81(5):436–442. https://doi.org/10.1007/s004210050065 (1 h at 14 °C: noradrenaline +530%, dopamine +250%).
- **[K11] Small experimental study.** Yankouskaya A, Williamson R, Stacey C, Totman JJ, Massey H. Short-term head-out whole-body cold-water immersion facilitates positive affect and increases interaction between large-scale brain networks. *Biology* 2023;12(2):211. https://doi.org/10.3390/biology12020211 (5 min at 20 °C).
- **[K12] Review.** Ihsan M, Watson G, Abbiss CR. What are the physiological mechanisms for post-exercise cold water immersion in the recovery from prolonged endurance and intermittent exercise? *Sports Med* 2016;46(8):1095–1109. https://doi.org/10.1007/s40279-016-0483-3
- **[K13] RCT.** Buijze GA, Sierevelt IN, van der Heijden BCJM, Dijkgraaf MG, Frings-Dresen MHW. The effect of cold showering on health and work: a randomized controlled trial. *PLoS ONE* 2016;11(9):e0161749. https://doi.org/10.1371/journal.pone.0161749 (hot shower finished with 30–90 s cold: 29% less sickness absence, no change in illness days).

### Contrast therapy (X)

- **[X1] SR/MA.** Bieuzen F, Bleakley CM, Costello JT. Contrast water therapy and exercise induced muscle damage: a systematic review and meta-analysis. *PLoS ONE* 2013;8(4):e62356. https://doi.org/10.1371/journal.pone.0062356. 18 trials, all at high risk of bias. Better than passive rest for soreness. Not clearly better than CWI, warm water, compression, active recovery or stretching.

### Risks, contraindications, alcohol and other drugs, medications (R)

- **[R1] Forensic series.** Kenttämies A, Karkola K. Death in sauna. *J Forensic Sci* 2008;53(3):724–729. https://doi.org/10.1111/j.1556-4029.2008.00703.x. Finland 1990–2002: fewer than 2 per 100,000 a year. 50% under the influence of alcohol. Heat was the cause in 25%. Advice: drink less and don't leave a drunk bather alone.
- **[R1b] Forensic series.** Saukko P. Sudden death during sauna bathing in Finland (national medico-legal autopsy database 1986–1995). *Jpn J Legal Med* (Onki). https://www.jstage.jst.go.jp/article/onki/76/1/76_7/_pdf. Of 544 deaths, heat exposure and alcohol intoxication made up 90% of non-natural causes. High blood alcohol was common across categories.
- **[R2] Review.** Hannuksela ML, Ellahham S. Benefits and risks of sauna bathing. *Am J Med* 2001;110(2):118–126. https://doi.org/10.1016/S0002-9343(00)00671-9. Avoid with unstable angina, recent MI or severe aortic stenosis. Avoid alcohol.
- **[R3] Review (mech).** Shattock MJ, Tipton MJ. "Autonomic conflict": a different way to die during cold water immersion? *J Physiol* 2012;590(14):3219–3230. https://doi.org/10.1113/jphysiol.2012.229864. Cold shock (sympathetic) plus diving response (vagal) can trigger arrhythmias, especially on face immersion or after a breath-hold, and in people with heart disease or long QT.
- **[R4] SR.** Driscoll TR, Harrison JA, Steenkamp M. Review of the role of alcohol in drowning associated with recreational aquatic activity. *Inj Prev* 2004;10(2):107–113. https://doi.org/10.1136/ip.2003.004390 (alcohol present in 30–70% of recreational drownings).
- **[R5] Australian data.** Royal Life Saving Society Australia. Alcohol and water safety. https://www.royallifesaving.com.au/stay-safe-active/risk-factors/alcohol-water-safety. About 1 in 4 drowning deaths had BAC ≥0.05%. 20-year analysis: https://www.royallifesaving.com.au/about/news-and-updates/news/2025/jul/20-years-of-drowning-trends-and-urgent-priorities-for-drowning-prevention-in-australia
- **[R6] SR.** Ravanelli N, Casasola W, English T, Edwards KM, Jay O. Heat stress and fetal risk. Environmental limits for exercise and passive heat stress during pregnancy: a systematic review with best evidence synthesis. *Br J Sports Med* 2019;53(13):799–805. https://doi.org/10.1136/bjsports-2017-097914. No participant exceeded 39 °C core. 70 °C saunas up to 20 min and 40 °C baths stayed under the threshold. Small evidence base. Teratogenic threshold concern in early pregnancy.
- **[R7] Clinical review.** Treating Raynaud phenomenon: beyond staying warm. *Cleve Clin J Med* 2017;84(10):797–804. https://www.ccjm.org/content/84/10/797 (cold and sudden temperature change are primary triggers).
- **[R7b] Guideline.** Guidelines for cold urticaria management (Centre of Evidence of Dermatology and Urticaria Group of the French Society of Dermatology). *Br J Dermatol* 2024. https://doi.org/10.1093/bjd/ljad447 (systemic reactions and drowning risk with whole-body cold-water exposure).
- **[R8] RCT (mech).** Effect of alcohol on body core temperature during cold-water immersion. *Br J Clin Pract* 1995. https://doi.org/10.1111/j.1742-1241.1995.tb09965.x (50 g alcohol: greater core temperature fall during cold immersion).
- **[R9] Commentary (Australian).** Westaway K, Frank O, Husband A, et al. Medicines can affect thermoregulation and accentuate the risk of dehydration and heat-related illness during hot weather. *J Clin Pharm Ther* 2015;40(4):363–367. https://doi.org/10.1111/jcpt.12294. Classes covered: diuretics, ACE inhibitors and ARBs, anticholinergics, antipsychotics, antidepressants, anticonvulsants, benzodiazepines, opioids, beta-blockers.
- **[R10] SR/MA.** Hospers L, Dillon GA, McLachlan AJ, et al. The effect of prescription and over-the-counter medications on core temperature in adults during heat stress: a systematic review and meta-analysis. *eClinicalMedicine* 2024;77:102886. https://doi.org/10.1016/j.eclinm.2024.102886
- **[R11] Clinical guidance.** US CDC. Heat and medications: guidance for clinicians. https://www.cdc.gov/heat-health/hcp/clinical-guidance/heat-and-medications-guidance-for-clinicians.html (antipsychotics, anticholinergics, lithium and dehydration toxicity, stimulants, beta-blockers, diuretics).
- **[R12] Review (Australian).** Nic Ionmhain U, McArdle K, Berling I. Illicit drug induced hyperthermia (IDIH). *Emerg Med Australas* 2025. https://doi.org/10.1111/1742-6723.70065 (MDMA, amphetamines, cocaine and other stimulants).
- **[R13] Systematic review / regulator advice.** Alinejad S, Kazemi T, Zamani N, Hoffman RS, Mehrpour O. A systematic review of the cardiotoxicity of methadone. *EXCLI J* 2015;14:577–600. https://doi.org/10.17179/excli2015-553 · Medsafe NZ. Cardiac vigilance recommended for methadone. https://www.medsafe.govt.nz/profs/puarticles/methadone.htm (QT prolongation and torsades de pointes). *Pharmacist to confirm against current Australian product information.*
