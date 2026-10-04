// Invented athletes; six metered Luna requests, onboarding-v8 (2026-10-03).
// The rejected quote remains a regression; later replies use the tightened evidence instruction.
// Replay only: no paid calls in tests and no guarantee of future model wording.
export const groupedLiveFixtures = [
  {
    "name": "goals-only",
    "sources": {
      "m1": "I want better recreational tennis endurance and a first pull-up, with tennis first."
    },
    "proposal": {
      "trainingSummary": [
        {
          "category": "goals",
          "text": "I want better recreational tennis endurance and a first pull-up, with tennis first.",
          "origin": "user_report"
        },
        {
          "category": "availability",
          "text": "Not yet provided.",
          "origin": "unknown"
        },
        {
          "category": "equipment",
          "text": "Not yet provided.",
          "origin": "unknown"
        },
        {
          "category": "experience",
          "text": "Current training or activity baseline not yet provided.",
          "origin": "unknown"
        },
        {
          "category": "limitations",
          "text": "Not yet provided.",
          "origin": "unknown"
        }
      ],
      "reply": "Got it—recreational tennis endurance is your priority, alongside working toward your first pull-up.",
      "additions": [],
      "nextQuestion": {
        "topic": "Activity and availability",
        "text": "What activity are you doing now, and how often and for how long could training realistically fit your week?",
        "decision": "Your current baseline and realistic training time help determine what kind of plan could suit you."
      },
      "readiness": "needs_clarification",
      "limitations": [],
      "planningCheck": {
        "status": "question",
        "question": "What activity are you doing now, and how often and for how long could training realistically fit your week?",
        "reason": "Your current baseline and realistic training time are needed to determine whether a suitable plan can be offered."
      }
    }
  },
  {
    "name": "activity-irregular",
    "sources": {
      "m1": "I want better recreational tennis endurance and a first pull-up, with tennis first.",
      "m2": "I play tennis once a week and walk twenty minutes twice a week. I am new to strength training. My shifts change, but two flexible twenty-five-minute sessions are realistic; I cannot promise fixed weekdays."
    },
    "proposal": {
      "trainingSummary": [
        {
          "category": "goals",
          "text": "I want better recreational tennis endurance and a first pull-up, with tennis first.",
          "origin": "user_report"
        },
        {
          "category": "availability",
          "text": "Two flexible twenty-five-minute sessions are realistic; I cannot promise fixed weekdays.",
          "origin": "user_report"
        },
        {
          "category": "equipment",
          "text": "Equipment or facilities not yet provided.",
          "origin": "unknown"
        },
        {
          "category": "experience",
          "text": "I am new to strength training.",
          "origin": "user_report"
        },
        {
          "category": "limitations",
          "text": "Limitations not yet provided.",
          "origin": "unknown"
        }
      ],
      "reply": "Thanks—that gives me your current activity, experience, and realistic training time.",
      "additions": [],
      "nextQuestion": {
        "topic": "equipment and limitations",
        "text": "What equipment or facilities can you use, and are there any limitations to account for?",
        "decision": "This helps identify suitable training options and any constraints to respect."
      },
      "readiness": "needs_clarification",
      "limitations": [
        "This understanding is based on reports, not independent verification or medical clearance."
      ],
      "planningCheck": {
        "status": "question",
        "question": "What equipment or facilities can you use, and are there any limitations to account for?",
        "reason": "This helps identify suitable training options and any constraints to respect."
      }
    },
    "failure": "invalid_model_output"
  },
  {
    "name": "activity-irregular",
    "sources": {
      "m1": "I want better recreational tennis endurance and a first pull-up, with tennis first.",
      "m2": "I play tennis once a week and walk twenty minutes twice a week. I am new to strength training. My shifts change, but two flexible twenty-five-minute sessions are realistic; I cannot promise fixed weekdays."
    },
    "proposal": {
      "trainingSummary": [
        {
          "category": "goals",
          "text": "I want better recreational tennis endurance and a first pull-up, with tennis first.",
          "origin": "user_report"
        },
        {
          "category": "availability",
          "text": "Two flexible 25-minute sessions are realistic; shifts change, so fixed weekdays aren’t promised.",
          "origin": "model_inference"
        },
        {
          "category": "equipment",
          "text": "Not yet provided.",
          "origin": "unknown"
        },
        {
          "category": "experience",
          "text": "Plays tennis weekly, walks 20 minutes twice weekly, and is new to strength training.",
          "origin": "model_inference"
        },
        {
          "category": "limitations",
          "text": "Not yet provided.",
          "origin": "unknown"
        }
      ],
      "reply": "Got it: tennis is your priority, alongside working toward a first pull-up. You play tennis weekly, walk twice a week, and can fit two flexible 25-minute sessions around changing shifts.",
      "additions": [],
      "nextQuestion": {
        "topic": "Equipment and limitations",
        "text": "What equipment or facilities can you use, and are there any limitations to account for?",
        "decision": "This will help capture your practical training options and any restrictions."
      },
      "readiness": "needs_clarification",
      "limitations": [
        "This understanding is based on reports, not independent verification or medical clearance."
      ],
      "planningCheck": {
        "status": "ready",
        "question": null,
        "reason": null
      }
    }
  },
  {
    "name": "equipment-mild-limitation",
    "sources": {
      "m1": "I want better recreational tennis endurance and a first pull-up, with tennis first.",
      "m2": "I play tennis once a week and walk twenty minutes twice a week. I am new to strength training. My shifts change, but two flexible twenty-five-minute sessions are realistic; I cannot promise fixed weekdays.",
      "m3": "I have public courts, a racket, a weekly tennis partner, a pull-up bar, clear floor space and a flat walking path. Only a mild occasional shoulder ache with overhead serves; walking and ordinary movement are comfortable. I avoid overhead serving when it aches. No other restrictions to report."
    },
    "proposal": {
      "trainingSummary": [
        {
          "category": "goals",
          "text": "Tennis endurance and a first pull-up are goals, with tennis the priority.",
          "origin": "model_inference"
        },
        {
          "category": "availability",
          "text": "Two flexible 25-minute sessions fit around changing shifts; fixed weekdays aren’t promised.",
          "origin": "model_inference"
        },
        {
          "category": "equipment",
          "text": "Has public courts, a racket, a weekly tennis partner, a pull-up bar, clear floor space and a flat walking path.",
          "origin": "model_inference"
        },
        {
          "category": "experience",
          "text": "Plays tennis once a week, walks twenty minutes twice a week, and is new to strength training.",
          "origin": "model_inference"
        },
        {
          "category": "limitations",
          "text": "Reports a mild occasional shoulder ache with overhead serves, avoids serving overhead when it aches, and reports no other restrictions.",
          "origin": "model_inference"
        }
      ],
      "reply": "Thanks, that gives a clear picture: tennis endurance comes first, alongside a first pull-up. You play weekly, walk twice weekly, and can fit two flexible 25-minute sessions around changing shifts. You have courts, a racket, a tennis partner, a pull-up bar, floor space and a flat walking path. You report a mild occasional shoulder ache with overhead serves and avoid those serves when it aches.",
      "additions": [],
      "nextQuestion": {
        "topic": "Onboarding recap",
        "text": "Please review this recap and let me know if you agree or want to correct anything.",
        "decision": "Your goals, activity, availability, equipment and reported limitation are captured."
      },
      "readiness": "ready_with_limits",
      "limitations": [
        "The shoulder ache is based on your report; this is not medical clearance."
      ],
      "planningCheck": {
        "status": "ready",
        "question": null,
        "reason": null
      }
    }
  },
  {
    "name": "correction",
    "sources": {
      "m1": "I want better recreational tennis endurance and a first pull-up, with tennis first.",
      "m2": "I play tennis once a week and walk twenty minutes twice a week. I am new to strength training. My shifts change, but two flexible twenty-five-minute sessions are realistic; I cannot promise fixed weekdays.",
      "m3": "I have public courts, a racket, a weekly tennis partner, a pull-up bar, clear floor space and a flat walking path. Only a mild occasional shoulder ache with overhead serves; walking and ordinary movement are comfortable. I avoid overhead serving when it aches. No other restrictions to report.",
      "m4": "Actually one twenty-minute session is realistic, not two. Keep tennis first and the pull-up goal too."
    },
    "proposal": {
      "trainingSummary": [
        {
          "category": "goals",
          "text": "Tennis endurance is the priority, alongside achieving a first pull-up.",
          "origin": "model_inference"
        },
        {
          "category": "availability",
          "text": "One flexible 20-minute session is realistic around changing shifts; fixed weekdays aren’t promised.",
          "origin": "model_inference"
        },
        {
          "category": "equipment",
          "text": "Has public courts, a racket, a weekly tennis partner, a pull-up bar, clear floor space and a flat walking path.",
          "origin": "model_inference"
        },
        {
          "category": "experience",
          "text": "Plays tennis once a week, walks twenty minutes twice a week, and is new to strength training.",
          "origin": "model_inference"
        },
        {
          "category": "limitations",
          "text": "Reports a mild occasional shoulder ache with overhead serves, avoids serving overhead when it aches, and reports no other restrictions.",
          "origin": "model_inference"
        }
      ],
      "reply": "Thanks for the correction. Tennis endurance remains your priority, alongside a first pull-up. You play tennis weekly, walk twice a week, and can fit one flexible 20-minute session around changing shifts. You have access to courts, a racket, a tennis partner, a pull-up bar, floor space and a flat walking path. You report an occasional mild shoulder ache with overhead serves and avoid serving overhead when it aches.",
      "additions": [],
      "nextQuestion": {
        "topic": "Onboarding recap",
        "text": "Please review this updated recap and let me know if it captures what matters or if you’d like to correct anything.",
        "decision": "Your updated goals, activity, availability, equipment and reported limitation are captured."
      },
      "readiness": "ready_with_limits",
      "limitations": [
        "This understanding is based on reports, not independent verification or medical clearance.",
        "The shoulder ache is based on your report; this is not medical clearance."
      ],
      "planningCheck": {
        "status": "ready",
        "question": null,
        "reason": null
      }
    }
  },
  {
    "name": "early-facts-declined",
    "sources": {
      "m1": "I want better everyday balance and swimming endurance equally. I swim casually once weekly and walk occasionally. Work shifts vary: sometimes twenty minutes, sometimes none, with no fixed frequency. I have a pool, a clear floor and a walking path. I would rather skip discussing health limitations. That is my whole situation."
    },
    "proposal": {
      "trainingSummary": [
        {
          "category": "goals",
          "text": "Improve everyday balance and swimming endurance equally.",
          "origin": "model_inference"
        },
        {
          "category": "experience",
          "text": "Casual swimming once weekly and occasional walking.",
          "origin": "model_inference"
        },
        {
          "category": "availability",
          "text": "Work shifts vary; sometimes 20 minutes are available and sometimes none, with no fixed frequency.",
          "origin": "model_inference"
        },
        {
          "category": "equipment",
          "text": "Access to a pool, clear floor space and a walking path.",
          "origin": "model_inference"
        },
        {
          "category": "limitations",
          "text": "Health limitations were declined and remain unknown.",
          "origin": "unknown"
        }
      ],
      "reply": "Your priorities are better everyday balance and swimming endurance equally. You swim casually once a week and walk occasionally. Work shifts vary, with sometimes 20 minutes available and sometimes none. You have access to a pool, clear floor space and a walking path; health limitations are unknown because you preferred not to discuss them.",
      "additions": [],
      "nextQuestion": {
        "topic": "Onboarding recap",
        "text": "Please correct anything that doesn’t fit, or let me know if this recap looks right.",
        "decision": "The reported goals and practical context are sufficient to proceed while respecting the declined limitations topic."
      },
      "readiness": "ready_with_limits",
      "limitations": [
        "Health limitations were declined and remain unknown.",
        "This understanding is based on reports, not independent verification or medical clearance."
      ],
      "planningCheck": {
        "status": "ready",
        "question": null,
        "reason": null
      }
    }
  }
];
