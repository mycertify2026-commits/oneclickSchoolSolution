// Single source of truth for the 4 real login routes, reused by the navbar
// login-selector modal, the Roles section cards, and the footer's Access
// column. Routes match the exact paths already defined in App.js — do not
// change these without checking App.js's route table first.
const ROLES = [
  {
    key: 'superAdmin',
    label: 'Super Admin',
    path: '/login/super-admin',
    icon: 'fa-solid fa-shield-halved',
    short: 'Manage the entire platform',
    desc: 'Control the complete ecosystem',
    features: [
      'Platform & user management',
      'Distributor management',
      'Commission configuration',
      'Certificate pricing',
      'Reports & earnings',
    ],
  },
  {
    key: 'schoolAdmin',
    label: 'School Admin',
    path: '/login/school',
    icon: 'fa-solid fa-school',
    short: 'Manage school, students and certificates',
    desc: 'Everything your school needs',
    features: [
      'Student management',
      'Certificate generation',
      'Certificate templates',
      'ID card settings',
      'OTP verification & receipts',
    ],
  },
  {
    key: 'superDistributor',
    label: 'Super Distributor',
    path: '/login/super-distributor',
    icon: 'fa-solid fa-diagram-project',
    short: 'Manage distributors and school network',
    desc: 'Grow and manage your network',
    features: [
      'Distributor management',
      'School network oversight',
      'Certificate activity',
      'Earnings & reports',
    ],
  },
  {
    key: 'distributor',
    label: 'Distributor',
    path: '/login/distributor',
    icon: 'fa-solid fa-people-group',
    short: 'Manage assigned schools and certificate operations',
    desc: 'Manage your assigned schools',
    features: [
      'School management',
      'Certificate operations',
      'Transaction tracking',
      'Earnings & reports',
    ],
  },
];

export default ROLES;
