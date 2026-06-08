/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Teacher, Room, Exam, Allocation } from "../types";

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
 * Checks if a teacher has registered a personal unavailability for a specific date and time.
 */
export function isTeacherUnavailableAt(teacher: Teacher, date: string, time: string, exam?: Exam): boolean {
  if (!teacher.unavailabilities) return false;
  const period = getPeriodFromTime(time);
  return teacher.unavailabilities.some(un => {
    if (un.date !== date && un.date !== "all") return false;
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

function hasNoSpecialRole(teacher: Teacher): boolean {
  const role = normalizeText(teacher.role);
  return role === "" || role === "professor" || role === "teacher";
}

function randomPick<T>(list: T[]): T {
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function allocationKey(examId: string, roomId: string): string {
  return `${examId}::${roomId}`;
}

/**
 * Gets all allocation pairs sorted by date/period, with EE exams prioritized.
 */
function getSortedPairs(exams: Exam[], rooms: Room[]): Array<{ exam: Exam; room: Room }> {
  const roomById = new Map(rooms.map(room => [room.id, room]));
  
  const sortedExams = [...exams].sort((a, b) => {
    if (a.EE !== b.EE) return a.EE ? -1 : 1;
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
  teachers: Teacher[]
): AllocationResult {
  const examById = new Map(exams.map(exam => [exam.id, exam]));
  const roomById = new Map(rooms.map(room => [room.id, room]));
  const pairs = getSortedPairs(exams, rooms);
  const targetAllocationByKey = new Map<string, Allocation>();
  const warnings: string[] = [];
  const notifications: Array<{ teacherId: string; message: string }> = [];
  const dayBusy = new Set<string>();
  const assignmentCounts = new Map<string, number>();

  // Initialize base pool
  const basePool = teachers.filter(t => t.available && hasNoSpecialRole(t));
  basePool.forEach(teacher => assignmentCounts.set(teacher.id, 0));

  // Initialize all allocations
  for (const pair of pairs) {
    const key = allocationKey(pair.exam.id, pair.room.id);
    targetAllocationByKey.set(key, {
      id: `${pair.exam.id}_${pair.room.id}`,
      examId: pair.exam.id,
      roomId: pair.room.id,
      invigilator1Id: null,
      invigilator2Id: null,
      substituteId: null
    });
  }

  // Calculate total assignments and max per teacher
  const totalRooms = pairs.length;
  const totalAssignmentsNeeded = totalRooms * 3;
  const availableTeachersCount = basePool.length;
  const maxAssignmentsPerTeacher = Math.ceil(totalAssignmentsNeeded / availableTeachersCount);
  warnings.push(`Máximo de vigilâncias por docente: ${maxAssignmentsPerTeacher} (total de ${totalAssignmentsNeeded} para ${availableTeachersCount} docentes)`);

  // Split teachers into groups
  const eeTeachers = basePool.filter(t => t.EE);
  const nonEeTeachers = basePool.filter(t => !t.EE);
  const pisoZeroTeachers = basePool.filter(t => t.PISO_ZERO);
  const teachersWithUnavailabilities = basePool.filter(t => t.unavailabilities && t.unavailabilities.length > 0);

  // Step 1: Assign at least one EE teacher per EE exam (Vigilante 1 or Suplente)
  const eeExams = pairs.filter(p => p.exam.EE);
  const uniqueEeExams = new Map<string, Exam>();
  eeExams.forEach(p => uniqueEeExams.set(p.exam.id, p.exam));
  
  // Assign Vigilante 1 EE for each EE exam's first room
  for (const [examId, exam] of uniqueEeExams) {
    const firstRoomForExam = pairs.find(p => p.exam.id === examId);
    if (!firstRoomForExam) continue;
    
    const key = allocationKey(examId, firstRoomForExam.room.id);
    const alloc = targetAllocationByKey.get(key);
    if (!alloc || alloc.invigilator1Id) continue;

    const currentPeriod = getPeriodFromTime(exam.time);
    const candidates = pisoZeroTeachers.length > 0 
      ? eeTeachers.filter(t => {
          if (t.PISO_ZERO && firstRoomForExam.room.floor !== "0") return false;
          return true;
        })
      : eeTeachers;
    
    const availableCandidates = candidates.filter(teacher => {
      if (hasSubjectConflict(teacher, exam)) return false;
      if (isTeacherUnavailableAt(teacher, exam.date, exam.time, exam)) return false;
      if (dayBusy.has(`${teacher.id}@@${exam.date}@@${currentPeriod}`)) return false;
      if (assignmentCounts.get(teacher.id)! >= maxAssignmentsPerTeacher) return false;
      return true;
    });

    if (availableCandidates.length === 0) {
      warnings.push(`Sem docente EE disponível para exame ${exam.name} (${exam.date})`);
      continue;
    }

    const selected = randomPick(availableCandidates);
    alloc.invigilator1Id = selected.id;
    dayBusy.add(`${selected.id}@@${exam.date}@@${currentPeriod}`);
    assignmentCounts.set(selected.id, assignmentCounts.get(selected.id)! + 1);
    notifications.push({
      teacherId: selected.id,
      message: `Vigilante 1 (EE) em ${firstRoomForExam.room.name} - ${exam.name} (${exam.date}).`
    });
  }

  // Assign Substitute EE for each EE exam
  for (const [examId, exam] of uniqueEeExams) {
    const firstRoomForExam = pairs.find(p => p.exam.id === examId);
    if (!firstRoomForExam) continue;
    
    const key = allocationKey(examId, firstRoomForExam.room.id);
    const alloc = targetAllocationByKey.get(key);
    if (!alloc || alloc.substituteId) continue;

    const currentPeriod = getPeriodFromTime(exam.time);
    const candidates = pisoZeroTeachers.length > 0 
      ? eeTeachers.filter(t => {
          if (t.PISO_ZERO && firstRoomForExam.room.floor !== "0") return false;
          return true;
        })
      : eeTeachers;
    
    const alreadyAssigned = new Set([alloc.invigilator1Id]);
    const availableCandidates = candidates.filter(teacher => {
      if (alreadyAssigned.has(teacher.id)) return false;
      if (hasSubjectConflict(teacher, exam)) return false;
      if (isTeacherUnavailableAt(teacher, exam.date, exam.time, exam)) return false;
      if (dayBusy.has(`${teacher.id}@@${exam.date}@@${currentPeriod}`)) return false;
      if (assignmentCounts.get(teacher.id)! >= maxAssignmentsPerTeacher) return false;
      return true;
    });

    if (availableCandidates.length === 0) {
      warnings.push(`Sem docente EE disponível para suplente no exame ${exam.name} (${exam.date})`);
      continue;
    }

    const selected = randomPick(availableCandidates);
    alloc.substituteId = selected.id;
    dayBusy.add(`${selected.id}@@${exam.date}@@${currentPeriod}`);
    assignmentCounts.set(selected.id, assignmentCounts.get(selected.id)! + 1);
    notifications.push({
      teacherId: selected.id,
      message: `Suplente (EE) em ${firstRoomForExam.room.name} - ${exam.name} (${exam.date}).`
    });
  }

  // Step 2: Assign teachers with unavailabilities first
  const roles: AllocationRoleKey[] = ["invigilator1Id", "invigilator2Id", "substituteId"];
  for (const teacher of teachersWithUnavailabilities) {
    let currentRoleIndex = 0;
    let assignmentsDone = 0;
    let assignmentsToDo = maxAssignmentsPerTeacher - (assignmentCounts.get(teacher.id) || 0);
    
    if (assignmentsToDo <= 0) continue;

    const shuffledPairs = [...pairs].sort(() => Math.random() - 0.5);
    
    for (const pair of shuffledPairs) {
      if (assignmentsDone >= assignmentsToDo) break;

      const key = allocationKey(pair.exam.id, pair.room.id);
      const alloc = targetAllocationByKey.get(key)!;
      const currentRole = roles[currentRoleIndex % roles.length];
      
      if (alloc[currentRole]) {
        currentRoleIndex++;
        continue;
      }

      const alreadyAssigned = new Set([alloc.invigilator1Id, alloc.invigilator2Id, alloc.substituteId]);
      const currentPeriod = getPeriodFromTime(pair.exam.time);

      if (alreadyAssigned.has(teacher.id)) {
        currentRoleIndex++;
        continue;
      }
      if (hasSubjectConflict(teacher, pair.exam)) {
        currentRoleIndex++;
        continue;
      }
      if (isTeacherUnavailableAt(teacher, pair.exam.date, pair.exam.time, pair.exam)) {
        currentRoleIndex++;
        continue;
      }
      if (dayBusy.has(`${teacher.id}@@${pair.exam.date}@@${currentPeriod}`)) {
        currentRoleIndex++;
        continue;
      }
      if (teacher.PISO_ZERO && pair.room.floor !== "0") {
        currentRoleIndex++;
        continue;
      }
      if (assignmentCounts.get(teacher.id)! >= maxAssignmentsPerTeacher) {
        break;
      }

      // Assign the teacher
      alloc[currentRole] = teacher.id;
      dayBusy.add(`${teacher.id}@@${pair.exam.date}@@${currentPeriod}`);
      assignmentCounts.set(teacher.id, assignmentCounts.get(teacher.id)! + 1);
      assignmentsDone++;
      currentRoleIndex++;
      notifications.push({
        teacherId: teacher.id,
        message: `${ROLE_LABEL_PT[currentRole]} em ${pair.room.name} - ${pair.exam.name} (${pair.exam.date}).`
      });
    }
  }

  // Step 3: Generic assignment for remaining slots
  // First, all Invigilator 1, then all Invigilator 2, then all Substitute
  for (const role of roles) {
    const remainingTeachers = new Set(basePool.map(t => t.id));
    
    // Keep track of used teachers in this round to ensure fair distribution
    let usedInRound = new Set<string>();
    
    for (const pair of pairs) {
      const key = allocationKey(pair.exam.id, pair.room.id);
      const alloc = targetAllocationByKey.get(key)!;
      if (alloc[role]) continue;

      const alreadyAssigned = new Set([alloc.invigilator1Id, alloc.invigilator2Id, alloc.substituteId]);
      const currentPeriod = getPeriodFromTime(pair.exam.time);
      
      let candidates = basePool.filter(teacher => {
        if (alreadyAssigned.has(teacher.id)) return false;
        if (hasSubjectConflict(teacher, pair.exam)) return false;
        if (isTeacherUnavailableAt(teacher, pair.exam.date, pair.exam.time, pair.exam)) return false;
        if (dayBusy.has(`${teacher.id}@@${pair.exam.date}@@${currentPeriod}`)) return false;
        if (teacher.PISO_ZERO && pair.room.floor !== "0") return false;
        if (assignmentCounts.get(teacher.id)! >= maxAssignmentsPerTeacher) return false;
        return true;
      });

      // First prioritize PISO_ZERO teachers if applicable
      if (pair.room.floor === "0" && candidates.some(t => t.PISO_ZERO)) {
        candidates = candidates.filter(t => t.PISO_ZERO);
      }

      // Prioritize teachers not yet used in this round
      let finalCandidates = candidates.filter(t => !usedInRound.has(t.id));
      if (finalCandidates.length === 0) {
        // Reset used teachers if all are used
        usedInRound = new Set<string>();
        finalCandidates = candidates;
      }

      if (finalCandidates.length === 0) {
        warnings.push(`Sem docente elegível para ${ROLE_LABEL_PT[role]} em ${pair.room.name} (${pair.exam.name}, ${pair.exam.date}).`);
        continue;
      }

      // Select teacher with least assignments so far
      finalCandidates.sort((a, b) => {
        const countA = assignmentCounts.get(a.id)!;
        const countB = assignmentCounts.get(b.id)!;
        return countA - countB;
      });

      const selected = finalCandidates[0];
      alloc[role] = selected.id;
      dayBusy.add(`${selected.id}@@${pair.exam.date}@@${currentPeriod}`);
      assignmentCounts.set(selected.id, assignmentCounts.get(selected.id)! + 1);
      usedInRound.add(selected.id);
      notifications.push({
        teacherId: selected.id,
        message: `${ROLE_LABEL_PT[role]} em ${pair.room.name} - ${pair.exam.name} (${pair.exam.date}).`
      });
    }
  }

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
  allExams: Exam[]
): AllocationResult {
  const roomById = new Map(rooms.map(room => [room.id, room]));
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
    if (alloc.invigilator1Id) dayBusy.add(`${alloc.invigilator1Id}@@${ex.date}@@${period}`);
    if (alloc.invigilator2Id) dayBusy.add(`${alloc.invigilator2Id}@@${ex.date}@@${period}`);
    if (alloc.substituteId) dayBusy.add(`${alloc.substituteId}@@${ex.date}@@${period}`);
  });

  const assignmentCounts = new Map<string, number>();
  allAllocations.forEach(alloc => {
    if (alloc.invigilator1Id) {
      assignmentCounts.set(alloc.invigilator1Id, (assignmentCounts.get(alloc.invigilator1Id) || 0) + 1);
    }
    if (alloc.invigilator2Id) {
      assignmentCounts.set(alloc.invigilator2Id, (assignmentCounts.get(alloc.invigilator2Id) || 0) + 1);
    }
    if (alloc.substituteId) {
      assignmentCounts.set(alloc.substituteId, (assignmentCounts.get(alloc.substituteId) || 0) + 1);
    }
  });

  const basePool = teachers.filter(t => t.available && hasNoSpecialRole(t));
  basePool.forEach(teacher => {
    if (!assignmentCounts.has(teacher.id)) {
      assignmentCounts.set(teacher.id, 0);
    }
  });

  for (const pair of pairs) {
    const key = allocationKey(pair.exam.id, pair.room.id);
    const existingAlloc = currentExamAllocations.find(a => a.roomId === pair.room.id);
    targetAllocationByKey.set(key, {
      id: `${pair.exam.id}_${pair.room.id}`,
      examId: pair.exam.id,
      roomId: pair.room.id,
      invigilator1Id: existingAlloc?.invigilator1Id || null,
      invigilator2Id: existingAlloc?.invigilator2Id || null,
      substituteId: existingAlloc?.substituteId || null
    });
  }

  for (const pair of pairs) {
    const key = allocationKey(pair.exam.id, pair.room.id);
    const alloc = targetAllocationByKey.get(key)!;
    const currentPeriod = getPeriodFromTime(pair.exam.time);
    const alreadyAssigned = new Set([alloc.invigilator1Id, alloc.invigilator2Id, alloc.substituteId]);
    alreadyAssigned.forEach(id => {
      if (id) dayBusy.add(`${id}@@${pair.exam.date}@@${currentPeriod}`);
    });
  }

  // Calculate max assignments (rough estimation for single exam)
  let totalRooms = pairs.length;
  let assignedCount = 0;
  for (const pair of pairs) {
    const key = allocationKey(pair.exam.id, pair.room.id);
    const alloc = targetAllocationByKey.get(key)!;
    if (alloc.invigilator1Id) assignedCount++;
    if (alloc.invigilator2Id) assignedCount++;
    if (alloc.substituteId) assignedCount++;
  }
  const remainingSlots = (totalRooms * 3) - assignedCount;
  const availableTeachersCount = basePool.length;
  const maxAssignmentsPerTeacher = Math.ceil(remainingSlots / availableTeachersCount) + (Math.max(...Array.from(assignmentCounts.values())) || 0);

  // Now fill remaining roles for this exam
  const roles: AllocationRoleKey[] = ["invigilator1Id", "invigilator2Id", "substituteId"];
  for (const role of roles) {
    for (const pair of pairs) {
      const key = allocationKey(pair.exam.id, pair.room.id);
      const alloc = targetAllocationByKey.get(key)!;
      if (alloc[role]) continue;

      const alreadyAssigned = new Set([alloc.invigilator1Id, alloc.invigilator2Id, alloc.substituteId]);
      const currentPeriod = getPeriodFromTime(pair.exam.time);

      let candidates = basePool.filter(teacher => {
        if (alreadyAssigned.has(teacher.id)) return false;
        if (hasSubjectConflict(teacher, pair.exam)) return false;
        if (isTeacherUnavailableAt(teacher, pair.exam.date, pair.exam.time, pair.exam)) return false;
        if (dayBusy.has(`${teacher.id}@@${pair.exam.date}@@${currentPeriod}`)) return false;
        if (teacher.PISO_ZERO && pair.room.floor !== "0") return false;
        if (assignmentCounts.get(teacher.id)! >= maxAssignmentsPerTeacher) return false;
        return true;
      });

      // If exam needs EE and we're on Vigilante 1 and not yet filled, prioritize EE teachers
      if (pair.exam.EE && role === "invigilator1Id") {
        const eeCandidates = candidates.filter(t => t.EE);
        if (eeCandidates.length > 0) {
          candidates = eeCandidates;
        }
      }

      if (candidates.length === 0) {
        warnings.push(`Sem docente elegível para ${ROLE_LABEL_PT[role]} em ${pair.room.name} (${pair.exam.name}, ${pair.exam.date}).`);
        continue;
      }

      candidates.sort((a, b) => {
        const countA = assignmentCounts.get(a.id)!;
        const countB = assignmentCounts.get(b.id)!;
        return countA - countB;
      });

      const selected = candidates[0];
      alloc[role] = selected.id;
      dayBusy.add(`${selected.id}@@${pair.exam.date}@@${currentPeriod}`);
      assignmentCounts.set(selected.id, assignmentCounts.get(selected.id)! + 1);
      notifications.push({
        teacherId: selected.id,
        message: `${ROLE_LABEL_PT[role]} em ${pair.room.name} - ${pair.exam.name} (${pair.exam.date}).`
      });
    }
  }

  return {
    allocations: pairs
      .map(pair => targetAllocationByKey.get(allocationKey(pair.exam.id, pair.room.id)))
      .filter((alloc): alloc is Allocation => Boolean(alloc)),
    notifications,
    warnings
  };
}
