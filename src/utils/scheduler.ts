/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Teacher, Room, Exam, Allocation, TeacherRole } from "../types";

export interface AllocationResult {
  allocations: Allocation[];
  notifications: Array<{
    teacherId: string;
    message: string;
  }>;
  warnings: string[];
}

type AllocationRoleKey = "invigilator1Id" | "invigilator2Id" | "substituteId";

const ROLE_LABEL_PT: Record<AllocationRoleKey, string> = {
  invigilator1Id: "Vigilante 1",
  invigilator2Id: "Vigilante 2",
  substituteId: "Suplente"
};

const ALLOCATION_ROLES: AllocationRoleKey[] = ["invigilator1Id", "invigilator2Id", "substituteId"];

/**
 * Gets the period for room assignment (morning or afternoon).
 */
export function getPeriodFromTime(time: string): "09:00" | "14:00" {
  if (!time) return "09:00";
  if (time === "09:00" || time === "14:00") return time;

  const parts = time.split(':');
  if (parts.length > 0) {
    const hour = parseInt(parts[0], 10);
    if (!isNaN(hour)) {
      return hour < 12 ? "09:00" : "14:00";
    }
  }

  const lower = time.toLowerCase();
  if (lower.includes('tarde') || lower.includes('afternoon') || lower.includes('pm')) {
    return "14:00";
  }
  return "09:00";
}

/**
 * Checks if a teacher has a subject conflict with the exam.
 */
export function hasSubjectConflict(teacher: Teacher, exam: Exam): boolean {
  const teacherGroup = String(teacher.subject_group || "").trim();
  const examGroup = String(exam.subject_group || "").trim();
  if (teacherGroup && examGroup && teacherGroup === examGroup) {
    return true;
  }

  const teacherSubj = String(teacher.subject || "").toLowerCase().trim();
  const examName = String(exam.name || "").toLowerCase().trim();
  if (teacherSubj && examName.includes(teacherSubj)) return true;

  return false;
}

/**
 * Checks if a teacher has registered restrictions for a specific exam slot.
 */
