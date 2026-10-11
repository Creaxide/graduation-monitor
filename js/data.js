import { DataError } from "./errors.js";
import { USE_MOCK } from "./config.js";

export { DataError };
export const isMock = USE_MOCK;

let implPromise = null;

function impl() {
  if (!implPromise) {
    implPromise = USE_MOCK
      ? import("./mock-data.js")
      : import("./supabase-data.js");
  }
  return implPromise;
}

// In mock mode the active module is known synchronously, which lets pages show
// demo controls before any data call resolves. In Supabase mode pages wait for
// the first async call, at which point the client has loaded.
let active = null;
if (USE_MOCK) {
  import("./mock-data.js").then((m) => { active = m; });
}

function required(name) {
  return async (...args) => (await impl())[name](...args);
}

export const getSession = required("getSession");
export const getCurrentUser = required("getCurrentUser");
export const signIn = required("signIn");
export const signOut = required("signOut");
export const requireAuth = required("requireAuth");
export const getProfile = required("getProfile");
export const listStudents = required("listStudents");
export const listRequirements = required("listRequirements");
export const listPrograms = required("listPrograms");
export const listAdvisors = required("listAdvisors");
export const getStudent = required("getStudent");
export const listFailedCourses = required("listFailedCourses");
export const listCertifications = required("listCertifications");
export const loadDashboard = required("loadDashboard");
export const loadStudentBundle = required("loadStudentBundle");
export const updateStudent = required("updateStudent");
export const insertStudent = required("insertStudent");
export const upsertFailedCourse = required("upsertFailedCourse");
export const deleteFailedCourse = required("deleteFailedCourse");
export const insertFailedCourses = required("insertFailedCourses");
export const upsertCertification = required("upsertCertification");
export const insertCertifications = required("insertCertifications");
export const updateRequirements = required("updateRequirements");
export const logAudit = required("logAudit");
export const studentIdsByNim = required("studentIdsByNim");

// ---------------------------------------------------- dummy-data controls --

function notAvailable() {
  throw new DataError(
    "Dummy data tools require demo mode. Set USE_MOCK = true in js/config.js."
  );
}

export function mockHasData() {
  return USE_MOCK ? !!active?.mockHasData?.() : false;
}

export function mockGenerate(opts) {
  return USE_MOCK ? active.mockGenerate(opts) : notAvailable();
}

export function mockAddStudent(overrides) {
  return USE_MOCK ? active.mockAddStudent(overrides) : notAvailable();
}

export function mockClear() {
  if (USE_MOCK) active.mockClear();
}

