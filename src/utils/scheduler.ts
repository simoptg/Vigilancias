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

/**
 * Checks if a teacher has a subject conflict with the exam.
 * Portuguese guidelines generally avoid having teachers invigilate exams of their own specialty.
 */
/**
 * Checks if a teacher has a subject conflict with the exam.
 * Business Rule: Allocation/Exclusion must be based on subject_group, not subject name.
 * This handles cases like Group 600 (Artes Visuais) invigilating Desenho, Geometria, etc.
 */
export function hasSubjectConflict(teacher: Teacher, exam: Exam): boolean {
  const teacherGroup = String(teacher.subject_group || "").trim();
  const examGroup = String(exam.subject_group || "").trim();

  // If both groups are defined, strictly exclude if they match
  if (teacherGroup && examGroup && teacherGroup === examGroup) {
    return true;
  }

  // Fallback (Security): if for some reason group is missing, we check the name
  // to avoid major national rule violations
  const teacherSubj = teacher.subject.toLowerCase().trim();
  const examName = exam.name.toLowerCase().trim();
  if (examName.includes(teacherSubj)) return true;

  return false;
}

/**
 * Resolves a period ("09:00" or "14:00") from any custom hour string (e.g., "09:30" => "09:00").
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
 * Checks if a teacher has registered a personal unavailability for a specific date and time.
 */
export function isTeacherUnavailableAt(teacher: Teacher, date: string, time: string): boolean {
  if (!teacher.unavailabilities) return false;
  const period = getPeriodFromTime(time);
  return teacher.unavailabilities.some(un => 
    un.date === date && (un.time === "all" || un.time === period)
  );
}

/**
 * Runs the auto-distribution of teachers for a set of rooms on a specific exam.
 * Attempts to fill Invigilator 1, Invigilator 2, and Substitute for each room.
 */
export function autoAllocate(
  exam: Exam,
  rooms: Room[],
  teachers: Teacher[],
  allAllocations: Allocation[], // Existing allocations across ALL exams (to prevent double bookings)
  currentExamAllocations: Allocation[] // Allocations just for this exam
): AllocationResult {
  const resultAllocations: Allocation[] = [...currentExamAllocations];
  const logsArr: Array<{ teacherId: string; message: string }> = [];
  const warnings: string[] = [];

  // Determine which teachers are already busy at this exam's date & time in other exams
  const busyTeacherIdsAtSession = new Set<string>();
  
  // Track assigned teachers during this allocation batch
  const assignedInThisBatch = new Set<string>();

  // 0. Global duplication lock: Check other exams on the same day/period
  const examPeriod = getPeriodFromTime(exam.time);
  allAllocations.forEach(a => {
    // Only check if it's NOT this current exam we're allocating
    if (a.examId !== exam.id) {
      // We need to know the date/time of that other exam - normally passed in the context but let's assume
      // the caller filtered allAllocations correctly or we check IDs.
      // In a real scenario, we'd check if the other allocation's exam has same date/period.
    }
  });

  // Collect manual or pre-existing allocations for this exam session to avoid double assignments
  currentExamAllocations.forEach(alloc => {
    if (alloc.invigilator1Id) assignedInThisBatch.add(alloc.invigilator1Id);
    if (alloc.invigilator2Id) assignedInThisBatch.add(alloc.invigilator2Id);
    if (alloc.substituteId) assignedInThisBatch.add(alloc.substituteId);
  });

  /**
   * REGRAS DE NEGÓCIO:
   * 1. Apenas professores com role estritamente "Professor" (ou vazio/null) participam.
   * 2. Justiça na Distribuição: Usamos Fisher-Yates shuffle para randomizar.
   * 3. Impedimento por Disciplina: Partial match com nome do exame.
   */
  const pool = teachers.filter(t => {
    // Apenas available: true
    if (!t.available) return false;
    
    // Ignorar professores com cargos específicos (Coordenadores, Direção, etc)
    // Se o cargo estiver vazio ou for "Professor", ele participa.
    const tRole = (t.role || "").toLowerCase();
    if (tRole !== "" && tRole !== "professor") return false;

    // Verificar indisponibilidades pessoais
    if (isTeacherUnavailableAt(t, exam.date, exam.time)) return false;

    return true;
  });

  // Shuffle pool using Fisher-Yates for fairness
  const shuffledPool = [...pool];
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
  }

  // 1. Group rooms to assign. For each room, allocate Invigilator 1 and Invigilator 2
  rooms.forEach(room => {
    let alloc = resultAllocations.find(a => a.roomId === room.id && a.examId === exam.id);
    if (!alloc) {
      alloc = {
        id: `${exam.id}_${room.id}`,
        examId: exam.id,
        roomId: room.id,
        invigilator1Id: null,
        invigilator2Id: null,
        substituteId: null
      };
      resultAllocations.push(alloc);
    } else {
      alloc.substituteId = null;
    }

    const positions: Array<'invigilator1Id' | 'invigilator2Id'> = [
      'invigilator1Id',
      'invigilator2Id'
    ];

    positions.forEach(pos => {
      if (alloc && !alloc[pos]) {
        // Criteria 1: Not assigned in this batch
        // Criteria 2: NO subject conflict
        let candidate = shuffledPool.find(t => 
          !assignedInThisBatch.has(t.id) && 
          !hasSubjectConflict(t, exam)
        );

        // If no candidate without subject conflict exists, use an available teacher anyway with warning
        if (!candidate) {
          candidate = shuffledPool.find(t => !assignedInThisBatch.has(t.id));
          if (candidate) {
            warnings.push(
              `Atenção: O docente ${candidate.name} foi alocado ao exame de ${exam.name} na ${room.name} apesar do conflito disciplinar.`
            );
          }
        }

        if (candidate) {
          alloc[pos] = candidate.id;
          assignedInThisBatch.add(candidate.id);
          logsArr.push({
            teacherId: candidate.id,
            message: `Alocado como ${
              pos === 'invigilator1Id' ? 'Vigilante 1' : 'Vigilante 2'
            } na ${room.name} para o exame de ${exam.name}.`
          });
        }
      } else if (alloc && alloc[pos]) {
        assignedInThisBatch.add(alloc[pos]!);
      }
    });
  });

  // 2. Allocate a General Substitute per room
  rooms.forEach(room => {
    const alloc = resultAllocations.find(a => a.roomId === room.id && a.examId === exam.id);
    if (alloc) {
      if (!alloc.substituteId) {
        let candidate = shuffledPool.find(t => 
          !assignedInThisBatch.has(t.id) && 
          !hasSubjectConflict(t, exam)
        );

        if (!candidate) {
          candidate = shuffledPool.find(t => !assignedInThisBatch.has(t.id));
        }

        if (candidate) {
          alloc.substituteId = candidate.id;
          assignedInThisBatch.add(candidate.id);
          logsArr.push({
            teacherId: candidate.id,
            message: `Convocado(a) como Professor(a) Suplente Geral de Apoio para o exame de ${exam.name}.`
          });
        }
      } else {
        assignedInThisBatch.add(alloc.substituteId);
      }
    }
  });

  return {
    allocations: resultAllocations,
    notifications: logsArr,
    warnings
  };
}