export function isTeacherUnavailableAt(teacher: Teacher, date: string, time: string, exam?: Exam): boolean {
  if (!teacher.unavailabilities || teacher.unavailabilities.length === 0) return false;
  const period = getPeriodFromTime(time);

  return teacher.unavailabilities.some(un => {
    if (un.date !== "all" && un.date !== date) return false;
    if (un.time !== "all" && un.time !== period) return false;
    if (un.year && exam && un.year !== exam.year) return false;
    if (un.subject_group && exam && un.subject_group !== exam.subject_group) return false;
    return true;
  });
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function hasNoSpecialRole(teacher: Teacher): boolean {
  return normalizeText(teacher.role) === "";
}

export function hasSpecialRole(teacher: Teacher): boolean {
  return !hasNoSpecialRole(teacher);
}

function buildRolePriorityMap(roles: TeacherRole[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const role of roles) {
    const priority = role.priority ?? 0;
    map.set(String(role.id || "").trim(), priority);
    map.set(normalizeText(role.id), priority);
    const nameExact = String(role.name || "").trim();
    if (nameExact) map.set(nameExact, priority);
    const nameNorm = normalizeText(role.name);
    if (nameNorm) map.set(nameNorm, priority);
  }
  return map;
}

function getTeacherRolePriority(teacher: Teacher, rolePriorityById: Map<string, number>): number {
  const raw = String(teacher.role || "").trim();
  if (!raw) return -1;
  if (rolePriorityById.has(raw)) return rolePriorityById.get(raw)!;
  const norm = normalizeText(raw);
  if (norm && rolePriorityById.has(norm)) return rolePriorityById.get(norm)!;
  return 0;
}

function pickCargoTeacher(
  candidates: Teacher[],
  rolePriorityById: Map<string, number>,
  balance: BalanceTracker,
  date: string
): Teacher | null {
  if (candidates.length === 0) return null;

  const priorities = [...new Set(candidates.map(t => getTeacherRolePriority(t, rolePriorityById)))].sort(
    (a, b) => b - a
  );

  for (const priority of priorities) {
    const tier = candidates.filter(t => getTeacherRolePriority(t, rolePriorityById) === priority);
    const selected = pickLeastUsedRandom(tier, balance, date);
    if (selected) return selected;
  }

  return null;
}

export function isFloorZero(room: Room): boolean {
  const floor = normalizeText(room.floor);
  return floor === "0" || floor === "piso 0" || floor === "rés-do-chão" || floor === "res-do-chao";
}

function randomPick<T>(list: T[]): T {
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function allocationKey(examId: string, roomId: string): string {
  return `${examId}::${roomId}`;
}

function normalizeAssignedTeacherId(teacherId: string | null | undefined): string | null {
  const normalized = String(teacherId ?? "").trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;
  return normalized;
}

/** Chave de contagem diária de vigilâncias: docente + data. */
function dayCountKey(teacherId: string, date: string): string {
  return `${teacherId}@@${date}`;
}

/**
 * Estado de equilíbrio da distribuição de vigilâncias.
 * - `totalCounts`: total de vigilâncias por docente (histórico + atribuídas nesta execução)
 * - `dayCounts`: vigilâncias por docente e por dia
 * - `scopeCounts`: vigilâncias já atribuídas dentro do scope da execução
 * - `maxTotal`: limite de equilíbrio global por docente
 * - `maxPerDayByDate`: limite de equilíbrio diário por docente
 * - `eligibleCount`: nº de docentes elegíveis usado como base do equilíbrio
 */
interface BalanceTracker {
  totalCounts: Map<string, number>;
  dayCounts: Map<string, number>;
  scopeCounts: Map<string, number>;
  maxTotal: number;
  maxPerDayByDate: Map<string, number>;
  eligibleCount: number;
}

/** Total de vigilâncias já atribuídas ao docente (histórico + execução atual). */
function getTotalCount(tracker: BalanceTracker, teacherId: string): number {
  return tracker.totalCounts.get(teacherId) || 0;
}

/** Nº de vigilâncias já atribuídas ao docente numa determinada data. */
function getDayCount(tracker: BalanceTracker, teacherId: string, date: string): number {
  return tracker.dayCounts.get(dayCountKey(teacherId, date)) || 0;
}

/**
 * Verifica se o docente já esgotou o limite de equilíbrio,
 * considerando o total acumulado (histórico) e as vigilâncias do próprio dia.
 */
function isOverBalanceLimit(tracker: BalanceTracker, teacherId: string, date: string): boolean {
  if (getTotalCount(tracker, teacherId) >= tracker.maxTotal) return true;
  const dayMax = tracker.maxPerDayByDate.get(date);
  if (dayMax !== undefined && getDayCount(tracker, teacherId, date) >= dayMax) return true;
  return false;
}

/** Regista uma vigilância nas contagens de equilíbrio (total e diária). */
function registerAssignmentCount(tracker: BalanceTracker, teacherId: string, date: string): void {
  tracker.totalCounts.set(teacherId, getTotalCount(tracker, teacherId) + 1);
  const key = dayCountKey(teacherId, date);
  tracker.dayCounts.set(key, (tracker.dayCounts.get(key) || 0) + 1);
  tracker.scopeCounts.set(teacherId, (tracker.scopeCounts.get(teacherId) || 0) + 1);
}

/**
 * Constrói o estado de equilíbrio a partir do histórico de atribuições e do scope.
 * - Limite global: `ceil((histórico elegível + vagas por preencher) / docentes elegíveis)`
 * - Limite diário: `ceil(vagas do dia / docentes elegíveis)`
 */
function buildBalanceTracker(
  teachers: Teacher[],
  pairs: Array<{ exam: Exam; room: Room }>,
  historicalAllocations: Allocation[],
  examById: Map<string, Exam>,
  scopeExamIds: Set<string>,
  eligibleTeachers: Teacher[]
): BalanceTracker {
  const safeEligibleCount = Math.max(eligibleTeachers.length, 1);
  const availableTeachers = teachers.filter(teacher => teacher.available);
  const totalCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  const scopeCounts = new Map<string, number>();

  const register = (teacherId: string | null, date: string, inScope: boolean) => {
    if (!teacherId) return;
    totalCounts.set(teacherId, (totalCounts.get(teacherId) || 0) + 1);
    const key = dayCountKey(teacherId, date);
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    if (inScope) {
      scopeCounts.set(teacherId, (scopeCounts.get(teacherId) || 0) + 1);
    }
  };

  historicalAllocations.forEach(alloc => {
    const exam = examById.get(alloc.examId);
    if (!exam) return;
    const inScope = scopeExamIds.has(exam.id);
    register(normalizeAssignedTeacherId(alloc.invigilator1Id), exam.date, inScope);
    register(normalizeAssignedTeacherId(alloc.invigilator2Id), exam.date, inScope);
    register(normalizeAssignedTeacherId(alloc.substituteId), exam.date, inScope);
  });

  availableTeachers.forEach(teacher => {
    if (!totalCounts.has(teacher.id)) totalCounts.set(teacher.id, 0);
    if (!scopeCounts.has(teacher.id)) scopeCounts.set(teacher.id, 0);
  });

  let scopeSlots = 0;
  const slotsPerDate = new Map<string, number>();
  for (const pair of pairs) {
    scopeSlots += ALLOCATION_ROLES.length;
    slotsPerDate.set(
      pair.exam.date,
      (slotsPerDate.get(pair.exam.date) || 0) + ALLOCATION_ROLES.length
    );
  }

  const historicalTotal = eligibleTeachers.reduce(
    (sum, teacher) => sum + (totalCounts.get(teacher.id) || 0),
    0
  );
  const scopeAssigned = [...scopeCounts.values()].reduce((sum, count) => sum + count, 0);
  const remainingSlots = Math.max(scopeSlots - scopeAssigned, 0);
  const maxTotal = Math.max(
    1,
    Math.ceil((historicalTotal + remainingSlots) / safeEligibleCount)
  );

  const maxPerDayByDate = new Map<string, number>();
  slotsPerDate.forEach((slots, date) => {
    maxPerDayByDate.set(date, Math.max(1, Math.ceil(slots / safeEligibleCount)));
  });

  return {
    totalCounts,
    dayCounts,
    scopeCounts,
    maxTotal,
    maxPerDayByDate,
    eligibleCount: safeEligibleCount
  };
}

function getSortedPairs(exams: Exam[], rooms: Room[]): Array<{ exam: Exam; room: Room }> {
  const roomById = new Map(rooms.map(room => [room.id, room]));

  const sortedExams = [...exams].sort((a, b) => {
    if (isEeExam(a) !== isEeExam(b)) return isEeExam(a) ? -1 : 1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.time !== b.time) return a.time.localeCompare(b.time);
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.id.localeCompare(b.id);
  });

  const pairs: Array<{ exam: Exam; room: Room }> = [];
  for (const exam of sortedExams) {
    if (!Array.isArray(exam.roomIds) || exam.roomIds.length === 0) continue;
    const examRooms = exam.roomIds
      .map(roomId => roomById.get(roomId))
      .filter((room): room is Room => Boolean(room))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      });

    for (const room of examRooms) {
      pairs.push({ exam, room });
    }
  }

  return pairs;
}

function getOtherPeriod(period: "09:00" | "14:00"): "09:00" | "14:00" {
  return period === "09:00" ? "14:00" : "09:00";
}

/** Exame que requer vigilante EE (campo EE ou modalidade EE). */
export function isEeExam(exam: Exam): boolean {
  return exam.EE === true || normalizeText(exam.modality) === "ee";
}

