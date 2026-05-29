// CD-Copilot mock dataset (v2 — real org from CD master sheet)
// Single source of truth for the prototype. All views read from here.
// Plain JS, attached to window.CDC.

(function () {
  const today = new Date('2026-05-22T09:14:00+05:30');
  const fmt = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  // ── Roles (L0–L3 + Admin) ─────────────────────────────────────────────
  const ROLES = {
    L0: { label: 'L0', scope: 'Self' },
    L1: { label: 'L1', scope: 'Sub Department' },
    L2: { label: 'L2', scope: 'Sub Department' },
    L3: { label: 'L3', scope: 'Department' },
    ADMIN: { label: 'Admin', scope: 'All · config' },
    // Legacy aliases — keep so older code paths don't crash; resolve via role
    PRODUCT_OWNER: { label: 'L3', scope: 'Department' },
    DEPARTMENT_LEAD: { label: 'L2', scope: 'Sub Department' },
    SUB_LEAD: { label: 'L2', scope: 'Sub Department' },
    CENTRAL_OPS: { label: 'L2', scope: 'Cross-department' },
    TEAM_MEMBER: { label: 'L0', scope: 'Self' },
  };

  // ── Hierarchy ──────────────────────────────────────────────────────────
  // Business Direction → Product → Department → Sub-team
  // Source: CD master sheet (Department / Sub-Department / Managers)
  const BUSINESS_DIRECTIONS = [
    {
      id: 'bd-cd', name: 'CD - Curriculum Development',
      products: [
        {
          id: 'p-content', name: 'Content',
          departments: [
            {
              id: 'd-fsgci', name: 'Content — FS, GenAI & CO', short: 'FS · GenAI · CO',
              lead: null,
              subs: ['Content — Fullstack', 'Content — GenAI', 'Central Ops'],
            },
            {
              id: 'd-aptenglish', name: 'Content — Aptitude & English', short: 'Aptitude · English',
              lead: null,
              subs: ['Content — Aptitude', 'Content — English'],
            },
            {
              id: 'd-dsml', name: 'Content — DS&ML', short: 'DS&ML', flat: true,
              lead: 'NW0005433',
              subs: ['Content — DS&ML'],
            },
            {
              id: 'd-dsalgo', name: 'Content — DS&Algo', short: 'DS&Algo', flat: true,
              lead: 'NW0002023',
              subs: ['Content — DS&Algo'],
            },
          ],
        },
      ],
    },
  ];

  const DEPARTMENTS = BUSINESS_DIRECTIONS.flatMap((bd) =>
    bd.products.flatMap((p) =>
      p.departments.map((d) => ({ ...d, productId: p.id, productName: p.name, bdId: bd.id, bdName: bd.name }))
    )
  );

  // ── Users (with L-level + manager_id tree) ─────────────────────────────
  const USERS = [
    { id: 'NW0001240', name: 'Tejaswini Venkata', initials: 'TV', role: 'L2', level: 'L2', dept: 'd-aptenglish', sub: 'Content — English', title: 'L2 · Content — English', managerId: 'NW0002526' },
    { id: 'NW0002849', name: 'Poojitha pachava', initials: 'PP', role: 'L2', level: 'L2', dept: 'd-aptenglish', sub: 'Content — Aptitude', title: 'L2 · Content — Aptitude', managerId: 'NW0002526' },
    { id: 'NW0003323', name: 'Sai Krishna Chakradhar Pasupuleti', initials: 'SP', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Content — Aptitude', title: 'L1 · Content — Aptitude', managerId: 'NW0002849' },
    { id: 'NW0003881', name: 'Renna Fathima', initials: 'RF', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Content — English', title: 'L1 · Content — English', managerId: 'NW0001240' },
    { id: 'NW0004107', name: 'Sannamuri Sri Naga Poojitha', initials: 'SP', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Content — English', title: 'L1 · Content — English', managerId: 'NW0001240' },
    { id: 'NW0004629', name: 'Paturi Vivek', initials: 'PV', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Content — Aptitude', title: 'L1 · Content — Aptitude', managerId: 'NW0002849' },
    { id: 'NW0004661', name: 'Vivek Vijayan', initials: 'VV', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Assessment Intelligence', title: 'L1 · Assessment Intelligence', managerId: 'NW0001240' },
    { id: 'NW0004785', name: 'Manish Boosa', initials: 'MB', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Content — Aptitude', title: 'L1 · Content — Aptitude', managerId: 'NW0002849' },
    { id: 'NW0004831', name: 'Jithendra Venkata Sai Bonam', initials: 'JB', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Assessment Intelligence', title: 'L1 · Assessment Intelligence', managerId: 'NW0001240' },
    { id: 'NW0004881', name: 'Mariyam Khan', initials: 'MK', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Content — English', title: 'L1 · Content — English', managerId: 'NW0001240' },
    { id: 'NW0004998', name: 'Pinisetti Srinivas', initials: 'PS', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Content — Aptitude', title: 'L1 · Content — Aptitude', managerId: 'NW0002849' },
    { id: 'NW0005042', name: 'Thadigiri Prem Deep', initials: 'TD', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Content — English', title: 'L1 · Content — English', managerId: 'NW0001240' },
    { id: 'NW0005117', name: 'Viswanadh Pinisetti', initials: 'VP', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Assessment Intelligence', title: 'L1 · Assessment Intelligence', managerId: 'NW0001240' },
    { id: 'NW0005886', name: 'Namitha Mohasin', initials: 'NM', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: 'Assessment Intelligence', title: 'L1 · Assessment Intelligence', managerId: 'NW0001240' },
    { id: 'NW0006195', name: 'Pratik Bhattacharjee', initials: 'PB', role: 'L1', level: 'L1', dept: 'd-aptenglish', sub: null, title: 'L1 · Content — Aptitude & English', managerId: 'NW0001240' },
    { id: 'NW0001429', name: 'Sreenu Gampala', initials: 'SG', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW0003727', name: 'Alka Kumari', initials: 'AK', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW0004593', name: 'Srutthi Sri G', initials: 'SG', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW0005113', name: 'Kompella Sai Manvish', initials: 'KM', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW0005433', name: 'Rushikesh Chandrakant Konapure', initials: 'RK', role: 'L2', level: 'L2', dept: 'd-dsml', sub: null, title: 'L2 · Content — DS&ML', managerId: 'NW0002526' },
    { id: 'NW0005962', name: 'Kavya Bhemana', initials: 'KB', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW0006145', name: 'Aditya Singh', initials: 'AS', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW0006190', name: 'Nangunoori Chandu', initials: 'NC', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW0006237', name: 'Tejeswara Rao N', initials: 'TN', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW1005903', name: 'Lavanya Sri Rentala', initials: 'LR', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW1006863', name: 'Manoj kumar Damsalapudi', initials: 'MD', role: 'L1', level: 'L1', dept: 'd-dsml', sub: null, title: 'L1 · Content — DS&ML', managerId: 'NW0005433' },
    { id: 'NW0000374', name: 'Dilip Kumar Bhogi', initials: 'DB', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0005991', name: 'Anshul Jitendra Barahate', initials: 'AB', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0005864', name: 'Jashwanth Dandu', initials: 'JD', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0003492', name: 'Rishap Kumar', initials: 'RK', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0005863', name: 'Tushar Agarwal', initials: 'TA', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0005865', name: 'Praveen Seervi', initials: 'PS', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0002023', name: 'Kakarla Venkata Seshasai Pavan Teja', initials: 'KT', role: 'L2', level: 'L2', dept: 'd-dsalgo', sub: null, title: 'L2 · Content — DS&Algo', managerId: 'NW0002526' },
    { id: 'NW0005746', name: 'Harsh Kumar Rai', initials: 'HR', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0005750', name: 'Satyam Sharma', initials: 'SS', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0004624', name: 'Narava Hari Krishna', initials: 'NK', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0005707', name: 'Cherala Harini', initials: 'CH', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0005724', name: 'Syam Sundar Chinta', initials: 'SC', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW1006592', name: 'Chittaloori Rekha', initials: 'CR', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0004625', name: 'Sai Vivek Vallabhaneni', initials: 'SV', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0005594', name: 'Shruti Buduta', initials: 'SB', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW1006406', name: 'Tarun Aryan', initials: 'TA', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0005849', name: 'Kashif Moazzam', initials: 'KM', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0001284', name: 'Mahesh J', initials: 'MJ', role: 'L1', level: 'L1', dept: 'd-dsalgo', sub: null, title: 'L1 · Content — DS&Algo', managerId: 'NW0002023' },
    { id: 'NW0001771', name: 'Chanakya Meesala', initials: 'CM', role: 'L2', level: 'L2', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L2 · Content — Fullstack', managerId: 'NW0002526' },
    { id: 'NW0001778', name: 'Pushpa Latha Chenna', initials: 'PC', role: 'L2', level: 'L2', dept: 'd-fsgci', sub: 'Content — GenAI', title: 'L2 · Content — GenAI', managerId: 'NW0002526' },
    { id: 'NW0002526', name: 'Pavan Gangireddy', initials: 'PG', role: 'L3', level: 'L3', dept: 'd-fsgci', sub: 'Central Ops', title: 'L3 · Content', managerId: null, crossDept: true },
    { id: 'NW0003056', name: 'Khushi Jain', initials: 'KJ', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW0003057', name: 'Vipparthi Angel', initials: 'VA', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW0003123', name: 'Banuri Pranathi', initials: 'BP', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — GenAI', title: 'L1 · Content — GenAI', managerId: 'NW0001778' },
    { id: 'NW0003857', name: 'Jeevan Sravanth Parisa', initials: 'JP', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW0004570', name: 'Priya Mallikarjun Khairate', initials: 'PK', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW0005015', name: 'Kiran Kumar Budupula', initials: 'KB', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — GenAI', title: 'L1 · Content — GenAI', managerId: 'NW0001778' },
    { id: 'NW0005116', name: 'Aryaa Sharma', initials: 'AS', role: 'ADMIN', level: 'Admin', dept: 'd-fsgci', sub: 'Central Ops', title: 'Admin', managerId: 'NW0002526', crossDept: true },
    { id: 'NW0002531', name: 'Soumya Esampally', initials: 'SE', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW0005795', name: 'Jani Basha Nurubasha', initials: 'JN', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW0005927', name: 'Mandala Uma Devi', initials: 'MD', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — GenAI', title: 'L1 · Content — GenAI', managerId: 'NW0001778' },
    { id: 'NW0006025', name: 'Yerramilli Phani Yeshwanth', initials: 'YY', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW0006123', name: 'Prashant Kumar Jha', initials: 'PJ', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW0006717', name: 'Yedam Venkat Ganesh Reddy', initials: 'YR', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Central Ops', title: 'L1 · Central Ops', managerId: 'NW0002526' },
    { id: 'NW1006662', name: 'Chittharu Nagapravallika', initials: 'CN', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW1006940', name: 'Rishu Raj Singh', initials: 'RS', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    { id: 'NW1006983', name: 'Dasari Pallavi', initials: 'DP', role: 'L1', level: 'L1', dept: 'd-fsgci', sub: 'Content — Fullstack', title: 'L1 · Content — Fullstack', managerId: 'NW0001771' },
    // Latest roster addition (Team List CD): University Partnership L2.
    { id: 'NW0006700', name: 'Sunil Tekale', initials: 'ST', role: 'L2', level: 'L2', dept: 'd-fsgci', sub: 'University Partnership', title: 'L2 · University Partnership', managerId: 'NW0002526' },
  ];

  // Normalize sub-department: DS&ML / DS&Algo (and a few others) carry the
  // sub only in `title` (e.g. "L1 · Content — DS&ML"). Derive `sub` so every
  // member shows under their L2's sub-team and scope filters work.
  USERS.forEach((u) => {
    if (!u.sub && typeof u.title === 'string' && u.title.includes('·')) {
      const derived = u.title.split('·').pop().trim();
      if (derived) u.sub = derived;
    }
  });

  // ── Department health (computed-ish) ───────────────────────────────────
  const DEPT_HEALTH = {
    'd-fsgci': {
      score: 78, status: 'amber', trend: -3,
      reportRate: 0.88, kpiOnTrack: 0.50, openBlockers: 4, overdueTasks: 6,
      sparkline: [82, 80, 81, 79, 77, 80, 78, 81, 78, 76, 78],
      activeReports: 22, totalExpected: 25,
    },
    'd-aptenglish': {
      score: 86, status: 'green', trend: +2,
      reportRate: 0.94, kpiOnTrack: 1.0, openBlockers: 1, overdueTasks: 2,
      sparkline: [80, 81, 82, 82, 83, 84, 85, 84, 85, 86, 86],
      activeReports: 13, totalExpected: 14,
    },
    'd-dsml': {
      score: 73, status: 'amber', trend: -2,
      reportRate: 0.86, kpiOnTrack: 0.50, openBlockers: 2, overdueTasks: 3,
      sparkline: [78, 77, 76, 75, 74, 73, 74, 73, 72, 73, 73],
      activeReports: 6, totalExpected: 7,
    },
    'd-dsalgo': {
      score: 64, status: 'red', trend: -8,
      reportRate: 0.71, kpiOnTrack: 0.0, openBlockers: 3, overdueTasks: 5,
      sparkline: [76, 74, 72, 71, 70, 69, 68, 67, 65, 65, 64],
      activeReports: 5, totalExpected: 7,
    },
  };

  // ── KPIs ───────────────────────────────────────────────────────────────
  const KPIS = [
    { id: 'k-1', name: 'Fullstack content velocity', dept: 'd-fsgci', target: 18, current: 14, unit: '/wk', status: 'amber', trend: [16, 15, 15, 14, 14, 14], owner: 'NW0001771' },
    { id: 'k-2', name: 'GenAI lab readiness',         dept: 'd-fsgci', target: 90, current: 76, unit: '%',  status: 'amber', trend: [70, 72, 73, 74, 75, 76], owner: 'NW0001778' },
    { id: 'k-3', name: 'Central Ops uptime',       dept: 'd-fsgci', target: 99.9, current: 99.62, unit: '%', status: 'red', trend: [99.94, 99.91, 99.8, 99.7, 99.65, 99.62], owner: 'NW-VIJAY-CO', lowerIsBetter: false },
    { id: 'k-4', name: 'Central Ops report-rate',     dept: 'd-fsgci', target: 95, current: 96, unit: '%',  status: 'green', trend: [92, 93, 94, 95, 95, 96], owner: 'NW-VIJAY-CO' },

    { id: 'k-5', name: 'Aptitude problem coverage',   dept: 'd-aptenglish', target: 95, current: 91, unit: '%', status: 'amber', trend: [86, 88, 89, 90, 90, 91], owner: 'NW0002849' },
    { id: 'k-6', name: 'English unit completion',     dept: 'd-aptenglish', target: 85, current: 88, unit: '%', status: 'green', trend: [82, 84, 85, 86, 87, 88], owner: 'NW0001240' },

    { id: 'k-7', name: 'DS&ML curriculum coverage',   dept: 'd-dsml',   target: 95, current: 82, unit: '%', status: 'amber', trend: [78, 79, 80, 81, 82, 82], owner: 'NW0005433' },
    { id: 'k-8', name: 'DS&ML mentor NPS',            dept: 'd-dsml',   target: 72, current: 75, unit: '',  status: 'green', trend: [70, 72, 73, 74, 74, 75], owner: 'NW0005433' },

    { id: 'k-9', name: 'DS&Algo problem freshness',    dept: 'd-dsalgo', target: 60, current: 47, unit: '/wk', status: 'amber', trend: [52, 50, 48, 49, 46, 47], owner: 'NW0002023' },
    { id: 'k-10', name: 'DS&Algo student pass rate',   dept: 'd-dsalgo', target: 78, current: 70, unit: '%',  status: 'red',   trend: [76, 74, 73, 72, 71, 70], owner: 'NW0002023' },
  ];

  // ── Daily Reports ──────────────────────────────────────────────────────
  // Each manager files for their sub-team / department.
  const REPORTS = [
    {
      id: 'r-1001', author: 'NW0001771', date: fmt(daysAgo(1)), submittedAt: '21:48 IST',
      sub: 'Content — Fullstack', dept: 'd-fsgci', validation: 'OK', confidence: 0.92,
      items: [
        { kind: 'done', text: 'Shipped 4 new full-stack labs (auth, sessions, file uploads, websockets) into the curriculum graph.' },
        { kind: 'done', text: 'Reviewed 12 student PRs on the e-commerce capstone; updated rubric for partial credit.' },
        { kind: 'progress', text: 'Drafting deployment unit — 60% complete; visualizer specs sent to Central Ops.' },
        { kind: 'blocker', text: 'Waiting on Central Ops for code-runner support of large heap allocations (blocks Node performance lab).' },
        { kind: 'plan', text: 'Tomorrow: finish CI/CD narrative + send to Pavan G for review.' },
      ],
      kpiHits: ['k-1'],
    },
    {
      id: 'r-1002', author: 'NW0001778', date: fmt(daysAgo(1)), submittedAt: '20:11 IST',
      sub: 'Content — GenAI', dept: 'd-fsgci', validation: 'OK', confidence: 0.88,
      items: [
        { kind: 'done', text: 'Finalized RAG-lab spec — 8 notebooks; sign-off pending from Pavan G.' },
        { kind: 'progress', text: 'Live A/B on prompt-engineering placement; early signal +6% completion (n=412, low power).' },
        { kind: 'risk', text: 'Vector-DB cost model assumes Pinecone free tier; actual usage will exceed in week 3.' },
        { kind: 'plan', text: 'Tomorrow: budget review with Central Ops; cut down embedding dim.' },
      ],
      kpiHits: ['k-2'],
    },
    {
      id: 'r-1003', author: 'NW-VIJAY-CO', date: fmt(daysAgo(1)), submittedAt: '19:30 IST',
      sub: 'Central Ops', dept: 'd-fsgci', validation: 'OK', confidence: 0.87,
      items: [
        { kind: 'done', text: 'Rolled out auto-scaling group v3 to staging code-runner cluster.' },
        { kind: 'risk', text: 'Database read replica lag spiked to 8.3 s during EU peak. Investigating.' },
        { kind: 'blocker', text: 'AWS support case open for unexplained NAT throttle (3d).' },
        { kind: 'plan', text: 'Bring up second NAT gateway as workaround.' },
      ],
      kpiHits: ['k-3'],
    },
    {
      id: 'r-1004', author: 'NW-VIJAY-CO', date: fmt(daysAgo(1)), submittedAt: '22:01 IST',
      sub: 'Central Ops', dept: 'd-fsgci', validation: 'OK', confidence: 0.91,
      items: [
        { kind: 'done', text: 'Closed 9 of 11 outstanding intake tickets across content tracks.' },
        { kind: 'done', text: 'Pulled report-rate dashboards for Pavan G review — 96% this week.' },
        { kind: 'progress', text: 'Migrating Python module entries to v2 platform schema; 40%.' },
        { kind: 'plan', text: 'Continue migration; sync with Vijay on schema unblock.' },
      ],
      kpiHits: ['k-4'],
    },
    {
      id: 'r-1005', author: 'NW0002849', date: fmt(daysAgo(1)), submittedAt: '18:45 IST',
      sub: 'Content — Aptitude', dept: 'd-aptenglish', validation: 'OK', confidence: 0.89,
      items: [
        { kind: 'done', text: 'Added 22 quantitative-aptitude problems to the question bank; reviewed by 2 SMEs.' },
        { kind: 'progress', text: 'Drafting Logical Reasoning unit v2; outline approved.' },
        { kind: 'plan', text: 'Run pilot session with 30 students on new problem-set difficulty curve.' },
      ],
      kpiHits: ['k-5'],
    },
    {
      id: 'r-1006', author: 'NW0001240', date: fmt(daysAgo(1)), submittedAt: '19:55 IST',
      sub: 'Content — English', dept: 'd-aptenglish', validation: 'PARTIAL', confidence: 0.64,
      items: [
        { kind: 'done', text: 'Updated business-English module with 12 new scenarios.' },
        { kind: 'progress', text: 'Reading comprehension unit revamp 70%.' },
        { kind: 'note', text: 'No blockers.' },
      ],
      kpiHits: [],
      warnings: ['Plan for tomorrow missing', 'Low item detail on item 2'],
    },
    {
      id: 'r-1007', author: 'NW0005433', date: fmt(daysAgo(1)), submittedAt: '23:12 IST',
      sub: 'Content — DS&ML', dept: 'd-dsml', validation: 'OK', confidence: 0.90,
      items: [
        { kind: 'done', text: 'Shipped 3 new classification labs (logistic, decision-tree, SVM) into the curriculum.' },
        { kind: 'progress', text: 'Eval harness for ML evaluation rubric 70%.' },
        { kind: 'risk', text: 'Mentor capacity for DS&ML cohort is at 1:48; planned 1:35.' },
        { kind: 'plan', text: 'Sync with Pavan G on hiring forecast bump.' },
      ],
      kpiHits: ['k-7', 'k-8'],
    },
    {
      id: 'r-1008', author: 'NW0002023', date: fmt(daysAgo(1)), submittedAt: '— missing —',
      sub: 'Content — DS&Algo', dept: 'd-dsalgo', validation: 'MISSING', confidence: 0,
      items: [],
      kpiHits: [],
      missing: true,
    },
    // Yesterday's DS&Algo report (for context)
    {
      id: 'r-1009', author: 'NW0002023', date: fmt(daysAgo(2)), submittedAt: '21:32 IST',
      sub: 'Content — DS&Algo', dept: 'd-dsalgo', validation: 'OK', confidence: 0.86,
      items: [
        { kind: 'done', text: 'Shipped 6 new array problems (sliding window set) into the problem graph.' },
        { kind: 'progress', text: 'Drafting graph-algorithms unit — 60%; visualizer specs sent to Central Ops.' },
        { kind: 'blocker', text: 'Waiting on Central Ops for heap-allocation limit (blocks heap-sort lab); cited 3 days running.' },
        { kind: 'risk', text: 'Student pass rate slipping (70% vs 78% target); 2-week downward trend.' },
        { kind: 'plan', text: 'Finish BFS/DFS narrative + send to Pavan G.' },
      ],
      kpiHits: ['k-9', 'k-10'],
    },
    // Two days ago, Tejaswini
    {
      id: 'r-1010', author: 'NW0001240', date: fmt(daysAgo(2)), submittedAt: '20:11 IST',
      sub: 'Content — English', dept: 'd-aptenglish', validation: 'OK', confidence: 0.86,
      items: [
        { kind: 'done', text: 'Recorded 4 video explanations for grammar deep-dive.' },
        { kind: 'progress', text: 'Vocabulary track migration 50%.' },
        { kind: 'plan', text: 'Continue migration; pair with Prudvi on placement test.' },
      ],
      kpiHits: ['k-6'],
    },
  ];

  // ── Tasks (SUGGESTED + others) ─────────────────────────────────────────
  const TASKS = [
    {
      id: 't-1', title: 'Resolve heap-allocation limit blocking heap-sort lab',
      status: 'SUGGESTED', reason: 'Recurring blocker: cited in DS&Algo reports 3 days running.',
      sourceReports: ['r-1009'], owner: 'NW0001771', dept: 'd-dsalgo',
      created: fmt(today), confidence: 0.88,
    },
    {
      id: 't-2', title: 'Investigate Pavan Teja missing-report (today)',
      status: 'SUGGESTED', reason: 'Data Quality flag: DS&Algo daily report missing today; missing 2 of last 5.',
      sourceReports: [], owner: 'NW0002526', dept: 'd-dsalgo',
      created: fmt(today), confidence: 0.75,
    },
    {
      id: 't-3', title: 'Address NAT throttle workaround timeline',
      status: 'SUGGESTED', reason: 'Blocker on Central Ops report > 72h old; escalation threshold reached.',
      sourceReports: ['r-1003'], owner: 'NW-VIJAY-CO', dept: 'd-fsgci',
      created: fmt(today), confidence: 0.81,
    },
    {
      id: 't-4', title: 'KPI miss: DS&Algo pass rate 70% vs target 78%',
      status: 'SUGGESTED', reason: 'KPI red for 2 consecutive weeks. Suggest curriculum review.',
      sourceReports: ['r-1009'], owner: 'NW0002023', dept: 'd-dsalgo',
      created: fmt(today), confidence: 0.79,
    },
    {
      id: 't-5', title: 'GenAI vector-DB cost over free tier — budget approval',
      status: 'SUGGESTED', reason: 'Risk surfaced in GenAI daily report.',
      sourceReports: ['r-1002'], owner: 'NW0002526', dept: 'd-fsgci',
      created: fmt(today), confidence: 0.72,
    },
    {
      id: 't-6', title: 'Mentor capacity model mismatch: 1:48 actual vs 1:35 planned',
      status: 'ACTIVE', reason: 'Approved 2 days ago.', sourceReports: ['r-1007'],
      owner: 'NW0002526', dept: 'd-dsml',
      created: fmt(daysAgo(2)), confidence: 0.84,
    },
    {
      id: 't-7', title: 'Schema migration unblocking (BE-1442)',
      status: 'ACTIVE', reason: 'Manual',
      sourceReports: ['r-1004'], owner: 'NW-VIJAY-CO', dept: 'd-fsgci',
      created: fmt(daysAgo(3)), confidence: null,
    },
    {
      id: 't-8', title: 'English module readability review',
      status: 'DONE', reason: 'Manual',
      sourceReports: ['r-1010'], owner: 'NW0001240', dept: 'd-aptenglish',
      created: fmt(daysAgo(5)), confidence: null,
    },
  ];

  // ── Data Quality flags ─────────────────────────────────────────────────
  const FLAGS = [
    {
      id: 'f-1', kind: 'missing_reports', severity: 'high',
      title: 'DS&Algo missed 2 of last 5 daily reports',
      detail: 'Pavan Teja (DS&Algo) submitted on 2026-05-18, 2026-05-19, 2026-05-21. Missing 2026-05-20 and 2026-05-22.',
      target: { type: 'sub', id: 'Content — DS&Algo', dept: 'd-dsalgo' },
      created: fmt(today), state: 'open',
    },
    {
      id: 'f-2', kind: 'recurring_blocker', severity: 'high',
      title: 'Heap-allocation blocker cited 3 days running',
      detail: 'DS&Algo reports r-1009 (and 2 prior) all cite the same Central Ops heap-allocation limit. Suggest escalation to Vijay.',
      target: { type: 'sub', id: 'Content — DS&Algo', dept: 'd-dsalgo' },
      created: fmt(today), state: 'open',
    },
    {
      id: 'f-3', kind: 'low_content', severity: 'medium',
      title: 'English report 2026-05-21 has low item detail',
      detail: 'Report r-1006: 3 items, avg 7 words/item, missing "Plan for tomorrow". Validation set to PARTIAL.',
      target: { type: 'report', id: 'r-1006' },
      created: fmt(daysAgo(1)), state: 'open',
    },
    {
      id: 'f-4', kind: 'stale_kpi', severity: 'medium',
      title: 'Central Ops Uptime KPI not updated in 8 days',
      detail: 'k-3 last value 2026-05-14. Expected weekly. Auto-pulled from Mastersheet — sheet itself appears stale.',
      target: { type: 'kpi', id: 'k-3' },
      created: fmt(daysAgo(1)), state: 'open',
    },
    {
      id: 'f-5', kind: 'duplicate', severity: 'low',
      title: 'Possible duplicate item across Fullstack/Systems reports',
      detail: '"Code-runner memory issue" cited by both Chanakya and Vijay in last 7 days. Suggest single owner.',
      target: { type: 'sub', id: 'Content — Fullstack', dept: 'd-fsgci' },
      created: fmt(daysAgo(2)), state: 'open',
    },
    {
      id: 'f-6', kind: 'low_content', severity: 'low',
      title: 'English plan items consistently under-detailed (last 5 days)',
      detail: 'Tejaswini\u2019s plan items avg 9 words. Suggest standard structure.',
      target: { type: 'sub', id: 'Content — English', dept: 'd-aptenglish' },
      created: fmt(daysAgo(2)), state: 'snoozed',
    },
  ];

  // ── Weekly summaries (drafts) ──────────────────────────────────────────
  const WEEKLY = [
    {
      id: 'w-fsgci-21', dept: 'd-fsgci', deptName: 'Content — FS, GenAI & CO',
      weekOf: '2026-05-18', status: 'DRAFT', confidence: 0.84,
      generatedAt: '2026-05-22 06:02 IST', generatedBy: 'WeeklyConsolidation agent',
      sections: [
        {
          h: 'Highlights',
          items: [
            { text: 'Fullstack velocity at 14 units (target 18) — recovery trajectory still slow.', cites: ['r-1001', 'k-1'] },
            { text: 'GenAI RAG-lab spec finalized; awaiting Pavan G sign-off.', cites: ['r-1002'] },
            { text: 'Central Ops rolled out ASG v3 to staging.', cites: ['r-1003'] },
            { text: 'Central Ops report-rate at 96% — best in 6 weeks.', cites: ['r-1004', 'k-4'] },
          ],
        },
        {
          h: 'Risks',
          items: [
            { text: 'Heap-allocation Central Ops dependency blocks heap-sort lab; 3-day-old recurring blocker.', cites: ['r-1001', 'f-2'] },
            { text: 'GenAI vector-DB cost will exceed free tier in 3 weeks.', cites: ['r-1002', 't-5'] },
            { text: 'Infra uptime 99.62% vs 99.9% target — NAT throttle root cause still pending AWS.', cites: ['r-1003', 'k-3'] },
          ],
        },
        {
          h: 'Asks',
          items: [
            { text: 'Pavan G: align on whether to ship Fullstack unit without Node-perf lab or wait on Central Ops fix.', cites: [] },
            { text: 'Approve GenAI Pinecone paid-tier ($340/mo) — see t-5.', cites: ['t-5'] },
          ],
        },
      ],
      editedBy: null, publishedAt: null,
    },
    {
      id: 'w-apten-21', dept: 'd-aptenglish', deptName: 'Content — Aptitude & English',
      weekOf: '2026-05-18', status: 'PUBLISHED', confidence: 0.91,
      generatedAt: '2026-05-19 06:01 IST', generatedBy: 'WeeklyConsolidation agent',
      sections: [
        { h: 'Highlights', items: [
          { text: 'Aptitude problem bank +22 vetted items; coverage now 91%.', cites: ['r-1005', 'k-5'] },
          { text: 'English unit-completion rate +6 pts wow to 88%.', cites: ['r-1010', 'k-6'] },
        ] },
        { h: 'Risks', items: [
          { text: 'English daily reports trending under-detailed; raised as low-severity flag.', cites: ['f-6'] },
        ] },
        { h: 'Asks', items: [
          { text: 'Approve pilot of new Logical Reasoning unit with 30-student cohort.', cites: ['r-1005'] },
        ] },
      ],
      editedBy: 'NW0002526', publishedAt: '2026-05-19 11:30 IST',
    },
    {
      id: 'w-dsml-21', dept: 'd-dsml', deptName: 'Content — DS&ML',
      weekOf: '2026-05-18', status: 'DRAFT', confidence: 0.78,
      generatedAt: '2026-05-22 06:03 IST', generatedBy: 'WeeklyConsolidation agent',
      sections: [
        {
          h: 'Highlights',
          items: [
            { text: 'Three new classification labs shipped (logistic, decision-tree, SVM).', cites: ['r-1007'] },
            { text: 'Mentor NPS holds at 75 (target 72).', cites: ['k-8'] },
          ],
        },
        {
          h: 'Risks',
          items: [
            { text: 'Curriculum coverage 82% vs 95% target — narrowing but still amber.', cites: ['k-7', 'r-1007'] },
            { text: 'Mentor capacity 1:48 actual vs 1:35 planned; impacts session quality.', cites: ['r-1007', 't-6'] },
          ],
        },
      ],
      editedBy: null, publishedAt: null,
    },
    {
      id: 'w-dsalgo-21', dept: 'd-dsalgo', deptName: 'Content — DS&Algo',
      weekOf: '2026-05-18', status: 'DRAFT', confidence: 0.62,
      generatedAt: '2026-05-22 06:04 IST', generatedBy: 'WeeklyConsolidation agent',
      sections: [
        {
          h: 'Highlights',
          items: [
            { text: '6 new array problems shipped (sliding window set).', cites: ['r-1009'] },
          ],
        },
        {
          h: 'Risks',
          items: [
            { text: 'Student pass rate 70% vs 78% target — red, 2-week downward trend.', cites: ['k-10', 'r-1009'] },
            { text: 'Heap-allocation Central Ops blocker now 3 days old.', cites: ['r-1009', 'f-2'] },
            { text: 'Today\u2019s DS&Algo report is missing — confidence in this draft is reduced (0.62).', cites: ['f-1'] },
          ],
        },
        {
          h: 'Asks',
          items: [
            { text: 'Pavan G: review whether DS&Algo needs additional staffing given pass-rate drop.', cites: [] },
          ],
        },
      ],
      editedBy: null, publishedAt: null,
    },
  ];

  // ── AI Runs ────────────────────────────────────────────────────────────
  const AI_RUNS = [
    { id: 'run-1101', agent: 'ReportIntake', model: 'claude-haiku-4-5', latencyMs: 412, tokensIn: 1240, tokensOut: 318, costUsd: 0.0021, outcome: 'OK',      ts: '2026-05-22 09:08 IST', scopeHash: '7a1f…3e', input: 'Sheet row: 2026-05-22 / Fullstack / Chanakya', output: '{"items":[{"kind":"done", ...}], "warnings":[]}' },
    { id: 'run-1100', agent: 'ReportIntake', model: 'claude-haiku-4-5', latencyMs: 388, tokensIn: 980,  tokensOut: 240, costUsd: 0.0016, outcome: 'PARTIAL', ts: '2026-05-22 09:08 IST', scopeHash: '7a1f…3e', input: 'Sheet row: 2026-05-21 / English / Tejaswini',  output: '{"items":[...], "warnings":["plan_missing"]}' },
    { id: 'run-1099', agent: 'DataQuality',  model: 'claude-haiku-4-5', latencyMs: 1820, tokensIn: 4200, tokensOut: 612, costUsd: 0.0073, outcome: 'OK',     ts: '2026-05-22 07:30 IST', scopeHash: 'all',     input: 'Nightly scan: last 7 days', output: '6 flags generated (2 high, 2 medium, 2 low)' },
    { id: 'run-1098', agent: 'WeeklyConsolidation', model: 'claude-sonnet-4-6', latencyMs: 8420, tokensIn: 11240, tokensOut: 1820, costUsd: 0.062, outcome: 'OK', ts: '2026-05-22 06:04 IST', scopeHash: 'd-dsalgo', input: 'Week of 2026-05-18, dept=DS&Algo, reports=5', output: 'WeeklySummary w-dsalgo-21 draft generated (1 highlight, 3 risks)' },
    { id: 'run-1097', agent: 'WeeklyConsolidation', model: 'claude-sonnet-4-6', latencyMs: 9120, tokensIn: 13880, tokensOut: 2110, costUsd: 0.078, outcome: 'OK', ts: '2026-05-22 06:02 IST', scopeHash: 'd-fsgci',  input: 'Week of 2026-05-18, dept=FS,GenAI&CO, reports=22', output: 'WeeklySummary w-fsgci-21 draft generated' },
    { id: 'run-1096', agent: 'Escalation',   model: 'deterministic',    latencyMs: 142,   tokensIn: 0,     tokensOut: 0,   costUsd: 0,      outcome: 'OK',     ts: '2026-05-22 06:00 IST', scopeHash: 'all',     input: 'Scan: blockers > 72h, KPIs red 2w', output: '5 tasks suggested' },
    { id: 'run-1095', agent: 'CopilotQA',    model: 'claude-sonnet-4-6', latencyMs: 2310, tokensIn: 3210, tokensOut: 420, costUsd: 0.018,  outcome: 'OK',     ts: '2026-05-21 22:14 IST', scopeHash: 'NW0002526', input: 'Q: "What blockers are over 3 days old?"', output: '3 citations, confidence 0.88' },
    { id: 'run-1094', agent: 'ReportIntake', model: 'claude-haiku-4-5', latencyMs: 401,  tokensIn: 1100, tokensOut: 290, costUsd: 0.0019, outcome: 'OK',     ts: '2026-05-21 23:31 IST', scopeHash: '7a1f…3e', input: 'Sheet row: 2026-05-21 / DS&Algo / Pavan Teja', output: '{"items":[...blocker:true...]}' },
    { id: 'run-1093', agent: 'MonthlyCheckIn', model: 'claude-sonnet-4-6', latencyMs: 14200, tokensIn: 26100, tokensOut: 3400, costUsd: 0.14, outcome: 'OK', ts: '2026-05-01 07:00 IST', scopeHash: 'all', input: 'Month of April 2026', output: 'MonthlyCheckIn m-apr-26 draft + 4 carry-forward tasks' },
  ];

  // ── Activity ──────────────────────────────────────────────────────────
  const ACTIVITY = [
    { id: 'act-1', kind: 'agent',   ts: '09:08', text: 'ReportIntake parsed 7 of 8 rows from daily-reports-2026-05-22 (DS&Algo missing).', icon: '⚙' },
    { id: 'act-2', kind: 'flag',    ts: '07:30', text: 'DataQuality raised 6 new flags (2 high)', icon: '⚑' },
    { id: 'act-3', kind: 'draft',   ts: '06:04', text: 'Weekly draft generated: DS&Algo (confidence 0.62)', icon: '✎' },
    { id: 'act-4', kind: 'draft',   ts: '06:03', text: 'Weekly draft generated: DS&ML (confidence 0.78)', icon: '✎' },
    { id: 'act-5', kind: 'draft',   ts: '06:02', text: 'Weekly draft generated: Content — FS, GenAI & CO (confidence 0.84)', icon: '✎' },
    { id: 'act-6', kind: 'task',    ts: '06:00', text: 'Escalation agent suggested 5 tasks', icon: '▲' },
    { id: 'act-7', kind: 'publish', ts: 'yest',  text: 'Pavan G published Weekly: Content — Aptitude & English', icon: '↗' },
  ];

  // ── WORKLOGS (individual task entries from submit flow) ────────────────
  // Each entry is one task; users can log many per day.
  function empIdForUser(uid) {
    const ix = USERS.findIndex((u) => u.id === uid);
    return `EMP-${String(2000 + Math.max(0, ix)).padStart(4, '0')}`;
  }
  const PROFILE = {
    'NW0001771':    { stack: ['FS — Java', 'FS — Python'],          products: ['NIAT - B1', 'Academy', 'Intensive Offline'] },
    'NW0001778':      { stack: ['GenAI'],                              products: ['NIAT - B2', 'Academy'] },
    'NW0001771':       { stack: ['FS — Python', 'DS/ML'],               products: ['NxtWave'] },
    'NW0002526':    { stack: ['FS — Java', 'FS — Python'],           products: ['NxtWave'] },
    'NW0002849':      { stack: ['Aptitude'],                           products: ['Launchpad', 'Academy'] },
    'NW0001240':   { stack: ['English'],                            products: ['Launchpad', 'Academy'] },
    'NW0005433':   { stack: ['DS/ML'],                              products: ['NIAT - B2', 'Academy'] },
    'NW0002023':  { stack: ['DSA'],                                products: ['NIAT - B1', 'Academy', 'Intensive Offline'] },
  };
  const OUT_TO_TASK = {
    'Content-Assessment Alignment': 'Content Creation & Review',
    'Pedagogy Initiative': 'Learning Outcome Initiative',
    'TR-Doc': 'Content Creation & Review',
    'PPT': 'Content Creation & Review',
    'Video Session': 'Recording & Production',
    'Projects': 'Content Creation & Review',
    'Objective Content (Coding Q, MCQs)': 'Content Creation & Review',
    'Other content format': 'Content Creation & Review',
    'Branding Asset': 'Content Creation & Review',
    'Vernacular Content': 'Content Creation & Review',
    'Testing & Learning Portal Configurations': 'Process & Tooling',
    'Content Issue Resolution': 'Content Creation & Review',
    'Agentic Workflow Initiative, R&D, Tools': 'Process & Tooling',
    'Feedback & Backpropagation': 'Process & Tooling',
    'Industry Upgrade': 'Industry Review & Quality Check',
    'Stakeholder Request Fulfillment': 'Business Requests & Coordination',
    'Interviews/Offer roll-out': 'Hiring',
    'Executive Reporting': 'Reporting Analysis',
    'HR & Employee Engagement': 'Employee Engagement',
    'Upskilling & Learning hours': 'Learning Hours',
    'Performance-Goal Management': 'Assessment Analytics',
  };
  function templateFor(taskCat, ix) {
    const courses = ['Fullstack — Java', 'Fullstack — Python', 'DS&ML', 'DS&Algo', 'GenAI', 'Aptitude', 'English'];
    const modules = ['Authentication', 'Data Structures', 'API Design', 'Probability', 'RAG Lab', 'Vocabulary', 'Sorting Algorithms', 'Concurrency'];
    const topics = ['JWT refresh tokens', 'Linked Lists', 'Rate limiting', 'Bayes theorem', 'Vector DB cost', 'Idioms', 'Quicksort partition', 'Channels'];
    const workflows = ['TR Doc Generator', 'MCQ Generator', 'Industry Insight Generator', 'Video Production Pipeline', 'Hint Generator', 'Topic Validator'];
    const pick = (arr) => arr[ix % arr.length];
    switch (taskCat) {
      case 'Content Creation & Review': return { course: pick(courses), module: pick(modules), topic: pick(topics), workflow: pick(workflows), mode: ix % 3 === 0 ? 'Review' : 'Creation' };
      case 'Industry Review & Quality Check': return { course: pick(courses), workflow: pick(workflows), upgrade: ['Patchwork', 'Minor', 'Major', 'Critical'][ix % 4] };
      case 'Recording & Production': return { course: pick(courses), module: pick(modules), topic: pick(topics), workflow: pick(workflows), stage: ['Recording', 'Editing', 'Review'][ix % 3] };
      case 'Business Requests & Coordination': return { agenda: 'Q3 forecast review', items: '— Hiring gap\n— Mentor capacity', urgency: ['Patchwork', 'Minor', 'Major', 'Critical'][ix % 4] };
      case 'Process & Tooling': return { work: 'Built / refined internal tool', tool: pick(workflows), impact: String((ix % 5) + 1) };
      case 'Hiring': return { role: 'Sr. Content Engineer', status: ['Sourced', 'Screened', 'Panel', 'Offer'][ix % 4] };
      case 'Reporting Analysis': return { cadence: ix % 2 === 0 ? 'Weekly' : 'Monthly' };
      case 'Employee Engagement': return { activity: 'Friday team lunch', purpose: 'Cross-team bonding' };
      case 'Learning Hours': return { skill: 'Vector DBs · self-study', usecase: 'Apply to RAG-lab v2' };
      case 'Assessment Analytics': return { bucket: ['Skill', 'Academic', 'Interview Intelligence'][ix % 3], metric: 'Pass-rate +4pts wow' };
      case 'Learning Outcome Initiative': return { initiative: 'Adaptive problem ladder', usecase: 'DS&Algo cohort 4', impact: String((ix % 5) + 1) };
      default: return {};
    }
  }

  const WORKLOG_SEEDS = [
    // [uid, daysAgo, outputCategory, hours, status, reason?]
    // ── Today (May 22) ────────────────────────────────────────────
    ['NW0001771', 0, 'TR-Doc',                                    2.5, 'Done'],
    ['NW0001771', 0, 'Objective Content (Coding Q, MCQs)',        1.5, 'Done'],
    ['NW0001771', 0, 'Agentic Workflow Initiative, R&D, Tools',   2.0, 'In-progress'],

    ['NW0001778',   0, 'Agentic Workflow Initiative, R&D, Tools',   3.5, 'Done'],
    ['NW0001778',   0, 'Pedagogy Initiative',                       2.0, 'In-progress'],

    ['NW0001771',    0, 'Testing & Learning Portal Configurations',  4.0, 'Done'],
    ['NW0001771',    0, 'Feedback & Backpropagation',                1.5, 'Blocked', 'AWS support case open on NAT throttle (3d)'],

    ['NW0002526', 0, 'Stakeholder Request Fulfillment',           2.0, 'Done'],
    ['NW0002526', 0, 'Executive Reporting',                       1.5, 'Done'],
    ['NW0002526', 0, 'HR & Employee Engagement',                  1.0, 'Done'],

    ['NW0002849',   0, 'Objective Content (Coding Q, MCQs)',        4.0, 'Done'],
    ['NW0002849',   0, 'TR-Doc',                                    2.0, 'In-progress'],

    ['NW0005433',0, 'TR-Doc',                                    3.0, 'Done'],
    ['NW0005433',0, 'Projects',                                  2.5, 'Done'],

    // ── Yesterday (May 21) ────────────────────────────────────────
    ['NW0001771', 1, 'TR-Doc',                                    3.0, 'Done'],
    ['NW0001771', 1, 'PPT',                                       1.0, 'Done'],
    ['NW0001771', 1, 'Content Issue Resolution',                  1.5, 'Done'],

    ['NW0001778',   1, 'PPT',                                       2.5, 'Done'],
    ['NW0001778',   1, 'Video Session',                             1.5, 'Done'],

    ['NW0001771',    1, 'Testing & Learning Portal Configurations',  3.0, 'Done'],
    ['NW0001771',    1, 'Industry Upgrade',                          2.0, 'Done'],

    ['NW0002526', 1, 'Stakeholder Request Fulfillment',           3.0, 'Done'],
    ['NW0002526', 1, 'Executive Reporting',                       2.0, 'Done'],

    ['NW0002849',   1, 'Pedagogy Initiative',                       2.5, 'Done'],
    ['NW0002849',   1, 'Content-Assessment Alignment',              2.0, 'Done'],

    ['NW0001240',1, 'TR-Doc',                                    2.0, 'Done'],
    ['NW0001240',1, 'Video Session',                             1.5, 'Done'],

    ['NW0005433',1, 'Industry Upgrade',                          2.0, 'Done'],
    ['NW0005433',1, 'TR-Doc',                                    2.5, 'Done'],

    ['NW0002023',1,'Objective Content (Coding Q, MCQs)',        4.0, 'Done'],
    ['NW0002023',1,'Industry Upgrade',                          1.5, 'Blocked', 'Heap allocation Central Ops dependency'],

    // ── 2 days ago (May 20) ───────────────────────────────────────
    ['NW0001771', 2, 'TR-Doc',                                    3.0, 'Done'],
    ['NW0001771', 2, 'Content Issue Resolution',                  2.0, 'Done'],

    ['NW0001778',   2, 'Feedback & Backpropagation',                2.0, 'Done'],
    ['NW0001778',   2, 'Agentic Workflow Initiative, R&D, Tools',   3.0, 'Done'],

    ['NW0001771',    2, 'Industry Upgrade',                          2.0, 'Done'],
    ['NW0001771',    2, 'Testing & Learning Portal Configurations',  2.5, 'Done'],

    ['NW0002526', 2, 'Interviews/Offer roll-out',                 2.0, 'Done'],
    ['NW0002526', 2, 'Stakeholder Request Fulfillment',           1.5, 'Done'],

    ['NW0002849',   2, 'Content-Assessment Alignment',              3.0, 'Done'],
    ['NW0001240',2, 'Vernacular Content',                        2.5, 'Done'],

    ['NW0005433',2, 'Upskilling & Learning hours',               1.0, 'Done'],
    ['NW0005433',2, 'Projects',                                  3.0, 'Done'],

    ['NW0002023',2,'Pedagogy Initiative',                       3.0, 'In-progress'],
    ['NW0002023',2,'Industry Upgrade',                          2.0, 'Blocked', 'Heap allocation Central Ops dependency'],

    // ── 3 days ago (May 19) ───────────────────────────────────────
    ['NW0001771', 3, 'PPT',                                       2.0, 'Done'],
    ['NW0001778',   3, 'Agentic Workflow Initiative, R&D, Tools',   3.5, 'Done'],
    ['NW0001771',    3, 'Testing & Learning Portal Configurations',  4.5, 'Done'],
    ['NW0002526', 3, 'Executive Reporting',                       2.0, 'Done'],
    ['NW0002849',   3, 'Objective Content (Coding Q, MCQs)',        3.5, 'Done'],
    ['NW0005433',3, 'TR-Doc',                                    3.0, 'Done'],
    ['NW0002023',3,'TR-Doc',                                    3.5, 'Done'],

    // ── 4 days ago (May 18) ───────────────────────────────────────
    ['NW0001771', 4, 'TR-Doc',                                    2.5, 'Done'],
    ['NW0001778',   4, 'Pedagogy Initiative',                       2.0, 'Done'],
    ['NW0001771',    4, 'Industry Upgrade',                          2.5, 'Done'],
    ['NW0001240',4, 'TR-Doc',                                    2.0, 'Done'],
    ['NW0005433',4, 'Industry Upgrade',                          2.0, 'Done'],
  ];

  const WORKLOGS = WORKLOG_SEEDS.map((s, i) => {
    const [uid, days, category, hours, status, reason] = s;
    const user = USERS.find((u) => u.id === uid);
    const prof = PROFILE[uid] || { stack: [], products: [] };
    const taskCat = OUT_TO_TASK[category];
    const submittedHour = 17 + ((i * 3) % 5);
    const submittedMin = (i * 7) % 60;
    return {
      id: `wl-${1000 + i}`,
      userId: uid,
      userName: user?.name,
      userInitials: user?.initials,
      empId: empIdForUser(uid),
      dept: user?.dept,
      sub: user?.sub,
      date: fmt(daysAgo(days)),
      daysAgo: days,
      products: prof.products.slice(0, ((i % 2) + 1)),
      stacks: prof.stack.slice(0, 1),
      outputCategory: category,
      taskCategory: taskCat,
      outputCount: ['Executive Reporting', 'Stakeholder Request Fulfillment'].includes(category) ? null : Math.max(1, Math.ceil(hours * 1.5)),
      template: templateFor(taskCat, i),
      hours,
      status,
      reason: reason || null,
      submittedAt: `${String(submittedHour).padStart(2, '0')}:${String(submittedMin).padStart(2, '0')} IST`,
    };
  });

  // True if `id` is `rootId` or reports (directly/indirectly) up to `rootId`.
  function inMgmtSubtree(rootId, id) {
    if (id === rootId) return true;
    let u = USERS.find((x) => x.id === id), guard = 0;
    while (u && u.managerId && guard++ < 10) {
      if (u.managerId === rootId) return true;
      u = USERS.find((x) => x.id === u.managerId);
    }
    return false;
  }

  function filterWorklogs(userId) {
    const s = scopeForUser(userId);
    if (s.kind === 'all') return WORKLOGS;
    if (s.kind === 'dept') return WORKLOGS.filter((w) => w.dept === s.dept);
    // L2 / L1: own + everyone in their management subtree (not sub-string match,
    // so DS&ML / DS&Algo reportees show even if sub labels differ).
    if (s.kind === 'sub') return WORKLOGS.filter((w) => inMgmtSubtree(userId, w.userId));
    return [];
  }

  // ── Reporting model: one stack per person, daily→weekly→monthly rollup ──
  const SUB_TO_STACK = {
    'Content — Fullstack': 'Fullstack', 'Content — GenAI': 'GenAI', 'Central Ops': 'Central Ops',
    'Content — Aptitude': 'Aptitude', 'Content — English': 'English',
  };
  const DEPT_TO_STACK = { 'd-dsml': 'DS&ML', 'd-dsalgo': 'DS&Algo', 'd-fsgci': 'Fullstack', 'd-aptenglish': 'Aptitude' };
  function stackForUser(u) { if (!u) return 'General'; return SUB_TO_STACK[u.sub] || DEPT_TO_STACK[u.dept] || 'General'; }

  // Reporters the viewer can see who are expected to file a daily (L0/L1/L2).
  function reportersInScope(userId) {
    const s = scopeForUser(userId);
    return USERS.filter((u) => {
      if (!['L0', 'L1', 'L2'].includes(u.level)) return false;
      if (s.kind === 'all') return true;
      if (s.kind === 'dept') return u.dept === s.dept;
      if (s.kind === 'sub') return inMgmtSubtree(userId, u.id);
      return u.id === userId;
    });
  }
  function submittedOn(dayOffset) { return new Set(WORKLOGS.filter((w) => w.daysAgo === dayOffset).map((w) => w.userId)); }
  function dailyStatus(userId, dayOffset = 0) {
    const done = submittedOn(dayOffset);
    return reportersInScope(userId).map((u) => ({ user: u, stack: stackForUser(u), submitted: done.has(u.id) }));
  }
  function consolidateByCategory(worklogs) {
    const m = {};
    for (const w of worklogs) {
      const k = w.outputCategory || 'Other';
      (m[k] = m[k] || { category: k, count: 0, hours: 0, units: 0, people: new Set() });
      m[k].count++; m[k].hours += w.hours || 0; m[k].units += (w.outputCount || 0); m[k].people.add(w.userId);
    }
    return Object.values(m).map((x) => ({ ...x, people: x.people.size })).sort((a, b) => b.hours - a.hours);
  }
  function worklogsWithin(userId, days) { return filterWorklogs(userId).filter((w) => w.daysAgo <= days); }

  // ── ENGRAM (interaction memory + eval) ──────────────────────────────
  // Each row = one human review of an agent draft. action: accept | edit | reject.
  const ENGRAM = [
    {
      id: 'eng-1', traceId: 'tr-9842', agent: 'Rollup', userId: 'NW0002526',
      flow: 'weekly_consolidation', ts: '2026-05-25 09:12 IST',
      action: 'edit',
      inputRef: 'WeeklySummary draft w-fsgci-21',
      draft: 'Fullstack velocity at 14 units (target 18) — recovery trajectory still slow.',
      final: 'Fullstack velocity at 14 units (target 18). Chanakya flagged Q3 hiring as primary lever; pulling forward to next planning cycle.',
      diff: '+ Chanakya flagged Q3 hiring as primary lever; pulling forward to next planning cycle.',
      reason: 'Need to capture the lever, not just the metric.',
    },
    {
      id: 'eng-2', traceId: 'tr-9843', agent: 'Rollup', userId: 'NW0002526',
      flow: 'weekly_consolidation', ts: '2026-05-25 09:14 IST',
      action: 'edit',
      inputRef: 'WeeklySummary draft w-fsgci-21 · Risks section',
      draft: 'GenAI vector-DB cost will exceed free tier in 3 weeks.',
      final: 'GenAI vector-DB cost will exceed free tier in 3 weeks. **Ask:** approve $340/mo Pinecone paid tier before week 3.',
      diff: '+ Ask: approve $340/mo Pinecone paid tier before week 3.',
      reason: 'Always pair a risk with an explicit ask.',
    },
    {
      id: 'eng-3', traceId: 'tr-9810', agent: 'Dispatcher', userId: 'NW0001771',
      flow: 'mom_actions', ts: '2026-05-24 16:33 IST',
      action: 'edit',
      inputRef: 'MOM 2026-05-24 leadership sync · action item 3',
      draft: 'Investigate Backend reporting gap. Owner: Vijay.',
      final: 'Investigate Backend reporting gap. Owner: Pavan Teja (Backend reports to him). Due: EOW.',
      diff: '~ Owner: Vijay → Pavan Teja\n+ Due: EOW.',
      reason: 'Wrong owner inference — Dispatcher should follow manager_id, not domain.',
    },
    {
      id: 'eng-4', traceId: 'tr-9788', agent: 'Scribe', userId: 'NW0001771',
      flow: 'mom_actions', ts: '2026-05-23 18:02 IST',
      action: 'accept',
      inputRef: 'MOM 2026-05-23 platform sync',
      draft: '8 action items extracted from 47-min meeting.',
      final: '8 action items extracted from 47-min meeting.',
      diff: '(no change)',
      reason: null,
    },
    {
      id: 'eng-5', traceId: 'tr-9755', agent: 'Rollup', userId: 'NW0005433',
      flow: 'weekly_consolidation', ts: '2026-05-22 14:21 IST',
      action: 'edit',
      inputRef: 'WeeklySummary draft w-dsml-21',
      draft: 'Three new classification labs shipped (logistic, decision-tree, SVM).',
      final: 'Three new classification labs shipped (logistic, decision-tree, SVM). **Impact:** ML cohort 4 unblocked from week-6 syllabus.',
      diff: '+ Impact: ML cohort 4 unblocked from week-6 syllabus.',
      reason: 'Always state the downstream impact, not just the deliverable.',
    },
    {
      id: 'eng-6', traceId: 'tr-9740', agent: 'Rollup', userId: 'NW0002526',
      flow: 'weekly_consolidation', ts: '2026-05-22 11:47 IST',
      action: 'reject',
      inputRef: 'WeeklySummary draft w-dsalgo-21',
      draft: 'Today\'s DS&Algo report is missing — confidence in this draft is reduced (0.62).',
      final: '(rejected — regenerate after Pavan Teja submits)',
      diff: '(rejected)',
      reason: 'Don\'t generate weekly drafts with missing inputs. Wait or re-queue.',
    },
    {
      id: 'eng-7', traceId: 'tr-9701', agent: 'Concierge', userId: 'NW0002526',
      flow: 'qa', ts: '2026-05-21 22:14 IST',
      action: 'accept',
      inputRef: 'Q: What blockers are over 3 days old?',
      draft: '3 citations · confidence 0.88',
      final: '(accepted)',
      diff: '(no change)',
      reason: null,
    },
    {
      id: 'eng-8', traceId: 'tr-9688', agent: 'Dispatcher', userId: 'NW0001771',
      flow: 'mom_actions', ts: '2026-05-21 19:11 IST',
      action: 'edit',
      inputRef: 'MOM 2026-05-21 content sync · action item 5',
      draft: 'Update Aptitude problem-set difficulty curve.',
      final: 'Update Aptitude problem-set difficulty curve. **Owner:** Prudvi. **Due:** 2026-05-28.',
      diff: '+ Owner, Due',
      reason: 'Task drafts must include owner and due — Curator rule v3 says so but Dispatcher missed.',
    },
    {
      id: 'eng-9', traceId: 'tr-9601', agent: 'Rollup', userId: 'NW0002526',
      flow: 'weekly_consolidation', ts: '2026-05-19 11:30 IST',
      action: 'edit',
      inputRef: 'WeeklySummary draft w-apten-21 · Highlights',
      draft: 'English unit-completion rate +6 pts wow to 88%.',
      final: 'English unit-completion rate +6 pts wow to 88%. **Driver:** Tejaswini\'s new vocabulary track migration.',
      diff: '+ Driver: Tejaswini\'s new vocabulary track migration.',
      reason: 'Attribution matters for highlights — credit the work.',
    },
    {
      id: 'eng-10', traceId: 'tr-9544', agent: 'Sentry', userId: 'NW0002526',
      flow: 'escalation', ts: '2026-05-18 06:02 IST',
      action: 'edit',
      inputRef: 'Suggested task: NAT throttle workaround timeline',
      draft: 'P2 priority, owner Vijay.',
      final: 'P1 priority, owner Vijay. Escalate to AWS TAM if no resolution by EOW.',
      diff: '~ P2 → P1\n+ Escalate to AWS TAM if no resolution by EOW.',
      reason: 'Sentry under-prioritizes uptime issues. Rule: any KPI red >1w gets P1.',
    },
  ];

  // Eval sets generated from ENGRAM — one per agent
  const EVAL_SETS = [
    {
      id: 'es-1', agent: 'Rollup', version: 'v3.2', size: 47, createdAt: '2026-05-25',
      passRate: 0.81, prevPassRate: 0.76, trend: [0.71, 0.73, 0.75, 0.76, 0.78, 0.81],
      breakdown: { accept: 21, edit: 22, reject: 4 },
      gates: { current: 'beta', threshold: 0.85, passing: false },
    },
    {
      id: 'es-2', agent: 'Dispatcher', version: 'v2.1', size: 38, createdAt: '2026-05-25',
      passRate: 0.74, prevPassRate: 0.68, trend: [0.62, 0.65, 0.66, 0.68, 0.71, 0.74],
      breakdown: { accept: 14, edit: 22, reject: 2 },
      gates: { current: 'beta', threshold: 0.80, passing: false },
    },
    {
      id: 'es-3', agent: 'Scribe', version: 'v4.0', size: 62, createdAt: '2026-05-25',
      passRate: 0.92, prevPassRate: 0.88, trend: [0.84, 0.86, 0.87, 0.88, 0.90, 0.92],
      breakdown: { accept: 51, edit: 9, reject: 2 },
      gates: { current: 'prod', threshold: 0.85, passing: true },
    },
    {
      id: 'es-4', agent: 'Concierge', version: 'v1.5', size: 124, createdAt: '2026-05-25',
      passRate: 0.88, prevPassRate: 0.85, trend: [0.80, 0.82, 0.83, 0.85, 0.87, 0.88],
      breakdown: { accept: 102, edit: 18, reject: 4 },
      gates: { current: 'prod', threshold: 0.80, passing: true },
    },
    {
      id: 'es-5', agent: 'Sentry', version: 'v2.0', size: 31, createdAt: '2026-05-25',
      passRate: 0.78, prevPassRate: 0.81, trend: [0.85, 0.84, 0.82, 0.81, 0.80, 0.78],
      breakdown: { accept: 18, edit: 11, reject: 2 },
      gates: { current: 'prod', threshold: 0.80, passing: false },
    },
  ];

  // Curator-proposed guideline edits — Admin reviews
  const PROPOSALS = [
    {
      id: 'gp-1', agent: 'Rollup', proposedBy: 'Curator', ts: '2026-05-25 06:10 IST',
      title: 'Always pair each Risk with an explicit Ask',
      rationale: 'In the last 7 days, L2/L3 edits added an "Ask" to 6 of 8 risk items they reviewed. The pattern is consistent across departments.',
      currentRule: 'Weekly Risks section: state the risk, owner, and ETA.',
      proposedRule: 'Weekly Risks section: state the risk, owner, ETA, **and a specific Ask (resource, decision, or escalation)**.',
      evidence: ['eng-2', 'eng-3', 'eng-5'],
      state: 'pending',
    },
    {
      id: 'gp-2', agent: 'Dispatcher', proposedBy: 'Curator', ts: '2026-05-25 06:10 IST',
      title: 'Owner inference must follow manager_id, not domain match',
      rationale: 'Dispatcher matched "Backend reporting gap" to Vijay (Central Ops) based on keyword similarity, but the org tree puts Backend under Pavan Teja. Three similar errors this week.',
      currentRule: 'Match action items to people via name → role → domain keywords.',
      proposedRule: 'Match action items to people via **explicit name first, then employee.manager_id of the mentioned sub-team, then domain keywords as fallback only**.',
      evidence: ['eng-3'],
      state: 'pending',
    },
    {
      id: 'gp-3', agent: 'Rollup', proposedBy: 'Curator', ts: '2026-05-25 06:10 IST',
      title: 'Highlights must credit the driver',
      rationale: 'L2 edits consistently add attribution to highlight items. Pattern detected in 4 of 5 recent Highlights edits.',
      currentRule: 'Highlights: 1–2 sentences, factual.',
      proposedRule: 'Highlights: 1–2 sentences, factual, **and credit the person or sub-team driving the result when known**.',
      evidence: ['eng-9'],
      state: 'pending',
    },
    {
      id: 'gp-4', agent: 'Sentry', proposedBy: 'Curator', ts: '2026-05-24 06:10 IST',
      title: 'KPI red > 1 week auto-escalates to P1',
      rationale: 'Sentry suggested P2 for the NAT-throttle task; Pavan G overrode to P1 with the rule "any KPI red > 1w gets P1". Same override pattern seen twice in May.',
      currentRule: 'Suggested-task priority = severity × reach.',
      proposedRule: 'Suggested-task priority = severity × reach, **with a floor of P1 if the linked KPI has been red for > 7 days**.',
      evidence: ['eng-10'],
      state: 'approved',
      decidedBy: 'NW0005116', decidedAt: '2026-05-24 14:22 IST',
    },
    {
      id: 'gp-5', agent: 'Rollup', proposedBy: 'Curator', ts: '2026-05-22 06:10 IST',
      title: 'Skip draft generation if input set is incomplete',
      rationale: 'Rejected drafts for missing-input weeks waste tokens and trigger false-confidence flags. Pavan G rejected w-dsalgo-21 explicitly for this reason.',
      currentRule: 'Generate weekly draft every Monday 06:00 regardless of input completeness.',
      proposedRule: 'Generate weekly draft when **≥ 80% of expected daily reports are present**; else queue with note.',
      evidence: ['eng-6'],
      state: 'pending',
    },
  ];

  function filterEngram(userId) {
    const s = scopeForUser(userId);
    if (s.kind === 'all') return ENGRAM;
    if (s.kind === 'dept') return ENGRAM.filter((e) => {
      const u = USERS.find((u) => u.id === e.userId);
      return !u || u.dept === s.dept;
    });
    if (s.kind === 'sub') return ENGRAM.filter((e) => e.userId === userId);
    return [];
  }

  // ── AGENT FARM (team-built agents) ──────────────────────────────────
  // Different from "system agents" — these are tools the team built themselves.
  const FARM_AGENTS = [
    {
      id: 'fa-1', name: 'TR-Doc Generator', owner: 'NW0001771',
      description: 'Generates Technical Reference doc skeletons from a topic outline. Cuts content-creation time by ~40%.',
      level: 'L1', scope: 'sub', deployUrl: 'https://relay.nxtwave.io/agents/tr-doc',
      health: 'ok', tags: ['content', 'fullstack'],
      stack: 'Claude Sonnet · LangGraph',
      usage: { period: 'May 2026', unitsProcessed: 47, agentTime: 14.5 },
      gains: { baselineHrsPerUnit: 1.5, agentHrsPerUnit: 0.6, hoursSaved: 42.3 },
      createdAt: '2026-04-12',
    },
    {
      id: 'fa-2', name: 'MCQ Generator', owner: 'NW0002849',
      description: 'Generates objective questions (MCQ + coding-style) from a topic + difficulty curve.',
      level: 'L2', scope: 'sub', deployUrl: 'https://relay.nxtwave.io/agents/mcq-gen',
      health: 'ok', tags: ['content', 'aptitude'],
      stack: 'Claude Haiku · routed via gateway',
      usage: { period: 'May 2026', unitsProcessed: 312, agentTime: 22.0 },
      gains: { baselineHrsPerUnit: 0.4, agentHrsPerUnit: 0.07, hoursSaved: 103.0 },
      createdAt: '2026-03-08',
    },
    {
      id: 'fa-3', name: 'Industry Insight Generator', owner: 'NW0001771',
      description: 'Scrapes industry news, distills 5 weekly insights per stack, drafts an internal newsletter.',
      level: 'L2', scope: 'dept', deployUrl: 'https://relay.nxtwave.io/agents/insight',
      health: 'warning', tags: ['research', 'industry'],
      stack: 'Sonnet + Perplexity API',
      usage: { period: 'May 2026', unitsProcessed: 18, agentTime: 9.0 },
      gains: { baselineHrsPerUnit: 2.0, agentHrsPerUnit: 0.5, hoursSaved: 27.0 },
      createdAt: '2026-02-22',
      note: 'Perplexity rate-limit at 80% this month.',
    },
    {
      id: 'fa-4', name: 'Video Production Pipeline', owner: 'NW0001778',
      description: 'Drafts video scripts from a topic, generates captions, queues for the recording slot.',
      level: 'L1', scope: 'sub', deployUrl: 'https://relay.nxtwave.io/agents/video',
      health: 'ok', tags: ['content', 'video'],
      stack: 'Sonnet + Whisper',
      usage: { period: 'May 2026', unitsProcessed: 24, agentTime: 7.2 },
      gains: { baselineHrsPerUnit: 1.2, agentHrsPerUnit: 0.3, hoursSaved: 21.6 },
      createdAt: '2026-04-30',
    },
    {
      id: 'fa-5', name: 'Hint Generator', owner: 'NW0002023',
      description: 'Generates progressive hints for DS&Algo problems. Hint quality auto-evaluated against rubric.',
      level: 'L0', scope: 'sub', deployUrl: 'https://relay.nxtwave.io/agents/hint',
      health: 'ok', tags: ['ds-algo', 'pedagogy'],
      stack: 'Haiku · DSPy-optimized',
      usage: { period: 'May 2026', unitsProcessed: 188, agentTime: 6.3 },
      gains: { baselineHrsPerUnit: 0.25, agentHrsPerUnit: 0.033, hoursSaved: 40.7 },
      createdAt: '2026-01-15',
    },
    {
      id: 'fa-6', name: 'Topic Validator', owner: 'NW0005433',
      description: 'Cross-checks new curriculum topics against industry job postings to validate relevance.',
      level: 'L1', scope: 'dept', deployUrl: 'https://relay.nxtwave.io/agents/validator',
      health: 'ok', tags: ['research', 'ds-ml'],
      stack: 'Sonnet + LinkedIn scrape',
      usage: { period: 'May 2026', unitsProcessed: 32, agentTime: 4.8 },
      gains: { baselineHrsPerUnit: 1.0, agentHrsPerUnit: 0.15, hoursSaved: 27.2 },
      createdAt: '2026-03-19',
    },
    {
      id: 'fa-7', name: 'Stakeholder Brief Composer', owner: 'NW0002526',
      description: 'Composes a brief from Slack threads + meeting MOMs for any stakeholder ask.',
      level: 'L1', scope: 'dept', deployUrl: 'https://relay.nxtwave.io/agents/brief',
      health: 'ok', tags: ['ops', 'central'],
      stack: 'Sonnet · LangGraph',
      usage: { period: 'May 2026', unitsProcessed: 14, agentTime: 3.5 },
      gains: { baselineHrsPerUnit: 1.5, agentHrsPerUnit: 0.25, hoursSaved: 17.5 },
      createdAt: '2026-04-04',
    },
    {
      id: 'fa-8', name: 'Vernacular Translator', owner: 'NW0001240',
      description: 'Translates English curriculum content into Hindi & Telugu with pedagogical preservation.',
      level: 'L0', scope: 'sub', deployUrl: 'https://relay.nxtwave.io/agents/vernacular',
      health: 'idle', tags: ['content', 'english', 'i18n'],
      stack: 'Sonnet',
      usage: { period: 'May 2026', unitsProcessed: 6, agentTime: 2.4 },
      gains: { baselineHrsPerUnit: 2.5, agentHrsPerUnit: 0.4, hoursSaved: 12.6 },
      createdAt: '2026-05-12',
    },
  ];

  // ── Update window export ──────────────────────────────────────────────
  // (appended below)

  // ── RELAY AGENT ROSTER (13 agents replacing the previous 6) ───────────
  const RELAY_AGENTS = [
    { id: 'r-scribe',        name: 'Scribe',        job: 'Extract action items from a MOM',                          trigger: 'New MOM uploaded',     autonomy: 'L0', owner: 'NW0005116',      health: 'ok',      lastRun: '2026-05-26 11:14 IST', costPerRun: 0.024, runsToday: 7,  model: 'claude-sonnet-4-6' },
    { id: 'r-dispatcher',    name: 'Dispatcher',    job: 'Match items to people, draft tasks',                       trigger: 'After Scribe',         autonomy: 'L1', owner: 'NW0005116',      health: 'warning', lastRun: '2026-05-26 11:15 IST', costPerRun: 0.012, runsToday: 7,  model: 'claude-haiku-4-5', note: 'Owner inference accuracy below threshold this week.' },
    { id: 'r-cartographer',  name: 'Cartographer',  job: 'Build & maintain the memory graph',                        trigger: 'After Scribe + nightly', autonomy: 'L2', owner: 'NW0005116',      health: 'ok',      lastRun: '2026-05-26 02:00 IST', costPerRun: 0.008, runsToday: 12, model: 'claude-haiku-4-5' },
    { id: 'r-concierge',     name: 'Concierge',     job: 'Chat — how-to, feedback, Second Brain query',              trigger: 'User opens chat',      autonomy: 'L2', owner: 'NW0005116',      health: 'ok',      lastRun: '2026-05-26 11:32 IST', costPerRun: 0.018, runsToday: 43, model: 'claude-sonnet-4-6' },
    { id: 'r-nudge',         name: 'Nudge',         job: 'Chase missing daily reports via Teams',                     trigger: 'Daily 22:00 + Admin manual', autonomy: 'L2', owner: 'NW0006025', health: 'ok',      lastRun: '2026-05-25 22:00 IST', costPerRun: 0.0014, runsToday: 1,  model: 'claude-haiku-4-5' },
    { id: 'r-rollup',        name: 'Rollup',        job: 'Derive weekly reports',                                     trigger: 'Mon 06:00 IST',        autonomy: 'L1', owner: 'NW0005116',      health: 'warning', lastRun: '2026-05-25 06:02 IST', costPerRun: 0.078, runsToday: 0,  model: 'claude-sonnet-4-6', note: 'DS&Algo confidence 0.62 — flagged.' },
    { id: 'r-ledger',        name: 'Ledger',        job: 'Compile monthly worklogs',                                  trigger: '1st of month 07:00',   autonomy: 'L0', owner: 'NW0005116',      health: 'idle',    lastRun: '2026-05-01 07:00 IST', costPerRun: 0.14,  runsToday: 0,  model: 'claude-sonnet-4-6' },
    { id: 'r-bursar',        name: 'Bursar',        job: 'Pull tool spend, parse invoices, attribute cost',           trigger: 'Daily 04:00 + invoice', autonomy: 'L2', owner: 'NW0005116',      health: 'ok',      lastRun: '2026-05-26 04:01 IST', costPerRun: 0.003, runsToday: 1,  model: 'claude-haiku-4-5' },
    { id: 'r-curator',       name: 'Curator',       job: 'Cluster Engram corrections, propose guideline edits',       trigger: 'Weekly Sun 22:00',     autonomy: 'L0', owner: 'NW0005116',      health: 'ok',      lastRun: '2026-05-24 22:00 IST', costPerRun: 0.062, runsToday: 0,  model: 'claude-sonnet-4-6' },
    { id: 'r-sentry',        name: 'Sentry',        job: 'Surface blocked + overdue tasks',                           trigger: 'Continuous (5-min)',   autonomy: 'L2', owner: 'NW0005116',      health: 'ok',      lastRun: '2026-05-26 11:30 IST', costPerRun: 0,     runsToday: 288, model: 'deterministic' },
    { id: 'r-quartermaster', name: 'Quartermaster', job: 'Draft Agent Farm cards, flag dead links',                   trigger: 'On register + weekly', autonomy: 'L0', owner: 'NW0005116',      health: 'ok',      lastRun: '2026-05-25 09:15 IST', costPerRun: 0.011, runsToday: 0,  model: 'claude-haiku-4-5' },
    { id: 'r-meter',         name: 'Meter',         job: 'Log tokens + cost per LLM call',                            trigger: 'Every LLM call',       autonomy: 'sys',owner: 'NW0005116',      health: 'ok',      lastRun: '2026-05-26 11:32 IST', costPerRun: 0,     runsToday: 412, model: 'service' },
    { id: 'r-briefer',       name: 'Briefer',       job: 'Compile monthly check-in brief per L2',                     trigger: '1st of month',         autonomy: 'L0', owner: 'NW0005116',      health: 'idle',    lastRun: '2026-05-01 08:00 IST', costPerRun: 0.085, runsToday: 0,  model: 'claude-sonnet-4-6' },
  ];

  // ── MOMs + Action Items (meeting memory loop) ─────────────────────────
  const MOMS = [
    {
      id: 'mom-1', title: 'Content Leadership Sync — Q3 Hiring',
      attendees: ['NW0002526', 'NW0001771', 'NW0001778', 'NW0001771', 'NW0002849', 'NW0001240'],
      date: '2026-05-25', duration: 47, channel: 'Teams · Content Leadership',
      source: 'Teams transcript', scribeRun: 'run-1214',
      summary: 'Reviewed Q3 hiring forecast. Aligned on +6 mentors for DS&ML cohort 4. Discussed mentor capacity ratio gap (1:48 actual vs 1:35 planned). Decided to bring Q3 hiring forward to next planning cycle.',
      actionItems: [
        { id: 'ai-1', text: 'Submit Q3 hiring forecast bump (+6 mentors) for approval', owner: 'NW0002526', due: '2026-05-29', confidence: 0.94, status: 'pending_review' },
        { id: 'ai-2', text: 'Investigate mentor capacity ratio drift', owner: 'NW0005433', due: '2026-06-02', confidence: 0.88, status: 'approved' },
        { id: 'ai-3', text: 'Draft 1:35 capacity recovery plan', owner: 'NW0002023', due: '2026-06-05', confidence: 0.71, status: 'pending_review' },
      ],
    },
    {
      id: 'mom-2', title: 'Platform Sync — NAT throttle + dashboard flicker',
      attendees: ['NW0001771', 'NW0002526', 'NW0002526'],
      date: '2026-05-24', duration: 28, channel: 'Teams · Platform',
      source: 'Teams transcript', scribeRun: 'run-1199',
      summary: 'AWS NAT throttle still under TAM investigation. Safari dashboard flicker hotfix shipped. Discussed escalation timeline.',
      actionItems: [
        { id: 'ai-4', text: 'Escalate NAT throttle to AWS TAM if no resolution by 2026-05-29', owner: 'NW0001771', due: '2026-05-29', confidence: 0.92, status: 'approved' },
        { id: 'ai-5', text: 'Document Safari hotfix in Codex', owner: 'NW0001771', due: '2026-05-27', confidence: 0.95, status: 'approved' },
      ],
    },
  ];

  // ── Inline weekly-draft comments (for the new matrix-style weekly view) ─
  const WEEKLY_COMMENTS = [
    { id: 'wc-1', weeklyId: 'w-fsgci-21', itemPath: 'Highlights:0', author: 'NW0002526', ts: '2026-05-26 10:14 IST',
      text: 'Add the lever — Chanakya flagged Q3 hiring as the unlock. Update for next time.' },
    { id: 'wc-2', weeklyId: 'w-fsgci-21', itemPath: 'Risks:0', author: 'NW0002526', ts: '2026-05-26 10:16 IST',
      text: 'Always pair a risk with a specific ask.' },
    { id: 'wc-3', weeklyId: 'w-dsalgo-21', itemPath: 'Risks:2', author: 'NW0002526', ts: '2026-05-26 10:21 IST',
      text: 'Don\'t auto-generate when input is missing. Re-queue instead.' },
  ];

  // ── Tool Expense Ledger (Bursar's data) ────────────────────────────────
  const EXPENSE = {
    monthlyBudgetUsd: 30000,
    byTool: [
      { id: 't-openrouter', tool: 'OpenRouter API', mtdUsd: 6420.50, lastMonth: 5240, share: 0.42 },
      { id: 't-anthropic',  tool: 'Anthropic Team',  mtdUsd: 4180.00, lastMonth: 3960, share: 0.28 },
      { id: 't-perplexity', tool: 'Perplexity Pro',  mtdUsd: 1620.00, lastMonth: 1480, share: 0.10 },
      { id: 't-openai',     tool: 'OpenAI Team',     mtdUsd: 1240.00, lastMonth: 1180, share: 0.08 },
      { id: 't-pinecone',   tool: 'Pinecone',        mtdUsd: 980.00,  lastMonth: 720,  share: 0.06 },
      { id: 't-whisper',    tool: 'Whisper API',     mtdUsd: 420.00,  lastMonth: 380,  share: 0.03 },
      { id: 't-misc',       tool: 'Other tooling',   mtdUsd: 480.00,  lastMonth: 360,  share: 0.03 },
    ],
    byPerson: [
      { userId: 'NW0001778',     mtdUsd: 3210.00, tokens: 14_200_000, anomaly: false },
      { userId: 'NW0001771',      mtdUsd: 2870.00, tokens: 11_800_000, anomaly: true, anomalyNote: '+38% wow — Insight Generator rate-limited Perplexity' },
      { userId: 'NW0001771',   mtdUsd: 2410.00, tokens: 10_400_000, anomaly: false },
      { userId: 'NW0005433',  mtdUsd: 2010.00, tokens: 8_900_000,  anomaly: false },
      { userId: 'NW0002849',     mtdUsd: 1640.00, tokens: 7_100_000,  anomaly: false },
      { userId: 'NW0002023', mtdUsd: 1480.00, tokens: 6_300_000,  anomaly: false },
      { userId: 'NW0001240',  mtdUsd: 870.00,  tokens: 3_700_000,  anomaly: false },
      { userId: 'NW0002526',   mtdUsd: 720.00,  tokens: 3_100_000,  anomaly: false },
      { userId: 'NW0006025',  mtdUsd: 660.00,  tokens: 2_800_000,  anomaly: false },
      { userId: 'NW0002526',    mtdUsd: 480.00,  tokens: 1_900_000,  anomaly: false },
      { userId: 'NW0005116',      mtdUsd: 410.00,  tokens: 1_700_000,  anomaly: false },
      { userId: 'NW0003056',      mtdUsd: 380.00,  tokens: 1_600_000,  anomaly: false },
      { userId: 'NW0003057',      mtdUsd: 220.00,  tokens: 900_000,    anomaly: false },
    ],
    monthlyTrend: [
      { month: 'Dec 25', usd: 8420 },
      { month: 'Jan 26', usd: 9810 },
      { month: 'Feb 26', usd: 11200 },
      { month: 'Mar 26', usd: 12640 },
      { month: 'Apr 26', usd: 13360 },
      { month: 'May 26 (mtd)', usd: 15340 },
    ],
  };

  // ── Codex content: Workflows + Guidelines ─────────────────────────────
  const CODEX_WORKFLOWS = [
    { id: 'wf-daily',   name: 'Daily report flow',     trigger: '17:00 IST + 22:00 nudge', agents: ['Nudge', 'Concierge', 'Scribe (form)'], outputs: ['daily_reports'], version: 'v4' },
    { id: 'wf-weekly',  name: 'Weekly rollup flow',    trigger: 'Mon 06:00 IST',           agents: ['Rollup'],                                outputs: ['weekly_reports'], version: 'v3' },
    { id: 'wf-monthly', name: 'Monthly worklog flow',  trigger: '1st of month',            agents: ['Ledger', 'Briefer'],                     outputs: ['monthly_worklogs', 'checkin_briefs'], version: 'v2' },
    { id: 'wf-mom',     name: 'MOM → tasks flow',      trigger: 'New MOM uploaded',        agents: ['Scribe', 'Dispatcher', 'Cartographer'],  outputs: ['action_items', 'tasks', 'graph_nodes'], version: 'v4',
      steps: [
        { n: 1, title: 'Upload meeting transcript',   detail: 'Paste, or upload a .vtt / .txt file. Scribe extracts action items with task description, owner, and due date.', done: true },
        { n: 2, title: 'Review generated action items', detail: 'Each item shows three options: Approve / Reject / Edit.', done: true },
        { n: 3, title: 'Approve',                     detail: "Creates a task and adds it to the owner's task dashboard with status Backlog.", done: true },
        { n: 4, title: 'Reject',                      detail: 'Removes the item from the final task list and stores a rejection note.', done: true },
        { n: 5, title: 'Edit',                        detail: 'Edit task description, owner (L3 / Admin), and due date.', done: true },
        { n: 6, title: 'Save edited action item',     detail: 'Stores the final version plus what changed (owner / text / due) and by whom, as an Engram interaction.', done: true },
        { n: 7, title: 'Mark task as Blocked',        detail: 'Sends a notification to the uploader and the owner’s reporting hierarchy.', done: true },
        { n: 8, title: 'Cartographer — link to graph', detail: 'Link committed items to knowledge-graph nodes.', done: false },
      ] },
    { id: 'wf-nudge',   name: 'Missing-report nudge',  trigger: 'Daily 22:00 IST',         agents: ['Nudge'],                                 outputs: ['notifications'], version: 'v2' },
    { id: 'wf-expense', name: 'Tool expense flow',     trigger: 'Daily 04:00 + invoice',   agents: ['Bursar', 'Meter'],                       outputs: ['cost_ledger', 'anomaly_flags'], version: 'v1' },
    { id: 'wf-eval',    name: 'Eval-gated promotion',  trigger: 'Guideline approved',      agents: ['(no LLM — runner)'],                     outputs: ['eval_sets', 'promotion_decisions'], version: 'v2' },
    { id: 'wf-guide',   name: 'Guideline evolution',   trigger: 'Weekly Sun 22:00',        agents: ['Curator'],                               outputs: ['guideline_proposals'], version: 'v3' },
  ];

  const CODEX_GUIDELINES = [
    { id: 'gl-daily', name: 'Daily Report SOP', version: 'v6', updated: '2026-05-24', updatedBy: 'NW0005116', source: 'Curator proposal gp-4',
      summary: 'Every reporter logs by 22:00 IST with Product-Audience, Stack, Output Category, Course/Module/Topic, Hours, Status, Agent workflow used.' },
    { id: 'gl-weekly', name: 'Weekly Report Guidelines', version: 'v4', updated: '2026-05-24', updatedBy: 'NW0005116', source: 'Curator proposal gp-1',
      summary: 'Structure by Product-Audience × Output × Stack matrix. Risks always paired with an explicit Ask. Highlights credit the driver. Generate only when ≥80% of inputs present.' },
    { id: 'gl-task', name: 'Task Format Guidelines', version: 'v3', updated: '2026-05-22', updatedBy: 'NW0002526', source: 'Manual edit',
      summary: 'Every task has owner, due date, source (mom/manual/derived/ticket/checkin). No priority field — status only (In-Progress/Done/Blocked/Overdue).' },
    { id: 'gl-metric', name: 'Metric Map', version: 'v2', updated: '2026-05-18', updatedBy: 'NW0005116', source: 'Manual edit',
      summary: 'Output Category → Task Category → Activity Category → Metric Category. Used by Dispatcher to bucket items and by Ledger to compute monthly worklog rollups.' },
    { id: 'gl-econ', name: 'Unit Economics', version: 'v1', updated: '2026-05-12', updatedBy: 'NW0005116', source: 'Manual edit',
      summary: 'Baseline hours-per-unit by output category. Drives Agentic Gains math. Reviewed monthly.' },
  ];

  // ── Back-compat alias: REPORT_AUTHORS is used by old code that looked up
  // by author id; in v2 authors are users, so resolve via USERS too. ─────
  const REPORT_AUTHORS = USERS;

  // ── Helpers ────────────────────────────────────────────────────────────
  function scopeForUser(userId) {
    const u = USERS.find((x) => x.id === userId);
    if (!u) return { kind: 'none' };
    const r = u.role;
    // Admin sees all
    if (r === 'ADMIN') return { kind: 'all' };
    // L3 / legacy Product Owner sees all departments
    if (r === 'L3' || r === 'PRODUCT_OWNER') return { kind: 'all' };
    // Central Ops cross-team
    if (r === 'CENTRAL_OPS' || u.crossDept) return { kind: 'all' };
    // L2 sees their dept + sub-team
    if (r === 'L2' || r === 'DEPARTMENT_LEAD' || r === 'SUB_LEAD') return u.sub ? { kind: 'sub', dept: u.dept, sub: u.sub } : { kind: 'dept', dept: u.dept };
    // L1 / L0 see their sub-team
    if (r === 'L1' || r === 'L0' || r === 'TEAM_MEMBER') return { kind: 'sub', dept: u.dept, sub: u.sub };
    return { kind: 'none' };
  }

  function filterDepartments(userId) {
    const s = scopeForUser(userId);
    if (s.kind === 'all') return DEPARTMENTS;
    if (s.kind === 'dept') return DEPARTMENTS.filter((d) => d.id === s.dept);
    if (s.kind === 'sub') return DEPARTMENTS.filter((d) => d.id === s.dept);
    return [];
  }
  function filterReports(userId) {
    const s = scopeForUser(userId);
    if (s.kind === 'all') return REPORTS;
    if (s.kind === 'dept') return REPORTS.filter((r) => r.dept === s.dept);
    if (s.kind === 'sub') return REPORTS.filter((r) => r.dept === s.dept && r.sub === s.sub);
    return [];
  }
  function filterKpis(userId) {
    const s = scopeForUser(userId);
    if (s.kind === 'all') return KPIS;
    if (s.kind === 'dept') return KPIS.filter((k) => k.dept === s.dept);
    if (s.kind === 'sub') return KPIS.filter((k) => k.dept === s.dept);
    return [];
  }
  function filterTasks(userId) {
    const s = scopeForUser(userId);
    if (s.kind === 'all') return TASKS;            // L3 / Admin: whole org (all L2s and below)
    if (s.kind === 'dept') return TASKS.filter((t) => t.dept === s.dept);
    if (s.kind === 'sub') {
      // L2 / L1: own tasks + everyone in their management subtree (their reports).
      const inSubtree = (ownerId) => {
        if (ownerId === userId) return true;
        let u = USERS.find((x) => x.id === ownerId), guard = 0;
        while (u && u.managerId && guard++ < 10) {
          if (u.managerId === userId) return true;
          u = USERS.find((x) => x.id === u.managerId);
        }
        return false;
      };
      return TASKS.filter((t) => inSubtree(t.owner));
    }
    return [];
  }
  function filterFlags(userId) {
    const s = scopeForUser(userId);
    if (s.kind === 'all') return FLAGS;
    if (s.kind === 'dept') return FLAGS.filter((f) => !f.target.dept || f.target.dept === s.dept);
    if (s.kind === 'sub') return FLAGS.filter((f) => !f.target.dept || f.target.dept === s.dept);
    return [];
  }
  function filterWeekly(userId) {
    const s = scopeForUser(userId);
    if (s.kind === 'all') return WEEKLY;
    if (s.kind === 'dept' || s.kind === 'sub') return WEEKLY.filter((w) => w.dept === s.dept);
    return [];
  }

  const lookup = {
    report: (id) => REPORTS.find((r) => r.id === id),
    author: (id) => USERS.find((u) => u.id === id),
    kpi: (id) => KPIS.find((k) => k.id === id),
    dept: (id) => DEPARTMENTS.find((d) => d.id === id),
    task: (id) => TASKS.find((t) => t.id === id),
    flag: (id) => FLAGS.find((f) => f.id === id),
    user: (id) => USERS.find((u) => u.id === id),
  };

  // ── Start empty: no hardcoded sample data. Only real submitted/entered data
  //    should appear. Org + system reference (employees, departments, agents,
  //    Codex, guidelines, knowledge) is kept; everything operational is cleared.
  [REPORTS, WORKLOGS, TASKS, FLAGS, WEEKLY, WEEKLY_COMMENTS, ENGRAM, EVAL_SETS,
   PROPOSALS, MOMS, AI_RUNS, ACTIVITY, FARM_AGENTS, KPIS].forEach((a) => { if (Array.isArray(a)) a.length = 0; });
  for (const k of Object.keys(DEPT_HEALTH)) delete DEPT_HEALTH[k];
  if (EXPENSE) { EXPENSE.byTool = []; EXPENSE.byPerson = []; EXPENSE.monthlyTrend = []; }

  // ── Task catalog (authoritative, from CD "Task flow" sheet) ─────────────
  // Shared by the end-of-day SubmitView and the manual Create-Task form.
  const PRODUCTS = [
    'NIAT - B1', 'NIAT - B2', 'NIAT - B3', 'NIAT - B4', 'NIAT - B5',
    'Academy 1.0', 'Academy 1.5', 'Academy 2.0',
    'Intensive Offline', 'LaunchPad',
    'NIAT-GRIT', 'NIAT-MINT',
    'Academy-AI Fullstack Project',
    'NxtWave- Agentic Workflow/Services',
  ];

  const STACKS = [
    'FS - Java', 'FS - Python', 'FS - MERN',
    'DS/ML', 'DSA', 'GenAI', 'English', 'Aptitude',
  ];

  // Output Category → { task, activity, metric } (auto-derived columns).
  // Mirrors the v.11 mapping table exactly. task = TASK_TEMPLATES key.
  const OUTPUT_MAP = {
    'Content-Assessment Alignment': { task: 'Assessment Analytics', activity: 'Initiatives / Upgrades', metric: 'Business Impact' },
    'Pedagogy Initiative': { task: 'Learning Outcome Initiative', activity: 'Initiatives / Upgrades', metric: 'Content Effectiveness' },
    'TR-Doc': { task: 'Content Creation & Review', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'PPT': { task: 'Content Creation & Review', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'Projects': { task: 'Content Creation & Review', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'Objective Content (Coding question, MCQs)': { task: 'Content Creation & Review', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'Other content format': { task: 'Content Creation & Review', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'Branding Asset': { task: 'Content Creation & Review', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'Issue Resolution': { task: 'Content Creation & Review', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'Vernacular Content': { task: 'Content Creation & Review', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'Testing & Learning Portal Configurations': { task: 'Content Creation & Review', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'Video Session': { task: 'Recording & Production', activity: 'Planned Content Creation', metric: 'Content Velocity' },
    'Agentic Workflow Initiative, R&D, Tools': { task: 'Process & Tooling', activity: 'Initiatives / Upgrades', metric: 'Content Efficiency' },
    'Feedback & Backpropagation': { task: 'Process & Tooling', activity: 'Initiatives / Upgrades', metric: 'Content Efficiency' },
    'Industry Upgrade': { task: 'Industry Review & Quality Check', activity: 'Initiatives / Upgrades', metric: 'Content Relevance' },
    'Stakeholder Request Fulfillment': { task: 'Business Requests & Coordination', activity: 'Executive Ops', metric: 'Stakeholder Alignment' },
    'Interviews/Offer roll-out': { task: 'Hiring', activity: 'Hiring & Developing the best', metric: 'Executive Ops' },
    'Executive Reporting': { task: 'Reporting Analysis', activity: 'Executive Ops', metric: 'Executive Ops' },
    'Performance-Goal Management': { task: 'Reporting Analysis', activity: 'Executive Ops', metric: 'Executive Ops' },
    'HR & Employee Engagement': { task: 'Employee Engagement', activity: 'Executive Ops', metric: 'Executive Ops' },
    'Upskilling & Learning hours': { task: 'Learning Hours', activity: 'Hiring & Developing the best', metric: 'Executive Ops' },
  };

  const OUTPUT_CATEGORIES = Object.keys(OUTPUT_MAP);

  // Output count not applicable when metric is Executive Ops or Business Impact.
  const COUNT_NA = new Set(
    OUTPUT_CATEGORIES.filter((c) => ['Executive Ops', 'Business Impact'].includes(OUTPUT_MAP[c].metric))
  );

  const STATUSES = ['In-progress', 'Done', 'Blocked', 'Overdue', 'Backlog'];

  // Fill-in-the-blanks template per task category.
  const TASK_TEMPLATES = {
    'Content Creation & Review': [
      { id: 'course', label: 'Course', type: 'text', ph: 'e.g. Fullstack — Java' },
      { id: 'module', label: 'Module', type: 'text', ph: 'e.g. Authentication' },
      { id: 'topic', label: 'Topic', type: 'text', ph: 'e.g. JWT refresh tokens' },
      { id: 'workflow', label: 'Agentic workflow used', type: 'text', ph: 'e.g. TR Doc Generator' },
      { id: 'mode', label: 'Mode', type: 'choice', options: ['Creation', 'Review'] },
    ],
    'Industry Review & Quality Check': [
      { id: 'course', label: 'Course', type: 'text', ph: 'e.g. DS&Algo' },
      { id: 'workflow', label: 'Agentic workflow used', type: 'text', ph: 'e.g. Industry Insight Generator' },
      { id: 'upgrade', label: 'Upgrade scale', type: 'choice', options: ['Patchwork', 'Minor', 'Major', 'Critical'] },
    ],
    'Recording & Production': [
      { id: 'course', label: 'Course', type: 'text', ph: 'e.g. Aptitude' },
      { id: 'module', label: 'Module', type: 'text', ph: 'e.g. Probability' },
      { id: 'topic', label: 'Topic', type: 'text', ph: 'e.g. Bayes theorem' },
      { id: 'workflow', label: 'Agentic workflow used', type: 'text', ph: 'e.g. Video Production Pipeline' },
      { id: 'stage', label: 'Stage', type: 'choice', options: ['Recording', 'Editing', 'Review'] },
    ],
    'Business Requests & Coordination': [
      { id: 'agenda', label: 'Agenda', type: 'text', ph: 'e.g. Q3 hiring forecast review' },
      { id: 'items', label: 'Priority action items', type: 'textarea', ph: 'One per line…' },
      { id: 'urgency', label: 'Urgency', type: 'choice', options: ['Patchwork', 'Minor', 'Major', 'Critical'] },
    ],
    'Process & Tooling': [
      { id: 'work', label: 'Work / feedback description', type: 'textarea', ph: 'What you built / what feedback you resolved…' },
      { id: 'tool', label: 'Tool used', type: 'text', ph: 'e.g. Claude Code' },
      { id: 'impact', label: 'Impact (0–5)', type: 'choice', options: ['0', '1', '2', '3', '4', '5'], hint: 'Only if Agentic Workflow / R&D / Tools output category' },
    ],
    'Hiring': [
      { id: 'role', label: 'Role name', type: 'text', ph: 'e.g. Sr Content Engineer — DS&ML' },
      { id: 'status', label: 'Interview status', type: 'choice', options: ['Sourced', 'Screened', 'Panel', 'Offer', 'Joined', 'Dropped'] },
    ],
    'Reporting Analysis': [
      { id: 'cadence', label: 'Reporting cadence', type: 'choice', options: ['Weekly', 'Monthly'] },
    ],
    'Employee Engagement': [
      { id: 'activity', label: 'Activity name', type: 'text', ph: 'e.g. Friday team lunch' },
      { id: 'purpose', label: 'Purpose', type: 'text', ph: 'e.g. Cross-team bonding' },
    ],
    'Learning Hours': [
      { id: 'skill', label: 'Skill / 1-on-1 / impact', type: 'text', ph: 'e.g. Vector DBs · self-study' },
      { id: 'usecase', label: 'Use-case / agenda', type: 'text', ph: 'e.g. Applying to RAG-lab v2' },
    ],
    'Assessment Analytics': [
      { id: 'bucket', label: 'Assessment bucket', type: 'choice', options: ['Skill', 'Academic', 'Interview Intelligence'] },
      { id: 'metric', label: 'Analysis metric / delta', type: 'text', ph: 'e.g. Pass-rate +4pts wow' },
    ],
    'Learning Outcome Initiative': [
      { id: 'initiative', label: 'Initiative name', type: 'text', ph: 'e.g. Adaptive problem ladder' },
      { id: 'usecase', label: 'Use-case', type: 'text', ph: 'e.g. DS&Algo cohort 4' },
      { id: 'impact', label: 'Impact (0–5)', type: 'choice', options: ['0', '1', '2', '3', '4', '5'] },
    ],
  };

  const TASK_CATALOG = { PRODUCTS, STACKS, OUTPUT_MAP, OUTPUT_CATEGORIES, COUNT_NA, STATUSES, TASK_TEMPLATES };

  window.CDC = {
    today, fmt, daysAgo,
    ROLES, USERS,
    TASK_CATALOG,
    BUSINESS_DIRECTIONS, DEPARTMENTS, DEPT_HEALTH,
    KPIS, REPORTS, REPORT_AUTHORS, TASKS, FLAGS, WEEKLY, AI_RUNS, ACTIVITY,
    WORKLOGS, empIdForUser,
    ENGRAM, EVAL_SETS, PROPOSALS, FARM_AGENTS,
    RELAY_AGENTS, MOMS, WEEKLY_COMMENTS, EXPENSE, CODEX_WORKFLOWS, CODEX_GUIDELINES,
    scopeForUser, filterDepartments, filterReports, filterKpis, filterTasks, filterFlags, filterWeekly, filterWorklogs, filterEngram,
    stackForUser, reportersInScope, dailyStatus, consolidateByCategory, worklogsWithin,
    lookup,
  };
})();
