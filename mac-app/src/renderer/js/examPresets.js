/**
 * TestMeMan Windows Assessment App - OA Exam Presets & Bank
 * Rich question sets for major company online assessments.
 */

const EXAM_PRESETS = {
  'TCS-NQT-2026': {
    code: 'TCS-NQT-2026',
    title: 'TCS NQT 2026 — Master Placement Assessment',
    company: 'Tata Consultancy Services',
    durationMinutes: 45,
    sections: [
      {
        name: 'Numerical Ability',
        questions: [
          {
            id: 'tcs_q1',
            text: 'A shopkeeper marks an item 40% above cost price and allows a 20% discount. What is his overall profit percentage?',
            options: ['12%', '14%', '15%', '20%'],
            correct: 0,
            marks: 2,
          },
          {
            id: 'tcs_q2',
            text: 'Two trains running in opposite directions cross a man standing on the platform in 27 seconds and 17 seconds respectively and they cross each other in 23 seconds. The ratio of their speeds is:',
            options: ['3 : 2', '2 : 3', '3 : 4', '1 : 3'],
            correct: 0,
            marks: 2,
          },
          {
            id: 'tcs_q3',
            text: 'If log10(x) + log10(x - 3) = 1, then the real value of x is:',
            options: ['5', '-2', '2', '10'],
            correct: 0,
            marks: 2,
          },
        ],
      },
      {
        name: 'Reasoning Ability',
        questions: [
          {
            id: 'tcs_q4',
            text: 'Pointing to a photograph of a boy Suresh said, "He is the son of the only son of my mother." How is Suresh related to that boy?',
            options: ['Brother', 'Uncle', 'Father', 'Cousin'],
            correct: 2,
            marks: 2,
          },
          {
            id: 'tcs_q5',
            text: 'Find the missing number in the series: 4, 18, 48, 100, 180, ?',
            options: ['294', '280', '312', '256'],
            correct: 0,
            marks: 2,
          },
        ],
      },
      {
        name: 'Verbal Ability',
        questions: [
          {
            id: 'tcs_q6',
            text: 'Choose the word most nearly opposite in meaning to "METICULOUS":',
            options: ['Careless', 'Painstaking', 'Scrupulous', 'Exact'],
            correct: 0,
            marks: 1,
          },
          {
            id: 'tcs_q7',
            text: 'Identify the grammatically correct sentence:',
            options: [
              'Neither the teacher nor the students were present in the hall.',
              'Neither the teacher nor the students was present in the hall.',
              'Neither the teachers nor the student were present in the hall.',
              'Neither the teacher or the student was present in the hall.',
            ],
            correct: 0,
            marks: 1,
          },
        ],
      },
    ],
  },

  'INF-DSE-2026': {
    code: 'INF-DSE-2026',
    title: 'Infosys Specialist Programmer & DSE Assessment',
    company: 'Infosys Limited',
    durationMinutes: 60,
    sections: [
      {
        name: 'Mathematical Logic',
        questions: [
          {
            id: 'inf_q1',
            text: 'In how many different ways can the letters of the word "LEADING" be arranged in such a way that the vowels always come together?',
            options: ['720', '360', '5040', '480'],
            correct: 0,
            marks: 3,
          },
          {
            id: 'inf_q2',
            text: 'What is the remainder when 2^2026 is divided by 7?',
            options: ['4', '2', '1', '6'],
            correct: 0,
            marks: 3,
          },
        ],
      },
      {
        name: 'Technical & Data Structures',
        questions: [
          {
            id: 'inf_q3',
            text: 'What is the worst-case time complexity of searching for an element in an unweighted Red-Black Tree with n nodes?',
            options: ['O(log n)', 'O(n)', 'O(1)', 'O(n log n)'],
            correct: 0,
            marks: 3,
          },
          {
            id: 'inf_q4',
            text: 'Which page replacement algorithm suffers from Belady’s Anomaly?',
            options: ['FIFO', 'LRU', 'Optimal', 'LFU'],
            correct: 0,
            marks: 3,
          },
        ],
      },
    ],
  },

  'COG-GENC-2026': {
    code: 'COG-GENC-2026',
    title: 'Cognizant GenC Elevate Assessment',
    company: 'Cognizant',
    durationMinutes: 40,
    sections: [
      {
        name: 'Quantitative Aptitude',
        questions: [
          {
            id: 'cog_q1',
            text: 'A pipe can fill a cistern in 6 hours and another pipe can empty it in 8 hours. If both pipes are opened together, the cistern will be full in:',
            options: ['24 hours', '14 hours', '12 hours', '48 hours'],
            correct: 0,
            marks: 2,
          },
        ],
      },
      {
        name: 'Analytical & Coding Logic',
        questions: [
          {
            id: 'cog_q2',
            text: 'What will be printed by: int a = 5; printf("%d %d", a++, ++a); (in standard sequence points)?',
            options: ['Undefined behavior in ANSI C', '5 7', '6 7', '5 6'],
            correct: 0,
            marks: 2,
          },
        ],
      },
    ],
  },

  'ACC-ASE-2026': {
    code: 'ACC-ASE-2026',
    title: 'Accenture Advanced ASE Assessment',
    company: 'Accenture',
    durationMinutes: 45,
    sections: [
      {
        name: 'Cognitive & Critical Thinking',
        questions: [
          {
            id: 'acc_q1',
            text: 'Statements: All stones are hammers. No hammer is a ring. Conclusions: I. Some rings are stones. II. No stone is a ring.',
            options: ['Only conclusion II follows', 'Only conclusion I follows', 'Both follow', 'Neither follows'],
            correct: 0,
            marks: 2,
          },
        ],
      },
    ],
  },
};

/**
 * Resolves an assessment config from code or generates a rich verified test for any custom code.
 */
function resolveAssessmentConfig(inputCode) {
  const clean = (inputCode || '').trim().toUpperCase();
  if (EXAM_PRESETS[clean]) {
    return EXAM_PRESETS[clean];
  }

  // Dynamic fallback for any company OA code (e.g. OA-7842-X9 or recruiter generated codes)
  return {
    code: clean || 'OA-2026-ACTIVE',
    title: `Proctored Recruitment Assessment (${clean || 'OA-2026'})`,
    company: 'Company Placement Cell',
    durationMinutes: 40,
    sections: [
      {
        name: 'Quantitative Aptitude',
        questions: [
          {
            id: 'dyn_q1',
            text: 'If 30% of a number is 120, what is 45% of the same number?',
            options: ['180', '150', '200', '160'],
            correct: 0,
            marks: 2,
          },
          {
            id: 'dyn_q2',
            text: 'A sum of money doubles itself in 5 years at simple interest. In how many years will it become 4 times itself?',
            options: ['15 years', '10 years', '20 years', '12 years'],
            correct: 0,
            marks: 2,
          },
        ],
      },
      {
        name: 'Logical Reasoning',
        questions: [
          {
            id: 'dyn_q3',
            text: 'Look at this series: 2, 1, (1/2), (1/4), ... What number should come next?',
            options: ['(1/8)', '(1/16)', '(1/3)', '(1/12)'],
            correct: 0,
            marks: 2,
          },
        ],
      },
      {
        name: 'Technical Aptitude',
        questions: [
          {
            id: 'dyn_q4',
            text: 'Which data structure is primarily used to implement Breadth-First Search (BFS) in a graph?',
            options: ['Queue', 'Stack', 'Min-Heap', 'Binary Search Tree'],
            correct: 0,
            marks: 2,
          },
        ],
      },
    ],
  };
}