function buildTeacherById(teachers: Teacher[]): Map<string, Teacher> {
  return new Map(teachers.map(teacher => [teacher.id, teacher]));
}

function getEeTeacherPool(teachers: Teacher[], includeCargo: boolean): Teacher[] {
  return teachers.filter(
    teacher => teacher.available && teacher.EE && (includeCargo || hasNoSpecialRole(teacher))
  );
}

function needsEeVigilante1(
  alloc: Allocation,
  exam: Exam
): boolean {
  return isEeExam(exam) && !alloc.invigilator1Id;
}

function filterTeachersForExamSlot(
  candidates: Teacher[],
  exam: Exam,
  restrictEeToNonEeExams: boolean
): Teacher[] {
  if (!restrictEeToNonEeExams || isEeExam(exam)) return candidates;
  return candidates.filter(teacher => !teacher.EE);
}

/** Em exames EE, define em que papéis um docente EE pode ser colocado. */
function canAssignEeTeacherToEeExamSlot(
  exam: Exam,
  role: AllocationRoleKey,
  onlyDate: boolean
): boolean {
  if (!isEeExam(exam)) return true;
  // In EE exams, never allow EE as Vigilante 2
  if (role === "invigilator2Id") return false;
  if (onlyDate) return role === "invigilator1Id";
  // In global mode, only allow Vigilante 1 or Substitute
  return role === "invigilator1Id" || role === "substituteId";
}

function canAssignTeacherToSlot(
  teacher: Teacher,
  exam: Exam,
  room: Room,
  alloc: Allocation,
  dayBusy: Set<string>,
  balance: BalanceTracker,
  options?: { ignoreMax?: boolean }
): boolean {
  const period = getPeriodFromTime(exam.time);
  const alreadyInRoom = new Set([alloc.invigilator1Id, alloc.invigilator2Id, alloc.substituteId]);

  if (alreadyInRoom.has(teacher.id)) {
    console.log(`    [canAssign] ${teacher.name}: Já está na sala`);
    return false;
  }
  if (hasSubjectConflict(teacher, exam)) {
    console.log(`    [canAssign] ${teacher.name}: Conflito de disciplina`);
    return false;
  }
  if (isTeacherUnavailableAt(teacher, exam.date, exam.time, exam)) {
    console.log(`    [canAssign] ${teacher.name}: Não está disponível`);
    return false;
  }
  if (dayBusy.has(`${teacher.id}@@${exam.date}@@${period}`)) {
    console.log(`    [canAssign] ${teacher.name}: Já tem atribuição no período ${period}`);
    return false;
  }
  if (dayBusy.has(`${teacher.id}@@${exam.date}@@${getOtherPeriod(period)}`)) {
    console.log(`    [canAssign] ${teacher.name}: Já tem atribuição no período oposto`);
    return false;
  }
  if (teacher.PISO_ZERO && !isFloorZero(room)) {
    console.log(`    [canAssign] ${teacher.name}: É piso zero e a sala não é de piso zero`);
    return false;
  }
  if (!options?.ignoreMax && isOverBalanceLimit(balance, teacher.id, exam.date)) {
    console.log(
      `    [canAssign] ${teacher.name}: Limite de equilíbrio atingido (total ${getTotalCount(balance, teacher.id)}/${balance.maxTotal}; dia ${exam.date} ${getDayCount(balance, teacher.id, exam.date)}/${balance.maxPerDayByDate.get(exam.date) ?? "-"})`
    );
    return false;
  }
  console.log(`    [canAssign] ${teacher.name}: OK!`);
  return true;
}

function emitUnfilledSlotWarnings(
  pairs: Array<{ exam: Exam; room: Room }>,
  targetAllocationByKey: Map<string, Allocation>,
  warnings: string[],
  suffix: string
): void {
  for (const pair of pairs) {
    const alloc = targetAllocationByKey.get(allocationKey(pair.exam.id, pair.room.id));
    if (!alloc) continue;
    for (const role of ALLOCATION_ROLES) {
      if (!alloc[role]) {
        warnings.push(
          `Sem docente elegível para ${ROLE_LABEL_PT[role]} em ${pair.room.name} (${pair.exam.name}, ${pair.exam.date})${suffix}.`
        );
      }
    }
  }
}

function prioritizePisoZero(candidates: Teacher[], room: Room): Teacher[] {
  console.log(`  [prioritizePisoZero] Sala: ${room.name}, isFloorZero: ${isFloorZero(room)}, Candidatos originais: ${candidates.map(t => t.name)}`);
  if (!isFloorZero(room)) {
    const filtered = candidates.filter(teacher => !teacher.PISO_ZERO);
    console.log(`  → Filtrados (não piso zero): ${filtered.map(t => t.name)}`);
    return filtered;
  }
  // Em salas de piso 0, dar prioridade a docentes com PISO_ZERO=true.
  const pisoZeroCandidates = candidates.filter(teacher => teacher.PISO_ZERO);
  const result = pisoZeroCandidates.length > 0 ? pisoZeroCandidates : candidates;
  console.log(`  → Resultado (piso zero): ${result.map(t => t.name)}`);
  return result;
}

/**
 * Seleciona o docente com menor carga total (equilíbrio), desempatando pelo
 * menor nº de vigilâncias já atribuídas no próprio dia.
 */
function pickLeastUsedRandom(candidates: Teacher[], balance: BalanceTracker, date: string): Teacher | null {
  if (candidates.length === 0) return null;
  const minTotal = Math.min(...candidates.map(teacher => getTotalCount(balance, teacher.id)));
  const leastUsed = candidates.filter(teacher => getTotalCount(balance, teacher.id) === minTotal);
  const minDay = Math.min(...leastUsed.map(teacher => getDayCount(balance, teacher.id, date)));
  const leastUsedToday = leastUsed.filter(teacher => getDayCount(balance, teacher.id, date) === minDay);
  return randomPick(leastUsedToday);
}

