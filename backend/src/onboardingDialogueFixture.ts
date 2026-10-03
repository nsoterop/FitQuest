// Invented athletes and recorded Luna v4 outputs (2026-10-03). No live calls in tests.
// These replay observed response shapes; they do not establish future model quality.
export const dialogueFixtures = [
  {
    "name": "goals-shoulder",
    "turns": [
      {
        "message": "I want better recreational tennis and a first pull-up. I play once a week and sometimes my shoulder aches slightly when serving.",
        "proposal": {
          "reply": "Got it: improving recreational tennis and working toward your first pull-up are both goals. You play tennis weekly, and you’ve noticed slight shoulder aching when serving; I’ll keep that as an uncertain limitation.",
          "additions": [
            {
              "topic": "Goals",
              "value": "I want better recreational tennis and a first pull-up.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I want better recreational tennis and a first pull-up."
            },
            {
              "topic": "Current activity",
              "value": "I play once a week",
              "origin": "user_report",
              "source": "m1",
              "quote": "I play once a week"
            },
            {
              "topic": "Limitation",
              "value": "sometimes my shoulder aches slightly when serving.",
              "origin": "user_report",
              "source": "m1",
              "quote": "sometimes my shoulder aches slightly when serving."
            }
          ],
          "nextQuestion": {
            "topic": "Availability and equipment",
            "text": "What time can you realistically make available for activity in a typical week, and what equipment or facilities do you have access to?",
            "decision": "Availability and equipment have not been discussed yet."
          },
          "readiness": "needs_clarification",
          "limitations": [
            "Shoulder aching with serving is based on your report; its cause and significance are unknown.",
            "This understanding is based on reports, not independent verification or medical clearance."
          ]
        }
      },
      {
        "message": "It is a mild occasional ache only with serves, not a known injury. I have no other restrictions to report and would like to focus on goals and practical details.",
        "proposal": {
          "reply": "Thanks for clarifying—I’ll note the shoulder ache as mild and occasional with serves, not a known injury, and that you have no other restrictions to report.",
          "additions": [
            {
              "topic": "Limitation",
              "value": "It is a mild occasional ache only with serves, not a known injury.",
              "origin": "user_report",
              "source": "m2",
              "quote": "It is a mild occasional ache only with serves, not a known injury."
            },
            {
              "topic": "Other restrictions",
              "value": "I have no other restrictions to report",
              "origin": "user_report",
              "source": "m2",
              "quote": "I have no other restrictions to report"
            }
          ],
          "nextQuestion": {
            "topic": "Availability and equipment",
            "text": "What time can you realistically make available for activity in a typical week, and what equipment or facilities do you have access to?",
            "decision": "These practical details are still missing."
          },
          "readiness": "needs_clarification",
          "limitations": [
            "This understanding is based on reports, not independent verification or medical clearance.",
            "Shoulder aching with serving is based on your report; its cause and significance are unknown."
          ]
        }
      },
      {
        "message": "Tennis is first. Two flexible thirty-minute sessions a week are realistic; I have public courts and a pull-up bar.",
        "proposal": {
          "reply": "You’re prioritizing better recreational tennis, with a first pull-up as another goal. You play tennis once a week, and two flexible 30-minute sessions weekly are realistic. You have access to public courts and a pull-up bar. You report a mild, occasional shoulder ache only when serving, not a known injury, and no other restrictions. Its cause and significance are unknown.",
          "additions": [
            {
              "topic": "Goals",
              "value": "I want better recreational tennis and a first pull-up.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I want better recreational tennis and a first pull-up."
            },
            {
              "topic": "Priority",
              "value": "Tennis is first.",
              "origin": "user_report",
              "source": "m3",
              "quote": "Tennis is first."
            },
            {
              "topic": "Current activity",
              "value": "I play once a week",
              "origin": "user_report",
              "source": "m1",
              "quote": "I play once a week"
            },
            {
              "topic": "Availability",
              "value": "Two flexible thirty-minute sessions a week are realistic",
              "origin": "user_report",
              "source": "m3",
              "quote": "Two flexible thirty-minute sessions a week are realistic"
            },
            {
              "topic": "Equipment and facilities",
              "value": "I have public courts and a pull-up bar.",
              "origin": "user_report",
              "source": "m3",
              "quote": "I have public courts and a pull-up bar."
            },
            {
              "topic": "Limitation",
              "value": "It is a mild occasional ache only with serves, not a known injury.",
              "origin": "user_report",
              "source": "m2",
              "quote": "It is a mild occasional ache only with serves, not a known injury."
            },
            {
              "topic": "Other restrictions",
              "value": "I have no other restrictions to report",
              "origin": "user_report",
              "source": "m2",
              "quote": "I have no other restrictions to report"
            }
          ],
          "nextQuestion": {
            "topic": "Onboarding recap",
            "text": "Does this recap capture things accurately? You can correct or add anything.",
            "decision": "Invite correction or agreement to the recap."
          },
          "readiness": "ready_with_limits",
          "limitations": [
            "This understanding is based on your reports, not independent verification or medical clearance.",
            "The cause and significance of the shoulder ache are unknown."
          ]
        }
      },
      {
        "message": "Please summarize where we are.",
        "proposal": {
          "reply": "You’re aiming to improve your recreational tennis and get your first pull-up, with tennis as the priority. You play tennis once a week, and two flexible 30-minute sessions a week are realistic. You have access to public courts and a pull-up bar. You report a mild, occasional shoulder ache only with serves, not a known injury, and no other restrictions to report; its cause and significance are unknown.",
          "additions": [
            {
              "topic": "Goals",
              "value": "I want better recreational tennis and a first pull-up.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I want better recreational tennis and a first pull-up."
            },
            {
              "topic": "Current activity",
              "value": "I play once a week",
              "origin": "user_report",
              "source": "m1",
              "quote": "I play once a week"
            },
            {
              "topic": "Limitation",
              "value": "It is a mild occasional ache only with serves, not a known injury.",
              "origin": "user_report",
              "source": "m2",
              "quote": "It is a mild occasional ache only with serves, not a known injury."
            },
            {
              "topic": "Other restrictions",
              "value": "I have no other restrictions to report",
              "origin": "user_report",
              "source": "m2",
              "quote": "I have no other restrictions to report"
            },
            {
              "topic": "Priority",
              "value": "Tennis is first.",
              "origin": "user_report",
              "source": "m3",
              "quote": "Tennis is first."
            },
            {
              "topic": "Availability",
              "value": "Two flexible thirty-minute sessions a week are realistic",
              "origin": "user_report",
              "source": "m3",
              "quote": "Two flexible thirty-minute sessions a week are realistic"
            },
            {
              "topic": "Equipment and facilities",
              "value": "I have public courts and a pull-up bar.",
              "origin": "user_report",
              "source": "m3",
              "quote": "I have public courts and a pull-up bar."
            }
          ],
          "nextQuestion": {
            "topic": "Onboarding recap",
            "text": "Does that capture what matters? You can correct or add anything, or say “Looks good” to finish initial onboarding.",
            "decision": "The athlete asked for a summary, not to finish; invite corrections or explicit agreement."
          },
          "readiness": "ready_with_limits",
          "limitations": [
            "This understanding is based on your reports, not independent verification or medical clearance.",
            "The cause and significance of the shoulder ache are unknown."
          ]
        }
      },
      {
        "message": "Actually one thirty-minute session, not two. Keep tennis first and the pull-up goal too.",
        "proposal": {
          "reply": "Thanks for correcting that—I’ll use one flexible 30-minute session a week, while keeping tennis first and the pull-up goal too.",
          "additions": [
            {
              "topic": "Availability",
              "value": "Actually one thirty-minute session, not two.",
              "origin": "user_report",
              "source": "m5",
              "quote": "Actually one thirty-minute session, not two."
            },
            {
              "topic": "Priority",
              "value": "Keep tennis first and the pull-up goal too.",
              "origin": "user_report",
              "source": "m5",
              "quote": "Keep tennis first and the pull-up goal too."
            }
          ],
          "nextQuestion": {
            "topic": "Onboarding recap",
            "text": "You’re aiming to improve recreational tennis first and get your first pull-up as another goal. You play tennis once a week, and one flexible 30-minute session a week is realistic. You have access to public courts and a pull-up bar. You report a mild, occasional shoulder ache only with serves, not a known injury, and no other restrictions to report; its cause and significance are unknown. Does that capture what matters?",
            "decision": "Invite corrections or agreement."
          },
          "readiness": "ready_with_limits",
          "limitations": [
            "This understanding is based on your reports, not independent verification or medical clearance.",
            "You report a mild occasional shoulder ache only with serves; its cause and significance are unknown."
          ]
        }
      }
    ]
  },
  {
    "name": "comprehensive",
    "turns": [
      {
        "message": "Tennis endurance first, a first pull-up second. I play casually once a week and walk daily. Two flexible thirty-minute sessions a week fit my changing schedule. I have public courts and a pull-up bar, no gym. I have no injuries or limitations to report. That covers my situation.",
        "proposal": {
          "reply": "Got it: tennis endurance is your first priority, with a first pull-up second. You play casually once a week, walk daily, and can fit two flexible 30-minute sessions into your changing schedule. You have public courts and a pull-up bar, no gym, and no injuries or limitations to report.",
          "additions": [
            {
              "topic": "Goals and priorities",
              "value": "Tennis endurance first, a first pull-up second.",
              "origin": "user_report",
              "source": "m1",
              "quote": "Tennis endurance first, a first pull-up second."
            },
            {
              "topic": "Current activity",
              "value": "I play casually once a week and walk daily.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I play casually once a week and walk daily."
            },
            {
              "topic": "Availability",
              "value": "Two flexible thirty-minute sessions a week fit my changing schedule.",
              "origin": "user_report",
              "source": "m1",
              "quote": "Two flexible thirty-minute sessions a week fit my changing schedule."
            },
            {
              "topic": "Equipment and facilities",
              "value": "I have public courts and a pull-up bar, no gym.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I have public courts and a pull-up bar, no gym."
            },
            {
              "topic": "Limitations",
              "value": "I have no injuries or limitations to report.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I have no injuries or limitations to report."
            }
          ],
          "nextQuestion": {
            "topic": "Onboarding recap",
            "text": "Does this recap look right, or would you like to correct anything?",
            "decision": "Invite correction or agreement to the recap."
          },
          "readiness": "ready",
          "limitations": [
            "This understanding is based on reports, not independent verification or medical clearance."
          ]
        }
      }
    ]
  },
  {
    "name": "irregular-skip",
    "turns": [
      {
        "message": "I want better everyday balance. I walk occasionally. Work shifts vary: sometimes twenty minutes, sometimes none, with no fixed frequency. I have floor space at home and no equipment. I would rather skip health limitations.",
        "proposal": {
          "reply": "Everyday balance is your goal. You walk occasionally, and your work shifts make availability variable—some days you have about 20 minutes, other days none, with no fixed frequency. You have floor space at home and no equipment. I’ll respect your preference to skip health limitations.",
          "additions": [
            {
              "topic": "Goal",
              "value": "I want better everyday balance.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I want better everyday balance."
            },
            {
              "topic": "Current activity",
              "value": "I walk occasionally.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I walk occasionally."
            },
            {
              "topic": "Availability",
              "value": "Work shifts vary: sometimes twenty minutes, sometimes none, with no fixed frequency.",
              "origin": "user_report",
              "source": "m1",
              "quote": "Work shifts vary: sometimes twenty minutes, sometimes none, with no fixed frequency."
            },
            {
              "topic": "Equipment and facilities",
              "value": "I have floor space at home and no equipment.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I have floor space at home and no equipment."
            },
            {
              "topic": "Health limitations",
              "value": "Skipped at the athlete’s request; unknown.",
              "origin": "user_report",
              "source": "m1",
              "quote": "I would rather skip health limitations."
            }
          ],
          "nextQuestion": {
            "topic": "Onboarding recap",
            "text": "Does this recap capture what you shared, or would you like to correct anything?",
            "decision": "Invite agreement or correction; the server supplies the exact finish invitation."
          },
          "readiness": "ready_with_limits",
          "limitations": [
            "Health limitations were skipped at the athlete’s request.",
            "This understanding is based on reports, not independent verification or medical clearance."
          ]
        }
      },
      {
        "message": "Please stop the questions and recap what I have shared, leaving unknowns unknown.",
        "proposal": {
          "reply": "You’d like better everyday balance. You walk occasionally, and your work shifts mean availability varies—sometimes about 20 minutes, sometimes none, with no fixed frequency. You have floor space at home and no equipment. You’d rather skip health limitations, so those remain unknown.",
          "additions": [],
          "nextQuestion": {
            "topic": "Onboarding recap",
            "text": "Does this capture what you’ve shared? You can agree or tell me what to change.",
            "decision": "The recap reflects your reported goal, activity, variable availability, equipment, and choice to skip health limitations."
          },
          "readiness": "ready_with_limits",
          "limitations": [
            "This understanding is based on your reports, not independent verification or medical clearance.",
            "Health limitations were skipped at your request."
          ]
        }
      }
    ]
  }
];
