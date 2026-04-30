// English locale — the source of truth.
//
// Every other locale file (es.ts, vi.ts, zh.ts, ...) must satisfy
// `Record<keyof typeof en, string>` so missing keys produce a TypeScript
// error at compile time. New strings ship as English-only and get
// translated in follow-up commits without breaking the build.
//
// Conventions:
//   - Keys use camelCase ("clockIn", "loadingProject").
//   - Group related keys with a comment header so the file stays scannable.
//   - Interpolation: write {placeholder} and pass `vars` to t().
//     e.g. greeting: 'Hello {name}'  →  t('greeting', { name: 'Vuong' })
//   - Avoid HTML / Markdown — these strings render through <Text>.

const en = {
  // ── Languages ──────────────────────────────────────────────────────────
  language: 'Language',
  english: 'English',
  spanish: 'Spanish',

  // ── Generic UI ────────────────────────────────────────────────────────
  loading: 'Loading...',
  loadingProject: 'Loading project...',
  loadingPdf: 'Loading PDF...',
  error: 'Error',
  success: 'Success',
  retry: 'Retry',
  close: 'Close',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving...',
  add: 'Add',
  edit: 'Edit',
  update: 'Update',
  delete: 'Delete',
  view: 'View',
  upload: 'Upload',
  create: 'Create',
  back: 'Back',
  next: 'Next',
  previous: 'Previous',
  confirm: 'Confirm',
  unknown: 'Unknown',

  // ── Auth / sign-in ────────────────────────────────────────────────────
  welcomeLoginUser: 'User ID',
  password: 'Password',
  rememberMe: 'Remember me',
  forgotPassword: 'Forgot password?',
  login: 'Log In',
  signingIn: 'Signing In...',
  missingInformation: 'Missing Information',
  enterCredentials: 'Please enter your user id and password.',
  loginError: 'Login Error',
  logout: 'Log Out',
  logoutError: 'Logout Error',
  logoutConfirm: 'Are you sure you want to log out?',
  logoutClockedIn: 'You are currently clocked in. Logging out will also clock you out. Do you want to continue?',

  // ── Roles ─────────────────────────────────────────────────────────────
  worker: 'Worker',
  manager: 'Manager',

  // ── Tabs / navigation ─────────────────────────────────────────────────
  home: 'Home',
  projects: 'Projects',
  project: 'Project',
  plans: 'Plans',
  photos: 'Photos',
  documents: 'Documents',
  expenses: 'Expenses',
  myExpenses: 'My Expenses',
  finance: 'Finance',
  tasks: 'Tasks',
  openTasks: 'Open Tasks',
  dailyReport: 'Daily Report',
  dailyReports: 'Daily Reports',
  safety: 'Safety',
  settings: 'Settings',

  // ── Project detail / files ────────────────────────────────────────────
  noPlans: 'There are no plans to view yet.',
  noPhotos: 'There are no photos to view yet.',
  noReports: 'There are no reports to view yet.',
  noDocuments: 'There are no documents to view yet.',
  noAddress: 'No address',
  noStatus: 'No status',
  noDescription: 'No description',
  address: 'Address',
  status: 'Status',
  preparedBy: 'Prepared By',
  uploadPlan: 'Upload Plan',
  uploadDocument: 'Upload Document',
  uploadPhoto: 'Upload Photo',
  takePhoto: 'Take Photo',
  viewPlans: 'View Plans',
  viewPhoto: 'View Photo',
  viewDocuments: 'View Documents',
  createReport: 'Create Report',
  viewReports: 'View Reports',
  planUploaded: 'Plan uploaded',
  photoUploaded: 'Photo uploaded',
  uploadError: 'Upload error',
  missingFile: 'Missing File',
  missingFileMessage: 'This file record exists, but the actual file was not found in storage.',
  openInBrowser: 'Open in Browser',
  planViewer: 'Plan Viewer',
  viewPlansTitle: 'View Plans',
  viewReportsTitle: 'View Reports',
  documentTypePrompt: 'What kind of document is this?',
  documentType: 'Document Type',
  workingEllipsis: 'Working...',

  // ── Photos ────────────────────────────────────────────────────────────
  addPhotoNote: 'Tap to add a note',
  noPhotoNote: 'No note',
  deletePhoto: 'Delete Photo',
  deletePhotoConfirm: 'Delete this photo? This cannot be undone.',

  // ── Expenses (worker form) ────────────────────────────────────────────
  newExpense: 'New Expense',
  editExpense: 'Edit Expense',
  type: 'Type',
  amount: 'Amount ($)',
  date: 'Date',
  vendor: 'Vendor',
  notes: 'Notes',
  receiptPhoto: 'Receipt Photo',
  receiptCamera: 'Camera',
  receiptLibrary: 'Library',
  receiptNew: 'New receipt — will upload on Save',
  pickVendor: 'Pick Vendor',
  pickVendorAction: 'Pick',
  noExpensesYet: 'No expenses yet. Tap Add to log a field expense.',
  allExpenses: 'All expenses',
  myExpensesTotal: 'My expenses',
  expenseEntry: 'entry',
  expenseEntries: 'entries',
  amountPositive: 'Amount must be a positive number.',
  invalidDate: 'Invalid date',
  invalidDateFormat: 'Use YYYY-MM-DD format.',
  saveFailed: 'Save failed',
  deleteFailed: 'Delete failed',
  deleteExpense: 'Delete Expense',

  // ── Permissions ───────────────────────────────────────────────────────
  permissionNeeded: 'Permission needed',
  allowPhotos: 'Please allow access to your photos.',
  allowCamera: 'Please allow camera access.',
  allowLocation: 'Please allow location access.',

  // ── Time clock ────────────────────────────────────────────────────────
  clockIn: 'Clock In',
  clockOut: 'Clock Out',
  clockInClockOut: 'Clock In / Clock Out',
  selectProject: 'Select Project',
  selectAProject: 'Please choose a project first.',
  selected: 'Selected',
  alreadyClockedIn: 'You are already clocked in.',
  clockedInSuccessfully: 'Clocked in successfully',
  clockedOutSuccessfully: 'Clocked out successfully',
  notClockedIn: 'Not Clocked In',
  clockedIn: 'Clocked In',
  clockedOut: 'Clocked Out',
  todayClockIn: 'Today Clock In',
  todayClockOut: 'Today Clock Out',
  workWeek: 'Work Week',
  activeProject: 'Active Project',

  // ── Finance summary ───────────────────────────────────────────────────
  contract: 'Contract',
  changeOrders: 'Change Orders',
  totalContract: 'Total Contract',
  net: 'Net',
  accountsReceivable: 'A/R (Outstanding)',
  accountsPayable: 'A/P (Unpaid Bills)',
  payAppsBilled: 'Pay Apps ({count}) — Billed to Date',
  financeNote: 'Edit contract, change orders, expenses, and pay apps on the web portal.',
} as const

export default en
export type TranslationKey = keyof typeof en