function assignTeacherToSlot(
  teacher: Teacher,
  alloc: Allocation,
  role: AllocationRoleKey,
  exam: Exam,
  room: Room,
  dayBusy: Set<string>,
  balance: BalanceTracker,
  notifications: Array<{ teacherId: string; message: string }>,
  labelSuffix = ""
): void {
  console.log(`[ATTRIBUIÇÃO] ${teacher.name} (${teacher.EE ? "EE" : "não EE"}) → ${ROLE_LABEL_PT[role]} em exame ${exam.name} (sala ${room.name}, EE=${exam.EE})`);
  alloc[role] = teacher.id;
  const period = getPeriodFromTime(exam.time);
  dayBusy.add(`${teacher.id}@@${exam.date}@@${period}`);
  registerAssignmentCount(balance, teacher.id, exam.date);
  notifications.push({
    teacherId: teacher.id,
    message: `${ROLE_LABEL_PT[role]}${labelSuffix} em ${room.name} - ${exam.name} (${exam.date}).`
  });
}

function pickEeTeacher(
  eeTeachersRegular: Teacher[],
  eeTeachersWithCargo: Teacher[],
  exam: Exam,
  room: Room,
  alloc: Allocation,
  dayBusy: Set<string>,
  balance: BalanceTracker,
  excludeIds: Set<string | null>,
  options?: { mandatoryV1?: boolean }
): Teacher | null {
  console.log(`[pickEeTeacher] Sala: ${room.name}, Exame: ${exam.name}`);
  const slotOptions = options?.mandatoryV1 ? { ignoreMax: true } : undefined;

  const tryPool = (pool: Teacher[], poolName: string): Teacher | null => {
    console.log(`[pickEeTeacher] Pool ${poolName} (${pool.length} docentes)`);
    let candidates = pool.filter(teacher => {
      if (excludeIds.has(teacher.id)) {
        console.log(`  → ${teacher.name}: Excluído (excludeIds)`);
        return false;
      }
      const can = canAssignTeacherToSlot(
        teacher,
        exam,
        room,
        alloc,
        dayBusy,
        balance,
        slotOptions
      );
      if (!can) {
        console.log(`  → ${teacher.name}: Não pode ser atribuído`);
      }
      return can;
    });
    candidates = prioritizePisoZero(candidates, room);
    console.log(`  → Candidatos válidos: ${candidates.map(t => t.name)}`);
    return pickLeastUsedRandom(candidates, balance, exam.date);
  };

  const reg = tryPool(eeTeachersRegular, "Regular");
  if (reg) return reg;
  return tryPool(eeTeachersWithCargo, "Cargo");
}

function assignEeTeachersToExams(
  pairs: Array<{ exam: Exam; room: Room }>,
  teachers: Teacher[],
  targetAllocationByKey: Map<string, Allocation>,
  dayBusy: Set<string>,
  balance: BalanceTracker,
  warnings: string[],
  notifications: Array<{ teacherId: string; message: string }>,
  onlyDate: boolean
): void {
  console.log("=== [FASE 1] Atribuir docentes EE a exames EE ===");
  const eePairs = pairs.filter(pair => isEeExam(pair.exam));
  console.log("Exames EE para processar:", eePairs.length, eePairs.map(p => ({ exame: p.exam.name, sala: p.room.name, EE: p.exam.EE })));
  
  const eeTeachersRegular = getEeTeacherPool(teachers, false);
  const eeTeachersWithCargo = getEeTeacherPool(teachers, true).filter(
    teacher => !eeTeachersRegular.some(t => t.id === teacher.id)
  );

  if (eePairs.length === 0) return;
  if (eeTeachersRegular.length === 0 && eeTeachersWithCargo.length === 0) {
    warnings.push("Não existem docentes EE disponíveis para atribuir aos exames EE.");
    return;
  }

  const teacherById = buildTeacherById(teachers);

  // Fase 1a: Vigilante 1 EE obrigatório em todas as salas de cada exame EE
  for (const pair of eePairs) {
    const key = allocationKey(pair.exam.id, pair.room.id);
    const alloc = targetAllocationByKey.get(key);
    if (!alloc) continue;

    if (alloc.invigilator1Id) {
      const existing = teacherById.get(alloc.invigilator1Id);
      if (!existing || !existing.EE) {
        warnings.push(
          `Exame EE ${pair.exam.name} (${pair.exam.date}): Vigilante 1 na ${pair.room.name} já está atribuído a não EE; alocação existente mantida.`
        );
      }
      if (onlyDate) {
        for (const role of ["invigilator2Id", "substituteId"] as const) {
          const roleTeacherId = alloc[role];
          if (!roleTeacherId) continue;
          const roleTeacher = teacherById.get(roleTeacherId);
          if (roleTeacher?.EE) {
            warnings.push(
              `Modo dia específico (${pair.exam.date}): ${ROLE_LABEL_PT[role]} na ${pair.room.name} (${pair.exam.name}) está atribuído a docente EE; alocação existente mantida.`
            );
          }
        }
      }
      continue;
    }

    if (!needsEeVigilante1(alloc, pair.exam)) continue;

    let selected = pickEeTeacher(
      eeTeachersRegular,
      eeTeachersWithCargo,
      pair.exam,
      pair.room,
      alloc,
      dayBusy,
      balance,
      new Set(),
      { mandatoryV1: true }
    );

    if (!selected) {
      warnings.push(
        `Sem docente EE disponível para Vigilante 1 na ${pair.room.name} (${pair.exam.name}, ${pair.exam.date}).`
      );
    } else {
      assignTeacherToSlot(
        selected,
        alloc,
        "invigilator1Id",
        pair.exam,
        pair.room,
        dayBusy,
        balance,
        notifications,
        hasNoSpecialRole(selected) ? " (EE)" : " (EE/cargo)"
      );
    }
  }

  // Fase 1b (modo global): suplente EE opcional em todas as salas de exames EE
  if (!onlyDate) {
    for (const pair of eePairs) {
      const key = allocationKey(pair.exam.id, pair.room.id);
      const alloc = targetAllocationByKey.get(key);
      if (!alloc || alloc.substituteId) continue;

      const excludeIds = new Set([alloc.invigilator1Id, alloc.invigilator2Id, alloc.substituteId]);
      const selected = pickEeTeacher(
        eeTeachersRegular,
        eeTeachersWithCargo,
        pair.exam,
        pair.room,
        alloc,
        dayBusy,
        balance,
        excludeIds
      );
      if (selected) {
        assignTeacherToSlot(
          selected,
          alloc,
          "substituteId",
          pair.exam,
          pair.room,
          dayBusy,
          balance,
          notifications,
          hasNoSpecialRole(selected) ? " (EE)" : " (EE/cargo)"
        );
      }
    }
  }
}

