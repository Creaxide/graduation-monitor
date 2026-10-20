import { DataError } from "./errors.js";

export { DataError };

let implPromise = null;

function impl() {
  if (!implPromise) implPromise = import("./supabase-data.js");
  return implPromise;
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
