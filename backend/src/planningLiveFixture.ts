// Synthetic GPT-6 Luna responses, 2026-10-03. Replay only; no paid calls in tests.
export const planningLiveFixture = {
  'compact-summary': {
    trainingSummary: [
      {
        category: 'goals',
        text: 'I want general strength and comfortable walking, with walking first.',
        origin: 'user_report',
      },
      {
        category: 'availability',
        text: 'Three flexible 25-minute sessions per week fit, and tomorrow is available.',
        origin: 'user_report',
      },
      {
        category: 'equipment',
        text: 'I have clear floor space, a stable wall, and a safe flat outdoor walking path. No gym, equipment or partner.',
        origin: 'user_report',
      },
      {
        category: 'experience',
        text: 'I walk 20 minutes twice a week and am a beginner with strength exercises.',
        origin: 'user_report',
      },
      {
        category: 'limitations',
        text: 'No restrictions to report.',
        origin: 'user_report',
      },
    ],
    reply:
      'Recap: Your priority is comfortable walking, alongside general strength. You currently walk 20 minutes twice a week and are a beginner with strength exercises. Three flexible 25-minute sessions per week fit, with tomorrow available. You have clear floor space, a stable wall, and a safe flat outdoor walking path; no gym, equipment, or partner. You have no restrictions to report.',
    additions: [],
    nextQuestion: {
      topic: 'Onboarding recap',
      text: 'Please correct anything that’s off, or let me know if this looks right.',
      decision: 'Invite corrections or agreement with the recap.',
    },
    readiness: 'ready',
    limitations: [
      'This understanding is based on reports, not independent verification or medical clearance.',
    ],
  },
  'seven-day-outline': {
    days: [
      {
        date: '2026-10-04',
        sessions: [
          {
            focus: 'Endurance',
            activityIds: ['FQ-ACT-00148'],
          },
        ],
      },
      {
        date: '2026-10-05',
        sessions: [],
      },
      {
        date: '2026-10-06',
        sessions: [
          {
            focus: 'Strength',
            activityIds: ['FQ-ACT-00063', 'FQ-ACT-00002', 'FQ-ACT-00077', 'FQ-ACT-00102'],
          },
        ],
      },
      {
        date: '2026-10-07',
        sessions: [],
      },
      {
        date: '2026-10-08',
        sessions: [],
      },
      {
        date: '2026-10-09',
        sessions: [
          {
            focus: 'Endurance',
            activityIds: ['FQ-ACT-00148'],
          },
        ],
      },
      {
        date: '2026-10-10',
        sessions: [],
      },
    ],
    coverage: [],
  },
  'tomorrow-details': {
    date: '2026-10-04',
    coverage: [],
    sessions: [
      {
        activities: [
          {
            id: 'FQ-ACT-00148',
            phase: 'warmup',
            sets: 1,
            measure: 'seconds',
            amount: 180,
            effort: 'easy',
            restSeconds: 0,
            load: 'none',
            loadKg: null,
            side: 'both',
          },
          {
            id: 'FQ-ACT-00148',
            phase: 'main',
            sets: 1,
            measure: 'seconds',
            amount: 900,
            effort: 'easy',
            restSeconds: 0,
            load: 'none',
            loadKg: null,
            side: 'both',
          },
          {
            id: 'FQ-ACT-00148',
            phase: 'cooldown',
            sets: 1,
            measure: 'seconds',
            amount: 120,
            effort: 'easy',
            restSeconds: 0,
            load: 'none',
            loadKg: null,
            side: 'both',
          },
        ],
      },
    ],
  },
} as const;