function assignRemainingEeTeachers(
  pairs: Array<{ exam: Exam; room: Room }>,
  teachers: Teacher[],
  targetAllocationByKey: Map<string, Allocation>,
  dayBusy: Set<string>,
  balance: BalanceTracker,
  notifications: Array<{ teacherId: string; message: string }>,
  warnings: string[]
): void {
  console.log("=== [FASE 4] Atribuir docentes EE restantes ===");
  const eeTeachersRegular = getEeTeacherPool(teachers, false);
  const eeTeachersWithCargo = getEeTeacherPool(teachers, true).filter(
    teacher => !eeTeachersRegular.some(t => t.id === teacher.id)
  );
  if (eeTeachersRegular.length === 0 && eeTeachersWithCargo.length === 0) return;

  // Reforço: Vigilante 1 EE em exames EE que ainda não tenham docente EE
  for (const pair of pairs.filter(p => isEeExam(p.exam))) {
    const alloc = targetAllocationByKey.get(allocationKey(pair.exam.id, pair.room.id));
    if (!alloc) continue;

    if (alloc.invigilator1Id) {
      continue;
    }

    if (!needsEeVigilante1(alloc, pair.exam)) continue;

    const selected = pickEeTeacher(
      eeTeachersRegular,
      eeTeachersWithCargo,
      pair.exam,
      pair.room,
      alloc,
      dayBusy,
      balance,
      new Set(),
      { mandatoryV1: true }
    );

    if (!selected) {
      warnings.push(
        `Sem docente EE disponível para Vigilante 1 na ${pair.room.name} (${pair.exam.name}, ${pair.exam.date}) após fase EE restante.`
      );
      continue;
    }

    assignTeacherToSlot(
      selected,
      alloc,
      "invigilator1Id",
      pair.exam,
      pair.room,
      dayBusy,
      balance,
      notifications,
      hasNoSpecialRole(selected) ? " (EE)" : " (EE/cargo)"
    );
  }

  for (const role of ALLOCATION_ROLES) {
    for (const pair of pairs) {
      const key = allocationKey(pair.exam.id, pair.room.id);
      const alloc = targetAllocationByKey.get(key);
      if (!alloc || alloc[role]) continue;

      const excludeIds = new Set([alloc.invigilator1Id, alloc.invigilator2Id, alloc.substituteId]);
      const selected = pickEeTeacher(
        eeTeachersRegular,
        eeTeachersWithCargo,
        pair.exam,
        pair.room,
        alloc,
        dayBusy,
        balance,
        excludeIds
      );
      if (!selected) continue;

      assignTeacherToSlot(
        selected,
        alloc,
        role,
        pair.exam,
        pair.room,
        dayBusy,
        balance,
        notifications,
        hasNoSpecialRole(selected) ? " (EE)" : " (EE/cargo)"
      );
    }
  }
}

function assignRestrictedTeachers(
  pairs: Array<{ exam: Exam; room: Room }>,
  restrictedTeachers: Teacher[],
  targetAllocationByKey: Map<string, Allocation>,
  dayBusy: Set<string>,
  balance: BalanceTracker,
  notifications: Array<{ teacherId: string; message: string }>,
  restrictEeToNonEeExams: boolean,
  onlyDate: boolean
): void {
  for (const teacher of restrictedTeachers) {
    const remainingSlots = balance.maxTotal - getTotalCount(balance, teacher.id);
    if (remainingSlots <= 0) continue;

    let assignmentsDone = 0;
    let roleIndex = 0;
    let safetyCounter = 0;
    const maxSafety = pairs.length * ALLOCATION_ROLES.length * 4;

    while (assignmentsDone < remainingSlots && safetyCounter < maxSafety) {
      safetyCounter++;
      const currentRole = ALLOCATION_ROLES[roleIndex % ALLOCATION_ROLES.length];
      const candidatePairs = shuffle(pairs).filter(pair => {
        const alloc = targetAllocationByKey.get(allocationKey(pair.exam.id, pair.room.id));
        if (!alloc || alloc[currentRole]) return false;
        if (isEeExam(pair.exam) && currentRole === "invigilator1Id" && !teacher.EE) return false;
        if (teacher.EE && !canAssignEeTeacherToEeExamSlot(pair.exam, currentRole, onlyDate)) return false;
        if (restrictEeToNonEeExams && !isEeExam(pair.exam) && teacher.EE) return false;
        return canAssignTeacherToSlot(
          teacher,
          pair.exam,
          pair.room,
          alloc,
          dayBusy,
          balance
        );
      });

      if (candidatePairs.length === 0) {
        roleIndex++;
        continue;
      }

      const pair = randomPick(candidatePairs);
      const alloc = targetAllocationByKey.get(allocationKey(pair.exam.id, pair.room.id))!;
      assignTeacherToSlot(
        teacher,
        alloc,
        currentRole,
        pair.exam,
        pair.room,
        dayBusy,
        balance,
        notifications
      );
      assignmentsDone++;
      roleIndex++;
    }
  }
}

