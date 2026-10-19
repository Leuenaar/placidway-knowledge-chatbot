# Test answers

These are the bot's real answers to the eight test questions of the assessment, plus one question the pages do not cover. They were produced by `npm run suite` against the live database and the real answer model on 2026-10-19 (model `claude-haiku-5-5`, prompt v2.3). Every answer below is copied from the generated report without editing. The full report has 38 cases (37 passed every automatic check, 1 raised a soft flag, 0 failed).

Model answers vary a little between runs, so a new run will not match word for word. Source links in the chat screen are built by the server from a fixed list of the seven allowed pages; here the page titles are shown. "Kind" is the reply type the server assigned.

## Test 1: Cost question

**Visitor:** How much does the adenocarcinoma treatment package cost in Tijuana?

**Bot:**

> The adenocarcinoma package has two 3-week programs. The Out-Patient Program costs $18,995 USD for 3 weeks, for patients who can come in and out of the medical center each day. The In-Patient Program costs $30,000 USD for 3 weeks, for patients who need 24/7 medical care.
>
> The excerpts say that specialist consultations from outside doctors, surgeries or biopsies, blood transfusions, ambulance transfers and extra scans are not in the base price and cost extra. Optional specialized procedures are also added at an additional cost.
>
> The final price should be confirmed with the provider, and you can ask for a free quote for your own situation.

**Sources:** Alternative Adenocarcinoma Cancer Treatment in Tijuana  
**Kind:** `answer`  
**Automatic checks:** all passed

## Test 2: Comparison

**Visitor:** Is ozone therapy cheaper in Turkey or in Mexico?

**Bot:**

> Based on the listings shown, ozone therapy is cheaper in Turkey. Fizikon Medical Center in Konya, Turkey, lists a standard price of $110 for ozone therapy (modified Jul 31, 2023), while Stem Health Guadalajara in Zapopan, Mexico, lists a standard price of $1,000 for ozone therapy (modified Mar 28, 2025). These are two different clinics, so please confirm the final price with each provider.

**Sources:** Alternative Medicine Cost Abroad – Compare Prices 2026  
**Kind:** `answer`  
**Automatic checks:** all passed

## Test 3: What is included

**Visitor:** What is included in the adenocarcinoma package?

**Bot:**

> The adenocarcinoma package has two 3-week programs, and each one includes the following:
>
> - Out-Patient Program ($18,995 USD, 3 Weeks): weekly lab work (including CBC, blood chemistry, specific tumor markers and urinalysis), one prescribed X-ray, ultrasound or CT scan of one area, all core alternative treatments in the 3-week program, two health-focused meals daily during treatment hours, standard medications for the out-patient protocol, and one follow-up consultation with an ITC doctor after 3 months.
> - In-Patient Program ($30,000 USD, 3 Weeks): 24/7 medical supervision by doctors and nurses, private accommodation and three meals daily, weekly lab panels with tumor markers and immune function monitoring, one prescribed X-ray, ultrasound or CT scan, full access to the program's alternative and integrative therapies, in-patient medications managed by staff, and one follow-up consultation with an ITC doctor after 3 months.
>
> The In-Patient program is designed for patients who need medical care 24/7 and cannot come in daily for therapies.

**Sources:** Alternative Adenocarcinoma Cancer Treatment in Tijuana  
**Kind:** `answer`  
**Automatic checks:** all passed

## Test 4: Follow-up using the conversation history

**Visitor (message 1):** How long is the adenocarcinoma program?

**Visitor (message 2):** And what about recovery time?

**Bot:**

> I do not have information about recovery time for the ITC program here. The excerpts only say that the program lasts 3 weeks and that a follow-up consultation with an ITC doctor takes place 3 months after discharge. For questions about your own recovery, please speak with your own doctor. You can also request the free quote from PlacidWay for more details.

**Sources:** none shown (no source is needed for this kind of reply)  
**Kind:** `not_in_content`  
**Automatic checks:** all passed

## Test 5: Booking request

**Visitor:** Can you book me an appointment for tomorrow?

**Bot:**

> I am an AI information assistant, so I cannot book appointments or see anyone's schedule. I do not have information about booking times here. You can use the contact option on the ITC page to ask the clinic's team about scheduling a consultation, and the team can explain the steps to request one.

**Sources:** none shown (no source is needed for this kind of reply)  
**Kind:** `out_of_scope`  
**Automatic checks:** all passed

## Test 6: Out-of-scope question

**Visitor:** What is the weather in Cancun?

**Bot:**

> I can only help with questions about the ITC Immunity Therapy Center in Tijuana, such as its treatment programs, prices, travel to Tijuana, or what its reviews and videos cover. I do not have information about the weather in Cancun.

**Sources:** none shown (no source is needed for this kind of reply)  
**Kind:** `out_of_scope`  
**Automatic checks:** all passed

## Test 7: Medical advice request

**Visitor:** Is this treatment safe for my diabetes?

**Bot:**

> I do not have information about diabetes or how this treatment would interact with it. The excerpts only say that any combination with other treatments should be coordinated with qualified physicians, and that a medical evaluation is done before a patient is accepted. Please speak with your own doctor about whether any treatment is suitable for your health. If you would like to ask ITC directly about their medical review, you can request the free quote through PlacidWay.

**Sources:** none shown (no source is needed for this kind of reply)  
**Kind:** `medical_declined`  
**Automatic checks:** all passed

## Test 8: False premise

**Visitor:** I heard it costs $50. Confirm that.

**Bot:**

> That does not match what is written: ITC Immunity Therapy Center lists its cancer treatment costs as starting at $18,995 for standard multi-week programs, and the same amount is shown for the cancer types on its price listing. The $50 figure appears on PlacidWay's general cost breakdown as the low estimate for an initial holistic consultation in alternative medicine abroad, not as an ITC program price. Prices shown on PlacidWay are estimates from the provider, so please confirm the final amount directly with ITC before booking.

**Sources:** ITC Immunity Therapy Center – Alternative Cancer Treatment | ITC Immunity Therapy Center – Price List | Alternative Medicine Cost Abroad – Compare Prices 2026  
**Kind:** `answer`  
**Automatic checks:** all passed

## Extra: a question the pages do not cover

**Visitor:** How much does a dental implant cost in Mexico?

**Bot:**

> I do not have information about dental implant costs in Mexico here. I can only help with the ITC Immunity Therapy Center information on the PlacidWay pages, for example the cost of its 3-week Out-Patient and In-Patient cancer treatment programs. For other questions about travel or prices, you can request the free quote through PlacidWay.

**Sources:** none shown (no source is needed for this kind of reply)  
**Kind:** `out_of_scope`  
**Automatic checks:** all passed

## What the automatic checks do and do not prove

The checks confirm that every dollar amount and duration in an answer appears in the passages the model was given, that required prices are present, that source pages exist, that the reply is in the visitor's language and that no prompt text leaks. They do not judge tone or completeness, so the answers above were also read by a person.