function assignCargoTeachers(
  pairs: Array<{ exam: Exam; room: Room }>,
  cargoPool: Teacher[],
  rolePriorityById: Map<string, number>,
  targetAllocationByKey: Map<string, Allocation>,
  dayBusy: Set<string>,
  balance: BalanceTracker,
  notifications: Array<{ teacherId: string; message: string }>,
  restrictEeToNonEeExams: boolean,
  onlyDate: boolean
): void {
  for (const role of ALLOCATION_ROLES) {
    let usedInRound = new Set<string>();

    for (const pair of pairs) {
      const key = allocationKey(pair.exam.id, pair.room.id);
      const alloc = targetAllocationByKey.get(key);
      if (!alloc || alloc[role]) continue;
      if (isEeExam(pair.exam) && role === "invigilator1Id") continue;

      let candidates = cargoPool.filter(teacher =>
        canAssignTeacherToSlot(
          teacher,
          pair.exam,
          pair.room,
          alloc,
          dayBusy,
          balance
        )
      );

      candidates = filterTeachersForExamSlot(candidates, pair.exam, restrictEeToNonEeExams);
      // For cargo teachers, don't allow EE teachers unless it's an EE exam (and appropriate role)
      candidates = candidates.filter(
        teacher => !teacher.EE || (isEeExam(pair.exam) && canAssignEeTeacherToEeExamSlot(pair.exam, role, onlyDate))
      );
      candidates = prioritizePisoZero(candidates, pair.room);

      let pool = candidates.filter(teacher => !usedInRound.has(teacher.id));
      if (pool.length === 0) {
        usedInRound = new Set<string>();
        pool = candidates;
      }

      const selected = pickCargoTeacher(pool, rolePriorityById, balance, pair.exam.date);
      if (!selected) continue;

      assignTeacherToSlot(
        selected,
        alloc,
        role,
        pair.exam,
        pair.room,
        dayBusy,
        balance,
        notifications,
        " (cargo)"
      );
      usedInRound.add(selected.id);
    }
  }
}

function assignGenericTeachers(
  pairs: Array<{ exam: Exam; room: Room }>,
  genericPool: Teacher[],
  targetAllocationByKey: Map<string, Allocation>,
  dayBusy: Set<string>,
  balance: BalanceTracker,
  notifications: Array<{ teacherId: string; message: string }>
): void {
  for (const role of ALLOCATION_ROLES) {
    let usedInRound = new Set<string>();

    for (const pair of pairs) {
      const key = allocationKey(pair.exam.id, pair.room.id);
      const alloc = targetAllocationByKey.get(key);
      if (!alloc || alloc[role]) continue;
      if (isEeExam(pair.exam) && role === "invigilator1Id") continue;

      let candidates = genericPool.filter(teacher =>
        canAssignTeacherToSlot(
          teacher,
          pair.exam,
          pair.room,
          alloc,
          dayBusy,
          balance
        )
      );

      candidates = prioritizePisoZero(candidates, pair.room);

      let pool = candidates.filter(teacher => !usedInRound.has(teacher.id));
      if (pool.length === 0) {
        usedInRound = new Set<string>();
        pool = candidates;
      }

      const selected = pickLeastUsedRandom(pool, balance, pair.exam.date);
      if (!selected) continue;

      assignTeacherToSlot(
        selected,
        alloc,
        role,
        pair.exam,
        pair.room,
        dayBusy,
        balance,
        notifications
      );
      usedInRound.add(selected.id);
    }
  }
}

/**
 * Runs the auto-distribution of rooms for all exams.
 */
export function autoAllocateRooms(
  exams: Exam[],
  rooms: Room[]
): Exam[] {
  const sortedRooms = [...rooms].sort((a, b) => a.priority - b.priority);

  const sortedExams = [...exams].sort((a, b) => {
    const isSpecialA = (a.variant || "").includes("LNM") || (a.modality && a.modality !== "");
    const isSpecialB = (b.variant || "").includes("LNM") || (b.modality && b.modality !== "");

    if (isSpecialA !== isSpecialB) return isSpecialA ? 1 : -1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });

  const updatedExams = [...exams];

  sortedExams.forEach(exam => {
    const registrationsNeeded = exam.registrationsCount || 0;
    const currentRooms = exam.roomIds || [];

    const roomById = new Map(rooms.map(room => [room.id, room]));
    let currentCapacity = currentRooms.reduce((sum, roomId) => sum + (roomById.get(roomId)?.capacity || 0), 0);

    if (currentCapacity >= registrationsNeeded) return;

    const roomsToAssign: string[] = [...currentRooms];
    const currentPeriod = getPeriodFromTime(exam.time);

    for (const room of sortedRooms) {
      if (currentCapacity >= registrationsNeeded) break;
      if (roomsToAssign.includes(room.id)) continue;

      const isAvailable = updatedExams.every(otherEx => {
        if (!otherEx.roomIds?.includes(room.id) || otherEx.date !== exam.date || otherEx.id === exam.id) return true;
        const otherPeriod = getPeriodFromTime(otherEx.time);
        return otherPeriod !== currentPeriod;
      });

      if (isAvailable) {
        roomsToAssign.push(room.id);
        currentCapacity += room.capacity;
      }
    }

    const idx = updatedExams.findIndex(e => e.id === exam.id);
    if (idx !== -1) {
      updatedExams[idx] = { ...updatedExams[idx], roomIds: roomsToAssign };
    }
  });

  return updatedExams;
}

/**
 * Main auto-allocation function implementing all detailed rules.
 */
export function autoAllocateAll(
  exams: Exam[],
  rooms: Room[],
  teachers: Teacher[],
  roles: TeacherRole[] = [],
  existingAllocations: Allocation[] = [],
  onlyDate?: string
): AllocationResult {
  console.log("=== [AUTO ALLOCATE ALL] INÍCIO ===");
  console.log("Data selecionada:", onlyDate);
  
  const allPairs = getSortedPairs(exams, rooms);
  const pairs = onlyDate ? allPairs.filter(p => p.exam.date === onlyDate) : allPairs;
  
  const eeExamsInScope = pairs.filter(p => isEeExam(p.exam));
  console.log("=== Exames no scope:", pairs.length, "Exames EE no scope:", eeExamsInScope.length);
  
  const eeTeachers = teachers.filter(t => t.available && t.EE);
  console.log("=== Docentes EE disponíveis:", eeTeachers.length, eeTeachers.map(t => ({ id: t.id, name: t.name })));
  
  const targetAllocationByKey = new Map<string, Allocation>();
  const warnings: string[] = [];
  const notifications: Array<{ teacherId: string; message: string }> = [];
  const examById = new Map(exams.map(e => [e.id, e]));
  const scopeExamIds = new Set(pairs.map(pair => pair.exam.id));
  const dayBusy = new Set<string>();

  // dayBusy considera toda a grelha já atribuída (evitar dupla no mesmo dia/período)
  existingAllocations.forEach(alloc => {
    const ex = examById.get(alloc.examId);
    if (!ex) return;
    const period = getPeriodFromTime(ex.time);
    const invigilator1Id = normalizeAssignedTeacherId(alloc.invigilator1Id);
    const invigilator2Id = normalizeAssignedTeacherId(alloc.invigilator2Id);
    const substituteId = normalizeAssignedTeacherId(alloc.substituteId);
    if (invigilator1Id) dayBusy.add(`${invigilator1Id}@@${ex.date}@@${period}`);
    if (invigilator2Id) dayBusy.add(`${invigilator2Id}@@${ex.date}@@${period}`);
    if (substituteId) dayBusy.add(`${substituteId}@@${ex.date}@@${period}`);
  });

  const rolePriorityById = buildRolePriorityMap(roles);
  const basePool = teachers.filter(teacher => teacher.available && hasNoSpecialRole(teacher));
  const cargoPool = teachers.filter(teacher => teacher.available && hasSpecialRole(teacher));

  for (const pair of allPairs) {
    const key = allocationKey(pair.exam.id, pair.room.id);
    const existingAlloc = existingAllocations.find(a => a.examId === pair.exam.id && a.roomId === pair.room.id);
    targetAllocationByKey.set(key, {
      id: `${pair.exam.id}_${pair.room.id}`,
      examId: pair.exam.id,
      roomId: pair.room.id,
      invigilator1Id: normalizeAssignedTeacherId(existingAlloc?.invigilator1Id),
      invigilator2Id: normalizeAssignedTeacherId(existingAlloc?.invigilator2Id),
      substituteId: normalizeAssignedTeacherId(existingAlloc?.substituteId)
    });
  }

  // Estado de equilíbrio: o limite global considera o histórico de cada docente
  // e o limite diário considera as vagas de cada dia do scope.
  const balance = buildBalanceTracker(
    teachers,
    pairs,
    existingAllocations,
    examById,
    scopeExamIds,
    basePool
  );
  const scopeSlots = pairs.length * ALLOCATION_ROLES.length;
  const scopeAssignedCount = [...balance.scopeCounts.values()].reduce((sum, count) => sum + count, 0);
  const remainingSlots = scopeSlots - scopeAssignedCount;
  warnings.push(
    `Equilíbrio de vigilâncias: máximo total ${balance.maxTotal} por docente (${scopeSlots} vagas no scope; ${scopeAssignedCount} já atribuídas; ${remainingSlots} por preencher; ${balance.eligibleCount} docentes elegíveis; histórico já contabilizado). Limites diários: ${[...balance.maxPerDayByDate.entries()].map(([date, max]) => `${date}=${max}`).join(", ")}.`
  );

  const restrictedTeacherIds = new Set(
    basePool
      .filter(teacher => !teacher.EE && teacher.unavailabilities && teacher.unavailabilities.length > 0)
      .map(teacher => teacher.id)
  );
  const restrictedTeachers = basePool.filter(teacher => !teacher.EE && restrictedTeacherIds.has(teacher.id));
  const genericPool = basePool.filter(
    teacher => !restrictedTeacherIds.has(teacher.id) && !teacher.EE
  );

  const isOnlyDateMode = Boolean(onlyDate);
  const restrictEeToNonEeExams = true;

  // Fase 1: EE em exames EE (V1 em todas as salas; suplente EE opcional só em modo global)
  assignEeTeachersToExams(
    pairs,
    teachers,
    targetAllocationByKey,
    dayBusy,
    balance,
    warnings,
    notifications,
    isOnlyDateMode
  );

  // Fase 2: docentes com indisponibilidades
  assignRestrictedTeachers(
    pairs,
    restrictedTeachers,
    targetAllocationByKey,
    dayBusy,
    balance,
    notifications,
    restrictEeToNonEeExams,
    isOnlyDateMode
  );

  // Fase 3: docentes regulares (sem indisponibilidades, sem cargo, não EE)
  assignGenericTeachers(
    pairs,
    genericPool,
    targetAllocationByKey,
    dayBusy,
    balance,
    notifications
  );

  // Fase 4: docentes EE para vagas restantes (com reforço de V1 EE em exames EE)
  assignRemainingEeTeachers(
    pairs,
    teachers,
    targetAllocationByKey,
    dayBusy,
    balance,
    notifications,
    warnings
  );

  // Fase 5: docentes com cargo, por ordem de prioridade (maior primeiro)
  if (cargoPool.length > 0) {
    assignCargoTeachers(
      pairs,
      cargoPool,
      rolePriorityById,
      targetAllocationByKey,
      dayBusy,
      balance,
      notifications,
      restrictEeToNonEeExams,
      isOnlyDateMode
    );
  }

  emitUnfilledSlotWarnings(
    pairs,
    targetAllocationByKey,
    warnings,
    cargoPool.length > 0
      ? ", mesmo após recurso a docentes EE e com cargo"
      : ", mesmo após recurso a docentes EE"
  );

  return {
    allocations: pairs
      .map(pair => targetAllocationByKey.get(allocationKey(pair.exam.id, pair.room.id)))
      .filter((alloc): alloc is Allocation => Boolean(alloc)),
    notifications,
    warnings
  };
}

/**
 * Runs the auto-distribution for a single exam.
 */
export function autoAllocate(
  exam: Exam,
  rooms: Room[],
  teachers: Teacher[],
  allAllocations: Allocation[],
  currentExamAllocations: Allocation[],
  allExams: Exam[],
  roles: TeacherRole[] = []
): AllocationResult {
  console.log("=== [AUTO ALLOCATE (SINGLE EXAM)] INÍCIO ===");
  console.log("Exame alvo:", exam.name, "EE=", exam.EE);
  
  const pairs = getSortedPairs([exam], rooms);
  const targetAllocationByKey = new Map<string, Allocation>();
  const warnings: string[] = [];
  const notifications: Array<{ teacherId: string; message: string }> = [];
  const examById = new Map(allExams.map(e => [e.id, e]));

  const dayBusy = new Set<string>();
  allAllocations.forEach(alloc => {
    const ex = examById.get(alloc.examId);
    if (!ex) return;
    const period = getPeriodFromTime(ex.time);
    const invigilator1Id = normalizeAssignedTeacherId(alloc.invigilator1Id);
    const invigilator2Id = normalizeAssignedTeacherId(alloc.invigilator2Id);
    const substituteId = normalizeAssignedTeacherId(alloc.substituteId);
    if (invigilator1Id) dayBusy.add(`${invigilator1Id}@@${ex.date}@@${period}`);
    if (invigilator2Id) dayBusy.add(`${invigilator2Id}@@${ex.date}@@${period}`);
    if (substituteId) dayBusy.add(`${substituteId}@@${ex.date}@@${period}`);
  });

  const rolePriorityById = buildRolePriorityMap(roles);
  const basePool = teachers.filter(teacher => teacher.available && hasNoSpecialRole(teacher));
  const cargoPool = teachers.filter(teacher => teacher.available && hasSpecialRole(teacher));

  let assignedCount = 0;
  for (const pair of pairs) {
    const existingAlloc = currentExamAllocations.find(a => a.roomId === pair.room.id);
    const key = allocationKey(pair.exam.id, pair.room.id);
    targetAllocationByKey.set(key, {
      id: `${pair.exam.id}_${pair.room.id}`,
      examId: pair.exam.id,
      roomId: pair.room.id,
      invigilator1Id: normalizeAssignedTeacherId(existingAlloc?.invigilator1Id),
      invigilator2Id: normalizeAssignedTeacherId(existingAlloc?.invigilator2Id),
      substituteId: normalizeAssignedTeacherId(existingAlloc?.substituteId)
    });
    const alloc = targetAllocationByKey.get(key)!;
    if (alloc.invigilator1Id) assignedCount++;
    if (alloc.invigilator2Id) assignedCount++;
    if (alloc.substituteId) assignedCount++;
  }

  // Estado de equilíbrio: o limite global considera o histórico de cada docente
  // e o limite diário considera as vagas do dia do exame.
  const balance = buildBalanceTracker(
    teachers,
    pairs,
    allAllocations,
    examById,
    new Set([exam.id]),
    basePool
  );
  const scopeSlots = pairs.length * ALLOCATION_ROLES.length;
  const scopeAssignedCount = [...balance.scopeCounts.values()].reduce((sum, count) => sum + count, 0);
  warnings.push(
    `Equilíbrio de vigilâncias: máximo total ${balance.maxTotal} por docente (${scopeSlots} vagas no exame; ${scopeAssignedCount} já atribuídas; ${scopeSlots - scopeAssignedCount} por preencher; ${balance.eligibleCount} docentes elegíveis; histórico já contabilizado).`
  );

  const restrictedTeachers = basePool.filter(teacher => !teacher.EE && teacher.unavailabilities && teacher.unavailabilities.length > 0);
  const genericPool = basePool.filter(
    teacher => !restrictedTeachers.some(t => t.id === teacher.id) && !teacher.EE
  );

  const isOnlyDateMode = false;
  const restrictEeToNonEeExams = true;

  assignEeTeachersToExams(
    pairs,
    teachers,
    targetAllocationByKey,
    dayBusy,
    balance,
    warnings,
    notifications,
    isOnlyDateMode
  );

  assignRestrictedTeachers(
    pairs,
    restrictedTeachers,
    targetAllocationByKey,
    dayBusy,
    balance,
    notifications,
    restrictEeToNonEeExams,
    isOnlyDateMode
  );

  assignGenericTeachers(
    pairs,
    genericPool,
    targetAllocationByKey,
    dayBusy,
    balance,
    notifications
  );

  assignRemainingEeTeachers(
    pairs,
    teachers,
    targetAllocationByKey,
    dayBusy,
    balance,
    notifications,
    warnings
  );

  if (cargoPool.length > 0) {
    assignCargoTeachers(
      pairs,
      cargoPool,
      rolePriorityById,
      targetAllocationByKey,
      dayBusy,
      balance,
      notifications,
      restrictEeToNonEeExams,
      isOnlyDateMode
    );
  }

  emitUnfilledSlotWarnings(
    pairs,
    targetAllocationByKey,
    warnings,
    cargoPool.length > 0
      ? ", mesmo após recurso a docentes EE e com cargo"
      : ", mesmo após recurso a docentes EE"
  );

  return {
    allocations: pairs
      .map(pair => targetAllocationByKey.get(allocationKey(pair.exam.id, pair.room.id)))
      .filter((alloc): alloc is Allocation => Boolean(alloc)),
    notifications,
    warnings
  };
}
